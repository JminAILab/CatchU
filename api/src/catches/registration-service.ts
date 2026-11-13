import { randomUUID } from 'node:crypto';
import { EntityManager } from 'typeorm';
import { CatchAssetEntity } from './entities/catch-asset.entity';
import { CatchEvidenceEntity } from './entities/catch-evidence.entity';
import { CandidateRegistrationEntity } from './entities/candidate-registration.entity';
import { CommitAssignmentEntity } from './entities/commit-assignment.entity';
import { SourceMode } from './new-catch-content';
import { RegistrationCandidate, prepareRegistrationBatch } from './registration-batch';

export interface CatchRegistrationInput {
  applicationRecordId: string;
  requestId: string;
  attemptId: string;
  resultId: string;
  ownerId: string;
  sourceMode: SourceMode;
  candidates: readonly RegistrationCandidate[];
}

export interface CatchRegistrationResult {
  candidateId: string;
  catchId: string;
  disposition: 'CREATED' | 'EXISTING';
  ownerViewReady: boolean;
}

type ContextReason = 'TRANSACTION_REQUIRED' | 'INVALID_CONTEXT' | 'CONTEXT_MISMATCH'
  | 'REGISTRATION_MISMATCH' | 'CATCH_NOT_READY';

/** 내부 정본 연결 거부. 입력 원문이나 DB 예외 메시지를 포함하지 않는다. */
export class CatchRegistrationContextError extends Error {
  constructor(readonly reason: ContextReason) {
    super('Catch 등록 맥락을 확인할 수 없습니다.');
    this.name = 'CatchRegistrationContextError';
  }
}

interface ReceiptContext {
  request_id: string;
  attempt_id: string;
  result_id: string;
  member_id: string;
  repository_id: string;
  current_attempt_id: string;
  attempt_request_id: string;
  source_mode: SourceMode;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateContext(input: CatchRegistrationInput): void {
  if (!input || ![input.applicationRecordId, input.requestId, input.attemptId, input.ownerId]
    .every((id) => typeof id === 'string' && uuid.test(id))
    || typeof input.resultId !== 'string' || input.resultId.length === 0) {
    throw new CatchRegistrationContextError('INVALID_CONTEXT');
  }
}

async function assertReady(
  manager: EntityManager, asset: CatchAssetEntity, context: ReceiptContext,
): Promise<void> {
  // workIdentity는 해석하지 않는다. 같은 값이라도 저장소/방식이 다르면 참조를 거부한다.
  const originalRequests: { repository_id: string }[] = await manager.query(`
    SELECT repository_id FROM analysis_request WHERE request_id = $1
  `, [asset.sourceRequestId]);
  if (originalRequests.length !== 1) throw new CatchRegistrationContextError('CATCH_NOT_READY');
  if (originalRequests[0].repository_id !== context.repository_id || asset.sourceMode !== context.source_mode) {
    throw new CatchRegistrationContextError('CONTEXT_MISMATCH');
  }
  // 기존 Catch를 참조해도 새 요청이 아닌 원 요청 저장소의 보호 판단을 확인한다.
  // 본인 열람은 NONE/SOURCE_PRIVATE 모두 허용하며 판단 부재를 NONE으로 채우지 않는다.
  const readiness: {
    member_id: string; applied_restriction: string;
    confirmed_source_state: unknown; observation_provenance: unknown; observed_at: Date | null;
  }[] = await manager.query(`
    SELECT request.member_id, protection.applied_restriction,
           protection.confirmed_source_state, protection.observation_provenance, protection.observed_at
      FROM analysis_request request
      JOIN repository_protection protection
        ON protection.owner_id = request.member_id AND protection.repository_id = request.repository_id
     WHERE request.request_id = $1
       FOR SHARE OF protection
  `, [asset.sourceRequestId]);
  if (readiness.length !== 1 || readiness[0].member_id !== asset.ownerId
    || !['NONE', 'SOURCE_PRIVATE'].includes(readiness[0].applied_restriction)
    // JSON null도 누락이다. 최근 조회 실패만으로 이전의 유효한 관측을 무효화하지 않는다.
    || [readiness[0].confirmed_source_state, readiness[0].observation_provenance, readiness[0].observed_at]
      .some((value) => value === null || value === undefined)) {
    throw new CatchRegistrationContextError('CATCH_NOT_READY');
  }
  const evidenceCount = await manager.getRepository(CatchEvidenceEntity).countBy({ catchId: asset.catchId });
  if (evidenceCount === 0) throw new CatchRegistrationContextError('CATCH_NOT_READY');
}

// 한 묶음 = 쿼리 하나. 값 5개×1,000행 = 매개변수 5,000개로 PostgreSQL 한도(65,535) 안이다(CR2 NFR4.4).
const ASSIGNMENT_BATCH_ROWS = 1000;

/**
 * 그 Catch의 소속 기록을 쓴다(CR2 BR3.2·BR3.3·BR3.6). 이미 있는 (회원, 저장소, SHA)는 같은 Catch든 다른 Catch든
 * 충돌 무시로 건너뛰고 저장된 소속을 바꾸지 않는다. 회원은 등록 입력의 주인이고, Catch 주인과 다르면 DB 외래 키가
 * 거부한다. DB 오류는 바꾸지 않고 올려 결과 반영 전체가 롤백되게 한다. 로그는 남기지 않는다(SHA를 싣지 않음).
 */
async function writeAssignments(
  manager: EntityManager, assignment: { memberId: string; githubRepositoryId: string; catchId: string },
  commitShas: readonly string[],
): Promise<void> {
  for (let start = 0; start < commitShas.length; start += ASSIGNMENT_BATCH_ROWS) {
    const rows = commitShas.slice(start, start + ASSIGNMENT_BATCH_ROWS)
      .map((commitSha) => ({ ...assignment, commitSha }));
    await manager.createQueryBuilder().insert().into(CommitAssignmentEntity).values(rows).orIgnore().execute();
  }
}

/**
 * E가 연 트랜잭션의 manager만 사용한다. 반환값은 커밋 전 내부 결과다.
 * E는 후보 원문 fingerprint·동의·범위를 먼저 검증하고, 이 함수 뒤 완료 상태까지
 * 같은 트랜잭션에 저장한다. 이 함수가 던진 오류를 삼킨 채 커밋하면 안 된다.
 * DB의 QueryFailedError는 변형하지 않는다. E가 롤백 밖에서 실패를 기록한다.
 */
export async function registerCandidates(
  manager: EntityManager,
  input: CatchRegistrationInput,
): Promise<CatchRegistrationResult[]> {
  if (!manager.queryRunner?.isTransactionActive) {
    throw new CatchRegistrationContextError('TRANSACTION_REQUIRED');
  }
  validateContext(input);
  input = { ...input, applicationRecordId: input.applicationRecordId.toLowerCase(),
    requestId: input.requestId.toLowerCase(), attemptId: input.attemptId.toLowerCase(), ownerId: input.ownerId.toLowerCase() };
  const groups = prepareRegistrationBatch(input.candidates, input.sourceMode);

  // 같은 수신 기록의 재호출을 직렬화한다. 다른 owner/request로 바꿔 호출해도 거부한다.
  const contexts: ReceiptContext[] = await manager.query(`
    SELECT receipt.request_id, receipt.attempt_id, receipt.result_id,
           request.member_id, request.repository_id, request.current_attempt_id,
           attempt.request_id AS attempt_request_id, attempt.source_mode
      FROM result_application_record receipt
      JOIN analysis_request request ON request.request_id = receipt.request_id
      JOIN analysis_attempt attempt ON attempt.attempt_id = receipt.attempt_id
     WHERE receipt.application_record_id = $1
       FOR UPDATE OF receipt
  `, [input.applicationRecordId]);
  const context = contexts[0];
  if (!context || context.request_id !== input.requestId || context.attempt_id !== input.attemptId
    || context.result_id !== input.resultId || context.member_id !== input.ownerId
    || context.current_attempt_id !== input.attemptId || context.attempt_request_id !== input.requestId
    || context.source_mode !== input.sourceMode) {
    throw new CatchRegistrationContextError('CONTEXT_MISMATCH');
  }

  const assets = manager.getRepository(CatchAssetEntity);
  const evidence = manager.getRepository(CatchEvidenceEntity);
  const registrations = manager.getRepository(CandidateRegistrationEntity);
  const saved = await registrations.findBy({ applicationRecordId: input.applicationRecordId });
  if (saved.length > 0) {
    // 원자적으로 저장된 기존 묶음만 재응답한다. 다른/일부 후보로 덮어쓰지 않는다.
    // 소속은 처음 등록한 트랜잭션에서 이미 써졌으므로 다시 쓰지 않는다(CR2 BR3.5).
    const candidates = new Map(input.candidates.map((candidate) => [candidate.candidateId, candidate]));
    if (saved.length !== candidates.size) throw new CatchRegistrationContextError('REGISTRATION_MISMATCH');
    const results: CatchRegistrationResult[] = [];
    for (const registration of saved) {
      const candidate = candidates.get(registration.candidateId);
      const asset = await assets.findOneBy({ catchId: registration.catchId, ownerId: input.ownerId });
      if (!candidate || !asset || candidate.workIdentity !== asset.workIdentity || !registration.ownerViewReady) {
        throw new CatchRegistrationContextError('REGISTRATION_MISMATCH');
      }
      await assertReady(manager, asset, context);
      results.push({ candidateId: registration.candidateId, catchId: registration.catchId,
        disposition: registration.disposition, ownerViewReady: registration.ownerViewReady });
    }
    return results;
  }

  const results: CatchRegistrationResult[] = [];
  // 여러 요청이 A/B 작업을 반대 순서로 가져와도 잠금 순서가 일정하다.
  for (const group of groups.sort((a, b) => a.workIdentity < b.workIdentity ? -1 : a.workIdentity > b.workIdentity ? 1 : 0)) {
    await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [JSON.stringify([input.ownerId, group.workIdentity])]);
    let asset = await assets.findOneBy({ ownerId: input.ownerId, workIdentity: group.workIdentity });
    let createdCandidateId: string | null = null;
    if (!asset) {
      // 전달 순서의 첫 적합 후보를 저장하고 이후 같은 작업은 참조한다. 내용을 합치지 않는다.
      // 다시 볼 곳 사실과 첫·마지막 작업 시각(content.asset의 revisitFacts·firstWorkAt·lastWorkAt)도 이 INSERT에서
      // 한 번만 쓴다. 기존 Catch에는 쓰지 않는다(NC3 BR6.1, 아래 소속만 더하는 갈래).
      const first = group.candidates[0];
      const catchId = randomUUID();
      const insertion = await assets.createQueryBuilder().insert().values({
        catchId, ownerId: input.ownerId, sourceRequestId: input.requestId,
        sourceResultId: input.resultId, sourceCandidateId: first.candidateId,
        ...first.content.asset,
        registrationAssessment: {
          workFactsVerified: true, contributionVerified: true, independentOfFailures: true,
          groupingBasis: first.groupingBasis, groupingLimitations: first.groupingLimitations,
        },
      }).orIgnore().returning(['catchId']).execute();
      // ON CONFLICT는 PostgreSQL 트랜잭션을 오류 상태로 만들지 않는다.
      if (insertion.raw.length > 0) {
        await evidence.insert(first.content.evidence.map((item, index) => ({
          catchEvidenceId: randomUUID(), catchId, ...item, position: index + 1,
        })));
        createdCandidateId = first.candidateId;
      }
      asset = await assets.findOneBy({ ownerId: input.ownerId, workIdentity: group.workIdentity });
      // 원 후보 unique 키가 다른 작업과 충돌한 경우 임의의 Catch에 연결하지 않는다.
      if (!asset) throw new CatchRegistrationContextError('REGISTRATION_MISMATCH');
    }
    await assertReady(manager, asset, context);
    // 새 Catch든 기존 Catch든 같은 트랜잭션에서 소속만 더한다. 기존 Catch의 내용·작성자 설명은 쓰지 않는다(BR3.4).
    // 저장소는 수신 기록의 분석 요청 저장소 ID다(입력 값으로 받지 않는다).
    await writeAssignments(manager,
      { memberId: input.ownerId, githubRepositoryId: context.repository_id, catchId: asset.catchId },
      group.ownCommitShas);
    for (const candidate of group.candidates) {
      const disposition = candidate.candidateId === createdCandidateId ? 'CREATED' : 'EXISTING';
      await registrations.insert({
        registrationId: randomUUID(), applicationRecordId: input.applicationRecordId,
        candidateId: candidate.candidateId, catchId: asset.catchId, disposition, ownerViewReady: true,
      });
      results.push({ candidateId: candidate.candidateId, catchId: asset.catchId, disposition, ownerViewReady: true });
    }
  }
  return results;
}

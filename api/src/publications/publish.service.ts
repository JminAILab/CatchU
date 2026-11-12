// 발행(POST /v1/publications, U4 W3·BR4·BR5, 계약 C-08 publish-sequence, 성능 설계 「판정 위치와 순서」, 신뢰성 설계 「발행 트랜잭션 경계」).
// 판정 순서: 빈도(429) → 입력(400) → 동의(403) → 트랜잭션 밖 토큰·scrypt → 트랜잭션(하루 횟수 → 원본 잠금·재읽기 → 자격 → 전체 글 → 쓰기 →
// PRIVATE→PUBLIC → chunkInTransaction → 커밋) → 커밋 뒤 작업 등록(실패는 로그만) → 201.
// 새 Catch NC2(계약 C3, 성능 설계 「발행 읽기 설계」): 잠금 조회가 저장소 등록 이름·작성자 설명 시각을, 근거 조회가 한계를 더 읽고, 소속 기록 조회 하나로
// 근거마다 본인 커밋 여부를 정한다. 등록 이름을 읽지 못한 Catch가 있으면 커밋 뒤 경고 한 줄을 남긴다(안전망).
import { HttpException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { AiConsentGate } from '../ai-consent/ai-consent.gate';
import { AiRun } from '../ai-run/ai-run';
import type { AiRunKind } from '../ai-run/ai-run-spec';
import { ApiError } from '../common/errors';
import { DailyRunLimit } from '../daily-run-limit/daily-run-limit';
import { PUBLISHED_INDEX_WRITER } from '../published-index/published-index.module';
import type { PublishedIndexWriter } from '../published-index/published-index-writer';
import { hashLinkPassword } from '../share-links/link-password';
import { buildRecipientLinkUrl, generateLinkToken } from '../share-links/link-token';
import { RequestRateLimiter } from '../share-links/request-rate-limiter';
import { SHARE_LINKS_CONFIG, ShareLinksConfig } from '../share-links/share-links.config';
import { PUBLICATION_TTL_HOURS } from './publication.entity';
import { PublicationState } from './publication-state';
import { Clock, PUBLICATIONS_CLOCK, PUBLISH_RATE_LIMITER, SNAPSHOT_TEXT_TOTAL_MAX, UNTITLED_CATCH_TITLE } from './publications-config';
import { PublicationsLog } from './publications-log';
import { PublishInput, PublishItemInput, isUuid, publishInput } from './publish-input';
import { ItemSnapshot } from './published-snapshot';
import {
  CatchEvidenceRow, CatchSourceRow, buildCatchSnapshot, buildTextMaterialSnapshot, commitShaOf, snapshotTextLength,
} from './snapshot-builder';

/** 발행 응답(U4 기능 명세 「작성자 API」). 토큰은 `url` 안에만 있다(BR10.2). */
export interface PublishResponse {
  publicationId: string;
  url: string;
  state: PublicationState;
  publishedAt: Date;
  expiresAt: Date;
  passwordProtected: boolean;
}

interface TextMaterialSourceRow {
  textMaterialId: string;
  title: string;
  body: string;
}

interface ProtectionRow {
  repositoryId: string;
  restriction: string;
  confirmedSourceState: unknown;
  observationProvenance: unknown;
  observedAt: Date | null;
}

interface PreparedItem {
  item: PublishItemInput;
  title: string;
  snapshot: ItemSnapshot;
}

/** 근거 조회 결과. 본인 커밋 여부는 소속 기록 조회 뒤에 붙인다(NC2 BR1.4). */
type EvidenceQueryRow = Omit<CatchEvidenceRow, 'ownCommit'>;

interface AssignmentRow {
  catchId: string;
  githubRepositoryId: string;
  commitSha: string;
}

interface StoredPublication {
  publicationId: string;
  publishedAt: Date;
  expiresAt: Date;
  /** 저장소 등록 이름을 읽지 못해 repositoryName을 뺀 Catch가 있었는지(NC2 안전망). 커밋된 뒤에만 로그로 남긴다. */
  repositoryNameMissing: boolean;
}

/** 잠근 뒤 읽은 Catch의 원 요청·보호 관측이 맞지 않는다(10월 setVisibility와 같은 서버 오류, BR4.2). 응답은 500이며 자료 값을 담지 않는다. */
export class PublishIntegrityError extends Error {
  override readonly name = 'PublishIntegrityError';

  constructor(readonly field: string) {
    super('발행 원본 자료가 올바르지 않습니다.');
  }
}

// 저장소 등록(rr)은 분석 요청의 외래 키와 같은 세 칸(회원, 등록, 저장소)으로 잇는다(NC2 NFR 설계 검토 R-03). 잠금은 Catch(c)에만 건다.
const CATCH_LOCK_SQL = `
  SELECT c.catch_id AS "catchId", c.title, c.work_facts AS "workFacts", c.subject_contribution AS "subjectContribution",
    c.draft_status AS "draftStatus", c.draft_content AS "draftContent", c.author_description AS "authorDescription",
    c.author_description_updated_at AS "authorDescriptionUpdatedAt",
    c.mismatch, c.visibility, c.work_facts_confirmed AS "workFactsConfirmed", c.contribution_confirmed AS "contributionConfirmed",
    r.member_id AS "requestMemberId", r.repository_id AS "repositoryId", rr.owner AS "repositoryOwner", rr.name AS "repositoryName"
  FROM catch_asset c LEFT JOIN analysis_request r ON r.request_id = c.source_request_id
    LEFT JOIN repository_registration rr
      ON rr.member_id = r.member_id AND rr.registration_id = r.registration_id AND rr.repository_id = r.repository_id
  WHERE c.owner_id = $1 AND c.catch_id = ANY($2::uuid[])
  ORDER BY c.catch_id ASC
  FOR NO KEY UPDATE OF c`;

const EVIDENCE_SQL = `
  SELECT e.catch_id AS "catchId", e.source_url AS "sourceUrl", e.source_revision AS "sourceRevision", e.represented_facts AS "representedFacts",
    e.coverage_limits AS "coverageLimits"
  FROM catch_evidence e WHERE e.catch_id = ANY($1::uuid[])
  ORDER BY e.catch_id ASC, e.position ASC, e.catch_evidence_id ASC`;

// 발행하는 회원·고른 Catch·근거 커밋 식별값으로 좁혀 한 번에 읽는다. 읽는 행 수는 근거 수를 넘지 않는다(NC2 성능 설계, 보안 설계 1절).
const COMMIT_ASSIGNMENT_SQL = `
  SELECT catch_id AS "catchId", github_repository_id AS "githubRepositoryId", commit_sha AS "commitSha"
  FROM commit_assignment
  WHERE member_id = $1 AND catch_id = ANY($2::uuid[]) AND commit_sha = ANY($3::char(40)[])`;

const PROTECTION_SQL = `
  SELECT repository_id AS "repositoryId", applied_restriction AS restriction, confirmed_source_state AS "confirmedSourceState",
    observation_provenance AS "observationProvenance", observed_at AS "observedAt"
  FROM repository_protection WHERE owner_id = $1 AND repository_id = ANY($2::text[]) FOR SHARE`;

const TEXT_MATERIAL_LOCK_SQL = `
  SELECT text_material_id AS "textMaterialId", title, body FROM text_material
  WHERE member_id = $1 AND text_material_id = ANY($2::uuid[]) ORDER BY text_material_id ASC FOR UPDATE`;

@Injectable()
export class PublishService {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(SHARE_LINKS_CONFIG) private readonly config: ShareLinksConfig,
    @Inject(PUBLICATIONS_CLOCK) private readonly clock: Clock,
    @Inject(PUBLISH_RATE_LIMITER) private readonly rateLimiter: RequestRateLimiter,
    private readonly consent: AiConsentGate,
    private readonly dailyLimit: DailyRunLimit,
    private readonly aiRun: AiRun,
    @Inject(PUBLISHED_INDEX_WRITER) private readonly indexWriter: PublishedIndexWriter,
    private readonly log: PublicationsLog,
  ) {}

  async publish(memberId: string, body: unknown): Promise<PublishResponse> {
    const owner = memberId.toLowerCase();
    try {
      if (!isUuid(owner)) throw new ApiError('AUTH_INVALID');
      // 회원별 발행 빈도(BR4.8, 임시값)는 입력 검사·해시·저장보다 먼저 센다. 거부한 요청은 세지 않고 아무것도 저장하지 않는다.
      const rate = this.rateLimiter.take(owner, this.clock());
      if (!rate.allowed) throw new ApiError('RATE_LIMITED', { retryAfterSeconds: rate.retryAfterSeconds });
      const input = publishInput(body);
      // 동의가 없으면 하루 횟수를 쓰지 않는다(BR4.7, C-04).
      await this.consent.require(owner);
      // 토큰·검증값은 잠금 시간을 줄이려고 트랜잭션 밖에서 먼저 만든다(BR5.4). 비밀번호 원문은 여기서 끝난다.
      const linkToken = generateLinkToken();
      const passwordVerifier = input.password === undefined ? null : await hashLinkPassword(input.password);

      const stored = await this.dataSource.transaction('READ COMMITTED', (manager) =>
        this.store(manager, owner, input, linkToken, passwordVerifier));

      this.log.publishSucceeded(stored.publicationId, owner);
      // 안전망 경고는 커밋된 발행에서만 남긴다. 롤백되면 이 줄에 오지 않는다(NC2 관측 설계).
      if (stored.repositoryNameMissing) this.log.snapshotRepositoryNameMissing(stored.publicationId, owner);
      // 커밋 뒤에만 등록한다. 실패해도 발행은 성공이며 다시 등록하지 않는다(BR5.5, 팀장 결정 2026-11-03 1).
      await this.enqueue('EMBED_PUBLICATION', stored.publicationId);
      await this.enqueue('BASE_SUMMARY', stored.publicationId);
      return {
        publicationId: stored.publicationId,
        url: buildRecipientLinkUrl(this.config.webBaseUrl, linkToken),
        state: 'ACTIVE',
        publishedAt: stored.publishedAt,
        expiresAt: stored.expiresAt,
        passwordProtected: passwordVerifier !== null,
      };
    } catch (error) {
      this.log.publishFailed(isUuid(owner) ? owner : null, errorCodeOf(error));
      throw error;
    }
  }

  /** 발행 트랜잭션(BR5.1). 어느 단계든 예외면 전체가 되돌아가고 하루 횟수도 함께 되돌아간다(BR5.2). */
  private async store(
    manager: EntityManager, owner: string, input: PublishInput, linkToken: string, passwordVerifier: string | null,
  ): Promise<StoredPublication> {
    await assertMemberExists(manager, owner);
    const now = this.clock();
    if (await this.dailyLimit.consume(owner, 'BASE_SUMMARY', now, manager) === 'LIMIT_REACHED') throw new ApiError('DAILY_LIMIT_REACHED');

    const catchIds = input.items.filter((item) => item.kind === 'CATCH').map((item) => item.sourceId);
    const materialIds = input.items.filter((item) => item.kind === 'TEXT_MATERIAL').map((item) => item.sourceId);
    // 잠금 순서: Catch를 catch_id 오름차순으로, 그다음 텍스트 자료를 text_material_id 오름차순으로(NFR4.6, 교착 방지).
    const catches = catchIds.length === 0 ? new Map<string, CatchSourceRow>() : await lockCatches(manager, owner, catchIds);
    const materials = materialIds.length === 0 ? new Map<string, TextMaterialSourceRow>() : await lockTextMaterials(manager, owner, materialIds);
    // 남의 것·없는 것은 구분하지 않는다(BR4.1, NFR1.1).
    if (catchIds.some((id) => !catches.has(id)) || materialIds.some((id) => !materials.has(id))) throw new NotFoundException();

    await assertCatchesEligible(manager, owner, catchIds.map((id) => catches.get(id)!));
    const evidence = catchIds.length === 0 ? [] : await readEvidence(manager, owner, catchIds, catches);
    const prepared = input.items.map((item): PreparedItem => {
      if (item.kind === 'CATCH') {
        const row = catches.get(item.sourceId)!;
        return { item, title: row.title ?? UNTITLED_CATCH_TITLE, snapshot: buildCatchSnapshot(row, evidence.filter((e) => e.catchId === row.catchId)) };
      }
      const row = materials.get(item.sourceId)!;
      return { item, title: row.title, snapshot: buildTextMaterialSnapshot(row.body) };
    });
    // 전체 글은 잠근 뒤 다시 읽은 원본으로 트랜잭션 안에서 센다(BR4.5, NFR4.3). 60,000자는 임시값이다.
    const total = prepared.reduce((sum, { snapshot }) => sum + snapshotTextLength(snapshot), 0);
    if (total > SNAPSHOT_TEXT_TOTAL_MAX) {
      throw new ApiError('VALIDATION_FAILED', { details: { violations: [{ field: 'items', reason: 'maxTotalLength' }] } });
    }

    const publicationId = randomUUID();
    const [row]: { publishedAt: Date; expiresAt: Date }[] = await manager.query(`
      INSERT INTO publication (publication_id, member_id, title, link_token_reference, password_protection_reference, published_at, expires_at, stopped_at)
      VALUES ($1, $2, $3, $4, $5, $6, $6::timestamptz + interval '${PUBLICATION_TTL_HOURS} hours', NULL)
      RETURNING published_at AS "publishedAt", expires_at AS "expiresAt"`,
    [publicationId, owner, input.title, linkToken, passwordVerifier, now]);
    for (const [index, { item, title, snapshot }] of prepared.entries()) {
      await manager.query(`
        INSERT INTO published_item (published_item_id, publication_id, position, item_kind, source_id, title, snapshot, pdf_copy_key)
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NULL)`,
      [randomUUID(), publicationId, index + 1, item.kind, item.sourceId, title, JSON.stringify(snapshot)]);
    }
    // 고른 PRIVATE Catch만 PUBLIC으로 바꾼다. 커밋될 때만 바뀐다(BR4.4).
    const privateIds = catchIds.filter((id) => catches.get(id)!.visibility === 'PRIVATE');
    if (privateIds.length > 0) {
      await manager.query(`UPDATE catch_asset SET visibility = 'PUBLIC' WHERE owner_id = $1 AND catch_id = ANY($2::uuid[])`, [owner, privateIds]);
    }
    // 같은 manager로 조각을 나눈다. 예외면 발행 전체가 되돌아간다(C-08).
    await this.indexWriter.chunkInTransaction(manager, publicationId, now);
    const repositoryNameMissing = prepared.some(({ item, snapshot }) => item.kind === 'CATCH' && !('repositoryName' in snapshot));
    return { publicationId, publishedAt: new Date(row.publishedAt), expiresAt: new Date(row.expiresAt), repositoryNameMissing };
  }

  private async enqueue(kind: AiRunKind, publicationId: string): Promise<void> {
    // runKey·payload는 C-02·docs/published-index.md·docs/rag-answer.md 규칙 그대로다.
    const result = await this.aiRun.enqueueAfterCommit(kind, `${kind}-${publicationId}`, { publicationId });
    this.log.enqueueResult(publicationId, kind, result);
  }
}

async function assertMemberExists(manager: EntityManager, memberId: string): Promise<void> {
  // 발행이 끝날 때까지 회원 삭제를 막는다. 다른 DB 오류는 서버 오류로 둔다(제출 1과 같은 기준).
  const member = await manager.query('SELECT 1 FROM member_account WHERE member_id = $1 FOR KEY SHARE', [memberId]);
  if (member.length === 0) throw new ApiError('AUTH_INVALID');
}

/** visibility만 갱신하므로 키를 보호하는 외래 키의 KEY SHARE와 공존하는 NO KEY UPDATE로 잠근다(10월 setVisibility와 같은 잠금). */
async function lockCatches(manager: EntityManager, owner: string, catchIds: string[]): Promise<Map<string, CatchSourceRow>> {
  const rows: CatchSourceRow[] = await manager.query(CATCH_LOCK_SQL, [owner, catchIds]);
  return new Map(rows.map((row) => [row.catchId, row]));
}

async function lockTextMaterials(manager: EntityManager, owner: string, ids: string[]): Promise<Map<string, TextMaterialSourceRow>> {
  const rows: TextMaterialSourceRow[] = await manager.query(TEXT_MATERIAL_LOCK_SQL, [owner, ids]);
  return new Map(rows.map((row) => [row.textMaterialId, row]));
}

const assignmentKey = (catchId: string, repositoryId: string, sha: string) => JSON.stringify([catchId, repositoryId, sha]);

/**
 * 근거를 읽고 근거마다 본인 커밋 여부를 붙인다(NC2 BR1.4, NFR5.3). 커밋 주소 근거의 식별값만 모아 소속 기록을 한 번 읽고,
 * 「근거의 Catch, 그 Catch의 분석 요청 저장소 ID, 근거 식별값」 셋이 모두 맞는 소속 기록이 있을 때만 참이다.
 * 그래서 다른 Catch·다른 회원·다른 저장소 ID의 같은 식별값은 참이 되지 않는다. 커밋 주소 근거가 없으면 소속 기록을 읽지 않는다.
 */
async function readEvidence(
  manager: EntityManager, owner: string, catchIds: string[], catches: Map<string, CatchSourceRow>,
): Promise<CatchEvidenceRow[]> {
  const rows: EvidenceQueryRow[] = await manager.query(EVIDENCE_SQL, [catchIds]);
  const shas = [...new Set(rows.map((row) => commitShaOf(row.sourceUrl)).filter((sha): sha is string => sha !== null))];
  const assigned = new Set<string>();
  if (shas.length > 0) {
    const assignments: AssignmentRow[] = await manager.query(COMMIT_ASSIGNMENT_SQL, [owner, catchIds, shas]);
    for (const row of assignments) assigned.add(assignmentKey(row.catchId, row.githubRepositoryId, row.commitSha));
  }
  return rows.map((row) => {
    const sha = commitShaOf(row.sourceUrl);
    const repositoryId = catches.get(row.catchId)?.repositoryId ?? null;
    return { ...row, ownCommit: sha !== null && repositoryId !== null && assigned.has(assignmentKey(row.catchId, repositoryId, sha)) };
  });
}

/**
 * 10월 공개 전환 조건을 고른 모든 Catch에 같은 잠금으로 적용한다(BR4.2·BR7.4, docs/catch-visibility.md).
 * 미확인은 409 CONFIRMATION_REQUIRED, 확인된 SOURCE_PRIVATE는 409 SOURCE_RESTRICTED(둘 다 details.catchIds). 원 요청 불일치·보호 관측
 * 없음·불완전은 10월처럼 서버 오류이며 비공개로 단정하지 않는다. 확인 판정을 보호 판정보다 먼저 한다(10월 순서).
 */
async function assertCatchesEligible(manager: EntityManager, owner: string, rows: CatchSourceRow[]): Promise<void> {
  if (rows.length === 0) return;
  const unconfirmed = rows.filter((row) => !row.workFactsConfirmed || !row.contributionConfirmed).map((row) => row.catchId);
  if (unconfirmed.length > 0) throw new ApiError('CONFIRMATION_REQUIRED', { details: { catchIds: unconfirmed } });
  for (const row of rows) {
    if (row.requestMemberId !== owner || row.repositoryId === null) throw new PublishIntegrityError('sourceRequest');
  }
  const repositoryIds = [...new Set(rows.map((row) => row.repositoryId as string))];
  const protections: ProtectionRow[] = await manager.query(PROTECTION_SQL, [owner, repositoryIds]);
  const byRepository = new Map(protections.map((row) => [row.repositoryId, row]));
  const restricted: string[] = [];
  for (const row of rows) {
    const protection = byRepository.get(row.repositoryId as string);
    // 등록·조회와 같은 관측 완전성을 잠금 안에서 확인한다. 최근 실패는 이전 유효 관측을 무효화하지 않는다.
    if (!protection || !['NONE', 'SOURCE_PRIVATE'].includes(protection.restriction)
      || [protection.confirmedSourceState, protection.observationProvenance, protection.observedAt]
        .some((value) => value === null || value === undefined)) {
      throw new PublishIntegrityError('protection');
    }
    if (protection.restriction === 'SOURCE_PRIVATE') restricted.push(row.catchId);
  }
  if (restricted.length > 0) throw new ApiError('SOURCE_RESTRICTED', { details: { catchIds: restricted } });
}

/** 로그에 남길 오류 코드: 업무 코드가 있으면 그 코드, 404 예외는 RESOURCE_UNAVAILABLE, 그 밖은 INTERNAL_ERROR. */
function errorCodeOf(error: unknown): string {
  if (error instanceof ApiError) return error.code;
  if (error instanceof NotFoundException) return 'RESOURCE_UNAVAILABLE';
  if (error instanceof HttpException && error.getStatus() === 400) return 'INVALID_REQUEST';
  return 'INTERNAL_ERROR';
}

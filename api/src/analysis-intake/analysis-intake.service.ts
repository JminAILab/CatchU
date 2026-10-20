import { createHash, randomUUID } from 'node:crypto';
import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ApiError } from '../common/errors';
import { GitHubConnectionService } from '../github-connection/github-connection.service';
import { DevMemberService } from '../member-analysis/dev-member.service';
import { AnalysisConsent, AnalysisRequest, IdempotencyRecord } from '../member-analysis/member-analysis.entity';
import { MemberKindService } from '../member-analysis/member-kind';
import { insertInitialAnalysis } from '../member-analysis/initial-analysis';
import { isIdempotencyKey, runIdempotentCreation } from '../member-analysis/idempotent-creation';
import { repositoryPage } from '../member-repositories/repository-page';
import { RepositorySelectionService } from '../member-repositories/repository-selection.source';
import { AnalysisInput, analysisFingerprint, parseAnalysisInput } from './analysis-input';
import { AnalysisNoticeService } from './analysis-notice';
import { blocksReanalysis, readAnalysisStatus } from './analysis-status';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
@Injectable()
export class AnalysisIntakeService {
  private readonly logger = new Logger('AnalysisIntake');
  constructor(private readonly database: DataSource, private readonly connections: DevMemberService,
    private readonly notices: AnalysisNoticeService, private readonly members: MemberKindService,
    private readonly selections: RepositorySelectionService, private readonly github: GitHubConnectionService) {}

  async notice(memberId: string) {
    if (!UUID.test(memberId)) throw new ApiError('AUTH_INVALID');
    // 고지는 회원 생성 출처로만 고른다. GitHub 연결 상태·공급 방식은 보지 않고, 조회 오류는 그대로 500이다.
    const kind = await this.members.read(memberId);
    if (kind === 'REAL') return this.notices.real();
    // 미지원 출처는 실제 회원으로 보지 않고 기존 개발 회원 경계처럼 거부한다.
    if (kind !== 'DEVELOPMENT') throw new ForbiddenException();
    return this.notices.current();
  }

  /** 회원 생성 출처로 접수 경로를 고른다(#322). 회원 행을 읽기 잠금해 커밋 전에 판정이 바뀌지 않게 한다. */
  private async context(manager: EntityManager, memberId: string, input: AnalysisInput) {
    const kind = await this.members.read(memberId, manager);
    if (kind === 'REAL') return this.realContext(manager, memberId, input);
    // 미지원 출처는 실제 회원으로 보지 않고 기존 개발 회원 경계처럼 거부한다.
    if (kind !== 'DEVELOPMENT') throw new ForbiddenException();
    return this.developmentContext(manager, memberId, input);
  }
  /**
   * 실제 회원(#323)은 개발 로그인 설정과 관계없이 #252 선정 근거를 같은 생성 manager로 재확인한다(회원 → 연결 → 선정 →
   * 범위 정의 읽기 잠금). 현재 실제 고지·범위 판본에 동의해야 하고, 원래 선정 참조를 담은 네 칸 동의로 LIVE 접수한다.
   */
  private async realContext(manager: EntityManager, memberId: string, input: AnalysisInput) {
    // 연동이 꺼진 서버는 보관 자격정보를 읽지 못해 #232 실행 조회가 거부하므로 남은 연결 행으로 LIVE 접수하지 않는다(403).
    this.github.requireAvailable();
    const selection = await this.selections.confirmForIntake(manager, memberId, input.repositoryId);
    if (input.consent.scopeRevision !== selection.scopeRevision ||
        input.consent.noticeRevision !== this.notices.real().noticeRevision) throw new ApiError('CONSENT_REQUIRED');
    return { consentedScope: { ...selection.consentedScope }, sourceMode: 'LIVE' as const };
  }
  /** 개발 회원은 #104 합성 연결·저장소만 MOCK으로 받는다. 실제 GitHub 연결이 섞이면 보정하지 않고 거부한다(500). */
  private async developmentContext(manager: EntityManager, memberId: string, input: AnalysisInput) {
    const connection = await this.connections.readConnection(memberId, manager);
    if (connection.connectionState === 'DISCONNECTED' || connection.connectionState === 'REAUTH_REQUIRED') throw new ApiError('GITHUB_CONNECTION_REQUIRED');
    if (connection.connectionState !== 'CONNECTED') throw new Error('Invalid connection state');
    // #136의 공급 자료 형식 확인도 재사용한다. 페이지 크기로 선정 판정을 좁히지 않는다.
    repositoryPage(memberId, connection.repositories, { limit: 100 });
    const repository = connection.repositories.find(r => r.repositoryId === input.repositoryId);
    if (!repository) throw new ApiError('REPOSITORY_NOT_ALLOWED');
    if (input.consent.scopeRevision !== repository.allowedScopeRevision ||
        input.consent.noticeRevision !== this.notices.current().noticeRevision) throw new ApiError('CONSENT_REQUIRED');
    return { consentedScope: this.notices.scope(repository.repositoryId, repository.allowedScopeRevision, connection.sourceMode),
      sourceMode: 'MOCK' as const };
  }
  /**
   * 실제 회원의 새 접수·실패 재요청 전에 #231 보관 자격정보의 만료·이용 불가를 연결 상태에 반영한다(목록과 같다, #252).
   * 연결 행을 고치므로 생성 트랜잭션 밖에서 부른다. 이미 접수된 키의 재전송은 현재 조건을 보지 않으므로 부르지 않고,
   * 형식이 틀린 키는 생성 트랜잭션이 400으로 거부한다. 개발 회원의 연결은 건드리지 않는다.
   * 같은 키 요청이 겹치면 이 확인 뒤에 다른 요청이 먼저 접수할 수 있다. 그래서 갱신 실패는 던지지 않고 돌려주며,
   * 생성 트랜잭션이 멱등 잠금 안에서 새 접수로 판정한 때에만 알린다.
   */
  private async refreshRealConnection(memberId: string, key: string | undefined): Promise<{ error: unknown } | null> {
    if (!isIdempotencyKey(key) || await this.members.read(memberId) !== 'REAL' ||
        await this.database.manager.existsBy(IdempotencyRecord, { memberId, operation: 'createAnalysisRequest', key })) return null;
    try {
      await this.github.refreshStatus(memberId);
      return null;
    } catch (error) {
      return { error };
    }
  }
  private async lockMember(manager: EntityManager, memberId: string) {
    await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [JSON.stringify(['catchu:analysis-intake', memberId])]);
  }
  async create(memberId: string, key: string | undefined, raw: unknown) {
    if (!UUID.test(memberId)) throw new ApiError('AUTH_INVALID');
    const input = parseAnalysisInput(raw);
    const refreshFailure = await this.refreshRealConnection(memberId, key);
    let reusedActive = false;
    const result = await this.database.transaction('READ COMMITTED', manager => runIdempotentCreation(manager,
      { memberId, operation: 'createAnalysisRequest', key: key as string, requestFingerprint: analysisFingerprint(input) }, {
        create: async same => {
          // 새 접수로 판정됐을 때만 연결 상태 갱신 실패를 알린다. 같은 키 재전송은 아래 isSame에서 현재 상태로 답한다.
          if (refreshFailure) throw refreshFailure.error;
          await this.lockMember(same, memberId);
          const { consentedScope, sourceMode } = await this.context(same, memberId, input);
          // 타인·없는 retry 참조는 같은 404. ACTIVE 처리로 숨겨 성공시키지 않는다.
          if (input.retryOfRequestId && (!UUID.test(input.retryOfRequestId) ||
              !await same.existsBy(AnalysisRequest, { requestId: input.retryOfRequestId, memberId, repositoryId: input.repositoryId }))) {
            throw new ApiError('RESOURCE_UNAVAILABLE');
          }
          const active = await same.findOneBy(AnalysisRequest, { memberId, lifecycle: 'ACTIVE' });
          if (active) {
            if (active.repositoryId !== input.repositoryId) throw new ApiError('ANALYSIS_IN_PROGRESS',
              { details: { existingRequestId: active.requestId } });
            reusedActive = true;
            return { requestId: active.requestId, linkId: null, responseReference: active.requestId };
          }
          const previous = await same.find(AnalysisRequest, { where: { memberId, repositoryId: input.repositoryId },
            order: { submittedAt: 'DESC', requestId: 'DESC' } });
          // 같은 저장소의 과거 정상·부분 결과를 새 ID로 우회하지 않는다. 반영 실패로 닫혀 등록이 없는 요청은
          // 정상 완료가 아니므로 막지 않고 아래의 가장 최근 요청 재요청 판정으로 넘긴다.
          for (const request of previous) {
            const { status } = await readAnalysisStatus(same, memberId, request.requestId);
            if (blocksReanalysis(status)) throw new ApiError('REANALYSIS_DEFERRED');
          }
          if (previous.length > 0) {
            const latest = previous[0];
            const { status } = await readAnalysisStatus(same, memberId, latest.requestId);
            if (input.retryOfRequestId !== latest.requestId || !status.retry.allowed) throw new ApiError('RETRY_NOT_ALLOWED');
          } else if (input.retryOfRequestId) throw new ApiError('RETRY_NOT_ALLOWED');
          const request = await insertInitialAnalysis(same, { memberId, repositoryId: input.repositoryId,
            noticeRevision: input.consent.noticeRevision, scopeRevision: input.consent.scopeRevision,
            consentedScope, sourceMode, retryOfRequestId: input.retryOfRequestId ?? null });
          return { requestId: request.requestId, linkId: null, responseReference: request.requestId };
        },
        isSame: async (same, record) => {
          await this.lockMember(same, memberId);
          // 이미 접수된 키는 현재 연결·선정·판본의 신규 접수 조건을 다시 검사하지 않는다.
          // 지문은 전체 입력이다. ACTIVE 200은 다른 동의에 대한 응답일 수 있어 원 동의를 변경하지 않는다.
          const request = await same.findOneBy(AnalysisRequest, { requestId: record.requestId!, memberId });
          if (!request || record.responseReference !== request.requestId) throw new Error('Analysis idempotency reference is inconsistent');
          return request.repositoryId === input.repositoryId;
        },
        readResponse: async (same, record) => (await readAnalysisStatus(same, memberId, record.requestId!)).status,
      }));
    // 재전송이면 갱신이 필요 없었으므로 응답에는 쓰지 않고, 보관소 장애 신호만 남긴다. 오류 원문은 넣지 않는다.
    if (refreshFailure && result.replayed) {
      this.logger.warn(`같은 키 재전송 전의 GitHub 연결 상태 갱신 실패는 응답에 쓰지 않음 requestId=${result.response.requestId}`);
    }
    return { existing: result.replayed || reusedActive, status: result.response };
  }

  /** 내부 Request 맥락만 준비한다. 전송·재전송·큐 등록은 하지 않는다. */
  async prepareExecutionRequest(memberId: string, requestId: string) {
    return this.database.transaction('READ COMMITTED', async manager => {
      const { request, attempt } = await readAnalysisStatus(manager, memberId, requestId);
      const consent = await manager.findOneByOrFail(AnalysisConsent, { consentId: request.consentId, requestId });
      if (attempt.sourceMode !== 'MOCK') throw new ApiError('CONSENT_REQUIRED');
      return { schemaVersion: '1', messageId: randomUUID(), requestId, attemptId: attempt.attemptId, memberId,
        repositoryId: request.repositoryId, consentId: consent.consentId, noticeRevision: consent.noticeRevision,
        consentedAt: consent.consentedAt.toISOString(), allowedScope: consent.consentedScope,
        credentialContextReference: 'catchu:mock-credential:' + createHash('sha256').update(memberId).digest('hex'),
        sourceMode: attempt.sourceMode, requestedAt: request.submittedAt.toISOString() };
    });
  }
}

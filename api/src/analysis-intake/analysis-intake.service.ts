import { createHash, randomUUID } from 'node:crypto';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ApiError } from '../common/errors';
import { DevMemberService } from '../member-analysis/dev-member.service';
import { AnalysisConsent, AnalysisRequest } from '../member-analysis/member-analysis.entity';
import { MemberKindService } from '../member-analysis/member-kind';
import { insertInitialAnalysis } from '../member-analysis/initial-analysis';
import { runIdempotentCreation } from '../member-analysis/idempotent-creation';
import { repositoryPage } from '../member-repositories/repository-page';
import { AnalysisInput, analysisFingerprint, parseAnalysisInput } from './analysis-input';
import { AnalysisNoticeService } from './analysis-notice';
import { blocksReanalysis, readAnalysisStatus } from './analysis-status';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
@Injectable()
export class AnalysisIntakeService {
  constructor(private readonly database: DataSource, private readonly connections: DevMemberService,
    private readonly notices: AnalysisNoticeService, private readonly members: MemberKindService) {}

  async notice(memberId: string) {
    if (!UUID.test(memberId)) throw new ApiError('AUTH_INVALID');
    // 고지는 회원 생성 출처로만 고른다. GitHub 연결 상태·공급 방식은 보지 않고, 조회 오류는 그대로 500이다.
    const kind = await this.members.read(memberId);
    if (kind === 'REAL') return this.notices.real();
    // 미지원 출처는 실제 회원으로 보지 않고 기존 개발 회원 경계처럼 거부한다.
    if (kind !== 'DEVELOPMENT') throw new ForbiddenException();
    return this.notices.current();
  }

  private async context(manager: EntityManager, memberId: string, input: AnalysisInput) {
    const connection = await this.connections.readConnection(memberId, manager);
    if (connection.connectionState === 'DISCONNECTED' || connection.connectionState === 'REAUTH_REQUIRED') throw new ApiError('GITHUB_CONNECTION_REQUIRED');
    if (connection.connectionState !== 'CONNECTED') throw new Error('Invalid connection state');
    // #136의 공급 자료 형식 확인도 재사용한다. 페이지 크기로 선정 판정을 좁히지 않는다.
    repositoryPage(memberId, connection.repositories, { limit: 100 });
    const repository = connection.repositories.find(r => r.repositoryId === input.repositoryId);
    if (!repository) throw new ApiError('REPOSITORY_NOT_ALLOWED');
    if (input.consent.scopeRevision !== repository.allowedScopeRevision ||
        input.consent.noticeRevision !== this.notices.current().noticeRevision) throw new ApiError('CONSENT_REQUIRED');
    return this.notices.scope(repository.repositoryId, repository.allowedScopeRevision, connection.sourceMode);
  }
  private async lockMember(manager: EntityManager, memberId: string) {
    await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [JSON.stringify(['catchu:analysis-intake', memberId])]);
  }
  async create(memberId: string, key: string | undefined, raw: unknown) {
    if (!UUID.test(memberId)) throw new ApiError('AUTH_INVALID');
    const input = parseAnalysisInput(raw);
    let reusedActive = false;
    const result = await this.database.transaction('READ COMMITTED', manager => runIdempotentCreation(manager,
      { memberId, operation: 'createAnalysisRequest', key: key as string, requestFingerprint: analysisFingerprint(input) }, {
        create: async same => {
          await this.lockMember(same, memberId);
          const scope = await this.context(same, memberId, input);
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
            consentedScope: scope, sourceMode: 'MOCK', retryOfRequestId: input.retryOfRequestId ?? null });
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

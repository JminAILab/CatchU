import { EntityManager } from 'typeorm';
import { AnalysisAttempt, AnalysisConsent, AnalysisRequest } from './member-analysis.entity';
import { requireCreationTransaction } from './transaction';

export interface InitialAnalysisInput {
  memberId: string;
  repositoryId: string;
  noticeRevision: string;
  scopeRevision: string;
  consentedScope: Record<string, unknown>;
  sourceMode: 'MOCK' | 'LIVE';
}

/**
 * 접수 API의 현재 연동·고지·권한·이력 판정 이후 호출하는 저장 기반.
 * 새 동의/첫 시도를 연결한다. 재요청 판정·worker 전송·자동 재시도는 제공하지 않는다.
 * 반환값은 커밋 전이며 호출자는 바깥 트랜잭션 성공 후 응답해야 한다.
 */
export async function insertInitialAnalysis(manager: EntityManager, input: InitialAnalysisInput): Promise<AnalysisRequest> {
  await requireCreationTransaction(manager);
  const request = new AnalysisRequest();
  const consent = new AnalysisConsent();
  const attempt = new AnalysisAttempt();
  const now = new Date();
  Object.assign(request, { memberId: input.memberId, repositoryId: input.repositoryId,
    consentId: consent.consentId, currentAttemptId: attempt.attemptId, submittedAt: now, updatedAt: now });
  Object.assign(consent, { requestId: request.requestId, memberId: input.memberId, repositoryId: input.repositoryId,
    accepted: true, noticeRevision: input.noticeRevision, scopeRevision: input.scopeRevision,
    consentedScope: input.consentedScope, consentedAt: now });
  Object.assign(attempt, { requestId: request.requestId, sourceMode: input.sourceMode });
  await manager.insert(AnalysisRequest, request);
  await manager.save(AnalysisConsent, consent);
  await manager.insert(AnalysisAttempt, attempt);
  return request;
}

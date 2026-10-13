import { EntityManager } from 'typeorm';
import { AnalysisAttempt, AnalysisRequest } from '../member-analysis/member-analysis.entity';
import { ResultApplicationRecord } from '../result-application/result-application.entity';

export type RetryReason = 'FAILURE_WITHOUT_RESULTS' | 'IN_PROGRESS' | 'RESULTS_EXIST' | 'NOT_FAILED' |
  'EXECUTION_UNCERTAIN' | 'APPLICATION_UNRESOLVED' | 'REANALYSIS_DEFERRED';
export function retryDecision(request: AnalysisRequest, attempt: AnalysisAttempt, registrationCount: number,
  confirmedFailure = attempt.failureConfirmationReference) {
  let reason: RetryReason;
  if (attempt.eligibleCandidateCount > 0 || registrationCount > 0 || attempt.ownerResultsReady) reason = 'RESULTS_EXIST';
  else if (attempt.processing === 'UNCERTAIN') reason = 'EXECUTION_UNCERTAIN';
  else if (['PENDING', 'APPLYING', 'RECOVERING', 'APPLY_FAILED'].includes(attempt.application)) reason = 'APPLICATION_UNRESOLVED';
  else if (request.lifecycle === 'ACTIVE' || ['QUEUED', 'RUNNING'].includes(attempt.processing)) reason = 'IN_PROGRESS';
  else if (attempt.processing !== 'FAILED') reason = 'REANALYSIS_DEFERRED';
  else if (attempt.application !== 'APPLIED' || attempt.failures.length === 0 ||
      !confirmedFailure?.trim()) reason = 'NOT_FAILED';
  else reason = 'FAILURE_WITHOUT_RESULTS';
  return { allowed: reason === 'FAILURE_WITHOUT_RESULTS', reason };
}
/** 같은 트랜잭션·요청→시도 잠금 순서로 상태를 한 판본으로 읽는다. #140 GET은 추가하지 않는다. */
export async function readAnalysisStatus(manager: EntityManager, memberId: string, requestId: string) {
  const request = await manager.findOne(AnalysisRequest, { where: { requestId, memberId },
    lock: { mode: 'pessimistic_write' } });
  if (!request) throw new Error('Analysis reference is missing');
  const attempt = await manager.findOne(AnalysisAttempt, { where: { attemptId: request.currentAttemptId, requestId },
    lock: { mode: 'pessimistic_write' } });
  if (!attempt) throw new Error('Analysis attempt is missing');
  const registrations: { catchId: string; ready: boolean }[] = await manager.query(
    'SELECT cr.catch_id AS "catchId", cr.owner_view_ready AS ready FROM candidate_registration cr JOIN result_application_record r ON r.application_record_id = cr.application_record_id WHERE r.request_id = $1 AND r.attempt_id = $2',
    [requestId, attempt.attemptId]);
  // 등록 연결뿐 아니라 Catch 본체가 있는 경우도 결과 없음으로 판단하지 않는다.
  const [{ count }] = await manager.query('SELECT count(*)::int AS count FROM catch_asset WHERE source_request_id = $1', [requestId]);
  const receipt = await manager.findOneBy(ResultApplicationRecord, { requestId, attemptId: attempt.attemptId });
  // 기존 E가 검증·저장한 Result와 FAILED 정본도 확정 근거다. 수신 ACK만으로는 허용하지 않고 APPLIED/CLOSED를 요구한다.
  const confirmation = attempt.failureConfirmationReference || (receipt ? 'received-result:' + receipt.resultId : null);
  let retry = retryDecision(request, attempt, Math.max(registrations.length, count), confirmation);
  if (retry.allowed) {
    const active = await manager.findOneBy(AnalysisRequest, { memberId, lifecycle: 'ACTIVE' });
    const latest = await manager.findOne(AnalysisRequest, { where: { memberId, repositoryId: request.repositoryId },
      order: { submittedAt: 'DESC', requestId: 'DESC' } });
    // 이전 실패 키의 재응답도 현재 접수 판정과 같아야 한다. 이미 새 요청을 만든 실패를 다시 허용하지 않는다.
    if (active) retry = { allowed: false, reason: 'IN_PROGRESS' };
    else if (latest?.requestId !== requestId) retry = { allowed: false, reason: 'REANALYSIS_DEFERRED' };
  }
  const status = {
    requestId: request.requestId, repositoryId: request.repositoryId, consentId: request.consentId,
    attemptId: attempt.attemptId, submittedAt: request.submittedAt.toISOString(), updatedAt: request.updatedAt.toISOString(),
    requestState: request.requestState, lifecycle: request.lifecycle, processing: attempt.processing,
    application: attempt.application, sourceMode: attempt.sourceMode, eligibleCandidateCount: attempt.eligibleCandidateCount,
    registeredCatchIds: [...new Set(registrations.filter(r => r.ready).map(r => r.catchId))],
    ownerResultsReady: attempt.ownerResultsReady, retry, failures: attempt.failures,
  };
  return { request, attempt, status };
}

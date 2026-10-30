import { EntityManager } from 'typeorm';
import { AnalysisAttempt, AnalysisRequest } from '../member-analysis/member-analysis.entity';
import { ResultApplicationRecord } from '../result-application/result-application.entity';

export type RetryReason = 'FAILURE_WITHOUT_RESULTS' | 'IN_PROGRESS' | 'RESULTS_EXIST' | 'NOT_FAILED' |
  'EXECUTION_UNCERTAIN' | 'APPLICATION_UNRESOLVED' | 'REANALYSIS_DEFERRED' | 'ANALYSIS_FINISHED';
/** 반영 실패로 닫힌 요청이다. 처리 결과와 적합 후보 수는 재요청 판정에서 보지 않는다. */
const closedApplyFailure = (request: AnalysisRequest, attempt: AnalysisAttempt) =>
  request.lifecycle === 'CLOSED' && attempt.application === 'APPLY_FAILED';
export function retryDecision(request: AnalysisRequest, attempt: AnalysisAttempt, registrationCount: number,
  confirmedFailure = attempt.failureConfirmationReference): { allowed: boolean; reason: RetryReason } {
  const closedApply = closedApplyFailure(request, attempt);
  let reason: RetryReason;
  if (attempt.processing === 'UNCERTAIN' && request.lifecycle !== 'CLOSED') reason = 'EXECUTION_UNCERTAIN';
  else if (['PENDING', 'APPLYING', 'RECOVERING'].includes(attempt.application) ||
      (attempt.application === 'APPLY_FAILED' && !closedApply)) reason = 'APPLICATION_UNRESOLVED';
  else if (request.lifecycle !== 'CLOSED' || ['QUEUED', 'RUNNING'].includes(attempt.processing)) reason = 'IN_PROGRESS';
  else if (!['APPLIED', 'APPLY_FAILED'].includes(attempt.application)) reason = 'APPLICATION_UNRESOLVED';
  // #424(2026-10-30): 닫힌 최신 요청은 결과와 무관하게 새 동의로 다시 분석한다.
  // 결과 등록은 기존 workIdentity의 Catch를 참조하므로 기존 내용·설명을 교체하지 않는다.
  else if (registrationCount === 0 && !attempt.ownerResultsReady && (closedApply ||
      (attempt.processing === 'FAILED' && attempt.eligibleCandidateCount === 0 &&
       attempt.application === 'APPLIED' && attempt.failures.length > 0 && confirmedFailure?.trim()))) reason = 'FAILURE_WITHOUT_RESULTS';
  else reason = 'ANALYSIS_FINISHED';
  return { allowed: reason === 'FAILURE_WITHOUT_RESULTS' || reason === 'ANALYSIS_FINISHED', reason };
}
const STATUS_LOCK = { mode: 'for_no_key_update' } as const;
/** 상태 변경을 막되 멱등 소유 확인의 KEY SHARE와 경합하지 않는 요청→시도 잠금으로 읽는다. */
export async function readAnalysisStatus(manager: EntityManager, memberId: string, requestId: string) {
  const request = await manager.findOne(AnalysisRequest, { where: { requestId, memberId }, lock: STATUS_LOCK });
  if (!request) throw new Error('Analysis reference is missing');
  return statusOf(manager, request, true);
}
/**
 * 조회 API(#140)가 이미 읽은 본인 요청 행의 상태를 접수와 같은 판정으로 구한다. 행 잠금을 잡지 않으므로 호출자가
 * REPEATABLE READ 이상의 읽기 전용 트랜잭션에서 불러 요청·현재 시도·등록 연결·Catch·수신 기록을 한 시점으로 읽는다.
 */
export function readAnalysisStatusSnapshot(manager: EntityManager, request: AnalysisRequest) {
  return statusOf(manager, request, false);
}
async function statusOf(manager: EntityManager, request: AnalysisRequest, lock: boolean) {
  const { requestId, memberId } = request;
  const attempt = await manager.findOne(AnalysisAttempt, { where: { attemptId: request.currentAttemptId, requestId },
    ...(lock ? { lock: STATUS_LOCK } : {}) });
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
    ownCommitObservation: attempt.ownCommitObservation, observedOwnCommitCount: attempt.observedOwnCommitCount,
    collectionLimitNotes: attempt.collectionLimitNotes,
  };
  return { request, attempt, status };
}

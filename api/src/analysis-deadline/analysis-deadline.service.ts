import { DataSource, QueryFailedError } from 'typeorm';
import { AnalysisAttempt, AnalysisRequest } from '../member-analysis/member-analysis.entity';

/** 계약 「공통 오류·요청 안전성」의 분석 요청 처리 시한: 접수(submittedAt) 후 60분. */
export const ANALYSIS_PROCESSING_DEADLINE_MS = 60 * 60 * 1000;
/** 판정 주기. 반영 실패는 시한을 기다리지 않고 이 주기의 다음 판정에서 닫힌다. */
export const ANALYSIS_DEADLINE_CHECK_INTERVAL_MS = 60 * 1000;
/** 한 번의 판정에서 다루는 요청 수. 남은 요청은 다음 판정에서 닫는다. */
const BATCH_SIZE = 100;

const DEADLINE_CODE = 'PROCESSING_DEADLINE_EXCEEDED';
const PROCESSING_DEADLINE_FAILURE = {
  stage: 'DISPATCH', code: DEADLINE_CODE, message: '정해진 시간 안에 분석을 마치지 못했습니다.',
} as const;
const APPLICATION_DEADLINE_FAILURE = {
  stage: 'APPLICATION', code: DEADLINE_CODE, message: '정해진 시간 안에 결과를 반영하지 못했습니다.',
} as const;
const IN_PROGRESS: ReadonlySet<AnalysisAttempt['processing']> = new Set(['QUEUED', 'RUNNING', 'UNCERTAIN']);

/**
 * PROCESSING_DEADLINE: 처리 중 시한 초과 → FAILED/APPLIED/CLOSED.
 * APPLICATION_DEADLINE: 반영 대기 중 시한 초과 → 처리 결과 유지, APPLY_FAILED/CLOSED.
 * APPLICATION_FAILED: 반영 실패 → 시한과 관계없이 CLOSED.
 * UNEXPECTED: 시한을 넘겼지만 계약 전이에 없는 조합. 후보 조회에서 빠지며, 잠근 뒤 다시 읽었을 때
 * 이 조합이면 바꾸지 않고 기록만 한다.
 */
export type DeadlineDecision = 'NONE' | 'PROCESSING_DEADLINE' | 'APPLICATION_DEADLINE' | 'APPLICATION_FAILED' | 'UNEXPECTED';

export function decideDeadline(request: Pick<AnalysisRequest, 'lifecycle' | 'submittedAt'>,
  attempt: Pick<AnalysisAttempt, 'processing' | 'application'>, now: Date): DeadlineDecision {
  if (request.lifecycle !== 'ACTIVE') return 'NONE';
  if (attempt.application === 'APPLY_FAILED') return 'APPLICATION_FAILED';
  if (now.getTime() - request.submittedAt.getTime() < ANALYSIS_PROCESSING_DEADLINE_MS) return 'NONE';
  if (attempt.application === 'NOT_READY' && IN_PROGRESS.has(attempt.processing)) return 'PROCESSING_DEADLINE';
  if (attempt.application === 'PENDING') return 'APPLICATION_DEADLINE';
  return 'UNEXPECTED';
}

export interface AnalysisDeadlineLog {
  closed(requestId: string, attemptId: string, decision: Exclude<DeadlineDecision, 'NONE' | 'UNEXPECTED'>): void;
  unexpected(requestId: string, processing: string, application: string): void;
  failed(requestId: string, errorName: string): void;
}

interface CloseOutcome {
  decision: DeadlineDecision;
  attemptId: string;
  processing: string;
  application: string;
}

/**
 * 처리 시한을 넘긴 ACTIVE 요청과 반영 실패 요청을 닫는다(#237, 2026-10-06 #23 결정).
 * 실행이 멈췄다는 증거는 요구하지 않는다. 요청 하나마다 한 트랜잭션에서 E 공통 순서(요청 → 시도)로
 * 잠그고 상태를 다시 확인한 뒤 바꾸므로, 결과 수신·반영과 겹쳐도 먼저 잠근 쪽 하나만 남는다.
 * 다른 작업이 잠근 요청은 기다리지 않고 건너뛰어, 한 요청 때문에 판정 전체와 서버 종료가 멈추지 않게 한다.
 */
export class AnalysisDeadlineService {
  constructor(private readonly dataSource: DataSource, private readonly log: AnalysisDeadlineLog,
    private readonly clock: () => Date = () => new Date()) {}

  /** 판정 한 번. 요청 하나의 실패는 기록하고 다음 요청으로 넘어간다. */
  async closeOverdue(): Promise<{ closed: number; failed: number }> {
    const now = this.clock();
    const cutoff = new Date(now.getTime() - ANALYSIS_PROCESSING_DEADLINE_MS);
    // 잠그지 않고 닫을 수 있는 상태의 후보만 고른다. 닫을 수 없는 행이 쌓여도 다른 요청이 밀리지 않는다.
    // 실제 판단은 closeOne이 잠근 뒤 decideDeadline으로 다시 한다.
    const candidates: { requestId: string }[] = await this.dataSource.query(`
      SELECT r.request_id AS "requestId"
        FROM analysis_request r
        JOIN analysis_attempt a ON a.attempt_id = r.current_attempt_id AND a.request_id = r.request_id
       WHERE r.lifecycle = 'ACTIVE'
         AND (a.application = 'APPLY_FAILED'
           OR (r.submitted_at <= $1
             AND (a.application = 'PENDING' OR (a.application = 'NOT_READY' AND a.processing = ANY($2)))))
       ORDER BY r.submitted_at, r.request_id
       LIMIT $3`, [cutoff, [...IN_PROGRESS], BATCH_SIZE]);
    let closed = 0;
    let failed = 0;
    for (const { requestId } of candidates) {
      let outcome: CloseOutcome | null;
      try {
        outcome = await this.closeOne(requestId, now);
      } catch (error) {
        failed += 1;
        this.log.failed(requestId, errorName(error));
        continue;
      }
      // 기록은 커밋 뒤에 남긴다.
      if (outcome?.decision === 'UNEXPECTED') {
        this.log.unexpected(requestId, outcome.processing, outcome.application);
      } else if (outcome && outcome.decision !== 'NONE') {
        closed += 1;
        this.log.closed(requestId, outcome.attemptId, outcome.decision);
      }
    }
    return { closed, failed };
  }

  private closeOne(requestId: string, now: Date): Promise<CloseOutcome | null> {
    return this.dataSource.transaction('READ COMMITTED', async manager => {
      // 멱등 소유 확인의 KEY SHARE와는 겹치지 않고 수신·반영의 잠금과는 직렬화되는 잠금이다.
      // 수신·반영이 잡고 있는 요청은 건너뛰고(결과 null) 다음 판정에서 바뀐 상태로 다시 본다.
      const request = await manager.findOne(AnalysisRequest, {
        where: { requestId }, lock: { mode: 'for_no_key_update', onLocked: 'skip_locked' },
      });
      if (!request || request.lifecycle !== 'ACTIVE') return null;
      // 시도를 잠그는 모든 경로는 요청을 먼저 잠그므로, 요청을 잡은 뒤의 시도 잠금은 기다려도 된다.
      const attempt = await manager.findOne(AnalysisAttempt, {
        where: { attemptId: request.currentAttemptId, requestId }, lock: { mode: 'for_no_key_update' },
      });
      if (!attempt) throw new Error('Analysis attempt is missing');
      const decision = decideDeadline(request, attempt, now);
      const outcome: CloseOutcome = {
        decision, attemptId: attempt.attemptId, processing: attempt.processing, application: attempt.application,
      };
      if (decision === 'NONE' || decision === 'UNEXPECTED') return outcome;
      if (decision === 'PROCESSING_DEADLINE') {
        await manager.update(AnalysisAttempt, { attemptId: attempt.attemptId }, {
          processing: 'FAILED', application: 'APPLIED', ownerResultsReady: false,
          failures: [...attempt.failures, PROCESSING_DEADLINE_FAILURE], failureConfirmationReference: DEADLINE_CODE,
        });
      } else if (decision === 'APPLICATION_DEADLINE') {
        await manager.update(AnalysisAttempt, { attemptId: attempt.attemptId }, {
          application: 'APPLY_FAILED', ownerResultsReady: false,
          failures: [...attempt.failures, APPLICATION_DEADLINE_FAILURE],
        });
      }
      await manager.update(AnalysisRequest, { requestId }, { lifecycle: 'CLOSED', updatedAt: now });
      return outcome;
    });
  }
}

/** 원인이 다른 실패를 구분하되 SQL·입력값이 섞일 수 있는 원문 메시지는 남기지 않는다. */
function errorName(error: unknown): string {
  if (error instanceof QueryFailedError) {
    const code = (error.driverError as { code?: unknown } | undefined)?.code;
    return typeof code === 'string' ? `${error.name}:${code}` : error.name;
  }
  return error instanceof Error ? error.name : 'UnknownError';
}

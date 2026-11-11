import { Logger } from '@nestjs/common';
import type { RequirementFailure } from './jd-summary-result.entity';
import type { RunFailure } from './jd-summary-run.entity';

export interface JdLogEvent {
  stage: 'accepted' | 'enqueue' | 'processing' | 'requirement-finished' | 'completed' | 'failed'
    | 'deadline-finalized' | 'result-discarded' | 'persistence-failed';
  outcome: 'PENDING' | 'DONE' | 'FAILED' | 'ENQUEUED' | 'ENQUEUE_FAILED' | 'DISCARDED';
  runId: string;
  requirementIndex?: number;
  failureCode?: RequirementFailure | RunFailure;
  durationMs?: number;
  droppedCount?: number;
  resultKind?: 'CONTENT' | 'EMPTY';
  reason?: 'SAVE_CONDITION_NOT_MET' | 'PERSISTENCE_FAILED';
}
export type JdLogger = (event: JdLogEvent) => void;
export const createJdLogger = (): JdLogger => {
  const logger = new Logger('JdSummary');
  return (event) => logger.log(event);
};
/** 명시된 필드만 복사한다. 제공자 오류나 요청 원문은 이 경계를 넘기지 않는다. */
export function writeJdLog(logger: JdLogger, event: JdLogEvent): void {
  logger({ stage: event.stage, outcome: event.outcome, runId: event.runId,
    ...(event.requirementIndex === undefined ? {} : { requirementIndex: event.requirementIndex }),
    ...(event.failureCode === undefined ? {} : { failureCode: event.failureCode }),
    ...(event.durationMs === undefined ? {} : { durationMs: event.durationMs }),
    ...(event.droppedCount === undefined ? {} : { droppedCount: event.droppedCount }),
    ...(event.resultKind === undefined ? {} : { resultKind: event.resultKind }),
    ...(event.reason === undefined ? {} : { reason: event.reason }) });
}

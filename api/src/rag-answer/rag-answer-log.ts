// U5 로그 사건(비기능 설계 observability-design 표, NFR6.1·NFR6.2·NFR6.4, 기능 설계 BR1.4).
// 사건마다 표의 칸만 가진 타입으로 만들어 질문·앞 대화·답·근거 글·링크 토큰이 들어갈 자리를 두지 않는다.
import { Logger } from '@nestjs/common';

/** Nest Logger와 같은 모양. 시험은 기록용 logger를 넘긴다. */
export interface RagAnswerLogger {
  log(message: unknown): void;
  warn(message: unknown): void;
  error(message: unknown): void;
}

export type QnaStage = 'REWRITE' | 'SEARCH' | 'GENERATE';

export type QnaOutcome = 'OK' | 'REWRITE_FAILED' | 'SEARCH_FAILED' | 'INDEX_NOT_READY' | 'GENERATION_FAILED' | 'CLIENT_CLOSED';

export type QnaRejectOutcome =
  | 'VALIDATION_FAILED' | 'LINK_UNAVAILABLE' | 'LINK_PASSWORD_REQUIRED' | 'INDEX_NOT_READY' | 'QUESTION_LIMIT_REACHED';

export type CountBypassReason = 'NO_REDIS' | 'REDIS_ERROR' | 'REDIS_TIMEOUT';

export type BaseSummaryOutcome = 'DONE' | 'FAILED' | 'DISCARDED' | 'SKIPPED';

/** 질문 하나의 끝(성공·실패 모두). 버린 항목 수는 generateStream이 돌려주지 않아 게이트 로그(ai_gate_result)에서 본다(R-03). */
export interface QnaCompleted {
  event: 'qna.completed';
  publicationId: string;
  stage: QnaStage;
  outcome: QnaOutcome;
  /** 실패를 낸 오류의 이름(예: AiProviderError). 성공·연결 끊김은 null. 메시지는 남기지 않는다. */
  failure: string | null;
  rewritten: boolean;
  rewriteMs: number | null;
  rewriteInputTokens: number | null;
  rewriteOutputTokens: number | null;
  searchMs: number | null;
  chunkCount: number | null;
  generateMs: number | null;
  /** U5가 직접 센 보낸 항목 수. */
  itemCount: number;
}

/** 스트림을 열기 전 거부. publicationId는 링크 판정을 통과한 뒤에만 있다. */
export interface QnaRejected {
  event: 'qna.rejected';
  outcome: QnaRejectOutcome;
  publicationId: string | null;
}

export interface QnaCountBypassed {
  event: 'qna.count-bypassed';
  publicationId: string;
  reason: CountBypassReason;
}

/** SSE 머리를 보낸 뒤 질의응답 처리에서 예상 밖 예외가 났다(수정 요청 R-03). 오류 이름만 남기고 메시지는 남기지 않는다. */
export interface QnaStreamFailed {
  event: 'qna.stream-failed';
  publicationId: string;
  error: string;
}

/** 질문 횟수 전용 Redis 연결의 error 사건(performance-design NFR4.4). 오류 이름만 남긴다. */
export interface QnaCounterConnectionError {
  event: 'qna.count-connection-error';
  error: string;
}

/** BASE_SUMMARY 처리기 한 번의 끝. ERROR는 DB 오류처럼 처리기가 다시 던지는 경우다(reliability-design NFR5.5). */
export interface BaseSummaryHandled {
  event: 'base-summary.handled';
  publicationId: string;
  outcome: BaseSummaryOutcome | 'ERROR';
  failure: string | null;
  itemCount: number;
  droppedCount: number;
  durationMs: number;
}

export interface BaseSummaryRegenerateAccepted {
  event: 'base-summary.regenerate-accepted';
  publicationId: string;
  enqueue: 'ENQUEUED' | 'ENQUEUE_FAILED';
}

export type RagAnswerLogEntry =
  | QnaCompleted | QnaRejected | QnaStreamFailed | QnaCountBypassed | QnaCounterConnectionError | BaseSummaryHandled
  | BaseSummaryRegenerateAccepted;

export function createRagAnswerLogger(): RagAnswerLogger {
  return new Logger('RagAnswer');
}

/** 사건 하나를 객체 하나로 남긴다. 수준: 실패·통과·등록 실패는 warn, 처리기 오류·스트림 중 예상 밖 예외는 error, 그 밖은 log. */
export function writeRagAnswerLog(logger: RagAnswerLogger, entry: RagAnswerLogEntry): void {
  switch (entry.event) {
    case 'qna.stream-failed':
      logger.error(entry);
      return;
    case 'qna.count-bypassed':
    case 'qna.count-connection-error':
      logger.warn(entry);
      return;
    case 'qna.completed':
      if (entry.outcome === 'OK' || entry.outcome === 'CLIENT_CLOSED') logger.log(entry);
      else logger.warn(entry);
      return;
    case 'base-summary.handled':
      if (entry.outcome === 'ERROR') logger.error(entry);
      else if (entry.outcome === 'FAILED') logger.warn(entry);
      else logger.log(entry);
      return;
    case 'base-summary.regenerate-accepted':
      if (entry.enqueue === 'ENQUEUE_FAILED') logger.warn(entry);
      else logger.log(entry);
      return;
    default:
      logger.log(entry);
  }
}

/** 처리 시간(ms, 정수). */
export function elapsedMs(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}

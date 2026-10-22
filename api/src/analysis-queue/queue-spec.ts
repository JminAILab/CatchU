/**
 * worker와 함께 정한 큐 규격(worker/docs/queue-consumer.md 「큐 규격 (#233과 공동)」).
 * 이름·작업 ID·옵션은 worker가 같은 값을 전제하므로 한쪽만 바꾸지 않는다.
 */
export const ANALYSIS_REQUEST_QUEUE = 'analysis-requests';
export const WORKER_MESSAGE_QUEUE = 'worker-messages';
export const REQUEST_JOB_NAME = 'Request';
export const WORKER_JOB_NAMES: readonly string[] = ['ProcessingEvent', 'Result'];

/** 요청 작업 보관(초). 처리 시한 60분보다 길어, 그동안 같은 시도를 다시 넣어도 같은 작업 ID라 무시된다. */
export const REQUEST_JOB_RETENTION_SECONDS = 2 * 60 * 60;

/**
 * 요청 작업 옵션. 작업 ID = 시도 ID, 재시도·backoff 없음(#77 「결론」 조건 2, 10/6 결정: 재전달로 복구하지 않음).
 * BullMQ에 넘긴 객체를 다시 쓰지 않게 부를 때마다 새로 만든다.
 */
export function requestJobOptions(attemptId: string) {
  return {
    jobId: attemptId,
    attempts: 1,
    removeOnComplete: { age: REQUEST_JOB_RETENTION_SECONDS },
    removeOnFail: { age: REQUEST_JOB_RETENTION_SECONDS },
    stackTraceLimit: 0,
  };
}

/**
 * 진행 알림·결과 소비자 설정. 동시 1, 정체 복구 0회(잠금을 잃은 작업을 다시 처리하지 않는다).
 * 보관값은 worker가 작업마다 넣은 값(진행 알림 즉시 삭제, 결과 30분)을 따르므로 Worker에 주지 않는다.
 */
export const CONSUMER_OPTIONS = Object.freeze({
  concurrency: 1,
  lockDuration: 30_000,
  stalledInterval: 30_000,
  maxStalledCount: 0,
});

/** 보내기 주기: 이전 보내기가 끝난 뒤 이만큼 기다렸다 다음 보내기(PeriodicTask). */
export const DISPATCH_INTERVAL_MS = 5_000;
/** 한 번의 보내기에서 읽는 대기 시도 수. 남은 시도는 다음 회차가 요청 ID 순서로 이어서 읽는다. */
export const DISPATCH_BATCH_SIZE = 100;

/** 큐 명령 하나를 기다리는 상한. 넘으면 명령을 취소하지 않고 결과를 모르는 것으로 다룬다. */
export const QUEUE_COMMAND_TIMEOUT_MS = 5_000;
// 멈출 때의 대기 상한. 보내기 6초 + 받기 15초 + 요청 큐·연결 닫기 각 2초로 정지 유예 30초 안에 든다.
/** 진행 중인 보내기를 기다리는 상한. 멈춤 표시 뒤에는 새 명령을 보내지 않으므로 명령 하나(5초)와 여유다. DB 조회가 멎어도 이만큼만 기다린다. */
export const DISPATCH_STOP_TIMEOUT_MS = QUEUE_COMMAND_TIMEOUT_MS + 1_000;
/** 처리 중인 알림·결과 작업을 기다리는 상한. 기다리기를 그만둘 뿐 처리를 취소하지는 않는다. */
export const CONSUMER_CLOSE_TIMEOUT_MS = 15_000;
/** 요청 큐 닫기와 연결 하나를 정상 종료(QUIT)로 닫기를 기다리는 상한. 넘으면 끊는다. */
export const CONNECTION_QUIT_TIMEOUT_MS = 2_000;
/**
 * 받기가 예상 밖으로 멈춘 뒤 앱 닫기를 기다리는 상한. 넘으면 기다리지 않고 종료 코드 1로 끝낸다.
 * 다른 종료 훅(처리 시한 판정의 DB 조회 등)이 끝나지 않아도 HTTP 서버가 열린 채 남지 않게 한다.
 */
export const FAILURE_APP_CLOSE_TIMEOUT_MS = 10_000;

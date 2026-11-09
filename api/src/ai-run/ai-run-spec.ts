// AiRun 큐 규격과 순수 판정 함수(계약 C-02, U2 기능 설계 BR5.1~BR5.5, 비기능 NFR4.4·NFR4.8·NFR4.9·NFR5.3·NFR6.2).
// 값은 이 파일 한곳에 둔다. 10월 분석 큐 규칙(src/analysis-queue/queue-spec.ts)과 같은 방식이다.

export const AI_RUN_QUEUE = 'ai-run';

export const AI_RUN_KINDS = ['EMBED_PUBLICATION', 'BASE_SUMMARY', 'JD_SUMMARY'] as const;
export type AiRunKind = (typeof AI_RUN_KINDS)[number];

/**
 * 완료·실패 작업 보관(초). 보관 동안 같은 runKey 등록은 BullMQ가 무시한다(NFR4.9).
 * 어느 Unit이 처리 시한을 2시간보다 길게 정하면 이 값을 그 시한 이상으로 함께 올린다(api/docs/ai-run.md).
 */
export const AI_RUN_JOB_RETENTION_SECONDS = 7200;

/** 큐에 넣기 명령 하나를 기다리는 상한. 넘으면 ENQUEUE_FAILED로 본다(10월 큐 명령 상한과 같은 값). */
export const AI_RUN_ENQUEUE_TIMEOUT_MS = 5_000;

/** 앱 종료 때 처리 중인 작업을 기다리는 상한. 넘으면 기다리지 않고 연결을 닫는다(작업은 시한으로 FAILED). */
export const AI_RUN_CLOSE_TIMEOUT_MS = 15_000;

/** 작업 하나 = 시도 한 번. 재시도·backoff 없음(BR5.2, NFR6.2). BullMQ에 넘긴 객체를 다시 쓰지 않게 부를 때마다 만든다. */
export function aiRunJobOptions(runKey: string) {
  return {
    jobId: runKey,
    attempts: 1,
    removeOnComplete: { age: AI_RUN_JOB_RETENTION_SECONDS },
    removeOnFail: { age: AI_RUN_JOB_RETENTION_SECONDS },
    stackTraceLimit: 0,
  };
}

/** api마다 동시 1, 정체된 작업을 다시 처리하지 않음(NFR4.4·NFR6.2). */
export const AI_RUN_WORKER_OPTIONS = Object.freeze({
  concurrency: 1,
  maxStalledCount: 0,
  lockDuration: 30_000,
  stalledInterval: 30_000,
});

/** runKey는 비지 않고 콜론이 없어야 한다(BullMQ 작업 ID 제약, BR5.3). 길이·공백도 막아 키가 로그를 흐리지 않게 한다. */
export function isValidRunKey(runKey: unknown): runKey is string {
  return typeof runKey === 'string' && /^[A-Za-z0-9_.-]{1,128}$/.test(runKey);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** payload는 종류별 ID 하나뿐이다(C-02 payload, NFR5.3). 처리기는 DB에서 다시 읽는다. */
const PAYLOAD_KEY: Record<AiRunKind, 'publicationId' | 'runId'> = {
  EMBED_PUBLICATION: 'publicationId',
  BASE_SUMMARY: 'publicationId',
  JD_SUMMARY: 'runId',
};

export function isValidPayload(kind: AiRunKind, payload: unknown): payload is Record<string, string> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  const keys = Object.keys(payload);
  const key = PAYLOAD_KEY[kind];
  return keys.length === 1 && keys[0] === key && typeof (payload as Record<string, unknown>)[key] === 'string'
    && UUID.test((payload as Record<string, string>)[key]);
}

export const isAiRunKind = (value: unknown): value is AiRunKind => AI_RUN_KINDS.includes(value as AiRunKind);

export type RunStatus = 'PENDING' | 'DONE' | 'FAILED';

/** 실행 상태를 가진 행의 두 칸(C-02 table-convention). */
export interface RunStatusRow {
  status: RunStatus;
  deadlineAt: Date;
}

/** 판정만 하는 순수 함수. PENDING이고 now >= deadlineAt이면 FAILED(BR5.4). */
export function readStatus(row: RunStatusRow, now: Date): RunStatus {
  if (row.status === 'PENDING' && now.getTime() >= row.deadlineAt.getTime()) return 'FAILED';
  return row.status;
}

/** 로그에 남길 오류 이름. 오류 객체·메시지는 남기지 않는다(관측 설계 NFR6.9). */
export function errorName(error: unknown): string {
  const name = error instanceof Error ? error.name : typeof error;
  return /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name) ? name : 'Error';
}

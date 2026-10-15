import { ReceiverStorageError } from '../analysis-receiver/analysis-receiver.service';
import { AnalysisRegistrationService } from '../analysis-receiver/analysis-registration.service';
import { ProgressDecision, ResultReceipt } from '../analysis-receiver/receiver.types';
import { WORKER_JOB_NAMES } from './queue-spec';

export type ConsumerFailureCode = 'UNKNOWN_JOB_NAME' | 'JOB_ID_MISMATCH' | 'RECEIVER_STORAGE_UNAVAILABLE' |
  'PROGRESS_HANDLING_FAILED' | 'RESULT_HANDLING_FAILED';

/**
 * 처리 함수가 작업을 실패로 끝낼 때 던지는 오류. BullMQ는 message를 실패 사유로, stack을 stacktrace로 저장하므로
 * 둘 다 고정 코드만 담는다(원인 오류·메시지 본문·호출 위치를 싣지 않는다).
 */
export class AnalysisQueueError extends Error {
  constructor(readonly code: ConsumerFailureCode) {
    super(code);
    this.name = 'AnalysisQueueError';
    // 작업에 stackTraceLimit: 0이 빠져도 호출 위치가 저장되지 않게 한다.
    this.stack = `${this.name}: ${code}`;
  }
}

export interface WorkerMessageJob {
  name: string;
  id?: string;
  data: unknown;
}

/** 받기 기록. 작업 ID는 worker 형식일 때만 받는다(밖에서 온 값이라 그대로 남기지 않는다). */
export interface ConsumerLog {
  progress(jobId: string | null, decision: ProgressDecision): void;
  /** 수신 확인의 종류·코드. null은 E가 식별할 수 없다고 판정한 결과다. */
  result(jobId: string | null, receipt: ResultReceipt | null): void;
  /** 수신은 커밋됐지만 반영(Catch 등록)이 실패했다. 사유는 반영 서비스가 따로 남긴다. */
  applicationFailed(jobId: string | null): void;
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
// worker/docs/queue-consumer.md 「큐 규격」의 진행 알림 ID·결과 메시지 ID.
const WORKER_JOB_ID = new RegExp(`^(?:event-(?:mock|live)-${UUID}-(?:received|running|uncertain)|message-(?:mock|live)-${UUID}-result)$`);

/** 기록에 남겨도 되는 작업 ID. worker 형식이 아니면 null. */
export function loggableJobId(id: unknown): string | null {
  return typeof id === 'string' && WORKER_JOB_ID.test(id) ? id : null;
}

/** 기록에 남겨도 되는 작업 이름. 허용 목록 밖이면 UNKNOWN. */
export function loggableJobName(name: unknown): string {
  return typeof name === 'string' && WORKER_JOB_NAMES.includes(name) ? name : 'UNKNOWN';
}

/**
 * worker-messages 큐의 진행 알림·결과를 기존 E 수신 경로(#105의 수신 뒤 등록 진입점)로 넘긴다(#233).
 * 수신 확인 통로는 결과 작업의 반환값이다(#121). 수신 처리 자체는 바꾸지 않는다.
 *
 * - 결과: 수신 확인이 있으면 그 객체를 돌려줘 작업을 완료로 끝낸다. 수신 커밋 뒤 반영이 실패해도 같다(반영 실패는
 *   DB에 남고 시한 판정이 요청을 닫는다). 식별 불가는 null. 수신 저장이 실패해 수신 확인이 없으면 실패로 끝낸다.
 * - 진행 알림: 판정(관측·변경 없음·거부)과 관계없이 완료. 저장이 실패하면 실패로 끝낸다.
 * - 모르는 작업 이름, 작업 ID와 메시지 ID가 다른 작업은 수신 경로에 넘기지 않고 실패로 끝낸다.
 */
export class WorkerMessageConsumer {
  constructor(
    private readonly registration: Pick<AnalysisRegistrationService, 'receiveResult' | 'receiveProgress'>,
    private readonly log: ConsumerLog,
  ) {}

  async process(job: WorkerMessageJob): Promise<ResultReceipt | null> {
    if (!WORKER_JOB_NAMES.includes(job.name)) throw new AnalysisQueueError('UNKNOWN_JOB_NAME');
    const data = job.data;
    // worker는 작업 ID = 메시지 ID로 넣는다. 다르면 같은 결과가 다른 작업으로 다시 들어온 것일 수 있다.
    if (data !== null && typeof data === 'object' && typeof (data as { messageId?: unknown }).messageId === 'string' &&
        (data as { messageId: string }).messageId !== job.id) throw new AnalysisQueueError('JOB_ID_MISMATCH');
    const jobId = loggableJobId(job.id);
    if (job.name === 'ProcessingEvent') {
      let decision: ProgressDecision;
      try {
        decision = await this.registration.receiveProgress(data);
      } catch (error) {
        throw new AnalysisQueueError(error instanceof ReceiverStorageError ? 'RECEIVER_STORAGE_UNAVAILABLE' : 'PROGRESS_HANDLING_FAILED');
      }
      this.log.progress(jobId, decision);
      return null;
    }
    // 수신 커밋 직후·반영 전에 불린다. 담기만 하므로 실패하지 않는다.
    const acknowledged: { receipt?: ResultReceipt | null } = {};
    let receipt: ResultReceipt | null;
    let applicationFailed = false;
    try {
      ({ receipt } = await this.registration.receiveResult(data, async value => { acknowledged.receipt = value; }));
    } catch (error) {
      if (!('receipt' in acknowledged)) {
        throw new AnalysisQueueError(error instanceof ReceiverStorageError ? 'RECEIVER_STORAGE_UNAVAILABLE' : 'RESULT_HANDLING_FAILED');
      }
      receipt = acknowledged.receipt ?? null;
      applicationFailed = true;
    }
    this.log.result(jobId, receipt);
    if (applicationFailed) this.log.applicationFailed(jobId);
    // 객체 그대로 돌려준다. 문자열로 바꾸면 worker가 수신 확인 형식이 아니라고 판정한다.
    return receipt;
  }
}

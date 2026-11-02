import { createHash, randomUUID } from 'node:crypto';
import {
  Outcome, ProcessingEvent, ProcessingState, ProgressDecision, ReceiptIds,
  ReceiveResult, ReceiverStore, RejectionCode, RejectionLog, RequestContext, Result,
} from './receiver.types';
import { receiptIds, WorkerMessageValidator } from './worker-message.validator';

const TERMINAL: ReadonlySet<ProcessingState> = new Set(['SUCCEEDED', 'EMPTY', 'PARTIAL_FAILED', 'FAILED']);
const CONTEXT_FIELDS: readonly (keyof RequestContext)[] = [
  'requestId', 'memberId', 'repositoryId', 'consentId', 'scopeRevision', 'sourceMode',
];

// 객체 키 순서/전송 messageId만 다른 재전달은 같은 의미다. 배열 순서는 보존한다.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function resultFingerprint(result: Result): string {
  const payload: Partial<Result> = { ...result };
  delete payload.messageId;
  return createHash('sha256').update(canonical(payload)).digest('hex');
}

function outcomeFor(result: Result): Outcome {
  if (result.candidates.length === 0) return result.failures.length === 0 ? 'EMPTY' : 'FAILED';
  return result.failures.length === 0 ? 'SUCCEEDED' : 'PARTIAL_FAILED';
}

export class ReceiverStorageError extends Error {
  constructor() { super('Analysis receiver storage unavailable'); }
}

export class AnalysisReceiver {
  constructor(
    private readonly store: ReceiverStore,
    private readonly validator: WorkerMessageValidator,
    private readonly log: RejectionLog,
  ) {}

  async receiveResult(input: unknown): Promise<ReceiveResult> {
    const ids = receiptIds(input);
    if (!ids) {
      this.log.record('Result', 'UNIDENTIFIABLE');
      return { receipt: null };
    }
    if (!this.validator.result(input) || input.outcome !== outcomeFor(input)) {
      return this.reject(ids, 'SCHEMA_INVALID');
    }
    // 첫 await 전에 복제하여 호출부 변경이 검증/지문/저장 사이에 끼어들지 않게 한다.
    const result: Result = structuredClone(input);
    const fingerprint = resultFingerprint(result);
    try {
      return await this.store.withRequest(result.requestId, async (tx) => {
        const state = tx.snapshot;
        if (!state || CONTEXT_FIELDS.some((key) => state.context[key] !== result[key])) {
          return this.reject(ids, 'CONTEXT_MISMATCH');
        }
        if (state.context.attemptId !== result.attemptId) return this.reject(ids, 'STALE_ATTEMPT');
        if (state.received) {
          if (state.received.resultId !== result.resultId || state.received.payloadFingerprint !== fingerprint) {
            return this.reject(ids, 'PAYLOAD_CONFLICT');
          }
          return { receipt: { ...ids, schemaVersion: '2', messageId: randomUUID(), disposition: 'DUPLICATE', code: 'ALREADY_RECEIVED' } };
        }
        // 종결 기록 없이 이미 반영 단계인 모순된 저장 상태를 덮어쓰지 않는다.
        if (state.lifecycle === 'CLOSED' || TERMINAL.has(state.processing) || state.application !== 'NOT_READY') {
          return this.reject(ids, 'PAYLOAD_CONFLICT');
        }
        const metadata = {
          ...ids, applicationRecordId: randomUUID(), payloadFingerprint: fingerprint,
          receivedAt: new Date().toISOString(),
        };
        await tx.saveResult(metadata, {
          processing: result.outcome, application: 'PENDING', eligibleCandidateCount: result.candidates.length,
          failures: result.failures, ownCommitObservation: result.ownCommitObservation,
          observedOwnCommitCount: result.observedOwnCommitCount, collectionLimitNotes: result.collectionLimitNotes,
        });
        return {
          receipt: { ...ids, schemaVersion: '2', messageId: randomUUID(), disposition: 'ACCEPTED', code: 'OK' },
          accepted: { result, metadata },
        };
      });
    } catch {
      this.log.record('Result', 'STORAGE_UNAVAILABLE');
      // Receipt가 호출부에 노출되는 시점은 저장소 커밋 이후다. 원문 DB 오류도 노출하지 않는다.
      throw new ReceiverStorageError();
    }
  }

  async receiveProgress(input: unknown): Promise<ProgressDecision> {
    if (!this.validator.progress(input)) return this.rejectProgress('SCHEMA_INVALID');
    const event: ProcessingEvent = structuredClone(input);
    try {
      return await this.store.withRequest(event.requestId, async (tx) => {
        const state = tx.snapshot;
        if (!state || state.context.requestId !== event.requestId) return this.rejectProgress('CONTEXT_MISMATCH');
        if (state.context.attemptId !== event.attemptId) return this.rejectProgress('STALE_ATTEMPT');
        if (state.lifecycle === 'CLOSED' || TERMINAL.has(state.processing)) return 'TERMINAL_UNCHANGED';
        // 확정 전이는 QUEUED → RUNNING/UNCERTAIN뿐이다. 이후 관측은 상태를 추측하지 않는다.
        const next = state.processing === 'QUEUED' && event.state !== 'RECEIVED' ? event.state : state.processing;
        await tx.saveObservation(event, next);
        return 'OBSERVED';
      });
    } catch {
      this.log.record('ProcessingEvent', 'STORAGE_UNAVAILABLE');
      throw new ReceiverStorageError();
    }
  }

  private reject(ids: ReceiptIds, code: RejectionCode): ReceiveResult {
    this.log.record('Result', code);
    return { receipt: { ...ids, schemaVersion: '2', messageId: randomUUID(), disposition: 'REJECTED', code } };
  }

  private rejectProgress(code: RejectionCode): ProgressDecision {
    this.log.record('ProcessingEvent', code);
    return code;
  }
}

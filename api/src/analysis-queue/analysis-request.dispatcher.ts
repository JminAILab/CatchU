import { DataSource, QueryFailedError } from 'typeorm';
import { ANALYSIS_PROCESSING_DEADLINE_MS } from '../analysis-deadline/analysis-deadline.service';
import { WorkerMessageValidator } from '../analysis-receiver/worker-message.validator';
import { DISPATCH_BATCH_SIZE, QUEUE_COMMAND_TIMEOUT_MS, REQUEST_JOB_NAME, requestJobOptions } from './queue-spec';

/** 큐에 넣을 대기 시도. 값은 모두 DB 접수 기록(요청·현재 시도·동의)이다. */
export interface PendingAttempt {
  requestId: string;
  memberId: string;
  repositoryId: string;
  submittedAt: Date;
  attemptId: string;
  sourceMode: 'MOCK' | 'LIVE';
  consentId: string;
  noticeRevision: string;
  scopeRevision: string;
  consentedScope: unknown;
  consentedAt: Date;
}

/** 계약 v1 Request(worker-messages.yaml). */
export interface AnalysisRequestMessage {
  schemaVersion: '1';
  messageId: string;
  requestId: string;
  attemptId: string;
  memberId: string;
  repositoryId: string;
  consentId: string;
  noticeRevision: string;
  consentedAt: string;
  allowedScope: { revision: string; repositoryId: string; allowedResourceTypes: string[]; selectionReference: string };
  credentialContextReference: string;
  sourceMode: 'MOCK' | 'LIVE';
  requestedAt: string;
}

export type RequestSkipCode = 'CONSENT_SCOPE_INVALID' | 'CONSENT_SCOPE_MISMATCH' | 'REQUEST_SCHEMA_INVALID';

const SCOPE_KEYS = ['allowedResourceTypes', 'repositoryId', 'revision', 'selectionReference'];

/**
 * 넣기 전 검사와 메시지 조립. 동의 범위 모양 → 저장소 ID·판본 대조 → 조립 → 계약 스키마 순서다.
 * 두 참조(선정·자격정보 맥락)에는 시도 ID를 넣는다(#232와 정한 접점). DB의 동의 범위는 바꾸지 않고 보내는 사본만 만든다.
 */
export function buildRequestMessage(attempt: PendingAttempt, validator: Pick<WorkerMessageValidator, 'request'>):
  { message: AnalysisRequestMessage } | { skip: RequestSkipCode } {
  const scope = attempt.consentedScope;
  // DB는 동의 범위가 JSON 객체라는 것만 보장한다.
  if (scope === null || typeof scope !== 'object' || Array.isArray(scope)) return { skip: 'CONSENT_SCOPE_INVALID' };
  const fields = scope as Record<string, unknown>;
  const keys = Object.keys(fields).sort();
  if (keys.length !== SCOPE_KEYS.length || keys.some((key, index) => key !== SCOPE_KEYS[index]) ||
      !Array.isArray(fields.allowedResourceTypes)) return { skip: 'CONSENT_SCOPE_INVALID' };
  // worker는 범위의 저장소 ID가 요청과 다르면 알림 없이 거부하고, E는 판본이 다르면 결과를 CONTEXT_MISMATCH로 거부한다.
  if (fields.repositoryId !== attempt.repositoryId || fields.revision !== attempt.scopeRevision) {
    return { skip: 'CONSENT_SCOPE_MISMATCH' };
  }
  const message: AnalysisRequestMessage = {
    schemaVersion: '1',
    // worker 합성 요청(worker/app/processing/synthetic.py)과 같은 규칙이다.
    messageId: `request-${attempt.attemptId}`,
    requestId: attempt.requestId,
    attemptId: attempt.attemptId,
    memberId: attempt.memberId,
    repositoryId: attempt.repositoryId,
    consentId: attempt.consentId,
    noticeRevision: attempt.noticeRevision,
    consentedAt: attempt.consentedAt.toISOString(),
    allowedScope: {
      revision: attempt.scopeRevision,
      repositoryId: attempt.repositoryId,
      allowedResourceTypes: [...fields.allowedResourceTypes as string[]],
      selectionReference: attempt.attemptId,
    },
    credentialContextReference: attempt.attemptId,
    sourceMode: attempt.sourceMode,
    requestedAt: attempt.submittedAt.toISOString(),
  };
  if (!validator.request(message)) return { skip: 'REQUEST_SCHEMA_INVALID' };
  return { message };
}

/** 보내기가 쓰는 요청 큐. 운영은 BullMQ Queue를 감싼다(analysis-queue.module.ts). */
export interface RequestQueue {
  /** 연결이 준비됐는지. 준비 전이면 명령을 보내지 않고 그 회차를 건너뛴다. */
  ready(): boolean;
  /** 대기·처리 중이거나 완료·실패로 보관 중인 작업이 있으면 그 작업, 없으면 undefined. */
  getJob(jobId: string): Promise<unknown>;
  add(name: string, data: AnalysisRequestMessage, options: ReturnType<typeof requestJobOptions>): Promise<unknown>;
}

export type DispatchPauseReason = 'QUEUE_NOT_READY' | 'QUEUE_COMMAND_TIMEOUT' | 'QUEUE_COMMAND_FAILED' | 'QUEUE_COMMAND_PENDING';

export interface DispatchLog {
  /** 큐에 넣었다는 기록. 분석이 끝났다는 뜻이 아니다. */
  enqueued(requestId: string, attemptId: string): void;
  /** 넣기 전 검사에서 어긋나 보내지 않음. 같은 시도는 한 번만 남긴다. */
  skipped(requestId: string, attemptId: string, code: RequestSkipCode): void;
  /** 큐를 쓸 수 없어 회차를 멈춤. 이유가 바뀔 때만 남긴다. */
  paused(reason: DispatchPauseReason, errorName?: string): void;
  /** 멈춘 뒤 처음으로 한 회차를 끝까지 함. */
  resumed(): void;
}

export interface DispatchSummary {
  read: number;
  enqueued: number;
  existing: number;
  skipped: number;
  paused: DispatchPauseReason | null;
}

class QueueCommandTimeout extends Error {
  constructor() { super('Queue command timed out'); this.name = 'QueueCommandTimeout'; }
}

/**
 * 대기(QUEUED) 시도를 찾아 요청 큐에 넣는다(#233). DB를 잠그지 않고 쓰지도 않는다(10/15 팀장 결정).
 * 읽은 직후 처리 시한 닫기와 겹쳐 요청이 닫혀도, 늦은 진행 알림·결과는 E 수신이 거부한다.
 * 영속 발행 기록·재발행 횟수는 두지 않는다(10/6 결정). 같은 시도를 다시 넣어도 작업 ID가 같아 큐가 무시한다.
 */
export class AnalysisRequestDispatcher {
  /** 요청 ID 순서로 읽은 마지막 위치. 메모리에만 두고, 한 바퀴를 다 읽으면 처음으로 돌아간다. */
  private cursor: string | null = null;
  private running: Promise<DispatchSummary> | null = null;
  /** 상한을 넘겨 기다리기를 그만뒀지만 아직 끝나지 않은 큐 명령 수. */
  private unsettled = 0;
  private pausedReason: DispatchPauseReason | null = null;
  /** 검사에서 어긋나 기록한 시도(시도 ID → 접수 시각 ms). 처리 시한이 지나면 지운다. */
  private readonly skippedAttempts = new Map<string, number>();
  private stopping = false;

  constructor(
    private readonly dataSource: DataSource,
    private readonly queue: RequestQueue,
    private readonly validator: Pick<WorkerMessageValidator, 'request'>,
    private readonly log: DispatchLog,
    private readonly clock: () => Date = () => new Date(),
    private readonly commandTimeoutMs = QUEUE_COMMAND_TIMEOUT_MS,
  ) {}

  /** 보내기 한 번. 진행 중인 보내기가 있으면 그 실행을 함께 기다린다(겹치지 않는다). */
  dispatchOnce(): Promise<DispatchSummary> {
    this.running ??= this.runOnce().finally(() => { this.running = null; });
    return this.running;
  }

  /** 멈춤 표시 뒤 진행 중인 보내기를 기다린다. 진행 중인 회차는 지금 다루는 시도까지만 하고 끝난다. */
  async stop(): Promise<void> {
    this.stopping = true;
    await this.running?.catch(() => undefined);
  }

  private async runOnce(): Promise<DispatchSummary> {
    const summary: DispatchSummary = { read: 0, enqueued: 0, existing: 0, skipped: 0, paused: null };
    if (this.stopping) return summary;
    // 상한을 넘긴 명령이 아직 Redis 쪽에 남아 있으면 새 명령을 더 쌓지 않는다.
    if (this.unsettled > 0) return this.pause(summary, 'QUEUE_COMMAND_PENDING');
    if (!this.queue.ready()) return this.pause(summary, 'QUEUE_NOT_READY');
    const cutoff = new Date(this.clock().getTime() - ANALYSIS_PROCESSING_DEADLINE_MS);
    this.forgetSkipped(cutoff);
    const rows = await this.pending(cutoff);
    summary.read = rows.length;
    for (const row of rows) {
      if (this.stopping) return summary;
      const built = buildRequestMessage(row, this.validator);
      if ('skip' in built) {
        summary.skipped += 1;
        this.recordSkip(row, built.skip);
      } else {
        let outcome: 'ENQUEUED' | 'EXISTING' | 'STOPPED';
        try {
          outcome = await this.enqueue(row.attemptId, built.message);
        } catch (error) {
          // 커서를 이 시도 앞에 두어 다음 회차가 여기서 다시 시작한다.
          return error instanceof QueueCommandTimeout
            ? this.pause(summary, 'QUEUE_COMMAND_TIMEOUT')
            : this.pause(summary, 'QUEUE_COMMAND_FAILED', errorName(error));
        }
        if (outcome === 'STOPPED') return summary;
        if (outcome === 'ENQUEUED') {
          summary.enqueued += 1;
          this.log.enqueued(row.requestId, row.attemptId);
        } else summary.existing += 1;
      }
      this.cursor = row.requestId;
    }
    // 앞 시도가 모두 큐에 있거나 어긋나도 뒤 시도가 밀리지 않게 요청 ID 순서로 이어 읽고, 끝에 닿으면 처음으로 돌아간다.
    if (rows.length < DISPATCH_BATCH_SIZE) this.cursor = null;
    if (this.pausedReason) {
      this.pausedReason = null;
      this.log.resumed();
    }
    return summary;
  }

  /**
   * 요청 ACTIVE + 현재 시도 QUEUED·NOT_READY + 처리 시한 안(시한 닫기는 submitted_at <= cutoff를 닫는다).
   * 트랜잭션 밖 한 문장이고 잠그지 않는다. request_state는 ACCEPTED 한 값뿐이라 조건에 넣지 않는다.
   */
  private pending(cutoff: Date): Promise<PendingAttempt[]> {
    return this.dataSource.query(`
      SELECT r.request_id AS "requestId", r.member_id AS "memberId", r.repository_id AS "repositoryId",
             r.submitted_at AS "submittedAt", a.attempt_id AS "attemptId", a.source_mode AS "sourceMode",
             c.consent_id AS "consentId", c.notice_revision AS "noticeRevision", c.scope_revision AS "scopeRevision",
             c.consented_scope AS "consentedScope", c.consented_at AS "consentedAt"
        FROM analysis_request r
        JOIN analysis_attempt a ON a.attempt_id = r.current_attempt_id AND a.request_id = r.request_id
        JOIN analysis_consent c ON c.consent_id = r.consent_id AND c.request_id = r.request_id
       WHERE r.lifecycle = 'ACTIVE' AND a.processing = 'QUEUED' AND a.application = 'NOT_READY'
         AND r.submitted_at > $1 AND ($2::uuid IS NULL OR r.request_id > $2::uuid)
       ORDER BY r.request_id
       LIMIT $3`, [cutoff, this.cursor, DISPATCH_BATCH_SIZE]);
  }

  private async enqueue(attemptId: string, message: AnalysisRequestMessage): Promise<'ENQUEUED' | 'EXISTING' | 'STOPPED'> {
    // 대기·처리 중이거나 완료·실패로 보관 중이면 넣지 않는다. 같은 시도의 넣음 기록이 5초마다 쌓이지 않게 한다.
    if (await this.command(() => this.queue.getJob(attemptId))) return 'EXISTING';
    // 멈춤 표시 뒤에는 새 명령을 보내지 않는다. 진행 중인 보내기가 명령 하나의 상한 안에 끝나게 한다.
    if (this.stopping) return 'STOPPED';
    // 확인과 넣기 사이에 같은 시도가 들어갔으면 BullMQ가 같은 작업 ID를 무시한다(그때 넣음 기록이 두 번 남을 수 있다).
    await this.command(() => this.queue.add(REQUEST_JOB_NAME, message, requestJobOptions(attemptId)));
    return 'ENQUEUED';
  }

  /** 명령 하나를 상한까지만 기다린다. 넘으면 명령은 취소되지 않으므로 실행됐는지 모르는 것으로 다룬다. */
  private async command<T>(run: () => Promise<T>): Promise<T> {
    this.unsettled += 1;
    const pending = Promise.resolve().then(run).finally(() => { this.unsettled -= 1; });
    // 상한 뒤에 늦게 실패해도 처리되지 않은 거부로 남지 않게 한다.
    pending.catch(() => undefined);
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([pending, new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new QueueCommandTimeout()), this.commandTimeoutMs);
        timer.unref();
      })]);
    } finally {
      clearTimeout(timer);
    }
  }

  private pause(summary: DispatchSummary, reason: DispatchPauseReason, error?: string): DispatchSummary {
    summary.paused = reason;
    if (this.pausedReason !== reason) {
      this.pausedReason = reason;
      this.log.paused(reason, error);
    }
    return summary;
  }

  private recordSkip(row: PendingAttempt, code: RequestSkipCode): void {
    if (this.skippedAttempts.has(row.attemptId)) return;
    this.skippedAttempts.set(row.attemptId, row.submittedAt.getTime());
    this.log.skipped(row.requestId, row.attemptId, code);
  }

  private forgetSkipped(cutoff: Date): void {
    for (const [attemptId, submittedAt] of this.skippedAttempts) {
      if (submittedAt <= cutoff.getTime()) this.skippedAttempts.delete(attemptId);
    }
  }
}

/** Redis·DB 오류의 원문(주소·명령 인자·SQL이 섞일 수 있음) 대신 이름과 고정 형식의 코드만 남긴다. */
export function errorName(error: unknown): string {
  if (!(error instanceof Error)) return 'UnknownError';
  const source = error instanceof QueryFailedError ? error.driverError as { code?: unknown } | undefined : error as { code?: unknown };
  const code = source?.code;
  return typeof code === 'string' && /^[A-Z0-9_]{1,40}$/.test(code) ? `${error.name}:${code}` : error.name;
}

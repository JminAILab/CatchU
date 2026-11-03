// 백그라운드 실행 AiRun(계약 C-02, U2 기능 설계 W5·BR5.1~BR5.3·BR5.6, 비기능 NFR4.4·NFR4.8·NFR6.1~6.3·NFR6.6).
// 큐는 10월과 같은 Redis(CATCHU_QUEUE_REDIS_URL·CATCHU_QUEUE_PREFIX)의 `ai-run` 하나다. 큐 주소가 없으면 연결하지 않고,
// 등록은 ENQUEUE_FAILED로 끝나 상태는 처리 시한으로 FAILED가 된다(새 환경변수를 두지 않는다).
import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { watchRedisErrors } from '../common/redis-connection-errors';
import {
  AI_RUN_CLOSE_TIMEOUT_MS, AI_RUN_ENQUEUE_TIMEOUT_MS, AI_RUN_QUEUE, AI_RUN_WORKER_OPTIONS, aiRunJobOptions, type AiRunKind,
  errorName, isAiRunKind, isValidPayload, isValidRunKey,
} from './ai-run-spec';

export const AI_RUN_CONFIG = Symbol('AI_RUN_CONFIG');

/** 큐 주소는 비밀번호가 들어 있을 수 있어 로그·오류에 내지 않는다. */
export interface AiRunConfig {
  readonly redisUrl: string;
  readonly prefix: string;
}

export interface AiRunJob {
  runKey: string;
  payload: Record<string, string>;
}

export type AiRunHandler = (job: AiRunJob) => Promise<void>;

export type EnqueueResult = 'ENQUEUED' | 'ENQUEUE_FAILED';

/** 등록되지 않은 종류의 작업. 처리하지 않고 실패로 끝낸다(BR5.1). */
class UnknownAiRunKind extends Error {
  override readonly name = 'UnknownAiRunKind';
}

@Injectable()
export class AiRun implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('AiRun');
  private readonly handlers = new Map<AiRunKind, AiRunHandler>();
  private queueConnection: IORedis | null = null;
  private queue: Queue | null = null;
  private workerConnection: IORedis | null = null;
  private worker: Worker | null = null;
  private closing: Promise<void> | null = null;

  constructor(@Inject(AI_RUN_CONFIG) private readonly config: AiRunConfig | null) {}

  /** 종류마다 처리기 하나. 같은 종류를 두 번 등록하면 기동을 멈춘다(BR5.1). 각 Unit이 모듈 초기화(onModuleInit)에서 부른다. */
  registerHandler(kind: AiRunKind, handler: AiRunHandler): void {
    if (!isAiRunKind(kind)) throw new TypeError('AiRun이 모르는 작업 종류입니다.');
    if (this.handlers.has(kind)) throw new Error(`AiRun 처리기가 이미 등록됐습니다(${kind}).`);
    this.handlers.set(kind, handler);
  }

  /**
   * 반드시 DB 커밋 뒤에 부른다. 실패해도 예외를 던지지 않고 ENQUEUE_FAILED를 돌려준다(BR5.2, NFR6.1).
   * 작업 ID = runKey라 큐에 남아 있는 동안 같은 runKey는 무시되고 ENQUEUED다(NFR4.9).
   */
  async enqueueAfterCommit(kind: AiRunKind, runKey: string, payload: Record<string, string>): Promise<EnqueueResult> {
    const safeRunKey = isValidRunKey(runKey) ? runKey : null;
    if (!isAiRunKind(kind) || safeRunKey === null || !isValidPayload(kind, payload)) {
      return this.enqueueFailed(kind, safeRunKey, 'INVALID_JOB');
    }
    const queue = this.openQueue();
    if (queue === null) return this.enqueueFailed(kind, runKey, 'QUEUE_NOT_CONFIGURED');
    let timer: NodeJS.Timeout | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error('enqueue timeout'), { name: 'EnqueueTimeout' })), AI_RUN_ENQUEUE_TIMEOUT_MS);
      });
      await Promise.race([queue.add(kind, payload, aiRunJobOptions(runKey)), timeout]);
      return 'ENQUEUED';
    } catch (error) {
      return this.enqueueFailed(kind, runKey, errorName(error));
    } finally {
      clearTimeout(timer);
    }
  }

  /** 큐 주소가 있으면 앱 기동 뒤(모든 모듈의 처리기 등록 뒤) 소비를 시작한다. */
  onApplicationBootstrap(): void {
    this.start();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.close();
  }

  /** 소비 시작. 큐 주소가 없거나 이미 시작했으면 아무것도 하지 않는다. */
  start(): void {
    if (this.config === null || this.worker !== null || this.closing !== null) return;
    this.workerConnection = this.watch(new IORedis(this.config.redisUrl, { maxRetriesPerRequest: null }));
    this.worker = new Worker(AI_RUN_QUEUE, (job: Job) => this.process(job), {
      connection: this.workerConnection, prefix: this.config.prefix, ...AI_RUN_WORKER_OPTIONS,
    });
    // 처리기 예외는 kind·runKey·오류 이름만 남긴다. 다시 돌리지 않는다(BR5.6, NFR6.3).
    this.worker.on('failed', (job: Job | undefined, error: Error) => {
      if (error instanceof UnknownAiRunKind) return;
      this.logger.error({ event: 'ai_run_handler_failed', kind: job?.name ?? null, runKey: job?.id ?? null, error: errorName(error) });
    });
    this.worker.on('error', (error: Error) => this.logger.error({ event: 'ai_run_worker_error', error: errorName(error) }));
  }

  /** 처리 중 작업을 상한까지 기다린 뒤 연결을 닫는다. 여러 번 불러도 한 번만 닫는다. */
  close(): Promise<void> {
    this.closing ??= this.closeAll();
    return this.closing;
  }

  /** 시험·상태 확인용: 처리기가 등록된 종류. */
  registeredKinds(): AiRunKind[] {
    return [...this.handlers.keys()];
  }

  private async process(job: Job): Promise<void> {
    const kind = job.name as AiRunKind;
    const handler = isAiRunKind(kind) ? this.handlers.get(kind) : undefined;
    if (handler === undefined) {
      this.logger.error({ event: 'ai_run_unknown_kind', kind: isAiRunKind(kind) ? kind : null, runKey: job.id ?? null });
      throw new UnknownAiRunKind('처리기가 없는 작업 종류입니다.');
    }
    await handler({ runKey: String(job.id), payload: job.data as Record<string, string> });
  }

  private openQueue(): Queue | null {
    if (this.config === null || this.closing !== null) return null;
    if (this.queue === null) {
      // 끊긴 동안 명령을 쌓지 않고 바로 실패시킨다(등록 실패 → 시한으로 FAILED).
      this.queueConnection = this.watch(new IORedis(this.config.redisUrl, { enableOfflineQueue: false, maxRetriesPerRequest: 1 }));
      this.queue = new Queue(AI_RUN_QUEUE, { connection: this.queueConnection, prefix: this.config.prefix });
      this.queue.on('error', (error: Error) => this.logger.warn({ event: 'ai_run_queue_error', error: errorName(error) }));
    }
    return this.queue;
  }

  private enqueueFailed(kind: unknown, runKey: string | null, error: string): EnqueueResult {
    // payload는 남기지 않는다. 형식이 틀린 runKey도 그대로 남기지 않는다(관측 설계 NFR6.6).
    this.logger.warn({ event: 'ai_run_enqueue_failed', kind: isAiRunKind(kind) ? kind : null, runKey, error });
    return 'ENQUEUE_FAILED';
  }

  /** 같은 끊김이 이어지면 첫 오류만 남긴다. */
  private watch(connection: IORedis): IORedis {
    return watchRedisErrors(connection, (error) => this.logger.warn({ event: 'ai_run_connection_error', error: errorName(error) }));
  }

  private async closeAll(): Promise<void> {
    try {
      if (this.worker) {
        const force = this.workerConnection?.status !== 'ready';
        await this.within(this.worker.close(force), AI_RUN_CLOSE_TIMEOUT_MS);
      }
      if (this.queue) await this.within(this.queue.close(), AI_RUN_CLOSE_TIMEOUT_MS);
    } finally {
      for (const connection of [this.queueConnection, this.workerConnection]) {
        if (connection && connection.status !== 'end') connection.disconnect();
      }
    }
  }

  private async within(promise: Promise<unknown>, timeoutMs: number): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    const finished = await Promise.race([
      promise.then(() => true, (error: unknown) => {
        this.logger.warn({ event: 'ai_run_close_error', error: errorName(error) });
        return true;
      }),
      new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), timeoutMs); }),
    ]);
    clearTimeout(timer);
    if (!finished) this.logger.error({ event: 'ai_run_close_timeout' });
  }
}

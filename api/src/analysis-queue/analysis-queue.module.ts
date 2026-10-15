import { DynamicModule, Logger, LoggerService, Module, OnModuleDestroy } from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { DataSource } from 'typeorm';
import { PeriodicTask } from '../common/periodic-task';
import { DatabaseModule } from '../database/database.module';
import { AnalysisReceiverModule } from '../analysis-receiver/analysis-receiver.module';
import { AnalysisRegistrationService } from '../analysis-receiver/analysis-registration.service';
import { RepositoryObservationSource } from '../analysis-receiver/repository-observation.source';
import { WorkerMessageValidator } from '../analysis-receiver/worker-message.validator';
import { AnalysisQueueConfig } from './analysis-queue.config';
import { AnalysisRequestDispatcher, DispatchLog, DispatchSummary, errorName } from './analysis-request.dispatcher';
import {
  ANALYSIS_REQUEST_QUEUE, CONNECTION_QUIT_TIMEOUT_MS, CONSUMER_CLOSE_TIMEOUT_MS, CONSUMER_OPTIONS, DISPATCH_INTERVAL_MS,
  QUEUE_COMMAND_TIMEOUT_MS, WORKER_MESSAGE_QUEUE,
} from './queue-spec';
import { AnalysisQueueError, ConsumerLog, WorkerMessageConsumer, loggableJobId, loggableJobName } from './worker-message.consumer';

export interface AnalysisQueueLimits {
  dispatchIntervalMs: number;
  commandTimeoutMs: number;
  consumerCloseTimeoutMs: number;
  connectionQuitTimeoutMs: number;
}

const DEFAULT_LIMITS: AnalysisQueueLimits = {
  dispatchIntervalMs: DISPATCH_INTERVAL_MS,
  commandTimeoutMs: QUEUE_COMMAND_TIMEOUT_MS,
  consumerCloseTimeoutMs: CONSUMER_CLOSE_TIMEOUT_MS,
  connectionQuitTimeoutMs: CONNECTION_QUIT_TIMEOUT_MS,
};

export interface AnalysisQueueRunnerOptions {
  config: AnalysisQueueConfig;
  dataSource: DataSource;
  registration: Pick<AnalysisRegistrationService, 'receiveResult' | 'receiveProgress'>;
  validator: Pick<WorkerMessageValidator, 'request'>;
  logger?: Pick<LoggerService, 'log' | 'warn' | 'error'>;
  clock?: () => Date;
  /** 시험만 짧게 바꾼다. 운영 값은 queue-spec.ts의 상수다. */
  limits?: Partial<AnalysisQueueLimits>;
}

type State = 'idle' | 'running' | 'stopped';

/**
 * 보내기(요청 큐)와 받기(알림·결과 큐)의 연결·주기 실행·종료(#233).
 * 연결은 start()에서 연다. 조립·Nest 초기화만으로는 큐 서버에 붙지 않는다(시험이 AppModule을 띄울 때도 같다).
 * 보내기와 받기는 연결을 따로 쓴다. 보내기는 끊긴 동안 명령을 쌓지 않고 바로 실패해야 하고, 받기(BullMQ Worker)는
 * 명령 재시도 제한이 없어야 하기 때문이다. Queue·Worker는 넘겨받은 연결을 닫지 않으므로 멈출 때 직접 닫는다.
 */
export class AnalysisQueueRunner implements OnModuleDestroy {
  private state: State = 'idle';
  private requestConnection: IORedis | null = null;
  private consumerConnection: IORedis | null = null;
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private dispatcher: AnalysisRequestDispatcher | null = null;
  private task: PeriodicTask | null = null;
  private stopping: Promise<void> | null = null;
  /** 받기(BullMQ Worker)가 큐 서버에 한 번이라도 붙었는지. */
  private consumerReady = false;
  /** 같은 출처의 같은 오류는 다시 붙기 전까지 한 번만 남긴다(재접속마다 쌓이지 않게). */
  private readonly lastErrors = new Map<string, string>();
  private readonly limits: AnalysisQueueLimits;
  private readonly logger: Pick<LoggerService, 'log' | 'warn' | 'error'>;

  constructor(private readonly options: AnalysisQueueRunnerOptions) {
    this.limits = { ...DEFAULT_LIMITS, ...options.limits };
    this.logger = options.logger ?? new Logger('AnalysisQueue');
  }

  /** 연결을 열고 받기와 5초 주기 보내기를 시작한다. 실제 서버 진입점에서만 부른다. 두 번째 호출은 아무것도 하지 않는다. */
  start(): void {
    if (this.state !== 'idle') return;
    this.state = 'running';
    const { redisUrl, prefix } = this.options.config;
    // 끊긴 동안 명령을 쌓지 않고 바로 실패시킨다. 보내기는 연결이 준비됐을 때만 명령을 보낸다.
    this.requestConnection = this.watch(new IORedis(redisUrl, { enableOfflineQueue: false }), 'REQUEST_CONNECTION', 'REQUEST_QUEUE');
    // BullMQ Worker가 요구하는 설정(명령 재시도 제한 없음).
    this.consumerConnection = this.watch(new IORedis(redisUrl, { maxRetriesPerRequest: null }), 'CONSUMER_CONNECTION', 'CONSUMER');

    const queue = new Queue(ANALYSIS_REQUEST_QUEUE, { connection: this.requestConnection, prefix });
    queue.on('error', error => this.recordError('REQUEST_QUEUE', error));
    this.queue = queue;
    const requestConnection = this.requestConnection;
    this.dispatcher = new AnalysisRequestDispatcher(this.options.dataSource, {
      ready: () => requestConnection.status === 'ready',
      getJob: jobId => queue.getJob(jobId),
      add: (name, data, jobOptions) => queue.add(name, data, jobOptions),
    }, this.options.validator, this.dispatchLog(), this.options.clock, this.limits.commandTimeoutMs);

    const consumer = new WorkerMessageConsumer(this.options.registration, this.consumerLog());
    const worker = new Worker(WORKER_MESSAGE_QUEUE, (job: Job) => consumer.process(job), {
      connection: this.consumerConnection, prefix, autorun: false, ...CONSUMER_OPTIONS,
    });
    worker.on('error', error => this.recordError('CONSUMER', error));
    worker.on('ready', () => { this.consumerReady = true; });
    worker.on('failed', (job: Job | undefined, error: Error) => this.logger.error({
      event: 'WORKER_MESSAGE_FAILED', jobName: loggableJobName(job?.name), jobId: loggableJobId(job?.id),
      code: error instanceof AnalysisQueueError ? error.code : errorName(error),
    }));
    this.worker = worker;
    // 받기 실행은 멈출 때까지 끝나지 않으므로 기다리지 않는다. 예상 밖으로 끝나면 남긴다.
    worker.run().catch(error => {
      if (this.state === 'running') this.logger.error({ event: 'ANALYSIS_QUEUE_CONSUMER_STOPPED', error: errorName(error) });
    });

    this.task = new PeriodicTask({
      name: 'analysis-dispatch',
      intervalMs: this.limits.dispatchIntervalMs,
      run: async () => { await this.dispatchOnce(); },
      failed: (task, error) => this.logger.error({ event: 'PERIODIC_TASK_FAILED', task, error }),
    });
    this.task.start();
  }

  /** 보내기 한 번. 주기 실행과 겹치면 진행 중인 실행을 함께 기다린다. */
  dispatchOnce(): Promise<DispatchSummary> {
    if (!this.dispatcher) return Promise.reject(new Error('Analysis queue runner is not started'));
    return this.dispatcher.dispatchOnce();
  }

  /** 두 큐의 연결 준비(BullMQ 초기화 포함)를 기다린다. 기동 확인과 시험에서 쓴다. */
  async waitUntilReady(): Promise<void> {
    if (!this.queue || !this.worker) throw new Error('Analysis queue runner is not started');
    await Promise.all([this.queue.waitUntilReady(), this.worker.waitUntilReady()]);
  }

  // 앱 종료 때 DB 연결이 닫히기 전에 진행 중인 보내기·받기를 끝낸다.
  async onModuleDestroy(): Promise<void> { await this.stop(); }

  stop(): Promise<void> {
    this.stopping ??= this.close();
    return this.stopping;
  }

  /**
   * 멈춤 표시 → 주기 멈춤(진행 중 보내기 대기, 명령 하나는 5초 상한) → 받기 닫기(처리 중 작업 대기, 상한) → 요청 큐 닫기 →
   * 두 연결 닫기. 상한을 넘기면 기록하고 다음 단계로 간다. 연결은 앞 단계가 실패해도 닫는다.
   */
  private async close(): Promise<void> {
    if (this.state !== 'running') {
      this.state = 'stopped';
      return;
    }
    this.state = 'stopped';
    const dispatchStopped = this.dispatcher?.stop();
    try {
      await this.task?.stop();
      await dispatchStopped;
      // 한 번도 붙지 못했으면 처리 중 작업이 있을 수 없다. 이때 BullMQ의 일반 닫기는 연결을 기다리며 끝나지 않고
      // 내부 대기용 연결이 재접속을 계속하므로 강제 닫기로 끊는다.
      if (this.worker) {
        await this.within(this.worker.close(!this.consumerReady), this.limits.consumerCloseTimeoutMs, 'CONSUMER');
      }
      if (this.queue) await this.within(this.queue.close(), this.limits.connectionQuitTimeoutMs, 'REQUEST_QUEUE');
    } finally {
      await Promise.all([this.requestConnection, this.consumerConnection].map(connection => connection && this.quit(connection)));
    }
  }

  private async within(promise: Promise<unknown>, timeoutMs: number, stage: string): Promise<void> {
    promise.catch(error => this.recordError(stage, error));
    let timer: NodeJS.Timeout | undefined;
    const finished = await Promise.race([
      promise.then(() => true, () => true),
      new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), timeoutMs); }),
    ]);
    clearTimeout(timer);
    if (!finished) this.logger.error({ event: 'ANALYSIS_QUEUE_SHUTDOWN_TIMEOUT', stage });
  }

  private async quit(connection: IORedis): Promise<void> {
    if (connection.status === 'end') return;
    const quitting = connection.quit();
    quitting.catch(() => undefined);
    let timer: NodeJS.Timeout | undefined;
    const closed = await Promise.race([
      quitting.then(() => true, () => false),
      new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), this.limits.connectionQuitTimeoutMs); }),
    ]);
    clearTimeout(timer);
    if (!closed) connection.disconnect();
  }

  /** user는 이 연결을 쓰는 Queue·Worker의 출처다. 다시 붙으면 둘의 기록 상태를 함께 비워 다음 오류를 다시 남긴다. */
  private watch(connection: IORedis, source: string, user: string): IORedis {
    // error 수신기가 없으면 ioredis가 원문 오류와 스택을 표준 오류로 낸다.
    connection.on('error', error => this.recordError(source, error));
    connection.on('ready', () => {
      const recovered = this.lastErrors.delete(source);
      this.lastErrors.delete(user);
      if (recovered) this.logger.log({ event: 'ANALYSIS_QUEUE_CONNECTED', source });
    });
    return connection;
  }

  private recordError(source: string, error: unknown): void {
    const name = errorName(error);
    if (this.lastErrors.get(source) === name) return;
    this.lastErrors.set(source, name);
    this.logger.warn({ event: 'ANALYSIS_QUEUE_ERROR', source, error: name });
  }

  private dispatchLog(): DispatchLog {
    return {
      enqueued: (requestId, attemptId) => this.logger.log({ event: 'ANALYSIS_REQUEST_ENQUEUED', requestId, attemptId }),
      skipped: (requestId, attemptId, code) => this.logger.warn({ event: 'ANALYSIS_REQUEST_SKIPPED', requestId, attemptId, code }),
      paused: (reason, error) => this.logger.warn({ event: 'ANALYSIS_DISPATCH_PAUSED', reason, ...(error ? { error } : {}) }),
      resumed: () => this.logger.log({ event: 'ANALYSIS_DISPATCH_RESUMED' }),
    };
  }

  private consumerLog(): ConsumerLog {
    return {
      progress: (jobId, decision) => this.logger.log({ event: 'WORKER_PROGRESS_RECEIVED', jobId, decision }),
      result: (jobId, receipt) => this.logger.log({ event: 'WORKER_RESULT_RECEIVED', jobId,
        disposition: receipt?.disposition ?? null, code: receipt?.code ?? null }),
      applicationFailed: jobId => this.logger.warn({ event: 'RESULT_APPLICATION_FAILED', jobId }),
    };
  }
}

export interface AnalysisQueueModuleOptions {
  queue: AnalysisQueueConfig;
  observations: RepositoryObservationSource;
  contractDirectory: string;
}

/**
 * 큐 연결 모듈. 큐 설정과 보호 관측 공급자가 모두 있을 때만 조립한다(10/15 팀장 결정). 가짜 공급자를 기본으로 넣지 않는다.
 * 실제 수신·등록 조립(AnalysisReceiverModule.registerDatabase)을 여기서 한 번 불러온다. 같은 앱에서 따로 또 부르지 않는다.
 * AppModule에는 아직 등록하지 않는다. 켜는 일은 #105의 정책 공급자가 준비된 뒤다(api/docs/analysis-queue.md).
 */
@Module({})
export class AnalysisQueueModule {
  static register(options: AnalysisQueueModuleOptions): DynamicModule {
    if (!options?.queue || !options.observations || !options.contractDirectory) {
      throw new Error('AnalysisQueueModule에는 큐 설정·보호 관측 공급자·계약 경로가 모두 필요합니다.');
    }
    return {
      module: AnalysisQueueModule,
      imports: [DatabaseModule, AnalysisReceiverModule.registerDatabase({
        contractDirectory: options.contractDirectory, observations: options.observations,
      })],
      providers: [{
        provide: AnalysisQueueRunner,
        inject: [DataSource, AnalysisRegistrationService],
        useFactory: (dataSource: DataSource, registration: AnalysisRegistrationService) => new AnalysisQueueRunner({
          config: options.queue, dataSource, registration, validator: new WorkerMessageValidator(options.contractDirectory),
        }),
      }],
      exports: [AnalysisQueueRunner],
    };
  }
}

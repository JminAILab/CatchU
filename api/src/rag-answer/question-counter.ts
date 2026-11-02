// 링크(발행본)당 한국 시간 하루 질문 횟수(기능 설계 BR3.1~BR3.3, performance-design NFR4.4, scalability-design NFR4.7, NFR6.4).
// 전용 ioredis 연결 하나로 MULTI(INCR, EXPIREAT 다음 한국 자정)를 보낸다. 셀 수 없으면(주소 없음·명령 실패·1초 초과)
// 그 질문을 세지 않고 통과시키며 경고 로그만 남긴다(BR3.2). 거부된 질문도 늘린 값을 되돌리지 않는다(BR3.1).
import IORedis from 'ioredis';
import type { AnalysisQueueConfig } from '../analysis-queue/analysis-queue.config';
import { errorName } from '../ai-run/ai-run-spec';
import { nextKoreanMidnightSeconds, questionCountKey } from './korean-date';
import { QUESTION_COUNTER_TIMEOUT_MS, QUESTION_DAILY_LIMIT } from './rag-answer-config';
import { type CountBypassReason, createRagAnswerLogger, type RagAnswerLogger, writeRagAnswerLog } from './rag-answer-log';

/** Nest 주입 토큰. 시험은 메모리 구현을 넣는다. */
export const QUESTION_COUNTER = Symbol('QUESTION_COUNTER');

export type QuestionCountDecision =
  | { decision: 'ALLOWED' }
  | { decision: 'LIMIT_REACHED' }
  | { decision: 'BYPASSED'; reason: CountBypassReason };

export interface QuestionCounter {
  /** 그 발행본의 오늘 횟수를 1 늘리고 판정한다. 예외를 던지지 않는다(셀 수 없으면 BYPASSED). */
  count(publicationId: string, now: Date): Promise<QuestionCountDecision>;
  /** 앱 종료 훅에서 부른다. 여러 번 불러도 된다. */
  close(): Promise<void>;
}

/** ioredis에서 쓰는 부분만(시험은 같은 모양의 가짜 객체를 넘긴다). */
export interface CounterRedis {
  multi(): CounterPipeline;
  quit(): Promise<unknown>;
  disconnect(): void;
  on(event: 'error' | 'ready', listener: (error: Error) => void): unknown;
}

export interface CounterPipeline {
  incr(key: string): CounterPipeline;
  expireat(key: string, unixSeconds: number): CounterPipeline;
  exec(): Promise<[Error | null, unknown][] | null>;
}

class CounterTimeout extends Error {
  override readonly name = 'CounterTimeout';
}

/** 한도 판정. 늘린 값이 100을 넘으면 거부한다(101번째부터, BR3.1). */
function decide(count: number): QuestionCountDecision {
  return count > QUESTION_DAILY_LIMIT ? { decision: 'LIMIT_REACHED' } : { decision: 'ALLOWED' };
}

export interface RedisQuestionCounterOptions {
  redis: CounterRedis;
  prefix: string;
  logger?: RagAnswerLogger;
  /** 명령 하나를 기다리는 상한(밀리초). 기본 1초. 시험만 짧게 넘긴다. */
  timeoutMs?: number;
}

export class RedisQuestionCounter implements QuestionCounter {
  private readonly logger: RagAnswerLogger;
  private readonly timeoutMs: number;
  private closing: Promise<void> | null = null;

  constructor(private readonly options: RedisQuestionCounterOptions) {
    this.logger = options.logger ?? createRagAnswerLogger();
    this.timeoutMs = options.timeoutMs ?? QUESTION_COUNTER_TIMEOUT_MS;
    // 연결 오류를 처리되지 않은 사건으로 두지 않는다. 같은 끊김이 이어지면 첫 오류만 남긴다(AiRun과 같은 방식).
    let reported = false;
    options.redis.on('ready', () => { reported = false; });
    options.redis.on('error', (error: Error) => {
      if (reported) return;
      reported = true;
      writeRagAnswerLog(this.logger, { event: 'qna.count-connection-error', error: errorName(error) });
    });
  }

  async count(publicationId: string, now: Date): Promise<QuestionCountDecision> {
    const key = questionCountKey(this.options.prefix, publicationId, now);
    try {
      const results = await this.withinTimeout(
        this.options.redis.multi().incr(key).expireat(key, nextKoreanMidnightSeconds(now)).exec());
      const incremented = results?.[0];
      if (!incremented || incremented[0] !== null || typeof incremented[1] !== 'number') throw new Error('INCR 결과가 없습니다.');
      return decide(incremented[1]);
    } catch (error) {
      return this.bypass(publicationId, error instanceof CounterTimeout ? 'REDIS_TIMEOUT' : 'REDIS_ERROR');
    }
  }

  close(): Promise<void> {
    this.closing ??= this.closeConnection();
    return this.closing;
  }

  private async closeConnection(): Promise<void> {
    try {
      await this.options.redis.quit();
    } catch (error) {
      // 이미 끊겼으면 quit이 실패한다. 이름만 남기고 아래에서 연결을 끊는다.
      writeRagAnswerLog(this.logger, { event: 'qna.count-connection-error', error: errorName(error) });
    } finally {
      this.options.redis.disconnect();
    }
  }

  /** ioredis commandTimeout과 별도로 시계를 하나 더 둔다(MULTI·EXEC 묶음 전체를 1초 안에). 늦게 끝난 명령의 실패는 버린다. */
  private async withinTimeout<T>(promise: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    promise.catch(() => undefined);
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new CounterTimeout()), this.timeoutMs); }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  private bypass(publicationId: string, reason: CountBypassReason): QuestionCountDecision {
    writeRagAnswerLog(this.logger, { event: 'qna.count-bypassed', publicationId, reason });
    return { decision: 'BYPASSED', reason };
  }
}

/**
 * 큐 주소가 없으면 늘 세지 않고 통과한다(BR3.2). Redis가 없거나 장애인 동안 질문 수 상한이 없고,
 * 질문당 비용이 작아 받아들인 한계다(비기능 요구사항 수정 R-03).
 */
export class NoRedisQuestionCounter implements QuestionCounter {
  constructor(private readonly logger: RagAnswerLogger = createRagAnswerLogger()) {}

  async count(publicationId: string): Promise<QuestionCountDecision> {
    writeRagAnswerLog(this.logger, { event: 'qna.count-bypassed', publicationId, reason: 'NO_REDIS' });
    return { decision: 'BYPASSED', reason: 'NO_REDIS' };
  }

  async close(): Promise<void> {}
}

/** 시험 전용 메모리 계수기. 같은 키 규칙·한도로 센다. 앱 모듈에는 넣지 않는다. */
export class InMemoryQuestionCounter implements QuestionCounter {
  readonly counts = new Map<string, number>();
  readonly expiries = new Map<string, number>();

  constructor(private readonly prefix = 'catchu') {}

  async count(publicationId: string, now: Date): Promise<QuestionCountDecision> {
    const key = questionCountKey(this.prefix, publicationId, now);
    const next = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, next);
    this.expiries.set(key, nextKoreanMidnightSeconds(now));
    return decide(next);
  }

  async close(): Promise<void> {}
}

/**
 * 큐 설정(readAnalysisQueueConfig와 같은 판정)으로 계수기를 만든다. 주소가 없으면 늘 통과하는 구현이다.
 * lazyConnect 없이 만들 때 연결을 시작하지만 기동을 기다리게 하지 않는다. 끊긴 동안 명령을 쌓지 않고(enableOfflineQueue: false)
 * 바로 실패시켜 통과로 바꾼다(NFR4.4).
 */
export function createQuestionCounter(config: AnalysisQueueConfig | null, logger?: RagAnswerLogger): QuestionCounter {
  if (config === null) return new NoRedisQuestionCounter(logger);
  const redis = new IORedis(config.redisUrl, {
    enableOfflineQueue: false,
    commandTimeout: QUESTION_COUNTER_TIMEOUT_MS,
    maxRetriesPerRequest: 0,
  });
  return new RedisQuestionCounter({ redis: redis as unknown as CounterRedis, prefix: config.prefix, logger });
}

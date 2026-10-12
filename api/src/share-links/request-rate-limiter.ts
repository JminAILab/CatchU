/**
 * 요청 빈도 상한(#219). 같은 키의 요청을 최근 `windowMs` 안에서 `maxRequests`개까지만 받는다(미끄러지는 창).
 * 비밀번호 해시처럼 비싼 계산 앞에서 같은 회원·같은 링크·주소가 요청을 되풀이해 서버 자원을 차지하지 못하게 한다.
 *
 * - 거부한 요청은 세지 않는다. 상한을 넘겨 계속 보내도 거부 기간이 늘지 않는다.
 * - 남은 초는 창 안의 가장 오래된 요청이 창을 벗어날 때까지다(올림, 최소 1).
 * - 기록은 프로세스 메모리다(api 프로세스 1개, #24). 재시작하면 지워지고, 프로세스가 늘면 헐거워진다.
 * - 기록 상한(`maxKeys`): 새 키가 자리를 못 얻으면 창이 지난 기록부터 지우고, 그래도 차 있으면 가장 오래 쓰지 않은 키를 밀어낸다.
 *   밀려난 키는 처음부터 센다. 창이 짧아 밀려나도 잃는 것은 창 하나 분량의 기록이며, 새 요청을 거절하지는 않는다.
 * - 키는 로그·응답에 내보내지 않는다.
 */

export interface RateLimitOptions {
  maxRequests: number;
  windowMs: number;
  maxKeys: number;
}

export type RateDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

const seconds = (ms: number) => Math.max(1, Math.ceil(ms / 1000));
const positiveInteger = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 1;

export class RequestRateLimiter {
  /** 키별 받은 요청 시각(오름차순). Map 순서는 마지막 사용 순서다(맨 앞이 가장 오래 쓰지 않은 키). */
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly options: RateLimitOptions) {
    if (![options.maxRequests, options.windowMs, options.maxKeys].every(positiveInteger)) {
      throw new Error('요청 빈도 상한 값은 1 이상의 정수여야 합니다.');
    }
  }

  /** 요청 하나를 받을지 정한다. 받으면 센다. */
  take(key: string, now: Date): RateDecision {
    const at = now.getTime();
    const recent = (this.hits.get(key) ?? []).filter((time) => at - time < this.options.windowMs);
    if (recent.length >= this.options.maxRequests) {
      this.remember(key, recent, at);
      return { allowed: false, retryAfterSeconds: seconds(recent[0] + this.options.windowMs - at) };
    }
    recent.push(at);
    this.remember(key, recent, at);
    return { allowed: true };
  }

  /** 시험·진단용. 키 값은 밖으로 내보내지 않는다. */
  get size(): number {
    return this.hits.size;
  }

  private remember(key: string, recent: number[], at: number): void {
    this.hits.delete(key);
    if (this.hits.size >= this.options.maxKeys) this.pruneExpired(at);
    if (this.hits.size >= this.options.maxKeys) {
      const oldest = this.hits.keys().next().value;
      if (oldest !== undefined) this.hits.delete(oldest);
    }
    this.hits.set(key, recent);
  }

  /**
   * 마지막으로 받은 요청이 창을 벗어난 키를 모두 지운다. 거부도 사용 순서를 올리므로 사용 순서와 받은 시각 순서가 달라,
   * 중간에 멈추지 않고 전부 본다(기록이 가득 찬 채 새 키가 올 때만 돈다).
   */
  private pruneExpired(at: number): void {
    for (const [key, times] of this.hits) {
      if (at - times[times.length - 1] >= this.options.windowMs) this.hits.delete(key);
    }
  }
}

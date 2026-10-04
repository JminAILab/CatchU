/**
 * 주소 단위 비밀번호 시도 제한(#150 9/29 결정): 같은 링크·같은 주소 단위에서 15분 안에 10번 틀리면 15분 차단.
 * 주소 단위는 client-address.ts, 링크 전체 집계는 link-limiter.ts, 전체 해시 자원은 hash-gate.ts가 맡는다.
 *
 * - **직렬화:** 같은 링크·주소의 요청은 `runExclusive`로 한 번에 하나씩 "차단 확인 → 비밀번호 검사 → 기록"을 한다.
 *   동시에 몰아 보내도 한도(10번)를 넘겨 검사하지 않는다. 같은 키에 걸려 있는 요청은 실행 중 1개를 포함해
 *   최대 `maxPendingPerKey`(3)개이며, 넘치면 검사 없이 거절한다(`UnlockBusyError`). 이미 차단된 키는 이보다 먼저 차단으로 판정한다.
 * - **차단 중:** 요청을 세지 않아 차단 종료 시각이 늘어나지 않고, 해시도 계산하지 않는다.
 * - **성공:** 그 링크·주소의 실패 기록을 지운다. 차단 중이면 지우지 않는다.
 * - **기록 상한(`maxEntries`):** 새 키는 검사 전에 자리를 예약한다. 자리가 없으면 만료된 기록을 정리하고, 그래도 없으면
 *   차단 중도 검사 중도 아닌 기록 가운데 가장 오래 쓰지 않은 것 하나를 밀어낸다(10/4 보안 의견 3). 밀려난 주소의 실패 누적은
 *   초기화되지만, 그 링크의 링크 전체 누적은 남는다. 밀어낼 기록도 없으면(모두 차단·검사 중) 새 키만 검사 없이 거절한다.
 * - 프로세스 메모리(단일 인스턴스·단일 프로세스 MVP)라 재시작하면 초기화되고, 여러 프로세스면 차단이 헐거워진다.
 */

export interface UnlockLimitOptions {
  maxFailures: number;
  windowMs: number;
  blockMs: number;
  maxEntries: number;
  maxPendingPerKey: number;
}

export const DEFAULT_UNLOCK_LIMIT: UnlockLimitOptions = {
  maxFailures: 10,
  windowMs: 15 * 60 * 1000,
  blockMs: 15 * 60 * 1000,
  maxEntries: 10_000,
  maxPendingPerKey: 3,
};

interface Entry {
  failures: number[];
  blockedUntil: number | null;
  /** 검사 중인 요청이 자리를 잡아 둔 상태. 정리 대상이 아니다. */
  reserved: boolean;
}

export type UnlockCheck =
  | { blocked: false }
  | { blocked: true; reason: 'limit' | 'capacity'; retryAfterSeconds: number };

/** 같은 링크·접속지에서 기다리는 요청이 상한을 넘었다. 검사하지 않고 거절한다. */
export class UnlockBusyError extends Error {
  constructor() {
    super('too many concurrent unlock attempts');
  }
}

const seconds = (ms: number) => Math.max(1, Math.ceil(ms / 1000));

export class UnlockLimiter {
  private readonly entries = new Map<string, Entry>();
  private readonly queues = new Map<string, { tail: Promise<void>; size: number }>();

  constructor(private readonly options: UnlockLimitOptions = DEFAULT_UNLOCK_LIMIT) {}

  /**
   * 같은 키의 작업을 순서대로 하나씩 실행한다. 실행 중 1개를 포함해 `maxPendingPerKey`개가 이미 걸려 있으면 기다리지 않고 거절한다.
   */
  async runExclusive<T>(key: string, work: () => Promise<T>): Promise<T> {
    const queue = this.queues.get(key) ?? { tail: Promise.resolve(), size: 0 };
    if (queue.size >= this.options.maxPendingPerKey) throw new UnlockBusyError();
    queue.size += 1;
    this.queues.set(key, queue);
    const previous = queue.tail;
    let release!: () => void;
    queue.tail = new Promise<void>((resolve) => { release = resolve; });
    try {
      await previous;
      return await work();
    } finally {
      queue.size -= 1;
      release();
      if (queue.size === 0) this.queues.delete(key);
    }
  }

  /**
   * 검사해도 되는지. 차단 중이면 남은 초(올림, 최소 1)를 돌려주고 상태를 늘리지 않는다.
   * 처음 보는 키는 이때 자리를 예약하며, 자리가 없으면 `capacity`로 거절한다. 검사 뒤에는 반드시 recordFailure·recordSuccess·release 중 하나를 부른다.
   */
  check(key: string, now: Date): UnlockCheck {
    const at = now.getTime();
    const entry = this.entries.get(key);
    if (entry) {
      this.touch(key, entry);
      if (entry.blockedUntil !== null && entry.blockedUntil > at) {
        return { blocked: true, reason: 'limit', retryAfterSeconds: seconds(entry.blockedUntil - at) };
      }
      if (entry.blockedUntil !== null) {
        entry.blockedUntil = null; // 차단이 끝나면 새로 센다
        entry.failures = [];
      }
      entry.reserved = true;
      return { blocked: false };
    }
    if (this.entries.size >= this.options.maxEntries) this.pruneExpired(at);
    if (this.entries.size >= this.options.maxEntries && !this.evictOldest(at)) {
      return { blocked: true, reason: 'capacity', retryAfterSeconds: this.capacityRetrySeconds(at) };
    }
    this.entries.set(key, { failures: [], blockedUntil: null, reserved: true });
    return { blocked: false };
  }

  /** 틀린 비밀번호 한 번. 창 안에서 한도에 닿으면 그 시각부터 차단한다. */
  recordFailure(key: string, now: Date): void {
    const at = now.getTime();
    const entry = this.entries.get(key);
    if (!entry) return; // check로 자리를 잡지 않은 기록은 받지 않는다
    entry.reserved = false;
    this.touch(key, entry);
    if (entry.blockedUntil !== null && entry.blockedUntil > at) return; // 차단 중에는 세지 않는다
    entry.blockedUntil = null;
    entry.failures = entry.failures.filter((time) => at - time < this.options.windowMs);
    entry.failures.push(at);
    if (entry.failures.length >= this.options.maxFailures) {
      entry.failures = [];
      entry.blockedUntil = at + this.options.blockMs;
    }
  }

  /** 맞는 비밀번호. 차단 중이 아니면 기록을 지운다. */
  recordSuccess(key: string, now: Date): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    if (entry.blockedUntil !== null && entry.blockedUntil > now.getTime()) {
      entry.reserved = false;
      return;
    }
    this.entries.delete(key);
  }

  /** 검사가 예외로 끝났을 때 예약만 푼다. 기록이 비어 있으면 다음 정리 때 지워진다. */
  release(key: string): void {
    const entry = this.entries.get(key);
    if (entry) entry.reserved = false;
  }

  /** 지금 차단 중인지만 본다(상태를 바꾸지 않음). 검사 뒤 성공 처리 전에 다시 확인할 때 쓴다. */
  blockedFor(key: string, now: Date): number | null {
    const entry = this.entries.get(key);
    const at = now.getTime();
    return entry && entry.blockedUntil !== null && entry.blockedUntil > at ? seconds(entry.blockedUntil - at) : null;
  }

  /** 시험·진단용. 키 값은 밖으로 내보내지 않는다. */
  get size(): number {
    return this.entries.size;
  }

  private expiry(entry: Entry): number {
    if (entry.blockedUntil !== null) return entry.blockedUntil;
    return entry.failures.length > 0 ? Math.max(...entry.failures) + this.options.windowMs : 0;
  }

  /** 차단이 끝났고 창 안 실패도 없는 기록만 지운다. 예약된 자리와 유효한 기록은 둔다. */
  private pruneExpired(at: number): void {
    for (const [key, entry] of this.entries) {
      if (!entry.reserved && this.expiry(entry) <= at) this.entries.delete(key);
    }
  }

  /** 가장 오래 쓰지 않은 기록부터 보고, 차단 중도 검사 중도 아닌 첫 기록을 밀어낸다. 밀어냈으면 true. */
  private evictOldest(at: number): boolean {
    for (const [key, entry] of this.entries) {
      const blocked = entry.blockedUntil !== null && entry.blockedUntil > at;
      if (!entry.reserved && !blocked) {
        this.entries.delete(key);
        return true;
      }
    }
    return false;
  }

  /** 밀어낼 기록이 없을 때 새 키에 줄 남은 초: 검사 중인 자리가 있으면 곧 풀리므로 1초, 아니면 가장 빨리 끝나는 차단까지. */
  private capacityRetrySeconds(at: number): number {
    let earliest = Number.POSITIVE_INFINITY;
    for (const entry of this.entries.values()) {
      if (entry.reserved) return 1;
      if (entry.blockedUntil !== null && entry.blockedUntil < earliest) earliest = entry.blockedUntil;
    }
    return Number.isFinite(earliest) ? seconds(earliest - at) : 1;
  }

  /** Map 순서를 마지막 사용 순서로 유지한다(맨 앞이 가장 오래 쓰지 않은 기록). */
  private touch(key: string, entry: Entry): void {
    this.entries.delete(key);
    this.entries.set(key, entry);
  }
}

/**
 * 링크 전체 비밀번호 시도 제한(#150 10/4 보안 의견 2). 주소를 바꿔 가며 시도해도 한 링크에서 검사하는 횟수를 묶는다.
 *
 * - **누적 차단:** 한 링크에서 집계 기간(15분) 안에 주소와 상관없이 `maxFailures`번 틀리면 그 시각부터 `blockMs`(15분) 동안
 *   그 링크의 새 unlock을 막는다. 차단 중 요청은 세지 않아 종료 시각이 늘지 않고, 풀리면 처음부터 센다(값은 unlock-policy.ts).
 * - **검사 중 포화:** 검사 전에 자리를 예약한다. 한 링크의 검사 중(차례 대기 포함) 요청이 `maxInFlight`개이거나,
 *   (집계 기간 안 실패 + 검사 중)이 `maxFailures`에 닿으면 검사 없이 거절한다. 실패로 세지 않는다.
 *   그래서 집계 기간 안의 검사가 모두 실패하면 차단 전 검사는 정확히 `maxFailures`번이다(중간에 성공이 섞이면 그보다 많을 수 있다).
 * - **성공:** 링크 전체 실패 기록은 지우지 않는다. 한 수신자의 성공이 다른 주소에서 쌓인 실패를 지우지 않게 한다.
 * - **기록 상한(`maxEntries`):** 실패 누적·차단·검사 중이 남은 링크 기록은 밀어내지 않는다(밀어내면 누적이 초기화된다).
 *   빈 기록은 쓰자마자 지운다. 새 링크가 자리를 얻지 못하면 그 링크의 unlock만 검사 없이 거절한다.
 * - 링크별 차단은 서로 독립이다. 이미 받은 grant 열람(수신 조회)에는 적용하지 않는다.
 */

export interface LinkLimitOptions {
  /** 링크 전체 실패 상한. */
  maxFailures: number;
  windowMs: number;
  blockMs: number;
  maxInFlight: number;
  maxEntries: number;
}

interface LinkEntry {
  failures: number[];
  blockedUntil: number | null;
  inFlight: number;
}

export type LinkReservation =
  | { ok: true }
  | { ok: false; reason: 'limit' | 'busy' | 'capacity'; retryAfterSeconds: number };

const seconds = (ms: number) => Math.max(1, Math.ceil(ms / 1000));

export class LinkLimiter {
  private readonly entries = new Map<string, LinkEntry>();

  constructor(private readonly options: LinkLimitOptions) {}

  /** 지금 이 링크가 누적 차단 중이면 남은 초(올림, 최소 1). 상태를 바꾸지 않는다. */
  blockedFor(linkId: string, now: Date): number | null {
    const entry = this.entries.get(linkId);
    const at = now.getTime();
    return entry && entry.blockedUntil !== null && entry.blockedUntil > at ? seconds(entry.blockedUntil - at) : null;
  }

  /** 검사 전에 자리를 예약한다. ok면 검사 뒤 recordFailure·recordSuccess·release 중 하나를 반드시 부른다. */
  reserve(linkId: string, now: Date): LinkReservation {
    const at = now.getTime();
    let entry = this.entries.get(linkId);
    if (entry) {
      if (entry.blockedUntil !== null && entry.blockedUntil > at) {
        return { ok: false, reason: 'limit', retryAfterSeconds: seconds(entry.blockedUntil - at) };
      }
      if (entry.blockedUntil !== null) {
        entry.blockedUntil = null; // 차단이 끝나면 새로 센다
        entry.failures = [];
      }
      this.prune(entry, at);
      if (entry.inFlight >= this.options.maxInFlight) return { ok: false, reason: 'busy', retryAfterSeconds: 1 };
      if (entry.failures.length + entry.inFlight >= this.options.maxFailures) {
        return { ok: false, reason: 'busy', retryAfterSeconds: 1 };
      }
    } else {
      if (this.entries.size >= this.options.maxEntries) this.pruneEmpty(at);
      if (this.entries.size >= this.options.maxEntries) {
        return { ok: false, reason: 'capacity', retryAfterSeconds: this.capacityRetrySeconds(at) };
      }
      entry = { failures: [], blockedUntil: null, inFlight: 0 };
      this.entries.set(linkId, entry);
    }
    entry.inFlight += 1;
    return { ok: true };
  }

  /** 틀린 비밀번호 한 번. 상한에 닿으면 그 시각부터 차단한다. 차단 중이면 세지 않는다. */
  recordFailure(linkId: string, now: Date): void {
    const entry = this.settle(linkId);
    if (!entry) return;
    const at = now.getTime();
    if (!(entry.blockedUntil !== null && entry.blockedUntil > at)) {
      entry.blockedUntil = null;
      this.prune(entry, at);
      entry.failures.push(at);
      if (entry.failures.length >= this.options.maxFailures) {
        entry.failures = [];
        entry.blockedUntil = at + this.options.blockMs;
      }
    }
    this.cleanup(linkId, entry);
  }

  /** 맞는 비밀번호. 링크 전체 실패 기록은 그대로 두고 예약만 푼다. */
  recordSuccess(linkId: string): void {
    this.release(linkId);
  }

  /** 검사하지 않았거나 예외로 끝났을 때 예약만 푼다. */
  release(linkId: string): void {
    const entry = this.settle(linkId);
    if (entry) this.cleanup(linkId, entry);
  }

  /** 시험·진단용. 링크 ID는 밖으로 내보내지 않는다. */
  get size(): number {
    return this.entries.size;
  }

  /** 시험·진단용: 검사 중으로 예약된 수의 합. */
  get inFlight(): number {
    let total = 0;
    for (const entry of this.entries.values()) total += entry.inFlight;
    return total;
  }

  private settle(linkId: string): LinkEntry | undefined {
    const entry = this.entries.get(linkId);
    if (!entry || entry.inFlight === 0) return undefined; // reserve하지 않은 기록은 받지 않는다
    entry.inFlight -= 1;
    return entry;
  }

  private prune(entry: LinkEntry, at: number): void {
    entry.failures = entry.failures.filter((time) => at - time < this.options.windowMs);
  }

  private cleanup(linkId: string, entry: LinkEntry): void {
    if (entry.inFlight === 0 && entry.blockedUntil === null && entry.failures.length === 0) this.entries.delete(linkId);
  }

  /** 집계 기간이 지나 실패가 남지 않았고 차단·검사 중도 아닌 기록만 지운다. 누적이 남은 기록은 밀어내지 않는다. */
  private pruneEmpty(at: number): void {
    for (const [linkId, entry] of this.entries) {
      if (entry.inFlight > 0 || (entry.blockedUntil !== null && entry.blockedUntil > at)) continue;
      if (entry.blockedUntil !== null) {
        entry.blockedUntil = null;
        entry.failures = [];
      }
      this.prune(entry, at);
      this.cleanup(linkId, entry);
    }
  }

  /** 새 링크가 자리를 얻지 못할 때의 남은 초: 검사 중인 기록이 있으면 1초, 아니면 가장 빨리 풀리는 기록까지. */
  private capacityRetrySeconds(at: number): number {
    let earliest = Number.POSITIVE_INFINITY;
    for (const entry of this.entries.values()) {
      if (entry.inFlight > 0) return 1;
      // 기록은 마지막 실패가 집계 기간을 벗어나야 비므로 가장 늦은 실패 기준이다.
      const expiry = entry.blockedUntil ?? Math.max(...entry.failures) + this.options.windowMs;
      if (expiry < earliest) earliest = expiry;
    }
    return Number.isFinite(earliest) ? seconds(earliest - at) : 1;
  }
}

import { HashGate, HashGateOptions } from './hash-gate';
import { LinkLimiter, LinkLimitOptions } from './link-limiter';
import { DEFAULT_UNLOCK_LIMIT, UnlockLimiter, UnlockLimitOptions } from './unlock-limiter';

/** unlock 시도 제한 정책. 주소별 제한·링크 전체 제한·전체 해시 자원 상한을 한 곳에서 정한다. */
export interface UnlockPolicy {
  address: UnlockLimitOptions;
  link: LinkLimitOptions;
  hash: HashGateOptions;
}

export interface UnlockControls {
  addresses: UnlockLimiter;
  links: LinkLimiter;
  hashes: HashGate;
}

export const UNLOCK_POLICY = Symbol('UNLOCK_POLICY');
export const UNLOCK_CONTROLS = Symbol('UNLOCK_CONTROLS');

const MIN = 60 * 1000;

/**
 * 운영 정책값.
 * - 주소별: #150 9/29 결정(15분에 10번 → 15분 차단, 기록 1만 개, 같은 링크·주소 대기 3개).
 * - 링크 전체 실패 상한(`link.maxFailures`): **미정**. PR #195 Ready 전환 전에 정한다. null인 동안 api는 기동하지 않는다
 *   (`createUnlockControls`가 거부). 시험은 20·30·50을 주입해 검사하고, 제한 없는 구성은 시험에서만 명시적으로 허용한다.
 * - 링크별 검사 중 3개, 링크 기록 1만 개, 실행 중 해시 2개, 대기 20개: 10/4 정책 초안의 제안값.
 */
export const PRODUCT_UNLOCK_POLICY: UnlockPolicy = Object.freeze({
  address: DEFAULT_UNLOCK_LIMIT,
  link: { maxFailures: null, windowMs: 15 * MIN, blockMs: 15 * MIN, maxInFlight: 3, maxEntries: 10_000 },
  hash: { maxRunning: 2, maxWaiting: 20 },
});

const positiveInteger = (value: unknown) => Number.isInteger(value) && (value as number) >= 1;

/**
 * 시험 전용 허용 표식. 시험 실행기(scripts/test-with-db.cjs)가 미리 불러오는 test/support/allow-unlimited-unlock-link.cjs만 켠다.
 * api 설정값(환경변수·.env)으로는 켤 수 없다. 켜져 있으면 링크 전체 실패 상한이 null인 정책으로도 앱을 만든다.
 */
const ALLOW_UNLIMITED_LINK_FOR_TESTS = Symbol.for('catchu.test.allowUnlimitedUnlockLink');

export function unlimitedLinkAllowedForTests(): boolean {
  return (globalThis as Record<symbol, unknown>)[ALLOW_UNLIMITED_LINK_FOR_TESTS] === true;
}

/**
 * 정책값을 확인하고 제한 장치를 만든다. 값이 틀리면 기동을 멈춘다.
 * 링크 전체 실패 상한이 null이면 `allowUnlimitedLink`를 명시한 경우(시험)에만 만들고, 아니면 거부한다.
 */
export function createUnlockControls(policy: UnlockPolicy, { allowUnlimitedLink = false } = {}): UnlockControls {
  const { address, link, hash } = policy;
  if (link.maxFailures === null && !allowUnlimitedLink) {
    throw new Error('unlock 링크 전체 실패 상한(link.maxFailures)이 정해지지 않아 api를 시작할 수 없습니다(unlock-policy.ts).');
  }
  const integers = [
    address.maxFailures, address.windowMs, address.blockMs, address.maxEntries, address.maxPendingPerKey,
    link.windowMs, link.blockMs, link.maxInFlight, link.maxEntries, hash.maxRunning, hash.maxWaiting,
  ];
  if (!integers.every(positiveInteger) || !(link.maxFailures === null || positiveInteger(link.maxFailures))) {
    throw new Error('unlock 시도 제한 정책값은 1 이상의 정수여야 합니다.');
  }
  return { addresses: new UnlockLimiter(address), links: new LinkLimiter(link), hashes: new HashGate(hash) };
}

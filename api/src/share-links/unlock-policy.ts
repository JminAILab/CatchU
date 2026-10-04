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
 * - 링크 전체 실패 상한(`link.maxFailures`) 30: 2026-10-05 담당자 결정의 초기 정책값. 실측으로 검증한 최적값이 아니며,
 *   정상 수신자 차단 영향과 운영 결과에 따라 바꿀 수 있다. 시험은 이 값과 후보 20·50으로 같은 규칙을 검사한다.
 * - 링크별 검사 중 3개, 링크 기록 1만 개, 실행 중 해시 2개, 대기 20개: 10/4 정책 초안의 제안값.
 */
export const PRODUCT_UNLOCK_POLICY: UnlockPolicy = Object.freeze({
  address: DEFAULT_UNLOCK_LIMIT,
  link: { maxFailures: 30, windowMs: 15 * MIN, blockMs: 15 * MIN, maxInFlight: 3, maxEntries: 10_000 },
  hash: { maxRunning: 2, maxWaiting: 20 },
});

const positiveInteger = (value: unknown) => Number.isInteger(value) && (value as number) >= 1;

/** 정책값을 확인하고 제한 장치를 만든다. 값이 틀리면 기동을 멈춘다. */
export function createUnlockControls(policy: UnlockPolicy): UnlockControls {
  const { address, link, hash } = policy;
  const integers = [
    address.maxFailures, address.windowMs, address.blockMs, address.maxEntries, address.maxPendingPerKey,
    link.maxFailures, link.windowMs, link.blockMs, link.maxInFlight, link.maxEntries, hash.maxRunning, hash.maxWaiting,
  ];
  if (!integers.every(positiveInteger)) {
    throw new Error('unlock 시도 제한 정책값은 1 이상의 정수여야 합니다.');
  }
  return { addresses: new UnlockLimiter(address), links: new LinkLimiter(link), hashes: new HashGate(hash) };
}

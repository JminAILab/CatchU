import { RateLimitOptions } from './request-rate-limiter';

export const SHARE_LINK_ISSUE_LIMITER = Symbol('SHARE_LINK_ISSUE_LIMITER');

/**
 * 회원별 링크 발급 빈도(#219, 2026-10-06 팀장 결정): 같은 회원은 1분에 10번까지 발급을 요청할 수 있다.
 * 유효 링크는 5개가 한도라 정상 사용(같은 키 재요청·한도 거절 포함)에는 넉넉하고, 넘는 요청은 비밀번호 해시 전에 거부된다.
 * 값은 계약에 적지 않는다(계약 요약의 발급 규칙, #235). 기록 상한은 다른 시도 제한 기록과 같은 1만 개다.
 */
export const PRODUCT_ISSUE_RATE_LIMIT: RateLimitOptions = Object.freeze({ maxRequests: 10, windowMs: 60 * 1000, maxKeys: 10_000 });

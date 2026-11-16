import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { ApiError } from '../common/errors';

const TTL_MS = 10 * 60 * 1000;
const CAPACITY = 1000;
const digest = (value: string) => createHash('sha256').update(value).digest();
export interface LoginAttempt { verifier: string; nonce: string; expiresAt: number; initiatorDigest: Buffer }

/** 시작 브라우저만 보유한 확인값으로 콜백 전달·로그인 CSRF를 막는다. */
export class LoginAttempts {
  private readonly entries = new Map<string, LoginAttempt>();

  constructor(private readonly now: () => number = Date.now) {}

  create() {
    for (const [key, value] of this.entries) if (value.expiresAt <= this.now()) this.entries.delete(key);
    // 가득 차면 새 시작을 거부하지 않고 가장 오래된 시도 하나를 버린다. 수명이 모두 같아 Map의 첫 항목이 가장 오래됐다.
    // 버려진 시도의 완료는 없는 시도와 같이 AUTH_INVALID이고, 그 사람은 로그인을 다시 시작한다.
    if (this.entries.size >= CAPACITY) {
      const oldest = this.entries.keys().next();
      if (!oldest.done) this.entries.delete(oldest.value);
    }
    const state = randomBytes(32).toString('base64url');
    const loginAttemptToken = randomBytes(32).toString('base64url');
    const verifier = randomBytes(32).toString('base64url');
    const nonce = randomBytes(32).toString('base64url');
    this.entries.set(digest(state).toString('hex'), {
      verifier, nonce, expiresAt: this.now() + TTL_MS, initiatorDigest: digest(loginAttemptToken),
    });
    return { state, loginAttemptToken, verifier, nonce, expiresIn: TTL_MS / 1000 };
  }

  consume(state: string, loginAttemptToken: string): LoginAttempt {
    const key = digest(state).toString('hex');
    const attempt = this.entries.get(key);
    if (!attempt || attempt.expiresAt <= this.now()) {
      this.entries.delete(key);
      throw new ApiError('AUTH_INVALID');
    }
    if (!timingSafeEqual(attempt.initiatorDigest, digest(loginAttemptToken))) throw new ApiError('AUTH_INVALID');
    this.entries.delete(key); // 외부 호출·DB 실패 후에도 재사용하지 않는다.
    return attempt;
  }
}

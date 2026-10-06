export interface AuthConfig {
  signingKey: Uint8Array;
  accessTokenTtlSeconds: number;
  devLoginEnabled: boolean;
}

export const AUTH_CONFIG = Symbol('AUTH_CONFIG');

export function readAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  // 설정 오류에도 실제 비밀값을 포함하지 않는다. 기본 서명 키는 없다.
  const secret = env.AUTH_JWT_SECRET;
  if (!secret || !/^[a-fA-F0-9]{64}$/.test(secret)) {
    throw new Error('AUTH_JWT_SECRET must be a random 32-byte key encoded as 64 hex characters');
  }

  const ttl = env.AUTH_ACCESS_TOKEN_TTL_SECONDS;
  const seconds = Number(ttl);
  if (!ttl || !/^[1-9]\d*$/.test(ttl) || !Number.isSafeInteger(seconds) ||
      !Number.isSafeInteger(Math.floor(Date.now() / 1000) + seconds)) {
    throw new Error('AUTH_ACCESS_TOKEN_TTL_SECONDS must be a positive safe integer');
  }

  return {
    signingKey: Buffer.from(secret, 'hex'),
    accessTokenTtlSeconds: seconds,
    devLoginEnabled: env.DEV_LOGIN_ENABLED === 'true' &&
      (env.NODE_ENV === 'development' || env.NODE_ENV === 'test'),
  };
}

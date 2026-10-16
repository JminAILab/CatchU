import { isDevelopmentOrTest } from '../common/node-env';
import { ACCESS_SECONDS } from './session.config';

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
  if (ttl !== String(ACCESS_SECONDS)) {
    throw new Error('AUTH_ACCESS_TOKEN_TTL_SECONDS must be 900 (#250: Access 15 minutes)');
  }

  return {
    signingKey: Buffer.from(secret, 'hex'),
    accessTokenTtlSeconds: seconds,
    devLoginEnabled: env.DEV_LOGIN_ENABLED === 'true' && isDevelopmentOrTest(env),
  };
}

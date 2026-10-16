import { timingSafeEqual } from 'node:crypto';
import { ApiError } from '../common/errors';

export type WorkerContextAuthConfig = { enabled: false } | { enabled: true; key: Buffer };
export const WORKER_CONTEXT_AUTH_CONFIG = Symbol('WORKER_CONTEXT_AUTH_CONFIG');

export function readWorkerContextAuthConfig(env: NodeJS.ProcessEnv = process.env): WorkerContextAuthConfig {
  const enabled = env.WORKER_CONTEXT_ENABLED;
  if (enabled === undefined || enabled === '' || enabled === 'false') return { enabled: false };
  if (enabled !== 'true') throw new Error('WORKER_CONTEXT_ENABLED must be true or false');
  const key = env.WORKER_CONTEXT_API_KEY;
  if (!key || !/^[a-fA-F0-9]{64}$/.test(key)) {
    throw new Error('WORKER_CONTEXT_API_KEY must be a random 32-byte key encoded as 64 hex characters');
  }
  if ([env.AUTH_JWT_SECRET, env.LINK_GRANT_SECRET, env.GITHUB_CREDENTIAL_ENCRYPTION_KEY]
    .some(other => other?.toLowerCase() === key.toLowerCase())) {
    throw new Error('WORKER_CONTEXT_API_KEY must be independent from other keys');
  }
  return { enabled: true, key: Buffer.from(key.toLowerCase(), 'ascii') };
}

/** 내부 메서드의 서비스 키만 검사한다. 회원 JWT로 대체하거나 혼용하지 않는다. */
export function requireWorkerContextKey(config: WorkerContextAuthConfig, headers: {
  authorization?: string; 'x-worker-key'?: string | string[];
}): void {
  if (!config.enabled) throw new ApiError('RESOURCE_UNAVAILABLE');
  if (headers.authorization !== undefined) throw new ApiError('AUTH_INVALID');
  const supplied = headers['x-worker-key'];
  if (supplied === undefined) throw new ApiError('AUTH_REQUIRED');
  if (typeof supplied !== 'string' || !/^[a-fA-F0-9]{64}$/.test(supplied) ||
      !timingSafeEqual(config.key, Buffer.from(supplied.toLowerCase(), 'ascii'))) {
    throw new ApiError('AUTH_INVALID');
  }
}

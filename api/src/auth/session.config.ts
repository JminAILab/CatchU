import { isDevelopmentOrTest } from '../common/node-env';

export const SESSION_CONFIG = Symbol('SESSION_CONFIG');
export const SESSION_CLOCK = Symbol('SESSION_CLOCK');
export const ACCESS_SECONDS = 900;
export const SESSION_MAX_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_IDLE_MS = 24 * 60 * 60 * 1000;
export const REFRESH_COOKIE = 'catchu_refresh';
export const REFRESH_PATH = '/v1/auth';
export interface SessionConfig { allowedOrigin: string; secureCookie: boolean }

export function readSessionConfig(env: NodeJS.ProcessEnv = process.env): SessionConfig {
  const development = isDevelopmentOrTest(env);
  const value = env.AUTH_WEB_ORIGIN ?? (development ? 'http://localhost:3000' : '');
  const parsed = URL.canParse(value) ? new URL(value) : null;
  const loopback = parsed && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (!parsed || parsed.origin !== value || parsed.username || parsed.password ||
      (parsed.protocol !== 'https:' && !(development && loopback && parsed.protocol === 'http:'))) {
    throw new Error('AUTH_WEB_ORIGIN은 정확한 HTTPS 출처여야 합니다. 개발·test만 loopback HTTP를 허용합니다.');
  }
  return { allowedOrigin: value, secureCookie: parsed.protocol === 'https:' };
}

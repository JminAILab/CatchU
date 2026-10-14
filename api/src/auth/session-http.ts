import { ApiError } from '../common/errors';
import { SessionConfig, REFRESH_COOKIE, REFRESH_PATH } from './session.config';

export interface CookieResponse { setHeader(name: string, value: string): unknown }
export interface SessionRequest { headers: { origin?: string; cookie?: string } }

export function assertSessionOrigin(request: SessionRequest, config: SessionConfig) {
  if (request.headers.origin !== config.allowedOrigin) throw new ApiError('AUTH_ORIGIN_FORBIDDEN');
}

export function readRefreshCookie(request: SessionRequest): string | undefined {
  const values = (request.headers.cookie ?? '').split(';').map(part => part.trim())
    .filter(part => part.startsWith(REFRESH_COOKIE + '='));
  // 서로 다른 Path의 중복 쿠키를 임의 선택하지 않는다.
  if (values.length !== 1) return undefined;
  return values[0].slice(REFRESH_COOKIE.length + 1);
}

export function writeRefreshCookie(response: CookieResponse, config: SessionConfig, value: string, expires: Date) {
  response.setHeader('Set-Cookie', `${REFRESH_COOKIE}=${value}; Path=${REFRESH_PATH}; HttpOnly; SameSite=Strict; Expires=${expires.toUTCString()}${config.secureCookie ? '; Secure' : ''}`);
}

export function clearRefreshCookie(response: CookieResponse, config: SessionConfig) {
  response.setHeader('Set-Cookie', `${REFRESH_COOKIE}=; Path=${REFRESH_PATH}; HttpOnly; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${config.secureCookie ? '; Secure' : ''}`);
}

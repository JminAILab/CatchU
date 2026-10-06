import { randomBytes } from 'node:crypto';

/**
 * 공유 링크 토큰과 수신자 URL.
 * 토큰은 계약상 공유 URL(발급·목록 응답의 `url`)에만 포함하며, 별도 필드·쿼리·로그·오류 메시지에는 노출하지 않는다.
 * 수신자 주소는 web의 `/s/[token]`이다(#171 web README 「페이지 주소」, `recipientLinkPath`).
 */

const TOKEN_BYTES = 32;
// 32바이트를 base64url로 쓰면 패딩 없이 43자다.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** 추측할 수 없는 256비트 난수 토큰을 만든다. */
export function generateLinkToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/** 수신자 경로로 받은 값이 토큰 형식인지. 형식이 다르면 조회하지 않고 없는 링크와 같게 응답한다. */
export function isLinkTokenFormat(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_PATTERN.test(value);
}

/**
 * web 기준 주소와 토큰으로 수신자 URL을 만든다.
 * 기준 주소는 http·https만 허용하고 쿼리·조각·계정 정보를 넣지 못하게 한다. 끝의 `/`는 하나로 정리한다.
 * 기준 주소는 공유 URL 전용 설정 하나로 받는다. 여러 개일 수 있는 CORS 허용 출처(#106 PR②)와 따로 관리하며,
 * 변수 이름은 발급 API 연결 때 정한다.
 */
export function buildRecipientLinkUrl(webBaseUrl: string, token: string): string {
  if (!isLinkTokenFormat(token)) throw new TypeError('invalid link token');
  let base: URL;
  try {
    base = new URL(webBaseUrl);
  } catch {
    throw new TypeError('web base URL must be an absolute http(s) URL');
  }
  if ((base.protocol !== 'https:' && base.protocol !== 'http:') || base.search || base.hash
    || base.username || base.password) {
    throw new TypeError('web base URL must be an absolute http(s) URL without query, fragment or credentials');
  }
  const path = base.pathname.replace(/\/+$/, '');
  return `${base.origin}${path}/s/${token}`;
}

import { createRemoteJWKSet, customFetch, jwtVerify } from 'jose';
import { ApiError } from '../common/errors';
import { GoogleConfig } from './google.config';

export const GOOGLE_PROVIDER = Symbol('GOOGLE_PROVIDER');
export interface GoogleIdentity { subject: string; name: string | null }
export interface GoogleProvider {
  exchange(code: string, verifier: string, nonce: string): Promise<GoogleIdentity>;
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const KEYS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const MAX_RESPONSE_BYTES = 65536;
const DEADLINE_MS = 10000;

/** 고정 전송 대상과 시간·본문 상한. 외부 오류 원문은 전달하지 않는다. */
async function boundedJson(fetcher: typeof fetch, url: string, init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEADLINE_MS);
  try {
    const response = await fetcher(url, { ...init, redirect: 'manual', signal: controller.signal });
    if (!response.body) throw new ApiError('INTERNAL_ERROR');
    const reader = response.body.getReader();
    const parts: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > MAX_RESPONSE_BYTES) throw new ApiError('INTERNAL_ERROR');
        parts.push(value);
      }
    } finally { await reader.cancel(); }
    const parsed: unknown = JSON.parse(Buffer.concat(parts).toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new ApiError('INTERNAL_ERROR');
    return { status: response.status, data: parsed as Record<string, unknown> };
  } catch {
    throw new ApiError('INTERNAL_ERROR');
  } finally { clearTimeout(timer); }
}

/** 검증 라이브러리를 재사용하고 Google access/refresh token은 저장·공개하지 않는다. */
export class HttpGoogleProvider implements GoogleProvider {
  private readonly keys;

  constructor(private readonly config: GoogleConfig, private readonly fetcher: typeof fetch = (...args) => fetch(...args)) {
    this.keys = createRemoteJWKSet(new URL(KEYS_URL), {
      timeoutDuration: DEADLINE_MS,
      [customFetch]: async () => {
        const result = await boundedJson(this.fetcher, KEYS_URL, { method: 'GET' });
        if (result.status !== 200) throw new ApiError('INTERNAL_ERROR');
        return new Response(JSON.stringify(result.data), { status: 200, headers: { 'Content-Type': 'application/json' } });
      },
    });
  }

  async exchange(code: string, verifier: string, nonce: string): Promise<GoogleIdentity> {
    const result = await boundedJson(this.fetcher, TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ client_id: this.config.clientId, client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri, code, code_verifier: verifier, grant_type: 'authorization_code' }),
    });
    if (result.status === 400 && ['invalid_grant', 'access_denied'].includes(String(result.data.error))) {
      throw new ApiError('AUTH_INVALID');
    }
    if (result.status !== 200 || typeof result.data.id_token !== 'string') throw new ApiError('INTERNAL_ERROR');
    try {
      const { payload } = await jwtVerify(result.data.id_token, this.keys, {
        algorithms: ['RS256'], issuer: ['https://accounts.google.com', 'accounts.google.com'],
        audience: this.config.clientId, requiredClaims: ['sub', 'iat', 'exp', 'nonce'],
      });
      if (typeof payload.sub !== 'string' || !/^[\x21-\x7e]{1,255}$/.test(payload.sub) ||
          payload.nonce !== nonce || !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp) ||
          payload.iat! > Math.floor(Date.now() / 1000) || payload.exp! <= payload.iat! ||
          (payload.azp !== undefined && payload.azp !== this.config.clientId) ||
          (Array.isArray(payload.aud) && payload.aud.length !== 1)) {
        throw new ApiError('AUTH_INVALID');
      }
      return { subject: payload.sub, name: typeof payload.name === 'string' ? payload.name : null };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      // 공개키 조회·설정 오류와 서명·만료 등의 인증 거부를 구분한다.
      const code = (error as { code?: unknown })?.code;
      if (['ERR_JWKS_INVALID', 'ERR_JWK_INVALID', 'ERR_JWKS_TIMEOUT'].includes(String(code))) {
        throw new ApiError('INTERNAL_ERROR');
      }
      throw new ApiError('AUTH_INVALID');
    }
  }
}

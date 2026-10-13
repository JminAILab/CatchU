import { Inject, Injectable } from '@nestjs/common';
import { inspect } from 'node:util';
import { GITHUB_CONFIG, GitHubConfig } from './github.config';

/** JSON·문자열·디버그 출력에 토큰을 포함하지 않는다. 명시적 GitHub 호출/인계에서만 reveal한다. */
export class GitHubAccessToken {
  #value: string;
  constructor(value: string) {
    if (!/^[!-~]{1,2048}$/.test(value)) throw new GitHubProviderError('invalidResponse');
    this.#value = value;
  }
  reveal(): string { return this.#value; }
  toJSON(): string { return '[redacted]'; }
  toString(): string { return '[redacted]'; }
  [inspect.custom](): string { return 'GitHubAccessToken([redacted])'; }
}
export class GitHubProviderError extends Error {
  constructor(readonly reason: 'invalidResponse' | 'unavailable' | 'revoked' | 'scopeRejected') {
    super('GitHub 자격정보를 확인하지 못했습니다.');
  }
}
export interface GitHubIdentity { accountLogin: string; externalAccountReference: string }
export interface GitHubIssuedCredential extends GitHubIdentity { token: GitHubAccessToken; expiresAt: Date }

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new GitHubProviderError('invalidResponse');
  return value as Record<string, unknown>;
}
function requireNoScopes(value: unknown): void {
  if (typeof value !== 'string' || value.trim() !== '') throw new GitHubProviderError('scopeRejected');
}
export function providerExpiresAt(expiresIn: unknown, requestedAt: number): Date {
  // 네트워크 대기만큼 수명을 과대평가하지 않도록 요청 시작 시각에서 계산한다.
  if (!Number.isSafeInteger(expiresIn) || (expiresIn as number) <= 0 || !Number.isSafeInteger(requestedAt)) {
    throw new GitHubProviderError('invalidResponse');
  }
  const expiresAt = new Date(requestedAt + (expiresIn as number) * 1000);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) throw new GitHubProviderError('invalidResponse');
  return expiresAt;
}

@Injectable()
export class GitHubClient {
  constructor(@Inject(GITHUB_CONFIG) private readonly config: GitHubConfig) {}
  /** 외부 호스트는 상수. redirect·재시도 없음, 헤더/본문을 로그로 출력하지 않음. */
  private async request(url: string, init: RequestInit): Promise<{ response: Response; body: Record<string, unknown> }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    let response: Response | undefined;
    try {
      response = await fetch(url, { ...init, redirect: 'error', signal: controller.signal });
      if (response.status === 401) throw new GitHubProviderError('revoked');
      if (!response.ok) throw new GitHubProviderError('unavailable');
      const reader = response.body?.getReader();
      if (!reader) throw new GitHubProviderError('invalidResponse');
      const parts: Uint8Array[] = [];
      let length = 0;
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          length += chunk.value.length;
          if (length > 65536) throw new GitHubProviderError('invalidResponse');
          parts.push(chunk.value);
        }
      } finally { reader.releaseLock(); }
      const body = record(JSON.parse(Buffer.concat(parts).toString('utf8')) as unknown);
      return { response, body };
    } catch (error) {
      if (error instanceof GitHubProviderError) throw error;
      throw new GitHubProviderError('unavailable');
    } finally {
      clearTimeout(timer);
      if (response?.body && !response.body.locked) await response.body.cancel().catch(() => undefined);
    }
  }
  async identity(token: GitHubAccessToken): Promise<GitHubIdentity> {
    const { response, body } = await this.request('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token.reveal()}`, Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28' },
    });
    // scope를 생략해도 과거의 넓은 권한이 돌아올 수 있으므로 실제 부여값을 검사한다.
    requireNoScopes(response.headers.get('x-oauth-scopes'));
    if (typeof body.login !== 'string' || !/^[a-zA-Z0-9-]{1,39}$/.test(body.login)
        || !Number.isSafeInteger(body.id) || (body.id as number) <= 0) throw new GitHubProviderError('invalidResponse');
    return { accountLogin: body.login, externalAccountReference: String(body.id) };
  }
  async exchange(code: string, verifier: string): Promise<GitHubIssuedCredential> {
    if (!this.config.enabled) throw new GitHubProviderError('unavailable');
    const requestedAt = Date.now();
    const { body } = await this.request('https://github.com/login/oauth/access_token', {
      method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: this.config.clientId, client_secret: this.config.clientSecret,
        redirect_uri: this.config.callbackUrl, code, code_verifier: verifier }).toString(),
    });
    if (body.error || body.token_type !== 'bearer' || typeof body.access_token !== 'string') {
      throw new GitHubProviderError('invalidResponse');
    }
    requireNoScopes(body.scope);
    const expiresAt = providerExpiresAt(body.expires_in, requestedAt);
    const token = new GitHubAccessToken(body.access_token);
    const identity = await this.identity(token);
    if (expiresAt.getTime() <= Date.now()) throw new GitHubProviderError('invalidResponse');
    // refresh_token은 반환·저장하지 않는다.
    return { ...identity, token, expiresAt };
  }
}

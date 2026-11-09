// OAuth 저장 단계(U6 기능 설계 BR2·BR3.1·BR4, 비기능 설계 security-design 「SDK와 U6이 나눠 맡는 일」·「토큰 확인 함수」, reliability-design 「트랜잭션 경계」).
// 메타데이터, 요청 형식, PKCE 비교, IP 제한, 401 응답은 SDK가 맡는다. 여기는 표를 읽고 쓰는 일과 BR의 거부만 맡는다.
// revokeToken을 구현하지 않아 /revoke가 생기지 않는다(BR1.1). 해제는 CatchU 화면의 전체 해제뿐이다.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  CustomOAuthError, InvalidClientMetadataError, InvalidGrantError, InvalidRequestError, InvalidTokenError, OAuthError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type { AuthorizationParams, OAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { OAuthClientInformationFull, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { Response } from 'express';
import { DataSource, EntityManager } from 'typeorm';
import { errorName } from '../ai-run/ai-run-spec';
import { isSameResource, MCP_CONFIG, McpConfig } from './mcp-config';
import { MCP_CLIENT_NAME_MAX_LENGTH } from './mcp-limits';
import { createMcpLogger, McpExchangeRefusal, McpLogger, McpOAuthStep, writeMcpLog } from './mcp-log';

/**
 * 토큰 상태 실패 넷(없는 토큰·만료·해제·회원 상태)이 함께 쓰는 문구(BR4.8). WWW-Authenticate 헤더에 들어가므로 ASCII로 둔다.
 * 이유를 구분해 알리지 않는다.
 */
export const TOKEN_REJECTED = 'The access token is not valid';
const GRANT_REJECTED = 'The authorization code is not valid';
const REDIRECT_REJECTED = 'redirect_uris must match the allowed list exactly';
const CLIENT_NAME_REJECTED = 'client_name is too long or contains a NUL character';
const RESOURCE_REJECTED = 'resource must be this MCP server';

/** 토큰 교환 때 그 회원의 만료된 행을 함께 지운다. 타이머를 두지 않고 다른 회원의 행은 건드리지 않는다(BR4.4). */
const DELETE_EXPIRED_ROWS = [
  'DELETE FROM mcp_access_token WHERE member_id = $1 AND expires_at < $2',
  'DELETE FROM mcp_connection WHERE member_id = $1 AND expires_at < $2',
  'DELETE FROM mcp_authorization_code WHERE member_id = $1 AND expires_at < $2',
] as const;

/** 코드·토큰 원문의 SHA-256. 표에는 이 값만 저장한다(NFR1.4). */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** 코드·토큰으로 쓰는 안전한 난수 32바이트(NFR1.4). */
export function newOAuthSecret(): string {
  return randomBytes(32).toString('base64url');
}

/** 트랜잭션 안에서 던져 되돌리는 거부. 응답은 모두 invalid_grant이고 reason은 로그에만 남는다. */
class ExchangeRefused extends InvalidGrantError {
  constructor(readonly reason: McpExchangeRefusal) {
    super(GRANT_REJECTED);
  }
}

interface ConsumedCode {
  memberId: string;
  mcpClientId: string;
  redirectUri: string;
  consentedAt: Date;
}

@Injectable()
export class McpOAuthProvider implements OAuthServerProvider {
  private readonly logger: McpLogger = createMcpLogger();

  readonly clientsStore: OAuthRegisteredClientsStore = {
    getClient: (clientId) => this.getClient(clientId),
    registerClient: (client) => this.registerClient(client),
  };

  constructor(private readonly dataSource: DataSource, @Inject(MCP_CONFIG) private readonly config: McpConfig) {}

  /** 비밀값이 없는 정보만 돌려준다. SDK는 client_secret이 있을 때만 비밀값을 확인한다. NUL이 든 값은 text 칸에 있을 수 없으므로 없는 클라이언트다. */
  private getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    return this.logFailure('client', async () => {
      if (clientId.includes('\0')) return undefined;
      const rows = await this.dataSource.query('SELECT redirect_uris AS "redirectUris" FROM mcp_client WHERE mcp_client_id = $1', [clientId]) as
        { redirectUris: string[] }[];
      if (rows.length === 0) return undefined;
      return { client_id: clientId, redirect_uris: rows[0].redirectUris, token_endpoint_auth_method: 'none' };
    });
  }

  /**
   * SDK는 인증 방식이 none이 아니면 비밀값을 만들어 넘기고 반환값을 그대로 응답한다. 그래서 여기서 지우고 none으로 바꾼다(BR2.1).
   * 새 등록과 함께 승인에 쓰이지 않고 7일이 지난 등록을 지운다(BR2.4). 등록은 트랜잭션이 아니다.
   */
  private registerClient(client: Omit<OAuthClientInformationFull, 'client_id' | 'client_id_issued_at'>): Promise<OAuthClientInformationFull> {
    return this.logFailure('register', async () => {
      const uris = client.redirect_uris;
      if (uris.length === 0 || uris.some((uri) => !this.config.redirectUris.includes(uri))) {
        throw new CustomOAuthError('invalid_redirect_uri', REDIRECT_REJECTED);
      }
      if (client.client_name !== undefined && (client.client_name.length > MCP_CLIENT_NAME_MAX_LENGTH || client.client_name.includes('\0'))) {
        throw new InvalidClientMetadataError(CLIENT_NAME_REJECTED);
      }
      const registered: OAuthClientInformationFull = { ...(client as OAuthClientInformationFull), token_endpoint_auth_method: 'none' };
      delete registered.client_secret;
      delete registered.client_secret_expires_at;
      await this.dataSource.query(`DELETE FROM mcp_client WHERE approved_at IS NULL AND registered_at < now() - interval '7 days'`);
      await this.dataSource.query(
        'INSERT INTO mcp_client (mcp_client_id, client_name, redirect_uris, registered_at) VALUES ($1, $2, $3, $4)',
        [registered.client_id, client.client_name ?? null, uris, new Date()],
      );
      return registered;
    });
  }

  /** SDK가 클라이언트·돌아갈 주소·PKCE 형식을 확인한 뒤 부른다. 값을 쿼리로 승인 화면에 넘긴다(BR3.1). */
  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    if (params.resource !== undefined && !isSameResource(this.config.mcpUrl, params.resource.href)) {
      throw new InvalidRequestError(RESOURCE_REJECTED);
    }
    const screen = new URL(this.config.authorizeScreenUrl);
    screen.searchParams.set('client_id', client.client_id);
    screen.searchParams.set('redirect_uri', params.redirectUri);
    if (params.state !== undefined) screen.searchParams.set('state', params.state);
    screen.searchParams.set('code_challenge', params.codeChallenge);
    if (params.resource !== undefined) screen.searchParams.set('resource', params.resource.href);
    res.redirect(302, screen.href);
  }

  /** PKCE 비교는 SDK가 이 값으로 트랜잭션 밖에서 먼저 한다. 틀리면 코드를 소비하지 않는다(BR4.3). */
  challengeForAuthorizationCode(_client: OAuthClientInformationFull, authorizationCode: string): Promise<string> {
    return this.logFailure('token', async () => {
      const rows = await this.dataSource.query('SELECT code_challenge AS "codeChallenge" FROM mcp_authorization_code WHERE code_hash = $1', [sha256Hex(authorizationCode)]) as
        { codeChallenge: string }[];
      if (rows.length === 0) {
        writeMcpLog(this.logger, { event: 'mcp_token_exchange_refused', reason: 'code_missing' });
        throw new InvalidGrantError(GRANT_REJECTED);
      }
      return rows[0].codeChallenge;
    });
  }

  /** 거부는 트랜잭션 안에서 던져 되돌리고 로그는 되돌린 뒤 남긴다. 되돌리므로 코드는 쓰지 않은 채 남는다(reliability-design). */
  exchangeAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string, _codeVerifier?: string, redirectUri?: string, resource?: URL): Promise<OAuthTokens> {
    return this.logFailure('token', async () => {
      try {
        return await this.dataSource.transaction('READ COMMITTED', (manager) => this.exchange(manager, client, authorizationCode, redirectUri, resource));
      } catch (error) {
        if (error instanceof ExchangeRefused) writeMcpLog(this.logger, { event: 'mcp_token_exchange_refused', reason: error.reason });
        throw error;
      }
    });
  }

  /** 갱신 토큰을 발급하지 않으므로 언제나 거부한다. 만료되면 다시 승인한다(BR4.5). */
  async exchangeRefreshToken(): Promise<OAuthTokens> {
    throw new InvalidGrantError(GRANT_REJECTED);
  }

  /**
   * 요청마다 저장된 토큰·만료·연결·회원 상태를 확인한다(BR4.7). 연결을 지우면 복합 외래 키로 토큰도 없어져 "없는 토큰"과 같다.
   * 함수가 먼저 만료를 거부해 SDK의 Token has expired 문구가 나오지 않게 하고, DB 실패는 401로 바꾸지 않는다(BR4.8).
   * expiresAt을 내리면 마지막 1초 동안 SDK가 만료로 보므로 내리지 않는다.
   */
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const row = await this.readToken(sha256Hex(token));
    if (!row || row.accountState !== 'ACTIVE' || row.expiresAt.getTime() <= Date.now()) throw new InvalidTokenError(TOKEN_REJECTED);
    return { token, clientId: row.clientId, scopes: [], expiresAt: row.expiresAt.getTime() / 1000, extra: { memberId: row.memberId } };
  }

  private async readToken(tokenHash: string) {
    try {
      const rows = await this.dataSource.query(`SELECT t.member_id AS "memberId", t.mcp_client_id AS "clientId", t.expires_at AS "expiresAt", m.account_state AS "accountState"
        FROM mcp_access_token t JOIN member_account m ON m.member_id = t.member_id WHERE t.token_hash = $1`, [tokenHash]) as
        { memberId: string; clientId: string; expiresAt: Date; accountState: string }[];
      return rows.length === 0 ? null : rows[0];
    } catch (error) {
      writeMcpLog(this.logger, { event: 'mcp_token_check_failed', error: errorName(error) });
      throw error;
    }
  }

  /** 코드 소비 → 돌아갈 주소·클라이언트·resource 확인 → 연결 쓰기 → 그 짝의 토큰 교체 → 그 회원의 만료 행 삭제(BR4.3·BR4.4). */
  private async exchange(manager: EntityManager, client: OAuthClientInformationFull, authorizationCode: string, redirectUri: string | undefined, resource: URL | undefined): Promise<OAuthTokens> {
    const now = new Date();
    const code = await this.consumeCode(manager, sha256Hex(authorizationCode), now);
    if (code.mcpClientId !== client.client_id) throw new ExchangeRefused('client');
    if (redirectUri !== code.redirectUri) throw new ExchangeRefused('redirect_uri');
    if (resource !== undefined && !isSameResource(this.config.mcpUrl, resource.href)) throw new ExchangeRefused('resource');

    const seconds = this.config.accessTokenTtlSeconds;
    const expiresAt = new Date(now.getTime() + seconds * 1000);
    await manager.query(`INSERT INTO mcp_connection (connection_id, member_id, mcp_client_id, consented_at, expires_at) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (member_id, mcp_client_id) DO UPDATE SET consented_at = EXCLUDED.consented_at, expires_at = EXCLUDED.expires_at`,
    [randomUUID(), code.memberId, code.mcpClientId, code.consentedAt, expiresAt]);
    const token = newOAuthSecret();
    await manager.query('DELETE FROM mcp_access_token WHERE member_id = $1 AND mcp_client_id = $2', [code.memberId, code.mcpClientId]);
    await manager.query('INSERT INTO mcp_access_token (token_hash, member_id, mcp_client_id, expires_at) VALUES ($1, $2, $3, $4)',
      [sha256Hex(token), code.memberId, code.mcpClientId, expiresAt]);
    for (const statement of DELETE_EXPIRED_ROWS) await manager.query(statement, [code.memberId, now]);
    return { access_token: token, token_type: 'bearer', expires_in: seconds };
  }

  /** usedAt이 비어 있고 만료 전인 코드만 소비한다. 행을 잠그므로 진행 중인 해제·교환이 이 커밋을 기다린다(functional-spec W6). */
  private async consumeCode(manager: EntityManager, codeHash: string, now: Date): Promise<ConsumedCode> {
    const [rows] = await manager.query(`UPDATE mcp_authorization_code SET used_at = $2 WHERE code_hash = $1 AND used_at IS NULL AND expires_at > $2
      RETURNING member_id AS "memberId", mcp_client_id AS "mcpClientId", redirect_uri AS "redirectUri", consented_at AS "consentedAt"`, [codeHash, now]) as [ConsumedCode[], number];
    if (rows.length > 0) return rows[0];
    const found = await manager.query('SELECT used_at AS "usedAt" FROM mcp_authorization_code WHERE code_hash = $1', [codeHash]) as { usedAt: Date | null }[];
    if (found.length === 0) throw new ExchangeRefused('code_missing');
    throw new ExchangeRefused(found[0].usedAt === null ? 'code_expired' : 'code_used');
  }

  /** OAuthError는 의도한 거부라 그대로 던진다. 그 밖은 SDK가 로그 없이 500으로 바꾸므로 사건을 남기고 다시 던진다(NFR4.10). */
  private async logFailure<T>(step: McpOAuthStep, run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (!(error instanceof OAuthError)) writeMcpLog(this.logger, { event: 'mcp_oauth_failed', step, error: errorName(error) });
      throw error;
    }
  }
}

// 연결 상태·승인·전체 해제(U6 기능 설계 BR3.2~BR3.7·BR7.1·BR7.2, 비기능 설계 reliability-design 「트랜잭션 경계」).
// 회원은 언제나 호출하는 쪽이 넘긴 Access 토큰의 회원이다. 웹 로그아웃은 이 표들을 건드리지 않는다(BR7.3).
import { Inject, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ApiError } from '../common/errors';
import { McpAuthorizationDto } from './mcp-authorization.dto';
import { isSameResource, MCP_CONFIG, McpConfig } from './mcp-config';
import { MCP_CODE_TTL_MS } from './mcp-limits';
import { newOAuthSecret, sha256Hex } from './mcp-oauth.provider';

export type McpConnectionState = 'NONE' | 'ACTIVE' | 'EXPIRED';

export interface McpConnectionStatus {
  state: McpConnectionState;
  expiresAt: string | null;
  mcpUrl: string;
}

/** 돌아갈 주소에 값을 붙인다. web은 이 값으로만 이동한다(BR3.2). */
function redirectWith(redirectUri: string, params: Record<string, string | undefined>): string {
  const target = new URL(redirectUri);
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined) target.searchParams.set(name, value);
  }
  return target.href;
}

@Injectable()
export class McpConnectionService {
  constructor(private readonly dataSource: DataSource, @Inject(MCP_CONFIG) private readonly config: McpConfig) {}

  /** 행이 없으면 NONE, 만료 전인 행이 있으면 ACTIVE, 그 밖은 EXPIRED. expiresAt은 가장 늦은 만료다(BR7.1). */
  async status(memberId: string): Promise<McpConnectionStatus> {
    const [{ latest }] = await this.dataSource.query('SELECT max(expires_at) AS latest FROM mcp_connection WHERE member_id = $1', [memberId]) as { latest: Date | null }[];
    if (latest === null) return { state: 'NONE', expiresAt: null, mcpUrl: this.config.mcpUrl };
    return { state: latest.getTime() > Date.now() ? 'ACTIVE' : 'EXPIRED', expiresAt: latest.toISOString(), mcpUrl: this.config.mcpUrl };
  }

  /** 확인에 통과한 요청만 redirectTo를 돌려준다. 거절은 표를 바꾸지 않고, 승인은 한 트랜잭션으로 코드를 만든다(BR3.6, BR3.7). */
  async authorize(memberId: string, request: McpAuthorizationDto): Promise<{ redirectTo: string }> {
    await this.assertRequest(request);
    if (request.decision === 'DENY') {
      return { redirectTo: redirectWith(request.redirectUri, { error: 'access_denied', state: request.state }) };
    }
    const consentedAt = await this.existingConsent(memberId);
    if (consentedAt === null && request.consent !== true) throw new ApiError('MCP_CONSENT_REQUIRED');
    const now = new Date();
    const code = newOAuthSecret();
    await this.dataSource.transaction('READ COMMITTED', (manager) => this.issueCode(manager, memberId, request, sha256Hex(code), consentedAt ?? now, now));
    return { redirectTo: redirectWith(request.redirectUri, { code, state: request.state }) };
  }

  /** 쓰지 않은 코드를 먼저 지워 진행 중인 토큰 교환과 겹쳐도 토큰이 남지 않게 한다(BR7.2, functional-spec W6). */
  async disconnectAll(memberId: string): Promise<void> {
    await this.dataSource.transaction('READ COMMITTED', async (manager) => {
      await manager.query('DELETE FROM mcp_authorization_code WHERE member_id = $1 AND used_at IS NULL', [memberId]);
      await manager.query('DELETE FROM mcp_access_token WHERE member_id = $1', [memberId]);
      await manager.query('DELETE FROM mcp_connection WHERE member_id = $1', [memberId]);
    });
  }

  /**
   * /authorize를 지났어도 다시 확인한다(BR3.2). SDK는 loopback 주소끼리면 포트를 무시하므로 포트까지 정확히 비교하는 것은 여기다.
   * 돌아갈 주소는 그 등록의 목록과 지금의 허용 목록 모두에 있어야 한다(BR2.2).
   */
  private async assertRequest(request: McpAuthorizationDto): Promise<void> {
    const rows = await this.dataSource.query('SELECT redirect_uris AS "redirectUris" FROM mcp_client WHERE mcp_client_id = $1', [request.clientId]) as { redirectUris: string[] }[];
    const valid = rows.length > 0 && rows[0].redirectUris.includes(request.redirectUri) && this.config.redirectUris.includes(request.redirectUri)
      && (request.resource === undefined || isSameResource(this.config.mcpUrl, request.resource));
    if (!valid) throw new ApiError('MCP_AUTHORIZATION_INVALID');
  }

  /** 그 회원의 연결 행이 하나라도 있으면 동의한 것이다. 코드의 동의 시각은 처음 동의한 값을 잇는다(BR3.3, BR3.7). */
  private async existingConsent(memberId: string): Promise<Date | null> {
    const [{ earliest }] = await this.dataSource.query('SELECT min(consented_at) AS earliest FROM mcp_connection WHERE member_id = $1', [memberId]) as { earliest: Date | null }[];
    return earliest;
  }

  /** 등록 행이 없을 때만(정리로 지워짐) 거부한다. 이미 승인에 쓰인 등록도 갱신되어 처음 값이 그대로 남는다(BR3.7, BR2.4). */
  private async issueCode(manager: EntityManager, memberId: string, request: McpAuthorizationDto, codeHash: string, consentedAt: Date, now: Date): Promise<void> {
    const [, updated] = await manager.query('UPDATE mcp_client SET approved_at = COALESCE(approved_at, $2) WHERE mcp_client_id = $1', [request.clientId, now]) as [unknown, number];
    if (updated === 0) throw new ApiError('MCP_AUTHORIZATION_INVALID');
    await manager.query(`INSERT INTO mcp_authorization_code (code_hash, member_id, mcp_client_id, code_challenge, redirect_uri, resource, consented_at, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [codeHash, memberId, request.clientId, request.codeChallenge, request.redirectUri, request.resource ?? null, consentedAt, new Date(now.getTime() + MCP_CODE_TTL_MS)]);
  }
}

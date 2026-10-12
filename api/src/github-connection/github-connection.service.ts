import { Inject, Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { createHash, randomBytes } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { ApiError } from '../common/errors';
import { GitHubConnection, MemberAccount } from '../member-analysis/member-analysis.entity';
import { CredentialUnavailableError, CredentialVault, StoredCredential } from './credential-vault';
import { GITHUB_CONFIG, GitHubConfig } from './github.config';
import { GitHubClient, GitHubProviderError } from './github.client';

interface Authorization { memberId: string; state: string; verifier: string; expiresAt: number; claimed: boolean }
const STATE_LIFETIME_MS = 10 * 60 * 1000;
const MAX_AUTHORIZATIONS = 1000;
const isCredentialReference = (value: string | null): value is string => !!value?.startsWith('github-v1:');

@Injectable()
export class GitHubConnectionService {
  // PKCE·state는 프로세스 안에만 둔다. 재시작 후에는 인증 URL을 다시 발급받는다.
  private readonly authorizations = new Map<string, Authorization>();
  constructor(private readonly dataSource: DataSource, private readonly vault: CredentialVault,
    private readonly client: GitHubClient, @Inject(GITHUB_CONFIG) private readonly config: GitHubConfig) {}

  private requireEnabled(): Extract<GitHubConfig, { enabled: true }> {
    if (!this.config.enabled) throw new ApiError('GITHUB_CONNECTION_REQUIRED');
    return this.config;
  }
  private async requireMember(manager: EntityManager, memberId: string, lock = true): Promise<void> {
    if (!isUUID(memberId)) throw new ApiError('RESOURCE_UNAVAILABLE');
    if (lock) await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', ['catchu:github:' + memberId]);
    const member = await manager.findOne(MemberAccount, { where: { memberId },
      ...(lock ? { lock: { mode: 'pessimistic_read' as const } } : {}) });
    if (!member || member.accountState !== 'ACTIVE') throw new ApiError('RESOURCE_UNAVAILABLE');
  }
  private response(connection: GitHubConnection) {
    return { state: connection.connectionState, accountLogin: connection.accountLogin };
  }
  async authorize(memberId: string) {
    const config = this.requireEnabled();
    return this.dataSource.transaction(async manager => {
      await this.requireMember(manager, memberId);
      for (const [key, value] of this.authorizations) if (value.expiresAt <= Date.now()) this.authorizations.delete(key);
      if (!this.authorizations.has(memberId) && this.authorizations.size >= MAX_AUTHORIZATIONS) throw new ApiError('INTERNAL_ERROR');
      const authorization: Authorization = { memberId, state: randomBytes(32).toString('hex'),
        verifier: randomBytes(32).toString('base64url'), expiresAt: Date.now() + STATE_LIFETIME_MS, claimed: false };
      this.authorizations.set(memberId, authorization);
      const url = new URL('https://github.com/login/oauth/authorize');
      url.searchParams.set('client_id', config.clientId);
      url.searchParams.set('redirect_uri', config.callbackUrl);
      url.searchParams.set('scope', '');
      url.searchParams.set('state', authorization.state);
      url.searchParams.set('code_challenge', createHash('sha256').update(authorization.verifier).digest('base64url'));
      url.searchParams.set('code_challenge_method', 'S256');
      return { authorizationUrl: url.href, state: authorization.state, expiresAt: new Date(authorization.expiresAt).toISOString() };
    });
  }
  async connect(memberId: string, code: string, state: string) {
    this.requireEnabled();
    const authorization = await this.dataSource.transaction(async manager => {
      await this.requireMember(manager, memberId);
      const current = this.authorizations.get(memberId);
      if (!current || current.state !== state || current.claimed || current.expiresAt <= Date.now()) throw new ApiError('INVALID_REQUEST');
      current.claimed = true;
      return current;
    });
    let reference: string | undefined;
    let oldReference: string | null = null;
    let committed = false;
    try {
      const issued = await this.client.exchange(code, authorization.verifier);
      reference = await this.vault.save({ ...issued, memberId });
      const response = await this.dataSource.transaction(async manager => {
        await this.requireMember(manager, memberId);
        // 새 인증 시작·해제·만료로 이전 인증 응답이 현재 연결을 덮어쓰지 않게 한다.
        if (this.authorizations.get(memberId) !== authorization || authorization.expiresAt <= Date.now()
            || issued.expiresAt.getTime() <= Date.now()) throw new ApiError('INVALID_REQUEST');
        let connection = await manager.findOneBy(GitHubConnection, { memberId });
        oldReference = connection?.credentialReference ?? null;
        connection ??= manager.create(GitHubConnection, { memberId });
        Object.assign(connection, { accountLogin: issued.accountLogin, externalAccountReference: issued.externalAccountReference,
          credentialReference: reference, connectionState: 'CONNECTED' });
        await manager.save(connection);
        return this.response(connection);
      });
      committed = true;
      if (isCredentialReference(oldReference)) await this.vault.remove(oldReference);
      return response;
    } catch (error) {
      if (!committed && reference) await this.vault.remove(reference);
      if (error instanceof GitHubProviderError) throw new ApiError(error.reason === 'unavailable' ? 'INTERNAL_ERROR' : 'INVALID_REQUEST');
      throw error;
    } finally {
      if (this.authorizations.get(memberId) === authorization) this.authorizations.delete(memberId);
    }
  }
  async disconnect(memberId: string) {
    this.requireEnabled();
    let oldReference: string | null = null;
    const response = await this.dataSource.transaction(async manager => {
      await this.requireMember(manager, memberId);
      this.authorizations.delete(memberId);
      let connection = await manager.findOneBy(GitHubConnection, { memberId });
      oldReference = connection?.credentialReference ?? null;
      connection ??= manager.create(GitHubConnection, { memberId });
      Object.assign(connection, { accountLogin: null, externalAccountReference: null,
        credentialReference: null, connectionState: 'DISCONNECTED' });
      await manager.save(connection);
      return this.response(connection);
    });
    if (isCredentialReference(oldReference)) await this.vault.remove(oldReference);
    return response;
  }
  private async invalidate(memberId: string, reference: string): Promise<void> {
    const changed = await this.dataSource.transaction(async manager => {
      await this.requireMember(manager, memberId);
      const result = await manager.update(GitHubConnection, { memberId, credentialReference: reference, connectionState: 'CONNECTED' },
        { connectionState: 'REAUTH_REQUIRED', credentialReference: null });
      return result.affected === 1;
    });
    if (changed) await this.vault.remove(reference);
  }
  private async readCredential(memberId: string, reference: string): Promise<StoredCredential | null> {
    try { return await this.vault.read(reference, memberId); }
    catch (error) {
      if (!(error instanceof CredentialUnavailableError)) throw error;
      await this.invalidate(memberId, reference);
      return null;
    }
  }
  /** GET /me의 상태 투영: 실제 보관 참조의 만료·이용 불가를 확인한다. 개발 대역은 건드리지 않는다. */
  async refreshStatus(memberId: string): Promise<void> {
    if (!this.config.enabled || !isUUID(memberId)) return;
    await this.requireMember(this.dataSource.manager, memberId, false);
    const connection = await this.dataSource.manager.findOneBy(GitHubConnection, { memberId });
    if (connection?.connectionState !== 'CONNECTED' || !isCredentialReference(connection.credentialReference)) return;
    const value = await this.readCredential(memberId, connection.credentialReference);
    if (!value) return;
    if (value.expiresAt.getTime() <= Date.now()) await this.invalidate(memberId, connection.credentialReference);
  }
  /** #232가 사용할 유일한 자격정보 인계 지점. 일반 회원 HTTP 응답에는 사용하지 않는다. */
  async resolveCredential(memberId: string): Promise<StoredCredential | null> {
    if (!this.config.enabled) return null;
    await this.requireMember(this.dataSource.manager, memberId, false);
    const connection = await this.dataSource.manager.findOneBy(GitHubConnection, { memberId });
    if (connection?.connectionState !== 'CONNECTED' || !isCredentialReference(connection.credentialReference)) return null;
    const reference = connection.credentialReference;
    const value = await this.readCredential(memberId, reference);
    if (!value) return null;
    if (value.accountLogin !== connection.accountLogin || value.externalAccountReference !== connection.externalAccountReference) throw new ApiError('INTERNAL_ERROR');
    if (value.expiresAt.getTime() <= Date.now()) { await this.invalidate(memberId, reference); return null; }
    try {
      const identity = await this.client.identity(value.token);
      if (identity.externalAccountReference !== value.externalAccountReference || identity.accountLogin !== value.accountLogin) {
        await this.invalidate(memberId, reference); return null;
      }
    } catch (error) {
      if (error instanceof GitHubProviderError && ['revoked', 'scopeRejected'].includes(error.reason)) {
        await this.invalidate(memberId, reference); return null;
      }
      throw new ApiError('INTERNAL_ERROR');
    }
    // 조회 도중 해제·재연결·만료가 일어났다면 이전 토큰을 인계하지 않는다.
    let expired = false;
    const resolved = await this.dataSource.transaction(async manager => {
      await this.requireMember(manager, memberId);
      const current = await manager.findOneBy(GitHubConnection, { memberId });
      if (current?.connectionState !== 'CONNECTED' || current.credentialReference !== reference) return null;
      if (value.expiresAt.getTime() <= Date.now()) {
        await manager.update(GitHubConnection, { memberId, credentialReference: reference }, { connectionState: 'REAUTH_REQUIRED', credentialReference: null });
        expired = true;
        return null;
      }
      return value;
    });
    if (expired) await this.vault.remove(reference);
    return resolved;
  }
}

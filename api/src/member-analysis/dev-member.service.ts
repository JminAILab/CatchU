import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AUTH_CONFIG, AuthConfig } from '../auth/auth.config';
import { isMemberId } from '../auth/access-token.service';
import { GitHubConnection, MemberAccount, MemberProfile } from './member-analysis.entity';

/** #104 지정 context.sample.json(d50c1bc)의 repository. 실제 GitHub 접근 권한이 아니다. */
export const SYNTHETIC_REPOSITORY = Object.freeze({
  repositoryId: 'synthetic-repo-0001',
  name: 'catchu-synthetic-repo',
  ownerLogin: 'catchu-synthetic-owner',
  url: 'https://example.invalid/catchu-synthetic-owner/catchu-synthetic-repo',
  allowedScopeRevision: '00000000-0000-4000-8000-000000000201',
});
const IDENTITY_NAMESPACE = 'catchu:dev-login:';
const CONNECTION_NAMESPACE = 'catchu:mock-github:';

@Injectable()
export class DevMemberService {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  private assertEnabled(): void {
    if (!this.config.devLoginEnabled) throw new ForbiddenException();
  }

  async resolveMember(identifier: string, transactionManager?: EntityManager): Promise<string> {
    this.assertEnabled();
    if (!isMemberId(identifier)) throw new TypeError('Invalid development identity');
    const identityReference = IDENTITY_NAMESPACE + identifier;
    const resolve = async (manager: EntityManager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [identityReference]);
      let account = await manager.findOneBy(MemberAccount, { identityReference });
      if (!account) {
        account = Object.assign(new MemberAccount(), { identityReference, accountState: 'ACTIVE' });
        await manager.insert(MemberAccount, account);
        await manager.insert(MemberProfile, Object.assign(new MemberProfile(), { memberId: account.memberId }));
      } else {
        if (account.accountState !== 'ACTIVE') throw new ForbiddenException();
        if (!await manager.existsBy(MemberProfile, { memberId: account.memberId })) {
          throw new Error('Development member profile is missing');
        }
      }
      const connection = await manager.findOneBy(GitHubConnection, { memberId: account.memberId });
      if (!connection) {
        await manager.insert(GitHubConnection, Object.assign(new GitHubConnection(), {
          memberId: account.memberId, externalAccountReference: CONNECTION_NAMESPACE + account.memberId,
          accountLogin: SYNTHETIC_REPOSITORY.ownerLogin, connectionState: 'CONNECTED',
        }));
      }
      // 기존 연결 상태·자격정보는 반복 로그인으로 덮어쓰지 않는다.
      return account.memberId;
    };
    return transactionManager ? resolve(transactionManager) : this.dataSource.transaction('READ COMMITTED', resolve);
  }

  /** #136/E 접수에서 재사용할 내부 개발 대역. 제품 HTTP 연동 API는 추가하지 않는다. */
  async readConnection(memberId: string) {
    this.assertEnabled();
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      const account = await manager.findOneBy(MemberAccount, { memberId });
      if (!account || account.accountState !== 'ACTIVE' || !account.identityReference.startsWith(IDENTITY_NAMESPACE)) {
        throw new ForbiddenException();
      }
      const connection = await manager.findOneBy(GitHubConnection, { memberId });
      if (connection && connection.externalAccountReference !== CONNECTION_NAMESPACE + memberId) {
        throw new Error('Development connection is not a synthetic connection');
      }
      return {
        connectionState: connection?.connectionState ?? 'DISCONNECTED',
        repositories: connection?.connectionState === 'CONNECTED' ? [{ ...SYNTHETIC_REPOSITORY }] : [],
        sourceMode: 'MOCK' as const,
      };
    });
  }
}

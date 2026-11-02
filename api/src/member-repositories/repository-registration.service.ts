import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ApiError } from '../common/errors';
import { GitHubConnectionService, isCredentialReference } from '../github-connection/github-connection.service';
import { GitHubConnection, MemberAccount } from '../member-analysis/member-analysis.entity';
import { memberKindOf } from '../member-analysis/member-kind';
import { requireCreationTransaction } from '../member-analysis/transaction';
import { GitHubRepositoryClient } from './github-repository.client';
import { parseRepositoryAddress } from './repository-address';
import { AllowedScopeRevision } from './repository-selection.entity';
import { RepositoryRegistration } from './repository-registration.entity';
import { REGISTRATION_SCOPE_REVISION } from './registration-scope';

export { REGISTRATION_SCOPE_REVISION } from './registration-scope';
export interface RegistrationSnapshot {
  registration: RepositoryRegistration;
  connection: GitHubConnection;
}
export const registrationItem = (row: RepositoryRegistration) => ({ registrationId: row.registrationId,
  repositoryId: row.repositoryId, name: row.name, ownerLogin: row.owner, url: row.repositoryUrl,
  allowedScopeRevision: row.scopeRevision });

export async function connectedMember(manager: EntityManager, memberId: string, lock = false) {
  const options = lock ? { lock: { mode: 'pessimistic_read' as const } } : {};
  const member = await manager.findOne(MemberAccount, { where: { memberId }, ...options });
  if (member?.accountState !== 'ACTIVE' || memberKindOf(member.identityReference) !== 'REAL') {
    throw new ApiError('RESOURCE_UNAVAILABLE');
  }
  const connection = await manager.findOne(GitHubConnection, { where: { memberId }, ...options });
  if (connection?.connectionState !== 'CONNECTED' || !isCredentialReference(connection.credentialReference)) {
    throw new ApiError('GITHUB_CONNECTION_REQUIRED');
  }
  return connection;
}
function sameConnection(left: GitHubConnection, right: GitHubConnection) {
  return left.connectionId === right.connectionId && left.credentialReference === right.credentialReference &&
    left.externalAccountReference === right.externalAccountReference && left.accountLogin === right.accountLogin;
}

@Injectable()
export class RepositoryRegistrationService {
  constructor(private readonly database: DataSource, private readonly github: GitHubConnectionService,
    private readonly client: GitHubRepositoryClient) {}

  async listEligible(memberId: string) {
    return this.database.transaction('REPEATABLE READ', async manager => {
      await connectedMember(manager, memberId);
      return (await manager.findBy(RepositoryRegistration, { memberId })).map(registrationItem);
    });
  }

  /** 메타데이터 통신은 DB 트랜잭션 밖. 연결 조회 도중 재연결된 자격정보는 쓰지 않는다. */
  private async verify(memberId: string, url: unknown) {
    const coordinates = parseRepositoryAddress(url);
    this.github.requireAvailable();
    const connection = await connectedMember(this.database.manager, memberId);
    const credential = await this.github.resolveCredential(memberId);
    if (!credential || credential.externalAccountReference !== connection.externalAccountReference) {
      throw new ApiError('GITHUB_CONNECTION_REQUIRED');
    }
    const repository = await this.client.verify(coordinates, credential.token);
    return { connection, repository };
  }

  async register(memberId: string, raw: unknown) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).join(',') !== 'url') {
      throw new ApiError('VALIDATION_FAILED');
    }
    const verified = await this.verify(memberId, (raw as { url: unknown }).url);
    return this.database.transaction('READ COMMITTED', async manager => {
      // 동일 회원의 등록과 접수가 같은 잠금을 써 좌표 갱신과 접수 사본 저장을 직렬화한다.
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [JSON.stringify(['catchu:analysis-intake', memberId])]);
      const current = await connectedMember(manager, memberId, true);
      if (!sameConnection(current, verified.connection)) throw new ApiError('GITHUB_CONNECTION_REQUIRED');
      await this.scope(manager, REGISTRATION_SCOPE_REVISION);
      let row = await manager.findOneBy(RepositoryRegistration, { memberId, repositoryId: verified.repository.repositoryId });
      const now = new Date();
      row ??= Object.assign(new RepositoryRegistration(), { memberId, registeredAt: now });
      Object.assign(row, { repositoryId: verified.repository.repositoryId, owner: verified.repository.owner,
        name: verified.repository.name, repositoryUrl: verified.repository.url, scopeRevision: REGISTRATION_SCOPE_REVISION,
        lastVerifiedAt: now });
      await manager.save(row);
      return registrationItem(row);
    });
  }

  async prepareForIntake(memberId: string, repositoryId: string): Promise<RegistrationSnapshot> {
    this.github.requireAvailable();
    const registration = await this.database.manager.findOneBy(RepositoryRegistration, { memberId, repositoryId });
    if (!registration) throw new ApiError('RESOURCE_UNAVAILABLE');
    const verified = await this.verify(memberId, registration.repositoryUrl);
    if (verified.repository.repositoryId !== registration.repositoryId || verified.repository.owner !== registration.owner ||
        verified.repository.name !== registration.name) throw new ApiError('REPOSITORY_UNVERIFIED');
    return { registration, connection: verified.connection };
  }

  async confirmForIntake(manager: EntityManager, memberId: string, repositoryId: string, prepared: RegistrationSnapshot) {
    await requireCreationTransaction(manager);
    const connection = await connectedMember(manager, memberId, true);
    if (!sameConnection(connection, prepared.connection)) throw new ApiError('GITHUB_CONNECTION_REQUIRED');
    const row = await manager.findOne(RepositoryRegistration, { where: { memberId, repositoryId }, lock: { mode: 'pessimistic_read' } });
    if (!row) throw new ApiError('RESOURCE_UNAVAILABLE');
    const old = prepared.registration;
    if (row.scopeRevision !== REGISTRATION_SCOPE_REVISION || row.registrationId !== old.registrationId || row.scopeRevision !== old.scopeRevision || row.owner !== old.owner ||
        row.name !== old.name || row.repositoryUrl !== old.repositoryUrl) throw new ApiError('CONSENT_REQUIRED');
    const scope = await this.scope(manager, row.scopeRevision);
    return { registrationId: row.registrationId, scopeRevision: row.scopeRevision,
      consentedScope: { revision: row.scopeRevision, repositoryId, allowedResourceTypes: [...scope.allowedResourceTypes],
        selectionReference: row.registrationId, registrationId: row.registrationId,
        repository: { owner: row.owner, name: row.name, url: row.repositoryUrl } } };
  }

  private async scope(manager: EntityManager, revision: string) {
    const scope = await manager.findOneBy(AllowedScopeRevision, { scopeRevision: revision });
    if (!scope || scope.wholeRepository !== true || scope.allowedResourceTypes.length === 0 ||
        new Set(scope.allowedResourceTypes).size !== scope.allowedResourceTypes.length ||
        scope.allowedResourceTypes.some(type => !['COMMIT', 'PULL_REQUEST', 'ISSUE'].includes(type))) {
      throw new ApiError('REPOSITORY_UNSUPPORTED');
    }
    return scope;
  }
}

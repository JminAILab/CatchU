import type { EntityManager } from 'typeorm';
import type { AcceptedWorkerContext, WorkerRepositorySelectionSource } from '../worker-context/worker-context.types';
import { AnalysisRequest, MemberAccount } from '../member-analysis/member-analysis.entity';
import { RepositoryRegistration } from './repository-registration.entity';
import { AllowedScopeRevision } from './repository-selection.entity';
import { readRegistrationScope } from './registration-scope';

export class RegistrationContextSource implements WorkerRepositorySelectionSource {
  async resolve(manager: EntityManager, context: Readonly<AcceptedWorkerContext>, options: Readonly<{ lock: 'pessimistic_read' | null }>) {
    const lock = options.lock ? { lock: { mode: options.lock } } : {};
    if (options.lock && !manager.queryRunner?.isTransactionActive) throw new Error('Registration context requires a transaction');
    const scope = readRegistrationScope(context.consentedScope);
    if (!scope || scope.revision !== context.scopeRevision || scope.repositoryId !== context.repositoryId) return null;
    const member = await manager.findOne(MemberAccount, { where: { memberId: context.memberId, accountState: 'ACTIVE' }, ...lock });
    if (!member) return null;
    const request = await manager.findOneBy(AnalysisRequest, { requestId: context.requestId, memberId: context.memberId,
      repositoryId: context.repositoryId, registrationId: scope.registrationId });
    if (!request) return null;
    const registration = await manager.findOne(RepositoryRegistration, { where: { memberId: context.memberId,
      registrationId: scope.registrationId, repositoryId: context.repositoryId }, ...lock });
    if (!registration) return null;
    const definition = await manager.findOneBy(AllowedScopeRevision, { scopeRevision: scope.revision });
    if (!definition?.wholeRepository || definition.allowedResourceTypes.length !== scope.allowedResourceTypes.length ||
        !definition.allowedResourceTypes.every(type => scope.allowedResourceTypes.includes(type))) return null;
    // 표시 좌표가 이후 갱신돼도 요청 당시의 서버 확인 사본으로 실행한다.
    return { attemptId: context.attemptId, requestId: context.requestId, memberId: context.memberId,
      repositoryId: context.repositoryId, scopeRevision: scope.revision, repository: { owner: scope.repository.owner,
        name: scope.repository.name }, wholeRepository: true as const };
  }
}

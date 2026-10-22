import { DataSource } from 'typeorm';
import { AnalysisAttempt, AnalysisConsent, AnalysisRequest } from '../member-analysis/member-analysis.entity';
import { SelectedRepositoryCatalog } from '../member-repositories/selected-repository-catalog';
import type { RequestContext } from './receiver.types';
import type { RegistrationRepositorySnapshot, RegistrationRepositorySource } from './october-repository-observation.source';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 요청에 저장된 동의의 선정 판본에서 당시 좌표를 복원한다. LIVE 접수를 활성화하지 않는다.
 * 현재 선정 목록·GitHub 연결·진행 중 전용 API와 무관하게 종결된 시도도 읽는다.
 */
export class SelectedRepositoryRegistrationSource implements RegistrationRepositorySource {
  constructor(private readonly dataSource: DataSource,
    private readonly catalog: Pick<SelectedRepositoryCatalog, 'resolve'> = new SelectedRepositoryCatalog()) {}

  async findForRegistration(input: Readonly<RequestContext>): Promise<RegistrationRepositorySnapshot | null> {
    if (!input || typeof input !== 'object') return null;
    const context = Object.freeze({
      requestId: input.requestId, attemptId: input.attemptId, memberId: input.memberId,
      repositoryId: input.repositoryId, consentId: input.consentId,
      scopeRevision: input.scopeRevision, sourceMode: input.sourceMode,
    });
    if (context.sourceMode !== 'LIVE' ||
      [context.requestId, context.attemptId, context.memberId, context.consentId]
        .some(value => typeof value !== 'string' || !UUID.test(value)) ||
      typeof context.repositoryId !== 'string' || !/^[1-9][0-9]*$/.test(context.repositoryId) ||
      typeof context.scopeRevision !== 'string' || context.scopeRevision.length === 0) return null;

    // 세 행을 하나의 DB 스냅샷으로 읽는다. 조회 장애는 null로 숨기지 않고 호출자에게 전달한다.
    return this.dataSource.transaction('REPEATABLE READ', async manager => {
      const request = await manager.findOneBy(AnalysisRequest, {
        requestId: context.requestId, memberId: context.memberId,
        repositoryId: context.repositoryId, consentId: context.consentId,
      });
      if (!request) return null;
      const attempt = await manager.findOneBy(AnalysisAttempt, {
        attemptId: context.attemptId, requestId: context.requestId, sourceMode: 'LIVE',
      });
      if (!attempt) return null;
      const consent = await manager.findOneBy(AnalysisConsent, {
        consentId: context.consentId, requestId: context.requestId, memberId: context.memberId,
        repositoryId: context.repositoryId, scopeRevision: context.scopeRevision, accepted: true,
      });
      if (!consent) return null;
      const scope = consent.consentedScope;
      if (!scope || typeof scope !== 'object' || Array.isArray(scope) ||
        scope.revision !== context.scopeRevision || scope.repositoryId !== context.repositoryId ||
        typeof scope.selectionReference !== 'string') return null;
      const selected = this.catalog.resolve(scope.selectionReference);
      if (!selected || selected.repositoryId !== context.repositoryId ||
        selected.selectionReference !== scope.selectionReference) return null;
      return Object.freeze({ ...context,
        githubRepository: Object.freeze({ owner: selected.owner, name: selected.name }),
      });
    });
  }
}

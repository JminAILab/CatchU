import { ForbiddenException, Injectable } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { ApiError } from '../common/errors';
import { isCredentialReference } from '../github-connection/github-connection.service';
import { GitHubConnection, MemberAccount } from '../member-analysis/member-analysis.entity';
import { memberKindOf } from '../member-analysis/member-kind';
import { requireCreationTransaction } from '../member-analysis/transaction';
import type { AcceptedWorkerContext, WorkerRepositorySelection, WorkerRepositorySelectionSource }
  from '../worker-context/worker-context.types';
import type { EligibleRepository } from './repository-page';
import { AllowedScopeRevision, RepositorySelection } from './repository-selection.entity';
import { SelectedRepositoryCatalog } from './selected-repository-catalog';

// 계약 v1 Request의 allowedScope.allowedResourceTypes 값(worker-messages.yaml).
const RESOURCE_TYPES: ReadonlySet<unknown> = new Set(['COMMIT', 'PULL_REQUEST', 'ISSUE']);
// 저장 동의 네 칸(#138 접수 모양). 큐 사본은 두 참조를 attemptId로 바꾸지만 DB 동의는 이 모양 그대로다.
const CONSENT_KEYS = 'allowedResourceTypes,repositoryId,revision,selectionReference';

type Catalog = Pick<SelectedRepositoryCatalog, 'resolve'>;

/** 현재 선정 한 건. DB의 선정·범위 정의와 선정 참조가 가리키는 카탈로그 좌표 판본을 합친 값이다. */
export interface CurrentRepositorySelection {
  repositoryId: string;
  selectionReference: string;
  scopeRevision: string;
  allowedResourceTypes: string[];
  wholeRepository: true;
  repository: { owner: string; name: string; url: string };
}

/** #323이 동의 행의 consentedScope에 그대로 저장할 네 칸. */
export interface ConsentedRepositoryScope {
  revision: string;
  repositoryId: string;
  allowedResourceTypes: string[];
  selectionReference: string;
}

export interface IntakeRepositorySelection extends CurrentRepositorySelection {
  memberId: string;
  consentedScope: ConsentedRepositoryScope;
}

const lockOption = (lock: boolean) => lock ? { lock: { mode: 'pessimistic_read' as const } } : {};

function validTypes(types: unknown): types is string[] {
  return Array.isArray(types) && types.length > 0 && types.every(type => RESOURCE_TYPES.has(type)) &&
    new Set(types).size === types.length;
}

/** 선정 행·범위 정의·카탈로그 판본이 서로 맞을 때만 현재 선정이다. 어긋남은 공급 장애이며 목록에서 빼지 않는다. */
function describe(catalog: Catalog, selection: RepositorySelection, scope: AllowedScopeRevision | null | undefined):
  CurrentRepositorySelection {
  // 전체 선정 의미는 범위 판본의 정의로만 판정한다. 자료 종류 목록에서 추정하지 않는다.
  if (!scope || scope.wholeRepository !== true || !validTypes(scope.allowedResourceTypes)) {
    throw new Error('Invalid repository selection scope');
  }
  const version = catalog.resolve(selection.selectionReference);
  if (!version || version.repositoryId !== selection.repositoryId) throw new Error('Invalid current repository selection');
  return { repositoryId: selection.repositoryId, selectionReference: selection.selectionReference,
    scopeRevision: scope.scopeRevision, allowedResourceTypes: [...scope.allowedResourceTypes], wholeRepository: true,
    repository: { owner: version.owner, name: version.name, url: version.url } };
}

/** 저장소 하나의 현재 선정. 없거나 제외(active=false)면 null. lock이면 선정 → 범위 정의 순서로 읽기 잠금한다. */
async function readCurrent(manager: EntityManager, catalog: Catalog, repositoryId: string, lock: boolean) {
  const selection = await manager.findOne(RepositorySelection, { where: { repositoryId }, ...lockOption(lock) });
  if (!selection?.active) return null;
  const scope = await manager.findOne(AllowedScopeRevision, {
    where: { scopeRevision: selection.scopeRevision }, ...lockOption(lock),
  });
  return describe(catalog, selection, scope);
}

/**
 * 활성 실제 회원과 #231 연결 행을 확인한다. lock이면 회원 → 연결 순서로 읽기 잠금한다.
 * 만료·이용 불가의 상태 반영은 #231 refreshStatus가 맡으며 여기서는 토큰을 읽지 않는다.
 */
async function requireConnectedRealMember(manager: EntityManager, memberId: string, lock: boolean): Promise<void> {
  const member = await manager.findOne(MemberAccount, { where: { memberId }, ...lockOption(lock) });
  // 개발 회원은 실제 GitHub 연결이 있어도 개발 공급을 쓴다(#322). 미지원 출처를 실제 회원으로 추정하지 않는다.
  if (member?.accountState !== 'ACTIVE' || memberKindOf(member.identityReference) !== 'REAL') throw new ForbiddenException();
  const connection = await manager.findOne(GitHubConnection, { where: { memberId }, ...lockOption(lock) });
  // 보관 자격정보가 없는 연결은 실제 연결이 아니다(#232 실행 조회와 같은 기준).
  if (connection?.connectionState !== 'CONNECTED' || !isCredentialReference(connection.credentialReference)) {
    throw new ApiError('GITHUB_CONNECTION_REQUIRED');
  }
}

/**
 * 실제 회원의 현재 선정 공급(#252). 목록·#323 접수·#232 실행이 같은 DB 선정 근거와 #319 좌표 판본을 쓴다.
 * 활성 실제 회원 모두에게 같은 현재 선정을 허용한다(2026-10-17 팀장 결정). 소유·기여 관계는 조회하지 않는다.
 */
@Injectable()
export class RepositorySelectionService {
  constructor(private readonly dataSource: DataSource, private readonly catalog: SelectedRepositoryCatalog) {}

  /** GET /v1/me/repositories의 공급. 한 스냅샷에서 회원·연결·현재 선정을 읽는다. 선정이 없으면 정상 빈 목록이다. */
  async listEligible(memberId: string): Promise<EligibleRepository[]> {
    return this.dataSource.transaction('REPEATABLE READ', async manager => {
      await requireConnectedRealMember(manager, memberId, false);
      const selections = await manager.find(RepositorySelection, { where: { active: true } });
      if (selections.length === 0) return [];
      const scopes = await manager.findBy(AllowedScopeRevision,
        { scopeRevision: In([...new Set(selections.map(selection => selection.scopeRevision))]) });
      return selections.map(selection => describe(this.catalog, selection,
        scopes.find(scope => scope.scopeRevision === selection.scopeRevision)))
        .map(current => ({ repositoryId: current.repositoryId, name: current.repository.name,
          ownerLogin: current.repository.owner, url: current.repository.url, allowedScopeRevision: current.scopeRevision }));
    });
  }

  /**
   * #323 접수 재확인. 생성 트랜잭션(READ COMMITTED)의 manager만 쓰고 회원 → 연결 → 선정 → 범위 정의를 읽기 잠금한다.
   * 잠금은 그 트랜잭션이 끝날 때까지 유지되어 동의 저장 전에 판정 근거가 바뀌지 않는다.
   * 동의의 고지·범위 판본 대조와 refreshStatus(트랜잭션 밖에서 먼저)는 호출자인 #323이 한다.
   */
  async confirmForIntake(manager: EntityManager, memberId: string, repositoryId: string): Promise<IntakeRepositorySelection> {
    await requireCreationTransaction(manager);
    await requireConnectedRealMember(manager, memberId, true);
    const current = await readCurrent(manager, this.catalog, repositoryId, true);
    if (!current) throw new ApiError('REPOSITORY_NOT_ALLOWED');
    return { memberId, ...current, consentedScope: { revision: current.scopeRevision, repositoryId: current.repositoryId,
      allowedResourceTypes: [...current.allowedResourceTypes], selectionReference: current.selectionReference } };
  }
}

/** 저장 동의 네 칸이 시도의 판본·저장소와 맞을 때만 읽는다. 다른 모양은 알 수 없는 범위다. */
function storedScope(context: Readonly<AcceptedWorkerContext>): ConsentedRepositoryScope | null {
  const scope = context.consentedScope;
  if (scope === null || typeof scope !== 'object' || Array.isArray(scope) ||
      Object.keys(scope).sort().join(',') !== CONSENT_KEYS) return null;
  const { revision, repositoryId, allowedResourceTypes, selectionReference } = scope;
  if (revision !== context.scopeRevision || repositoryId !== context.repositoryId ||
      typeof selectionReference !== 'string' || !validTypes(allowedResourceTypes)) return null;
  return { revision, repositoryId, allowedResourceTypes: [...allowedResourceTypes], selectionReference };
}

/**
 * #232 worker 선정 공급. 받은 manager만 쓰고 외부 통신·별도 연결·독립 트랜잭션을 만들지 않는다.
 * pessimistic_read이면 회원 → 선정 → 범위 정의를 같은 트랜잭션에서 읽기 잠금한 뒤 최신 자료로 판정한다.
 * 비실제 회원·제외·다른 좌표 판본·다른 범위 판본·다른 자료 종류는 null, 선정 자료 불일치와 DB 오류는 예외다.
 */
export class DatabaseRepositorySelectionSource implements WorkerRepositorySelectionSource {
  constructor(private readonly catalog: Catalog = new SelectedRepositoryCatalog()) {}

  async resolve(manager: EntityManager, context: Readonly<AcceptedWorkerContext>,
    options: Readonly<{ lock: 'pessimistic_read' | null }>): Promise<WorkerRepositorySelection | null> {
    const lock = options.lock === 'pessimistic_read';
    if (lock && !manager.queryRunner?.isTransactionActive) throw new Error('Final selection check requires a transaction');
    const scope = storedScope(context);
    if (!scope) return null;
    const member = await manager.findOne(MemberAccount, { where: { memberId: context.memberId }, ...lockOption(lock) });
    if (member?.accountState !== 'ACTIVE' || memberKindOf(member.identityReference) !== 'REAL') return null;
    const current = await readCurrent(manager, this.catalog, context.repositoryId, lock);
    if (!current || current.selectionReference !== scope.selectionReference || current.scopeRevision !== scope.revision ||
        current.allowedResourceTypes.length !== scope.allowedResourceTypes.length ||
        !current.allowedResourceTypes.every(type => scope.allowedResourceTypes.includes(type))) return null;
    return { attemptId: context.attemptId, requestId: context.requestId, memberId: context.memberId,
      repositoryId: current.repositoryId, scopeRevision: current.scopeRevision,
      repository: { owner: current.repository.owner, name: current.repository.name }, wholeRepository: true };
  }
}

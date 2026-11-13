import { Inject, Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { DataSource, EntityManager } from 'typeorm';
import { ApiError } from '../common/errors';
import { CommitAssignmentEntity } from '../catches/entities/commit-assignment.entity';
import { GitHubConnectionService } from '../github-connection/github-connection.service';
import { AnalysisAttempt, AnalysisConsent, AnalysisRequest, GitHubConnection, MemberAccount } from '../member-analysis/member-analysis.entity';
import { AcceptedWorkerContext, WORKER_REPOSITORY_SELECTION_SOURCE, WorkerContextUnavailableReason,
  WorkerRepositorySelection, WorkerRepositorySelectionSource } from './worker-context.types';

// 이유는 공통 오류 필터가 복사하는 details.violations 한 칸에만 싣는다. 문구·원문은 넣지 않는다.
const unavailable = (reason: WorkerContextUnavailableReason): never => {
  throw new ApiError('RESOURCE_UNAVAILABLE', { details: { violations: [{ field: 'attemptId', reason }] } });
};
// 계약 v1 Request의 allowedScope.allowedResourceTypes 값(worker-messages.yaml).
const RESOURCE_TYPES: ReadonlySet<unknown> = new Set(['COMMIT', 'PULL_REQUEST', 'ISSUE']);

/** 동의 범위 JSON(#138 접수 모양)의 판본·저장소가 동의 행·요청과 같을 때만 허용 자료 종류를 돌려준다. */
function allowedResourceTypes(context: AcceptedWorkerContext): string[] | null {
  const scope = context.consentedScope;
  if (scope === null || typeof scope !== 'object' || Array.isArray(scope)) return null;
  const types = scope.allowedResourceTypes;
  if (scope.revision !== context.scopeRevision || scope.repositoryId !== context.repositoryId ||
      !Array.isArray(types) || !types.every(type => RESOURCE_TYPES.has(type))) return null;
  return [...types as string[]];
}

@Injectable()
export class WorkerContextService {
  constructor(private readonly dataSource: DataSource, private readonly github: GitHubConnectionService,
    @Inject(WORKER_REPOSITORY_SELECTION_SOURCE) private readonly selections: WorkerRepositorySelectionSource) {}

  private async accepted(manager: EntityManager, attemptId: string, requestId?: string): Promise<AcceptedWorkerContext> {
    if (requestId !== undefined) {
      // JOIN의 FOR SHARE OF 나열은 잠금 획득 순서를 보장하지 않는다.
      // 수신·결과 반영과 같이 요청 → 시도를 별도 SQL로 잠근 뒤 최신 조건을 다시 검사한다.
      const request = await manager.findOne(AnalysisRequest, {
        where: { requestId }, lock: { mode: 'pessimistic_read' },
      });
      if (!request || request.currentAttemptId !== attemptId) return unavailable('ATTEMPT_NOT_ACTIVE');
      const attempt = await manager.findOne(AnalysisAttempt, {
        where: { attemptId, requestId }, lock: { mode: 'pessimistic_read' },
      });
      if (!attempt) return unavailable('ATTEMPT_NOT_ACTIVE');
    }
    // 한 SQL에서 현재 시도·소유회원·동의 관계를 대조한다. UNCERTAIN도 실행 허가가 아니다.
    const query = manager.createQueryBuilder(AnalysisAttempt, 'attempt')
      .innerJoin(AnalysisRequest, 'request', 'request.request_id = attempt.request_id AND request.current_attempt_id = attempt.attempt_id')
      .innerJoin(MemberAccount, 'member', 'member.member_id = request.member_id')
      .innerJoin(AnalysisConsent, 'consent', `consent.consent_id = request.consent_id AND consent.request_id = request.request_id
        AND consent.member_id = request.member_id AND consent.repository_id = request.repository_id`)
      .select('attempt.attempt_id', 'attemptId').addSelect('request.request_id', 'requestId')
      .addSelect('request.member_id', 'memberId').addSelect('request.repository_id', 'repositoryId')
      .addSelect('consent.consent_id', 'consentId').addSelect('consent.notice_revision', 'noticeRevision')
      .addSelect('consent.scope_revision', 'scopeRevision').addSelect('consent.consented_scope', 'consentedScope')
      .addSelect('attempt.source_mode', 'sourceMode')
      .where('attempt.attempt_id = :attemptId', { attemptId })
      .andWhere('request.lifecycle = :lifecycle', { lifecycle: 'ACTIVE' })
      .andWhere('request.request_state = :requestState', { requestState: 'ACCEPTED' })
      .andWhere('attempt.processing IN (:...processing)', { processing: ['QUEUED', 'RUNNING'] })
      .andWhere('attempt.source_mode = :sourceMode', { sourceMode: 'LIVE' })
      .andWhere('member.account_state = :accountState', { accountState: 'ACTIVE' })
      .andWhere('consent.accepted = true');
    // GitHub 호출 후 짧은 최종 확인 중 종결/회원 비활성화가 끼어들지 않게 한다.
    if (requestId !== undefined) {
      query.andWhere('request.request_id = :requestId', { requestId })
        .setLock('pessimistic_read', undefined, ['member', 'consent']);
    }
    const context = await query.getRawOne<AcceptedWorkerContext>();
    if (!context) return unavailable(await this.reason(manager, attemptId));
    // 선정 공급자·GitHub 확인 전에 동의 범위 JSON이 동의 행·요청과 맞는지 본다.
    if (!allowedResourceTypes(context)) return unavailable('SCOPE_UNVERIFIED');
    return context;
  }

  /** 접수 조회가 비었을 때 회원 실패 문구용 이유 하나를 고른다. 허용 판정은 위 조회만 한다. */
  private async reason(manager: EntityManager, attemptId: string): Promise<WorkerContextUnavailableReason> {
    const row = await manager.createQueryBuilder(AnalysisAttempt, 'attempt')
      .innerJoin(AnalysisRequest, 'request', 'request.request_id = attempt.request_id')
      .leftJoin(MemberAccount, 'member', 'member.member_id = request.member_id')
      .select('request.current_attempt_id', 'currentAttemptId').addSelect('request.lifecycle', 'lifecycle')
      .addSelect('request.request_state', 'requestState').addSelect('attempt.processing', 'processing')
      .addSelect('attempt.source_mode', 'sourceMode').addSelect('member.account_state', 'accountState')
      .where('attempt.attempt_id = :attemptId', { attemptId })
      .getRawOne<{ currentAttemptId: string; lifecycle: string; requestState: string; processing: string;
        sourceMode: string; accountState: string | null }>();
    // MOCK 시도도 여기다. worker는 MOCK에 조회를 부르지 않으므로 메시지와 접수 기록이 어긋난 경우뿐이다.
    if (!row || row.currentAttemptId !== attemptId || row.lifecycle !== 'ACTIVE' || row.requestState !== 'ACCEPTED' ||
        !['QUEUED', 'RUNNING'].includes(row.processing) || row.sourceMode !== 'LIVE') return 'ATTEMPT_NOT_ACTIVE';
    if (row.accountState !== 'ACTIVE') return 'MEMBER_INACTIVE';
    // 남은 조건은 접수 동의(동의함, 요청·회원·저장소 일치)뿐이다.
    return 'SCOPE_UNVERIFIED';
  }

  private async selected(manager: EntityManager, context: AcceptedWorkerContext,
    lock: 'pessimistic_read' | null): Promise<WorkerRepositorySelection> {
    const selection = await this.selections.resolve(manager, context, { lock });
    if (!selection || selection.attemptId !== context.attemptId || selection.requestId !== context.requestId ||
        selection.memberId !== context.memberId || selection.repositoryId !== context.repositoryId ||
        selection.scopeRevision !== context.scopeRevision || selection.wholeRepository !== true) return unavailable('SCOPE_UNVERIFIED');
    // 저장소 좌표는 공급자의 데이터 경계에서 검사한다. 임의 URL/경로로 바꾸지 않는다.
    if (!selection.repository || typeof selection.repository.owner !== 'string' || typeof selection.repository.name !== 'string' ||
        !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(selection.repository.owner) ||
        !/^[A-Za-z0-9_.-]{1,100}$/.test(selection.repository.name) || ['.', '..'].includes(selection.repository.name)) {
      throw new ApiError('INTERNAL_ERROR');
    }
    return selection;
  }

  /**
   * 그 시도의 회원·분석 요청 저장소 ID의 소속 SHA 전체(CR2 계약 C1, BR3.1). 순서·상한을 두지 않는다. 회원·저장소는
   * 접수 기록에서 읽은 값만 쓰고 요청 값으로 받지 않는다. 조회 오류는 바꾸지 않고 올려 지금처럼 500이다.
   */
  private async assignedCommitShas(manager: EntityManager, memberId: string, repositoryId: string): Promise<string[]> {
    const rows = await manager.createQueryBuilder(CommitAssignmentEntity, 'assignment')
      .select('assignment.commit_sha', 'commitSha')
      .where('assignment.member_id = :memberId', { memberId })
      .andWhere('assignment.github_repository_id = :repositoryId', { repositoryId })
      .getRawMany<{ commitSha: string }>();
    return rows.map((row) => row.commitSha);
  }

  private async credential(memberId: string) {
    try {
      return await this.github.resolveCredential(memberId);
    } catch (error) {
      // resolveCredential은 회원이 없거나 비활성이면 details 없는 RESOURCE_UNAVAILABLE을 던진다(requireMember).
      if (error instanceof ApiError && error.code === 'RESOURCE_UNAVAILABLE' && error.details === undefined) {
        return unavailable('MEMBER_INACTIVE');
      }
      throw error;
    }
  }

  async read(attemptId: string) {
    if (!isUUID(attemptId)) return unavailable('ATTEMPT_NOT_ACTIVE');
    const accepted = await this.accepted(this.dataSource.manager, attemptId);
    const selected = await this.selected(this.dataSource.manager, accepted, null);
    // 연결 참조는 불투명 비교값으로만 읽는다. 자격정보 원문/보관 참조 해석은 기존 함수의 책임이다.
    const connection = await this.dataSource.manager.findOneBy(GitHubConnection, { memberId: accepted.memberId });
    if (connection?.connectionState === 'REAUTH_REQUIRED') return unavailable('GITHUB_REAUTH_REQUIRED');
    // 보관 자격정보가 없는 연결(개발용 합성 연결 포함)도 실제 GitHub 연결이 없는 것으로 본다.
    if (connection?.connectionState !== 'CONNECTED' || connection.credentialReference === null) {
      return unavailable('GITHUB_NOT_CONNECTED');
    }
    const connectionReference = connection.credentialReference;
    // #231/#254의 단일 함수만 사용하며 DB의 credentialReference를 직접 해석하지 않는다.
    // 사용 불가·만료·재인증 필요와 조회 중 해제·재연결은 모두 null이다.
    const credential = await this.credential(accepted.memberId);
    if (!credential) return unavailable('GITHUB_REAUTH_REQUIRED');
    return this.dataSource.transaction('READ COMMITTED', async manager => {
      const current = await this.accepted(manager, attemptId, accepted.requestId);
      if (current.requestId !== accepted.requestId || current.memberId !== accepted.memberId ||
          current.repositoryId !== accepted.repositoryId || current.consentId !== accepted.consentId ||
          current.scopeRevision !== accepted.scopeRevision) return unavailable('SCOPE_UNVERIFIED');
      const selection = await this.selected(manager, current, 'pessimistic_read');
      // resolveCredential이 끝난 뒤 선정 확인을 기다리는 동안 해제/같은 계정 재연결도 일어날 수 있다.
      // 이 행 잠금부터 응답 객체 구성까지 연결 교체가 끼어들지 못하게 하고 이전 참조를 거부한다.
      const currentConnection = await manager.findOne(GitHubConnection, {
        where: { memberId: current.memberId }, lock: { mode: 'pessimistic_read' },
      });
      if (currentConnection?.connectionState !== 'CONNECTED' || currentConnection.credentialReference !== connectionReference ||
          currentConnection.accountLogin !== credential.accountLogin ||
          currentConnection.externalAccountReference !== credential.externalAccountReference) return unavailable('GITHUB_REAUTH_REQUIRED');
      if (selection.repository.owner !== selected.repository.owner || selection.repository.name !== selected.repository.name) {
        return unavailable('SCOPE_UNVERIFIED');
      }
      if (credential.memberId !== current.memberId || credential.expiresAt.getTime() <= Date.now()) return unavailable('GITHUB_REAUTH_REQUIRED');
      if (!/^[1-9][0-9]*$/.test(credential.externalAccountReference)) throw new ApiError('INTERNAL_ERROR');
      const types = allowedResourceTypes(current);
      if (!types) return unavailable('SCOPE_UNVERIFIED');
      const assignedCommitShas = await this.assignedCommitShas(manager, current.memberId, current.repositoryId);
      return {
        attemptId: current.attemptId,
        requestId: current.requestId,
        // worker가 요청 메시지와 대조하는 접수 기록(#121). 동의 행·동의 범위 JSON·시도 행의 값이다.
        consentId: current.consentId,
        noticeRevision: current.noticeRevision,
        allowedResourceTypes: types,
        sourceMode: current.sourceMode,
        credential: {
          memberId: current.memberId,
          repositoryId: current.repositoryId,
          scopeRevision: current.scopeRevision,
          repository: { owner: selection.repository.owner, name: selection.repository.name },
          linkedAccount: { login: credential.accountLogin, externalAccountId: credential.externalAccountReference },
          // 보호 HTTP 응답을 만들 때만 원문을 꺼낸다. 로그/큐/DB로 전달하지 않는다.
          accessToken: credential.token.reveal(),
          expiresAt: credential.expiresAt.toISOString(),
        },
        selection: { repositoryId: current.repositoryId, wholeRepository: true as const },
        // 이미 Catch에 속한 커밋. worker가 재분석 때 빼는 데 쓴다(CR2). 없으면 빈 배열이다.
        assignedCommitShas,
      };
    });
  }
}

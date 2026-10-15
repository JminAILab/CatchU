import { Inject, Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { DataSource, EntityManager } from 'typeorm';
import { ApiError } from '../common/errors';
import { GitHubConnectionService } from '../github-connection/github-connection.service';
import { AnalysisAttempt, AnalysisConsent, AnalysisRequest, GitHubConnection, MemberAccount } from '../member-analysis/member-analysis.entity';
import { AcceptedWorkerContext, WORKER_REPOSITORY_SELECTION_SOURCE,
  WorkerRepositorySelection, WorkerRepositorySelectionSource } from './worker-context.types';

const unavailable = (): never => { throw new ApiError('RESOURCE_UNAVAILABLE'); };

@Injectable()
export class WorkerContextService {
  constructor(private readonly dataSource: DataSource, private readonly github: GitHubConnectionService,
    @Inject(WORKER_REPOSITORY_SELECTION_SOURCE) private readonly selections: WorkerRepositorySelectionSource) {}

  private async accepted(manager: EntityManager, attemptId: string, lock = false): Promise<AcceptedWorkerContext> {
    // 한 SQL에서 현재 시도·소유회원·동의 관계를 대조한다. UNCERTAIN도 실행 허가가 아니다.
    const query = manager.createQueryBuilder(AnalysisAttempt, 'attempt')
      .innerJoin(AnalysisRequest, 'request', 'request.request_id = attempt.request_id AND request.current_attempt_id = attempt.attempt_id')
      .innerJoin(MemberAccount, 'member', 'member.member_id = request.member_id')
      .innerJoin(AnalysisConsent, 'consent', `consent.consent_id = request.consent_id AND consent.request_id = request.request_id
        AND consent.member_id = request.member_id AND consent.repository_id = request.repository_id`)
      .select('attempt.attempt_id', 'attemptId').addSelect('request.request_id', 'requestId')
      .addSelect('request.member_id', 'memberId').addSelect('request.repository_id', 'repositoryId')
      .addSelect('consent.scope_revision', 'scopeRevision').addSelect('consent.consented_scope', 'consentedScope')
      .where('attempt.attempt_id = :attemptId', { attemptId })
      .andWhere('request.lifecycle = :lifecycle', { lifecycle: 'ACTIVE' })
      .andWhere('request.request_state = :requestState', { requestState: 'ACCEPTED' })
      .andWhere('attempt.processing IN (:...processing)', { processing: ['QUEUED', 'RUNNING'] })
      .andWhere('attempt.source_mode = :sourceMode', { sourceMode: 'LIVE' })
      .andWhere('member.account_state = :accountState', { accountState: 'ACTIVE' })
      .andWhere('consent.accepted = true');
    // GitHub 호출 후 짧은 최종 확인 중 종결/회원 비활성화가 끼어들지 않게 한다.
    if (lock) query.setLock('pessimistic_read', undefined, ['attempt', 'request', 'member', 'consent']);
    return await query.getRawOne<AcceptedWorkerContext>() ?? unavailable();
  }

  private async selected(manager: EntityManager, context: AcceptedWorkerContext): Promise<WorkerRepositorySelection> {
    const selection = await this.selections.resolve(manager, context);
    if (!selection || selection.attemptId !== context.attemptId || selection.requestId !== context.requestId ||
        selection.memberId !== context.memberId || selection.repositoryId !== context.repositoryId ||
        selection.scopeRevision !== context.scopeRevision || selection.wholeRepository !== true) return unavailable();
    // 저장소 좌표는 공급자의 데이터 경계에서 검사한다. 임의 URL/경로로 바꾸지 않는다.
    if (!selection.repository || typeof selection.repository.owner !== 'string' || typeof selection.repository.name !== 'string' ||
        !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(selection.repository.owner) ||
        !/^[A-Za-z0-9_.-]{1,100}$/.test(selection.repository.name) || ['.', '..'].includes(selection.repository.name)) {
      throw new ApiError('INTERNAL_ERROR');
    }
    return selection;
  }

  async read(attemptId: string) {
    if (!isUUID(attemptId)) return unavailable();
    const accepted = await this.accepted(this.dataSource.manager, attemptId);
    const selected = await this.selected(this.dataSource.manager, accepted);
    // 연결 참조는 불투명 비교값으로만 읽는다. 자격정보 원문/보관 참조 해석은 기존 함수의 책임이다.
    const connection = await this.dataSource.manager.findOneBy(GitHubConnection, { memberId: accepted.memberId });
    if (connection?.connectionState !== 'CONNECTED' || connection.credentialReference === null) return unavailable();
    const connectionReference = connection.credentialReference;
    // #231/#254의 단일 함수만 사용하며 DB의 credentialReference를 직접 해석하지 않는다.
    const credential = await this.github.resolveCredential(accepted.memberId);
    if (!credential) return unavailable();
    return this.dataSource.transaction('READ COMMITTED', async manager => {
      const current = await this.accepted(manager, attemptId, true);
      if (current.requestId !== accepted.requestId || current.memberId !== accepted.memberId ||
          current.repositoryId !== accepted.repositoryId || current.scopeRevision !== accepted.scopeRevision) return unavailable();
      const selection = await this.selected(manager, current);
      // resolveCredential이 끝난 뒤 선정 확인을 기다리는 동안 해제/같은 계정 재연결도 일어날 수 있다.
      // 이 행 잠금부터 응답 객체 구성까지 연결 교체가 끼어들지 못하게 하고 이전 참조를 거부한다.
      const currentConnection = await manager.findOne(GitHubConnection, {
        where: { memberId: current.memberId }, lock: { mode: 'pessimistic_read' },
      });
      if (currentConnection?.connectionState !== 'CONNECTED' || currentConnection.credentialReference !== connectionReference ||
          currentConnection.accountLogin !== credential.accountLogin ||
          currentConnection.externalAccountReference !== credential.externalAccountReference) return unavailable();
      if (selection.repository.owner !== selected.repository.owner || selection.repository.name !== selected.repository.name ||
          credential.memberId !== current.memberId || credential.expiresAt.getTime() <= Date.now()) return unavailable();
      if (!/^[1-9][0-9]*$/.test(credential.externalAccountReference)) throw new ApiError('INTERNAL_ERROR');
      return {
        attemptId: current.attemptId,
        requestId: current.requestId,
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
      };
    });
  }
}

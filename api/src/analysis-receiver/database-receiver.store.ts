import { DataSource } from 'typeorm';
import { AnalysisAttempt, AnalysisConsent, AnalysisRequest, MemberAccount } from '../member-analysis/member-analysis.entity';
import { readRegistrationScope } from '../member-repositories/registration-scope';
import { RepositoryRegistration } from '../member-repositories/repository-registration.entity';
import { ResultApplicationRecord } from '../result-application/result-application.entity';
import { AttemptSnapshot, ReceiverStore, ReceiverTransaction } from './receiver.types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** #104 → #205의 실제 테이블에 수신 정본을 먼저 커밋한다. 원문·Catch는 저장하지 않는다. */
export class DatabaseReceiverStore implements ReceiverStore {
  constructor(private readonly dataSource: DataSource) {}

  async withRequest<T>(requestId: string, work: (tx: ReceiverTransaction) => Promise<T>): Promise<T> {
    return this.dataSource.transaction('READ COMMITTED', async manager => {
      // CASCADE 삭제가 부모에서 자식으로 잠그므로 수신도 부모를 먼저 보호한다.
      // 이 비잠금 조회는 부모 식별에만 쓰고, 수신 맥락은 아래 잠금 후 다시 읽는다.
      const parents = UUID.test(requestId) ? await manager.findOne(AnalysisRequest, {
        where: { requestId }, select: { memberId: true, registrationId: true, repositoryId: true },
      }) : null;
      const member = parents ? await manager.findOne(MemberAccount, {
        where: { memberId: parents.memberId, accountState: 'ACTIVE' }, lock: { mode: 'pessimistic_read' },
      }) : null;
      const registration = member && parents ? await manager.findOne(RepositoryRegistration, {
        where: { registrationId: parents.registrationId, memberId: parents.memberId, repositoryId: parents.repositoryId },
        lock: { mode: 'pessimistic_read' },
      }) : null;
      // 부모 잠금 뒤에는 기존 반영/시한 경로의 자식 순서(요청 → 시도 → 수신 기록)를 유지한다.
      const lockedRequest = registration ? await manager.findOne(AnalysisRequest, {
        where: { requestId }, lock: { mode: 'pessimistic_write' },
      }) : null;
      // 최초 조회 뒤 부모 참조가 바뀌었으면 다른 부모를 추가로 잠그지 않고 거부한다.
      const request = lockedRequest && parents && lockedRequest.memberId === parents.memberId &&
        lockedRequest.registrationId === parents.registrationId && lockedRequest.repositoryId === parents.repositoryId
        ? lockedRequest : null;
      const attempt = request ? await manager.findOne(AnalysisAttempt, {
        where: { attemptId: request.currentAttemptId, requestId }, lock: { mode: 'pessimistic_write' },
      }) : null;
      const consent = request ? await manager.findOneBy(AnalysisConsent, {
        consentId: request.consentId, requestId, memberId: request.memberId, repositoryId: request.repositoryId,
      }) : null;
      const received = attempt ? await manager.findOne(ResultApplicationRecord, {
        where: { attemptId: attempt.attemptId, requestId }, lock: { mode: 'pessimistic_write' },
      }) : null;
      const scope = readRegistrationScope(consent?.consentedScope);
      const liveScopeValid = attempt?.sourceMode !== 'LIVE' || (scope && scope.registrationId === request?.registrationId && scope.repositoryId === request?.repositoryId && scope.revision === consent?.scopeRevision);
      const snapshot: AttemptSnapshot | null = request && attempt && consent?.accepted && member && registration && liveScopeValid ? {
        context: { requestId: request.requestId, attemptId: attempt.attemptId, memberId: request.memberId,
          repositoryId: request.repositoryId, consentId: request.consentId,
          scopeRevision: consent.scopeRevision, sourceMode: attempt.sourceMode },
        lifecycle: request.lifecycle, processing: attempt.processing, application: attempt.application,
        received: received ? { ...received, receivedAt: received.receivedAt.toISOString() } : null,
      } : null;
      return work({
        snapshot,
        saveObservation: async (_event, processing) => {
          if (!snapshot || snapshot.lifecycle !== 'ACTIVE') throw new Error('수신 맥락이 없습니다.');
          await manager.update(AnalysisAttempt, { attemptId: snapshot.context.attemptId }, { processing });
          // worker의 observedAt은 처리 시한 판정의 서버 시각으로 사용하지 않는다.
          await manager.update(AnalysisRequest, { requestId }, { updatedAt: new Date() });
        },
        saveResult: async (metadata, state) => {
          if (!snapshot || snapshot.lifecycle !== 'ACTIVE' || metadata.requestId !== requestId ||
            metadata.attemptId !== snapshot.context.attemptId) throw new Error('수신 맥락이 없습니다.');
          await manager.insert(ResultApplicationRecord, { ...metadata, receivedAt: new Date(metadata.receivedAt) });
          await manager.update(AnalysisAttempt, { attemptId: snapshot.context.attemptId }, {
            ...state, ownerResultsReady: false,
          });
          await manager.update(AnalysisRequest, { requestId }, { updatedAt: new Date() });
        },
      });
    });
  }
}

import { DataSource } from 'typeorm';
import { AnalysisAttempt, AnalysisConsent, AnalysisRequest } from '../member-analysis/member-analysis.entity';
import { ResultApplicationRecord } from '../result-application/result-application.entity';
import { AttemptSnapshot, ReceiverStore, ReceiverTransaction } from './receiver.types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** #104 → #205의 실제 테이블에 수신 정본을 먼저 커밋한다. 원문·Catch는 저장하지 않는다. */
export class DatabaseReceiverStore implements ReceiverStore {
  constructor(private readonly dataSource: DataSource) {}

  async withRequest<T>(requestId: string, work: (tx: ReceiverTransaction) => Promise<T>): Promise<T> {
    return this.dataSource.transaction('READ COMMITTED', async manager => {
      // #205/#237과 같은 요청 → 현재 시도 → 수신 기록 순서다.
      const request = UUID.test(requestId) ? await manager.findOne(AnalysisRequest, {
        where: { requestId }, lock: { mode: 'pessimistic_write' },
      }) : null;
      const attempt = request ? await manager.findOne(AnalysisAttempt, {
        where: { attemptId: request.currentAttemptId, requestId }, lock: { mode: 'pessimistic_write' },
      }) : null;
      const consent = request ? await manager.findOneBy(AnalysisConsent, {
        consentId: request.consentId, requestId, memberId: request.memberId, repositoryId: request.repositoryId,
      }) : null;
      const received = attempt ? await manager.findOne(ResultApplicationRecord, {
        where: { attemptId: attempt.attemptId, requestId }, lock: { mode: 'pessimistic_write' },
      }) : null;
      const snapshot: AttemptSnapshot | null = request && attempt && consent?.accepted ? {
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

import { DataSource, QueryFailedError } from 'typeorm';
import { ApplicationFailureRecordingError, ResultApplicationContextError, ResultApplicationService } from '../result-application/result-application.service';
import { RegistrationFailureReason } from '../result-application/registration.port';
import { AnalysisReceiver } from './analysis-receiver.service';
import { RepositoryRegistrationPort } from './repository-registration.port';
import { RepositoryObservation, RepositoryObservationSource } from './repository-observation.source';
import { ResultReceipt } from './receiver.types';

/** 원인 값·DB/외부 응답을 노출하지 않는 내부 실패. Receipt와 반영 성공은 별개다. */
export class AnalysisRegistrationError extends Error {
  constructor() { super('분석 결과의 반영에 실패했습니다.'); }
}

export class AnalysisReceiptDeliveryError extends Error {
  constructor() { super('분석 결과의 수신 확인 전달에 실패했습니다.'); }
}

/** 검사·중복 판정은 #139, 저장/롤백/실패 기록은 #205, Catch 등록은 #143을 재사용한다. */
export class AnalysisRegistrationService {
  constructor(private readonly receiver: AnalysisReceiver, private readonly dataSource: DataSource,
    private readonly observations: RepositoryObservationSource,
    private readonly log: { failed(code: RegistrationFailureReason | 'APPLICATION_FAILED' |
      'FAILURE_RECORDING_FAILED' | 'STORAGE_UNAVAILABLE' | 'PROTECTION_UNAVAILABLE' | 'RECEIPT_DELIVERY_FAILED'): void }) {}

  async receiveResult(input: unknown, acknowledge: (receipt: ResultReceipt | null) => Promise<void>) {
    const received = await this.receiver.receiveResult(input);
    // DB 커밋 후 Receipt를 먼저 알린다. 중복 재전달을 자동 재반영에 사용하지 않는다.
    try { await acknowledge(received.receipt); }
    catch {
      this.log.failed('RECEIPT_DELIVERY_FAILED');
      throw new AnalysisReceiptDeliveryError();
    }
    if (!received.accepted) return { receipt: received.receipt };
    const accepted = received.accepted;
    let observation: RepositoryObservation | null = null;
    if (accepted.result.candidates.length > 0) {
      try {
        // 외부 조회는 반영 트랜잭션 밖에서 수행한다. 검증된 DB 맥락만 공급자에 전달한다.
        observation = structuredClone(await this.observations.observe(Object.freeze({
          requestId: accepted.result.requestId, attemptId: accepted.result.attemptId,
          memberId: accepted.result.memberId, repositoryId: accepted.result.repositoryId,
          consentId: accepted.result.consentId, scopeRevision: accepted.result.scopeRevision,
          sourceMode: accepted.result.sourceMode,
        })));
      } catch {
        // NONE·준비 완료로 보정하지 않고 기존 E 실패 기록 경로로 거부한다.
        this.log.failed('PROTECTION_UNAVAILABLE');
        observation = null;
      }
    }
    const registration = new RepositoryRegistrationPort(observation, accepted.result.repositoryId);
    const application = new ResultApplicationService(this.dataSource, registration);
    try {
      return { receipt: received.receipt, application: await application.apply(accepted) };
    } catch (error) {
      this.log.failed(error instanceof ApplicationFailureRecordingError ? 'FAILURE_RECORDING_FAILED'
        : error instanceof QueryFailedError ? 'STORAGE_UNAVAILABLE'
        : error instanceof ResultApplicationContextError ? error.reason
        : registration.classifyError(error) ?? 'APPLICATION_FAILED');
      throw new AnalysisRegistrationError();
    }
  }

  receiveProgress(input: unknown) { return this.receiver.receiveProgress(input); }
}

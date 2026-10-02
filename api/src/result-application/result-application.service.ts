import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import { resultFingerprint } from '../analysis-receiver/analysis-receiver.service';
import { ReceiveResult, Result } from '../analysis-receiver/receiver.types';
import { RegistrationPort, RegistrationResult } from './registration.port';
import { AnalysisAttempt, AnalysisConsent, AnalysisRequest } from '../member-analysis/member-analysis.entity';
import { ResultApplicationRecord } from './result-application.entity';

/** E가 보존된 수신 정본·등록 연결을 대조하다 거부한 내부 오류. 공개 오류 코드를 추가하지 않는다. */
export class ResultApplicationContextError extends Error {
  constructor(readonly reason: 'CONTEXT_MISMATCH' | 'REGISTRATION_MISMATCH') {
    super('결과 반영 맥락을 확인할 수 없습니다.');
    this.name = 'ResultApplicationContextError';
  }
}

type Accepted = NonNullable<ReceiveResult['accepted']>;
export interface AppliedResult {
  registrations: RegistrationResult[];
  registeredCatchIds: string[];
  ownerResultsReady: boolean;
  application: 'APPLIED';
  lifecycle: 'CLOSED';
}

/** 두 실패를 보존하되 오류 원문을 응답 메시지로 만들지 않는다. */
export class ApplicationFailureRecordingError extends Error {
  constructor(readonly applicationFailure: unknown, readonly recordingFailure: unknown) {
    super('Analysis application and failure recording failed');
  }
}

/** 검증·커밋된 수신 기록 이후 호출하는 내부 서비스. 수신/자동 복구/HTTP API가 아니다. */
export class ResultApplicationService {
  constructor(private readonly dataSource: DataSource,
    private readonly registration: RegistrationPort) {}

  async apply(accepted: Accepted): Promise<AppliedResult> {
    // 호출자의 변경이 await 사이에 검증된 입력을 바꾸지 않게 한다.
    const input = structuredClone(accepted);
    let matched = false;
    try {
      return await this.dataSource.transaction('READ COMMITTED', async manager => {
        const { request, attempt, receipt } = await this.lock(manager, input);
        this.assertContext(input.result, input, request, attempt, receipt);
        const consent = await manager.findOneBy(AnalysisConsent, { consentId: request.consentId });
        if (!consent || !consent.accepted || consent.requestId !== request.requestId ||
          consent.memberId !== request.memberId || consent.repositoryId !== request.repositoryId ||
          consent.scopeRevision !== input.result.scopeRevision) throw new ResultApplicationContextError('CONTEXT_MISMATCH');
        const replay = attempt.application === 'APPLIED';
        if (!replay && (request.lifecycle !== 'ACTIVE' ||
          !['PENDING', 'APPLY_FAILED', 'RECOVERING'].includes(attempt.application))) {
          throw new ResultApplicationContextError('CONTEXT_MISMATCH');
        }
        if (replay && request.lifecycle !== 'CLOSED') throw new ResultApplicationContextError('CONTEXT_MISMATCH');
        matched = true;
        if (!replay) await manager.update(AnalysisAttempt, { attemptId: attempt.attemptId },
          { application: attempt.application === 'PENDING' ? 'APPLYING' : 'RECOVERING' });
        const result = input.result;
        const registrations = await this.registration.register(manager, {
          applicationRecordId: receipt.applicationRecordId, requestId: result.requestId,
          attemptId: result.attemptId, resultId: result.resultId, ownerId: result.memberId,
          sourceMode: result.sourceMode, candidates: result.candidates,
        });
        // 반환값뿐 아니라 실제 저장된 후보 연결의 완전성과 준비 여부를 대조한다.
        const stored: RegistrationResult[] = await manager.query(`
          SELECT candidate_id AS "candidateId", catch_id AS "catchId", disposition,
                 owner_view_ready AS "ownerViewReady"
            FROM candidate_registration WHERE application_record_id = $1`, [receipt.applicationRecordId]);
        const expected = new Set(result.candidates.map(c => c.candidateId));
        if (expected.size !== result.candidates.length || registrations.length !== expected.size || stored.length !== expected.size ||
          new Set(registrations.map(r => r.candidateId)).size !== expected.size ||
          registrations.some(r => !expected.has(r.candidateId) || !stored.some(s =>
            s.candidateId === r.candidateId && s.catchId === r.catchId && s.disposition === r.disposition && s.ownerViewReady === r.ownerViewReady))) {
          throw new ResultApplicationContextError('REGISTRATION_MISMATCH');
        }
        const registeredCatchIds = [...new Set(registrations.map(r => r.catchId))];
        const ownerResultsReady = registrations.some(r => r.ownerViewReady);
        await manager.update(AnalysisAttempt, { attemptId: result.attemptId }, {
          application: 'APPLIED', ownerResultsReady, failures: result.failures,
        });
        await manager.update(AnalysisRequest, { requestId: result.requestId }, { lifecycle: 'CLOSED', updatedAt: new Date() });
        return { registrations, registeredCatchIds, ownerResultsReady, application: 'APPLIED', lifecycle: 'CLOSED' };
      }); // Promise가 resolve되는 시점은 커밋 성공 이후다.
    } catch (error) {
      // 다른 결과/현재 시도/원문 불일치 거부는 기존 수신 정본의 실패로 기록하지 않는다.
      if (matched) {
        try { await this.recordFailure(input, error); }
        catch (recordingFailure) { throw new ApplicationFailureRecordingError(error, recordingFailure); }
      }
      // B 입력/맥락 거부, QueryFailedError 등 기존 오류 타입을 그대로 전달한다.
      throw error;
    }
  }

  private async lock(manager: EntityManager, input: Accepted) {
    // E 작업의 공통 순서: 요청 → 시도 → 수신 기록 → B 작업 잠금.
    const request = await manager.findOne(AnalysisRequest, {
      where: { requestId: input.result.requestId }, lock: { mode: 'pessimistic_write' },
    });
    const attempt = await manager.findOne(AnalysisAttempt, {
      where: { attemptId: input.result.attemptId }, lock: { mode: 'pessimistic_write' },
    });
    const receipt = await manager.findOne(ResultApplicationRecord, {
      where: { applicationRecordId: input.metadata.applicationRecordId }, lock: { mode: 'pessimistic_write' },
    });
    if (!request || !attempt || !receipt) throw new ResultApplicationContextError('CONTEXT_MISMATCH');
    return { request, attempt, receipt };
  }

  private assertContext(result: Result, input: Accepted, request: AnalysisRequest,
    attempt: AnalysisAttempt, receipt: ResultApplicationRecord): void {
    const metadata = input.metadata;
    if (request.currentAttemptId !== result.attemptId || request.memberId !== result.memberId ||
      request.repositoryId !== result.repositoryId || request.consentId !== result.consentId ||
      attempt.requestId !== request.requestId || attempt.sourceMode !== result.sourceMode ||
      attempt.processing !== result.outcome || attempt.eligibleCandidateCount !== result.candidates.length ||
      receipt.requestId !== result.requestId || receipt.attemptId !== result.attemptId || receipt.resultId !== result.resultId ||
      metadata.requestId !== receipt.requestId || metadata.attemptId !== receipt.attemptId || metadata.resultId !== receipt.resultId ||
      metadata.payloadFingerprint !== receipt.payloadFingerprint || resultFingerprint(result) !== receipt.payloadFingerprint) {
      throw new ResultApplicationContextError('CONTEXT_MISMATCH');
    }
  }

  private async recordFailure(input: Accepted, error: unknown): Promise<void> {
    await this.dataSource.transaction('READ COMMITTED', async manager => {
      const { request, attempt, receipt } = await this.lock(manager, input);
      // 뒤늦은 실패 기록은 이미 성공한 반영이나 바뀐 현재 시도를 덮어쓰지 않는다.
      if (request.currentAttemptId !== input.result.attemptId || request.lifecycle !== 'ACTIVE' ||
        !['PENDING', 'APPLY_FAILED', 'RECOVERING'].includes(attempt.application)) return;
      this.assertContext(input.result, input, request, attempt, receipt);
      const code = error instanceof ResultApplicationContextError ? error.reason
        : error instanceof QueryFailedError ? 'STORAGE_UNAVAILABLE'
        : this.registration.classifyError(error) ?? 'APPLICATION_FAILED';
      await manager.update(AnalysisAttempt, { attemptId: attempt.attemptId }, {
        application: 'APPLY_FAILED', ownerResultsReady: false,
        failures: [...input.result.failures, { stage: 'APPLICATION', code, message: '결과 반영에 실패했습니다.' }],
      });
    });
  }
}

import type { EntityManager } from 'typeorm';
import type { Candidate, Result } from '../analysis-receiver/receiver.types';

/** PR #143의 기존 내부 입출력을 받는 E 호출 경계. 공개 API/새 제품 계약이 아니다. */
export interface RegistrationInput {
  applicationRecordId: string;
  requestId: string;
  attemptId: string;
  resultId: string;
  ownerId: string;
  sourceMode: Result['sourceMode'];
  candidates: readonly Candidate[];
}

export interface RegistrationResult {
  candidateId: string;
  catchId: string;
  disposition: 'CREATED' | 'EXISTING';
  ownerViewReady: boolean;
}

export type RegistrationFailureReason = 'INVALID_INPUT' | 'REGISTRATION_INELIGIBLE' |
  'TRANSACTION_REQUIRED' | 'INVALID_CONTEXT' | 'CONTEXT_MISMATCH' |
  'REGISTRATION_MISMATCH' | 'CATCH_NOT_READY';

/**
 * B 제공 후 연결부에서 명시적으로 공급한다. 기본 가짜 등록/자동 연결은 없다.
 * register는 E가 넘긴 manager만 사용하며 자체 커밋·다른 연결 저장을 하지 않는다.
 * classifyError는 실제 B 오류 타입만 분류하고, 원문/임의 reason을 실패 코드로 복사하지 않는다.
 */
export interface RegistrationPort {
  register(manager: EntityManager, input: RegistrationInput): Promise<RegistrationResult[]>;
  classifyError(error: unknown): RegistrationFailureReason | undefined;
}

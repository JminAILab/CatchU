export type CatchRegistrationInputReason = 'INVALID_INPUT' | 'REGISTRATION_INELIGIBLE';

// 오류에는 코드가 정한 필드명만 싣고 후보 값이나 하위 오류 원문을 받지 않는다.
export type CatchRegistrationInputField =
  | 'candidates'
  | 'candidate'
  | 'candidateId'
  | 'title'
  | 'workIdentity'
  | 'workFacts'
  | 'subjectContribution'
  | 'groupingBasis'
  | 'groupingLimitations'
  | 'eligibility'
  | 'draft'
  | 'draft.status'
  | 'draft.content'
  | 'reflection'
  | 'reflection.status'
  | 'reflection.questions'
  | 'evidence'
  | 'evidence.evidenceId'
  | 'evidence.sourceUrl'
  | 'evidence.sourceRevision'
  | 'evidence.representedFacts'
  | 'evidence.contributionScope'
  | 'evidence.coverageLimits'
  | 'ownCommitShas'
  | 'sourceMode';

/** B 내부의 명시적인 입력 거부다. 저장 실패나 공개 API 오류 코드를 뜻하지 않는다. */
export class CatchRegistrationInputError extends TypeError {
  constructor(
    readonly reason: CatchRegistrationInputReason,
    readonly field: CatchRegistrationInputField,
  ) {
    super(`${reason}: ${field}`);
    this.name = 'CatchRegistrationInputError';
  }
}

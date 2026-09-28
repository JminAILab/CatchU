import {
  CatchContentSource,
  NewCatchContent,
  SourceMode,
  prepareNewCatchContent,
} from './new-catch-content';
import { CatchRegistrationInputError, CatchRegistrationInputField } from './registration-input-error';

// worker Candidate의 필요한 속성을 표현한 B 내부 타입이다. 수신 DTO를 대신하지 않는다.
export interface RegistrationCandidate extends CatchContentSource {
  readonly candidateId: string;
  readonly groupingBasis: string;
  readonly groupingLimitations: readonly string[];
  readonly eligibility: {
    readonly workFactsVerified: boolean;
    readonly contributionVerified: boolean;
    readonly independentOfFailures: boolean;
  };
}

export interface PreparedWorkGroup {
  workIdentity: string;
  candidates: {
    candidateId: string;
    content: NewCatchContent;
    groupingBasis: string;
    groupingLimitations: string[];
  }[];
}

function assertString(value: unknown, field: CatchRegistrationInputField, nonempty = false): asserts value is string {
  if (typeof value !== 'string' || (nonempty && value.length === 0)) {
    throw new CatchRegistrationInputError('INVALID_INPUT', field);
  }
}

function assertStrings(value: unknown, field: CatchRegistrationInputField, nonempty = false): asserts value is string[] {
  if (!Array.isArray(value) || (nonempty && value.length === 0)) {
    throw new CatchRegistrationInputError('INVALID_INPUT', field);
  }
  for (const item of value) assertString(item, field);
}

function validateCandidate(candidate: RegistrationCandidate): void {
  if (!candidate || typeof candidate !== 'object') {
    throw new CatchRegistrationInputError('INVALID_INPUT', 'candidate');
  }
  assertString(candidate.candidateId, 'candidateId', true);
  assertString(candidate.title, 'title', true);
  assertString(candidate.workIdentity, 'workIdentity', true);
  assertStrings(candidate.workFacts, 'workFacts', true);
  assertString(candidate.subjectContribution, 'subjectContribution', true);
  assertString(candidate.groupingBasis, 'groupingBasis');
  assertStrings(candidate.groupingLimitations, 'groupingLimitations');

  if (candidate.eligibility?.workFactsVerified !== true
    || candidate.eligibility?.contributionVerified !== true
    || candidate.eligibility?.independentOfFailures !== true) {
    // 부적합 후보를 조용히 제외해 결과 0건/전체 반영 완료로 바꾸지 않는다.
    throw new CatchRegistrationInputError('REGISTRATION_INELIGIBLE', 'eligibility');
  }

  if (!candidate.draft) throw new CatchRegistrationInputError('INVALID_INPUT', 'draft');
  if (!candidate.reflection) throw new CatchRegistrationInputError('INVALID_INPUT', 'reflection');
  assertStrings(candidate.reflection.questions, 'reflection.questions');

  if (!Array.isArray(candidate.evidence) || candidate.evidence.length === 0) {
    throw new CatchRegistrationInputError('INVALID_INPUT', 'evidence');
  }
  const evidenceIds = new Set<string>();
  for (const evidence of candidate.evidence) {
    if (!evidence || typeof evidence !== 'object') {
      throw new CatchRegistrationInputError('INVALID_INPUT', 'evidence');
    }
    assertString(evidence.evidenceId, 'evidence.evidenceId', true);
    const sourceUrl = evidence.sourceUrl;
    assertString(sourceUrl, 'evidence.sourceUrl', true);
    // URL을 조회하거나 변환해 저장하지 않는다. 출처 일치는 실제 연결에서 검사한다.
    if (!URL.canParse(sourceUrl)) {
      throw new CatchRegistrationInputError('INVALID_INPUT', 'evidence.sourceUrl');
    }
    assertString(evidence.sourceRevision, 'evidence.sourceRevision', true);
    assertStrings(evidence.representedFacts, 'evidence.representedFacts', true);
    assertString(evidence.contributionScope, 'evidence.contributionScope');
    assertStrings(evidence.coverageLimits, 'evidence.coverageLimits');
    if (evidenceIds.has(evidence.evidenceId)) {
      throw new CatchRegistrationInputError('INVALID_INPUT', 'evidence.evidenceId');
    }
    evidenceIds.add(evidence.evidenceId);
  }
}

/**
 * 같은 소유자·결과로 검증된 후보 묶음의 저장 전 검사와 작업별 분류를 수행한다.
 * 후보를 모두 검사해야만 결과를 반환하며 입력을 변경하거나 외부에 저장하지 않는다.
 * 작업 키는 전달된 문자열 그대로 비교한다. 실제 동일성 판별 알고리즘이 아니다.
 * DB의 기존 Catch 조회·소유권/출처 대조·동시성·트랜잭션은 별도로 구현해야 한다.
 */
export function prepareRegistrationBatch(
  candidates: readonly RegistrationCandidate[],
  sourceMode: SourceMode,
): PreparedWorkGroup[] {
  if (!Array.isArray(candidates)) throw new CatchRegistrationInputError('INVALID_INPUT', 'candidates');
  if (sourceMode !== 'MOCK' && sourceMode !== 'LIVE') {
    throw new CatchRegistrationInputError('INVALID_INPUT', 'sourceMode');
  }

  const candidateIds = new Set<string>();
  const groups = new Map<string, PreparedWorkGroup>();
  for (const candidate of candidates) {
    validateCandidate(candidate);
    if (candidateIds.has(candidate.candidateId)) {
      throw new CatchRegistrationInputError('INVALID_INPUT', 'candidateId');
    }
    candidateIds.add(candidate.candidateId);
    const prepared = {
      candidateId: candidate.candidateId,
      content: prepareNewCatchContent(candidate, sourceMode),
      groupingBasis: candidate.groupingBasis,
      groupingLimitations: [...candidate.groupingLimitations],
    };
    const group = groups.get(candidate.workIdentity);
    if (group) {
      // 후보별 내용은 보존한다. 본문 합치기·대표 후보 선택·기존 카드 수정은 하지 않는다.
      group.candidates.push(prepared);
    } else {
      groups.set(candidate.workIdentity, {
        workIdentity: candidate.workIdentity,
        candidates: [prepared],
      });
    }
  }
  return [...groups.values()];
}

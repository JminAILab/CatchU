import {
  CatchContentSource,
  NewCatchContent,
  SourceMode,
  isRevisitFactList,
  parseWorkTimes,
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
  // 후보의 본인 커밋 목록 전체(Result v3, CR2). 등록이 그 Catch의 소속으로 쓴다.
  readonly ownCommitShas: readonly string[];
}

export interface PreparedWorkGroup {
  workIdentity: string;
  // 같은 열쇠 후보들의 본인 커밋 합집합(후보 순서대로 처음 나온 순서, 중복 없음). 그 Catch의 소속으로 쓴다(CR2 BR3.2).
  ownCommitShas: string[];
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
  if (candidate.title !== null) assertString(candidate.title, 'title', true);
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
  validateOwnCommitShas(candidate.ownCommitShas);
  validateRevisitFacts(candidate.revisitFacts, candidate.ownCommitShas);
  parseWorkTimes(candidate.firstWorkAt, candidate.lastWorkAt);
}

/**
 * 다시 볼 곳 사실의 등록 입력 검사(NC3 BR5.2, 보안 설계 2절). 계약 검사(Ajv)가 모양을 먼저 보고, 여기서는 종류별 경로·커밋
 * 수, 같은 사실 안 겹침, 사실의 커밋이 그 후보 ownCommitShas 안인지를 더 본다. 어기면 그 결과의 Catch를 하나도 등록하지
 * 않는다. 값은 오류에 싣지 않는다.
 */
function validateRevisitFacts(value: unknown, ownCommitShas: readonly string[]): void {
  if (!isRevisitFactList(value)) throw new CatchRegistrationInputError('INVALID_INPUT', 'revisitFacts');
  const own = new Set(ownCommitShas);
  if (!value.every((fact) => fact.commits.every((sha) => own.has(sha)))) {
    throw new CatchRegistrationInputError('INVALID_INPUT', 'revisitFacts');
  }
}

const COMMIT_SHA = /^[0-9a-f]{40}$/;
// 계약 C2의 상한(요청 하나가 모으는 커밋 수). 결과 검사가 먼저 막지만 등록도 같은 경계를 지킨다.
const MAX_OWN_COMMIT_SHAS = 3000;

/** 결과 계약(C2)과 같은 경계: 1~3,000개, 소문자 16진수 40자, 중복 없음. 값은 오류에 싣지 않는다. */
function validateOwnCommitShas(value: unknown): void {
  assertStrings(value, 'ownCommitShas', true);
  if (value.length > MAX_OWN_COMMIT_SHAS || !value.every((sha) => COMMIT_SHA.test(sha))
    || new Set(value).size !== value.length) {
    throw new CatchRegistrationInputError('INVALID_INPUT', 'ownCommitShas');
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
      // 소속은 같은 Catch에 모이므로 SHA만 합친다. 앞 후보 목록 뒤에 새 SHA를 처음 나온 순서로 잇는다.
      const known = new Set(group.ownCommitShas);
      for (const sha of candidate.ownCommitShas) {
        if (!known.has(sha)) {
          known.add(sha);
          group.ownCommitShas.push(sha);
        }
      }
    } else {
      groups.set(candidate.workIdentity, {
        workIdentity: candidate.workIdentity,
        ownCommitShas: [...candidate.ownCommitShas],
        candidates: [prepared],
      });
    }
  }
  return [...groups.values()];
}

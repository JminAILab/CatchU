import { CatchRegistrationInputError } from './registration-input-error';

type GenerationStatus = 'GENERATED' | 'FAILED' | 'NOT_GENERATED';
export type SourceMode = 'MOCK' | 'LIVE';

/** 다시 볼 곳 사실의 종류(NC3 계약 C4). 결과 메시지·catch_asset.revisit_facts·본인 응답이 같은 모양이다. */
export const REVISIT_FACT_KINDS = [
  'REWORKED_LINES', 'MOVED_FILE', 'EXTENSION_CHANGED', 'REVERTED', 'TEST_FILES_PRESENT',
] as const;
export type RevisitFactKind = (typeof REVISIT_FACT_KINDS)[number];

export interface RevisitFact {
  readonly kind: RevisitFactKind;
  readonly paths: readonly string[];
  readonly commits: readonly string[];
}

// 한 Catch의 사실 상한과 경로 길이(코드 포인트) 상한(NC3 BR2.5).
export const MAX_REVISIT_FACTS = 30;
const MAX_REVISIT_PATH_CHARS = 1024;
const COMMIT_SHA = /^[0-9a-f]{40}$/;
// 종류별 [최소, 최대] 경로·커밋 수. worker `revisit.py` KIND_COUNTS, web `catch-api.ts`와 같은 표다(NC3 보안 설계 2절).
const REVISIT_FACT_COUNTS: Record<RevisitFactKind, { paths: [number, number]; commits: [number, number] }> = {
  REWORKED_LINES: { paths: [1, 1], commits: [2, 2] },
  MOVED_FILE: { paths: [2, 2], commits: [1, 2] },
  EXTENSION_CHANGED: { paths: [2, 2], commits: [1, 2] },
  REVERTED: { paths: [0, 0], commits: [2, 2] },
  TEST_FILES_PRESENT: { paths: [1, 20], commits: [1, 20] },
};

function within(count: number, [min, max]: [number, number]): boolean {
  return count >= min && count <= max;
}

function isRevisitFactKind(value: unknown): value is RevisitFactKind {
  return typeof value === 'string' && (REVISIT_FACT_KINDS as readonly string[]).includes(value);
}

/**
 * 사실 하나의 모양을 본다: 칸 셋뿐, 모르는 kind 없음, 종류별 경로·커밋 수, 경로 1~1,024자, 식별값 소문자 16진수 40자,
 * 같은 사실 안 겹침 없음. 커밋이 그 후보 본인 커밋 안인지는 부르는 쪽(등록 입력 검사)이 본다.
 */
export function isRevisitFact(value: unknown): value is RevisitFact {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (keys.length !== 3 || !['kind', 'paths', 'commits'].every((key) => keys.includes(key))) return false;
  const { kind, paths, commits } = value as Record<string, unknown>;
  if (!isRevisitFactKind(kind) || !Array.isArray(paths) || !Array.isArray(commits)) return false;
  const counts = REVISIT_FACT_COUNTS[kind];
  return within(paths.length, counts.paths) && within(commits.length, counts.commits)
    && paths.every((path) => typeof path === 'string'
      && [...path].length >= 1 && [...path].length <= MAX_REVISIT_PATH_CHARS)
    && commits.every((sha) => typeof sha === 'string' && COMMIT_SHA.test(sha))
    && new Set(paths).size === paths.length && new Set(commits).size === commits.length;
}

/** 사실 배열(0~30개)인가. 본인 응답 무결성 검사(owner-catch-response)도 같은 함수를 쓴다. */
export function isRevisitFactList(value: unknown): value is RevisitFact[] {
  return Array.isArray(value) && value.length <= MAX_REVISIT_FACTS && value.every(isRevisitFact);
}

/**
 * 첫·마지막 작업 시각 글을 Date로 해석하고 순서를 본다(NC3 NFR 설계 검토 Minor 2). 오프셋·소수 초가 있는 글도
 * 계약 date-time이면 받는다. 값은 오류에 싣지 않는다.
 */
export function parseWorkTimes(first: unknown, last: unknown): { firstWorkAt: Date; lastWorkAt: Date } {
  const firstWorkAt = typeof first === 'string' ? new Date(first) : null;
  if (!firstWorkAt || Number.isNaN(firstWorkAt.getTime())) {
    throw new CatchRegistrationInputError('INVALID_INPUT', 'firstWorkAt');
  }
  const lastWorkAt = typeof last === 'string' ? new Date(last) : null;
  if (!lastWorkAt || Number.isNaN(lastWorkAt.getTime()) || firstWorkAt.getTime() > lastWorkAt.getTime()) {
    throw new CatchRegistrationInputError('INVALID_INPUT', 'lastWorkAt');
  }
  return { firstWorkAt, lastWorkAt };
}

interface CandidateEvidence {
  readonly evidenceId: string;
  readonly sourceUrl: string;
  readonly sourceRevision: string;
  readonly representedFacts: readonly string[];
  readonly contributionScope: string;
  readonly coverageLimits: readonly string[];
}

// B 내부의 본문 변환용 입력이다. E↔B 호출 계약이나 공개 API DTO가 아니다.
export interface CatchContentSource {
  readonly title: string | null;
  readonly workIdentity: string;
  readonly workFacts: readonly string[];
  readonly subjectContribution: string;
  readonly draft: {
    readonly status: GenerationStatus;
    readonly content: string | null;
  };
  readonly reflection: {
    readonly status: GenerationStatus;
    readonly questions: readonly string[];
  };
  readonly evidence: readonly CandidateEvidence[];
  // 다시 볼 곳 사실과 작업 시각(Result v4, NC3 BR6.1). 모양·소속·시각 순서는 등록 입력 검사가 먼저 본다.
  readonly revisitFacts: readonly RevisitFact[];
  readonly firstWorkAt: string;
  readonly lastWorkAt: string;
}

export interface NewCatchContent {
  asset: {
    title: string | null;
    workIdentity: string;
    workFacts: string[];
    subjectContribution: string;
    draftStatus: GenerationStatus;
    draftContent: string | null;
    reflectionStatus: GenerationStatus;
    reflectionQuestions: string[];
    workFactsConfirmed: false;
    contributionConfirmed: false;
    mismatch: false;
    visibility: 'PRIVATE';
    sourceMode: SourceMode;
    // 새 Catch에 한 번만 쓴다. 등록 뒤 고치는 경로는 없다(NC3 BR6.1).
    revisitFacts: RevisitFact[];
    firstWorkAt: Date;
    lastWorkAt: Date;
  };
  evidence: {
    sourceEvidenceId: string;
    sourceUrl: string;
    sourceRevision: string;
    representedFacts: string[];
    contributionScope: string;
    coverageLimits: string[];
  }[];
}

function isGenerationStatus(value: string): value is GenerationStatus {
  return value === 'GENERATED' || value === 'FAILED' || value === 'NOT_GENERATED';
}

/**
 * 등록 조건을 검사한 후보에서 새 Catch의 본문·근거 저장값만 만든다.
 * 소유권·적합성·중복 판정, ID 발급, DB 저장과 열람 준비 판정은 호출부의 별도 책임이다.
 * 기존 Catch를 갱신하는 데 사용하지 않는다.
 */
export function prepareNewCatchContent(
  candidate: CatchContentSource,
  sourceMode: SourceMode,
): NewCatchContent {
  if (sourceMode !== 'MOCK' && sourceMode !== 'LIVE') {
    throw new CatchRegistrationInputError('INVALID_INPUT', 'sourceMode');
  }
  if (!isGenerationStatus(candidate.draft.status)) {
    throw new CatchRegistrationInputError('INVALID_INPUT', 'draft.status');
  }
  if (!isGenerationStatus(candidate.reflection.status)) {
    throw new CatchRegistrationInputError('INVALID_INPUT', 'reflection.status');
  }
  if (candidate.draft.status === 'GENERATED') {
    if (typeof candidate.draft.content !== 'string') {
      throw new CatchRegistrationInputError('INVALID_INPUT', 'draft.content');
    }
  } else if (candidate.draft.content !== null) {
    throw new CatchRegistrationInputError('INVALID_INPUT', 'draft.content');
  }
  if (!isRevisitFactList(candidate.revisitFacts)) {
    throw new CatchRegistrationInputError('INVALID_INPUT', 'revisitFacts');
  }
  const { firstWorkAt, lastWorkAt } = parseWorkTimes(candidate.firstWorkAt, candidate.lastWorkAt);

  return {
    asset: {
      title: candidate.title,
      workIdentity: candidate.workIdentity,
      workFacts: [...candidate.workFacts],
      subjectContribution: candidate.subjectContribution,
      draftStatus: candidate.draft.status,
      draftContent: candidate.draft.content,
      reflectionStatus: candidate.reflection.status,
      reflectionQuestions: [...candidate.reflection.questions],
      workFactsConfirmed: false,
      contributionConfirmed: false,
      mismatch: false,
      visibility: 'PRIVATE',
      sourceMode,
      revisitFacts: candidate.revisitFacts.map((fact) => ({
        kind: fact.kind, paths: [...fact.paths], commits: [...fact.commits],
      })),
      firstWorkAt,
      lastWorkAt,
    },
    evidence: candidate.evidence.map((item) => ({
      sourceEvidenceId: item.evidenceId,
      sourceUrl: item.sourceUrl,
      sourceRevision: item.sourceRevision,
      representedFacts: [...item.representedFacts],
      contributionScope: item.contributionScope,
      coverageLimits: [...item.coverageLimits],
    })),
  };
}

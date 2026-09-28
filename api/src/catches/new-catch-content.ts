type GenerationStatus = 'GENERATED' | 'FAILED' | 'NOT_GENERATED';
export type SourceMode = 'MOCK' | 'LIVE';

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
  readonly title: string;
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
}

export interface NewCatchContent {
  asset: {
    title: string;
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
    throw new TypeError('sourceMode must be MOCK or LIVE');
  }
  if (!isGenerationStatus(candidate.draft.status)) {
    throw new TypeError('draft.status is invalid');
  }
  if (!isGenerationStatus(candidate.reflection.status)) {
    throw new TypeError('reflection.status is invalid');
  }
  if (candidate.draft.status === 'GENERATED') {
    if (typeof candidate.draft.content !== 'string') {
      throw new TypeError('GENERATED draft requires string content');
    }
  } else if (candidate.draft.content !== null) {
    throw new TypeError('Failed or ungenerated draft requires null content');
  }

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

// API v1 common.yaml의 Catch/Evidence/Draft/Reflection 필드를 그대로 표현한다.
// readonly는 합성 미리보기에서 자료를 수정하지 않기 위한 화면 내부 제약이다.
export type GenerationStatus = "GENERATED" | "FAILED" | "NOT_GENERATED";

export interface Evidence {
  readonly catchEvidenceId: string;
  readonly sourceEvidenceId: string;
  readonly sourceUrl: string;
  readonly sourceRevision: string;
  readonly representedFacts: readonly string[];
  readonly contributionScope: string;
  readonly coverageLimits: readonly string[];
}

export interface Draft {
  readonly status: GenerationStatus;
  readonly content: string | null;
}

export interface Reflection {
  readonly status: GenerationStatus;
  readonly questions: readonly string[];
}

export interface CatchAsset {
  readonly catchId: string;
  readonly title: string | null;
  readonly repositoryId: string;
  readonly sourceRequestId: string;
  readonly sourceResultId: string;
  readonly sourceCandidateId: string;
  readonly workFacts: readonly string[];
  readonly subjectContribution: string;
  readonly evidence: readonly Evidence[];
  readonly draft: Draft;
  readonly reflection: Reflection;
  readonly confirmation: {
    readonly workFactsConfirmed: boolean;
    readonly contributionConfirmed: boolean;
  };
  readonly mismatch: boolean;
  readonly visibility: "PRIVATE" | "PUBLIC";
  readonly restriction: "NONE" | "SOURCE_PRIVATE";
  readonly sourceMode: "MOCK" | "LIVE";
  /** 작성자 설명이 있는지(새 Catch C1). 목록 조건 `authorDescription=written`과 같은 판정이다. 설명 원문은 따로 읽는다. */
  readonly hasAuthorDescription: boolean;
}

/** 본인 목록의 작성자 설명 걸러 보기(새 Catch BR5.4). `all`이면 조건을 보내지 않는다. */
export type AuthorDescriptionFilter = "all" | "written" | "unwritten";

// 저장소 이름은 Catch 응답의 필드가 아니다. 화면의 필터 선택 자료로 분리한다.
export interface RepositoryOption {
  readonly repositoryId: string;
  readonly name: string;
}

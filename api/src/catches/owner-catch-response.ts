type GenerationStatus = 'GENERATED' | 'FAILED' | 'NOT_GENERATED';
type Visibility = 'PRIVATE' | 'PUBLIC';
type Restriction = 'NONE' | 'SOURCE_PRIVATE';
type SourceMode = 'MOCK' | 'LIVE';

/** ERD의 조회에 필요한 속성만 받는다. DB 엔티티/컬럼 정의가 아니다. */
export interface OwnerCatchReadSource {
  readonly asset: {
    readonly catchId: string;
    readonly ownerId: string;
    readonly title: string | null;
    readonly sourceRequestId: string;
    readonly sourceResultId: string;
    readonly sourceCandidateId: string;
    readonly workFacts: readonly string[];
    readonly subjectContribution: string;
    readonly draftStatus: GenerationStatus;
    readonly draftContent: string | null;
    readonly reflectionStatus: GenerationStatus;
    readonly reflectionQuestions: readonly string[];
    readonly workFactsConfirmed: boolean;
    readonly contributionConfirmed: boolean;
    readonly mismatch: boolean;
    readonly visibility: Visibility;
    readonly sourceMode: SourceMode;
    /** 작성자 설명이 null이 아닌지. 목록 조건 `authorDescription=written`과 같은 판정이다(새 Catch C1, BR5.3). */
    readonly hasAuthorDescription: boolean;
  };
  readonly sourceRequest: {
    readonly requestId: string;
    readonly memberId: string;
    readonly repositoryId: string;
  } | null;
  readonly evidence: readonly {
    readonly catchEvidenceId: string;
    readonly catchId: string;
    readonly sourceEvidenceId: string;
    readonly sourceUrl: string;
    readonly sourceRevision: string;
    readonly representedFacts: readonly string[];
    readonly contributionScope: string;
    readonly coverageLimits: readonly string[];
  }[];
  readonly protection: {
    readonly ownerId: string;
    readonly repositoryId: string;
    readonly appliedRestriction: Restriction;
    readonly confirmedSourceState: unknown;
    readonly observationProvenance: unknown;
    readonly observedAt: Date | null;
  } | null;
}

/** common.yaml의 본인용 Catch 응답. 수신자용 PublicCatch와 구분한다. */
export interface OwnerCatchResponse {
  catchId: string;
  title: string | null;
  repositoryId: string;
  sourceRequestId: string;
  sourceResultId: string;
  sourceCandidateId: string;
  workFacts: string[];
  subjectContribution: string;
  evidence: {
    catchEvidenceId: string;
    sourceEvidenceId: string;
    sourceUrl: string;
    sourceRevision: string;
    representedFacts: string[];
    contributionScope: string;
    coverageLimits: string[];
  }[];
  draft: { status: GenerationStatus; content: string | null };
  reflection: { status: GenerationStatus; questions: string[] };
  confirmation: { workFactsConfirmed: boolean; contributionConfirmed: boolean };
  mismatch: boolean;
  visibility: Visibility;
  restriction: Restriction;
  sourceMode: SourceMode;
  hasAuthorDescription: boolean;
}

/** 내부 자료 오류. HTTP 변환은 #88 연결에서 처리하며 입력값을 메시지에 넣지 않는다. */
export class CatchReadIntegrityError extends Error {
  constructor(readonly field: string) {
    super('저장된 Catch 조회 자료가 올바르지 않습니다.');
    this.name = 'CatchReadIntegrityError';
  }
}

function text(value: unknown, field: string, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) {
    throw new CatchReadIntegrityError(field);
  }
  return value;
}

function strings(value: readonly string[], field: string, minimum = 0): string[] {
  if (!Array.isArray(value) || value.length < minimum) throw new CatchReadIntegrityError(field);
  return Array.from(value, (item) => text(item, field, true));
}

function flag(value: boolean, field: string): boolean {
  if (typeof value !== 'boolean') throw new CatchReadIntegrityError(field);
  return value;
}

function uri(value: string, field: string): string {
  text(value, field);
  try { new URL(value); } catch { throw new CatchReadIntegrityError(field); }
  return value;
}

function choice<T extends string>(value: T, allowed: readonly T[], field: string): T {
  if (!allowed.includes(value)) throw new CatchReadIntegrityError(field);
  return value;
}

/**
 * 인증 Guard가 확인한 회원 ID와 조회 자료를 받는 순수 매핑이다. 인증/DB 조회를 대신하지 않는다.
 * 없음과 타인 자료는 모두 null, 본인 자료의 연결 누락·모순은 오류다. 성공/빈 결과로 보정하지 않는다.
 */
export function toOwnerCatchResponse(
  authenticatedMemberId: string,
  source: OwnerCatchReadSource | null,
): OwnerCatchResponse | null {
  text(authenticatedMemberId, 'authenticatedMemberId');
  if (source === null) return null;
  const { asset, sourceRequest, protection } = source;
  text(asset.ownerId, 'asset.ownerId');
  if (asset.ownerId !== authenticatedMemberId) return null;

  const catchId = text(asset.catchId, 'asset.catchId');
  if (!sourceRequest || sourceRequest.requestId !== asset.sourceRequestId
    || sourceRequest.memberId !== authenticatedMemberId) {
    throw new CatchReadIntegrityError('sourceRequest');
  }
  const repositoryId = text(sourceRequest.repositoryId, 'sourceRequest.repositoryId');
  // 명시적인 보호 판단과 관측이 없으면 NONE을 추정하지 않는다.
  if (!protection || protection.ownerId !== authenticatedMemberId
    || protection.repositoryId !== repositoryId) {
    throw new CatchReadIntegrityError('protection');
  }
  // 등록의 본인 열람 준비와 같은 기준이다. 최근 조회 실패는 이전 유효 관측을 무효화하지 않는다.
  for (const field of ['confirmedSourceState', 'observationProvenance', 'observedAt'] as const) {
    if (protection[field] === null || protection[field] === undefined) {
      throw new CatchReadIntegrityError('protection.' + field);
    }
  }
  if (!Array.isArray(source.evidence) || source.evidence.length === 0) {
    throw new CatchReadIntegrityError('evidence');
  }
  const evidenceIds = new Set<string>();
  const sourceEvidenceIds = new Set<string>();
  const evidence = Array.from(source.evidence, (item) => {
    if (!item || item.catchId !== catchId) throw new CatchReadIntegrityError('evidence.catchId');
    const catchEvidenceId = text(item.catchEvidenceId, 'evidence.catchEvidenceId');
    const sourceEvidenceId = text(item.sourceEvidenceId, 'evidence.sourceEvidenceId');
    if (evidenceIds.has(catchEvidenceId) || sourceEvidenceIds.has(sourceEvidenceId)) {
      throw new CatchReadIntegrityError('evidence.duplicate');
    }
    evidenceIds.add(catchEvidenceId);
    sourceEvidenceIds.add(sourceEvidenceId);
    return {
      catchEvidenceId,
      sourceEvidenceId,
      sourceUrl: uri(item.sourceUrl, 'evidence.sourceUrl'),
      sourceRevision: text(item.sourceRevision, 'evidence.sourceRevision'),
      representedFacts: strings(item.representedFacts, 'evidence.representedFacts', 1),
      contributionScope: text(item.contributionScope, 'evidence.contributionScope', true),
      coverageLimits: strings(item.coverageLimits, 'evidence.coverageLimits'),
    };
  });
  const draftStatus = choice<GenerationStatus>(asset.draftStatus, ['GENERATED', 'FAILED', 'NOT_GENERATED'], 'asset.draftStatus');
  const draftContent = draftStatus === 'GENERATED'
    ? text(asset.draftContent, 'asset.draftContent', true) : asset.draftContent;
  if (draftStatus !== 'GENERATED' && draftContent !== null) {
    throw new CatchReadIntegrityError('asset.draftContent');
  }

  return {
    catchId,
    title: asset.title === null ? null : text(asset.title, 'asset.title'),
    repositoryId,
    sourceRequestId: text(asset.sourceRequestId, 'asset.sourceRequestId'),
    sourceResultId: text(asset.sourceResultId, 'asset.sourceResultId'),
    sourceCandidateId: text(asset.sourceCandidateId, 'asset.sourceCandidateId'),
    workFacts: strings(asset.workFacts, 'asset.workFacts', 1),
    subjectContribution: text(asset.subjectContribution, 'asset.subjectContribution'),
    evidence,
    draft: { status: draftStatus, content: draftContent },
    reflection: {
      status: choice<GenerationStatus>(asset.reflectionStatus, ['GENERATED', 'FAILED', 'NOT_GENERATED'], 'asset.reflectionStatus'),
      questions: strings(asset.reflectionQuestions, 'asset.reflectionQuestions'),
    },
    confirmation: {
      workFactsConfirmed: flag(asset.workFactsConfirmed, 'asset.workFactsConfirmed'),
      contributionConfirmed: flag(asset.contributionConfirmed, 'asset.contributionConfirmed'),
    },
    mismatch: flag(asset.mismatch, 'asset.mismatch'),
    visibility: choice<Visibility>(asset.visibility, ['PRIVATE', 'PUBLIC'], 'asset.visibility'),
    restriction: choice<Restriction>(protection.appliedRestriction, ['NONE', 'SOURCE_PRIVATE'], 'protection.appliedRestriction'),
    sourceMode: choice<SourceMode>(asset.sourceMode, ['MOCK', 'LIVE'], 'asset.sourceMode'),
    hasAuthorDescription: flag(asset.hasAuthorDescription, 'asset.hasAuthorDescription'),
  };
}

/** 조회 계층에서 본인·필터·페이지 경계를 확인한 페이지를 포장한다. 커서를 생성하지 않는다. */
export function toOwnerCatchPage(
  authenticatedMemberId: string,
  sources: readonly OwnerCatchReadSource[],
  nextCursor: string | null,
): { items: OwnerCatchResponse[]; page: { nextCursor: string | null } } {
  text(authenticatedMemberId, 'authenticatedMemberId');
  if (!Array.isArray(sources)) throw new CatchReadIntegrityError('page.items');
  if (nextCursor !== null) text(nextCursor, 'page.nextCursor', true);
  const items = Array.from(sources, (source) => {
    const item = toOwnerCatchResponse(authenticatedMemberId, source);
    // 소유자 범위를 벗어난 조회를 정상 0건으로 숨기거나 일부만 성공 반환하지 않는다.
    if (item === null) throw new CatchReadIntegrityError('page.ownerId');
    return item;
  });
  return { items, page: { nextCursor } };
}

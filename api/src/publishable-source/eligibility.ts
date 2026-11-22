// 발행 자격 판정(발행 프리셋 intent U1 PublishableSource, 규칙 BR2.2·BR3.5, NFR 설계 검토 R-02 「읽기와 판정 나누기」, NFR2.10).
// 미리 읽은 행과 보호 관측 Map만 받는 순수 함수다. DB를 부르지 않으므로 프리셋 목록·상세·세기의 조회 수가 자료 수에 따라 늘지 않는다(NFR6.2).
// 발행은 잠근 행으로 blockingCatches를, 프리셋 경로는 잠그지 않고 읽은 행으로 catchUnpublishableReason을 부른다. 두 함수는 같은 판정 조각을 쓴다.
// 원 요청 불일치·보호 관측 없음·불완전은 10월 setVisibility와 같은 서버 오류(PublishIntegrityError, 500)이고 비공개로 단정하지 않는다(BR7.4).

/** 프리셋 경로가 보이는 발행할 수 없는 이유(P-1 unpublishableReason). 텍스트 자료는 이유가 없다. */
export type UnpublishableReason = 'CONFIRMATION_REQUIRED' | 'SOURCE_RESTRICTED' | 'PRIVATE' | 'EXTRACTION_INCOMPLETE';
export type CatchUnpublishableReason = Exclude<UnpublishableReason, 'EXTRACTION_INCOMPLETE'>;

/** 판정에 쓰는 Catch 칸(CatchSourceRow의 일부). */
export interface CatchEligibilityRow {
  catchId: string;
  visibility: 'PRIVATE' | 'PUBLIC';
  workFactsConfirmed: boolean;
  contributionConfirmed: boolean;
  requestMemberId: string | null;
  repositoryId: string | null;
}

/** repository_protection 한 행(원 요청 저장소의 보호 관측). */
export interface ProtectionRow {
  repositoryId: string;
  restriction: string;
  confirmedSourceState: unknown;
  observationProvenance: unknown;
  observedAt: Date | null;
}

/** 발행에서 처음 걸린 이유 하나와 그 이유로 막힌 Catch(BR3.5). */
export interface CatchBlock {
  reason: CatchUnpublishableReason;
  catchIds: string[];
}

/** 잠근(또는 읽은) Catch의 원 요청·보호 관측이 맞지 않는다(10월 setVisibility와 같은 서버 오류, BR4.2). 응답은 500이며 자료 값을 담지 않는다. */
export class PublishIntegrityError extends Error {
  override readonly name = 'PublishIntegrityError';

  constructor(readonly field: string) {
    super('발행 원본 자료가 올바르지 않습니다.');
  }
}

const isUnconfirmed = (row: CatchEligibilityRow): boolean => !row.workFactsConfirmed || !row.contributionConfirmed;

/**
 * 원 요청이 회원과 맞고 보호 관측이 온전한지 본 뒤 SOURCE_PRIVATE인지 돌려준다. 맞지 않으면 PublishIntegrityError를 던진다.
 * 등록·조회와 같은 관측 완전성을 본다. 최근 실패는 이전 유효 관측을 무효화하지 않는다.
 */
function isSourceRestricted(owner: string, row: CatchEligibilityRow, protections: ReadonlyMap<string, ProtectionRow>): boolean {
  if (row.requestMemberId !== owner || row.repositoryId === null) throw new PublishIntegrityError('sourceRequest');
  const protection = protections.get(row.repositoryId);
  if (!protection || !['NONE', 'SOURCE_PRIVATE'].includes(protection.restriction)
    || [protection.confirmedSourceState, protection.observationProvenance, protection.observedAt]
      .some((value) => value === null || value === undefined)) {
    throw new PublishIntegrityError('protection');
  }
  return protection.restriction === 'SOURCE_PRIVATE';
}

/** 판정에 쓸 보호 관측의 저장소 ID(중복 없음, 원 요청이 없는 Catch는 뺀다). 읽기 함수가 이 목록으로 한 번에 읽는다. */
export function protectionRepositoryIds(rows: readonly CatchEligibilityRow[]): string[] {
  return [...new Set(rows.map((row) => row.repositoryId).filter((id): id is string => id !== null))];
}

/**
 * Catch 하나의 이유(BR2.2): 확인 필요 → 보호 → 비공개 순으로 처음 맞는 것, 없으면 null.
 * 확인을 마친 Catch는 보호 판정 전에 원 요청·보호 관측을 보고, 맞지 않으면 PublishIntegrityError를 던진다(NFR2.10, 요청 전체 500).
 */
export function catchUnpublishableReason(
  owner: string, row: CatchEligibilityRow, protections: ReadonlyMap<string, ProtectionRow>,
): CatchUnpublishableReason | null {
  if (isUnconfirmed(row)) return 'CONFIRMATION_REQUIRED';
  if (isSourceRestricted(owner, row, protections)) return 'SOURCE_RESTRICTED';
  if (row.visibility === 'PRIVATE') return 'PRIVATE';
  return null;
}

/**
 * 발행의 묶음 판정(BR3.5): 지금 순서대로 처음 걸린 이유 하나와 그 이유로 막힌 Catch를 돌려준다. 없으면 null.
 * 순서: 미확인이 하나라도 있으면 CONFIRMATION_REQUIRED → 원 요청·보호 관측(맞지 않으면 PublishIntegrityError) → SOURCE_RESTRICTED → PRIVATE.
 * catchIds는 받은 행 순서다.
 */
export function blockingCatches(
  owner: string, rows: readonly CatchEligibilityRow[], protections: ReadonlyMap<string, ProtectionRow>,
): CatchBlock | null {
  const unconfirmed = rows.filter(isUnconfirmed).map((row) => row.catchId);
  if (unconfirmed.length > 0) return { reason: 'CONFIRMATION_REQUIRED', catchIds: unconfirmed };
  const restricted = rows.filter((row) => isSourceRestricted(owner, row, protections)).map((row) => row.catchId);
  if (restricted.length > 0) return { reason: 'SOURCE_RESTRICTED', catchIds: restricted };
  const hidden = rows.filter((row) => row.visibility === 'PRIVATE').map((row) => row.catchId);
  if (hidden.length > 0) return { reason: 'PRIVATE', catchIds: hidden };
  return null;
}

/** PDF 하나의 이유(BR2.2): 추출이 끝나지 않았으면 EXTRACTION_INCOMPLETE. 시한을 넘긴 PENDING·FAILED도 같은 이유다. */
export function pdfUnpublishableReason(extractionState: string): 'EXTRACTION_INCOMPLETE' | null {
  return extractionState === 'DONE' ? null : 'EXTRACTION_INCOMPLETE';
}

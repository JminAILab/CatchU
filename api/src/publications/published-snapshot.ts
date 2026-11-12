// 발행 사본의 모양(계약 C-07 snapshot-shape). published_item.snapshot(jsonb)과 C-10 readSnapshot 응답이 같은 모양을 쓴다.

export const PUBLISHED_ITEM_KINDS = ['CATCH', 'TEXT_MATERIAL', 'PDF_MATERIAL'] as const;
export type PublishedItemKind = (typeof PUBLISHED_ITEM_KINDS)[number];

export interface SnapshotEvidence {
  sourceUrl: string;
  sourceRevision: string;
  representedFacts: string[];
  /**
   * 새 Catch NC2(계약 C3, BR1.4): 근거 주소가 커밋 주소이고 그 식별값이 이 Catch의 소속 기록에 있으면 true. 새 사본은 모든 근거에 담는다.
   * 이 칸이 없는 옛 사본은 false로 읽는다. 조각 나누기·요약 근거·글자 수 합산 대상이 아니다(BR1.5).
   */
  ownCommit?: boolean;
}

export interface CatchSnapshot {
  workFacts: string[];
  subjectContribution: string;
  evidence: SnapshotEvidence[];
  authorDescription: string | null;
  /** 화면 구분 표시용. 조각 나누기·검색 대상이 아니다(FR6.4) */
  aiDraft: string | null;
  mismatch: boolean;
  // 아래 선택 칸 셋은 새 Catch NC2(계약 C3)가 더했다. 화면 표시용이고 조각 나누기·요약 근거·글자 수 합산 대상이 아니다(BR1.5).
  // 칸이 없는 사본(이 변경 전 사본)도 올바른 사본이다.
  /** 발행 때 저장소 등록의 「소유자/저장소」(BR1.1). 등록 이름을 읽지 못하면 넣지 않는다(안전망). */
  repositoryName?: string;
  /** 작성자 설명을 마지막으로 고친 한국 시간 해·달 "YYYY-MM"(BR1.2). 작성자 설명이 없으면 넣지 않는다. */
  authorDescriptionEditedMonth?: string;
  /** 근거 한계 가운데 작업 전체 한계만 고른 문장(BR1.3, work-limit-sentences.ts). 고른 것이 없으면 넣지 않는다. */
  workLimits?: string[];
}

export interface TextMaterialSnapshot {
  body: string;
}

/** 쪽별 글은 published_pdf_page(U8, 후순위)에 있다 */
export interface PdfMaterialSnapshot {
  pageCount: number;
}

export type ItemSnapshot = CatchSnapshot | TextMaterialSnapshot | PdfMaterialSnapshot;

export interface PublishedPdfPage {
  pageNumber: number;
  text: string;
  readable: boolean;
}

export interface PublishedSnapshotItem {
  publishedItemId: string;
  position: number;
  itemKind: PublishedItemKind;
  title: string;
  snapshot: ItemSnapshot;
  /** PDF_MATERIAL만 쪽 목록, 그 밖은 null */
  pdfPages: PublishedPdfPage[] | null;
}

export interface PublishedSnapshot {
  title: string;
  publishedAt: Date;
  expiresAt: Date;
  /** position 오름차순 */
  items: PublishedSnapshotItem[];
}

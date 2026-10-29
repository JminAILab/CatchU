// 발행 사본의 모양(계약 C-07 snapshot-shape). published_item.snapshot(jsonb)과 C-10 readSnapshot 응답이 같은 모양을 쓴다.

export const PUBLISHED_ITEM_KINDS = ['CATCH', 'TEXT_MATERIAL', 'PDF_MATERIAL'] as const;
export type PublishedItemKind = (typeof PUBLISHED_ITEM_KINDS)[number];

export interface CatchSnapshot {
  workFacts: string[];
  subjectContribution: string;
  evidence: { sourceUrl: string; sourceRevision: string; representedFacts: string[] }[];
  authorDescription: string | null;
  /** 화면 구분 표시용. 조각 나누기·검색 대상이 아니다(FR6.4) */
  aiDraft: string | null;
  mismatch: boolean;
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

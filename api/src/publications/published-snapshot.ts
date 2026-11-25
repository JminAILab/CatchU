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
  /** 발행본 전체에 1부터 이어 매긴 순서(발행 프리셋 P-3) */
  position: number;
  itemKind: PublishedItemKind;
  title: string;
  snapshot: ItemSnapshot;
  /** PDF_MATERIAL만 쪽 목록, 그 밖은 null */
  pdfPages: PublishedPdfPage[] | null;
  /** 고른 프리셋 순서(1~5, 발행 프리셋 P-3) */
  presetOrdinal: number;
  /** 발행 당시 프리셋 이름의 복사(P-3). 화면 탭 이름이며 AI 근거에는 넣지 않는다(ADR-007, NFR4.4) */
  presetName: string;
  /**
   * 같은 원본의 사본 가운데 position이 가장 앞선 사본인지(P-4, BR4.1, markFirstCopies). api 안 소비자(조각·요약 근거·질의응답 머리글·받은 링크 읽기)만
   * 보고, 받은 사람·작성자 응답에서는 뺀다(snapshotResponse, BR4.5·NFR4.3). 필수 칸이다(NFR2.12). 원본 ID(source_id)는 사본에 싣지 않는다.
   */
  isFirstCopy: boolean;
}

export interface PublishedSnapshot {
  title: string;
  publishedAt: Date;
  expiresAt: Date;
  /** position 오름차순 */
  items: PublishedSnapshotItem[];
}

/** 받은 사람·작성자 응답의 사본 항목(isFirstCopy를 뺀 모양, C-12). */
export type PublishedSnapshotResponseItem = Omit<PublishedSnapshotItem, 'isFirstCopy'>;

/** 받은 사람 열람(GET /v1/public/links/{token})과 작성자 상세 응답의 사본(BR4.5). */
export interface PublishedSnapshotResponse extends Omit<PublishedSnapshot, 'items'> {
  items: PublishedSnapshotResponseItem[];
}

/** 앞선 사본 판정의 입력. 사본 읽기는 published_item의 item_kind·source_id·position을, 조각 나누기도 같은 칸을 넘긴다. */
export interface FirstCopyCandidate {
  itemKind: string;
  sourceId: string;
  position: number;
}

/**
 * 「앞선 사본인가」의 판정 함수 하나(P-4, BR4.1, ADR-006). 같은 (itemKind, sourceId)의 항목 가운데 position이 가장 작은 항목만 true다.
 * 결과는 입력과 같은 순서의 배열이다. 같은 발행본 안에서 position은 유일하다(uq_published_item_publication_id_position).
 */
export function markFirstCopies(items: readonly FirstCopyCandidate[]): boolean[] {
  const first = new Map<string, number>();
  for (const item of items) {
    const key = `${item.itemKind}:${item.sourceId.toLowerCase()}`;
    const seen = first.get(key);
    if (seen === undefined || item.position < seen) first.set(key, item.position);
  }
  return items.map((item) => first.get(`${item.itemKind}:${item.sourceId.toLowerCase()}`) === item.position);
}

/** 사본 응답에서 isFirstCopy를 뺀다(BR4.5, 기능 설계 검토 R-03). 받은 사람 열람과 작성자 상세 두 곳이 쓴다. */
export function snapshotResponse(snapshot: PublishedSnapshot): PublishedSnapshotResponse {
  return {
    title: snapshot.title,
    publishedAt: snapshot.publishedAt,
    expiresAt: snapshot.expiresAt,
    // 응답에 싣는 칸을 하나씩 적어, 사본 항목에 칸이 더 생겨도 받은 사람에게 저절로 나가지 않게 한다.
    items: snapshot.items.map((item): PublishedSnapshotResponseItem => ({
      publishedItemId: item.publishedItemId,
      position: item.position,
      itemKind: item.itemKind,
      title: item.title,
      snapshot: item.snapshot,
      pdfPages: item.pdfPages,
      presetOrdinal: item.presetOrdinal,
      presetName: item.presetName,
    })),
  };
}

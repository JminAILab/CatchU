import type { CatchAsset } from "../assets/types.ts";
import type { TextMaterialItem } from "../materials/materials-api.ts";
import { extractionBadge, type PdfMaterialItem } from "../materials/pdf-materials-api.ts";
import type { PublicationItemKind } from "./publications-api.ts";

/** 10월 화면 표기(`assets-view.tsx`·`share-links-screen.tsx`)와 같이 제목이 없는 Catch는 이 이름으로 보인다. */
export const UNTITLED_CATCH = "제목 없는 Catch";

/** 고를 수 없는 Catch의 이유(BR4.2). 화면 표시는 10월 확인 상태·보호 상태로 하고 최종 판정은 발행 트랜잭션이 한다. */
export const INELIGIBLE_REASONS = Object.freeze({
  unconfirmed: "작업 사실과 나의 기여를 먼저 확인해야 발행에 넣을 수 있습니다",
  restricted: "원본 저장소가 보호되어 발행에 넣을 수 없습니다",
});

export type CatchSource = {
  catchId: string; title: string; visibility: "PRIVATE" | "PUBLIC"; mismatch: boolean;
  /** false면 고를 수 없고 `reason`이 그 이유다. */
  eligible: boolean; reason: string | null;
};
export type MaterialSource = TextMaterialItem;

/** 고를 수 없는 PDF의 이유(U8 BR4.1, NFR7.3). 추출이 완료(DONE)된 PDF만 발행에 넣을 수 있고 최종 판정은 서버가 한다. */
export const PDF_INELIGIBLE_REASONS = Object.freeze({
  pending: "글 추출이 끝난 뒤 발행에 넣을 수 있습니다. 목록을 다시 불러오면 상태가 바뀝니다",
  failed: "글 추출에 실패해 발행에 넣을 수 없습니다",
});

export type PdfSource = {
  pdfMaterialId: string; title: string;
  /** 자료 화면의 배지와 같은 상태 표시(글 추출 중 / 완료 n쪽 / 실패). */
  state: "PENDING" | "DONE" | "FAILED"; stateLabel: string;
  /** false면 고를 수 없고 `reason`이 그 이유다. */
  eligible: boolean; reason: string | null;
};

/** 본인 PDF 목록 응답(`GET /pdf-materials`)에서 발행 화면이 쓰는 값만 뽑는다. 실패한 PDF는 사유별 안내를 이유에 붙인다. */
export function pdfSourceOf(item: PdfMaterialItem): PdfSource {
  const badge = extractionBadge(item);
  const base = { pdfMaterialId: item.pdfMaterialId, title: item.title, state: item.extractionState, stateLabel: badge.label };
  if (item.extractionState === "DONE") return { ...base, eligible: true, reason: null };
  if (item.extractionState === "PENDING") return { ...base, eligible: false, reason: PDF_INELIGIBLE_REASONS.pending };
  return { ...base, eligible: false, reason: badge.detail === null ? PDF_INELIGIBLE_REASONS.failed : `${PDF_INELIGIBLE_REASONS.failed}. ${badge.detail}` };
}

/** 고른 항목의 종류 표지. */
export const ITEM_KIND_LABELS: Readonly<Record<PublicationItemKind, string>> = Object.freeze({
  CATCH: "Catch", TEXT_MATERIAL: "텍스트 자료", PDF_MATERIAL: "PDF 자료",
});

export type SourceList<T> = {
  state: "loading" | "ready" | "error"; items: T[]; nextCursor: string | null; moreState: "idle" | "loading" | "error"; errorText?: string;
};

/** 발행 화면이 고른 항목. 배열 순서가 발행 `position`이다(BR4.1). `visibility`는 Catch만 있다(BR4.4 안내). */
export type SelectedItem = { kind: PublicationItemKind; sourceId: string; title: string; visibility: "PRIVATE" | "PUBLIC" | null };

export function emptySourceList<T>(): SourceList<T> {
  return { state: "loading", items: [], nextCursor: null, moreState: "idle" };
}

/** 본인 Catch 목록 응답(10월 `GET /catches`)에서 발행 화면이 쓰는 값만 뽑는다. */
export function catchSourceOf(item: CatchAsset): CatchSource {
  const confirmed = item.confirmation.workFactsConfirmed && item.confirmation.contributionConfirmed;
  const restricted = item.restriction === "SOURCE_PRIVATE";
  return {
    catchId: item.catchId, title: item.title ?? UNTITLED_CATCH, visibility: item.visibility, mismatch: item.mismatch,
    eligible: confirmed && !restricted,
    reason: restricted ? INELIGIBLE_REASONS.restricted : confirmed ? null : INELIGIBLE_REASONS.unconfirmed,
  };
}

export const selectionKey = (kind: PublicationItemKind, sourceId: string) => `${kind}:${sourceId}`;

export function selectedKeys(items: readonly SelectedItem[]): Set<string> {
  return new Set(items.map((item) => selectionKey(item.kind, item.sourceId)));
}

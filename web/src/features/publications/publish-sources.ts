import type { CatchAsset } from "../assets/types.ts";
import type { TextMaterialItem } from "../materials/materials-api.ts";
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
  /** 작은 줄의 저장소 이름을 저장소 목록에서 찾는 열쇠(새 Catch BR6.2). */
  repositoryId: string;
  /** false면 작은 줄에 「설명 안 씀」이 붙는다. 본인 목록 「씀」 걸러 보기와 같은 판정이다(BR6.3, FR8.6). */
  hasAuthorDescription: boolean;
  /** false면 고를 수 없고 `reason`이 그 이유다. */
  eligible: boolean; reason: string | null;
};
export type MaterialSource = TextMaterialItem;

export type SourceList<T> = {
  state: "loading" | "ready" | "error"; items: T[]; nextCursor: string | null; moreState: "idle" | "loading" | "error"; errorText?: string;
};

/**
 * 발행 화면이 고른 항목. 배열 순서가 발행 `position`이다(BR4.1). `visibility`는 Catch만 있다(BR4.4 안내).
 * `hasAuthorDescription`은 고를 때 옮겨 담고(Catch만, 텍스트 자료는 null) 확인 단계의 설명 없는 Catch 수에 쓴다(새 Catch BR6.5·BR6.6).
 * 고른 항목은 고르기 목록과 따로 있어 걸러 보기로 목록에서 사라져도 남는다.
 */
export type SelectedItem = {
  kind: PublicationItemKind; sourceId: string; title: string; visibility: "PRIVATE" | "PUBLIC" | null; hasAuthorDescription: boolean | null;
};

export function emptySourceList<T>(): SourceList<T> {
  return { state: "loading", items: [], nextCursor: null, moreState: "idle" };
}

/** 본인 Catch 목록 응답(10월 `GET /catches`)에서 발행 화면이 쓰는 값만 뽑는다. */
export function catchSourceOf(item: CatchAsset): CatchSource {
  const confirmed = item.confirmation.workFactsConfirmed && item.confirmation.contributionConfirmed;
  const restricted = item.restriction === "SOURCE_PRIVATE";
  return {
    catchId: item.catchId, title: item.title ?? UNTITLED_CATCH, visibility: item.visibility, mismatch: item.mismatch,
    repositoryId: item.repositoryId, hasAuthorDescription: item.hasAuthorDescription,
    eligible: confirmed && !restricted,
    reason: restricted ? INELIGIBLE_REASONS.restricted : confirmed ? null : INELIGIBLE_REASONS.unconfirmed,
  };
}

export const selectionKey = (kind: PublicationItemKind, sourceId: string) => `${kind}:${sourceId}`;

export function selectedKeys(items: readonly SelectedItem[]): Set<string> {
  return new Set(items.map((item) => selectionKey(item.kind, item.sourceId)));
}

import type { SourceLocation } from "./rag-answer-api.ts";

/**
 * 인용 위치의 발행 항목 제목 찾기(#559 FR4). 패널을 다는 화면이 자기가 가진 사본으로 만들어 `itemTitleOf` prop으로 넘긴다.
 * 제목은 화면에만 보이고 모델에 보내지 않는다. 판단은 이 순수 함수에 두고 시험한다(`.tsx`는 시험이 불러오지 않는다, README 「시험」).
 */
export type ItemTitleOf = (publishedItemId: string) => string | null;

/** 사본 항목 목록(`PublishedSnapshot.items`)에서 `publishedItemId → title` 찾기 함수를 만든다. */
export function itemTitleFinder(items: readonly { readonly publishedItemId: string; readonly title: string }[]): ItemTitleOf {
  const titles = new Map(items.map((item) => [item.publishedItemId, item.title]));
  return (publishedItemId) => titles.get(publishedItemId) ?? null;
}

/**
 * 인용 하나의 항목 제목. 찾기 함수가 없거나(넘기지 않은 화면) 그 항목이 사본에 없거나 제목이 빈 글이면 null이다.
 * null이면 화면은 제목 없이 지금처럼 딱지만 보인다(FR4.4). 오류를 내지 않는다.
 */
export function citationItemTitle(location: Pick<SourceLocation, "publishedItemId">, itemTitleOf?: ItemTitleOf | null): string | null {
  if (!itemTitleOf) return null;
  const title = itemTitleOf(location.publishedItemId);
  return typeof title === "string" && title.trim() !== "" ? title : null;
}

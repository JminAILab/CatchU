import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { citationItemTitle, itemTitleFinder } from "../src/features/rag-answer/item-title.ts";
import { load } from "./u2-render.mjs";

// #559 출처 딱지 옆 항목 제목(FR4.1~FR4.5, 코드 계획 S14·S15 화면 쪽).
// 먼저 정한 시나리오:
// - S14: 인용 위치의 publishedItemId가 사본에 있으면 그 항목 제목, 없으면 null, 찾기 함수를 넘기지 않았으면 null. 오류를 내지 않는다.
// - S15: 출처 단추의 글자(sourceLabel)와 동작(누르면 받은 위치 그대로 showEvidence)은 그대로다. 제목은 단추 뒤의 보이는 <span>이고
//   Tab 순서 밖이며(tabindex 없음) React 글자로만 그린다. 제목을 찾지 못하면 지금처럼 단추만 있다.
// - 실패 조건: 오류를 냄, 단추 글자·위치가 바뀜, 제목이 초점을 받음, 제목이 HTML로 들어감.
// .tsx는 u2-render.mjs로 변환해 서버 렌더링으로만 본다. 실제 브라우저 확인이 아니다.

const { GatedItemView } = await load("features/rag-answer/gated-item-view.tsx");

const CATCH_ID = "11111111-1111-4111-8111-111111111111";
const TEXT_ID = "22222222-2222-4222-8222-222222222222";
const MISSING_ID = "33333333-3333-4333-8333-333333333333";
const items = [
  { publishedItemId: CATCH_ID, position: 1, itemKind: "CATCH", title: "알림 화면 고치기" },
  { publishedItemId: TEXT_ID, position: 2, itemKind: "TEXT_MATERIAL", title: "<b>배포 메모</b>" },
];
const location = (publishedItemId, fieldPath = "evidence[0].representedFacts[1]") => ({ publishedItemId, fieldPath, charStart: 0, charEnd: 7, pdfPage: null });
const cited = (text, ...locations) => ({
  kind: "CITED", text, jdRole: null,
  citations: locations.map((entry) => ({ sourceId: `${entry.publishedItemId}/${entry.fieldPath}`, quote: "인용 원문", location: entry,
    sourceLabel: entry.publishedItemId === TEXT_ID ? "작성자 자료 원문" : "GitHub 기록 원문" })),
});

/** React 요소 나무에서 조건에 맞는 요소를 모두 찾는다(렌더링 없이 함수 컴포넌트가 돌려준 나무만 본다). */
function findAll(node, predicate, found = []) {
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, predicate, found);
  } else if (node && typeof node === "object" && "props" in node) {
    if (predicate(node)) found.push(node);
    findAll(node.props.children, predicate, found);
  }
  return found;
}

test("S14 인용 위치의 항목이 사본에 있으면 제목, 없으면 null, 찾기 함수가 없으면 null이고 오류를 내지 않는다(FR4.1·FR4.4)", () => {
  const finder = itemTitleFinder(items);
  assert.equal(citationItemTitle(location(CATCH_ID), finder), "알림 화면 고치기");
  assert.equal(citationItemTitle(location(TEXT_ID, "body"), finder), "<b>배포 메모</b>");
  assert.equal(citationItemTitle(location(MISSING_ID), finder), null);
  assert.equal(citationItemTitle(location(CATCH_ID), undefined), null);
  assert.equal(citationItemTitle(location(CATCH_ID), null), null);
  assert.equal(citationItemTitle(location(CATCH_ID), itemTitleFinder([{ publishedItemId: CATCH_ID, title: "  " }])), null, "빈 제목은 보이지 않는다");
  assert.equal(itemTitleFinder([])(CATCH_ID), null);
});

test("S15 제목은 출처 단추 뒤의 보이는 span이고 Tab 순서 밖이며 글자로만 그린다. 단추 글자는 그대로다(FR4.1·FR4.5)", () => {
  const html = renderToStaticMarkup(createElement(GatedItemView, {
    items: [cited("항목 하나", location(CATCH_ID), location(TEXT_ID, "body")), { kind: "AI_INTERPRETATION", text: "해석", citations: [], jdRole: null }],
    showEvidence: () => {}, testId: "qna-answer-items", itemTitleOf: itemTitleFinder(items),
  }));
  assert.match(html, /<button type="button" class="source" data-testid="qna-answer-items-evidence-button">GitHub 기록 원문<\/button><span class="itemTitle" data-testid="qna-answer-items-evidence-item-title">알림 화면 고치기<\/span><\/blockquote>/);
  assert.match(html, /작성자 자료 원문<\/button><span class="itemTitle" data-testid="qna-answer-items-evidence-item-title">&lt;b&gt;배포 메모&lt;\/b&gt;<\/span>/, "제목은 HTML이 아니라 글자다");
  assert.equal((html.match(/evidence-item-title/g) ?? []).length, 2, "인용마다 하나, AI 해석 항목에는 없다");
  assert.ok(!/<span[^>]*tabindex/i.test(html), "제목은 초점을 받지 않는다");
  assert.ok(!html.includes("<b>배포"));
});

test("S15 제목을 찾지 못하거나 찾기 함수를 넘기지 않으면 지금처럼 단추만 그린다(FR4.4, 기본 요약·질의응답 공용)", () => {
  const props = { items: [cited("항목", location(MISSING_ID))], showEvidence: () => {}, testId: "base-summary-items" };
  const withFinder = renderToStaticMarkup(createElement(GatedItemView, { ...props, itemTitleOf: itemTitleFinder(items) }));
  const withoutFinder = renderToStaticMarkup(createElement(GatedItemView, props));
  for (const html of [withFinder, withoutFinder]) {
    assert.ok(!html.includes("evidence-item-title"));
    assert.match(html, /<button type="button" class="source" data-testid="base-summary-items-evidence-button">GitHub 기록 원문<\/button><\/blockquote>/);
  }
  assert.equal(withFinder, withoutFinder);
});

test("S15 출처 단추를 누르면 받은 위치 그대로 showEvidence를 부른다(FR1.5·NFR2). 제목이 있어도 같다", () => {
  const calls = [];
  const target = location(CATCH_ID, "workFacts[0]");
  const tree = GatedItemView({ items: [cited("항목", target)], showEvidence: (value) => calls.push(value), testId: "qna-answer-items",
    itemTitleOf: itemTitleFinder(items) });
  const buttons = findAll(tree, (node) => node.type === "button");
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0].props.children, "GitHub 기록 원문");
  buttons[0].props.onClick();
  assert.equal(calls.length, 1);
  assert.equal(calls[0], target, "받은 위치 객체를 바꾸지 않고 넘긴다");
  assert.deepEqual(calls[0], { publishedItemId: CATCH_ID, fieldPath: "workFacts[0]", charStart: 0, charEnd: 7, pdfPage: null });
  const titles = findAll(tree, (node) => node.type === "span" && node.props["data-testid"] === "qna-answer-items-evidence-item-title");
  assert.equal(titles.length, 1);
  assert.equal(titles[0].props.onClick, undefined, "제목은 동작이 없는 글자다");
});

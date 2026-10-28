import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "./u2-render.mjs";

// 12월 intent U2 받은 사람 안내 묶음(기능 설계 BR8.2, AC16.2.2). 모양은 계약 C-11 수정 PR #421(slots 0번 RecipientGuide,
// props showClaudeConnect 하나)을 따른다. 리뷰에서 모양이 바뀌면 이 파일과 components/recipient-guide만 고친다.
const { RECIPIENT_GUIDE_ITEMS, CLAUDE_CONNECT_ITEM, recipientGuideItems } = await load("components/recipient-guide/recipient-guide-items.ts");
const { RecipientGuide } = await load("components/recipient-guide/recipient-guide.tsx");

test("안내 항목은 링크 조건·고정 자료·기본 요약·질의응답·JD 요약(로그인 필요) 다섯이다", () => {
  assert.deepEqual(RECIPIENT_GUIDE_ITEMS.map((item) => item.id), ["link-conditions", "fixed-copy", "base-summary", "questions", "jd-summary"]);
  assert.ok(RECIPIENT_GUIDE_ITEMS.find((item) => item.id === "link-conditions").text.includes("비밀번호"));
  assert.ok(RECIPIENT_GUIDE_ITEMS.find((item) => item.id === "jd-summary").text.includes("로그인"));
});

test("Claude 연결 줄은 showClaudeConnect가 true일 때만 붙고, 기본은 꺼짐이다", () => {
  assert.deepEqual(recipientGuideItems(false), RECIPIENT_GUIDE_ITEMS);
  assert.deepEqual(recipientGuideItems(true).at(-1), CLAUDE_CONNECT_ITEM);
  const off = renderToStaticMarkup(createElement(RecipientGuide));
  const on = renderToStaticMarkup(createElement(RecipientGuide, { showClaudeConnect: true }));
  assert.ok(!off.includes('data-testid="recipient-guide-claude-connect"'));
  assert.ok(on.includes('data-testid="recipient-guide-claude-connect"') && on.includes(CLAUDE_CONNECT_ITEM.text));
});

test("묶음은 항목을 순서대로 글로만 그리고 버튼·링크를 두지 않는다", () => {
  const html = renderToStaticMarkup(createElement(RecipientGuide, { showClaudeConnect: false }));
  const ids = [...html.matchAll(/data-testid="recipient-guide-([a-z-]+)"/g)].map((match) => match[1]);
  assert.deepEqual(ids, RECIPIENT_GUIDE_ITEMS.map((item) => item.id));
  assert.ok(!html.includes("<a ") && !html.includes("<button"));
});

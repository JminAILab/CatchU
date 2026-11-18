import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "./u2-render.mjs";

// #543 질의응답 패널의 처음 그린 모양(2026-11-16 팀장 결정: 수정안 「1. 초점 유지」·「2. 상태 안내」).
// 먼저 정한 시나리오:
// - 알림 자리: 패널에 보이지 않는 `role="status"` 자리가 처음부터 하나 있고 비어 있다(나중에 생기면 낭독기가 첫 안내를 놓칠 수 있다).
// - 초점 유지: [질문하기] 버튼과 입력란에 `disabled`가 없다. 빈 질문일 때 버튼은 `aria-disabled="true"`다.
// - 대화 영역과 답 자리에는 알림 표시(`aria-live`·`role="status"`·`role="alert"`)가 없다.
// - 실패 조건: 알림 자리가 둘 이상이거나 화면에 보임, 버튼·입력란이 `disabled`로 꺼짐.
// .tsx는 u2-render.mjs로 변환해 서버 렌더링으로만 본다. 초점·낭독·보내는 중 동작은 실제 브라우저와 NVDA로 따로 확인한다.

const { QnaPanel } = await load("features/rag-answer/qna-panel.tsx");

const html = renderToStaticMarkup(createElement(QnaPanel, {
  token: "token", getGrant: () => null, onAccessLost: () => {}, isLoggedIn: false, showEvidence: () => {},
}));

test("알림 자리는 처음부터 하나 있고 보이지 않으며 비어 있다(#543)", () => {
  assert.equal(html.match(/role="status"/g)?.length, 1);
  assert.match(html, /<p role="status" class="visually-hidden" data-testid="qna-status"><\/p>/);
  assert.doesNotMatch(html, /aria-live|role="alert"/, "대화 영역과 답 자리에는 알림 표시를 붙이지 않는다");
});

test("버튼과 입력란은 disabled로 끄지 않고, 빈 질문일 때 버튼은 aria-disabled다(#543)", () => {
  const button = html.match(/<button[^>]*data-testid="qna-submit-button"[^>]*>/)?.[0] ?? "";
  const input = html.match(/<textarea[^>]*data-testid="qna-question-input"[^>]*>/)?.[0] ?? "";
  assert.match(button, /type="submit"/);
  assert.match(button, /aria-disabled="true"/);
  assert.doesNotMatch(button, /\sdisabled/);
  assert.doesNotMatch(input, /\sdisabled/);
  assert.doesNotMatch(input, /readOnly|readonly/, "보내는 중이 아니면 입력할 수 있다");
  assert.match(input, /maxLength="500"/i);
});

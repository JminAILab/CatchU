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

// 질문 패널 모양 정리(2026-11-26): 제목 아래 설명 한 줄, 「질문」 라벨, 보내기 전 버튼 글자.
// 보내는 동안의 버튼 글자(「답변 만드는 중…」)는 서버 렌더링으로 볼 수 없어 브라우저로 확인한다.
test("제목 아래 설명이 있고, 입력란은 「질문」 라벨과 이어지며, 보내기 전 버튼 글자는 「질문하기」뿐이다", () => {
  assert.match(html, /<h2 id="qna-heading"[^>]*>발행본에 질문하기<\/h2><p[^>]*data-testid="qna-description">공유된 자료를 바탕으로 AI가 답합니다\.<\/p>/);
  assert.match(html, /<label for="qna-question-input"[^>]*>질문<\/label>/);
  assert.match(html, /<button[^>]*data-testid="qna-submit-button"[^>]*>질문하기<\/button>/);
  assert.match(html, /data-testid="ai-notice-line"/, "AI 전송 고지 한 줄은 그대로 둔다");
});

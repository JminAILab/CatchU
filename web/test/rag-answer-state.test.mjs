import assert from "node:assert/strict";
import { test } from "node:test";
import { RAG_ANSWER_MESSAGES } from "../src/features/rag-answer/rag-answer-messages.ts";
import {
  afterRegenerate, askDisplay, canSendQuestion, historyForRequest, httpErrorMessage, summaryDisplay, summaryPanelState,
} from "../src/features/rag-answer/rag-answer-state.ts";

// 12월 intent U5 화면 판단(기능 설계 「화면」·BR8.2·BR8.4·BR8.5·BR8.6, 비기능 설계 NFR7.2).
// 기대 문구의 근거: 기능 명세 「화면」과 BR8.2·BR8.6의 문구.

const item = (text) => ({ kind: "CITED", text, citations: [] });

test("요약 상태별 안내·버튼: PENDING은 둘 다 만드는 중이고 버튼 없음, FAILED는 받은 사람 '없음'·작성자 '만들지 못함'+버튼, DONE은 항목", () => {
  const pending = { status: "PENDING", items: [] };
  assert.deepEqual(summaryDisplay(pending, "recipient"), { message: "AI 요약을 만드는 중입니다. 새로고침하면 다시 확인합니다", showItems: false, showRegenerate: false });
  assert.deepEqual(summaryDisplay({ ...pending, canRegenerate: false }, "owner"), { message: RAG_ANSWER_MESSAGES.summaryPending, showItems: false, showRegenerate: false });
  const failed = { status: "FAILED", items: [] };
  assert.deepEqual(summaryDisplay(failed, "recipient"), { message: "AI 요약이 없습니다", showItems: false, showRegenerate: false });
  assert.deepEqual(summaryDisplay({ ...failed, canRegenerate: true }, "owner"), { message: "AI 요약을 만들지 못했습니다", showItems: false, showRegenerate: true });
  const done = { status: "DONE", items: [item("요약")] };
  assert.deepEqual(summaryDisplay(done, "recipient"), { message: null, showItems: true, showRegenerate: false });
  assert.deepEqual(summaryDisplay({ ...done, canRegenerate: true }, "owner"), { message: null, showItems: true, showRegenerate: true });
  assert.equal(summaryDisplay({ ...done, canRegenerate: false }, "owner").showRegenerate, false, "서버가 막으면 버튼을 감춘다");
  assert.equal(RAG_ANSWER_MESSAGES.summaryHeading, "AI 요약");
});

test("요약 읽기 결과: 성공은 표시, 링크 접근 오류는 패널을 숨기고(U4가 화면 전환), 그 밖의 실패는 불러오지 못함 안내", () => {
  const view = { status: "DONE", items: [] };
  assert.deepEqual(summaryPanelState({ kind: "success", view }), { kind: "ready", view });
  assert.deepEqual(summaryPanelState({ kind: "access-lost", code: "LINK_UNAVAILABLE" }), { kind: "hidden" });
  assert.deepEqual(summaryPanelState({ kind: "failed", status: 500, code: "INTERNAL_ERROR" }), { kind: "error", message: RAG_ANSWER_MESSAGES.loadFailed });
});

test("[다시 만들기]: 202면 PENDING 안내로 바꾸고, 429면 한도 안내, 그 밖은 접수 실패 안내(BR8.2)", () => {
  const view = { status: "FAILED", items: [], canRegenerate: true };
  const accepted = afterRegenerate(view, { kind: "accepted" });
  assert.deepEqual(accepted, { view: { status: "PENDING", items: [], canRegenerate: false }, notice: null });
  assert.equal(summaryDisplay(accepted.view, "owner").showRegenerate, false);
  assert.deepEqual(afterRegenerate(view, { kind: "limit-reached" }), { view, notice: "오늘 한도에 도달했습니다" });
  assert.deepEqual(afterRegenerate(view, { kind: "failed", status: null, code: "LOOKUP_FAILED" }), { view, notice: RAG_ANSWER_MESSAGES.regenerateFailed });
  assert.ok(!/\d/.test(RAG_ANSWER_MESSAGES.dailyLimit), "한도 안내에 숫자(남은 횟수)가 없다");
});

test("앞 대화: 최근 6개만 보내고 ASSISTANT는 받은 항목 글을 이어 붙인다(BR8.4)", () => {
  const turns = [];
  for (let i = 1; i <= 4; i += 1) {
    turns.push({ role: "USER", text: `질문 ${i}` });
    turns.push({ role: "ASSISTANT", items: [item(`답 ${i}-1`), item(`답 ${i}-2`)], notice: null });
  }
  const history = historyForRequest(turns);
  assert.equal(history.length, 6);
  assert.deepEqual(history[0], { role: "USER", text: "질문 2" });
  assert.deepEqual(history[1], { role: "ASSISTANT", text: "답 2-1\n답 2-2" });
  assert.deepEqual(historyForRequest([{ role: "ASSISTANT", items: [], notice: RAG_ANSWER_MESSAGES.noEvidence }]), [{ role: "ASSISTANT", text: "" }]);
  assert.deepEqual(historyForRequest([]), []);
});

test("질문 끝 안내: 항목 0개 done은 근거 없음, error 이벤트는 받은 항목을 두고 답 실패, 스트림 전 거부는 입력란 안내(BR8.5·BR8.6)", () => {
  assert.deepEqual(askDisplay({ kind: "done", itemCount: 0 }), { answerNotice: "발행본에서 이 질문의 근거를 찾지 못했습니다", formNotice: null, keepTurn: true });
  assert.deepEqual(askDisplay({ kind: "done", itemCount: 2 }), { answerNotice: null, formNotice: null, keepTurn: true });
  assert.deepEqual(askDisplay({ kind: "stream-error", itemCount: 1, code: "ANSWER_FAILED" }),
    { answerNotice: "답을 만들지 못했습니다. 다시 질문해 주세요", formNotice: null, keepTurn: true });
  assert.deepEqual(askDisplay({ kind: "access-lost", code: "LINK_UNAVAILABLE" }), { answerNotice: null, formNotice: null, keepTurn: false });
  assert.deepEqual(askDisplay({ kind: "aborted", itemCount: 0 }), { answerNotice: null, formNotice: null, keepTurn: false });
  assert.equal(askDisplay({ kind: "aborted", itemCount: 1 }).keepTurn, true);
  assert.deepEqual(askDisplay({ kind: "http-error", status: 409, code: "INDEX_NOT_READY" }),
    { answerNotice: null, formNotice: "질의응답을 아직 쓸 수 없습니다", keepTurn: false });
});

test("HTTP 오류 문구: 409 아직 못 씀, 429 한도, 400 500자, 그 밖·통신 실패는 답 실패(BR8.6)", () => {
  assert.equal(httpErrorMessage(409), RAG_ANSWER_MESSAGES.qnaNotReady);
  assert.equal(httpErrorMessage(429), "오늘 한도에 도달했습니다");
  assert.equal(httpErrorMessage(400), "질문은 500자까지 쓸 수 있습니다");
  assert.equal(httpErrorMessage(500), RAG_ANSWER_MESSAGES.answerFailed);
  assert.equal(httpErrorMessage(null), RAG_ANSWER_MESSAGES.answerFailed);
});

test("보낼 수 있는 질문: 공백만이 아니고 500자 이하이며 보내는 중이 아닐 때", () => {
  assert.equal(canSendQuestion("질문", false), true);
  assert.equal(canSendQuestion("질문", true), false, "앞 질문 스트림이 끝나기 전에는 막는다");
  assert.equal(canSendQuestion("   ", false), false);
  assert.equal(canSendQuestion("가".repeat(500), false), true);
  assert.equal(canSendQuestion("가".repeat(501), false), false);
});

test("문구 표에는 외부 AI 고지가 없다(U2 AiNoticeLine을 그대로 쓴다)", async () => {
  const values = Object.values(RAG_ANSWER_MESSAGES).join("\n");
  assert.ok(!values.includes("Anthropic") && !values.includes("Voyage") && !values.includes("전송"));
  const { AI_NOTICE_LINE } = await import("../src/components/ai-consent/ai-consent-notice.ts");
  assert.ok(!values.includes(AI_NOTICE_LINE));
});

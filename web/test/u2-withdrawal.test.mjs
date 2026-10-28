import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "./u2-render.mjs";

// 12월 intent U2 탈퇴 화면(기능 설계 W7·BR7.1·BR7.4·BR7.5, 비기능 NFR7.1).
// 기대 결과: 시나리오 표 web 행 「탈퇴 화면 — 성공·실패 상태 구분, 실패를 성공으로 보이지 않음」.
const { classifyWithdrawal, requestWithdrawal, withdrawnLandingPath, isWithdrawnNotice, WITHDRAWAL_TEXT, WITHDRAWN_QUERY, confirmWithdrawal } =
  await load("features/withdrawal/withdrawal.ts");

function confirmHarness(result) {
  const record = { phases: [], messages: [], navigated: [], requests: 0 };
  const deps = {
    member: async () => { record.requests += 1; return result; },
    navigate: (path) => record.navigated.push(path),
    setPhase: (phase) => record.phases.push(phase),
    setMessage: (message) => record.messages.push(message),
  };
  return { record, deps };
}

test("[탈퇴하기] 뒤 204면 보내는 중을 거쳐 비로그인 홈(/?withdrawn=1)으로 페이지 전체를 다시 연다", async () => {
  const { record, deps } = confirmHarness({ kind: "success", status: 204, data: null });
  await confirmWithdrawal(deps);
  assert.deepEqual(record, { phases: ["sending"], messages: [null], navigated: ["/?withdrawn=1"], requests: 1 });
});

test("[탈퇴하기] 뒤 실패면 이동하지 않고 확인창을 닫아 안내를 보이며 다시 보내지 않는다", async () => {
  const { record, deps } = confirmHarness({ kind: "api-error", status: 500, code: "WITHDRAWAL_FAILED", message: "" });
  await confirmWithdrawal(deps);
  assert.deepEqual(record, { phases: ["sending", "idle"], messages: [null, "탈퇴를 끝내지 못했습니다. 팀에 알려 주세요"], navigated: [], requests: 1 });
});
const { WithdrawalView, WithdrawnNotice } = await load("features/withdrawal/withdrawal-view.tsx");
const { WithdrawalSection } = await load("features/withdrawal/withdrawal-section.tsx");

test("회원 정보 화면의 탈퇴 영역은 처음에 [탈퇴] 버튼만 보이고 확인창·안내는 없다", () => {
  const html = renderToStaticMarkup(createElement(WithdrawalSection));
  assert.ok(html.includes('data-testid="withdrawal-open-button"'));
  assert.ok(!html.includes("withdrawal-confirm") && !html.includes('role="alert"'));
});

test("DELETE /me를 본문 없이 보내고 204만 성공으로 본다", async () => {
  const sent = [];
  const outcome = await requestWithdrawal(async (path, request) => { sent.push({ path, request }); return { kind: "success", status: 204, data: null }; });
  assert.deepEqual(sent, [{ path: "/me", request: { method: "DELETE" } }]);
  assert.deepEqual(outcome, { kind: "done" });
});

test("500 WITHDRAWAL_FAILED·응답 없음·그 밖의 거부는 모두 실패이고 각각 다른 안내다", () => {
  assert.deepEqual(classifyWithdrawal({ kind: "api-error", status: 500, code: "WITHDRAWAL_FAILED", message: "" }),
    { kind: "failed", message: "탈퇴를 끝내지 못했습니다. 팀에 알려 주세요" });
  assert.deepEqual(classifyWithdrawal({ kind: "lookup-failed", status: null, code: "LOOKUP_FAILED" }),
    { kind: "failed", message: WITHDRAWAL_TEXT.unknown });
  for (const code of ["AUTH_INVALID", "AUTH_ORIGIN_FORBIDDEN", "INTERNAL_ERROR"]) {
    assert.deepEqual(classifyWithdrawal({ kind: "api-error", status: 403, code, message: "" }), { kind: "failed", message: WITHDRAWAL_TEXT.rejected });
  }
});

test("성공 뒤 비로그인 홈 주소에는 표시 여부만 있고, 홈은 그 값이 정확히 1일 때만 '탈퇴했습니다'를 보인다", () => {
  assert.equal(withdrawnLandingPath(), `/?${WITHDRAWN_QUERY}=1`);
  assert.equal(isWithdrawnNotice("1"), true);
  for (const value of [undefined, "0", "true", ["1"]]) assert.equal(isWithdrawnNotice(value), false);
  const html = renderToStaticMarkup(createElement(WithdrawnNotice));
  assert.ok(html.includes("탈퇴했습니다") && html.includes('role="status"'));
});

test("[탈퇴] → 확인창(되돌릴 수 없다는 안내, [탈퇴하기]·[취소]) → 보내는 중에는 버튼을 막고, 실패 안내는 alert로 보인다", () => {
  const view = (phase, message = null) => renderToStaticMarkup(createElement(WithdrawalView,
    { phase, message, onOpen() {}, onConfirm() {}, onCancel() {} }));
  const idle = view("idle");
  assert.ok(idle.includes('data-testid="withdrawal-open-button"') && !idle.includes("withdrawal-confirm-button"));
  const confirming = view("confirming");
  assert.ok(confirming.includes(WITHDRAWAL_TEXT.confirm));
  assert.ok(confirming.includes('data-testid="withdrawal-confirm-button"') && confirming.includes('data-testid="withdrawal-cancel-button"'));
  assert.ok(!confirming.includes("disabled"));
  const sending = view("sending");
  assert.equal((sending.match(/disabled=""/g) ?? []).length, 2);
  assert.ok(sending.includes(WITHDRAWAL_TEXT.pending));
  const failed = view("idle", WITHDRAWAL_TEXT.failed);
  assert.ok(failed.includes('role="alert"') && failed.includes(WITHDRAWAL_TEXT.failed));
  assert.ok(!failed.includes("탈퇴했습니다"), "실패를 성공으로 보이지 않는다");
});

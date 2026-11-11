import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "./u2-render.mjs";

// 12월 intent U2 공용 동의 창·한 줄 안내·오류 코드 안내(기능 설계 W2·BR2.1~BR2.5·BR1.4, 계약 C-04, 비기능 NFR2.5·NFR7.1).
// 기대 결과의 근거: unit-test-instructions 「시나리오 표」 web 행(동의 창 재전송 한 번, 닫으면 실행 안 함, 한도 문구·남은 횟수 없음).
const { runWithConsent, consentRecorder, isConsentRequired, createConsentDialogControl, CONSENT_RECORD_FAILED } =
  await load("components/ai-consent/ai-consent-flow.ts");

const ok = (data = { runId: "r-1" }) => ({ kind: "success", status: 202, data });
const consentRequired = () => ({ kind: "api-error", status: 403, code: "AI_CONSENT_REQUIRED", message: "동의 필요" });
const noContent = () => ({ kind: "success", status: 204, data: null });

/** 동의 창 표시 상태 기록과 제어. */
function dialogHarness(recorded) {
  const states = [];
  const view = {
    setOpen: (open) => states.push(["open", open]),
    setBusy: (busy) => states.push(["busy", busy]),
    setError: (error) => states.push(["error", error]),
  };
  return { states, control: createConsentDialogControl(view, async () => recorded) };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));

test("동의 창 제어: 403이면 창을 열고 [동의] 뒤 기록이 끝날 때까지 열어 둔 채 막았다가 성공하면 닫고 한 번 다시 보낸다", async () => {
  const { states, control } = dialogHarness(noContent());
  const responses = [consentRequired(), ok()];
  const running = control.run(async () => responses.shift());
  await settle();
  assert.deepEqual(states, [["error", null], ["open", true]]);
  control.answer(true);
  const result = await running;
  assert.deepEqual(result, { kind: "result", result: ok(), retried: true });
  assert.deepEqual(states.slice(2), [["busy", true], ["open", false], ["busy", false]]);
});

test("동의 창 제어: [닫기]면 창을 닫고 실행하지 않으며, 기록 실패면 창을 연 채 안내하고 그 뒤 버튼은 창만 닫는다", async () => {
  const closed = dialogHarness(noContent());
  const declined = closed.control.run(async () => consentRequired());
  await settle();
  closed.control.answer(false);
  assert.deepEqual(await declined, { kind: "declined" });
  assert.deepEqual(closed.states.at(-1), ["open", false]);

  const rejected = { kind: "api-error", status: 400, code: "VALIDATION_FAILED", message: "" };
  const failed = dialogHarness(rejected);
  const running = failed.control.run(async () => consentRequired());
  await settle();
  failed.control.answer(true);
  assert.deepEqual(await running, { kind: "consent-failed", result: rejected });
  assert.deepEqual(failed.states.slice(2), [["busy", true], ["error", CONSENT_RECORD_FAILED], ["busy", false]]);
  assert.ok(!failed.states.slice(2).some(([key, value]) => key === "open" && value === false), "실패 안내를 보이려고 창을 닫지 않는다");
  failed.control.answer(true);
  assert.deepEqual(failed.states.at(-1), ["open", false]);
});
const { AI_NOTICE_VERSION, AI_CONSENT_TEXT, AI_NOTICE_LINE, AI_RECIPIENTS } = await load("components/ai-consent/ai-consent-notice.ts");
const { AiConsentDialog } = await load("components/ai-consent/ai-consent-dialog.tsx");
const { AiNoticeLine } = await load("components/ai-consent/ai-notice-line.tsx");
const { u2ErrorMessage, U2_ERROR_MESSAGES } = await load("lib/u2-error-messages.ts");
const { useAiConsent } = await load("components/ai-consent/use-ai-consent.tsx");

test("useAiConsent는 화면이 그릴 동의 창(처음에는 닫힘)과 실행 함수를 돌려준다", () => {
  let hook = null;
  function Harness() {
    hook = useAiConsent();
    return hook.dialog;
  }
  const html = renderToStaticMarkup(createElement(Harness));
  assert.equal(typeof hook.run, "function");
  assert.ok(html.includes('data-testid="ai-consent-dialog"') && !html.includes(" open"), "닫힌 dialog로 그린다");
});

function harness(responses, { agree = true, recorded = noContent() } = {}) {
  const calls = { request: 0, ask: 0, record: 0 };
  return {
    calls,
    options: {
      request: async () => { calls.request += 1; return responses.shift(); },
      askConsent: async () => { calls.ask += 1; return agree; },
      recordConsent: async () => { calls.record += 1; return recorded; },
    },
  };
}

test("403 AI_CONSENT_REQUIRED가 아니면 동의 창을 열지 않고 첫 결과를 그대로 돌려준다", async () => {
  const limited = { kind: "api-error", status: 429, code: "DAILY_LIMIT_REACHED", message: "오늘 한도에 도달했습니다" };
  for (const first of [ok(), limited, { kind: "lookup-failed", status: null, code: "LOOKUP_FAILED" }]) {
    const { calls, options } = harness([first]);
    assert.deepEqual(await runWithConsent(options), { kind: "result", result: first, retried: false });
    assert.deepEqual(calls, { request: 1, ask: 0, record: 0 });
  }
  assert.equal(isConsentRequired({ kind: "api-error", status: 403, code: "CONSENT_REQUIRED", message: "" }), false, "분석 동의(10월)와 구분한다");
});

test("동의 창에서 [동의]하면 동의를 기록한 뒤 같은 요청을 한 번만 다시 보낸다", async () => {
  const { calls, options } = harness([consentRequired(), ok()]);
  assert.deepEqual(await runWithConsent(options), { kind: "result", result: ok(), retried: true });
  assert.deepEqual(calls, { request: 2, ask: 1, record: 1 });
});

test("다시 보낸 요청이 또 403이어도 동의 창을 다시 열지 않는다(반복 없음)", async () => {
  const { calls, options } = harness([consentRequired(), consentRequired()]);
  const result = await runWithConsent(options);
  assert.equal(result.kind, "result");
  assert.equal(result.result.code, "AI_CONSENT_REQUIRED");
  assert.deepEqual(calls, { request: 2, ask: 1, record: 1 });
});

test("[닫기]면 실행하지 않고, 동의 기록이 실패하면 다시 보내지 않는다", async () => {
  const closed = harness([consentRequired()], { agree: false });
  assert.deepEqual(await runWithConsent(closed.options), { kind: "declined" });
  assert.deepEqual(closed.calls, { request: 1, ask: 1, record: 0 });
  const rejected = { kind: "api-error", status: 400, code: "VALIDATION_FAILED", message: "옛 판본" };
  const failed = harness([consentRequired()], { recorded: rejected });
  assert.deepEqual(await runWithConsent(failed.options), { kind: "consent-failed", result: rejected });
  assert.deepEqual(failed.calls, { request: 1, ask: 1, record: 1 });
});

test("동의 기록은 POST /ai-consent에 지금 고지의 판본을 보내고, 그 판본은 api 상수와 같다", async () => {
  const sent = [];
  await consentRecorder(async (path, request) => { sent.push({ path, request }); return noContent(); })();
  assert.deepEqual(sent, [{ path: "/ai-consent", request: { method: "POST", body: { noticeVersion: AI_NOTICE_VERSION } } }]);
  const apiSource = readFileSync(new URL("../../api/src/ai-consent/ai-consent.gate.ts", import.meta.url), "utf8");
  assert.equal(apiSource.match(/AI_NOTICE_VERSION = '([^']+)'/)?.[1], AI_NOTICE_VERSION, "web·api 판본이 다르면 동의가 400으로 거부된다");
});

test("동의 창은 받는 곳 셋(OpenAI 포함, CR3 BR8.3)·보내는 기능·자료를 그대로 보낸다는 사실·문의 경로 한 줄과 [동의]·[닫기]를 보이고, 한 줄 안내도 받는 곳을 적는다", () => {
  const html = renderToStaticMarkup(createElement(AiConsentDialog, { open: true, busy: false, error: null, onAgree() {}, onClose() {} }));
  assert.ok(AI_RECIPIENTS.some((name) => name.includes("OpenAI")), "저장소 분석 확인에 쓰는 OpenAI를 받는 곳에 적는다");
  for (const text of [...AI_RECIPIENTS, AI_CONSENT_TEXT.features, AI_CONSENT_TEXT.rawData, AI_CONSENT_TEXT.contact]) {
    assert.ok(html.includes(text.replaceAll("&", "&amp;")), text);
  }
  for (const id of ["ai-consent-dialog", "ai-consent-dialog-agree", "ai-consent-dialog-close"]) assert.ok(html.includes(`data-testid="${id}"`), id);
  assert.ok(!html.includes("회신"), "문의 접수·회신 약속을 쓰지 않는다");
  const failed = renderToStaticMarkup(createElement(AiConsentDialog, { open: true, busy: true, error: "동의를 저장하지 못했습니다.", onAgree() {}, onClose() {} }));
  assert.ok(failed.includes('role="alert"') && (failed.match(/disabled=""/g) ?? []).length === 2, "기록 중에는 버튼을 다시 누를 수 없다");
  const line = renderToStaticMarkup(createElement(AiNoticeLine));
  assert.ok(line.includes(AI_NOTICE_LINE) && AI_RECIPIENTS.every((name) => AI_NOTICE_LINE.includes(name)));
});

test("오류 코드 셋 안내: 한도는 '오늘 한도에 도달했습니다'만 보이고 남은 횟수가 없다. 모르는 코드는 각 화면의 일반 안내", () => {
  const limited = u2ErrorMessage({ kind: "api-error", status: 429, code: "DAILY_LIMIT_REACHED", message: "서버 문구" });
  assert.equal(limited, "오늘 한도에 도달했습니다");
  assert.ok(!/\d/.test(limited));
  assert.equal(u2ErrorMessage({ kind: "api-error", status: 500, code: "WITHDRAWAL_FAILED", message: "" }), "탈퇴를 끝내지 못했습니다. 팀에 알려 주세요");
  assert.equal(u2ErrorMessage({ kind: "api-error", status: 403, code: "AI_CONSENT_REQUIRED", message: "" }), U2_ERROR_MESSAGES.AI_CONSENT_REQUIRED);
  assert.equal(u2ErrorMessage({ kind: "api-error", status: 409, code: "INDEX_NOT_READY", message: "" }), null);
  assert.equal(u2ErrorMessage({ kind: "api-error", status: 400, code: "toString", message: "" }), null, "객체 기본 속성 이름을 코드로 보지 않는다");
  assert.equal(u2ErrorMessage({ kind: "success", status: 200, data: null }), null);
});

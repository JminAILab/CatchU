/** U10 요약 업무 시나리오. 합성 C-11·transport/공용 동의 흐름·정적 렌더를 검사한다. */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { createJdApi, jdErrorText } from "../src/features/jd/jd-api.ts";
import { createJdSummaryModel } from "../src/features/jd/jd-summary-model.ts";
import { isJdRun } from "../src/features/jd/jd-parsers.ts";
import { runWithConsent } from "../src/components/ai-consent/ai-consent-flow.ts";
import { U2_ERROR_MESSAGES } from "../src/lib/u2-error-messages.ts";
import { load } from "./u2-render.mjs";

const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.endsWith(".tsx") && specifier.startsWith(".") && !/\.(ts|tsx|css)$/.test(specifier)) {
      const base = new URL(specifier, context.parentURL);
      const url = [".tsx", ".ts"].map((ext) => new URL(base.href + ext)).find((u) => existsSync(u));
      if (url) return { url: url.href, shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith(".module.css")) return { format: "module", shortCircuit: true, source: "export default {};" };
    if (url.endsWith(".tsx")) return { format: "module", shortCircuit: true, source: ts.transpileModule(readFileSync(new URL(url), "utf8"),
      { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext } }).outputText };
    return next(url, context);
  },
});
const { JdRunResult, JdItemView } = await import("../src/features/jd/jd-result-view.tsx");
hooks.deregister();
const { JdSummaryPanel, JdPicker, JdRunList } = await load("features/jd/jd-summary-panel.tsx");
const { currentJdSession } = await load("features/jd/jd-session.ts");
const { accessTokenStore } = await load("lib/access-token.ts");
const ID = "00000000-0000-4000-8000-000000000001", RUN = "00000000-0000-4000-8000-000000000002", RUN2 = "00000000-0000-4000-8000-000000000003";
const now = "2026-11-04T03:00:00.000Z";
const success = (data, status = 200) => ({ kind: "success", status, data });
const error = (code, status) => ({ kind: "api-error", status, code, message: "민감 오류 원문" });
const page = (items = [], nextCursor = null) => success({ items, nextCursor });
const jdItem = { jdId: ID, title: "합성 JD", updatedAt: now };
const runItem = (runId = RUN) => ({ runId, title: "합성 JD", createdAt: now, status: "PENDING", requirementCount: 1, emptyCount: 0, failedCount: 0 });
const location = { publishedItemId: ID, fieldPath: "body", charStart: 3, charEnd: 9, pdfPage: null };
const gated = (jdRole, kind = "AI_INTERPRETATION", text = "합성 해석") => ({ jdRole, kind, text, citations: kind === "CITED"
  ? [{ sourceId: ID, quote: "<b>원문</b>", sourceLabel: "발행 자료", location }] : [] });
const row = (overrides = {}) => ({ requirementIndex: 0, sourceLineNumber: 2, jdLine: "  - <script>요구사항</script>  ", status: "DONE",
  resultKind: "CONTENT", failureCode: null, evidenceItems: [gated("EVIDENCE", "CITED")], unconfirmedPoints: [gated("UNCONFIRMED")],
  interviewQuestions: [gated("INTERVIEW_QUESTION")], ...overrides });
const run = (requirements = [row()], overrides = {}) => ({ status: "DONE", failureCode: null, requirements, ...overrides });
const pendingRun = () => run([row({ status: "PENDING", resultKind: null, evidenceItems: [], unconfirmedPoints: [], interviewQuestions: [] })], { status: "PENDING" });
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
function setup(responder = async () => page()) {
  const calls = [], lost = [], auth = { key: 1, logged: true }, grant = { value: "synthetic-grant" };
  const context = { token: "synthetic/token", isLoggedIn: true, getGrant: () => grant.value, onAccessLost: (code) => lost.push(code) };
  const api = createJdApi(async (path, request) => { calls.push({ path, ...request }); return responder(path, request); });
  const model = createJdSummaryModel(api, context, { session: () => auth.key, isLoggedIn: () => auth.logged });
  return { calls, lost, auth, grant, context, api, model };
}
const consent = (request) => runWithConsent({ request, askConsent: async () => true, recordConsent: async () => success(null, 204) });
const render = (value) => renderToStaticMarkup(createElement(JdRunResult, { run: value, runId: RUN, showEvidence() {} }));

test("1. 비로그인은 JD·실행을 조회하지 않으며 요청마다 현재 grant와 정확한 링크 경로를 사용한다", async () => {
  const blocked = setup(); blocked.auth.logged = false;
  await blocked.model.loadJds(); await blocked.model.loadRuns(); assert.equal(blocked.calls.length, 0);
  const closed = renderToStaticMarkup(createElement(JdSummaryPanel, { ...blocked.context, isLoggedIn: false, client: blocked.api, showEvidence() {} }));
  assert.match(closed, /로그인 후 내 JD/); assert.doesNotMatch(closed, /jd-summary-start/); assert.equal(blocked.calls.length, 0);
  const empty = renderToStaticMarkup(createElement(JdPicker, { state: { ...blocked.model.store.get(), jdState: "ready" }, model: blocked.model }));
  assert.match(empty, /저장한 JD가 없습니다/); assert.match(empty, /href="\/jds"/);
  const originalSession = currentJdSession(); accessTokenStore.set("synthetic-member");
  assert.equal(currentJdSession().loggedIn, true); assert.notEqual(currentJdSession().identity, originalSession.identity); accessTokenStore.clear("logout");
  const active = setup(async (path) => path === "/jds" ? page([jdItem]) : page());
  await active.model.loadJds(); active.model.selectJd(ID); assert.equal(active.model.store.get().selectedJd, ID);
  await active.model.loadRuns(); active.grant.value = "new-grant"; await active.model.loadRuns();
  assert.equal(active.calls[1].path, "/public/links/synthetic%2Ftoken/jd-summaries");
  assert.equal(active.calls[1].linkGrant, "synthetic-grant"); assert.equal(active.calls[2].linkGrant, "new-grant");
  // #471 이후 member의 Bearer+grant 연결은 jd-member-binding.test.mjs에서 검사한다.
});

test("2. 접수 오류를 구별하고 공용 동의 후 딱 한 번 재요청하며 반복 거부를 숨기지 않는다", async () => {
  let posts = 0, asks = 0, records = 0;
  const { model } = setup(async (path, request) => path === "/jds" ? page([jdItem]) : request.method === "POST"
    ? (posts++, error("AI_CONSENT_REQUIRED", 403)) : page());
  await model.loadJds(); model.selectJd(ID);
  await model.accept((request) => runWithConsent({ request, askConsent: async () => { asks++; return true; }, recordConsent: async () => { records++; return success(null, 204); } }));
  assert.equal(posts, 2); assert.equal(asks, 1); assert.equal(records, 1); assert.match(model.store.get().error, /동의/);
  for (const [code, pattern] of [["INDEX_NOT_READY", /검색/], ["INPUT_TOO_LARGE", /상한/], ["INVALID_INPUT", /접수되지/], ["DAILY_LIMIT_REACHED", /오늘/]]) {
    assert.match(jdErrorText({ kind: "failed", code, status: 422, outcome: "other" }), pattern);
  }
  // 하루 횟수는 기능끼리 함께 쓰므로 JD 전용 표현 없이 U2 공용 문구와 같아야 한다(FR6.6).
  assert.equal(jdErrorText({ kind: "failed", code: "DAILY_LIMIT_REACHED", status: 429, outcome: "other" }), U2_ERROR_MESSAGES.DAILY_LIMIT_REACHED);
  assert.equal(U2_ERROR_MESSAGES.DAILY_LIMIT_REACHED, "오늘 한도에 도달했습니다");
});

test("3. 새 접수 runId를 선택하고 재열람·목록·수동 새로고침만 수행한다", async () => {
  let count = 0;
  const { model, calls } = setup(async (path, request) => {
    if (path === "/jds") return page([jdItem]);
    if (request.method === "POST") return success({ runId: count++ === 0 ? RUN : RUN2 }, 202);
    if (path.endsWith("jd-summaries")) return page([runItem()]);
    return success(pendingRun());
  });
  await model.loadJds(); model.selectJd(ID); await model.accept(consent);
  assert.equal(model.store.get().selectedRun, RUN); assert.equal(model.store.get().result.status, "PENDING");
  const history = renderToStaticMarkup(createElement(JdRunList, { state: model.store.get(), model }));
  assert.match(history, /내 요약 실행 기록/); assert.match(history, /요구사항 1/);
  assert.match(model.store.get().notice, /접수/); const firstCount = calls.length;
  await new Promise((resolve) => setImmediate(resolve)); assert.equal(calls.length, firstCount, "자동 폴링 없음");
  await model.selectRun(RUN); assert.equal(calls.length, firstCount + 1);
  await model.accept(consent); assert.equal(model.store.get().selectedRun, RUN2);
  assert.deepEqual(calls.filter((c) => c.method === "POST").map((c) => c.body), [{ jdId: ID }, { jdId: ID }]);
  const lateAccept = deferred();
  const changed = setup(async (path, request) => path === "/jds" ? page([jdItem]) : request.method === "POST"
    ? lateAccept.promise : path.endsWith("jd-summaries") ? page([runItem()]) : success(run()));
  await changed.model.loadJds(); changed.model.selectJd(ID);
  const accepting = changed.model.accept(consent);
  await changed.model.selectRun(RUN2); lateAccept.resolve(success({ runId: RUN }, 202)); await accepting;
  assert.equal(changed.model.store.get().selectedRun, RUN2); assert.equal(changed.model.store.get().result.status, "DONE");
});

test("4. 원문·세 칸·EMPTY·서버 안내·일부 실패를 구별하고 응답에서 jdRole를 보존한다", () => {
  const empty = row({ requirementIndex: 1, sourceLineNumber: 4, resultKind: "EMPTY", evidenceItems: [], interviewQuestions: [],
    unconfirmedPoints: [gated("UNCONFIRMED", "SERVER_NOTICE", "이번에 찾은 자료가 없어 이 요구사항의 표기를 찾지 못했습니다.")] });
  const failed = row({ requirementIndex: 2, sourceLineNumber: 5, status: "FAILED", resultKind: null, failureCode: "GENERATION_FAILED", evidenceItems: [], unconfirmedPoints: [], interviewQuestions: [] });
  const value = run([row(), empty, failed]); assert.equal(isJdRun(value), true);
  const html = render(value);
  for (const word of ["근거", "자료로 확인되지 않는 점", "면접 질문", "AI 해석", "서버 안내", "일부 요구사항을 처리하지 못했습니다.", "이번 자료에서 표시할 요약 내용이 없습니다."]) assert.ok(html.includes(word));
  assert.equal(isJdRun(run([row({ evidenceItems: [gated("UNCONFIRMED")] })])), false);
  assert.equal(isJdRun(run([row({ resultKind: "EMPTY", failureCode: "GENERATION_FAILED" })])), false);
});

test("BR3.5 고정 서버 안내는 원문 옆에 한 번만 표시하고 다른 안내·해석은 해당 칸에 보존한다", () => {
  const fixedText = "이번에 찾은 자료가 없어 이 요구사항의 표기를 찾지 못했습니다.";
  const fixedNotice = gated("UNCONFIRMED", "SERVER_NOTICE", fixedText);
  const otherNotice = gated("UNCONFIRMED", "SERVER_NOTICE", "이번에 찾은 자료에서 'SQL' 표기를 찾지 못함");
  const requirement = row({ jdLine: "  - 합성 요구사항  ", evidenceItems: [], interviewQuestions: [],
    unconfirmedPoints: [fixedNotice, otherNotice, { ...fixedNotice }, gated("UNCONFIRMED", "AI_INTERPRETATION", "합성 확인 과제")] });
  const original = structuredClone(requirement);
  const html = render(run([requirement]));
  assert.equal(html.split(fixedText).length - 1, 1, "고정 안내는 원문 옆과 결과 칸에 중복 표시하지 않는다");
  assert.match(html, /<p[^>]*>  - 합성 요구사항  <\/p><p[^>]*><span[^>]*>서버 안내<\/span> 이번에 찾은 자료가 없어 이 요구사항의 표기를 찾지 못했습니다\.<\/p>/);
  const unconfirmedColumn = html.slice(html.indexOf("<h5>자료로 확인되지 않는 점</h5>"), html.indexOf("<h5>면접 질문</h5>"));
  assert.doesNotMatch(unconfirmedColumn, /이번에 찾은 자료가 없어/);
  assert.match(unconfirmedColumn, /이번에 찾은 자료에서 &#x27;SQL&#x27; 표기를 찾지 못함/);
  assert.match(unconfirmedColumn, /AI 해석/); assert.match(unconfirmedColumn, /합성 확인 과제/);
  assert.deepEqual(requirement, original, "표시 위치 변경으로 받은 원문·결과를 변형하지 않는다");

  const empty = render(run([row({ resultKind: "EMPTY", evidenceItems: [], interviewQuestions: [], unconfirmedPoints: [otherNotice] })]));
  assert.ok(!empty.includes(fixedText), "EMPTY만으로 검색 조각 0개를 추정하지 않는다");
  const sameTextInterpretation = render(run([row({ unconfirmedPoints: [gated("UNCONFIRMED", "AI_INTERPRETATION", fixedText)] })]));
  assert.ok(sameTextInterpretation.indexOf(fixedText) > sameTextInterpretation.indexOf("<h5>자료로 확인되지 않는 점</h5>"), "같은 글의 AI 해석을 서버 안내로 바꾸지 않는다");
});

test("5. R-01 개별 생성 실패는 최초 조회와 재열람 모두 같은 문구이고 전체 시한만 구분한다", async () => {
  const failedRow = row({ status: "FAILED", resultKind: null, failureCode: "GENERATION_FAILED", evidenceItems: [], unconfirmedPoints: [], interviewQuestions: [] });
  const value = run([failedRow], { status: "FAILED", failureCode: "ALL_REQUIREMENTS_FAILED" });
  const { model } = setup(async () => success(value));
  await model.selectRun(RUN); const first = render(model.store.get().result);
  await model.selectRun(RUN); const reopened = render(model.store.get().result);
  assert.equal(first, reopened); assert.match(first, /이 요구사항을 처리하지 못했습니다\./); assert.doesNotMatch(first, /전체 처리 시한/);
  const deadline = run([row(), { ...failedRow, requirementIndex: 1, sourceLineNumber: 3, failureCode: "DEADLINE_EXCEEDED" }], { status: "FAILED", failureCode: "DEADLINE_EXCEEDED" });
  assert.match(render(deadline), /전체 처리 시한이 지나 완료하지 못했습니다\./);
  assert.match(render(deadline), /발행 자료/);
});

test("6. React 텍스트 escaping과 출처 라벨·원문을 보존하고 받은 location 객체를 그대로 전달한다", () => {
  const html = render(run());
  assert.match(html, /&lt;script&gt;/); assert.match(html, /&lt;b&gt;원문&lt;\/b&gt;/); assert.doesNotMatch(html, /<script>|<b>원문/);
  let received;
  const element = JdItemView({ item: gated("EVIDENCE", "CITED"), showEvidence: (value) => { received = value; } });
  function findButton(node) {
    if (!node || typeof node !== "object") return null;
    if (Array.isArray(node)) return node.map(findButton).find(Boolean);
    return node.type === "button" ? node : findButton(node.props?.children);
  }
  findButton(element).props.onClick(); assert.equal(received, location);
});

test("7. run·token·로그인 전환과 AUTH/LINK 접근 상실은 결과를 비우고 늦은 응답을 폐기한다", async () => {
  const late = deferred();
  const state = setup(async (path) => path.endsWith(RUN) ? late.promise : success(run()));
  const old = state.model.selectRun(RUN); await state.model.selectRun(RUN2); late.resolve(success(pendingRun())); await old;
  assert.equal(state.model.store.get().selectedRun, RUN2); assert.equal(state.model.store.get().result.status, "DONE");
  const waiting = deferred(); const changed = setup(async () => waiting.promise);
  const load = changed.model.selectRun(RUN); changed.auth.key = 2; waiting.resolve(success(run())); await load;
  assert.equal(changed.model.store.get().result, null); assert.equal(changed.model.store.get().accessLost, true);
  const tokenLate = deferred(); const oldToken = setup(async () => tokenLate.promise);
  const loading = oldToken.model.selectRun(RUN); oldToken.model.dispose(); tokenLate.resolve(success(run())); await loading;
  assert.equal(oldToken.model.store.get().result, null);
  const firstMount = deferred(); let mountingCalls = 0;
  const remount = setup(async () => mountingCalls++ === 0 ? firstMount.promise : page([jdItem]));
  const abandoned = remount.model.loadJds(); remount.model.dispose(); remount.model.activate();
  await remount.model.loadJds(); firstMount.resolve(page([])); await abandoned;
  assert.equal(remount.model.store.get().jdState, "ready"); assert.equal(remount.model.store.get().jds.length, 1);
  for (const [code, status] of [["AUTH_INVALID", 401], ["LINK_PASSWORD_REQUIRED", 401], ["LINK_UNAVAILABLE", 404]]) {
    let first = true;
    const target = setup(async () => first ? (first = false, success(run())) : error(code, status));
    await target.model.selectRun(RUN); await target.model.selectRun(RUN);
    assert.equal(target.model.store.get().result, null); assert.equal(target.model.store.get().jds.length, 0);
    assert.deepEqual(target.lost, code.startsWith("LINK") ? [code] : []);
  }
});

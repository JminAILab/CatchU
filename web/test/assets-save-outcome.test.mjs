import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { createCatchApi } from "../src/features/assets/catch-api.ts";
import { createAssetsStore } from "../src/features/assets/assets-store.ts";
import { createAssetsSessionScope } from "../src/features/assets/assets-session-scope.ts";
import { previewCatches } from "../src/features/assets/fixtures.ts";
import { toClientResult } from "../src/lib/auth-api.ts";
import { createAuthStore } from "../src/lib/auth-state.ts";
import { bindLegacyTokenSignal, createSessionScope } from "../src/lib/auth-scope.ts";
import { createAccessTokenStore } from "../src/lib/access-token.ts";

// 내 자산 Catch 저장(확인·불일치·공개/숨김)의 공통 인증 결과 구분(#286 후속, B 동의 #308 pullrequestreview-5565777761).
// 공통 인증 결과는 기능 API 호환 변환(toClientResult)으로 바꾼 값과 401의 authRenewal 표시를 합성해 넣는다.
// 실제 브라우저·서버 검증이 아니다(대역 서버로 본 연결은 auth-api.test.mjs).

const item = (id = "c1", fields = {}) => ({ ...previewCatches[0], catchId: id, repositoryId: "repo-a",
  confirmation: { workFactsConfirmed: true, contributionConfirmed: true }, mismatch: false, visibility: "PRIVATE",
  restriction: "NONE", ...fields });
const success = (data) => ({ kind: "success", status: 200, data });
const page = (items) => success({ items, page: { nextCursor: null } });
const renewed401 = () => ({ kind: "api-error", status: 401, code: "AUTH_INVALID", message: "m", authRenewal: "renewed" });
const notRenewed401 = () => ({ kind: "api-error", status: 401, code: "AUTH_INVALID", message: "m", authRenewal: "not-renewed" });
const notSent = () => toClientResult({ kind: "not-sent", reason: "reauth-required" });
const discarded = () => toClientResult({ kind: "discarded", sent: true });
const serverError = () => ({ kind: "api-error", status: 503, code: "INTERNAL_ERROR", message: "m" });
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const CHANGES = [
  [{ kind: "confirmation" }, { confirmation: { workFactsConfirmed: true, contributionConfirmed: true } }],
  [{ kind: "mismatch", mismatch: true }, { mismatch: true }],
  [{ kind: "visibility", visibility: "PUBLIC" }, { visibility: "PUBLIC" }],
];

/** PUT 결과를 차례로 돌려주는 transport 대역. GET은 목록·상세의 현재 값이다. 호출 기록에 본문·토큰은 남기지 않는다. */
function fakeTransport(current, ...puts) {
  const calls = [];
  const transport = async (url, options) => {
    calls.push({ method: options.method, url, signal: options.signal });
    if (options.method === "PUT") {
      const next = puts.shift();
      return typeof next === "function" ? next() : next;
    }
    return url.startsWith("/catches?") ? page([current()]) : success(current());
  };
  return { calls, puts: () => calls.filter((call) => call.method === "PUT").length, transport };
}

async function openedStore(transport, catchId = "c1") {
  const store = createAssetsStore(createCatchApi(transport));
  await store.refresh("repo-a");
  await store.openDetail(catchId);
  return store;
}

for (const [change, saved] of CHANGES) {
  for (const [name, result, reason] of [["로그인 연장 뒤 거부", renewed401, "renewed-rejected"], ["보내지 않음", notSent, "not-sent"]]) {
    test(`${change.kind} · ${name}: 진행 표시만 정리하고 잠그지 않으며 자동으로 다시 보내지 않는다`, async () => {
      const original = item("c1", change.kind === "confirmation"
        ? { confirmation: { workFactsConfirmed: false, contributionConfirmed: false } } : {});
      let current = original;
      const fake = fakeTransport(() => current, result, () => { current = { ...original, ...saved }; return success(current); });
      const store = await openedStore(fake.transport);
      const detail = store.getSnapshot().detail;
      const items = store.getSnapshot().items;
      await store.update(change);
      assert.equal(fake.puts(), 1, "한 번만 보낸다");
      assert.deepEqual(store.getSnapshot().mutation, { catchId: "c1", kind: change.kind, status: "not-processed", error: null, reason });
      assert.equal(store.getSnapshot().detail, detail, "상세는 마지막 확인 값 그대로");
      assert.equal(store.getSnapshot().items, items, "목록도 그대로");
      assert.equal(store.getSnapshot().detailState, "ready");
      await setImmediate();
      assert.equal(fake.puts(), 1, "자동 재전송 없음");
      await store.update(change);
      assert.equal(fake.puts(), 2, "사용자가 다시 누르면 보낸다(잠금 없음)");
      assert.equal(store.getSnapshot().mutation.status, "success");
      assert.deepEqual(store.getSnapshot().detail, { ...original, ...saved });
    });
  }
}

test("처리되지 않은 결과는 진행 중인 목록 조회를 끊거나 다시 조회하지 않는다", async () => {
  const list = deferred();
  const put = deferred();
  const calls = [];
  const transport = async (url, options) => {
    calls.push({ method: options.method, url, signal: options.signal });
    if (options.method === "PUT") return put.promise;
    if (url.startsWith("/catches?")) return calls.filter((c) => c.url.startsWith("/catches?")).length === 1 ? page([item()]) : list.promise;
    return success(item());
  };
  const store = await openedStore(transport);
  const saving = store.update({ kind: "mismatch", mismatch: true });
  const refreshing = store.refresh("repo-a");
  const listCall = calls.at(-1);
  put.resolve(notSent());
  await saving;
  assert.equal(listCall.signal.aborted, false, "진행 중인 목록 조회를 끊지 않는다");
  list.resolve(page([item("c1", { title: "[합성] 나중에 온 목록" })]));
  await refreshing;
  assert.equal(store.getSnapshot().listState, "ready");
  assert.equal(store.getSnapshot().items[0].title, "[합성] 나중에 온 목록");
  assert.equal(calls.filter((c) => c.url.startsWith("/catches?")).length, 2, "목록을 다시 조회하지 않는다");
  assert.equal(store.getSnapshot().mutation.status, "not-processed");
});

test("앞서 보낸 요청의 결과 불명 안내·잠금은 이후 보내지 않은 조회로 풀리지 않고, 조회에 성공해야 풀린다", async () => {
  let detailResult = () => success(item());
  const calls = [];
  const transport = async (url, options) => {
    calls.push(options.method);
    if (options.method === "PUT") return serverError();
    return url.startsWith("/catches?") ? page([item()]) : detailResult();
  };
  const store = await openedStore(transport);
  await store.update({ kind: "visibility", visibility: "PUBLIC" });
  assert.equal(store.getSnapshot().mutation.status, "error", "5xx는 결과 불명");
  await store.update({ kind: "visibility", visibility: "PUBLIC" });
  assert.equal(calls.filter((m) => m === "PUT").length, 1, "잠금 중에는 보내지 않는다");
  detailResult = notSent;
  await store.openDetail("c1", true);
  assert.equal(store.getSnapshot().mutation.status, "error", "보내지 않은 재조회로 잠금을 풀지 않는다");
  assert.equal(store.getSnapshot().detailState, "error");
  detailResult = () => success(item());
  await store.openDetail("c1", true);
  assert.equal(store.getSnapshot().mutation, null, "현재 상태를 다시 읽은 뒤에만 푼다");
  await store.update({ kind: "visibility", visibility: "PUBLIC" });
  assert.equal(calls.filter((m) => m === "PUT").length, 2);
});

for (const [name, result] of [["보낸 뒤 반영하지 않은 응답", discarded], ["응답 유실·예외", () => { throw new TypeError("network"); }],
  ["5xx", serverError], ["갱신하지 못한 401", notRenewed401]]) {
  test(`${name}: 성공·실패로 확정하지 않고 기존 결과 불명 처리(재조회 전 잠금)를 유지한다`, async () => {
    const fake = fakeTransport(() => item(), result);
    const store = await openedStore(fake.transport);
    const detail = store.getSnapshot().detail;
    await store.update({ kind: "visibility", visibility: "PUBLIC" });
    const { mutation } = store.getSnapshot();
    assert.equal(mutation.status, "error");
    assert.equal(mutation.reason, undefined);
    assert.equal(store.getSnapshot().detail, detail);
    await store.update({ kind: "visibility", visibility: "PUBLIC" });
    assert.equal(fake.puts(), 1);
  });
}

test("전환을 끈 기존 호출의 401(authRenewal 없음)·조회 실패는 표시가 없어 기존처럼 결과 불명으로 잠근다", async () => {
  for (const result of [{ kind: "api-error", status: 401, code: "AUTH_INVALID", message: "m" },
    { kind: "lookup-failed", status: null, code: "LOOKUP_FAILED" }, { ...notSent() }]) {
    const fake = fakeTransport(() => item(), result);
    const store = await openedStore(fake.transport);
    await store.update({ kind: "mismatch", mismatch: true });
    assert.equal(store.getSnapshot().mutation.status, "error");
  }
});

test("화면을 해제(회원 변경)한 뒤 도착한 처리되지 않은 결과는 새 상태를 만들지 않는다", async () => {
  for (const result of [renewed401, notSent]) {
    const put = deferred();
    const transport = async (url, options) => options.method === "PUT" ? put.promise
      : url.startsWith("/catches?") ? page([item()]) : success(item());
    const store = await openedStore(transport);
    const saving = store.update({ kind: "visibility", visibility: "PUBLIC" });
    store.dispose();
    put.resolve(result());
    await saving;
    assert.equal(store.getSnapshot().mutation.status, "saving", "해제된 저장소에 결과를 반영하지 않는다");
    assert.equal(store.getSnapshot().selectedId, null);
  }
});

test("저장 중 다른 Catch로 옮긴 뒤 처리되지 않은 결과가 와도 새 상세·조회를 건드리지 않는다", async () => {
  const put = deferred();
  const other = deferred();
  const transport = async (url, options) => {
    if (options.method === "PUT") return put.promise;
    if (url.startsWith("/catches?")) return page([item("c1"), item("c2")]);
    return url.endsWith("/c2") ? other.promise : success(item("c1"));
  };
  const store = await openedStore(transport);
  const saving = store.update({ kind: "visibility", visibility: "PUBLIC" });
  const opening = store.openDetail("c2");
  put.resolve(renewed401());
  await saving;
  assert.equal(store.getSnapshot().selectedId, "c2");
  assert.equal(store.getSnapshot().detailState, "loading", "c2 조회를 끊지 않는다");
  other.resolve(success(item("c2")));
  await opening;
  assert.equal(store.getSnapshot().detail.catchId, "c2");
  assert.equal(store.getSnapshot().mutation.catchId, "c1", "안내는 c1의 것이라 c2 화면에는 보이지 않는다");
});

test("같은 세션의 Access 갱신은 내 자산 화면 세대를 바꾸지 않고, 회원 전환·다른 탭 로그인 감지는 바꾼다", () => {
  const auth = createAuthStore();
  const tokens = createAccessTokenStore();
  bindLegacyTokenSignal(auth, createSessionScope(auth), tokens);
  const assets = createAssetsSessionScope(tokens);
  auth.signedIn("synthetic-access-1", auth.loginStarted());
  const opened = assets.getSnapshot();
  assert.notEqual(opened, null);
  auth.refreshSucceeded("synthetic-access-2", auth.refreshStarted());
  assert.equal(assets.getSnapshot(), opened, "같은 세션 갱신: 화면·입력 유지");
  auth.refreshFailed(auth.refreshStarted(), "session-ended");
  assert.equal(assets.getSnapshot(), opened, "재인증 필요: 화면·입력 유지");
  auth.signedIn("synthetic-access-3", auth.loginStarted());
  const switched = assets.getSnapshot();
  assert.notEqual(switched, opened, "새 로그인(회원 전환): 새 화면");
  auth.invalidateByLoginMarker();
  assert.equal(assets.getSnapshot(), null, "다른 탭 로그인 감지: 이전 화면 해제");
});

// ---- 화면 문구 ----

const actionsUrl = new URL("../src/features/assets/catch-actions.tsx", import.meta.url);
const cssUrl = new URL("../src/features/assets/assets.module.css", import.meta.url);
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === actionsUrl.href && specifier === "./catch-api") return nextResolve("./catch-api.ts", context);
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === cssUrl.href) return { format: "module", shortCircuit: true, source: "export default {};" };
    if (url !== actionsUrl.href) return nextLoad(url, context);
    return {
      format: "module", shortCircuit: true,
      source: ts.transpileModule(readFileSync(actionsUrl, "utf8"), {
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext },
      }).outputText,
    };
  },
});
const { CatchActions } = await import(actionsUrl.href);
hooks.deregister();

const actionsMarkup = (target, mutation) => renderToStaticMarkup(createElement(CatchActions, {
  item: target, mutation, onChange: () => {}, onReload: () => {},
}));
const disabledButtons = (html) => (html.match(/<button[^>]*disabled=""/g) ?? []).length;

test("화면: 로그인 연장 뒤 거부는 합의 문구로 안내하고 다시 누를 수 있게 둔다", () => {
  const target = item("c1", { confirmation: { workFactsConfirmed: false, contributionConfirmed: false } });
  for (const kind of ["confirmation", "mismatch", "visibility"]) {
    const html = actionsMarkup(target, { catchId: "c1", kind, status: "not-processed", error: null, reason: "renewed-rejected" });
    assert.match(html, /로그인이 연장되었습니다\. 다시 눌러 주세요\./);
    assert.doesNotMatch(html, /현재 상태 다시 불러오기/, "재조회 잠금이 아니다");
    assert.doesNotMatch(html, /변경 내용을 저장했습니다|저장하고 있습니다/);
    assert.equal((html.match(/<input[^>]*disabled=""/g) ?? []).length, 0, "확인 체크는 그대로 조작할 수 있다");
  }
});

test("화면: 보내지 않음은 확인(입력 있음)에서만 입력 유지를 덧붙이고, 다른 Catch의 안내는 보이지 않는다", () => {
  const target = item("c1", { confirmation: { workFactsConfirmed: false, contributionConfirmed: false } });
  const confirmation = actionsMarkup(target, { catchId: "c1", kind: "confirmation", status: "not-processed", error: null, reason: "not-sent" });
  assert.match(confirmation, /지금은 요청을 보내지 않았습니다\. 입력은 그대로 두었습니다\./);
  const visibility = actionsMarkup(target, { catchId: "c1", kind: "visibility", status: "not-processed", error: null, reason: "not-sent" });
  assert.match(visibility, /지금은 요청을 보내지 않았습니다\./);
  assert.doesNotMatch(visibility, /입력은 그대로/);
  const other = actionsMarkup(target, { catchId: "c2", kind: "visibility", status: "not-processed", error: null, reason: "not-sent" });
  assert.doesNotMatch(other, /요청을 보내지 않았습니다|로그인이 연장되었습니다/);
});

test("화면 회귀: 결과 불명은 재조회 안내와 함께 조작을 막고, 저장 중에는 모두 막는다", () => {
  const target = item();
  const unknown = actionsMarkup(target, { catchId: "c1", kind: "visibility", status: "error", error: serverError() });
  assert.match(unknown, /현재 상태 다시 불러오기/);
  assert.doesNotMatch(unknown, /로그인이 연장되었습니다/);
  assert.equal(disabledButtons(unknown), 2, "불일치·공개 버튼을 막는다");
  const saving = actionsMarkup(target, { catchId: "c1", kind: "visibility", status: "saving", error: null });
  assert.match(saving, /저장하고 있습니다/);
  assert.equal(disabledButtons(saving), 2);
});

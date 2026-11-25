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
// 결정 줄의 전환 단추(#635). 막을 때는 초점이 남게 disabled 대신 aria-disabled를 쓴다.
const switches = (html) => [...html.matchAll(/<button[^>]*role="switch"[^>]*>/g)].map((match) => match[0]);
const blockedSwitches = (html) => switches(html).filter((tag) => tag.includes('aria-disabled="true"')).length;

test("화면: 로그인 연장 뒤 거부는 합의 문구로 안내하고 다시 누를 수 있게 둔다", () => {
  const target = item("c1", { confirmation: { workFactsConfirmed: false, contributionConfirmed: false } });
  for (const kind of ["mismatch", "visibility"]) {
    const html = actionsMarkup(target, { catchId: "c1", kind, status: "not-processed", error: null, reason: "renewed-rejected" });
    assert.match(html, /로그인이 연장되었습니다\. 다시 눌러 주세요\./);
    assert.doesNotMatch(html, /현재 상태 다시 불러오기/, "재조회 잠금이 아니다");
    assert.doesNotMatch(html, /변경 내용을 저장했습니다|저장하고 있습니다/);
    assert.equal(blockedSwitches(html), 0, "전환 단추는 그대로 누를 수 있다");
  }
});

test("화면: 보내지 않음은 「저장되지 않았습니다. 다시 눌러 주세요.」이고(2026-11-25 팀장 결정) 입력 유지 문구는 없으며, 다른 Catch의 안내는 보이지 않는다", () => {
  const target = item("c1", { confirmation: { workFactsConfirmed: false, contributionConfirmed: false } });
  for (const kind of ["mismatch", "visibility"]) {
    const html = actionsMarkup(target, { catchId: "c1", kind, status: "not-processed", error: null, reason: "not-sent" });
    assert.match(html, /<p role="alert">저장되지 않았습니다\. 다시 눌러 주세요\.<\/p>/);
    assert.doesNotMatch(html, /입력은 그대로|요청을 보내지 않았습니다/);
  }
  const other = actionsMarkup(target, { catchId: "c2", kind: "visibility", status: "not-processed", error: null, reason: "not-sent" });
  assert.doesNotMatch(other, /저장되지 않았습니다|요청을 보내지 않았습니다|로그인이 연장되었습니다/);
});

test("화면 회귀: 결과 불명은 재조회 안내와 함께 조작을 막고, 저장 중에는 모두 막는다", () => {
  const target = item();
  const unknown = actionsMarkup(target, { catchId: "c1", kind: "visibility", status: "error", error: serverError() });
  assert.match(unknown, /현재 상태 다시 불러오기/);
  assert.match(unknown, /보이는 상태는 마지막으로 확인한 값입니다\. 현재 상태를 다시 불러온 뒤 진행해 주세요\./);
  assert.doesNotMatch(unknown, /로그인이 연장되었습니다|아래 상태는/);
  assert.equal(blockedSwitches(unknown), 2, "불일치·공개 전환 단추를 막는다");
  const saving = actionsMarkup(target, { catchId: "c1", kind: "visibility", status: "saving", error: null });
  assert.match(saving, /<div role="status"><p>변경 내용을 저장하고 있습니다\.<\/p><\/div>/);
  assert.doesNotMatch(saving, /창을 닫아도/);
  assert.equal(blockedSwitches(saving), 2);
  assert.doesNotMatch(unknown + saving, /<button[^>]*role="switch"[^>]* disabled=""/, "초점이 남게 disabled는 쓰지 않는다");
});

// #640 리뷰(NVDA로 저장 완료 안내가 들리지 않음): 저장 안내 자리는 처음부터 하나 있고 글만 바뀐다. 안내와 함께 새로 생기는 자리는 낭독기가 놓친다.
// 먼저 정한 실패 조건: 안내가 없을 때 자리도 없음, 저장 중과 저장 완료가 서로 다른 자리에 생김, 알림 자리가 둘 이상임.
test("화면: 저장 안내 자리(role=status)는 늘 하나 있고 비어 있다가 저장 중·저장 완료 글만 바뀐다", () => {
  const target = item();
  const region = (html) => html.match(/<div role="status">(.*?)<\/div>/)?.[1] ?? assert.fail("저장 안내 자리가 있어야 한다");
  const idle = actionsMarkup(target, null);
  assert.equal(region(idle), "", "안내가 없을 때는 빈 자리다");
  assert.equal(region(actionsMarkup(target, { catchId: "c1", kind: "visibility", status: "saving", error: null })), "<p>변경 내용을 저장하고 있습니다.</p>");
  assert.equal(region(actionsMarkup(target, { catchId: "c1", kind: "visibility", status: "success", error: null })), "<p>변경 내용을 저장했습니다.</p>");
  for (const status of ["error", "not-processed"]) {
    const html = actionsMarkup(target, { catchId: "c1", kind: "visibility", status, error: status === "error" ? serverError() : null, reason: "not-sent" });
    assert.equal(region(html), "", `${status}: 실패 안내는 알림(role=alert)으로 따로 보인다`);
    assert.match(html, /role="alert"/);
  }
  for (const html of [idle, actionsMarkup(target, { catchId: "c1", kind: "visibility", status: "success", error: null })]) {
    assert.equal((html.match(/role="status"/g) ?? []).length, 1);
  }
  // 저장 안내 자리는 전환 단추보다 앞에 있어 낭독·Tab 순서에서 구역 맨 앞이다.
  assert.ok(idle.indexOf('<div role="status">') < idle.indexOf('role="switch"'));
});

// #635 결정 줄: 「내용 확인」 구역이 없고 불일치·공개는 전환 단추 둘이다. 문장은 이슈 범위 3의 표 「바꾼 뒤」다.
// 먼저 정한 실패 조건: 체크 상자·[확인 완료]·[지금 공개]·[숨기기]가 남음, 전환 단추에 이름·설명이 안 붙음, 확인 전 Catch의 공개 단추가 막힘,
// 원본이 보호된 미공개 Catch에 문장이 둘 보이거나 단추가 눌림, 원본이 보호된 공개 Catch에 「지금은 공개할 수 없습니다」가 보임.
const switchOf = (html, kind) => switches(html).find((tag) => tag.includes(`data-testid="catch-${kind}-switch"`)) ?? assert.fail(`${kind} 전환 단추가 있어야 한다`);
const stateText = (html, kind) => html.slice(html.indexOf(`data-testid="catch-${kind}-switch"`)).match(/<span aria-hidden="true">([^<]+)<\/span><\/button>/)?.[1];
const visibilityNote = (html) => html.match(/id="([^"]+-visibility-note)"[^>]*>([\s\S]*?)<\/div>/)?.[2] ?? assert.fail("공개 선택 문장이 있어야 한다");

test("#635 결정 줄에는 내용 확인 구역과 옛 단추가 없고, 전환 단추 둘이 구역 제목을 이름으로, 문장을 설명으로 가진다", () => {
  const html = actionsMarkup(item("c1", { confirmation: { workFactsConfirmed: false, contributionConfirmed: false } }), null);
  assert.doesNotMatch(html, /내용 확인|확인 완료|확인만으로|<input|지금 공개|숨기기<|불일치 표시 해제/);
  assert.equal(switches(html).length, 2);
  assert.equal((html.match(/<button/g) ?? []).length, 2, "전환 단추 말고 다른 단추는 없다");
  for (const [kind, title] of [["mismatch", "불일치 표시"], ["visibility", "공개 선택"]]) {
    const tag = switchOf(html, kind);
    const labelledBy = tag.match(/aria-labelledby="([^"]+)"/)[1];
    const describedBy = tag.match(/aria-describedby="([^"]+)"/)[1];
    assert.ok(html.includes(`<h3 id="${labelledBy}">${title}</h3>`), title);
    assert.ok(html.includes(`<div id="${describedBy}">`), `${title} 설명`);
    assert.match(tag, /type="button"/);
  }
  assert.ok(html.includes("<p>표시와 해제는 다음에 발행하는 발행본부터 반영됩니다.</p>"));
});

test("#635 확인하지 않은 미공개 Catch도 공개 전환 단추가 열려 있고 문장은 한 가지다", () => {
  for (const confirmed of [false, true]) {
    const html = actionsMarkup(item("c1", { confirmation: { workFactsConfirmed: confirmed, contributionConfirmed: confirmed } }), null);
    assert.equal(visibilityNote(html), "<p>작업 사실과 나의 기여가 맞는지 본 뒤 공개하세요. 공개한 Catch만 발행할 수 있습니다.</p>");
    assert.match(switchOf(html, "visibility"), /aria-checked="false"/);
    assert.doesNotMatch(switchOf(html, "visibility"), /aria-disabled/);
    assert.equal(stateText(html, "visibility"), "미공개");
    assert.doesNotMatch(html, /먼저 확인해 주세요|공개할 준비가 되었다면/);
  }
});

test("#635 전환 단추는 지금 상태를 aria-checked와 상태 글로 보인다", () => {
  const off = actionsMarkup(item("c1"), null);
  assert.match(switchOf(off, "mismatch"), /aria-checked="false"/);
  assert.equal(stateText(off, "mismatch"), "표시 안 함");
  const on = actionsMarkup(item("c1", { mismatch: true, visibility: "PUBLIC" }), null);
  assert.match(switchOf(on, "mismatch"), /aria-checked="true"/);
  assert.equal(stateText(on, "mismatch"), "표시됨");
  assert.match(switchOf(on, "visibility"), /aria-checked="true"/);
  assert.equal(stateText(on, "visibility"), "공개 설정");
  assert.equal(visibilityNote(on), "<p>숨겨도 이미 발행한 발행본에는 그대로 남습니다. 제공을 끝내려면 발행본에서 링크를 중지하세요.</p>");
});

test("#635 원본이 보호된 미공개 Catch는 보호 문장 하나이고 공개 전환 단추만 막힌다. 보호된 공개 Catch는 보호 문장·다시 공개할 수 없다는 문장·숨기기 안내다", () => {
  for (const confirmed of [false, true]) {
    const html = actionsMarkup(item("c1", { restriction: "SOURCE_PRIVATE",
      confirmation: { workFactsConfirmed: confirmed, contributionConfirmed: confirmed } }), null);
    assert.equal(visibilityNote(html), "<p>원본 저장소가 보호되어 지금은 공개할 수 없습니다.</p>");
    assert.match(switchOf(html, "visibility"), /aria-disabled="true"/);
    assert.doesNotMatch(switchOf(html, "mismatch"), /aria-disabled/);
  }
  const shown = actionsMarkup(item("c1", { restriction: "SOURCE_PRIVATE", visibility: "PUBLIC" }), null);
  // 2026-11-25 팀장 결정(#640 리뷰): 끄면 보호가 풀릴 때까지 다시 켤 수 없다는 것을 끄기 전에 알린다. 보호되지 않은 공개 Catch에는 이 문장이 없다.
  assert.equal(visibilityNote(shown), "<p>원본 저장소가 보호되어 외부에서 열람할 수 없습니다.</p>"
    + "<p>원본이 보호된 동안에는 숨긴 뒤 다시 공개할 수 없습니다.</p>"
    + "<p>숨겨도 이미 발행한 발행본에는 그대로 남습니다. 제공을 끝내려면 발행본에서 링크를 중지하세요.</p>");
  assert.doesNotMatch(actionsMarkup(item("c1", { visibility: "PUBLIC" }), null), /다시 공개할 수 없습니다/);
  assert.doesNotMatch(shown, /지금은 공개할 수 없습니다/);
  assert.doesNotMatch(switchOf(shown, "visibility"), /aria-disabled/, "보호된 공개 Catch는 숨길 수 있다");
});

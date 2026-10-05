import assert from "node:assert/strict";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { createShareLinkApi, isShareLink } from "../src/features/share-links/share-link-api.ts";
import { alsoExpired, formatKst, remainingText } from "../src/features/share-links/share-link-format.ts";
import { createShareLinksStore, violationText } from "../src/features/share-links/share-links-store.ts";
import { copyText } from "../src/features/share-links/copy-text.ts";
import { createMemberSessionScope } from "../src/features/share-links/member-session-scope.ts";

const link = (id, patch = {}) => ({
  linkId: id,
  title: `제목 ${id}`,
  url: `http://localhost:3000/s/token-${id}`,
  passwordRequired: false,
  createdAt: "2026-10-05T00:00:00.000Z",
  expiresAt: "2026-11-04T00:00:00.000Z",
  stoppedAt: null,
  state: "ACTIVE",
  ...patch,
});
const ok = (data, status = 200) => ({ kind: "success", status, data });
const page = (items, nextCursor = null) => ok({ items, page: { nextCursor } });
const lookupFailed = { kind: "lookup-failed", status: null, code: "LOOKUP_FAILED" };
const apiError = (status, code, details) => ({ kind: "api-error", status, code, message: "안내", ...(details ? { details } : {}) });
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

/** 호출을 기록하고, 큐에 넣은 응답을 순서대로 돌려주는 가짜 api.member. */
function fakeMember() {
  const calls = [];
  const queue = [];
  const member = (path, request) => {
    calls.push({ path, request });
    const next = queue.shift();
    if (!next) throw new Error(`응답이 준비되지 않은 호출: ${path}`);
    return typeof next === "function" ? next() : Promise.resolve(next);
  };
  return { calls, queue, member };
}

function keyHolder() {
  let n = 0;
  let key = null;
  return { current() { key ??= `key-${++n}`; return key; }, reset() { key = null; } };
}

function setup(listResponse = page([link("a")])) {
  const fake = fakeMember();
  if (listResponse) fake.queue.push(listResponse);
  const store = createShareLinksStore(createShareLinkApi(fake.member), { keys: keyHolder(), now: () => Date.parse("2026-10-05T03:00:00Z") });
  return { ...fake, store, snap: () => store.getSnapshot() };
}

// ── API 경계 ─────────────────────────────────────────────

test("목록은 limit·cursor를 인코딩하고, 중단은 본문·쿼리·멱등 키 없이 PUT으로 보낸다", async () => {
  const fake = fakeMember();
  const linkApi = createShareLinkApi(fake.member);
  fake.queue.push(page([]), page([]), ok(link("id/1", { state: "STOPPED", stoppedAt: "2026-10-05T01:00:00Z" })), ok(link("n"), 201));
  const abort = new AbortController();
  await linkApi.list(null, abort.signal);
  await linkApi.list("opaque+/=", undefined);
  await linkApi.stop("id/1");
  await linkApi.create({ title: "A사 지원" }, "key-1");
  assert.equal(fake.calls[0].path, "/share-links?limit=20");
  assert.deepEqual(fake.calls[0].request, { method: "GET", signal: abort.signal });
  assert.equal(fake.calls[1].path, "/share-links?limit=20&cursor=opaque%2B%2F%3D");
  assert.equal(fake.calls[2].path, "/share-links/id%2F1/stop");
  assert.deepEqual(fake.calls[2].request, { method: "PUT" }, "중단에는 body를 넣지 않는다({}도 400)");
  assert.equal(Object.hasOwn(fake.calls[2].request, "body"), false);
  assert.deepEqual(fake.calls[3].request, { method: "POST", body: { title: "A사 지원" }, idempotencyKey: "key-1" });
});

test("손상된 성공 응답·다른 링크의 중단 결과·예상 밖 상태는 성공이나 0건으로 바꾸지 않는다", async () => {
  const fake = fakeMember();
  const linkApi = createShareLinkApi(fake.member);
  for (const data of [{}, { items: [], page: {} }, { items: [null], page: { nextCursor: null } },
    { items: [link("a", { state: "DELETED" })], page: { nextCursor: null } },
    { items: [link("a", { url: "javascript:alert(1)" })], page: { nextCursor: null } },
    { items: [], page: { nextCursor: "" } }]) {
    fake.queue.push(ok(data));
    assert.equal((await linkApi.list(null)).kind, "lookup-failed");
  }
  fake.queue.push(ok(link("other", { state: "STOPPED" })));
  assert.equal((await linkApi.stop("mine")).kind, "lookup-failed", "다른 linkId의 결과를 이 링크의 중단으로 보지 않는다");
  fake.queue.push(ok(null, 204));
  assert.equal((await linkApi.create({ title: "t" }, "k")).kind, "lookup-failed");
  fake.queue.push(() => Promise.reject(new Error("network")));
  assert.equal((await linkApi.list(null)).kind, "lookup-failed");
  assert.equal(isShareLink(link("a", { stoppedAt: "not-a-time" })), false);
});

test("발급은 201 새 발급과 200 같은 키의 기존 결과를 모두 발급된 링크로 본다", async () => {
  const fake = fakeMember();
  const linkApi = createShareLinkApi(fake.member);
  fake.queue.push(ok(link("n"), 201), ok(link("n"), 200));
  assert.equal((await linkApi.create({ title: "t" }, "k")).kind, "success");
  assert.equal((await linkApi.create({ title: "t" }, "k")).kind, "success");
});

// ── 목록 ─────────────────────────────────────────────────

test("조회 중·정상 0건·조회 실패를 서로 다른 상태로 둔다", async () => {
  const loading = setup(null);
  const pending = deferred();
  loading.queue.push(() => pending.promise);
  const task = loading.store.load();
  assert.equal(loading.snap().list.status, "loading");
  assert.deepEqual(loading.snap().list.items, []);
  pending.resolve(page([]));
  await task;
  assert.equal(loading.snap().list.status, "ready");
  assert.equal(loading.snap().list.items.length, 0);

  const failed = setup(lookupFailed);
  await failed.store.load();
  assert.equal(failed.snap().list.status, "error", "조회 실패를 빈 목록으로 바꾸지 않는다");
  failed.queue.push(apiError(500, "INTERNAL_ERROR"));
  await failed.store.load();
  assert.equal(failed.snap().list.status, "error");
});

test("다시 조회에 실패하면 이전 목록을 마지막 확인 기준으로 남기고 복사·중단을 막는다", async () => {
  const { store, queue, snap } = setup();
  await store.load();
  const pending = deferred();
  queue.push(() => pending.promise);
  const task = store.load();
  assert.equal(snap().list.refreshing, true);
  assert.equal(store.canStop(snap().list.items[0]), false, "갱신 중에는 중단을 막는다");
  pending.resolve(lookupFailed);
  await task;
  assert.equal(snap().list.status, "ready");
  assert.equal(snap().list.stale, true);
  assert.equal(snap().list.items[0].linkId, "a");
  assert.equal(store.canStop(snap().list.items[0]), false);
  queue.push(page([link("b")]));
  await store.load();
  assert.equal(snap().list.stale, false);
  assert.equal(snap().list.items[0].linkId, "b");
});

test("늦게 도착한 이전 조회 응답으로 최신 목록을 덮지 않는다", async () => {
  const { store, queue, snap } = setup(null);
  const first = deferred();
  const second = deferred();
  queue.push(() => first.promise, () => second.promise);
  const a = store.load();
  const b = store.load();
  second.resolve(page([link("new")]));
  await b;
  first.resolve(page([link("old")]));
  await a;
  assert.deepEqual(snap().list.items.map((item) => item.linkId), ["new"]);
});

test("다음 페이지는 이어 붙이고 중복을 빼며, 모두 받았을 때만 유효 링크 수를 센다", async () => {
  const { store, queue, snap } = setup(page([link("a"), link("b", { state: "STOPPED" })], "c1"));
  await store.load();
  assert.equal(store.activeCount(), null, "다음 페이지가 남았으면 유효 링크 수를 추정하지 않는다");
  queue.push(page([link("b", { state: "STOPPED" }), link("c", { state: "EXPIRED" }), link("d")]));
  await store.loadMore();
  assert.deepEqual(snap().list.items.map((item) => item.linkId), ["a", "b", "c", "d"]);
  assert.equal(store.activeCount(), 2);
});

// ── 발급 ─────────────────────────────────────────────────

test("빈 제목·비밀번호 미입력은 요청하지 않고 안내한다", async () => {
  const { store, calls, snap } = setup();
  await store.load();
  store.openForm();
  store.setTitle("   ");
  await store.submit();
  assert.equal(snap().form.fieldErrors.title, "링크 제목을 입력해 주세요.");
  store.setTitle("A사 지원");
  store.setUsePassword(true);
  await store.submit();
  assert.ok(snap().form.fieldErrors.password);
  assert.equal(calls.length, 1, "목록 조회 외 요청 없음");
});

test("발급 성공은 L02로 바꾸고 비밀번호 입력을 지우며, 제목은 앞뒤 공백을 빼고 비밀번호는 그대로 보낸다", async () => {
  const { store, queue, calls, snap } = setup();
  await store.load();
  store.openForm();
  store.setTitle("  A사 지원  ");
  store.setUsePassword(true);
  store.setPassword(" pass word ");
  queue.push(ok(link("n", { passwordRequired: true }), 201));
  await store.submit();
  assert.deepEqual(calls.at(-1).request.body, { title: "A사 지원", password: " pass word " });
  assert.equal(snap().form.phase, "issued");
  assert.equal(snap().form.issued.linkId, "n");
  assert.equal(snap().form.password, "");
  queue.push(page([link("n", { passwordRequired: true }), link("a")]));
  store.closeForm();
  await setImmediate();
  assert.equal(snap().form.open, false);
  assert.equal(snap().list.items[0].linkId, "n", "닫으면 목록을 다시 불러온다");
});

test("발행 요청 중에는 반복 제출·입력 변경·닫기를 막는다", async () => {
  const { store, queue, calls, snap } = setup();
  await store.load();
  store.openForm();
  store.setTitle("A사 지원");
  const pending = deferred();
  queue.push(() => pending.promise);
  const first = store.submit();
  assert.equal(snap().form.phase, "submitting");
  await store.submit();
  store.setTitle("바뀐 제목");
  store.closeForm();
  assert.equal(calls.filter((call) => call.request?.method === "POST").length, 1);
  assert.equal(snap().form.title, "A사 지원");
  assert.equal(snap().form.open, true);
  pending.resolve(ok(link("n"), 201));
  await first;
});

test("응답 불명(조회 실패·5xx)이면 입력을 잠그고 [다시 발행]은 같은 키·같은 본문으로만 보낸다", async () => {
  const { store, queue, calls, snap } = setup();
  await store.load();
  store.openForm();
  store.setTitle("A사 지원");
  queue.push(lookupFailed);
  await store.submit();
  assert.equal(snap().form.phase, "unknown");
  store.setTitle("다른 제목");
  assert.equal(snap().form.title, "A사 지원", "불명 상태에서는 본문을 바꾸지 않는다");
  queue.push(apiError(503, "INTERNAL_ERROR"));
  await store.resend();
  assert.equal(snap().form.phase, "unknown");
  queue.push(ok(link("n"), 200));
  await store.resend();
  const posts = calls.filter((call) => call.request?.method === "POST");
  assert.equal(posts.length, 3);
  assert.deepEqual(new Set(posts.map((call) => call.request.idempotencyKey)), new Set(["key-1"]));
  for (const call of posts) assert.deepEqual(call.request.body, { title: "A사 지원" });
  assert.equal(snap().form.phase, "issued", "같은 키의 기존 결과(200)도 발급 완료로 본다");
});

test("서버가 판정한 거부는 확정으로 보고 다음 발행은 새 키를 쓴다", async () => {
  const { store, queue, calls, snap } = setup();
  await store.load();
  store.openForm();
  store.setTitle("A사 지원");
  queue.push(apiError(409, "LINK_TITLE_CONFLICT"));
  await store.submit();
  assert.equal(snap().form.phase, "editing");
  assert.equal(snap().form.message.action, "to-list");
  assert.match(snap().form.message.text, /같은 제목의 유효한 링크가 이미 있습니다/);
  assert.doesNotMatch(snap().form.message.text, /발행하지 못했습니다/, "앞선 요청이 성공했을 수 있어 실패라고 하지 않는다");
  queue.push(apiError(409, "LINK_LIMIT_REACHED"));
  await store.submit();
  assert.match(snap().form.message.text, /중단한 뒤 발행해 주세요/);
  const keys = calls.filter((call) => call.request?.method === "POST").map((call) => call.request.idempotencyKey);
  assert.deepEqual(keys, ["key-1", "key-2"]);
});

test("입력 오류(400)는 필드별로 안내하고 입력값을 담지 않는다", async () => {
  const { store, queue, snap } = setup();
  await store.load();
  store.openForm();
  store.setTitle("긴 제목");
  store.setUsePassword(true);
  store.setPassword("short");
  queue.push(apiError(400, "VALIDATION_FAILED", { violations: [{ field: "title", reason: "maxLength" }, { field: "password", reason: "minLength" }] }));
  await store.submit();
  assert.match(snap().form.fieldErrors.title, /허용 길이/);
  assert.equal(snap().form.fieldErrors.password, "비밀번호 길이를 확인해 주세요.");
  assert.equal(snap().form.phase, "editing");
  assert.deepEqual(violationText("body", "whitelistValidation"), { field: null, text: "입력값을 확인해 주세요." });
});

test("401은 처리되지 않은 요청이다. 처음 요청이면 새 키로, 다시 보내던 요청이면 불명 상태와 키를 유지한다", async () => {
  const { store, queue, calls, snap } = setup();
  await store.load();
  store.openForm();
  store.setTitle("A사 지원");
  queue.push(apiError(401, "AUTH_INVALID"));
  await store.submit();
  assert.equal(snap().form.phase, "editing");
  queue.push(lookupFailed, apiError(401, "AUTH_INVALID"));
  await store.submit();
  await store.resend();
  assert.equal(snap().form.phase, "unknown");
  const keys = calls.filter((call) => call.request?.method === "POST").map((call) => call.request.idempotencyKey);
  assert.deepEqual(keys, ["key-1", "key-2", "key-2"]);
});

test("불명 상태에서 [목록에서 확인] 뒤 목록 조회까지 실패해도 키·본문을 잃지 않고, 다시 열면 같은 키·본문으로만 보낸다", async () => {
  const { store, queue, calls, snap } = setup();
  await store.load();
  store.openForm();
  store.setTitle("A사 지원");
  store.setUsePassword(true);
  store.setPassword("pass-1234");
  queue.push(lookupFailed);
  await store.submit();
  queue.push(lookupFailed);
  store.closeForm();
  await setImmediate();
  assert.equal(snap().form.open, false);
  assert.equal(snap().list.stale, true, "목록 재조회도 실패");
  assert.deepEqual(snap().pendingIssue, { title: "A사 지원" }, "확인하지 못한 요청을 남겨 둔다");
  store.openForm();
  assert.equal(snap().form.phase, "unknown", "다시 열면 불명 상태로 이어진다");
  assert.equal(snap().form.title, "A사 지원");
  store.setTitle("다른 제목");
  assert.equal(snap().form.title, "A사 지원");
  queue.push(ok(link("n", { title: "A사 지원", passwordRequired: true }), 200));
  await store.resend();
  const posts = calls.filter((call) => call.request?.method === "POST");
  assert.deepEqual(posts.map((call) => call.request.idempotencyKey), ["key-1", "key-1"], "새 키로 같은 요청을 보내지 않는다");
  for (const call of posts) assert.deepEqual(call.request.body, { title: "A사 지원", password: "pass-1234" });
  assert.equal(snap().form.phase, "issued");
  assert.equal(snap().pendingIssue, null);
});

test("목록에서 같은 제목의 유효 링크가 확인될 때만 붙잡은 요청을 놓는다", async () => {
  const { store, queue, calls, snap } = setup();
  await store.load();
  store.openForm();
  store.setTitle("A사 지원");
  queue.push(lookupFailed);
  await store.submit();
  queue.push(page([link("x", { title: "다른 링크" }), link("y", { title: "A사 지원", state: "STOPPED" })]));
  store.closeForm();
  await setImmediate();
  assert.deepEqual(snap().pendingIssue, { title: "A사 지원" }, "중단된 같은 제목이나 다른 제목만 있으면 계속 붙잡는다");
  queue.push(page([link("n", { title: "A사 지원" })]));
  await store.load();
  assert.equal(snap().pendingIssue, null);
  assert.match(snap().notice.text, /유효 링크가 목록에 있습니다/);
  store.openForm();
  assert.equal(snap().form.phase, "editing");
  store.setTitle("B사 지원");
  queue.push(ok(link("m", { title: "B사 지원" }), 201));
  await store.submit();
  assert.deepEqual(calls.filter((call) => call.request?.method === "POST").map((call) => call.request.idempotencyKey), ["key-1", "key-2"]);
});

test("[새로 작성]을 고를 때만 붙잡은 키를 버리고 입력을 고칠 수 있다", async () => {
  const { store, queue, calls, snap } = setup();
  await store.load();
  store.openForm();
  store.setTitle("A사 지원");
  queue.push(lookupFailed);
  await store.submit();
  store.discardPending();
  assert.equal(snap().form.phase, "editing");
  assert.equal(snap().pendingIssue, null);
  store.setTitle("A사 최종 지원");
  queue.push(ok(link("n", { title: "A사 최종 지원" }), 201));
  await store.submit();
  const posts = calls.filter((call) => call.request?.method === "POST");
  assert.deepEqual(posts.map((call) => call.request.idempotencyKey), ["key-1", "key-2"]);
  assert.deepEqual(posts[1].request.body, { title: "A사 최종 지원" });
});

// ── 중단 ─────────────────────────────────────────────────

test("중단 확인 → 성공이면 목록의 해당 행을 서버가 돌려준 상태로 바꾼다", async () => {
  const { store, queue, snap } = setup(page([link("a"), link("b", { state: "EXPIRED" })]));
  await store.load();
  store.openStop("b");
  assert.equal(snap().stop, null, "만료 링크에는 중단을 열지 않는다");
  store.openStop("a");
  assert.equal(snap().stop.phase, "confirm");
  const pending = deferred();
  queue.push(() => pending.promise);
  const task = store.confirmStop();
  assert.equal(snap().stop.phase, "requesting");
  store.cancelStop();
  assert.equal(snap().stop.phase, "requesting", "전송 후에는 취소를 제공하지 않는다");
  pending.resolve(ok(link("a", { state: "STOPPED", stoppedAt: "2026-10-05T02:00:00Z" })));
  await task;
  assert.equal(snap().stop, null);
  assert.equal(snap().list.items[0].state, "STOPPED");
  assert.equal(snap().notice.text, "링크가 중단되었습니다.");
});

test("중단 응답 불명이면 완료로 단정하지 않고, 다시 확인하기 전에는 재전송하지 않는다", async () => {
  const { store, queue, calls, snap } = setup();
  await store.load();
  store.openStop("a");
  queue.push(apiError(502, "INTERNAL_ERROR"));
  await store.confirmStop();
  assert.equal(snap().stop.phase, "unknown");
  assert.match(snap().stop.message, /중단 여부를 확인하지 못했습니다/);
  assert.equal(snap().list.items[0].state, "ACTIVE", "목록을 중단됨으로 바꾸지 않는다");
  queue.push(lookupFailed);
  store.recheckStop();
  await setImmediate();
  assert.deepEqual(snap().unresolvedStops, ["a"], "다시 확인에 실패하면 계속 막는다");
  store.openStop("a");
  assert.equal(snap().stop, null);
  queue.push(page([link("a")]));
  await store.load();
  assert.deepEqual(snap().unresolvedStops, []);
  assert.equal(store.canStop(snap().list.items[0]), true, "유효로 다시 확인되면 다시 중단할 수 있다");
  assert.equal(calls.filter((call) => call.request?.method === "PUT").length, 1);
});

test("중단 실패가 확정(404)이면 실패로 안내하고 [상태 다시 확인]은 조회만 한다", async () => {
  const { store, queue, calls, snap } = setup();
  await store.load();
  store.openStop("a");
  queue.push(apiError(404, "RESOURCE_UNAVAILABLE"));
  await store.confirmStop();
  assert.equal(snap().stop.phase, "failed");
  assert.match(snap().stop.message, /중단하지 못했습니다/);
  queue.push(page([link("a")]));
  store.recheckStop();
  await setImmediate();
  assert.equal(snap().stop, null);
  assert.equal(calls.at(-1).request.method, "GET");
});

test("만료 링크의 중단 결과(200 EXPIRED)는 중단으로 표시하지 않는다", async () => {
  const { store, queue, snap } = setup();
  await store.load();
  store.openStop("a");
  queue.push(ok(link("a", { state: "EXPIRED" })));
  await store.confirmStop();
  assert.equal(snap().list.items[0].state, "EXPIRED");
  assert.doesNotMatch(snap().notice.text, /중단되었습니다/);
});

// ── 화면을 떠날 때 ───────────────────────────────────────

test("화면을 떠나면 늦은 발급 응답을 버리고 처음 상태로 돌아가며, 다시 들어오면 새로 조회한다", async () => {
  const { store, queue, snap } = setup();
  await store.load();
  store.openForm();
  store.setTitle("A사 지원");
  store.setUsePassword(true);
  store.setPassword("secret-pass");
  const pending = deferred();
  queue.push(() => pending.promise);
  const task = store.submit();
  store.dispose();
  pending.resolve(ok(link("n"), 201));
  await task;
  assert.equal(snap().form.open, false);
  assert.equal(snap().form.password, "");
  assert.equal(snap().list.status, "loading");
  queue.push(page([link("n")]));
  await store.load();
  assert.equal(snap().list.items[0].linkId, "n");
});

test("화면을 떠난 뒤 도착한 중단·다음 페이지 응답은 반영하지 않는다", async () => {
  const stopCase = setup();
  await stopCase.store.load();
  stopCase.store.openStop("a");
  const stopPending = deferred();
  stopCase.queue.push(() => stopPending.promise);
  const stopTask = stopCase.store.confirmStop();
  stopCase.store.dispose();
  stopPending.resolve(ok(link("a", { state: "STOPPED" })));
  await stopTask;
  assert.equal(stopCase.snap().stop, null);
  assert.equal(stopCase.snap().notice, null);
  assert.deepEqual(stopCase.snap().list.items, []);

  const moreCase = setup(page([link("a")], "c1"));
  await moreCase.store.load();
  const morePending = deferred();
  moreCase.queue.push(() => morePending.promise);
  const moreTask = moreCase.store.loadMore();
  moreCase.store.dispose();
  morePending.resolve(page([link("b")]));
  await moreTask;
  assert.deepEqual(moreCase.snap().list.items, []);
  assert.equal(moreCase.snap().list.status, "loading");
});

test("화면을 떠나면 확인하지 못한 발급 요청과 비밀번호도 버리고, 다시 들어오면 새 키로 시작한다", async () => {
  const { store, queue, calls, snap } = setup();
  await store.load();
  store.openForm();
  store.setTitle("A사 지원");
  store.setUsePassword(true);
  store.setPassword("pass-1234");
  queue.push(lookupFailed);
  await store.submit();
  store.dispose();
  assert.equal(snap().pendingIssue, null);
  assert.equal(snap().form.password, "");
  queue.push(page([]));
  await store.load();
  store.openForm();
  assert.equal(snap().form.phase, "editing", "이전 요청을 불명 상태로 되살리지 않는다");
  assert.equal(snap().form.title, "");
  store.setTitle("B사 지원");
  queue.push(ok(link("n", { title: "B사 지원" }), 201));
  await store.submit();
  assert.deepEqual(calls.filter((call) => call.request?.method === "POST").map((call) => call.request.idempotencyKey), ["key-1", "key-2"]);
});

test("회원이 바뀌면(로그아웃 후 다른 계정·토큰 직접 교체) 새 세대로 화면을 새로 만든다", () => {
  let token = "token-a";
  const listeners = new Set();
  const source = {
    get: () => ({ token }),
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
  const change = (next) => { token = next; listeners.forEach((listener) => listener()); };
  const scope = createMemberSessionScope(source);
  const seen = [];
  scope.subscribe(() => seen.push(scope.getSnapshot()));
  const first = scope.getSnapshot();
  assert.equal(typeof first, "number");
  assert.equal(scope.getSnapshot(), first, "같은 회원이면 같은 세대");
  change(null);
  change("token-b");
  const second = scope.getSnapshot();
  assert.ok(seen.includes(null), "401·로그아웃으로 토큰이 사라지면 화면을 내린다");
  assert.notEqual(second, first);
  change("token-c");
  assert.notEqual(scope.getSnapshot(), second, "빈 상태를 거치지 않고 바뀌어도 새 세대");
  assert.equal(JSON.stringify(seen).includes("token"), false, "토큰 값은 세대에 섞지 않는다");
});

// ── 표시 ─────────────────────────────────────────────────

test("시각은 KST로 표시하고, 남은 기간은 유효 링크에만 보조로 표시한다", () => {
  assert.equal(formatKst("2026-10-05T00:00:00.000Z"), "2026-10-05 09:00:00 (KST)");
  assert.equal(formatKst("2026-12-31T15:30:05Z"), "2027-01-01 00:30:05 (KST)");
  const now = Date.parse("2026-10-05T00:00:00Z");
  assert.equal(remainingText({ state: "ACTIVE", expiresAt: "2026-10-07T12:00:00Z" }, now), "약 2일");
  assert.equal(remainingText({ state: "ACTIVE", expiresAt: "2026-10-05T03:00:00Z" }, now), "24시간 미만");
  assert.equal(remainingText({ state: "STOPPED", expiresAt: "2026-10-07T12:00:00Z" }, now), null);
  assert.equal(remainingText({ state: "ACTIVE", expiresAt: "2026-10-04T00:00:00Z" }, now), null);
  assert.equal(alsoExpired({ state: "STOPPED", expiresAt: "2026-10-04T00:00:00Z" }, now), true);
  assert.equal(alsoExpired({ state: "EXPIRED", expiresAt: "2026-10-04T00:00:00Z" }, now), false);
});

test("클립보드 쓰기에 실제로 성공했을 때만 복사 완료로 본다", async () => {
  const written = [];
  assert.equal(await copyText({ writeText: async (text) => { written.push(text); } }, "http://x/s/t"), true);
  assert.deepEqual(written, ["http://x/s/t"]);
  assert.equal(await copyText({ writeText: async () => { throw new Error("denied"); } }, "u"), false);
  assert.equal(await copyText(undefined, "u"), false);
});

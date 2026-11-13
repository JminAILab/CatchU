/** #471 합류 뒤 U10 어댑터 → 실제 공용 api-client/auth-api 연결. fetch·세션 갱신은 합성이며 실제 브라우저/API 검사가 아니다. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createApiClient } from "../src/lib/api-client.ts";
import { createAuthApi, toClientResult } from "../src/lib/auth-api.ts";
import { createAuthStore } from "../src/lib/auth-state.ts";
import { createAccessTokenStore } from "../src/lib/access-token.ts";
import { createMemberJdApi } from "../src/features/jd/jd-api.ts";
import { createJdManagementModel } from "../src/features/jd/jd-management-model.ts";
import { createJdSummaryModel } from "../src/features/jd/jd-summary-model.ts";
import { runWithConsent } from "../src/components/ai-consent/ai-consent-flow.ts";

const ID = "00000000-0000-4000-8000-000000000001";
const RUN = "00000000-0000-4000-8000-000000000002";
const BASE = "http://127.0.0.1:3001";
const SUMMARY = "/public/links/synthetic%2Ftoken/jd-summaries";
const now = "2026-11-05T03:00:00.000Z";
const draft = { title: "합성 JD", body: "  - React 경험\r\n\r\n  원문 보존  " };
const jd = (value = draft) => ({ jdId: ID, ...value, createdAt: now, updatedAt: now });
const jdItem = { jdId: ID, title: draft.title, updatedAt: now };
const pendingRun = { status: "PENDING", failureCode: null, requirements: [{ requirementIndex: 0, sourceLineNumber: 1,
  jdLine: "합성 요구사항", status: "PENDING", resultKind: null, failureCode: null,
  evidenceItems: [], unconfirmedPoints: [], interviewQuestions: [] }] };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const page = (items = []) => json({ items, nextCursor: null });
const rejected = (code = "AUTH_INVALID", status = 401) => json({ code, message: "화면에 노출하지 않을 합성 오류 원문" }, status);
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
const consent = (request) => runWithConsent({ request,
  askConsent: async () => assert.fail("인증 401이나 정상 접수에는 동의 재요청 없음"),
  recordConsent: async () => assert.fail("이 검사는 이미 동의한 합성 세션") });

/** api.ts의 통합 전환 분기와 동일하게 공용 toClientResult를 거친다. 토큰·갱신 정책은 U10에 복제하지 않는다. */
function setup(respond, { integrated = true, renew = true } = {}) {
  const calls = [], lost = [], grant = { value: "synthetic-grant" };
  const store = createAuthStore(); store.signedIn("synthetic-access-a", store.loginStarted());
  const tokens = createAccessTokenStore(); tokens.set("synthetic-access-a");
  let refreshes = 0;
  const fetch = async (url, request) => {
    const path = new URL(url).pathname.replace(/^\/v1/, "");
    calls.push({ path, ...request });
    return respond(path, request, calls);
  };
  const session = {
    checkLoginMarker() { return "same"; },
    async refresh() {
      refreshes++;
      const ticket = store.refreshStarted();
      if (!ticket) return { kind: "not-started" };
      if (!renew) { store.refreshFailed(ticket, "session-ended"); return { kind: "failed" }; }
      store.refreshSucceeded("synthetic-access-renewed", ticket);
      return { kind: "signed-in" };
    },
  };
  const common = integrated ? createAuthApi({ baseUrl: BASE, store, session, fetch })
    : createApiClient({ baseUrl: BASE, tokens, fetch });
  const client = createMemberJdApi(async (path, request) => toClientResult(await common.member(path, request)));
  const deps = integrated ? { session: () => store.getSnapshot().generation,
    isLoggedIn: () => store.getSnapshot().status === "signed-in" && store.getSnapshot().sessionHold === null && !store.loginChangeDetected() }
    : { session: () => tokens.get(), isLoggedIn: () => tokens.get().token !== null };
  const context = { token: "synthetic/token", isLoggedIn: true, getGrant: () => grant.value, onAccessLost: (code) => lost.push(code) };
  const management = createJdManagementModel(client, deps);
  const summary = createJdSummaryModel(client, context, deps);
  return { client, management, summary, context, deps, store, tokens, calls, lost, grant, refreshes: () => refreshes };
}

test("공용 PATCH: 두 인증 분기의 현재 회원으로 원문 저장 후 서버 목록을 갱신한다", async () => {
  for (const integrated of [false, true]) {
    const s = setup((path, request) => path === "/jds" ? page([jdItem]) : json(jd(request.method === "PATCH" ? JSON.parse(request.body) : draft)), { integrated });
    await s.management.select(ID);
    const changed = { ...draft, title: "수정한 합성 JD" };
    s.management.change(changed); await s.management.save();
    const patch = s.calls.find((r) => r.method === "PATCH");
    assert.equal(patch.path, `/jds/${ID}`); assert.deepEqual(JSON.parse(patch.body), changed);
    assert.equal(patch.headers.Authorization, "Bearer synthetic-access-a"); assert.equal(patch.headers["X-Link-Grant"], undefined);
    assert.equal(patch.credentials, "omit"); assert.equal(patch.cache, "no-store");
    assert.equal(s.management.store.get().editState, "saved"); assert.equal(s.management.store.get().draft.body, draft.body);
    assert.equal(s.calls.filter((r) => r.path === "/jds").length, 1);
  }
});

test("요약 member 연결: 접수·목록·상세 모두 Bearer와 요청 시점 grant를 함께 보낸다", async () => {
  for (const integrated of [false, true]) {
    const s = setup((path, request) => request.method === "POST" ? json({ runId: RUN }, 202)
      : path.endsWith(RUN) ? json(pendingRun) : page(), { integrated });
    assert.equal(s.client.accepted(await s.client.acceptRaw(s.context, ID)).value.runId, RUN);
    s.grant.value = "changed-grant";
    assert.equal((await s.client.listRuns(s.context)).kind, "ok");
    assert.equal((await s.client.getRun(s.context, RUN)).value.status, "PENDING");
    assert.deepEqual(s.calls.map((r) => [r.method, r.path]), [["POST", SUMMARY], ["GET", SUMMARY], ["GET", `${SUMMARY}/${RUN}`]]);
    assert.deepEqual(s.calls.map((r) => r.headers["X-Link-Grant"]), ["synthetic-grant", "changed-grant", "changed-grant"]);
    for (const request of s.calls) {
      assert.equal(request.headers.Authorization, "Bearer synthetic-access-a");
      assert.equal(request.credentials, "omit"); assert.equal(request.cache, "no-store");
    }
    assert.deepEqual(JSON.parse(s.calls[0].body), { jdId: ID }); assert.equal(s.refreshes(), 0);
  }
});

test("LINK 401: 회원 세션·토큰·갱신을 유지하고 요약만 지워 onAccessLost로 넘긴다", async () => {
  for (const integrated of [false, true]) {
    let denied = false;
    const s = setup(() => denied ? rejected("LINK_PASSWORD_REQUIRED") : json(pendingRun), { integrated });
    await s.summary.selectRun(RUN); assert.ok(s.summary.store.get().result);
    denied = true; await s.summary.selectRun(RUN);
    assert.equal(s.summary.store.get().result, null); assert.equal(s.summary.store.get().accessLost, true);
    assert.deepEqual(s.lost, ["LINK_PASSWORD_REQUIRED"]); assert.equal(s.refreshes(), 0);
    assert.equal(s.calls.length, 2); assert.equal(s.deps.isLoggedIn(), true);
    assert.equal(integrated ? s.store.accessToken() : s.tokens.get().token, "synthetic-access-a");
  }
});

test("AUTH 401 GET: 공용 갱신 뒤 같은 grant로 한 번만 재조회하며 재거부는 LINK로 보내지 않는다", async () => {
  for (const twice of [false, true]) {
    let reads = 0;
    const s = setup(() => ++reads === 1 || twice ? rejected() : json(pendingRun));
    const generation = s.deps.session(); await s.summary.selectRun(RUN);
    assert.equal(s.refreshes(), 1); assert.equal(reads, 2); assert.equal(s.deps.session(), generation);
    assert.deepEqual(s.calls.map((r) => r.headers["X-Link-Grant"]), ["synthetic-grant", "synthetic-grant"]);
    assert.deepEqual(s.calls.map((r) => r.headers.Authorization), ["Bearer synthetic-access-a", "Bearer synthetic-access-renewed"]);
    assert.deepEqual(s.lost, []);
    if (twice) { assert.equal(s.summary.store.get().result, null); assert.equal(s.summary.store.get().accessLost, true); assert.match(s.summary.store.get().error, /로그인/); }
    else assert.equal(s.summary.store.get().result.status, "PENDING");
  }
  const failedRefresh = setup(() => rejected(), { renew: false });
  await failedRefresh.summary.selectRun(RUN);
  assert.equal(failedRefresh.refreshes(), 1); assert.equal(failedRefresh.calls.length, 1);
  assert.equal(failedRefresh.store.getSnapshot().status, "reauth-required");
  assert.equal(failedRefresh.summary.store.get().accessLost, true); assert.deepEqual(failedRefresh.lost, []);
});

test("POST·PATCH 401: 갱신해도 자동 재전송하지 않으며 저장 입력과 요약 선택을 보존한다", async () => {
  for (const method of ["POST", "PATCH"]) {
    const s = setup((path, request) => request.method === "GET" ? json(jd()) : rejected());
    await s.management.select(method === "PATCH" ? ID : null);
    s.management.change(draft); await s.management.save();
    assert.equal(s.calls.filter((r) => r.method === method).length, 1); assert.equal(s.refreshes(), 1);
    assert.equal(s.management.store.get().editState, "error"); assert.deepEqual(s.management.store.get().draft, draft);
    assert.match(s.management.store.get().editError, /갱신했지만 요청은 처리되지 않았습니다/);
  }
  const s = setup((path) => path === "/jds" ? page([jdItem]) : rejected());
  await s.summary.loadJds(); s.summary.selectJd(ID); await s.summary.accept(consent);
  assert.equal(s.calls.filter((r) => r.method === "POST").length, 1); assert.equal(s.refreshes(), 1);
  assert.equal(s.summary.store.get().selectedJd, ID); assert.equal(s.summary.store.get().selectedRun, null);
  assert.match(s.summary.store.get().error, /갱신했지만 요청은 처리되지 않았습니다/); assert.deepEqual(s.lost, []);
});

test("PATCH 업무·통신 실패: 입력을 보존하고 미전송 표식도 공용 변환 뒤 잃지 않는다", async () => {
  for (const failure of [() => rejected("INVALID_INPUT", 422), () => rejected("INTERNAL_ERROR", 500), () => { throw new TypeError("synthetic network failure"); }]) {
    const s = setup((path, request) => request.method === "GET" ? json(jd()) : failure());
    await s.management.select(ID); s.management.change(draft); await s.management.save();
    assert.equal(s.management.store.get().editState, "error"); assert.deepEqual(s.management.store.get().draft, draft);
    assert.doesNotMatch(s.management.store.get().editError, /합성 오류 원문|저장되었습니다/);
    assert.equal(s.calls.filter((r) => r.method === "PATCH").length, 1); assert.equal(s.refreshes(), 0);
  }
  const blocked = setup(() => assert.fail("공용 경계에서 미전송")); blocked.store.logoutStarted();
  assert.equal((await blocked.client.update(ID, draft)).outcome, "not-sent"); assert.equal(blocked.calls.length, 0);
});

test("로그인 true 계정 교체: 늦은 JD 조회·저장·요약 조회·접수를 새 세션에 반영하지 않는다", async () => {
  for (const mode of ["list", "save", "run", "accept"]) {
    const late = deferred();
    const s = setup((path, request) => mode === "accept" && path === "/jds" ? page([jdItem])
      : mode === "save" && request.method === "GET" ? json(jd()) : late.promise);
    let pending;
    if (mode === "list") pending = s.management.load();
    if (mode === "save") { await s.management.select(ID); s.management.change(draft); pending = s.management.save(); }
    if (mode === "run") pending = s.summary.selectRun(RUN);
    if (mode === "accept") { await s.summary.loadJds(); s.summary.selectJd(ID); pending = s.summary.accept(consent); }
    const generation = s.deps.session(); s.store.signedIn("synthetic-access-b", s.store.loginStarted());
    assert.equal(s.deps.isLoggedIn(), true); assert.notEqual(s.deps.session(), generation);
    const replacement = createJdManagementModel(s.client, s.deps); await replacement.select(null); replacement.change({ title: "새 회원", body: "새 입력" });
    late.resolve(mode === "list" ? page([jdItem]) : mode === "save" ? json(jd()) : mode === "run" ? json(pendingRun) : json({ runId: RUN }, 202));
    await pending;
    assert.deepEqual(replacement.store.get().draft, { title: "새 회원", body: "새 입력" });
    assert.equal(s.management.store.get().list.length, 0); assert.equal(s.management.store.get().draft.body, "");
    assert.equal(s.summary.store.get().result, null); assert.equal(s.summary.store.get().selectedRun, null);
    if (mode === "accept") assert.equal(s.calls.length, 2, "늦은 접수 뒤 실행 목록·상세를 추가 조회하지 않음");
    assert.equal(s.refreshes(), 0); assert.deepEqual(s.lost, []);
  }
  const late = deferred(); const s = setup(() => late.promise);
  const result = s.client.update(ID, draft); s.store.signedIn("synthetic-access-b", s.store.loginStarted());
  late.resolve(json(jd())); assert.equal((await result).outcome, "discarded", "공용 결과 객체 표식 보존");
});

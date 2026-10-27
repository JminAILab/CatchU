import assert from "node:assert/strict";
import { test } from "node:test";
import { createCatchApi } from "../src/features/assets/catch-api.ts";
import { assetCatchHref, createPublicCatchSummary, MAX_SUMMARY_PAGES } from "../src/features/share-links/public-catch-summary.ts";
import { createPublicProfileSummary, publicProfileFromMember } from "../src/features/share-links/public-profile-summary.ts";

// L01 공개 Catch 요약(#149). 기대 결과의 근거: 공유링크 초안 §4.1·§4.7(0건 발행 허용, 조회 실패를 0건으로 보지 않음),
// B 확인(#149 2026-10-26: 본인 GET /v1/catches의 visibility=PUBLIC·restriction=NONE이 수신자 기준과 같음, /assets?catchId 상세 진입).
// 응답은 합성 자료이며 실제 API·DB 연결은 이 시험의 범위가 아니다.

const catchItem = (id, patch = {}) => ({
  catchId: id,
  title: `제목 ${id}`,
  repositoryId: "repo-1",
  sourceRequestId: "req-1",
  sourceResultId: "res-1",
  sourceCandidateId: `cand-${id}`,
  workFacts: [`사실 ${id}`],
  subjectContribution: "기여",
  evidence: [],
  draft: { status: "GENERATED", content: "설명" },
  reflection: { status: "GENERATED", questions: [] },
  confirmation: { workFactsConfirmed: true, contributionConfirmed: true },
  mismatch: false,
  visibility: "PUBLIC",
  restriction: "NONE",
  sourceMode: "MOCK",
  ...patch,
});
const ok = (data, status = 200) => ({ kind: "success", status, data });
const page = (items, nextCursor = null) => ok({ items, page: { nextCursor } });
const lookupFailed = { kind: "lookup-failed", status: null, code: "LOOKUP_FAILED" };
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

/** 호출을 기록하고 큐의 응답을 순서대로 돌려주는 가짜 api.member. */
function setup(...responses) {
  const calls = [];
  const queue = [...responses];
  const transport = (path, request) => {
    calls.push({ path, request });
    const next = queue.shift();
    if (!next) throw new Error(`응답이 준비되지 않은 호출: ${path}`);
    return typeof next === "function" ? next() : Promise.resolve(next);
  };
  const summary = createPublicCatchSummary(createCatchApi(transport));
  return { calls, queue, summary, snap: () => summary.getSnapshot() };
}

test("마지막 페이지까지 cursor로 읽고 저장소 필터 없이 limit 20으로 요청한다", async () => {
  const t = setup(page([catchItem("a")], "c1"), page([catchItem("b")], "c2"), page([catchItem("c")]));
  await t.summary.load();
  assert.deepEqual(t.calls.map((call) => call.path), [
    "/catches?limit=20",
    "/catches?limit=20&cursor=c1",
    "/catches?limit=20&cursor=c2",
  ]);
  assert.ok(t.calls.every((call) => call.request.method === "GET" && call.request.cache === "no-store" && call.request.signal));
  assert.deepEqual(t.snap().items.map((item) => item.catchId), ["a", "b", "c"]);
});

test("PUBLIC·NONE만 요약하고, 비공개와 원본 보호(SOURCE_PRIVATE) Catch는 뺀다", async () => {
  const t = setup(page([
    catchItem("pub"),
    catchItem("priv", { visibility: "PRIVATE" }),
    catchItem("priv-restricted", { visibility: "PRIVATE", restriction: "SOURCE_PRIVATE" }),
    catchItem("pub-restricted", { visibility: "PUBLIC", restriction: "SOURCE_PRIVATE" }),
  ]));
  await t.summary.load();
  assert.equal(t.snap().status, "ready");
  assert.deepEqual(t.snap(), { status: "ready", items: [{ catchId: "pub", title: "제목 pub", firstFact: null }] });
});

test("조회 중에는 loading이고 0건이나 실패로 보이지 않는다", async () => {
  const first = deferred();
  const t = setup(() => first.promise);
  const loading = t.summary.load();
  assert.equal(t.snap().status, "loading");
  first.resolve(page([]));
  await loading;
  assert.equal(t.snap().status, "ready");
});

test("정상 0건: 빈 목록과 공개 Catch가 없는 목록 모두 ready·0건이다", async () => {
  const empty = setup(page([]));
  await empty.summary.load();
  assert.deepEqual(empty.snap(), { status: "ready", items: [] });

  const allPrivate = setup(page([catchItem("a", { visibility: "PRIVATE" })], "c1"), page([catchItem("b", { visibility: "PRIVATE" })]));
  await allPrivate.summary.load();
  assert.equal(allPrivate.snap().status, "ready");
  assert.equal(allPrivate.snap().items.length, 0);
});

test("첫 페이지 실패·중간 페이지 실패·계약과 다른 응답은 일부 목록이나 0건이 아니라 조회 실패다", async () => {
  const firstFails = setup(lookupFailed);
  await firstFails.summary.load();
  assert.deepEqual(firstFails.snap(), { status: "failed" });

  const middleFails = setup(page([catchItem("a")], "c1"), { kind: "api-error", status: 500, code: "INTERNAL_ERROR", message: "x" });
  await middleFails.summary.load();
  assert.deepEqual(middleFails.snap(), { status: "failed" });

  const malformed = setup(page([{ catchId: "a", visibility: "PUBLIC" }]));
  await malformed.summary.load();
  assert.deepEqual(malformed.snap(), { status: "failed" });

  const thrown = setup(() => Promise.reject(new Error("network")));
  await thrown.summary.load();
  assert.deepEqual(thrown.snap(), { status: "failed" });
});

test("다시 불러오기는 첫 페이지부터 다시 읽는다", async () => {
  const t = setup(page([catchItem("a")], "c1"), lookupFailed, page([catchItem("a")], "c1"), page([catchItem("b")]));
  await t.summary.load();
  assert.equal(t.snap().status, "failed");
  await t.summary.load();
  assert.deepEqual(t.calls.map((call) => call.path).slice(2), ["/catches?limit=20", "/catches?limit=20&cursor=c1"]);
  assert.deepEqual(t.snap().items.map((item) => item.catchId), ["a", "b"]);
});

test("화면을 떠나면 진행 중 조회를 취소하고 늦은 응답을 버린다", async () => {
  const late = deferred();
  const t = setup(() => late.promise);
  const loading = t.summary.load();
  t.summary.dispose();
  assert.equal(t.calls[0].request.signal.aborted, true);
  late.resolve(page([catchItem("a")]));
  await loading;
  assert.equal(t.snap().status, "loading");
});

test("다시 불러오면 앞선 조회의 늦은 응답은 결과를 덮어쓰지 않는다", async () => {
  const old = deferred();
  const t = setup(() => old.promise, page([catchItem("new")]));
  const first = t.summary.load();
  await t.summary.load();
  old.resolve(page([catchItem("old")]));
  await first;
  assert.deepEqual(t.snap().items.map((item) => item.catchId), ["new"]);
  assert.equal(t.calls[0].request.signal.aborted, true);
});

test("읽는 동안 순서가 밀려 같은 Catch가 다시 나오면 한 번만 센다", async () => {
  const t = setup(page([catchItem("a"), catchItem("b")], "c1"), page([catchItem("b"), catchItem("c")]));
  await t.summary.load();
  assert.deepEqual(t.snap().items.map((item) => item.catchId), ["a", "b", "c"]);
});

test("같은 cursor가 다시 오거나 페이지 상한을 넘으면 끝까지 읽었다고 하지 않는다", async () => {
  const repeated = setup(page([catchItem("a")], "c1"), page([catchItem("b")], "c1"));
  await repeated.summary.load();
  assert.deepEqual(repeated.snap(), { status: "failed" });
  assert.equal(repeated.calls.length, 2);

  let n = 0;
  const endless = setup();
  endless.queue.push(...Array.from({ length: MAX_SUMMARY_PAGES }, () => () => Promise.resolve(page([catchItem(`x${n}`)], `c${++n}`))));
  await endless.summary.load();
  assert.deepEqual(endless.snap(), { status: "failed" });
  assert.equal(endless.calls.length, MAX_SUMMARY_PAGES);
});

test("제목이 없으면 제목을 지어내지 않고 첫 작업 사실만 구분용으로 둔다", async () => {
  const t = setup(page([catchItem("a", { title: null, workFacts: ["", "기록된 사실"] }), catchItem("b")]));
  await t.summary.load();
  assert.deepEqual(t.snap().items, [
    { catchId: "a", title: null, firstFact: "기록된 사실" },
    { catchId: "b", title: "제목 b", firstFact: null },
  ]);
});

test("상세 이동은 /assets?catchId=… 이며 catchId를 인코딩한다", () => {
  assert.equal(assetCatchHref("abc"), "/assets?catchId=abc");
  assert.equal(assetCatchHref("a/b c&d"), "/assets?catchId=a%2Fb+c%26d");
});

// ── L01 공개 프로필 요약 ─────────────────────────────────
// 기대 결과의 근거: 수신자 응답 PublicProfile(common.yaml)과 api OwnerProfileReader.readPublicProfile
// (자가 입력 네 필드 그대로, GitHub 계정은 CONNECTED일 때만 저장값·나머지 null).

const member = (patch = {}, github = { state: "CONNECTED", accountLogin: "octo" }) => ({
  memberId: "m-1",
  profile: { displayName: "한지우", introduction: "소개", desiredRole: "백엔드", skills: ["TypeScript", "NestJS"], ...patch },
  github,
});

function profileSetup(...responses) {
  const calls = [];
  const queue = [...responses];
  const transport = (path, request) => {
    calls.push({ path, request });
    const next = queue.shift();
    if (!next) throw new Error(`응답이 준비되지 않은 호출: ${path}`);
    return typeof next === "function" ? next() : Promise.resolve(next);
  };
  const summary = createPublicProfileSummary(transport);
  return { calls, summary, snap: () => summary.getSnapshot() };
}

test("프로필: 수신자에게 공개되는 필드만 꺼내고 memberId·연결 상태값은 넘기지 않는다", () => {
  assert.deepEqual(publicProfileFromMember(member()), {
    displayName: "한지우", introduction: "소개", desiredRole: "백엔드", skills: ["TypeScript", "NestJS"], githubAccountLogin: "octo",
  });
});

test("프로필: GitHub 계정은 CONNECTED일 때만 보이고 재연결 필요·미연결이면 null이다", () => {
  assert.equal(publicProfileFromMember(member({}, { state: "REAUTH_REQUIRED", accountLogin: "octo" })).githubAccountLogin, null);
  assert.equal(publicProfileFromMember(member({}, { state: "DISCONNECTED", accountLogin: null })).githubAccountLogin, null);
  assert.equal(publicProfileFromMember(member({}, { state: "CONNECTED", accountLogin: null })).githubAccountLogin, null);
  // 연결 상태가 아니면 수신자도 저장값을 보지 않으므로 빈 계정명도 오류가 아니다.
  assert.equal(publicProfileFromMember(member({}, { state: "REAUTH_REQUIRED", accountLogin: "" })).githubAccountLogin, null);
});

test("프로필: CONNECTED인데 계정명이 빈 문자열이면 수신자 응답이 오류이므로 줄만 숨기지 않고 null(조회 실패)이다", () => {
  assert.equal(publicProfileFromMember(member({}, { state: "CONNECTED", accountLogin: "" })), null);
});

test("프로필: 빈 값은 그대로 두고, 계약과 다른 응답은 빈 프로필이 아니라 null이다", () => {
  assert.deepEqual(publicProfileFromMember(member({ introduction: "", desiredRole: "", skills: [] })).skills, []);
  assert.equal(publicProfileFromMember({ memberId: "m", profile: { displayName: "x" }, github: { state: "CONNECTED", accountLogin: null } }), null);
  assert.equal(publicProfileFromMember(member({ skills: [1] })), null);
  assert.equal(publicProfileFromMember(member({}, { state: "UNKNOWN", accountLogin: null })), null);
  assert.equal(publicProfileFromMember(null), null);
});

test("프로필: GET /me를 no-store로 읽고 조회 중·성공·실패·다시 불러오기를 구분한다", async () => {
  const first = deferred();
  const t = profileSetup(() => first.promise, ok(member()));
  const loading = t.summary.load();
  assert.equal(t.snap().status, "loading");
  first.resolve(lookupFailed);
  await loading;
  assert.deepEqual(t.snap(), { status: "failed" });
  await t.summary.load();
  assert.equal(t.snap().status, "ready");
  assert.equal(t.snap().profile.displayName, "한지우");
  assert.deepEqual(t.calls.map((call) => [call.path, call.request.method, call.request.cache]), [["/me", "GET", "no-store"], ["/me", "GET", "no-store"]]);
});

test("프로필: 손상 응답·200이 아닌 성공·예외는 조회 실패이고, 화면을 떠나면 늦은 응답을 버린다", async () => {
  for (const response of [ok({ profile: {} }), ok(member(), 201), () => Promise.reject(new Error("network"))]) {
    const t = profileSetup(response);
    await t.summary.load();
    assert.deepEqual(t.snap(), { status: "failed" });
  }
  const late = deferred();
  const t = profileSetup(() => late.promise);
  const loading = t.summary.load();
  t.summary.dispose();
  assert.equal(t.calls[0].request.signal.aborted, true);
  late.resolve(ok(member()));
  await loading;
  assert.equal(t.snap().status, "loading");
});

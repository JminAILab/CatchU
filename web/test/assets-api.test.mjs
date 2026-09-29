import assert from "node:assert/strict";
import { test } from "node:test";
import { createCatchApi } from "../src/features/assets/catch-api.ts";
import { createAssetsStore } from "../src/features/assets/assets-store.ts";
import { previewCatches } from "../src/features/assets/fixtures.ts";

const sample = previewCatches[0];
const item = (id, repositoryId = "repo-a") => ({ ...sample, catchId: id, repositoryId });
const success = (data) => ({ kind: "success", status: 200, data });
const page = (items, nextCursor = null) => success({ items, page: { nextCursor } });
const fail = { kind: "lookup-failed", status: null, code: "LOOKUP_FAILED" };
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

test("필터·opaque cursor를 인코딩하고 회원 경로와 no-store를 전달한다", async () => {
  const calls = [];
  const api = createCatchApi(async (...args) => { calls.push(args); return page([]); });
  const abort = new AbortController();
  await api.list("repo&1", "opaque+/=", abort.signal);
  assert.equal(calls[0][0], "/catches?limit=20&repositoryId=repo%261&cursor=opaque%2B%2F%3D");
  assert.deepEqual(calls[0][1], { method: "GET", cache: "no-store", signal: abort.signal });
  await api.list("", null);
  assert.equal(calls[1][0], "/catches?limit=20");
});

test("손상된 성공·필터 불일치·다른 상세 ID는 성공이나 0건으로 바꾸지 않는다", async () => {
  for (const data of [{}, { items: [], page: {} }, { items: [null], page: { nextCursor: null } },
    { items: [item("c", "other")], page: { nextCursor: null } },
    { items: [{ ...item("c"), confirmation: {} }], page: { nextCursor: null } }]) {
    assert.equal((await createCatchApi(async () => success(data)).list("repo-a", null)).kind, "lookup-failed");
  }
  assert.equal((await createCatchApi(async () => success(item("other"))).detail("mine")).kind, "lookup-failed");
  assert.equal((await createCatchApi(async () => { throw new Error("network"); }).list("", null)).kind, "lookup-failed");
});

test("401·공통 접근 불가 오류는 의미를 유지하고 정상 빈 목록과 구분한다", async () => {
  for (const code of ["AUTH_REQUIRED", "RESOURCE_UNAVAILABLE"]) {
    const error = { kind: "api-error", code, status: code === "AUTH_REQUIRED" ? 401 : 404, message: "안내" };
    assert.deepEqual(await createCatchApi(async () => error).detail("c"), error);
  }
  const store = createAssetsStore(createCatchApi(async () => page([])));
  await store.refresh();
  assert.equal(store.getSnapshot().listState, "ready");
  assert.deepEqual(store.getSnapshot().items, []);
});

test("늦게 도착한 이전 필터 응답을 버리고 이전 요청을 중단한다", async () => {
  const first = deferred(); const second = deferred(); const calls = [];
  const store = createAssetsStore(createCatchApi((path, options) => {
    calls.push(options); return path.includes("repo-a") ? first.promise : second.promise;
  }));
  const a = store.selectRepository("repo-a");
  const b = store.selectRepository("repo-b");
  assert.equal(calls[0].signal.aborted, true);
  second.resolve(page([item("b", "repo-b")]));
  await b;
  first.resolve(page([item("a")]));
  await a;
  assert.deepEqual(store.getSnapshot().items.map((v) => v.catchId), ["b"]);
});

test("다음 페이지 실패 시 기존 목록을 보존하고 같은 cursor로 수동 재조회한다", async () => {
  const paths = []; let n = 0;
  const store = createAssetsStore(createCatchApi(async (path) => {
    paths.push(path);
    return ++n === 1 ? page([item("one")], "opaque-2") : n === 2 ? fail : page([item("two")]);
  }));
  await store.refresh("repo-a"); await store.loadMore();
  assert.equal(store.getSnapshot().moreState, "error");
  assert.equal(store.getSnapshot().items[0].catchId, "one");
  await store.loadMore();
  assert.equal(paths[1], paths[2]);
  assert.deepEqual(store.getSnapshot().items.map((v) => v.catchId), ["one", "two"]);
});

test("새 필터에는 이전 다음 페이지 응답과 cursor가 섞이지 않는다", async () => {
  const late = deferred();
  const store = createAssetsStore(createCatchApi(async (path) => path.includes("cursor=") ? late.promise
    : path.includes("repo-b") ? page([item("b", "repo-b")]) : page([item("a")], "next")));
  await store.refresh("repo-a");
  const more = store.loadMore();
  await store.selectRepository("repo-b");
  late.resolve(page([item("old")]));
  await more;
  assert.deepEqual(store.getSnapshot().items.map((v) => v.catchId), ["b"]);
  assert.equal(store.getSnapshot().nextCursor, null);
});

test("동시 재조회와 더 보기 중복 클릭을 합치고, 같은 저장소도 다시 불러올 수 있다", async () => {
  const first = deferred(); let n = 0;
  const store = createAssetsStore(createCatchApi(async () => ++n === 1 ? first.promise : page([item("b")])));
  const one = store.refresh("repo-a"); const two = store.refresh("repo-a");
  assert.equal(one, two); assert.equal(n, 1);
  first.resolve(page([item("a")], "next")); await one;
  const a = store.loadMore(); const b = store.loadMore(); assert.equal(a, b); await a;
  assert.equal(n, 2);
  await store.refresh("repo-a"); assert.equal(n, 3);
  assert.deepEqual(store.getSnapshot().items.map((v) => v.catchId), ["b"]);
});

test("반복 cursor를 거절하고 페이지 경계의 같은 Catch는 최신 값 하나만 유지한다", async () => {
  let n = 0;
  const store = createAssetsStore(createCatchApi(async () => ++n === 1
    ? page([item("same")], "next")
    : n === 2 ? page([item("same")], "next") : page([{ ...item("same"), visibility: "PUBLIC" }])));
  await store.refresh("repo-a"); await store.loadMore();
  assert.equal(store.getSnapshot().moreState, "error");
  await store.loadMore();
  assert.equal(store.getSnapshot().items.length, 1);
  assert.equal(store.getSnapshot().items[0].visibility, "PUBLIC");
});

test("목록에 없는 Catch도 별도 상세 조회하고 닫은 뒤 응답은 표시하지 않는다", async () => {
  const late = deferred(); let n = 0;
  const store = createAssetsStore(createCatchApi(async () => ++n === 1 ? success(item("deep")) : late.promise));
  await store.openDetail("deep");
  assert.equal(store.getSnapshot().detail.catchId, "deep");
  const pending = store.openDetail("later");
  await store.openDetail(null); late.resolve(success(item("later"))); await pending;
  assert.equal(store.getSnapshot().detail, undefined);
  assert.equal(store.getSnapshot().selectedId, null);
});

test("D 모달 열기는 Catch 상세를 닫고 dispose는 늦은 결과를 버린다", async () => {
  const pending = deferred();
  const store = createAssetsStore(createCatchApi(async () => pending.promise));
  const task = store.openDetail("c");
  store.setManagementOpen(true);
  assert.equal(store.getSnapshot().selectedId, null);
  assert.equal(store.getSnapshot().managementOpen, true);
  store.dispose(); pending.resolve(success(item("c"))); await task;
  assert.equal(store.getSnapshot().detail, undefined);
  store.setManagementOpen(false);
  assert.equal(store.getSnapshot().managementOpen, false);
});


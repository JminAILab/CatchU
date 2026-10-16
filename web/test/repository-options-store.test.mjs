import assert from "node:assert/strict";
import { test } from "node:test";
import { createRepositoryApi } from "../src/features/repository-management/repository-api.ts";
import { createRepositoryOptionsStore } from "../src/features/assets/repository-options-store.ts";

const repository = (repositoryId, name = repositoryId, ownerLogin = "member") => ({
  repositoryId, name, ownerLogin, url: `https://github.com/${ownerLogin}/${name}`,
});
const success = (data) => ({ kind: "success", data });
const page = (items, nextCursor = null) => ({
  kind: "success", status: 200, data: { items, page: { nextCursor } },
});
const failure = { kind: "lookup-failed", status: null, code: "LOOKUP_FAILED" };
const deferred = () => {
  let resolve; let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};

test("초기 snapshot은 안정적인 loading/빈 목록이고 refresh 전에는 조회하지 않는다", async () => {
  let calls = 0;
  const store = createRepositoryOptionsStore({ repositories: async () => { calls++; return success([]); } });
  const initial = store.getSnapshot();
  assert.deepEqual(initial, { state: "loading", repositories: [] });
  assert.equal(store.getSnapshot(), initial);
  assert.equal(calls, 0);
  const snapshots = [];
  const unsubscribe = store.subscribe(() => snapshots.push(store.getSnapshot()));
  await store.refresh();
  assert.deepEqual(snapshots.map((snapshot) => snapshot.state), ["loading", "ready"]);
  unsubscribe();
  await store.refresh();
  assert.equal(snapshots.length, 2);
});

test("기존 API가 모은 전체 페이지를 owner/name으로 표시하고 저장소 ID 중복을 제거한다", async () => {
  const calls = [];
  const api = createRepositoryApi(async (path, request) => {
    calls.push({ path, request });
    return path.includes("cursor=next")
      ? page([repository("repo-a", "renamed", "owner-a"), repository("repo-b", "web", "owner-b")])
      : page([repository("repo-a", "old", "owner-a")], "next");
  });
  const store = createRepositoryOptionsStore(api);
  await store.refresh();
  assert.deepEqual(store.getSnapshot(), {
    state: "ready",
    repositories: [
      { repositoryId: "repo-a", name: "owner-a/renamed" },
      { repositoryId: "repo-b", name: "owner-b/web" },
    ],
  });
  assert.deepEqual(calls.map((call) => call.path), ["/me/repositories?limit=100", "/me/repositories?limit=100&cursor=next"]);
  assert.ok(calls.every((call) => call.request.method === "GET"));
  assert.ok(calls[0].request.signal instanceof AbortSignal);
});

test("정상 빈 목록은 ready이며 전에 표시하던 이름도 비운다", async () => {
  let rows = [repository("repo-a")];
  const store = createRepositoryOptionsStore({ repositories: async () => success(rows) });
  await store.refresh();
  rows = [];
  await store.refresh();
  assert.deepEqual(store.getSnapshot(), { state: "ready", repositories: [] });
});

for (const result of [failure, { kind: "api-error", status: 403, code: "RESOURCE_UNAVAILABLE", message: "조회 불가" }]) {
  test(`${result.kind}는 정상 빈 목록으로 처리하지 않고 error다`, async () => {
    const store = createRepositoryOptionsStore({ repositories: async () => result });
    await store.refresh();
    assert.deepEqual(store.getSnapshot(), { state: "error", repositories: [] });
  });
}

for (const repositories of [
  () => Promise.reject(new TypeError("synthetic rejection")),
  () => { throw new TypeError("synthetic exception"); },
]) {
  test("주입 API의 예외도 refresh를 거부하지 않고 error로 표시한다", async () => {
    const store = createRepositoryOptionsStore({ repositories });
    await assert.doesNotReject(store.refresh());
    assert.deepEqual(store.getSnapshot(), { state: "error", repositories: [] });
  });
}

test("같은 회원의 재조회 중과 실패 후에는 마지막 이름을 유지하고 재시도 성공으로 교체한다", async () => {
  const pending = deferred(); let calls = 0;
  const store = createRepositoryOptionsStore({ repositories: async () => {
    calls++;
    if (calls === 2) return pending.promise;
    return success([repository("repo-a", calls === 1 ? "before" : "after")]);
  } });
  await store.refresh();
  const previous = store.getSnapshot().repositories;
  const refreshing = store.refresh();
  assert.deepEqual(store.getSnapshot(), { state: "loading", repositories: previous });
  pending.resolve(failure);
  await refreshing;
  assert.deepEqual(store.getSnapshot(), { state: "error", repositories: previous });
  await store.refresh();
  assert.deepEqual(store.getSnapshot(), { state: "ready", repositories: [{ repositoryId: "repo-a", name: "member/after" }] });
});

for (const outcome of ["success", "failure", "rejection"]) {
  test(`refresh는 이전 요청을 abort하고 늦은 ${outcome}가 최신 이름을 덮어쓰지 못한다`, async () => {
    const old = deferred(); const signals = [];
    const store = createRepositoryOptionsStore({ repositories: (signal) => {
      signals.push(signal);
      return signals.length === 1 ? old.promise : Promise.resolve(success([repository("new")]));
    } });
    const first = store.refresh();
    await store.refresh();
    assert.equal(signals[0].aborted, true);
    assert.equal(signals[1].aborted, false);
    const latest = store.getSnapshot();
    if (outcome === "rejection") old.reject(new Error("synthetic late rejection"));
    else old.resolve(outcome === "success" ? success([repository("old")]) : failure);
    await first;
    assert.equal(store.getSnapshot(), latest);
    assert.deepEqual(latest.repositories, [{ repositoryId: "new", name: "member/new" }]);
  });
}

test("회원별 store 폐기는 기존 이름을 비우고 이전 요청이 새 회원 자료에 섞이지 않게 한다", async () => {
  const pending = deferred(); let calls = 0; let oldSignal;
  const api = { repositories: (signal) => {
    calls++;
    if (calls === 2) { oldSignal = signal; return pending.promise; }
    return Promise.resolve(success([repository("same-id", calls === 1 ? "old" : "current")]));
  } };
  const previous = createRepositoryOptionsStore(api);
  await previous.refresh();
  const late = previous.refresh();
  previous.dispose();
  assert.equal(oldSignal.aborted, true);
  assert.deepEqual(previous.getSnapshot(), { state: "loading", repositories: [] });
  const current = createRepositoryOptionsStore(api);
  assert.deepEqual(current.getSnapshot(), { state: "loading", repositories: [] });
  await current.refresh();
  pending.resolve(success([repository("same-id", "late-old")]));
  await late;
  assert.deepEqual(previous.getSnapshot(), { state: "loading", repositories: [] });
  assert.deepEqual(current.getSnapshot(), {
    state: "ready", repositories: [{ repositoryId: "same-id", name: "member/current" }],
  });
});

// React effect의 cleanup/setup 순서를 재현한다. 실제 StrictMode 렌더링은 브라우저 검사 범위다.
test("StrictMode cleanup 뒤 같은 store의 재구독·refresh가 동작하고 폐기 전 응답은 무시한다", async () => {
  const old = deferred(); const fresh = deferred(); const signals = [];
  const store = createRepositoryOptionsStore({ repositories: (signal) => {
    signals.push(signal);
    return signals.length === 1 ? old.promise : fresh.promise;
  } });
  const oldStates = [];
  store.subscribe(() => oldStates.push(store.getSnapshot().state));
  const first = store.refresh();
  store.dispose();
  const newStates = [];
  const unsubscribe = store.subscribe(() => newStates.push(store.getSnapshot().state));
  const second = store.refresh();
  old.resolve(success([repository("stale")]));
  await first;
  assert.equal(signals[0].aborted, true);
  assert.equal(signals[1].aborted, false);
  assert.deepEqual(store.getSnapshot(), { state: "loading", repositories: [] });
  fresh.resolve(success([repository("current")]));
  await second;
  assert.deepEqual(store.getSnapshot(), {
    state: "ready", repositories: [{ repositoryId: "current", name: "member/current" }],
  });
  assert.deepEqual(oldStates, ["loading"]);
  assert.deepEqual(newStates, ["loading", "ready"]);
  unsubscribe();
});

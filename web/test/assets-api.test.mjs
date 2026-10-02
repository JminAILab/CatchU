import assert from "node:assert/strict";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { readApiResponse } from "../src/lib/api-response.ts";
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

for (const code of ["AUTH_REQUIRED", "AUTH_INVALID"]) {
  const error = { kind: "api-error", status: 401, code, message: "인증이 필요합니다." };
  const unauthorized = () => Response.json({ code, message: error.message }, { status: 401 });

  test(`${code}: 첫 목록의 HTTP 401은 오류이며 수동 재조회한 정상 0건과 구분한다`, async () => {
    let calls = 0;
    const store = createAssetsStore(createCatchApi(() => readApiResponse(++calls === 1
      ? unauthorized() : Response.json({ items: [], page: { nextCursor: null } }))));
    await store.refresh("repo-a");
    assert.equal(store.getSnapshot().listState, "error");
    assert.deepEqual(store.getSnapshot().listError, error);
    assert.deepEqual(store.getSnapshot().items, []);
    assert.equal(store.getSnapshot().nextCursor, null);
    await setImmediate();
    assert.equal(calls, 1);

    await store.refresh("repo-a");
    assert.equal(calls, 2);
    assert.equal(store.getSnapshot().listState, "ready");
    assert.equal(store.getSnapshot().listError, null);
    assert.deepEqual(store.getSnapshot().items, []);
  });

  test(`${code}: 상세 재조회의 HTTP 401은 이전 상세를 제거하고 오류를 유지한다`, async () => {
    let calls = 0;
    const store = createAssetsStore(createCatchApi(() => readApiResponse(++calls === 1
      ? Response.json(item("c")) : unauthorized())));
    await store.openDetail("c");
    assert.equal(store.getSnapshot().detail.catchId, "c");
    const refresh = store.openDetail("c", true);
    assert.equal(store.getSnapshot().detail, undefined);
    await refresh;
    assert.equal(store.getSnapshot().detailState, "error");
    assert.deepEqual(store.getSnapshot().detailError, error);
    assert.equal(store.getSnapshot().detail, undefined);
    await setImmediate();
    assert.equal(calls, 2);
  });

  test(`${code}: 더 보기의 HTTP 401은 기존 목록과 cursor를 보존하고 자동 재시도하지 않는다`, async () => {
    const paths = [];
    const store = createAssetsStore(createCatchApi((path) => {
      paths.push(path);
      return readApiResponse(paths.length === 1
        ? Response.json({ items: [item("kept")], page: { nextCursor: "opaque-next" } }) : unauthorized());
    }));
    await store.refresh("repo-a");
    await store.loadMore();
    assert.equal(store.getSnapshot().listState, "ready");
    assert.equal(store.getSnapshot().moreState, "error");
    assert.deepEqual(store.getSnapshot().listError, error);
    assert.deepEqual(store.getSnapshot().items, [item("kept")]);
    assert.equal(store.getSnapshot().nextCursor, "opaque-next");
    assert.equal(paths[1], "/catches?limit=20&repositoryId=repo-a&cursor=opaque-next");
    await setImmediate();
    assert.equal(paths.length, 2);
  });
}

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

test("D 모달을 닫으면 모달 활동 전 조회가 끝난 뒤 새 Catch 목록을 읽는다", async () => {
  const old = deferred(); let serverItems = []; let calls = 0;
  const store = createAssetsStore(createCatchApi(async () => ++calls === 1 ? old.promise : page(serverItems)));
  const initial = store.refresh("repo-a");
  store.setManagementOpen(true);
  serverItems = [item("new")];
  store.setManagementOpen(false);
  const closed = store.invalidateList("repo-a");
  assert.equal(calls, 1);
  old.resolve(page([]));
  await Promise.all([initial, closed]);
  assert.equal(calls, 2);
  assert.equal(store.getSnapshot().managementOpen, false);
  assert.deepEqual(store.getSnapshot().items.map((v) => v.catchId), ["new"]);
});

test("같은 조회 중 D 갱신 요청이 반복되어도 후속 조회 하나로 합친다", async () => {
  const old = deferred(); const fresh = deferred(); let calls = 0;
  const store = createAssetsStore(createCatchApi(async () => ++calls === 1 ? old.promise : fresh.promise));
  const initial = store.refresh("repo-a");
  const one = store.invalidateList("repo-a");
  const two = store.invalidateList("repo-a");
  assert.equal(one, two);
  assert.equal(calls, 1);
  old.resolve(page([])); await initial;
  assert.equal(calls, 2);
  fresh.resolve(page([item("new")])); await Promise.all([one, two]);
  assert.equal(calls, 2);
  assert.deepEqual(store.getSnapshot().items.map((v) => v.catchId), ["new"]);
});

for (const saved of [true, false]) {
  test(`D 갱신 예약 직전의 목록과 저장 ${saved ? "성공" : "실패"} 응답이 겹쳐도 새 Catch를 읽는다`, async () => {
    const old = deferred(); const writeResponse = deferred(); let lists = 0; let writes = 0;
    const current = { ...item("existing"), mismatch: saved };
    const store = createAssetsStore(createCatchApi(async (url, options) => {
      if (options.method === "PUT") { writes++; return writeResponse.promise; }
      if (url.startsWith("/catches?")) return ++lists === 1 ? old.promise : page([current, item("new")]);
      return success(item("existing"));
    }));
    await store.openDetail("existing");
    const initial = store.refresh("repo-a");
    const write = store.update({ kind: "mismatch", mismatch: true });
    store.setManagementOpen(true);
    store.setManagementOpen(false);
    const closed = store.invalidateList("repo-a");
    // 같은 턴에 목록을 먼저 완료해 ready 상태와 아직 실행 전인 갱신 예약이 겹치게 한다.
    old.resolve(page([item("existing")]));
    writeResponse.resolve(saved ? success(current) : fail);
    await Promise.all([initial, write, closed]);
    await store.selectRepository("repo-a");
    assert.equal(lists, 2);
    assert.equal(writes, 1);
    assert.deepEqual(store.getSnapshot().items.map((entry) => entry.catchId), ["existing", "new"]);
    assert.equal(store.getSnapshot().items[0].mismatch, saved);
    assert.equal(store.getSnapshot().mutation.status, saved ? "success" : "error");
  });
}

test("필터가 바뀌면 이전 저장소에 예약된 D 갱신을 버린다", async () => {
  const old = deferred(); const paths = [];
  const store = createAssetsStore(createCatchApi(async (path) => {
    paths.push(path);
    return path.includes("repo-a") ? old.promise : page([item("b", "repo-b")]);
  }));
  const initial = store.refresh("repo-a");
  const closed = store.invalidateList("repo-a");
  await store.selectRepository("repo-b");
  old.resolve(page([item("old")])); await Promise.all([initial, closed]);
  assert.equal(paths.length, 2);
  assert.equal(store.getSnapshot().repositoryId, "repo-b");
  assert.deepEqual(store.getSnapshot().items.map((v) => v.catchId), ["b"]);
});

test("dispose 후 같은 저장소로 돌아와도 이전 D 갱신 예약과 응답을 버린다", async () => {
  const old = deferred(); const calls = [];
  const store = createAssetsStore(createCatchApi(async (_path, options) => {
    calls.push(options);
    return calls.length === 1 ? old.promise : page([item("new")]);
  }));
  const initial = store.refresh("repo-a");
  const closed = store.invalidateList("repo-a");
  store.dispose();
  assert.equal(calls[0].signal.aborted, true);
  await store.selectRepository("repo-a");
  old.resolve(page([item("old")])); await Promise.all([initial, closed]);
  assert.equal(calls.length, 2);
  assert.deepEqual(store.getSnapshot().items.map((v) => v.catchId), ["new"]);
});

test("이전 조회가 실패해도 사용자가 요청한 D 갱신은 한 번 실행하고 실패하면 멈춘다", async () => {
  const old = deferred(); let calls = 0;
  const store = createAssetsStore(createCatchApi(async () => ++calls === 1 ? old.promise : calls === 2 ? fail : page([item("new")])));
  const initial = store.refresh("repo-a");
  const closed = store.invalidateList("repo-a");
  old.resolve(fail); await Promise.all([initial, closed]);
  assert.equal(calls, 2);
  assert.equal(store.getSnapshot().listState, "error");
  await store.refresh("repo-a");
  assert.equal(calls, 3);
  assert.deepEqual(store.getSnapshot().items.map((v) => v.catchId), ["new"]);
});

test("후속 조회가 시작된 뒤 새 D 갱신이 오면 그 조회 뒤에도 한 번 더 읽는다", async () => {
  const old = deferred(); const fresh = deferred(); let calls = 0;
  const store = createAssetsStore(createCatchApi(async () => ++calls === 1 ? old.promise : calls === 2 ? fresh.promise : page([item("latest")])));
  const initial = store.refresh("repo-a");
  const firstChange = store.invalidateList("repo-a");
  old.resolve(page([])); await initial;
  assert.equal(calls, 2);
  const secondChange = store.invalidateList("repo-a");
  assert.equal(secondChange, store.invalidateList("repo-a"));
  fresh.resolve(page([item("before-second-change")]));
  await Promise.all([firstChange, secondChange]);
  assert.equal(calls, 3);
  assert.deepEqual(store.getSnapshot().items.map((v) => v.catchId), ["latest"]);
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


test("저장 API는 각 계약의 body만 보내며 확인만으로 공개를 보내지 않는다", async () => {
  const calls = [];
  const confirmed = { ...item("c"), confirmation: { workFactsConfirmed: true, contributionConfirmed: true } };
  const api = createCatchApi(async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/confirmation")) return success(confirmed);
    if (url.endsWith("/mismatch")) return success({ ...confirmed, mismatch: true });
    return success({ ...confirmed, visibility: "PUBLIC" });
  });
  await api.update("c", { kind: "confirmation" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/catches/c/confirmation");
  assert.deepEqual(calls[0].options.body, { workFactsConfirmed: true, contributionConfirmed: true });
  await api.update("c", { kind: "mismatch", mismatch: true });
  assert.deepEqual(calls[1].options.body, { mismatch: true });
  await api.update("c", { kind: "visibility", visibility: "PUBLIC" });
  assert.deepEqual(calls[2].options.body, { visibility: "PUBLIC" });
  assert.ok(calls.every(({ options }) => options.method === "PUT" && options.cache === "no-store"));
});

test("서버가 다른 ID/요청과 다른 저장 상태를 200으로 보내도 성공하지 않는다", async () => {
  const api = createCatchApi(async () => success(item("c")));
  assert.equal((await api.update("c", { kind: "confirmation" })).kind, "lookup-failed");
  assert.equal((await api.update("c", { kind: "visibility", visibility: "PUBLIC" })).kind, "lookup-failed");
  assert.equal((await api.update("other", { kind: "mismatch", mismatch: false })).kind, "lookup-failed");
});

test("저장 응답 전에는 공개로 바꾸지 않으며 연속 조작은 PUT 하나만 보낸다", async () => {
  const pending = deferred(); let writes = 0;
  const store = createAssetsStore(createCatchApi(async (url, options) => {
    if (options.method === "PUT") { writes++; return pending.promise; }
    return url.startsWith("/catches?") ? page([item("c")]) : success(item("c"));
  }));
  await store.refresh("repo-a"); await store.openDetail("c");
  const first = store.update({ kind: "visibility", visibility: "PUBLIC" });
  const second = store.update({ kind: "visibility", visibility: "PUBLIC" });
  assert.equal(first, second); assert.equal(writes, 1);
  assert.equal(store.getSnapshot().detail.visibility, "PRIVATE");
  pending.resolve(success({ ...item("c"), visibility: "PUBLIC" })); await first;
  assert.equal(store.getSnapshot().detail.visibility, "PUBLIC");
  assert.equal(store.getSnapshot().items[0].visibility, "PUBLIC");
  assert.equal(store.getSnapshot().mutation.status, "success");
});

test("공개 거부/저장 결과 불명은 이전 상태를 보존하고 재조회 전 PUT을 막는다", async () => {
  for (const error of [fail, { kind: "api-error", status: 409, code: "SOURCE_RESTRICTED", message: "보호" }]) {
    let writes = 0;
    const store = createAssetsStore(createCatchApi(async (_url, options) => {
      if (options.method === "PUT") { writes++; return error; }
      return success(item("c"));
    }));
    await store.openDetail("c");
    await store.update({ kind: "visibility", visibility: "PUBLIC" });
    assert.equal(store.getSnapshot().detail.visibility, "PRIVATE");
    assert.equal(store.getSnapshot().mutation.status, "error");
    await store.update({ kind: "visibility", visibility: "PUBLIC" }); assert.equal(writes, 1);
    await store.openDetail("c", true);
    assert.equal(store.getSnapshot().mutation, null);
    await store.update({ kind: "visibility", visibility: "PUBLIC" }); assert.equal(writes, 2);
  }
});

test("불일치 표시 결과는 서버의 확인·공개 값을 보존한다", async () => {
  const original = { ...item("c"), visibility: "PUBLIC", confirmation: { workFactsConfirmed: true, contributionConfirmed: true } };
  const store = createAssetsStore(createCatchApi(async (_url, options) => success({ ...original, mismatch: options.method === "PUT" })));
  await store.openDetail("c");
  await store.update({ kind: "mismatch", mismatch: true });
  assert.equal(store.getSnapshot().detail.mismatch, true);
  assert.equal(store.getSnapshot().detail.visibility, "PUBLIC");
  assert.deepEqual(store.getSnapshot().detail.confirmation, original.confirmation);
});

test("저장 중 다른 Catch를 열면 이전 저장 응답을 새 상세에 적용하지 않는다", async () => {
  const pending = deferred();
  const store = createAssetsStore(createCatchApi(async (url, options) => options.method === "PUT" ? pending.promise
    : success(item(url.endsWith("/b") ? "b" : "a"))));
  await store.openDetail("a");
  const write = store.update({ kind: "mismatch", mismatch: true });
  await store.openDetail("b");
  pending.resolve(success({ ...item("a"), mismatch: true })); await write;
  assert.equal(store.getSnapshot().detail.catchId, "b");
  assert.equal(store.getSnapshot().detail.mismatch, false);
});

test("저장 중 닫고 같은 Catch를 다시 열어도 추가 PUT·낡은 GET이 생기지 않는다", async () => {
  const pending = deferred(); let reads = 0;
  const store = createAssetsStore(createCatchApi(async (_url, options) => {
    if (options.method === "PUT") return pending.promise;
    reads++; return success(item("a"));
  }));
  await store.openDetail("a");
  const write = store.update({ kind: "mismatch", mismatch: true });
  await store.openDetail(null);
  const reopened = store.openDetail("a");
  assert.equal(reads, 1);
  pending.resolve(success({ ...item("a"), mismatch: true }));
  await Promise.all([write, reopened]);
  assert.equal(store.getSnapshot().detail.mismatch, true);
  assert.equal(store.getSnapshot().detailState, "ready");
});

test("저장 전 시작한 페이지 응답은 저장 완료 값을 덮어쓰지 않고 이후 페이지는 조회된다", async () => {
  const late = deferred(); let pages = 0;
  const store = createAssetsStore(createCatchApi(async (url, options) => {
    if (options.method === "PUT") return success({ ...item("a"), mismatch: true });
    if (url.includes("cursor=")) { pages++; return pages === 1 ? late.promise : options.signal.aborted ? fail : page([item("b")]); }
    return url.startsWith("/catches?") ? page([item("a")], "next") : success(item("a"));
  }));
  await store.refresh("repo-a"); await store.openDetail("a");
  const more = store.loadMore();
  await store.update({ kind: "mismatch", mismatch: true });
  late.resolve(page([item("a")])); await more;
  assert.equal(store.getSnapshot().items[0].mismatch, true);
  await store.loadMore();
  assert.deepEqual(store.getSnapshot().items.map((v) => v.catchId), ["a", "b"]);
});

test("화면을 해제한 뒤 도착한 저장 응답은 상태를 복구하지 않는다", async () => {
  const pending = deferred();
  const store = createAssetsStore(createCatchApi(async (_url, options) => options.method === "PUT" ? pending.promise : success(item("c"))));
  await store.openDetail("c");
  const write = store.update({ kind: "mismatch", mismatch: true });
  store.dispose();
  pending.resolve(success({ ...item("c"), mismatch: true })); await write;
  assert.equal(store.getSnapshot().detail, undefined);
});


import assert from "node:assert/strict";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { readApiResponse } from "../src/lib/api-response.ts";
import { createCatchApi } from "../src/features/assets/catch-api.ts";
import { createAssetsStore } from "../src/features/assets/assets-store.ts";
import { previewCatches } from "../src/features/assets/fixtures.ts";

const sample = previewCatches[0];
const item = (id, repositoryId = "repo-a") => ({ ...sample, catchId: id, repositoryId });
// 목록 열쇠는 저장소와 작성자 설명 걸러 보기다(새 Catch BR5.2·BR5.4).
const f = (repositoryId = "", authorDescription = "all") => ({ repositoryId, authorDescription });
const success = (data) => ({ kind: "success", status: 200, data });
const page = (items, nextCursor = null) => success({ items, page: { nextCursor } });
const fail = { kind: "lookup-failed", status: null, code: "LOOKUP_FAILED" };
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

test("필터·opaque cursor를 인코딩하고 회원 경로와 no-store를 전달한다", async () => {
  const calls = [];
  const api = createCatchApi(async (...args) => { calls.push(args); return page([]); });
  const abort = new AbortController();
  await api.list(f("repo&1"), "opaque+/=", abort.signal);
  assert.equal(calls[0][0], "/catches?limit=20&repositoryId=repo%261&cursor=opaque%2B%2F%3D");
  assert.deepEqual(calls[0][1], { method: "GET", cache: "no-store", signal: abort.signal });
  await api.list(f(), null);
  assert.equal(calls[1][0], "/catches?limit=20");
});

test("제목이 null인 Catch와 문자열인 Catch를 함께 조회하고 null 상세를 유지한다", async () => {
  const untitled = { ...item("untitled"), title: null };
  const titled = { ...item("titled"), title: "[합성] 제목 있는 Catch" };
  const store = createAssetsStore(createCatchApi(async (url) => url.startsWith("/catches?")
    ? page([untitled, titled]) : success(untitled)));
  await store.refresh(f("repo-a"));
  assert.equal(store.getSnapshot().listState, "ready");
  assert.equal(store.getSnapshot().listError, null);
  assert.deepEqual(store.getSnapshot().items, [untitled, titled]);
  await store.openDetail("untitled");
  assert.equal(store.getSnapshot().detailState, "ready");
  assert.equal(store.getSnapshot().detailError, null);
  assert.deepEqual(store.getSnapshot().detail, untitled);
  assert.deepEqual(store.getSnapshot().items, [untitled, titled]);
});

for (const [name, fields] of [
  ["누락", {}], ["undefined", { title: undefined }], ["빈 문자열", { title: "" }],
  ["숫자", { title: 0 }], ["boolean", { title: false }], ["배열", { title: [] }], ["객체", { title: {} }],
]) {
  test(`title ${name}: null로 간주하지 않고 목록·상세·저장 조회 실패로 유지한다`, async () => {
    const invalid = item("c");
    delete invalid.title;
    Object.assign(invalid, fields);
    const expected = { kind: "lookup-failed", status: 200, code: "LOOKUP_FAILED" };
    assert.deepEqual(await createCatchApi(async () => page([invalid])).list(f("repo-a"), null), expected);
    const api = createCatchApi(async () => success(invalid));
    assert.deepEqual(await api.detail("c"), expected);
    assert.deepEqual(await api.update("c", { kind: "mismatch", mismatch: invalid.mismatch }), expected);
  });
}

for (const [change, savedFields] of [
  [{ kind: "confirmation" }, { confirmation: { workFactsConfirmed: true, contributionConfirmed: true } }],
  [{ kind: "mismatch", mismatch: true }, { mismatch: true }],
  [{ kind: "visibility", visibility: "PUBLIC" }, { visibility: "PUBLIC" }],
]) {
  test(`${change.kind} 저장 성공 응답의 null 제목을 상세와 목록에 보존한다`, async () => {
    const original = { ...item("untitled"), title: null };
    const saved = { ...original, ...savedFields };
    const store = createAssetsStore(createCatchApi(async (url, options) => {
      if (options.method === "PUT") return success(saved);
      return url.startsWith("/catches?") ? page([original]) : success(original);
    }));
    await store.refresh(f("repo-a"));
    await store.openDetail("untitled");
    await store.update(change);
    assert.equal(store.getSnapshot().mutation.status, "success");
    assert.deepEqual(store.getSnapshot().detail, saved);
    assert.deepEqual(store.getSnapshot().items, [saved]);
  });
}

test("손상된 성공·필터 불일치·다른 상세 ID는 성공이나 0건으로 바꾸지 않는다", async () => {
  for (const data of [{}, { items: [], page: {} }, { items: [null], page: { nextCursor: null } },
    { items: [item("c", "other")], page: { nextCursor: null } },
    { items: [{ ...item("c"), confirmation: {} }], page: { nextCursor: null } }]) {
    assert.equal((await createCatchApi(async () => success(data)).list(f("repo-a"), null)).kind, "lookup-failed");
  }
  assert.equal((await createCatchApi(async () => success(item("other"))).detail("mine")).kind, "lookup-failed");
  assert.equal((await createCatchApi(async () => { throw new Error("network"); }).list(f(), null)).kind, "lookup-failed");
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
    await store.refresh(f("repo-a"));
    assert.equal(store.getSnapshot().listState, "error");
    assert.deepEqual(store.getSnapshot().listError, error);
    assert.deepEqual(store.getSnapshot().items, []);
    assert.equal(store.getSnapshot().nextCursor, null);
    await setImmediate();
    assert.equal(calls, 1);

    await store.refresh(f("repo-a"));
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
    await store.refresh(f("repo-a"));
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
  const a = store.selectFilter(f("repo-a"));
  const b = store.selectFilter(f("repo-b"));
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
  await store.refresh(f("repo-a")); await store.loadMore();
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
  await store.refresh(f("repo-a"));
  const more = store.loadMore();
  await store.selectFilter(f("repo-b"));
  late.resolve(page([item("old")]));
  await more;
  assert.deepEqual(store.getSnapshot().items.map((v) => v.catchId), ["b"]);
  assert.equal(store.getSnapshot().nextCursor, null);
});

test("동시 재조회와 더 보기 중복 클릭을 합치고, 같은 저장소도 다시 불러올 수 있다", async () => {
  const first = deferred(); let n = 0;
  const store = createAssetsStore(createCatchApi(async () => ++n === 1 ? first.promise : page([item("b")])));
  const one = store.refresh(f("repo-a")); const two = store.refresh(f("repo-a"));
  assert.equal(one, two); assert.equal(n, 1);
  first.resolve(page([item("a")], "next")); await one;
  const a = store.loadMore(); const b = store.loadMore(); assert.equal(a, b); await a;
  assert.equal(n, 2);
  await store.refresh(f("repo-a")); assert.equal(n, 3);
  assert.deepEqual(store.getSnapshot().items.map((v) => v.catchId), ["b"]);
});

test("D 모달을 닫으면 모달 활동 전 조회가 끝난 뒤 새 Catch 목록을 읽는다", async () => {
  const old = deferred(); let serverItems = []; let calls = 0;
  const store = createAssetsStore(createCatchApi(async () => ++calls === 1 ? old.promise : page(serverItems)));
  const initial = store.refresh(f("repo-a"));
  store.setManagementOpen(true);
  serverItems = [item("new")];
  store.setManagementOpen(false);
  const closed = store.invalidateList(f("repo-a"));
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
  const initial = store.refresh(f("repo-a"));
  const one = store.invalidateList(f("repo-a"));
  const two = store.invalidateList(f("repo-a"));
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
    const initial = store.refresh(f("repo-a"));
    const write = store.update({ kind: "mismatch", mismatch: true });
    store.setManagementOpen(true);
    store.setManagementOpen(false);
    const closed = store.invalidateList(f("repo-a"));
    // 같은 턴에 목록을 먼저 완료해 ready 상태와 아직 실행 전인 갱신 예약이 겹치게 한다.
    old.resolve(page([item("existing")]));
    writeResponse.resolve(saved ? success(current) : fail);
    await Promise.all([initial, write, closed]);
    await store.selectFilter(f("repo-a"));
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
  const initial = store.refresh(f("repo-a"));
  const closed = store.invalidateList(f("repo-a"));
  await store.selectFilter(f("repo-b"));
  old.resolve(page([item("old")])); await Promise.all([initial, closed]);
  assert.equal(paths.length, 2);
  assert.deepEqual(store.getSnapshot().filter, f("repo-b"));
  assert.deepEqual(store.getSnapshot().items.map((v) => v.catchId), ["b"]);
});

test("dispose 후 같은 저장소로 돌아와도 이전 D 갱신 예약과 응답을 버린다", async () => {
  const old = deferred(); const calls = [];
  const store = createAssetsStore(createCatchApi(async (_path, options) => {
    calls.push(options);
    return calls.length === 1 ? old.promise : page([item("new")]);
  }));
  const initial = store.refresh(f("repo-a"));
  const closed = store.invalidateList(f("repo-a"));
  store.dispose();
  assert.equal(calls[0].signal.aborted, true);
  await store.selectFilter(f("repo-a"));
  old.resolve(page([item("old")])); await Promise.all([initial, closed]);
  assert.equal(calls.length, 2);
  assert.deepEqual(store.getSnapshot().items.map((v) => v.catchId), ["new"]);
});

test("이전 조회가 실패해도 사용자가 요청한 D 갱신은 한 번 실행하고 실패하면 멈춘다", async () => {
  const old = deferred(); let calls = 0;
  const store = createAssetsStore(createCatchApi(async () => ++calls === 1 ? old.promise : calls === 2 ? fail : page([item("new")])));
  const initial = store.refresh(f("repo-a"));
  const closed = store.invalidateList(f("repo-a"));
  old.resolve(fail); await Promise.all([initial, closed]);
  assert.equal(calls, 2);
  assert.equal(store.getSnapshot().listState, "error");
  await store.refresh(f("repo-a"));
  assert.equal(calls, 3);
  assert.deepEqual(store.getSnapshot().items.map((v) => v.catchId), ["new"]);
});

test("후속 조회가 시작된 뒤 새 D 갱신이 오면 그 조회 뒤에도 한 번 더 읽는다", async () => {
  const old = deferred(); const fresh = deferred(); let calls = 0;
  const store = createAssetsStore(createCatchApi(async () => ++calls === 1 ? old.promise : calls === 2 ? fresh.promise : page([item("latest")])));
  const initial = store.refresh(f("repo-a"));
  const firstChange = store.invalidateList(f("repo-a"));
  old.resolve(page([])); await initial;
  assert.equal(calls, 2);
  const secondChange = store.invalidateList(f("repo-a"));
  assert.equal(secondChange, store.invalidateList(f("repo-a")));
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
  await store.refresh(f("repo-a")); await store.loadMore();
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
  await store.refresh(f("repo-a")); await store.openDetail("c");
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
  await store.refresh(f("repo-a")); await store.openDetail("a");
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

// 새 Catch NC1 — 본인 목록 「작성자 설명」 걸러 보기(US4.1·US4.2, BR5.1~BR5.6, 계약 C1). 먼저 정한 실패 조건: 「씀」 조건에 설명 없는 Catch가 성공으로 들어옴,
// 걸러 보기를 바꿨는데 이전 커서로 다음 쪽을 부름, 「더 보기」 400을 0건으로 보임, 설명을 저장한 뒤 지금 쪽이 바뀜. 서버는 합성 응답이다.
const described = (id, hasAuthorDescription, repositoryId) => ({ ...item(id, repositoryId), hasAuthorDescription });

test("BR5.1 작성자 설명 조건은 written·unwritten일 때만 질의에 붙고 저장소·커서와 함께 쓴다", async () => {
  const paths = [];
  const api = createCatchApi(async (path) => { paths.push(path); return page([]); });
  await api.list(f("", "written"), null);
  await api.list(f("r&1", "unwritten"), "opaque");
  await api.list(f("", "all"), null);
  assert.deepEqual(paths, [
    "/catches?limit=20&authorDescription=written",
    "/catches?limit=20&repositoryId=r%261&authorDescription=unwritten&cursor=opaque",
    "/catches?limit=20",
  ]);
});

test("BR5.3 응답 검사: hasAuthorDescription이 없거나 참/거짓이 아니면 실패이고, 조건과 맞지 않는 항목이 든 200도 실패다", async () => {
  const listed = (items, filter) => createCatchApi(async () => page(items)).list(filter, null);
  const missing = item("c");
  delete missing.hasAuthorDescription;
  for (const bad of [missing, { ...item("c"), hasAuthorDescription: "true" }, { ...item("c"), hasAuthorDescription: null }]) {
    assert.equal((await listed([bad], f())).kind, "lookup-failed");
    assert.equal((await createCatchApi(async () => success(bad)).detail("c")).kind, "lookup-failed");
  }
  assert.equal((await listed([described("a", true), described("b", false)], f("", "written"))).kind, "lookup-failed");
  assert.equal((await listed([described("a", true)], f("", "unwritten"))).kind, "lookup-failed");
  assert.equal((await listed([described("a", true)], f("other", "written"))).kind, "lookup-failed");
  assert.equal((await listed([described("a", true), described("b", false)], f())).kind, "success");
  assert.equal((await listed([described("a", true)], f("repo-a", "written"))).kind, "success");
});

test("BR5.2 걸러 보기 열쇠가 바뀌면 커서를 지우고 첫 쪽부터 부르며, 다음 쪽은 새 조건으로 부른다", async () => {
  const paths = [];
  const store = createAssetsStore(createCatchApi(async (path) => {
    paths.push(path);
    return path.includes("authorDescription=written")
      ? page([described("w", true)], path.includes("cursor=") ? null : "written-next") : page([described("a", false)], "all-next");
  }));
  await store.refresh(f("repo-a"));
  assert.equal(store.getSnapshot().nextCursor, "all-next");
  const switching = store.selectFilter(f("repo-a", "written"));
  assert.equal(store.getSnapshot().nextCursor, null);
  assert.equal(store.getSnapshot().listState, "loading");
  await switching;
  await store.loadMore();
  assert.deepEqual(paths, [
    "/catches?limit=20&repositoryId=repo-a",
    "/catches?limit=20&repositoryId=repo-a&authorDescription=written",
    "/catches?limit=20&repositoryId=repo-a&authorDescription=written&cursor=written-next",
  ]);
  assert.deepEqual(store.getSnapshot().filter, f("repo-a", "written"));
  assert.deepEqual(store.getSnapshot().items.map((v) => v.catchId), ["w"]);
});

test("AC4.1.2(화면 쪽) 다른 조건·옛 판본 커서로 「더 보기」가 400이면 지금 목록을 지키고 더 보기 실패이며, 걸러 보기를 바꾸면 첫 쪽부터 다시 부른다", async () => {
  const rejected = { kind: "api-error", status: 400, code: "INVALID_REQUEST", message: "합성 메시지" };
  const paths = [];
  const store = createAssetsStore(createCatchApi(async (path) => {
    paths.push(path);
    if (path.includes("cursor=")) return rejected;
    return path.includes("unwritten") ? page([described("u", false)]) : page([described("w", true)], "stale-cursor");
  }));
  await store.refresh(f("", "written"));
  await store.loadMore();
  assert.equal(store.getSnapshot().listState, "ready");
  assert.equal(store.getSnapshot().moreState, "error");
  assert.deepEqual(store.getSnapshot().listError, rejected);
  assert.deepEqual(store.getSnapshot().items.map((v) => v.catchId), ["w"]);
  await store.selectFilter(f("", "unwritten"));
  assert.equal(store.getSnapshot().moreState, "idle");
  assert.equal(store.getSnapshot().listError, null);
  assert.deepEqual(store.getSnapshot().items.map((v) => v.catchId), ["u"]);
  assert.equal(paths.at(-1), "/catches?limit=20&authorDescription=unwritten");
});

test("AC4.2.1 「안 씀」 목록에서 설명을 저장해도 같은 걸러 보기면 다시 부르지 않아 지금 쪽이 그대로이고, 다시 고르면 조건대로 바뀐다", async () => {
  let serverItems = [described("a", false), described("b", false)];
  let lists = 0;
  const store = createAssetsStore(createCatchApi(async (path) => {
    if (!path.startsWith("/catches?")) return success(described("a", false));
    lists++;
    const written = path.includes("authorDescription=written");
    return page(serverItems.filter((entry) => !path.includes("authorDescription=") || entry.hasAuthorDescription === written));
  }));
  await store.selectFilter(f("", "unwritten"));
  await store.openDetail("a");
  // 상세에서 A의 설명을 저장했다(설명 저장은 별도 경로라 목록 상태를 바꾸지 않는다). 상세를 닫고 같은 주소로 돌아온다.
  serverItems = [described("a", true), described("b", false)];
  await store.openDetail(null);
  await store.selectFilter(f("", "unwritten"));
  assert.equal(lists, 1);
  assert.deepEqual(store.getSnapshot().items.map((v) => v.catchId), ["a", "b"]);
  // 걸러 보기를 다시 고르면(전체를 거쳐 「안 씀」) 서버 조건대로 A가 빠진다.
  await store.selectFilter(f());
  await store.selectFilter(f("", "unwritten"));
  assert.equal(lists, 3);
  assert.deepEqual(store.getSnapshot().items.map((v) => v.catchId), ["b"]);
});

// 새 Catch NC3 BR8.1·보안 설계 2절: revisitFacts 응답 검사. 종류별 개수 표는 api 등록 검사와 같은 경계(초과·부족 각 하나)를 본다.
const sha40 = (letter) => letter.repeat(40);
const withFacts = (revisitFacts) => ({ ...item("c"), revisitFacts });
const reworked = { kind: "REWORKED_LINES", paths: ["src/a.ts"], commits: [sha40("a"), sha40("b")] };
const accepted = async (value) => (await createCatchApi(async () => success(value)).detail("c")).kind === "success";

test("NC3 BR8.1 다섯 종류의 맞는 사실과 빈 배열은 받고, 경계 값(시험 파일 20개·경로 1,024자·사실 30개)도 받는다", async () => {
  const tests = (count) => Array.from({ length: count }, (_, index) => `tests/${index}.test.ts`);
  for (const facts of [
    [],
    [reworked, { kind: "MOVED_FILE", paths: ["a.js", "b.js"], commits: [sha40("a")] },
      { kind: "EXTENSION_CHANGED", paths: ["u.js", "u.ts"], commits: [sha40("a"), sha40("b")] },
      { kind: "REVERTED", paths: [], commits: [sha40("b"), sha40("a")] },
      { kind: "TEST_FILES_PRESENT", paths: tests(20), commits: [sha40("a")] }],
    [{ ...reworked, paths: ["가".repeat(1024)] }],
    Array.from({ length: 30 }, () => reworked),
  ]) assert.equal(await accepted(withFacts(facts)), true, JSON.stringify(facts).slice(0, 60));
});

test("NC3 BR8.1 종류별 개수 초과·부족, 모르는 kind, 모르는 칸, 짧은 식별값, 긴 경로, 31개, 빠진 칸은 받지 못한 응답이다", async () => {
  const missing = item("c");
  delete missing.revisitFacts;
  const bad = [
    missing,
    withFacts(null), withFacts({}),
    withFacts([{ ...reworked, paths: [] }]), withFacts([{ ...reworked, paths: ["a.ts", "b.ts"] }]),
    withFacts([{ ...reworked, commits: [sha40("a")] }]),
    withFacts([{ kind: "MOVED_FILE", paths: ["a.js"], commits: [sha40("a")] }]),
    withFacts([{ kind: "REVERTED", paths: ["a.ts"], commits: [sha40("a"), sha40("b")] }]),
    withFacts([{ kind: "TEST_FILES_PRESENT", paths: Array.from({ length: 21 }, (_, i) => `t/${i}.test.ts`), commits: [sha40("a")] }]),
    withFacts([{ ...reworked, kind: "RENAMED" }]),
    withFacts([{ ...reworked, line: "secret" }]),
    withFacts([{ ...reworked, commits: ["abc1234", sha40("b")] }]),
    withFacts([{ ...reworked, commits: [sha40("A"), sha40("b")] }]),
    withFacts([{ ...reworked, paths: ["가".repeat(1025)] }]),
    withFacts([{ kind: "MOVED_FILE", paths: ["a.js", "a.js"], commits: [sha40("a")] }]),
    withFacts(Array.from({ length: 31 }, () => reworked)),
  ];
  for (const value of bad) {
    const api = createCatchApi(async () => success(value));
    assert.deepEqual(await api.detail("c"), { kind: "lookup-failed", status: 200, code: "LOOKUP_FAILED" });
    assert.equal((await createCatchApi(async () => page([value])).list(f(), null)).kind, "lookup-failed");
  }
});


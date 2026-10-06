import assert from "node:assert/strict";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { readApiResponse } from "../src/lib/api-response.ts";
import { createAssetsSessionScope } from "../src/features/assets/assets-session-scope.ts";
import { createCatchApi } from "../src/features/assets/catch-api.ts";
import { createAssetsStore } from "../src/features/assets/assets-store.ts";
import { previewCatches } from "../src/features/assets/fixtures.ts";

const item = (id, title = id) => ({ ...previewCatches[0], catchId: id, repositoryId: "repo-a", title });
const success = (data) => ({ kind: "success", status: 200, data });
const page = (items) => success({ items, page: { nextCursor: null } });
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

// 공통 인증 구현을 가져오거나 대체하지 않는 관측 가능한 입력 대역이다.
function tokenSource(initial = null) {
  let token = initial;
  const listeners = new Set();
  return {
    get: () => ({ token }),
    set(value) { token = value; for (const listener of listeners) listener(); },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    listenerCount: () => listeners.size,
  };
}

// 숫자 key 변경 시의 dispose/new-store 결합 검사다. 실제 React unmount·DOM 제거는 브라우저 검사의 범위다.
function mountStores(tokens, api) {
  const scope = createAssetsSessionScope(tokens);
  let generation = null;
  let store = null;
  const synchronize = () => {
    const next = scope.getSnapshot();
    if (next === generation) return;
    store?.dispose();
    generation = next;
    store = next === null ? null : createAssetsStore(api);
  };
  synchronize();
  const unsubscribe = scope.subscribe(synchronize);
  return {
    getStore: () => store,
    close() { unsubscribe(); store?.dispose(); },
  };
}

test("토큰 없음은 null이고 같은 토큰의 snapshot은 같은 숫자로 유지된다", () => {
  const tokens = tokenSource();
  const scope = createAssetsSessionScope(tokens);
  assert.equal(scope.getSnapshot(), null);
  assert.equal(tokens.listenerCount(), 0, "scope 생성은 구독을 남기지 않는다");
  tokens.set("synthetic-token-a");
  const first = scope.getSnapshot();
  assert.equal(typeof first, "number");
  assert.equal(scope.getSnapshot(), first, "get이 매번 새 객체여도 토큰이 같으면 snapshot은 안정적이다");
  tokens.set("synthetic-token-a");
  assert.equal(scope.getSnapshot(), first);
});

test("회원 전환·로그아웃·같은 토큰 재로그인은 각각 새 세대를 만든다", (t) => {
  const tokens = tokenSource("synthetic-token-a");
  const scope = createAssetsSessionScope(tokens);
  const first = scope.getSnapshot();
  t.after(scope.subscribe(() => {}));
  tokens.set("synthetic-token-b");
  const second = scope.getSnapshot();
  assert.notEqual(second, first);
  tokens.set(null);
  assert.equal(scope.getSnapshot(), null);
  tokens.set("synthetic-token-b");
  const third = scope.getSnapshot();
  assert.notEqual(third, second);
  // React가 중간 snapshot을 읽지 않아도 구독은 로그아웃과 재로그인을 따로 관측한다.
  tokens.set(null);
  tokens.set("synthetic-token-b");
  assert.notEqual(scope.getSnapshot(), third);
});

test("독립 source 또는 교체 scope에 같은 토큰이 있어도 세대 key를 재사용하지 않는다", () => {
  const source = tokenSource("synthetic-token-a");
  const keys = [
    createAssetsSessionScope(source).getSnapshot(),
    createAssetsSessionScope(source).getSnapshot(),
    createAssetsSessionScope(tokenSource("synthetic-token-a")).getSnapshot(),
  ];
  assert.ok(keys.every((key) => typeof key === "number"));
  assert.equal(new Set(keys).size, keys.length);
});

test("여러 구독자는 같은 세대를 받고 구독 해제 뒤에는 알림을 받지 않는다", () => {
  const tokens = tokenSource("synthetic-token-a");
  const scope = createAssetsSessionScope(tokens);
  const first = []; const second = [];
  const stopFirst = scope.subscribe(() => first.push(scope.getSnapshot()));
  const stopSecond = scope.subscribe(() => second.push(scope.getSnapshot()));
  assert.equal(tokens.listenerCount(), 2);
  tokens.set("synthetic-token-b");
  assert.deepEqual(first, second);
  assert.equal(first.length, 1);
  stopFirst();
  tokens.set(null);
  assert.equal(first.length, 1);
  assert.deepEqual(second, [first[0], null]);
  stopSecond();
  assert.equal(tokens.listenerCount(), 0);
  tokens.set("synthetic-token-c");
  assert.equal(second.length, 2);
  assert.notEqual(scope.getSnapshot(), first[0], "다시 읽으면 구독하지 않은 동안 바뀐 현재 토큰도 반영한다");
});

test("singleton API의 이전 회원 목록·상세 GET이 늦게 와도 새 store 자료와 섞이지 않는다", async (t) => {
  const tokens = tokenSource("synthetic-token-a");
  const oldList = deferred(); const oldDetail = deferred(); const signals = [];
  const api = createCatchApi((path, options) => {
    const list = path.startsWith("/catches?");
    if (tokens.get().token === "synthetic-token-a") {
      signals.push(options.signal);
      return list ? oldList.promise : oldDetail.promise;
    }
    return Promise.resolve(list ? page([item("b")]) : success(item("b")));
  });
  const mounted = mountStores(tokens, api);
  t.after(() => mounted.close());
  const previous = mounted.getStore();
  const listing = previous.refresh("repo-a");
  const detailing = previous.openDetail("a");
  tokens.set("synthetic-token-b");
  const current = mounted.getStore();
  assert.notEqual(current, previous);
  assert.ok(signals.every((signal) => signal.aborted));
  assert.deepEqual(current.getSnapshot().items, []);
  assert.equal(current.getSnapshot().detail, undefined);
  await current.refresh("repo-a");
  await current.openDetail("b");
  oldList.resolve(page([item("a")]));
  oldDetail.resolve(success(item("a")));
  await Promise.all([listing, detailing]);
  assert.deepEqual(current.getSnapshot().items, [item("b")]);
  assert.equal(current.getSnapshot().detail.catchId, "b");
  assert.deepEqual(previous.getSnapshot().items, []);
  assert.equal(previous.getSnapshot().detail, undefined);
});

test("회원 전환 전 보낸 PUT 성공은 새 store의 같은 Catch ID와 저장 상태를 바꾸지 않는다", async (t) => {
  const tokens = tokenSource("synthetic-token-a");
  const late = deferred(); let writes = 0;
  const api = createCatchApi(async (path, options) => {
    if (options.method === "PUT") { writes++; return late.promise; }
    const value = item("same-id", tokens.get().token === "synthetic-token-a" ? "회원 A 자료" : "회원 B 자료");
    return path.startsWith("/catches?") ? page([value]) : success(value);
  });
  const mounted = mountStores(tokens, api);
  t.after(() => mounted.close());
  const previous = mounted.getStore();
  await previous.openDetail("same-id");
  const saving = previous.update({ kind: "mismatch", mismatch: true });
  tokens.set("synthetic-token-b");
  const current = mounted.getStore();
  await current.refresh("repo-a");
  await current.openDetail("same-id");
  late.resolve(success({ ...item("same-id", "회원 A 자료"), mismatch: true }));
  await saving;
  await setImmediate();
  assert.equal(writes, 1);
  assert.deepEqual(current.getSnapshot().detail, item("same-id", "회원 B 자료"));
  assert.deepEqual(current.getSnapshot().items, [item("same-id", "회원 B 자료")]);
  assert.equal(current.getSnapshot().mutation, null);
  assert.equal(previous.getSnapshot().detail, undefined);
});

for (const code of ["AUTH_REQUIRED", "AUTH_INVALID"]) {
  test(`${code}의 토큰 해제 뒤 이전 store는 폐기되며 재로그인만으로 PUT을 재전송하지 않는다`, async (t) => {
    const tokens = tokenSource("synthetic-token-a");
    const rejected = deferred(); let writes = 0;
    const api = createCatchApi(async (path, options) => {
      if (options.method === "PUT") {
        writes++;
        return writes === 1 ? rejected.promise : success({ ...item("c"), mismatch: true });
      }
      return path.startsWith("/catches?") ? page([item("c")]) : success(item("c"));
    });
    const mounted = mountStores(tokens, api);
    t.after(() => mounted.close());
    const previous = mounted.getStore();
    await previous.openDetail("c");
    const saving = previous.update({ kind: "mismatch", mismatch: true });
    const unauthorized = await readApiResponse(Response.json({ code, message: "인증 필요" }, { status: 401 }));
    // 공통 API가 현재 회원의 401로 토큰을 지웠다는 입력만 전달한다. #185의 인증 판단을 복제하지 않는다.
    tokens.set(null);
    rejected.resolve(unauthorized);
    await saving;
    assert.equal(mounted.getStore(), null);
    assert.equal(previous.getSnapshot().detail, undefined);
    tokens.set("synthetic-token-relogin");
    const current = mounted.getStore();
    await current.refresh("repo-a");
    await current.openDetail("c");
    await setImmediate();
    assert.equal(writes, 1, "재로그인과 조회는 이전 PUT을 자동 재전송하지 않는다");
    assert.equal(current.getSnapshot().mutation, null);
    assert.equal(current.getSnapshot().detail.mismatch, false);
    await current.update({ kind: "mismatch", mismatch: true });
    assert.equal(writes, 2, "새 회원 화면에서 명시적으로 조작해야 다음 PUT을 보낸다");
    assert.equal(current.getSnapshot().detail.mismatch, true);
  });
}

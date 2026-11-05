import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createRecipientApi, readPublicCatch, readPublicCollection } from "../src/features/recipient/recipient-api.ts";
import { createGrantStore, GRANT_KEY_PREFIX, GRANT_MAX_LENGTH } from "../src/features/recipient/recipient-grants.ts";
import { createRecipientCatchStore, createRecipientCollectionStore } from "../src/features/recipient/recipient-store.ts";
import { generatedNotice, isGithubSourceUrl, missingDraftText, unlockMessage } from "../src/features/recipient/recipient-format.ts";

// #152 수신자 화면. 기대 결과는 #152 완료 기준, API 명세 「P — 수신자 API」, web 기능 설계 「수신 접근」,
// 공유 링크 흐름 초안 §4.4~4.8과 9/29(#150 grant)·10/8(제목 null·자동 생성 안내) 결정에서 가져온다.

const TOKEN = "tok_A";
const OTHER = "tok_B";
const PASSWORD = "secret-pass-1";

const profile = (patch = {}) => ({
  displayName: "홍길동", introduction: "소개", desiredRole: "백엔드", skills: ["TypeScript"],
  fieldSource: "SELF_REPORTED", githubAccountLogin: "hong", ...patch,
});
const catchItem = (id, patch = {}) => ({
  catchId: id,
  title: `제목 ${id}`,
  workFacts: [`사실 ${id}`],
  subjectContribution: "본인 커밋",
  evidence: [{ sourceUrl: `https://github.com/o/r/commit/${id}`, sourceRevision: "abc", representedFacts: ["파일 1개"], contributionScope: "본인", coverageLimits: ["의도는 알 수 없음"] }],
  draft: { status: "GENERATED", content: "설명" },
  ...patch,
});
const collection = (catches, nextCursor = null, profilePatch = {}) => ({ profile: profile(profilePatch), catches, page: { nextCursor } });
const ok = (data, status = 200) => ({ kind: "success", status, data });
const lookupFailed = { kind: "lookup-failed", status: null, code: "LOOKUP_FAILED" };
const apiError = (status, code, extra = {}) => ({ kind: "api-error", status, code, message: "안내", ...extra });
const unavailable = apiError(404, "LINK_UNAVAILABLE");
const passwordRequired = apiError(401, "LINK_PASSWORD_REQUIRED");
const passwordInvalid = apiError(401, "LINK_PASSWORD_INVALID");
const resourceUnavailable = apiError(404, "RESOURCE_UNAVAILABLE");
const serverError = apiError(500, "INTERNAL_ERROR");
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

/** 호출을 기록하고 큐에 넣은 응답을 순서대로 돌려주는 가짜 api.recipient. */
function fakeRecipient() {
  const calls = [];
  const queue = [];
  const recipient = (path, request) => {
    calls.push({ path, request });
    const next = queue.shift();
    if (!next) throw new Error(`응답이 준비되지 않은 호출: ${path}`);
    return typeof next === "function" ? next(request) : Promise.resolve(next);
  };
  return { calls, queue, recipient };
}

/** Storage 대역. `broken`이면 모든 접근이 예외를 던진다. */
function fakeStorage({ broken = false, failSet = false } = {}) {
  const map = new Map();
  return {
    map,
    getItem(key) { if (broken) throw new Error("blocked"); return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { if (broken || failSet) throw new Error("quota"); map.set(key, String(value)); },
    removeItem(key) { if (broken) throw new Error("blocked"); map.delete(key); },
  };
}

function setup({ storage = fakeStorage(), now } = {}) {
  const fake = fakeRecipient();
  const api = createRecipientApi(fake.recipient);
  const grants = createGrantStore(() => storage);
  let clock = 1_000_000;
  const time = now ?? (() => clock);
  const advance = (ms) => { clock += ms; };
  const collectionStore = (token = TOKEN) => createRecipientCollectionStore({ api, grants, token, now: time });
  const catchStore = (catchId, token = TOKEN) => createRecipientCatchStore({ api, grants, token, catchId, now: time });
  return { ...fake, api, grants, storage, advance, collectionStore, catchStore };
}

// ── 응답 모양 검사 ───────────────────────────────────────────────

test("주소: 토큰·Catch ID를 경로에 인코딩하고 limit·cursor만 쿼리로 보낸다. 비밀번호는 본문으로만, grant는 헤더로만 보낸다", async () => {
  const { api, calls, queue } = setup();
  queue.push(ok(collection([])), ok(collection([])), ok(catchItem("c/1")), ok({ grant: "g-1" }));
  await api.collection("t/1?x", null, null);
  await api.collection("t/1?x", "g-1", "cur 1");
  await api.catchDetail("t/1?x", "c/1", "g-1");
  await api.unlock("t/1?x", PASSWORD);
  assert.equal(calls[0].path, "/public/links/t%2F1%3Fx?limit=20");
  assert.equal(calls[0].request.linkGrant, undefined);
  assert.equal(calls[1].path, "/public/links/t%2F1%3Fx?limit=20&cursor=cur+1");
  assert.equal(calls[1].request.linkGrant, "g-1");
  assert.equal(calls[2].path, "/public/links/t%2F1%3Fx/catches/c%2F1");
  assert.equal(calls[3].path, "/public/links/t%2F1%3Fx/unlock");
  assert.deepEqual(calls[3].request.body, { password: PASSWORD });
  for (const call of calls) {
    assert.ok(!call.path.includes(PASSWORD) && !call.path.includes("g-1"), "비밀번호·grant가 주소에 없다");
    assert.equal(call.request.idempotencyKey, undefined);
  }
});

test("손상된 성공 응답·200이 아닌 성공·다른 Catch 응답은 성공이나 0건으로 바꾸지 않는다", async () => {
  const { api, queue } = setup();
  queue.push(
    ok({ profile: profile(), catches: "x", page: { nextCursor: null } }),
    ok(collection([catchItem("c1", { title: "" })])),
    ok(collection([]), 201),
    ok(catchItem("other")),
    ok({ grant: "" }),
    () => { throw new Error("network"); },
  );
  assert.equal((await api.collection(TOKEN, null, null)).kind, "lookup-failed");
  assert.equal((await api.collection(TOKEN, null, null)).kind, "lookup-failed", "빈 문자열 제목은 계약 위반(제목이 없으면 null)");
  assert.equal((await api.collection(TOKEN, null, null)).kind, "lookup-failed");
  assert.equal((await api.catchDetail(TOKEN, "c1", null)).kind, "lookup-failed");
  assert.equal((await api.unlock(TOKEN, PASSWORD)).kind, "lookup-failed");
  assert.equal((await api.collection(TOKEN, null, null)).kind, "lookup-failed");
});

test("제목·초안 null과 GitHub 계정 null을 그대로 받고, 계약 밖 필드(본인용 정보·내부 ID)는 화면 자료에 싣지 않는다", () => {
  const raw = collection([catchItem("c1", { title: null, draft: { status: "NOT_GENERATED", content: null }, reflection: { questions: ["본인용"] }, sourceRequestId: "r1" })], null, { githubAccountLogin: null, email: "x@y" });
  const data = readPublicCollection(raw);
  assert.ok(data);
  assert.equal(data.catches[0].title, null);
  assert.deepEqual(data.catches[0].draft, { status: "NOT_GENERATED", content: null });
  assert.equal(data.profile.githubAccountLogin, null);
  assert.equal("reflection" in data.catches[0], false);
  assert.equal("sourceRequestId" in data.catches[0], false);
  assert.equal("email" in data.profile, false);
  assert.equal(readPublicCatch({ ...catchItem("c2"), draft: { status: "DONE", content: null } }), null);
});

// ── grant 보관 ─────────────────────────────────────────────────

test("grant는 링크별로 sessionStorage에 따로 두고, 지우면 그 링크 것만 지운다", () => {
  const storage = fakeStorage();
  const grants = createGrantStore(() => storage);
  grants.set(TOKEN, "g-A");
  grants.set(OTHER, "g-B");
  assert.equal(storage.map.get(`${GRANT_KEY_PREFIX}${TOKEN}`), "g-A");
  assert.equal(grants.get(TOKEN), "g-A");
  assert.equal(grants.get(OTHER), "g-B");
  grants.remove(TOKEN);
  assert.equal(grants.get(TOKEN), null);
  assert.equal(grants.get(OTHER), "g-B");
});

test("손상된 저장값(빈 값·헤더에 실을 수 없는 문자·지나치게 긴 값)은 쓰지 않고 지운다", () => {
  const storage = fakeStorage();
  for (const bad of ["", "한글", "a b", "x".repeat(GRANT_MAX_LENGTH + 1)]) {
    // 페이지를 새로 열 때 저장소에 손상된 값이 들어 있는 경우
    storage.map.set(`${GRANT_KEY_PREFIX}${TOKEN}`, bad);
    const opened = createGrantStore(() => storage);
    assert.equal(opened.get(TOKEN), null);
    assert.equal(storage.map.has(`${GRANT_KEY_PREFIX}${TOKEN}`), false);
  }
  const grants = createGrantStore(() => storage);
  grants.set(TOKEN, "bad value");
  assert.equal(grants.get(TOKEN), null, "손상된 값은 보관하지 않는다");
});

test("저장소를 쓸 수 없거나 저장에 실패하면 이 화면의 메모리에만 두고, 영속 저장소로 옮기지 않는다", () => {
  const broken = createGrantStore(() => fakeStorage({ broken: true }));
  broken.set(TOKEN, "g-A");
  assert.equal(broken.get(TOKEN), "g-A");
  assert.equal(broken.get(OTHER), null);
  broken.remove(TOKEN);
  assert.equal(broken.get(TOKEN), null);

  const throwing = createGrantStore(() => { throw new Error("SecurityError"); });
  throwing.set(TOKEN, "g-A");
  assert.equal(throwing.get(TOKEN), "g-A");

  const full = fakeStorage({ failSet: true });
  const quota = createGrantStore(() => full);
  quota.set(TOKEN, "g-A");
  assert.equal(full.map.size, 0);
  assert.equal(quota.get(TOKEN), "g-A");
});

// ── 저장소 오류에서의 grant(검토 지적: 읽기는 되고 쓰기·지우기가 실패하는 저장소) ─────
// 저장소 오류 주입 시험이다. 서버 판정은 가짜 api.recipient의 응답으로 대신한다.

/** 이전 grant가 남은 Storage 대역. `failWrite`면 setItem·removeItem만 실패하고, `broken`이면 모든 접근이 실패한다. 실행 중 바꿀 수 있다. */
function staleStorage(entries = {}) {
  const map = new Map(Object.entries(entries).map(([token, grant]) => [`${GRANT_KEY_PREFIX}${token}`, grant]));
  const flags = { failWrite: false, broken: false };
  return {
    map,
    flags,
    getItem(key) { if (flags.broken) throw new Error("blocked"); return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { if (flags.broken || flags.failWrite) throw new Error("quota"); map.set(key, String(value)); },
    removeItem(key) { if (flags.broken || flags.failWrite) throw new Error("blocked"); map.delete(key); },
  };
}

test("저장소 쓰기·지우기가 실패해도: 거부된 이전 grant 대신 비밀번호 확인으로 받은 새 grant로 목록·상세를 읽는다", async () => {
  const storage = staleStorage({ [TOKEN]: "g-old" });
  storage.flags.failWrite = true;
  const { queue, calls, collectionStore, catchStore } = setup({ storage });
  queue.push(passwordRequired, ok({ grant: "g-new" }), ok(collection([catchItem("c1")])));
  const store = collectionStore();
  await store.load();
  assert.equal(calls[0].request.linkGrant, "g-old");
  assert.equal(store.getSnapshot().unlock.reentry, true);
  assert.equal(await store.unlock(PASSWORD), "granted");
  assert.equal(calls[2].request.linkGrant, "g-new", "비밀번호 확인 뒤 조회는 새 grant");
  assert.equal(store.getSnapshot().view, "ready", "비밀번호 입력으로 되돌아가지 않는다");

  queue.push(ok(catchItem("c1")));
  const detail = catchStore("c1");
  await detail.load();
  assert.equal(calls[3].request.linkGrant, "g-new", "같은 탭의 다른 화면도 새 grant");
  assert.equal(storage.map.get(`${GRANT_KEY_PREFIX}${TOKEN}`), "g-old", "주입: 저장소에는 이전 값이 남아 있다");
});

test("저장소 지우기가 실패해도: 링크 불가로 지운 grant는 같은 실행 중 다시 보내지 않는다", async () => {
  const storage = staleStorage({ [TOKEN]: "g-old" });
  storage.flags.failWrite = true;
  const { queue, calls, collectionStore, catchStore } = setup({ storage });
  queue.push(unavailable, passwordRequired);
  const store = collectionStore();
  await store.load();
  assert.equal(calls[0].request.linkGrant, "g-old");
  assert.deepEqual(store.getSnapshot(), { view: "unavailable" });

  const detail = catchStore("c1");
  await detail.load();
  assert.equal(calls[1].request.linkGrant, undefined, "지운 grant가 되살아나지 않는다");
  assert.equal(detail.getSnapshot().unlock.reentry, false);
});

test("저장소 접근이 실패했다가 복구돼도 저장소의 이전 값이 최신 grant·삭제 상태를 덮지 않는다. 다른 링크는 영향이 없다", async () => {
  const storage = staleStorage({ [TOKEN]: "g-old", [OTHER]: "g-B" });
  const { queue, calls, collectionStore } = setup({ storage });
  storage.flags.broken = true;
  queue.push(passwordRequired, ok({ grant: "g-new" }), ok(collection([catchItem("c1")])));
  const first = collectionStore();
  await first.load();
  assert.equal(calls[0].request.linkGrant, undefined, "읽을 수 없으면 grant 없이 요청");
  await first.unlock(PASSWORD);
  assert.equal(calls[2].request.linkGrant, "g-new");

  storage.flags.broken = false; // 복구: 저장소에는 이전 값이 그대로 있다
  queue.push(ok(collection([catchItem("c1")])));
  const second = collectionStore();
  await second.load();
  assert.equal(calls[3].request.linkGrant, "g-new", "복구 뒤에도 최신 grant");

  storage.flags.broken = true;
  queue.push(unavailable);
  const third = collectionStore();
  await third.load();
  storage.flags.broken = false;
  queue.push(passwordRequired);
  const fourth = collectionStore();
  await fourth.load();
  assert.equal(calls[5].request.linkGrant, undefined, "복구 뒤에도 삭제 상태 유지");

  queue.push(ok(collection([])));
  const other = collectionStore(OTHER);
  await other.load();
  assert.equal(calls[6].request.linkGrant, "g-B", "다른 링크의 저장된 grant는 그대로 쓴다");
});

test("저장소 오류 중 상세만 불가는 새 grant를 유지하고, 링크 전체 불가는 이전 값까지 다시 쓰지 않는다", async () => {
  const storage = staleStorage({ [TOKEN]: "g-old" });
  storage.flags.failWrite = true;
  const { queue, calls, catchStore } = setup({ storage });
  queue.push(passwordRequired, ok({ grant: "g-new" }), ok(catchItem("c1")));
  const store = catchStore("c1");
  await store.load();
  await store.unlock(PASSWORD);
  assert.equal(calls[2].request.linkGrant, "g-new");

  queue.push(resourceUnavailable, ok(catchItem("c1")));
  const hidden = catchStore("c2");
  await hidden.load();
  assert.deepEqual(hidden.getSnapshot(), { view: "resource-unavailable" });
  const back = catchStore("c1");
  await back.load();
  assert.equal(calls[4].request.linkGrant, "g-new", "상세만 불가 뒤에도 새 grant");

  queue.push(unavailable, passwordRequired);
  const stopped = catchStore("c1");
  await stopped.load();
  const again = catchStore("c1");
  await again.load();
  assert.equal(calls[6].request.linkGrant, undefined, "링크 불가 뒤에는 새 값도 이전 값도 보내지 않는다");
});

test("저장만 실패(용량)하면: 이 실행에서는 새 grant를 쓰고, 남아 있던 이전 값은 지워 새로 고친 뒤에도 이전 grant를 보내지 않는다", async () => {
  const storage = staleStorage({ [TOKEN]: "g-old" });
  const { api, queue, calls, collectionStore } = setup({ storage });
  queue.push(passwordRequired, ok({ grant: "g-new" }), ok(collection([])));
  const store = collectionStore();
  storage.flags.failWrite = true; // 401 때 이전 값 지우기 실패
  await store.load();
  storage.flags.failWrite = false;
  storage.setItem = () => { throw new Error("quota"); }; // 지우기는 되고 저장만 실패
  await store.unlock(PASSWORD);
  assert.equal(calls[2].request.linkGrant, "g-new");

  queue.push(passwordRequired);
  const after = createRecipientCollectionStore({ api, grants: createGrantStore(() => storage), token: TOKEN });
  await after.load();
  assert.equal(calls[3].request.linkGrant, undefined, "새로 고친 뒤: 새 grant는 남지 않았고 이전 grant도 보내지 않는다(다시 입력)");
});

test("정상 저장소: 만료·무효 grant 거부 → 다시 입력 → 새 grant를 sessionStorage에 두고, 새로 고친 뒤에도 재사용한다", async () => {
  const storage = staleStorage({ [TOKEN]: "g-expired" });
  const { api, queue, calls, collectionStore } = setup({ storage });
  queue.push(passwordRequired, ok({ grant: "g-fresh" }), ok(collection([catchItem("c1")])));
  const store = collectionStore();
  await store.load();
  assert.equal(calls[0].request.linkGrant, "g-expired");
  assert.equal(store.getSnapshot().unlock.reentry, true);
  assert.equal(storage.map.has(`${GRANT_KEY_PREFIX}${TOKEN}`), false, "거부된 grant는 저장소에서도 지운다");
  await store.unlock(PASSWORD);
  assert.equal(calls[2].request.linkGrant, "g-fresh");
  assert.equal(store.getSnapshot().view, "ready");
  assert.equal(storage.map.get(`${GRANT_KEY_PREFIX}${TOKEN}`), "g-fresh");

  // 새로 고침: 메모리는 사라지고 같은 탭의 sessionStorage만 남는다.
  const reloaded = createGrantStore(() => storage);
  queue.push(ok(collection([catchItem("c1")])));
  const after = createRecipientCollectionStore({ api, grants: reloaded, token: TOKEN });
  await after.load();
  assert.equal(calls[3].request.linkGrant, "g-fresh", "새로 고친 뒤에도 재사용");
});

// ── 목록: 첫 진입·접근 분기 ─────────────────────────────────────

test("첫 진입: 불러오는 중 → 프로필·목록. 정상 0건은 빈 목록이고 조회 실패(500·통신 실패)와 다르다", async () => {
  const { queue, collectionStore } = setup();
  const pending = deferred();
  queue.push(() => pending.promise);
  const store = collectionStore();
  const loading = store.load();
  assert.equal(store.getSnapshot().view, "loading");
  pending.resolve(ok(collection([])));
  await loading;
  const ready = store.getSnapshot();
  assert.equal(ready.view, "ready");
  assert.equal(ready.catches.length, 0);

  for (const failure of [serverError, lookupFailed, apiError(400, "INVALID_REQUEST"), apiError(403, "SOMETHING")]) {
    const fresh = collectionStore();
    queue.push(failure);
    await fresh.load();
    assert.equal(fresh.getSnapshot().view, "failed", `${failure.code}는 조회 실패`);
  }
});

test("링크 불가 404는 사유 없이 공통 화면이고, 받아 둔 grant를 지운다. 다른 링크의 grant는 그대로다", async () => {
  const { queue, grants, collectionStore } = setup();
  grants.set(TOKEN, "g-A");
  grants.set(OTHER, "g-B");
  queue.push(unavailable);
  const store = collectionStore();
  await store.load();
  assert.deepEqual(store.getSnapshot(), { view: "unavailable" });
  assert.equal(grants.get(TOKEN), null);
  assert.equal(grants.get(OTHER), "g-B");
});

test("비밀번호 401은 회원 로그인 이동 없이 비밀번호 입력으로 간다. 받아 둔 grant가 거부되면 지우고 다시 입력을 안내한다", async () => {
  const { queue, calls, grants, collectionStore } = setup();
  queue.push(passwordRequired);
  const first = collectionStore();
  await first.load();
  assert.equal(first.getSnapshot().view, "password");
  assert.equal(first.getSnapshot().unlock.reentry, false);
  assert.equal(calls[0].request.linkGrant, undefined);

  grants.set(TOKEN, "expired-grant");
  queue.push(passwordRequired);
  const again = collectionStore();
  await again.load();
  assert.equal(calls[1].request.linkGrant, "expired-grant");
  assert.equal(again.getSnapshot().view, "password");
  assert.equal(again.getSnapshot().unlock.reentry, true);
  assert.equal(grants.get(TOKEN), null);
});

// ── 비밀번호 확인 ───────────────────────────────────────────────

test("비밀번호 확인 성공: 이 링크에만 grant를 두고 grant로 목록을 읽는다. 다른 링크 요청에는 그 grant를 쓰지 않는다", async () => {
  const { queue, calls, grants, collectionStore } = setup();
  queue.push(passwordRequired, ok({ grant: "g-A" }), ok(collection([catchItem("c1")])));
  const store = collectionStore();
  await store.load();
  assert.equal(await store.unlock(PASSWORD), "granted");
  assert.equal(grants.get(TOKEN), "g-A");
  assert.equal(calls[2].request.linkGrant, "g-A");
  assert.equal(store.getSnapshot().view, "ready");

  queue.push(passwordRequired);
  const other = collectionStore(OTHER);
  await other.load();
  assert.equal(calls[3].request.linkGrant, undefined, "다른 링크에는 이 링크의 grant를 보내지 않는다");
  assert.equal(other.getSnapshot().view, "password");
});

test("빈 비밀번호는 보내지 않고 안내한다. 확인 중에는 다시 보내지 않는다", async () => {
  const { queue, calls, collectionStore } = setup();
  queue.push(passwordRequired);
  const store = collectionStore();
  await store.load();
  assert.equal(await store.unlock(""), "empty");
  assert.equal(calls.length, 1);
  assert.equal(store.getSnapshot().unlock.phase, "empty");

  const pending = deferred();
  queue.push(() => pending.promise);
  const first = store.unlock(PASSWORD);
  assert.equal(store.getSnapshot().unlock.phase, "submitting");
  assert.equal(await store.unlock(PASSWORD), "ignored");
  assert.equal(calls.length, 2, "확인 중 반복 제출은 요청하지 않는다");
  pending.resolve(passwordInvalid);
  assert.equal(await first, "invalid");
});

test("비밀번호 오류는 확인된 불일치(401 INVALID)에만 쓰고, 통신 실패·500·400은 확인 실패로 둔다", async () => {
  const { queue, collectionStore } = setup();
  queue.push(passwordRequired);
  const store = collectionStore();
  await store.load();
  queue.push(passwordInvalid);
  assert.equal(await store.unlock("wrong"), "invalid");
  assert.equal(store.getSnapshot().unlock.phase, "invalid");
  assert.equal(unlockMessage(store.getSnapshot().unlock, 0).text, "비밀번호가 맞지 않습니다.");
  for (const failure of [lookupFailed, serverError, apiError(400, "INVALID_REQUEST")]) {
    queue.push(failure);
    assert.equal(await store.unlock(PASSWORD), "failed");
    const message = unlockMessage(store.getSnapshot().unlock, 0);
    assert.notEqual(message.text, "비밀번호가 맞지 않습니다.");
  }
});

test("시도 제한 429: 남은 시간 동안 보내지 않고, 시간이 지나도 자동으로 다시 보내지 않으며, 지난 뒤 누르면 보낸다", async () => {
  const { queue, calls, advance, collectionStore } = setup();
  queue.push(passwordRequired);
  const store = collectionStore();
  await store.load();
  queue.push({ ...apiError(429, "LINK_UNLOCK_LIMITED"), retryAfterSeconds: 90 });
  assert.equal(await store.unlock(PASSWORD), "limited");
  const limited = store.getSnapshot().unlock;
  assert.equal(limited.phase, "limited");
  assert.equal(store.retryWaitSeconds(), 90);
  assert.match(unlockMessage(limited, store.retryWaitSeconds()).text, /90초 뒤/);
  assert.notEqual(unlockMessage(limited, 90).text, "비밀번호가 맞지 않습니다.", "차단을 비밀번호 오류로 표시하지 않는다");
  assert.equal(await store.unlock(PASSWORD), "ignored");
  advance(89_500);
  assert.equal(store.retryWaitSeconds(), 1, "남은 초는 올림");
  assert.equal(await store.unlock(PASSWORD), "ignored");
  assert.equal(calls.length, 2);
  advance(1_000);
  assert.equal(store.retryWaitSeconds(), 0);
  await new Promise((done) => setTimeout(done, 5));
  assert.equal(calls.length, 2, "기한이 지나도 자동 재전송 없음");
  queue.push(ok({ grant: "g-A" }), ok(collection([])));
  assert.equal(await store.unlock(PASSWORD), "granted");
  assert.equal(calls.length, 4);
});

test("Retry-After가 없거나 형식이 틀린 429는 남은 시간을 추정하지 않고, 사용자가 누를 때 보낸다", async () => {
  const { queue, calls, collectionStore } = setup();
  queue.push(passwordRequired);
  const store = collectionStore();
  await store.load();
  queue.push(apiError(429, "LINK_UNLOCK_LIMITED"));
  assert.equal(await store.unlock(PASSWORD), "limited");
  assert.equal(store.getSnapshot().unlock.retryAt, null);
  assert.equal(store.retryWaitSeconds(), 0);
  assert.match(unlockMessage(store.getSnapshot().unlock, 0).text, /잠시 뒤/);
  queue.push(passwordInvalid);
  assert.equal(await store.unlock(PASSWORD), "invalid");
  assert.equal(calls.length, 3);
});

test("비밀번호 확인 중 링크가 불가해지면(404) 공통 화면으로 바꾸고 grant를 남기지 않는다", async () => {
  const { queue, grants, collectionStore } = setup();
  queue.push(passwordRequired, unavailable);
  const store = collectionStore();
  await store.load();
  assert.equal(await store.unlock(PASSWORD), "unavailable");
  assert.deepEqual(store.getSnapshot(), { view: "unavailable" });
  assert.equal(grants.get(TOKEN), null);
});

// ── 목록: 다음 페이지·다시 조회·접근 조건 변경 ───────────────────

test("다음 페이지는 grant를 실어 이어 붙이고 중복을 뺀다. 실패하면 받은 목록을 두고 다시 시도할 수 있다", async () => {
  const { queue, calls, grants, collectionStore } = setup();
  grants.set(TOKEN, "g-A");
  queue.push(ok(collection([catchItem("c1"), catchItem("c2")], "cur-1")));
  const store = collectionStore();
  await store.load();
  queue.push(serverError);
  await store.loadMore();
  let state = store.getSnapshot();
  assert.equal(state.more, "failed");
  assert.deepEqual(state.catches.map((item) => item.catchId), ["c1", "c2"]);
  queue.push(ok(collection([catchItem("c2"), catchItem("c3")], null)));
  await store.loadMore();
  state = store.getSnapshot();
  assert.equal(calls[2].path, "/public/links/tok_A?limit=20&cursor=cur-1");
  assert.equal(calls[2].request.linkGrant, "g-A");
  assert.deepEqual(state.catches.map((item) => item.catchId), ["c1", "c2", "c3"]);
  assert.equal(state.nextCursor, null);
  assert.equal(state.more, "idle");
});

test("다음 페이지에서 링크 불가·비밀번호 필요가 확정되면 표시하던 프로필·목록을 지운다", async () => {
  const { queue, grants, collectionStore } = setup();
  grants.set(TOKEN, "g-A");
  queue.push(ok(collection([catchItem("c1")], "cur-1")), unavailable);
  const stopped = collectionStore();
  await stopped.load();
  await stopped.loadMore();
  assert.deepEqual(stopped.getSnapshot(), { view: "unavailable" });

  grants.set(TOKEN, "g-A");
  queue.push(ok(collection([catchItem("c1")], "cur-1")), passwordRequired);
  const expired = collectionStore();
  await expired.load();
  await expired.loadMore();
  assert.equal(expired.getSnapshot().view, "password");
  assert.equal("catches" in expired.getSnapshot(), false);
  assert.equal(grants.get(TOKEN), null);
});

test("다시 조회: 실패는 같은 링크의 이전 화면을 유지하고 알린다. 확정 거부는 이전 자료를 지운다. 숨긴 Catch는 다음 조회부터 빠진다", async () => {
  const { queue, collectionStore } = setup();
  queue.push(ok(collection([catchItem("c1"), catchItem("c2")])));
  const store = collectionStore();
  await store.load();
  const pending = deferred();
  queue.push(() => pending.promise);
  const refreshing = store.load();
  assert.equal(store.getSnapshot().refreshing, true);
  assert.equal(store.getSnapshot().catches.length, 2, "다시 조회 중에도 이전 화면 유지");
  pending.resolve(lookupFailed);
  await refreshing;
  assert.equal(store.getSnapshot().refreshFailed, true);
  assert.equal(store.getSnapshot().catches.length, 2);

  queue.push(ok(collection([catchItem("c1")])));
  await store.load();
  assert.deepEqual(store.getSnapshot().catches.map((item) => item.catchId), ["c1"], "숨긴 c2는 다음 조회에서 빠진다");
  assert.equal(store.getSnapshot().refreshFailed, false);

  queue.push(unavailable);
  await store.load();
  assert.deepEqual(store.getSnapshot(), { view: "unavailable" });
});

test("늦게 도착한 응답: 다시 조회한 뒤의 이전 응답, 화면 해제 뒤의 응답, 다시 조회로 끊긴 다음 페이지 응답은 버린다", async () => {
  const { queue, collectionStore } = setup();
  const old = deferred();
  queue.push(() => old.promise, ok(collection([catchItem("new")])));
  const store = collectionStore();
  const first = store.load();
  await store.load();
  old.resolve(ok(collection([catchItem("old")])));
  await first;
  assert.deepEqual(store.getSnapshot().catches.map((item) => item.catchId), ["new"]);

  const late = deferred();
  queue.push(() => late.promise);
  const disposed = collectionStore();
  const pending = disposed.load();
  disposed.dispose();
  late.resolve(ok(collection([catchItem("late")])));
  await pending;
  assert.equal(disposed.getSnapshot().view, "loading");

  queue.push(ok(collection([catchItem("c1")], "cur-1")));
  const paged = collectionStore();
  await paged.load();
  const more = deferred();
  queue.push(() => more.promise, ok(collection([catchItem("fresh")], null)));
  const loadingMore = paged.loadMore();
  await paged.load();
  more.resolve(ok(collection([catchItem("stale-page")], null)));
  await loadingMore;
  assert.deepEqual(paged.getSnapshot().catches.map((item) => item.catchId), ["fresh"]);
});

test("화면 해제 뒤 도착한 비밀번호 확인 응답은 grant를 남기지 않는다", async () => {
  const { queue, grants, collectionStore } = setup();
  queue.push(passwordRequired);
  const store = collectionStore();
  await store.load();
  const pending = deferred();
  queue.push(() => pending.promise);
  const unlocking = store.unlock(PASSWORD);
  store.dispose();
  pending.resolve(ok({ grant: "g-late" }));
  assert.equal(await unlocking, "ignored");
  assert.equal(grants.get(TOKEN), null);
});

// ── 상세 ───────────────────────────────────────────────────────

test("상세: 직접 진입도 grant로 판정한다. 상세만 불가(RESOURCE_UNAVAILABLE)와 링크 전체 불가(LINK_UNAVAILABLE)를 나눈다", async () => {
  const { queue, calls, grants, catchStore } = setup();
  grants.set(TOKEN, "g-A");
  queue.push(ok(catchItem("c1")));
  const store = catchStore("c1");
  await store.load();
  assert.equal(calls[0].request.linkGrant, "g-A");
  assert.equal(store.getSnapshot().view, "ready");

  queue.push(resourceUnavailable);
  const hidden = catchStore("c2");
  await hidden.load();
  assert.deepEqual(hidden.getSnapshot(), { view: "resource-unavailable" });
  assert.equal(grants.get(TOKEN), "g-A", "상세만 불가하면 링크 grant는 그대로");

  queue.push(unavailable);
  const stopped = catchStore("c1");
  await stopped.load();
  assert.deepEqual(stopped.getSnapshot(), { view: "unavailable" });
  assert.equal(grants.get(TOKEN), null);
});

test("상세: 비밀번호 필요면 입력 뒤 같은 상세를 다시 읽는다. 조회 실패는 숨김·없음으로 바꾸지 않는다", async () => {
  const { queue, calls, catchStore } = setup();
  queue.push(passwordRequired, ok({ grant: "g-A" }), ok(catchItem("c1")));
  const store = catchStore("c1");
  await store.load();
  assert.equal(store.getSnapshot().view, "password");
  await store.unlock(PASSWORD);
  assert.equal(calls[2].path, "/public/links/tok_A/catches/c1");
  assert.equal(calls[2].request.linkGrant, "g-A");
  assert.equal(store.getSnapshot().view, "ready");

  queue.push(serverError);
  const failing = catchStore("c9");
  await failing.load();
  assert.equal(failing.getSnapshot().view, "failed");

  queue.push(lookupFailed);
  await store.load();
  assert.equal(store.getSnapshot().view, "ready", "같은 Catch를 다시 읽다 실패하면 이전 화면 유지");
  assert.equal(store.getSnapshot().refreshFailed, true);
  queue.push(resourceUnavailable);
  await store.load();
  assert.deepEqual(store.getSnapshot(), { view: "resource-unavailable" }, "숨김이 확정되면 이전 상세를 지운다");
});

test("상세: 다른 Catch로 바꾼 뒤 늦게 온 이전 응답은 새 화면을 덮지 않는다(화면은 Catch마다 새 상태)", async () => {
  const { queue, catchStore } = setup();
  const late = deferred();
  queue.push(() => late.promise, ok(catchItem("c2")));
  const first = catchStore("c1");
  const pending = first.load();
  first.dispose();
  const second = catchStore("c2");
  await second.load();
  late.resolve(ok(catchItem("c1")));
  await pending;
  assert.equal(second.getSnapshot().item.catchId, "c2");
  assert.equal(first.getSnapshot().view, "loading");
});

// ── 표시 문구·링크 ─────────────────────────────────────────────

test("S14: 자동 생성 안내는 목록에 늘 두 절이고, 상세는 있는 것만 가리킨다. 없는 초안을 채우지 않는다", () => {
  // CR1 BR6.2: 제목은 GitHub 기록의 글(PR 제목·커밋 첫 줄)이거나 CatchU가 만든 글이다.
  assert.equal(
    generatedNotice(),
    "제목은 GitHub 기록의 글이거나 CatchU가 만든 글이고, 설명은 CatchU가 GitHub 기록에서 자동으로 만들었습니다",
  );
  const both = readPublicCatch(catchItem("c0"));
  const noTitle = readPublicCatch(catchItem("c1", { title: null }));
  const noDraft = readPublicCatch(catchItem("c2", { draft: { status: "FAILED", content: null } }));
  const neither = readPublicCatch(catchItem("c3", { title: null, draft: { status: "NOT_GENERATED", content: null } }));
  assert.equal(generatedNotice(both), generatedNotice());
  assert.equal(generatedNotice(noTitle), "설명은 CatchU가 GitHub 기록에서 자동으로 만들었습니다");
  assert.equal(generatedNotice(noDraft), "제목은 GitHub 기록의 글이거나 CatchU가 만든 글입니다");
  assert.equal(generatedNotice(neither), null);
  assert.match(missingDraftText(noDraft), /생성하지 못했습니다/);
  assert.equal(missingDraftText(neither), "생성된 설명 초안이 없습니다.");
});

test("S13: 받은 사람 목록 카드 제목에 2줄 말줄임 클래스를 달고 글은 전체 제목이다. 상세 제목은 줄이지 않는다", () => {
  // 화면 컴포넌트는 store·라우팅을 함께 불러와 여기서 그리지 않는다. 카드 제목 요소와 CSS 규칙을 원문으로 본다.
  // 2줄 말줄임 모양 자체는 브라우저에서 확인한다.
  const screen = readFileSync(new URL("../src/features/recipient/recipient-screen.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/features/recipient/recipient.module.css", import.meta.url), "utf8");
  const card = screen.match(/function CatchCard[\s\S]*?\n}\n/)?.[0] ?? assert.fail("목록 카드 컴포넌트가 있어야 한다");
  assert.match(card, /<h3 id=\{labelId\} className=\{`\$\{styles\.cardTitle\} \$\{styles\.titleClamp\}`\}>\{item\.title\}<\/h3>/);
  // 상세 보기 링크의 접근 이름에도 전체 제목이 든다.
  assert.match(card, /aria-label=\{item\.title !== null \? `\$\{item\.title\} 상세 보기`/);
  assert.match(css, /\.titleClamp\s*\{[^}]*-webkit-line-clamp:\s*2;[^}]*overflow:\s*hidden;/);
  const detail = screen.match(/<h2 className=\{styles\.subtitle\}>\{item\.title\}<\/h2>/);
  assert.ok(detail, "상세 제목은 줄임 클래스 없이 전체를 그린다");
  // 제목은 글자 노드로만 그린다(HTML 삽입 없음).
  assert.doesNotMatch(screen, /dangerouslySetInnerHTML/);
});

test("옛 꼴 작업 사실(SHA가 든 첫 줄, 다른 계정 문장)도 받은 그대로 화면 자료가 된다", () => {
  const oldFacts = ["PR·병합에 속하지 않은 본인 커밋 0123456789ab", "이 PR 커밋 목록에 연동 계정이 작성자로 기록되지 않은 커밋이 있다"];
  const item = readPublicCatch(catchItem("c9", { workFacts: oldFacts }));
  assert.deepEqual(item.workFacts, oldFacts);
});

test("근거 원문은 GitHub https 주소만 링크로 연다", () => {
  assert.equal(isGithubSourceUrl("https://github.com/o/r/pull/1"), true);
  for (const value of ["http://github.com/o/r", "https://evil.example/o", "javascript:alert(1)", "https://user:pw@github.com/o", "https://github.com.evil.example/x", "not a url"]) {
    assert.equal(isGithubSourceUrl(value), false, value);
  }
});

test("비밀번호·grant 원문은 상태·로그에 남지 않는다", async () => {
  const { queue, collectionStore } = setup();
  const logged = [];
  const original = { log: console.log, info: console.info, warn: console.warn, error: console.error, debug: console.debug };
  for (const name of Object.keys(original)) console[name] = (...args) => { logged.push(args.join(" ")); };
  try {
    queue.push(passwordRequired, passwordInvalid, ok({ grant: "grant-secret" }), ok(collection([])));
    const store = collectionStore();
    await store.load();
    await store.unlock(PASSWORD);
    assert.ok(!JSON.stringify(store.getSnapshot()).includes(PASSWORD));
    await store.unlock(PASSWORD);
    assert.ok(!JSON.stringify(store.getSnapshot()).includes("grant-secret"));
  } finally {
    Object.assign(console, original);
  }
  assert.deepEqual(logged, []);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAuthStore } from '../src/lib/auth-state.ts';
import { createAuthSession, createSessionLock } from '../src/lib/auth-session.ts';
import { createLoginMarker, LOGIN_MARKER_KEY } from '../src/lib/auth-login-marker.ts';
import { createFetchRefreshTransport } from '../src/lib/auth-refresh.ts';
import { createFetchLogoutTransport } from '../src/lib/auth-logout.ts';
import { createAuthApi, memberCallBlock, memberMutationOutcome, toClientResult } from '../src/lib/auth-api.ts';
import { readProfile, saveProfileDetailed } from '../src/features/profile/profile-api.ts';
import { createCatchApi } from '../src/features/assets/catch-api.ts';
import { createAssetsStore } from '../src/features/assets/assets-store.ts';
import { createAssetsSessionScope } from '../src/features/assets/assets-session-scope.ts';
import { previewCatches } from '../src/features/assets/fixtures.ts';
import { bindLegacyTokenSignal, createSessionScope } from '../src/lib/auth-scope.ts';
import { createAccessTokenStore } from '../src/lib/access-token.ts';

const BASE = 'http://127.0.0.1:3001';
const tick = () => new Promise((resolve) => setImmediate(resolve));
/** 감지 뒤 예약된 복원(잠금·대역 응답)이 끝날 때까지 기다린다. */
const settle = async () => { for (let i = 0; i < 20; i += 1) await tick(); };

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

/** `localStorage` 대역. 여러 탭이 한 인스턴스를 쓰면 같은 출처의 저장소를 공유한다. 쓰기 실패를 켤 수 있다. */
function fakeStorage() {
  const map = new Map();
  const storage = {
    map, failWrite: false,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { if (storage.failWrite) throw new Error('quota'); map.set(key, String(value)); },
  };
  return storage;
}

/** Web Locks 대역(4-1 시험과 같은 규칙). 실제 브라우저 Web Locks 검증이 아니다. */
function fakeLockManager() {
  const queues = new Map();
  return {
    request(name, options, callback) {
      return new Promise((resolve, reject) => {
        const queue = queues.get(name) ?? [];
        queues.set(name, queue);
        const grant = () => queueMicrotask(async () => {
          try { resolve(await callback({ name, mode: options.mode })); } catch (error) { reject(error); } finally {
            queue.shift();
            if (queue.length) queue[0]();
          }
        });
        queue.push(grant);
        if (queue.length === 1) grant();
      });
    },
  };
}

/**
 * 서버·쿠키 대역. 실제 `Response`를 돌려주는 fetch 하나로 개발 로그인·갱신·로그아웃·보호 API를 흉내 낸다.
 * Refresh 쿠키는 `credentials: "include"`일 때만 보내고 받는다. 실제 서버·브라우저 검증이 아니다.
 */
/** 합성 Catch(공개 전, 확인 완료). 저장 대역이 쓴다. */
const catchItem = () => ({ ...previewCatches[0], catchId: 'c1', repositoryId: 'repo-a', visibility: 'PRIVATE', mismatch: false,
  restriction: 'NONE', confirmation: { workFactsConfirmed: true, contributionConfirmed: true } });

function fakeServer() {
  let serial = 0;
  const refreshTokens = new Map();
  const accessTokens = new Map();
  const sessions = new Map();
  const holds = new Map();
  const failures = new Set();
  const state = { jar: null, log: [], devLogin: 'ok', mutations: 0 };
  const open = (member) => { const sid = 'S' + (sessions.size + 1); sessions.set(sid, { member, revoked: false }); return sid; };
  const mintRefresh = (sid) => { const t = 'R' + ++serial; refreshTokens.set(t, { sid, used: false }); return t; };
  const mintAccess = (sid) => { const t = `A${++serial}-${sessions.get(sid).member}`; accessTokens.set(t, { sid, expired: false }); return t; };
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const invalid = () => json(401, { code: 'AUTH_INVALID', message: '인증이 유효하지 않습니다.' });
  const memberOf = (init) => {
    const header = init.headers?.Authorization;
    const record = typeof header === 'string' && header.startsWith('Bearer ') ? accessTokens.get(header.slice(7)) : undefined;
    return record && !record.expired && !sessions.get(record.sid).revoked ? sessions.get(record.sid).member : null;
  };

  async function handle(entry, init, include) {
    const cookie = include ? state.jar : null;
    if (entry === 'POST /auth/dev-login') {
      // 실제 API: 가드의 코드 없는 403은 예외 필터가 403 INTERNAL_ERROR로 응답한다(api-exception.filter.ts). 처리 전 거부.
      if (state.devLogin === 'forbidden') return { response: json(403, { code: 'INTERNAL_ERROR', message: '서버 오류' }) };
      if (state.devLogin === 'invalid') return { response: json(400, { code: 'VALIDATION_FAILED', message: '검증 실패' }) };
      // 처리 중 오류(쿠키 없음). 화면은 처리 여부를 알 수 없다.
      if (state.devLogin === 'server-error') return { response: json(500, { code: 'INTERNAL_ERROR', message: '서버 오류' }) };
      const { memberId } = JSON.parse(init.body);
      const sid = open(memberId);
      const refresh = mintRefresh(sid);
      const body = state.devLogin === 'malformed'
        ? new Response('{', { status: 200, headers: { 'Content-Type': 'application/json' } })
        : json(200, { accessToken: mintAccess(sid), tokenType: 'Bearer', expiresIn: 900 });
      return { response: body, setCookie: refresh };
    }
    if (entry === 'POST /auth/refresh') {
      const record = cookie ? refreshTokens.get(cookie) : undefined;
      if (record && !record.used && !sessions.get(record.sid).revoked) {
        record.used = true;
        return { response: json(200, { accessToken: mintAccess(record.sid), tokenType: 'Bearer', expiresIn: 900 }), setCookie: mintRefresh(record.sid) };
      }
      if (record?.used) sessions.get(record.sid).revoked = true; // 재사용: 그 세션만 폐기
      return { response: invalid(), setCookie: null };
    }
    if (entry === 'POST /auth/logout') {
      const record = cookie ? refreshTokens.get(cookie) : undefined;
      if (record) sessions.get(record.sid).revoked = true;
      return { response: new Response(null, { status: 204 }), setCookie: null };
    }
    const member = memberOf(init);
    if (!member) return { response: invalid() };
    if (entry === 'GET /me') return { response: json(200, { profile: { displayName: member } }) };
    if (entry === 'POST /catches') { state.mutations += 1; return { response: json(201, { id: 'c' + state.mutations, member }) }; }
    if (entry === 'PUT /me/profile') { state.mutations += 1; return { response: json(200, JSON.parse(init.body)) }; }
    // 내 자산 Catch(#286 후속, B 동의): 합성 Catch 하나의 목록·상세·저장. 저장은 본문의 값을 반영해 돌려준다.
    if (entry === 'GET /catches') return { response: json(200, { items: [catchItem()], page: { nextCursor: null } }) };
    if (entry === 'GET /catches/c1') return { response: json(200, catchItem()) };
    if (entry.startsWith('PUT /catches/c1/')) { state.mutations += 1; return { response: json(200, { ...catchItem(), ...JSON.parse(init.body) }) }; }
    return { response: json(404, { code: 'NOT_FOUND', message: '없음' }) };
  }

  return {
    state,
    /** 다음 한 번의 이 요청은 서버 처리 뒤 응답을 돌려주기 전에 기다린다. */
    hold(entry) { const gate = deferred(); holds.set(entry, gate); return gate; },
    /** 다음 한 번의 이 요청은 응답 없이 끊긴다(서버 처리 없음). */
    fail(entry) { failures.add(entry); },
    expire(token) { accessTokens.get(token).expired = true; },
    expireAll() { for (const record of accessTokens.values()) record.expired = true; },
    revokeAll() { for (const s of sessions.values()) s.revoked = true; },
    jarMember() { return state.jar ? sessions.get(refreshTokens.get(state.jar).sid).member : null; },
    count(entry) { return state.log.filter((l) => l.entry === entry).length; },
    requests(entry) { return state.log.filter((l) => l.entry === entry); },
    async fetch(url, init) {
      const entry = `${init.method} ${new URL(url).pathname.replace(/^\/v1/, '')}`;
      const include = init.credentials === 'include';
      state.log.push({ entry, auth: init.headers?.Authorization ?? null, credentials: init.credentials, jar: include ? state.jar : null });
      await tick();
      if (failures.has(entry)) { failures.delete(entry); throw new TypeError('network'); }
      const { response, setCookie } = await handle(entry, init, include);
      // 서버가 처리하고 쿠키가 바뀐 뒤 응답을 읽지 못함(연결 끊김 대역). 실제 브라우저에서 같은 순서가 나는지는 확인하지 않았다.
      if (entry === 'POST /auth/dev-login' && state.devLogin === 'drop-after-cookie') {
        if (include) state.jar = setCookie;
        state.log.push({ entry: `dropped ${entry}` });
        throw new TypeError('network');
      }
      const gate = holds.get(entry);
      if (gate) { holds.delete(entry); await gate.promise; }
      state.log.push({ entry: `done ${entry}` });
      if (include && setCookie !== undefined) state.jar = setCookie; // 응답이 도착할 때 쿠키가 바뀐다(null은 삭제).
      return response;
    },
  };
}

/** 한 탭: 저장소·표식·잠금·세션·공통 호출. */
function tab(server, { locks = null, storage = fakeStorage(), baseUrl = BASE } = {}) {
  const fetch = (url, init) => server.fetch(url, init);
  const store = createAuthStore();
  const marker = createLoginMarker({ storage });
  const session = createAuthSession({ store, marker, lock: createSessionLock({ locks }),
    refreshTransport: createFetchRefreshTransport({ baseUrl, nodeEnv: 'test', fetch }),
    logoutTransport: createFetchLogoutTransport({ baseUrl, nodeEnv: 'test', fetch }) });
  const api = createAuthApi({ baseUrl, nodeEnv: 'test', store, session, fetch });
  return { store, marker, session, api, storage };
}

/** 개발 로그인으로 시작한 탭. */
async function signedInTab(server, member = 'X', options) {
  const t = tab(server, options);
  assert.deepEqual(await t.api.devLogin(member), { kind: 'success', status: 200, data: null });
  return t;
}

const meOf = (result) => result.data.profile.displayName;

// ---- 보호 API 보내기 전 조건 ----

test('보호 API 조건은 status만 보지 않는다: 감지·보류·재인증·로그인 상태·토큰을 함께 확인하고, 막히면 요청을 보내지 않는다', async () => {
  const server = fakeServer();
  const t = tab(server);
  assert.equal(memberCallBlock(t.store), 'not-signed-in'); // 복원 중
  assert.deepEqual(await t.api.member('/me'), { kind: 'not-sent', reason: 'not-signed-in' });
  assert.equal(server.count('GET /me'), 0);

  assert.equal((await t.api.devLogin('X')).kind, 'success');
  assert.equal(memberCallBlock(t.store), null);

  const ticket = t.store.logoutStarted(); // 로그아웃 확인 중
  assert.equal(memberCallBlock(t.store), 'logout-hold');
  t.store.logoutSettled('unknown', ticket); // 결과 불명 보류
  assert.equal(t.store.getSnapshot().status, 'signed-in');
  assert.notEqual(t.store.accessToken(), null);
  assert.deepEqual(await t.api.member('/me'), { kind: 'not-sent', reason: 'logout-hold' }); // status는 signed-in이고 토큰도 있음
  assert.equal(server.count('GET /me'), 0);
});

test('로그인 변경을 감지하면 보내지 않는다: 복원하는 탭은 복원 중, [다시 로그인]만 남는 탭은 status가 signed-in이어도(팀장 결정 2)', async () => {
  const server = fakeServer();
  const t = await signedInTab(server);
  assert.equal(t.store.invalidateByLoginMarker(), 'restore');
  assert.equal(t.store.getSnapshot().status, 'restoring');
  assert.deepEqual(await t.api.member('/me'), { kind: 'not-sent', reason: 'not-signed-in' });

  const u = await signedInTab(server);
  assert.equal(u.store.invalidateByLoginMarker({ allowRestore: false }), 'relogin-only');
  assert.equal(u.store.getSnapshot().status, 'signed-in');
  assert.equal(u.store.getSnapshot().reloginOnly, true);
  assert.deepEqual(await u.api.member('/me'), { kind: 'not-sent', reason: 'login-changed' });
  assert.equal(server.count('GET /me'), 0);
});

test('재인증 필요 상태에서는 보내지 않는다', async () => {
  const server = fakeServer();
  const t = await signedInTab(server);
  server.revokeAll();
  await t.session.refresh(); // 401 → 로그인 중 실패는 재인증 필요
  assert.equal(t.store.getSnapshot().status, 'reauth-required');
  assert.deepEqual(await t.api.member('/me'), { kind: 'not-sent', reason: 'reauth-required' });
  assert.equal(server.count('GET /me'), 0);
});

// ---- 정상 호출과 401 뒤 갱신 ----

test('정상 조회: 현재 Access를 Bearer로 붙이고 쿠키는 보내지 않는다', async () => {
  const server = fakeServer();
  const t = await signedInTab(server);
  const result = await t.api.member('/me');
  assert.equal(result.kind, 'success');
  assert.equal(meOf(result), 'X');
  const [request] = server.requests('GET /me');
  assert.equal(request.auth, `Bearer ${t.store.accessToken()}`);
  assert.equal(request.credentials, 'omit');
  assert.equal(server.count('POST /auth/refresh'), 0);
});

test('조회 401: 한 번 갱신하고 새 토큰으로 조회만 한 번 다시 보낸다', async () => {
  const server = fakeServer();
  const t = await signedInTab(server);
  const before = t.store.accessToken();
  const generation = t.store.getSnapshot().generation;
  server.expire(before);
  const result = await t.api.member('/me');
  assert.equal(result.kind, 'success');
  assert.equal(meOf(result), 'X');
  assert.deepEqual([server.count('GET /me'), server.count('POST /auth/refresh')], [2, 1]);
  const [first, second] = server.requests('GET /me');
  assert.equal(first.auth, `Bearer ${before}`);
  assert.equal(second.auth, `Bearer ${t.store.accessToken()}`);
  assert.notEqual(t.store.accessToken(), before);
  assert.equal(t.store.getSnapshot().generation, generation); // 같은 세션 갱신은 세대 유지
});

test('변경 요청 401: 갱신은 하지만 다시 보내지 않고 결과에 갱신 여부만 붙인다', async () => {
  const server = fakeServer();
  const t = await signedInTab(server);
  server.expire(t.store.accessToken());
  const result = await t.api.member('/catches', { method: 'POST', body: { title: 't' } });
  assert.equal(result.kind, 'api-error');
  assert.equal(result.status, 401);
  assert.equal(result.authRenewal, 'renewed');
  assert.deepEqual([server.count('POST /catches'), server.count('POST /auth/refresh'), server.state.mutations], [1, 1, 0]);
  assert.equal(t.store.getSnapshot().status, 'signed-in');
});

test('401 뒤 갱신이 실패하면 재인증 필요가 되고, 조회·변경 모두 다시 보내지 않으며 이후 호출도 보내지 않는다', async () => {
  for (const request of [{}, { method: 'POST', body: {} }]) {
    const server = fakeServer();
    const t = await signedInTab(server);
    server.revokeAll();
    const path = request.method === 'POST' ? '/catches' : '/me';
    const entry = request.method === 'POST' ? 'POST /catches' : 'GET /me';
    const result = await t.api.member(path, request);
    assert.equal(result.status, 401);
    assert.equal(result.authRenewal, 'not-renewed');
    assert.equal(t.store.getSnapshot().status, 'reauth-required');
    assert.deepEqual([server.count(entry), server.count('POST /auth/refresh')], [1, 1]);
    assert.deepEqual(await t.api.member(path, request), { kind: 'not-sent', reason: 'reauth-required' });
    assert.deepEqual([server.count(entry), server.count('POST /auth/refresh')], [1, 1]);
  }
});

test('다시 보낸 조회도 401이면 더 갱신하지 않는다', async () => {
  const server = fakeServer();
  const t = await signedInTab(server);
  server.expire(t.store.accessToken());
  const gate = server.hold('POST /auth/refresh');
  const pending = t.api.member('/me');
  await tick(); await tick(); await tick(); await tick();
  gate.resolve();
  // 갱신 응답이 오자마자 새 토큰도 무효로 만든다(이상 상황).
  const origin = server.fetch;
  let expired = false;
  server.fetch = async (url, init) => {
    if (!expired && init.method === 'GET') { expired = true; server.expireAll(); }
    return origin(url, init);
  };
  const result = await pending;
  assert.equal(result.status, 401);
  assert.equal(result.authRenewal, 'not-renewed');
  assert.deepEqual([server.count('GET /me'), server.count('POST /auth/refresh')], [2, 1]);
});

test('동시에 401을 받은 두 조회는 갱신 하나를 함께 쓰고 각자 한 번만 다시 보낸다', async () => {
  const server = fakeServer();
  const t = await signedInTab(server);
  server.expire(t.store.accessToken());
  const [a, b] = await Promise.all([t.api.member('/me'), t.api.member('/me')]);
  assert.deepEqual([a.kind, b.kind], ['success', 'success']);
  assert.deepEqual([server.count('GET /me'), server.count('POST /auth/refresh')], [4, 1]);
});

test('다른 호출이 먼저 갱신해 토큰이 바뀌었으면 갱신하지 않고 새 토큰으로 조회만 다시 보낸다', async () => {
  const server = fakeServer();
  const t = await signedInTab(server);
  const old = t.store.accessToken();
  server.expire(old);
  const gate = server.hold('GET /me');
  const pending = t.api.member('/me');
  await tick(); await tick();
  assert.deepEqual(await t.session.refresh(), { kind: 'signed-in' }); // 다른 호출이 먼저 갱신
  gate.resolve();
  const result = await pending;
  assert.equal(result.kind, 'success');
  assert.deepEqual([server.count('GET /me'), server.count('POST /auth/refresh')], [2, 1]);
  assert.equal(server.requests('GET /me')[1].auth, `Bearer ${t.store.accessToken()}`);
});

test('로그아웃 결과 불명 보류 중 받은 401은 갱신하지 않고 다시 보내지 않는다', async () => {
  const server = fakeServer();
  const t = await signedInTab(server);
  server.expire(t.store.accessToken());
  const gate = server.hold('GET /me');
  const pending = t.api.member('/me');
  await tick(); await tick();
  server.fail('POST /auth/logout');
  assert.deepEqual(await t.session.logout(), { kind: 'settled', result: 'unknown' });
  gate.resolve();
  const result = await pending; // 같은 세대(결과 불명은 세대를 바꾸지 않음)라 401은 돌려주되 갱신하지 않음
  assert.equal(result.status, 401);
  assert.equal(result.authRenewal, 'not-renewed');
  assert.deepEqual([server.count('GET /me'), server.count('POST /auth/refresh')], [1, 0]);
  assert.equal(t.store.getSnapshot().sessionHold, 'logout-unknown');
});

// ---- 이전 응답 무시와 표식 비교 ----

test('응답을 기다리는 사이 이 탭에서 다른 회원으로 로그인하면 이전 응답을 돌려주지 않는다', async () => {
  const server = fakeServer();
  const t = await signedInTab(server, 'X');
  const gate = server.hold('GET /me');
  const pending = t.api.member('/me');
  await tick(); await tick();
  assert.equal((await t.api.devLogin('Y')).kind, 'success');
  gate.resolve();
  assert.deepEqual(await pending, { kind: 'discarded', sent: true });
  const now = await t.api.member('/me');
  assert.equal(meOf(now), 'Y');
});

test('응답을 기다리는 사이 로그아웃이 끝나면 이전 응답을 돌려주지 않고 401이어도 갱신하지 않는다', async () => {
  const server = fakeServer();
  const t = await signedInTab(server);
  server.expire(t.store.accessToken());
  const gate = server.hold('GET /me');
  const pending = t.api.member('/me');
  await tick(); await tick();
  assert.deepEqual(await t.session.logout(), { kind: 'settled', result: 'done' });
  gate.resolve();
  assert.deepEqual(await pending, { kind: 'discarded', sent: true });
  assert.equal(server.count('POST /auth/refresh'), 0);
});

test('표식 비교: 다른 탭 로그인을 요청 전에 감지하면 보내지 않고, 응답 반영 전에 감지하면 응답을 버리며 갱신하지 않는다', async () => {
  const server = fakeServer();
  const locks = fakeLockManager();
  const storage = fakeStorage();
  const a = await signedInTab(server, 'X', { locks, storage });
  const b = tab(server, { locks, storage });

  // 응답 반영 전 감지
  server.expire(a.store.accessToken());
  const gate = server.hold('GET /me');
  const pending = a.api.member('/me');
  await tick(); await tick();
  assert.equal((await b.api.devLogin('Y')).kind, 'success');
  const generation = a.store.getSnapshot().generation;
  gate.resolve();
  assert.deepEqual(await pending, { kind: 'discarded', sent: true }); // 401이었지만 이전 세션으로 갱신하지 않음
  assert.equal(server.count('POST /auth/refresh'), 0);

  // 팀장 결정 2: 차단·보류 없는 탭은 이전 화면을 정리하고(복원 중) 지금 쿠키로 한 번만 복원한다. 쿠키는 B의 로그인 것이다.
  assert.equal(a.store.getSnapshot().status, 'restoring');
  await settle();
  assert.equal(server.count('POST /auth/refresh'), 1);
  assert.equal(a.store.getSnapshot().status, 'signed-in');
  assert.equal(a.store.getSnapshot().generation, generation + 2); // 이전 세대 끊기 + 복원 성공
  assert.equal(a.store.loginChangeDetected(), false);
  assert.equal(meOf(await a.api.member('/me')), 'Y'); // 새 화면은 지금 로그인(Y)의 자료다
  assert.equal(server.count('POST /auth/refresh'), 1); // 복원은 한 번
});

test('표식 비교: 요청 전 감지(다른 탭 로그인이 이미 끝남)면 보호 API를 보내지 않고, 복원 뒤에도 변경 요청을 다시 보내지 않는다', async () => {
  const server = fakeServer();
  const locks = fakeLockManager();
  const storage = fakeStorage();
  const a = await signedInTab(server, 'X', { locks, storage });
  const b = tab(server, { locks, storage });
  assert.equal((await b.api.devLogin('Y')).kind, 'success');
  assert.deepEqual(await a.api.member('/catches', { method: 'POST', body: {} }), { kind: 'not-sent', reason: 'not-signed-in' });
  await settle();
  assert.equal(a.store.getSnapshot().status, 'signed-in'); // 한 번 복원
  assert.deepEqual([server.count('POST /catches'), server.state.mutations], [0, 0]); // 보내지 않은 변경 요청은 자동으로 보내지 않음
  assert.equal(meOf(await b.api.member('/me')), 'Y');
});

// ---- 개발 로그인 ----

test('개발 로그인: 시도 시작 → 잠금 안 전송(쿠키 포함) → 성공 반영·표식 기록, 결과에는 토큰이 없다', async () => {
  const server = fakeServer();
  const storage = fakeStorage();
  const t = tab(server, { storage });
  const generation = t.store.getSnapshot().generation;
  const result = await t.api.devLogin('X');
  assert.deepEqual(result, { kind: 'success', status: 200, data: null });
  assert.equal(JSON.stringify(result).includes('A'), false);
  const [request] = server.requests('POST /auth/dev-login');
  assert.equal(request.credentials, 'include');
  assert.equal(request.auth, null);
  assert.equal(t.store.getSnapshot().status, 'signed-in');
  assert.equal(t.store.getSnapshot().generation, generation + 1);
  assert.equal(server.jarMember(), 'X');
  assert.match(storage.map.get(LOGIN_MARKER_KEY), /^[0-9a-f]{32}$/);
  assert.equal(t.marker.compare(), 'same');
  assert.deepEqual(await t.session.refresh(), { kind: 'signed-in' }); // 받은 쿠키로 갱신 가능
});

test('개발 로그인은 진행 중인 갱신과 같은 잠금을 쓴다: 갱신 응답 뒤에 보내 마지막 쿠키가 새 로그인 것이다', async () => {
  const server = fakeServer();
  const t = await signedInTab(server, 'X');
  const gate = server.hold('POST /auth/refresh');
  const refreshing = t.session.refresh();
  await tick(); await tick();
  const login = t.api.devLogin('Y');
  await tick(); await tick(); await tick();
  assert.equal(server.count('POST /auth/dev-login'), 1); // 처음 X 로그인뿐, Y는 잠금 대기
  gate.resolve();
  assert.deepEqual(await refreshing, { kind: 'discarded', sent: true }); // 새 로그인 시작으로 결과 미반영
  assert.equal((await login).kind, 'success');
  const order = server.state.log.map((l) => l.entry).filter((e) => e.includes('refresh') || e.includes('dev-login'));
  assert.deepEqual(order.slice(-4), ['POST /auth/refresh', 'done POST /auth/refresh', 'POST /auth/dev-login', 'done POST /auth/dev-login']);
  assert.equal(server.jarMember(), 'Y');
  assert.equal(meOf(await t.api.member('/me')), 'Y');
});

test('잠금을 기다리는 동안 화면이 취소하면 보내지 않고 시도를 끝내 이전 세션 갱신이 다시 가능하다', async () => {
  const server = fakeServer();
  const t = await signedInTab(server, 'X');
  const gate = server.hold('POST /auth/refresh');
  const refreshing = t.session.refresh();
  await tick(); await tick();
  const abort = new AbortController();
  const login = t.api.devLogin('Y', { signal: abort.signal });
  abort.abort();
  gate.resolve();
  await refreshing;
  assert.deepEqual(await login, { kind: 'discarded', sent: false });
  assert.equal(server.count('POST /auth/dev-login'), 1); // 처음 X 로그인뿐
  assert.equal(t.store.loginChangeDetected(), false);
  assert.deepEqual(await t.session.refresh(), { kind: 'signed-in' });
  assert.equal(meOf(await t.api.member('/me')), 'X');
});

test('이미 취소된 신호로 부르면 시도를 시작하지 않는다', async () => {
  const server = fakeServer();
  const t = await signedInTab(server, 'X');
  const abort = new AbortController();
  abort.abort();
  assert.deepEqual(await t.api.devLogin('Y', { signal: abort.signal }), { kind: 'discarded', sent: false });
  assert.equal(server.count('POST /auth/dev-login'), 1);
  assert.deepEqual(await t.session.refresh(), { kind: 'signed-in' });
});

test('[결정 대기] 보낸 뒤 취소된 로그인이 성공하면 반영하지 않고, 이 탭은 [다시 로그인]만, 다른 탭은 이전 세션 대신 지금 쿠키로 한 번 복원한다', async () => {
  const server = fakeServer();
  const locks = fakeLockManager();
  const storage = fakeStorage();
  const a = await signedInTab(server, 'X', { locks, storage });
  const b = await (async () => { const t = tab(server, { locks, storage }); await t.session.refresh(); return t; })(); // B는 X를 복원
  assert.equal(b.store.getSnapshot().status, 'signed-in');
  const gate = server.hold('POST /auth/dev-login');
  const abort = new AbortController();
  const login = a.api.devLogin('Y', { signal: abort.signal });
  await tick(); await tick();
  abort.abort(); // 이미 보냄
  gate.resolve();
  assert.deepEqual(await login, { kind: 'discarded', sent: true });
  assert.equal(server.jarMember(), 'Y'); // 서버는 로그인을 처리해 쿠키를 바꿨다
  const refreshes = server.count('POST /auth/refresh');
  // A: 이 탭이 반영하지 않은 로그인이다. 자동 복원 없이 화면을 정리하고 [다시 로그인]만 둔다(Google 완료의 A 합의 1과 같은 안전 기준: 세션 확인으로 이번 로그인 성공을 판정하지 않음).
  assert.equal(a.store.loginChangeDetected(), true);
  assert.equal(a.store.getSnapshot().reloginOnly, true);
  assert.equal(a.store.accessToken(), null);
  assert.deepEqual(await a.session.refresh(), { kind: 'not-started' });
  assert.deepEqual(await a.session.logout(), { kind: 'not-started' });
  // B: 새 표식으로 알아차리고, 차단·보류가 없으므로 이전 세션(X) 갱신 대신 지금 쿠키로 한 번 복원한다(팀장 결정 2).
  assert.deepEqual(await b.session.refresh(), { kind: 'signed-in' });
  await settle();
  assert.equal(server.count('POST /auth/refresh'), refreshes + 1);
  assert.equal(meOf(await b.api.member('/me')), 'Y');
});

test('이전 시도의 성공은 반영하지 않고, 뒤의 시도가 잠금 뒤에 보내져 최종 쿠키와 상태가 같은 회원이다', async () => {
  const server = fakeServer();
  const t = await signedInTab(server, 'X');
  const gate = server.hold('POST /auth/dev-login');
  const first = t.api.devLogin('Y');
  await tick(); await tick();
  const second = t.api.devLogin('Z'); // Y 요청이 진행 중일 때 새 시도
  gate.resolve();
  assert.deepEqual(await first, { kind: 'discarded', sent: true });
  assert.equal((await second).kind, 'success');
  assert.equal(server.count('POST /auth/dev-login'), 3); // 처음 X + Y + Z
  assert.equal(server.jarMember(), 'Z');
  assert.equal(t.store.loginChangeDetected(), false); // 이 탭 로그인 성공으로 풀림
  assert.equal(meOf(await t.api.member('/me')), 'Z');
  assert.deepEqual(await t.session.refresh(), { kind: 'signed-in' });
});

test('잠금을 기다리는 동안 이 탭에서 다른 로그인을 시작했으면 이전 시도는 보내지 않는다', async () => {
  const server = fakeServer();
  const t = await signedInTab(server, 'X');
  const gate = server.hold('POST /auth/refresh');
  const refreshing = t.session.refresh();
  await tick(); await tick();
  const first = t.api.devLogin('Y');
  const second = t.api.devLogin('Z');
  gate.resolve();
  await refreshing;
  assert.deepEqual(await first, { kind: 'discarded', sent: false });
  assert.equal((await second).kind, 'success');
  assert.equal(server.count('POST /auth/dev-login'), 2); // 처음 X 로그인 + Z
  assert.equal(server.jarMember(), 'Z');
});

test('미전송이 확실한 경우(주소 설정 오류)는 요청 없이 시도만 끝내고 이전 세션을 그대로 쓴다', async () => {
  const server = fakeServer();
  const t = await signedInTab(server, 'X');
  const token = t.store.accessToken();
  const generation = t.store.getSnapshot().generation;
  const requests = server.state.log.length;
  // 같은 탭(저장소·세션)이지만 주소 설정이 잘못된 호출 함수
  const bad = createAuthApi({ baseUrl: 'ftp://bad', nodeEnv: 'test', store: t.store, session: t.session, fetch: (u, i) => server.fetch(u, i) });
  assert.deepEqual(await bad.devLogin('Y'), { kind: 'lookup-failed', status: null, code: 'LOOKUP_FAILED' });
  assert.equal(server.state.log.length, requests); // 요청 0건
  assert.deepEqual([t.store.accessToken(), t.store.getSnapshot().generation, t.store.loginChangeDetected()], [token, generation, false]);
  assert.deepEqual(await t.session.refresh(), { kind: 'signed-in' }); // 시도가 끝나 이전 세션 갱신 가능
  assert.equal(meOf(await t.api.member('/me')), 'X');
});

test('계약상 쿠키를 바꾸지 않는 거부(403 가드·400 검증)는 시도만 끝내고 이전 세션을 그대로 쓴다', async () => {
  const cases = [
    ['forbidden', { kind: 'api-error', status: 403, code: 'INTERNAL_ERROR', message: '서버 오류' }],
    ['invalid', { kind: 'api-error', status: 400, code: 'VALIDATION_FAILED', message: '검증 실패' }],
  ];
  for (const [mode, expected] of cases) {
    const server = fakeServer();
    const storage = fakeStorage();
    const t = await signedInTab(server, 'X', { storage });
    const token = t.store.accessToken();
    const generation = t.store.getSnapshot().generation;
    const marker = storage.map.get(LOGIN_MARKER_KEY);
    server.state.devLogin = mode;
    assert.deepEqual(await t.api.devLogin('Y'), expected, mode);
    assert.equal(server.count('POST /auth/dev-login'), 2, mode); // 처음 X + 이번 1건(다시 보내지 않음)
    assert.equal(server.jarMember(), 'X', mode);
    assert.equal(storage.map.get(LOGIN_MARKER_KEY), marker, mode); // 표식을 바꾸지 않음
    assert.deepEqual([t.store.accessToken(), t.store.getSnapshot().generation, t.store.loginChangeDetected()],
      [token, generation, false], mode);
    assert.deepEqual(await t.session.refresh(), { kind: 'signed-in' }, mode);
    assert.equal(meOf(await t.api.member('/me')), 'X', mode);
  }
});

/**
 * 결과 불명 확인. 이 탭(A): 토큰을 버리고 새 회원 토큰을 받지 않으며, 자동 복원 없이 [다시 로그인]만 남긴다.
 * 다른 탭(B): 바뀐 표식으로 알아차리고 이전 세션 대신 지금 쿠키로 한 번 복원한다(팀장 결정 2). 로그인은 다시 보내지 않는다.
 */
async function assertUnknownLoginHandled({ server, a, b, generation, refreshes }) {
  assert.equal(a.store.getSnapshot().status, 'signed-in');
  assert.equal(a.store.getSnapshot().reloginOnly, true); // 화면·입력 정리, [다시 로그인]만
  assert.equal(a.store.accessToken(), null); // 이전 토큰도 새 토큰도 쓰지 않음
  assert.equal(a.store.getSnapshot().generation, generation + 1);
  assert.equal(a.store.loginChangeDetected(), true);
  assert.deepEqual(await a.session.refresh(), { kind: 'not-started' }); // 자동 복원·갱신 없음
  assert.deepEqual(await a.session.logout(), { kind: 'not-started' }); // 쿠키 주인이 불확실한 로그아웃 없음
  assert.deepEqual(await a.api.member('/me'), { kind: 'not-sent', reason: 'login-changed' });
  assert.equal(server.count('POST /auth/refresh'), refreshes);
  assert.deepEqual(await b.session.refresh(), { kind: 'signed-in' }); // 다른 탭: 지금 쿠키로 한 번 복원
  await settle();
  assert.equal(server.count('POST /auth/refresh'), refreshes + 1);
  assert.equal(b.store.loginChangeDetected(), false);
  assert.equal(meOf(await b.api.member('/me')), server.jarMember()); // 복원한 것은 지금 쿠키의 회원
  assert.equal(server.count('POST /auth/dev-login'), 2); // 처음 X + 이번 1건. 자동 재전송 없음
}

/** 같은 출처 두 탭. A는 X로 로그인, B는 같은 쿠키로 X를 복원. */
async function twoSignedInTabs(options = {}) {
  const server = fakeServer();
  const locks = fakeLockManager();
  const storage = fakeStorage();
  const a = await signedInTab(server, 'X', { locks, storage });
  const b = tab(server, { locks, storage });
  assert.deepEqual(await b.session.refresh(), { kind: 'signed-in' });
  Object.assign(server.state, options);
  return { server, storage, a, b };
}

test('결과 불명: 서버가 처리하고 쿠키를 바꾼 뒤 응답을 읽지 못하면 새 회원 토큰을 받지 않고, 이 탭·다른 탭 모두 이전 세션 요청을 막는다', async () => {
  const { server, a, b } = await twoSignedInTabs();
  const generation = a.store.getSnapshot().generation;
  const refreshes = server.count('POST /auth/refresh');
  server.state.devLogin = 'drop-after-cookie';
  assert.deepEqual(await a.api.devLogin('Y'), { kind: 'lookup-failed', status: null, code: 'LOOKUP_FAILED' });
  assert.equal(server.jarMember(), 'Y'); // 쿠키는 이미 Y의 것
  await assertUnknownLoginHandled({ server, a, b, generation, refreshes });
});

test('결과 불명: 응답이 없으면(처리 여부를 알 수 없음) 처리 전 끊김이어도 같은 감지·차단을 적용한다', async () => {
  const { server, a, b } = await twoSignedInTabs();
  const generation = a.store.getSnapshot().generation;
  const refreshes = server.count('POST /auth/refresh');
  server.fail('POST /auth/dev-login');
  assert.deepEqual(await a.api.devLogin('Y'), { kind: 'lookup-failed', status: null, code: 'LOOKUP_FAILED' });
  assert.equal(server.jarMember(), 'X'); // 이 대역에서는 실제로 바뀌지 않았지만 화면은 구분할 수 없다
  await assertUnknownLoginHandled({ server, a, b, generation, refreshes });
});

test('결과 불명: 계약상 거부가 아닌 오류 응답(500)도 같은 감지·차단을 적용한다', async () => {
  const { server, a, b } = await twoSignedInTabs();
  const generation = a.store.getSnapshot().generation;
  const refreshes = server.count('POST /auth/refresh');
  server.state.devLogin = 'server-error';
  const result = await a.api.devLogin('Y');
  assert.deepEqual([result.kind, result.status, result.code], ['api-error', 500, 'INTERNAL_ERROR']);
  await assertUnknownLoginHandled({ server, a, b, generation, refreshes });
});

test('[한계] 결과 불명 때 표식을 쓰지 못하면 이 탭은 막히지만, 다른 탭은 알아차리지 못해 바뀐 쿠키로 갱신하고 새 회원 토큰을 받는다', async () => {
  const { server, storage, a, b } = await twoSignedInTabs();
  server.state.devLogin = 'drop-after-cookie';
  storage.failWrite = true;
  assert.deepEqual(await a.api.devLogin('Y'), { kind: 'lookup-failed', status: null, code: 'LOOKUP_FAILED' });
  // 이 탭: 표식 쓰기 실패와 관계없이 감지·무효화
  assert.equal(a.store.loginChangeDetected(), true);
  assert.equal(a.store.accessToken(), null);
  assert.deepEqual(await a.session.refresh(), { kind: 'not-started' });
  // 다른 탭: 표식이 그대로라 감지하지 못한다(4-2 쓰기 실패 한계와 같은 원인)
  assert.equal(b.session.checkLoginMarker(), 'same');
  assert.deepEqual(await b.session.refresh(), { kind: 'signed-in' });
  assert.equal(meOf(await b.api.member('/me')), 'Y'); // 같은 탭 화면이 X인 채 Y의 자료를 받는다
});

test('개발 로그인 200이지만 본문을 읽지 못하면 반영하지 않고, 쿠키가 바뀌었으므로 감지·무효화한다', async () => {
  const server = fakeServer();
  const t = await signedInTab(server, 'X');
  server.state.devLogin = 'malformed';
  assert.deepEqual(await t.api.devLogin('Y'), { kind: 'lookup-failed', status: 200, code: 'LOOKUP_FAILED' });
  assert.equal(server.jarMember(), 'Y');
  assert.equal(t.store.loginChangeDetected(), true);
  assert.deepEqual(await t.session.refresh(), { kind: 'not-started' });
  assert.deepEqual(await t.api.member('/me'), { kind: 'not-sent', reason: 'login-changed' });
});

test('감지 상태에서도 이 탭의 개발 로그인 성공은 기존 규칙대로 상태를 초기화한다', async () => {
  const server = fakeServer();
  const t = await signedInTab(server, 'X');
  t.store.invalidateByLoginMarker();
  assert.equal((await t.api.devLogin('Y')).kind, 'success');
  assert.equal(t.store.loginChangeDetected(), false);
  assert.equal(meOf(await t.api.member('/me')), 'Y');
});

test('loginAttemptCurrent: 가장 최근에 시작해 아직 성공·종료되지 않은 시도만 true이며 상태를 바꾸지 않는다', () => {
  const store = createAuthStore();
  const first = store.loginStarted();
  assert.equal(store.loginAttemptCurrent(first), true);
  const second = store.loginStarted();
  assert.deepEqual([store.loginAttemptCurrent(first), store.loginAttemptCurrent(second)], [false, true]);
  const snapshot = store.getSnapshot();
  store.loginAttemptCurrent(second);
  assert.equal(store.getSnapshot(), snapshot);
  store.signedIn('t', second);
  assert.equal(store.loginAttemptCurrent(second), false);
  const third = store.loginStarted();
  store.loginAttemptEnded(third);
  assert.equal(store.loginAttemptCurrent(third), false);
  assert.throws(() => store.loginAttemptCurrent({}), TypeError);
});

test('[회귀] 갱신으로 받은 Access가 이전과 같은 문자열이어도(같은 초 재발급) 갱신 성공으로 보고 조회를 한 번만 다시 보낸다', async () => {
  const server = fakeServer();
  const t = await signedInTab(server);
  const token = t.store.accessToken();
  const origin = server.fetch;
  let gets = 0;
  server.fetch = async (url, init) => {
    if (init.method === 'GET') {
      gets += 1;
      if (gets === 1) return new Response(JSON.stringify({ code: 'AUTH_INVALID', message: 'm' }), { status: 401 });
    }
    const response = await origin(url, init);
    if (url.endsWith('/auth/refresh') && response.status === 200) {
      return new Response(JSON.stringify({ accessToken: token, tokenType: 'Bearer', expiresIn: 900 }), { status: 200 });
    }
    return response;
  };
  const result = await t.api.member('/me');
  assert.equal(result.kind, 'success');
  assert.equal(meOf(result), 'X');
  assert.deepEqual([gets, server.count('POST /auth/refresh')], [2, 1]);
  assert.equal(t.store.accessToken(), token);

  // 변경 요청은 같은 경우에도 다시 보내지 않고 renewed로 알린다.
  gets = 0;
  let posts = 0;
  server.fetch = async (url, init) => {
    if (init.method === 'POST' && url.endsWith('/catches')) {
      posts += 1;
      return new Response(JSON.stringify({ code: 'AUTH_INVALID', message: 'm' }), { status: 401 });
    }
    const response = await origin(url, init);
    if (url.endsWith('/auth/refresh') && response.status === 200) {
      return new Response(JSON.stringify({ accessToken: token, tokenType: 'Bearer', expiresIn: 900 }), { status: 200 });
    }
    return response;
  };
  const post = await t.api.member('/catches', { method: 'POST', body: {} });
  assert.equal(post.authRenewal, 'renewed');
  assert.deepEqual([posts, server.count('POST /auth/refresh')], [1, 2]);
});

// ---- 변경 요청 결과 구분(#286 후속, 담당 합의 6209853081) ----
// 기능 화면이 쓰는 경로(공통 호출 → 호환 변환 `toClientResult` → 기능 함수)를 대역 서버로 확인한다. 실제 브라우저·서버 검증이 아니다.

const profile = { displayName: 'X', introduction: '', desiredRole: '', skills: [] };
/** 통합 시험 전환을 켠 `api.member`(api.ts의 sessionApi)와 같은 변환. */
const featureApi = (t) => ({ member: async (path, request) => toClientResult(await t.api.member(path, request)) });

test('변경 요청 결과 구분: Access 갱신 성공 뒤 401 거부는 renewed-rejected이고 저장을 자동으로 다시 보내지 않는다', async () => {
  const server = fakeServer();
  const t = await signedInTab(server);
  server.expire(t.store.accessToken());
  assert.equal(await saveProfileDetailed(featureApi(t), profile), 'renewed-rejected');
  assert.deepEqual([server.count('PUT /me/profile'), server.count('POST /auth/refresh'), server.state.mutations], [1, 1, 0]);
  assert.equal(t.store.getSnapshot().status, 'signed-in');
  assert.equal(await saveProfileDetailed(featureApi(t), profile), 'saved', '사용자가 다시 누르면 새 Access로 보낸다');
  assert.deepEqual([server.count('PUT /me/profile'), server.state.mutations], [2, 1]);
});

test('변경 요청 결과 구분: 갱신하지 못한 401은 기존 처리(save-failed)이고, 그 뒤 재인증 필요 상태의 요청은 not-sent다', async () => {
  const server = fakeServer();
  const t = await signedInTab(server);
  server.revokeAll();
  assert.equal(await saveProfileDetailed(featureApi(t), profile), 'save-failed');
  assert.equal(t.store.getSnapshot().status, 'reauth-required');
  assert.equal(await saveProfileDetailed(featureApi(t), profile), 'not-sent');
  assert.deepEqual([server.count('PUT /me/profile'), server.count('POST /auth/refresh')], [1, 1], '보내지 않은 요청은 서버에 가지 않는다');
  assert.equal(await readProfile(featureApi(t)), null, '조회는 기존대로 조회 실패로 받는다');
});

test('변경 요청 결과 구분: 저장 응답을 기다리는 사이 다른 회원으로 로그인하면 discarded(성공·실패로 확정하지 않음)다', async () => {
  const server = fakeServer();
  const t = await signedInTab(server, 'X');
  const gate = server.hold('PUT /me/profile');
  const pending = saveProfileDetailed(featureApi(t), profile);
  await tick(); await tick();
  assert.equal((await t.api.devLogin('Y')).kind, 'success');
  gate.resolve();
  assert.equal(await pending, 'discarded');
  assert.equal(server.state.mutations, 1, '서버에는 반영됐을 수 있다');
});

test('변경 요청 결과 구분: 표시는 결과 모양을 바꾸지 않고, 전환을 끈 결과·복사된 결과·성공은 other다', () => {
  const failed = { kind: 'lookup-failed', status: null, code: 'LOOKUP_FAILED' };
  const notSent = toClientResult({ kind: 'not-sent', reason: 'reauth-required' });
  const dropped = toClientResult({ kind: 'discarded', sent: true });
  assert.deepEqual(notSent, failed);
  assert.deepEqual(dropped, failed);
  assert.notEqual(notSent, toClientResult({ kind: 'not-sent', reason: 'reauth-required' }), '결과마다 새 객체');
  assert.equal(memberMutationOutcome(notSent), 'not-sent');
  assert.equal(memberMutationOutcome(dropped), 'discarded');
  assert.equal(memberMutationOutcome({ kind: 'api-error', status: 401, code: 'AUTH_INVALID', message: 'm', authRenewal: 'renewed' }), 'renewed-rejected');
  assert.equal(memberMutationOutcome({ kind: 'api-error', status: 401, code: 'AUTH_INVALID', message: 'm', authRenewal: 'not-renewed' }), 'other');
  assert.equal(memberMutationOutcome({ kind: 'api-error', status: 401, code: 'LINK_PASSWORD_INVALID', message: 'm', authRenewal: 'renewed' }), 'other');
  assert.equal(memberMutationOutcome({ kind: 'api-error', status: 401, code: 'AUTH_INVALID', message: 'm' }), 'other');
  assert.equal(memberMutationOutcome({ ...failed }), 'other');
  assert.equal(memberMutationOutcome({ ...notSent }), 'other', '복사하면 표시가 없어져 기존 처리로 돌아간다');
  assert.equal(memberMutationOutcome({ kind: 'success', status: 200, data: null }), 'other');
});

// ---- 내 자산 Catch 저장 결과 구분(#286 후속, B 동의 #308 pullrequestreview-5565777761) ----
// 전환을 켠 api.member와 같은 변환(featureApi) → createCatchApi → createAssetsStore 경로를 대역 서버로 확인한다. 실제 브라우저·서버 검증이 아니다.

async function catchScreen(t) {
  const store = createAssetsStore(createCatchApi(featureApi(t).member));
  await store.refresh('repo-a');
  await store.openDetail('c1');
  assert.equal(store.getSnapshot().detailState, 'ready');
  return store;
}
const PUBLISH = { kind: 'visibility', visibility: 'PUBLIC' };

test('Catch 저장: Access 갱신 성공 뒤 401 거부는 처리되지 않음(renewed-rejected)으로 안내하고 다시 보내지 않으며, 다시 누르면 보낸다', async () => {
  const server = fakeServer();
  const t = await signedInTab(server);
  const store = await catchScreen(t);
  server.expire(t.store.accessToken());
  await store.update(PUBLISH);
  assert.deepEqual(store.getSnapshot().mutation, { catchId: 'c1', kind: 'visibility', status: 'not-processed', error: null, reason: 'renewed-rejected' });
  assert.equal(store.getSnapshot().detail.visibility, 'PRIVATE', '마지막 확인 값 그대로');
  assert.deepEqual([server.count('PUT /catches/c1/visibility'), server.count('POST /auth/refresh'), server.state.mutations], [1, 1, 0]);
  await store.update(PUBLISH);
  assert.equal(store.getSnapshot().mutation.status, 'success');
  assert.equal(store.getSnapshot().detail.visibility, 'PUBLIC');
  assert.deepEqual([server.count('PUT /catches/c1/visibility'), server.state.mutations], [2, 1]);
});

test('Catch 저장: 재인증 필요 상태의 저장은 보내지 않음(not-sent)으로 안내하고 서버에 보내지 않는다', async () => {
  const server = fakeServer();
  const t = await signedInTab(server);
  const store = await catchScreen(t);
  server.revokeAll();
  server.expire(t.store.accessToken());
  assert.equal(await readProfile(featureApi(t)), null);
  assert.equal(t.store.getSnapshot().status, 'reauth-required');
  await store.update(PUBLISH);
  assert.deepEqual(store.getSnapshot().mutation, { catchId: 'c1', kind: 'visibility', status: 'not-processed', error: null, reason: 'not-sent' });
  assert.equal(server.count('PUT /catches/c1/visibility'), 0, '보내지 않은 요청은 서버에 가지 않는다');
  assert.equal(store.getSnapshot().detailState, 'ready', '상세를 지우지 않는다');
});

test('Catch 저장: 응답을 기다리는 사이 다른 회원으로 로그인하면 화면 세대가 바뀌고, 해제 전에 온 응답도 성공으로 확정하지 않는다', async () => {
  const server = fakeServer();
  const t = await signedInTab(server, 'X');
  const tokens = createAccessTokenStore();
  bindLegacyTokenSignal(t.store, createSessionScope(t.store), tokens);
  const assets = createAssetsSessionScope(tokens);
  const opened = assets.getSnapshot();
  const store = await catchScreen(t);
  const gate = server.hold('PUT /catches/c1/visibility');
  const saving = store.update(PUBLISH);
  await tick(); await tick();
  assert.equal((await t.api.devLogin('Y')).kind, 'success');
  assert.notEqual(assets.getSnapshot(), opened, '회원 전환: 내 자산 화면을 새로 만든다');
  gate.resolve();
  await saving;
  assert.equal(server.state.mutations, 1, '서버에는 반영됐을 수 있다');
  const { mutation } = store.getSnapshot();
  assert.equal(mutation.status, 'error', '반영하지 않은 응답은 결과 불명(성공·실패로 확정하지 않음)');
  assert.equal(mutation.reason, undefined);
  assert.equal(store.getSnapshot().detail.visibility, 'PRIVATE');

  const late = server.hold('PUT /catches/c1/visibility');
  const next = await catchScreen(t);
  const pending = next.update(PUBLISH);
  await tick(); await tick();
  next.dispose(); // 화면 해제(회원 경계 key 변경)
  late.resolve();
  await pending;
  assert.equal(next.getSnapshot().mutation.status, 'saving', '해제된 화면에는 결과를 반영하지 않는다');
});

test('Catch 화면: 같은 세션의 Access 갱신은 조회를 다시 보내 성공시키고 화면 세대를 바꾸지 않는다', async () => {
  const server = fakeServer();
  const t = await signedInTab(server);
  const tokens = createAccessTokenStore();
  bindLegacyTokenSignal(t.store, createSessionScope(t.store), tokens);
  const assets = createAssetsSessionScope(tokens);
  const opened = assets.getSnapshot();
  const store = await catchScreen(t);
  server.expire(t.store.accessToken());
  await store.openDetail('c1', true);
  assert.equal(store.getSnapshot().detailState, 'ready');
  assert.equal(server.count('POST /auth/refresh'), 1);
  assert.equal(assets.getSnapshot(), opened, '같은 세션 갱신만으로 화면을 초기화하지 않는다');
});

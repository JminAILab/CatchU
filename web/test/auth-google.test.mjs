import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAuthStore } from '../src/lib/auth-state.ts';
import { createAuthSession, createSessionLock } from '../src/lib/auth-session.ts';
import { createLoginMarker, LOGIN_MARKER_KEY } from '../src/lib/auth-login-marker.ts';
import { createFetchRefreshTransport } from '../src/lib/auth-refresh.ts';
import { createFetchLogoutTransport } from '../src/lib/auth-logout.ts';
import { createGoogleAuth, GOOGLE_ATTEMPT_KEY } from '../src/lib/auth-google.ts';

const BASE = 'http://localhost:3001';
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; }

/** `localStorage`·`sessionStorage` 대역. 읽기·쓰기 실패를 켤 수 있다. */
function fakeStorage() {
  const map = new Map();
  const s = {
    map, failRead: false, failWrite: false, failRemove: false,
    getItem(k) { if (s.failRead) throw new Error('blocked'); return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { if (s.failWrite) throw new Error('quota'); map.set(k, String(v)); },
    removeItem(k) { if (s.failRemove) throw new Error('blocked'); map.delete(k); },
  };
  return s;
}

/**
 * Google 시작·완료와 갱신·로그아웃 서버 대역(실제 `Response`). 완료는 계약대로 성공(200)일 때만 Refresh 쿠키를 바꾼다.
 * 실제 Google·서버·브라우저 검증이 아니다.
 */
function fakeServer() {
  let serial = 0;
  const attempts = new Map();
  const sessions = new Map();
  const refresh = new Map();
  const holds = new Map();
  const fails = new Set();
  const state = { jar: null, log: [], start: 'ok', complete: 'ok', suggested: '구글이름' };
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const err = (status, code) => json(status, { code, message: 'm' });
  const open = (member) => { const sid = 'S' + (sessions.size + 1); sessions.set(sid, { member, revoked: false }); const r = 'R' + ++serial; refresh.set(r, { sid, used: false }); return { sid, r }; };

  async function handle(entry, init, include) {
    const body = init.body ? JSON.parse(init.body) : null;
    if (entry === 'POST /auth/google/authorization') {
      if (state.start === 'disabled') return { response: err(404, 'RESOURCE_UNAVAILABLE') };
      if (state.start === 'invalid') return { response: err(400, 'VALIDATION_FAILED') };
      if (state.start === 'server') return { response: err(500, 'INTERNAL_ERROR') };
      if (state.start === 'malformed') return { response: json(200, { authorizationUrl: 'http://evil.example/?state=x', loginAttemptToken: 'k', expiresIn: 600 }) };
      const s = 'st' + ++serial;
      const token = 'lat' + serial;
      attempts.set(s, { token, used: false });
      return { response: json(200, { authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?state=${s}&nonce=n`, loginAttemptToken: token, expiresIn: 600 }) };
    }
    if (entry === 'POST /auth/google/login') {
      if (state.complete === 'disabled') return { response: err(404, 'RESOURCE_UNAVAILABLE') };
      if (state.complete === 'server') return { response: err(500, 'INTERNAL_ERROR') };
      if (state.complete === 'invalid') return { response: err(400, 'VALIDATION_FAILED') };
      const attempt = attempts.get(body.state);
      if (!attempt || attempt.used || attempt.token !== body.loginAttemptToken) return { response: err(401, 'AUTH_INVALID') };
      attempt.used = true;
      if (body.error === 'access_denied') return { response: json(200, { cancelled: true }) };
      if (state.complete === 'malformed') { const { r } = open('G'); return { response: new Response('{', { status: 200 }), setCookie: r }; }
      const { r, sid } = open('G-' + body.code);
      return { response: json(200, { accessToken: `A-${sessions.get(sid).member}`, tokenType: 'Bearer', expiresIn: 900, suggestedDisplayName: state.suggested }), setCookie: r };
    }
    if (entry === 'POST /auth/refresh') {
      const rec = include && state.jar ? refresh.get(state.jar) : undefined;
      if (rec && !rec.used && !sessions.get(rec.sid).revoked) {
        rec.used = true; const r = 'R' + ++serial; refresh.set(r, { sid: rec.sid, used: false });
        return { response: json(200, { accessToken: `A-${sessions.get(rec.sid).member}-${serial}`, tokenType: 'Bearer', expiresIn: 900 }), setCookie: r };
      }
      return { response: err(401, 'AUTH_INVALID'), setCookie: null };
    }
    if (entry === 'POST /auth/logout') return { response: new Response(null, { status: 204 }), setCookie: null };
    return { response: err(404, 'RESOURCE_UNAVAILABLE') };
  }

  return {
    state,
    hold(entry) { const g = deferred(); holds.set(entry, g); return g; },
    fail(entry) { fails.add(entry); },
    seed(member) { const { r } = open(member); state.jar = r; },
    jarMember() { return state.jar ? sessions.get(refresh.get(state.jar).sid).member : null; },
    count(entry) { return state.log.filter((l) => l.entry === entry).length; },
    requests(entry) { return state.log.filter((l) => l.entry === entry); },
    async fetch(url, init) {
      const entry = `${init.method} ${new URL(url).pathname.replace(/^\/v1/, '')}`;
      const include = init.credentials === 'include';
      state.log.push({ entry, credentials: init.credentials, body: init.body });
      await tick();
      if (fails.has(entry)) { fails.delete(entry); throw new TypeError('network'); }
      const { response, setCookie } = await handle(entry, init, include);
      const gate = holds.get(entry);
      if (gate) { holds.delete(entry); await gate.promise; }
      if (state.complete === 'drop-after-cookie' && entry === 'POST /auth/google/login') {
        if (include && setCookie !== undefined) state.jar = setCookie;
        throw new TypeError('network');
      }
      if (include && setCookie !== undefined) state.jar = setCookie;
      return response;
    },
  };
}

/** 한 탭: 공통 인증 저장소·세션과 Google 공통 함수. 시도 보관(sessionStorage)과 표식(localStorage)은 대역. */
function tab(server, { attempts = fakeStorage(), markers = fakeStorage(), now = () => 1_000_000 } = {}) {
  const fetch = (u, i) => server.fetch(u, i);
  const store = createAuthStore();
  const marker = createLoginMarker({ storage: markers });
  const session = createAuthSession({ store, marker, lock: createSessionLock({ locks: null }),
    refreshTransport: createFetchRefreshTransport({ baseUrl: BASE, nodeEnv: 'test', fetch }),
    logoutTransport: createFetchLogoutTransport({ baseUrl: BASE, nodeEnv: 'test', fetch }) });
  const google = createGoogleAuth({ baseUrl: BASE, nodeEnv: 'test', store, session, storage: attempts, fetch, now });
  return { store, session, google, attempts, markers };
}

const stored = (t) => JSON.parse(t.attempts.map.get(GOOGLE_ATTEMPT_KEY));
const query = (s) => new URLSearchParams(s);

/** 시작 → 콜백 해석까지. */
async function readyCallback(server, t, { next = '/assets', code = 'c1' } = {}) {
  const started = await t.google.startGoogleLogin(next);
  assert.equal(started.kind, 'ready');
  const state = new URL(started.authorizationUrl).searchParams.get('state');
  const parsed = t.google.readGoogleCallback(query(`state=${state}&code=${code}`));
  assert.equal(parsed.kind, 'complete');
  return parsed;
}

// ---- 시작 ----

test('시작: 시작 API를 쿠키 없이 부르고 시도(state·확인값·next·시한)를 키 하나에 보관하며, 결과에는 이동 주소만 준다', async () => {
  const server = fakeServer();
  const t = tab(server);
  const result = await t.google.startGoogleLogin('/assets?x=1');
  assert.equal(result.kind, 'ready');
  assert.deepEqual(Object.keys(result).sort(), ['authorizationUrl', 'kind']);
  const [request] = server.requests('POST /auth/google/authorization');
  assert.equal(request.credentials, 'omit');
  assert.equal(request.body, '{}');
  assert.deepEqual([...t.attempts.map.keys()], [GOOGLE_ATTEMPT_KEY]);
  const s = stored(t);
  assert.equal(s.state, new URL(result.authorizationUrl).searchParams.get('state'));
  assert.match(s.loginAttemptToken, /^lat/);
  assert.equal(s.next, '/assets?x=1');
  assert.equal(s.expiresAt, 1_000_000 + 600_000);
  assert.equal(s.sent, false);
  assert.equal(t.markers.map.size, 0); // 표식·토큰은 쓰지 않음
});

test('시작: next는 회원 경로만 보관하고 아니면 null', async () => {
  for (const next of ['//evil.example', 'https://evil.example/home', '/s/token', '/login', null]) {
    const server = fakeServer();
    const t = tab(server);
    assert.equal((await t.google.startGoogleLogin(next)).kind, 'ready');
    assert.equal(stored(t).next, null, String(next));
  }
});

test('시작: 보관할 수 없으면(저장소 없음·쓰기 실패) Google로 이동하지 않는다', async () => {
  const server = fakeServer();
  const none = createGoogleAuth({ baseUrl: BASE, nodeEnv: 'test', store: createAuthStore(), session: tab(server).session, storage: null, fetch: (u, i) => server.fetch(u, i) });
  assert.deepEqual(await none.startGoogleLogin('/home'), { kind: 'failed', reason: 'unavailable' });
  assert.equal(server.count('POST /auth/google/authorization'), 0);
  const t = tab(server);
  t.attempts.failWrite = true;
  assert.deepEqual(await t.google.startGoogleLogin('/home'), { kind: 'failed', reason: 'unavailable' });
});

test('시작: 오류 응답·응답 없음·형식 오류를 이유로 나누고 보관하지 않는다', async () => {
  const cases = [['disabled', 'unavailable'], ['invalid', 'invalid-request'], ['server', 'server'], ['malformed', 'invalid-response']];
  for (const [mode, reason] of cases) {
    const server = fakeServer();
    server.state.start = mode;
    const t = tab(server);
    assert.deepEqual(await t.google.startGoogleLogin('/home'), { kind: 'failed', reason }, mode);
    assert.equal(t.attempts.map.size, 0, mode);
  }
  const server = fakeServer();
  server.fail('POST /auth/google/authorization');
  const t = tab(server);
  assert.deepEqual(await t.google.startGoogleLogin('/home'), { kind: 'failed', reason: 'network' });
});

test('시작 연타: 마지막 시작만 쓰고 앞의 결과는 superseded이며 보관값은 마지막 시도다', async () => {
  const server = fakeServer();
  const t = tab(server);
  const [first, second] = await Promise.all([t.google.startGoogleLogin('/home'), t.google.startGoogleLogin('/links')]);
  assert.deepEqual(first, { kind: 'failed', reason: 'superseded' });
  assert.equal(second.kind, 'ready');
  assert.equal(stored(t).state, new URL(second.authorizationUrl).searchParams.get('state'));
  assert.equal(stored(t).next, '/links');
});

// ---- 콜백 해석 ----

test('콜백 해석: 일치하면 complete(next 재검사), 취소는 access_denied, 다른 오류·형식 오류는 완료 API를 부르지 않는다', async () => {
  const server = fakeServer();
  const t = tab(server);
  const started = await t.google.startGoogleLogin('/assets');
  const state = new URL(started.authorizationUrl).searchParams.get('state');
  const token = stored(t).loginAttemptToken;
  assert.deepEqual(t.google.readGoogleCallback(query(`state=${state}&code=abc`)),
    { kind: 'complete', input: { state, loginAttemptToken: token, code: 'abc' }, next: '/assets' });
  assert.deepEqual(t.google.readGoogleCallback(query(`state=${state}&error=access_denied`)),
    { kind: 'complete', input: { state, loginAttemptToken: token, error: 'access_denied' }, next: '/assets' });
  assert.deepEqual(t.google.readGoogleCallback(query(`state=${state}&error=server_error`)), { kind: 'provider-error' });
  for (const q of [`code=abc`, `state=${state}`, `state=${state}&state=${state}&code=a`, `state=${state}&code=a&code=b`,
    `state=${state}&code=a&error=access_denied`, `state=${state}&code=`]) {
    assert.deepEqual(t.google.readGoogleCallback(query(q)), { kind: 'malformed' }, q);
  }
  assert.deepEqual(t.google.readGoogleCallback(query('state=other&code=abc')), { kind: 'state-mismatch' });
  assert.ok(t.attempts.map.has(GOOGLE_ATTEMPT_KEY)); // 해석만으로 지우지 않음
  // 돌아올 때 next 재검사: 보관값이 바뀌었어도 회원 경로가 아니면 null
  t.attempts.map.set(GOOGLE_ATTEMPT_KEY, JSON.stringify({ ...stored(t), next: '//evil.example' }));
  assert.equal(t.google.readGoogleCallback(query(`state=${state}&code=abc`)).next, null);
});

test('콜백 해석: 시도 없음·시한 지남(보관값 삭제)·이미 보낸 시도', async () => {
  const server = fakeServer();
  let clock = 1_000_000;
  const t = tab(server, { now: () => clock });
  assert.deepEqual(t.google.readGoogleCallback(query('state=a&code=b')), { kind: 'no-attempt' });
  const started = await t.google.startGoogleLogin('/home');
  const state = new URL(started.authorizationUrl).searchParams.get('state');
  t.attempts.map.set(GOOGLE_ATTEMPT_KEY, JSON.stringify({ ...stored(t), sent: true }));
  assert.deepEqual(t.google.readGoogleCallback(query(`state=${state}&code=b`)), { kind: 'already-sent' });
  clock += 600_000;
  assert.deepEqual(t.google.readGoogleCallback(query(`state=${state}&code=b`)), { kind: 'expired' });
  assert.equal(t.attempts.map.size, 0);
  t.attempts.map.set(GOOGLE_ATTEMPT_KEY, '{broken');
  assert.deepEqual(t.google.readGoogleCallback(query(`state=${state}&code=b`)), { kind: 'no-attempt' });
});

// ---- 완료 ----

test('완료 성공: 잠금 안에서 sent 표시 후 쿠키 포함으로 보내고, 응답 뒤 보관값 삭제·로그인 반영·표식 기록', async () => {
  const server = fakeServer();
  const t = tab(server);
  const parsed = await readyCallback(server, t);
  const generation = t.store.getSnapshot().generation;
  const origin = server.fetch;
  let sentMarked = null;
  server.fetch = async (u, i) => { if (i.method === 'POST' && u.endsWith('/auth/google/login')) sentMarked = stored(t).sent; return origin(u, i); };
  const result = await t.google.completeGoogleLogin(parsed.input);
  assert.deepEqual(result, { kind: 'signed-in', suggestedDisplayName: '구글이름' });
  assert.equal(sentMarked, true); // 요청 직전 sent 표시
  assert.equal(server.requests('POST /auth/google/login')[0].credentials, 'include');
  assert.equal(t.attempts.map.size, 0);
  assert.equal(t.store.getSnapshot().status, 'signed-in');
  assert.equal(t.store.getSnapshot().generation, generation + 1);
  assert.match(t.markers.map.get(LOGIN_MARKER_KEY), /^[0-9a-f]{32}$/);
  assert.equal(server.jarMember(), 'G-c1');
  assert.equal(JSON.stringify(result).includes('A-'), false);
  assert.deepEqual(await t.session.refresh(), { kind: 'signed-in' });
});

test('완료 취소(access_denied): 회원·토큰을 만들지 않고 cancelled, 보관값 삭제, 인증 상태 그대로', async () => {
  const server = fakeServer();
  const t = tab(server);
  const started = await t.google.startGoogleLogin('/home');
  const state = new URL(started.authorizationUrl).searchParams.get('state');
  const parsed = t.google.readGoogleCallback(query(`state=${state}&error=access_denied`));
  const before = t.store.getSnapshot();
  assert.deepEqual(await t.google.completeGoogleLogin(parsed.input), { kind: 'cancelled' });
  assert.equal(t.attempts.map.size, 0);
  assert.equal(t.store.getSnapshot().status, before.status);
  assert.equal(t.store.getSnapshot().generation, before.generation);
  assert.equal(server.jarMember(), null);
});

test('완료 401: 시도 무효이며 보관 중인 회원 토큰·인증 상태를 바꾸지 않는다(회원 인증 만료로 처리하지 않음)', async () => {
  const server = fakeServer();
  server.seed('X');
  const t = tab(server);
  assert.deepEqual(await t.session.refresh(), { kind: 'signed-in' }); // 기존 X 로그인
  const token = t.store.accessToken();
  const before = t.store.getSnapshot();
  const parsed = await readyCallback(server, t);
  const result = await t.google.completeGoogleLogin({ ...parsed.input, loginAttemptToken: 'wrong' });
  // 보관값과 다르면 보내지 않는다(attempt-invalid)
  assert.deepEqual(result, { kind: 'failed', reason: 'attempt-invalid' });
  assert.equal(server.count('POST /auth/google/login'), 0);
  // 서버가 401을 돌려주는 경우: 보관값을 서버와 어긋나게 만든다
  t.attempts.map.set(GOOGLE_ATTEMPT_KEY, JSON.stringify({ ...stored(t), loginAttemptToken: 'mismatch' }));
  const result2 = await t.google.completeGoogleLogin({ ...parsed.input, loginAttemptToken: 'mismatch' });
  assert.deepEqual(result2, { kind: 'failed', reason: 'attempt-invalid' });
  assert.equal(server.count('POST /auth/google/login'), 1);
  assert.equal(t.store.accessToken(), token);
  assert.equal(t.store.getSnapshot().status, before.status);
  assert.equal(t.store.getSnapshot().generation, before.generation);
  assert.equal(t.store.loginChangeDetected(), false);
  assert.equal(server.jarMember(), 'X');
  assert.deepEqual(await t.session.refresh(), { kind: 'signed-in' }); // 시도가 끝나 기존 세션 갱신 가능
});

test('완료 오류 응답(400·404·500): 이유별 실패, 보관값 삭제, 쿠키·상태 그대로, 다시 보내지 않음', async () => {
  for (const [mode, reason] of [['invalid', 'invalid-request'], ['disabled', 'unavailable'], ['server', 'server']]) {
    const server = fakeServer();
    const t = tab(server);
    const parsed = await readyCallback(server, t);
    server.state.complete = mode;
    assert.deepEqual(await t.google.completeGoogleLogin(parsed.input), { kind: 'failed', reason }, mode);
    assert.equal(server.count('POST /auth/google/login'), 1, mode);
    assert.equal(t.attempts.map.size, 0, mode);
    assert.equal(t.store.loginChangeDetected(), false, mode);
    assert.equal(server.jarMember(), null, mode);
  }
});

test('완료 응답 없음: 다시 보내지 않고 network, 보관값은 sent로 남아 다시 열린 콜백은 already-sent, 쿠키가 바뀌었을 수 있어 이 탭은 [다시 로그인]만, 다른 탭은 한 번 복원', async () => {
  for (const mode of ['before-processing', 'drop-after-cookie']) {
    const server = fakeServer();
    server.seed('X');
    const markers = fakeStorage();
    const t = tab(server, { markers });
    const other = tab(server, { markers });
    await t.session.refresh();
    await other.session.refresh();
    const parsed = await readyCallback(server, t);
    if (mode === 'before-processing') server.fail('POST /auth/google/login'); else server.state.complete = 'drop-after-cookie';
    assert.deepEqual(await t.google.completeGoogleLogin(parsed.input), { kind: 'failed', reason: 'network' }, mode);
    assert.equal(server.count('POST /auth/google/login'), 1, mode);
    assert.equal(stored(t).sent, true, mode);
    const state = parsed.input.state;
    assert.deepEqual(t.google.readGoogleCallback(query(`state=${state}&code=c1`)), { kind: 'already-sent' }, mode);
    assert.equal(t.store.loginChangeDetected(), true, mode);
    assert.equal(t.store.getSnapshot().reloginOnly, true, mode); // A 합의 1: 세션 확인으로 이번 로그인 성공을 판정하지 않으므로 자동 복원 없음
    assert.deepEqual(await t.session.refresh(), { kind: 'not-started' }, mode); // 이전 세션 갱신으로 새 쿠키의 토큰을 받지 않음
    assert.deepEqual(await t.session.logout(), { kind: 'not-started' }, mode);
    assert.equal(server.count('POST /auth/refresh'), 2, mode); // 처음 두 복원뿐
    assert.deepEqual(await other.session.refresh(), { kind: 'signed-in' }, mode); // 다른 탭: 바뀐 표식을 감지해 지금 쿠키로 한 번 복원(팀장 결정 2)
    for (let i = 0; i < 20; i += 1) await tick();
    assert.equal(server.count('POST /auth/refresh'), 3, mode);
    assert.equal(other.store.loginChangeDetected(), false, mode);
    assert.equal(server.count('POST /auth/google/login'), 1, mode); // 로그인 완료 요청은 다시 보내지 않음
  }
});

test('완료 200 본문 오류: 반영하지 않고 invalid-response, 쿠키가 바뀌었으므로 감지·무효화', async () => {
  const server = fakeServer();
  const t = tab(server);
  const parsed = await readyCallback(server, t);
  server.state.complete = 'malformed';
  assert.deepEqual(await t.google.completeGoogleLogin(parsed.input), { kind: 'failed', reason: 'invalid-response' });
  assert.equal(t.attempts.map.size, 0);
  assert.equal(t.store.loginChangeDetected(), true);
});

test('같은 입력의 완료는 한 번만 보내고 결과를 함께 쓴다. 로그아웃 뒤에는 이전 성공 결과를 재사용하지 않는다', async () => {
  const server = fakeServer();
  const t = tab(server);
  const parsed = await readyCallback(server, t);
  const [a, b] = await Promise.all([t.google.completeGoogleLogin(parsed.input), t.google.completeGoogleLogin({ ...parsed.input })]);
  assert.deepEqual(a, { kind: 'signed-in', suggestedDisplayName: '구글이름' });
  assert.equal(b, a);
  assert.equal(server.count('POST /auth/google/login'), 1);
  assert.deepEqual(await t.google.completeGoogleLogin(parsed.input), a); // 같은 세대: 재사용
  assert.deepEqual(await t.session.logout(), { kind: 'settled', result: 'done' });
  assert.deepEqual(await t.google.completeGoogleLogin(parsed.input), { kind: 'failed', reason: 'superseded' });
  assert.equal(server.count('POST /auth/google/login'), 1);
});

test('완료는 갱신과 같은 잠금을 쓴다: 진행 중 갱신 응답 뒤에 보내 마지막 쿠키가 Google 로그인 것이고, 그 갱신 결과는 반영하지 않는다', async () => {
  const server = fakeServer();
  server.seed('X');
  const start = tab(server);
  const parsed = await readyCallback(server, start);
  // Google에 다녀온 콜백 페이지: 같은 탭 저장소(sessionStorage)를 쓰는 새 페이지. 이전 X 세션 갱신이 진행 중이다.
  const t = tab(server, { attempts: start.attempts });
  await t.session.refresh();
  const gate = server.hold('POST /auth/refresh');
  const refreshing = t.session.refresh();
  await tick(); await tick();
  const completing = t.google.completeGoogleLogin(parsed.input);
  await tick(); await tick();
  assert.equal(server.count('POST /auth/google/login'), 0);
  gate.resolve();
  assert.deepEqual(await refreshing, { kind: 'discarded', sent: true });
  assert.equal((await completing).kind, 'signed-in');
  assert.equal(server.jarMember(), 'G-c1');
});

test('이전 시도: 이 탭에서 다른 완료가 시작되면 잠금 대기 중인 앞 완료는 보내지 않고 superseded', async () => {
  const server = fakeServer();
  server.seed('X');
  const start = tab(server);
  const parsed = await readyCallback(server, start);
  const t = tab(server, { attempts: start.attempts }); // 콜백 페이지(새 페이지, 같은 sessionStorage)
  await t.session.refresh();
  const gate = server.hold('POST /auth/refresh');
  const refreshing = t.session.refresh();
  await tick(); await tick();
  const first = t.google.completeGoogleLogin(parsed.input);
  const second = t.google.completeGoogleLogin({ ...parsed.input, code: 'c2' });
  gate.resolve();
  await refreshing;
  assert.deepEqual(await first, { kind: 'failed', reason: 'superseded' });
  assert.equal((await second).kind, 'signed-in');
  assert.equal(server.count('POST /auth/google/login'), 1);
  assert.equal(server.jarMember(), 'G-c2');
});

test('sent 표시에 실패하면 보내지 않는다(새로고침 뒤 재전송을 막을 수 없으므로)', async () => {
  const server = fakeServer();
  const t = tab(server);
  const parsed = await readyCallback(server, t);
  t.attempts.failWrite = true;
  assert.deepEqual(await t.google.completeGoogleLogin(parsed.input), { kind: 'failed', reason: 'unavailable' });
  assert.equal(server.count('POST /auth/google/login'), 0);
  assert.equal(t.store.loginChangeDetected(), false);
  assert.notEqual(t.store.refreshStarted(), null); // 시도가 끝나 복원을 다시 시작할 수 있다
});

// ---- 회귀: 이전 완료 응답이 새 시도의 보관값을 지우지 않는다 ----

/** A 완료를 보내 응답을 붙잡아 둔 사이 B를 시작한다. A 응답을 풀어 결과와 B 보관값을 돌려준다. */
async function completeAWhileStartingB(server, t, { cancel = false, mode = 'ok' } = {}) {
  const startedA = await t.google.startGoogleLogin('/home');
  const stateA = new URL(startedA.authorizationUrl).searchParams.get('state');
  const parsedA = t.google.readGoogleCallback(query(cancel ? `state=${stateA}&error=access_denied` : `state=${stateA}&code=a1`));
  const gate = server.hold('POST /auth/google/login');
  const completingA = t.google.completeGoogleLogin(parsedA.input);
  for (let i = 0; i < 20 && server.count('POST /auth/google/login') < 1; i += 1) await tick();
  assert.equal(server.count('POST /auth/google/login'), 1); // A는 이미 보냈다
  server.state.complete = mode;
  const startedB = await t.google.startGoogleLogin('/links');
  assert.equal(startedB.kind, 'ready');
  const stateB = new URL(startedB.authorizationUrl).searchParams.get('state');
  const storedB = t.attempts.map.get(GOOGLE_ATTEMPT_KEY);
  gate.resolve();
  const resultA = await completingA;
  return { resultA, stateB, storedB };
}

test('[회귀] A 완료 응답(성공)이 늦게 와도 B 보관값을 지우지 않고, B 시작 뒤라 A 성공은 반영하지 않으며(최근 시도만 반영) B는 그대로 완료할 수 있다', async () => {
  const server = fakeServer();
  const t = tab(server);
  const { resultA, stateB, storedB } = await completeAWhileStartingB(server, t);
  assert.deepEqual(resultA, { kind: 'failed', reason: 'superseded' });
  assert.equal(t.attempts.map.get(GOOGLE_ATTEMPT_KEY), storedB); // B 보관값 그대로
  assert.equal(stored(t).state, stateB);
  assert.equal(stored(t).sent, false);
  assert.equal(t.store.getSnapshot().status, 'restoring'); // A 토큰으로 로그인하지 않음
  assert.equal(t.store.loginChangeDetected(), true); // A가 쿠키를 바꿨으므로 감지 기록(이미 보낸 요청의 쿠키 변경과 결과 무시는 별개)
  assert.equal(server.jarMember(), 'G-a1');
  const parsedB = t.google.readGoogleCallback(query(`state=${stateB}&code=b1`));
  assert.equal(parsedB.kind, 'complete');
  assert.equal(parsedB.next, '/links');
  assert.equal((await t.google.completeGoogleLogin(parsedB.input)).kind, 'signed-in');
  assert.equal(t.store.loginChangeDetected(), false);
  assert.equal(t.attempts.map.size, 0); // 정상 완료 뒤 삭제
  assert.equal(server.jarMember(), 'G-b1');
});

test('[회귀] A 완료 응답이 취소·오류여도 B 보관값을 지우지 않는다', async () => {
  for (const [options, expected] of [[{ cancel: true }, { kind: 'cancelled' }], [{ mode: 'server' }, { kind: 'failed', reason: 'server' }]]) {
    const server = fakeServer();
    const t = tab(server);
    const { resultA, stateB, storedB } = await completeAWhileStartingB(server, t, options);
    assert.deepEqual(resultA, expected);
    assert.equal(t.attempts.map.get(GOOGLE_ATTEMPT_KEY), storedB, JSON.stringify(options));
    assert.equal(stored(t).state, stateB);
    assert.equal(t.store.loginChangeDetected(), false); // 오류·취소 응답은 쿠키를 바꾸지 않음
  }
});

test('[회귀] 시작 실패는 시작한 로그인 시도를 끝내 복원·갱신을 막지 않는다', async () => {
  const server = fakeServer();
  server.state.start = 'server';
  const t = tab(server);
  assert.deepEqual(await t.google.startGoogleLogin('/home'), { kind: 'failed', reason: 'server' });
  assert.notEqual(t.store.refreshStarted(), null);
});

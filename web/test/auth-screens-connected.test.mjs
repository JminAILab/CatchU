import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAuthApi } from '../src/lib/auth-api.ts';
import { decideAuthGate } from '../src/lib/auth-gate.ts';
import { createGoogleAuth, GOOGLE_ATTEMPT_KEY } from '../src/lib/auth-google.ts';
import { createLoginMarker } from '../src/lib/auth-login-marker.ts';
import { createFetchLogoutTransport } from '../src/lib/auth-logout.ts';
import { createFetchRefreshTransport } from '../src/lib/auth-refresh.ts';
import { authScreenMessages as M } from '../src/lib/auth-screen-messages.ts';
import { createAuthSession, createSessionLock } from '../src/lib/auth-session.ts';
import { createAuthStore } from '../src/lib/auth-state.ts';
import { createGoogleCallbackControl, createGoogleStartControl } from '../src/lib/google-login-screen.ts';
import { lookupMemberWithAuth } from '../src/lib/member-lookup.ts';
import { confirmLogout, confirmReauthLeave, createMemberLogoutControl, logoutView } from '../src/lib/member-session-screen.ts';
import { createUnsavedRegistry } from '../src/lib/unsaved-changes.ts';

/**
 * #287 화면 제어에 #286 공통 함수(시도 보관·콜백 해석·완료, 세션·보호 API, 가드 판정)를 연결 코드(`session-*.tsx`)와 같은 방식으로 붙인 시험.
 * 서버(Google 시작·완료, 갱신, 로그아웃, `GET /v1/me`)와 `sessionStorage`·`localStorage`만 대역이다.
 * React 렌더링·실제 Google·브라우저·쿠키·다중 탭 검증이 아니다.
 */

const BASE = 'http://localhost:3001';
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; }

/** `localStorage`·`sessionStorage` 대역. 쓰기 실패를 켤 수 있다. */
function fakeStorage() {
  const map = new Map();
  const s = {
    map, failWrite: false,
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { if (s.failWrite) throw new Error('quota'); map.set(k, String(v)); },
    removeItem(k) { map.delete(k); },
  };
  return s;
}

/**
 * 서버 대역(실제 `Response`). Google 완료는 계약대로 성공(200)일 때만 Refresh 쿠키를 바꾼다(`jar`).
 * `GET /me`는 Access가 있으면 `displayName`으로 답한다. `fail`은 응답 없이 끊고, `hold`는 처리한 뒤 응답만 늦춘다.
 */
function fakeServer() {
  let serial = 0;
  const attempts = new Map();
  const sessions = new Map();
  const holds = new Map();
  const fails = new Set();
  const state = { jar: null, log: [], start: 'ok', complete: 'ok', logout: 'ok', displayName: '김캐치' };
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const err = (status, code) => json(status, { code, message: 'm' });
  const open = (member) => { const r = 'R' + ++serial; sessions.set(r, { member, used: false }); return r; };

  function handle(entry, init) {
    const body = init.body ? JSON.parse(init.body) : null;
    if (entry === 'POST /auth/google/authorization') {
      if (state.start === 'disabled') return { response: err(404, 'RESOURCE_UNAVAILABLE') };
      if (state.start === 'server') return { response: err(500, 'INTERNAL_ERROR') };
      if (state.start === 'malformed') return { response: json(200, { authorizationUrl: 'http://evil.example/?state=x', loginAttemptToken: 'k', expiresIn: 600 }) };
      const s = 'st' + ++serial;
      attempts.set(s, { token: 'lat' + serial, used: false });
      return { response: json(200, { authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?state=${s}`, loginAttemptToken: 'lat' + serial, expiresIn: 600 }) };
    }
    if (entry === 'POST /auth/google/login') {
      if (state.complete === 'server') return { response: err(500, 'INTERNAL_ERROR') };
      const attempt = attempts.get(body.state);
      if (!attempt || attempt.used || attempt.token !== body.loginAttemptToken) return { response: err(401, 'AUTH_INVALID') };
      attempt.used = true;
      if (body.error === 'access_denied') return { response: json(200, { cancelled: true }) };
      const member = 'G-' + body.code;
      return { response: json(200, { accessToken: `A-${member}`, tokenType: 'Bearer', expiresIn: 900, suggestedDisplayName: null }), setCookie: open(member) };
    }
    if (entry === 'POST /auth/refresh') {
      const rec = state.jar ? sessions.get(state.jar) : undefined;
      if (rec && !rec.used) {
        rec.used = true;
        return { response: json(200, { accessToken: `A-${rec.member}-${serial}`, tokenType: 'Bearer', expiresIn: 900 }), setCookie: open(rec.member) };
      }
      return { response: err(401, 'AUTH_INVALID'), setCookie: null };
    }
    if (entry === 'POST /auth/logout') {
      if (state.logout === 'server') return { response: err(500, 'INTERNAL_ERROR') };
      return { response: new Response(null, { status: 204 }), setCookie: null };
    }
    if (entry === 'GET /me') {
      const authorized = String(new Headers(init.headers).get('Authorization') ?? '').startsWith('Bearer A-');
      return { response: authorized ? json(200, { profile: { displayName: state.displayName } }) : err(401, 'AUTH_INVALID') };
    }
    return { response: err(404, 'RESOURCE_UNAVAILABLE') };
  }

  return {
    state,
    hold(entry) { const g = deferred(); holds.set(entry, g); return g; },
    fail(entry) { fails.add(entry); },
    count(entry) { return state.log.filter((l) => l === entry).length; },
    async fetch(url, init = {}) {
      const entry = `${init.method ?? 'GET'} ${new URL(url).pathname.replace(/^\/v1/, '')}`;
      state.log.push(entry);
      await tick();
      if (fails.has(entry)) { fails.delete(entry); throw new TypeError('network'); }
      const { response, setCookie } = handle(entry, init);
      const gate = holds.get(entry);
      if (gate) { holds.delete(entry); await gate.promise; }
      if (init.credentials === 'include' && setCookie !== undefined) state.jar = setCookie;
      return response;
    },
  };
}

/** 한 페이지: 공통 인증 묶음(`auth-runtime.ts`와 같은 구성). 새로고침은 같은 `attempts`·`markers`로 새 페이지를 만든다. */
function page(server, { attempts = fakeStorage(), markers = fakeStorage() } = {}) {
  const fetch = (u, i) => server.fetch(u, i);
  const store = createAuthStore();
  const session = createAuthSession({ store, marker: createLoginMarker({ storage: markers }), lock: createSessionLock({ locks: null }),
    refreshTransport: createFetchRefreshTransport({ baseUrl: BASE, nodeEnv: 'test', fetch }),
    logoutTransport: createFetchLogoutTransport({ baseUrl: BASE, nodeEnv: 'test', fetch }) });
  const api = createAuthApi({ baseUrl: BASE, nodeEnv: 'test', store, session, fetch });
  const google = createGoogleAuth({ baseUrl: BASE, nodeEnv: 'test', store, session, storage: attempts, fetch, now: () => 1_000_000 });
  return { store, session, api, google, attempts, markers };
}

/** `session-google-callback.tsx`가 콜백 화면에 넘기는 것과 같은 함수. */
function callbackScreen(p) {
  return createGoogleCallbackControl({
    readCallback: (q) => p.google.readGoogleCallback(q),
    completeGoogleLogin: (input) => p.google.completeGoogleLogin(input),
    lookupMember: () => lookupMemberWithAuth(p.api.member),
  });
}

/** 로그인 화면에서 Google 버튼을 눌러 시도를 보관하고, Google이 돌려줄 `state`를 얻는다. */
async function pressGoogle(p, next) {
  const started = await p.google.startGoogleLogin(next);
  assert.equal(started.kind, 'ready');
  return new URL(started.authorizationUrl).searchParams.get('state');
}

/** Google 로그인 성공까지. 회원 화면을 연 세대를 돌려준다. */
async function signInWithGoogle(server, p, code = 'c1') {
  const state = await pressGoogle(p, '/home');
  await callbackScreen(p).begin(() => new URLSearchParams(`state=${state}&code=${code}`), () => {});
  assert.equal(p.store.getSnapshot().status, 'signed-in');
  return p.store.getSnapshot().generation;
}

const query = (s) => new URLSearchParams(s);
const dirtyRegistry = () => { const r = createUnsavedRegistry(); r.register(() => true); return r; };
/** 사유별 등록. 분석 요청(`unconfirmed-analysis-request`)은 #153·#154 화면이 할 등록의 대역이다. */
const reasonRegistry = (...reasons) => { const r = createUnsavedRegistry(); for (const reason of reasons) r.register(() => true, reason); return r; };

// ---- 콜백 화면 ----

test('콜백: 효과 재실행·query 제거 뒤에도 처음 해석으로 완료 요청 1회, 성공하면 회원 조회 뒤 다시 검사한 next로 간다', async () => {
  const server = fakeServer();
  const p = page(server);
  const state = await pressGoogle(p, '/assets?repositoryId=r1');
  let q = query(`state=${state}&code=c1`);
  const clear = () => { q = new URLSearchParams(); };
  const control = callbackScreen(p);
  const run = control.begin(() => q, clear);
  assert.equal(control.begin(() => q, clear), run, '개발 모드의 효과 두 번 실행에도 같은 진행');
  assert.equal(q.toString(), '', '해석 결과를 보존한 뒤 code·state를 지운다');
  await run;
  assert.equal(control.begin(() => q, clear), run, '지운 주소로 다시 해석하지 않는다');
  assert.equal(server.count('POST /auth/google/login'), 1);
  assert.equal(server.count('GET /me'), 1);
  assert.deepEqual(control.getView(), { phase: 'redirect', to: '/assets?repositoryId=r1' });
  assert.ok(!JSON.stringify(control.getView()).includes(state));
  assert.equal(p.attempts.map.has(GOOGLE_ATTEMPT_KEY), false, '완료 응답을 받으면 보관값을 지운다');
});

test('콜백: 이름이 빈 회원은 next 대신 최초 입력으로 간다', async () => {
  const server = fakeServer();
  server.state.displayName = '';
  const p = page(server);
  const state = await pressGoogle(p, '/publications');
  const control = callbackScreen(p);
  await control.begin(() => query(`state=${state}&code=c1`), () => {});
  assert.deepEqual(control.getView(), { phase: 'redirect', to: '/profile/setup' });
});

test('콜백: 완료 응답 전에 새로고침으로 다시 열린 콜백은 다시 보내지 않고 새 로그인을 안내한다', async () => {
  const server = fakeServer();
  const p = page(server);
  const state = await pressGoogle(p, '/assets');
  const gate = server.hold('POST /auth/google/login');
  const run = callbackScreen(p).begin(() => query(`state=${state}&code=c1`), () => {});
  await tick(); await tick();
  assert.equal(server.count('POST /auth/google/login'), 1);
  // 새로고침: 페이지 메모리는 새로 만들어지고 이 탭의 sessionStorage·localStorage만 남는다. 주소는 Google이 돌려준 그대로다.
  const reloaded = callbackScreen(page(server, { attempts: p.attempts, markers: p.markers }));
  await reloaded.begin(() => query(`state=${state}&code=c1`), () => {});
  assert.deepEqual(reloaded.getView(), { phase: 'notice', notice: M.callbackAlreadySent, loginHref: '/login' });
  gate.resolve();
  await run;
  assert.equal(server.count('POST /auth/google/login'), 1);
});

test('콜백: 완료 응답 전에 query가 지워진 주소를 탭 복제·새로고침으로 다시 열면 합의 문구로 안내하고 다시 보내지 않는다', async () => {
  const server = fakeServer();
  const p = page(server);
  const state = await pressGoogle(p, '/assets');
  const gate = server.hold('POST /auth/google/login');
  let q = query(`state=${state}&code=c1`);
  const run = callbackScreen(p).begin(() => q, () => { q = new URLSearchParams(); });
  await tick(); await tick();
  assert.equal(q.toString(), '', '원래 탭이 해석 뒤 query를 지웠다');
  assert.equal(server.count('POST /auth/google/login'), 1);
  const notice = { phase: 'notice', notice: '로그인 결과를 확인하지 못했습니다. 다시 로그인해 주세요.', loginHref: '/login' };
  // 탭 복제: 그때의 sessionStorage가 복사되고 localStorage는 같다. 주소는 query가 지워진 그대로다.
  const copied = fakeStorage();
  copied.map.set(GOOGLE_ATTEMPT_KEY, p.attempts.map.get(GOOGLE_ATTEMPT_KEY));
  const duplicate = callbackScreen(page(server, { attempts: copied, markers: p.markers }));
  await duplicate.begin(() => q, () => {});
  assert.deepEqual(duplicate.getView(), notice);
  // 새로고침: 같은 sessionStorage로 새 페이지를 만든다.
  const reloaded = callbackScreen(page(server, { attempts: p.attempts, markers: p.markers }));
  await reloaded.begin(() => q, () => {});
  assert.deepEqual(reloaded.getView(), notice);
  gate.resolve();
  await run;
  // 원래 탭이 로그인을 마쳐도 복제 탭은 따라 이동하지 않고 [다시 로그인]을 유지한다(의도한 동작).
  assert.equal(p.store.getSnapshot().status, 'signed-in');
  assert.deepEqual(duplicate.getView(), notice);
  assert.equal(server.count('POST /auth/google/login'), 1, '완료 요청을 다시 보내지 않는다');
  assert.equal(server.count('POST /auth/refresh'), 0, '세션 확인으로 성공을 판정하지 않는다');
});

test('콜백: 응답을 받지 못한 시도(sent 유지)를 query 없이 다시 열어도 합의 문구로 안내하고 다시 보내지 않는다', async () => {
  const server = fakeServer();
  const p = page(server);
  const state = await pressGoogle(p, '/assets');
  server.fail('POST /auth/google/login');
  await callbackScreen(p).begin(() => query(`state=${state}&code=c1`), () => {});
  const reloaded = callbackScreen(page(server, { attempts: p.attempts, markers: p.markers }));
  await reloaded.begin(() => query(''), () => {});
  assert.deepEqual(reloaded.getView(), { phase: 'notice', notice: '로그인 결과를 확인하지 못했습니다. 다시 로그인해 주세요.', loginHref: '/login' });
  assert.equal(server.count('POST /auth/google/login'), 1);
});

test('콜백: query 없는 주소의 안내는 시도 없음·만료·보내지 않은 시도에서 그대로이고 완료 요청을 보내지 않는다', async () => {
  const server = fakeServer();
  const open = async (attempts) => {
    const control = callbackScreen(page(server, { attempts }));
    await control.begin(() => query(''), () => {});
    return control.getView();
  };
  assert.deepEqual(await open(fakeStorage()), { phase: 'notice', notice: M.callbackAttemptUnverified, loginHref: '/login' }, '시도 없음');
  const p = page(server);
  await pressGoogle(p, '/assets');
  const stored = JSON.parse(p.attempts.map.get(GOOGLE_ATTEMPT_KEY));
  assert.deepEqual(await open(p.attempts), { phase: 'notice', notice: M.callbackLoginFailed, loginHref: '/login' }, '보내지 않은 시도');
  p.attempts.map.set(GOOGLE_ATTEMPT_KEY, JSON.stringify({ ...stored, sent: true, expiresAt: 0 }));
  assert.deepEqual(await open(p.attempts), { phase: 'notice', notice: M.callbackAttemptUnverified, loginHref: '/login' }, '보낸 시도의 만료');
  assert.equal(p.attempts.map.has(GOOGLE_ATTEMPT_KEY), false);
  assert.equal(server.count('POST /auth/google/login'), 0);
});

test('콜백: 완료 뒤 뒤로 가기로 다시 열린 콜백(보관값 없음)은 새 로그인을 안내하고 보내지 않는다', async () => {
  const server = fakeServer();
  const p = page(server);
  const state = await pressGoogle(p, '/assets');
  await callbackScreen(p).begin(() => query(`state=${state}&code=c1`), () => {});
  const back = callbackScreen(page(server, { attempts: p.attempts, markers: p.markers }));
  await back.begin(() => query(`state=${state}&code=c1`), () => {});
  assert.deepEqual(back.getView(), { phase: 'notice', notice: M.callbackAttemptUnverified, loginHref: '/login' });
  assert.equal(server.count('POST /auth/google/login'), 1);
});

test('콜백 취소: access_denied는 취소 안내와 next를 유지한 [다시 로그인]이며 쿠키·로그인을 만들지 않는다', async () => {
  const server = fakeServer();
  const p = page(server);
  const state = await pressGoogle(p, '/home');
  const control = callbackScreen(p);
  await control.begin(() => query(`state=${state}&error=access_denied`), () => {});
  assert.deepEqual(control.getView(), { phase: 'notice', notice: M.googleCancelled, loginHref: '/login?next=%2Fhome' });
  assert.equal(server.state.jar, null);
  assert.notEqual(p.store.getSnapshot().status, 'signed-in');
});

test('콜백 완료 실패(401 시도 무효·500)는 로그인 실패 안내이고 회원 인증 만료로 바꾸지 않으며 다시 보내지 않는다', async () => {
  for (const mode of ['attempt-invalid', 'server']) {
    const server = fakeServer();
    const p = page(server);
    const state = await pressGoogle(p, '/assets');
    if (mode === 'server') server.state.complete = 'server';
    else p.attempts.setItem(GOOGLE_ATTEMPT_KEY, JSON.stringify({ ...JSON.parse(p.attempts.getItem(GOOGLE_ATTEMPT_KEY)), loginAttemptToken: 'wrong' }));
    const control = callbackScreen(p);
    await control.begin(() => query(`state=${state}&code=c1`), () => {});
    assert.deepEqual(control.getView(), { phase: 'notice', notice: M.callbackLoginFailed, loginHref: '/login?next=%2Fassets' }, mode);
    assert.notEqual(p.store.getSnapshot().status, 'reauth-required', mode);
    assert.equal(server.count('POST /auth/google/login'), 1, mode);
  }
});

test('콜백 응답 유실은 다시 보내지 않고 새 로그인을 안내하며, 이 탭은 「확인 중」에 남지 않고 새 로그인을 받는다', async () => {
  const server = fakeServer();
  const p = page(server);
  const state = await pressGoogle(p, '/assets');
  server.fail('POST /auth/google/login');
  const control = callbackScreen(p);
  await control.begin(() => query(`state=${state}&code=c1`), () => {});
  assert.deepEqual(control.getView(), { phase: 'notice', notice: M.callbackNetworkFailed, loginHref: '/login?next=%2Fassets' });
  assert.equal(server.count('POST /auth/google/login'), 1);
  // 로그인 화면은 복원 중이면서 확인하지 못한 상태에서 새 로그인을 받는다(session-login-panel.tsx의 canLogin).
  const snapshot = p.store.getSnapshot();
  assert.deepEqual([snapshot.status, snapshot.restoreUnconfirmed, snapshot.canRetryRestore], ['restoring', true, false]);
  assert.equal(server.count('POST /auth/refresh'), 0, '세션 확인으로 성공을 판정하지 않는다');
});

test('콜백: 완료 응답을 기다리는 동안 같은 탭에서 새 로그인을 시작하면, 이전 완료의 늦은 성공은 반영하지 않고 안내·이동 없이 넘긴다', async () => {
  const server = fakeServer();
  const p = page(server);
  const state = await pressGoogle(p, '/assets');
  const gate = server.hold('POST /auth/google/login');
  const control = callbackScreen(p);
  const run = control.begin(() => query(`state=${state}&code=c1`), () => {});
  await tick(); await tick();
  assert.equal(server.count('POST /auth/google/login'), 1);
  p.store.loginStarted(); // 같은 탭의 새 로그인 시작(로그인 화면의 Google 버튼 등)
  gate.resolve();
  await run;
  assert.deepEqual(control.getView(), { phase: 'ignored', loginHref: '/login?next=%2Fassets' });
  assert.notEqual(p.store.getSnapshot().status, 'signed-in');
  assert.equal(server.count('GET /me'), 0);
});

// ---- Google 버튼 ----

test('Google 버튼: 연타해도 시작 요청 1회이고, 준비되면 Google 주소로 이동하며 버튼을 막아 둔다', async () => {
  const server = fakeServer();
  const p = page(server);
  const redirects = [];
  const control = createGoogleStartControl({ start: (n) => p.google.startGoogleLogin(n), redirect: (u) => redirects.push(u) });
  control.attach();
  await Promise.all([control.press('/assets'), control.press('/assets')]);
  assert.equal(server.count('POST /auth/google/authorization'), 1);
  assert.equal(redirects.length, 1);
  assert.equal(new URL(redirects[0]).host, 'accounts.google.com');
  assert.equal(JSON.parse(p.attempts.getItem(GOOGLE_ATTEMPT_KEY)).next, '/assets');
  assert.deepEqual(control.getView(), { busy: true, notice: null });
});

test('Google 버튼: 시작 실패·보관 실패는 이유별로 안내하고 이동하지 않으며 다시 누를 수 있다', async () => {
  const cases = [
    ['disabled', M.googleUnavailable], ['server', M.startLoginFailed], ['malformed', M.startLoginFailed], ['network', M.startNetworkFailed], ['storage', M.googleUnavailable],
  ];
  for (const [mode, notice] of cases) {
    const server = fakeServer();
    const p = page(server);
    if (mode === 'network') server.fail('POST /auth/google/authorization');
    else if (mode === 'storage') p.attempts.failWrite = true;
    else server.state.start = mode;
    const control = createGoogleStartControl({ start: (n) => p.google.startGoogleLogin(n), redirect: () => assert.fail(`${mode}: 이동하면 안 된다`) });
    control.attach();
    await control.press(null);
    assert.deepEqual(control.getView(), { busy: false, notice }, mode);
  }
});

// ---- 로그아웃 ----

test('로그아웃: 실패(500)는 완료로 보지 않고 실패 안내와 [다시 시도]를 보이며 가드는 정리·이동하지 않는다', async () => {
  const server = fakeServer();
  const p = page(server);
  const shown = await signInWithGoogle(server, p);
  server.state.logout = 'server';
  const control = createMemberLogoutControl({ logout: () => p.session.logout(), confirmLeave: () => true });
  assert.deepEqual(await control.request(p.store.getSnapshot()), { kind: 'settled', result: 'failed' });
  const snapshot = p.store.getSnapshot();
  assert.deepEqual(logoutView(snapshot, control.getLocal()), { pending: false, notice: { message: M.logoutFailedRetry, retry: true } });
  assert.deepEqual(decideAuthGate(snapshot, shown), { action: 'show', reauth: false });
});

test('로그아웃: 응답 유실(unknown)은 화면을 두고 다시 시도를 안내하며, 다시 시도가 done이면 화면 안내 없이 가드가 비로그인 홈으로 보낸다', async () => {
  const server = fakeServer();
  const p = page(server);
  const shown = await signInWithGoogle(server, p);
  server.fail('POST /auth/logout');
  const control = createMemberLogoutControl({ logout: () => p.session.logout(), confirmLeave: () => true });
  assert.deepEqual(await control.request(p.store.getSnapshot()), { kind: 'settled', result: 'unknown' });
  const afterUnknown = p.store.getSnapshot();
  assert.deepEqual(logoutView(afterUnknown, control.getLocal()), { pending: false, notice: { message: M.logoutUnknownRetry, retry: true } });
  assert.notEqual(decideAuthGate(afterUnknown, shown).action, 'to-landing');

  assert.deepEqual(await control.request(p.store.getSnapshot()), { kind: 'settled', result: 'done' });
  const afterDone = p.store.getSnapshot();
  assert.deepEqual(logoutView(afterDone, control.getLocal()), { pending: false, notice: null });
  assert.deepEqual(decideAuthGate(afterDone, shown), { action: 'to-landing' });
  assert.equal(server.count('POST /auth/logout'), 2);
});

test('로그아웃: 미저장 확인에서 머무르면 요청하지 않는다', async () => {
  const server = fakeServer();
  const p = page(server);
  await signInWithGoogle(server, p);
  const control = createMemberLogoutControl({ logout: () => p.session.logout(), confirmLeave: () => false });
  assert.equal(await control.request(p.store.getSnapshot()), 'stayed');
  assert.equal(server.count('POST /auth/logout'), 0);
  assert.equal(p.store.getSnapshot().status, 'signed-in');
});

test('로그아웃: 미저장 입력과 미확정 분석 요청이 함께 있으면 확인 창을 한 번 띄우고, 머무르면 요청 없이 로그인을 유지하며, 계속하면 기존 흐름대로 가드가 비로그인 홈으로 보낸다', async () => {
  const server = fakeServer();
  const p = page(server);
  const shown = await signInWithGoogle(server, p);
  const registry = reasonRegistry('unsaved-input', 'unconfirmed-analysis-request');
  const asked = [];
  let answer = false;
  // session-member-shell.tsx의 useMemberLogout과 같은 연결이다.
  const control = createMemberLogoutControl({
    logout: () => p.session.logout(),
    confirmLeave: () => confirmLogout(registry, (m) => { asked.push(m); return answer; }),
  });
  assert.equal(await control.request(p.store.getSnapshot()), 'stayed');
  assert.equal(server.count('POST /auth/logout'), 0);
  assert.equal(p.store.getSnapshot().status, 'signed-in');
  assert.deepEqual(decideAuthGate(p.store.getSnapshot(), shown), { action: 'show', reauth: false });
  answer = true;
  assert.deepEqual(await control.request(p.store.getSnapshot()), { kind: 'settled', result: 'done' });
  assert.equal(server.count('POST /auth/logout'), 1);
  assert.deepEqual(decideAuthGate(p.store.getSnapshot(), shown), { action: 'to-landing' });
  assert.deepEqual(asked, [M.logoutUnsavedRequestConfirm, M.logoutUnsavedRequestConfirm]);
});

// ---- 재인증 안내 ----

test('재인증: 같은 세션의 갱신 거부는 회원 화면 위 안내(variant 생략)이고, [다시 로그인]은 미저장 확인을 거치며 로그아웃을 보내지 않는다', async () => {
  const server = fakeServer();
  const p = page(server);
  const shown = await signInWithGoogle(server, p);
  server.state.jar = null; // 세션이 끝나 갱신이 401로 거부된다.
  await p.session.refresh();
  const snapshot = p.store.getSnapshot();
  assert.equal(snapshot.status, 'reauth-required');
  assert.equal(snapshot.generation, shown, '세대를 바꾸지 않아 화면·입력을 유지한다');
  assert.deepEqual(decideAuthGate(snapshot, shown), { action: 'show', reauth: true });
  const asked = [];
  // session-member-guard.tsx는 이때 variant 없이 넘긴다.
  assert.equal(confirmReauthLeave(undefined, dirtyRegistry(), (m) => { asked.push(m); return false; }), false);
  assert.deepEqual(asked, [M.reauthUnsavedConfirm]);
  assert.equal(server.count('POST /auth/logout'), 0);
});

test('재인증: 미확정 분석 요청만 있거나 미저장 입력과 함께 있으면 사유에 맞는 확인을 한 번 거치고, [다시 로그인]으로 갱신·로그아웃을 보내지 않는다', async () => {
  const server = fakeServer();
  const p = page(server);
  const shown = await signInWithGoogle(server, p);
  server.state.jar = null; // 세션이 끝나 갱신이 401로 거부된다.
  await p.session.refresh();
  assert.deepEqual(decideAuthGate(p.store.getSnapshot(), shown), { action: 'show', reauth: true });
  const refreshes = server.count('POST /auth/refresh');
  for (const [registry, message] of [
    [reasonRegistry('unconfirmed-analysis-request'), M.reauthRequestConfirm],
    [reasonRegistry('unsaved-input', 'unconfirmed-analysis-request'), M.reauthUnsavedRequestConfirm],
  ]) {
    const asked = [];
    assert.equal(confirmReauthLeave(undefined, registry, (m) => { asked.push(m); return false; }), false, '머무르면 이동하지 않는다');
    assert.equal(confirmReauthLeave(undefined, registry, (m) => { asked.push(m); return true; }), true, '계속하면 로그인 화면으로 간다');
    assert.deepEqual(asked, [message, message]);
  }
  assert.equal(server.count('POST /auth/refresh'), refreshes);
  assert.equal(server.count('POST /auth/logout'), 0);
});

test('재인증: 갱신 응답 유실 뒤 다른 탭의 새 로그인을 감지하면 가드는 relogin-only(login-changed)이고, [다시 로그인]은 묻지 않으며 갱신·로그아웃을 보내지 않는다', async () => {
  const server = fakeServer();
  const markers = fakeStorage(); // 같은 브라우저의 localStorage
  const a = page(server, { markers });
  const shown = await signInWithGoogle(server, a, 'a1');
  server.fail('POST /auth/refresh');
  await a.session.refresh();
  assert.equal(a.store.getSnapshot().status, 'reauth-required');
  const b = page(server, { markers });
  await signInWithGoogle(server, b, 'b1'); // 다른 탭의 새 로그인이 표식을 바꾼다.
  const refreshes = server.count('POST /auth/refresh');
  a.session.checkLoginMarker();
  const snapshot = a.store.getSnapshot();
  assert.equal(snapshot.reloginOnly, true);
  assert.deepEqual(decideAuthGate(snapshot, shown), { action: 'relogin-only' });
  assert.equal(confirmReauthLeave('login-changed', dirtyRegistry(), () => assert.fail('login-changed는 묻지 않는다')), true);
  assert.equal(server.count('POST /auth/refresh'), refreshes);
  assert.equal(server.count('POST /auth/logout'), 0);
});

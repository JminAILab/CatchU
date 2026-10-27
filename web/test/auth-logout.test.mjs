import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAuthStore } from '../src/lib/auth-state.ts';
import { createRefreshClient, createTabLock } from '../src/lib/auth-refresh.ts';
import { classifyLogout, createFetchLogoutTransport, createLogoutClient } from '../src/lib/auth-logout.ts';

const tick = () => new Promise((resolve) => setImmediate(resolve));
const ENDED = { kind: 'ended' };
const err = (status, code) => ({ kind: 'error', status, code });

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

/** 정해 둔 응답을 차례로 돌려주는 호출 대역. `gate`를 주면 그 약속이 풀릴 때까지 응답을 늦춘다. */
function scripted(...responses) {
  const calls = [];
  const transport = async () => {
    const next = responses.shift();
    if (!next) throw new Error('unexpected extra logout request');
    calls.push(next);
    if (next.gate) await next.gate;
    if (next.throws) throw new Error('unexpected');
    return next.result ?? next;
  };
  return { transport, calls };
}

/** `hold`가 풀릴 때까지 잠금을 내주지 않는 탭 잠금(잠금 대기 재현용). */
function heldLock(hold) {
  const inner = createTabLock();
  return { run: (task) => inner.run(async () => { await hold; return task(); }) };
}

/** 로그인 상태 저장소와, 같은 잠금을 쓰는 갱신·로그아웃 클라이언트. */
function setup({ logout, refresh = async () => ({ kind: 'issued', accessToken: 'access-r' }), lock = createTabLock(), token = 'access-1' } = {}) {
  const store = createAuthStore();
  store.signedIn(token);
  const refreshClient = createRefreshClient({ store, transport: refresh, lock });
  const logoutClient = createLogoutClient({ store, transport: logout, session: refreshClient });
  return { store, refreshClient, logoutClient };
}

/**
 * 서버·쿠키 대역. 실제 서버(api/src/auth/session.service.ts·session.controller.ts)의 규칙을 흉내 낸다.
 * - 갱신: 미사용 Refresh는 교체, 사용된 Refresh는 세션 폐기 후 401과 쿠키 삭제.
 * - 로그아웃: 현재 또는 사용된 Refresh로 세션을 찾아 폐기하고 204와 쿠키 삭제. 쿠키가 없어도 204.
 * - 브라우저는 응답이 도착한 순서대로 쿠키 하나를 덮어쓴다.
 * 실제 서버·브라우저 검증이 아니며, 이 대역 결과를 실제 다중 탭 검증으로 보지 않는다.
 */
function fakeBrowser() {
  let serial = 0;
  const tokens = new Map(); // Refresh → { sid, used }
  const sessions = new Map(); // 세션 → { member, revoked }
  const state = { jar: null, log: [] };
  const mint = (sid) => { const t = 'C' + ++serial; tokens.set(t, { sid, used: false }); return t; };
  const open = (member) => { const sid = 'S' + (sessions.size + 1); sessions.set(sid, { member, revoked: false }); return mint(sid); };
  state.jar = open('X');
  const after = async (hold) => { if (hold) await hold; };
  return {
    state,
    /** 갱신 대역. hold: 서버 처리 뒤 응답 도착을 늦춘다. */
    refresh: (hold) => async () => {
      const sent = state.jar;
      await tick();
      const record = sent ? tokens.get(sent) : undefined;
      let set = null;
      if (record && !record.used && !sessions.get(record.sid).revoked) { record.used = true; set = mint(record.sid); }
      else if (record?.used) sessions.get(record.sid).revoked = true;
      state.log.push(`refresh ${sent ?? 'none'}→${set ? 200 : 401}`);
      await after(hold);
      state.jar = set;
      return set ? { kind: 'issued', accessToken: `access-${sessions.get(record.sid).member}-${set}` } : err(401, 'AUTH_INVALID');
    },
    /** 로그아웃 대역. delivery: 'full' | 'lost'(응답 유실, 쿠키 삭제 미반영). hold: 서버 처리 뒤 응답 도착을 늦춘다. */
    logout: ({ delivery = 'full', hold } = {}) => async () => {
      const sent = state.jar;
      await tick();
      const record = sent ? tokens.get(sent) : undefined;
      if (record) sessions.get(record.sid).revoked = true;
      state.log.push(`logout ${sent ?? 'none'}→204`);
      await after(hold);
      if (delivery === 'lost') return { kind: 'no-response' };
      state.jar = null;
      return ENDED;
    },
    /** 새 로그인 완료 대역: 새 세션을 만들고 응답이 도착하면 쿠키를 덮어쓴다. */
    login: async (member) => {
      await tick();
      const fresh = open(member);
      state.log.push(`login ${member}`);
      state.jar = fresh;
      return `access-${member}-${fresh}`;
    },
    memberOfJar: () => (state.jar ? sessions.get(tokens.get(state.jar).sid).member : null),
    revoked: (member) => [...sessions.values()].some((s) => s.member === member && s.revoked),
  };
}

// ---- 응답 분류 ----

test('204는 done, 계약상 쿠키를 바꾸지 않는 거부·실패와 주소 설정 없음은 failed다', () => {
  assert.equal(classifyLogout(ENDED), 'done');
  for (const response of [err(403, 'AUTH_ORIGIN_FORBIDDEN'), err(400, 'VALIDATION_FAILED'), err(500, 'INTERNAL_ERROR'), { kind: 'not-sent' }]) {
    assert.equal(classifyLogout(response), 'failed', JSON.stringify(response));
  }
});

test('응답 없음·코드를 읽을 수 없는 응답·그 밖의 상태는 unknown이다', () => {
  for (const response of [{ kind: 'no-response' }, err(502, null), err(503, null), err(504, null), err(500, null), err(500, 'OTHER'),
    err(200, null), err(401, 'AUTH_INVALID'), err(403, null), err(429, null)]) {
    assert.equal(classifyLogout(response), 'unknown', JSON.stringify(response));
  }
});

// ---- 실제 호출 함수(fetch 대역) ----

test('로그아웃 요청은 본문·Authorization 없이 쿠키를 싣고 캐시하지 않으며, 204만 종료로 본다', async () => {
  const seen = [];
  const fetch = async (url, init) => { seen.push({ url, init }); return new Response(null, { status: 204 }); };
  const transport = createFetchLogoutTransport({ baseUrl: 'http://localhost:3001/', nodeEnv: 'test', fetch });
  assert.deepEqual(await transport(), ENDED);
  assert.equal(seen[0].url, 'http://localhost:3001/v1/auth/logout');
  assert.deepEqual(seen[0].init, { method: 'POST', headers: { Accept: 'application/json' }, cache: 'no-store', credentials: 'include' });
});

test('오류 응답은 코드만 읽고, 연결 실패는 응답 없음, 주소 설정이 없으면 보내지 않는다', async () => {
  const run = (fetch) => createFetchLogoutTransport({ baseUrl: 'http://localhost:3001', nodeEnv: 'test', fetch })();
  assert.deepEqual(await run(async () => new Response('{"code":"AUTH_ORIGIN_FORBIDDEN","message":"x"}', { status: 403 })),
    err(403, 'AUTH_ORIGIN_FORBIDDEN'));
  assert.deepEqual(await run(async () => new Response('<html>', { status: 502 })), err(502, null));
  assert.deepEqual(await run(async () => new Response('{}', { status: 200 })), err(200, null));
  assert.deepEqual(await run(async () => { throw new TypeError('network'); }), { kind: 'no-response' });
  let called = false;
  const unset = createFetchLogoutTransport({ baseUrl: undefined, fetch: async () => { called = true; } });
  assert.deepEqual(await unset(), { kind: 'not-sent' });
  assert.equal(called, false);
});

// ---- 정상·실패·응답 유실 ----

test('done이면 토큰을 버리고 비로그인으로 바꾸며 화면 정리를 허용한다', async () => {
  const { store, logoutClient } = setup({ logout: scripted(ENDED).transport });
  assert.deepEqual(await logoutClient.logout(), { kind: 'settled', result: 'done' });
  const s = store.getSnapshot();
  assert.deepEqual([s.status, s.sessionHold, s.canCleanUpAfterLogout], ['signed-out', null, true]);
  assert.equal(store.accessToken(), null);
});

test('failed는 상태·토큰을 유지하고, 다시 시도하면 새 요청을 보낸다', async () => {
  const { transport, calls } = scripted(err(500, 'INTERNAL_ERROR'), ENDED);
  const { store, logoutClient } = setup({ logout: transport });
  assert.deepEqual(await logoutClient.logout(), { kind: 'settled', result: 'failed' });
  assert.deepEqual([store.getSnapshot().status, store.getSnapshot().canRetryLogout, store.accessToken()], ['signed-in', true, 'access-1']);
  assert.deepEqual(await logoutClient.logout(), { kind: 'settled', result: 'done' });
  assert.equal(calls.length, 2);
});

test('응답 유실은 unknown: 자동으로 다시 보내지 않고, 결과 확인 전에는 갱신을 보내지 않으며 다시 시도만 허용한다', async () => {
  const { transport, calls } = scripted({ kind: 'no-response' }, ENDED);
  let refreshes = 0;
  const { store, refreshClient, logoutClient } = setup({ logout: transport, refresh: async () => { refreshes += 1; return { kind: 'no-response' }; } });
  assert.deepEqual(await logoutClient.logout(), { kind: 'settled', result: 'unknown' });
  assert.equal(calls.length, 1);
  assert.deepEqual([store.getSnapshot().status, store.getSnapshot().sessionHold], ['signed-in', 'logout-unknown']);
  assert.deepEqual(await refreshClient.refresh(), { kind: 'not-started' });
  assert.equal(refreshes, 0);
  assert.deepEqual(await logoutClient.logout(), { kind: 'settled', result: 'done' });
  assert.equal(calls.length, 2);
});

test('진행 중에 다시 부르면 요청을 하나만 보낸다', async () => {
  const gate = deferred();
  const { transport, calls } = scripted({ result: ENDED, gate: gate.promise });
  const { logoutClient } = setup({ logout: transport });
  const first = logoutClient.logout();
  assert.deepEqual(await logoutClient.logout(), { kind: 'not-started' });
  gate.resolve();
  assert.deepEqual(await first, { kind: 'settled', result: 'done' });
  assert.equal(calls.length, 1);
});

test('잠금이나 호출 함수의 예기치 않은 예외: 보내기 전이면 failed, 보낸 뒤면 unknown', async () => {
  const store = createAuthStore(); store.signedIn('access-1');
  const broken = { withSessionLock: async () => { throw new Error('lock unavailable'); } };
  const { transport, calls } = scripted(ENDED);
  assert.deepEqual(await createLogoutClient({ store, transport, session: broken }).logout(), { kind: 'settled', result: 'failed' });
  assert.equal(calls.length, 0);
  const { logoutClient } = setup({ logout: scripted({ throws: true }).transport });
  assert.deepEqual(await logoutClient.logout(), { kind: 'settled', result: 'unknown' });
});

// ---- 잠금 대기 중 상태 변경 ----

test('잠금 대기 중 새 로그인이 성공하면 로그아웃을 보내지 않고 새 세션을 그대로 둔다', async () => {
  const hold = deferred();
  const { transport, calls } = scripted(ENDED);
  const { store, logoutClient } = setup({ logout: transport, lock: heldLock(hold.promise) });
  const pending = logoutClient.logout();
  const attempt = store.loginStarted();
  assert.equal(store.signedIn('access-new', attempt), 2);
  const before = store.getSnapshot();
  hold.resolve();
  assert.deepEqual(await pending, { kind: 'discarded', sent: false });
  assert.equal(calls.length, 0);
  assert.equal(store.getSnapshot(), before);
  assert.equal(store.accessToken(), 'access-new');
});

// 새 로그인 "시작"만 된 경우의 전송 정책은 담당자 확인 사항이다. 이 시험은 현재 초안의 동작을 고정한다.
test('잠금 대기 중 새 로그인이 시작만 됐으면 (현재 초안) 이전 세션 종료를 보내고, done이어도 비로그인으로 확정하지 않는다', async () => {
  const hold = deferred();
  const { transport, calls } = scripted(ENDED);
  const { store, logoutClient } = setup({ logout: transport, lock: heldLock(hold.promise) });
  const generation = store.getSnapshot().generation;
  const pending = logoutClient.logout();
  store.loginStarted();
  hold.resolve();
  assert.deepEqual(await pending, { kind: 'settled', result: 'done' });
  assert.equal(calls.length, 1);
  const s = store.getSnapshot();
  assert.deepEqual([s.status, s.generation, s.canCleanUpAfterLogout], ['reauth-required', generation, false]);
  assert.equal(store.accessToken(), null);
});

// ---- 새 로그인 시작 이후 다시 시도 제한·지연 응답 ----

for (const result of ['failed', 'unknown']) {
  test(`보낸 뒤 새 로그인이 시작되고 ${result}가 오면 다시 시도를 호출 경계에서 막는다`, async () => {
    const gate = deferred();
    const response = result === 'failed' ? err(500, 'INTERNAL_ERROR') : { kind: 'no-response' };
    const { transport, calls } = scripted({ result: response, gate: gate.promise });
    const { store, logoutClient } = setup({ logout: transport });
    const pending = logoutClient.logout();
    await tick();
    store.loginStarted();
    gate.resolve();
    assert.deepEqual(await pending, { kind: 'settled', result });
    assert.equal(store.getSnapshot().canRetryLogout, false);
    assert.deepEqual(await logoutClient.logout(), { kind: 'not-started' });
    assert.equal(calls.length, 1);
  });
}

test('새 로그인 성공 뒤 늦게 도착한 이전 로그아웃 결과는 새 세션의 토큰·세대·스냅샷을 바꾸지 않는다', async () => {
  for (const response of [ENDED, err(500, 'INTERNAL_ERROR'), { kind: 'no-response' }]) {
    const gate = deferred();
    const { store, logoutClient } = setup({ logout: scripted({ result: response, gate: gate.promise }).transport });
    const pending = logoutClient.logout();
    await tick();
    const attempt = store.loginStarted();
    store.signedIn('access-new', attempt);
    const before = store.getSnapshot();
    gate.resolve();
    assert.deepEqual(await pending, { kind: 'discarded', sent: true });
    assert.equal(store.getSnapshot(), before);
    assert.equal(store.accessToken(), 'access-new');
    assert.notEqual(store.logoutStarted(), null); // 새 세션의 로그아웃은 새로 할 수 있다.
  }
});

// ---- 갱신과 같은 잠금(탭 안) ----

test('[대역] 갱신 진행 중 로그아웃은 갱신 응답을 기다렸다가 최신 쿠키로 보내고, 늦은 갱신 결과는 반영하지 않는다', async () => {
  const browser = fakeBrowser();
  const hold = deferred();
  const { store, refreshClient, logoutClient } = setup({ refresh: browser.refresh(hold.promise), logout: browser.logout() });
  const refreshing = refreshClient.refresh();
  await tick(); await tick(); // 갱신은 서버 처리까지 끝났고 응답만 늦다.
  const loggingOut = logoutClient.logout();
  await tick(); await tick();
  assert.deepEqual(browser.state.log, ['refresh C1→200']); // 로그아웃은 잠금을 기다린다.
  hold.resolve();
  assert.deepEqual(await refreshing, { kind: 'discarded', sent: true });
  assert.deepEqual(await loggingOut, { kind: 'settled', result: 'done' });
  assert.deepEqual(browser.state.log, ['refresh C1→200', 'logout C2→204']);
  assert.equal(browser.state.jar, null);
  assert.equal(browser.revoked('X'), true);
  assert.equal(store.getSnapshot().status, 'signed-out');
});

test('[대역] 로그아웃 응답을 잃으면 쿠키는 남지만 서버 세션은 폐기됐고, 다시 시도하면 같은 쿠키로 204를 받는다', async () => {
  const browser = fakeBrowser();
  let call = 0;
  const transport = async () => { call += 1; return browser.logout({ delivery: call === 1 ? 'lost' : 'full' })(); };
  const { store, logoutClient } = setup({ logout: transport });
  assert.deepEqual(await logoutClient.logout(), { kind: 'settled', result: 'unknown' });
  assert.equal(browser.state.jar, 'C1');
  assert.equal(browser.revoked('X'), true);
  assert.deepEqual(await logoutClient.logout(), { kind: 'settled', result: 'done' });
  assert.deepEqual(browser.state.log, ['logout C1→204', 'logout C1→204']);
  assert.equal(browser.state.jar, null);
  assert.equal(store.getSnapshot().status, 'signed-out');
});

// ---- 쿠키 경쟁: 결과 무시와 잠금의 구분 ----

test('[대역] 잠금 없이 보낸 새 로그인보다 이전 로그아웃 응답이 늦게 도착하면 새 로그인 쿠키가 지워진다(잠금이 필요한 이유)', async () => {
  const browser = fakeBrowser();
  const hold = deferred();
  const { store, logoutClient } = setup({ logout: browser.logout({ hold: hold.promise }) });
  const pending = logoutClient.logout();
  await tick(); await tick(); // 로그아웃은 서버 처리까지 끝났고 응답만 늦다.
  const attempt = store.loginStarted();
  store.signedIn(await browser.login('Y'), attempt); // 잠금 없이 새 로그인 완료
  assert.equal(browser.memberOfJar(), 'Y');
  hold.resolve();
  assert.deepEqual(await pending, { kind: 'discarded', sent: true }); // 이 탭의 상태는 지켰지만
  assert.equal(browser.state.jar, null); // 새 로그인 쿠키는 지워졌다.
  assert.equal(store.accessToken(), 'access-Y-C2');
});

test('[대역] 새 로그인 완료를 같은 잠금 안에서 보내면 로그아웃 응답이 먼저 도착해 새 로그인 쿠키가 남는다', async () => {
  const browser = fakeBrowser();
  const hold = deferred();
  const { store, refreshClient, logoutClient } = setup({ logout: browser.logout({ hold: hold.promise }) });
  const pending = logoutClient.logout();
  await tick(); await tick();
  const attempt = store.loginStarted();
  const login = refreshClient.withSessionLock(() => browser.login('Y'));
  await tick(); await tick();
  assert.deepEqual(browser.state.log, ['logout C1→204']); // 로그인은 로그아웃 응답을 기다린다.
  hold.resolve();
  assert.deepEqual(await pending, { kind: 'settled', result: 'done' });
  assert.equal(store.getSnapshot().status, 'reauth-required'); // 새 로그인 시작 뒤 done: 비로그인으로 확정하지 않음
  assert.equal(store.signedIn(await login, attempt), 2);
  assert.equal(browser.memberOfJar(), 'Y');
  assert.equal(store.getSnapshot().status, 'signed-in');
});

// ---- 탭 안 잠금과 탭 사이 잠금의 보장 범위 ----

test('[대역] 두 탭이 같은 잠금을 쓰면 다른 탭의 갱신 응답을 기다렸다가 로그아웃하고, 다른 탭의 늦은 갱신이 쿠키를 되살리지 않는다', async () => {
  const browser = fakeBrowser();
  const lock = createTabLock(); // 탭 사이 잠금 대역: 두 탭이 한 인스턴스를 함께 쓴다(Web Locks 연결 전).
  const hold = deferred();
  const tabA = setup({ logout: browser.logout(), lock });
  const tabB = setup({ refresh: browser.refresh(hold.promise), logout: browser.logout(), lock });
  const refreshing = tabB.refreshClient.refresh();
  await tick(); await tick();
  const loggingOut = tabA.logoutClient.logout();
  hold.resolve();
  assert.deepEqual(await refreshing, { kind: 'signed-in' }); // B는 잠금 안에서 먼저 끝남
  assert.deepEqual(await loggingOut, { kind: 'settled', result: 'done' });
  assert.deepEqual(browser.state.log, ['refresh C1→200', 'logout C2→204']);
  assert.equal(browser.state.jar, null); // 마지막 쿠키 변경은 로그아웃
});

test('[대역] 탭마다 다른 잠금이면 순서를 보장하지 못해 다른 탭의 늦은 갱신 응답이 폐기된 세션 쿠키를 다시 남긴다', async () => {
  const browser = fakeBrowser();
  const hold = deferred();
  const tabA = setup({ logout: browser.logout() }); // 각자 createTabLock(): 탭 안 순서만 지킴
  const tabB = setup({ refresh: browser.refresh(hold.promise) });
  const refreshing = tabB.refreshClient.refresh();
  await tick(); await tick();
  assert.deepEqual(await tabA.logoutClient.logout(), { kind: 'settled', result: 'done' });
  hold.resolve();
  await refreshing;
  assert.deepEqual(browser.state.log, ['refresh C1→200', 'logout C1→204']);
  assert.equal(browser.state.jar, 'C2'); // 폐기된 세션의 쿠키가 남음(서버는 폐기를 유지하므로 다음 갱신은 401)
  assert.equal(browser.revoked('X'), true);
});

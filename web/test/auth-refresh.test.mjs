import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAuthStore } from '../src/lib/auth-state.ts';
import {
  classifyRefresh, createFetchRefreshTransport, createRefreshClient, createTabLock,
} from '../src/lib/auth-refresh.ts';

const ISSUED = { kind: 'issued', accessToken: 'access-new' };
const err = (status, code) => ({ kind: 'error', status, code });
const E500 = err(500, 'INTERNAL_ERROR');
const tick = () => new Promise((resolve) => setImmediate(resolve));

/** 정해 둔 응답을 차례로 돌려주는 호출 대역. `gate`를 주면 그 약속이 풀릴 때까지 응답을 늦춘다. */
function scripted(...attempts) {
  const calls = [];
  const transport = async () => {
    const next = attempts.shift();
    if (!next) throw new Error('unexpected extra refresh request');
    calls.push(next);
    if (next.gate) await next.gate;
    return next.result ?? next;
  };
  return { transport, calls };
}

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

/** 잠금 획득 횟수를 세는 탭 잠금. `hold`를 주면 그 약속이 풀릴 때까지 잠금을 내주지 않는다. */
function countingLock(hold) {
  const inner = createTabLock();
  const stats = { runs: 0 };
  return {
    stats,
    run(task) {
      return inner.run(async () => {
        if (hold) await hold;
        stats.runs += 1;
        return task();
      });
    },
  };
}

/**
 * 서버·쿠키 대역. 실제 서버(api/src/auth/session.service.ts)의 교체·재사용 시 세션 폐기·401 쿠키 삭제 규칙과,
 * 브라우저가 응답이 도착한 순서대로 쿠키 하나를 덮어쓰는 동작을 흉내 낸다.
 * 여러 저장소가 이 대역 하나를 함께 쓰면 같은 브라우저의 탭들이 쿠키 하나를 공유하는 것과 같다.
 * 실제 서버·브라우저 동작은 DB 시험·Chromium 확인으로 따로 확인했으며, 이 대역 결과를 실제 다중 탭 검증으로 보지 않는다.
 */
function fakeBrowserSession() {
  let serial = 0;
  const tokens = new Map(); // Refresh → { sid, used }
  const sessions = new Map(); // 세션 → { member, revoked }
  const state = { jar: null, log: [] };
  const mint = (sid) => { const t = 'C' + ++serial; tokens.set(t, { sid, used: false }); return t; };
  const open = (member) => { const sid = 'S' + (sessions.size + 1); sessions.set(sid, { member, revoked: false }); return mint(sid); };
  state.jar = open('X');
  /**
   * 갱신 호출 대역. delivery(n): 'full' | 'lost'(응답 헤더 전 유실, 쿠키 미반영) | 'body-lost'(헤더의 쿠키는 반영, 본문 유실).
   * hold: 서버가 처리를 마친 뒤 응답 도착을 늦추는 약속.
   */
  function transport(delivery = () => 'full', hold) {
    return async () => {
      const sent = state.jar; // 브라우저는 보내는 순간의 쿠키를 싣는다.
      await tick();
      const record = sent ? tokens.get(sent) : undefined;
      let status = 401;
      let setCookie = null; // null이면 쿠키 삭제
      let member = null;
      if (record && !record.used && !sessions.get(record.sid).revoked) {
        record.used = true; setCookie = mint(record.sid); status = 200; member = sessions.get(record.sid).member;
      } else if (record?.used) {
        sessions.get(record.sid).revoked = true; // 사용된 Refresh 재사용: 이 세션 전체 폐기
      }
      state.log.push(`${sent ?? 'none'}→${status}`);
      const mode = delivery(state.log.length);
      if (hold) await hold;
      if (mode === 'lost') return { kind: 'no-response' };
      state.jar = setCookie; // 응답이 도착하는 순간 쿠키를 덮어쓴다.
      if (status !== 200) return err(401, 'AUTH_INVALID');
      return mode === 'body-lost' ? { kind: 'malformed', status: 200 } : { kind: 'issued', accessToken: `access-${member}-${setCookie}` };
    };
  }
  /** 새 로그인 완료 요청 대역: 새 세션을 만들고 응답이 도착하면 쿠키를 덮어쓴다. */
  async function login(member) {
    await tick();
    const fresh = open(member);
    state.log.push(`login ${member}`);
    state.jar = fresh;
    return `access-${member}-${fresh}`;
  }
  const memberOfJar = () => (state.jar ? sessions.get(tokens.get(state.jar).sid).member : null);
  const revoked = () => [...sessions.values()].some((session) => session.revoked);
  return { state, transport, login, memberOfJar, revoked };
}

// ---- 결과 분류: 요청 이력 전체로 판단 ----

test('첫 요청의 응답을 상태·오류 코드로 분류한다', () => {
  assert.deepEqual(classifyRefresh([ISSUED]), { kind: 'issued', accessToken: 'access-new' });
  assert.deepEqual(classifyRefresh([err(401, 'AUTH_INVALID')]), { kind: 'failed', cause: 'session-ended' });
  assert.deepEqual(classifyRefresh([err(403, 'AUTH_ORIGIN_FORBIDDEN')]), { kind: 'failed', cause: 'not-consumed' });
  assert.deepEqual(classifyRefresh([err(400, 'VALIDATION_FAILED')]), { kind: 'failed', cause: 'not-consumed' });
  assert.deepEqual(classifyRefresh([{ kind: 'not-sent' }]), { kind: 'failed', cause: 'not-consumed' });
  assert.deepEqual(classifyRefresh([E500]), { kind: 'retry' });
});

test('응답 없음·본문 오류·중계 오류·코드가 다른 오류는 다시 보내지 않고 결과 불명으로 둔다', () => {
  for (const attempt of [{ kind: 'no-response' }, { kind: 'malformed', status: 200 }, err(502, null), err(503, null),
    err(504, null), err(500, null), err(500, 'OTHER'), err(401, 'AUTH_REQUIRED'), err(403, null), err(400, 'OTHER'), err(429, null)]) {
    assert.deepEqual(classifyRefresh([attempt]), { kind: 'failed', cause: 'outcome-unknown' }, JSON.stringify(attempt));
  }
});

test('첫 500 뒤에는 400·403이 와도 Refresh 미사용으로 확정하지 않는다', () => {
  for (const second of [err(400, 'VALIDATION_FAILED'), err(403, 'AUTH_ORIGIN_FORBIDDEN'), E500, { kind: 'no-response' },
    { kind: 'malformed', status: 200 }, { kind: 'not-sent' }]) {
    assert.deepEqual(classifyRefresh([E500, second]), { kind: 'failed', cause: 'outcome-unknown' }, JSON.stringify(second));
  }
  assert.deepEqual(classifyRefresh([E500, ISSUED]), { kind: 'issued', accessToken: 'access-new' });
  assert.deepEqual(classifyRefresh([E500, err(401, 'AUTH_INVALID')]), { kind: 'failed', cause: 'session-ended' });
});

test('500 뒤 한 번을 넘는 이력이나 500이 아닌 요청 뒤의 재시도 이력은 받지 않는다', () => {
  assert.throws(() => classifyRefresh([]), RangeError);
  assert.throws(() => classifyRefresh([E500, E500, E500]), RangeError);
  assert.throws(() => classifyRefresh([{ kind: 'no-response' }, ISSUED]), RangeError);
});

// ---- 실제 호출 함수(fetch 대역) ----

test('갱신 요청은 본문·Authorization 없이 쿠키를 싣고 캐시하지 않으며, 성공 본문만 발급으로 본다', async () => {
  const seen = [];
  const fetch = async (url, init) => {
    seen.push({ url, init });
    return new Response(JSON.stringify({ accessToken: 'access-x', tokenType: 'Bearer', expiresIn: 900 }), { status: 200 });
  };
  const transport = createFetchRefreshTransport({ baseUrl: 'http://localhost:3001/', nodeEnv: 'test', fetch });
  assert.deepEqual(await transport(), { kind: 'issued', accessToken: 'access-x' });
  assert.equal(seen[0].url, 'http://localhost:3001/v1/auth/refresh');
  assert.deepEqual(seen[0].init, { method: 'POST', headers: { Accept: 'application/json' }, cache: 'no-store', credentials: 'include' });
});

test('200의 본문 형식 오류·읽기 실패는 본문 오류, 연결 실패는 응답 없음, 오류 본문은 코드만 읽는다', async () => {
  const run = (fetch) => createFetchRefreshTransport({ baseUrl: 'http://localhost:3001', nodeEnv: 'test', fetch })();
  assert.deepEqual(await run(async () => new Response('{"accessToken":""}', { status: 200 })), { kind: 'malformed', status: 200 });
  assert.deepEqual(await run(async () => new Response('not json', { status: 200 })), { kind: 'malformed', status: 200 });
  assert.deepEqual(await run(async () => { throw new TypeError('network'); }), { kind: 'no-response' });
  assert.deepEqual(await run(async () => new Response('{"code":"AUTH_INVALID","message":"x"}', { status: 401 })), err(401, 'AUTH_INVALID'));
  assert.deepEqual(await run(async () => new Response('<html>', { status: 502 })), err(502, null));
});

test('API 주소 설정이 없으면 보내지 않는다', async () => {
  let called = false;
  const transport = createFetchRefreshTransport({ baseUrl: undefined, fetch: async () => { called = true; } });
  assert.deepEqual(await transport(), { kind: 'not-sent' });
  assert.equal(called, false);
});

// ---- 탭 안 중복 방지 ----

test('탭 안 동시 갱신은 HTTP 요청 하나와 결과를 함께 쓰고, 끝난 뒤의 갱신은 새로 보낸다', async () => {
  const store = createAuthStore(); store.signedIn('access-old');
  const gate = deferred();
  const { transport, calls } = scripted({ result: ISSUED, gate: gate.promise }, ISSUED);
  const client = createRefreshClient({ store, transport });
  const first = client.refresh(); const second = client.refresh();
  assert.equal(first, second);
  gate.resolve();
  assert.deepEqual(await Promise.all([first, second]), [{ kind: 'signed-in' }, { kind: 'signed-in' }]);
  assert.equal(calls.length, 1);
  assert.equal(store.accessToken(), 'access-new');
  await client.refresh();
  assert.equal(calls.length, 2);
});

// ---- 500 1회 재시도와 실패 반영 ----

test('갱신 500은 같은 잠금 안에서 한 번만 다시 보낸다', async () => {
  const store = createAuthStore(); store.signedIn('access-old');
  const lock = countingLock();
  const { transport, calls } = scripted(E500, ISSUED);
  assert.deepEqual(await createRefreshClient({ store, transport, lock }).refresh(), { kind: 'signed-in' });
  assert.equal(calls.length, 2);
  assert.equal(lock.stats.runs, 1);
});

test('500 뒤 다시 500이면 결과 불명: 복원은 확인하지 못함으로 남고 이후 복원을 보내지 않는다', async () => {
  const store = createAuthStore();
  const { transport, calls } = scripted(E500, E500);
  const client = createRefreshClient({ store, transport });
  assert.deepEqual(await client.refresh(), { kind: 'failed', cause: 'outcome-unknown' });
  assert.equal(calls.length, 2);
  assert.equal(store.getSnapshot().status, 'restoring');
  assert.equal(store.getSnapshot().restoreUnconfirmed, true);
  assert.equal(store.getSnapshot().canRetryRestore, false);
  assert.deepEqual(await client.refresh(), { kind: 'not-started' });
  assert.equal(calls.length, 2);
});

test('500 뒤 403이 와도 다시 확인을 허용하지 않는다', async () => {
  const store = createAuthStore();
  const { transport } = scripted(E500, err(403, 'AUTH_ORIGIN_FORBIDDEN'));
  assert.deepEqual(await createRefreshClient({ store, transport }).refresh(), { kind: 'failed', cause: 'outcome-unknown' });
  assert.equal(store.getSnapshot().canRetryRestore, false);
});

test('첫 403은 Refresh를 쓰지 않았으므로 복원을 다시 확인할 수 있다', async () => {
  const store = createAuthStore();
  const { transport, calls } = scripted(err(403, 'AUTH_ORIGIN_FORBIDDEN'), ISSUED);
  const client = createRefreshClient({ store, transport });
  assert.deepEqual(await client.refresh(), { kind: 'failed', cause: 'not-consumed' });
  assert.equal(store.getSnapshot().canRetryRestore, true);
  assert.deepEqual(await client.refresh(), { kind: 'signed-in' });
  assert.equal(calls.length, 2);
});

test('응답 없음은 다시 보내지 않고, 로그인 중이면 재인증 필요로 바꾼다', async () => {
  const store = createAuthStore(); store.signedIn('access-old');
  const { transport, calls } = scripted({ kind: 'no-response' });
  const client = createRefreshClient({ store, transport });
  assert.deepEqual(await client.refresh(), { kind: 'failed', cause: 'outcome-unknown' });
  assert.equal(calls.length, 1);
  assert.equal(store.getSnapshot().status, 'reauth-required');
  assert.deepEqual(await client.refresh(), { kind: 'not-started' });
  assert.equal(calls.length, 1);
});

test('복원 중 401은 세션 없음을 확인한 것이므로 비로그인으로 확정한다', async () => {
  const store = createAuthStore();
  const { transport } = scripted(err(401, 'AUTH_INVALID'));
  assert.deepEqual(await createRefreshClient({ store, transport }).refresh(), { kind: 'failed', cause: 'session-ended' });
  assert.equal(store.getSnapshot().status, 'signed-out');
});

test('잠금이나 호출 함수의 예기치 않은 예외: 보내기 전이면 미사용, 보낸 뒤면 결과 불명', async () => {
  const before = createAuthStore();
  const brokenLock = { run: async () => { throw new Error('lock unavailable'); } };
  const { transport, calls } = scripted(ISSUED);
  assert.deepEqual(await createRefreshClient({ store: before, transport, lock: brokenLock }).refresh(),
    { kind: 'failed', cause: 'not-consumed' });
  assert.equal(calls.length, 0);
  const after = createAuthStore();
  const throwing = async () => { throw new Error('unexpected'); };
  assert.deepEqual(await createRefreshClient({ store: after, transport: throwing }).refresh(),
    { kind: 'failed', cause: 'outcome-unknown' });
});

// ---- 로그아웃·새 로그인과의 경쟁 ----

test('잠금을 기다리는 동안 로그아웃이 시작되면 갱신을 보내지 않는다', async () => {
  const store = createAuthStore(); store.signedIn('access-old');
  const hold = deferred();
  const { transport, calls } = scripted(ISSUED);
  const pending = createRefreshClient({ store, transport, lock: countingLock(hold.promise) }).refresh();
  const logout = store.logoutStarted();
  hold.resolve();
  assert.deepEqual(await pending, { kind: 'discarded', sent: false });
  assert.equal(calls.length, 0);
  store.logoutSettled('done', logout);
  assert.equal(store.getSnapshot().status, 'signed-out');
});

test('500 뒤 재시도 전에 로그아웃이 시작되면 다시 보내지 않는다', async () => {
  const store = createAuthStore(); store.signedIn('access-old');
  const gate = deferred();
  const { transport, calls } = scripted({ result: E500, gate: gate.promise }, ISSUED);
  const pending = createRefreshClient({ store, transport }).refresh();
  await tick();
  store.logoutStarted();
  gate.resolve();
  assert.deepEqual(await pending, { kind: 'discarded', sent: true });
  assert.equal(calls.length, 1);
});

test('로그아웃 진행 중에 도착한 갱신 성공은 토큰·상태를 바꾸지 않는다', async () => {
  const store = createAuthStore(); store.signedIn('access-old');
  const gate = deferred();
  const { transport } = scripted({ result: ISSUED, gate: gate.promise });
  const pending = createRefreshClient({ store, transport }).refresh();
  await tick();
  const logout = store.logoutStarted();
  gate.resolve();
  assert.deepEqual(await pending, { kind: 'discarded', sent: true });
  assert.equal(store.accessToken(), 'access-old');
  store.logoutSettled('done', logout);
  assert.equal(store.getSnapshot().status, 'signed-out');
  assert.equal(store.accessToken(), null);
});

test('새 로그인 뒤 늦게 도착한 이전 갱신 결과는 새 세션을 덮어쓰지 않고, 새 세대의 갱신은 따로 보낸다', async () => {
  const store = createAuthStore(); store.signedIn('access-old');
  const gate = deferred();
  const { transport, calls } = scripted({ result: err(401, 'AUTH_INVALID'), gate: gate.promise }, ISSUED);
  const client = createRefreshClient({ store, transport });
  const stale = client.refresh();
  await tick();
  const generation = store.signedIn('access-login');
  const fresh = client.refresh();
  assert.notEqual(fresh, stale);
  gate.resolve();
  assert.deepEqual(await stale, { kind: 'discarded', sent: true });
  assert.deepEqual(await fresh, { kind: 'signed-in' });
  assert.equal(calls.length, 2);
  assert.equal(store.getSnapshot().status, 'signed-in');
  assert.equal(store.getSnapshot().generation, generation);
  assert.equal(store.accessToken(), 'access-new');
});

// ---- 탭 사이 잠금 인터페이스(대역 시험: 실제 다중 탭 검증 아님) ----

test('[대역] 두 탭이 같은 잠금을 쓰면 갱신이 차례로 나가 둘 다 성공하고 세션이 유지된다', async () => {
  const browser = fakeBrowserSession();
  const lock = createTabLock(); // 탭 사이 잠금 대역: 두 저장소가 한 인스턴스를 함께 쓴다.
  const tabs = [createAuthStore(), createAuthStore()];
  const clients = tabs.map((store) => createRefreshClient({ store, transport: browser.transport(), lock }));
  const results = await Promise.all(clients.map((c) => c.refresh()));
  assert.deepEqual(results, [{ kind: 'signed-in' }, { kind: 'signed-in' }]);
  assert.deepEqual(browser.state.log, ['C1→200', 'C2→200']);
  assert.equal(browser.revoked(), false);
});

test('[대역] 잠금을 공유하지 않으면 같은 Refresh가 동시에 나가 세션이 폐기된다(잠금이 필요한 이유)', async () => {
  const browser = fakeBrowserSession();
  const tabs = [createAuthStore(), createAuthStore()];
  const clients = tabs.map((store) => createRefreshClient({ store, transport: browser.transport(), lock: createTabLock() }));
  const results = await Promise.all(clients.map((c) => c.refresh()));
  assert.deepEqual(browser.state.log, ['C1→200', 'C1→401']);
  assert.equal(browser.revoked(), true);
  assert.deepEqual(results, [{ kind: 'signed-in' }, { kind: 'failed', cause: 'session-ended' }]);
});

test('createTabLock은 앞 작업이 실패해도 다음 작업을 실행한다', async () => {
  const lock = createTabLock();
  const order = [];
  const failing = lock.run(async () => { order.push('a'); throw new Error('a failed'); });
  const next = lock.run(async () => { order.push('b'); return 'b'; });
  await assert.rejects(failing);
  assert.equal(await next, 'b');
  assert.deepEqual(order, ['a', 'b']);
});

// ---- 새로고침 재전송(현재 동작 재현) ----

test('[재현] 갱신 응답을 헤더 전에 잃으면 같은 탭은 다시 보내지 않지만, 새로고침으로 만든 새 저장소는 옛 Refresh를 다시 보낸다', async () => {
  const browser = fakeBrowserSession();
  const before = createAuthStore();
  const client = createRefreshClient({ store: before, transport: browser.transport((n) => (n === 1 ? 'lost' : 'full')) });
  assert.deepEqual(await client.refresh(), { kind: 'failed', cause: 'outcome-unknown' });
  assert.deepEqual(await client.refresh(), { kind: 'not-started' });
  assert.deepEqual(browser.state.log, ['C1→200']); // 서버는 교체를 마쳤지만 쿠키는 C1 그대로

  const reloaded = createAuthStore(); // 새로고침: 메모리의 재전송 차단이 사라진다.
  const outcome = await createRefreshClient({ store: reloaded, transport: browser.transport() }).refresh();
  assert.deepEqual(browser.state.log, ['C1→200', 'C1→401']);
  assert.equal(browser.revoked(), true); // 사용된 Refresh 재사용으로 세션 폐기
  assert.deepEqual(outcome, { kind: 'failed', cause: 'session-ended' });
  assert.equal(reloaded.getSnapshot().status, 'signed-out');
});

test('[재현] 응답 헤더(새 쿠키)를 받은 뒤 본문을 잃었다면 새로고침 복원은 새 Refresh로 성공한다', async () => {
  const browser = fakeBrowserSession();
  const before = createAuthStore(); before.signedIn('access-old');
  const client = createRefreshClient({ store: before, transport: browser.transport((n) => (n === 1 ? 'body-lost' : 'full')) });
  assert.deepEqual(await client.refresh(), { kind: 'failed', cause: 'outcome-unknown' });
  assert.equal(before.getSnapshot().status, 'reauth-required');

  const reloaded = createAuthStore();
  assert.deepEqual(await createRefreshClient({ store: reloaded, transport: browser.transport() }).refresh(), { kind: 'signed-in' });
  assert.deepEqual(browser.state.log, ['C1→200', 'C2→200']);
  assert.equal(browser.revoked(), false);
});

// ---- 새 로그인 시작과의 경쟁 ----

test('잠금을 기다리는 동안 새 로그인이 시작되면 이전 갱신을 보내지 않고, 시도가 끝나면 다시 갱신할 수 있다', async () => {
  const store = createAuthStore(); store.signedIn('access-old');
  const hold = deferred();
  const { transport, calls } = scripted(ISSUED);
  const client = createRefreshClient({ store, transport, lock: countingLock(hold.promise) });
  const pending = client.refresh();
  const attempt = store.loginStarted();
  assert.equal(client.refresh(), pending); // 진행 중인 같은 세대 갱신을 함께 받는다(새 요청 없음)
  hold.resolve();
  assert.deepEqual(await pending, { kind: 'discarded', sent: false });
  assert.equal(calls.length, 0);
  assert.equal(store.accessToken(), 'access-old');
  store.loginAttemptEnded(attempt);
  assert.deepEqual(await client.refresh(), { kind: 'signed-in' });
  assert.equal(calls.length, 1);
});

test('새 로그인 시도 중에는 갱신·복원을 새로 시작하지 않는다', async () => {
  for (const store of [createAuthStore(), (() => { const s = createAuthStore(); s.signedIn('access-old'); return s; })()]) {
    const { transport, calls } = scripted();
    store.loginStarted();
    assert.deepEqual(await createRefreshClient({ store, transport }).refresh(), { kind: 'not-started' });
    assert.equal(calls.length, 0);
  }
});

test('첫 500 뒤 새 로그인이 시작되면 다시 보내지 않고, 그 500의 결과는 알 수 없으므로 이 페이지의 재전송을 막는다', async () => {
  const store = createAuthStore(); store.signedIn('access-old');
  const gate = deferred();
  const { transport, calls } = scripted({ result: E500, gate: gate.promise }, ISSUED);
  const client = createRefreshClient({ store, transport });
  const pending = client.refresh();
  await tick();
  const attempt = store.loginStarted();
  gate.resolve();
  assert.deepEqual(await pending, { kind: 'discarded', sent: true });
  assert.equal(calls.length, 1);
  assert.equal(store.getSnapshot().status, 'signed-in'); // 결과를 반영하지 않으므로 상태는 그대로
  store.loginAttemptEnded(attempt);
  assert.deepEqual(await client.refresh(), { kind: 'not-started' }); // 이전 Refresh 재전송 금지
  store.signedIn('access-login');
  assert.deepEqual(await client.refresh(), { kind: 'signed-in' }); // 새 로그인 성공으로 풀림
  assert.equal(calls.length, 2);
});

test('요청을 보낸 뒤 새 로그인이 시작되면 도착한 성공 결과를 반영하지 않는다(복원·로그인 모두)', async () => {
  for (const initial of ['restoring', 'signed-in']) {
    const store = createAuthStore();
    if (initial === 'signed-in') store.signedIn('access-old');
    const gate = deferred();
    const { transport } = scripted({ result: ISSUED, gate: gate.promise });
    const pending = createRefreshClient({ store, transport }).refresh();
    await tick();
    const before = store.getSnapshot();
    store.loginStarted();
    gate.resolve();
    assert.deepEqual(await pending, { kind: 'discarded', sent: true });
    assert.equal(store.getSnapshot().status, initial);
    assert.equal(store.getSnapshot().generation, before.generation);
    assert.equal(store.accessToken(), initial === 'signed-in' ? 'access-old' : null);
  }
});

test('복원 요청 중 새 로그인이 시작되고 응답을 잃은 뒤 시도가 끝나면, 복원을 다시 보내지 않고 확인하지 못함을 보인다', async () => {
  const store = createAuthStore();
  const gate = deferred();
  const { transport, calls } = scripted({ result: { kind: 'no-response' }, gate: gate.promise });
  const client = createRefreshClient({ store, transport });
  const pending = client.refresh();
  await tick();
  const attempt = store.loginStarted();
  gate.resolve();
  assert.deepEqual(await pending, { kind: 'discarded', sent: true });
  assert.equal(store.getSnapshot().restoreUnconfirmed, false);
  store.loginAttemptEnded(attempt);
  const s = store.getSnapshot();
  assert.deepEqual([s.status, s.restoreUnconfirmed, s.canRetryRestore], ['restoring', true, false]);
  assert.deepEqual(await client.refresh(), { kind: 'not-started' });
  assert.equal(calls.length, 1);
});

// ---- 결과 무시와 쿠키 경쟁의 구분(대역) ----

test('[대역] 결과를 반영하지 않아도, 잠금 없이 보낸 새 로그인 뒤에 이전 갱신 응답이 도착하면 쿠키가 이전 회원 세션으로 덮인다', async () => {
  const browser = fakeBrowserSession();
  const store = createAuthStore(); store.signedIn('access-X');
  const hold = deferred();
  const client = createRefreshClient({ store, transport: browser.transport(() => 'full', hold.promise) });
  const pending = client.refresh();
  await tick(); await tick(); // 갱신은 서버 처리까지 끝났고 응답만 늦다.
  const attempt = store.loginStarted();
  store.signedIn(await browser.login('Y'), attempt); // 잠금 없이 새 로그인 완료
  assert.equal(browser.memberOfJar(), 'Y');
  hold.resolve();
  assert.deepEqual(await pending, { kind: 'discarded', sent: true });
  assert.equal(store.accessToken(), 'access-Y-C3'); // 이 탭의 상태는 지켰지만
  assert.equal(browser.memberOfJar(), 'X'); // 쿠키는 이전 회원 세션으로 덮였다.
  assert.deepEqual(await client.refresh(), { kind: 'signed-in' });
  assert.match(store.accessToken(), /^access-X-/); // 다음 갱신은 이전 회원으로 발급된다.
});

test('[대역] 새 로그인 완료를 withSessionLock 안에서 보내면 진행 중인 갱신 응답이 먼저 도착해 마지막 쿠키가 새 로그인 것이 된다', async () => {
  const browser = fakeBrowserSession();
  const store = createAuthStore(); store.signedIn('access-X');
  const hold = deferred();
  const client = createRefreshClient({ store, transport: browser.transport(() => 'full', hold.promise) });
  const pending = client.refresh();
  await tick(); await tick();
  const attempt = store.loginStarted();
  const login = client.withSessionLock(() => browser.login('Y'));
  await tick(); await tick();
  assert.deepEqual(browser.state.log, ['C1→200']); // 로그인은 갱신 응답을 기다린다.
  hold.resolve();
  store.signedIn(await login, attempt);
  assert.deepEqual(await pending, { kind: 'discarded', sent: true });
  assert.deepEqual(browser.state.log, ['C1→200', 'login Y']);
  assert.equal(browser.memberOfJar(), 'Y');
  assert.deepEqual(await client.refresh(), { kind: 'signed-in' });
  assert.match(store.accessToken(), /^access-Y-/);
});

test('잠금 대기 중 A·B 순서로 로그인이 시작되면 A의 취소로는 갱신을 보내지 않고, B가 끝난 뒤에만 보낸다', async () => {
  const store = createAuthStore(); store.signedIn('access-old');
  const hold = deferred();
  const { transport, calls } = scripted(ISSUED);
  const client = createRefreshClient({ store, transport, lock: countingLock(hold.promise) });
  const pending = client.refresh();
  const a = store.loginStarted();
  const b = store.loginStarted();
  assert.equal(store.loginAttemptEnded(a), false);
  hold.resolve();
  assert.deepEqual(await pending, { kind: 'discarded', sent: false });
  assert.deepEqual(await client.refresh(), { kind: 'not-started' });
  assert.equal(calls.length, 0);
  assert.equal(store.loginAttemptEnded(b), true);
  assert.deepEqual(await client.refresh(), { kind: 'signed-in' });
  assert.equal(calls.length, 1);
});

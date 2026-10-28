import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAuthStore } from '../src/lib/auth-state.ts';
import { createAuthSession, createSessionLock, browserLockManager, SESSION_LOCK_NAME } from '../src/lib/auth-session.ts';

const tick = () => new Promise((resolve) => setImmediate(resolve));
const err = (status, code) => ({ kind: 'error', status, code });

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

/**
 * Web Locks 대역(LockManager). 같은 이름의 배타 잠금을 요청 순서대로 하나씩 내주고, 콜백이 돌려준 약속이 끝나면(성공·실패 모두) 놓는다.
 * 한 인스턴스를 여러 탭이 함께 쓰면 같은 출처의 탭들이 브라우저의 잠금 관리자를 공유하는 것과 같다.
 * 실제 브라우저의 Web Locks 동작 검증이 아니다.
 */
function fakeLockManager() {
  const queues = new Map();
  const log = [];
  return {
    log,
    request(name, options, callback) {
      return new Promise((resolve, reject) => {
        const queue = queues.get(name) ?? [];
        queues.set(name, queue);
        const grant = () => queueMicrotask(async () => {
          log.push(`grant ${name} ${options.mode}`);
          try { resolve(await callback({ name, mode: options.mode })); } catch (error) { reject(error); } finally {
            log.push(`release ${name}`);
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

/** 다른 탭이 `hold`가 풀릴 때까지 잠금을 쥐고 있는 상황. */
function holdElsewhere(manager, hold) {
  return manager.request(SESSION_LOCK_NAME, { mode: 'exclusive' }, () => hold);
}

/**
 * 서버·쿠키 대역(갱신·로그아웃·로그인). 실제 서버 규칙을 흉내 내며, 여러 탭이 이 대역 하나를 쓰면 쿠키 하나를 공유한다.
 * 실제 서버·브라우저 검증이 아니다.
 */
function fakeBrowser() {
  let serial = 0;
  const tokens = new Map();
  const sessions = new Map();
  const state = { jar: null, log: [] };
  const mint = (sid) => { const t = 'C' + ++serial; tokens.set(t, { sid, used: false }); return t; };
  const open = (member) => { const sid = 'S' + (sessions.size + 1); sessions.set(sid, { member, revoked: false }); return mint(sid); };
  state.jar = open('X');
  return {
    state,
    refresh: (hold) => async () => {
      const sent = state.jar;
      await tick();
      const record = sent ? tokens.get(sent) : undefined;
      let set = null;
      if (record && !record.used && !sessions.get(record.sid).revoked) { record.used = true; set = mint(record.sid); }
      else if (record?.used) sessions.get(record.sid).revoked = true;
      state.log.push(`refresh ${sent ?? 'none'}→${set ? 200 : 401}`);
      if (hold) await hold;
      state.jar = set;
      return set ? { kind: 'issued', accessToken: `access-${set}` } : err(401, 'AUTH_INVALID');
    },
    logout: (hold) => async () => {
      const sent = state.jar;
      await tick();
      const record = sent ? tokens.get(sent) : undefined;
      if (record) sessions.get(record.sid).revoked = true;
      state.log.push(`logout ${sent ?? 'none'}→204`);
      if (hold) await hold;
      state.jar = null;
      return { kind: 'ended' };
    },
    login: async (member) => {
      await tick();
      const fresh = open(member);
      state.log.push(`login ${member}`);
      state.jar = fresh;
      return `access-${member}-${fresh}`;
    },
    revoked: () => [...sessions.values()].some((s) => s.revoked),
  };
}

/** 한 탭: 저장소와 세션(갱신·로그아웃). 같은 대역 잠금 관리자를 넘기면 다른 탭과 Web Lock을 공유한다. */
function tab({ browser, locks, refreshHold, logoutHold, signedIn = true }) {
  const store = createAuthStore();
  if (signedIn) store.signedIn('access-0');
  const lock = createSessionLock({ locks });
  const session = createAuthSession({ store, lock, refreshTransport: browser.refresh(refreshHold), logoutTransport: browser.logout(logoutHold) });
  return { store, session, lock };
}

// ---- 잠금 선택과 대체 ----

test('Web Locks가 있으면 같은 이름의 배타 잠금을 쓴다', async () => {
  const locks = fakeLockManager();
  const lock = createSessionLock({ locks });
  assert.deepEqual([lock.mode, lock.fallback], ['web-locks', null]);
  assert.equal(await lock.run(async () => 'done'), 'done');
  assert.deepEqual(locks.log, [`grant ${SESSION_LOCK_NAME} exclusive`, `release ${SESSION_LOCK_NAME}`]);
});

test('Web Locks가 없으면 탭 안 잠금만 쓰고 그 사실을 드러낸다(탭 사이 보장 없음)', async () => {
  for (const locks of [null, {}, { request: 'x' }]) {
    const lock = createSessionLock({ locks });
    assert.deepEqual([lock.mode, lock.fallback], ['tab-only', 'unsupported']);
    assert.equal(await lock.run(async () => 1), 1);
  }
});

test('브라우저 잠금 관리자는 navigator.locks.request가 있을 때만 쓴다', () => {
  // Node 시험 환경에는 navigator.locks가 없다(있는 판본이면 함수 여부만 확인).
  const found = browserLockManager();
  assert.ok(found === null || typeof found.request === 'function');
});

test('잠금 요청이 작업 시작 전에 실패하면 이번 작업은 탭 안 잠금으로 실행하고, 이 페이지에서는 이후에도 탭 안 잠금만 쓴다', async () => {
  let requests = 0;
  for (const failing of [
    { request() { requests += 1; throw new Error('sync failure'); } },
    { request() { requests += 1; return Promise.reject(new Error('async failure')); } },
  ]) {
    requests = 0;
    const lock = createSessionLock({ locks: failing });
    assert.equal(lock.mode, 'web-locks');
    let runs = 0;
    assert.equal(await lock.run(async () => { runs += 1; return 'first'; }), 'first');
    assert.deepEqual([lock.mode, lock.fallback, runs, requests], ['tab-only', 'failed', 1, 1]);
    assert.equal(await lock.run(async () => 'second'), 'second');
    assert.equal(requests, 1); // 다시 요청하지 않는다.
  }
});

test('작업이 시작된 뒤 실패하면 다시 실행하지 않고 그대로 돌려주며, 잠금을 놓아 다음 요청이 실행된다', async () => {
  const locks = fakeLockManager();
  const lock = createSessionLock({ locks });
  let runs = 0;
  await assert.rejects(lock.run(async () => { runs += 1; throw new Error('task failed'); }), /task failed/);
  assert.equal(runs, 1);
  assert.equal(lock.mode, 'web-locks'); // 작업 실패는 잠금 사용 실패가 아니다.
  assert.equal(await lock.run(async () => 'next'), 'next');
  assert.deepEqual(locks.log.filter((l) => l.startsWith('release')).length, 2);
});

test('탭 안 요청은 Web Lock 대기와 관계없이 순서대로 실행된다', async () => {
  const locks = fakeLockManager();
  const lock = createSessionLock({ locks });
  const hold = deferred();
  const other = holdElsewhere(locks, hold.promise); // 다른 탭이 잠금을 쥠
  const order = [];
  const a = lock.run(async () => { order.push('a'); });
  const b = lock.run(async () => { order.push('b'); });
  await tick();
  assert.deepEqual(order, []); // 다른 탭이 놓을 때까지 기다린다.
  hold.resolve();
  await Promise.all([a, b, other]);
  assert.deepEqual(order, ['a', 'b']);
});

// ---- 같은 잠금을 쓰는 구성 ----

test('갱신·로그아웃·로그인 완료가 한 잠금을 쓴다: 갱신 응답을 기다린 뒤 로그아웃, 그다음 로그인 완료', async () => {
  const browser = fakeBrowser();
  const locks = fakeLockManager();
  const hold = deferred();
  const { store, session } = tab({ browser, locks, refreshHold: hold.promise });
  const refreshing = session.refresh();
  await tick(); await tick();
  const loggingOut = session.logout();
  const attempt = store.loginStarted();
  const login = session.withSessionLock(() => browser.login('Y'));
  await tick(); await tick();
  assert.deepEqual(browser.state.log, ['refresh C1→200']);
  hold.resolve();
  assert.deepEqual(await refreshing, { kind: 'discarded', sent: true });
  assert.deepEqual(await loggingOut, { kind: 'settled', result: 'done' });
  assert.equal(store.signedIn(await login, attempt), 2);
  assert.deepEqual(browser.state.log, ['refresh C1→200', 'logout C2→204', 'login Y']);
  assert.equal(browser.state.jar, 'C3'); // 마지막 쿠키는 새 로그인 것
  assert.equal(locks.log.filter((l) => l.startsWith('grant')).length, 3);
});

// ---- [대역] 탭 사이: Web Lock 공유 여부 ----

test('[대역] 두 탭이 같은 Web Lock을 쓰면 동시 갱신이 차례로 나가 둘 다 성공하고 세션이 유지된다', async () => {
  const browser = fakeBrowser();
  const locks = fakeLockManager(); // 같은 출처의 잠금 관리자
  const a = tab({ browser, locks });
  const b = tab({ browser, locks });
  const results = await Promise.all([a.session.refresh(), b.session.refresh()]);
  assert.deepEqual(results, [{ kind: 'signed-in' }, { kind: 'signed-in' }]);
  assert.deepEqual(browser.state.log, ['refresh C1→200', 'refresh C2→200']);
  assert.equal(browser.revoked(), false);
});

test('[대역] Web Locks를 쓸 수 없는 두 탭은 동시 갱신 순서를 보장하지 못해 세션이 폐기될 수 있다(T4 보장 범위 밖)', async () => {
  const browser = fakeBrowser();
  const a = tab({ browser, locks: null });
  const b = tab({ browser, locks: null });
  assert.deepEqual([a.lock.mode, b.lock.mode], ['tab-only', 'tab-only']);
  const results = await Promise.all([a.session.refresh(), b.session.refresh()]);
  assert.deepEqual(browser.state.log, ['refresh C1→200', 'refresh C1→401']);
  assert.equal(browser.revoked(), true);
  assert.deepEqual(results, [{ kind: 'signed-in' }, { kind: 'failed', cause: 'session-ended' }]);
});

test('[대역] 다른 탭의 갱신 응답이 늦어도 이 탭의 로그아웃은 그 응답 뒤 최신 쿠키로 나가 마지막 쿠키 변경이 된다', async () => {
  const browser = fakeBrowser();
  const locks = fakeLockManager();
  const hold = deferred();
  const other = tab({ browser, locks, refreshHold: hold.promise });
  const self = tab({ browser, locks });
  const refreshing = other.session.refresh();
  await tick(); await tick();
  const loggingOut = self.session.logout();
  await tick(); await tick();
  assert.deepEqual(browser.state.log, ['refresh C1→200']);
  hold.resolve();
  assert.deepEqual(await refreshing, { kind: 'signed-in' });
  assert.deepEqual(await loggingOut, { kind: 'settled', result: 'done' });
  assert.deepEqual(browser.state.log, ['refresh C1→200', 'logout C2→204']);
  assert.equal(browser.state.jar, null);
});

// ---- 잠금 대기 중 상태 변경 ----

test('[대역] 다른 탭이 잠금을 쥔 동안 이 탭에서 새 로그인이 시작되면 대기 중이던 갱신을 보내지 않는다', async () => {
  const browser = fakeBrowser();
  const locks = fakeLockManager();
  const hold = deferred();
  const self = tab({ browser, locks });
  const other = holdElsewhere(locks, hold.promise);
  const pending = self.session.refresh();
  self.store.loginStarted();
  hold.resolve();
  await other;
  assert.deepEqual(await pending, { kind: 'discarded', sent: false });
  assert.deepEqual(browser.state.log, []);
});

test('[대역] 다른 탭이 잠금을 쥔 동안 이 탭에서 로그아웃이 시작되면 대기 중이던 갱신을 보내지 않고 로그아웃만 보낸다', async () => {
  const browser = fakeBrowser();
  const locks = fakeLockManager();
  const hold = deferred();
  const self = tab({ browser, locks });
  const other = holdElsewhere(locks, hold.promise);
  const refreshing = self.session.refresh();
  const loggingOut = self.session.logout();
  hold.resolve();
  await other;
  assert.deepEqual(await refreshing, { kind: 'discarded', sent: false });
  assert.deepEqual(await loggingOut, { kind: 'settled', result: 'done' });
  assert.deepEqual(browser.state.log, ['logout C1→204']);
});

test('[대역] 다른 탭이 잠금을 쥔 동안 이 탭에서 새 로그인이 성공하면 대기 중이던 로그아웃을 보내지 않는다', async () => {
  const browser = fakeBrowser();
  const locks = fakeLockManager();
  const hold = deferred();
  const self = tab({ browser, locks });
  const other = holdElsewhere(locks, hold.promise);
  const loggingOut = self.session.logout();
  const attempt = self.store.loginStarted();
  self.store.signedIn('access-new', attempt);
  hold.resolve();
  await other;
  assert.deepEqual(await loggingOut, { kind: 'discarded', sent: false });
  assert.deepEqual(browser.state.log, []);
  assert.equal(self.store.accessToken(), 'access-new');
});

// ---- 예외 뒤 다음 요청 ----

test('갱신 호출 함수가 예외를 던져도 Web Lock이 놓여 다음 로그아웃이 실행된다', async () => {
  const locks = fakeLockManager();
  const store = createAuthStore(); store.signedIn('access-0');
  const session = createAuthSession({
    store,
    lock: createSessionLock({ locks }),
    refreshTransport: async () => { throw new Error('unexpected'); },
    logoutTransport: async () => ({ kind: 'ended' }),
  });
  assert.deepEqual(await session.refresh(), { kind: 'failed', cause: 'outcome-unknown' });
  assert.equal(store.getSnapshot().status, 'reauth-required');
  assert.deepEqual(await session.logout(), { kind: 'settled', result: 'done' });
  assert.deepEqual(locks.log, [
    `grant ${SESSION_LOCK_NAME} exclusive`, `release ${SESSION_LOCK_NAME}`,
    `grant ${SESSION_LOCK_NAME} exclusive`, `release ${SESSION_LOCK_NAME}`,
  ]);
});

test('Web Lock 사용 실패 뒤에도 요청은 탭 안 잠금으로 실행되고 결과가 반영된다', async () => {
  const store = createAuthStore(); store.signedIn('access-0');
  const lock = createSessionLock({ locks: { request() { throw new Error('not allowed'); } } });
  const session = createAuthSession({ store, lock, refreshTransport: async () => ({ kind: 'issued', accessToken: 'access-1' }),
    logoutTransport: async () => ({ kind: 'ended' }) });
  assert.deepEqual(await session.refresh(), { kind: 'signed-in' });
  assert.deepEqual([lock.mode, lock.fallback], ['tab-only', 'failed']);
  assert.equal(store.accessToken(), 'access-1');
});

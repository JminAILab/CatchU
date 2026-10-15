import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAuthStore } from '../src/lib/auth-state.ts';
import { createAuthSession, createSessionLock } from '../src/lib/auth-session.ts';
import { browserMarkerStorage, createLoginMarker, LOGIN_MARKER_KEY } from '../src/lib/auth-login-marker.ts';

const tick = () => new Promise((resolve) => setImmediate(resolve));
const err = (status, code) => ({ kind: 'error', status, code });
const HEX32 = /^[0-9a-f]{32}$/;

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

/** `localStorage` 대역. 여러 탭이 한 인스턴스를 쓰면 같은 출처의 저장소를 공유한다. 읽기·쓰기 실패를 켤 수 있다. */
function fakeStorage() {
  const map = new Map();
  const storage = {
    map, failRead: false, failWrite: false,
    getItem(key) { if (storage.failRead) throw new Error('read blocked'); return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { if (storage.failWrite) throw new Error('quota'); map.set(key, String(value)); },
  };
  return storage;
}

/** 시험용 무작위 값(32자리 16진수). */
function sequence() {
  let n = 0;
  return () => (++n).toString(16).padStart(32, '0');
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

/** 서버·쿠키 대역(갱신·로그아웃·로그인). 발급 토큰에 회원 표시를 넣는다. 실제 서버·브라우저 검증이 아니다. */
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
      return set ? { kind: 'issued', accessToken: `access-${sessions.get(record.sid).member}-${set}` } : err(401, 'AUTH_INVALID');
    },
    logout: () => async () => {
      const sent = state.jar;
      await tick();
      const record = sent ? tokens.get(sent) : undefined;
      if (record) sessions.get(record.sid).revoked = true;
      state.log.push(`logout ${sent ?? 'none'}→204`);
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
    memberOfJar: () => (state.jar ? sessions.get(tokens.get(state.jar).sid).member : null),
    count: (kind) => state.log.filter((l) => l.startsWith(kind)).length,
  };
}

/** 한 탭: 복원 중으로 시작하는 저장소, 로그인 표식, 같은 잠금을 쓰는 세션. */
function tab({ browser, locks, storage, random, refreshHold }) {
  const store = createAuthStore();
  const marker = createLoginMarker({ storage, random });
  const session = createAuthSession({ store, marker, lock: createSessionLock({ locks }),
    refreshTransport: browser.refresh(refreshHold), logoutTransport: browser.logout() });
  return { store, marker, session };
}

/** 이 탭의 로그인 완료(대역): 시도 시작 → 잠금 안에서 로그인 요청 → 성공과 표식 기록. */
function loginIn(t, browser, member, { hold } = {}) {
  const attempt = t.store.loginStarted();
  return t.session.withSessionLock(async () => {
    if (hold) await hold;
    return t.session.loginSucceeded(await browser.login(member), attempt);
  });
}

/** 같은 출처의 두 탭. A는 기존 세션(X)을 복원해 둔다. */
async function twoTabs() {
  const browser = fakeBrowser();
  const locks = fakeLockManager();
  const storage = fakeStorage();
  const random = sequence();
  const a = tab({ browser, locks, storage, random });
  const b = tab({ browser, locks, storage, random });
  assert.deepEqual(await a.session.refresh(), { kind: 'signed-in' }); // A 복원(표식 없음 → null을 기준값으로)
  return { browser, locks, storage, a, b };
}

/** 감지 뒤 정책 미지정 상태 확인: 상태 그대로, 토큰 없음, 감지 기록, 갱신·로그아웃을 시작하지 않음. */
function assertDetectedWithoutPolicy(store, status) {
  assert.equal(store.loginChangeDetected(), true);
  assert.equal(store.getSnapshot().status, status);
  assert.equal(store.accessToken(), null);
  assert.equal(store.refreshStarted(), null);
  assert.equal(store.logoutStarted(), null);
}

// ---- 표식 자체 ----

test('로그인 성공 표식은 무작위 32자리 16진수이며 정해진 키 하나에만 쓰고 토큰·회원 정보를 담지 않는다', () => {
  const storage = fakeStorage();
  const marker = createLoginMarker({ storage });
  assert.equal(marker.issue(), true);
  const first = storage.map.get(LOGIN_MARKER_KEY);
  assert.match(first, HEX32);
  assert.equal(marker.issue(), true);
  assert.notEqual(storage.map.get(LOGIN_MARKER_KEY), first);
  assert.deepEqual([...storage.map.keys()], [LOGIN_MARKER_KEY]);
});

test('비교: 세션 확인 전·같음·다른 로그인·표식 사라짐·읽기 실패를 구분하고, 기준값은 불일치 뒤에도 남는다', () => {
  const storage = fakeStorage();
  const mine = createLoginMarker({ storage, random: sequence() });
  const other = createLoginMarker({ storage, random: () => 'f'.repeat(32) });
  assert.equal(mine.compare(), 'no-session');
  mine.issue();
  assert.equal(mine.compare(), 'same');
  storage.failRead = true;
  assert.equal(mine.compare(), 'unreadable');
  storage.failRead = false;
  assert.equal(mine.compare(), 'same'); // 복구되면 다시 읽어 비교를 재개
  other.issue();
  assert.equal(mine.compare(), 'changed');
  storage.map.delete(LOGIN_MARKER_KEY);
  assert.equal(mine.compare(), 'changed');
});

test('확인 때 읽지 못했거나 로그인 뒤 쓰지 못하면 기준값이 없어 비교는 unconfirmed이고, 그때 읽기도 실패하면 unreadable이다', () => {
  const storage = fakeStorage();
  const marker = createLoginMarker({ storage });
  marker.adopt({ ok: false });
  assert.equal(marker.compare(), 'unconfirmed');
  storage.failRead = true;
  assert.equal(marker.compare(), 'unreadable');
  storage.failRead = false;
  storage.failWrite = true;
  const writer = createLoginMarker({ storage });
  assert.equal(writer.issue(), false);
  assert.equal(writer.compare(), 'unconfirmed');
  assert.equal(storage.map.size, 0);
});

test('localStorage에 접근할 수 없는 환경은 읽기 실패로 보며 별도 예외 정책을 두지 않는다', () => {
  const marker = createLoginMarker({ storage: null });
  assert.equal(marker.issue(), false);
  assert.equal(marker.compare(), 'unreadable');
  marker.adopt(marker.read());
  assert.equal(marker.compare(), 'unreadable');
});

test('브라우저 저장소: 접근 자체가 예외면 null, getItem·setItem이 있으면 그것을 쓴다', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  if (original && !original.configurable) return; // 바꿀 수 없는 실행 환경에서는 건너뛴다.
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
    assert.equal(browserMarkerStorage(), null);
    const storage = fakeStorage();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
    assert.equal(browserMarkerStorage(), storage);
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {} });
    assert.equal(browserMarkerStorage(), null);
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
});

// ---- 상태 저장소: 감지·무효화·보호 유지(정책 없음) ----

test('invalidateByLoginMarker: 상태는 그대로 두고 세대·토큰·이전 요청 표만 끊으며, 한 번만 처리한다', () => {
  const store = createAuthStore(); store.signedIn('access-1');
  const old = store.refreshStarted();
  assert.equal(store.invalidateByLoginMarker(), true);
  assert.equal(store.getSnapshot().generation, 2);
  assertDetectedWithoutPolicy(store, 'signed-in');
  assert.equal(store.refreshSucceeded('access-late', old), false); // 이전 세대 결과 무시
  const settled = store.getSnapshot();
  assert.equal(store.invalidateByLoginMarker(), false); // 다시 감지해도 바뀌지 않음
  assert.equal(store.getSnapshot(), settled);
});

test('invalidateByLoginMarker: 응답 유실 뒤 재전송 차단과 재인증 필요 상태를 그대로 둔다', () => {
  const store = createAuthStore(); store.signedIn('access-1');
  store.refreshFailed(store.refreshStarted(), 'outcome-unknown');
  assert.equal(store.invalidateByLoginMarker(), true);
  assertDetectedWithoutPolicy(store, 'reauth-required');
  store.signedIn('access-own'); // 기존 규칙: 이 탭의 로그인 성공은 이전 상태를 초기화한다
  assert.equal(store.loginChangeDetected(), false);
  assert.notEqual(store.refreshStarted(), null);
});

test('invalidateByLoginMarker: 로그아웃 결과 불명·진행 중 보류를 새 세대로 넘기고 이전 결과는 반영하지 않는다', () => {
  for (const kind of ['unknown', 'pending']) {
    const store = createAuthStore(); store.signedIn('access-1');
    const logout = store.logoutStarted();
    if (kind === 'unknown') store.logoutSettled('unknown', logout);
    assert.equal(store.invalidateByLoginMarker(), true);
    assertDetectedWithoutPolicy(store, 'signed-in');
    assert.equal(store.getSnapshot().sessionHold, 'logout-unknown', kind);
    assert.equal(store.logoutSettled('done', logout), false);
    assert.equal(store.getSnapshot().sessionHold, 'logout-unknown');
  }
});

test('invalidateByLoginMarker: 복원 중·비로그인은 기록만 하고 상태를 바꾸지 않으며, 이 탭의 로그인 시도는 그대로 둔다', () => {
  for (const store of [createAuthStore(), createAuthStore('signed-out')]) {
    const before = store.getSnapshot();
    assert.equal(store.invalidateByLoginMarker(), true);
    assert.equal(store.getSnapshot(), before);
    assert.equal(store.loginChangeDetected(), true);
  }
  const store = createAuthStore(); store.signedIn('access-1');
  const attempt = store.loginStarted();
  store.invalidateByLoginMarker();
  assert.equal(store.signedIn('access-2', attempt), 3); // 시도는 살아 있다
  assert.equal(store.loginChangeDetected(), false);
});

// ---- 다른 탭 로그인 감지(정책 미지정) ----

test('[대역] 다른 탭 로그인을 다음 갱신 전에 감지하면 이전 세대를 끊고, 정책이 없으므로 복원·상태 전환을 하지 않는다', async () => {
  const { browser, a, b } = await twoTabs();
  const g = a.store.getSnapshot().generation;
  assert.equal(await loginIn(b, browser, 'Y'), 1);
  const requests = browser.count('refresh');
  assert.deepEqual(await a.session.refresh(), { kind: 'not-started' });
  assert.equal(browser.count('refresh'), requests); // 자동 복원 없음
  assert.equal(a.store.getSnapshot().generation, g + 1);
  assertDetectedWithoutPolicy(a.store, 'signed-in');
  assert.equal(browser.memberOfJar(), 'Y');
});

test('[대역] 같은 세션의 단순 갱신은 표식이 같아 세대·스냅샷을 바꾸지 않는다', async () => {
  const { a } = await twoTabs();
  const before = a.store.getSnapshot();
  assert.deepEqual(await a.session.refresh(), { kind: 'signed-in' });
  assert.deepEqual(await a.session.refresh(), { kind: 'signed-in' });
  assert.equal(a.store.getSnapshot(), before);
  assert.equal(a.store.loginChangeDetected(), false);
});

test('[대역] 잠금을 기다리는 동안 다른 탭이 로그인하면, 잠금을 얻은 뒤 이전 세션 갱신을 보내지 않는다', async () => {
  const { browser, a, b } = await twoTabs();
  const hold = deferred();
  const bLogin = loginIn(b, browser, 'Y', { hold: hold.promise });
  await tick();
  const pending = a.session.refresh();
  hold.resolve();
  await bLogin;
  assert.deepEqual(await pending, { kind: 'discarded', sent: false });
  assert.deepEqual(browser.state.log, ['refresh C1→200', 'login Y']);
  assertDetectedWithoutPolicy(a.store, 'signed-in');
});

test('[대역] 잠금을 기다리는 동안 다른 탭이 로그인하면, 이전 세션 로그아웃을 보내지 않아 새 로그인 세션을 끊지 않는다', async () => {
  const { browser, a, b } = await twoTabs();
  const hold = deferred();
  const bLogin = loginIn(b, browser, 'Y', { hold: hold.promise });
  await tick();
  const pending = a.session.logout();
  hold.resolve();
  await bLogin;
  assert.deepEqual(await pending, { kind: 'discarded', sent: false });
  assert.deepEqual(browser.state.log, ['refresh C1→200', 'login Y']);
  assert.equal(browser.memberOfJar(), 'Y');
});

test('[대역] 응답 반영 전 비교: 갱신 응답을 기다리는 사이 표식이 바뀌면(잠금 밖에서 쓰인 경우) 그 결과를 반영하지 않는다', async () => {
  const hold = deferred();
  const { a, b } = await twoTabs();
  // A의 저장소·표식에 응답을 늦추는 갱신 대역을 붙인 세션을 만들고, 응답을 기다리는 사이 다른 탭이 표식만 바꾼다.
  const browser = fakeBrowser();
  const session = createAuthSession({ store: a.store, marker: a.marker, lock: createSessionLock({ locks: fakeLockManager() }),
    refreshTransport: browser.refresh(hold.promise), logoutTransport: browser.logout() });
  const pending = session.refresh();
  await tick(); await tick();
  b.marker.issue(); // 잠금을 쓰지 않는 환경의 다른 탭 로그인(표식만 바뀜)
  hold.resolve();
  assert.deepEqual(await pending, { kind: 'discarded', sent: true });
  assertDetectedWithoutPolicy(a.store, 'signed-in');
});

test('[대역] 탭이 다시 보일 때 표식을 비교하고, 숨겨질 때는 비교하지 않는다', async () => {
  const { browser, a, b } = await twoTabs();
  const listeners = new Set();
  const doc = { visibilityState: 'hidden', addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) };
  const stop = a.session.watchVisibility(doc);
  await loginIn(b, browser, 'Y');
  const fire = () => { for (const fn of listeners) fn(); };
  const before = a.store.getSnapshot();
  fire(); // hidden
  assert.equal(a.store.getSnapshot(), before);
  doc.visibilityState = 'visible';
  fire();
  assert.equal(a.store.getSnapshot().generation, before.generation + 1);
  assertDetectedWithoutPolicy(a.store, 'signed-in');
  stop();
  assert.equal(listeners.size, 0);
});

test('[대역] 알고 있던 표식이 사라지면 새 로그인으로 처리해 감지·무효화한다', async () => {
  const { storage, a } = await twoTabs();
  storage.map.set(LOGIN_MARKER_KEY, 'a'.repeat(32));
  storage.map.delete(LOGIN_MARKER_KEY); // A의 기준값(null)과 같아짐
  assert.equal(a.session.checkLoginMarker(), 'same');
  a.store.signedIn('access-own', a.store.loginStarted());
  const other = createLoginMarker({ storage });
  other.issue();
  a.marker.adopt(a.marker.read()); // A가 지금 값을 기준값으로
  storage.map.delete(LOGIN_MARKER_KEY);
  assert.equal(a.session.checkLoginMarker(), 'changed');
  assertDetectedWithoutPolicy(a.store, 'signed-in');
});

test('[대역·한계] 로그인 뒤 표식을 쓰지 못하면 그 탭은 곧바로 감지 상태가 되고, 다른 탭은 알아차리지 못해 새 세션을 같은 세션으로 갱신한다', async () => {
  const { storage, browser, a, b } = await twoTabs();
  storage.failWrite = true;
  assert.equal(await loginIn(b, browser, 'Y'), 1); // 로그인 자체는 반영됨
  assert.equal(b.store.getSnapshot().generation, 2); // 잠금 안 사후 비교에서 unconfirmed → 감지·무효화
  assertDetectedWithoutPolicy(b.store, 'signed-in');
  const before = a.store.getSnapshot();
  assert.deepEqual(await a.session.refresh(), { kind: 'signed-in' });
  assert.equal(a.store.getSnapshot(), before); // A는 바뀜을 모른 채
  assert.match(a.store.accessToken(), /^access-Y-/); // 다른 회원 세션 토큰을 받음(다중 탭 보장 범위 밖)
});

test('진행 중인 시도가 아닌 로그인 성공은 무시하고 표식도 쓰지 않는다', async () => {
  const { storage, browser, b } = await twoTabs();
  const stale = b.store.loginStarted();
  b.store.loginStarted(); // 새 시도
  const result = await b.session.withSessionLock(async () => b.session.loginSucceeded(await browser.login('Y'), stale));
  assert.equal(result, null);
  assert.equal(storage.map.size, 0);
});

test('(정책 미지정) 로그아웃한 탭은 기준값을 지우지 않고, 다른 탭 로그인을 감지해도 기록만 하고 상태·요청은 바꾸지 않는다', async () => {
  const { browser, a, b } = await twoTabs();
  assert.deepEqual(await a.session.logout(), { kind: 'settled', result: 'done' });
  await loginIn(b, browser, 'Y');
  const before = a.store.getSnapshot();
  const requests = browser.state.log.length;
  assert.equal(a.session.checkLoginMarker(), 'changed');
  assert.equal(a.store.getSnapshot(), before);
  assert.equal(a.store.loginChangeDetected(), true);
  assert.equal(before.status, 'signed-out');
  assert.deepEqual(await a.session.refresh(), { kind: 'not-started' });
  assert.equal(browser.state.log.length, requests);
});

test('표식을 넘기지 않은 세션은 비교하지 않는다', () => {
  const store = createAuthStore(); store.signedIn('access-1');
  const session = createAuthSession({ store, lock: createSessionLock({ locks: null }),
    refreshTransport: async () => ({ kind: 'not-sent' }), logoutTransport: async () => ({ kind: 'not-sent' }) });
  assert.equal(session.checkLoginMarker(), null);
  assert.equal(store.loginChangeDetected(), false);
});

// ---- 회귀: 보호 상태 우회 없음 ----

/** 한 탭(호출 대역 직접 지정). 호출 횟수를 센다. */
async function solo(storage, { refresh = [], logout = [] } = {}) {
  const calls = { refresh: 0, logout: 0 };
  const replies = { refresh: [{ kind: 'issued', accessToken: 'access-1' }, ...refresh], logout: [...logout] };
  const store = createAuthStore();
  const marker = createLoginMarker({ storage });
  const session = createAuthSession({ store, marker, lock: createSessionLock({ locks: null }),
    refreshTransport: async () => { calls.refresh += 1; const r = replies.refresh.shift(); if (!r) throw new Error('unexpected refresh'); return r; },
    logoutTransport: async () => { calls.logout += 1; const r = replies.logout.shift(); if (!r) throw new Error('unexpected logout'); return r; } });
  storage.map.set(LOGIN_MARKER_KEY, 'f'.repeat(32)); // 다른 탭이 써 둔 표식
  assert.deepEqual(await session.refresh(), { kind: 'signed-in' }); // 복원(기준값 확보)
  return { store, marker, session, calls };
}
const breakMarker = { 'read-failure': (s) => { s.failRead = true; }, deletion: (s) => { s.map.delete(LOGIN_MARKER_KEY); } };

for (const [name, apply] of Object.entries(breakMarker)) {
  test(`[회귀] 갱신 응답 유실 뒤 표식 ${name}이 생겨도 추가 갱신을 보내지 않는다`, async () => {
    const storage = fakeStorage();
    const { store, session, calls } = await solo(storage, { refresh: [{ kind: 'no-response' }] });
    assert.deepEqual(await session.refresh(), { kind: 'failed', cause: 'outcome-unknown' });
    assert.deepEqual([store.getSnapshot().status, calls.refresh], ['reauth-required', 2]);
    const g = store.getSnapshot().generation;
    apply(storage);
    assert.deepEqual(await session.refresh(), { kind: 'not-started' });
    assert.deepEqual(await session.refresh(), { kind: 'not-started' });
    assert.notEqual(session.checkLoginMarker(), 'same');
    assert.equal(calls.refresh, 2); // 유실된 요청 뒤로 한 건도 더 나가지 않음
    assert.equal(store.getSnapshot().generation, g + 1);
    assertDetectedWithoutPolicy(store, 'reauth-required');
  });

  test(`[회귀] 로그아웃 결과 불명 중 표식 ${name}이 생겨도 보호 호출·갱신 보류가 유지된다`, async () => {
    const storage = fakeStorage();
    const { store, session, calls } = await solo(storage, { logout: [{ kind: 'no-response' }] });
    assert.deepEqual(await session.logout(), { kind: 'settled', result: 'unknown' });
    assert.equal(store.getSnapshot().sessionHold, 'logout-unknown');
    apply(storage);
    assert.deepEqual(await session.refresh(), { kind: 'not-started' });
    assert.deepEqual(await session.logout(), { kind: 'not-started' });
    const s = store.getSnapshot();
    assert.deepEqual([calls.refresh, calls.logout], [1, 1]); // 복원 1건·로그아웃 1건 뒤로 추가 전송 없음
    assert.equal(s.sessionHold, 'logout-unknown');
    assert.equal(store.accessToken(), null); // 보호 API에 쓸 토큰 없음(보호 호출 조건: sessionHold null·signed-in·토큰)
    assertDetectedWithoutPolicy(store, 'signed-in');
  });
}

test('[회귀] 로그아웃 진행 중 다른 탭 로그인이 감지되면 늦은 로그아웃 결과는 반영하지 않고 결과 불명 보류를 유지한다', async () => {
  const storage = fakeStorage();
  const gate = deferred();
  const { store, marker, calls } = await solo(storage, { logout: [] });
  const delayed = createAuthSession({ store, marker, lock: createSessionLock({ locks: null }),
    refreshTransport: async () => { calls.refresh += 1; return { kind: 'issued', accessToken: 'x' }; },
    logoutTransport: async () => { calls.logout += 1; await gate.promise; return { kind: 'ended' }; } });
  const loggingOut = delayed.logout();
  await tick(); await tick();
  assert.equal(store.getSnapshot().sessionHold, 'logout-pending');
  storage.map.set(LOGIN_MARKER_KEY, 'e'.repeat(32)); // 다른 탭 로그인
  gate.resolve();
  assert.deepEqual(await loggingOut, { kind: 'discarded', sent: true }); // 결과 반영 전 비교에서 감지
  assert.equal(store.getSnapshot().sessionHold, 'logout-unknown');
  assert.deepEqual(await delayed.refresh(), { kind: 'not-started' });
  assert.deepEqual([calls.refresh, calls.logout], [1, 1]);
  assertDetectedWithoutPolicy(store, 'signed-in');
});

test('[회귀] 일시적인 저장소 오류가 복구되면 표식 비교가 재개되고 다른 탭의 로그인 변경을 감지한다(요청은 보내지 않음)', async () => {
  const { browser, storage, a, b } = await twoTabs();
  const requests = browser.state.log.length;
  storage.failRead = true;
  assert.equal(a.session.checkLoginMarker(), 'unreadable'); // 합의: 새 로그인으로 처리(감지·무효화)
  assertDetectedWithoutPolicy(a.store, 'signed-in');
  storage.failRead = false; // 저장소 복구
  assert.equal(a.session.checkLoginMarker(), 'same'); // 다시 읽어 비교 재개(감지 기록은 정책 없이 풀지 않음)
  await loginIn(b, browser, 'Y');
  assert.equal(a.session.checkLoginMarker(), 'changed'); // 다른 탭 로그인 변경 감지
  assert.equal(browser.state.log.length, requests + 1); // B의 로그인 1건뿐, A는 요청하지 않음
});

test('[회귀] 정책 미지정 상태에서는 감지 뒤 상태 전환·자동 복원·반복 요청이 일어나지 않는다', async () => {
  const { browser, storage, a } = await twoTabs();
  const listeners = new Set();
  const doc = { visibilityState: 'visible', addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) };
  a.session.watchVisibility(doc);
  const g = a.store.getSnapshot().generation;
  const requests = browser.state.log.length;
  storage.failRead = true; // 저장소 오류가 계속됨
  for (let i = 0; i < 5; i += 1) {
    assert.deepEqual(await a.session.refresh(), { kind: 'not-started' });
    assert.deepEqual(await a.session.logout(), { kind: 'not-started' });
    a.session.checkLoginMarker();
    for (const fn of listeners) fn();
  }
  assert.equal(browser.state.log.length, requests); // 요청 0건
  assert.equal(a.store.getSnapshot().generation, g + 1); // 무효화는 한 번
  assertDetectedWithoutPolicy(a.store, 'signed-in');
});

test('[회귀] 합의된 정상 경로: 이 탭의 로그인 성공은 기존 규칙대로 이전 상태를 초기화하고 표식을 새로 써 다시 갱신할 수 있다', async () => {
  const { browser, storage, a } = await twoTabs();
  storage.failRead = true;
  a.session.checkLoginMarker();
  assertDetectedWithoutPolicy(a.store, 'signed-in');
  storage.failRead = false;
  assert.equal(await loginIn(a, browser, 'Z'), a.store.getSnapshot().generation);
  assert.equal(a.store.loginChangeDetected(), false);
  assert.equal(a.marker.compare(), 'same');
  assert.deepEqual(await a.session.refresh(), { kind: 'signed-in' });
  assert.match(a.store.accessToken(), /^access-Z-/);
});

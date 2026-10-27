import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAuthStore } from '../src/lib/auth-state.ts';
import { createAuthSession, createSessionLock, LOGOUT_DONE_MESSAGE } from '../src/lib/auth-session.ts';
import { createLoginMarker, LOGIN_MARKER_KEY } from '../src/lib/auth-login-marker.ts';

const tick = () => new Promise((resolve) => setImmediate(resolve));

function fakeStorage() {
  const map = new Map();
  return { map, getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => { map.set(k, String(v)); } };
}

/** BroadcastChannel 대역: 같은 허브에 붙은 다른 채널에만 비동기로 전달한다. 실제 브라우저 검증이 아니다. */
function fakeHub() {
  const channels = new Set();
  const sent = [];
  return {
    sent,
    open() {
      const listeners = new Set();
      const channel = {
        postMessage(message) {
          sent.push(message);
          for (const other of channels) if (other !== channel) queueMicrotask(() => { for (const l of other.listeners) l({ data: message }); });
        },
        addEventListener(type, listener) { if (type === 'message') listeners.add(listener); },
        listeners,
      };
      channels.add(channel);
      return channel;
    },
  };
}

/** 같은 출처의 탭: 같은 저장소·허브. 로그아웃 응답은 지정한 순서로 돌려준다. */
function tab({ storage, hub, logoutReplies = [{ kind: 'ended' }] }) {
  const store = createAuthStore();
  const marker = createLoginMarker({ storage });
  const replies = [...logoutReplies];
  const calls = { refresh: 0, logout: 0 };
  const session = createAuthSession({ store, marker, lock: createSessionLock({ locks: null }), broadcast: hub ? hub.open() : null,
    refreshTransport: async () => { calls.refresh += 1; return { kind: 'issued', accessToken: 'r' + calls.refresh }; },
    logoutTransport: async () => { calls.logout += 1; return replies.shift() ?? { kind: 'ended' }; } });
  return { store, marker, session, calls };
}

/** A가 로그인하고 B가 같은 로그인을 복원한 두 탭. */
async function sameLogin(options = {}) {
  const storage = fakeStorage();
  const hub = fakeHub();
  const a = tab({ storage, hub, ...options.a });
  const b = tab({ storage, hub, ...options.b });
  await a.session.withSessionLock(async () => a.session.loginSucceeded('a-token', a.store.loginStarted()));
  assert.deepEqual(await b.session.refresh(), { kind: 'signed-in' });
  return { storage, hub, a, b };
}

test('다른 탭의 유효한 로그아웃 done: 같은 로그인을 쓰는 탭은 비로그인으로 확정하고 화면 정리를 허용한다', async () => {
  const { hub, a, b } = await sameLogin();
  const generation = b.store.getSnapshot().generation;
  assert.deepEqual(await a.session.logout(), { kind: 'settled', result: 'done' });
  await tick();
  assert.equal(hub.sent.length, 1);
  assert.deepEqual(Object.keys(hub.sent[0]).sort(), ['marker', 'type']); // 토큰·회원 정보 없음
  assert.equal(hub.sent[0].type, LOGOUT_DONE_MESSAGE);
  const s = b.store.getSnapshot();
  assert.equal(s.status, 'signed-out');
  assert.equal(s.generation, generation + 1);
  assert.equal(s.canCleanUpAfterLogout, true);
  assert.deepEqual(s.logout, { phase: 'settled', result: 'done', fromGeneration: generation, loginStartedAfter: false });
  assert.equal(b.store.accessToken(), null);
  assert.deepEqual(await b.session.refresh(), { kind: 'not-started' });
  assert.equal(b.calls.logout, 0); // B는 로그아웃을 보내지 않았다
});

test('failed·unknown 로그아웃은 알리지 않고 다른 탭을 바꾸지 않는다', async () => {
  for (const reply of [{ kind: 'error', status: 500, code: 'INTERNAL_ERROR' }, { kind: 'no-response' }]) {
    const { hub, a, b } = await sameLogin({ a: { logoutReplies: [reply] } });
    const before = b.store.getSnapshot();
    const outcome = await a.session.logout();
    assert.equal(outcome.kind, 'settled');
    assert.notEqual(outcome.result, 'done');
    await tick();
    assert.equal(hub.sent.length, 0);
    assert.equal(b.store.getSnapshot(), before);
  }
});

test('새 로그인 시작·로그인 변경 감지·이 탭의 로그아웃 진행 중인 탭은 다른 탭의 done을 반영하지 않는다', async () => {
  // 새 로그인 시도 중
  {
    const { a, b } = await sameLogin();
    b.store.loginStarted();
    const before = b.store.getSnapshot();
    await a.session.logout();
    await tick();
    assert.equal(b.store.getSnapshot().status, before.status);
    assert.equal(b.store.getSnapshot().generation, before.generation);
  }
  // 로그인 변경 감지
  {
    const { a, b } = await sameLogin();
    b.store.invalidateByLoginMarker();
    const before = b.store.getSnapshot();
    await a.session.logout();
    await tick();
    assert.equal(b.store.getSnapshot(), before);
  }
  // 이 탭의 로그아웃 진행 중
  {
    const { a, b } = await sameLogin();
    b.store.logoutStarted();
    const before = b.store.getSnapshot();
    await a.session.logout();
    await tick();
    assert.equal(b.store.getSnapshot(), before);
  }
});

test('다른 로그인의 알림(표식이 다름)·형식이 다른 알림·표식을 모르는 탭은 반영하지 않는다', async () => {
  const { storage, hub, a, b } = await sameLogin();
  const before = b.store.getSnapshot();
  const intruder = hub.open();
  intruder.postMessage({ type: LOGOUT_DONE_MESSAGE, marker: 'f'.repeat(32) });
  intruder.postMessage({ type: 'other', marker: storage.map.get(LOGIN_MARKER_KEY) });
  intruder.postMessage({ type: LOGOUT_DONE_MESSAGE });
  intruder.postMessage(null);
  await tick();
  assert.equal(b.store.getSnapshot(), before);

  // 표식을 모르는 탭(복원 때 표식이 없었음)
  const bare = tab({ storage: fakeStorage(), hub });
  await bare.session.refresh();
  const bareBefore = bare.store.getSnapshot();
  await a.session.logout();
  await tick();
  assert.equal(bare.store.getSnapshot(), bareBefore);
  assert.equal(b.store.getSnapshot().status, 'signed-out'); // 같은 로그인인 B는 반영
});

test('알림 채널이 없으면 알리지도 받지도 않고, 이 탭의 로그아웃 결과는 그대로다', async () => {
  const storage = fakeStorage();
  const a = tab({ storage, hub: null });
  await a.session.withSessionLock(async () => a.session.loginSucceeded('a-token', a.store.loginStarted()));
  assert.deepEqual(await a.session.logout(), { kind: 'settled', result: 'done' });
  assert.equal(a.store.getSnapshot().status, 'signed-out');
});

test('저장소: logoutDoneElsewhere는 로그인·재인증 필요 상태에서만 반영하고 그 밖에는 아무것도 바꾸지 않는다', () => {
  const restoring = createAuthStore();
  const before = restoring.getSnapshot();
  assert.equal(restoring.logoutDoneElsewhere(), false);
  assert.equal(restoring.getSnapshot(), before);

  const reauth = createAuthStore();
  reauth.signedIn('t', reauth.loginStarted());
  reauth.refreshFailed(reauth.refreshStarted(), 'outcome-unknown');
  assert.equal(reauth.getSnapshot().status, 'reauth-required');
  assert.equal(reauth.logoutDoneElsewhere(), true);
  assert.equal(reauth.getSnapshot().status, 'signed-out');
  assert.equal(reauth.logoutDoneElsewhere(), false);
});

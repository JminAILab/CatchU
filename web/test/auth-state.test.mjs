import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAuthStore, SERVER_AUTH_SNAPSHOT } from '../src/lib/auth-state.ts';

function watch(store) {
  const seen = { count: 0 };
  store.subscribe(() => { seen.count += 1; });
  return seen;
}

/** 로그인 상태의 저장소. */
function signedInStore(token = 'access-1') {
  const store = createAuthStore();
  store.signedIn(token);
  return store;
}

// ---- 기본 상태 ----

test('처음에는 세션 복원 확인 중이며 토큰이 없고, 바뀐 것이 없으면 같은 스냅샷을 돌려준다', () => {
  const store = createAuthStore();
  assert.equal(store.getSnapshot().status, 'restoring');
  assert.equal(store.accessToken(), null);
  assert.equal(store.getSnapshot(), store.getSnapshot());
  assert.deepEqual(SERVER_AUTH_SNAPSHOT, { status: 'restoring', generation: 0, logout: { phase: 'idle' },
    sessionHold: null, restoreUnconfirmed: false, canRetryRestore: false, canRetryLogout: false, canCleanUpAfterLogout: false, reloginOnly: false });
});

test('로그인 성공은 세대를 올리고 토큰을 메모리에 두며, 스냅샷에는 토큰이 없다', () => {
  const store = createAuthStore();
  assert.equal(store.signedIn('access-1'), 1);
  assert.equal(store.getSnapshot().status, 'signed-in');
  assert.equal(store.accessToken(), 'access-1');
  assert.ok(!JSON.stringify(store.getSnapshot()).includes('access-1'));
  assert.throws(() => store.signedIn(''), TypeError);
});

// ---- 세션 복원·갱신 ----

test('복원 성공은 로그인으로 바꾸고 세대를 올린다. 세션 없음이 확인되면 비로그인으로 확정한다', () => {
  const ok = createAuthStore();
  const t1 = ok.refreshStarted();
  assert.equal(ok.refreshSucceeded('access-1', t1), true);
  assert.deepEqual([ok.getSnapshot().status, ok.getSnapshot().generation, ok.accessToken()], ['signed-in', 1, 'access-1']);

  const none = createAuthStore();
  const t2 = none.refreshStarted();
  assert.equal(none.refreshFailed(t2, 'session-ended'), true);
  assert.deepEqual([none.getSnapshot().status, none.getSnapshot().generation, none.getSnapshot().restoreUnconfirmed],
    ['signed-out', 1, false]);
});

test('복원 중 서버가 Refresh를 쓰지 않았음이 확인된 실패는 비로그인으로 확정하지 않고 다시 확인할 수 있다', () => {
  const store = createAuthStore();
  const first = store.refreshStarted();
  assert.equal(store.refreshFailed(first, 'not-consumed'), true);
  let s = store.getSnapshot();
  assert.deepEqual([s.status, s.generation, s.restoreUnconfirmed, s.canRetryRestore], ['restoring', 0, true, true]);
  assert.equal(store.accessToken(), null);
  // 다시 확인을 시작하면 "확인하지 못함" 표시를 내리고, 이번에는 성공한다.
  const second = store.refreshStarted();
  assert.notEqual(second, null);
  assert.deepEqual([store.getSnapshot().restoreUnconfirmed, store.getSnapshot().canRetryRestore], [false, false]);
  assert.equal(store.refreshSucceeded('access-1', second), true);
  s = store.getSnapshot();
  assert.deepEqual([s.status, s.generation, s.restoreUnconfirmed], ['signed-in', 1, false]);
});

test('복원 중 응답 유실·500 재시도 소진(outcome-unknown)은 비로그인으로 확정하지 않되 이전 Refresh를 다시 보내지 않는다', () => {
  const store = createAuthStore();
  assert.equal(store.refreshFailed(store.refreshStarted(), 'outcome-unknown'), true);
  const s = store.getSnapshot();
  assert.deepEqual([s.status, s.generation, s.restoreUnconfirmed, s.canRetryRestore], ['restoring', 0, true, false]);
  // 화면 버튼과 관계없이 호출 경계에서 반복 재전송을 막는다.
  for (let i = 0; i < 3; i += 1) assert.equal(store.refreshStarted(), null);
  assert.equal(store.getSnapshot().restoreUnconfirmed, true);
});

test('결과를 알 수 없는 복원 실패 뒤에는 새 로그인으로만 벗어나며, 그 뒤 갱신은 다시 할 수 있다', () => {
  const store = createAuthStore();
  store.refreshFailed(store.refreshStarted(), 'outcome-unknown');
  store.signedIn('access-dev');
  const s = store.getSnapshot();
  assert.deepEqual([s.status, s.generation, s.restoreUnconfirmed, s.canRetryRestore], ['signed-in', 1, false, false]);
  assert.notEqual(store.refreshStarted(), null);
});

test('갱신 실패 원인은 정해진 세 값만 받는다', () => {
  const store = signedInStore();
  for (const cause of ['network', 'unconfirmed']) assert.throws(() => store.refreshFailed(store.refreshStarted(), cause), TypeError);
});

test('같은 세션의 Access 갱신은 세대·스냅샷·구독 알림을 바꾸지 않는다', () => {
  const store = signedInStore();
  const before = store.getSnapshot();
  const seen = watch(store);
  const t = store.refreshStarted();
  assert.equal(store.refreshSucceeded('access-2', t), true);
  assert.equal(store.accessToken(), 'access-2');
  assert.equal(store.getSnapshot(), before);
  assert.equal(seen.count, 0);
});

test('같은 세대에서 더 나중에 시작한 갱신이 있으면 이전 갱신의 결과는 반영하지 않는다', () => {
  const store = signedInStore();
  const first = store.refreshStarted();
  const second = store.refreshStarted();
  assert.equal(first.generation, second.generation);
  assert.equal(store.refreshSucceeded('access-old', first), false);
  assert.equal(store.refreshFailed(first, 'session-ended'), false);
  assert.equal(store.refreshSucceeded('access-new', second), true);
  assert.equal(store.accessToken(), 'access-new');
  // 반영한 표를 다시 써도 반영하지 않는다.
  assert.equal(store.refreshSucceeded('access-again', second), false);
});

test('로그인이 바뀐 뒤 도착한 이전 세션의 복원·갱신 결과는 반영하지 않는다', () => {
  const restoring = createAuthStore();
  const restore = restoring.refreshStarted();
  restoring.signedIn('access-dev'); // 복원 응답 전에 개발 로그인 성공
  for (const cause of ['session-ended', 'not-consumed', 'outcome-unknown']) assert.equal(restoring.refreshFailed(restore, cause), false);
  assert.notEqual(restoring.refreshStarted(), null);
  assert.equal(restoring.getSnapshot().status, 'signed-in');

  const store = signedInStore();
  const old = store.refreshStarted();
  store.signedIn('access-new');
  assert.equal(store.refreshSucceeded('access-stale', old), false);
  assert.equal(store.refreshFailed(old, 'session-ended'), false);
  assert.equal(store.accessToken(), 'access-new');
});

for (const cause of ['session-ended', 'not-consumed', 'outcome-unknown']) {
  test(`로그인 중 갱신이 ${cause}로 실패하면 재인증 필요로 바꾸고 세대는 유지하며, 재인증 중에는 갱신을 다시 보내지 않는다`, () => {
    const store = signedInStore();
    const generation = store.getSnapshot().generation;
    const t = store.refreshStarted();
    assert.equal(store.refreshFailed(t, cause), true);
    assert.equal(store.getSnapshot().status, 'reauth-required');
    assert.equal(store.getSnapshot().generation, generation);
    assert.equal(store.getSnapshot().restoreUnconfirmed, false);
    assert.equal(store.accessToken(), null);
    for (let i = 0; i < 3; i += 1) assert.equal(store.refreshStarted(), null);
  });
}

test('비로그인에서는 갱신을 시작하지 않는다', () => {
  const store = createAuthStore('signed-out');
  assert.equal(store.refreshStarted(), null);
});

test('sessionHold가 null이어도 인증된 요청을 보내도 된다는 뜻은 아니다', () => {
  // 로그아웃 보류는 없지만 토큰이 없다. 보호 API는 status·accessToken()도 함께 확인해야 한다.
  for (const store of [createAuthStore(), createAuthStore('signed-out')]) {
    assert.equal(store.getSnapshot().sessionHold, null);
    assert.equal(store.accessToken(), null);
  }
  const reauth = signedInStore();
  reauth.refreshFailed(reauth.refreshStarted(), 'session-ended');
  assert.deepEqual([reauth.getSnapshot().sessionHold, reauth.getSnapshot().status, reauth.accessToken()],
    [null, 'reauth-required', null]);
});

// ---- 로그아웃 기본 ----

test('로그아웃 진행 중에는 중복 시작을 막고, done이면 토큰을 지우고 비로그인으로 바꾸며 화면 정리를 허용한다', () => {
  const store = signedInStore();
  const t = store.logoutStarted();
  assert.deepEqual(store.getSnapshot().logout, { phase: 'pending', fromGeneration: 1, loginStartedAfter: false });
  assert.equal(store.logoutStarted(), null);
  assert.equal(store.logoutSettled('done', t), true);
  const s = store.getSnapshot();
  assert.deepEqual([s.status, s.generation, s.sessionHold, s.canRetryLogout, s.canCleanUpAfterLogout],
    ['signed-out', 2, null, false, true]);
  assert.equal(store.accessToken(), null);
  assert.equal(store.logoutSettled('done', t), false);
  assert.equal(store.logoutStarted(), null);
});

test('로그아웃 failed는 완료로 보지 않고 상태·토큰을 유지하며, 보류 없이 다시 시도할 수 있다', () => {
  const store = signedInStore();
  const t = store.logoutStarted();
  assert.equal(store.logoutSettled('failed', t), true);
  const s = store.getSnapshot();
  assert.deepEqual([s.status, s.sessionHold, s.canRetryLogout, s.canCleanUpAfterLogout], ['signed-in', null, true, false]);
  assert.equal(store.accessToken(), 'access-1');
  assert.notEqual(store.refreshStarted(), null);
  assert.notEqual(store.logoutStarted(), null);
});

test('로그아웃 unknown은 완료로 보지 않고, 결과를 확인할 때까지 갱신을 보류하며 다시 시도만 허용한다', () => {
  const store = signedInStore();
  const t = store.logoutStarted();
  assert.equal(store.logoutSettled('unknown', t), true);
  const s = store.getSnapshot();
  assert.deepEqual([s.status, s.sessionHold, s.canRetryLogout, s.canCleanUpAfterLogout], ['signed-in', 'logout-unknown', true, false]);
  assert.equal(store.refreshStarted(), null);
  assert.notEqual(store.logoutStarted(), null);
});

test('로그아웃 진행 중에는 갱신을 시작하지 않고, 진행 중에 도착한 갱신 결과도 반영하지 않는다', () => {
  const store = signedInStore();
  const refresh = store.refreshStarted();
  const logout = store.logoutStarted();
  assert.equal(store.getSnapshot().sessionHold, 'logout-pending');
  assert.equal(store.refreshStarted(), null);
  assert.equal(store.refreshSucceeded('access-late', refresh), false);
  assert.equal(store.refreshFailed(refresh, 'session-ended'), false);
  assert.equal(store.getSnapshot().status, 'signed-in');
  assert.equal(store.logoutSettled('failed', logout), true);
  assert.equal(store.accessToken(), 'access-1');
});

test('재인증 필요 상태에서도 로그아웃할 수 있다', () => {
  const store = signedInStore();
  store.refreshFailed(store.refreshStarted(), 'session-ended');
  const t = store.logoutStarted();
  assert.notEqual(t, null);
  assert.equal(store.logoutSettled('done', t), true);
  assert.equal(store.getSnapshot().status, 'signed-out');
});

// ---- 같은 세대의 다시 시도 ----

test('unknown 뒤 다시 시도하면 새 표를 쓰고, 이전 시도의 늦은 결과는 반영하지 않는다', () => {
  const store = signedInStore();
  const first = store.logoutStarted();
  store.logoutSettled('unknown', first);
  const second = store.logoutStarted();
  assert.equal(first.generation, second.generation);
  assert.notEqual(first.sequence, second.sequence);
  assert.equal(store.logoutSettled('done', first), false);
  assert.equal(store.getSnapshot().logout.phase, 'pending');
  assert.equal(store.logoutSettled('done', second), true);
  assert.equal(store.getSnapshot().status, 'signed-out');
});

// ---- 로그아웃과 새 로그인의 경합 ----

test('로그아웃 진행 중 새 로그인이 시작된 뒤 done이 오면 토큰은 버리되 비로그인으로 확정하지 않고 세대를 유지한다', () => {
  const store = signedInStore();
  const generation = store.getSnapshot().generation;
  const t = store.logoutStarted();
  store.loginStarted();
  assert.equal(store.getSnapshot().logout.loginStartedAfter, true);
  assert.equal(store.logoutSettled('done', t), true);
  const s = store.getSnapshot();
  // 토큰 폐기: 이전 세션은 끝났으므로 갱신·보호 호출에 쓰지 않는다.
  assert.equal(store.accessToken(), null);
  assert.equal(store.refreshStarted(), null);
  // 새 로그인 흐름·입력 보존: signed-out이 아니므로 회원 가드가 이동·정리할 근거가 없고, 세대도 그대로다.
  assert.deepEqual([s.status, s.generation, s.sessionHold, s.canCleanUpAfterLogout, s.canRetryLogout],
    ['reauth-required', generation, null, false, false]);
  // done이어도 새 로그인이 시작된 뒤에는 이전 세대의 로그아웃을 호출 경계에서 다시 보내지 않는다.
  assert.equal(store.logoutStarted(), null);
  // 진행 중이던 새 로그인이 성공하면 그때 세대가 바뀌고, 새 세대에서는 정상 로그아웃을 할 수 있다.
  store.signedIn('access-2');
  assert.deepEqual([store.getSnapshot().status, store.getSnapshot().generation], ['signed-in', generation + 1]);
  const next = store.logoutStarted();
  assert.notEqual(next, null);
  assert.equal(next.generation, generation + 1);
  assert.equal(store.logoutSettled('done', next), true);
  assert.deepEqual([store.getSnapshot().status, store.getSnapshot().canCleanUpAfterLogout], ['signed-out', true]);
});

test('로그아웃 완료 뒤 새 로그인이 시작되면 화면 정리 허용을 내린다(이미 끝난 정리를 다시 하지 않음)', () => {
  const store = signedInStore();
  store.logoutSettled('done', store.logoutStarted());
  assert.equal(store.getSnapshot().canCleanUpAfterLogout, true);
  store.loginStarted();
  assert.deepEqual([store.getSnapshot().status, store.getSnapshot().canCleanUpAfterLogout], ['signed-out', false]);
});

for (const result of ['failed', 'unknown']) {
  test(`로그아웃 진행 중 새 로그인이 시작되면 ${result} 결과의 다시 시도를 화면·호출 경계 모두에서 막는다`, () => {
    const store = signedInStore();
    const t = store.logoutStarted();
    store.loginStarted();
    assert.equal(store.logoutSettled(result, t), true);
    assert.equal(store.getSnapshot().canRetryLogout, false);
    assert.equal(store.getSnapshot().canCleanUpAfterLogout, false);
    assert.equal(store.logoutStarted(), null);
  });
}

test('결과가 나온 뒤 새 로그인이 시작돼도 다시 시도를 화면·호출 경계 모두에서 막는다', () => {
  const store = signedInStore();
  store.logoutSettled('unknown', store.logoutStarted());
  store.loginStarted();
  assert.equal(store.getSnapshot().canRetryLogout, false);
  assert.equal(store.logoutStarted(), null);
});

test('로그아웃 진행 중 새 로그인에 성공하면 이전 로그아웃 결과는 새 세션을 바꾸지 않고 보류도 풀린다', () => {
  const store = signedInStore();
  const t = store.logoutStarted();
  store.loginStarted();
  store.signedIn('access-2');
  const s = store.getSnapshot();
  assert.deepEqual([s.status, s.generation, s.logout.phase, s.sessionHold], ['signed-in', 2, 'idle', null]);
  for (const result of ['done', 'failed', 'unknown']) assert.equal(store.logoutSettled(result, t), false);
  assert.equal(store.getSnapshot().status, 'signed-in');
  assert.equal(store.accessToken(), 'access-2');
  assert.notEqual(store.refreshStarted(), null);
});

test('unknown 뒤 새 로그인에 성공하면 보류가 풀리고 새 세션의 로그아웃은 새로 시작할 수 있다', () => {
  const store = signedInStore();
  store.logoutSettled('unknown', store.logoutStarted());
  store.loginStarted();
  store.signedIn('access-2');
  const s = store.getSnapshot();
  assert.deepEqual([s.sessionHold, s.canRetryLogout, s.logout.loginStartedAfter], [null, false, true]);
  assert.notEqual(store.refreshStarted(), null);
  assert.notEqual(store.logoutStarted(), null);
});

test('로그인 상태가 아니면 로그아웃을 시작하지 않는다', () => {
  assert.equal(createAuthStore().logoutStarted(), null);
  assert.equal(createAuthStore('signed-out').logoutStarted(), null);
});

// ---- 갱신 표의 현재 여부(2단계 호출 함수용) ----

test('refreshCurrent는 상태를 바꾸지 않고, 로그아웃 보류·더 나중의 갱신·새 로그인 뒤에는 false다', () => {
  const store = signedInStore();
  const first = store.refreshStarted();
  const snapshot = store.getSnapshot();
  assert.equal(store.refreshCurrent(first), true);
  assert.equal(store.getSnapshot(), snapshot);
  const second = store.refreshStarted();
  assert.equal(store.refreshCurrent(first), false);
  assert.equal(store.refreshCurrent(second), true);
  const logout = store.logoutStarted();
  assert.equal(store.refreshCurrent(second), false);
  store.logoutSettled('failed', logout);
  assert.equal(store.refreshCurrent(second), true); // 로그아웃 failed는 완료로 확정하지 않으므로 같은 갱신을 이어 갈 수 있다.
  store.signedIn('access-2');
  assert.equal(store.refreshCurrent(second), false);
});

// ---- 새 로그인 시작과 갱신(2단계 수정) ----

test('새 로그인 시작은 이전 갱신의 표를 낡게 하고, 시도가 끝나거나 성공할 때까지 갱신·복원을 시작하지 않는다', () => {
  const store = signedInStore();
  const seen = watch(store);
  const old = store.refreshStarted();
  const attempt = store.loginStarted();
  assert.equal(seen.count, 0); // 진행 중 로그아웃이 없으면 화면 스냅샷은 바뀌지 않는다.
  assert.equal(store.refreshCurrent(old), false);
  assert.equal(store.refreshSucceeded('access-late', old), false);
  assert.equal(store.refreshFailed(old, 'session-ended'), false);
  assert.equal(store.accessToken(), 'access-1');
  assert.equal(store.refreshStarted(), null);
  store.loginAttemptEnded(attempt);
  assert.notEqual(store.refreshStarted(), null);
  store.loginStarted();
  store.signedIn('access-2');
  assert.notEqual(store.refreshStarted(), null);
});

test('낡은 표의 결과 불명도 같은 세션이면 이 페이지의 재전송을 막고, 새 로그인 성공으로만 풀린다', () => {
  const store = signedInStore();
  const t = store.refreshStarted();
  const hold = store.logoutStarted(); // 로그아웃 보류로 표가 낡음
  assert.equal(store.refreshFailed(t, 'outcome-unknown'), false);
  store.logoutSettled('failed', hold); // 로그아웃을 완료로 확정하지 않아 로그인 상태로 돌아와도
  assert.equal(store.getSnapshot().status, 'signed-in');
  assert.equal(store.refreshStarted(), null); // 이전 Refresh는 다시 보내지 않는다.
  store.signedIn('access-2');
  assert.notEqual(store.refreshStarted(), null);
});

test('다른 세대(새 로그인 뒤)의 낡은 결과 불명은 새 세션의 갱신을 막지 않는다', () => {
  const store = signedInStore();
  const old = store.refreshStarted();
  store.loginStarted();
  store.signedIn('access-2');
  assert.equal(store.refreshFailed(old, 'outcome-unknown'), false);
  assert.notEqual(store.refreshStarted(), null);
});

test('복원 중 새 로그인 시작 뒤 결과 불명이 남은 채 시도가 끝나면 확인하지 못함을 보이고 다시 확인은 허용하지 않는다', () => {
  const store = createAuthStore();
  const t = store.refreshStarted();
  const attempt = store.loginStarted();
  assert.equal(store.refreshFailed(t, 'outcome-unknown'), false);
  store.loginAttemptEnded(attempt);
  const s = store.getSnapshot();
  assert.deepEqual([s.status, s.restoreUnconfirmed, s.canRetryRestore], ['restoring', true, false]);
  assert.equal(store.refreshStarted(), null);
});

test('복원 중 새 로그인 시작 뒤 결과가 없거나 확인된 채 시도가 끝나면 복원을 다시 시작할 수 있다', () => {
  const store = createAuthStore();
  const t = store.refreshStarted();
  const attempt = store.loginStarted();
  assert.equal(store.refreshSucceeded('access-late', t), false); // 응답 쿠키는 새 Refresh로 바뀌었을 수 있다.
  store.loginAttemptEnded(attempt);
  assert.deepEqual([store.getSnapshot().status, store.getSnapshot().restoreUnconfirmed], ['restoring', false]);
  assert.notEqual(store.refreshStarted(), null);
});

// ---- 로그인 시도 구분(이전 시도의 종료 알림) ----

test('A·B 순서로 시작하면 이전 A의 취소·실패는 무시되고, 현재 B가 끝나야 갱신이 허용된다', () => {
  const store = signedInStore();
  const generation = store.getSnapshot().generation;
  const a = store.loginStarted();
  const b = store.loginStarted();
  assert.notDeepEqual(a, b);
  assert.equal(store.getSnapshot().generation, generation); // 로그인 시작은 세대를 바꾸지 않는다.
  assert.equal(store.loginAttemptEnded(a), false);
  assert.equal(store.refreshStarted(), null);
  assert.equal(store.loginAttemptEnded(b), true);
  assert.notEqual(store.refreshStarted(), null);
});

test('현재 시도가 끝난 뒤 늦게 온 이전 시도의 종료와 같은 시도의 중복 종료는 아무것도 바꾸지 않는다', () => {
  const store = signedInStore();
  const a = store.loginStarted();
  const b = store.loginStarted();
  assert.equal(store.loginAttemptEnded(b), true);
  assert.equal(store.loginAttemptEnded(a), false);
  assert.equal(store.loginAttemptEnded(b), false);
  const c = store.loginStarted();
  assert.equal(store.loginAttemptEnded(b), false); // 끝난 시도의 알림이 새 시도 C의 차단을 풀지 않는다.
  assert.equal(store.refreshStarted(), null);
  assert.equal(store.loginAttemptEnded(c), true);
  assert.notEqual(store.refreshStarted(), null);
});

test('로그인 성공 뒤 도착한 시도 종료는 무시하고, 시도 값이 아닌 값은 받지 않는다', () => {
  const store = signedInStore();
  const a = store.loginStarted();
  store.signedIn('access-2', a);
  assert.equal(store.loginAttemptEnded(a), false);
  assert.notEqual(store.refreshStarted(), null);
  for (const bad of [undefined, null, 1, {}, { loginAttempt: 'x' }]) {
    assert.throws(() => store.loginAttemptEnded(bad), TypeError);
  }
  assert.throws(() => store.signedIn('access-3', { loginAttempt: 1.5 }), TypeError);
});

test('시도 값 없는 성공(호환용)은 진행 중인 시도와 관계없이 반영하고 시도 중 표시를 끝낸다', () => {
  const store = signedInStore();
  store.loginStarted();
  assert.equal(store.signedIn('access-2'), 2);
  assert.notEqual(store.refreshStarted(), null);
});

test('복원 중 A의 결과 불명 뒤 B가 시작되면 A의 종료로는 확인하지 못함을 표시하지 않고, B가 끝날 때 표시한다', () => {
  const store = createAuthStore();
  const t = store.refreshStarted();
  const a = store.loginStarted();
  assert.equal(store.refreshFailed(t, 'outcome-unknown'), false);
  const b = store.loginStarted();
  assert.equal(store.loginAttemptEnded(a), false);
  assert.equal(store.getSnapshot().restoreUnconfirmed, false);
  assert.equal(store.loginAttemptEnded(b), true);
  assert.deepEqual([store.getSnapshot().restoreUnconfirmed, store.getSnapshot().canRetryRestore], [true, false]);
  assert.equal(store.refreshStarted(), null); // 결과 불명 뒤 이전 Refresh 재전송 금지는 유지
});

// ---- 로그인 시도 결과(성공)의 구분 ----

/** 토큰·스냅샷(같은 객체)·세대·갱신 허용이 그대로인지 확인하기 위해 지금 값을 모은다. */
function frozen(store) {
  return { token: store.accessToken(), snapshot: store.getSnapshot() };
}
function assertUnchanged(store, before) {
  assert.equal(store.accessToken(), before.token);
  assert.equal(store.getSnapshot(), before.snapshot); // 같은 객체: 상태·세대·로그아웃·표시값 모두 그대로, 알림도 없음
}

test('B 진행 중 도착한 이전 시도 A의 성공은 토큰·세대·로그아웃·재전송 차단을 바꾸지 않는다', () => {
  const store = signedInStore();
  const t = store.refreshStarted();
  const logout = store.logoutStarted(); // 로그아웃 진행 중
  const a = store.loginStarted();
  const b = store.loginStarted();
  assert.equal(store.refreshFailed(t, 'outcome-unknown'), false); // 같은 세션의 결과 불명: 재전송 차단
  const seen = watch(store);
  const before = frozen(store);
  assert.equal(store.signedIn('access-a', a), null);
  assertUnchanged(store, before);
  assert.equal(seen.count, 0);
  assert.equal(before.snapshot.logout.phase, 'pending');
  assert.equal(store.refreshStarted(), null); // B 진행 중
  // A가 반영됐다면 로그아웃 결과가 버려졌을 것이다. 무시됐으므로 진행 중 로그아웃의 결과는 그대로 반영된다.
  assert.equal(store.logoutSettled('failed', logout), true);
  assert.equal(store.loginAttemptEnded(b), true);
  assert.equal(store.refreshStarted(), null); // A가 반영됐다면 풀렸을 재전송 차단이 유지된다.
  assert.equal(store.accessToken(), 'access-1');
});

test('B 성공 뒤 도착한 이전 시도 A의 성공은 B의 토큰·세대를 덮지 않는다', () => {
  const store = signedInStore();
  const a = store.loginStarted();
  const b = store.loginStarted();
  const generation = store.signedIn('access-b', b);
  assert.equal(generation, 2);
  const before = frozen(store);
  assert.equal(store.signedIn('access-a', a), null);
  assertUnchanged(store, before);
  assert.equal(store.accessToken(), 'access-b');
  assert.equal(store.getSnapshot().generation, 2);
});

test('취소·실패로 끝낸 시도의 늦은 성공은 무시한다', () => {
  const store = signedInStore();
  const a = store.loginStarted();
  assert.equal(store.loginAttemptEnded(a), true);
  const before = frozen(store);
  assert.equal(store.signedIn('access-a', a), null);
  assertUnchanged(store, before);
  assert.notEqual(store.refreshStarted(), null); // 끝난 시도의 성공이 새로 시도 중으로 만들지도 않는다.
});

test('같은 시도의 성공을 두 번 받으면 두 번째는 무시한다', () => {
  const store = signedInStore();
  const b = store.loginStarted();
  assert.equal(store.signedIn('access-b', b), 2);
  const before = frozen(store);
  assert.equal(store.signedIn('access-b2', b), null);
  assertUnchanged(store, before);
  assert.equal(store.getSnapshot().generation, 2);
});

test('복원 중 이전 시도의 성공도 무시해 복원 중 상태를 유지한다', () => {
  const store = createAuthStore();
  const a = store.loginStarted();
  store.loginStarted();
  const before = frozen(store);
  assert.equal(store.signedIn('access-a', a), null);
  assertUnchanged(store, before);
  assert.equal(store.getSnapshot().status, 'restoring');
});

// ---- 로그아웃 표의 현재 여부(3단계 호출 함수용) ----

test('logoutCurrent는 상태를 바꾸지 않고, 진행 중인 바로 그 로그아웃일 때만 true다', () => {
  const store = signedInStore();
  const first = store.logoutStarted();
  const snapshot = store.getSnapshot();
  assert.equal(store.logoutCurrent(first), true);
  assert.equal(store.getSnapshot(), snapshot);
  store.loginStarted(); // 현재 초안: 새 로그인 "시작"만으로는 이전 세션 종료 요청을 막지 않는다(전송 정책은 담당자 확인 사항).
  assert.equal(store.logoutCurrent(first), true);
  store.logoutSettled('failed', first);
  assert.equal(store.logoutCurrent(first), false); // 결과가 이미 반영됨

  const other = signedInStore();
  const pending = other.logoutStarted();
  const attempt = other.loginStarted();
  other.signedIn('access-2', attempt); // 새 로그인 성공으로 세대가 바뀜
  assert.equal(other.logoutCurrent(pending), false);
  assert.equal(createAuthStore().logoutCurrent({ generation: 0, sequence: 0 }), false);
});

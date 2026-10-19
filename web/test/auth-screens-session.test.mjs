import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authScreenMessages as M, logoutNotice } from '../src/lib/auth-screen-messages.ts';
import { confirmLogout, confirmReauthLeave, createMemberLogoutControl, logoutView } from '../src/lib/member-session-screen.ts';
import { confirmDiscardUnsaved, createUnsavedRegistry } from '../src/lib/unsaved-changes.ts';

/**
 * #287 로그아웃·재인증 안내·미저장 확인의 대역 시험. 공통 인증(#286)의 `logout()`과 상태는 대역이다.
 * 정리·이동은 #286 가드가 맡으므로 여기의 제어는 이동 함수를 받지 않는다. 실제 API·브라우저·다중 탭 검증이 아니다.
 */

function deferred() { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; }

const idle = (generation = 3, canRetryLogout = false) => ({ generation, logout: { phase: 'idle' }, canRetryLogout });
const pending = (generation = 3) => ({ generation, logout: { phase: 'pending', fromGeneration: generation, loginStartedAfter: false }, canRetryLogout: false });
const settled = (result, { generation = 3, from = generation, loginStartedAfter = false, canRetryLogout = false } = {}) => ({
  generation, logout: { phase: 'settled', result, fromGeneration: from, loginStartedAfter }, canRetryLogout,
});

function logoutHarness({ dirty = false, stay = false } = {}) {
  const registry = createUnsavedRegistry();
  if (dirty) registry.register(() => true);
  const asked = [];
  const calls = [];
  const gates = [];
  const control = createMemberLogoutControl({
    logout() { calls.push('logout'); const d = deferred(); gates.push(d); return d.promise; },
    confirmLeave: () => confirmLogout(registry, (message) => { asked.push(message); return !stay; }),
  });
  return { control, asked, calls, gates };
}

test('미저장 확인: 입력이 없으면 묻지 않고, 있으면 묻는다. 등록을 풀면 다시 묻지 않는다', () => {
  const registry = createUnsavedRegistry();
  const asked = [];
  const confirm = (message) => { asked.push(message); return false; };
  assert.equal(confirmDiscardUnsaved(registry, confirm, 'q'), true);
  let dirty = true;
  const off = registry.register(() => dirty);
  const off2 = registry.register(() => false);
  assert.equal(confirmDiscardUnsaved(registry, confirm, 'q'), false);
  dirty = false;
  assert.equal(confirmDiscardUnsaved(registry, confirm, 'q'), true);
  dirty = true;
  off();
  off(); // 두 번 풀어도 다른 등록에 영향 없음
  assert.equal(registry.hasUnsaved(), false);
  off2();
  assert.deepEqual(asked, ['q']);
});

test('로그아웃: 미저장 확인에서 머무르면 요청·이동 없이 화면이 유지된다', async () => {
  const h = logoutHarness({ dirty: true, stay: true });
  assert.equal(await h.control.request(idle()), 'stayed');
  assert.deepEqual(h.asked, [M.logoutUnsavedConfirm]);
  assert.deepEqual(h.calls, []);
  assert.deepEqual(logoutView(idle(), h.control.getLocal()), { pending: false, notice: null });
});

test('로그아웃: 확인하면 한 번 보내고, 진행 중에는 다시 묻거나 보내지 않는다', async () => {
  const h = logoutHarness({ dirty: true });
  const first = h.control.request(idle());
  assert.deepEqual(h.calls, ['logout']);
  assert.equal(logoutView(idle(), h.control.getLocal()).pending, true, '공통 상태가 바뀌기 전에도 막는다');
  assert.equal(await h.control.request(idle()), 'busy');
  assert.equal(await h.control.request(pending()), 'busy');
  assert.deepEqual(h.calls, ['logout']);
  assert.equal(h.asked.length, 1);
  h.gates[0].resolve({ kind: 'settled', result: 'done' });
  assert.deepEqual(await first, { kind: 'settled', result: 'done' });
});

test('로그아웃: 공통 상태가 pending이면(다른 화면이 보낸 요청 포함) 버튼을 막고 묻지 않는다', async () => {
  const h = logoutHarness({ dirty: true });
  assert.equal(await h.control.request(pending()), 'busy');
  assert.deepEqual(h.asked, []);
  assert.equal(logoutView(pending(), h.control.getLocal()).pending, true);
});

test('로그아웃 done: 화면은 안내·이동하지 않는다(정리·이동은 가드가 현재 유효한 완료일 때만 한다)', async () => {
  const h = logoutHarness();
  const p = h.control.request(idle());
  h.gates[0].resolve({ kind: 'settled', result: 'done' });
  await p;
  const after = { ...settled('done', { generation: 4, from: 3 }), canRetryLogout: false };
  assert.deepEqual(logoutView(after, h.control.getLocal()), { pending: false, notice: null });
});

test('로그아웃 failed·unknown: 완료로 표시하지 않고 안내하며, 다시 시도는 허용될 때만 보인다', async () => {
  for (const [result, canRetry, message] of [
    ['failed', true, M.logoutFailedRetry], ['failed', false, M.logoutFailed],
    ['unknown', true, '로그아웃이 완료됐는지 확인하지 못했습니다. 다시 시도해 주세요.'],
    ['unknown', false, '로그아웃이 완료됐는지 확인하지 못했습니다.'],
  ]) {
    const h = logoutHarness();
    const p = h.control.request(idle());
    h.gates[0].resolve({ kind: 'settled', result });
    await p;
    const view = logoutView(settled(result, { canRetryLogout: canRetry }), h.control.getLocal());
    assert.deepEqual(view, { pending: false, notice: { message, retry: canRetry } }, `${result} ${canRetry}`);
    // 다시 시도할 수 없으면 다시 시도를 안내하지 않는다(#251 5번).
    if (!canRetry) assert.ok(!message.includes('다시 시도'));
  }
});

test('로그아웃 not-started·discarded: 안내 없이 진행 표시만 지운다', async () => {
  for (const outcome of [{ kind: 'not-started' }, { kind: 'discarded', sent: true }, { kind: 'discarded', sent: false }]) {
    const h = logoutHarness();
    const p = h.control.request(idle());
    h.gates[0].resolve(outcome);
    assert.deepEqual(await p, outcome);
    assert.deepEqual(logoutView(idle(), h.control.getLocal()), { pending: false, notice: null }, JSON.stringify(outcome));
  }
});

test('로그아웃: 이전 결과는 새 로그인 시작·세대 변경·다음 로그아웃 진행 뒤에 보이지 않는다', async () => {
  const h = logoutHarness();
  const p = h.control.request(idle());
  h.gates[0].resolve({ kind: 'settled', result: 'failed' });
  await p;
  const local = h.control.getLocal();
  assert.ok(logoutView(settled('failed', { canRetryLogout: true }), local).notice, '현재 결과는 보인다');
  assert.equal(logoutView(settled('failed', { loginStartedAfter: true }), local).notice, null, '새 로그인 시작 뒤');
  assert.equal(logoutView(settled('failed', { generation: 4, from: 3 }), local).notice, null, '세대 변경 뒤');
  assert.equal(logoutView(pending(), local).notice, null, '다른 로그아웃 진행 중');
  assert.equal(logoutView(idle(4), local).notice, null, '상태 초기화 뒤');
  assert.equal(logoutView(settled('unknown'), local).notice, null, '다른 결과');
});

test('로그아웃: 다른 탭의 결과로는 이 화면이 안내하지 않는다', () => {
  const h = logoutHarness();
  for (const snapshot of [settled('done', { generation: 4, from: 3 }), settled('failed'), settled('unknown')]) {
    assert.deepEqual(logoutView(snapshot, h.control.getLocal()), { pending: false, notice: null });
  }
});

test('로그아웃: 예상 밖 예외는 삼키지 않고 진행 표시를 지운다', async () => {
  const control = createMemberLogoutControl({ logout: () => Promise.reject(new Error('boom')), confirmLeave: () => true });
  await assert.rejects(control.request(idle()), /boom/);
  assert.deepEqual(control.getLocal(), { inFlight: false, last: null });
});

test('재인증 [다시 로그인]: variant 생략·reauth(입력 유지)는 미저장 확인을 거치고, 머무르면 이동하지 않는다', () => {
  for (const variant of [undefined, 'reauth']) {
    const registry = createUnsavedRegistry();
    registry.register(() => true);
    const asked = [];
    assert.equal(confirmReauthLeave(variant, registry, (m) => { asked.push(m); return false; }), false, String(variant));
    assert.equal(confirmReauthLeave(variant, registry, (m) => { asked.push(m); return true; }), true, String(variant));
    assert.deepEqual(asked, [M.reauthUnsavedConfirm, M.reauthUnsavedConfirm], String(variant));
    assert.equal(confirmReauthLeave(variant, createUnsavedRegistry(), () => assert.fail('입력이 없으면 묻지 않는다')), true);
  }
});

test('재인증 [다시 로그인]: login-changed(가드가 화면·입력을 정리한 탭)는 미저장 입력이 남아 있어도 묻지 않고 로그인 화면으로 간다', () => {
  const registry = createUnsavedRegistry();
  registry.register(() => true);
  assert.equal(confirmReauthLeave('login-changed', registry, () => assert.fail('login-changed는 묻지 않는다')), true);
});

test('안내 문구: 합의 문구를 그대로 쓰고 code·state·토큰 같은 값을 담지 않는다', () => {
  assert.equal(M.logoutUnknownRetry, '로그아웃이 완료됐는지 확인하지 못했습니다. 다시 시도해 주세요.');
  assert.equal(M.googleUnavailable, '지금은 Google 로그인을 사용할 수 없습니다.');
  assert.equal(logoutNotice('done', true), null);
  for (const message of Object.values(M)) {
    assert.equal(typeof message, 'string');
    assert.ok(!/code|state|token|토큰/i.test(message), message);
  }
});

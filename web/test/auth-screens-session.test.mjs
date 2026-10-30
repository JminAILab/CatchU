import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { authScreenMessages as M, logoutNotice } from '../src/lib/auth-screen-messages.ts';
import { confirmLogout, confirmReauthLeave, createMemberLogoutControl, createReauthLeaveControl, logoutView } from '../src/lib/member-session-screen.ts';
import { confirmDiscardUnsaved, createUnsavedRegistry, unsavedChanges } from '../src/lib/unsaved-changes.ts';

/**
 * #287 로그아웃·재인증 안내·이동 전 확인(미저장 입력·미확정 분석 요청)의 대역 시험. 공통 인증(#286)의 `logout()`과 상태는 대역이다.
 * 확인 사유는 #286 등록 수단(`createUnsavedRegistry`)을 그대로 쓴다. 분석 요청을 사유로 등록하는 화면(#153·#154)은 여기 없다.
 * 로그아웃 뒤 정리·이동은 #286 가드가 맡으므로 로그아웃 제어는 이동 함수를 받지 않는다. [다시 로그인]의 로그인 화면 이동은 대역 함수로 받는다.
 * 끝의 「화면」 절은 `ReauthNotice`를 서버 렌더링으로 그려 [다시 로그인]의 클릭 함수를 부른다. 실제 API·브라우저·다중 탭 검증이 아니다.
 */

function deferred() { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; }

const INPUT = 'unsaved-input';
const REQUEST = 'unconfirmed-analysis-request';

/** 화면들이 #286 등록 수단에 사유를 등록한 상태. 사유를 생략한 등록(`useUnsavedChanges`)은 `unsaved-input`이다. */
function registryWith(...reasons) {
  const registry = createUnsavedRegistry();
  for (const reason of reasons) registry.register(() => true, reason);
  return registry;
}

/** 사유 조합별 기대 문구(null은 묻지 않음). 같은 사유를 여러 곳에서 등록하거나 등록 순서가 달라도 같다. */
const LEAVE_CASES = [
  { reasons: [], logout: null, reauth: null },
  { reasons: [INPUT], logout: M.logoutUnsavedConfirm, reauth: M.reauthUnsavedConfirm },
  { reasons: [REQUEST], logout: M.logoutRequestConfirm, reauth: M.reauthRequestConfirm },
  { reasons: [INPUT, REQUEST], logout: M.logoutUnsavedRequestConfirm, reauth: M.reauthUnsavedRequestConfirm },
  { reasons: [REQUEST, INPUT, REQUEST], logout: M.logoutUnsavedRequestConfirm, reauth: M.reauthUnsavedRequestConfirm },
];

const idle = (generation = 3, canRetryLogout = false) => ({ generation, logout: { phase: 'idle' }, canRetryLogout });
const pending = (generation = 3) => ({ generation, logout: { phase: 'pending', fromGeneration: generation, loginStartedAfter: false }, canRetryLogout: false });
const settled = (result, { generation = 3, from = generation, loginStartedAfter = false, canRetryLogout = false } = {}) => ({
  generation, logout: { phase: 'settled', result, fromGeneration: from, loginStartedAfter }, canRetryLogout,
});

function logoutHarness({ dirty = false, reasons = dirty ? [INPUT] : [], stay = false } = {}) {
  const registry = registryWith(...reasons);
  const asked = [];
  const calls = [];
  const gates = [];
  const control = createMemberLogoutControl({
    logout() { calls.push('logout'); const d = deferred(); gates.push(d); return d.promise; },
    confirmLeave: () => confirmLogout(registry, (message) => { asked.push(message); return !stay; }),
  });
  return { control, asked, calls, gates, registry };
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

test('이동 전 확인(로그아웃): 사유 없음은 묻지 않고, 입력만은 기존 문구, 분석 요청만은 요청 문구, 둘 다는 두 내용을 담은 창을 한 번만 띄운다', () => {
  for (const { reasons, logout } of LEAVE_CASES) {
    for (const answer of [false, true]) {
      const asked = [];
      const go = confirmLogout(registryWith(...reasons), (m) => { asked.push(m); return answer; });
      assert.deepEqual(asked, logout === null ? [] : [logout], reasons.join('+'));
      assert.equal(go, logout === null || answer, `${reasons.join('+')} ${answer}`);
    }
  }
});

test('로그아웃: 분석 요청만·둘 다에서 머무르면 요청·이동 없이 끝나고 등록(입력·요청 정보)은 그대로이며, 계속하면 기존대로 한 번 보낸다', async () => {
  for (const reasons of [[REQUEST], [INPUT, REQUEST]]) {
    const stay = logoutHarness({ reasons, stay: true });
    const stayed = stay.control.request(idle());
    // 보냈다면 끝나지 않는 대역 응답을 기다리지 않고 여기서 바로 실패한다.
    assert.deepEqual(stay.calls, [], `${reasons.join('+')}: 머무르면 보내지 않는다`);
    assert.equal(await stayed, 'stayed');
    assert.equal(stay.asked.length, 1);
    assert.deepEqual(stay.registry.activeReasons(), reasons, '머물러도 등록을 풀지 않는다');
    assert.deepEqual(logoutView(idle(), stay.control.getLocal()), { pending: false, notice: null });

    const go = logoutHarness({ reasons });
    const sent = go.control.request(idle());
    assert.deepEqual(go.calls, ['logout']);
    assert.equal(go.asked.length, 1);
    go.gates[0].resolve({ kind: 'settled', result: 'done' });
    assert.deepEqual(await sent, { kind: 'settled', result: 'done' });
  }
});

test('로그아웃: 사유는 누를 때마다 다시 읽는다(제어를 만든 뒤 생긴 분석 요청·풀린 입력이 그 클릭의 문구가 된다)', async () => {
  const registry = createUnsavedRegistry();
  const now = { input: true, request: false };
  registry.register(() => now.input);
  registry.register(() => now.request, REQUEST);
  const asked = [];
  const calls = [];
  const control = createMemberLogoutControl({
    logout: async () => { calls.push('logout'); return { kind: 'settled', result: 'done' }; },
    confirmLeave: () => confirmLogout(registry, (m) => { asked.push(m); return false; }),
  });
  assert.equal(await control.request(idle()), 'stayed');
  now.request = true;
  assert.equal(await control.request(idle()), 'stayed');
  now.input = false;
  assert.equal(await control.request(idle()), 'stayed');
  now.request = false;
  assert.deepEqual(await control.request(idle()), { kind: 'settled', result: 'done' }, '사유가 모두 풀리면 묻지 않고 보낸다');
  assert.deepEqual(asked, [M.logoutUnsavedConfirm, M.logoutUnsavedRequestConfirm, M.logoutRequestConfirm]);
  assert.deepEqual(calls, ['logout']);
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

test('재인증 [다시 로그인]: variant 생략·reauth는 로그아웃과 같은 사유 조합으로 한 번만 묻고, 머무르면 이동하지 않는다', () => {
  for (const variant of [undefined, 'reauth']) {
    for (const { reasons, reauth } of LEAVE_CASES) {
      for (const answer of [false, true]) {
        const asked = [];
        const go = confirmReauthLeave(variant, registryWith(...reasons), (m) => { asked.push(m); return answer; });
        assert.deepEqual(asked, reauth === null ? [] : [reauth], `${variant} ${reasons.join('+')}`);
        assert.equal(go, reauth === null || answer, `${variant} ${reasons.join('+')} ${answer}`);
      }
    }
  }
});

test('재인증 [다시 로그인]: login-changed는 미확정 분석 요청이 함께 있어도 사유를 읽지 않고 묻지 않는다', () => {
  assert.equal(confirmReauthLeave('login-changed', registryWith(INPUT, REQUEST), () => assert.fail('login-changed는 묻지 않는다')), true);
  const unread = { activeReasons: () => assert.fail('login-changed는 사유를 읽지 않는다') };
  assert.equal(confirmReauthLeave('login-changed', unread, () => assert.fail('login-changed는 묻지 않는다')), true);
});

/** [다시 로그인] 제어. 확인은 실제 `confirmReauthLeave`이고 확인 창·이동은 대역이다. `answers`는 확인 창에서 차례로 고를 답이다. */
function reauthHarness({ reasons = [], answers = [] } = {}) {
  const registry = registryWith(...reasons);
  let reads = 0;
  const counted = { activeReasons: () => { reads += 1; return registry.activeReasons(); } };
  const asked = [];
  const navigated = [];
  const control = createReauthLeaveControl({
    confirmLeave: (variant) => confirmReauthLeave(variant, counted, (message) => {
      asked.push(message);
      return answers.shift() ?? assert.fail('준비한 답보다 많이 물었다');
    }),
    navigate: (returnTo) => { navigated.push(returnTo); },
  });
  return { control, registry, asked, navigated, reads: () => reads };
}

test('재인증 [다시 로그인]: 계속한 뒤에는 더블클릭·Enter 반복으로 다시 눌러도 묻거나 이동하지 않고 사유도 다시 읽지 않는다', () => {
  for (const variant of [undefined, 'reauth', 'login-changed']) {
    for (const { reasons, reauth } of LEAVE_CASES) {
      const label = `${variant} ${reasons.join('+')}`;
      const asks = variant !== 'login-changed' && reauth !== null;
      const h = reauthHarness({ reasons, answers: [true] });
      const notice = { returnTo: '/links', variant };
      assert.deepEqual([1, 2, 3].map(() => h.control.request(notice)), ['leaving', 'busy', 'busy'], label);
      assert.deepEqual(h.asked, asks ? [reauth] : [], label);
      assert.deepEqual(h.navigated, ['/links'], `${label}: 이동은 한 번`);
      assert.equal(h.reads(), variant === 'login-changed' ? 0 : 1, label);
    }
  }
});

test('재인증 [다시 로그인]: 머무르면 아무것도 바꾸지 않고, 다시 누르면 그 시점의 사유로 다시 물어 계속할 때 한 번 이동한다', () => {
  for (const variant of [undefined, 'reauth']) {
    const h = reauthHarness({ reasons: [REQUEST], answers: [false, false, true] });
    assert.equal(h.control.request({ returnTo: '/links', variant }), 'stayed');
    assert.equal(h.control.request({ returnTo: '/links', variant }), 'stayed');
    assert.deepEqual(h.navigated, [], `${variant}: 머무르면 이동하지 않는다`);
    assert.deepEqual(h.registry.activeReasons(), [REQUEST], `${variant}: 요청 정보 등록은 그대로`);
    h.registry.register(() => true, INPUT);
    assert.equal(h.control.request({ returnTo: '/assets', variant }), 'leaving');
    assert.equal(h.control.request({ returnTo: '/assets', variant }), 'busy');
    assert.deepEqual(h.asked, [M.reauthRequestConfirm, M.reauthRequestConfirm, M.reauthUnsavedRequestConfirm], String(variant));
    assert.deepEqual(h.navigated, ['/assets'], `${variant}: 누른 시점의 안내 값으로 한 번 간다`);
  }
});

test('재인증 [다시 로그인]: 이동을 시작하지 못한 예상 밖 예외는 삼키지 않고, 다시 누를 수 있게 되돌린다', () => {
  const navigated = [];
  let broken = true;
  const control = createReauthLeaveControl({
    confirmLeave: () => true,
    navigate: (returnTo) => { if (broken) throw new Error('boom'); navigated.push(returnTo); },
  });
  assert.throws(() => control.request({ returnTo: '/links' }), /boom/);
  broken = false;
  assert.equal(control.request({ returnTo: '/links' }), 'leaving');
  assert.equal(control.request({ returnTo: '/links' }), 'busy');
  assert.deepEqual(navigated, ['/links']);
});

test('이동 전 확인 문구: 사라지는 것 → 이미 보낸 분석 요청은 취소되지 않음(분석 요청이 들 때) → 빈 줄 뒤 확인 질문 순서다', () => {
  for (const { reasons, logout, reauth } of LEAVE_CASES.slice(1)) {
    const hasRequest = reasons.includes(REQUEST);
    for (const [message, question] of [[logout, '로그아웃하시겠습니까?'], [reauth, '로그인 화면으로 이동하시겠습니까?']]) {
      const [body, asked, ...rest] = message.split('\n\n');
      assert.deepEqual([asked, rest], [question, []], message);
      const lines = body.split('\n');
      assert.ok(lines[0].endsWith('사라집니다.'), message);
      assert.equal(lines[0].includes('저장하지 않은 입력'), reasons.includes(INPUT), message);
      assert.equal(lines[0].includes('이 화면의 분석 요청 확인 정보'), hasRequest, message);
      assert.deepEqual(lines.slice(1), hasRequest ? ['이미 보낸 분석 요청은 취소되지 않습니다.'] : [], message);
    }
  }
});

/** #251 기록의 합의 문구(D 검토안의 「수정 제안」, 「유지」는 그 전 문구). 검토 표의 `<br>`은 `\n`이다. */
const AGREED_MESSAGES = {
  logoutUnknownRetry: '로그아웃이 완료됐는지 확인하지 못했습니다. 다시 시도해 주세요.',
  logoutUnknown: '로그아웃이 완료됐는지 확인하지 못했습니다.',
  googleUnavailable: '지금은 Google 로그인을 사용할 수 없습니다.',
  googleCancelled: 'Google 로그인을 취소했습니다.',
  startLoginFailed: '로그인하지 못했습니다. 다시 시도해 주세요.',
  callbackLoginFailed: '로그인하지 못했습니다. 다시 로그인해 주세요.',
  startNetworkFailed: '네트워크 연결을 확인한 뒤 다시 시도해 주세요.',
  callbackNetworkFailed: '네트워크 연결을 확인한 뒤 다시 로그인해 주세요.',
  reauthRequired: '로그인 상태를 확인할 수 없습니다. 다시 로그인해 주세요.',
  logoutFailedRetry: '로그아웃하지 못했습니다. 다시 시도해 주세요.',
  logoutFailed: '로그아웃하지 못했습니다.',
  callbackAlreadySent: '로그인 결과를 확인하지 못했습니다. 다시 로그인해 주세요.',
  callbackAttemptUnverified: '로그인 정보를 확인할 수 없습니다. 다시 로그인해 주세요.',
  callbackChecking: 'Google 로그인을 확인하고 있습니다.',
  googleStarting: 'Google로 이동하는 중',
  logoutPending: '로그아웃하는 중',
  logoutUnsavedConfirm: '저장하지 않은 입력이 사라집니다.\n\n로그아웃하시겠습니까?',
  logoutRequestConfirm: '이 화면의 분석 요청 확인 정보가 사라집니다.\n이미 보낸 분석 요청은 취소되지 않습니다.\n\n로그아웃하시겠습니까?',
  logoutUnsavedRequestConfirm: '저장하지 않은 입력과 이 화면의 분석 요청 확인 정보가 사라집니다.\n이미 보낸 분석 요청은 취소되지 않습니다.\n\n로그아웃하시겠습니까?',
  reauthUnsavedConfirm: '저장하지 않은 입력이 사라집니다.\n\n로그인 화면으로 이동하시겠습니까?',
  reauthRequestConfirm: '이 화면의 분석 요청 확인 정보가 사라집니다.\n이미 보낸 분석 요청은 취소되지 않습니다.\n\n로그인 화면으로 이동하시겠습니까?',
  reauthUnsavedRequestConfirm: '저장하지 않은 입력과 이 화면의 분석 요청 확인 정보가 사라집니다.\n이미 보낸 분석 요청은 취소되지 않습니다.\n\n로그인 화면으로 이동하시겠습니까?',
};

test('안내 문구: #251 기록의 합의 문구를 글자 그대로 쓰고 code·state·토큰 같은 값을 담지 않는다', () => {
  assert.deepEqual({ ...M }, AGREED_MESSAGES);
  assert.equal(logoutNotice('done', true), null);
  for (const message of Object.values(M)) {
    assert.equal(typeof message, 'string');
    assert.ok(!/code|state|token|토큰/i.test(message), message);
  }
});

// ---- 화면: 재인증 안내 [다시 로그인] ----

const noticeUrl = new URL('../src/components/auth/reauth-notice.tsx', import.meta.url);
const noticeCssUrl = new URL('../src/components/auth/auth.module.css', import.meta.url);
// next/navigation 대역. 버튼이 부른 router.push의 주소를 모은다.
const navigationUrl = `data:text/javascript,${encodeURIComponent('export const pushed = []; export const useRouter = () => ({ push: (href) => { pushed.push(href); } });')}`;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL !== noticeUrl.href) return nextResolve(specifier, context);
    if (specifier === 'next/navigation') return { url: navigationUrl, shortCircuit: true };
    if (specifier.startsWith('@/')) return nextResolve(new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href, context);
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    // CSS 모듈 대역: 클래스 이름을 그대로 돌려줘 그려진 class를 확인할 수 있게 한다.
    if (url === noticeCssUrl.href) return { format: 'module', shortCircuit: true, source: 'export default new Proxy({}, { get: (_, name) => name });' };
    if (url !== noticeUrl.href) return nextLoad(url, context);
    return {
      format: 'module', shortCircuit: true,
      source: ts.transpileModule(readFileSync(noticeUrl, 'utf8'), {
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext },
      }).outputText,
    };
  },
});
const { ReauthNotice } = await import(noticeUrl.href);
const navigation = await import(navigationUrl);
hooks.deregister();

/**
 * `ReauthNotice`를 서버 렌더링으로 한 번 그리고 [다시 로그인]의 클릭 함수를 꺼낸다. 확인 창은 `window.confirm` 대역이며 `answers`를 차례로 고른다.
 * 다시 그리지 않고 같은 클릭 함수를 연달아 부르는 것이, 확인 창이 닫힌 뒤 그사이 쌓인 클릭·Enter가 같은 버튼에 이어서 들어오는 경우다.
 */
function renderNotice(props, answers) {
  navigation.pushed.length = 0;
  let element;
  const Probe = () => { element = ReauthNotice(props); return element; };
  const html = renderToStaticMarkup(createElement(Probe));
  const button = element.props.children.find((child) => child?.type === 'button');
  const asked = [];
  const press = () => {
    globalThis.window = { confirm: (message) => { asked.push(message); return answers.shift() ?? assert.fail('준비한 답보다 많이 물었다'); } };
    try {
      button.props.onClick();
    } finally {
      delete globalThis.window;
    }
  };
  return { html, asked, press };
}

/** 화면들이 탭의 등록 수단(`unsavedChanges`)에 사유를 등록한 동안 `run`을 부르고, 끝나면 그 등록만 푼다. */
function withReasons(reasons, run) {
  const unregisters = reasons.map((reason) => unsavedChanges.register(() => true, reason));
  try {
    run();
  } finally {
    for (const unregister of unregisters) unregister();
  }
}

test('화면 [다시 로그인]: 결과 불명 분석 요청이 있을 때 계속을 고르면, 이어서 들어온 클릭·Enter로 확인 창이 다시 뜨지 않고 이동은 한 번이다(#287 D 재현)', () => {
  withReasons([REQUEST], () => {
    for (const variant of [undefined, 'reauth']) {
      const notice = renderNotice({ returnTo: '/links', variant }, [true, false, false]);
      assert.ok(notice.html.includes('다시 로그인'));
      notice.press();
      notice.press();
      notice.press();
      assert.deepEqual(notice.asked, [M.reauthRequestConfirm], `${variant}: 두 번째 확인 창을 띄우지 않는다`);
      assert.deepEqual(navigation.pushed, ['/login?next=%2Flinks'], `${variant}: 이동은 한 번`);
    }
  });
});

test('화면 [다시 로그인]: 취소하면 이동 없이 요청 정보 등록이 그대로이고, 다시 누르면 다시 물어 계속할 때 한 번 이동한다', () => {
  withReasons([REQUEST], () => {
    const notice = renderNotice({ returnTo: '/links' }, [false, true]);
    notice.press();
    assert.deepEqual(navigation.pushed, [], '취소: 이동하지 않는다');
    assert.deepEqual(unsavedChanges.activeReasons(), [REQUEST], '취소: 요청 정보 등록은 그대로');
    notice.press();
    notice.press();
    assert.deepEqual(notice.asked, [M.reauthRequestConfirm, M.reauthRequestConfirm]);
    assert.deepEqual(navigation.pushed, ['/login?next=%2Flinks']);
  });
});

test('화면 [다시 로그인]: 묻지 않는 경우(사유 없음·login-changed)도 연달아 누르면 이동은 한 번이다', () => {
  for (const [variant, reasons] of [[undefined, []], ['login-changed', [INPUT, REQUEST]]]) {
    withReasons(reasons, () => {
      const notice = renderNotice({ returnTo: '/links', variant }, []);
      notice.press();
      notice.press();
      assert.deepEqual(notice.asked, [], String(variant));
      assert.deepEqual(navigation.pushed, ['/login?next=%2Flinks'], `${variant}: 이동은 한 번`);
    });
  }
});

test('화면 재인증 안내 위치: 스크롤 영역 위쪽에 붙고, 안내를 담은 모달이 열리면 바깥 안내를 숨긴다(#286 10/29 확인 필요 2)', () => {
  // 브라우저의 실제 배치·초점·낭독은 PR의 브라우저 확인으로 본다. 여기서는 그 배치를 만드는 class와 규칙이 남아 있는지만 본다.
  const { html } = renderNotice({ returnTo: '/links' }, []);
  assert.match(html, /class="notice reauthNotice" role="alert"/);
  const css = readFileSync(noticeCssUrl, 'utf8');
  const rule = css.match(/\n\.reauthNotice \{([^}]*)\}/)?.[1] ?? '';
  assert.match(rule, /position: sticky;/, '문서·모달 스크롤 영역 위쪽에 붙는다');
  assert.match(rule, /top: 0;/, '스크롤 영역 경계에 바로 붙어 뒤 내용이 틈으로 비치지 않는다');
  assert.match(rule, /margin-bottom: 8px;/, '맨 위에서는 아래 여백이 그림자를 받아 헤더에 걸치지 않는다');
  assert.doesNotMatch(rule, /position: fixed/, '흐름 밖으로 빼서 헤더·입력을 덮지 않는다');
  assert.match(css, /@media \(width < 760px\) \{\s*\.reauthNotice \{\s*justify-content: flex-start;\s*\}\s*\}/,
    '760px 미만에서만 [다시 로그인]을 문구 바로 뒤에 둔다(#437 리뷰 안 A)');
  assert.doesNotMatch(rule, /justify-content/, '760px 이상은 공용 .notice의 배치(space-between) 그대로다');
  assert.match(css, /:root:has\(\.reauthNotice:not\(dialog \.reauthNotice\)\),\s*dialog:has\(\.reauthNotice\) \{\s*overflow-anchor: none;/,
    '안내가 나타날 때 화면을 안내 높이만큼 내려 위쪽 입력을 안내 밑으로 넣지 않는다');
  assert.match(css, /:root:has\(dialog\[open\] \.reauthNotice\) \.reauthNotice:not\(dialog \.reauthNotice\) \{\s*visibility: hidden;/,
    '모달 안 안내가 있으면 바깥 안내는 보이지도 읽히지도 않는다');
});

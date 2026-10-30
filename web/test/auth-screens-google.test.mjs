import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authScreenMessages as M, googleCallbackNotice, googleCompletionNotice, googleStartNotice } from '../src/lib/auth-screen-messages.ts';
import { createGoogleCallbackControl, createGoogleStartControl } from '../src/lib/google-login-screen.ts';

/**
 * #287 Google 버튼·콜백 화면의 대역 시험. 공통 인증(#286)의 시작·해석·완료 함수와 회원 조회는 함수 대역이다.
 * 실제 Google·API·브라우저·React 렌더링 검증이 아니다.
 */

const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; }

// 화면·로그에 나오면 안 되는 합성 값
const SECRET = { code: 'code-SECRET-1', state: 'state-SECRET-1', loginAttemptToken: 'lat-SECRET-1' };
const assertNoSecret = (value) => {
  const text = JSON.stringify(value);
  for (const secret of Object.values(SECRET)) assert.ok(!text.includes(secret), `${secret} 노출: ${text}`);
};

function startHarness(results) {
  const calls = [];
  const redirects = [];
  const pending = [];
  const control = createGoogleStartControl({
    start(next) { calls.push(next); const d = deferred(); pending.push(d); return d.promise; },
    redirect(url) { redirects.push(url); },
  });
  const detach = control.attach();
  return { control, calls, redirects, pending, detach, results };
}

test('Google 버튼: 연타해도 시작은 한 번이고, ready면 Google로 이동하며 버튼은 계속 막는다', async () => {
  const h = startHarness();
  const first = h.control.press('/assets');
  void h.control.press('/assets');
  void h.control.press('/assets');
  assert.deepEqual(h.calls, ['/assets']);
  assert.deepEqual(h.control.getView(), { busy: true, notice: null });
  h.pending[0].resolve({ kind: 'ready', authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=s' });
  await first;
  assert.deepEqual(h.redirects, ['https://accounts.google.com/o/oauth2/v2/auth?state=s']);
  assert.deepEqual(h.control.getView(), { busy: true, notice: null });
  // 이동하는 동안 다시 눌러도 새 시작을 보내지 않는다.
  await h.control.press('/assets');
  assert.equal(h.calls.length, 1);
});

test('Google 버튼: 실패는 이유별로 안내하고 다시 누르면 새 시작이다. superseded는 안내 없이 버튼만 연다', async () => {
  const cases = [
    ['attempt-invalid', M.startLoginFailed], ['invalid-request', M.startLoginFailed], ['server', M.startLoginFailed],
    ['invalid-response', M.startLoginFailed], ['network', M.startNetworkFailed], ['unavailable', M.googleUnavailable],
    ['superseded', null],
  ];
  for (const [reason, notice] of cases) {
    const h = startHarness();
    const done = h.control.press(null);
    h.pending[0].resolve({ kind: 'failed', reason });
    await done;
    assert.deepEqual(h.control.getView(), { busy: false, notice }, reason);
    assert.deepEqual(h.redirects, [], reason);
    void h.control.press(null);
    assert.equal(h.calls.length, 2, `${reason}: 다시 누르면 새 시작`);
  }
  // 로그인 실패 문구는 회원 인증 만료(재인증) 문구와 다르다.
  assert.notEqual(M.startLoginFailed, M.reauthRequired);
});

test('Google 버튼: 시도 보관 실패(unavailable)는 합의 문구로 안내하고 Google로 이동하지 않는다', async () => {
  const h = startHarness();
  const done = h.control.press('/home');
  h.pending[0].resolve({ kind: 'failed', reason: 'unavailable' });
  await done;
  assert.equal(h.control.getView().notice, '지금은 Google 로그인을 사용할 수 없습니다.');
  assert.deepEqual(h.redirects, []);
});

test('Google 버튼: 화면을 떠난 뒤 온 ready로는 이동하지 않는다', async () => {
  const h = startHarness();
  const done = h.control.press(null);
  h.detach();
  h.detach(); // 두 번 떼도 다른 부착을 떼지 않는다
  h.pending[0].resolve({ kind: 'ready', authorizationUrl: 'https://accounts.google.com/x' });
  await done;
  assert.deepEqual(h.redirects, []);
  assert.equal(h.control.getView().busy, false);
});

test('Google 버튼: 개발 모드처럼 붙였다 뗐다 다시 붙여도 이동은 한 번이다', async () => {
  const redirects = [];
  const d = deferred();
  const control = createGoogleStartControl({ start: () => d.promise, redirect: (url) => redirects.push(url) });
  control.attach()();
  control.attach();
  const done = control.press(null);
  d.resolve({ kind: 'ready', authorizationUrl: 'https://accounts.google.com/y' });
  await done;
  assert.deepEqual(redirects, ['https://accounts.google.com/y']);
});

test('Google 버튼: 예상 밖 예외는 삼키지 않고 버튼을 다시 연다', async () => {
  const control = createGoogleStartControl({ start: () => Promise.reject(new Error('boom')), redirect: () => assert.fail('이동하면 안 된다') });
  control.attach();
  await assert.rejects(control.press(null), /boom/);
  assert.deepEqual(control.getView(), { busy: false, notice: M.startLoginFailed });
});

/* ---------- 콜백 ---------- */

function callbackHarness({ parse, completion, lookups = [] } = {}) {
  const log = [];
  const completeCalls = [];
  const completeGate = deferred();
  let query = new URLSearchParams(`code=${SECRET.code}&state=${SECRET.state}`);
  const lookupQueue = [...lookups];
  const control = createGoogleCallbackControl({
    readCallback(q) {
      log.push(`read:${q.toString() === '' ? 'empty' : 'query'}`);
      // query가 지워진 뒤 다시 해석하면 state가 없어 malformed가 되는 #286 동작을 흉내 낸다.
      return q.toString() === '' ? { kind: 'malformed' } : parse;
    },
    completeGoogleLogin(input) { completeCalls.push(input); log.push('complete'); return completion ?? completeGate.promise; },
    lookupMember() { log.push('lookup'); return Promise.resolve(lookupQueue.shift() ?? { state: 'failed' }); },
  });
  const begin = () => control.begin(() => query, () => { log.push('clear'); query = new URLSearchParams(); });
  return { control, log, completeCalls, completeGate, begin, currentQuery: () => query };
}

const completeParse = (next = '/assets?repositoryId=r1') => ({
  kind: 'complete',
  input: { state: SECRET.state, loginAttemptToken: SECRET.loginAttemptToken, code: SECRET.code },
  next,
});

test('콜백: 한 번만 해석해 결과를 보존한 뒤 query를 지우고, 효과가 다시 실행돼도 완료 요청은 한 번이다', async () => {
  const h = callbackHarness({ parse: completeParse() });
  h.begin();
  // 개발 모드(Strict Mode)의 효과 두 번 실행, query 제거로 인한 다시 그리기
  h.begin();
  h.begin();
  assert.deepEqual(h.log, ['read:query', 'clear', 'complete']);
  assert.equal(h.currentQuery().toString(), '');
  assert.equal(h.completeCalls.length, 1);
  assert.deepEqual(h.control.getView(), { phase: 'checking' });
  assertNoSecret(h.control.getView());
});

test('콜백: query를 지운 뒤에도 처음 해석 결과로 진행해 malformed·새 로그인 안내로 덮지 않는다', async () => {
  const h = callbackHarness({ parse: completeParse('/links'), lookups: [{ state: 'loaded', displayName: '김캐치' }] });
  h.begin();
  h.begin();
  h.completeGate.resolve({ kind: 'signed-in', suggestedDisplayName: '구글이름' });
  await tick(); await tick();
  assert.deepEqual(h.control.getView(), { phase: 'redirect', to: '/links' });
  assert.ok(!h.log.includes('read:empty'));
});

test('콜백 성공: #261 회원 조회 뒤 이름이 없으면 최초 입력, 있으면 검증된 next 또는 /home으로 간다', async () => {
  for (const [next, me, to] of [
    ['/assets', { state: 'loaded', displayName: '' }, '/profile/setup'],
    ['/assets', { state: 'loaded', displayName: '김캐치' }, '/assets'],
    [null, { state: 'loaded', displayName: '김캐치' }, '/home'],
  ]) {
    const h = callbackHarness({ parse: completeParse(next), completion: Promise.resolve({ kind: 'signed-in', suggestedDisplayName: null }), lookups: [me] });
    h.begin();
    await tick(); await tick();
    assert.deepEqual(h.control.getView(), { phase: 'redirect', to }, `${next} ${JSON.stringify(me)}`);
  }
});

test('콜백 성공 뒤 회원 조회 실패는 다시 불러오기만 하고 완료 요청을 다시 보내지 않는다', async () => {
  const h = callbackHarness({
    parse: completeParse('/links'),
    completion: Promise.resolve({ kind: 'signed-in', suggestedDisplayName: null }),
    lookups: [{ state: 'failed' }, { state: 'loaded', displayName: '김캐치' }],
  });
  h.begin();
  await tick(); await tick();
  assert.deepEqual(h.control.getView(), { phase: 'member-check-failed' });
  h.control.retryMemberCheck();
  assert.deepEqual(h.control.getView(), { phase: 'member-check' });
  await tick(); await tick();
  assert.deepEqual(h.control.getView(), { phase: 'redirect', to: '/links' });
  assert.equal(h.completeCalls.length, 1);
  assert.deepEqual(h.log.filter((l) => l === 'lookup').length, 2);
});

test('콜백 성공 뒤 보내지 않은 회원 조회(skipped)는 실패로 안내하지 않고 이동도 하지 않는다', async () => {
  const h = callbackHarness({
    parse: completeParse('/links'),
    completion: Promise.resolve({ kind: 'signed-in', suggestedDisplayName: null }),
    lookups: [{ state: 'skipped' }],
  });
  await h.begin();
  assert.deepEqual(h.control.getView(), { phase: 'ignored', loginHref: '/login?next=%2Flinks' });
  assert.equal(h.completeCalls.length, 1);
});

test('콜백: 취소는 취소 안내, 완료 실패는 회원 인증 만료와 다른 로그인 실패로 안내하고 다시 로그인은 새 시작(로그인 화면)이다', async () => {
  const cases = [
    [{ kind: 'cancelled' }, M.googleCancelled],
    [{ kind: 'failed', reason: 'attempt-invalid' }, M.callbackLoginFailed],
    [{ kind: 'failed', reason: 'invalid-request' }, M.callbackLoginFailed],
    [{ kind: 'failed', reason: 'server' }, M.callbackLoginFailed],
    [{ kind: 'failed', reason: 'invalid-response' }, M.callbackLoginFailed],
    [{ kind: 'failed', reason: 'network' }, M.callbackNetworkFailed],
    [{ kind: 'failed', reason: 'unavailable' }, M.googleUnavailable],
  ];
  for (const [result, notice] of cases) {
    const h = callbackHarness({ parse: completeParse('/assets'), completion: Promise.resolve(result) });
    h.begin();
    await tick();
    assert.deepEqual(h.control.getView(), { phase: 'notice', notice, loginHref: '/login?next=%2Fassets' }, JSON.stringify(result));
    assert.notEqual(notice, M.reauthRequired);
    assert.ok(!h.log.includes('lookup'), '실패·취소 뒤 회원 조회·이동이 없다');
    assert.equal(h.completeCalls.length, 1, '완료 요청을 다시 보내지 않는다');
    assertNoSecret(h.control.getView());
  }
});

test('콜백: superseded 결과는 안내·이동 없이 무시한다', async () => {
  const h = callbackHarness({ parse: completeParse(null), completion: Promise.resolve({ kind: 'failed', reason: 'superseded' }) });
  h.begin();
  await tick();
  assert.deepEqual(h.control.getView(), { phase: 'ignored', loginHref: '/login' });
  assert.ok(!h.log.includes('lookup'));
});

test('콜백: 완료 요청을 보내지 않는 해석 결과는 재전송·세션 확인 없이 새 로그인을 안내한다', () => {
  for (const [kind, notice] of [
    ['already-sent', M.callbackAlreadySent], ['no-attempt', M.callbackAttemptUnverified], ['expired', M.callbackAttemptUnverified],
    ['state-mismatch', M.callbackAttemptUnverified], ['provider-error', M.callbackLoginFailed], ['malformed', M.callbackLoginFailed],
  ]) {
    const h = callbackHarness({ parse: { kind } });
    h.begin();
    assert.deepEqual(h.log, ['read:query', 'clear'], kind);
    assert.deepEqual(h.control.getView(), { phase: 'notice', notice, loginHref: '/login' }, kind);
  }
});

test('안내 문구: 일반 실패·네트워크 오류는 시작 화면은 다시 시도, 콜백 화면은 [다시 로그인]에 맞추고, 콜백 해석 오류는 완료 실패와 같은 문구다', () => {
  for (const reason of ['attempt-invalid', 'invalid-request', 'server', 'invalid-response', 'network']) {
    assert.match(googleStartNotice(reason), /다시 시도해 주세요\.$/, reason);
    assert.match(googleCompletionNotice({ kind: 'failed', reason }), /다시 로그인해 주세요\.$/, reason);
  }
  const callbackFailed = googleCompletionNotice({ kind: 'failed', reason: 'server' });
  assert.equal(googleCallbackNotice('provider-error'), callbackFailed);
  assert.equal(googleCallbackNotice('malformed'), callbackFailed);
  // 취소·네트워크 오류·Google 사용 불가는 각자의 안내다.
  for (const result of [{ kind: 'cancelled' }, { kind: 'failed', reason: 'network' }, { kind: 'failed', reason: 'unavailable' }]) {
    assert.notEqual(googleCompletionNotice(result), callbackFailed, JSON.stringify(result));
  }
  // 시도 없음·만료와 다른 시도의 콜백은 문구만 같다. 다시 열린 콜백은 따로 안내한다.
  const unverified = googleCallbackNotice('no-attempt');
  assert.deepEqual([googleCallbackNotice('expired'), googleCallbackNotice('state-mismatch')], [unverified, unverified]);
  assert.notEqual(googleCallbackNotice('already-sent'), unverified);
});

test('콜백: 화면이 결과를 무시해도 늦게 온 결과는 화면이 붙어 있을 때만 이동으로 쓰인다(제어는 이동하지 않는다)', async () => {
  // 제어 객체는 이동 함수를 받지 않는다. 이동은 화면(useEffect)이 붙어 있을 때 `redirect`를 보고 한다.
  const h = callbackHarness({ parse: completeParse('/home'), lookups: [{ state: 'loaded', displayName: '김캐치' }] });
  h.begin();
  const seen = [];
  const unsubscribe = h.control.subscribe(() => seen.push(h.control.getView().phase));
  unsubscribe(); // 화면이 사라짐
  h.completeGate.resolve({ kind: 'signed-in', suggestedDisplayName: null });
  await tick(); await tick();
  assert.deepEqual(seen, []);
});

test('콜백: 완료 함수의 예상 밖 예외는 새 로그인을 안내하고 삼키지 않는다', async () => {
  const h = callbackHarness({ parse: completeParse(null), completion: Promise.reject(new Error('boom')) });
  const run = h.begin();
  assert.equal(h.begin(), run, '다시 실행돼도 같은 진행');
  await assert.rejects(run, /boom/);
  assert.deepEqual(h.control.getView(), { phase: 'notice', notice: M.callbackLoginFailed, loginHref: '/login' });
});

test('콜백: 회원 조회의 예상 밖 예외는 다시 불러오기를 보이고 삼키지 않는다', async () => {
  const control = createGoogleCallbackControl({
    readCallback: () => completeParse('/home'),
    completeGoogleLogin: () => Promise.resolve({ kind: 'signed-in', suggestedDisplayName: null }),
    lookupMember: () => Promise.reject(new Error('lookup boom')),
  });
  await assert.rejects(control.begin(() => new URLSearchParams('x=1'), () => {}), /lookup boom/);
  assert.deepEqual(control.getView(), { phase: 'member-check-failed' });
});

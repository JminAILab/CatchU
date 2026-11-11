import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAccessTokenStore } from '../src/lib/access-token.ts';
import { createApiClient } from '../src/lib/api-client.ts';
import {
  completeConnection, isGitHubAuthorizationUrl, readCallbackParams, readConnection, startConnection,
} from '../src/features/github-connection/github-connection-api.ts';
import {
  connectionStatusView, createCallbackControl, createStartControl, githubNotices, githubStartBlockedReason, noticeNextStep,
} from '../src/features/github-connection/github-connection-screen.ts';

/**
 * #253 GitHub 연동 화면의 대역 시험. 회원 API(#231)는 api.member 함수 대역이나 가짜 fetch이며,
 * 실제 GitHub·API·브라우저·React 렌더링 검증이 아니다. 기대 결과의 근거: #253 완료 기준, member-api.yaml의 GitHub 연동 계약,
 * 회원·자산 흐름 초안의 W02-G 표.
 */

const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; }

// 합성 값. 화면 표시 값에 나오면 안 된다.
const STATE = 'a'.repeat(64);
const CODE = 'code-SECRET-1';
const AUTHORIZE = `https://github.com/login/oauth/authorize?client_id=Iv1.test&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fgithub%2Fcallback&scope=repo&state=${STATE}`;
const assertNoSecret = (value) => {
  const text = JSON.stringify(value);
  for (const secret of [STATE, CODE]) assert.ok(!text.includes(secret), `노출: ${text}`);
};

const ok = (data) => ({ kind: 'success', status: 200, data });
const apiError = (status, code) => ({ kind: 'api-error', status, code, message: '안내' });
const LOOKUP_FAILED = { kind: 'lookup-failed', status: null, code: 'LOOKUP_FAILED' };

function fakeApi(result) {
  const calls = [];
  return {
    calls,
    api: {
      async member(path, request = {}) {
        calls.push({ path, method: request.method ?? 'GET', body: request.body, idempotencyKey: request.idempotencyKey });
        return result;
      },
    },
  };
}

/* ---------- 콜백 주소 해석 ---------- */

test('콜백 주소: code·state가 하나씩 있고 형식이 맞을 때만 완료 대상이다', () => {
  assert.deepEqual(readCallbackParams(new URLSearchParams({ code: CODE, state: STATE })), { kind: 'code', code: CODE, state: STATE });
  for (const query of [
    `code=${CODE}`, `state=${STATE}`,
    `code=${CODE}&code=x&state=${STATE}`, `code=${CODE}&state=${STATE}&state=${STATE}`,
    `code=${CODE}&state=${'A'.repeat(64)}`, `code=${CODE}&state=${'a'.repeat(63)}`,
    `code=&state=${STATE}`, `code=a%20b&state=${STATE}`, `code=${'c'.repeat(513)}&state=${STATE}`,
    `code=${CODE}&state=${STATE}&error=access_denied`, 'error=access_denied&error=x',
  ]) assert.deepEqual(readCallbackParams(new URLSearchParams(query)), { kind: 'malformed' }, query);
});

test('콜백 주소: 사용자 취소·GitHub 오류·값 없음을 구분한다', () => {
  assert.deepEqual(readCallbackParams(new URLSearchParams(`error=access_denied&state=${STATE}`)), { kind: 'cancelled' });
  assert.deepEqual(readCallbackParams(new URLSearchParams('error=redirect_uri_mismatch&error_description=x')), { kind: 'provider-error' });
  assert.deepEqual(readCallbackParams(new URLSearchParams('')), { kind: 'missing' });
  assert.deepEqual(readCallbackParams(new URLSearchParams('other=1')), { kind: 'missing' });
});

/* ---------- 연결 상태 조회 ---------- */

test('연결 상태: GET /me의 github 세 상태와 계정명을 읽는다', async () => {
  for (const [github, expected] of [
    [{ state: 'DISCONNECTED', accountLogin: null }, { state: 'DISCONNECTED', accountLogin: null }],
    [{ state: 'REAUTH_REQUIRED', accountLogin: 'octo' }, { state: 'REAUTH_REQUIRED', accountLogin: 'octo' }],
    [{ state: 'CONNECTED', accountLogin: 'octo' }, { state: 'CONNECTED', accountLogin: 'octo' }],
  ]) {
    const { api, calls } = fakeApi(ok({ memberId: 'm-1', profile: {}, github }));
    assert.deepEqual(await readConnection(api), { kind: 'loaded', connection: expected });
    assert.deepEqual(calls, [{ path: '/me', method: 'GET', body: undefined, idempotencyKey: undefined }]);
  }
});

test('연결 상태: 조회 실패·인증 오류·계약과 다른 응답은 미연결로 바꾸지 않고 조회 실패다', async () => {
  for (const result of [
    LOOKUP_FAILED, apiError(401, 'AUTH_REQUIRED'), apiError(500, 'INTERNAL_ERROR'),
    ok({ github: { state: 'UNKNOWN', accountLogin: null } }), ok({ github: { state: 'CONNECTED', accountLogin: 1 } }),
    ok({ github: { state: 'CONNECTED' } }), ok({ github: null }), ok({}), ok(null),
  ]) assert.deepEqual(await readConnection(fakeApi(result).api), { kind: 'failed' }, JSON.stringify(result));
});

/* ---------- 연결 시작 ---------- */

test('인증 주소: GitHub OAuth 인증 주소이고 응답 state와 같은 state를 하나만 실을 때만 이동한다', () => {
  assert.equal(isGitHubAuthorizationUrl(AUTHORIZE, STATE), true);
  const other = 'b'.repeat(64);
  for (const [url, state] of [
    [AUTHORIZE, other], [AUTHORIZE, 'not-hex'], [AUTHORIZE, undefined], [undefined, STATE], [42, STATE], ['not a url', STATE],
    [AUTHORIZE.replace('https://', 'http://'), STATE],
    [AUTHORIZE.replace('github.com', 'github.com.evil.example'), STATE],
    [AUTHORIZE.replace('https://github.com', 'https://api.github.com'), STATE],
    [AUTHORIZE.replace('https://', 'https://user:pass@'), STATE],
    [AUTHORIZE.replace('/login/oauth/authorize', '/login/oauth/authorize/x'), STATE],
    [`${AUTHORIZE}#x`, STATE], [`${AUTHORIZE}&state=${STATE}`, STATE], [AUTHORIZE.replace(`&state=${STATE}`, ''), STATE],
    ['javascript:alert(1)', STATE],
  ]) assert.equal(isGitHubAuthorizationUrl(url, state), false, String(url));
});

test('연결 시작: 본문 없는 POST 한 번, 응답이 맞으면 인증 주소를 돌려준다', async () => {
  const { api, calls } = fakeApi(ok({ authorizationUrl: AUTHORIZE, state: STATE, expiresAt: '2026-10-27T00:10:00.000Z' }));
  assert.deepEqual(await startConnection(api), { kind: 'ready', authorizationUrl: AUTHORIZE });
  assert.deepEqual(calls, [{ path: '/me/github/authorization', method: 'POST', body: undefined, idempotencyKey: undefined }]);
});

test('연결 시작: 기능 꺼짐·CatchU 인증 오류·그 밖의 실패를 구분하고, 계약과 다른 성공 응답으로 이동하지 않는다', async () => {
  for (const [result, reason] of [
    [apiError(403, 'GITHUB_CONNECTION_REQUIRED'), 'unavailable'],
    [apiError(401, 'AUTH_REQUIRED'), 'auth'], [apiError(401, 'AUTH_INVALID'), 'auth'],
    [apiError(403, 'FORBIDDEN'), 'failed'], [apiError(500, 'INTERNAL_ERROR'), 'failed'], [LOOKUP_FAILED, 'failed'],
    [ok({ authorizationUrl: 'https://evil.example/login/oauth/authorize', state: STATE }), 'failed'],
    [ok({ authorizationUrl: AUTHORIZE }), 'failed'], [ok(null), 'failed'],
  ]) assert.deepEqual(await startConnection(fakeApi(result).api), { kind: 'failed', reason }, JSON.stringify(result));
});

/* ---------- 연결 완료 ---------- */

test('연결 완료: code·state만 본문에 담아 한 번 보내고, CONNECTED와 계정명이 오면 성공이다', async () => {
  const { api, calls } = fakeApi(ok({ state: 'CONNECTED', accountLogin: 'octo' }));
  assert.deepEqual(await completeConnection(api, { code: CODE, state: STATE }), { kind: 'connected', accountLogin: 'octo' });
  assert.deepEqual(calls, [{ path: '/me/github/connection', method: 'POST', body: { code: CODE, state: STATE }, idempotencyKey: undefined }]);
});

test('연결 완료: 거부·기능 꺼짐·CatchU 인증 오류·응답 유실을 구분한다. 서버 오류·통신 실패·다른 모양의 성공은 불명이다', async () => {
  for (const [result, kind] of [
    [apiError(400, 'INVALID_REQUEST'), 'rejected'], [apiError(400, 'VALIDATION_FAILED'), 'rejected'],
    [apiError(409, 'CONFLICT'), 'rejected'],
    [apiError(403, 'GITHUB_CONNECTION_REQUIRED'), 'unavailable'],
    [apiError(401, 'AUTH_REQUIRED'), 'auth'], [apiError(401, 'AUTH_INVALID'), 'auth'],
    [apiError(500, 'INTERNAL_ERROR'), 'unknown'], [apiError(503, 'UNAVAILABLE'), 'unknown'], [LOOKUP_FAILED, 'unknown'],
    [{ kind: 'lookup-failed', status: 200, code: 'LOOKUP_FAILED' }, 'unknown'],
    [ok({ state: 'DISCONNECTED', accountLogin: null }), 'unknown'], [ok({ state: 'CONNECTED', accountLogin: '' }), 'unknown'],
    [ok({ state: 'CONNECTED' }), 'unknown'], [ok(null), 'unknown'],
  ]) assert.deepEqual(await completeConnection(fakeApi(result).api, { code: CODE, state: STATE }), { kind }, JSON.stringify(result));
});

/* ---------- 실제 API 호출 함수(createApiClient)와 가짜 fetch ---------- */

function clientWith(responses) {
  const tokens = createAccessTokenStore();
  tokens.set('token-1');
  const calls = [];
  const queue = [...responses];
  const client = createApiClient({
    baseUrl: 'http://127.0.0.1:3001',
    tokens,
    fetch: async (url, init) => {
      calls.push({ url, method: init.method, headers: { ...init.headers }, body: init.body });
      const next = queue.shift();
      if (next instanceof Error) throw next;
      return next;
    },
  });
  return { client, tokens, calls };
}

test('공통 API 호출 함수로: 시작은 Authorization만 싣고 본문·Content-Type이 없으며, 완료는 JSON 본문을 보낸다', async () => {
  const { client, calls } = clientWith([
    Response.json({ authorizationUrl: AUTHORIZE, state: STATE, expiresAt: '2026-10-27T00:10:00.000Z' }),
    Response.json({ state: 'CONNECTED', accountLogin: 'octo' }),
  ]);
  assert.equal((await startConnection(client)).kind, 'ready');
  assert.deepEqual(await completeConnection(client, { code: CODE, state: STATE }), { kind: 'connected', accountLogin: 'octo' });
  assert.equal(calls[0].url, 'http://127.0.0.1:3001/v1/me/github/authorization');
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].headers.Authorization, 'Bearer token-1');
  assert.equal(calls[0].headers['Content-Type'], undefined);
  assert.equal(calls[0].body, undefined);
  assert.equal(calls[1].url, 'http://127.0.0.1:3001/v1/me/github/connection');
  assert.equal(calls[1].headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(calls[1].body), { code: CODE, state: STATE });
});

test('공통 API 호출 함수로: 완료가 401이면 토큰을 지우고(공통 인증 흐름) 인증 오류로 돌려준다. 5xx·통신 실패는 불명이다', async () => {
  const auth = clientWith([Response.json({ code: 'AUTH_INVALID', message: '안내' }, { status: 401 })]);
  assert.deepEqual(await completeConnection(auth.client, { code: CODE, state: STATE }), { kind: 'auth' });
  assert.deepEqual(auth.tokens.get(), { token: null, ended: 'auth-failed' });

  const server = clientWith([Response.json({ code: 'INTERNAL_ERROR', message: '안내' }, { status: 500 }), new TypeError('network')]);
  assert.deepEqual(await completeConnection(server.client, { code: CODE, state: STATE }), { kind: 'unknown' });
  assert.deepEqual(await completeConnection(server.client, { code: CODE, state: STATE }), { kind: 'unknown' });
  assert.equal(server.tokens.get().token, 'token-1', '서버 오류·통신 실패는 로그인을 끊지 않는다');
});

/* ---------- 연결 시작 가능 여부·상태 표시 ---------- */

// 통합 시험 전환을 켰을 때(시작 가능)와 껐을 때(시작 막음)의 판정 입력.
const ON = { startBlockedReason: githubStartBlockedReason(true) };
const OFF = { startBlockedReason: githubStartBlockedReason(false) };
const DISCONNECTED = { state: 'DISCONNECTED', accountLogin: null };
const REAUTH = { state: 'REAUTH_REQUIRED', accountLogin: 'octo' };
const CONNECTED = { state: 'CONNECTED', accountLogin: 'octo' };

test('시작 가능 여부: 세션 복원(#286) 통합 시험 전환이 켜졌을 때만 시작하고, 꺼져 있으면 사용할 수 없는 이유를 돌려준다', () => {
  assert.equal(ON.startBlockedReason, null);
  assert.equal(OFF.startBlockedReason, 'GitHub 인증 뒤 로그인을 유지하는 기능이 준비 중이라 아직 GitHub 연결을 시작할 수 없습니다.');
});

test('상태 표시: 세 상태의 이름이 서로 다르고, 연결됨만 내 자산 이동이며 연결 해제·교체 행동이 없다', () => {
  const disconnected = connectionStatusView(DISCONNECTED, { retried: false, ...ON });
  const reauth = connectionStatusView(REAUTH, { retried: false, ...ON });
  const connected = connectionStatusView(CONNECTED, { retried: false, ...ON });
  assert.deepEqual(new Set([disconnected.label, reauth.label, connected.label]).size, 3);
  assert.deepEqual(disconnected.action, { kind: 'start', label: 'GitHub 연결' });
  assert.deepEqual(reauth.action, { kind: 'start', label: '다시 연결' });
  assert.equal(reauth.account, 'octo');
  assert.deepEqual(connected.action, { kind: 'link', label: '내 자산에서 저장소 연결 관리', href: '/assets' });
  assert.equal(connected.account, 'octo');
  for (const view of [disconnected, reauth, connected]) assert.doesNotMatch(JSON.stringify(view), /해제|연결 전/);
});

test('상태 표시: 취소·실패 안내 뒤 미연결이면 버튼은 [다시 연결]이다', () => {
  assert.deepEqual(connectionStatusView(DISCONNECTED, { retried: true, ...ON }).action, { kind: 'start', label: '다시 연결' });
  assert.equal(connectionStatusView({ state: 'CONNECTED', accountLogin: '' }, { retried: false, ...ON }).account, null);
});

test('상태 표시(전환 꺼짐): 미연결·재연결 필요는 같은 이름의 버튼을 누를 수 없게 두고 이유를 보이며, 상태·계정과 연결됨의 내 자산 이동은 그대로다', () => {
  for (const [connection, retried, label] of [
    [DISCONNECTED, false, 'GitHub 연결'], [DISCONNECTED, true, '다시 연결'], [REAUTH, false, '다시 연결'],
  ]) {
    const on = connectionStatusView(connection, { retried, ...ON });
    const off = connectionStatusView(connection, { retried, ...OFF });
    assert.deepEqual(off.action, { kind: 'unavailable', label, reason: OFF.startBlockedReason });
    assert.deepEqual({ ...off, action: null }, { ...on, action: null }, '상태 이름·계정·설명은 전환과 관계없다');
  }
  assert.deepEqual(connectionStatusView(CONNECTED, { retried: false, ...OFF }), connectionStatusView(CONNECTED, { retried: false, ...ON }));
});

test('실패 안내: 없는 연결 버튼을 가리키지 않고, 다음 행동은 지금 상태와 실제 버튼에 맞춘다', () => {
  assert.equal(githubNotices.failed.text, 'GitHub 계정을 연결하지 못했습니다.');
  const nextStep = (connection, mode) => noticeNextStep(githubNotices.failed, connectionStatusView(connection, { retried: true, ...mode }));
  assert.equal(nextStep(DISCONNECTED, ON), '연결하려면 [다시 연결]을 눌러 주세요.');
  assert.equal(nextStep(REAUTH, ON), '연결하려면 [다시 연결]을 눌러 주세요.');
  assert.equal(nextStep(CONNECTED, ON), '기존 연결은 그대로입니다.', '연결됨에는 연결 버튼이 없다');
  assert.equal(nextStep(CONNECTED, OFF), '기존 연결은 그대로입니다.');
  assert.equal(nextStep(DISCONNECTED, OFF), null, '시작을 막았으면 누를 버튼을 안내하지 않는다(이유는 버튼 옆)');
  assert.equal(nextStep(REAUTH, OFF), null);
  assert.equal(noticeNextStep(githubNotices.failed, null), null, '상태를 아직 모르면 덧붙이지 않는다');
  for (const notice of [githubNotices.cancelled, githubNotices.unknown, githubNotices.unavailable, githubNotices.startFailed]) {
    for (const connection of [DISCONNECTED, REAUTH, CONNECTED]) {
      assert.equal(noticeNextStep(notice, connectionStatusView(connection, { retried: true, ...ON })), null, notice.text);
    }
  }
  for (const notice of Object.values(githubNotices)) assert.doesNotMatch(notice.text, /연결 버튼/);
});

/* ---------- 연결 시작 버튼 ---------- */

function startHarness() {
  const calls = [];
  const redirects = [];
  const pending = [];
  const control = createStartControl({
    start() { calls.push('start'); const d = deferred(); pending.push(d); return d.promise; },
    redirect(url) { redirects.push(url); },
  });
  const detach = control.attach();
  return { control, calls, redirects, pending, detach };
}

test('시작 버튼: 누르면 바로 막고 연타해도 한 번만 시작하며, 준비되면 GitHub로 한 번 이동하고 막아 둔다', async () => {
  const h = startHarness();
  const first = h.control.press();
  void h.control.press();
  void h.control.press();
  assert.deepEqual(h.control.getView(), { busy: true, notice: null });
  assert.equal(h.calls.length, 1);
  h.pending[0].resolve({ kind: 'ready', authorizationUrl: AUTHORIZE });
  await first;
  assert.deepEqual(h.redirects, [AUTHORIZE]);
  assert.equal(h.control.getView().busy, true);
});

test('시작 버튼: 화면을 떠난 뒤 온 준비 결과로는 이동하지 않고 버튼을 다시 연다', async () => {
  const h = startHarness();
  const pressed = h.control.press();
  h.detach();
  h.detach();
  h.pending[0].resolve({ kind: 'ready', authorizationUrl: AUTHORIZE });
  await pressed;
  assert.deepEqual(h.redirects, []);
  assert.deepEqual(h.control.getView(), { busy: false, notice: null });
});

test('시작 버튼: 기능 꺼짐·실패는 안내 뒤 다시 열고, CatchU 인증 오류는 안내하지 않는다(공통 인증 흐름)', async () => {
  for (const [reason, notice] of [['unavailable', githubNotices.unavailable], ['failed', githubNotices.startFailed], ['auth', null]]) {
    const h = startHarness();
    const pressed = h.control.press();
    h.pending[0].resolve({ kind: 'failed', reason });
    await pressed;
    assert.deepEqual(h.control.getView(), { busy: false, notice }, reason);
    assert.deepEqual(h.redirects, []);
    void h.control.press();
    assert.equal(h.calls.length, 2, '다시 누르면 새로 시작한다');
  }
});

test('시작 버튼: 예상 밖 예외는 버튼을 다시 열고 그대로 올린다. bfcache 복원(reset)은 막힌 버튼만 연다', async () => {
  const control = createStartControl({ start: async () => { throw new Error('boom'); }, redirect() { assert.fail('이동하면 안 된다'); } });
  control.attach();
  await assert.rejects(control.press(), /boom/);
  assert.deepEqual(control.getView(), { busy: false, notice: githubNotices.startFailed });
  control.reset();
  assert.deepEqual(control.getView(), { busy: false, notice: githubNotices.startFailed }, '진행 중이 아니면 안내를 지우지 않는다');

  const h = startHarness();
  void h.control.press();
  h.control.reset();
  assert.deepEqual(h.control.getView(), { busy: false, notice: null });
});

/* ---------- 콜백 화면 ---------- */

function callbackHarness(query, { session = 's1' } = {}) {
  const events = [];
  const pending = [];
  let current = session;
  const control = createCallbackControl({
    readCallback: readCallbackParams,
    complete(input) { events.push(['complete', input]); const d = deferred(); pending.push(d); return d.promise; },
    session: () => current,
  });
  const begin = () => control.begin(() => { events.push(['read']); return new URLSearchParams(query); }, () => events.push(['clear']));
  return { control, events, pending, begin, switchSession(value) { current = value; } };
}

test('콜백: 주소를 읽고 지운 뒤 완료를 한 번만 보낸다. 효과가 다시 실행돼도 다시 읽거나 보내지 않는다', async () => {
  const h = callbackHarness(`code=${CODE}&state=${STATE}`);
  const first = h.begin();
  const second = h.begin();
  assert.equal(first, second);
  assert.deepEqual(h.events, [['read'], ['clear'], ['complete', { code: CODE, state: STATE }]]);
  assert.deepEqual(h.control.getView(), { phase: 'checking' });
  h.pending[0].resolve({ kind: 'connected', accountLogin: 'octo' });
  await first;
  assert.deepEqual(h.control.getView(), { phase: 'redirect', to: '/assets' });
  assertNoSecret(h.control.getView());
});

test('콜백: 거부·기능 꺼짐·응답 유실은 연결 성공으로 보지 않고 안내와 함께 연동 화면을 보인다', async () => {
  for (const [result, notice] of [
    [{ kind: 'rejected' }, githubNotices.failed],
    [{ kind: 'unavailable' }, githubNotices.unavailable],
    [{ kind: 'unknown' }, githubNotices.unknown],
    [{ kind: 'auth' }, null],
  ]) {
    const h = callbackHarness(`code=${CODE}&state=${STATE}`);
    const run = h.begin();
    h.pending[0].resolve(result);
    await run;
    assert.deepEqual(h.control.getView(), { phase: 'panel', notice }, result.kind);
    assert.equal(h.events.filter(([name]) => name === 'complete').length, 1, '다시 보내지 않는다');
    assertNoSecret(h.control.getView());
  }
});

test('콜백: 완료를 기다리는 동안 CatchU 인증이 바뀌면 결과(성공 포함)를 쓰지 않고 지금 회원의 상태만 보인다', async () => {
  const h = callbackHarness(`code=${CODE}&state=${STATE}`);
  const run = h.begin();
  h.switchSession('s2');
  h.pending[0].resolve({ kind: 'connected', accountLogin: 'octo' });
  await run;
  assert.deepEqual(h.control.getView(), { phase: 'panel', notice: null });
});

test('콜백: 취소·GitHub 오류·형식 오류·값 없음은 완료를 보내지 않는다', async () => {
  for (const [query, notice] of [
    [`error=access_denied&state=${STATE}`, githubNotices.cancelled],
    ['error=redirect_uri_mismatch', githubNotices.failed],
    [`code=${CODE}&state=bad`, githubNotices.failed],
    ['', null],
  ]) {
    const h = callbackHarness(query);
    await h.begin();
    assert.deepEqual(h.events, [['read'], ['clear']], query);
    assert.deepEqual(h.control.getView(), { phase: 'panel', notice }, query);
  }
  assert.equal(githubNotices.cancelled.tone, 'info', '취소는 오류가 아니다');
});

test('콜백: 완료 함수의 예상 밖 예외는 요청 여부를 모르므로 상태 확인을 안내하고 그대로 올린다(한 번)', async () => {
  const control = createCallbackControl({
    readCallback: readCallbackParams,
    complete: async () => { throw new Error('boom'); },
    session: () => 's1',
  });
  const run = control.begin(() => new URLSearchParams(`code=${CODE}&state=${STATE}`), () => {});
  await assert.rejects(run, /boom/);
  assert.equal(control.begin(() => assert.fail('다시 읽으면 안 된다'), () => {}), run);
  await tick();
  assert.deepEqual(control.getView(), { phase: 'panel', notice: githubNotices.unknown });
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAccessTokenStore } from '../src/lib/access-token.ts';
import { createApiClient, normalizeApiBaseUrl, parseRetryAfterSeconds } from '../src/lib/api-client.ts';
import { createIdempotencyKeyHolder, isSettledResult } from '../src/lib/idempotency.ts';

const BASE = 'http://127.0.0.1:3001';

function setup(options = {}) {
  const { responses = [] } = options;
  const baseUrl = 'baseUrl' in options ? options.baseUrl : BASE;
  const calls = [];
  const tokens = createAccessTokenStore();
  const queue = [...responses];
  const fakeFetch = async (url, init) => {
    calls.push({ url, init, headers: { ...init.headers } });
    const next = queue.shift() ?? Response.json({ ok: true });
    if (next instanceof Error) throw next;
    return next;
  };
  return { calls, tokens, client: createApiClient({ baseUrl, tokens, fetch: fakeFetch }) };
}

const authError = (code) => Response.json({ code, message: '안내' }, { status: 401 });

test('기준 주소는 http(s)만 받고 끝 슬래시를 떼며 /v1·쿼리·계정 정보가 있으면 설정 오류다', () => {
  assert.equal(normalizeApiBaseUrl(BASE), BASE);
  assert.equal(normalizeApiBaseUrl(`${BASE}/`), BASE);
  assert.equal(normalizeApiBaseUrl('https://api.example/catchu/'), 'https://api.example/catchu');
  for (const value of [undefined, '', 'localhost:3001', 'ftp://host', `${BASE}/v1`, `${BASE}/v1/`, `${BASE}?a=1`, `${BASE}#x`, 'http://u:p@host']) {
    assert.equal(normalizeApiBaseUrl(value), null, String(value));
  }
});

test('주소 설정이 없으면 요청하지 않고 조회 실패로 돌려준다', async () => {
  const { client, calls } = setup({ baseUrl: undefined });
  assert.deepEqual(await client.member('/me'), { kind: 'lookup-failed', status: null, code: 'LOOKUP_FAILED' });
  assert.deepEqual(await client.recipient('/public/links/t'), { kind: 'lookup-failed', status: null, code: 'LOOKUP_FAILED' });
  assert.equal(calls.length, 0);
});

test('회원 호출은 /v1 경로·Bearer 토큰·no-store로 보내고 쿠키를 싣지 않는다', async () => {
  const { client, calls, tokens } = setup({ responses: [Response.json({ id: 'm1' }), Response.json({ id: 'm1' })] });
  await client.member('/me');
  assert.equal(calls[0].url, `${BASE}/v1/me`);
  assert.equal(calls[0].headers.Authorization, undefined, '토큰이 없으면 Authorization을 붙이지 않는다');
  tokens.set('access-token-1');
  const result = await client.member('/me/profile', { method: 'PUT', body: { displayName: '수영' } });
  assert.deepEqual(result, { kind: 'success', status: 200, data: { id: 'm1' } });
  const { init, headers } = calls[1];
  assert.equal(init.method, 'PUT');
  assert.equal(headers.Authorization, 'Bearer access-token-1');
  assert.equal(headers['Content-Type'], 'application/json');
  assert.equal(init.body, JSON.stringify({ displayName: '수영' }));
  assert.equal(init.cache, 'no-store');
  assert.equal(init.credentials, 'omit');
});

test('수신자 호출에는 회원 토큰을 붙이지 않고 grant만 X-Link-Grant로 보낸다', async () => {
  const { client, calls, tokens } = setup();
  tokens.set('access-token-1');
  await client.recipient('/public/links/tok');
  await client.recipient('/public/links/tok/catches', { linkGrant: 'grant-1' });
  for (const call of calls) assert.equal(call.headers.Authorization, undefined);
  assert.equal(calls[0].headers['X-Link-Grant'], undefined);
  assert.equal(calls[1].headers['X-Link-Grant'], 'grant-1');
  assert.equal(calls[1].init.cache, 'no-store');
});

test('회원 AUTH_REQUIRED·AUTH_INVALID면 토큰을 지우고, 수신자 비밀번호 401과 다른 오류는 지우지 않는다', async () => {
  for (const code of ['AUTH_REQUIRED', 'AUTH_INVALID']) {
    const { client, tokens } = setup({ responses: [authError(code)] });
    tokens.set('access-token-1');
    const result = await client.member('/me');
    assert.equal(result.kind, 'api-error');
    assert.equal(result.code, code);
    assert.deepEqual(tokens.get(), { token: null, ended: 'auth-failed' });
  }
  const { client, tokens } = setup({ responses: [
    Response.json({ code: 'LINK_PASSWORD_REQUIRED', message: '안내' }, { status: 401 }),
    Response.json({ code: 'LINK_PASSWORD_INVALID', message: '안내' }, { status: 401 }),
    Response.json({ code: 'RESOURCE_UNAVAILABLE', message: '안내' }, { status: 404 }),
    Response.json({ code: 'INTERNAL_ERROR', message: '안내' }, { status: 500 }),
    new Response('<html>', { status: 502 }),
    new TypeError('network'),
  ] });
  tokens.set('access-token-1');
  await client.recipient('/public/links/t');
  await client.recipient('/public/links/t/unlock', { method: 'POST', body: { password: 'x' } });
  for (let i = 0; i < 4; i += 1) await client.member('/me');
  assert.equal(tokens.get().token, 'access-token-1');
});

test('응답을 기다리는 동안 다시 로그인했다면 이전 토큰의 401로 새 토큰을 지우지 않는다', async () => {
  let release;
  const tokens = createAccessTokenStore();
  const client = createApiClient({ baseUrl: BASE, tokens, fetch: () => new Promise((resolve) => { release = resolve; }) });
  tokens.set('old-token');
  const pending = client.member('/me');
  tokens.set('new-token');
  release(authError('AUTH_INVALID'));
  await pending;
  assert.equal(tokens.get().token, 'new-token');
});

test('같은 생성 요청은 같은 Idempotency-Key를 쓰고, 조회 실패여도 새 키로 자동 재요청하지 않는다', async () => {
  const { client, calls, tokens } = setup({ responses: [new TypeError('network'), Response.json({ linkId: 'l1' }, { status: 201 })] });
  tokens.set('access-token-1');
  let generated = 0;
  const holder = createIdempotencyKeyHolder(() => `key-${generated += 1}`);
  const first = await client.member('/share-links', { method: 'POST', body: { title: 'a' }, idempotencyKey: holder.current() });
  assert.equal(first.kind, 'lookup-failed');
  assert.equal(calls.length, 1, '응답이 불명확해도 자동으로 다시 보내지 않는다');
  const second = await client.member('/share-links', { method: 'POST', body: { title: 'a' }, idempotencyKey: holder.current() });
  assert.equal(second.kind, 'success');
  assert.deepEqual(calls.map((call) => call.headers['Idempotency-Key']), ['key-1', 'key-1']);
  holder.reset();
  assert.equal(holder.current(), 'key-2', '확정 뒤 새 요청은 새 키');
  await assert.rejects(client.member('/share-links', { method: 'POST', idempotencyKey: '' }), TypeError);
});

test('서버 저장 여부가 불명확한 결과(조회 실패·5xx)에서는 키를 유지하고, 성공·4xx 업무 거부에서만 새 키로 바꾼다', async () => {
  const err = (status, code) => Response.json({ code, message: '안내' }, { status });
  const { client, calls, tokens } = setup({ responses: [
    err(500, 'INTERNAL_ERROR'), new TypeError('network'), Response.json({ linkId: 'l1' }, { status: 201 }),
    err(409, 'LINK_LIMIT_REACHED'),
  ] });
  tokens.set('access-token-1');
  let generated = 0;
  const holder = createIdempotencyKeyHolder(() => `key-${generated += 1}`);
  const send = async () => {
    const result = await client.member('/share-links', { method: 'POST', body: { title: 'a' }, idempotencyKey: holder.current() });
    if (isSettledResult(result)) holder.reset();
    return result;
  };
  assert.equal((await send()).status, 500);
  assert.equal((await send()).kind, 'lookup-failed');
  assert.equal((await send()).kind, 'success');
  assert.equal((await send()).status, 409);
  assert.deepEqual(calls.map((call) => call.headers['Idempotency-Key']), ['key-1', 'key-1', 'key-1', 'key-2']);
  assert.equal(holder.current(), 'key-3', '409 업무 거부도 확정이다');

  assert.equal(isSettledResult({ kind: 'success', status: 204, data: null }), true);
  assert.equal(isSettledResult({ kind: 'api-error', status: 400, code: 'VALIDATION_FAILED', message: 'x' }), true);
  assert.equal(isSettledResult({ kind: 'api-error', status: 401, code: 'AUTH_INVALID', message: 'x' }), false, '401은 앞선 요청의 저장 여부를 알려 주지 않는다');
  assert.equal(isSettledResult({ kind: 'api-error', status: 503, code: 'INTERNAL_ERROR', message: 'x' }), false);
  assert.equal(isSettledResult({ kind: 'lookup-failed', status: 502, code: 'LOOKUP_FAILED' }), false);
  assert.equal(isSettledResult({ kind: 'lookup-failed', status: null, code: 'LOOKUP_FAILED' }), false);
});

test('오류 응답의 Retry-After(1 이상 정수 초)를 retryAfterSeconds로 전달한다', async () => {
  const limited = (value) => new Response(JSON.stringify({ code: 'LINK_UNLOCK_LIMITED', message: '안내' }), {
    status: 429, headers: { 'Content-Type': 'application/json', ...(value === undefined ? {} : { 'Retry-After': value }) },
  });
  const { client } = setup({ responses: [
    limited('37'), limited(undefined), limited('0'), limited('1.5'), limited('Wed, 21 Oct 2026 07:28:00 GMT'),
    new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json', 'Retry-After': '5' } }),
    new TypeError('network'),
  ] });
  const unlock = () => client.recipient('/public/links/t/unlock', { method: 'POST', body: { password: 'x' } });
  assert.deepEqual(await unlock(), { kind: 'api-error', status: 429, code: 'LINK_UNLOCK_LIMITED', message: '안내', retryAfterSeconds: 37 });
  for (let i = 0; i < 4; i += 1) {
    const result = await unlock();
    assert.equal(result.kind, 'api-error');
    assert.equal('retryAfterSeconds' in result, false, '헤더가 없거나 정수 초가 아니면 남은 시간을 만들지 않는다');
  }
  assert.deepEqual(await unlock(), { kind: 'success', status: 200, data: { ok: true } }, '성공 응답에는 붙이지 않는다');
  assert.deepEqual(await unlock(), { kind: 'lookup-failed', status: null, code: 'LOOKUP_FAILED' });

  assert.equal(parseRetryAfterSeconds(' 15 '), 15);
  for (const value of [null, '', '-1', '0', '1e3', `${Number.MAX_SAFE_INTEGER}0`]) assert.equal(parseRetryAfterSeconds(value), undefined, String(value));
});

test('경로는 / 하나로 시작해야 한다', async () => {
  const { client } = setup();
  for (const path of ['me', '//evil.example/me', 'http://evil.example']) {
    await assert.rejects(client.member(path), TypeError);
    await assert.rejects(client.recipient(path), TypeError);
  }
});

test('B의 MemberTransport 모양으로 그대로 넘길 수 있다', async () => {
  const { client, calls, tokens } = setup({ responses: [Response.json({ items: [], page: { nextCursor: null } })] });
  tokens.set('access-token-1');
  const transport = client.member;
  const result = await transport('/catches?limit=20', { method: 'GET', cache: 'no-store' });
  assert.equal(result.kind, 'success');
  assert.equal(calls[0].url, `${BASE}/v1/catches?limit=20`);
  assert.equal(calls[0].headers.Authorization, 'Bearer access-token-1');
});

test('개발용 로그인은 토큰을 메모리에만 보관하고 결과에는 담지 않는다', async () => {
  const { client, calls, tokens } = setup({ responses: [Response.json({ accessToken: 'dev-token', tokenType: 'Bearer', expiresIn: 900 })] });
  const result = await client.devLogin('local-member-1');
  assert.deepEqual(result, { kind: 'success', status: 200, data: null });
  assert.deepEqual(tokens.get(), { token: 'dev-token', ended: null });
  assert.equal(calls[0].url, `${BASE}/v1/auth/dev-login`);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].headers.Authorization, undefined);
  assert.equal(calls[0].init.body, JSON.stringify({ memberId: 'local-member-1' }));
});

test('개발용 로그인 실패·이상한 성공 응답은 토큰을 바꾸지 않는다', async () => {
  const { client, tokens } = setup({ responses: [
    Response.json({ code: 'INTERNAL_ERROR', message: '안내' }, { status: 403 }),
    Response.json({ code: 'VALIDATION_FAILED', message: '안내', details: { violations: [{ field: 'memberId', reason: 'isMemberId' }] } }, { status: 400 }),
    Response.json({ accessToken: '', tokenType: 'Bearer' }),
    Response.json({ accessToken: 'x', tokenType: 'Basic' }),
  ] });
  const results = [];
  for (let i = 0; i < 4; i += 1) results.push(await client.devLogin('m'));
  assert.deepEqual(results.map((r) => [r.kind, r.status]), [['api-error', 403], ['api-error', 400], ['lookup-failed', 200], ['lookup-failed', 200]]);
  assert.deepEqual(tokens.get(), { token: null, ended: null });
});

test('인증 만료 401을 받으면 키를 유지하고, 다시 로그인한 뒤 같은 키로 보낸다', async () => {
  const { client, calls, tokens } = setup({ responses: [
    new TypeError('network'), authError('AUTH_INVALID'), Response.json({ linkId: 'l1' }, { status: 201 }),
  ] });
  tokens.set('expiring-token');
  let generated = 0;
  const holder = createIdempotencyKeyHolder(() => `key-${generated += 1}`);
  const send = async () => {
    const result = await client.member('/share-links', { method: 'POST', body: { title: 'a' }, idempotencyKey: holder.current() });
    if (isSettledResult(result)) holder.reset();
    return result;
  };
  assert.equal((await send()).kind, 'lookup-failed');
  assert.equal((await send()).status, 401);
  assert.equal(tokens.get().token, null);
  tokens.set('new-token');
  assert.equal((await send()).kind, 'success');
  assert.deepEqual(calls.map((call) => call.headers['Idempotency-Key']), ['key-1', 'key-1', 'key-1']);
});

test('먼저 보낸 개발용 로그인이 늦게 도착해도 나중에 성공한 로그인의 토큰을 유지한다', async () => {
  const releases = {};
  const tokens = createAccessTokenStore();
  const client = createApiClient({ baseUrl: BASE, tokens, fetch: (url, init) => new Promise((resolve) => {
    releases[JSON.parse(init.body).memberId] = resolve;
  }) });
  const loginA = client.devLogin('member-a');
  const loginB = client.devLogin('member-b');
  releases['member-b'](Response.json({ accessToken: 'token-b', tokenType: 'Bearer', expiresIn: 3600 }));
  assert.equal((await loginB).kind, 'success');
  releases['member-a'](Response.json({ accessToken: 'token-a', tokenType: 'Bearer', expiresIn: 3600 }));
  assert.equal((await loginA).kind, 'lookup-failed', '반영하지 않은 응답은 성공으로 돌려주지 않는다');
  assert.equal(tokens.get().token, 'token-b');
});

test('로그인 화면을 떠나 취소된 개발용 로그인은 늦게 성공해도 토큰을 바꾸지 않는다', async () => {
  let release;
  const tokens = createAccessTokenStore();
  // 실제 fetch는 취소되면 거부하지만, 응답 처리 도중 취소된 경우도 막는지 보려고 신호를 무시하는 가짜를 쓴다.
  const client = createApiClient({ baseUrl: BASE, tokens, fetch: () => new Promise((resolve) => { release = resolve; }) });
  const abort = new AbortController();
  const login = client.devLogin('member-a', { signal: abort.signal });
  abort.abort();
  release(Response.json({ accessToken: 'token-a', tokenType: 'Bearer', expiresIn: 3600 }));
  assert.equal((await login).kind, 'lookup-failed');
  assert.deepEqual(tokens.get(), { token: null, ended: null });
});

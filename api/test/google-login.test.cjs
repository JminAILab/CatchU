const assert = require('node:assert/strict');
const { test } = require('node:test');
const { generateKeyPair, exportJWK, SignJWT } = require('jose');
const { createHash } = require('node:crypto');
const { readGoogleConfig } = require('../dist/google-login/google.config');
const { HttpGoogleProvider } = require('../dist/google-login/google-provider');
const { LoginAttempts } = require('../dist/google-login/login-attempts');
const { parseGoogleLogin, assertEmptyInput } = require('../dist/google-login/google-input');

const config = { enabled: true, clientId: 'synthetic.apps.googleusercontent.com', clientSecret: 'synthetic-secret-marker',
  redirectUri: 'http://localhost:3000/google/callback' };
const env = { GOOGLE_LOGIN_ENABLED: 'true', GOOGLE_CLIENT_ID: config.clientId,
  GOOGLE_CLIENT_SECRET: config.clientSecret, GOOGLE_REDIRECT_URI: config.redirectUri, NODE_ENV: 'test' };
const isCode = code => error => error.code === code;
test('기본 비활성 및 지정 설정의 로딩·운영 HTTPS 경계', () => {
  assert.equal(readGoogleConfig({}).enabled, false);
  assert.deepEqual(readGoogleConfig(env), config);
  assert.throws(() => readGoogleConfig({ ...env, NODE_ENV: 'production' }), /GOOGLE_REDIRECT_URI/);
  assert.equal(readGoogleConfig({ ...env, NODE_ENV: 'production', GOOGLE_REDIRECT_URI: 'https://example.invalid/google/callback' }).enabled, true);
  assert.equal(readGoogleConfig({ ...env, GOOGLE_LOGIN_ENABLED: 'false' }).enabled, false);
});
for (const [key, value] of [['GOOGLE_LOGIN_ENABLED', 'TRUE'], ['GOOGLE_CLIENT_ID', 'bad'],
  ['GOOGLE_CLIENT_SECRET', ''], ['GOOGLE_CLIENT_SECRET', 'secret\nprivate'], ['GOOGLE_REDIRECT_URI', ''],
  ['GOOGLE_REDIRECT_URI', 'http://example.invalid/callback'], ['GOOGLE_REDIRECT_URI', 'https://example.invalid/callback?x=1'],
  ['GOOGLE_REDIRECT_URI', 'https://user:secret@example.invalid/callback'], ['GOOGLE_REDIRECT_URI', 'https://example.invalid/callback#fragment']]) {
  test('잘못된 Google 설정은 값 노출 없이 거부: ' + key + ' 검사', () => {
    assert.throws(() => readGoogleConfig({ ...env, [key]: value }), error =>
      error.message.includes(key) && !error.message.includes('secret\nprivate'));
  });
}
test('state·nonce·PKCE의 난수·일회용·시작자·만료 경계', () => {
  let clock = 100;
  const store = new LoginAttempts(() => clock);
  const a = store.create(), b = store.create();
  assert.notEqual(a.state, b.state); assert.notEqual(a.nonce, b.nonce);
  assert.equal(createHash('sha256').update(a.verifier).digest('base64url').length, 43);
  assert.throws(() => store.consume(a.state, b.loginAttemptToken), isCode('AUTH_INVALID'));
  assert.equal(store.consume(a.state, a.loginAttemptToken).nonce, a.nonce);
  assert.throws(() => store.consume(a.state, a.loginAttemptToken), isCode('AUTH_INVALID'));
  clock += 600000;
  assert.throws(() => store.consume(b.state, b.loginAttemptToken), isCode('AUTH_INVALID'));
  assert.throws(() => new LoginAttempts().consume(a.state, a.loginAttemptToken), isCode('AUTH_INVALID'));
});
test('시작 대기 보관 상한과 만료된 항목 회수', () => {
  let clock = 0; const store = new LoginAttempts(() => clock);
  for (let i = 0; i < 1000; i++) store.create();
  assert.throws(() => store.create(), isCode('INTERNAL_ERROR'));
  clock = 600000; assert.ok(store.create());
});
const input = { state: 'a'.repeat(43), loginAttemptToken: 'b'.repeat(43), code: 'synthetic-code' };
test('시작·완료의 엄격한 입력과 취소 분기', () => {
  assertEmptyInput({}, {}); assertEmptyInput(undefined, {});
  assert.deepEqual(parseGoogleLogin(input, {}), input);
  assert.equal(parseGoogleLogin({ state: input.state, loginAttemptToken: input.loginAttemptToken, error: 'access_denied' }, {}).error, 'access_denied');
});
for (const body of [{}, { ...input, extra: true }, { ...input, code: '' }, { ...input, code: 'bad code' },
  { ...input, code: 'a'.repeat(4097) }, { ...input, state: 'short' }, { ...input, loginAttemptToken: 1 },
  { ...input, error: 'access_denied' }, { ...input, error: 'other' }, JSON.parse('{"__proto__":{}}')]) {
  test('잘못된 완료 입력·추가 필드·코드/취소 동시 지정 거부', () => {
    assert.throws(() => parseGoogleLogin(body, {}), isCode('VALIDATION_FAILED'));
  });
}
test('취소 입력과 추가 query·시작 body의 거부', () => {
  const cancel = { state: input.state, loginAttemptToken: input.loginAttemptToken, error: 'access_denied' };
  assert.deepEqual(parseGoogleLogin(cancel, {}), cancel);
  assert.throws(() => parseGoogleLogin(input, { memberId: 'other' }), isCode('VALIDATION_FAILED'));
  assert.throws(() => assertEmptyInput({ redirectUri: 'https://evil.invalid' }, {}), isCode('VALIDATION_FAILED'));
});

async function providerFixture(overrides = {}, options = {}) {
  const key = await generateKeyPair('RS256'), wrong = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(key.publicKey), kid: 'synthetic-key', alg: 'RS256', use: 'sig' };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: 'https://accounts.google.com', aud: config.clientId, sub: 'synthetic-sub',
    iat: now, exp: now + 300, nonce: 'synthetic-nonce', name: '한글😀', ...overrides };
  const token = await new SignJWT(payload).setProtectedHeader({ alg: 'RS256', kid: 'synthetic-key' })
    .sign(options.wrongKey ? wrong.privateKey : key.privateKey);
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/certs')) return new Response(JSON.stringify({ keys: [jwk] }));
    return new Response(JSON.stringify({ id_token: token, access_token: 'synthetic-access-private', refresh_token: 'synthetic-refresh-private' }));
  };
  return { client: new HttpGoogleProvider(config, fetcher), calls, token };
}
test('실제 서명 검증과 고정 전송 대상·최소 권한·보정 없는 이름', async () => {
  const { client, calls } = await providerFixture();
  assert.deepEqual(await client.exchange('synthetic-code', 'synthetic-verifier', 'synthetic-nonce'),
    { subject: 'synthetic-sub', name: '한글😀' });
  assert.equal(calls[0].url, 'https://oauth2.googleapis.com/token');
  assert.equal(calls[1].url, 'https://www.googleapis.com/oauth2/v3/certs');
  assert.equal(calls[0].init.redirect, 'manual');
  const form = calls[0].init.body;
  assert.equal(form.get('code_verifier'), 'synthetic-verifier');
  assert.equal(form.get('client_secret'), config.clientSecret);
  assert.equal(form.get('redirect_uri'), config.redirectUri);
  assert.equal(form.get('grant_type'), 'authorization_code');
});
for (const overrides of [{ iss: 'https://evil.invalid' }, { aud: 'other-client' }, { azp: 'other-client' },
  { sub: '' }, { sub: ' '.repeat(2) }, { sub: 'a'.repeat(256) }, { nonce: 'wrong-nonce' },
  { exp: 1 }, { exp: null }, { iat: null }, { nonce: null },
  { aud: [config.clientId, 'other-client'] }]) {
  test('서명된 인증 claim의 잘못된 발급자·대상·식별자·nonce·만료 거부', async () => {
    const { client } = await providerFixture(overrides);
    await assert.rejects(client.exchange('code', 'verifier', 'synthetic-nonce'), isCode('AUTH_INVALID'));
  });
}
for (const [offset, accepted] of [[1, true], [5, true], [6, false], [300, false]]) {
  test(`고정 시각에서 iat ${offset}초 미래: ${accepted ? '허용' : '거부'}`, async t => {
    const now = 1800000000;
    t.mock.timers.enable({ apis: ['Date'], now: now * 1000 });
    // exp는 iat 이후로 두어 미래 발급 시각 검사만의 경계를 확인한다.
    const { client } = await providerFixture({ iat: now + offset, exp: now + offset + 300 });
    const result = client.exchange('code', 'verifier', 'synthetic-nonce');
    if (accepted) assert.deepEqual(await result, { subject: 'synthetic-sub', name: '한글😀' });
    else await assert.rejects(result, isCode('AUTH_INVALID'));
  });
}
test('iat 오차 허용은 만료 검증을 완화하지 않는다', async t => {
  const now = 1800000000;
  t.mock.timers.enable({ apis: ['Date'], now: now * 1000 });
  const { client } = await providerFixture({ iat: now - 60, exp: now });
  await assert.rejects(client.exchange('code', 'verifier', 'synthetic-nonce'), isCode('AUTH_INVALID'));
});
test('잘못된 서명 거부 및 선택 이름 누락 허용', async () => {
  const bad = await providerFixture({}, { wrongKey: true });
  await assert.rejects(bad.client.exchange('code', 'verifier', 'synthetic-nonce'), isCode('AUTH_INVALID'));
  const absent = await providerFixture({ iss: 'accounts.google.com', name: undefined });
  assert.deepEqual(await absent.client.exchange('code', 'verifier', 'synthetic-nonce'), { subject: 'synthetic-sub', name: null });
});
for (const [status, data, expected] of [[400, { error: 'invalid_grant', error_description: 'private-marker' }, 'AUTH_INVALID'],
  [400, { error: 'invalid_client' }, 'INTERNAL_ERROR'], [500, {}, 'INTERNAL_ERROR'],
  [302, {}, 'INTERNAL_ERROR'], [200, {}, 'INTERNAL_ERROR']]) {
  test('외부 인증 거부와 제공자 장애를 원문 비노출로 구분', async () => {
    const client = new HttpGoogleProvider(config, async () => new Response(JSON.stringify(data), { status }));
    await assert.rejects(client.exchange('code', 'verifier', 'nonce'), error =>
      error.code === expected && !JSON.stringify(error.getResponse()).includes('private-marker'));
  });
}
test('네트워크·JSON·크기 오류와 공개키 조회 오류는 안전한 서버 오류', async () => {
  for (const fetcher of [async () => { throw new Error('secret-private-marker'); },
    async () => new Response('not-json'), async () => new Response('x'.repeat(65537))]) {
    await assert.rejects(new HttpGoogleProvider(config, fetcher).exchange('code', 'verifier', 'nonce'), isCode('INTERNAL_ERROR'));
  }
  const signed = await providerFixture();
  const fetcher = async url => {
    if (String(url).endsWith('/certs')) return new Response('{}', { status: 503 });
    return new Response(JSON.stringify({ id_token: signed.token }));
  };
  await assert.rejects(new HttpGoogleProvider(config, fetcher).exchange('code', 'verifier', 'synthetic-nonce'), isCode('INTERNAL_ERROR'));
});

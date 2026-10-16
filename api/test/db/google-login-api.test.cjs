require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { before, after, beforeEach, test } = require('node:test');
const { NestFactory } = require('@nestjs/core');
const { generateKeyPair, exportJWK, SignJWT, decodeJwt } = require('jose');
const { AppModule } = require('../../dist/app.module');
const { configureApp } = require('../../dist/app.setup');
const { GoogleLoginService } = require('../../dist/google-login/google-login.service');
const { HttpGoogleProvider } = require('../../dist/google-login/google-provider');
const { GOOGLE_CONFIG } = require('../../dist/google-login/google.config');
const { MemberAccount, MemberProfile, GitHubConnection } = require('../../dist/member-analysis/member-analysis.entity');
const { AuthSession, SessionRefreshToken } = require('../../dist/auth/session.entity');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const settings = { NODE_ENV: 'test', DEV_LOGIN_ENABLED: 'true', AUTH_JWT_SECRET: randomBytes(32).toString('hex'),
  AUTH_ACCESS_TOKEN_TTL_SECONDS: '900', LINK_GRANT_SECRET: randomBytes(32).toString('hex'), GOOGLE_LOGIN_ENABLED: 'true',
  GOOGLE_CLIENT_ID: 'synthetic.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'google-secret-marker',
  GOOGLE_REDIRECT_URI: 'http://localhost:3000/google/callback' };
const saved = {}, logs = [], exchanges = new Map();
let app, db, url, service, config, key, jwk, calls, originalProvider;
before(async () => {
  for (const [k, v] of Object.entries(settings)) { saved[k] = process.env[k]; process.env[k] = v; }
  const logger = Object.fromEntries(['log', 'error', 'warn', 'debug', 'verbose', 'fatal'].map(level =>
    [level, (...args) => logs.push(args.map(String).join(' '))]));
  app = await configureApp(await NestFactory.create(AppModule, { logger, abortOnError: false }));
  await app.listen(0, '127.0.0.1'); url = await app.getUrl(); db = await openTestDataSource();
  service = app.get(GoogleLoginService); config = app.get(GOOGLE_CONFIG); originalProvider = service.provider;
  key = await generateKeyPair('RS256'); jwk = { ...await exportJWK(key.publicKey), kid: 'test-key', use: 'sig', alg: 'RS256' };
});
after(async () => {
  if (service) service.provider = originalProvider;
  await app?.close(); await db?.destroy();
  for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
});
beforeEach(async () => {
  await resetTestDatabase(db); logs.length = 0; exchanges.clear(); calls = 0; config.enabled = true;
  service.provider = new HttpGoogleProvider(config, async (target, init) => {
    if (String(target).endsWith('/certs')) return new Response(JSON.stringify({ keys: [jwk] }));
    calls++;
    const fixture = exchanges.get(init.body.get('code'));
    assert.ok(fixture, '등록한 합성 인증 코드만 사용');
    assert.equal(init.body.get('code_verifier').length, 43);
    if (fixture.failure) throw new Error('private-google-error-marker');
    if (fixture.rejected) return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ iss: 'https://accounts.google.com', aud: config.clientId, sub: fixture.sub,
      iat: now, exp: now + 300, nonce: fixture.nonce, name: fixture.name, email: 'same@example.invalid', ...fixture.claims })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).sign(key.privateKey);
    fixture.idToken = token;
    return new Response(JSON.stringify({ id_token: token, access_token: 'private-google-access-marker' }));
  });
});
async function call(path, body, token, method = 'POST') {
  const response = await fetch(url + path, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  return { status: response.status, body: await response.json() };
}
async function attempt(sub = 'google-owner', extra = {}) {
  const start = await call('/v1/auth/google/authorization', {}); assert.equal(start.status, 200);
  const address = new URL(start.body.authorizationUrl);
  assert.equal(address.origin, 'https://accounts.google.com'); assert.equal(address.searchParams.get('scope'), 'openid profile');
  assert.equal(address.searchParams.get('code_challenge_method'), 'S256'); assert.equal(start.body.expiresIn, 600);
  assert.ok(!address.searchParams.has('client_secret')); assert.ok(!address.searchParams.has('loginAttemptToken'));
  const code = randomBytes(20).toString('hex');
  exchanges.set(code, { sub, nonce: address.searchParams.get('nonce'), name: '이름😀', ...extra });
  return { state: address.searchParams.get('state'), loginAttemptToken: start.body.loginAttemptToken, code };
}
const finish = input => call('/v1/auth/google/login', input);
const member = token => call('/v1/me', undefined, token, 'GET');
function error(response, status, code) { assert.equal(response.status, status); assert.equal(response.body.code, code); assert.ok(!response.body.accessToken); }
async function empty() {
  for (const entity of [MemberAccount, MemberProfile, AuthSession, SessionRefreshToken]) {
    assert.equal(await db.getRepository(entity).count(), 0);
  }
}

test('Google 로그인 성공은 같은 회원 세션·Refresh 쿠키를 커밋하고 갱신에 연결', async () => {
  const response = await fetch(url + '/v1/auth/google/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(await attempt()), signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 200);
  const issued = await response.json(), claims = decodeJwt(issued.accessToken);
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /Path=\/v1\/auth; HttpOnly; SameSite=Strict/);
  assert.equal((await db.manager.findOneByOrFail(AuthSession, { sessionId: claims.sid })).memberId, claims.sub);
  assert.equal(await db.manager.countBy(SessionRefreshToken, { sessionId: claims.sid }), 1);
  const renewed = await fetch(url + '/v1/auth/refresh', { method: 'POST', headers: {
    Origin: process.env.AUTH_WEB_ORIGIN ?? 'http://localhost:3000', Cookie: cookie.split(';')[0],
  }, signal: AbortSignal.timeout(10000) });
  assert.equal(renewed.status, 200);
  const result = await renewed.json();
  assert.equal(decodeJwt(result.accessToken).sub, claims.sub);
  assert.equal(decodeJwt(result.accessToken).sid, claims.sid);
  assert.equal((await member(result.accessToken)).status, 200);
});
test('실제 API·DB 최초 로그인과 회원 조회: Google 이름은 제안만, GitHub 연결은 생성하지 않음', async () => {
  const input = await attempt(); const result = await finish(input); assert.equal(result.status, 200);
  assert.equal(result.body.suggestedDisplayName, '이름😀'); assert.equal(result.body.expiresIn, 900);
  const id = decodeJwt(result.body.accessToken).sub; assert.match(id, /^[0-9a-f-]{36}$/);
  const me = await member(result.body.accessToken); assert.equal(me.status, 200); assert.equal(me.body.memberId, id);
  assert.equal(me.body.profile.displayName, ''); assert.deepEqual(me.body.github, { state: 'DISCONNECTED', accountLogin: null });
  assert.equal(await db.getRepository(GitHubConnection).count(), 0);
  error(await finish(input), 401, 'AUTH_INVALID'); assert.equal(calls, 1);
  for (const privateValue of [input.code, input.state, input.loginAttemptToken, result.body.accessToken,
    exchanges.get(input.code).idToken, settings.GOOGLE_CLIENT_SECRET, 'private-google-access-marker']) assert.ok(!logs.join('\n').includes(privateValue));
});
test('기존 회원 ID·저장된 이름·프로필·GitHub 연결을 재로그인에서 유지', async () => {
  const first = await finish(await attempt()); const id = decodeJwt(first.body.accessToken).sub;
  const profile = { displayName: '저장 이름', introduction: '소개', desiredRole: '', skills: ['NestJS'] };
  assert.equal((await call('/v1/me/profile', profile, first.body.accessToken, 'PUT')).status, 200);
  const row = Object.assign(new GitHubConnection(), { memberId: id, connectionState: 'CONNECTED', accountLogin: 'synthetic-owner' });
  await db.manager.insert(GitHubConnection, row);
  const second = await finish(await attempt('google-owner', { name: '바뀐 Google 이름' }));
  assert.equal(second.status, 200); assert.equal(decodeJwt(second.body.accessToken).sub, id); assert.equal(second.body.suggestedDisplayName, null);
  const me = await member(second.body.accessToken); assert.deepEqual(me.body.profile, profile); assert.equal(me.body.github.accountLogin, 'synthetic-owner');
  assert.equal(await db.getRepository(MemberAccount).count(), 1);
});
test('같은 이메일의 다른 sub와 개발 회원은 자동 병합되지 않음', async () => {
  const a = await finish(await attempt('sub-a')), b = await finish(await attempt('sub-b'));
  const dev = await call('/v1/auth/dev-login', { memberId: 'catchu:google:sub-a' });
  assert.equal(dev.status, 200);
  assert.equal(new Set([a, b, dev].map(r => decodeJwt(r.body.accessToken).sub)).size, 3);
});
test('같은 sub의 동시 최초 로그인은 회원·프로필 하나만 생성', async () => {
  const inputs = await Promise.all([attempt(), attempt(), attempt()]);
  const results = await Promise.all(inputs.map(finish)); assert.ok(results.every(r => r.status === 200));
  assert.equal(new Set(results.map(r => decodeJwt(r.body.accessToken).sub)).size, 1);
  assert.equal(await db.getRepository(MemberAccount).count(), 1); assert.equal(await db.getRepository(MemberProfile).count(), 1);
});
test('동일 인증 요청의 동시 완료는 한 번만 교환·발급', async () => {
  const input = await attempt(); const results = await Promise.all([finish(input), finish(input)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 401]); assert.equal(calls, 1);
});
test('취소·시작자 불일치·없는 state는 회원·토큰을 생성하지 않음', async () => {
  const input = await attempt();
  error(await finish({ ...input, loginAttemptToken: 'a'.repeat(43) }), 401, 'AUTH_INVALID');
  error(await finish({ ...input, state: 'b'.repeat(43) }), 401, 'AUTH_INVALID');
  assert.deepEqual(await finish({ state: input.state, loginAttemptToken: input.loginAttemptToken, error: 'access_denied' }), { status: 200, body: { cancelled: true } });
  error(await finish(input), 401, 'AUTH_INVALID'); assert.equal(calls, 0); await empty();
});
for (const [extra, code, status] of [[{ rejected: true }, 'AUTH_INVALID', 401], [{ claims: { nonce: 'wrong' } }, 'AUTH_INVALID', 401],
  [{ claims: { iss: 'https://other.invalid' } }, 'AUTH_INVALID', 401], [{ failure: true }, 'INTERNAL_ERROR', 500]]) {
  test('Google 인증 실패·제공자 장애는 회원 없이 안전한 오류, 재사용 불가', async () => {
    const input = await attempt('owner', extra); const result = await finish(input); error(result, status, code);
    error(await finish(input), 401, 'AUTH_INVALID'); await empty();
    assert.ok(!JSON.stringify(result.body).includes('private-google')); assert.ok(!logs.join('\n').includes('private-google'));
  });
}
test('프로필 저장 중 실패는 최초 회원까지 전체 롤백', async () => {
  await db.query(`ALTER TABLE member_profile ADD CONSTRAINT google_test_fail CHECK (display_name <> '') NOT VALID`);
  try { error(await finish(await attempt()), 500, 'INTERNAL_ERROR'); await empty(); }
  finally { await db.query('ALTER TABLE member_profile DROP CONSTRAINT google_test_fail'); }
});
test('최종 커밋 실패는 토큰 응답 없이 회원·프로필 전체 롤백', async () => {
  await db.query(`CREATE FUNCTION google_test_commit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'private-commit-marker'; END $$`);
  await db.query(`CREATE CONSTRAINT TRIGGER google_test_commit_fail AFTER INSERT ON member_profile DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION google_test_commit_fail()`);
  try { error(await finish(await attempt()), 500, 'INTERNAL_ERROR'); await empty(); assert.ok(!logs.join('\n').includes('private-commit-marker')); }
  finally { await db.query('DROP TRIGGER google_test_commit_fail ON member_profile'); await db.query('DROP FUNCTION google_test_commit_fail()'); }
});
test('서명 발급 실패는 최초 회원 생성도 롤백', async () => {
  const original = service.sessions.tokens.issue; service.sessions.tokens.issue = async () => { throw new Error('private-sign-marker'); };
  try { error(await finish(await attempt()), 500, 'INTERNAL_ERROR'); await empty(); }
  finally { service.sessions.tokens.issue = original; }
  assert.ok(!logs.join('\n').includes('private-sign-marker'));
});
test('기존 비활성 회원·누락 프로필은 토큰 발급이나 자동 복원 없음', async () => {
  const first = await finish(await attempt()); const id = decodeJwt(first.body.accessToken).sub;
  await db.manager.update(MemberAccount, { memberId: id }, { accountState: 'INACTIVE' });
  error(await finish(await attempt()), 401, 'AUTH_INVALID');
  await db.manager.update(MemberAccount, { memberId: id }, { accountState: 'ACTIVE' }); await db.manager.delete(MemberProfile, { memberId: id });
  error(await finish(await attempt()), 500, 'INTERNAL_ERROR'); assert.equal(await db.getRepository(MemberProfile).count(), 0);
});
test('비활성 설정과 입력 오류·추가 필드의 공통 오류, health 인증 제외 유지', async () => {
  config.enabled = false; error(await call('/v1/auth/google/authorization', {}), 404, 'RESOURCE_UNAVAILABLE'); config.enabled = true;
  for (const path of ['/v1/auth/google/authorization', '/v1/auth/google/login']) {
    error(await call(path, { extra: 'private-input-marker' }), 400, 'VALIDATION_FAILED');
    error(await call(path + '?memberId=other', {}), 400, 'VALIDATION_FAILED');
  }
  assert.deepEqual(await call('/health', undefined, undefined, 'GET'), { status: 200, body: { status: 'ok' } });
  assert.ok(!logs.join('\n').includes('private-input-marker')); await empty();
});

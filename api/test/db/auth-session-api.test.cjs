require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { before, after, beforeEach, test } = require('node:test');
const { NestFactory } = require('@nestjs/core');
const { DataSource } = require('typeorm');
const { SignJWT, decodeJwt } = require('jose');
const { AppModule } = require('../../dist/app.module');
const { configureApp } = require('../../dist/app.setup');
const { SessionService, refreshHash } = require('../../dist/auth/session.service');
const { readSessionConfig, SESSION_IDLE_MS, SESSION_MAX_MS } = require('../../dist/auth/session.config');
const { AuthSession, SessionRefreshToken } = require('../../dist/auth/session.entity');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const WEB = 'http://localhost:3000';
const settings = { NODE_ENV: 'test', DEV_LOGIN_ENABLED: 'true', AUTH_ACCESS_TOKEN_TTL_SECONDS: '900',
  AUTH_JWT_SECRET: randomBytes(32).toString('hex'), AUTH_WEB_ORIGIN: WEB };
const saved = {}, logs = [];
let app, db, url, sessions, clock;
async function boot() {
  const logger = Object.fromEntries(['log', 'error', 'warn', 'debug', 'verbose', 'fatal'].map(level =>
    [level, (...args) => logs.push(args.map(String).join(' '))]));
  app = await configureApp(await NestFactory.create(AppModule, { logger, abortOnError: false }));
  await app.listen(0, '127.0.0.1'); url = await app.getUrl();
  sessions = app.get(SessionService); sessions.clock = () => clock;
}
before(async () => {
  for (const [key, value] of Object.entries(settings)) { saved[key] = process.env[key]; process.env[key] = value; }
  clock = Date.now(); db = await openTestDataSource(); await boot();
});
after(async () => {
  await app?.close(); await db?.destroy();
  for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});
beforeEach(async () => { await resetTestDatabase(db); clock = Date.now(); logs.length = 0; });
async function call(path, { cookie, access, origin = WEB, body, method = 'POST' } = {}) {
  const response = await fetch(url + path, { method, headers: {
    ...(origin === undefined ? {} : { Origin: origin }), ...(cookie === undefined ? {} : { Cookie: cookie }),
    ...(access ? { Authorization: 'Bearer ' + access } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
  }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null, setCookie: response.headers.get('set-cookie') };
}
const login = (identity = 'session-owner') => call('/v1/auth/dev-login', { body: { memberId: identity } });
const cookieOf = response => response.setCookie.split(';')[0];
const refresh = (cookie, options = {}) => call('/v1/auth/refresh', { cookie, ...options });
const logout = (cookie, options = {}) => call('/v1/auth/logout', { cookie, ...options });
const me = access => call('/v1/me', { access, method: 'GET' });
function error(result, status, code) {
  assert.equal(result.status, status); assert.equal(result.body.code, code);
  if (code === 'VALIDATION_FAILED') {
    assert.deepEqual(Object.keys(result.body).sort(), ['code', 'details', 'message']);
    assert.ok(result.body.details.violations.every(v => Object.keys(v).sort().join(',') === 'field,reason'));
  } else assert.deepEqual(Object.keys(result.body).sort(), ['code', 'message']);
}
function cleared(result) { assert.match(result.setCookie, /catchu_refresh=;/); assert.match(result.setCookie, /Max-Age=0/); assert.match(result.setCookie, /Path=\/v1\/auth/); }

test('최초 발급은 15분 Access·세션 ID·Strict HttpOnly 쿠키와 DB 해시만 저장', async () => {
  const first = await login(); assert.equal(first.status, 200); assert.equal(first.body.expiresIn, 900);
  assert.deepEqual(Object.keys(first.body).sort(), ['accessToken', 'expiresIn', 'tokenType']);
  const claims = decodeJwt(first.body.accessToken); assert.equal(claims.exp - claims.iat, 900);
  assert.match(claims.sid, /^[0-9a-f-]{36}$/); assert.match(first.setCookie, /HttpOnly; SameSite=Strict/);
  assert.ok(!first.setCookie.includes('Domain=')); assert.ok(!first.setCookie.includes('Secure'));
  const session = await db.manager.findOneByOrFail(AuthSession, { sessionId: claims.sid });
  assert.equal(session.expiresAt - session.createdAt, SESSION_MAX_MS);
  assert.equal(+session.lastRefreshedAt, +session.createdAt);
  const tokens = await db.manager.find(SessionRefreshToken); assert.equal(tokens.length, 1);
  assert.equal(tokens[0].tokenHash, refreshHash(cookieOf(first).split('=')[1]));
  assert.ok(!JSON.stringify(tokens).includes(cookieOf(first).split('=')[1]));
  assert.equal((await me(first.body.accessToken)).status, 200);
});
test('정상 갱신은 Refresh를 교체하고 24시간 기준만 갱신하며 절대 7일은 유지', async () => {
  const first = await login(), sid = decodeJwt(first.body.accessToken).sid;
  const before = await db.manager.findOneByOrFail(AuthSession, { sessionId: sid });
  clock += 1000;
  const second = await refresh(cookieOf(first)); assert.equal(second.status, 200);
  assert.notEqual(cookieOf(first), cookieOf(second)); assert.equal(second.body.expiresIn, 900);
  assert.equal(decodeJwt(second.body.accessToken).sid, sid); assert.equal((await me(second.body.accessToken)).status, 200);
  const current = await db.manager.findOneByOrFail(AuthSession, { sessionId: sid });
  assert.equal(+current.expiresAt, +before.expiresAt); assert.equal(+current.lastRefreshedAt, clock);
  assert.equal(await db.manager.countBy(SessionRefreshToken, { sessionId: sid }), 2);
});
test('사용된 Refresh 재사용은 현재 토큰과 기존 Access를 모두 폐기', async () => {
  const first = await login(), second = await refresh(cookieOf(first));
  error(await refresh(cookieOf(first)), 401, 'AUTH_INVALID');
  error(await me(first.body.accessToken), 401, 'AUTH_INVALID'); error(await me(second.body.accessToken), 401, 'AUTH_INVALID');
  error(await refresh(cookieOf(second)), 401, 'AUTH_INVALID');
});
test('동일 Refresh 동시 갱신은 한 번만 교체하고 두 번째 재사용이 세션을 폐기', async () => {
  const first = await login();
  const results = await Promise.all([refresh(cookieOf(first)), refresh(cookieOf(first))]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 401]);
  const winner = results.find(r => r.status === 200);
  error(await me(winner.body.accessToken), 401, 'AUTH_INVALID');
  assert.equal(await db.manager.count(SessionRefreshToken), 2);
});
for (const phase of ['최초 갱신 전', '정상 갱신 후']) {
  test(phase + ' 24시간 경계 이전 허용·경계 도달 거부', async () => {
    const first = await login(); let current = first;
    if (phase === '정상 갱신 후') { clock += 1000; current = await refresh(cookieOf(first)); }
    const base = clock;
    clock = base + SESSION_IDLE_MS - 1; assert.equal((await me(current.body.accessToken)).status, 200);
    clock++; error(await me(current.body.accessToken), 401, 'AUTH_INVALID');
    const rejected = await refresh(cookieOf(current)); error(rejected, 401, 'AUTH_INVALID'); cleared(rejected);
  });
}
test('반복 갱신으로도 최초 로그인부터 7일 경계를 연장하지 않음', async () => {
  const first = await login(); const start = clock; let current = first;
  for (let i = 0; i < 7; i++) { clock += SESSION_IDLE_MS - 1000; current = await refresh(cookieOf(current)); assert.equal(current.status, 200); }
  clock = start + SESSION_MAX_MS - 1; assert.equal((await me(current.body.accessToken)).status, 200);
  clock++; error(await refresh(cookieOf(current)), 401, 'AUTH_INVALID'); error(await me(current.body.accessToken), 401, 'AUTH_INVALID');
});
test('없는·변조·중복 쿠키는 거부하고 유효한 다른 세션은 유지', async () => {
  const first = await login();
  for (const cookie of [undefined, 'catchu_refresh=bad', 'catchu_refresh=' + randomBytes(32).toString('base64url'), cookieOf(first) + '; ' + cookieOf(first)]) {
    error(await refresh(cookie), 401, 'AUTH_INVALID');
  }
  assert.equal((await me(first.body.accessToken)).status, 200);
});
test('Access의 세션 ID 없음·잘못된 값·다른 회원 연결·없는 세션은 거부', async () => {
  const first = await login(), claims = decodeJwt(first.body.accessToken);
  for (const patch of [{ sid: undefined }, { sid: 'not-uuid' }, { sid: randomUUID() }, { sub: randomUUID() }, { sub: 'invalid-member' }]) {
    const token = await new SignJWT({ ...claims, ...patch }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).sign(Buffer.from(settings.AUTH_JWT_SECRET, 'hex'));
    error(await me(token), 401, 'AUTH_INVALID');
  }
});
test('회원 비활성화는 Access·Refresh 모두 거부', async () => {
  const first = await login(); const memberId = decodeJwt(first.body.accessToken).sub;
  await db.query("UPDATE member_account SET account_state='INACTIVE' WHERE member_id=$1", [memberId]);
  error(await me(first.body.accessToken), 401, 'AUTH_INVALID'); error(await refresh(cookieOf(first)), 401, 'AUTH_INVALID');
});
test('로그아웃은 현재 세션만 폐기하고 다른 기기 세션은 유지', async () => {
  const first = await login(), other = await login();
  const result = await logout(cookieOf(first)); assert.equal(result.status, 204); assert.equal(result.body, null); cleared(result);
  error(await me(first.body.accessToken), 401, 'AUTH_INVALID'); error(await refresh(cookieOf(first)), 401, 'AUTH_INVALID');
  assert.equal((await me(other.body.accessToken)).status, 200); assert.equal((await refresh(cookieOf(other))).status, 200);
});
test('반복·쿠키 없음·만료 세션의 로그아웃은 204와 쿠키 제거', async () => {
  const first = await login();
  for (const cookie of [cookieOf(first), cookieOf(first), undefined, 'catchu_refresh=unknown']) {
    const result = await logout(cookie); assert.equal(result.status, 204); cleared(result);
  }
  const expired = await login('expired-owner'); clock += SESSION_IDLE_MS;
  const result = await logout(cookieOf(expired)); assert.equal(result.status, 204); cleared(result);
});
test('만료된 Access를 보내도 로그아웃은 유효 Refresh로 해당 세션 종료', async () => {
  const first = await login(), claims = decodeJwt(first.body.accessToken);
  const access = await new SignJWT({ ...claims, iat: 1, exp: 2 }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).sign(Buffer.from(settings.AUTH_JWT_SECRET, 'hex'));
  error(await me(access), 401, 'AUTH_INVALID'); assert.equal((await logout(cookieOf(first), { access })).status, 204);
  error(await me(first.body.accessToken), 401, 'AUTH_INVALID');
});
test('Origin 누락·불일치·null은 전용 403이며 쿠키·세션을 변경하지 않음', async () => {
  const first = await login();
  for (const path of ['/v1/auth/refresh', '/v1/auth/logout']) {
    for (const origin of ['', 'null', 'http://127.0.0.1:3000', WEB + '/', 'https://evil.example']) {
      const result = await call(path, { cookie: cookieOf(first), origin });
      error(result, 403, 'AUTH_ORIGIN_FORBIDDEN'); assert.equal(result.setCookie, null);
    }
    const response = await fetch(url + path, { method: 'POST', headers: { Cookie: cookieOf(first) } });
    assert.equal(response.status, 403); assert.equal((await response.json()).code, 'AUTH_ORIGIN_FORBIDDEN');
  }
  assert.equal((await me(first.body.accessToken)).status, 200);
});
test('새 API의 추가 body·query는 입력 오류이며 Refresh를 소비하지 않음', async () => {
  const first = await login();
  error(await refresh(cookieOf(first), { body: { token: 'private-body-marker' } }), 400, 'VALIDATION_FAILED');
  error(await call('/v1/auth/logout?session=wrong', { cookie: cookieOf(first) }), 400, 'VALIDATION_FAILED');
  assert.equal((await refresh(cookieOf(first))).status, 200);
});
test('갱신과 로그아웃 경쟁은 최종 폐기를 유지하며 세션을 부활시키지 않음', async () => {
  for (let index = 0; index < 5; index++) {
    const first = await login('race-owner-' + index);
    const [renewed, ended] = await Promise.all([refresh(cookieOf(first)), logout(cookieOf(first))]);
    assert.equal(ended.status, 204); assert.ok([200, 401].includes(renewed.status));
    error(await me(first.body.accessToken), 401, 'AUTH_INVALID');
    if (renewed.status === 200) { error(await me(renewed.body.accessToken), 401, 'AUTH_INVALID'); error(await refresh(cookieOf(renewed)), 401, 'AUTH_INVALID'); }
  }
});
test('서버 재시작 후 기존 세션·Refresh 유지, 폐기 상태도 유지', async () => {
  const first = await login(); await app.close(); await boot();
  assert.equal((await me(first.body.accessToken)).status, 200);
  const second = await refresh(cookieOf(first)); assert.equal(second.status, 200);
  await logout(cookieOf(second)); await app.close(); await boot();
  error(await me(second.body.accessToken), 401, 'AUTH_INVALID'); error(await refresh(cookieOf(second)), 401, 'AUTH_INVALID');
});
test('Guard DB 조회 실패는 500이며 인증 거부로 바꾸지 않음', async () => {
  const first = await login(), source = app.get(DataSource), original = source.manager.findOneBy;
  source.manager.findOneBy = async () => { throw new Error('private-db-guard-marker'); };
  try { error(await me(first.body.accessToken), 500, 'INTERNAL_ERROR'); }
  finally { source.manager.findOneBy = original; }
  assert.equal((await me(first.body.accessToken)).status, 200); assert.ok(!logs.join('\n').includes('private-db-guard-marker'));
});
test('실제 DB 조회 오류도 Guard·Refresh·로그아웃 모두 500이며 쿠키를 변경하지 않음', async () => {
  const first = await login();
  await db.query('ALTER TABLE auth_session RENAME TO session_query_failure');
  try {
    for (const result of [await me(first.body.accessToken), await refresh(cookieOf(first)), await logout(cookieOf(first))]) {
      error(result, 500, 'INTERNAL_ERROR'); assert.equal(result.setCookie, null);
    }
  } finally { await db.query('ALTER TABLE session_query_failure RENAME TO auth_session'); }
  assert.equal((await me(first.body.accessToken)).status, 200);
  assert.ok(!logs.join('\n').includes('session_query_failure'));
});
for (const operation of ['refresh', 'logout']) {
  test(operation + ' DB 조회 실패는 500·쿠키 미변경·세션 보존', async () => {
    const first = await login(), source = app.get(DataSource), original = source.transaction;
    source.transaction = async () => { throw new Error('private-db-marker'); };
    try { const result = await (operation === 'refresh' ? refresh(cookieOf(first)) : logout(cookieOf(first))); error(result, 500, 'INTERNAL_ERROR'); assert.equal(result.setCookie, null); }
    finally { source.transaction = original; }
    assert.equal((await me(first.body.accessToken)).status, 200); assert.ok(!logs.join('\n').includes('private-db-marker'));
  });
}
for (const operation of ['login', 'refresh', 'logout', 'reuse']) {
  test(operation + ' 최종 커밋 실패는 전체 롤백·성공/쿠키 반환 없음', async () => {
    let first, current;
    if (operation !== 'login') first = await login();
    if (operation === 'reuse') current = await refresh(cookieOf(first));
    const beforeSessions = await db.manager.find(AuthSession), beforeTokens = await db.manager.find(SessionRefreshToken);
    await db.query(`CREATE FUNCTION session_commit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'private-session-commit-marker'; END $$`);
    await db.query(`CREATE CONSTRAINT TRIGGER session_commit_failure AFTER INSERT OR UPDATE ON auth_session DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION session_commit_failure()`);
    try {
      const result = operation === 'login' ? await login('new-member') : operation === 'logout' ? await logout(cookieOf(first)) : await refresh(cookieOf(first));
      error(result, 500, 'INTERNAL_ERROR'); assert.equal(result.setCookie, null);
    } finally { await db.query('DROP TRIGGER session_commit_failure ON auth_session'); await db.query('DROP FUNCTION session_commit_failure()'); }
    assert.deepEqual(await db.manager.find(AuthSession), beforeSessions); assert.deepEqual(await db.manager.find(SessionRefreshToken), beforeTokens);
    if (first) assert.equal((await me((current ?? first).body.accessToken)).status, 200);
    else assert.equal((await db.query('SELECT count(*)::int AS count FROM member_account'))[0].count, 0);
    assert.ok(!logs.join('\n').includes('private-session-commit-marker'));
  });
}
test('Refresh 저장 중 실패도 사용 표시·갱신 시각을 롤백하며 원 토큰 재사용 가능', async () => {
  const first = await login(); const before = await db.manager.find(AuthSession);
  await db.query(`ALTER TABLE session_refresh_token ADD CONSTRAINT session_injected_failure CHECK (used_at IS NOT NULL) NOT VALID`);
  try { const result = await refresh(cookieOf(first)); error(result, 500, 'INTERNAL_ERROR'); assert.equal(result.setCookie, null); }
  finally { await db.query('ALTER TABLE session_refresh_token DROP CONSTRAINT session_injected_failure'); }
  assert.deepEqual(await db.manager.find(AuthSession), before); assert.equal((await refresh(cookieOf(first))).status, 200);
});
test('운영 설정은 HTTPS·Secure·동일 출처만 허용하고 로컬 HTTP는 loopback만', () => {
  assert.deepEqual(readSessionConfig({ NODE_ENV: 'production', AUTH_WEB_ORIGIN: 'https://catchu.example' }), { allowedOrigin: 'https://catchu.example', secureCookie: true });
  assert.equal(readSessionConfig({ NODE_ENV: 'test', AUTH_WEB_ORIGIN: WEB }).secureCookie, false);
  for (const env of [{ NODE_ENV: 'production' }, { NODE_ENV: 'production', AUTH_WEB_ORIGIN: WEB },
    { NODE_ENV: 'test', AUTH_WEB_ORIGIN: 'http://192.168.0.1:3000' }, { NODE_ENV: 'test', AUTH_WEB_ORIGIN: WEB + '/' },
    { NODE_ENV: 'test', AUTH_WEB_ORIGIN: '*' }, { NODE_ENV: 'production', AUTH_WEB_ORIGIN: 'https://user:secret@example.invalid' }]) {
    assert.throws(() => readSessionConfig(env), error => error.message.includes('AUTH_WEB_ORIGIN') && !error.message.includes('secret'));
  }
});
test('HTTPS 설정의 발급·제거 쿠키는 Secure·Strict·host-only 속성이 일치', () => {
  const { writeRefreshCookie, clearRefreshCookie } = require('../../dist/auth/session-http');
  const config = readSessionConfig({ NODE_ENV: 'production', AUTH_WEB_ORIGIN: 'https://catchu.example' });
  const values = [], response = { setHeader: (name, value) => values.push([name, value]) };
  writeRefreshCookie(response, config, 'synthetic', new Date()); clearRefreshCookie(response, config);
  for (const [name, value] of values) { assert.equal(name, 'Set-Cookie'); assert.match(value, /; Secure$/); assert.match(value, /SameSite=Strict/); assert.match(value, /Path=\/v1\/auth/); assert.ok(!value.includes('Domain=')); }
});
test('Access·Refresh·서명 키·내부 오류를 응답 오류와 로그에 노출하지 않음', async () => {
  const first = await login(), second = await refresh(cookieOf(first));
  const invalid = await refresh(cookieOf(first)); error(invalid, 401, 'AUTH_INVALID');
  const payload = JSON.stringify(invalid.body) + logs.join('\n');
  for (const value of [first.body.accessToken, second.body.accessToken, cookieOf(first).split('=')[1], cookieOf(second).split('=')[1], settings.AUTH_JWT_SECRET]) assert.ok(!payload.includes(value));
});
test('새 마이그레이션 적용 후 엔티티와 실제 DDL에 차이 없음', async () => {
  assert.deepEqual((await db.driver.createSchemaBuilder().log()).upQueries, []);
});

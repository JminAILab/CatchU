require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { after, afterEach, before, beforeEach, test } = require('node:test');
const { NestFactory } = require('@nestjs/core');
const { DataSource } = require('typeorm');
const { decodeJwt } = require('jose');
const { AppModule } = require('../../dist/app.module');
const { configureApp } = require('../../dist/app.setup');
const { buildDataSourceOptions } = require('../../dist/database/database.config');
const { GoogleLoginService } = require('../../dist/google-login/google-login.service');
const { DEV_LOGIN_IDENTITY_PREFIX, GOOGLE_IDENTITY_PREFIX } = require('../../dist/member-analysis/member-kind');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const {
  APP_LOCK_TIMEOUT, APP_LOCK_TIMEOUT_MS, NO_ROLE_PRIVILEGE, assertCapWait, cleanUpLocks, createLockWaitRoles,
  holdAdvisory, holdRow, sleepUntil, summarize, timed, waitUntilBlocked, withAppAccount,
} = require('../support/lock-wait-limit.cjs');
const { defineShareLinkLockCases } = require('../support/share-link-lock-cases.cjs');

// #220: 앱 DB 계정에만 건 잠금 대기 상한(3초, 2026-10-16 합의)을 시험 전용 계정으로 재현한다. 그 계정으로 띄운 실제 앱에서
// 링크 발급·로그인·세션 갱신/로그아웃의 잠금 대기를 본다. 잠금을 쥐는 쪽은 상한 없는 테스트 DB 계정 연결이다.
// 정상 경쟁의 시간은 이 환경에서 한 번 잰 값이며, 모든 부하에서 3초가 적정하다는 근거가 아니다.

const WEB = 'http://localhost:3000';
const ENV = {
  NODE_ENV: 'test', DEV_LOGIN_ENABLED: 'true', AUTH_JWT_SECRET: randomBytes(32).toString('hex'),
  AUTH_ACCESS_TOKEN_TTL_SECONDS: '900', AUTH_WEB_ORIGIN: WEB, SHARE_LINK_WEB_BASE_URL: 'https://catchu.example/app',
  LINK_GRANT_SECRET: randomBytes(32).toString('hex'), GOOGLE_LOGIN_ENABLED: 'true',
  GOOGLE_CLIENT_ID: 'synthetic.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'synthetic-google-secret',
  GOOGLE_REDIRECT_URI: 'http://localhost:3000/google/callback',
};
const saved = {};
const logs = [];
let db, roles, app, url;

before(async () => {
  for (const [key, value] of Object.entries(ENV)) { saved[key] = process.env[key]; process.env[key] = value; }
  db = await openTestDataSource();
  roles = await createLockWaitRoles(db);
  if (!roles) return;
  const logger = Object.fromEntries(['log', 'error', 'warn', 'debug', 'verbose', 'fatal'].map(level =>
    [level, (...args) => logs.push(args.map(String).join(' '))]));
  app = await withAppAccount(roles, async () =>
    configureApp(await NestFactory.create(AppModule, { logger, abortOnError: false })));
  await app.listen(0, '127.0.0.1');
  url = await app.getUrl();
});
after(async () => {
  try { await app?.close(); } finally {
    try { await roles?.drop(); } finally {
      await db?.destroy();
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    }
  }
});
beforeEach(async () => { await resetTestDatabase(db); logs.length = 0; });
// 대기 확인이나 검사가 실패해 시험이 잠금을 풀기 전에 끝나도, 다음 시험 전에 잠금을 풀고 시작한 요청이 끝나기를 기다린다.
afterEach(() => cleanUpLocks());

/** 계정 생성 권한이 없는 환경에서는 이유를 남기고 건너뛴다(CI에서는 createLockWaitRoles가 실패시킨다). */
function ready(t) {
  if (roles) return true;
  t.skip(NO_ROLE_PRIVILEGE);
  return false;
}

async function call(path, { method = 'POST', body, token, cookie, origin } = {}) {
  const response = await fetch(url + path, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(cookie ? { Cookie: cookie } : {}), ...(origin ? { Origin: origin } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null,
    setCookie: response.headers.get('set-cookie'), cacheControl: response.headers.get('cache-control') };
}
const devLogin = identity => call('/v1/auth/dev-login', { body: { memberId: identity } });
async function login(identity = 'lock-member') {
  const result = await devLogin(identity);
  assert.equal(result.status, 200, JSON.stringify(result.body));
  const claims = decodeJwt(result.body.accessToken);
  return { token: result.body.accessToken, memberId: claims.sub, sessionId: claims.sid, cookie: result.setCookie.split(';')[0] };
}
async function create(token, key, body) {
  const response = await fetch(`${url}/v1/share-links`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'Idempotency-Key': key },
    body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
  return { status: response.status, cacheControl: response.headers.get('cache-control'), body: await response.json() };
}
const refresh = cookie => call('/v1/auth/refresh', { cookie, origin: WEB });
const logout = cookie => call('/v1/auth/logout', { cookie, origin: WEB });
const count = async (table, where = '', params = []) =>
  Number((await db.query(`SELECT count(*)::int AS n FROM ${table} ${where}`, params))[0].n);
function assertInternalError(result, label) {
  assert.equal(result.status, 500, `${label}: ${JSON.stringify(result.body)}`);
  assert.deepEqual(result.body, { code: 'INTERNAL_ERROR', message: result.body.message });
  assert.equal(result.cacheControl, 'no-store');
}

test('공통 DB 연결 설정에는 잠금 대기 상한을 넣지 않는다(앱과 마이그레이션 명령이 함께 쓴다)', () => {
  const options = buildDataSourceOptions({ host: '127.0.0.1', port: 5432, username: 'u', password: 'p', database: 'd_test' });
  assert.equal(options.extra.options, '-c TimeZone=UTC');
  assert.ok(!JSON.stringify(options).includes('lock_timeout'));
});

test('앱 계정에만 이 시험 DB의 3초 상한이 걸리고 마이그레이션 계정·다른 DB·잠금을 쥐는 시험 연결에는 걸리지 않는다', async t => {
  if (!ready(t)) return;
  const settings = await db.query(`
    SELECT r.rolname AS role, d.datname AS database, s.setconfig AS config
      FROM pg_db_role_setting s JOIN pg_roles r ON r.oid = s.setrole LEFT JOIN pg_database d ON d.oid = s.setdatabase
     WHERE r.rolname = ANY($1::text[]) ORDER BY r.rolname`, [[roles.app.username, roles.migrator.username]]);
  assert.deepEqual(settings, [{ role: roles.app.username, database: roles.database, config: [`lock_timeout=${APP_LOCK_TIMEOUT}`] }]);
  const show = async (role, overrides) => {
    const source = await roles.open(role, overrides);
    try { return (await source.query('SHOW lock_timeout'))[0].lock_timeout; } finally { await source.destroy(); }
  };
  // 앱의 연결 설정(buildDataSourceOptions)으로 연 새 연결의 실제 적용값이다.
  assert.equal(await show(roles.app), APP_LOCK_TIMEOUT);
  assert.equal(await show(roles.migrator), '0', '마이그레이션 계정에는 걸지 않는다');
  assert.equal(await show(roles.app, { database: 'postgres' }), '0', '계정 설정은 시험 DB에만 걸린다');
  // 이 계정으로 띄운 실제 앱의 연결도 같은 값이다. 시험 연결 주입(500ms)은 이 파일에 없다.
  const appSource = app.get(DataSource);
  const [{ lock_timeout: appTimeout, current_user: appUser }] = await appSource.query('SELECT current_setting(\'lock_timeout\') AS lock_timeout, current_user');
  assert.equal(appTimeout, APP_LOCK_TIMEOUT);
  assert.equal(appUser, roles.app.username);
  assert.equal((await db.query('SHOW lock_timeout'))[0].lock_timeout, '0', '테스트 DB 계정 연결에는 상한이 걸리지 않는다');
});

test('시험 전용 계정은 지우면 계정과 DB별 설정이 남지 않는다', async t => {
  if (!ready(t)) return;
  const extra = await createLockWaitRoles(db);
  const names = [extra.app.username, extra.migrator.username];
  const oids = (await db.query('SELECT oid::int AS oid FROM pg_roles WHERE rolname = ANY($1::text[])', [names])).map(row => row.oid);
  assert.equal(oids.length, 2);
  await extra.drop();
  assert.equal(await count('pg_roles', 'WHERE rolname = ANY($1::text[])', [names]), 0);
  assert.equal(await count('pg_db_role_setting', 'WHERE setrole = ANY($1::oid[])', [oids]), 0);
});

defineShareLinkLockCases({
  test, timeoutMs: APP_LOCK_TIMEOUT_MS, label: ' — 앱 계정 3초', db: () => db, ready,
  login: () => login('key-lock-member'), create, holdLock: text => holdAdvisory(db, text),
});

test('개발 로그인: 신원 잠금을 3초 안에 얻지 못하면 500이고 회원·세션을 남기지 않는다', async t => {
  if (!ready(t)) return;
  const identity = 'lock-dev-' + randomUUID();
  const held = await holdAdvisory(db, DEV_LOGIN_IDENTITY_PREFIX + identity);
  let failed;
  try { failed = await timed(() => devLogin(identity)); } finally { await held.release(); }
  assertInternalError(failed.value, '개발 로그인');
  assertCapWait(failed.ms, '개발 로그인');
  assert.equal(failed.value.setCookie, null, '실패 응답은 Refresh 쿠키를 보내지 않는다');
  for (const table of ['member_account', 'member_profile', 'github_connection', 'auth_session', 'session_refresh_token']) {
    assert.equal(await count(table), 0, `${table}에 남은 행이 없다`);
  }
  // 공통 오류 처리는 고정 분류명과 코드 위치만 남긴다. DB 원문(잠금 시간 초과 문구·SQL·잠금 대상 값)은 로그에 없다.
  const logged = logs.join('\n');
  assert.match(logged, /→ 500 INTERNAL_ERROR \(Error\)/);
  for (const text of ['lock timeout', 'pg_advisory_xact_lock', identity]) assert.ok(!logged.includes(text), text);
  const retried = await devLogin(identity);
  assert.equal(retried.status, 200, JSON.stringify(retried.body));
  assert.equal(await count('member_account'), 1);
  t.diagnostic(`개발 로그인 상한 초과: ${failed.ms}ms 뒤 500, 다시 보내면 200`);
});

test('개발 로그인: 짧게 쥔 신원 잠금과 같은 신원의 동시 로그인은 기다린 뒤 모두 성공한다', async t => {
  if (!ready(t)) return;
  const identity = 'lock-dev-' + randomUUID();
  const held = await holdAdvisory(db, DEV_LOGIN_IDENTITY_PREFIX + identity);
  const startedAt = Date.now();
  const pending = timed(() => devLogin(identity));
  await waitUntilBlocked(db, held.pid, '개발 로그인');
  await sleepUntil(startedAt + 1000);
  const heldMs = await held.release();
  const waited = await pending;
  assert.equal(waited.value.status, 200, JSON.stringify(waited.value.body));
  assert.ok(waited.ms >= 900 && waited.ms < APP_LOCK_TIMEOUT_MS, `보유 ${heldMs}ms 동안 기다린 뒤 성공(${waited.ms}ms)`);

  const concurrent = 5;
  const burst = await Promise.all(Array.from({ length: concurrent }, () => timed(() => devLogin(identity + '-burst'))));
  assert.deepEqual(burst.map(r => r.value.status), Array(concurrent).fill(200));
  assert.equal(await count('member_account', 'WHERE identity_reference = $1', [DEV_LOGIN_IDENTITY_PREFIX + identity + '-burst']), 1);
  assert.equal(await count('auth_session'), concurrent + 1);
  t.diagnostic(`개발 로그인 짧은 보유: 보유 ${heldMs}ms, 대기 포함 ${waited.ms}ms`);
  t.diagnostic(`개발 로그인 같은 신원 동시 ${concurrent}건 응답(ms): ${JSON.stringify(summarize(burst.map(r => r.ms)))}`);
});

/** Google 로그인 시작 → 완료. 제공자 교환만 합성 대역이고 신원 잠금·회원·세션 저장은 실제 경로다. */
async function googleAttempt() {
  const started = await call('/v1/auth/google/authorization', { body: {} });
  assert.equal(started.status, 200, JSON.stringify(started.body));
  return { state: new URL(started.body.authorizationUrl).searchParams.get('state'),
    loginAttemptToken: started.body.loginAttemptToken, code: 'synthetic-code' };
}
const googleLogin = input => call('/v1/auth/google/login', { body: input });
function stubGoogle(t, subject) {
  const service = app.get(GoogleLoginService);
  const original = service.provider;
  service.provider = { exchange: async () => ({ subject, name: null }) };
  t.after(() => { service.provider = original; });
}

test('Google 로그인: 신원 잠금을 3초 안에 얻지 못하면 500이고 회원·세션을 남기지 않으며 새 인증으로 다시 로그인한다', async t => {
  if (!ready(t)) return;
  const subject = 'lock-google-' + randomUUID();
  stubGoogle(t, subject);
  const attempt = await googleAttempt();
  const held = await holdAdvisory(db, GOOGLE_IDENTITY_PREFIX + subject);
  let failed;
  try { failed = await timed(() => googleLogin(attempt)); } finally { await held.release(); }
  assertInternalError(failed.value, 'Google 로그인');
  assertCapWait(failed.ms, 'Google 로그인');
  assert.equal(failed.value.setCookie, null);
  for (const table of ['member_account', 'member_profile', 'auth_session', 'session_refresh_token']) {
    assert.equal(await count(table), 0, `${table}에 남은 행이 없다`);
  }
  // 기존 계약: 로그인 시도(state)는 외부 호출·DB 실패 뒤에도 다시 쓰지 않는다. 사용자는 새 인증을 시작한다.
  const reused = await googleLogin(attempt);
  assert.equal(reused.status, 401);
  assert.equal(reused.body.code, 'AUTH_INVALID');
  const again = await googleLogin(await googleAttempt());
  assert.equal(again.status, 200, JSON.stringify(again.body));
  assert.equal(await count('member_account', 'WHERE identity_reference = $1', [GOOGLE_IDENTITY_PREFIX + subject]), 1);
  t.diagnostic(`Google 로그인 상한 초과: ${failed.ms}ms 뒤 500, 같은 시도 401, 새 인증 200`);
});

test('Google 로그인: 같은 신원의 동시 로그인은 신원 잠금을 차례로 기다린 뒤 모두 성공한다', async t => {
  if (!ready(t)) return;
  const subject = 'lock-google-' + randomUUID();
  stubGoogle(t, subject);
  const concurrent = 3;
  const attempts = await Promise.all(Array.from({ length: concurrent }, () => googleAttempt()));
  const results = await Promise.all(attempts.map(input => timed(() => googleLogin(input))));
  assert.deepEqual(results.map(r => r.value.status), Array(concurrent).fill(200));
  assert.equal(await count('member_account'), 1);
  assert.equal(await count('auth_session'), concurrent);
  t.diagnostic(`Google 로그인 같은 신원 동시 ${concurrent}건 응답(ms): ${JSON.stringify(summarize(results.map(r => r.ms)))}`);
});

async function sessionState(sessionId) {
  const [session] = await db.query('SELECT revoked_at, last_refreshed_at FROM auth_session WHERE session_id = $1', [sessionId]);
  const tokens = await db.query('SELECT refresh_id, used_at FROM session_refresh_token WHERE session_id = $1 ORDER BY created_at, refresh_id', [sessionId]);
  return { session, tokens };
}

test('세션 갱신·로그아웃: 세션 행 잠금을 3초 안에 얻지 못하면 500이고 쿠키·Refresh·세션을 바꾸지 않으며 같은 쿠키로 다시 한다', async t => {
  if (!ready(t)) return;
  const user = await login('lock-session-member');
  const before = await sessionState(user.sessionId);

  let held = await holdRow(db, 'auth_session', 'session_id', user.sessionId);
  let failed;
  try { failed = await timed(() => refresh(user.cookie)); } finally { await held.release(); }
  assertInternalError(failed.value, '세션 갱신');
  assertCapWait(failed.ms, '세션 갱신');
  assert.equal(failed.value.setCookie, null, '500은 새 쿠키도 제거 쿠키도 보내지 않는다');
  assert.deepEqual(await sessionState(user.sessionId), before, '이전 Refresh와 세션이 그대로다');
  const renewed = await refresh(user.cookie);
  assert.equal(renewed.status, 200, '같은 쿠키로 다시 갱신한다');
  const cookie = renewed.setCookie.split(';')[0];
  const afterRefresh = await sessionState(user.sessionId);

  held = await holdRow(db, 'auth_session', 'session_id', user.sessionId);
  let logoutFailed;
  try { logoutFailed = await timed(() => logout(cookie)); } finally { await held.release(); }
  assertInternalError(logoutFailed.value, '로그아웃');
  assertCapWait(logoutFailed.ms, '로그아웃');
  assert.equal(logoutFailed.value.setCookie, null, '500이면 쿠키를 바꾸지 않는다');
  assert.deepEqual(await sessionState(user.sessionId), afterRefresh, '세션을 폐기하지 않았다');
  const loggedOut = await logout(cookie);
  assert.equal(loggedOut.status, 204);
  assert.match(loggedOut.setCookie, /Max-Age=0/);
  assert.notEqual((await sessionState(user.sessionId)).session.revoked_at, null);
  t.diagnostic(`세션 행 잠금 상한 초과: 갱신 ${failed.ms}ms·로그아웃 ${logoutFailed.ms}ms 뒤 500`);
});

test('세션 갱신: 짧게 쥔 세션 행 잠금은 기다린 뒤 성공하고, 같은 토큰 동시 갱신은 기존 계약대로 하나만 성공하고 세션을 닫는다', async t => {
  if (!ready(t)) return;
  const user = await login('lock-session-short');
  const held = await holdRow(db, 'auth_session', 'session_id', user.sessionId);
  const startedAt = Date.now();
  const pending = timed(() => refresh(user.cookie));
  await waitUntilBlocked(db, held.pid, '세션 갱신');
  await sleepUntil(startedAt + 1000);
  const heldMs = await held.release();
  const waited = await pending;
  assert.equal(waited.value.status, 200, JSON.stringify(waited.value.body));
  assert.ok(waited.ms >= 900 && waited.ms < APP_LOCK_TIMEOUT_MS, `보유 ${heldMs}ms 뒤 성공(${waited.ms}ms)`);

  const other = await login('lock-session-burst');
  const concurrent = 3;
  const burst = await Promise.all(Array.from({ length: concurrent }, () => timed(() => refresh(other.cookie))));
  const statuses = burst.map(r => r.value.status).sort();
  assert.deepEqual(statuses, [200, ...Array(concurrent - 1).fill(401)]);
  for (const r of burst.filter(r => r.value.status === 401)) assert.equal(r.value.body.code, 'AUTH_INVALID');
  assert.notEqual((await sessionState(other.sessionId)).session.revoked_at, null, '재사용 감지로 세션을 닫는다');
  t.diagnostic(`세션 갱신 짧은 보유: 보유 ${heldMs}ms, 대기 포함 ${waited.ms}ms`);
  t.diagnostic(`같은 토큰 동시 갱신 ${concurrent}건 응답(ms): ${JSON.stringify(summarize(burst.map(r => r.ms)))}`);
});

require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { before, after, beforeEach, test } = require('node:test');
const { NestFactory } = require('@nestjs/core');
const { DataSource } = require('typeorm');
const { SignJWT, decodeJwt } = require('jose');
const { AppModule } = require('../../dist/app.module');
const { configureApp } = require('../../dist/app.setup');
const { MemberAccount, MemberProfile, GitHubConnection } = require('../../dist/member-analysis/member-analysis.entity');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
let app, db, url;
const logs = [];
const settings = { AUTH_JWT_SECRET: randomBytes(32).toString('hex'), AUTH_ACCESS_TOKEN_TTL_SECONDS: '900',
  DEV_LOGIN_ENABLED: 'true', NODE_ENV: 'test', LINK_GRANT_SECRET: randomBytes(32).toString('hex') };
const saved = {};
before(async () => {
  for (const [key, value] of Object.entries(settings)) { saved[key] = process.env[key]; process.env[key] = value; }
  const logger = Object.fromEntries(['log', 'error', 'warn', 'debug', 'verbose', 'fatal'].map(level =>
    [level, (...args) => logs.push(args.map(String).join(' '))]));
  app = await configureApp(await NestFactory.create(AppModule, { logger, abortOnError: false }));
  await app.listen(0, '127.0.0.1'); url = await app.getUrl();
  db = await openTestDataSource();
});
after(async () => {
  await app?.close(); await db?.destroy();
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
beforeEach(async () => { await resetTestDatabase(db); logs.length = 0; });
const profile = (displayName = '표시 이름') => ({ displayName, introduction: '', desiredRole: '', skills: [] });
async function call(token, method = 'GET', path = '/me', body, rawBody) {
  const response = await fetch(`${url}/v1${path}`, { method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined || rawBody !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)), signal: AbortSignal.timeout(10000) });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  return { status: response.status, body: await response.json() };
}
async function login(identity = 'profile-owner-a') {
  const response = await call(undefined, 'POST', '/auth/dev-login', { memberId: identity });
  assert.equal(response.status, 200);
  return { token: response.body.accessToken, memberId: decodeJwt(response.body.accessToken).sub };
}
const read = token => call(token);
const replace = (token, body) => call(token, 'PUT', '/me/profile', body);
function error(response, status, code) {
  assert.equal(response.status, status, JSON.stringify(response.body));
  assert.equal(response.body.code, code);
}
const stored = memberId => db.manager.findOneByOrFail(MemberProfile, { memberId });
async function sign(memberId, expired = false, sessionId = randomUUID()) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ sub: memberId, sid: sessionId, iss: 'catchu-api', aud: 'catchu-member-api',
    iat: now - 20, exp: expired ? now - 1 : now + 300 }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .sign(Buffer.from(settings.AUTH_JWT_SECRET, 'hex'));
}

test('초기 프로필과 본인 회원의 허용 필드만 계약 형식으로 반환', async () => {
  const a = await login();
  const result = await read(a.token);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { memberId: a.memberId, profile: profile(''),
    github: { state: 'CONNECTED', accountLogin: 'catchu-synthetic-owner' } });
  assert.ok(!JSON.stringify(result.body).includes('identityReference'));
  assert.ok(!JSON.stringify(result.body).includes('credentialReference'));
});
test('전체 저장 뒤 재조회하며 선택 항목 비우기·SELF_REPORTED·프로필 ID를 유지', async () => {
  const a = await login();
  const before = await stored(a.memberId);
  const input = { displayName: ' \tA  e\u0301 한글 ', introduction: ' 소개 ', desiredRole: ' Backend ', skills: ['React', 'react', '', ' '] };
  const expected = { ...input, displayName: 'A  e\u0301 한글' };
  assert.deepEqual(await replace(a.token, input), { status: 200, body: expected });
  assert.deepEqual((await read(a.token)).body.profile, expected);
  assert.deepEqual(await replace(a.token, profile('새 이름')), { status: 200, body: profile('새 이름') });
  assert.deepEqual((await read(a.token)).body.profile, profile('새 이름'));
  const after = await stored(a.memberId);
  assert.equal(after.profileId, before.profileId); assert.equal(after.inputProvenance, 'SELF_REPORTED');
});
test('회원 둘의 조회·저장은 분리되고 본문·쿼리·경로로 대상을 바꾸지 못한다', async () => {
  const a = await login('owner-a'), b = await login('owner-b');
  await replace(a.token, profile('A')); await replace(b.token, profile('B'));
  assert.equal((await read(a.token)).body.memberId, a.memberId);
  assert.equal((await read(b.token)).body.profile.displayName, 'B');
  error(await replace(a.token, { ...profile('덮기'), memberId: b.memberId }), 400, 'VALIDATION_FAILED');
  error(await call(a.token, 'GET', `/me?memberId=${b.memberId}`), 400, 'VALIDATION_FAILED');
  error(await call(a.token, 'PUT', `/me/profile?memberId=${b.memberId}`, profile('덮기')), 400, 'VALIDATION_FAILED');
  error(await call(a.token, 'GET', `/me/${b.memberId}`), 404, 'RESOURCE_UNAVAILABLE');
  assert.equal((await stored(b.memberId)).displayName, 'B');
});
test('연동 상태 세 종류와 행 없음 DISCONNECTED를 투영하고 비밀 참조는 반환하지 않는다', async () => {
  const a = await login();
  for (const state of ['CONNECTED', 'REAUTH_REQUIRED', 'DISCONNECTED']) {
    await db.manager.update(GitHubConnection, { memberId: a.memberId }, { connectionState: state,
      accountLogin: 'linked-owner', credentialReference: 'synthetic-credential-marker' });
    assert.deepEqual((await read(a.token)).body.github, { state, accountLogin: 'linked-owner' });
  }
  await db.manager.delete(GitHubConnection, { memberId: a.memberId });
  assert.deepEqual((await read(a.token)).body.github, { state: 'DISCONNECTED', accountLogin: null });
  assert.ok(!logs.join('\n').includes('synthetic-credential-marker'));
});
test('회원 API는 개발 로그인 플래그에 의존하지 않고 인증된 회원으로 동작', async () => {
  const a = await login();
  const { AUTH_CONFIG } = require('../../dist/auth/auth.config');
  const config = app.get(AUTH_CONFIG), previous = config.devLoginEnabled;
  config.devLoginEnabled = false;
  try { assert.equal((await read(a.token)).status, 200); assert.equal((await replace(a.token, profile())).status, 200); }
  finally { config.devLoginEnabled = previous; }
});
test('토큰 없음·변조·만료는 조회와 저장에서 모두 401이며 원문을 노출하지 않는다', async () => {
  const a = await login();
  for (const [token, code] of [[undefined, 'AUTH_REQUIRED'], ['synthetic-invalid-token', 'AUTH_INVALID'], [await sign(a.memberId, true, decodeJwt(a.token).sid), 'AUTH_INVALID']]) {
    error(await read(token), 401, code); error(await replace(token, profile()), 401, code);
  }
  assert.ok(!logs.join('\n').includes(a.token));
  assert.ok(!logs.join('\n').includes('synthetic-invalid-token'));
});
test('#250 Guard는 없는·비활성·UUID 아닌 인증 주체를 401로 거부하고 프로필을 생성하지 않는다', async () => {
  const a = await login(); await db.manager.update(MemberAccount, { memberId: a.memberId }, { accountState: 'INACTIVE' });
  for (const id of [a.memberId, randomUUID(), 'legacy-member']) {
    const token = await sign(id, false, decodeJwt(a.token).sid);
    error(await read(token), 401, 'AUTH_INVALID'); error(await replace(token, profile()), 401, 'AUTH_INVALID');
  }
  assert.equal(await db.getRepository(MemberProfile).count(), 1);
});
test('필수 프로필 누락은 이름 미저장으로 숨기지 않으며 조회·저장 모두 500', async () => {
  const a = await login(); await db.manager.delete(MemberProfile, { memberId: a.memberId });
  error(await read(a.token), 500, 'INTERNAL_ERROR'); error(await replace(a.token, profile()), 500, 'INTERNAL_ERROR');
  assert.equal(await db.getRepository(MemberProfile).count(), 0);
});
test('각 문자 제한 경계 저장·재조회와 초과 거부, 기존 값 보존', async () => {
  const a = await login();
  for (const [field, limit] of [['displayName', 50], ['introduction', 200], ['desiredRole', 100]]) {
    const value = '😀'.repeat(limit), input = { ...profile(), [field]: field === 'displayName' ? ` ${value} ` : value };
    const expected = { ...input, [field]: value };
    assert.deepEqual(await replace(a.token, input), { status: 200, body: expected });
    assert.deepEqual((await read(a.token)).body.profile, expected);
    const rejected = await replace(a.token, { ...input, [field]: value + '한' });
    error(rejected, 400, 'VALIDATION_FAILED');
    assert.ok(rejected.body.details.violations.some(v => v.field === field && v.reason === 'maxLength'));
    assert.deepEqual((await read(a.token)).body.profile, expected);
  }
});
test('기술 수·각 기술 길이 경계 저장 및 초과 거부', async () => {
  const a = await login(); const input = { ...profile(), skills: Array(20).fill('😀'.repeat(50)) };
  assert.deepEqual(await replace(a.token, input), { status: 200, body: input });
  assert.deepEqual((await read(a.token)).body.profile, input);
  for (const skills of [Array(21).fill('기술'), ['가'.repeat(51)]]) {
    error(await replace(a.token, { ...profile(), skills }), 400, 'VALIDATION_FAILED');
    assert.deepEqual((await read(a.token)).body.profile, input);
  }
});
test('빈·공백 이름, 필수 누락·타입·추가 필드 오류는 violations이며 저장하지 않는다', async () => {
  const a = await login(); await replace(a.token, profile());
  const invalid = [[], {}, { ...profile(), displayName: '' }, { ...profile(), displayName: '\t\n' },
    { ...profile(), displayName: 123 }, { ...profile(), skills: '기술' }, { ...profile(), skills: [null] },
    { ...profile(), introduction: null }, { ...profile(), desiredRole: false },
    ...['memberId', 'profileId', 'inputProvenance', 'constructor', '__proto__'].map(key => ({ ...profile(), [key]: 'synthetic-input-marker' }))];
  for (const body of invalid) {
    const result = await replace(a.token, body); error(result, 400, 'VALIDATION_FAILED');
    assert.ok(Array.isArray(result.body.details.violations));
    assert.ok(!JSON.stringify(result.body).includes('synthetic-input-marker'));
    assert.deepEqual((await read(a.token)).body.profile, profile());
  }
  error(await call(a.token, 'PUT', '/me/profile', undefined, '{'), 400, 'INVALID_REQUEST');
  // 공통 JSON 파서는 최상위 null을 컨트롤러 검증 전에 거부한다.
  error(await replace(a.token, null), 400, 'INVALID_REQUEST');
  assert.deepEqual((await read(a.token)).body.profile, profile());
});
for (const field of ['displayName', 'introduction', 'desiredRole', 'skills']) {
  test(`${field}의 NUL은 API에서 400으로 거부하며 DB 프로필·입력 원문 비노출을 유지`, async () => {
    const a = await login(); await replace(a.token, profile());
    const before = await stored(a.memberId);
    const marker = `nul-private-${field}`;
    for (const value of [`\u0000${marker}`, `${marker}\u0000한글😀`, `${marker}\u0000`]) {
      const body = { ...profile(), [field]: field === 'skills' ? ['정상', value] : value };
      const result = await replace(a.token, body);
      error(result, 400, 'VALIDATION_FAILED');
      assert.deepEqual(result.body.details.violations, [{ field: field === 'skills' ? 'skills.1' : field, reason: 'noNul' }]);
      assert.ok(!JSON.stringify(result.body).includes(marker));
      assert.ok(!logs.join('\n').includes(marker));
      assert.deepEqual(await stored(a.memberId), before);
      assert.deepEqual((await read(a.token)).body.profile, profile());
    }
  });
}
for (const field of ['displayName', 'introduction', 'desiredRole', 'skills']) {
  test(`${field}의 고립 서로게이트는 실제 API에서 400이며 DB 프로필과 원문 비노출을 유지`, async () => {
    const a = await login(); await replace(a.token, profile('기존 한글😀'));
    const before = await stored(a.memberId);
    const marker = `surrogate-private-${field}`;
    const invalidSequences = ['\ud800', '\udbff', '\udc00', '\udfff', '\ud800\ud800',
      '\udc00\udc00', '\udc00\ud800', '\ud800가\udc00', '\ud800\ud83d\ude00', '\ud83d\ude00\udc00'];
    for (const sequence of invalidSequences) {
      for (const value of [sequence + marker, marker + sequence + '가', marker + sequence]) {
        const body = { ...profile(), [field]: field === 'skills' ? ['정상', value] : value };
        const result = await replace(a.token, body);
        error(result, 400, 'VALIDATION_FAILED');
        assert.deepEqual(result.body.details.violations, [{ field: field === 'skills' ? 'skills.1' : field, reason: 'isWellFormed' }]);
        assert.ok(!JSON.stringify(result.body).includes(marker));
        assert.ok(!logs.join('\n').includes(marker));
        assert.deepEqual(await stored(a.memberId), before);
        assert.deepEqual((await read(a.token)).body.profile, profile('기존 한글😀'));
      }
    }
  });
}
test('정상 한글·이모지·올바른 서로게이트 쌍 저장은 PUT과 직후 GET 및 DB 값이 같다', async () => {
  const a = await login();
  const value = '한글😀\ud800\udc00\udbff\udfff\ufffd';
  const body = { displayName: ` ${value} `, introduction: value, desiredRole: value, skills: [value, ''] };
  const expected = { ...body, displayName: value };
  assert.deepEqual(await replace(a.token, body), { status: 200, body: expected });
  assert.deepEqual((await read(a.token)).body.profile, expected);
  const row = await stored(a.memberId);
  for (const field of ['displayName', 'introduction', 'desiredRole', 'skills']) assert.deepEqual(row[field], expected[field]);
});
test('NUL 이외의 제어문자를 추가 거부하지 않고 한글·이모지·빈 선택 입력을 저장', async () => {
  const a = await login();
  const body = { displayName: '  한글😀\u0001이름\t끝  ', introduction: '\t소개\n\u0001',
    desiredRole: '직무\r\n\u0002', skills: ['React😀\t\n\u0003', ''] };
  const expected = { ...body, displayName: body.displayName.trim() };
  assert.deepEqual(await replace(a.token, body), { status: 200, body: expected });
  assert.deepEqual((await read(a.token)).body.profile, expected);
  assert.deepEqual(await replace(a.token, profile('한글😀')), { status: 200, body: profile('한글😀') });
  assert.deepEqual((await read(a.token)).body.profile, profile('한글😀'));
});

test('실제 조회 SQL 실패는 500이고 복구 후 저장값을 다시 조회할 수 있다', async () => {
  const a = await login(); await replace(a.token, profile());
  await db.query('ALTER TABLE member_profile RENAME TO profile_read_failure_probe');
  try { error(await read(a.token), 500, 'INTERNAL_ERROR'); }
  finally { await db.query('ALTER TABLE profile_read_failure_probe RENAME TO member_profile'); }
  assert.deepEqual((await read(a.token)).body.profile, profile());
});
test('실제 저장 제약 실패는 500이며 기존 저장값과 프로필 행을 보존', async () => {
  const a = await login(); await replace(a.token, profile()); const before = await stored(a.memberId);
  await db.query("ALTER TABLE member_profile ADD CONSTRAINT test_reject_profile_replace CHECK (display_name <> 'reject-write') NOT VALID");
  try { error(await replace(a.token, profile('reject-write')), 500, 'INTERNAL_ERROR'); }
  finally { await db.query('ALTER TABLE member_profile DROP CONSTRAINT test_reject_profile_replace'); }
  assert.deepEqual(await stored(a.memberId), before);
  assert.ok(!logs.join('\n').includes('reject-write')); assert.ok(!logs.join('\n').includes(a.token));
});
test('최종 커밋 실패도 성공 응답으로 보내지 않으며 전체 저장을 롤백', async () => {
  const a = await login(); await replace(a.token, profile()); const before = await stored(a.memberId);
  await db.query(`CREATE FUNCTION test_profile_commit_failure() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'synthetic-commit-private-marker'; END $$`);
  await db.query(`CREATE CONSTRAINT TRIGGER test_profile_commit_failure AFTER UPDATE ON member_profile
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION test_profile_commit_failure()`);
  try { error(await replace(a.token, { displayName: '다른 이름', introduction: '변경', desiredRole: '직무', skills: ['기술'] }), 500, 'INTERNAL_ERROR'); }
  finally {
    await db.query('DROP TRIGGER test_profile_commit_failure ON member_profile');
    await db.query('DROP FUNCTION test_profile_commit_failure()');
  }
  assert.deepEqual(await stored(a.memberId), before);
  assert.deepEqual((await read(a.token)).body.profile, profile());
  assert.ok(!logs.join('\n').includes('synthetic-commit-private-marker'));
  assert.equal(app.get(DataSource).isInitialized, true);
});

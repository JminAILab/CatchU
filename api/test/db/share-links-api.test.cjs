require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { after, before, beforeEach, test } = require('node:test');
const { NestFactory } = require('@nestjs/core');
const { SignJWT } = require('jose');
const { AppModule } = require('../../dist/app.module');
const { configureApp } = require('../../dist/app.setup');
const { hashLinkPassword } = require('../../dist/share-links/link-password');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');

// #147: POST /v1/share-links를 실제 앱·테스트 DB·개발 로그인 회원으로 검증한다.
// 비밀번호·토큰은 합성 값만 쓴다.

const WEB = 'https://catchu.example/app';
const HOUR = 60 * 60 * 1000;
const PASSWORD = 'synthetic-only-link-password';
const ENV = {
  AUTH_JWT_SECRET: randomBytes(32).toString('hex'),
  AUTH_ACCESS_TOKEN_TTL_SECONDS: '300',
  DEV_LOGIN_ENABLED: 'true',
  NODE_ENV: 'test',
  SHARE_LINK_WEB_BASE_URL: WEB,
};
const saved = {};
const logs = [];
let app;
let url;
let db;

before(async () => {
  for (const [key, value] of Object.entries(ENV)) { saved[key] = process.env[key]; process.env[key] = value; }
  const logger = Object.fromEntries(['log', 'error', 'warn', 'debug', 'verbose', 'fatal'].map((level) =>
    [level, (...args) => logs.push(args.map(String).join(' '))]));
  app = await configureApp(await NestFactory.create(AppModule, { logger, abortOnError: false }));
  await app.listen(0, '127.0.0.1');
  url = await app.getUrl();
  db = await openTestDataSource();
});
after(async () => {
  await app?.close();
  await db?.destroy();
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
beforeEach(() => resetTestDatabase(db));

async function login(devIdentity = 'share-link-member-a') {
  const response = await fetch(`${url}/v1/auth/dev-login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId: devIdentity }),
  });
  assert.equal(response.status, 200);
  return (await response.json()).accessToken;
}
async function create(token, key, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token !== undefined) headers.Authorization = `Bearer ${token}`;
  if (key !== undefined) headers['Idempotency-Key'] = key;
  const response = await fetch(`${url}/v1/share-links`, {
    method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body), signal: AbortSignal.timeout(10000),
  });
  return { status: response.status, cacheControl: response.headers.get('cache-control'), body: await response.json() };
}
const count = async (table) => Number((await db.query(`SELECT count(*) AS n FROM ${table}`))[0].n);
const expectError = (result, status, code) => {
  assert.equal(result.status, status, JSON.stringify(result.body));
  assert.equal(result.body.code, code);
  assert.equal(result.cacheControl, 'no-store');
};

test('신규 발급은 201과 계약의 ShareLink 모양으로 응답하고, 원문 비밀번호를 저장·응답하지 않는다', async () => {
  const token = await login();
  const result = await create(token, 'key-new', { title: '  첫 링크  ', password: PASSWORD });
  assert.equal(result.status, 201);
  assert.equal(result.cacheControl, 'no-store');
  const link = result.body;
  assert.deepEqual(Object.keys(link).sort(),
    ['createdAt', 'expiresAt', 'linkId', 'passwordRequired', 'state', 'stoppedAt', 'title', 'url']);
  assert.equal(link.title, '첫 링크');
  assert.match(link.url, /^https:\/\/catchu\.example\/app\/s\/[A-Za-z0-9_-]{43}$/);
  assert.equal(link.passwordRequired, true);
  assert.equal(link.state, 'ACTIVE');
  assert.equal(link.stoppedAt, null);
  assert.equal(Date.parse(link.expiresAt) - Date.parse(link.createdAt), 720 * HOUR);
  assert.ok(Math.abs(Date.now() - Date.parse(link.createdAt)) < 60 * 1000);

  const [row] = await db.query('SELECT * FROM share_link');
  assert.equal(row.link_id, link.linkId);
  assert.equal(link.url.endsWith(`/s/${row.link_token_reference}`), true);
  assert.notEqual(row.password_protection_reference, null);
  const [record] = await db.query('SELECT * FROM idempotency_record');
  assert.equal(record.operation, 'createShareLink');
  assert.equal(record.link_id, link.linkId);
  assert.equal(record.member_id, row.owner_id);
  assert.equal(JSON.stringify([row, record, link]).includes(PASSWORD), false);
});

test('대표·공개 Catch 없이 비밀번호 없는 링크도 발급한다', async () => {
  const result = await create(await login(), 'key-plain', { title: '비밀번호 없음' });
  assert.equal(result.status, 201);
  assert.equal(result.body.passwordRequired, false);
  assert.equal((await db.query('SELECT password_protection_reference FROM share_link'))[0].password_protection_reference, null);
});

test('같은 키·정규화한 같은 본문의 재요청은 새 링크 없이 같은 링크를 200으로 돌려준다', async () => {
  const token = await login();
  const first = await create(token, 'key-replay', { title: '재요청', password: PASSWORD });
  const again = await create(token, 'key-replay', { password: PASSWORD, title: '  재요청 ' });
  assert.equal(again.status, 200);
  assert.deepEqual(again.body, first.body);
  assert.equal(await count('share_link'), 1);
  assert.equal(await count('idempotency_record'), 1);
});

test('같은 키에 다른 본문(비밀번호만·제목·비밀번호 유무)이면 409 IDEMPOTENCY_CONFLICT이고 링크를 만들지 않는다', async () => {
  const token = await login();
  assert.equal((await create(token, 'key-conflict', { title: '충돌', password: PASSWORD })).status, 201);
  for (const body of [
    { title: '충돌', password: `${PASSWORD}-other` },
    { title: '다른 제목', password: PASSWORD },
    { title: '충돌' },
  ]) {
    expectError(await create(token, 'key-conflict', body), 409, 'IDEMPOTENCY_CONFLICT');
  }
  assert.equal(await count('share_link'), 1);
  assert.equal(await count('idempotency_record'), 1);
});

test('다른 키로 같은 제목을 보내면 LINK_TITLE_CONFLICT이며 멱등 기록도 남기지 않는다', async () => {
  const token = await login();
  await create(token, 'key-title-1', { title: '같은 제목' });
  expectError(await create(token, 'key-title-2', { title: ' 같은 제목 ' }), 409, 'LINK_TITLE_CONFLICT');
  assert.equal(await count('share_link'), 1);
  assert.equal(await count('idempotency_record'), 1);
  // 거절된 키는 기록되지 않았으므로 다른 제목으로 다시 쓸 수 있다.
  assert.equal((await create(token, 'key-title-2', { title: '새 제목' })).status, 201);
});

test('유효 링크 5개면 LINK_LIMIT_REACHED, 중단한 링크의 제목은 다시 쓸 수 있다', async () => {
  const token = await login();
  for (let i = 1; i <= 5; i++) assert.equal((await create(token, `key-limit-${i}`, { title: `링크 ${i}` })).status, 201);
  expectError(await create(token, 'key-limit-6', { title: '여섯 번째' }), 409, 'LINK_LIMIT_REACHED');
  await db.query("UPDATE share_link SET stopped_at = now() WHERE title = '링크 1'");
  assert.equal((await create(token, 'key-limit-7', { title: '링크 1' })).status, 201);
  assert.equal(await count('share_link'), 6);
});

test('중단된 링크를 같은 키로 다시 요청하면 200과 현재 상태(STOPPED)를 돌려준다', async () => {
  const token = await login();
  const first = await create(token, 'key-stopped', { title: '중단될 링크' });
  await db.query('UPDATE share_link SET stopped_at = issued_at + interval \'1 second\'');
  const again = await create(token, 'key-stopped', { title: '중단될 링크' });
  assert.equal(again.status, 200);
  assert.equal(again.body.linkId, first.body.linkId);
  assert.equal(again.body.state, 'STOPPED');
  assert.notEqual(again.body.stoppedAt, null);
});

test('같은 키의 동시 요청 5건은 링크 1개로 수렴한다(201 한 번, 나머지 200)', async () => {
  const token = await login();
  const results = await Promise.all(Array.from({ length: 5 }, () => create(token, 'key-race', { title: '동시 같은 키' })));
  assert.deepEqual(results.map(({ status }) => status).sort(), [200, 200, 200, 200, 201]);
  assert.equal(new Set(results.map(({ body }) => body.linkId)).size, 1);
  assert.equal(await count('share_link'), 1);
  assert.equal(await count('idempotency_record'), 1);
});

test('다른 키의 동시 발급 7건은 5개까지만 성공한다', async () => {
  const token = await login();
  const results = await Promise.all(Array.from({ length: 7 }, (_, i) => create(token, `key-many-${i}`, { title: `동시 ${i}` })));
  assert.equal(results.filter(({ status }) => status === 201).length, 5);
  assert.deepEqual(results.filter(({ status }) => status !== 201).map(({ body }) => body.code), ['LINK_LIMIT_REACHED', 'LINK_LIMIT_REACHED']);
  assert.equal(await count('share_link'), 5);
  assert.equal(await count('idempotency_record'), 5);
});

test('멱등 키·제목·한도는 회원별이다', async () => {
  const a = await login('share-link-member-a');
  const b = await login('share-link-member-b');
  const first = await create(a, 'shared-key', { title: '같은 제목' });
  const second = await create(b, 'shared-key', { title: '같은 제목' });
  assert.equal(second.status, 201);
  assert.notEqual(second.body.linkId, first.body.linkId);
});

test('인증·멱등 키·입력 오류는 링크를 만들지 않는다', async () => {
  expectError(await create(undefined, 'key-auth', { title: 'x' }), 401, 'AUTH_REQUIRED');
  const token = await login();
  expectError(await create(token, undefined, { title: 'x' }), 400, 'INVALID_REQUEST');
  expectError(await create(token, '', { title: 'x' }), 400, 'INVALID_REQUEST');
  expectError(await create(token, 'k'.repeat(129), { title: 'x' }), 400, 'INVALID_REQUEST');
  for (const [body, violations] of [
    [{ title: ' \t ' }, [{ field: 'title', reason: 'isNotEmpty' }]],
    [{}, [{ field: 'title', reason: 'isString' }]],
    [{ title: 'x', password: '' }, [{ field: 'password', reason: 'isNotEmpty' }]],
    // #221: 제목은 trim 뒤 50자, 비밀번호는 입력 그대로 8~64자(코드 포인트).
    [{ title: 'x'.repeat(51) }, [{ field: 'title', reason: 'maxLength' }]],
    [{ title: '😀'.repeat(51) }, [{ field: 'title', reason: 'maxLength' }]],
    [{ title: 'x', password: 'p'.repeat(7) }, [{ field: 'password', reason: 'minLength' }]],
    [{ title: 'x', password: '😀'.repeat(7) }, [{ field: 'password', reason: 'minLength' }]],
    [{ title: 'x', password: 'p'.repeat(65) }, [{ field: 'password', reason: 'maxLength' }]],
    [{ title: 'x', ownerId: 'someone-else' }, [{ field: 'body', reason: 'whitelistValidation' }]],
    [[], [{ field: 'body', reason: 'isObject' }]],
  ]) {
    const result = await create(token, 'key-invalid', body);
    expectError(result, 400, 'VALIDATION_FAILED');
    assert.deepEqual(result.body.details.violations, violations);
  }
  expectError(await create(token, 'key-invalid', '{"title":'), 400, 'INVALID_REQUEST');
  assert.equal(await count('share_link'), 0);
  assert.equal(await count('idempotency_record'), 0);
});

test('제목 50자와 비밀번호 8자·64자 경계는 발급되고, 저장된 제목 길이는 DB char_length와 같다', async () => {
  const token = await login();
  for (const [key, body, codePoints] of [
    ['key-len-1', { title: ` ${'가'.repeat(50)} `, password: 'p'.repeat(8) }, 50],
    ['key-len-2', { title: '😀'.repeat(50), password: 'p'.repeat(64) }, 50],
    ['key-len-3', { title: '🇰🇷'.repeat(25), password: '😀'.repeat(8) }, 50],
  ]) {
    const result = await create(token, key, body);
    assert.equal(result.status, 201, JSON.stringify(result.body));
    const [row] = await db.query('SELECT char_length(title) AS n FROM share_link WHERE link_id = $1', [result.body.linkId]);
    assert.equal(Number(row.n), codePoints, key);
  }
});

test('#221 전에 짧은 비밀번호로 발급한 요청을 같은 키로 다시 보내면 400이고, 기존 링크·멱등 기록은 그대로이며 unlock은 된다', async () => {
  // #221 전 발급을 재현한다. 발급 API는 이제 짧은 비밀번호를 받지 않으므로, 같은 제목·비밀번호 설정 여부(멱등 지문)로
  // 발급한 뒤 저장된 검증값만 짧은 비밀번호의 것으로 바꾼다.
  const token = await login();
  const legacy = { title: '이전 짧은 비밀번호', password: 'a' };
  const issued = await create(token, 'key-legacy', { title: legacy.title, password: PASSWORD });
  assert.equal(issued.status, 201);
  await db.query('UPDATE share_link SET password_protection_reference = $2 WHERE link_id = $1',
    [issued.body.linkId, await hashLinkPassword(legacy.password)]);
  const before = await db.query('SELECT link_id, password_protection_reference, stopped_at FROM share_link');

  // 본문 검사가 멱등 처리보다 먼저라, 예전 응답(201·200)이 아니라 입력 오류다(검사 순서는 바꾸지 않음).
  const replay = await create(token, 'key-legacy', legacy);
  expectError(replay, 400, 'VALIDATION_FAILED');
  assert.deepEqual(replay.body.details.violations, [{ field: 'password', reason: 'minLength' }]);
  assert.deepEqual(await db.query('SELECT link_id, password_protection_reference, stopped_at FROM share_link'), before);
  assert.equal(await count('idempotency_record'), 1);

  // 수신자 unlock은 길이를 검사하지 않으므로 기존 링크는 짧은 비밀번호로 계속 열린다.
  const linkToken = issued.body.url.split('/s/')[1];
  const unlock = await fetch(`${url}/v1/public/links/${encodeURIComponent(linkToken)}/unlock`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: legacy.password }),
  });
  assert.equal(unlock.status, 200);
});

test('로그에 비밀번호 원문과 링크 토큰을 남기지 않는다', async () => {
  const token = await login();
  await create(token, 'key-log', { title: '로그 확인', password: PASSWORD });
  await create(token, 'key-log', { title: '로그 확인', password: `${PASSWORD}-other` });
  const [{ link_token_reference: linkToken }] = await db.query('SELECT link_token_reference FROM share_link');
  const text = logs.join('\n');
  assert.equal(text.includes(PASSWORD), false);
  assert.equal(text.includes(linkToken), false);
});

test('회원 UUID가 아니거나 회원 행이 없는 토큰은 401 AUTH_INVALID이며 링크·기록을 만들지 않는다', async () => {
  const sign = (sub) => new SignJWT({ sub, iss: 'catchu-api', aud: 'catchu-member-api',
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 60 })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).sign(Buffer.from(ENV.AUTH_JWT_SECRET, 'hex'));
  // #104 이전 개발 토큰(문자열 회원 ID)
  expectError(await create(await sign('legacy-dev-member'), 'key-legacy', { title: '옛 토큰' }), 401, 'AUTH_INVALID');
  // 형식은 맞지만 회원 행이 없는 UUID
  expectError(await create(await sign('00000000-0000-4000-8000-000000000999'), 'key-missing', { title: '없는 회원' }), 401, 'AUTH_INVALID');
  assert.equal(await count('share_link'), 0);
  assert.equal(await count('idempotency_record'), 0);
});

test('같은 키 재요청에서 기록과 링크가 어긋나면 409가 아니라 500이다', async () => {
  const token = await login();
  await create(token, 'key-broken', { title: '어긋난 기록', password: PASSWORD });
  // 비밀번호 있는 요청으로 만든 기록인데 링크의 검증값이 사라진 상태(서버 자료 오류)
  await db.query('UPDATE share_link SET password_protection_reference = NULL');
  expectError(await create(token, 'key-broken', { title: '어긋난 기록', password: PASSWORD }), 500, 'INTERNAL_ERROR');
  assert.equal(await count('share_link'), 1);
});

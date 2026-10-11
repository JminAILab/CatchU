require('reflect-metadata');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { randomBytes } = crypto;
const { after, before, beforeEach, test } = require('node:test');
const { NestFactory } = require('@nestjs/core');
const { SignJWT } = require('jose');
const { AppModule } = require('../../dist/app.module');
const { configureApp } = require('../../dist/app.setup');
const { hashLinkPassword } = require('../../dist/share-links/link-password');
const { shareCreateFingerprint, isSameShareCreate } = require('../../dist/share-links/share-create-fingerprint');
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
  return {
    status: response.status, cacheControl: response.headers.get('cache-control'), retryAfter: response.headers.get('retry-after'),
    body: await response.json(),
  };
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
  // 발급 시각은 Node 시계로 정한다. DB 시계가 조금 늦어도 중단 시각 ≥ 발급 시각 제약을 지키게 한다.
  await db.query("UPDATE share_link SET stopped_at = GREATEST(now(), issued_at) WHERE title = '링크 1'");
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
  // 본문 사례마다 다른 회원으로 보낸다. 회원별 발급 빈도(1분 10회, #219)가 입력 검사보다 먼저라, 한 회원으로 보내면 11번째부터 400이 아니라 429다.
  let member = 0;
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
    const result = await create(await login(`share-link-invalid-${member += 1}`), 'key-invalid', body);
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

for (const scenario of [
  { name: '짧은 비밀번호', title: '이전 짧은 비밀번호', password: 'a', field: 'password', reason: 'minLength' },
  { name: '긴 제목', title: '가'.repeat(51), password: PASSWORD, field: 'title', reason: 'maxLength' },
  { name: '긴 비밀번호', title: '이전 긴 비밀번호', password: 'p'.repeat(65), field: 'password', reason: 'maxLength' },
]) {
  test(`#221 이전 ${scenario.name} 요청 재전송은 400이며 기존 링크·멱등 기록과 unlock은 유지된다`, async () => {
    // 이전 판본을 실행한 결과가 아니라, 과거 허용 범위의 저장 자료를 구성한 HTTP·DB 검사다.
    const token = await login();
    const legacy = { title: scenario.title, password: scenario.password };
    const issued = await create(token, 'key-legacy', { title: '이전 발급 준비', password: PASSWORD });
    assert.equal(issued.status, 201);
    const verifier = await hashLinkPassword(legacy.password);
    const fingerprint = shareCreateFingerprint(legacy);
    await db.query('UPDATE share_link SET title = $2, password_protection_reference = $3 WHERE link_id = $1',
      [issued.body.linkId, legacy.title, verifier]);
    await db.query('UPDATE idempotency_record SET request_fingerprint = $2 WHERE link_id = $1',
      [issued.body.linkId, fingerprint]);
    const linksBefore = await db.query('SELECT * FROM share_link ORDER BY link_id');
    const recordsBefore = await db.query('SELECT * FROM idempotency_record ORDER BY idempotency_id');
    assert.equal(await isSameShareCreate(legacy, {
      requestFingerprint: recordsBefore[0].request_fingerprint,
      passwordVerifier: linksBefore[0].password_protection_reference,
    }), true);

    // 입력 검사가 멱등 처리보다 먼저라 같은 요청이어도 기존 응답 대신 입력 오류다.
    const replay = await create(token, 'key-legacy', legacy);
    expectError(replay, 400, 'VALIDATION_FAILED');
    assert.deepEqual(replay.body.details.violations, [{ field: scenario.field, reason: scenario.reason }]);
    assert.deepEqual(await db.query('SELECT * FROM share_link ORDER BY link_id'), linksBefore);
    assert.deepEqual(await db.query('SELECT * FROM idempotency_record ORDER BY idempotency_id'), recordsBefore);

    const linkToken = issued.body.url.split('/s/')[1];
    const unlock = await fetch(`${url}/v1/public/links/${encodeURIComponent(linkToken)}/unlock`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: legacy.password }),
    });
    assert.equal(unlock.status, 200);
  });
}

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

/** 링크 비밀번호 해시(scrypt) 호출 수를 센다. 빌드된 link-password.js는 호출할 때마다 crypto.scrypt를 찾는다. */
async function countHashes(t, work) {
  const original = crypto.scrypt;
  let calls = 0;
  crypto.scrypt = (...args) => { calls += 1; return original(...args); };
  t.after(() => { crypto.scrypt = original; });
  try {
    await work();
  } finally {
    crypto.scrypt = original;
  }
  return calls;
}

test('같은 회원의 발급 요청이 1분에 10번을 넘으면 해시 전에 429 RATE_LIMITED와 Retry-After로 거부하고 아무것도 저장하지 않는다(#219)', async (t) => {
  const token = await login();
  // 한도(5개)를 넘는 6~10번째도 한도 판정 전에 해시를 계산하므로 빈도로 센다.
  const hashedBefore = await countHashes(t, async () => {
    for (let i = 1; i <= 10; i++) {
      const result = await create(token, `rate-${i}`, { title: `빈도 ${i}`, password: PASSWORD });
      assert.equal(result.status, i <= 5 ? 201 : 409, JSON.stringify(result.body));
    }
  });
  assert.equal(hashedBefore, 10, '상한 안의 요청은 요청마다 해시를 계산한다');
  const links = await count('share_link');
  const records = await count('idempotency_record');

  let limited;
  let replayed;
  const hashedAfter = await countHashes(t, async () => {
    limited = await create(token, 'rate-11', { title: '빈도 11', password: PASSWORD });
    replayed = await create(token, 'rate-1', { title: '빈도 1', password: PASSWORD });
  });
  for (const result of [limited, replayed]) {
    expectError(result, 429, 'RATE_LIMITED');
    assert.equal(result.body.message, '요청이 많아 잠시 뒤에 다시 시도할 수 있습니다.');
    assert.equal(result.body.details, undefined);
    const retryAfter = Number(result.retryAfter);
    assert.ok(Number.isInteger(retryAfter) && retryAfter >= 1 && retryAfter <= 60, `Retry-After ${result.retryAfter}`);
  }
  assert.equal(hashedAfter, 0, '거부한 요청은 비밀번호 해시를 계산하지 않는다');
  assert.equal(await count('share_link'), links);
  assert.equal(await count('idempotency_record'), records, '거부한 요청은 멱등 기록을 남기지 않아 같은 키로 다시 보낼 수 있다');
  assert.equal(Number((await db.query("SELECT count(*) AS n FROM idempotency_record WHERE key = 'rate-11'"))[0].n), 0);

  // 다른 회원은 따로 센다.
  const other = await create(await login('share-link-member-b'), 'rate-other', { title: '다른 회원', password: PASSWORD });
  assert.equal(other.status, 201, JSON.stringify(other.body));
});

test('입력 오류(400)도 발급 빈도로 센다: 같은 회원이 잘못된 본문을 10번 보낸 뒤에는 맞는 요청도 해시 전에 429다(#219)', async (t) => {
  // 빈도 판정은 입력 검사보다 먼저다(계약 #235). 그래서 입력 오류도 한 번으로 센다.
  const token = await login();
  for (let i = 1; i <= 10; i++) {
    const result = await create(token, `invalid-rate-${i}`, { title: ' ' });
    expectError(result, 400, 'VALIDATION_FAILED');
  }
  let limited;
  const hashed = await countHashes(t, async () => {
    limited = await create(token, 'valid-after-invalid', { title: '입력 오류 뒤', password: PASSWORD });
  });
  expectError(limited, 429, 'RATE_LIMITED');
  assert.equal(hashed, 0, '빈도 상한으로 거부한 요청은 해시를 계산하지 않는다');
  assert.equal(await count('share_link'), 0);
  assert.equal(await count('idempotency_record'), 0);
});

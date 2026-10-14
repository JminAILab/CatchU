require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { after, before, beforeEach, test } = require('node:test');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../../dist/app.module');
const { configureApp } = require('../../dist/app.setup');
const { LinkAccessService } = require('../../dist/share-links/link-access.service');
const { UNLOCK_CONTROLS } = require('../../dist/share-links/unlock-policy');
const { generateLinkToken } = require('../../dist/share-links/link-token');
const { hashLinkPassword } = require('../../dist/share-links/link-password');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');

// #150: 비밀번호 확인(unlock)과 수신 조회용 공통 접근 판정을 실제 앱·테스트 DB로 검증한다.
// 링크는 회원 발급 API로 만들고, 중단·만료는 DB 행을 옮겨 만든다. 비밀번호는 합성 값만 쓴다.

const HOUR = 60 * 60 * 1000;
const PASSWORD = 'synthetic-recipient-password';
const ENV = {
  AUTH_JWT_SECRET: randomBytes(32).toString('hex'),
  AUTH_ACCESS_TOKEN_TTL_SECONDS: '900',
  DEV_LOGIN_ENABLED: 'true',
  NODE_ENV: 'test',
  SHARE_LINK_WEB_BASE_URL: 'https://catchu.example',
  LINK_GRANT_SECRET: randomBytes(32).toString('hex'),
};
const saved = {};
const logs = [];
let app;
let url;
let db;
let access;
let limiter;

before(async () => {
  for (const [key, value] of Object.entries(ENV)) { saved[key] = process.env[key]; process.env[key] = value; }
  const logger = Object.fromEntries(['log', 'error', 'warn', 'debug', 'verbose', 'fatal'].map((level) =>
    [level, (...args) => logs.push(args.map(String).join(' '))]));
  app = await configureApp(await NestFactory.create(AppModule, { logger, abortOnError: false }));
  await app.listen(0, '127.0.0.1');
  url = await app.getUrl();
  access = app.get(LinkAccessService, { strict: false });
  limiter = app.get(UNLOCK_CONTROLS, { strict: false }).addresses;
  db = await openTestDataSource();
});
after(async () => {
  await app?.close();
  await db?.destroy();
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
let ownerToken;
// 매 테스트 DB를 비우므로 회원 행도 사라진다. 개발 로그인도 매번 다시 한다.
beforeEach(async () => { await resetTestDatabase(db); ownerToken = undefined; });

let keySeq = 0;
async function owner() {
  const response = await fetch(`${url}/v1/auth/dev-login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId: 'unlock-owner' }),
  });
  ownerToken = (await response.json()).accessToken;
}
/** 발급 API로 링크를 만들고 수신자 토큰(URL 끝)을 돌려준다. */
async function issue(title, password) {
  if (!ownerToken) await owner();
  const response = await fetch(`${url}/v1/share-links`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json', 'Idempotency-Key': `u-${keySeq += 1}` },
    body: JSON.stringify(password === undefined ? { title } : { title, password }),
  });
  const link = await response.json();
  assert.equal(response.status, 201, JSON.stringify(link));
  return { ...link, token: link.url.split('/s/')[1] };
}
async function unlock(token, body, headers = {}) {
  const response = await fetch(`${url}/v1/public/links/${encodeURIComponent(token)}/unlock`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body), signal: AbortSignal.timeout(10000),
  });
  return {
    status: response.status, cacheControl: response.headers.get('cache-control'), retryAfter: response.headers.get('retry-after'),
    body: await response.json(),
  };
}
const expectError = (result, status, code) => {
  assert.equal(result.status, status, JSON.stringify(result.body));
  assert.equal(result.body.code, code);
  assert.equal(result.cacheControl, 'no-store');
};
const moveIssuedAt = (linkId, issuedAt) => db.query(
  "UPDATE share_link SET issued_at = $2, expires_at = $2::timestamptz + interval '720 hours' WHERE link_id = $1", [linkId, issuedAt]);
const rejectsCode = (promise, code) => assert.rejects(promise, (error) => { assert.equal(error.code, code); return true; });

test('맞는 비밀번호는 200 {grant}, 틀린 비밀번호는 401 LINK_PASSWORD_INVALID이며 회원 JWT 없이 처리한다', async () => {
  // 발급만 회원이 하고, 아래 unlock 요청에는 Authorization을 붙이지 않는다.
  const link = await issue('비밀번호 링크', PASSWORD);
  expectError(await unlock(link.token, { password: `${PASSWORD}-wrong` }), 401, 'LINK_PASSWORD_INVALID');
  expectError(await unlock(link.token, { password: ` ${PASSWORD}` }), 401, 'LINK_PASSWORD_INVALID');
  const ok = await unlock(link.token, { password: PASSWORD });
  assert.equal(ok.status, 200);
  assert.equal(ok.cacheControl, 'no-store');
  assert.deepEqual(Object.keys(ok.body), ['grant']);
  assert.equal(typeof ok.body.grant, 'string');
});

test('없는·형식이 틀린·중단·만료 링크는 비밀번호와 무관하게 같은 404이고 details가 없다', async () => {
  const stopped = await issue('중단', PASSWORD);
  const expired = await issue('만료', PASSWORD);
  await db.query('UPDATE share_link SET stopped_at = issued_at WHERE link_id = $1', [stopped.linkId]);
  await moveIssuedAt(expired.linkId, new Date(Date.now() - 721 * HOUR));
  const bodies = [];
  for (const token of [generateLinkToken(), 'not-a-token', stopped.token, expired.token]) {
    for (const password of [PASSWORD, 'wrong']) {
      const result = await unlock(token, { password });
      expectError(result, 404, 'LINK_UNAVAILABLE');
      assert.equal(result.body.details, undefined);
      bodies.push(JSON.stringify(result.body));
    }
  }
  assert.deepEqual([...new Set(bodies)], [JSON.stringify({ code: 'LINK_UNAVAILABLE', message: '이 링크는 열람할 수 없습니다.' })]);
});

test('비밀번호 없는 링크의 unlock은 400 INVALID_REQUEST, 본문 형식 오류는 400 VALIDATION_FAILED다', async () => {
  const open = await issue('비밀번호 없음');
  expectError(await unlock(open.token, { password: 'anything' }), 400, 'INVALID_REQUEST');
  const locked = await issue('비밀번호 있음', PASSWORD);
  for (const [body, violation] of [
    [{}, { field: 'password', reason: 'isString' }],
    [{ password: '' }, { field: 'password', reason: 'isNotEmpty' }],
    [{ password: 1 }, { field: 'password', reason: 'isString' }],
    [{ password: PASSWORD, remember: true }, { field: 'body', reason: 'whitelistValidation' }],
    [[], { field: 'body', reason: 'isObject' }],
  ]) {
    const result = await unlock(locked.token, body);
    expectError(result, 400, 'VALIDATION_FAILED');
    assert.deepEqual(result.body.details.violations, [violation]);
  }
});

test('unlock은 발급 길이 기준(8~64자, #223)을 적용하지 않고 저장된 검증값과 비교한다', async () => {
  // #221 이전에 발급된 짧은 비밀번호 링크를 흉내 낸다. 발급 API의 길이 검사와 무관하게 검증값을 DB에 직접 둔다.
  const link = await issue('짧은 비밀번호 링크', PASSWORD);
  for (const short of ['a', '1234567']) {
    await db.query('UPDATE share_link SET password_protection_reference = $2 WHERE link_id = $1',
      [link.linkId, await hashLinkPassword(short)]);
    const ok = await unlock(link.token, { password: short });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal((await access.assertReadable(link.token, ok.body.grant)).linkId, link.linkId);
  }
  // 길이를 벗어난 틀린 입력도 400이 아니라 비교 결과(401)다.
  for (const wrong of ['b', 'x'.repeat(65)]) expectError(await unlock(link.token, { password: wrong }), 401, 'LINK_PASSWORD_INVALID');
});

test('10번 틀리면 맞는 비밀번호도 429 LINK_UNLOCK_LIMITED이고, Retry-After는 올림한 남은 초이며 차단 중 요청으로 늘어나지 않는다', async () => {
  const link = await issue('차단 링크', PASSWORD);
  const other = await issue('같은 접속지의 다른 링크', PASSWORD);
  for (let i = 0; i < 10; i++) expectError(await unlock(link.token, { password: `wrong-${i}` }), 401, 'LINK_PASSWORD_INVALID');
  const first = await unlock(link.token, { password: PASSWORD });
  expectError(first, 429, 'LINK_UNLOCK_LIMITED');
  assert.deepEqual(Object.keys(first.body).sort(), ['code', 'message']);
  assert.match(first.retryAfter, /^\d+$/);
  assert.ok(Number(first.retryAfter) >= 899 && Number(first.retryAfter) <= 900, first.retryAfter);
  // 차단 중에도 본문 형식이 틀리면 400(시도로 세지 않음), 형식이 맞으면 429다.
  expectError(await unlock(link.token, { password: '' }), 400, 'VALIDATION_FAILED');
  expectError(await unlock(link.token, { pass: PASSWORD }), 400, 'VALIDATION_FAILED');
  // 차단 중에 틀린·맞는 요청을 더 보낸다.
  for (let i = 0; i < 5; i++) expectError(await unlock(link.token, { password: 'wrong-again' }), 429, 'LINK_UNLOCK_LIMITED');
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const later = await unlock(link.token, { password: PASSWORD });
  expectError(later, 429, 'LINK_UNLOCK_LIMITED');
  // 보조 확인: 1초 뒤 남은 초가 줄었다. 차단 종료 시각 불변의 주 근거는 가짜 시계 단위 테스트(unlock-limiter.test.cjs)다.
  assert.ok(Number(later.retryAfter) < Number(first.retryAfter), `${later.retryAfter} < ${first.retryAfter}`);
  // 링크·접속지 단위라 같은 접속지의 다른 링크는 막지 않는다.
  assert.equal((await unlock(other.token, { password: PASSWORD })).status, 200);
});

test('같은 링크·접속지의 동시 요청은 하나씩 검사하고, 실행 중 포함 3개를 넘는 요청은 검사 없이 429(Retry-After 1)다', async () => {
  const link = await issue('동시 시도 링크', PASSWORD);
  const results = await Promise.all(Array.from({ length: 15 }, (_, i) => unlock(link.token, { password: `wrong-${i}` })));
  const invalid = results.filter(({ status }) => status === 401);
  const busy = results.filter(({ status }) => status === 429);
  assert.equal(invalid.length + busy.length, 15);
  assert.ok(invalid.length <= 3, `검사한 요청은 실행 중 포함 동시 상한 3 이하(${invalid.length})`);
  for (const result of busy) {
    assert.equal(result.body.code, 'LINK_UNLOCK_LIMITED');
    assert.equal(result.retryAfter, '1');
  }
});

test('이미 차단된 링크·접속지는 대기열이 가득 차 있어도 실제 남은 초로 429다(Retry-After 1로 덮어쓰지 않음)', async () => {
  const link = await issue('차단 뒤 대기열', PASSWORD);
  const client = 'blocked-queue-client';
  const key = `${link.linkId}|${client}`;
  for (let i = 0; i < 10; i++) {
    limiter.check(key, new Date());
    limiter.recordFailure(key, new Date());
  }
  // 같은 키의 대기열을 실행 중 포함 3개로 채워 둔다.
  let open;
  const gate = new Promise((resolve) => { open = resolve; });
  const holders = Array.from({ length: 3 }, () => limiter.runExclusive(key, () => gate));
  try {
    await assert.rejects(access.unlock(link.token, { password: PASSWORD }, client), (error) => {
      assert.equal(error.code, 'LINK_UNLOCK_LIMITED');
      assert.ok(error.retryAfterSeconds >= 899, `차단 잔여 시간(${error.retryAfterSeconds})`);
      return true;
    });
  } finally {
    open();
    await Promise.all(holders);
  }
});

test('동시 요청을 몰아 보내도 비밀번호 검사는 한도(10번)를 넘지 않는다', async () => {
  const link = await issue('몰아 보내기 링크', PASSWORD);
  let checked = 0;
  let blocked = false;
  for (let wave = 0; wave < 10 && !blocked; wave++) {
    const results = await Promise.all(Array.from({ length: 3 }, () => unlock(link.token, { password: 'wrong' })));
    checked += results.filter(({ status }) => status === 401).length;
    blocked = results.some(({ status, retryAfter }) => status === 429 && Number(retryAfter) > 1);
  }
  assert.equal(checked, 10, '차단 전까지 정확히 10번만 검사한다');
  assert.equal(blocked, true);
  expectError(await unlock(link.token, { password: PASSWORD }), 429, 'LINK_UNLOCK_LIMITED');
});

test('비밀번호를 검사하는 사이 차단이 걸리면(방어적 재확인), 늦게 성공한 요청도 429이며 grant를 주지 않고 차단을 지우지 않는다', async () => {
  const link = await issue('늦은 성공 링크', PASSWORD);
  const client = 'late-success-client';
  const key = `${link.linkId}|${client}`;
  // 같은 키는 직렬화되므로 실제 요청으로는 끼어들 수 없다. 첫 차단 확인 직후(= 비밀번호 검사 직전)에 실패 10번을 직접 기록해 재확인을 검사한다.
  const original = limiter.check.bind(limiter);
  let injected = false;
  limiter.check = (target, now) => {
    const result = original(target, now);
    if (!injected && target === key) {
      injected = true;
      for (let i = 0; i < 10; i++) limiter.recordFailure(key, new Date());
    }
    return result;
  };
  const pending = access.unlock(link.token, { password: PASSWORD }, client);
  await assert.rejects(pending.finally(() => { limiter.check = original; }), (error) => {
    assert.equal(error.code, 'LINK_UNLOCK_LIMITED');
    assert.ok(error.retryAfterSeconds >= 899);
    return true;
  });
  assert.equal(injected, true);
  assert.equal(limiter.check(key, new Date()).blocked, true, '차단이 남아 있다');
  await assert.rejects(access.unlock(link.token, { password: PASSWORD }, client), (error) => error.code === 'LINK_UNLOCK_LIMITED');
});

test('수신 조회 판정: 비밀번호 링크는 이 링크의 grant가 있어야 하고, grant로 중단·만료를 우회하지 못한다', async () => {
  const link = await issue('보호 링크', PASSWORD);
  const otherLink = await issue('다른 보호 링크', PASSWORD);
  const open = await issue('공개 링크');
  const grant = (await unlock(link.token, { password: PASSWORD })).body.grant;
  const otherGrant = (await unlock(otherLink.token, { password: PASSWORD })).body.grant;

  assert.equal((await access.assertReadable(link.token, grant)).linkId, link.linkId);
  assert.equal((await access.assertReadable(open.token, undefined)).linkId, open.linkId, '비밀번호 없는 링크는 grant 없이 조회');
  await rejectsCode(access.assertReadable(link.token, undefined), 'LINK_PASSWORD_REQUIRED');
  await rejectsCode(access.assertReadable(link.token, otherGrant), 'LINK_PASSWORD_REQUIRED');
  await rejectsCode(access.assertReadable(link.token, `${grant.slice(0, -2)}AA`), 'LINK_PASSWORD_REQUIRED');

  // 발급 시각은 Node 시계로 정한다. DB 시계가 조금 늦어도 중단 시각 ≥ 발급 시각 제약을 지키게 한다.
  await db.query('UPDATE share_link SET stopped_at = GREATEST(now(), issued_at) WHERE link_id = $1', [link.linkId]);
  await rejectsCode(access.assertReadable(link.token, grant), 'LINK_UNAVAILABLE');
  await moveIssuedAt(otherLink.linkId, new Date(Date.now() - 721 * HOUR));
  await rejectsCode(access.assertReadable(otherLink.token, otherGrant), 'LINK_UNAVAILABLE');
});

test('로그에 비밀번호·grant·링크 토큰을 남기지 않는다', async () => {
  const link = await issue('로그 링크', PASSWORD);
  await unlock(link.token, { password: 'wrong-password-for-log' });
  const grant = (await unlock(link.token, { password: PASSWORD })).body.grant;
  const text = logs.join('\n');
  for (const secret of [PASSWORD, 'wrong-password-for-log', grant, link.token]) assert.equal(text.includes(secret), false);
});

test('#222 실제 HTTP·DB: 비밀번호 실패·차단을 한 줄씩 기록하고 민감정보는 제외한다', async () => {
  const link = await issue('보안 사건 검증', PASSWORD);
  const startIndex = logs.length;
  const wrong = 'synthetic-wrong-password-222';
  for (let i = 0; i < 10; i++) expectError(await unlock(link.token, { password: wrong }), 401, 'LINK_PASSWORD_INVALID');
  const limited = await unlock(link.token, { password: PASSWORD });
  expectError(limited, 429, 'LINK_UNLOCK_LIMITED');
  assert.ok(Number(limited.retryAfter) > 0);
  const captured = logs.slice(startIndex);
  const events = captured.filter(line => line.endsWith(' SecurityEvent'));
  assert.equal(events.length, 11);
  assert.equal(events.filter(line => line.startsWith('LINK_PASSWORD_INVALID ')).length, 10);
  assert.equal(events.filter(line => line.startsWith('LINK_UNLOCK_LIMITED ')).length, 1);
  const ids = [];
  for (const line of events) {
    const match = /^(?:LINK_PASSWORD_INVALID|LINK_UNLOCK_LIMITED) POST \/v1\/public\/links\/:token\/unlock requestId=([0-9a-f-]{36}) at=\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z SecurityEvent$/.exec(line);
    assert.ok(match, '등록 경로와 허용 필드만 기록한다');
    ids.push(match[1]);
  }
  assert.equal(new Set(ids).size, 11);
  for (const secret of [link.token, link.url, PASSWORD, wrong, ownerToken, ...Object.values(ENV).filter(value => value.length === 64)]) {
    assert.equal(captured.join('\n').includes(secret), false, '합성 비밀값은 로그에 남지 않는다');
  }
});

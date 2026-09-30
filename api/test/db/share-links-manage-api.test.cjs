require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { after, before, beforeEach, test } = require('node:test');
const { NestFactory } = require('@nestjs/core');
const { SignJWT } = require('jose');
const { AppModule } = require('../../dist/app.module');
const { configureApp } = require('../../dist/app.setup');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');

// #148: GET /v1/share-links, PUT /v1/share-links/{linkId}/stop를 실제 앱·테스트 DB·개발 로그인 회원으로 검증한다.
// 중단 응답은 #148 9/29 팀장 결정 표를 따른다. 시각 조건은 DB 행의 발행·만료 시각을 옮겨 만든다.

const HOUR = 60 * 60 * 1000;
const ENV = {
  AUTH_JWT_SECRET: randomBytes(32).toString('hex'),
  AUTH_ACCESS_TOKEN_TTL_SECONDS: '300',
  DEV_LOGIN_ENABLED: 'true',
  NODE_ENV: 'test',
  SHARE_LINK_WEB_BASE_URL: 'https://catchu.example',
};
const saved = {};
let app;
let url;
let db;

before(async () => {
  for (const [key, value] of Object.entries(ENV)) { saved[key] = process.env[key]; process.env[key] = value; }
  app = await configureApp(await NestFactory.create(AppModule, { logger: false, abortOnError: false }));
  await app.listen(0, '127.0.0.1');
  url = await app.getUrl();
  db = await openTestDataSource({ poolSize: 10 });
});
after(async () => {
  await app?.close();
  await db?.destroy();
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
beforeEach(() => resetTestDatabase(db));

async function login(devIdentity = 'share-link-owner-a') {
  const response = await fetch(`${url}/v1/auth/dev-login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId: devIdentity }),
  });
  assert.equal(response.status, 200);
  return (await response.json()).accessToken;
}
async function call(token, method, path, { body, rawBody, headers = {} } = {}) {
  const hasBody = body !== undefined || rawBody !== undefined;
  const response = await fetch(`${url}/v1${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(hasBody ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
    signal: AbortSignal.timeout(10000),
  });
  return { status: response.status, cacheControl: response.headers.get('cache-control'), body: await response.json() };
}
let keySeq = 0;
async function issue(token, title) {
  const result = await call(token, 'POST', '/share-links', { body: { title }, headers: { 'Idempotency-Key': `k-${keySeq += 1}` } });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return result.body;
}
const list = (token, query = '') => call(token, 'GET', `/share-links${query}`);
const stop = (token, linkId, options) => call(token, 'PUT', `/share-links/${linkId}/stop`, options);
const expectError = (result, status, code, violations) => {
  assert.equal(result.status, status, JSON.stringify(result.body));
  assert.equal(result.body.code, code);
  assert.equal(result.cacheControl, 'no-store');
  if (violations) assert.deepEqual(result.body.details.violations, violations);
};
/** 발행 시각을 옮긴다. 만료 = 발행 + 720시간 DB 제약을 함께 맞춘다. */
const moveIssuedAt = (linkId, issuedAt) => db.query(
  "UPDATE share_link SET issued_at = $2, expires_at = $2::timestamptz + interval '720 hours' WHERE link_id = $1", [linkId, issuedAt]);
const row = async (linkId) => (await db.query('SELECT stopped_at, expires_at FROM share_link WHERE link_id = $1', [linkId]))[0];

test('링크가 없으면 정상 빈 목록(200, items [], nextCursor null)이다', async () => {
  const result = await list(await login());
  assert.equal(result.status, 200);
  assert.equal(result.cacheControl, 'no-store');
  assert.deepEqual(result.body, { items: [], page: { nextCursor: null } });
});

test('본인 링크만 발행 시각 최신순으로 돌려주고, 항목은 계약의 ShareLink 모양이다', async () => {
  const a = await login('owner-a');
  const b = await login('owner-b');
  const first = await issue(a, '먼저');
  const second = await issue(a, '나중');
  await issue(b, '다른 회원');
  await moveIssuedAt(first.linkId, new Date(Date.now() - 2 * HOUR));
  const result = await list(a);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.items.map(({ title }) => title), ['나중', '먼저']);
  assert.deepEqual(Object.keys(result.body.items[0]).sort(),
    ['createdAt', 'expiresAt', 'linkId', 'passwordRequired', 'state', 'stoppedAt', 'title', 'url']);
  assert.equal(result.body.items[0].url, second.url);
  assert.equal((await list(b)).body.items.length, 1);
});

test('목록 상태는 응답 시각·중단 시각으로 구한다(ACTIVE·STOPPED·EXPIRED)', async () => {
  const token = await login();
  const active = await issue(token, '유효');
  const stopped = await issue(token, '중단');
  const expired = await issue(token, '만료');
  await moveIssuedAt(expired.linkId, new Date(Date.now() - 721 * HOUR));
  await stop(token, stopped.linkId);
  const states = Object.fromEntries((await list(token)).body.items.map(({ linkId, state }) => [linkId, state]));
  assert.deepEqual(states, { [active.linkId]: 'ACTIVE', [stopped.linkId]: 'STOPPED', [expired.linkId]: 'EXPIRED' });
});

test('limit·cursor로 나눠 읽으면 빠짐·중복 없이 끝나고, 같은 발행 시각은 linkId 역순이다', async () => {
  const token = await login();
  const ids = [];
  for (let i = 0; i < 5; i++) {
    const link = await issue(token, `링크 ${i}`);
    ids.push(link.linkId);
    if (i < 4) await stop(token, link.linkId); // 유효 링크 5개 한도를 피해 7개까지 만든다
  }
  for (let i = 5; i < 7; i++) ids.push((await issue(token, `링크 ${i}`)).linkId);
  // 세 링크를 같은 발행 시각으로 맞춰 페이지 경계에서 동시 정렬을 확인한다.
  const same = new Date(Date.now() - HOUR);
  for (const id of ids.slice(1, 4)) await moveIssuedAt(id, same);

  const seen = [];
  let cursor = null;
  let pages = 0;
  do {
    const result = await list(token, `?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.ok(result.body.items.length <= 2);
    seen.push(...result.body.items);
    cursor = result.body.page.nextCursor;
    pages += 1;
  } while (cursor && pages < 10);
  assert.equal(pages, 4);
  assert.equal(new Set(seen.map(({ linkId }) => linkId)).size, 7);
  const expected = [...seen].sort((x, y) => Date.parse(y.createdAt) - Date.parse(x.createdAt) || (y.linkId > x.linkId ? 1 : -1));
  assert.deepEqual(seen.map(({ linkId }) => linkId), expected.map(({ linkId }) => linkId));
  const tied = seen.filter(({ createdAt }) => Date.parse(createdAt) === same.getTime()).map(({ linkId }) => linkId);
  assert.deepEqual(tied, [...ids.slice(1, 4)].sort().reverse());
});

test('목록 쿼리 오류는 400 VALIDATION_FAILED이며 입력값을 담지 않는다', async () => {
  const token = await login();
  await issue(token, '하나');
  const other = await login('owner-other');
  await issue(other, '둘');
  await issue(other, '셋');
  const otherCursor = (await list(other, '?limit=1')).body.page.nextCursor;
  for (const [query, violation] of [
    ['?limit=0', { field: 'limit', reason: 'min' }],
    ['?limit=101', { field: 'limit', reason: 'max' }],
    ['?limit=abc', { field: 'limit', reason: 'isInt' }],
    ['?limit=1.5', { field: 'limit', reason: 'isInt' }],
    ['?limit=1&limit=2', { field: 'limit', reason: 'isInt' }],
    ['?sort=title', { field: 'query', reason: 'whitelistValidation' }],
    ['?cursor=not-a-cursor', { field: 'cursor', reason: 'isCursor' }],
    [`?cursor=${encodeURIComponent(otherCursor)}`, { field: 'cursor', reason: 'isCursor' }],
  ]) {
    const result = await list(token, query);
    expectError(result, 400, 'VALIDATION_FAILED', [violation]);
    assert.equal(JSON.stringify(result.body).includes('abc'), false);
  }
  assert.equal((await list(token, '?limit=100')).status, 200);
});

test('유효 링크를 중단하면 200·STOPPED이고, 반복 중단은 처음 stoppedAt을 유지하며 자원을 만들지 않는다', async () => {
  const token = await login();
  const link = await issue(token, '중단할 링크');
  const first = await stop(token, link.linkId);
  assert.equal(first.status, 200);
  assert.equal(first.cacheControl, 'no-store');
  assert.equal(first.body.state, 'STOPPED');
  assert.notEqual(first.body.stoppedAt, null);
  assert.deepEqual({ ...first.body, state: undefined, stoppedAt: undefined }, { ...link, state: undefined, stoppedAt: undefined });
  const counts = await db.query('SELECT (SELECT count(*) FROM share_link) AS links, (SELECT count(*) FROM idempotency_record) AS records');
  await new Promise((resolve) => setTimeout(resolve, 20));
  const again = await stop(token, link.linkId);
  assert.equal(again.status, 200);
  assert.equal(again.body.state, 'STOPPED');
  assert.equal(again.body.stoppedAt, first.body.stoppedAt);
  assert.deepEqual(await db.query('SELECT (SELECT count(*) FROM share_link) AS links, (SELECT count(*) FROM idempotency_record) AS records'), counts);
});

test('만료 링크를 중단하면 중단 처리 없이 200·EXPIRED이고, 중단한 링크는 만료 시각이 지나도 STOPPED다', async () => {
  const token = await login();
  const expired = await issue(token, '만료 링크');
  await moveIssuedAt(expired.linkId, new Date(Date.now() - 721 * HOUR));
  const result = await stop(token, expired.linkId);
  assert.equal(result.status, 200);
  assert.equal(result.body.state, 'EXPIRED');
  assert.equal(result.body.stoppedAt, null);
  assert.equal((await row(expired.linkId)).stopped_at, null);

  const stopped = await issue(token, '중단 뒤 만료');
  assert.equal((await stop(token, stopped.linkId)).body.state, 'STOPPED');
  // 중단한 채로 만료 시각을 지나게 옮긴다(중단 시각 ≥ 발행 시각 제약 유지).
  await db.query(`UPDATE share_link SET issued_at = issued_at - interval '800 hours', expires_at = expires_at - interval '800 hours',
    stopped_at = issued_at - interval '799 hours' WHERE link_id = $1`, [stopped.linkId]);
  const stoppedAt = (await row(stopped.linkId)).stopped_at;
  const kept = await stop(token, stopped.linkId);
  assert.equal(kept.body.state, 'STOPPED');
  assert.equal(kept.body.stoppedAt, stoppedAt.toISOString(), '처음 중단 시각을 바꾸지 않는다');
  const listed = (await list(token)).body.items.find(({ linkId }) => linkId === stopped.linkId);
  assert.equal(listed.state, 'STOPPED');
});

test('타인 링크·없는 링크·UUID가 아닌 ID는 같은 404 RESOURCE_UNAVAILABLE이고 아무것도 바꾸지 않는다', async () => {
  const owner = await login('owner-a');
  const other = await login('owner-b');
  const link = await issue(owner, '남의 링크');
  const responses = [];
  for (const id of [link.linkId, randomUUID(), 'not-a-uuid', link.linkId.toUpperCase()]) {
    const result = await stop(other, id);
    expectError(result, 404, 'RESOURCE_UNAVAILABLE');
    responses.push(result.body);
  }
  assert.equal(new Set(responses.map((body) => JSON.stringify(body))).size, 1);
  assert.equal((await row(link.linkId)).stopped_at, null);
});

test('중단 요청에 본문이나 쿼리가 붙으면 400이고 링크를 바꾸지 않는다', async () => {
  const token = await login();
  const link = await issue(token, '본문 거절');
  expectError(await stop(token, link.linkId, { body: {} }), 400, 'VALIDATION_FAILED', [{ field: 'body', reason: 'isEmpty' }]);
  expectError(await stop(token, link.linkId, { body: { stoppedAt: null } }), 400, 'VALIDATION_FAILED', [{ field: 'body', reason: 'isEmpty' }]);
  // 객체가 아닌 JSON 본문도 거부한다. 원시값은 JSON 해석 단계(strict)가 먼저 400 INVALID_REQUEST로 거절한다.
  for (const [rawBody, code, headers] of [
    ['[]', 'VALIDATION_FAILED'], ['[1]', 'VALIDATION_FAILED'], ['"stop"', 'INVALID_REQUEST'], ['0', 'INVALID_REQUEST'],
    ['null', 'INVALID_REQUEST'], ['stop', 'VALIDATION_FAILED', { 'Content-Type': 'text/plain' }],
  ]) {
    const result = await call(token, 'PUT', `/share-links/${link.linkId}/stop`, { rawBody, headers });
    assert.equal(result.status, 400, `${rawBody} → ${JSON.stringify(result.body)}`);
    assert.equal(result.body.code, code, rawBody);
  }
  expectError(await call(token, 'PUT', `/share-links/${link.linkId}/stop?force=true`), 400, 'VALIDATION_FAILED',
    [{ field: 'query', reason: 'whitelistValidation' }]);
  assert.equal((await row(link.linkId)).stopped_at, null);
  assert.equal((await stop(token, link.linkId)).status, 200);
});

test('같은 링크의 동시 중단 5건은 모두 200이고 stoppedAt이 하나로 같다', async () => {
  const token = await login();
  const link = await issue(token, '동시 중단');
  const results = await Promise.all(Array.from({ length: 5 }, () => stop(token, link.linkId)));
  assert.deepEqual(results.map(({ status }) => status), [200, 200, 200, 200, 200]);
  assert.equal(new Set(results.map(({ body }) => body.stoppedAt)).size, 1);
  assert.equal(Date.parse((await row(link.linkId)).stopped_at.toISOString()), Date.parse(results[0].body.stoppedAt));
});

test('인증이 없거나 회원 UUID가 아니거나 회원 행이 없는 토큰은 목록·중단 모두 401이다', async () => {
  const sign = (sub) => new SignJWT({ sub, iss: 'catchu-api', aud: 'catchu-member-api',
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 60 })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).sign(Buffer.from(ENV.AUTH_JWT_SECRET, 'hex'));
  expectError(await list(undefined), 401, 'AUTH_REQUIRED');
  expectError(await stop(undefined, randomUUID()), 401, 'AUTH_REQUIRED');
  for (const sub of ['legacy-dev-member', '00000000-0000-4000-8000-000000000999']) {
    const token = await sign(sub);
    expectError(await list(token), 401, 'AUTH_INVALID');
    expectError(await stop(token, randomUUID()), 401, 'AUTH_INVALID');
  }
});

test('목록 조회 중 DB 오류는 빈 목록이 아니라 500으로 전달된다', async () => {
  const token = await login();
  await issue(token, '장애 중에도 있는 링크');
  // 테이블 이름을 잠시 바꿔 조회 쿼리만 실패시킨다(회원 확인은 통과).
  await db.query('ALTER TABLE share_link RENAME TO share_link_outage');
  try {
    expectError(await list(token), 500, 'INTERNAL_ERROR');
  } finally {
    await db.query('ALTER TABLE share_link_outage RENAME TO share_link');
  }
  assert.equal((await list(token)).body.items.length, 1);
});

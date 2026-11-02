// U4 제출 1 — 텍스트 자료 API(GET/POST /v1/text-materials, GET/PUT/DELETE /v1/text-materials/{id}) 시험.
//
// 먼저 정한 시나리오·기대 결과·실패 조건(U4 기능 명세 「주요 시나리오와 확인」 S3, team.md Testing Posture).
// 세부 시험 코드는 구현 뒤 쓴다.
//
// S3 텍스트 자료 CRUD와 남의 자료 접근 (US3.1, BR3.1~BR3.4, BR2.1)
//   - 기대: 본인이 자료를 만들면 201 TextMaterial { textMaterialId, title, body, createdAt, updatedAt }.
//           제목은 앞뒤 공백을 지워 저장하고 본문은 그대로 저장한다. 제목 100자·본문 20,000자(코드 포인트)는 저장된다.
//           목록은 본인 자료만 cursor로 끝까지 읽을 수 있고 항목은 { textMaterialId, title, updatedAt }이다(본문 없음).
//           수정은 덮어쓰기이며 마지막 저장이 남는다. 삭제는 204이고 다시 읽으면 404다.
//   - 실패 조건(거부해야 함): 제목 0자(공백만)·101자, 본문 공백만·20,001자는 400 VALIDATION_FAILED이고 저장하지 않는다.
//           정의 밖 필드·잘못된 cursor·limit은 400이다. 회원 두 명 사이에서 남의 자료 읽기·수정·삭제와 없는 ID·UUID 형식이
//           아닌 ID는 모두 같은 404 RESOURCE_UNAVAILABLE이며 남의 자료는 바뀌지 않는다. 인증 없으면 401.
//   - 실패로 보는 것: 남의 자료가 목록·상세에 노출됨, 거부된 요청이 행을 바꿈, 로그에 본문이 남음.
// 삭제 뒤 발행 사본 유지(S10)는 발행이 생기는 제출 2에서 함께 확인한다.
//
// 실제 AppModule(전역 인증 Guard·오류 형식·no-store)과 테스트 DB를 쓴다. 회원은 개발 로그인으로 만든 합성 회원이다.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { before, after, beforeEach, test } = require('node:test');
const { NestFactory } = require('@nestjs/core');
const { decodeJwt } = require('jose');
const { AppModule } = require('../../dist/app.module');
const { configureApp } = require('../../dist/app.setup');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');

// 로그 비노출 확인용 합성 문자열. 실제 사용자 자료가 아니다.
const SECRET_TEXT = '[합성-자료-본문-노출확인-91c2]';
let app, db, url;
const logs = [];
const settings = { AUTH_JWT_SECRET: randomBytes(32).toString('hex'), AUTH_ACCESS_TOKEN_TTL_SECONDS: '900',
  DEV_LOGIN_ENABLED: 'true', NODE_ENV: 'test', LINK_GRANT_SECRET: randomBytes(32).toString('hex') };
const saved = {};

before(async () => {
  for (const [key, value] of Object.entries(settings)) { saved[key] = process.env[key]; process.env[key] = value; }
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
beforeEach(async () => { await resetTestDatabase(db); logs.length = 0; });

async function call(token, method, path, body, rawBody) {
  const response = await fetch(`${url}/v1${path}`, { method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined || rawBody !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)), signal: AbortSignal.timeout(10000) });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const text = await response.text();
  return { status: response.status, body: text === '' ? null : JSON.parse(text) };
}
async function login(identity) {
  const response = await call(undefined, 'POST', '/auth/dev-login', { memberId: identity });
  assert.equal(response.status, 200);
  return { token: response.body.accessToken, memberId: decodeJwt(response.body.accessToken).sub };
}
const create = (token, body) => call(token, 'POST', '/text-materials', body);
const read = (token, id) => call(token, 'GET', `/text-materials/${id}`);
const update = (token, id, body) => call(token, 'PUT', `/text-materials/${id}`, body);
const remove = (token, id) => call(token, 'DELETE', `/text-materials/${id}`);
const list = (token, query = '') => call(token, 'GET', `/text-materials${query}`);

function rejected(response, status, code) {
  assert.equal(response.status, status, JSON.stringify(response.body));
  assert.equal(response.body.code, code);
  if (status === 404) assert.deepEqual(response.body, { code: 'RESOURCE_UNAVAILABLE', message: '현재 열람할 수 없는 자료입니다.' });
}
const rows = () => db.query('SELECT text_material_id, member_id, title, body, updated_at FROM text_material ORDER BY text_material_id');

test('S3: 본인 자료를 만들고 읽고 고치고 지우며, 제목은 앞뒤 공백을 지우고 본문은 그대로 저장한다', async () => {
  const a = await login('materials-owner-a');
  const created = await create(a.token, { title: '  포트폴리오 소개  ', body: '  첫 줄\n\n  둘째 줄 https://github.com/o/r  ' });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.deepEqual(Object.keys(created.body).sort(), ['body', 'createdAt', 'textMaterialId', 'title', 'updatedAt']);
  assert.equal(created.body.title, '포트폴리오 소개');
  assert.equal(created.body.body, '  첫 줄\n\n  둘째 줄 https://github.com/o/r  ');
  const id = created.body.textMaterialId;
  assert.match(id, /^[0-9a-f-]{36}$/);
  assert.deepEqual((await read(a.token, id)).body, created.body);
  assert.equal((await rows())[0].member_id, a.memberId);

  const first = await update(a.token, id, { title: '첫 탭 제목', body: '첫 탭 본문' });
  const second = await update(a.token, id, { title: '둘째 탭 제목', body: '둘째 탭 본문' });
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(second.body.createdAt, created.body.createdAt);
  assert.ok(Date.parse(second.body.updatedAt) >= Date.parse(first.body.updatedAt));
  assert.deepEqual((await read(a.token, id)).body, second.body);

  assert.deepEqual(await remove(a.token, id), { status: 204, body: null });
  rejected(await read(a.token, id), 404, 'RESOURCE_UNAVAILABLE');
  rejected(await remove(a.token, id), 404, 'RESOURCE_UNAVAILABLE');
  assert.equal((await rows()).length, 0);
});

test('S3 경계: 제목 100자·본문 20,000자는 저장되고, 하나 넘거나 비면 400으로 저장하지 않는다', async () => {
  const a = await login('materials-owner-a');
  const title = '가'.repeat(98) + '😀😀';
  const body = 'b'.repeat(19998) + '😀😀';
  const ok = await create(a.token, { title: `  ${title}  `, body });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.title, title);
  const id = ok.body.textMaterialId;
  const cases = [
    [{ title: title + 'a', body: 'x' }, [{ field: 'title', reason: 'maxLength' }]],
    [{ title: ' \t ', body: 'x' }, [{ field: 'title', reason: 'isNotEmpty' }]],
    [{ title: 't', body: body + 'b' }, [{ field: 'body', reason: 'maxLength' }]],
    [{ title: 't', body: ' \n ' }, [{ field: 'body', reason: 'isNotEmpty' }]],
    [{ title: 't' }, [{ field: 'body', reason: 'isString' }]],
    [{ title: 't', body: 'x', extra: 1 }, [{ field: 'body', reason: 'whitelistValidation' }]],
    [{ title: 1, body: 'a\u0000' }, [{ field: 'title', reason: 'isString' }, { field: 'body', reason: 'noNul' }]],
  ];
  for (const [input, violations] of cases) {
    const createdResponse = await create(a.token, input);
    rejected(createdResponse, 400, 'VALIDATION_FAILED');
    assert.deepEqual(createdResponse.body.details, { violations }, JSON.stringify(input).slice(0, 80));
    rejected(await update(a.token, id, input), 400, 'VALIDATION_FAILED');
  }
  rejected(await call(a.token, 'POST', '/text-materials', undefined, '[]'), 400, 'VALIDATION_FAILED');
  const stored = await rows();
  assert.equal(stored.length, 1);
  assert.equal(stored[0].title, title);
  assert.equal(stored[0].body, body);
});

test('S3 격리: 회원 두 명은 서로의 자료를 목록·상세·수정·삭제할 수 없고 모두 같은 404다', async () => {
  const a = await login('materials-owner-a');
  const b = await login('materials-owner-b');
  const own = (await create(a.token, { title: 'A의 자료', body: 'A 본문' })).body;
  await create(b.token, { title: 'B의 자료', body: 'B 본문' });
  const before = await rows();

  for (const id of [own.textMaterialId, randomUUID(), 'not-a-uuid', '00000000-0000-0000-0000-00000000000g']) {
    rejected(await read(b.token, id), 404, 'RESOURCE_UNAVAILABLE');
    rejected(await update(b.token, id, { title: '남이 바꿈', body: '남이 바꾼 본문' }), 404, 'RESOURCE_UNAVAILABLE');
    rejected(await remove(b.token, id), 404, 'RESOURCE_UNAVAILABLE');
  }
  assert.deepEqual(await rows(), before);
  const bList = await list(b.token);
  assert.deepEqual(bList.body.items.map((item) => item.title), ['B의 자료']);
  // 대문자 UUID는 같은 자료로 읽는다.
  assert.equal((await read(a.token, own.textMaterialId.toUpperCase())).status, 200);
  rejected(await list(undefined), 401, 'AUTH_REQUIRED');
  rejected(await create(undefined, { title: 't', body: 'b' }), 401, 'AUTH_REQUIRED');
});

test('S3 목록: 최신순으로 cursor를 따라 끝까지 읽고, 항목에는 본문이 없으며 잘못된 쿼리는 400이다', async () => {
  const a = await login('materials-owner-a');
  const b = await login('materials-owner-b');
  const ids = [];
  for (let index = 0; index < 5; index += 1) {
    ids.push((await create(a.token, { title: `자료 ${index}`, body: `본문 ${index}` })).body.textMaterialId);
  }
  await create(b.token, { title: 'B 자료', body: 'B 본문' });
  const seen = [];
  let cursor = null;
  do {
    const page = await list(a.token, `?limit=2${cursor ? `&cursor=${cursor}` : ''}`);
    assert.equal(page.status, 200, JSON.stringify(page.body));
    assert.ok(page.body.items.length <= 2);
    for (const item of page.body.items) {
      assert.deepEqual(Object.keys(item).sort(), ['textMaterialId', 'title', 'updatedAt']);
      seen.push(item.textMaterialId);
    }
    cursor = page.body.page.nextCursor;
  } while (cursor);
  assert.deepEqual(seen, [...ids].reverse());

  const empty = await list(b.token, '?limit=1');
  assert.equal(empty.body.items.length, 1);
  assert.equal(empty.body.page.nextCursor, null);

  const aCursor = (await list(a.token, '?limit=1')).body.page.nextCursor;
  for (const query of ['?limit=0', '?limit=101', '?limit=abc', '?cursor=%%%', '?cursor=e30', '?unknown=1',
    `?cursor=${aCursor}x`]) {
    rejected(await list(a.token, query), 400, 'VALIDATION_FAILED');
  }
  // 다른 회원의 커서는 쓸 수 없다(커서는 권한 증명이 아니다).
  rejected(await list(b.token, `?cursor=${aCursor}`), 400, 'VALIDATION_FAILED');
});

test('S3: 자료 본문·제목은 로그에 남지 않는다(성공·검증 실패·남의 자료)', async () => {
  const a = await login('materials-owner-a');
  const b = await login('materials-owner-b');
  const own = (await create(a.token, { title: SECRET_TEXT, body: SECRET_TEXT })).body;
  await create(a.token, { title: SECRET_TEXT.repeat(10), body: SECRET_TEXT });
  await update(b.token, own.textMaterialId, { title: SECRET_TEXT, body: SECRET_TEXT });
  await update(a.token, own.textMaterialId, { title: SECRET_TEXT, body: SECRET_TEXT, extra: SECRET_TEXT });
  assert.ok(logs.every((line) => !line.includes(SECRET_TEXT)), logs.join('\n'));
});

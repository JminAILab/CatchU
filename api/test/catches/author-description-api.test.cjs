// U4 제출 1 — Catch 작성자 설명 API(PUT/GET /v1/catches/{catchId}/description) 시험.
//
// 먼저 정한 시나리오·기대 결과·실패 조건(U4 기능 명세 「주요 시나리오와 확인」 S1·S2, team.md Testing Posture).
// 세부 시험 코드는 구현 뒤 쓴다.
//
// S1 설명 저장·두 탭 저장·공백 저장·4,001자 (US2.1·US2.2, BR1.1·BR1.2·BR2.1)
//   - 기대: 본인 Catch에 설명을 저장하면 200 { authorDescription, authorDescriptionUpdatedAt }이고 DB 두 칸이 함께 채워진다.
//           저장 값은 쓴 그대로(앞뒤 공백 포함)다. 같은 Catch를 두 번(두 탭) 저장하면 마지막 저장이 남는다.
//           앞뒤 공백만 있는 값은 두 칸 모두 NULL로 저장한다(설명 지움). 4,000자(코드 포인트, 이모지 포함)는 저장된다.
//   - 실패 조건(거부해야 함): 4,001자는 400 VALIDATION_FAILED이고 기존 설명이 바뀌지 않는다.
//           정의 밖 필드·문자열 아닌 값·본문 없음은 400이다. 남의 Catch·없는 Catch·UUID 형식이 아닌 ID는 모두 같은 404
//           RESOURCE_UNAVAILABLE이고 남의 설명은 바뀌지 않는다. 인증 없으면 401.
//   - 실패로 보는 것: AI 초안(draft_content)이 설명을 덮음, 설명 저장이 초안·확인·공개 상태를 바꿈, 로그에 설명 본문이 남음.
// S2 재분석으로 같은 작업 반영 (US2.3, BR1.4)
//   - 기대: 같은 작업(owner_id, work_identity)의 결과가 다시 반영되면 기존 Catch를 참조하므로 설명이 그대로 남고,
//           다른 작업으로 새로 만든 Catch의 설명은 NULL이다.
//   - 실패 조건: 재분석 뒤 설명이 바뀌거나 비워지거나 새 Catch로 옮겨짐.
//
// 실제 Nest HTTP·PostgreSQL(격리 스키마)·회원/분석 기반·Catch 등록 코드를 연결한다. 회원·Catch·수신 기록은 합성 자료다.
// Google 로그인·실제 분석 수신은 이 시험의 범위가 아니다.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { after, before, beforeEach, describe, test } = require('node:test');
const { candidate, readCatchTestDatabase, createCatchDbFixture } = require('../support/catch-db-fixture.cjs');

const config = readCatchTestDatabase();
// 로그 비노출 확인용 합성 문자열. 실제 사용자 자료가 아니다.
const SECRET_TEXT = '[합성-설명-본문-노출확인-7f3a]';

describe('Catch 작성자 설명 API·PostgreSQL', { concurrency: false, timeout: 120000 }, () => {
  let fixture;
  let db;
  let app;
  let origin;
  let registerCandidates;
  const logs = [];
  const tokens = new Map();
  const envKeys = ['AUTH_JWT_SECRET', 'AUTH_ACCESS_TOKEN_TTL_SECONDS', 'NODE_ENV'];
  let previousEnv;

  before(async () => {
    previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
    process.env.AUTH_JWT_SECRET = randomBytes(32).toString('hex');
    process.env.AUTH_ACCESS_TOKEN_TTL_SECONDS = '900';
    process.env.NODE_ENV = 'test';
    fixture = await createCatchDbFixture(config);
    db = fixture.dataSource;

    const { Global, Module } = require('@nestjs/common');
    const { APP_INTERCEPTOR, NestFactory } = require('@nestjs/core');
    const { DataSource } = require('typeorm');
    const { AuthModule } = require('../../dist/auth/auth.module');
    const { ErrorsModule } = require('../../dist/common/errors/errors.module');
    const { NoStoreInterceptor } = require('../../dist/common/http/no-store.interceptor');
    const { CatchesModule } = require('../../dist/catches/catches.module');
    const { configureApp } = require('../../dist/app.setup');
    ({ registerCandidates } = require('../../dist/catches/registration-service'));

    class FixtureDatabaseModule {}
    Global()(FixtureDatabaseModule);
    Module({ providers: [{ provide: DataSource, useValue: db }], exports: [DataSource] })(FixtureDatabaseModule);
    class DescriptionHttpModule {}
    Module({
      imports: [FixtureDatabaseModule, AuthModule, ErrorsModule, CatchesModule],
      providers: [{ provide: APP_INTERCEPTOR, useClass: NoStoreInterceptor }],
    })(DescriptionHttpModule);
    const logger = Object.fromEntries(['log', 'error', 'warn', 'debug', 'verbose', 'fatal'].map((level) =>
      [level, (...args) => logs.push(args.map(String).join(' '))]));
    app = await NestFactory.create(DescriptionHttpModule, { logger, abortOnError: false });
    await configureApp(app);
    await app.listen(0, '127.0.0.1');
    origin = await app.getUrl();
  });

  after(async () => {
    try {
      if (app) await app.close();
    } finally {
      try {
        if (fixture) await fixture.close();
      } finally {
        for (const [key, value] of Object.entries(previousEnv ?? {})) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    }
  });

  beforeEach(async () => {
    tokens.clear();
    logs.length = 0;
    await db.query('TRUNCATE repository_protection');
    await fixture.reset();
  });

  async function request(ownerId, path, options = {}) {
    const { body, rawBody, ...rest } = options;
    const headers = {};
    if (ownerId !== undefined) {
      if (!tokens.has(ownerId)) {
        const { SessionService } = require('../../dist/auth/session.service');
        const issued = await db.transaction((manager) => app.get(SessionService).create(manager, ownerId));
        tokens.set(ownerId, issued.access.accessToken);
      }
      headers.Authorization = 'Bearer ' + tokens.get(ownerId);
    }
    if (body !== undefined || rawBody !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(origin + path, {
      ...rest, headers,
      body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return { status: response.status, body: await response.json() };
  }

  const descriptionPath = (catchId) => `/v1/catches/${catchId}/description`;
  const save = (ownerId, catchId, description) =>
    request(ownerId, descriptionPath(catchId), { method: 'PUT', body: { description } });

  function rejected(response, status, code) {
    assert.equal(response.status, status, JSON.stringify(response.body));
    assert.equal(response.body.code, code);
    if (status === 404) assert.deepEqual(response.body, { code: 'RESOURCE_UNAVAILABLE', message: '현재 열람할 수 없는 자료입니다.' });
  }

  async function seed({ ownerId = randomUUID(), workIdentity = 'synthetic-work-' + randomUUID() } = {}) {
    const input = await fixture.receipt({ ownerId, candidates: [candidate('synthetic-candidate-' + randomUUID(), workIdentity)] });
    const results = await db.transaction(async (manager) => {
      const registered = await registerCandidates(manager, input);
      await manager.query("UPDATE analysis_attempt SET application = 'APPLIED', owner_results_ready = true WHERE attempt_id = $1", [input.attemptId]);
      await manager.query("UPDATE analysis_request SET lifecycle = 'CLOSED' WHERE request_id = $1", [input.requestId]);
      return registered;
    });
    return { ownerId, workIdentity, catchId: results[0].catchId, disposition: results[0].disposition };
  }

  async function row(catchId) {
    const [value] = await db.query(`SELECT author_description, author_description_updated_at, draft_content, draft_status,
      work_facts_confirmed, contribution_confirmed, visibility, mismatch FROM catch_asset WHERE catch_id = $1`, [catchId]);
    return value;
  }

  test('S1: 본인 설명을 쓴 그대로 저장하고 읽으며, 두 번 저장하면 마지막 저장이 남고 다른 칸은 그대로다', async () => {
    const own = await seed();
    const before = await row(own.catchId);
    assert.equal(before.author_description, null);
    assert.deepEqual((await request(own.ownerId, descriptionPath(own.catchId))).body,
      { authorDescription: null, authorDescriptionUpdatedAt: null });

    const first = await save(own.ownerId, own.catchId, '  첫 탭에서 쓴 설명\n두 줄  ');
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.authorDescription, '  첫 탭에서 쓴 설명\n두 줄  ');
    assert.ok(!Number.isNaN(Date.parse(first.body.authorDescriptionUpdatedAt)));
    assert.deepEqual(Object.keys(first.body).sort(), ['authorDescription', 'authorDescriptionUpdatedAt']);

    const second = await save(own.ownerId, own.catchId, '둘째 탭에서 쓴 설명');
    assert.equal(second.status, 200);
    assert.ok(Date.parse(second.body.authorDescriptionUpdatedAt) >= Date.parse(first.body.authorDescriptionUpdatedAt));
    assert.deepEqual((await request(own.ownerId, descriptionPath(own.catchId))).body, second.body);

    const after = await row(own.catchId);
    assert.equal(after.author_description, '둘째 탭에서 쓴 설명');
    assert.notEqual(after.author_description_updated_at, null);
    // 설명 저장은 AI 초안·확인·공개·불일치 칸을 바꾸지 않는다(BR1.3).
    for (const key of ['draft_content', 'draft_status', 'work_facts_confirmed', 'contribution_confirmed', 'visibility', 'mismatch']) {
      assert.deepEqual(after[key], before[key], key);
    }
  });

  test('S1: 앞뒤 공백만 저장하면 두 칸 모두 NULL이 되고, 4,000자는 저장되며 4,001자는 400으로 기존 설명을 지킨다', async () => {
    const own = await seed();
    // 4,000 코드 포인트: 이모지(서로게이트 쌍)를 섞어 UTF-16 길이와 다르게 센다.
    const limit = '가'.repeat(3998) + '😀😀';
    assert.equal((await save(own.ownerId, own.catchId, limit)).status, 200);
    assert.equal((await row(own.catchId)).author_description, limit);

    const tooLong = await save(own.ownerId, own.catchId, limit + 'a');
    rejected(tooLong, 400, 'VALIDATION_FAILED');
    assert.deepEqual(tooLong.body.details, { violations: [{ field: 'description', reason: 'maxLength' }] });
    assert.equal((await row(own.catchId)).author_description, limit);

    const cleared = await save(own.ownerId, own.catchId, ' \n\t ');
    assert.deepEqual(cleared, { status: 200, body: { authorDescription: null, authorDescriptionUpdatedAt: null } });
    const stored = await row(own.catchId);
    assert.equal(stored.author_description, null);
    assert.equal(stored.author_description_updated_at, null);
    assert.equal((await save(own.ownerId, own.catchId, '')).status, 200);
  });

  test('S1 거부: 본문 형식이 틀리면 400이고 저장하지 않는다', async () => {
    const own = await seed();
    await save(own.ownerId, own.catchId, '유지할 설명');
    const cases = [
      [{ description: '설명', extra: true }, 'body', 'whitelistValidation'],
      [{ description: 1 }, 'description', 'isString'],
      [{ description: null }, 'description', 'isString'],
      [{}, 'description', 'isString'],
      [{ description: 'a\u0000b' }, 'description', 'noNul'],
      [{ description: 'a\uD800b' }, 'description', 'isWellFormed'],
    ];
    for (const [body, field, reason] of cases) {
      const response = await request(own.ownerId, descriptionPath(own.catchId), { method: 'PUT', body });
      rejected(response, 400, 'VALIDATION_FAILED');
      assert.deepEqual(response.body.details, { violations: [{ field, reason }] }, JSON.stringify(body));
    }
    const array = await request(own.ownerId, descriptionPath(own.catchId), { method: 'PUT', rawBody: '[]' });
    rejected(array, 400, 'VALIDATION_FAILED');
    const query = await request(own.ownerId, descriptionPath(own.catchId) + '?x=1', { method: 'PUT', body: { description: '바꿈' } });
    assert.equal(query.status, 400);
    assert.equal((await row(own.catchId)).author_description, '유지할 설명');
  });

  test('S1 거부: 남의 Catch·없는 Catch·UUID 형식이 아닌 ID는 같은 404이고, 인증이 없으면 401이다', async () => {
    const owner = await seed();
    const other = await seed();
    await save(owner.ownerId, owner.catchId, '본인 설명');
    for (const catchId of [owner.catchId, randomUUID(), 'not-a-uuid', owner.catchId.toUpperCase() + 'x']) {
      rejected(await save(other.ownerId, catchId, '남이 바꾼 설명'), 404, 'RESOURCE_UNAVAILABLE');
      rejected(await request(other.ownerId, descriptionPath(catchId)), 404, 'RESOURCE_UNAVAILABLE');
    }
    assert.equal((await row(owner.catchId)).author_description, '본인 설명');
    // 대문자 UUID는 같은 Catch로 읽는다(10월 ID 처리와 같은 기준).
    assert.equal((await request(owner.ownerId, descriptionPath(owner.catchId.toUpperCase()))).status, 200);
    rejected(await save(undefined, owner.catchId, '익명'), 401, 'AUTH_REQUIRED');
  });

  test('S1: 설명 본문은 로그에 남지 않는다(성공·검증 실패·남의 Catch)', async () => {
    const own = await seed();
    const other = await seed();
    await save(own.ownerId, own.catchId, SECRET_TEXT);
    await save(own.ownerId, own.catchId, SECRET_TEXT + 'x'.repeat(4000));
    await save(other.ownerId, own.catchId, SECRET_TEXT);
    await request(own.ownerId, descriptionPath(own.catchId), { method: 'PUT', body: { description: SECRET_TEXT, extra: SECRET_TEXT } });
    assert.ok(logs.every((line) => !line.includes(SECRET_TEXT)), logs.join('\n'));
  });

  test('S2: 같은 작업을 다시 반영하면 기존 Catch를 참조해 설명이 남고, 다른 작업의 새 Catch는 설명이 없다', async () => {
    const first = await seed();
    await save(first.ownerId, first.catchId, '재분석 뒤에도 남을 설명');
    const savedRow = await row(first.catchId);

    const again = await seed({ ownerId: first.ownerId, workIdentity: first.workIdentity });
    assert.equal(again.disposition, 'EXISTING');
    assert.equal(again.catchId, first.catchId);
    const afterReanalysis = await row(first.catchId);
    assert.equal(afterReanalysis.author_description, '재분석 뒤에도 남을 설명');
    assert.deepEqual(afterReanalysis.author_description_updated_at, savedRow.author_description_updated_at);

    const fresh = await seed({ ownerId: first.ownerId });
    assert.equal(fresh.disposition, 'CREATED');
    assert.notEqual(fresh.catchId, first.catchId);
    assert.deepEqual((await request(first.ownerId, descriptionPath(fresh.catchId))).body,
      { authorDescription: null, authorDescriptionUpdatedAt: null });
  });
});

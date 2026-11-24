// 발행 프리셋 U2 — 본인 Catch 목록 `GET /v1/catches?publishable=true`(규칙 BR5.1, NFR2.2~NFR2.4, NFR 설계 security 1).
//
// 먼저 정한 시나리오·기대 결과·실패 조건(unit-test-instructions 「시나리오」의 api 묶음, team.md Testing Posture). 세부 시험 코드는 구현 뒤 썼다.
// - publishable=true: 공개이고 작업 사실·기여가 확인됐고 원본 저장소가 보호되지 않은 Catch만. 실패 조건: 비공개·미확인·보호 Catch가 나옴.
// - false·빈 값·대소문자 다른 값·같은 키 두 번은 400이고 받은 값을 싣지 않는다. 공개 목록은 그 키를 모르는 키로 400. 실패 조건: 200.
// - 남의 Catch는 섞이지 않는다. 실패 조건: 섞임.
// - 옛 커서(publishable 없음)는 범위가 지금과 같아 그대로 쓰이고, 조건이 다른 커서는 400. 실패 조건: 옛 커서가 400.
// - 보호 관측이 없는 공개·확인 Catch가 있으면 지금처럼 500. 실패 조건: 목록에서 조용히 빠짐(NFR 설계 검토 R-01).
// - 같은 Catch 묶음에서 publishable=true ID 집합 = U1 eligibility.ts가 이유 없음으로 낸 ID 집합(project.md: 문장 대조 대신 같은 결과 시험).
//
// 실제 Nest HTTP·PostgreSQL·회원/분석 기반·B 코드를 연결한다. 회원·저장소·Catch·보호 관측은 합성 자료로 직접 준비한다.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { createHash, randomBytes, randomUUID } = require('node:crypto');
const { after, before, beforeEach, describe, test } = require('node:test');
const { candidate, readCatchTestDatabase, createCatchDbFixture } = require('../support/catch-db-fixture.cjs');

const config = readCatchTestDatabase();

describe('본인 Catch 목록 publishable 조건(발행 프리셋 U2)', { concurrency: false, timeout: 120000 }, () => {
  let fixture;
  let db;
  let app;
  let origin;
  let registerCandidates;
  let publicCatches;
  let eligibility;
  const issuedTokens = new Map();
  const envKeys = ['AUTH_JWT_SECRET', 'AUTH_ACCESS_TOKEN_TTL_SECONDS', 'DEV_LOGIN_ENABLED', 'NODE_ENV'];
  let previousEnv;

  before(async () => {
    previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
    process.env.AUTH_JWT_SECRET = randomBytes(32).toString('hex');
    process.env.AUTH_ACCESS_TOKEN_TTL_SECONDS = '900';
    process.env.NODE_ENV = 'test';
    process.env.DEV_LOGIN_ENABLED = 'true';
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
    eligibility = require('../../dist/publishable-source/eligibility');

    class FixtureDatabaseModule {}
    Global()(FixtureDatabaseModule);
    Module({ providers: [{ provide: DataSource, useValue: db }], exports: [DataSource] })(FixtureDatabaseModule);
    class PublishableFilterHttpModule {}
    Module({
      imports: [FixtureDatabaseModule, AuthModule, ErrorsModule, CatchesModule],
      providers: [{ provide: APP_INTERCEPTOR, useClass: NoStoreInterceptor }],
    })(PublishableFilterHttpModule);
    app = await NestFactory.create(PublishableFilterHttpModule, { logger: false, abortOnError: false });
    await configureApp(app);
    await app.listen(0, '127.0.0.1');
    origin = await app.getUrl();
    publicCatches = app.get(require('../../dist/catches/public-catch-store').PublicCatchStore);
  });

  after(async () => {
    try {
      if (app) await app.close();
    } finally {
      try {
        if (fixture) await fixture.close();
      } finally {
        if (previousEnv) {
          for (const [key, value] of Object.entries(previousEnv)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
          }
        }
      }
    }
  });

  beforeEach(async () => {
    issuedTokens.clear();
    await db.query('TRUNCATE repository_protection');
    await fixture.reset();
  });

  async function request(ownerId, path) {
    if (!issuedTokens.has(ownerId)) {
      const { SessionService } = require('../../dist/auth/session.service');
      const issued = await db.transaction((manager) => app.get(SessionService).create(manager, ownerId));
      issuedTokens.set(ownerId, issued.access.accessToken);
    }
    const response = await fetch(origin + path, {
      headers: { Authorization: 'Bearer ' + issuedTokens.get(ownerId) }, signal: AbortSignal.timeout(5000),
    });
    const text = await response.text();
    return { status: response.status, body: JSON.parse(text), text };
  }

  function success(response) {
    assert.equal(response.status, 200, response.text);
    return response.body;
  }

  function failure(response, status, code) {
    assert.equal(response.status, status, response.text);
    assert.equal(response.body.code, code);
    return response.body;
  }

  const listPath = (query) => '/v1/catches?' + new URLSearchParams(query).toString();
  const ids = (items) => items.map((item) => item.catchId).sort();
  const cursorOf = (cursor) => JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));

  /** 한 저장소의 Catch를 등록한다. 보호 관측은 `restriction`(null이면 관측 행을 만들지 않음)이다. */
  async function seed({ ownerId = randomUUID(), repositoryId = 'synthetic-repository-' + randomUUID(), count = 1, restriction = 'NONE' } = {}) {
    const candidates = Array.from({ length: count }, (_, index) => {
      const key = randomUUID();
      return candidate('synthetic-candidate-' + key, 'synthetic-work-' + index + '-' + key);
    });
    const input = await fixture.receipt({ ownerId, candidates }, { repositoryId, protection: restriction });
    const results = await db.transaction(async (manager) => {
      const registered = await registerCandidates(manager, input);
      await manager.query("UPDATE analysis_attempt SET application = 'APPLIED', owner_results_ready = true WHERE attempt_id = $1", [input.attemptId]);
      await manager.query("UPDATE analysis_request SET lifecycle = 'CLOSED' WHERE request_id = $1", [input.requestId]);
      return registered;
    });
    return { ownerId, repositoryId, catchIds: results.map((result) => result.catchId) };
  }

  /** 공개 상태·확인 칸을 바로 정한다(합성 자료). */
  async function setState(catchId, { visibility = 'PUBLIC', confirmed = true } = {}) {
    await db.query('UPDATE catch_asset SET visibility = $2, work_facts_confirmed = $3, contribution_confirmed = $3 WHERE catch_id = $1',
      [catchId, visibility, confirmed]);
  }

  /** 섞인 묶음: 공개·확인·보호 아님(eligible) 둘, 비공개 하나, 미확인 공개 하나, 보호 저장소의 공개·확인 하나. */
  async function mixedOwner() {
    const free = await seed({ count: 4 });
    const ownerId = free.ownerId;
    const [eligibleA, eligibleB, hidden, unconfirmed] = free.catchIds;
    await setState(eligibleA);
    await setState(eligibleB);
    await setState(hidden, { visibility: 'PRIVATE' });
    await setState(unconfirmed, { confirmed: false });
    const restricted = await seed({ ownerId, restriction: 'SOURCE_PRIVATE' });
    await setState(restricted.catchIds[0]);
    return { ownerId, freeRepository: free.repositoryId, eligible: [eligibleA, eligibleB].sort(), hidden, unconfirmed, restricted: restricted.catchIds[0] };
  }

  test('BR5.1 publishable=true는 공개·확인·보호 아님 Catch만 주고, 없으면 전체이며 authorDescription·repositoryId와 함께 쓴다', async () => {
    const own = await mixedOwner();
    const page = success(await request(own.ownerId, listPath({ publishable: 'true' })));
    assert.deepEqual(ids(page.items), own.eligible);
    assert.ok(page.items.every((item) => item.visibility === 'PUBLIC' && item.restriction === 'NONE'
      && item.confirmation.workFactsConfirmed && item.confirmation.contributionConfirmed));
    assert.equal(page.page.nextCursor, null);
    // 조건이 없으면 지금처럼 다섯 모두다.
    assert.equal(success(await request(own.ownerId, listPath({}))).items.length, 5);
    // 다른 조건과 AND.
    await db.query('UPDATE catch_asset SET author_description = $2, author_description_updated_at = now() WHERE catch_id = $1',
      [own.eligible[0], '[합성] 작성자 설명']);
    assert.deepEqual(ids(success(await request(own.ownerId, listPath({ publishable: 'true', authorDescription: 'written' }))).items), [own.eligible[0]]);
    assert.deepEqual(ids(success(await request(own.ownerId, listPath({ publishable: 'true', repositoryId: own.freeRepository }))).items), own.eligible);
    assert.deepEqual(success(await request(own.ownerId, listPath({ publishable: 'true', repositoryId: 'synthetic-other-repository' }))),
      { items: [], page: { nextCursor: null } });
  });

  test('NFR2.3 publishable의 false·빈 값·대소문자 다른 값·모르는 값·같은 키 두 번은 400이고 받은 값을 응답에 싣지 않는다', async () => {
    const own = await mixedOwner();
    for (const query of [
      'publishable=false', 'publishable=', 'publishable=TRUE', 'publishable=True', 'publishable=1',
      'publishable=synthetic-flag-value', 'publishable=true&publishable=true', 'publishable=true&publishable=false',
    ]) {
      const response = await request(own.ownerId, '/v1/catches?' + query);
      failure(response, 400, 'INVALID_REQUEST');
      assert.doesNotMatch(response.text, /synthetic-flag-value|TRUE|True/, query);
    }
  });

  test('NFR2.2 공개 Catch 목록은 publishable을 모르는 키로 400이고 본인 목록은 200이다', async () => {
    const own = await mixedOwner();
    await assert.rejects(publicCatches.list(own.ownerId, { publishable: 'true' }), { status: 400 });
    // 키가 없으면 공개 목록은 지금처럼 응답한다.
    const listed = await publicCatches.list(own.ownerId, {});
    assert.ok(Array.isArray(listed.catches));
    assert.deepEqual(ids(success(await request(own.ownerId, listPath({ publishable: 'true' }))).items), own.eligible);
  });

  test('NFR2.4 회원 조건은 그대로라 다른 회원의 담을 수 있는 Catch는 섞이지 않는다', async () => {
    const own = await mixedOwner();
    const foreign = await seed({ count: 2 });
    for (const catchId of foreign.catchIds) await setState(catchId);
    assert.deepEqual(ids(success(await request(own.ownerId, listPath({ publishable: 'true' }))).items), own.eligible);
    assert.deepEqual(ids(success(await request(foreign.ownerId, listPath({ publishable: 'true' }))).items), [...foreign.catchIds].sort());
  });

  test('NFR 설계 검토 R-02 옛 커서(publishable 없음)는 범위가 지금과 같아 그대로 쓰이고, 조건이 다른 커서는 400이다', async () => {
    const own = await mixedOwner();
    // 옛 커서: 범위는 지금 배열 [회원, repositoryId, sourceRequestId, authorDescription] 그대로다.
    const old = success(await request(own.ownerId, listPath({ limit: '2' })));
    const oldScope = createHash('sha256').update(JSON.stringify([own.ownerId, null, null, null])).digest('hex');
    assert.equal(cursorOf(old.page.nextCursor).scope, oldScope);
    assert.equal(success(await request(own.ownerId, listPath({ limit: '2', cursor: old.page.nextCursor }))).items.length, 2);
    failure(await request(own.ownerId, listPath({ publishable: 'true', limit: '2', cursor: old.page.nextCursor })), 400, 'INVALID_REQUEST');

    // publishable 커서: 같은 조건으로만 다음 쪽을 읽고, 조건을 빼거나 다른 회원이 쓰면 400이다.
    const first = success(await request(own.ownerId, listPath({ publishable: 'true', limit: '1' })));
    assert.notEqual(cursorOf(first.page.nextCursor).scope, oldScope);
    const second = success(await request(own.ownerId, listPath({ publishable: 'true', limit: '1', cursor: first.page.nextCursor })));
    assert.deepEqual(ids([...first.items, ...second.items]), own.eligible);
    assert.equal(second.page.nextCursor, null);
    failure(await request(own.ownerId, listPath({ limit: '1', cursor: first.page.nextCursor })), 400, 'INVALID_REQUEST');
    failure(await request(own.ownerId, listPath({ publishable: 'true', authorDescription: 'written', limit: '1', cursor: first.page.nextCursor })),
      400, 'INVALID_REQUEST');
    const foreign = await seed();
    failure(await request(foreign.ownerId, listPath({ publishable: 'true', limit: '1', cursor: first.page.nextCursor })), 400, 'INVALID_REQUEST');
  });

  test('NFR 설계 검토 R-01 보호 관측이 없는 공개·확인 Catch가 있으면 publishable=true도 지금처럼 500이고 조용히 빠지지 않는다', async () => {
    const own = await mixedOwner();
    // 등록에는 보호 관측이 있어야 하므로 등록한 뒤 관측 행을 지운다(기록 문제를 합성으로 만든다).
    const missing = await seed({ ownerId: own.ownerId });
    await setState(missing.catchIds[0]);
    await db.query('DELETE FROM repository_protection WHERE owner_id = $1 AND repository_id = $2', [own.ownerId, missing.repositoryId]);
    // 관측 행이 없으면 SQL의 보호 값은 NULL이다. IS DISTINCT FROM이라 이 Catch는 SQL에서 빠지지 않고 응답 검사가 500을 낸다.
    const response = await request(own.ownerId, listPath({ publishable: 'true' }));
    failure(response, 500, 'INTERNAL_ERROR');
    assert.deepEqual(response.body, { code: 'INTERNAL_ERROR', message: '처리 중 오류가 발생했습니다.' });
    // 조건 없는 목록도 같은 500이다(지금 동작).
    failure(await request(own.ownerId, listPath({})), 500, 'INTERNAL_ERROR');
  });

  test('BR5.1 같은 Catch 묶음에서 publishable=true ID 집합은 U1 eligibility.ts가 이유 없음으로 낸 ID 집합과 같다', async () => {
    const own = await mixedOwner();
    // 한 저장소 더: 보호 아님 저장소의 비공개·확인, 공개·미확인(작업 사실만 확인) 하나씩.
    const more = await seed({ ownerId: own.ownerId, count: 3 });
    await setState(more.catchIds[0], { visibility: 'PRIVATE' });
    await db.query('UPDATE catch_asset SET visibility = \'PUBLIC\', work_facts_confirmed = true, contribution_confirmed = false WHERE catch_id = $1', [more.catchIds[1]]);
    await setState(more.catchIds[2]);

    const listed = new Set(ids(success(await request(own.ownerId, listPath({ publishable: 'true', limit: '100' }))).items));
    const rows = await db.query(`SELECT c.catch_id AS "catchId", c.visibility, c.work_facts_confirmed AS "workFactsConfirmed",
        c.contribution_confirmed AS "contributionConfirmed", r.member_id AS "requestMemberId", r.repository_id AS "repositoryId"
      FROM catch_asset c LEFT JOIN analysis_request r ON r.request_id = c.source_request_id WHERE c.owner_id = $1`, [own.ownerId]);
    const protectionRows = await db.query(`SELECT repository_id AS "repositoryId", applied_restriction AS restriction,
        confirmed_source_state AS "confirmedSourceState", observation_provenance AS "observationProvenance", observed_at AS "observedAt"
      FROM repository_protection WHERE owner_id = $1`, [own.ownerId]);
    const protections = new Map(protectionRows.map((row) => [row.repositoryId, row]));
    const judged = new Set(rows.filter((row) => eligibility.catchUnpublishableReason(own.ownerId, row, protections) === null)
      .map((row) => row.catchId).sort());
    assert.equal(rows.length, 8);
    assert.deepEqual([...listed].sort(), [...judged].sort());
    assert.deepEqual([...listed].sort(), [...own.eligible, more.catchIds[2]].sort());
  });
});

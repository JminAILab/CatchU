require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { after, before, beforeEach, describe, test } = require('node:test');
const { candidate, readCatchTestDatabase, createCatchDbFixture } = require('../support/catch-db-fixture.cjs');

const config = readCatchTestDatabase();
const CONFIRMED = { workFactsConfirmed: true, contributionConfirmed: true };

// 실제 Nest HTTP·PostgreSQL·B 코드를 연결한다. A/E 선행 자료만 합성 스키마다.
describe('본인 Catch HTTP·PostgreSQL', {
  skip: config ? false : 'TEST_DB_* 미설정: 실제 DB 검사는 명시 DB 검사에서 실행',
  concurrency: false, timeout: 120000,
}, () => {
  let fixture;
  let db;
  let app;
  let origin;
  let tokens;
  let registerCandidates;
  const issuedTokens = new Map();
  const envKeys = ['AUTH_JWT_SECRET', 'AUTH_ACCESS_TOKEN_TTL_SECONDS', 'DEV_LOGIN_ENABLED', 'NODE_ENV'];
  let previousEnv;

  before(async () => {
    previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
    process.env.AUTH_JWT_SECRET = randomBytes(32).toString('hex');
    process.env.AUTH_ACCESS_TOKEN_TTL_SECONDS = '600';
    process.env.NODE_ENV = 'test';
    delete process.env.DEV_LOGIN_ENABLED;

    fixture = await createCatchDbFixture(config);
    db = fixture.dataSource;
    // 공용 B fixture가 Catch와 보호 판단 마이그레이션을 함께 적용한다.

    const { Global, Module } = require('@nestjs/common');
    const { APP_INTERCEPTOR, NestFactory } = require('@nestjs/core');
    const { DataSource } = require('typeorm');
    const { AuthModule } = require('../../dist/auth/auth.module');
    const { AccessTokenService } = require('../../dist/auth/access-token.service');
    const { ErrorsModule } = require('../../dist/common/errors/errors.module');
    const { NoStoreInterceptor } = require('../../dist/common/http/no-store.interceptor');
    const { CatchesModule } = require('../../dist/catches/catches.module');
    const { configureApp } = require('../../dist/app.setup');
    ({ registerCandidates } = require('../../dist/catches/registration-service'));

    class FixtureDatabaseModule {}
    Global()(FixtureDatabaseModule);
    Module({ providers: [{ provide: DataSource, useValue: db }], exports: [DataSource] })(FixtureDatabaseModule);
    class OwnerCatchHttpModule {}
    Module({
      imports: [FixtureDatabaseModule, AuthModule, ErrorsModule, CatchesModule],
      // 성공 no-store는 실제 AppModule과 같은 공통 interceptor를 등록한다.
      providers: [{ provide: APP_INTERCEPTOR, useClass: NoStoreInterceptor }],
    })(OwnerCatchHttpModule);
    app = await NestFactory.create(OwnerCatchHttpModule, { logger: false, abortOnError: false });
    await configureApp(app);
    await app.listen(0, '127.0.0.1');
    origin = await app.getUrl();
    tokens = app.get(AccessTokenService);
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
    // 새 보호 테이블을 먼저 비우고 공용 fixture의 선행/B 자료 초기화를 사용한다.
    await db.query('TRUNCATE repository_protection');
    await fixture.reset();
  });

  async function request(ownerId, path = '/v1/catches', options = {}) {
    const { body, rawBody, ...fetchOptions } = options;
    const headers = { ...fetchOptions.headers };
    if (ownerId !== undefined) {
      if (!issuedTokens.has(ownerId)) issuedTokens.set(ownerId, (await tokens.issue(ownerId)).accessToken);
      headers.Authorization = 'Bearer ' + issuedTokens.get(ownerId);
    }
    if (body !== undefined || rawBody !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(origin + path, {
      ...fetchOptions, headers,
      body: rawBody === undefined ? body === undefined ? undefined : JSON.stringify(body) : rawBody,
      signal: AbortSignal.timeout(5000),
    });
    const text = await response.text();
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(response.headers.get('content-type'), /^application\/json\b/);
    return { status: response.status, body: JSON.parse(text), text };
  }

  function success(response, status = 200) {
    assert.equal(response.status, status, response.text);
    return response.body;
  }

  function failure(response, status, code) {
    assert.equal(response.status, status);
    assert.equal(response.body.code, code);
    assert.equal(typeof response.body.message, 'string');
    assert.ok(response.body.message.length > 0);
    assert.ok(Object.keys(response.body).every((key) => ['code', 'message', 'details'].includes(key)));
    if (status === 404) assert.deepEqual(response.body, {
      code: 'RESOURCE_UNAVAILABLE', message: '현재 열람할 수 없는 자료입니다.',
    });
    if (status === 500) assert.deepEqual(response.body, {
      code: 'INTERNAL_ERROR', message: '처리 중 오류가 발생했습니다.',
    });
    return response.body;
  }

  function queryPath(query) {
    return '/v1/catches?' + new URLSearchParams(query).toString();
  }

  async function seed({ ownerId = randomUUID(), repositoryId = 'synthetic-repository',
    count = 1, restriction = 'NONE', source } = {}) {
    const candidates = source ? [source] : Array.from({ length: count }, (_, index) => {
      const key = randomUUID();
      return candidate('synthetic-candidate-' + key, 'synthetic-work-' + index + '-' + key);
    });
    const input = await fixture.receipt({ ownerId, candidates });
    await db.query('UPDATE analysis_request SET repository_id = $1 WHERE request_id = $2',
      [repositoryId, input.requestId]);
    // 합성 관측에서 확인한 NONE/SOURCE_PRIVATE를 명시한다. 행 부재를 NONE으로 보정하지 않는다.
    await db.query(`INSERT INTO repository_protection
      (protection_id, owner_id, repository_id, confirmed_source_state, observation_provenance, observed_at, applied_restriction)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (owner_id, repository_id) DO UPDATE SET
        confirmed_source_state = EXCLUDED.confirmed_source_state,
        observation_provenance = EXCLUDED.observation_provenance,
        observed_at = EXCLUDED.observed_at,
        applied_restriction = EXCLUDED.applied_restriction`,
    [randomUUID(), ownerId, repositoryId,
      { state: restriction === 'SOURCE_PRIVATE' ? 'PRIVATE' : 'PUBLIC', synthetic: true },
      { kind: 'SYNTHETIC_FIXTURE' }, new Date('2026-09-29T00:00:00Z'), restriction]);
    const results = await db.transaction((manager) => registerCandidates(manager, input));
    return { ...input, repositoryId, restriction, catchId: results[0].catchId,
      catchIds: results.map((result) => result.catchId) };
  }

  async function snapshot() {
    return {
      assets: await db.query('SELECT * FROM catch_asset ORDER BY catch_id'),
      evidence: await db.query('SELECT * FROM catch_evidence ORDER BY catch_evidence_id'),
      registrations: await db.query('SELECT * FROM candidate_registration ORDER BY registration_id'),
      protection: await db.query('SELECT * FROM repository_protection ORDER BY protection_id'),
      requests: await db.query('SELECT * FROM analysis_request ORDER BY request_id'),
      attempts: await db.query('SELECT * FROM analysis_attempt ORDER BY attempt_id'),
    };
  }

  async function asset(catchId) {
    const [row] = await db.query('SELECT * FROM catch_asset WHERE catch_id = $1', [catchId]);
    return row;
  }

  const detailPath = (catchId) => '/v1/catches/' + catchId;
  const confirmPath = (catchId) => detailPath(catchId) + '/confirmation';
  const mismatchPath = (catchId) => detailPath(catchId) + '/mismatch';
  const ids = (items) => items.map((item) => item.catchId).sort();

  test('본인 목록·상세는 계약 필드를 반환하며 조회로 DB를 바꾸지 않는다', async () => {
    const own = await seed();
    const other = await seed();
    const beforeState = await snapshot();
    const detail = success(await request(own.ownerId, detailPath(own.catchId)));
    const [storedEvidence] = beforeState.evidence.filter((item) => item.catch_id === own.catchId);
    const source = own.candidates[0];
    assert.deepEqual(detail, {
      catchId: own.catchId, title: source.title, repositoryId: own.repositoryId,
      sourceRequestId: own.requestId, sourceResultId: own.resultId,
      sourceCandidateId: source.candidateId, workFacts: source.workFacts,
      subjectContribution: source.subjectContribution,
      evidence: [{
        catchEvidenceId: storedEvidence.catch_evidence_id, sourceEvidenceId: source.evidence[0].evidenceId,
        sourceUrl: source.evidence[0].sourceUrl, sourceRevision: source.evidence[0].sourceRevision,
        representedFacts: source.evidence[0].representedFacts,
        contributionScope: source.evidence[0].contributionScope, coverageLimits: source.evidence[0].coverageLimits,
      }],
      draft: source.draft, reflection: source.reflection,
      confirmation: { workFactsConfirmed: false, contributionConfirmed: false },
      mismatch: false, visibility: 'PRIVATE', restriction: 'NONE', sourceMode: 'MOCK',
    });
    const list = success(await request(own.ownerId));
    assert.deepEqual(list, { items: [detail], page: { nextCursor: null } });
    assert.ok(!ids(list.items).includes(other.catchId));
    assert.deepEqual(await snapshot(), beforeState);
  });

  test('repositoryId와 sourceRequestId는 본인 범위 안에서 AND로 적용한다', async () => {
    const ownerId = randomUUID();
    const first = await seed({ ownerId, repositoryId: 'synthetic-repo-a', count: 2 });
    const sameRepo = await seed({ ownerId, repositoryId: 'synthetic-repo-a' });
    const otherRepo = await seed({ ownerId, repositoryId: 'synthetic-repo-b' });
    const foreign = await seed({ repositoryId: 'synthetic-repo-a' });
    assert.deepEqual(ids(success(await request(ownerId, queryPath({ repositoryId: first.repositoryId }))).items),
      [...first.catchIds, ...sameRepo.catchIds].sort());
    assert.deepEqual(ids(success(await request(ownerId, queryPath({ sourceRequestId: first.requestId }))).items), first.catchIds.sort());
    assert.deepEqual(ids(success(await request(ownerId, queryPath({
      repositoryId: first.repositoryId, sourceRequestId: first.requestId,
    }))).items), first.catchIds.sort());
    for (const query of [
      { repositoryId: otherRepo.repositoryId, sourceRequestId: first.requestId },
      { sourceRequestId: foreign.requestId },
      { sourceRequestId: 'synthetic-unknown-request' },
      { repositoryId: 'synthetic-unknown-repository' },
    ]) assert.deepEqual(success(await request(ownerId, queryPath(query))), { items: [], page: { nextCursor: null } });
  });

  test('페이지 기본20·최대100, 마지막 페이지, 커서의 회원·필터 결합을 확인한다', async () => {
    const own = await seed({ count: 23 });
    const foreign = await seed();
    const defaultPage = success(await request(own.ownerId));
    assert.equal(defaultPage.items.length, 20);
    assert.equal(typeof defaultPage.page.nextCursor, 'string');
    const last = success(await request(own.ownerId, queryPath({ cursor: defaultPage.page.nextCursor })));
    assert.equal(last.items.length, 3);
    assert.equal(last.page.nextCursor, null);
    assert.deepEqual(ids([...defaultPage.items, ...last.items]), own.catchIds.sort());
    const all = success(await request(own.ownerId, queryPath({ limit: '100' })));
    assert.deepEqual(ids(all.items), own.catchIds.sort());
    assert.equal(all.page.nextCursor, null);

    const filters = { repositoryId: own.repositoryId, sourceRequestId: own.requestId };
    const first = success(await request(own.ownerId, queryPath({ ...filters, limit: '2' })));
    const cursor = first.page.nextCursor;
    assert.equal(first.items.length, 2);
    for (const [ownerId, query] of [
      [foreign.ownerId, { ...filters, limit: '2', cursor }],
      [own.ownerId, { ...filters, repositoryId: 'synthetic-other-repository', limit: '2', cursor }],
      [own.ownerId, { ...filters, sourceRequestId: foreign.requestId, limit: '2', cursor }],
      [own.ownerId, { limit: '2', cursor }],
    ]) failure(await request(ownerId, queryPath(query)), 400, 'INVALID_REQUEST');

    // limit은 페이지 크기다. 동일 회원·필터에서 바꿔도 누락·중복 없이 이어져야 한다.
    const collected = [...first.items];
    let next = cursor;
    let pages = 0;
    while (next !== null) {
      assert.ok(++pages <= 23, '커서가 같은 페이지를 반복하지 않는다');
      const page = success(await request(own.ownerId, queryPath({ ...filters, limit: '3', cursor: next })));
      collected.push(...page.items);
      next = page.page.nextCursor;
    }
    assert.equal(new Set(collected.map((item) => item.catchId)).size, 23);
    assert.deepEqual(ids(collected), own.catchIds.sort());
  });

  test('토큰 없는 목록·상세·변경 요청은 공통 401이고 /v1 밖에는 기능 경로가 없다', async () => {
    const own = await seed();
    for (const [path, options] of [
      ['/v1/catches', {}], [detailPath(own.catchId), {}],
      [confirmPath(own.catchId), { method: 'PUT', body: CONFIRMED }],
      [mismatchPath(own.catchId), { method: 'PUT', body: { mismatch: true } }],
    ]) failure(await request(undefined, path, options), 401, 'AUTH_REQUIRED');
    failure(await request(own.ownerId, '/catches'), 404, 'RESOURCE_UNAVAILABLE');
  });

  test('타인·없는·UUID가 아닌 Catch는 같은 404이며 다른 회원 입력으로 우회하지 못한다', async () => {
    const own = await seed();
    const foreign = await seed();
    const beforeState = await snapshot();
    let expected;
    for (const catchId of [foreign.catchId, randomUUID(), 'synthetic-not-a-uuid']) {
      for (const [path, options] of [
        [detailPath(catchId), {}],
        [confirmPath(catchId), { method: 'PUT', body: CONFIRMED }],
        [mismatchPath(catchId), { method: 'PUT', body: { mismatch: true } }],
      ]) {
        const error = failure(await request(own.ownerId, path, options), 404, 'RESOURCE_UNAVAILABLE');
        if (expected) assert.deepEqual(error, expected);
        else expected = error;
      }
    }
    failure(await request(own.ownerId, queryPath({ memberId: foreign.ownerId })), 400, 'INVALID_REQUEST');
    assert.deepEqual(await snapshot(), beforeState);
  });

  test('목록·상세 쿼리와 PUT 본문은 추가 키·중복 키·잘못된 타입을 400으로 거부한다', async () => {
    const own = await seed();
    const beforeState = await snapshot();
    const badQueries = [
      'limit=0', 'limit=101', 'limit=-1', 'limit=1.5', 'limit=1e2', 'limit=01',
      'limit=true', 'limit=1&limit=2', 'repositoryId=', 'repositoryId=a&repositoryId=b',
      'sourceRequestId=', 'cursor=', 'cursor=not-a-cursor', 'cursor=abc%3D', 'unknown=value',
    ];
    for (const query of badQueries) failure(await request(own.ownerId, '/v1/catches?' + query), 400, 'INVALID_REQUEST');
    failure(await request(own.ownerId, detailPath(own.catchId) + '?limit=1'), 400, 'INVALID_REQUEST');
    for (const body of [
      {}, { workFactsConfirmed: true }, { workFactsConfirmed: false, contributionConfirmed: true },
      { workFactsConfirmed: true, contributionConfirmed: false },
      { workFactsConfirmed: 'true', contributionConfirmed: true }, { ...CONFIRMED, visibility: 'PUBLIC' }, [], null,
    ]) failure(await request(own.ownerId, confirmPath(own.catchId), { method: 'PUT', body }), 400, 'INVALID_REQUEST');
    for (const body of [
      {}, { mismatch: 'true' }, { mismatch: 1 }, { mismatch: null }, { mismatch: true, ownerId: own.ownerId }, [], null,
    ]) failure(await request(own.ownerId, mismatchPath(own.catchId), { method: 'PUT', body }), 400, 'INVALID_REQUEST');
    failure(await request(own.ownerId, confirmPath(own.catchId), { method: 'PUT', rawBody: '{"workFactsConfirmed":' }), 400, 'INVALID_REQUEST');
    failure(await request(own.ownerId, mismatchPath(own.catchId) + '?ignored=true', {
      method: 'PUT', body: { mismatch: true },
    }), 400, 'INVALID_REQUEST');
    assert.deepEqual(await snapshot(), beforeState);
  });

  test('확인은 두 값을 함께 true로 저장하고 PRIVATE·불일치·나머지 자료를 보존하며 반복 가능하다', async () => {
    const own = await seed();
    await db.query('UPDATE catch_asset SET mismatch = true WHERE catch_id = $1', [own.catchId]);
    const beforeAsset = await asset(own.catchId);
    const beforeState = await snapshot();
    const first = success(await request(own.ownerId, confirmPath(own.catchId), { method: 'PUT', body: CONFIRMED }));
    assert.deepEqual(first.confirmation, CONFIRMED);
    assert.equal(first.visibility, 'PRIVATE');
    assert.equal(first.mismatch, true);
    const expectedAsset = { ...beforeAsset, work_facts_confirmed: true, contribution_confirmed: true };
    assert.deepEqual(await asset(own.catchId), expectedAsset);
    const afterState = await snapshot();
    assert.deepEqual(afterState, { ...beforeState, assets: [expectedAsset] });
    assert.deepEqual(success(await request(own.ownerId, confirmPath(own.catchId), { method: 'PUT', body: CONFIRMED })), first);
    assert.deepEqual(await snapshot(), afterState);
  });

  test('불일치는 true/false 상태 지정이며 공개·확인·본문·출처·근거를 바꾸지 않는다', async () => {
    const own = await seed();
    await db.query(`UPDATE catch_asset SET visibility = 'PUBLIC',
      work_facts_confirmed = true, contribution_confirmed = true WHERE catch_id = $1`, [own.catchId]);
    const beforeState = await snapshot();
    const beforeResponse = success(await request(own.ownerId, detailPath(own.catchId)));
    for (const mismatch of [true, true, false, false]) {
      const response = success(await request(own.ownerId, mismatchPath(own.catchId), { method: 'PUT', body: { mismatch } }));
      assert.deepEqual(response, { ...beforeResponse, mismatch });
      assert.deepEqual(await snapshot(), {
        ...beforeState, assets: [{ ...beforeState.assets[0], mismatch }],
      });
    }
  });

  test('SOURCE_PRIVATE도 본인은 조회하고 제한 상태를 보며 자동 공개 변경은 없다', async () => {
    const own = await seed({ restriction: 'SOURCE_PRIVATE' });
    const beforeState = await snapshot();
    const detail = success(await request(own.ownerId, detailPath(own.catchId)));
    assert.equal(detail.restriction, 'SOURCE_PRIVATE');
    assert.equal(detail.visibility, 'PRIVATE');
    assert.deepEqual(success(await request(own.ownerId)), { items: [detail], page: { nextCursor: null } });
    assert.deepEqual(await snapshot(), beforeState);
  });

  test('보호 판단 행 누락은 상세·전체 목록의 500이며 NONE 또는 빈 목록으로 숨기지 않는다', async () => {
    const own = await seed();
    const healthy = await seed({ ownerId: own.ownerId, repositoryId: 'synthetic-healthy-repository' });
    await db.query('DELETE FROM repository_protection WHERE owner_id = $1 AND repository_id = $2',
      [own.ownerId, own.repositoryId]);
    const beforeState = await snapshot();
    failure(await request(own.ownerId, detailPath(own.catchId)), 500, 'INTERNAL_ERROR');
    failure(await request(own.ownerId), 500, 'INTERNAL_ERROR');
    assert.equal(success(await request(own.ownerId, detailPath(healthy.catchId))).restriction, 'NONE');
    assert.deepEqual(await snapshot(), beforeState);
  });

  test('실제 DB 조회 오류는 상세·목록의 500이며 SQL이나 빈 자료를 응답하지 않는다', async () => {
    const own = await seed();
    const beforeState = await snapshot();
    // 이 suite의 무작위 스키마 안에서만 테이블을 잠시 바꿔 실제 undefined_table 오류를 만든다.
    await db.query('ALTER TABLE catch_evidence RENAME TO owner_http_unavailable_evidence');
    try {
      for (const path of ['/v1/catches', detailPath(own.catchId)]) {
        const response = await request(own.ownerId, path);
        failure(response, 500, 'INTERNAL_ERROR');
        assert.doesNotMatch(response.text, /catch_evidence|SELECT|stack|items|owner_http_unavailable_evidence/i);
      }
    } finally {
      await db.query('ALTER TABLE owner_http_unavailable_evidence RENAME TO catch_evidence');
    }
    assert.deepEqual(await snapshot(), beforeState);
  });

  test('실제 DB 변경 실패는 확인·불일치 PUT을 500으로 끝내고 전체 자료를 보존한다', async () => {
    const own = await seed();
    const beforeState = await snapshot();
    await db.query(`ALTER TABLE catch_asset ADD CONSTRAINT owner_http_reject_changes
      CHECK (NOT work_facts_confirmed AND NOT contribution_confirmed AND NOT mismatch)`);
    try {
      for (const [path, body] of [
        [confirmPath(own.catchId), CONFIRMED], [mismatchPath(own.catchId), { mismatch: true }],
      ]) {
        failure(await request(own.ownerId, path, { method: 'PUT', body }), 500, 'INTERNAL_ERROR');
        assert.deepEqual(await snapshot(), beforeState);
      }
    } finally {
      await db.query('ALTER TABLE catch_asset DROP CONSTRAINT owner_http_reject_changes');
    }
  });

  test('저장 뒤 응답 무결성 검사 실패도 확인·불일치 변경을 함께 롤백한다', async () => {
    const own = await seed();
    // DB의 text CHECK는 만족하지만 계약의 URI가 아닌 자료: 응답 매핑 단계에서 실패해야 한다.
    await db.query('UPDATE catch_evidence SET source_url = $1 WHERE catch_id = $2', ['synthetic-invalid-uri', own.catchId]);
    const beforeState = await snapshot();
    for (const [path, body] of [
      [confirmPath(own.catchId), CONFIRMED], [mismatchPath(own.catchId), { mismatch: true }],
    ]) {
      failure(await request(own.ownerId, path, { method: 'PUT', body }), 500, 'INTERNAL_ERROR');
      assert.deepEqual(await snapshot(), beforeState);
    }
  });
});

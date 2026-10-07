require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { after, before, beforeEach, describe, test } = require('node:test');
const { candidate, readCatchTestDatabase, createCatchDbFixture } = require('../support/catch-db-fixture.cjs');

const config = readCatchTestDatabase();
const CONFIRMED = { workFactsConfirmed: true, contributionConfirmed: true };

// 실제 Nest HTTP·PostgreSQL·회원/분석 기반·B 코드를 연결한다.
// E 수신 기록은 실제 엔티티를 쓰되 입력·완료 상태·보호 관측은 합성 자료로 직접 준비한다.
// 실제 E 수신·완료 호출이나 Google 로그인을 검증하지 않는다.
describe('본인 Catch HTTP·PostgreSQL', {
  concurrency: false, timeout: 120000,
}, () => {
  let fixture;
  let db;
  let app;
  let origin;
  let tokens;
  let registerCandidates;
  let publicCatches;
  const issuedTokens = new Map();
  const envKeys = ['AUTH_JWT_SECRET', 'AUTH_ACCESS_TOKEN_TTL_SECONDS', 'DEV_LOGIN_ENABLED', 'NODE_ENV'];
  let previousEnv;

  before(async () => {
    previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
    process.env.AUTH_JWT_SECRET = randomBytes(32).toString('hex');
    process.env.AUTH_ACCESS_TOKEN_TTL_SECONDS = '600';
    process.env.NODE_ENV = 'test';
    process.env.DEV_LOGIN_ENABLED = 'true';

    fixture = await createCatchDbFixture(config);
    db = fixture.dataSource;
    // 실제 회원·분석·E 수신 기록·B 엔티티와 마이그레이션을 적용한다.

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
    // 요청과 불변 동의가 같은 저장소를 참조하도록 생성 시 전달한다. 보호 관측도 명시적인 시험 자료다.
    const input = await fixture.receipt({ ownerId, candidates }, { repositoryId, protection: restriction });
    const results = await db.transaction(async (manager) => {
      const registered = await registerCandidates(manager, input);
      // 본인 조회용 완료 상태를 E 처리 대역으로 준비한다. 이후 같은 회원의 새 요청도 ACTIVE 1개 제약을 지킨다.
      await manager.query("UPDATE analysis_attempt SET application = 'APPLIED', owner_results_ready = true WHERE attempt_id = $1", [input.attemptId]);
      await manager.query("UPDATE analysis_request SET lifecycle = 'CLOSED' WHERE request_id = $1", [input.requestId]);
      return registered;
    });
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
      consents: await db.query('SELECT * FROM analysis_consent ORDER BY consent_id'),
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
  const visibilityPath = (catchId) => detailPath(catchId) + '/visibility';
  const ids = (items) => items.map((item) => item.catchId).sort();

  test('개발 로그인 회원이 조회·확인·공개·숨김하고 타인 변경은 거부하며 수신자 조회에 반영한다', async () => {
    // 실제 개발 로그인 경로를 사용한다. Google 인증과 E 분석 수신은 이 시험의 범위가 아니다.
    const login = async (identifier) => {
      const body = success(await request(undefined, '/v1/auth/dev-login', {
        method: 'POST', body: { memberId: identifier },
      }));
      assert.equal(body.tokenType, 'Bearer');
      const memberId = await tokens.verify(body.accessToken);
      assert.match(memberId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      assert.notEqual(memberId, identifier);
      assert.deepEqual(await db.query('SELECT identity_reference FROM member_account WHERE member_id = $1', [memberId]),
        [{ identity_reference: 'catchu:dev-login:' + identifier }]);
      return { memberId, headers: { Authorization: 'Bearer ' + body.accessToken } };
    };
    const owner = await login('synthetic-owner-http-login');
    const other = await login('synthetic-other-http-login');
    assert.notEqual(owner.memberId, other.memberId);
    const own = await seed({ ownerId: owner.memberId });
    const beforeRead = await snapshot();
    const detail = success(await request(undefined, detailPath(own.catchId), { headers: owner.headers }));
    assert.equal(detail.catchId, own.catchId);
    assert.deepEqual(success(await request(undefined, '/v1/catches', { headers: owner.headers })), {
      items: [detail], page: { nextCursor: null },
    });
    assert.deepEqual(await snapshot(), beforeRead);
    const emptyPublic = { catches: [], page: { nextCursor: null } };
    failure(await request(undefined, visibilityPath(own.catchId), {
      headers: owner.headers, method: 'PUT', body: { visibility: 'PUBLIC' },
    }), 409, 'CONFIRMATION_REQUIRED');
    assert.deepEqual(await snapshot(), beforeRead);
    assert.deepEqual(await publicCatches.list(owner.memberId, {}), emptyPublic);
    const confirmed = success(await request(undefined, confirmPath(own.catchId), {
      headers: owner.headers, method: 'PUT', body: CONFIRMED,
    }));
    assert.deepEqual(confirmed.confirmation, CONFIRMED);
    assert.equal(confirmed.visibility, 'PRIVATE');
    assert.deepEqual(await asset(own.catchId), {
      ...beforeRead.assets[0], work_facts_confirmed: true, contribution_confirmed: true,
    });
    assert.deepEqual(await publicCatches.list(owner.memberId, {}), emptyPublic);
    const published = success(await request(undefined, visibilityPath(own.catchId), {
      headers: owner.headers, method: 'PUT', body: { visibility: 'PUBLIC' },
    }));
    assert.equal(published.visibility, 'PUBLIC');
    assert.deepEqual(published.confirmation, CONFIRMED);
    // C의 링크 인증 경로는 대체하지 않는다. 허용된 링크 소유자 ID로 호출하는 내부 조회만 검사한다.
    assert.deepEqual(ids((await publicCatches.list(owner.memberId, {})).catches), [own.catchId]);
    assert.equal((await publicCatches.get(owner.memberId, own.catchId)).catchId, own.catchId);
    const beforeForeign = await snapshot();
    assert.deepEqual(success(await request(undefined, '/v1/catches', { headers: other.headers })), {
      items: [], page: { nextCursor: null },
    });
    for (const [path, options] of [
      [detailPath(own.catchId), {}],
      [confirmPath(own.catchId), { method: 'PUT', body: CONFIRMED }],
      [mismatchPath(own.catchId), { method: 'PUT', body: { mismatch: true } }],
      [visibilityPath(own.catchId), { method: 'PUT', body: { visibility: 'PRIVATE' } }],
      [visibilityPath(own.catchId), { method: 'PUT', body: { visibility: 'PUBLIC' } }],
    ]) failure(await request(undefined, path, { ...options, headers: other.headers }), 404, 'RESOURCE_UNAVAILABLE');
    assert.deepEqual(await snapshot(), beforeForeign);
    const hidden = success(await request(undefined, visibilityPath(own.catchId), {
      headers: owner.headers, method: 'PUT', body: { visibility: 'PRIVATE' },
    }));
    assert.equal(hidden.visibility, 'PRIVATE');
    assert.deepEqual(hidden.confirmation, CONFIRMED);
    assert.deepEqual(await publicCatches.list(owner.memberId, {}), emptyPublic);
    await assert.rejects(publicCatches.get(owner.memberId, own.catchId), { status: 404 });
    assert.deepEqual(await snapshot(), {
      ...beforeRead,
      assets: [{ ...beforeRead.assets[0], work_facts_confirmed: true, contribution_confirmed: true }],
    });
  });

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
      [visibilityPath(own.catchId), { method: 'PUT', body: { visibility: 'PUBLIC' } }],
    ]) failure(await request(undefined, path, options), 401, 'AUTH_REQUIRED');
    failure(await request(own.ownerId, '/catches'), 404, 'RESOURCE_UNAVAILABLE');
  });

  for (const kind of ['legacy-sub', 'missing-member', 'deleted-member']) {
    test('유효한 서명이어도 ' + kind + ' 토큰은 Catch 조회·변경을 401로 거부한다', async () => {
      const own = await seed();
      let memberId = kind === 'legacy-sub' ? 'synthetic-legacy-subject' : randomUUID();
      if (kind === 'deleted-member') {
        const login = success(await request(undefined, '/v1/auth/dev-login', {
          method: 'POST', body: { memberId: 'synthetic-deleted-member' },
        }));
        memberId = await tokens.verify(login.accessToken);
        issuedTokens.set(memberId, login.accessToken);
        // 토큰 발급 뒤 회원을 실제로 삭제한다. 이 합성 회원에는 분석·Catch가 없다.
        await db.transaction(async (manager) => {
          await manager.query('DELETE FROM github_connection WHERE member_id = $1', [memberId]);
          await manager.query('DELETE FROM member_profile WHERE member_id = $1', [memberId]);
          await manager.query('DELETE FROM member_account WHERE member_id = $1', [memberId]);
        });
      }
      const beforeState = await snapshot();
      const calls = [
        ['/v1/catches', {}],
        [queryPath({ sourceRequestId: 'synthetic-unknown-request' }), {}],
        ...[own.catchId, 'synthetic-not-a-uuid'].flatMap((catchId) => [
          [detailPath(catchId), {}],
          [confirmPath(catchId), { method: 'PUT', body: CONFIRMED }],
          [mismatchPath(catchId), { method: 'PUT', body: { mismatch: true } }],
          [visibilityPath(catchId), { method: 'PUT', body: { visibility: 'PUBLIC' } }],
          [visibilityPath(catchId), { method: 'PUT', body: { visibility: 'PRIVATE' } }],
        ]),
      ];
      for (const [path, options] of calls) {
        const response = await request(memberId, path, options);
        failure(response, 401, 'AUTH_INVALID');
        assert.ok(!response.text.includes(memberId));
        assert.ok(!response.text.includes(issuedTokens.get(memberId)));
      }
      assert.deepEqual(await snapshot(), beforeState);
    });
  }

  test('회원 조회 DB 오류는 인증 거부나 빈 목록이 아닌 안전한 500으로 처리한다', async () => {
    const own = await seed();
    const beforeState = await snapshot();
    await db.query('ALTER TABLE member_account RENAME TO member_account_unavailable');
    try {
      for (const [path, options] of [
        ['/v1/catches', {}], [detailPath(own.catchId), {}],
        [confirmPath(own.catchId), { method: 'PUT', body: CONFIRMED }],
        [mismatchPath(own.catchId), { method: 'PUT', body: { mismatch: true } }],
        [visibilityPath(own.catchId), { method: 'PUT', body: { visibility: 'PUBLIC' } }],
        [visibilityPath(own.catchId), { method: 'PUT', body: { visibility: 'PRIVATE' } }],
      ]) failure(await request(own.ownerId, path, options), 500, 'INTERNAL_ERROR');
    } finally {
      await db.query('ALTER TABLE member_account_unavailable RENAME TO member_account');
    }
    assert.deepEqual(await snapshot(), beforeState);
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
        [visibilityPath(catchId), { method: 'PUT', body: { visibility: 'PUBLIC' } }],
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

  for (const [missing, assignment] of [
    ['상태 SQL null', 'confirmed_source_state = NULL'],
    ['상태 JSON null', "confirmed_source_state = 'null'::jsonb"],
    ['출처 SQL null', 'observation_provenance = NULL'],
    ['출처 JSON null', "observation_provenance = 'null'::jsonb"],
    ['시각 SQL null', 'observed_at = NULL'],
    ['조회 실패만 존재', 'confirmed_source_state = NULL, observation_provenance = NULL, observed_at = NULL'],
  ]) {
    test('보호 관측 ' + missing + '은 조회 500과 확인·불일치 저장 롤백으로 처리한다', async () => {
      const own = await seed();
      const healthy = await seed({ ownerId: own.ownerId, repositoryId: 'synthetic-healthy-repository' });
      // assignment는 위 고정 시험 사례다. SQL null과 JSON null을 따로 저장해 조회 매핑도 확인한다.
      await db.query(
        'UPDATE repository_protection SET ' + assignment + ', observation_failure = $3::jsonb WHERE owner_id = $1 AND repository_id = $2',
        [own.ownerId, own.repositoryId, JSON.stringify({ synthetic: true, reason: 'TIMEOUT' })],
      );
      const beforeState = await snapshot();
      failure(await request(own.ownerId, detailPath(own.catchId)), 500, 'INTERNAL_ERROR');
      failure(await request(own.ownerId), 500, 'INTERNAL_ERROR');
      assert.equal(success(await request(own.ownerId, detailPath(healthy.catchId))).restriction, 'NONE');
      assert.deepEqual(await snapshot(), beforeState);
      for (const [path, body] of [
        [confirmPath(own.catchId), CONFIRMED], [mismatchPath(own.catchId), { mismatch: true }],
      ]) {
        failure(await request(own.ownerId, path, { method: 'PUT', body }), 500, 'INTERNAL_ERROR');
        assert.deepEqual(await snapshot(), beforeState);
      }
    });
  }

  test('유효 관측 뒤 최근 조회 실패가 있어도 본인 조회·확인·불일치를 허용한다', async () => {
    for (const restriction of ['NONE', 'SOURCE_PRIVATE']) {
      const own = await seed({ restriction });
      await db.query('UPDATE repository_protection SET observation_failure = $3::jsonb WHERE owner_id = $1 AND repository_id = $2',
        [own.ownerId, own.repositoryId, JSON.stringify({ synthetic: true, reason: 'TIMEOUT' })]);
      const beforeState = await snapshot();
      const detail = success(await request(own.ownerId, detailPath(own.catchId)));
      assert.equal(detail.restriction, restriction);
      assert.deepEqual(success(await request(own.ownerId)), { items: [detail], page: { nextCursor: null } });
      assert.deepEqual(await snapshot(), beforeState);
      const confirmed = success(await request(own.ownerId, confirmPath(own.catchId), { method: 'PUT', body: CONFIRMED }));
      assert.deepEqual(confirmed, { ...detail, confirmation: CONFIRMED });
      const mismatched = success(await request(own.ownerId, mismatchPath(own.catchId), { method: 'PUT', body: { mismatch: true } }));
      assert.deepEqual(mismatched, { ...confirmed, mismatch: true });
      assert.deepEqual(await snapshot(), {
        ...beforeState,
        assets: beforeState.assets.map((row) => row.catch_id === own.catchId
          ? { ...row, work_facts_confirmed: true, contribution_confirmed: true, mismatch: true } : row),
      });
    }
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

  async function changeVisibility(own, visibility) {
    return request(own.ownerId, visibilityPath(own.catchId), { method: 'PUT', body: { visibility } });
  }

  async function publish(own) {
    success(await request(own.ownerId, confirmPath(own.catchId), { method: 'PUT', body: CONFIRMED }));
    return success(await changeVisibility(own, 'PUBLIC'));
  }

  test('공개 PUT은 PUBLIC/PRIVATE만 받고 추가 필드·쿼리·잘못된 본문을 거절한다', async () => {
    const own = await seed();
    const beforeState = await snapshot();
    for (const body of [{}, null, [], { visibility: true }, { visibility: 'public' },
      { visibility: 'HIDDEN' }, { visibility: null }, { visibility: 'PUBLIC', ownerId: own.ownerId },
      { visibility: 'PUBLIC', workFactsConfirmed: true }]) {
      failure(await request(own.ownerId, visibilityPath(own.catchId), { method: 'PUT', body }), 400, 'INVALID_REQUEST');
    }
    failure(await request(own.ownerId, visibilityPath(own.catchId) + '?ownerId=' + own.ownerId,
      { method: 'PUT', body: { visibility: 'PUBLIC' } }), 400, 'INVALID_REQUEST');
    failure(await request(own.ownerId, visibilityPath(own.catchId),
      { method: 'PUT', rawBody: '{"visibility":' }), 400, 'INVALID_REQUEST');
    assert.deepEqual(await snapshot(), beforeState);
  });

  test('두 확인 항목을 모두 저장하기 전에는 409이며 PRIVATE을 유지한다', async () => {
    const own = await seed();
    for (const flags of [[false, false], [true, false], [false, true]]) {
      await db.query('UPDATE catch_asset SET work_facts_confirmed = $2, contribution_confirmed = $3 WHERE catch_id = $1',
        [own.catchId, ...flags]);
      const beforeState = await snapshot();
      failure(await changeVisibility(own, 'PUBLIC'), 409, 'CONFIRMATION_REQUIRED');
      assert.deepEqual(await snapshot(), beforeState);
    }
  });

  test('생성·확인 후에는 비공개, 별도 공개 후 노출, 숨긴 뒤 다음 공개 조회에서 제외된다', async () => {
    const own = await seed();
    const empty = { catches: [], page: { nextCursor: null } };
    assert.deepEqual(await publicCatches.list(own.ownerId, {}), empty);
    success(await request(own.ownerId, confirmPath(own.catchId), { method: 'PUT', body: CONFIRMED }));
    assert.deepEqual(await publicCatches.list(own.ownerId, {}), empty);
    const beforeState = await snapshot();
    const published = success(await changeVisibility(own, 'PUBLIC'));
    assert.equal(published.visibility, 'PUBLIC');
    const expected = { ...beforeState, assets: [{ ...beforeState.assets[0], visibility: 'PUBLIC' }] };
    assert.deepEqual(await snapshot(), expected);
    assert.deepEqual(success(await changeVisibility(own, 'PUBLIC')), published);
    assert.deepEqual(await snapshot(), expected);
    assert.deepEqual(ids((await publicCatches.list(own.ownerId, {})).catches), [own.catchId]);
    assert.equal((await publicCatches.get(own.ownerId, own.catchId)).catchId, own.catchId);
    const hidden = success(await changeVisibility(own, 'PRIVATE'));
    assert.equal(hidden.visibility, 'PRIVATE');
    assert.deepEqual(await publicCatches.list(own.ownerId, {}), empty);
    await assert.rejects(publicCatches.get(own.ownerId, own.catchId), { status: 404 });
    assert.deepEqual(success(await changeVisibility(own, 'PRIVATE')), hidden);
    assert.deepEqual(await snapshot(), beforeState);
  });

  test('불일치 표시와 초안·질문 생성 실패는 독립적이며 공개 필드만 전달한다', async () => {
    for (const status of ['GENERATED', 'FAILED', 'NOT_GENERATED']) {
      const source = candidate();
      source.draft = { status, content: status === 'GENERATED' ? '[합성] 공개 초안' : null };
      source.reflection = { status: 'FAILED', questions: [] };
      const own = await seed({ source });
      success(await request(own.ownerId, mismatchPath(own.catchId), { method: 'PUT', body: { mismatch: true } }));
      await publish(own);
      const result = await publicCatches.get(own.ownerId, own.catchId);
      assert.deepEqual(result, {
        catchId: own.catchId, title: source.title, workFacts: source.workFacts,
        subjectContribution: source.subjectContribution,
        evidence: source.evidence.map(({ sourceUrl, sourceRevision, representedFacts, contributionScope, coverageLimits }) =>
          ({ sourceUrl, sourceRevision, representedFacts, contributionScope, coverageLimits })),
        draft: source.draft,
      });
      assert.deepEqual((await publicCatches.list(own.ownerId, {})).catches, [result]);
      assert.equal((await asset(own.catchId)).mismatch, true);
    }
  });

  test('현재 원본 보호가 제한되면 공개는 409, 수신자는 제외, 본인 조회·숨김은 가능하다', async () => {
    const own = await seed();
    await publish(own);
    await db.query("UPDATE repository_protection SET applied_restriction = 'SOURCE_PRIVATE' WHERE owner_id = $1", [own.ownerId]);
    const beforeState = await snapshot();
    failure(await changeVisibility(own, 'PUBLIC'), 409, 'SOURCE_RESTRICTED');
    assert.deepEqual(await snapshot(), beforeState);
    assert.deepEqual(await publicCatches.list(own.ownerId, {}), { catches: [], page: { nextCursor: null } });
    await assert.rejects(publicCatches.get(own.ownerId, own.catchId), { status: 404 });
    assert.equal(success(await request(own.ownerId, detailPath(own.catchId))).restriction, 'SOURCE_PRIVATE');
    assert.equal(success(await changeVisibility(own, 'PRIVATE')).visibility, 'PRIVATE');
    // 확인되지 않은 자료에도 숨김은 허용한다.
    await db.query('UPDATE catch_asset SET work_facts_confirmed = false, contribution_confirmed = false WHERE catch_id = $1', [own.catchId]);
    assert.equal(success(await changeVisibility(own, 'PRIVATE')).visibility, 'PRIVATE');
  });

  test('수신자 상세에서 숨김·타인·없는·원본 제한 Catch는 동일한 404이다', async () => {
    const own = await seed();
    const foreign = await seed();
    await publish(foreign);
    for (const catchId of [own.catchId, foreign.catchId, randomUUID(), 'not-a-uuid']) {
      await assert.rejects(publicCatches.get(own.ownerId, catchId), { status: 404, message: 'Not Found' });
    }
    await publish(own);
    await db.query("UPDATE repository_protection SET applied_restriction = 'SOURCE_PRIVATE' WHERE owner_id = $1", [own.ownerId]);
    await assert.rejects(publicCatches.get(own.ownerId, own.catchId), { status: 404, message: 'Not Found' });
    assert.deepEqual(await publicCatches.list(own.ownerId, {}), { catches: [], page: { nextCursor: null } });
  });

  test('수신자 페이지는 현재 허용 집합을 조회하고 숨김·보호 변경을 다음 페이지에도 적용한다', async () => {
    const own = await seed({ count: 5 });
    for (const catchId of own.catchIds) await publish({ ...own, catchId });
    const sorted = own.catchIds.sort();
    const first = await publicCatches.list(own.ownerId, { limit: '1' });
    assert.deepEqual(ids(first.catches), [sorted[0]]);
    await changeVisibility({ ...own, catchId: sorted[1] }, 'PRIVATE');
    const rest = await publicCatches.list(own.ownerId, { limit: '100', cursor: first.page.nextCursor });
    assert.deepEqual(ids(rest.catches), sorted.slice(2));
    assert.equal(rest.page.nextCursor, null);
    await db.query("UPDATE repository_protection SET applied_restriction = 'SOURCE_PRIVATE' WHERE owner_id = $1", [own.ownerId]);
    assert.deepEqual(await publicCatches.list(own.ownerId, { cursor: first.page.nextCursor }),
      { catches: [], page: { nextCursor: null } });
  });

  test('수신자 커서는 본인용·다른 소유자와 섞이지 않고 잘못된 필터를 거절한다', async () => {
    const own = await seed({ count: 2 });
    for (const catchId of own.catchIds) await publish({ ...own, catchId });
    const foreign = await seed();
    const first = await publicCatches.list(own.ownerId, { limit: '1' });
    const owner = success(await request(own.ownerId, queryPath({ limit: '1' })));
    for (const input of [{ cursor: owner.page.nextCursor }, { limit: '101' }, { limit: 20 }, { limit: ['1','2'] },
      { cursor: 'invalid' }, { repositoryId: own.repositoryId }, { ownerId: foreign.ownerId }, null, []]) {
      await assert.rejects(publicCatches.list(own.ownerId, input), { status: 400 });
    }
    await assert.rejects(publicCatches.list(foreign.ownerId, { cursor: first.page.nextCursor }), { status: 400 });
    failure(await request(own.ownerId, queryPath({ cursor: first.page.nextCursor })), 400, 'INVALID_REQUEST');
  });

  test('보호 행 누락·DB 오류·응답 무결성 오류를 공개 가능이나 빈 결과로 보정하지 않는다', async () => {
    const own = await seed();
    await publish(own);
    await db.query('DELETE FROM repository_protection WHERE owner_id = $1', [own.ownerId]);
    const beforeState = await snapshot();
    failure(await changeVisibility(own, 'PUBLIC'), 500, 'INTERNAL_ERROR');
    await assert.rejects(publicCatches.list(own.ownerId, {}), { name: 'CatchReadIntegrityError' });
    await assert.rejects(publicCatches.get(own.ownerId, own.catchId), { name: 'CatchReadIntegrityError' });
    assert.deepEqual(await snapshot(), beforeState);
    await db.query('ALTER TABLE catch_asset RENAME TO public_test_unavailable_asset');
    try {
      await assert.rejects(publicCatches.list(own.ownerId, {}), { name: 'QueryFailedError' });
      await assert.rejects(publicCatches.get(own.ownerId, own.catchId), { name: 'QueryFailedError' });
    } finally { await db.query('ALTER TABLE public_test_unavailable_asset RENAME TO catch_asset'); }
  });

  for (const [missing, assignment] of [
    ['상태 SQL null', 'confirmed_source_state = NULL'],
    ['상태 JSON null', "confirmed_source_state = 'null'::jsonb"],
    ['출처 SQL null', 'observation_provenance = NULL'],
    ['출처 JSON null', "observation_provenance = 'null'::jsonb"],
    ['시각 SQL null', 'observed_at = NULL'],
  ]) {
    test('보호 관측 ' + missing + '이면 공개 변경을 롤백하고 수신자 조회도 실패한다', async () => {
      const own = await seed({ count: 2 });
      const alreadyPublic = { ...own, catchId: own.catchIds[1] };
      await publish(alreadyPublic);
      success(await request(own.ownerId, confirmPath(own.catchId), { method: 'PUT', body: CONFIRMED }));
      // 두 Catch가 같은 보호 행을 사용한다. assignment는 위 고정 시험 사례다.
      await db.query('UPDATE repository_protection SET ' + assignment + ' WHERE owner_id = $1 AND repository_id = $2',
        [own.ownerId, own.repositoryId]);
      const beforeState = await snapshot();
      failure(await changeVisibility(own, 'PUBLIC'), 500, 'INTERNAL_ERROR');
      assert.equal((await asset(own.catchId)).visibility, 'PRIVATE');
      await assert.rejects(publicCatches.list(own.ownerId, {}), { name: 'CatchReadIntegrityError' });
      await assert.rejects(publicCatches.get(own.ownerId, alreadyPublic.catchId), { name: 'CatchReadIntegrityError' });
      assert.deepEqual(await snapshot(), beforeState);

      // 불완전한 관측은 SOURCE_PRIVATE여도 확인된 원본 제한(409)으로 판정하지 않는다.
      await db.query("UPDATE repository_protection SET applied_restriction = 'SOURCE_PRIVATE' WHERE owner_id = $1 AND repository_id = $2",
        [own.ownerId, own.repositoryId]);
      const restrictedState = await snapshot();
      failure(await changeVisibility(own, 'PUBLIC'), 500, 'INTERNAL_ERROR');
      assert.deepEqual(await snapshot(), restrictedState);
    });
  }

  test('이전 유효 관측에 최근 조회 실패가 추가되어도 공개와 수신자 조회를 허용한다', async () => {
    const own = await seed();
    success(await request(own.ownerId, confirmPath(own.catchId), { method: 'PUT', body: CONFIRMED }));
    await db.query('UPDATE repository_protection SET observation_failure = $3::jsonb WHERE owner_id = $1 AND repository_id = $2',
      [own.ownerId, own.repositoryId, JSON.stringify({ synthetic: true, reason: 'TIMEOUT' })]);
    const beforeState = await snapshot();
    const published = success(await changeVisibility(own, 'PUBLIC'));
    assert.equal(published.visibility, 'PUBLIC');
    assert.equal(published.restriction, 'NONE');
    const detail = await publicCatches.get(own.ownerId, own.catchId);
    assert.equal(detail.catchId, own.catchId);
    assert.deepEqual(await publicCatches.list(own.ownerId, {}), { catches: [detail], page: { nextCursor: null } });
    assert.deepEqual(await snapshot(), {
      ...beforeState, assets: [{ ...beforeState.assets[0], visibility: 'PUBLIC' }],
    });
  });

  test('공개 저장·응답 매핑에 실패하면 PUBLIC 변경을 롤백한다', async () => {
    const own = await seed();
    success(await request(own.ownerId, confirmPath(own.catchId), { method: 'PUT', body: CONFIRMED }));
    const beforeState = await snapshot();
    await db.query("ALTER TABLE catch_asset ADD CONSTRAINT public_test_reject_public CHECK (visibility = 'PRIVATE')");
    try {
      failure(await changeVisibility(own, 'PUBLIC'), 500, 'INTERNAL_ERROR');
      assert.deepEqual(await snapshot(), beforeState);
    } finally { await db.query('ALTER TABLE catch_asset DROP CONSTRAINT public_test_reject_public'); }
    await db.query('UPDATE catch_evidence SET source_url = $1 WHERE catch_id = $2', ['invalid-uri', own.catchId]);
    const invalidState = await snapshot();
    failure(await changeVisibility(own, 'PUBLIC'), 500, 'INTERNAL_ERROR');
    assert.deepEqual(await snapshot(), invalidState);
  });

  async function waitForBlockedQuery(pattern) {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const rows = await db.query(`SELECT 1 FROM pg_stat_activity WHERE datname = current_database()
        AND pid <> pg_backend_pid() AND state = 'active' AND wait_event_type = 'Lock' AND query LIKE $1`, [pattern]);
      if (rows.length > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.fail('검사 대상 쿼리가 DB 잠금에서 대기하지 않았습니다.');
  }

  test('보호 변경이 먼저 잠그면 공개 요청은 대기 후 최신 제한을 읽고 409로 거절한다', async () => {
    const own = await seed();
    success(await request(own.ownerId, confirmPath(own.catchId), { method: 'PUT', body: CONFIRMED }));
    const writer = db.createQueryRunner();
    await writer.connect();
    await writer.startTransaction();
    let pending;
    try {
      await writer.query("UPDATE repository_protection SET applied_restriction = 'SOURCE_PRIVATE' WHERE owner_id = $1", [own.ownerId]);
      pending = changeVisibility(own, 'PUBLIC');
      await waitForBlockedQuery('%repository_protection%FOR SHARE%');
      await writer.commitTransaction();
      failure(await pending, 409, 'SOURCE_RESTRICTED');
      assert.equal((await asset(own.catchId)).visibility, 'PRIVATE');
    } finally {
      if (writer.isTransactionActive) await writer.rollbackTransaction();
      if (pending) await pending;
      await writer.release();
    }
  });
});

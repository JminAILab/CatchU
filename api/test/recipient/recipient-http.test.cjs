require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { after, before, beforeEach, describe, test } = require('node:test');
const { candidate, readCatchTestDatabase, createCatchDbFixture } = require('../support/catch-db-fixture.cjs');

const config = readCatchTestDatabase();
const CONFIRMED = { workFactsConfirmed: true, contributionConfirmed: true };
const PASSWORD = 'synthetic-recipient-password';
const HOUR = 60 * 60 * 1000;
const PUBLIC_CATCH_KEYS = ['catchId', 'title', 'workFacts', 'subjectContribution', 'evidence', 'draft'];
const PROFILE_KEYS = ['displayName', 'introduction', 'desiredRole', 'skills', 'fieldSource'];

// #151 수신자 조회를 실제 Nest HTTP·PostgreSQL(격리 스키마)·#150 링크 판정·B 공개 Catch 조회로 검증한다.
// 공개 프로필은 A의 공급자가 정해지기 전이라 시험 대역을 주입한다. 대역 결과를 A 프로필 연동 검증으로 보지 않는다.
// 원본 비공개 제한은 합성 보호 관측 행으로 만든다. 실제 GitHub 원본 상태 관측을 검증하지 않는다.
describe('수신자 공개 조회 HTTP·PostgreSQL(#151)', { concurrency: false, timeout: 180000 }, () => {
  let fixture;
  let db;
  let app;
  let origin;
  let registerCandidates;
  let grantKey;
  let issueLinkGrant;
  const logs = [];
  const sessions = new Map();
  const secrets = new Set();
  const envKeys = ['AUTH_JWT_SECRET', 'AUTH_ACCESS_TOKEN_TTL_SECONDS', 'DEV_LOGIN_ENABLED', 'NODE_ENV',
    'SHARE_LINK_WEB_BASE_URL', 'LINK_GRANT_SECRET'];
  let previousEnv;

  // 시험 대역 공급자. 소유자별 값 또는 오류를 돌려주고 호출된 소유자 ID를 기록한다.
  const profileStub = {
    values: new Map(),
    calls: [],
    async read(ownerId) {
      this.calls.push(ownerId);
      const value = this.values.get(ownerId);
      if (value instanceof Error) throw value;
      if (typeof value === 'function') return value();
      return value;
    },
  };
  const profileOf = (name) => ({
    displayName: `[합성] ${name}`, introduction: `[합성] ${name} 소개`, desiredRole: '[합성] 백엔드', skills: ['[합성] TypeScript'],
    // 공급자가 다른 필드를 섞어 보내도 응답에 복사하지 않는지 확인하는 값이다.
    memberId: 'synthetic-leak-member-id', githubLogin: 'synthetic-leak-login', connectionState: 'REAUTH_REQUIRED',
  });

  before(async () => {
    previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
    Object.assign(process.env, {
      AUTH_JWT_SECRET: randomBytes(32).toString('hex'), AUTH_ACCESS_TOKEN_TTL_SECONDS: '900', DEV_LOGIN_ENABLED: 'true',
      NODE_ENV: 'test', SHARE_LINK_WEB_BASE_URL: 'https://catchu.example', LINK_GRANT_SECRET: randomBytes(32).toString('hex'),
    });
    fixture = await createCatchDbFixture(config);
    db = fixture.dataSource;

    const { Global, Module } = require('@nestjs/common');
    const { APP_INTERCEPTOR, NestFactory } = require('@nestjs/core');
    const { DataSource } = require('typeorm');
    const { AuthModule } = require('../../dist/auth/auth.module');
    const { ErrorsModule } = require('../../dist/common/errors/errors.module');
    const { NoStoreInterceptor } = require('../../dist/common/http/no-store.interceptor');
    const { CatchesModule } = require('../../dist/catches/catches.module');
    const { ShareLinksModule } = require('../../dist/share-links/share-links.module');
    const { RecipientModule } = require('../../dist/recipient/recipient.module');
    const { LINK_GRANT_KEY } = require('../../dist/share-links/link-grant');
    const { configureApp } = require('../../dist/app.setup');
    ({ registerCandidates } = require('../../dist/catches/registration-service'));
    ({ issueLinkGrant } = require('../../dist/share-links/link-grant'));

    class FixtureDatabaseModule {}
    Global()(FixtureDatabaseModule);
    Module({ providers: [{ provide: DataSource, useValue: db }], exports: [DataSource] })(FixtureDatabaseModule);
    class RecipientHttpModule {}
    Module({
      imports: [FixtureDatabaseModule, AuthModule, ErrorsModule, ShareLinksModule, CatchesModule,
        RecipientModule.register({ profileSource: profileStub })],
      providers: [{ provide: APP_INTERCEPTOR, useClass: NoStoreInterceptor }],
    })(RecipientHttpModule);
    const logger = Object.fromEntries(['log', 'error', 'warn', 'debug', 'verbose', 'fatal'].map((level) =>
      [level, (...args) => logs.push(args.map((arg) => (arg instanceof Error ? `${arg.message}\n${arg.stack}` : String(arg))).join(' '))]));
    app = await NestFactory.create(RecipientHttpModule, { logger, abortOnError: false });
    await configureApp(app);
    await app.listen(0, '127.0.0.1');
    origin = await app.getUrl();
    grantKey = app.get(LINK_GRANT_KEY, { strict: false });
  });

  after(async () => {
    try {
      if (app) await app.close();
    } finally {
      try {
        if (fixture) await fixture.close();
      } finally {
        for (const [key, value] of Object.entries(previousEnv ?? {})) {
          if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
      }
    }
  });

  beforeEach(async () => {
    sessions.clear();
    profileStub.values.clear();
    profileStub.calls.length = 0;
    await db.query('TRUNCATE repository_protection');
    await fixture.reset();
  });

  // ---- 준비: 회원 쪽 API(발급·확인·공개 전환)는 실제 경로를 쓰고, 수신자 요청에는 회원 토큰을 붙이지 않는다.
  async function memberRequest(ownerId, path, { method = 'GET', body, headers = {} } = {}) {
    if (!sessions.has(ownerId)) {
      const { SessionService } = require('../../dist/auth/session.service');
      const issued = await db.transaction((manager) => app.get(SessionService).create(manager, ownerId));
      sessions.set(ownerId, issued.access.accessToken);
    }
    const response = await fetch(origin + path, {
      method, signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${sessions.get(ownerId)}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }

  async function seed(ownerId, { count = 1, repositoryId = 'synthetic-repository', restriction = 'NONE', source } = {}) {
    const candidates = source ? [source] : Array.from({ length: count }, (_, index) => {
      const key = randomUUID();
      return candidate(`synthetic-candidate-${key}`, `synthetic-work-${index}-${key}`);
    });
    const input = await fixture.receipt({ ownerId, candidates }, { repositoryId, protection: restriction });
    const results = await db.transaction(async (manager) => {
      const registered = await registerCandidates(manager, input);
      await manager.query("UPDATE analysis_attempt SET application = 'APPLIED', owner_results_ready = true WHERE attempt_id = $1", [input.attemptId]);
      await manager.query("UPDATE analysis_request SET lifecycle = 'CLOSED' WHERE request_id = $1", [input.requestId]);
      return registered;
    });
    return results.map((result) => result.catchId);
  }

  async function setVisibility(ownerId, catchId, visibility) {
    if (visibility === 'PUBLIC') {
      const confirmed = await memberRequest(ownerId, `/v1/catches/${catchId}/confirmation`, { method: 'PUT', body: CONFIRMED });
      assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
    }
    const changed = await memberRequest(ownerId, `/v1/catches/${catchId}/visibility`, { method: 'PUT', body: { visibility } });
    assert.equal(changed.status, 200, JSON.stringify(changed.body));
  }

  async function publish(ownerId, options) {
    const ids = await seed(ownerId, options);
    for (const id of ids) await setVisibility(ownerId, id, 'PUBLIC');
    return ids;
  }

  let keySeq = 0;
  async function issue(ownerId, password) {
    keySeq += 1;
    // 같은 회원의 유효한 링크는 제목이 겹치면 안 되므로(LINK_TITLE_CONFLICT) 번호를 붙인다.
    const title = `[합성] 수신 링크 ${keySeq}`;
    const response = await memberRequest(ownerId, '/v1/share-links', {
      method: 'POST', headers: { 'Idempotency-Key': `recipient-${keySeq}` },
      body: password === undefined ? { title } : { title, password },
    });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    const token = response.body.url.split('/s/')[1];
    secrets.add(token);
    return { linkId: response.body.linkId, token, title };
  }

  async function unlock(token) {
    const response = await fetch(`${origin}/v1/public/links/${token}/unlock`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: PASSWORD }),
      signal: AbortSignal.timeout(10000),
    });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    secrets.add(body.grant);
    return body.grant;
  }

  /** 수신자 요청. Authorization을 붙이지 않는다. */
  async function recipient(path, { grant, headers = {} } = {}) {
    const response = await fetch(origin + path, {
      headers: { ...(grant === undefined ? {} : { 'X-Link-Grant': grant }), ...headers }, signal: AbortSignal.timeout(10000),
    });
    const text = await response.text();
    assert.equal(response.headers.get('cache-control'), 'no-store', `${path} ${response.status}`);
    assert.match(response.headers.get('content-type'), /^application\/json\b/);
    return { status: response.status, body: JSON.parse(text), text };
  }
  const collectionPath = (token, query) => `/v1/public/links/${token}${query ? `?${new URLSearchParams(query)}` : ''}`;
  const catchPath = (token, catchId, query) => `/v1/public/links/${token}/catches/${catchId}${query ? `?${new URLSearchParams(query)}` : ''}`;

  function ok(response) {
    assert.equal(response.status, 200, response.text);
    return response.body;
  }
  const FIXED = {
    LINK_UNAVAILABLE: { code: 'LINK_UNAVAILABLE', message: '이 링크는 열람할 수 없습니다.' },
    RESOURCE_UNAVAILABLE: { code: 'RESOURCE_UNAVAILABLE', message: '현재 열람할 수 없는 자료입니다.' },
    INTERNAL_ERROR: { code: 'INTERNAL_ERROR', message: '처리 중 오류가 발생했습니다.' },
  };
  function fails(response, status, code) {
    assert.equal(response.status, status, response.text);
    assert.equal(response.body.code, code);
    assert.ok(Object.keys(response.body).every((key) => ['code', 'message', 'details'].includes(key)));
    if (FIXED[code]) assert.deepEqual(response.body, FIXED[code]);
    return response.body;
  }
  function assertCollectionShape(body) {
    assert.deepEqual(Object.keys(body).sort(), ['catches', 'page', 'profile']);
    assert.deepEqual(Object.keys(body.profile).sort(), [...PROFILE_KEYS].sort());
    assert.equal(body.profile.fieldSource, 'SELF_REPORTED');
    assert.deepEqual(Object.keys(body.page), ['nextCursor']);
    for (const item of body.catches) assert.deepEqual(Object.keys(item).sort(), [...PUBLIC_CATCH_KEYS].sort());
  }
  const ids = (items) => items.map((item) => item.catchId).sort();

  test('비밀번호 없는 링크는 회원 토큰 없이 프로필과 현재 공개·제한 없음 Catch만 돌려준다', async () => {
    const owner = randomUUID();
    const other = randomUUID();
    profileStub.values.set(owner, profileOf('소유자'));
    profileStub.values.set(other, profileOf('다른 회원'));
    const [visible] = await publish(owner);
    const [hidden] = await seed(owner);
    // 공개 뒤 원본 비공개 관측이 적용된 상태를 합성 보호 행으로 만든다(SOURCE_PRIVATE는 새로 공개할 수 없다).
    const [restricted] = await publish(owner, { repositoryId: 'synthetic-private-repository' });
    await db.query("UPDATE repository_protection SET applied_restriction = 'SOURCE_PRIVATE' WHERE owner_id = $1 AND repository_id = $2",
      [owner, 'synthetic-private-repository']);
    const [foreign] = await publish(other);
    const link = await issue(owner);

    const body = ok(await recipient(collectionPath(link.token)));
    assertCollectionShape(body);
    assert.deepEqual(body.profile, {
      displayName: '[합성] 소유자', introduction: '[합성] 소유자 소개', desiredRole: '[합성] 백엔드',
      skills: ['[합성] TypeScript'], fieldSource: 'SELF_REPORTED',
    });
    assert.deepEqual(ids(body.catches), [visible]);
    assert.deepEqual(body.page, { nextCursor: null });
    assert.deepEqual(profileStub.calls, [owner]);
    // 링크 제목·링크 ID·소유자 ID와 공급자가 섞어 보낸 필드는 응답 어디에도 없다.
    for (const leaked of [link.linkId, owner, link.title, 'synthetic-leak-member-id', 'synthetic-leak-login', 'REAUTH_REQUIRED']) {
      assert.ok(!JSON.stringify(body).includes(leaked), leaked);
    }

    const detail = ok(await recipient(catchPath(link.token, visible)));
    assert.deepEqual(detail, body.catches[0]);
    // 숨김·원본 비공개 제한·다른 회원·없는·형식이 틀린 Catch는 같은 404다.
    for (const catchId of [hidden, restricted, foreign, randomUUID(), 'not-a-catch-id']) {
      fails(await recipient(catchPath(link.token, catchId)), 404, 'RESOURCE_UNAVAILABLE');
    }
    // 수신 경로는 Authorization을 쓰지 않는다. 무효한 값이 붙어도 회원 인증 판정을 하지 않는다.
    assert.deepEqual(ok(await recipient(collectionPath(link.token), { headers: { Authorization: 'Bearer invalid' } })), body);
  });

  test('공개 Catch가 0건이면 빈 목록 200이고, 제목·설명 초안의 null은 그대로 둔다', async () => {
    const owner = randomUUID();
    profileStub.values.set(owner, { displayName: '', introduction: '', desiredRole: '', skills: [] });
    await seed(owner, { count: 2 });
    const link = await issue(owner);
    const empty = ok(await recipient(collectionPath(link.token)));
    assertCollectionShape(empty);
    assert.deepEqual(empty, {
      profile: { displayName: '', introduction: '', desiredRole: '', skills: [], fieldSource: 'SELF_REPORTED' },
      catches: [], page: { nextCursor: null },
    });

    const source = candidate();
    source.evidence[0].coverageLimits = ['[합성] 리뷰 대화는 포함하지 않음'];
    const [nullable] = await publish(owner, { source: { ...source, title: null, draft: { status: 'FAILED', content: null } } });
    const listedResponse = await recipient(collectionPath(link.token));
    const listed = { ...ok(listedResponse), text: listedResponse.text };
    assert.equal(listed.catches.length, 1);
    assert.equal(listed.catches[0].title, null);
    assert.deepEqual(listed.catches[0].draft, { status: 'FAILED', content: null });
    // 근거의 기여 범위·한계를 보존하고, 내부 근거 ID·본인용 질문·확인·불일치·공개 상태는 넣지 않는다.
    assert.deepEqual(listed.catches[0].evidence, [{
      sourceUrl: 'https://example.invalid/pull/1', sourceRevision: 'synthetic-revision-1', representedFacts: ['[합성] 응답 변경'],
      contributionScope: '[합성] 응답 구현', coverageLimits: ['[합성] 리뷰 대화는 포함하지 않음'],
    }]);
    assert.deepEqual(listed.catches[0].workFacts, ['[합성] 오류 응답을 구분했다.']);
    assert.equal(listed.catches[0].subjectContribution, '[합성] 응답 분기를 구현했다.');
    for (const ownerOnly of ['synthetic-evidence-1', '[합성] 무엇을 확인했나요?', 'reflection', 'confirmation', 'mismatch', 'visibility', 'restriction', 'sourceMode']) {
      assert.ok(!listed.text.includes(ownerOnly), ownerOnly);
    }
    assert.deepEqual(ok(await recipient(catchPath(link.token, nullable))), listed.catches[0]);
  });

  test('비밀번호 링크는 이 링크의 유효한 grant만 통과하고, 다른 링크·위조·만료 grant는 401이다', async () => {
    const owner = randomUUID();
    profileStub.values.set(owner, profileOf('소유자'));
    const [visible] = await publish(owner);
    const locked = await issue(owner, PASSWORD);
    const sibling = await issue(owner, PASSWORD);

    // 비밀번호 확인 전에는 목록·상세 모두 401이고, 상세는 Catch가 있든 없든 같은 응답이다(존재 여부를 알리지 않는다).
    for (const path of [collectionPath(locked.token), catchPath(locked.token, visible), catchPath(locked.token, randomUUID()),
      catchPath(locked.token, 'not-a-catch-id'), collectionPath(locked.token, { limit: '0' })]) {
      fails(await recipient(path), 401, 'LINK_PASSWORD_REQUIRED');
    }
    const grant = await unlock(locked.token);
    const siblingGrant = await unlock(sibling.token);
    const linkExpiry = new Date((await db.query('SELECT expires_at FROM share_link WHERE link_id = $1', [locked.linkId]))[0].expires_at);
    const expiredGrant = issueLinkGrant(grantKey, locked.linkId, linkExpiry, new Date(Date.now() - 3 * HOUR));
    const [, payload] = grant.split('.');
    const tampered = `${grant.slice(0, -2)}${grant.endsWith('AA') ? 'AB' : 'AA'}`;
    const foreignKeyGrant = issueLinkGrant(randomBytes(32), locked.linkId, linkExpiry, new Date());
    for (const bad of [siblingGrant, expiredGrant, tampered, foreignKeyGrant, `g1.${payload}`, '', 'Bearer x', 'x'.repeat(600)]) {
      secrets.add(bad);
      fails(await recipient(collectionPath(locked.token), { grant: bad }), 401, 'LINK_PASSWORD_REQUIRED');
      fails(await recipient(catchPath(locked.token, visible), { grant: bad }), 401, 'LINK_PASSWORD_REQUIRED');
    }
    // grant는 헤더로만 받는다. 쿼리로 보내면 grant로 쓰지 않는다.
    fails(await recipient(collectionPath(locked.token, { grant })), 401, 'LINK_PASSWORD_REQUIRED');
    assert.deepEqual(profileStub.calls, [], '비밀번호 확인 전에는 프로필을 읽지 않는다');

    const body = ok(await recipient(collectionPath(locked.token), { grant }));
    assertCollectionShape(body);
    assert.deepEqual(ids(body.catches), [visible]);
    assert.deepEqual(ok(await recipient(catchPath(locked.token, visible), { grant })), body.catches[0]);
    // 다른 링크의 grant는 그 링크에서만 통한다.
    assert.deepEqual(ok(await recipient(collectionPath(sibling.token), { grant: siblingGrant })), body);
    // 비밀번호 없는 링크에 다른 링크의 grant를 붙여도 판정에 영향이 없다.
    const open = await issue(owner);
    assert.deepEqual(ok(await recipient(collectionPath(open.token), { grant })), body);
  });

  test('비밀번호 시도 제한으로 unlock이 막힌 동안에도 받아 둔 유효한 grant로 열람된다', async () => {
    const owner = randomUUID();
    profileStub.values.set(owner, profileOf('소유자'));
    const [visible] = await publish(owner);
    const link = await issue(owner, PASSWORD);
    const grant = await unlock(link.token);
    const attempt = async (password) => {
      const response = await fetch(`${origin}/v1/public/links/${link.token}/unlock`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }), signal: AbortSignal.timeout(10000),
      });
      return { status: response.status, body: await response.json() };
    };
    // 같은 주소에서 15분 안에 10번 틀리면 차단된다(#150). 차단 뒤에는 올바른 비밀번호도 429다.
    for (let index = 0; index < 10; index += 1) assert.equal((await attempt(`${PASSWORD}-wrong-${index}`)).status, 401);
    const blocked = await attempt(PASSWORD);
    assert.equal(blocked.status, 429, JSON.stringify(blocked.body));
    assert.equal(blocked.body.code, 'LINK_UNLOCK_LIMITED');
    // 조회 GET에는 시도 제한을 두지 않는다. 받아 둔 grant로는 계속 열리고, grant가 없으면 여전히 401이다.
    assert.equal(ok(await recipient(collectionPath(link.token), { grant })).catches.length, 1);
    ok(await recipient(catchPath(link.token, visible), { grant }));
    fails(await recipient(collectionPath(link.token)), 401, 'LINK_PASSWORD_REQUIRED');
  });

  test('유효한 grant가 있어도 중단·만료·없는 링크는 같은 404 LINK_UNAVAILABLE이다', async () => {
    const owner = randomUUID();
    profileStub.values.set(owner, profileOf('소유자'));
    const [visible] = await publish(owner);
    const stopped = await issue(owner, PASSWORD);
    const expired = await issue(owner, PASSWORD);
    const stoppedGrant = await unlock(stopped.token);
    const expiredGrant = await unlock(expired.token);
    ok(await recipient(collectionPath(stopped.token), { grant: stoppedGrant }));
    ok(await recipient(collectionPath(expired.token), { grant: expiredGrant }));

    // 중단은 회원 API로, 만료는 발급 시각을 옮겨 만든다(#150 시험과 같은 방식).
    const stop = await memberRequest(owner, `/v1/share-links/${stopped.linkId}/stop`, { method: 'PUT' });
    assert.equal(stop.status, 200, JSON.stringify(stop.body));
    await db.query("UPDATE share_link SET issued_at = $2, expires_at = $2::timestamptz + interval '720 hours' WHERE link_id = $1",
      [expired.linkId, new Date(Date.now() - 721 * HOUR)]);
    profileStub.calls.length = 0;
    const { generateLinkToken } = require('../../dist/share-links/link-token');
    for (const [token, grant] of [[stopped.token, stoppedGrant], [expired.token, expiredGrant], [generateLinkToken(), stoppedGrant],
      ['not-a-token', undefined], [stopped.token, undefined]]) {
      fails(await recipient(collectionPath(token), { grant }), 404, 'LINK_UNAVAILABLE');
      fails(await recipient(catchPath(token, visible), { grant }), 404, 'LINK_UNAVAILABLE');
      fails(await recipient(collectionPath(token, { limit: 'bad' }), { grant }), 404, 'LINK_UNAVAILABLE');
    }
    assert.deepEqual(profileStub.calls, []);
  });

  test('다음 페이지도 매번 링크·grant와 현재 공개 상태를 다시 판정한다', async () => {
    const owner = randomUUID();
    profileStub.values.set(owner, profileOf('소유자'));
    const published = (await publish(owner, { count: 4 })).sort();
    const link = await issue(owner, PASSWORD);
    const grant = await unlock(link.token);

    const first = ok(await recipient(collectionPath(link.token, { limit: '2' }), { grant }));
    assert.deepEqual(ids(first.catches), published.slice(0, 2));
    assert.equal(typeof first.page.nextCursor, 'string');
    // 다음 페이지에 있던 Catch를 숨기면 cursor가 있어도 보이지 않는다.
    await setVisibility(owner, published[2], 'PRIVATE');
    const second = ok(await recipient(collectionPath(link.token, { limit: '2', cursor: first.page.nextCursor }), { grant }));
    assert.deepEqual(ids(second.catches), [published[3]]);
    assert.equal(second.page.nextCursor, null);
    // cursor만으로는 열람 권한이 없다.
    fails(await recipient(collectionPath(link.token, { limit: '2', cursor: first.page.nextCursor })), 401, 'LINK_PASSWORD_REQUIRED');
    // 원본 비공개 관측(합성)이 적용되면 다음 요청부터 빠진다.
    await db.query("UPDATE repository_protection SET applied_restriction = 'SOURCE_PRIVATE' WHERE owner_id = $1", [owner]);
    assert.deepEqual(ok(await recipient(collectionPath(link.token, { limit: '2', cursor: first.page.nextCursor }), { grant })).catches, []);
    fails(await recipient(catchPath(link.token, published[3]), { grant }), 404, 'RESOURCE_UNAVAILABLE');
    await db.query("UPDATE repository_protection SET applied_restriction = 'NONE' WHERE owner_id = $1", [owner]);
    // 링크를 중단하면 받아 둔 cursor·grant로도 열 수 없다.
    const stop = await memberRequest(owner, `/v1/share-links/${link.linkId}/stop`, { method: 'PUT' });
    assert.equal(stop.status, 200, JSON.stringify(stop.body));
    fails(await recipient(collectionPath(link.token, { limit: '2', cursor: first.page.nextCursor }), { grant }), 404, 'LINK_UNAVAILABLE');
  });

  test('잘못된 쿼리와 다른 소유자 링크의 cursor는 400이다', async () => {
    const owner = randomUUID();
    const other = randomUUID();
    profileStub.values.set(owner, profileOf('소유자'));
    profileStub.values.set(other, profileOf('다른 회원'));
    const [visible] = await publish(owner, { count: 3 });
    await publish(other, { count: 3 });
    const link = await issue(owner);
    const otherLink = await issue(other);
    const otherCursor = ok(await recipient(collectionPath(otherLink.token, { limit: '1' }))).page.nextCursor;
    assert.equal(typeof otherCursor, 'string');
    for (const query of [{ limit: '0' }, { limit: '101' }, { limit: 'abc' }, { limit: '1.5' }, { cursor: 'not-a-cursor' },
      { cursor: otherCursor }, { unknown: '1' }, { grant: 'x' }]) {
      fails(await recipient(collectionPath(link.token, query)), 400, 'INVALID_REQUEST');
    }
    fails(await recipient(`/v1/public/links/${link.token}?limit=1&limit=2`), 400, 'INVALID_REQUEST');
    fails(await recipient(catchPath(link.token, visible, { limit: '1' })), 400, 'INVALID_REQUEST');
    assert.equal(ok(await recipient(collectionPath(link.token, { limit: '100' }))).catches.length, 3);
  });

  test('링크마다 사본을 만들지 않고 소유자의 현재 프로필·Catch를 읽는다', async () => {
    const owner = randomUUID();
    let version = 1;
    profileStub.values.set(owner, () => ({ ...profileOf(`소유자 ${version}`) }));
    const [first, second] = (await publish(owner, { count: 2 })).sort();
    const linkA = await issue(owner);
    const linkB = await issue(owner, PASSWORD);
    const grantB = await unlock(linkB.token);
    const before = await db.query('SELECT count(*)::int AS n FROM catch_asset');

    const a1 = ok(await recipient(collectionPath(linkA.token)));
    assert.deepEqual(ok(await recipient(collectionPath(linkB.token), { grant: grantB })), a1);
    version = 2;
    await setVisibility(owner, first, 'PRIVATE');
    for (const [token, grant] of [[linkA.token, undefined], [linkB.token, grantB]]) {
      const now = ok(await recipient(collectionPath(token), { grant }));
      assert.equal(now.profile.displayName, '[합성] 소유자 2');
      assert.deepEqual(ids(now.catches), [second]);
      fails(await recipient(catchPath(token, first), { grant }), 404, 'RESOURCE_UNAVAILABLE');
    }
    // 조회 전후 Catch 행 수가 같다(링크마다 Catch 사본을 만들지 않는다). 모든 쓰기가 없다는 증거는 아니다.
    assert.deepEqual(await db.query('SELECT count(*)::int AS n FROM catch_asset'), before);
  });

  test('프로필·Catch 읽기 실패는 빈 결과가 아니라 500이다', async () => {
    const owner = randomUUID();
    const [visible] = await publish(owner);
    const link = await issue(owner);
    const { ApiError } = require('../../dist/common/errors');
    const { ForbiddenException, NotFoundException, UnauthorizedException } = require('@nestjs/common');
    // 공급자가 업무 오류·HTTP 예외를 던져도 수신자 응답 코드를 정하지 못하고 500이다(비활성 소유자 정책은 A와 합의 전).
    for (const error of [new ApiError('RESOURCE_UNAVAILABLE'), new ApiError('AUTH_REQUIRED'), new ApiError('LINK_UNAVAILABLE'),
      new ApiError('INTERNAL_ERROR'), new NotFoundException(), new UnauthorizedException(), new ForbiddenException()]) {
      profileStub.values.set(owner, error);
      fails(await recipient(collectionPath(link.token)), 500, 'INTERNAL_ERROR');
    }
    // 공급자 오류와 계약 모양이 아닌 값은 기본값으로 채우지 않는다.
    for (const value of [new Error('synthetic profile source failure'), undefined, null, [], 'text',
      { displayName: '[합성]', introduction: '', desiredRole: '' },
      { displayName: '[합성]', introduction: '', desiredRole: '', skills: [1] },
      { displayName: null, introduction: '', desiredRole: '', skills: [] }]) {
      profileStub.values.set(owner, value);
      fails(await recipient(collectionPath(link.token)), 500, 'INTERNAL_ERROR');
    }
    // 상세는 프로필을 읽지 않는다(계약의 PublicCatch만 돌려준다).
    profileStub.calls.length = 0;
    ok(await recipient(catchPath(link.token, visible)));
    assert.deepEqual(profileStub.calls, []);

    // Catch 조회가 실패하면(격리 스키마의 근거 표를 잠시 치운다) 목록·상세 모두 500이다.
    profileStub.values.set(owner, profileOf('소유자'));
    await db.query('ALTER TABLE catch_evidence RENAME TO catch_evidence_hidden_for_test');
    try {
      fails(await recipient(collectionPath(link.token)), 500, 'INTERNAL_ERROR');
      fails(await recipient(catchPath(link.token, visible)), 500, 'INTERNAL_ERROR');
    } finally {
      await db.query('ALTER TABLE catch_evidence_hidden_for_test RENAME TO catch_evidence');
    }
    ok(await recipient(collectionPath(link.token)));
  });

  test('링크 토큰·grant·비밀번호는 서버 로그에 남지 않는다', () => {
    // 위 시험들이 남긴 로그(500 처리 포함)를 모두 검사한다. 이 시험은 파일의 마지막에 실행된다.
    assert.ok(secrets.size > 0);
    // 500 처리 로그가 실제로 수집됐는지 먼저 확인한다(빈 로그로 통과하지 않게).
    assert.ok(logs.some((line) => line.includes('/v1/public/links/') && line.includes('→ 500 INTERNAL_ERROR')), '500 처리 로그가 수집되지 않음');
    const joined = logs.join('\n');
    for (const secret of [...secrets, PASSWORD]) {
      if (secret.length < 8) continue;
      assert.ok(!joined.includes(secret), '로그에 비밀값이 포함됨');
    }
  });
});

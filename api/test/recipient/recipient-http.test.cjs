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
const PROFILE_KEYS = ['displayName', 'introduction', 'desiredRole', 'skills', 'fieldSource', 'githubAccountLogin'];

// #151 수신자 조회를 실제 Nest HTTP·PostgreSQL(격리 스키마)·#150 링크 판정·B 공개 Catch 조회로 검증한다.
// 공개 프로필·소유 회원 상태는 A의 실제 공급 함수(OwnerProfileReader)가 같은 격리 스키마의 합성 회원·프로필·GitHub 연결 행을 읽는다.
// 정상 DB에서 만들 수 없는 결과(유효 링크의 회원 없음, DB 오류 등)만 공급 함수 인스턴스의 메서드를 시험 안에서 잠시 감싼 대역으로 만든다.
// 원본 비공개 제한은 합성 보호 관측 행으로 만든다. 실제 GitHub OAuth·원본 상태 관측을 검증하지 않는다.
describe('수신자 공개 조회 HTTP·PostgreSQL(#151)', { concurrency: false, timeout: 180000 }, () => {
  let fixture;
  let db;
  let app;
  let origin;
  let registerCandidates;
  let grantKey;
  let issueLinkGrant;
  let reader;
  let OwnerProfileReaderClass;
  const logs = [];
  const sessions = new Map();
  const secrets = new Set();
  const envKeys = ['AUTH_JWT_SECRET', 'AUTH_ACCESS_TOKEN_TTL_SECONDS', 'DEV_LOGIN_ENABLED', 'NODE_ENV',
    'SHARE_LINK_WEB_BASE_URL', 'LINK_GRANT_SECRET'];
  let previousEnv;

  const profileOf = (name) => ({
    displayName: `[합성] ${name}`, introduction: `[합성] ${name} 소개`, desiredRole: '[합성] 백엔드', skills: ['[합성] TypeScript'],
  });
  /** 응답에 기대하는 공개 프로필. GitHub 계정명은 CONNECTED일 때만 저장값이다. */
  const publicOf = (name, githubAccountLogin = null) => ({ ...profileOf(name), fieldSource: 'SELF_REPORTED', githubAccountLogin });

  /**
   * 합성 소유 회원(회원·프로필·GitHub 연결 행). fixture.receipt가 같은 식별 문자열로 회원 행을 넣으므로(ON CONFLICT DO NOTHING) 먼저 만든다.
   * profile: null이면 프로필 행을 만들지 않는다. github: { state, login }이면 연결 행을 만든다.
   */
  async function ownerOf(name, { profile = profileOf(name), github } = {}) {
    const ownerId = randomUUID();
    await db.query(`INSERT INTO member_account(member_id, identity_reference, account_state) VALUES ($1, $2, 'ACTIVE')`,
      [ownerId, `synthetic:catch-db-fixture:${ownerId}`]);
    if (profile) {
      await db.query(`INSERT INTO member_profile(profile_id, member_id, display_name, introduction, desired_role, skills)
        VALUES ($1, $2, $3, $4, $5, $6)`, [randomUUID(), ownerId, profile.displayName, profile.introduction, profile.desiredRole, profile.skills]);
    }
    if (github) {
      await db.query(`INSERT INTO github_connection(connection_id, member_id, external_account_reference, account_login, credential_reference, connection_state)
        VALUES ($1, $2, $3, $4, $5, $6)`, [randomUUID(), ownerId, github.login ? '42' : null, github.login ?? null, null, github.state]);
    }
    return ownerId;
  }
  const setAccountState = (ownerId, state) => db.query('UPDATE member_account SET account_state = $2 WHERE member_id = $1', [ownerId, state]);

  /** 앱이 쓰는 A 공급 함수 인스턴스의 메서드를 시험 안에서만 감싼다. 감싼 함수는 (args, original)을 받는다. 시험이 끝나면 원래대로 돌린다. */
  function wrapReader(t, method, wrapper) {
    const original = OwnerProfileReaderClass.prototype[method];
    const calls = [];
    reader[method] = function (...args) {
      calls.push({ ownerId: args[0], manager: args[1] !== undefined });
      return wrapper(args, (...again) => original.apply(this, again), calls.length);
    };
    t.after(() => { delete reader[method]; });
    return calls;
  }

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
      // 제품 RecipientModule을 그대로 가져온다(A 공급 함수·#150 판정·B 조회의 실제 구현). DB만 격리 스키마로 바꾼다.
      imports: [FixtureDatabaseModule, AuthModule, ErrorsModule, ShareLinksModule, CatchesModule, RecipientModule],
      providers: [{ provide: APP_INTERCEPTOR, useClass: NoStoreInterceptor }],
    })(RecipientHttpModule);
    const logger = Object.fromEntries(['log', 'error', 'warn', 'debug', 'verbose', 'fatal'].map((level) =>
      [level, (...args) => logs.push(args.map((arg) => (arg instanceof Error ? `${arg.message}\n${arg.stack}` : String(arg))).join(' '))]));
    app = await NestFactory.create(RecipientHttpModule, { logger, abortOnError: false });
    await configureApp(app);
    await app.listen(0, '127.0.0.1');
    origin = await app.getUrl();
    grantKey = app.get(LINK_GRANT_KEY, { strict: false });
    ({ OwnerProfileReader: OwnerProfileReaderClass } = require('../../dist/member-profile/owner-profile-reader'));
    reader = app.get(OwnerProfileReaderClass, { strict: false });
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

  async function unlockRaw(token, password = PASSWORD) {
    const response = await fetch(`${origin}/v1/public/links/${token}/unlock`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }), signal: AbortSignal.timeout(10000),
    });
    const text = await response.text();
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return { status: response.status, body: JSON.parse(text), text };
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
    // 재인증 필요 연결은 계정명이 남아 있어도 공개하지 않는다(연결 상태값도 내보내지 않는다).
    const owner = await ownerOf('소유자', { github: { state: 'REAUTH_REQUIRED', login: 'synthetic-leak-login' } });
    const other = await ownerOf('다른 회원');
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
    assert.deepEqual(body.profile, publicOf('소유자', null));
    assert.deepEqual(ids(body.catches), [visible]);
    assert.deepEqual(body.page, { nextCursor: null });
    // 링크 제목·링크 ID·소유자 ID·저장된 계정명·연결 상태값은 응답 어디에도 없다.
    for (const leaked of [link.linkId, owner, link.title, 'synthetic-leak-login', 'REAUTH_REQUIRED', 'CONNECTED', 'accountState']) {
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
    const owner = await ownerOf('빈 프로필', { profile: { displayName: '', introduction: '', desiredRole: '', skills: [] } });
    await seed(owner, { count: 2 });
    const link = await issue(owner);
    const empty = ok(await recipient(collectionPath(link.token)));
    assertCollectionShape(empty);
    assert.deepEqual(empty, {
      profile: { displayName: '', introduction: '', desiredRole: '', skills: [], fieldSource: 'SELF_REPORTED', githubAccountLogin: null },
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

  test('비밀번호 링크는 이 링크의 유효한 grant만 통과하고, 다른 링크·위조·만료 grant는 401이다', async (t) => {
    const owner = await ownerOf('소유자', { github: { state: 'CONNECTED', login: 'synthetic-owner-login' } });
    const [visible] = await publish(owner);
    const profileReads = wrapReader(t, 'readPublicProfile', (args, original) => original(...args));
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
    assert.deepEqual(profileReads, [], '비밀번호 확인 전에는 프로필을 읽지 않는다');

    const body = ok(await recipient(collectionPath(locked.token), { grant }));
    assertCollectionShape(body);
    assert.deepEqual(body.profile, publicOf('소유자', 'synthetic-owner-login'), 'CONNECTED는 저장된 계정명');
    assert.deepEqual(ids(body.catches), [visible]);
    assert.deepEqual(ok(await recipient(catchPath(locked.token, visible), { grant })), body.catches[0]);
    // 다른 링크의 grant는 그 링크에서만 통한다.
    assert.deepEqual(ok(await recipient(collectionPath(sibling.token), { grant: siblingGrant })), body);
    // 비밀번호 없는 링크에 다른 링크의 grant를 붙여도 판정에 영향이 없다.
    const open = await issue(owner);
    assert.deepEqual(ok(await recipient(collectionPath(open.token), { grant })), body);
  });

  test('비밀번호 시도 제한으로 unlock이 막힌 동안에도 받아 둔 유효한 grant로 열람된다', async () => {
    const owner = await ownerOf('소유자');
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

  test('유효한 grant가 있어도 중단·만료·없는 링크는 같은 404 LINK_UNAVAILABLE이다', async (t) => {
    const owner = await ownerOf('소유자');
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
    const profileReads = wrapReader(t, 'readPublicProfile', (args, original) => original(...args));
    const { generateLinkToken } = require('../../dist/share-links/link-token');
    for (const [token, grant] of [[stopped.token, stoppedGrant], [expired.token, expiredGrant], [generateLinkToken(), stoppedGrant],
      ['not-a-token', undefined], [stopped.token, undefined]]) {
      fails(await recipient(collectionPath(token), { grant }), 404, 'LINK_UNAVAILABLE');
      fails(await recipient(catchPath(token, visible), { grant }), 404, 'LINK_UNAVAILABLE');
      fails(await recipient(collectionPath(token, { limit: 'bad' }), { grant }), 404, 'LINK_UNAVAILABLE');
    }
    assert.deepEqual(profileReads, []);
  });

  test('다음 페이지도 매번 링크·소유 회원·grant와 현재 공개 상태를 다시 판정한다', async () => {
    const owner = await ownerOf('소유자');
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
    // 소유 회원이 비활성이면 받아 둔 cursor·grant로도 열 수 없고, 다시 이용 가능해지면 다음 요청부터 열린다.
    await setAccountState(owner, 'SUSPENDED');
    fails(await recipient(collectionPath(link.token, { limit: '2', cursor: first.page.nextCursor }), { grant }), 404, 'LINK_UNAVAILABLE');
    await setAccountState(owner, 'ACTIVE');
    ok(await recipient(collectionPath(link.token, { limit: '2', cursor: first.page.nextCursor }), { grant }));
    // 링크를 중단하면 받아 둔 cursor·grant로도 열 수 없다.
    const stop = await memberRequest(owner, `/v1/share-links/${link.linkId}/stop`, { method: 'PUT' });
    assert.equal(stop.status, 200, JSON.stringify(stop.body));
    fails(await recipient(collectionPath(link.token, { limit: '2', cursor: first.page.nextCursor }), { grant }), 404, 'LINK_UNAVAILABLE');
  });

  test('잘못된 쿼리와 다른 소유자 링크의 cursor는 400이다', async () => {
    const owner = await ownerOf('소유자');
    const other = await ownerOf('다른 회원');
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
    const owner = await ownerOf('소유자 1');
    const [first, second] = (await publish(owner, { count: 2 })).sort();
    const linkA = await issue(owner);
    const linkB = await issue(owner, PASSWORD);
    const grantB = await unlock(linkB.token);
    const before = await db.query('SELECT count(*)::int AS n FROM catch_asset');

    const a1 = ok(await recipient(collectionPath(linkA.token)));
    assert.deepEqual(ok(await recipient(collectionPath(linkB.token), { grant: grantB })), a1);
    await db.query("UPDATE member_profile SET display_name = '[합성] 소유자 2' WHERE member_id = $1", [owner]);
    await db.query(`INSERT INTO github_connection(connection_id, member_id, external_account_reference, account_login, credential_reference, connection_state)
      VALUES ($1, $2, '42', 'synthetic-now-login', NULL, 'CONNECTED')`, [randomUUID(), owner]);
    await setVisibility(owner, first, 'PRIVATE');
    for (const [token, grant] of [[linkA.token, undefined], [linkB.token, grantB]]) {
      const now = ok(await recipient(collectionPath(token), { grant }));
      assert.equal(now.profile.displayName, '[합성] 소유자 2');
      assert.equal(now.profile.githubAccountLogin, 'synthetic-now-login');
      assert.deepEqual(ids(now.catches), [second]);
      fails(await recipient(catchPath(token, first), { grant }), 404, 'RESOURCE_UNAVAILABLE');
    }
    // 조회 전후 Catch 행 수가 같다(링크마다 Catch 사본을 만들지 않는다). 모든 쓰기가 없다는 증거는 아니다.
    assert.deepEqual(await db.query('SELECT count(*)::int AS n FROM catch_asset'), before);
  });

  test('소유 회원이 비활성이면 unlock·목록·상세 모두 같은 404이고, 비밀번호 없는 링크의 unlock도 400보다 먼저 404다', async () => {
    const owner = await ownerOf('소유자');
    const [visible] = await publish(owner);
    const open = await issue(owner);
    const locked = await issue(owner, PASSWORD);
    const grant = await unlock(locked.token);
    // 이용 가능할 때 기준: 비밀번호 없는 링크의 불필요한 unlock은 400이다.
    fails(await unlockRaw(open.token), 400, 'INVALID_REQUEST');

    for (const state of ['SUSPENDED', 'WITHDRAWN', 'active']) {
      await setAccountState(owner, state);
      fails(await unlockRaw(open.token), 404, 'LINK_UNAVAILABLE');
      fails(await unlockRaw(locked.token), 404, 'LINK_UNAVAILABLE');
      fails(await unlockRaw(locked.token, 'wrong-password'), 404, 'LINK_UNAVAILABLE');
      for (const [token, withGrant] of [[open.token, undefined], [locked.token, grant], [locked.token, undefined]]) {
        fails(await recipient(collectionPath(token), { grant: withGrant }), 404, 'LINK_UNAVAILABLE');
        fails(await recipient(catchPath(token, visible), { grant: withGrant }), 404, 'LINK_UNAVAILABLE');
        fails(await recipient(catchPath(token, randomUUID()), { grant: withGrant }), 404, 'LINK_UNAVAILABLE');
        fails(await recipient(collectionPath(token, { limit: 'bad' }), { grant: withGrant }), 404, 'LINK_UNAVAILABLE');
      }
    }
    // 다시 이용 가능해지면 다음 요청부터 같은 링크·grant로 열린다(판정은 요청마다 한다).
    await setAccountState(owner, 'ACTIVE');
    assert.deepEqual(ids(ok(await recipient(collectionPath(locked.token), { grant })).catches), [visible]);
    ok(await recipient(catchPath(open.token, visible)));
    fails(await unlockRaw(open.token), 400, 'INVALID_REQUEST');
  });

  test('접근 판정은 링크와 소유 회원을 같은 시점으로 읽는다: 링크 조회 뒤 커밋된 비활성화는 그 요청에 보이지 않고 다음 요청에 반영된다', async (t) => {
    const owner = await ownerOf('소유자');
    const [visible] = await publish(owner);
    const link = await issue(owner);
    const states = [];
    let deactivate = true;
    wrapReader(t, 'readOwnerState', async ([ownerId, manager], original) => {
      // 링크 조회가 끝난 뒤, 소유 회원 조회 전에 다른 연결로 비활성화를 커밋한다(첫 번째 판정에서만).
      if (deactivate) { deactivate = false; await setAccountState(ownerId, 'SUSPENDED'); }
      const [{ transaction_isolation: isolation }] = await manager.query('SHOW transaction_isolation');
      const [{ transaction_read_only: readOnly }] = await manager.query('SHOW transaction_read_only');
      const state = await original(ownerId, manager);
      states.push({ state, isolation, readOnly });
      return state;
    });
    // 그 요청의 판정 시점(링크 조회)에는 이용 가능이었다. 목록의 프로필은 판정 뒤 분리된 조회라 이미 비활성을 본다.
    fails(await recipient(collectionPath(link.token)), 404, 'LINK_UNAVAILABLE');
    assert.deepEqual(states, [{ state: 'AVAILABLE', isolation: 'repeatable read', readOnly: 'on' }]);
    // 상세는 프로필을 읽지 않으므로 같은 상황에서 판정 시점의 결과로 열린다. 다음 요청은 비활성을 반영한다.
    await setAccountState(owner, 'ACTIVE');
    deactivate = true;
    states.length = 0;
    ok(await recipient(catchPath(link.token, visible)));
    fails(await recipient(catchPath(link.token, visible)), 404, 'LINK_UNAVAILABLE');
    assert.deepEqual(states.map((entry) => entry.state), ['AVAILABLE', 'INACTIVE']);
  });

  test('[시험 대역] 같은 판정 시점에 유효한 링크의 소유 회원이 없으면 unlock·목록·상세 모두 500이다', async (t) => {
    // 링크의 소유자는 회원을 외래 키로 참조하므로 정상 DB에서는 만들 수 없다. 판정의 상태 조회 결과만 대역으로 바꾼다.
    const owner = await ownerOf('소유자');
    const [visible] = await publish(owner);
    const open = await issue(owner);
    const locked = await issue(owner, PASSWORD);
    const grant = await unlock(locked.token);
    const calls = wrapReader(t, 'readOwnerState', async () => 'NO_MEMBER');
    const profileReads = wrapReader(t, 'readPublicProfile', (args, original) => original(...args));
    fails(await unlockRaw(locked.token), 500, 'INTERNAL_ERROR');
    fails(await unlockRaw(open.token), 500, 'INTERNAL_ERROR');
    fails(await recipient(collectionPath(locked.token), { grant }), 500, 'INTERNAL_ERROR');
    fails(await recipient(catchPath(open.token, visible)), 500, 'INTERNAL_ERROR');
    assert.ok(calls.every((call) => call.manager), '판정의 상태 조회는 판정 트랜잭션의 manager로 한다');
    assert.deepEqual(profileReads, [], '판정에서 끝나므로 프로필을 읽지 않는다');
  });

  test('[시험 대역] 판정의 소유 회원 상태 조회가 실패하면 unlock·목록·상세 모두 500이고, 응답에 SQL·내부 메시지가 없다', async (t) => {
    const owner = await ownerOf('소유자');
    const [visible] = await publish(owner);
    const open = await issue(owner);
    const locked = await issue(owner, PASSWORD);
    const grant = await unlock(locked.token);
    const { QueryFailedError } = require('typeorm');
    const marker = 'synthetic-judgment-internal-marker';
    secrets.add(marker); // 마지막 로그 검사에서 서버 로그에도 없는지 확인한다
    wrapReader(t, 'readOwnerState', async () => {
      throw new QueryFailedError(`SELECT ${marker}`, [marker], Object.assign(new Error(marker), { code: '57014' }));
    });
    for (const response of [await unlockRaw(open.token), await unlockRaw(locked.token),
      await recipient(collectionPath(locked.token), { grant }), await recipient(catchPath(open.token, visible))]) {
      fails(response, 500, 'INTERNAL_ERROR');
      assert.ok(!response.text.includes(marker) && !response.text.includes('SELECT'));
    }
  });

  test('목록의 분리된 프로필 조회: 비활성은 바로 404, 회원 없음은 같은 시점으로 한 번만 다시 판정한다', async (t) => {
    const owner = await ownerOf('소유자', { github: { state: 'CONNECTED', login: 'synthetic-owner-login' } });
    const [visible] = await publish(owner);
    const link = await issue(owner);
    const expected = publicOf('소유자', 'synthetic-owner-login');
    const run = async (first, second) => {
      const calls = [];
      reader.readPublicProfile = async function (ownerId, manager) {
        calls.push({ manager: manager !== undefined });
        const step = calls.length === 1 ? first : second;
        if (typeof step === 'function') return step(ownerId, manager);
        return OwnerProfileReaderClass.prototype.readPublicProfile.call(this, ownerId, manager);
      };
      try {
        return { response: await recipient(collectionPath(link.token)), calls };
      } finally { delete reader.readPublicProfile; }
    };
    t.after(() => { delete reader.readPublicProfile; });

    // [시험 대역] 분리된 조회에서 비활성이 관측되면 다시 조회하지 않고 404.
    let result = await run(async () => ({ ownerState: 'INACTIVE' }));
    fails(result.response, 404, 'LINK_UNAVAILABLE');
    assert.deepEqual(result.calls, [{ manager: false }]);

    // [시험 대역] 첫 조회의 회원 없음 → 재판정(실제 DB). 링크·회원이 유효하므로 같은 시점에서 프로필을 한 번 다시 읽어 200.
    result = await run(async () => ({ ownerState: 'NO_MEMBER' }));
    assert.deepEqual(ok(result.response).profile, expected);
    assert.deepEqual(ids(result.response.body.catches), [visible]);
    assert.deepEqual(result.calls, [{ manager: false }, { manager: true }], '재조회는 판정 트랜잭션의 manager로 한 번');

    // [시험 대역] 재판정 사이 링크가 중단되면 프로필을 다시 읽지 않고 404.
    result = await run(async () => {
      await db.query('UPDATE share_link SET stopped_at = GREATEST(now(), issued_at) WHERE link_id = $1', [link.linkId]);
      return { ownerState: 'NO_MEMBER' };
    });
    fails(result.response, 404, 'LINK_UNAVAILABLE');
    assert.deepEqual(result.calls, [{ manager: false }]);
    await db.query('UPDATE share_link SET stopped_at = NULL WHERE link_id = $1', [link.linkId]);

    // [시험 대역] 재판정에서 비활성은 404, 다시 회원 없음은 500. 세 번째 조회는 없다.
    result = await run(async () => ({ ownerState: 'NO_MEMBER' }), async () => ({ ownerState: 'INACTIVE' }));
    fails(result.response, 404, 'LINK_UNAVAILABLE');
    assert.deepEqual(result.calls, [{ manager: false }, { manager: true }]);
    result = await run(async () => ({ ownerState: 'NO_MEMBER' }), async () => ({ ownerState: 'NO_MEMBER' }));
    fails(result.response, 500, 'INTERNAL_ERROR');
    assert.deepEqual(result.calls, [{ manager: false }, { manager: true }], '재판정을 반복하지 않는다');

    // 재판정(실제 DB)에서 필수 프로필 행이 없으면 빈 프로필이 아니라 500. 첫 조회 뒤 프로필 행을 지워 만든다.
    result = await run(async () => {
      await db.query('DELETE FROM member_profile WHERE member_id = $1', [owner]);
      return { ownerState: 'NO_MEMBER' };
    });
    fails(result.response, 500, 'INTERNAL_ERROR');
    assert.deepEqual(result.calls, [{ manager: false }, { manager: true }]);
  });

  test('프로필·Catch 읽기 실패는 빈 결과가 아니라 500이다', async (t) => {
    const owner = await ownerOf('소유자');
    const [visible] = await publish(owner);
    const link = await issue(owner);
    // 실제 DB: 이용 가능한 소유 회원의 필수 프로필 행이 없으면 500(OwnerProfileMissingError). 상세는 프로필을 읽지 않아 열린다.
    await db.query('DELETE FROM member_profile WHERE member_id = $1', [owner]);
    fails(await recipient(collectionPath(link.token)), 500, 'INTERNAL_ERROR');
    ok(await recipient(catchPath(link.token, visible)));
    await db.query(`INSERT INTO member_profile(profile_id, member_id, display_name, introduction, desired_role, skills)
      VALUES ($1, $2, '[합성] 소유자', '', '', '{}')`, [randomUUID(), owner]);
    ok(await recipient(collectionPath(link.token)));

    // [시험 대역] 공급 함수의 DB 오류와 계약 모양이 아닌 값은 기본값으로 채우지 않고 500이다. 응답·로그에 SQL·내부 메시지가 없다.
    const { QueryFailedError } = require('typeorm');
    const marker = 'synthetic-profile-internal-marker';
    secrets.add(marker); // 마지막 로그 검사에서 서버 로그에도 없는지 확인한다
    const values = [
      () => { throw new QueryFailedError(`SELECT ${marker}`, [marker], Object.assign(new Error(marker), { code: '55P03' })); },
      () => { throw new Error(marker); },
      () => ({ ownerState: 'AVAILABLE', profile: { displayName: '[합성]', introduction: '', desiredRole: '', skills: [1], githubAccountLogin: null } }),
      () => ({ ownerState: 'AVAILABLE', profile: { displayName: null, introduction: '', desiredRole: '', skills: [], githubAccountLogin: null } }),
      () => ({ ownerState: 'AVAILABLE', profile: { displayName: '', introduction: '', desiredRole: '', skills: [], githubAccountLogin: '' } }),
      () => ({ ownerState: 'AVAILABLE', profile: { displayName: '', introduction: '', desiredRole: '', skills: [] } }),
      () => ({ ownerState: 'AVAILABLE' }),
    ];
    let current;
    wrapReader(t, 'readPublicProfile', async () => current());
    for (const value of values) {
      current = value;
      const response = await recipient(collectionPath(link.token));
      fails(response, 500, 'INTERNAL_ERROR');
      assert.ok(!response.text.includes(marker) && !response.text.includes('SELECT'));
    }

    // Catch 조회가 실패하면(격리 스키마의 근거 표를 잠시 치운다) 목록·상세 모두 500이다.
    delete reader.readPublicProfile;
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

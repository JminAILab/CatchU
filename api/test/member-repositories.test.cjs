require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { before, after, beforeEach, test } = require('node:test');
const { NestFactory } = require('@nestjs/core');
const { DataSource } = require('typeorm');
const { SignJWT, decodeJwt } = require('jose');
const { AppModule } = require('../dist/app.module');
const { configureApp } = require('../dist/app.setup');
const { DevMemberService, SYNTHETIC_REPOSITORY } = require('../dist/member-analysis/dev-member.service');
const { GitHubConnection, MemberAccount } = require('../dist/member-analysis/member-analysis.entity');
const { SessionService } = require('../dist/auth/session.service');
const { parseRepositoryQuery, repositoryPage } = require('../dist/member-repositories/repository-page');
const { openTestDataSource, resetTestDatabase } = require('./support/test-database.cjs');
const context = require('../../worker/fixtures/m1-synthetic/context.sample.json');

// 개발 회원의 합성 공급(#104·#136)과 페이지 계약 검사다. 실제 회원의 DB 선정 공급은 test/db/repository-selection-*.test.cjs가 맡는다.
let database;
before(async () => { database = await openTestDataSource(); });
beforeEach(async () => { await resetTestDatabase(database); });
after(async () => { if (database) await database.destroy(); });

const repositories = (count) => Array.from({ length: count }, (_, index) => ({
  ...SYNTHETIC_REPOSITORY, repositoryId: `synthetic-${String(index).padStart(3, '0')}`,
}));
function assertInvalid(run, field) {
  assert.throws(run, (error) => error.code === 'VALIDATION_FAILED'
    && error.details.violations[0].field === field);
}

async function start(t, overrides = {}) {
  const settings = {
    AUTH_WEB_ORIGIN: 'https://catchu.example',
    AUTH_JWT_SECRET: randomBytes(32).toString('hex'), AUTH_ACCESS_TOKEN_TTL_SECONDS: '900',
    SHARE_LINK_WEB_BASE_URL: 'https://example.invalid', LINK_GRANT_SECRET: randomBytes(32).toString('hex'),
    NODE_ENV: 'test', DEV_LOGIN_ENABLED: 'true', ...overrides,
  };
  const before = Object.fromEntries(Object.keys(settings).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(settings)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  const logs = [];
  const logger = Object.fromEntries(['log', 'error', 'warn', 'debug', 'verbose', 'fatal'].map((level) =>
    [level, (...args) => logs.push(args.map(String).join(' '))]));
  let app;
  t.after(async () => {
    try { if (app) await app.close(); }
    finally {
      for (const [key, value] of Object.entries(before)) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    }
  });
  app = await configureApp(await NestFactory.create(AppModule, { logger, abortOnError: false }));
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  const request = (path, options = {}) => fetch(`${base}${path}`, { ...options, signal: AbortSignal.timeout(5000) });
  const login = async (identifier = 'repository-member-136') => {
    const response = await request('/v1/auth/dev-login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId: identifier }),
    });
    assert.equal(response.status, 200);
    const { accessToken } = await response.json();
    return { token: accessToken, memberId: decodeJwt(accessToken).sub };
  };
  const list = (token, query = '') => request(`/v1/me/repositories${query}`, {
    headers: token === undefined ? {} : { Authorization: `Bearer ${token}` },
  });
  const sign = (memberId, claims = {}) => new SignJWT({ sub: memberId, ...claims })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setIssuer('catchu-api').setAudience('catchu-member-api')
    .setIssuedAt().setExpirationTime('15m').sign(Buffer.from(settings.AUTH_JWT_SECRET, 'hex'));
  return { app, request, login, list, sign, logs, provider: app.get(DevMemberService) };
}

async function errorBody(response, status, code) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.equal(body.code, code);
  assert.deepEqual(Object.keys(body).sort(), body.details ? ['code', 'details', 'message'] : ['code', 'message']);
  return body;
}

test('페이지 규격: 기본 20·경계 1/100, 잘못된 limit과 추가 필드 거부', () => {
  assert.equal(parseRepositoryQuery({}).limit, 20);
  for (const limit of ['1', '100']) assert.equal(parseRepositoryQuery({ limit }).limit, Number(limit));
  for (const limit of ['0', '101', '-1', '1.5', 'NaN', '', ['1', '2'], {}, '9999999999999999999']) {
    assertInvalid(() => parseRepositoryQuery({ limit }), 'limit');
  }
  assertInvalid(() => parseRepositoryQuery({ memberId: 'other' }), 'query');
  for (const cursor of ['', [], {}]) assertInvalid(() => parseRepositoryQuery({ cursor }), 'cursor');
});

test('페이지는 안정된 저장소 ID 순서로 끝까지 이동하고 마지막·빈 목록의 cursor는 null', () => {
  const source = repositories(105).reverse();
  const owner = randomUUID();
  const first = repositoryPage(owner, source, parseRepositoryQuery({}));
  assert.equal(first.items.length, 20);
  const second = repositoryPage(owner, source, { limit: 100, cursor: first.page.nextCursor });
  assert.equal(second.items.length, 85);
  assert.equal(second.page.nextCursor, null);
  assert.equal(new Set([...first.items, ...second.items].map((item) => item.repositoryId)).size, 105);
  assert.deepEqual(repositoryPage(owner, [], { limit: 20 }), { items: [], page: { nextCursor: null } });
});

test('다른 회원·목록 판본·허용 범위 변경 및 변조·미지원 커서 거부', () => {
  const owner = randomUUID();
  const source = repositories(3);
  const { nextCursor } = repositoryPage(owner, source, { limit: 1 }).page;
  assertInvalid(() => repositoryPage(randomUUID(), source, { limit: 1, cursor: nextCursor }), 'cursor');
  for (const changed of [source.slice(1), [...source, ...repositories(4).slice(3)],
    source.map((item) => ({ ...item, allowedScopeRevision: randomUUID() }))]) {
    assertInvalid(() => repositoryPage(owner, changed, { limit: 1, cursor: nextCursor }), 'cursor');
  }
  for (const cursor of ['bad', '!!!!', nextCursor + '=', 'a'.repeat(4097),
    Buffer.from(JSON.stringify([2, owner, 'x', 'absent'])).toString('base64url'),
    Buffer.from(JSON.stringify({ memberId: owner })).toString('base64url')]) {
    assertInvalid(() => repositoryPage(owner, source, { limit: 1, cursor }), 'cursor');
  }
});

test('응답 필드는 다섯 개뿐이며 불완전·중복 공급 자료는 빈 성공 대신 예외', () => {
  const owner = randomUUID();
  const page = repositoryPage(owner, [{ ...SYNTHETIC_REPOSITORY, credentialReference: 'not-returned' }], { limit: 1 });
  assert.deepEqual(Object.keys(page.items[0]).sort(), ['allowedScopeRevision', 'name', 'ownerLogin', 'repositoryId', 'url']);
  for (const source of [[{ ...SYNTHETIC_REPOSITORY, allowedScopeRevision: '' }],
    [{ ...SYNTHETIC_REPOSITORY, url: 'not-a-uri' }], [SYNTHETIC_REPOSITORY, SYNTHETIC_REPOSITORY]]) {
    assert.throws(() => repositoryPage(owner, source, { limit: 20 }), /Invalid eligible repository source/);
  }
});

test('실제 개발 로그인·DB 연결 공급자와 #103 표본의 저장소·범위가 일치한다', async (t) => {
  const server = await start(t);
  const { token, memberId } = await server.login();
  const response = await server.list(token);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.deepEqual(body, { items: [SYNTHETIC_REPOSITORY], page: { nextCursor: null } });
  assert.equal(body.items[0].repositoryId, context.repository.repositoryId);
  assert.equal(body.items[0].allowedScopeRevision, context.repository.allowedScopeRevision);
  const connection = await database.manager.findOneByOrFail(GitHubConnection, { memberId });
  assert.equal(connection.connectionState, 'CONNECTED');
  assert.equal(body.items[0].ownerLogin, connection.accountLogin);
  assert.deepEqual(Object.keys(body).sort(), ['items', 'page']);
});

test('실제 인증 Guard: 토큰 없음·변조·잘못된 헤더·기존 문자열 회원 식별을 거부', async (t) => {
  const server = await start(t);
  const { token } = await server.login();
  await errorBody(await server.list(), 401, 'AUTH_REQUIRED');
  await errorBody(await server.list(token + 'broken'), 401, 'AUTH_INVALID');
  await errorBody(await server.request('/v1/me/repositories', { headers: { Authorization: 'Basic marker-136' } }), 401, 'AUTH_INVALID');
  await errorBody(await server.list(await server.sign('legacy-identifier')), 401, 'AUTH_INVALID');
  assert.equal(server.logs.join('\n').includes(token), false);
});

for (const state of ['DISCONNECTED', 'REAUTH_REQUIRED', 'missing']) {
  test(`실제 DB 연결 ${state}: 다른 회원의 연결을 쓰거나 빈 성공으로 바꾸지 않는다`, async (t) => {
    const server = await start(t);
    const first = await server.login('member-a-136');
    const second = await server.login('member-b-136');
    if (state === 'missing') await database.manager.delete(GitHubConnection, { memberId: first.memberId });
    else await database.manager.update(GitHubConnection, { memberId: first.memberId }, { connectionState: state,
      ...(state === 'DISCONNECTED' ? { externalAccountReference: null, accountLogin: null, credentialReference: null } : {}) });
    await errorBody(await server.list(first.token), 403, 'GITHUB_CONNECTION_REQUIRED');
    assert.equal((await server.list(second.token)).status, 200);
  });
}

test('API 쿼리는 회원 ID·알 수 없는 필드·중복 limit/cursor·페이지 경계 위반을 거부', async (t) => {
  const server = await start(t);
  const { token } = await server.login();
  for (const query of ['?memberId=other', '?unknown=1', '?limit=1&limit=2', '?cursor=a&cursor=b',
    '?limit=0', '?limit=101', '?limit=1.5', '?cursor=', '?cursor=bad']) {
    const body = await errorBody(await server.list(token, query), 400, 'VALIDATION_FAILED');
    assert.ok(body.details.violations.length > 0);
  }
  for (const limit of [1, 100]) assert.equal((await server.list(token, `?limit=${limit}`)).status, 200);
});

test('다중 저장소·정상 빈 목록·HTTP 페이지 경계는 공급 함수 대역으로 구분해 검사', async (t) => {
  const server = await start(t);
  const a = await server.login('member-a-pages-136');
  const b = await server.login('member-b-pages-136');
  const seenMembers = [];
  let source = repositories(25);
  // #104 제품 대역은 한 장만 제공하므로, 페이지/정상 0건은 테스트 전용 자료 공급이다.
  server.provider.readConnection = async (memberId) => {
    seenMembers.push(memberId);
    return { connectionState: 'CONNECTED', sourceMode: 'MOCK', repositories: source };
  };
  const first = await (await server.list(a.token)).json();
  assert.equal(first.items.length, 20);
  const query = `?cursor=${first.page.nextCursor}`;
  const second = await (await server.list(a.token, query)).json();
  assert.equal(second.items.length, 5);
  assert.equal(second.page.nextCursor, null);
  await errorBody(await server.list(b.token, query), 400, 'VALIDATION_FAILED');
  assert.deepEqual(seenMembers, [a.memberId, a.memberId, b.memberId]);
  source = [];
  assert.deepEqual(await (await server.list(a.token)).json(), { items: [], page: { nextCursor: null } });
});

test('커서가 있어도 매번 현재 연결을 확인하며 재인증 필요 상태는 결과를 반환하지 않는다', async (t) => {
  const server = await start(t);
  const { token } = await server.login();
  let state = 'CONNECTED';
  server.provider.readConnection = async () => ({ connectionState: state, repositories: repositories(2), sourceMode: 'MOCK' });
  const first = await (await server.list(token, '?limit=1')).json();
  state = 'REAUTH_REQUIRED';
  await errorBody(await server.list(token, `?cursor=${first.page.nextCursor}`), 403, 'GITHUB_CONNECTION_REQUIRED');
});

test('실제 DB 조회 실패는 500이며 입력·SQL·자격정보·토큰을 응답·로그에 노출하지 않는다', async (t) => {
  const server = await start(t);
  const { token } = await server.login();
  const dataSource = server.app.get(DataSource);
  const transaction = dataSource.transaction.bind(dataSource);
  // 실제 PostgreSQL에서 오류 발생; 다른 테스트 DB나 제품 테이블은 변경하지 않는다.
  dataSource.transaction = () => dataSource.query('SELECT 1 FROM __synthetic_missing_table_136');
  t.after(() => { dataSource.transaction = transaction; });
  const body = await errorBody(await server.list(token), 500, 'INTERNAL_ERROR');
  const output = JSON.stringify(body) + server.logs.join('\n');
  assert.equal(output.includes('__synthetic_missing_table_136'), false);
  assert.equal(output.includes(token), false);
});

test('다른 회원의 합성 연결 참조를 본인 행에 넣어도 조회 실패로 거부한다', async (t) => {
  const server = await start(t);
  const a = await server.login('member-a-context-136');
  const b = await server.login('member-b-context-136');
  await database.manager.update(GitHubConnection, { memberId: a.memberId }, {
    externalAccountReference: `catchu:mock-github:${b.memberId}`, credentialReference: 'synthetic-secret-136',
  });
  const body = await errorBody(await server.list(a.token), 500, 'INTERNAL_ERROR');
  assert.equal((JSON.stringify(body) + server.logs.join('\n')).includes('synthetic-secret-136'), false);
  assert.equal((await server.list(b.token)).status, 200);
});
for (const [state, reference] of [['CONNECTED', null], ['DISCONNECTED', 'not-synthetic'], ['REAUTH_REQUIRED', null]]) {
  test('정상 해제 외의 잘못된 합성 참조는 저장소 조회에서도 500: ' + state, async t => {
    const server = await start(t); const a = await server.login();
    await database.manager.update(GitHubConnection, { memberId: a.memberId },
      { connectionState: state, externalAccountReference: reference });
    await errorBody(await server.list(a.token), 500, 'INTERNAL_ERROR');
  });
}

for (const overrides of [{ DEV_LOGIN_ENABLED: undefined }, { NODE_ENV: 'production' }]) {
  test(`기존 #104 개발 대역 제한 유지: ${JSON.stringify(overrides)}`, async (t) => {
    const server = await start(t, overrides);
    // 개발 대역 자체의 기본 비활성/운영 차단을 같은 설정으로 재사용한다. 개발 회원이어야 개발 경로까지 간다(#252).
    const memberId = randomUUID();
    const token = await server.app.get(DataSource).transaction(async manager => {
      await manager.insert(MemberAccount, { memberId, identityReference: 'catchu:dev-login:' + memberId, accountState: 'ACTIVE' });
      return (await server.app.get(SessionService).create(manager, memberId)).access.accessToken;
    });
    await errorBody(await server.list(token), 403, 'INTERNAL_ERROR');
  });
}

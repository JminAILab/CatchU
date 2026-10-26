require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { mkdtemp, rm } = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { before, after, beforeEach, test } = require('node:test');
const { NestFactory } = require('@nestjs/core');
const { DataSource } = require('typeorm');
const { decodeJwt } = require('jose');
const { AppModule } = require('../../dist/app.module');
const { configureApp } = require('../../dist/app.setup');
const { SessionService } = require('../../dist/auth/session.service');
const { SYNTHETIC_REPOSITORY } = require('../../dist/member-analysis/dev-member.service');
const { GitHubConnection, MemberAccount } = require('../../dist/member-analysis/member-analysis.entity');
const { GitHubConnectionService } = require('../../dist/github-connection/github-connection.service');
const { GitHubClient, GitHubAccessToken } = require('../../dist/github-connection/github.client');
const { CredentialVault } = require('../../dist/github-connection/credential-vault');
const { AllowedScopeRevision, RepositorySelection } = require('../../dist/member-repositories/repository-selection.entity');
const { RepositorySelectionService } = require('../../dist/member-repositories/repository-selection.source');
const { SelectedRepositoryCatalog } = require('../../dist/member-repositories/selected-repository-catalog');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const { readInitialSelection, restoreInitialSelection } = require('../support/repository-selection.cjs');

// 실제 공급 검사: 실제 Nest HTTP·인증 Guard·PostgreSQL 선정 행·#231 연결 행/상태 갱신으로 GET /v1/me/repositories를 부른다.
// 실제 회원은 Google 로그인 대신 같은 식별 접두사의 회원 행과 실제 세션 발급으로 만든다. GitHub OAuth 응답만 시험 대역이며
// GitHub API·Google을 호출하지 않는다. 페이지 사이 새 좌표 판본은 시험 카탈로그(이름 변경 가정)로 바꾼다.
const THEME = '570342307', ZOO = '547322698';
const SCOPE = 'catchu:allowed-scope:2026-10-19:v1';
const EXPECTED = [
  { repositoryId: ZOO, name: 'BEASTA-ZOO', ownerLogin: 'ljm0850', url: 'https://github.com/ljm0850/BEASTA-ZOO', allowedScopeRevision: SCOPE },
  { repositoryId: THEME, name: 'TheMe', ownerLogin: 'ljm0850', url: 'https://github.com/ljm0850/TheMe', allowedScopeRevision: SCOPE },
];
const INTERNAL = ['catchu:selected-repository', 'github-v1:', 'collectionTerms', 'PROPOSED', 'credential'];
let database, initial, accounts = 0;
before(async () => { database = await openTestDataSource(); initial = await readInitialSelection(database); });
beforeEach(async () => { await resetTestDatabase(database); await restoreInitialSelection(database, initial); });
after(async () => { await database?.destroy(); });

async function start(t, overrides = {}) {
  const settings = {
    AUTH_WEB_ORIGIN: 'https://catchu.example',
    AUTH_JWT_SECRET: randomBytes(32).toString('hex'), AUTH_ACCESS_TOKEN_TTL_SECONDS: '900',
    SHARE_LINK_WEB_BASE_URL: 'https://example.invalid', LINK_GRANT_SECRET: randomBytes(32).toString('hex'),
    NODE_ENV: 'test', DEV_LOGIN_ENABLED: 'true', ...overrides,
  };
  const saved = Object.fromEntries(Object.keys(settings).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(settings)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  const logs = [];
  const logger = Object.fromEntries(['log', 'error', 'warn', 'debug', 'verbose', 'fatal'].map(level =>
    [level, (...args) => logs.push(args.map(String).join(' '))]));
  let app;
  t.after(async () => {
    try { if (app) await app.close(); }
    finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    }
  });
  app = await configureApp(await NestFactory.create(AppModule, { logger, abortOnError: false }));
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  const request = (path, options = {}) => fetch(`${base}${path}`, { ...options, signal: AbortSignal.timeout(5000) });
  const list = (token, query = '') => request(`/v1/me/repositories${query}`, { headers: { Authorization: `Bearer ${token}` } });
  // 회원 행과 #231 connect가 남기는 연결 행 모양을 만들고 실제 세션 서비스로 Access를 발급한다.
  const account = (identityReference, connection = {}) => app.get(DataSource).transaction(async manager => {
    const memberId = randomUUID();
    accounts++;
    await manager.insert(MemberAccount, { memberId, identityReference, accountState: 'ACTIVE' });
    if (connection) {
      await manager.insert(GitHubConnection, Object.assign(new GitHubConnection(), { memberId, connectionState: 'CONNECTED',
        accountLogin: 'real-user-' + accounts, externalAccountReference: String(80000 + accounts),
        credentialReference: 'github-v1:' + randomUUID(), ...connection }));
    }
    return { memberId, token: (await app.get(SessionService).create(manager, memberId)).access.accessToken };
  });
  const real = connection => account('catchu:google:' + randomUUID(), connection);
  const devLogin = async identifier => {
    const response = await request('/v1/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: identifier }) });
    assert.equal(response.status, 200);
    const { accessToken } = await response.json();
    return { token: accessToken, memberId: decodeJwt(accessToken).sub };
  };
  return { app, logs, list, account, real, devLogin };
}

async function errorBody(response, status, code) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.equal(body.code, code);
  return body;
}
async function page(server, token, query = '') {
  const response = await server.list(token, query);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  const text = JSON.stringify(body);
  for (const internal of INTERNAL) assert.equal(text.includes(internal), false, internal);
  return body;
}

for (const [label, overrides] of [['개발 로그인 켬', {}], ['DEV_LOGIN_ENABLED 미지정', { DEV_LOGIN_ENABLED: undefined }],
  ['DEV_LOGIN_ENABLED=false', { DEV_LOGIN_ENABLED: 'false' }], ['NODE_ENV=production', { NODE_ENV: 'production' }]]) {
  test(`실제 회원들은 서로 다른 GitHub 연결로도 같은 현재 선정 목록을 받는다(개발 로그인 설정과 무관): ${label}`,
    async t => {
      const server = await start(t, overrides);
      const a = await server.real();
      const b = await server.real({ accountLogin: 'another-account', externalAccountReference: '424242' });
      for (const user of [a, b]) {
        const body = await page(server, user.token);
        assert.deepEqual(body, { items: EXPECTED, page: { nextCursor: null } });
        for (const item of body.items) {
          assert.deepEqual(Object.keys(item).sort(), ['allowedScopeRevision', 'name', 'ownerLogin', 'repositoryId', 'url']);
        }
      }
    });
}

test('개발 회원은 실제 GitHub 연결이 있어도 기존 개발 공급 경로와 조건을 유지한다', async t => {
  const server = await start(t);
  const synthetic = await server.devLogin('dev-member-252');
  assert.deepEqual(await page(server, synthetic.token), { items: [SYNTHETIC_REPOSITORY], page: { nextCursor: null } });
  const realConnection = await server.devLogin('dev-member-real-connection-252');
  await database.manager.update(GitHubConnection, { memberId: realConnection.memberId }, {
    accountLogin: 'real-account', externalAccountReference: '424242', credentialReference: 'github-v1:' + randomUUID() });
  // 기존 규칙: 정상 해제 외 실제 연결을 합성 연결로 보정하지 않는다. 실제 선정으로 바꾸지도 않는다.
  const body = await errorBody(await server.list(realConnection.token), 500, 'INTERNAL_ERROR');
  assert.equal(JSON.stringify(body).includes('ljm0850'), false);
});

for (const [label, overrides] of [['DEV_LOGIN_ENABLED 미지정', { DEV_LOGIN_ENABLED: undefined }],
  ['NODE_ENV=production', { NODE_ENV: 'production' }]]) {
  test(`개발 기능이 꺼지면 개발 회원은 실제 연결 유무와 관계없이 기존처럼 403: ${label}`, async t => {
    const server = await start(t, overrides);
    for (const connection of [{ externalAccountReference: null, accountLogin: 'catchu-synthetic-owner', credentialReference: null },
      { accountLogin: 'real-account', externalAccountReference: '424242' }]) {
      const user = await server.account('catchu:dev-login:' + randomUUID(), connection);
      await errorBody(await server.list(user.token), 403, 'INTERNAL_ERROR');
    }
  });
}

test('미지원 출처·접두사뿐인 식별 회원은 실제 회원으로 추정하지 않고 403', async t => {
  const server = await start(t);
  for (const identity of ['legacy:' + randomUUID(), 'catchu:google:']) {
    await errorBody(await server.list((await server.account(identity)).token), 403, 'INTERNAL_ERROR');
  }
});

test('실제 회원의 연결 없음·해제·재인증 필요·보관 자격정보 없는 연결은 403이며 다른 회원의 연결을 쓰지 않는다', async t => {
  const server = await start(t);
  const connected = await server.real();
  for (const connection of [null,
    { connectionState: 'DISCONNECTED', accountLogin: null, externalAccountReference: null, credentialReference: null },
    { connectionState: 'REAUTH_REQUIRED', credentialReference: null }, { credentialReference: null }]) {
    const user = await server.real(connection);
    await errorBody(await server.list(user.token), 403, 'GITHUB_CONNECTION_REQUIRED');
  }
  assert.deepEqual((await page(server, connected.token)).items, EXPECTED);
});

test('GitHub 연동을 켜면 만료·이용 불가 자격정보는 #231 상태 갱신 뒤 403, 보관소 오류는 500', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'catchu-252-vault-test-'));
  // mkdtemp에서 받은 이 테스트 전용 경로만 정리한다.
  t.after(() => rm(directory, { recursive: true, force: true }));
  const server = await start(t, { GITHUB_CONNECTION_ENABLED: 'true', GITHUB_OAUTH_CLIENT_ID: 'fake-client',
    GITHUB_OAUTH_CLIENT_SECRET: 'FAKE_SECRET', GITHUB_OAUTH_CALLBACK_URL: 'http://localhost:3000/github/callback',
    GITHUB_CREDENTIAL_DIRECTORY: directory, GITHUB_CREDENTIAL_ENCRYPTION_KEY: randomBytes(32).toString('hex') });
  const github = server.app.get(GitHubConnectionService), client = server.app.get(GitHubClient);
  const vault = server.app.get(CredentialVault);
  const connect = async (user, login, externalAccountReference) => {
    client.exchange = async () => ({ accountLogin: login, externalAccountReference,
      token: new GitHubAccessToken('SYNTHETIC_LIST_TOKEN_252'), expiresAt: new Date(Date.now() + 1800000) });
    const authorization = await github.authorize(user.memberId);
    await github.connect(user.memberId, 'SYNTHETIC_CODE', authorization.state);
  };
  const [valid, expired, missing] = [await server.real(null), await server.real(null), await server.real(null)];
  await connect(valid, 'valid-user', '1001');
  await connect(expired, 'expired-user', '1002');
  await connect(missing, 'missing-user', '1003');
  assert.deepEqual((await page(server, valid.token)).items, EXPECTED);
  const old = await vault.save({ memberId: expired.memberId, accountLogin: 'expired-user', externalAccountReference: '1002',
    token: new GitHubAccessToken('SYNTHETIC_LIST_TOKEN_252'), expiresAt: new Date(Date.now() - 1000) });
  await database.manager.update(GitHubConnection, { memberId: expired.memberId }, { credentialReference: old });
  await database.manager.update(GitHubConnection, { memberId: missing.memberId }, { credentialReference: 'github-v1:' + randomUUID() });
  for (const user of [expired, missing]) {
    await errorBody(await server.list(user.token), 403, 'GITHUB_CONNECTION_REQUIRED');
    const row = await database.manager.findOneByOrFail(GitHubConnection, { memberId: user.memberId });
    assert.deepEqual([row.connectionState, row.credentialReference], ['REAUTH_REQUIRED', null]);
  }
  // 이용 불가가 아닌 보관소 오류는 재인증 필요·빈 목록으로 바꾸지 않고 연결 행도 그대로 둔다.
  const broken = await server.real(null);
  await connect(broken, 'broken-user', '1004');
  await database.manager.update(GitHubConnection, { memberId: broken.memberId }, { credentialReference: 'github-v1:not-a-vault-reference' });
  await errorBody(await server.list(broken.token), 500, 'INTERNAL_ERROR');
  assert.equal((await database.manager.findOneByOrFail(GitHubConnection, { memberId: broken.memberId })).connectionState, 'CONNECTED');
  assert.deepEqual((await page(server, valid.token)).items, EXPECTED);
  assert.equal(server.logs.join('\n').includes('SYNTHETIC_LIST_TOKEN_252'), false);
});

test('페이지: 커서로 끝까지 가고 다른 회원 커서·페이지 사이 선정 변경은 400, 연결 변경은 403', async t => {
  const server = await start(t);
  const a = await server.real(), b = await server.real();
  const first = await page(server, a.token, '?limit=1');
  assert.deepEqual(first.items, [EXPECTED[0]]);
  const next = `?limit=1&cursor=${first.page.nextCursor}`;
  assert.deepEqual(await page(server, a.token, next), { items: [EXPECTED[1]], page: { nextCursor: null } });
  // 같은 공통 목록이라도 커서는 발급 회원에게만 묶인다.
  await errorBody(await server.list(b.token, next), 400, 'VALIDATION_FAILED');

  const service = server.app.get(RepositorySelectionService);
  const versions = new SelectedRepositoryCatalog().listCurrent();
  const theme = versions.find(version => version.repositoryId === THEME);
  const renamed = { ...theme, name: 'renamed-fixture', url: 'https://github.com/ljm0850/renamed-fixture',
    selectionReference: 'catchu:selected-repository:test-renamed:570342307:v2' };
  const changes = {
    '선정 제외': () => database.manager.update(RepositorySelection, { repositoryId: THEME }, { active: false }),
    '새 범위 판본': async () => {
      await database.manager.insert(AllowedScopeRevision, { ...structuredClone(initial.scopes[0]), scopeRevision: 'catchu:allowed-scope:test-next:v2' });
      await database.manager.update(RepositorySelection, { repositoryId: ZOO }, { scopeRevision: 'catchu:allowed-scope:test-next:v2' });
    },
    '새 좌표 판본': async () => {
      service.catalog = new SelectedRepositoryCatalog([...versions, renamed], [renamed.selectionReference, ...versions
        .filter(version => version.repositoryId !== THEME).map(version => version.selectionReference)]);
      await database.manager.update(RepositorySelection, { repositoryId: THEME }, { selectionReference: renamed.selectionReference });
    },
  };
  for (const [label, change] of Object.entries(changes)) {
    await resetTestDatabase(database); await restoreInitialSelection(database, initial);
    service.catalog = new SelectedRepositoryCatalog();
    const user = await server.real();
    const cursor = (await page(server, user.token, '?limit=1')).page.nextCursor;
    await change();
    await errorBody(await server.list(user.token, `?limit=1&cursor=${cursor}`), 400, 'VALIDATION_FAILED');
    const fresh = await page(server, user.token);
    assert.notDeepEqual(fresh.items, EXPECTED, label);
    if (label === '새 좌표 판본') {
      assert.deepEqual(fresh.items.find(item => item.repositoryId === THEME),
        { repositoryId: THEME, name: renamed.name, ownerLogin: 'ljm0850', url: renamed.url, allowedScopeRevision: SCOPE });
    }
  }
  await resetTestDatabase(database); await restoreInitialSelection(database, initial);
  service.catalog = new SelectedRepositoryCatalog();
  const user = await server.real();
  const cursor = (await page(server, user.token, '?limit=1')).page.nextCursor;
  await database.manager.update(GitHubConnection, { memberId: user.memberId }, { connectionState: 'REAUTH_REQUIRED', credentialReference: null });
  await errorBody(await server.list(user.token, `?limit=1&cursor=${cursor}`), 403, 'GITHUB_CONNECTION_REQUIRED');
});

test('정상 빈 목록: 현재 선정을 모두 제외하면 200 빈 목록이고 이전 커서는 400', async t => {
  const server = await start(t);
  const user = await server.real();
  const cursor = (await page(server, user.token, '?limit=1')).page.nextCursor;
  await database.query('UPDATE repository_selection SET active = false');
  assert.deepEqual(await page(server, user.token), { items: [], page: { nextCursor: null } });
  await errorBody(await server.list(user.token, `?cursor=${cursor}`), 400, 'VALIDATION_FAILED');
});

test('공급 장애: 카탈로그에 없는 선정 참조와 DB 오류는 500이며 빈 목록·합성 저장소로 바꾸지 않고 내부 값을 노출하지 않는다', async t => {
  const server = await start(t);
  const user = await server.real();
  await database.manager.update(RepositorySelection, { repositoryId: THEME }, { selectionReference: 'catchu:selected-repository:missing-252:v1' });
  const body = await errorBody(await server.list(user.token), 500, 'INTERNAL_ERROR');
  const output = JSON.stringify(body) + server.logs.join('\n');
  for (const value of ['missing-252', 'ljm0850', SYNTHETIC_REPOSITORY.repositoryId, user.token]) assert.equal(output.includes(value), false, value);
  await database.manager.update(RepositorySelection, { repositoryId: THEME }, { selectionReference: initial.selections[1].selectionReference });
  assert.deepEqual((await page(server, user.token)).items, EXPECTED);
  const dataSource = server.app.get(DataSource);
  const transaction = dataSource.transaction.bind(dataSource);
  // 실제 PostgreSQL에서 오류를 낸다. 다른 테스트 DB나 제품 테이블은 변경하지 않는다.
  dataSource.transaction = () => dataSource.query('SELECT 1 FROM __synthetic_missing_table_252');
  t.after(() => { dataSource.transaction = transaction; });
  const failed = await errorBody(await server.list(user.token), 500, 'INTERNAL_ERROR');
  assert.equal((JSON.stringify(failed) + server.logs.join('\n')).includes('__synthetic_missing_table_252'), false);
});

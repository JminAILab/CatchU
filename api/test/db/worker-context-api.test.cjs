require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { mkdtemp, rm } = require('node:fs/promises');
const { request: httpRequest } = require('node:http');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { isDeepStrictEqual } = require('node:util');
const { before, after, beforeEach, test } = require('node:test');
const { Module } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { decodeJwt } = require('jose');
const { AppModule } = require('../../dist/app.module');
const { configureApp } = require('../../dist/app.setup');
const { AccessTokenService } = require('../../dist/auth/access-token.service');
const { AuthSession, SessionRefreshToken } = require('../../dist/auth/session.entity');
const { SESSION_IDLE_MS, SESSION_MAX_MS } = require('../../dist/auth/session.config');
const { WorkerContextModule } = require('../../dist/worker-context/worker-context.module');
const { GitHubConnectionService } = require('../../dist/github-connection/github-connection.service');
const { GitHubClient, GitHubAccessToken, GitHubProviderError } = require('../../dist/github-connection/github.client');
const { CredentialVault } = require('../../dist/github-connection/credential-vault');
const { GitHubConnection, AnalysisRequest, AnalysisAttempt, MemberAccount } = require('../../dist/member-analysis/member-analysis.entity');
const { insertInitialAnalysis } = require('../../dist/member-analysis/initial-analysis');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');

let app, db, url, directory, github, client, vault, selectionResolver;
let identityCalls = 0;
const saved = {}, settings = {}, logs = [], fixtures = new Map();
const FAKE_TOKEN = 'SYNTHETIC_WORKER_CONTEXT_TOKEN', ERROR_MARKER = 'PRIVATE_CONTEXT_ERROR_MARKER';
const selectionSource = { resolve: async (manager, context) => selectionResolver(manager, context) };
class TestModule {}
Module({ imports: [AppModule, WorkerContextModule.register({ selectionSource })] })(TestModule);

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'catchu-232-vault-test-'));
  Object.assign(settings, { AUTH_JWT_SECRET: randomBytes(32).toString('hex'), AUTH_ACCESS_TOKEN_TTL_SECONDS: '900',
    DEV_LOGIN_ENABLED: 'true', NODE_ENV: 'test', AUTH_WEB_ORIGIN: 'http://localhost:3000', LINK_GRANT_SECRET: randomBytes(32).toString('hex'),
    WORKER_CONTEXT_ENABLED: 'true', WORKER_CONTEXT_API_KEY: randomBytes(32).toString('hex'),
    GITHUB_CONNECTION_ENABLED: 'true', GITHUB_OAUTH_CLIENT_ID: 'fake-client', GITHUB_OAUTH_CLIENT_SECRET: 'FAKE_SECRET',
    GITHUB_OAUTH_CALLBACK_URL: 'http://localhost:3000/github/callback',
    GITHUB_CREDENTIAL_DIRECTORY: directory, GITHUB_CREDENTIAL_ENCRYPTION_KEY: randomBytes(32).toString('hex') });
  for (const [k, v] of Object.entries(settings)) { saved[k] = process.env[k]; process.env[k] = v; }
  const logger = Object.fromEntries(['log', 'error', 'warn', 'debug', 'verbose', 'fatal']
    .map(level => [level, (...args) => logs.push(args.map(String).join(' '))]));
  app = await configureApp(await NestFactory.create(TestModule, { logger, abortOnError: false }));
  await app.listen(0, '127.0.0.1'); url = await app.getUrl();
  db = await openTestDataSource();
  github = app.get(GitHubConnectionService); client = app.get(GitHubClient); vault = app.get(CredentialVault);
});
after(async () => {
  await app?.close(); await db?.destroy();
  for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  // mkdtemp에서 받은 이 테스트 전용 경로만 정리한다.
  if (directory) await rm(directory, { recursive: true, force: true });
});
beforeEach(async () => {
  await resetTestDatabase(db); logs.length = 0; fixtures.clear(); identityCalls = 0;
  github.authorizations.clear();
  client.exchange = async () => ({ accountLogin: 'context-user', externalAccountReference: '9007199254740993',
    token: new GitHubAccessToken(FAKE_TOKEN), expiresAt: new Date(Date.now() + 1800000) });
  client.identity = async () => { identityCalls++; return { accountLogin: 'context-user', externalAccountReference: '9007199254740993' }; };
  // 합성 저장 범위를 정확히 확인하는 시험 전용 공급자. 제품 기본값이 아니다.
  selectionResolver = async (_manager, context) => {
    const fixture = fixtures.get(context.attemptId);
    if (!fixture || !isDeepStrictEqual(context.consentedScope, fixture.consent) ||
        context.consentedScope.wholeRepository !== true || context.consentedScope.repositoryId !== context.repositoryId ||
        context.consentedScope.scopeRevision !== context.scopeRevision || context.consentedScope.fixture !== true) return null;
    return { attemptId: context.attemptId, requestId: fixture.requestId, memberId: fixture.memberId,
      repositoryId: fixture.repositoryId, scopeRevision: fixture.scopeRevision,
      repository: { owner: 'synthetic-owner', name: 'selected-repository' }, wholeRepository: true };
  };
});
function assertNoLeaks(result, allowToken = false) {
  const secrets = [settings.WORKER_CONTEXT_API_KEY, settings.AUTH_JWT_SECRET,
    settings.GITHUB_OAUTH_CLIENT_SECRET, settings.GITHUB_CREDENTIAL_ENCRYPTION_KEY, ERROR_MARKER];
  for (const secret of [...secrets, FAKE_TOKEN]) assert(!logs.join(' ').includes(secret));
  for (const secret of allowToken ? secrets : [...secrets, FAKE_TOKEN]) assert(!JSON.stringify(result).includes(secret));
}
async function call(path, { method = 'GET', headers = {}, body, allowToken = false } = {}) {
  const response = await fetch(url + '/v1' + path, { method, headers: {
    ...headers, ...(body === undefined ? {} : { 'content-type': 'application/json' }),
  }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const result = { status: response.status, body: await response.json() };
  assertNoLeaks(result, allowToken && result.status === 200); return result;
}
async function member(name = randomUUID()) {
  const result = await call('/auth/dev-login', { method: 'POST', body: { memberId: name } });
  assert.equal(result.status, 200);
  assert.equal(result.body.expiresIn, 900);
  const claims = decodeJwt(result.body.accessToken);
  const session = await db.manager.findOneByOrFail(AuthSession, { sessionId: claims.sid, memberId: claims.sub });
  assert.equal(session.revokedAt, null);
  return { memberId: claims.sub, sessionId: claims.sid, token: result.body.accessToken };
}
async function connect(user, token = FAKE_TOKEN) {
  client.exchange = async () => ({ accountLogin: 'context-user', externalAccountReference: '9007199254740993',
    token: new GitHubAccessToken(token), expiresAt: new Date(Date.now() + 1800000) });
  const authorization = await github.authorize(user.memberId);
  await github.connect(user.memberId, 'SYNTHETIC_CODE', authorization.state);
}
async function analysis(user, consent = undefined, sourceMode = 'LIVE') {
  const repositoryId = 'synthetic-context-repository', scopeRevision = randomUUID();
  const scope = consent ?? { wholeRepository: true, repositoryId, scopeRevision, fixture: true };
  const request = await db.transaction(manager => insertInitialAnalysis(manager, { memberId: user.memberId,
    repositoryId, scopeRevision, noticeRevision: 'synthetic-notice', consentedScope: scope, sourceMode }));
  fixtures.set(request.currentAttemptId, { requestId: request.requestId, memberId: user.memberId, repositoryId,
    scopeRevision, consent: scope });
  return request;
}
const contextPath = id => '/internal/analysis-attempts/' + id + '/context';
const context = (id, options = {}) => call(contextPath(id), { headers: { 'x-worker-key': settings.WORKER_CONTEXT_API_KEY }, allowToken: true, ...options });
const unavailable = result => { assert.equal(result.status, 404); assert.equal(result.body.code, 'RESOURCE_UNAVAILABLE'); };

test('활성 분석의 서비스 인증 HTTP는 실제 DB 동의와 #254 자격정보를 결합한다', async () => {
  const user = await member(); await connect(user); const r = await analysis(user); identityCalls = 0;
  for (const processing of ['QUEUED', 'RUNNING']) {
    await db.manager.update(AnalysisAttempt, { attemptId: r.currentAttemptId }, { processing });
    const result = await context(r.currentAttemptId);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.deepEqual(Object.keys(result.body).sort(), ['attemptId', 'credential', 'requestId', 'selection']);
    assert.equal(result.body.attemptId, r.currentAttemptId); assert.equal(result.body.requestId, r.requestId);
    assert.deepEqual(result.body.selection, { repositoryId: r.repositoryId, wholeRepository: true });
    assert.deepEqual(result.body.credential, { memberId: user.memberId, repositoryId: r.repositoryId,
      scopeRevision: fixtures.get(r.currentAttemptId).scopeRevision,
      repository: { owner: 'synthetic-owner', name: 'selected-repository' },
      linkedAccount: { login: 'context-user', externalAccountId: '9007199254740993' }, accessToken: FAKE_TOKEN,
      expiresAt: result.body.credential.expiresAt });
    assert(result.body.credential.expiresAt.endsWith('Z'));
  }
  assert.equal(identityCalls, 2, '컨텍스트 조회당 기존 자격정보 함수 한 번만 호출');
});

for (const processing of ['QUEUED', 'RUNNING']) {
  test(`MOCK ${processing} 시도는 선정·자격정보 조회 전에 거부한다`, async t => {
    const user = await member(); await connect(user); const r = await analysis(user, undefined, 'MOCK');
    await db.manager.update(AnalysisAttempt, { attemptId: r.currentAttemptId }, { processing });
    identityCalls = 0;
    const selected = t.mock.method(selectionSource, 'resolve');
    const credential = t.mock.method(github, 'resolveCredential');
    const result = await context(r.currentAttemptId);
    unavailable(result); assertNoLeaks(result);
    assert.equal(selected.mock.callCount(), 0);
    assert.equal(credential.mock.callCount(), 0);
    assert.equal(identityCalls, 0);
  });
}

test('LIVE 자격정보 확인 중 MOCK으로 바뀐 시도는 최종 조회에서 토큰 없이 거부한다', async t => {
  const user = await member(); await connect(user); const r = await analysis(user);
  identityCalls = 0;
  const selected = t.mock.method(selectionSource, 'resolve');
  const credential = t.mock.method(github, 'resolveCredential');
  const original = client.identity;
  client.identity = async token => {
    await db.manager.update(AnalysisAttempt, { attemptId: r.currentAttemptId }, { sourceMode: 'MOCK' });
    return original(token);
  };
  const result = await context(r.currentAttemptId);
  unavailable(result); assertNoLeaks(result);
  assert.equal(identityCalls, 1);
  assert.equal(credential.mock.callCount(), 1);
  assert.equal(selected.mock.callCount(), 1, '최종 LIVE 검사에서 거부해 두 번째 선정 조회를 하지 않음');
});

test('키 누락/오류와 회원 두 명의 Bearer 접근은 거부하고 일반 회원 인증은 유지한다', async () => {
  const a = await member(), b = await member(); await connect(a); const r = await analysis(a);
  const noKey = await context(r.currentAttemptId, { headers: {} });
  assert.equal(noKey.status, 401); assert.equal(noKey.body.code, 'AUTH_REQUIRED');
  for (const headers of [{ 'x-worker-key': randomBytes(32).toString('hex') },
    { Authorization: 'Bearer ' + a.token }, { Authorization: 'Bearer ' + b.token },
    { Authorization: 'Bearer ' + b.token, 'x-worker-key': settings.WORKER_CONTEXT_API_KEY },
    { 'x-worker-key': settings.WORKER_CONTEXT_API_KEY + ', ' + settings.WORKER_CONTEXT_API_KEY }]) {
    const result = await context(r.currentAttemptId, { headers });
    assert.equal(result.status, 401); assert.equal(result.body.code, 'AUTH_INVALID');
  }
  assert.equal((await call('/me', { headers: { Authorization: 'Bearer ' + b.token } })).status, 200);
  assert.equal((await call('/me', { headers: { 'x-worker-key': settings.WORKER_CONTEXT_API_KEY } })).status, 401);
});

for (const state of ['폐기', '삭제', '24시간 만료', '7일 만료']) {
  test(`유효 JWT의 DB 세션이 ${state}되면 회원 API는 거부하고 worker 키는 독립적으로 허용한다`, async () => {
    const user = await member(); await connect(user); const r = await analysis(user);
    const headers = { Authorization: 'Bearer ' + user.token };
    assert.equal((await call('/me', { headers })).status, 200);
    assert.equal((await context(r.currentAttemptId)).status, 200);

    const now = Date.now();
    if (state === '폐기') {
      await db.manager.update(AuthSession, { sessionId: user.sessionId }, { revokedAt: new Date(now) });
    } else if (state === '삭제') {
      await db.transaction(async manager => {
        await manager.delete(SessionRefreshToken, { sessionId: user.sessionId });
        await manager.delete(AuthSession, { sessionId: user.sessionId });
      });
    } else {
      const elapsed = state === '24시간 만료' ? SESSION_IDLE_MS : SESSION_MAX_MS;
      const createdAt = new Date(now - elapsed - 1000);
      await db.manager.update(AuthSession, { sessionId: user.sessionId }, {
        createdAt, expiresAt: new Date(createdAt.getTime() + SESSION_MAX_MS),
        lastRefreshedAt: state === '24시간 만료' ? createdAt : new Date(now - 2000),
      });
    }

    // JWT 자체가 아직 유효해도 전역 Guard가 DB 세션을 확인해야 한다.
    assert.deepEqual(await app.get(AccessTokenService).verify(user.token), {
      memberId: user.memberId, sessionId: user.sessionId,
    });
    const denied = await call('/me', { headers });
    assert.equal(denied.status, 401); assert.equal(denied.body.code, 'AUTH_INVALID');
    assert.equal((await context(r.currentAttemptId)).status, 200);
    const mixed = await context(r.currentAttemptId, {
      headers: { ...headers, 'x-worker-key': settings.WORKER_CONTEXT_API_KEY },
    });
    assert.equal(mixed.status, 401); assert.equal(mixed.body.code, 'AUTH_INVALID');
  });
}

test('없는·잘못된 ID·닫힌 요청·지난 시도·종결/UNCERTAIN은 모두 같은 404다', async () => {
  const user = await member(); await connect(user); const r = await analysis(user); identityCalls = 0;
  unavailable(await context(randomUUID())); unavailable(await context('not-a-uuid'));
  for (const processing of ['SUCCEEDED', 'EMPTY', 'PARTIAL_FAILED', 'FAILED', 'UNCERTAIN']) {
    await db.manager.update(AnalysisAttempt, { attemptId: r.currentAttemptId }, { processing,
      failureConfirmationReference: processing === 'FAILED' ? 'PROCESSING_DEADLINE' : null });
    unavailable(await context(r.currentAttemptId));
  }
  await db.manager.update(AnalysisAttempt, { attemptId: r.currentAttemptId }, { processing: 'QUEUED' });
  await db.manager.update(AnalysisRequest, { requestId: r.requestId }, { lifecycle: 'CLOSED' });
  unavailable(await context(r.currentAttemptId));
  await db.manager.update(AnalysisRequest, { requestId: r.requestId }, { lifecycle: 'ACTIVE' });
  await db.transaction(async manager => {
    const replacement = manager.create(AnalysisAttempt, { requestId: r.requestId, sourceMode: 'LIVE' });
    await manager.save(replacement);
    await manager.update(AnalysisRequest, { requestId: r.requestId }, { currentAttemptId: replacement.attemptId });
  });
  unavailable(await context(r.currentAttemptId)); assert.equal(identityCalls, 0);
});

test('비활성 회원과 알 수 없는 동의 범위는 GitHub 조회 전 거부한다', async () => {
  const user = await member(); await connect(user); const r = await analysis(user, { synthetic: true }); identityCalls = 0;
  unavailable(await context(r.currentAttemptId));
  await db.manager.update(MemberAccount, { memberId: user.memberId }, { accountState: 'DISABLED' });
  unavailable(await context(r.currentAttemptId)); assert.equal(identityCalls, 0);
});

for (const field of ['attemptId', 'requestId', 'memberId', 'repositoryId', 'scopeRevision', 'wholeRepository']) {
  test(`선정 공급자의 ${field} 불일치는 토큰 없이 거부한다`, async () => {
    const a = await member(), b = await member(); await connect(a); const r = await analysis(a); identityCalls = 0;
    const original = selectionResolver;
    selectionResolver = async (manager, ctx) => ({ ...await original(manager, ctx),
      [field]: field === 'wholeRepository' ? false : field === 'memberId' ? b.memberId : 'mismatched' });
    unavailable(await context(r.currentAttemptId)); assert.equal(identityCalls, 0);
  });
}

test('추가 query와 GET body는 받지 않고 no-store 오류를 반환한다', async () => {
  const user = await member(); const r = await analysis(user);
  for (const query of ['?memberId=other', '?repositoryId=other', '?accessToken=private']) {
    const extra = await call(contextPath(r.currentAttemptId) + query, { headers: { 'x-worker-key': settings.WORKER_CONTEXT_API_KEY } });
    assert.equal(extra.status, 400); assert.equal(extra.body.code, 'INVALID_REQUEST');
  }
  for (const type of ['application/json', 'text/plain']) {
    const result = await new Promise((resolve, reject) => {
      const req = httpRequest(url + '/v1' + contextPath(r.currentAttemptId), { method: 'GET', headers: {
        'x-worker-key': settings.WORKER_CONTEXT_API_KEY, 'content-type': type, 'content-length': '2' } }, response => {
        let data = ''; response.on('data', value => { data += value; });
        response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(data), cache: response.headers['cache-control'] }));
      }); req.on('error', reject); req.end('{}');
    });
    assert.equal(result.status, 400); assert.equal(result.cache, 'no-store'); assertNoLeaks(result);
  }
});

test('미연결·만료·해제와 재연결 후 새 자격정보를 제공한다', async () => {
  const user = await member(); const r = await analysis(user);
  unavailable(await context(r.currentAttemptId)); await connect(user);
  const current = await db.manager.findOneByOrFail(GitHubConnection, { memberId: user.memberId });
  const reference = await vault.save({ memberId: user.memberId, accountLogin: current.accountLogin,
    externalAccountReference: current.externalAccountReference, token: new GitHubAccessToken(FAKE_TOKEN), expiresAt: new Date(Date.now() - 1) });
  await db.manager.update(GitHubConnection, { memberId: user.memberId }, { credentialReference: reference });
  unavailable(await context(r.currentAttemptId));
  assert.equal((await db.manager.findOneByOrFail(GitHubConnection, { memberId: user.memberId })).connectionState, 'REAUTH_REQUIRED');
  await connect(user); assert.equal((await context(r.currentAttemptId)).status, 200);
  await github.disconnect(user.memberId); unavailable(await context(r.currentAttemptId));
  await connect(user); assert.equal((await context(r.currentAttemptId)).status, 200);
});

for (const state of ['closed', 'failed', 'member-disabled', 'selection-removed', 'disconnected', 'reconnected']) {
  test(`GitHub 확인 중 ${state} 변경은 이전 토큰을 인계하지 않는다`, async () => {
    const user = await member(); await connect(user); const r = await analysis(user);
    const original = client.identity;
    client.identity = async token => {
      client.identity = original;
      if (state === 'closed') await db.manager.update(AnalysisRequest, { requestId: r.requestId }, { lifecycle: 'CLOSED' });
      if (state === 'failed') await db.manager.update(AnalysisAttempt, { attemptId: r.currentAttemptId }, { processing: 'FAILED', failureConfirmationReference: 'PROCESSING_DEADLINE' });
      if (state === 'member-disabled') await db.manager.update(MemberAccount, { memberId: user.memberId }, { accountState: 'DISABLED' });
      if (state === 'selection-removed') fixtures.delete(r.currentAttemptId);
      if (state === 'disconnected') await github.disconnect(user.memberId);
      if (state === 'reconnected') await connect(user);
      return original(token);
    };
    unavailable(await context(r.currentAttemptId));
  });
}

test('외부/선정 장애는 안전한 500이며 없음으로 숨기지 않는다', async () => {
  const user = await member(); await connect(user); const r = await analysis(user);
  client.identity = async () => { throw new GitHubProviderError('unavailable'); };
  let result = await context(r.currentAttemptId); assert.equal(result.status, 500); assert.equal(result.body.code, 'INTERNAL_ERROR');
  selectionResolver = async () => { throw new Error(ERROR_MARKER); };
  result = await context(r.currentAttemptId); assert.equal(result.status, 500); assert.equal(result.body.code, 'INTERNAL_ERROR');
  assertNoLeaks(result);
});

for (const change of ['disconnected', 'same-account-reconnected']) {
  test(`자격정보 조회 완료 후 선정 재확인 대기 중 ${change} 커밋은 이전 토큰을 인계하지 않는다`, async () => {
    const user = await member(); await connect(user); const r = await analysis(user);
    const beforeConnection = await db.manager.findOneByOrFail(GitHubConnection, { memberId: user.memberId });
    const original = selectionResolver;
    let entered, release, selectionCalls = 0;
    const waiting = new Promise(resolve => { release = resolve; });
    const secondSelection = new Promise(resolve => { entered = resolve; });
    selectionResolver = async (manager, accepted) => {
      if (++selectionCalls === 2) { entered(); await waiting; }
      return original(manager, accepted);
    };
    const pending = context(r.currentAttemptId);
    await secondSelection;
    try {
      // 이 시점에는 resolveCredential이 완료됐지만 HTTP 응답은 아직 구성되지 않았다.
      if (change === 'disconnected') await github.disconnect(user.memberId);
      else await connect(user);
      const changed = await db.manager.findOneByOrFail(GitHubConnection, { memberId: user.memberId });
      assert.notEqual(changed.credentialReference, beforeConnection.credentialReference);
      if (change === 'same-account-reconnected') {
        assert.equal(changed.accountLogin, beforeConnection.accountLogin);
        assert.equal(changed.externalAccountReference, beforeConnection.externalAccountReference);
      }
    } finally { release(); }
    const result = await pending;
    unavailable(result); assertNoLeaks(result);
  });
}

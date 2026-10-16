require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { mkdtemp, rm } = require('node:fs/promises');
const { request: httpRequest } = require('node:http');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { isDeepStrictEqual } = require('node:util');
const { setTimeout: delay } = require('node:timers/promises');
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
const selectionSource = { resolve: async (manager, context, options) => selectionResolver(manager, context, options) };
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
async function within(promise, label, milliseconds = 5000) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(label + ' 대기 시간 초과')), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

async function storedSelection(t, request) {
  // #252 제품 스키마가 아닌 시험 전용 근거 행. 분석/회원 행의 잠금과 독립적이어야 한다.
  // openTestDataSource/resetTestDatabase의 _test 확인과 파일 순차 실행을 그대로 사용한다.
  await db.query('CREATE TABLE worker_context_selection_probe (attempt_id uuid PRIMARY KEY, request_id uuid NOT NULL,' +
    ' member_id uuid NOT NULL, repository_id text NOT NULL, scope_revision text NOT NULL,' +
    ' consented_scope jsonb NOT NULL, repository_owner text NOT NULL, repository_name text NOT NULL)');
  t.after(async () => { await db.query('DROP TABLE worker_context_selection_probe'); });
  const fixture = fixtures.get(request.currentAttemptId);
  await db.query('INSERT INTO worker_context_selection_probe VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
    [request.currentAttemptId, fixture.requestId, fixture.memberId, fixture.repositoryId, fixture.scopeRevision,
      JSON.stringify(fixture.consent), 'synthetic-owner', 'selected-repository']);
  selectionResolver = async (manager, accepted, options) => {
    assert(options && [null, 'pessimistic_read'].includes(options.lock), '공급자 잠금 옵션은 명시해야 한다');
    if (options.lock) assert.equal(manager.queryRunner?.isTransactionActive, true);
    // 최종 호출의 동일 manager/트랜잭션에서 근거 행을 잠근다. 외부 조회는 하지 않는다.
    const [row] = await manager.query('SELECT * FROM worker_context_selection_probe WHERE attempt_id = $1' +
      (options.lock === 'pessimistic_read' ? ' FOR SHARE' : ''), [accepted.attemptId]);
    if (!row || row.scope_revision !== accepted.scopeRevision ||
        !isDeepStrictEqual(row.consented_scope, accepted.consentedScope) ||
        accepted.consentedScope.wholeRepository !== true ||
        accepted.consentedScope.repositoryId !== accepted.repositoryId ||
        accepted.consentedScope.scopeRevision !== accepted.scopeRevision ||
        accepted.consentedScope.fixture !== true) return null;
    return { attemptId: row.attempt_id, requestId: row.request_id, memberId: row.member_id,
      repositoryId: row.repository_id, scopeRevision: row.scope_revision,
      repository: { owner: row.repository_owner, name: row.repository_name }, wholeRepository: true };
  };
}

async function changeStoredSelection(manager, attemptId, change) {
  if (change === 'removed') {
    return manager.query('DELETE FROM worker_context_selection_probe WHERE attempt_id = $1', [attemptId]);
  }
  if (change === 'coordinates') {
    return manager.query('UPDATE worker_context_selection_probe SET repository_name = $2 WHERE attempt_id = $1',
      [attemptId, 'changed-repository']);
  }
  return manager.query('UPDATE worker_context_selection_probe SET repository_name = $2, scope_revision = $3' +
    ' WHERE attempt_id = $1', [attemptId, 'changed-repository', randomUUID()]);
}

async function assertSelectionWriterBlocked(writerPid, selectionPid, writerState) {
  const deadline = Date.now() + 3000;
  do {
    assert.equal(writerState.finished, false, '선정 변경이 최종 읽기 트랜잭션보다 먼저 끝나면 안 된다');
    const [row] = await db.query('SELECT $1::integer = ANY(pg_blocking_pids($2::integer)) AS blocked',
      [selectionPid, writerPid]);
    if (row.blocked) return;
    // 고정 지연으로 잠금을 추정하지 않고 실제 차단 PID가 관찰될 때까지 제한 시간 안에서 조회한다.
    await delay(10);
  } while (Date.now() < deadline);
  assert.fail('선정 변경이 최종 선정 조회의 PostgreSQL 연결에 차단되지 않았다');
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
    selectionResolver = async (manager, ctx, options) => ({ ...await original(manager, ctx, options),
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

for (const state of ['closed', 'failed', 'member-disabled', 'attempt-replaced', 'selection-removed', 'disconnected', 'reconnected']) {
  test(`GitHub 확인 중 ${state} 변경은 이전 토큰을 인계하지 않는다`, async () => {
    const user = await member(); await connect(user); const r = await analysis(user);
    const original = client.identity;
    client.identity = async token => {
      client.identity = original;
      if (state === 'closed') await db.manager.update(AnalysisRequest, { requestId: r.requestId }, { lifecycle: 'CLOSED' });
      if (state === 'failed') await db.manager.update(AnalysisAttempt, { attemptId: r.currentAttemptId }, { processing: 'FAILED', failureConfirmationReference: 'PROCESSING_DEADLINE' });
      if (state === 'member-disabled') await db.manager.update(MemberAccount, { memberId: user.memberId }, { accountState: 'DISABLED' });
      if (state === 'attempt-replaced') await db.transaction(async manager => {
        const replacement = manager.create(AnalysisAttempt, { requestId: r.requestId, sourceMode: 'LIVE' });
        await manager.save(replacement);
        await manager.update(AnalysisRequest, { requestId: r.requestId }, { currentAttemptId: replacement.attemptId });
      });
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
    selectionResolver = async (manager, accepted, options) => {
      if (++selectionCalls === 2) { entered(); await waiting; }
      return original(manager, accepted, options);
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

for (const change of ['removed', 'coordinates']) {
  test('최종 선정 조회 전 ' + change + ' 커밋은 토큰 없이 거부한다', { timeout: 20000 }, async t => {
    const user = await member(); await connect(user); const r = await analysis(user);
    await storedSelection(t, r);
    const original = selectionResolver, finalSelection = Promise.withResolvers(), resumeSelection = Promise.withResolvers();
    const lockOptions = [];
    selectionResolver = async (manager, accepted, options) => {
      lockOptions.push(options.lock);
      if (lockOptions.length === 2) {
        finalSelection.resolve();
        await within(resumeSelection.promise, '최종 선정 조회 재개');
      }
      return original(manager, accepted, options);
    };
    const pending = context(r.currentAttemptId);
    const settled = Promise.allSettled([pending]);
    try {
      await within(finalSelection.promise, '최종 선정 조회 진입');
      // 외부 자격정보 확인은 끝났고, 선정 근거를 읽기 전에 별도 트랜잭션의 변경이 커밋된다.
      await db.transaction(manager => changeStoredSelection(manager, r.currentAttemptId, change));
      resumeSelection.resolve();
      const result = await pending;
      unavailable(result); assertNoLeaks(result);
      assert.deepEqual(lockOptions, [null, 'pessimistic_read']);
    } finally {
      resumeSelection.resolve();
      await settled;
    }
  });
}

for (const change of ['removed', 'coordinates-and-revision']) {
  test('최종 선정 잠금 뒤 ' + change + ' 변경은 응답 구성 트랜잭션 커밋까지 대기한다',
    { timeout: 20000 }, async t => {
      const user = await member(); await connect(user); const r = await analysis(user);
      await storedSelection(t, r);
      const original = selectionResolver, selectionRead = Promise.withResolvers(), resumeSelection = Promise.withResolvers();
      const beforeCommit = Promise.withResolvers(), resumeCommit = Promise.withResolvers();
      const lockOptions = [], writerState = { finished: false };
      let finalRunner, selectionPid, pending, pendingSettled, writing, writingSettled;
      const writer = db.createQueryRunner();
      selectionResolver = async (manager, accepted, options) => {
        lockOptions.push(options.lock);
        const selected = await original(manager, accepted, options);
        if (lockOptions.length === 2) {
          finalRunner = manager.queryRunner;
          assert.equal(finalRunner?.isTransactionActive, true);
          [{ pid: selectionPid }] = await manager.query('SELECT pg_backend_pid() AS pid');
          const commit = finalRunner.commitTransaction.bind(finalRunner);
          t.mock.method(finalRunner, 'commitTransaction', async () => {
            // TypeORM은 서비스의 응답 객체 생성 callback이 끝난 다음 여기로 들어온다.
            beforeCommit.resolve();
            await within(resumeCommit.promise, '응답 구성 후 커밋 재개');
            await commit();
          });
          selectionRead.resolve();
          await within(resumeSelection.promise, '잠긴 선정 반환 재개');
        }
        return selected;
      };
      try {
        await writer.connect(); await writer.startTransaction();
        await writer.query("SET LOCAL statement_timeout = '8000ms'");
        const [{ pid: writerPid }] = await writer.query('SELECT pg_backend_pid() AS pid');
        pending = context(r.currentAttemptId);
        pendingSettled = Promise.allSettled([pending]);
        await within(selectionRead.promise, '최종 선정 읽기 잠금');
        assert.notEqual(writerPid, selectionPid);
        writing = (async () => {
          await changeStoredSelection(writer.manager, r.currentAttemptId, change);
          await writer.commitTransaction();
        })();
        writingSettled = writing.then(() => { writerState.finished = true; }, () => { writerState.finished = true; });
        await assertSelectionWriterBlocked(writerPid, selectionPid, writerState);
        resumeSelection.resolve();
        await within(beforeCommit.promise, '응답 객체 구성 완료');
        assert.equal(finalRunner.isTransactionActive, true);
        await assertSelectionWriterBlocked(writerPid, selectionPid, writerState);
        resumeCommit.resolve();
        const result = await pending;
        assert.equal(result.status, 200, JSON.stringify(result.body));
        assert.equal(result.body.credential.accessToken, FAKE_TOKEN);
        assert.deepEqual(result.body.credential.repository, { owner: 'synthetic-owner', name: 'selected-repository' });
        assert.deepEqual(lockOptions, [null, 'pessimistic_read']);
        await within(writing, '선정 변경 커밋');
        unavailable(await context(r.currentAttemptId));
      } finally {
        resumeSelection.resolve(); resumeCommit.resolve();
        await Promise.allSettled([pendingSettled, writingSettled]);
        try { if (writer.isTransactionActive) await writer.rollbackTransaction(); }
        finally { await writer.release(); }
      }
    });
}

async function contextBlockedBy(writerPid) {
  const deadline = Date.now() + 3000;
  do {
    const rows = await db.query('SELECT pid FROM pg_stat_activity WHERE datname = current_database()' +
      ' AND $1::integer = ANY(pg_blocking_pids(pid))', [writerPid]);
    if (rows.length) return rows[0].pid;
    await delay(10);
  } while (Date.now() < deadline);
  assert.fail('최종 컨텍스트 조회가 수신 트랜잭션의 요청 잠금을 기다리지 않았다');
}

for (const processing of ['RUNNING', 'EMPTY']) {
  test(`수신 요청 잠금과 최종 컨텍스트 조회가 겹쳐도 ${processing} 저장은 교착 없이 끝난다`,
    { timeout: 20000 }, async t => {
      const user = await member(); await connect(user); const r = await analysis(user);
      const { DatabaseReceiverStore } = require('../../dist/analysis-receiver/database-receiver.store');
      const receiver = new DatabaseReceiverStore(db);
      const requestLocked = Promise.withResolvers(), resumeReceiver = Promise.withResolvers();
      const createRunner = db.createQueryRunner.bind(db);
      // 실제 수신 저장소가 요청을 잠근 직후에만 멈춘다. 잠금 SQL/순서 자체는 대역으로 바꾸지 않는다.
      t.mock.method(db, 'createQueryRunner', (...args) => {
        const runner = createRunner(...args), findOne = runner.manager.findOne.bind(runner.manager);
        t.mock.method(runner.manager, 'findOne', async (entity, options) => {
          const row = await findOne(entity, options);
          if (entity === AnalysisRequest && options.where.requestId === r.requestId &&
              options.lock?.mode === 'pessimistic_write') {
            await runner.query("SET LOCAL statement_timeout = '8000ms'");
            const [{ pid }] = await runner.query('SELECT pg_backend_pid() AS pid');
            requestLocked.resolve(pid);
            await within(resumeReceiver.promise, '수신 시도 잠금 재개');
          }
          return row;
        });
        return runner;
      });
      const writing = receiver.withRequest(r.requestId, async tx => {
        assert.equal(tx.snapshot.context.attemptId, r.currentAttemptId);
        if (processing === 'RUNNING') {
          await tx.saveObservation({ schemaVersion: '1', messageId: randomUUID(), requestId: r.requestId,
            attemptId: r.currentAttemptId, state: 'RUNNING', observedAt: new Date().toISOString() }, 'RUNNING');
        } else {
          await tx.saveResult({ applicationRecordId: randomUUID(), resultId: randomUUID(),
            requestId: r.requestId, attemptId: r.currentAttemptId, payloadFingerprint: 'a'.repeat(64),
            receivedAt: new Date().toISOString() },
          { processing: 'EMPTY', application: 'PENDING', eligibleCandidateCount: 0, failures: [] });
        }
      });
      const writerSettled = Promise.allSettled([writing]);
      let pending, readerSettled;
      try {
        const writerPid = await within(requestLocked.promise, '수신 요청 잠금');
        pending = context(r.currentAttemptId);
        readerSettled = Promise.allSettled([pending]);
        const readerPid = await contextBlockedBy(writerPid);
        assert.notEqual(readerPid, writerPid);
        // 이전 JOIN 잠금에서는 이 시점에 reader가 attempt를 잡고 request를 기다려 순환 대기가 생긴다.
        resumeReceiver.resolve();
        await within(writing, '수신 커밋');
        const result = await within(pending, '최종 컨텍스트 응답');
        if (processing === 'RUNNING') {
          assert.equal(result.status, 200, JSON.stringify(result.body));
          assert.equal(result.body.attemptId, r.currentAttemptId);
          assert.equal(result.body.credential.accessToken, FAKE_TOKEN);
        } else {
          unavailable(result); assertNoLeaks(result);
        }
        assert.equal((await db.manager.findOneByOrFail(AnalysisAttempt,
          { attemptId: r.currentAttemptId })).processing, processing);
      } finally {
        resumeReceiver.resolve();
        await Promise.allSettled([writerSettled, readerSettled]);
      }
    });
}

require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { mkdtemp, rm } = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { after, afterEach, before, beforeEach, test } = require('node:test');
const { Module } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { decodeJwt } = require('jose');
const { AppModule } = require('../../dist/app.module');
const { configureApp } = require('../../dist/app.setup');
const { WorkerContextModule } = require('../../dist/worker-context/worker-context.module');
const { GitHubConnectionService } = require('../../dist/github-connection/github-connection.service');
const { GitHubClient, GitHubAccessToken } = require('../../dist/github-connection/github.client');
const { insertInitialAnalysis } = require('../../dist/member-analysis/initial-analysis');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const {
  APP_LOCK_TIMEOUT_MS, NO_ROLE_PRIVILEGE, assertCapWait, cleanUpLocks, createLockWaitRoles, holdRow,
  sleep, summarize, timed, waitUntilBlocked, withAppAccount,
} = require('../support/lock-wait-limit.cjs');

// #220: worker 맥락 조회(GET /v1/internal/analysis-attempts/:id/context)의 잠금 대기를 앱 계정 3초 조건에서 본다.
// 조회의 최종 확인은 요청 → 시도 행을 FOR SHARE로 잡는다. 결과 수신·반영은 같은 행을 FOR UPDATE로 잡으므로
// 그 행을 쥔 시험 연결로 경쟁을 재현한다. GitHub·선정 공급자는 합성 대역이며 실제 제공자 연결이 아니다.

const FAKE_TOKEN = 'SYNTHETIC_LOCK_CONTEXT_TOKEN';
const saved = {}, settings = {}, fixtures = new Map(), logs = [];
let db, roles, app, url, directory, github, client;
const selectionSource = { resolve: async (_manager, context) => {
  const fixture = fixtures.get(context.attemptId);
  if (!fixture) return null;
  return { attemptId: context.attemptId, requestId: fixture.requestId, memberId: fixture.memberId,
    repositoryId: fixture.repositoryId, scopeRevision: fixture.scopeRevision,
    repository: { owner: 'synthetic-owner', name: 'selected-repository' }, wholeRepository: true };
} };
class TestModule {}
Module({ imports: [AppModule, WorkerContextModule.register({ selectionSource })] })(TestModule);

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'catchu-220-vault-test-'));
  Object.assign(settings, { NODE_ENV: 'test', DEV_LOGIN_ENABLED: 'true', AUTH_JWT_SECRET: randomBytes(32).toString('hex'),
    AUTH_ACCESS_TOKEN_TTL_SECONDS: '900', AUTH_WEB_ORIGIN: 'http://localhost:3000', LINK_GRANT_SECRET: randomBytes(32).toString('hex'),
    WORKER_CONTEXT_ENABLED: 'true', WORKER_CONTEXT_API_KEY: randomBytes(32).toString('hex'),
    GITHUB_CONNECTION_ENABLED: 'true', GITHUB_OAUTH_CLIENT_ID: 'fake-client', GITHUB_OAUTH_CLIENT_SECRET: 'FAKE_SECRET',
    GITHUB_OAUTH_CALLBACK_URL: 'http://localhost:3000/github/callback',
    GITHUB_CREDENTIAL_DIRECTORY: directory, GITHUB_CREDENTIAL_ENCRYPTION_KEY: randomBytes(32).toString('hex') });
  for (const [key, value] of Object.entries(settings)) { saved[key] = process.env[key]; process.env[key] = value; }
  db = await openTestDataSource();
  roles = await createLockWaitRoles(db);
  if (!roles) return;
  const logger = Object.fromEntries(['log', 'error', 'warn', 'debug', 'verbose', 'fatal']
    .map(level => [level, (...args) => logs.push(args.map(String).join(' '))]));
  app = await withAppAccount(roles, async () =>
    configureApp(await NestFactory.create(TestModule, { logger, abortOnError: false })));
  await app.listen(0, '127.0.0.1');
  url = await app.getUrl();
  github = app.get(GitHubConnectionService);
  client = app.get(GitHubClient);
});
after(async () => {
  try { await app?.close(); } finally {
    try { await roles?.drop(); } finally {
      await db?.destroy();
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
      // mkdtemp에서 받은 이 시험 전용 경로만 정리한다.
      if (directory) await rm(directory, { recursive: true, force: true });
    }
  }
});
beforeEach(async () => {
  await resetTestDatabase(db);
  fixtures.clear();
  logs.length = 0;
  if (!roles) return;
  github.authorizations.clear();
  client.exchange = async () => ({ accountLogin: 'context-user', externalAccountReference: '9007199254740993',
    token: new GitHubAccessToken(FAKE_TOKEN), expiresAt: new Date(Date.now() + 1800000) });
  client.identity = async () => ({ accountLogin: 'context-user', externalAccountReference: '9007199254740993' });
});
// 대기 확인이나 검사가 실패해 시험이 잠금을 풀기 전에 끝나도, 다음 시험 전에 잠금을 풀고 시작한 요청이 끝나기를 기다린다.
afterEach(() => cleanUpLocks());

function ready(t) {
  if (roles) return true;
  t.skip(NO_ROLE_PRIVILEGE);
  return false;
}

/** 개발 로그인 회원에 합성 GitHub 연결과 LIVE 분석(QUEUED) 하나를 만든다. */
async function prepare() {
  const response = await fetch(url + '/v1/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memberId: 'context-' + randomUUID() }), signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 200);
  const memberId = decodeJwt((await response.json()).accessToken).sub;
  const authorization = await github.authorize(memberId);
  await github.connect(memberId, 'SYNTHETIC_CODE', authorization.state);
  const repositoryId = 'synthetic-context-repository', scopeRevision = randomUUID();
  // #138 접수의 동의 범위 모양(판본·저장소·자료 종류·선정 참조)에 시험 공급자 표식을 더한다(worker-context-api.test.cjs의 fixtureScope와 같다).
  // 판본·저장소·자료 종류가 동의 행·요청과 맞지 않으면 조회가 행 잠금을 기다리기 전에 404로 끝나 잠금 경쟁을 재현하지 못한다.
  const consentedScope = { revision: scopeRevision, repositoryId, allowedResourceTypes: ['COMMIT', 'PULL_REQUEST', 'ISSUE'],
    selectionReference: 'synthetic-selection', wholeRepository: true, fixture: true };
  const request = await db.transaction(manager => insertInitialAnalysis(manager, { memberId, repositoryId, scopeRevision,
    noticeRevision: 'synthetic-notice', consentedScope, sourceMode: 'LIVE' }));
  fixtures.set(request.currentAttemptId, { requestId: request.requestId, memberId, repositoryId, scopeRevision });
  return request;
}
async function context(attemptId) {
  const response = await fetch(`${url}/v1/internal/analysis-attempts/${attemptId}/context`, {
    headers: { 'x-worker-key': settings.WORKER_CONTEXT_API_KEY }, signal: AbortSignal.timeout(15000) });
  return { status: response.status, cacheControl: response.headers.get('cache-control'), body: await response.json() };
}
const stored = async request => ({
  request: await db.query('SELECT * FROM analysis_request WHERE request_id = $1', [request.requestId]),
  attempt: await db.query('SELECT * FROM analysis_attempt WHERE attempt_id = $1', [request.currentAttemptId]),
});
function assertInternalError(result, label) {
  assert.equal(result.status, 500, `${label}: ${result.status}`);
  assert.deepEqual(result.body, { code: 'INTERNAL_ERROR', message: result.body.message });
  assert.equal(result.cacheControl, 'no-store');
  assert.ok(!JSON.stringify(result.body).includes(FAKE_TOKEN), '실패 응답에 자격정보를 넣지 않는다');
}

test('worker 맥락 조회: 결과 수신·반영처럼 요청 행이나 시도 행을 3초 넘게 쥐면 500이고, 상태를 바꾸지 않으며 풀린 뒤 다시 조회한다', async t => {
  if (!ready(t)) return;
  const request = await prepare();
  const before = await stored(request);
  const outcomes = {};
  for (const [table, column, value] of [['analysis_request', 'request_id', request.requestId],
    ['analysis_attempt', 'attempt_id', request.currentAttemptId]]) {
    const held = await holdRow(db, table, column, value);
    let failed;
    try { failed = await timed(() => context(request.currentAttemptId)); } finally { await held.release(); }
    assertInternalError(failed.value, `${table} 잠금`);
    assertCapWait(failed.ms, `${table} 잠금`);
    outcomes[table] = failed.ms;
  }
  assert.deepEqual(await stored(request), before, '조회 실패는 요청·시도를 바꾸지 않는다');
  assert.ok(!logs.join('\n').includes(FAKE_TOKEN), '로그에 자격정보를 남기지 않는다');
  const retried = await context(request.currentAttemptId);
  assert.equal(retried.status, 200, JSON.stringify(retried.body.code));
  assert.equal(retried.body.credential.accessToken, FAKE_TOKEN);
  t.diagnostic(`worker 맥락 조회 상한 초과: 요청 행 ${outcomes.analysis_request}ms·시도 행 ${outcomes.analysis_attempt}ms 뒤 500, 풀린 뒤 200`);
});

test('worker 맥락 조회: 짧게 쥔 요청 행은 기다린 뒤 성공하고, 같은 시도의 동시 조회는 서로 막지 않는다', async t => {
  if (!ready(t)) return;
  const request = await prepare();
  let held = await holdRow(db, 'analysis_request', 'request_id', request.requestId);
  const pending = timed(() => context(request.currentAttemptId));
  await waitUntilBlocked(db, held.pid, 'worker 맥락 조회');
  await sleep(1000);
  const heldMs = await held.release();
  const waited = await pending;
  assert.equal(waited.value.status, 200);
  assert.ok(waited.ms >= 900 && waited.ms < APP_LOCK_TIMEOUT_MS, `보유 ${heldMs}ms 뒤 성공(${waited.ms}ms)`);

  const concurrent = 5;
  const free = await Promise.all(Array.from({ length: concurrent }, () => timed(() => context(request.currentAttemptId))));
  assert.deepEqual(free.map(r => r.value.status), Array(concurrent).fill(200));
  held = await holdRow(db, 'analysis_request', 'request_id', request.requestId);
  const queued = Array.from({ length: concurrent }, () => timed(() => context(request.currentAttemptId)));
  await waitUntilBlocked(db, held.pid, 'worker 맥락 동시 조회');
  await sleep(500);
  const shortMs = await held.release();
  const behind = await Promise.all(queued);
  assert.deepEqual(behind.map(r => r.value.status), Array(concurrent).fill(200));
  t.diagnostic(`worker 맥락 조회 짧은 보유: 보유 ${heldMs}ms, 대기 포함 ${waited.ms}ms`);
  t.diagnostic(`같은 시도 동시 ${concurrent}건 응답(ms): 잠금 없음 ${JSON.stringify(summarize(free.map(r => r.ms)))}, ` +
    `${shortMs}ms 보유 뒤 ${JSON.stringify(summarize(behind.map(r => r.ms)))}`);
});

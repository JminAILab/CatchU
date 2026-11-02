require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { before, after, beforeEach, test } = require('node:test');
const { NestFactory } = require('@nestjs/core');
const { createApplicationModule } = require('../../dist/application.module');
const { configureApp } = require('../../dist/app.setup');
const { GitHubConnectionService } = require('../../dist/github-connection/github-connection.service');
const { GitHubClient, GitHubAccessToken } = require('../../dist/github-connection/github.client');
const { MemberAccount, AnalysisAttempt } = require('../../dist/member-analysis/member-analysis.entity');
const { insertCurrentAnalysis: insertInitialAnalysis } = require('../support/registered-analysis.cjs');
const { REAL_NOTICE } = require('../../dist/analysis-intake/analysis-notice');
const { RepositorySelectionService } = require('../../dist/member-repositories/repository-selection.source');
const { SelectedRepositoryCatalog } = require('../../dist/member-repositories/selected-repository-catalog');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const { readInitialSelection, restoreInitialSelection } = require('../support/repository-selection.cjs');

// main과 같은 조립 함수 사용: 선정 공급자를 시험에서 따로 등록하거나 대체하지 않는다.
// 실제 PostgreSQL·HTTP·GitHub 보관소를 쓰며 외부 GitHub 응답만 합성으로 대체한다.
const FAKE_TOKEN = 'SYNTHETIC_APPLICATION_CONTEXT_TOKEN';
const saved = {}, settings = {}, logs = [];
let app, db, url, directory, initial, github, selections;
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'catchu-232-application-test-'));
  Object.assign(settings, { AUTH_JWT_SECRET: randomBytes(32).toString('hex'), AUTH_ACCESS_TOKEN_TTL_SECONDS: '900',
    NODE_ENV: 'test', DEV_LOGIN_ENABLED: 'true', AUTH_WEB_ORIGIN: 'http://localhost:3000',
    LINK_GRANT_SECRET: randomBytes(32).toString('hex'), WORKER_CONTEXT_ENABLED: 'true',
    WORKER_CONTEXT_API_KEY: randomBytes(32).toString('hex'), GITHUB_CONNECTION_ENABLED: 'true',
    GITHUB_OAUTH_CLIENT_ID: 'synthetic-client', GITHUB_OAUTH_CLIENT_SECRET: 'SYNTHETIC_SECRET',
    GITHUB_OAUTH_CALLBACK_URL: 'http://localhost:3000/github/callback', GITHUB_CREDENTIAL_DIRECTORY: directory,
    GITHUB_CREDENTIAL_ENCRYPTION_KEY: randomBytes(32).toString('hex') });
  for (const [key, value] of Object.entries(settings)) { saved[key] = process.env[key]; process.env[key] = value; }
  const logger = Object.fromEntries(['log', 'error', 'warn', 'debug', 'verbose', 'fatal']
    .map(level => [level, (...args) => logs.push(args.map(String).join(' '))]));
  app = await configureApp(await NestFactory.create(createApplicationModule(), { logger, abortOnError: false }));
  await app.listen(0, '127.0.0.1'); url = await app.getUrl();
  db = await openTestDataSource(); initial = await readInitialSelection(db);
  selections = app.get(RepositorySelectionService); github = app.get(GitHubConnectionService);
  const client = app.get(GitHubClient);
  client.exchange = async () => ({ accountLogin: 'synthetic-user', externalAccountReference: '9007199254740993',
    token: new GitHubAccessToken(FAKE_TOKEN), expiresAt: new Date(Date.now() + 1800000) });
  client.identity = async () => ({ accountLogin: 'synthetic-user', externalAccountReference: '9007199254740993' });
});
after(async () => {
  try { await app?.close(); await db?.destroy(); }
  finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    // mkdtemp가 만든 이 시험 전용 보관소만 제거한다.
    if (directory) await rm(directory, { recursive: true, force: true });
  }
});
beforeEach(async () => {
  await resetTestDatabase(db); await restoreInitialSelection(db, initial);
  logs.length = 0; github.authorizations.clear();
});

async function accepted(repositoryId = '570342307', adjust = value => value) {
  const memberId = randomUUID();
  await db.manager.insert(MemberAccount, { memberId, identityReference: 'catchu:google:' + randomUUID(), accountState: 'ACTIVE' });
  const authorization = await github.authorize(memberId);
  await github.connect(memberId, 'SYNTHETIC_CODE', authorization.state);
  const request = await db.transaction('READ COMMITTED', async manager => {
    const selection = await selections.confirmForIntake(manager, memberId, repositoryId);
    return insertInitialAnalysis(manager, { memberId, repositoryId, noticeRevision: REAL_NOTICE.noticeRevision,
      scopeRevision: selection.scopeRevision, consentedScope: adjust(selection.consentedScope), sourceMode: 'LIVE' });
  });
  return { memberId, request };
}
async function lookup(attemptId, headers = { 'x-worker-key': settings.WORKER_CONTEXT_API_KEY }) {
  const response = await fetch(url + '/v1/internal/analysis-attempts/' + attemptId + '/context', {
    headers, signal: AbortSignal.timeout(10000) });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const result = { status: response.status, body: await response.json() };
  for (const secret of [settings.WORKER_CONTEXT_API_KEY, settings.GITHUB_CREDENTIAL_ENCRYPTION_KEY, FAKE_TOKEN]) {
    assert.equal(logs.join(' ').includes(secret), false, '제품 로그에 자격정보가 없어야 한다');
    if (result.status !== 200) assert.equal(JSON.stringify(result.body).includes(secret), false);
  }
  return result;
}
function unavailable(result, reason) {
  assert.equal(result.status, 404);
  assert.equal(result.body.code, 'RESOURCE_UNAVAILABLE');
  assert.deepEqual(result.body.details, { violations: [{ field: 'attemptId', reason }] });
}

test('제품 조립은 두 실제 선정 저장소의 저장 동의를 같은 카탈로그 좌표와 전체 범위로 조회한다', async () => {
  for (const repository of new SelectedRepositoryCatalog().listCurrent()) {
    const { request } = await accepted(repository.repositoryId);
    for (const status of ['QUEUED', 'RUNNING']) {
      await db.manager.update(AnalysisAttempt, { attemptId: request.currentAttemptId }, { processing: status });
      const result = await lookup(request.currentAttemptId);
      assert.equal(result.status, 200, 'main의 제품 조립에서 실제 공급을 사용해야 한다');
      assert.deepEqual(result.body.credential.repository, { owner: repository.owner, name: repository.name });
      assert.equal(result.body.credential.accessToken, FAKE_TOKEN);
      assert.deepEqual(result.body.selection, { repositoryId: repository.repositoryId, wholeRepository: true });
      assert.deepEqual(result.body.allowedResourceTypes, ['COMMIT', 'PULL_REQUEST', 'ISSUE']);
    }
  }
});

test('제품 내부 경로는 서비스 키 누락·오류·정상 회원 JWT와 서비스 키 혼용을 거부한다', async () => {
  const { request } = await accepted();
  const login = await fetch(url + '/v1/auth/dev-login', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ memberId: 'synthetic-232-member' }) });
  assert.equal(login.status, 200);
  const { accessToken } = await login.json();
  for (const headers of [{}, { 'x-worker-key': randomBytes(32).toString('hex') },
    { authorization: 'Bearer ' + accessToken },
    { authorization: 'Bearer ' + accessToken, 'x-worker-key': settings.WORKER_CONTEXT_API_KEY }]) {
    assert.equal((await lookup(request.currentAttemptId, headers)).status, 401);
  }
});

test('제품 조립은 원래 동의가 다르면 거부하고 전역 선정 제외는 회원 등록의 실행을 바꾸지 않는다', async () => {
  const mismatched = await accepted('570342307', scope => ({ ...scope, selectionReference: 'unknown-original-reference' }));
  unavailable(await lookup(mismatched.request.currentAttemptId), 'SCOPE_UNVERIFIED');
  const excluded = await accepted();
  await db.query('UPDATE repository_selection SET active = false WHERE repository_id = $1', ['570342307']);
  assert.equal((await lookup(excluded.request.currentAttemptId)).status, 200);
});

test('제품 조립은 GitHub 연결이 해제된 회원의 자격정보를 반환하지 않는다', async () => {
  const { memberId, request } = await accepted();
  await github.disconnect(memberId);
  unavailable(await lookup(request.currentAttemptId), 'GITHUB_NOT_CONNECTED');
});

test('제품 조립은 종결된 시도와 없는 시도를 반환하지 않는다', async () => {
  const { request } = await accepted();
  for (const status of ['SUCCEEDED', 'FAILED']) {
    await db.manager.update(AnalysisAttempt, { attemptId: request.currentAttemptId }, { processing: status });
    unavailable(await lookup(request.currentAttemptId), 'ATTEMPT_NOT_ACTIVE');
  }
  unavailable(await lookup(randomUUID()), 'ATTEMPT_NOT_ACTIVE');
});

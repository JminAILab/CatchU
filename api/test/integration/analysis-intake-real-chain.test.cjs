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
const { SessionService } = require('../../dist/auth/session.service');
const { GitHubConnectionService } = require('../../dist/github-connection/github-connection.service');
const { GitHubClient, GitHubAccessToken } = require('../../dist/github-connection/github.client');
const { MemberAccount } = require('../../dist/member-analysis/member-analysis.entity');
const { REAL_NOTICE } = require('../../dist/analysis-intake/analysis-notice');
const { AnalysisRequestDispatcher } = require('../../dist/analysis-queue/analysis-request.dispatcher');
const { WorkerMessageValidator } = require('../../dist/analysis-receiver/worker-message.validator');
const { SelectedRepositoryCatalog } = require('../../dist/member-repositories/selected-repository-catalog');
const { CONTRACT_DIR, MemoryRequestQueue, dispatchLog } = require('../helpers/queue-harness.cjs');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const { readInitialSelection, restoreInitialSelection } = require('../support/repository-selection.cjs');

// #323 실제 공급 연결 확인. main과 같은 제품 조립(createApplicationModule)을 운영과 같은 설정(production, 개발 로그인 꺼짐)으로 띄워
// 실제 #231 연결·#252 DB 선정 공급·#322 실제 고지로 목록 → 고지 → 접수(HTTP)를 하고, 그 접수 기록을 #233 보내기 검사와
// #232 실행 조회(HTTP)가 같은 판본·전체 선정으로 읽는지 본다. 시험 대역은 GitHub OAuth·사용자 확인 응답(exchange·identity)과
// 메모리 요청 큐뿐이다. Google·GitHub·큐 서버·worker는 부르지 않는다.
const FAKE_TOKEN = 'SYNTHETIC_REAL_INTAKE_CHAIN_TOKEN';
const TYPES = ['COMMIT', 'PULL_REQUEST', 'ISSUE'];
const saved = {}, settings = {}, logs = [];
let app, db, url, directory, initial, github;
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'catchu-323-chain-test-'));
  Object.assign(settings, { NODE_ENV: 'production', DEV_LOGIN_ENABLED: undefined, AUTH_JWT_SECRET: randomBytes(32).toString('hex'),
    AUTH_ACCESS_TOKEN_TTL_SECONDS: '900', AUTH_WEB_ORIGIN: 'https://catchu.example',
    SHARE_LINK_WEB_BASE_URL: 'https://catchu.example', LINK_GRANT_SECRET: randomBytes(32).toString('hex'),
    CORS_ALLOWED_ORIGINS: undefined, WORKER_CONTEXT_ENABLED: 'true', WORKER_CONTEXT_API_KEY: randomBytes(32).toString('hex'),
    GITHUB_CONNECTION_ENABLED: 'true', GITHUB_OAUTH_CLIENT_ID: 'synthetic-client', GITHUB_OAUTH_CLIENT_SECRET: 'SYNTHETIC_SECRET',
    GITHUB_OAUTH_CALLBACK_URL: 'https://catchu.example/github/callback', GITHUB_CREDENTIAL_DIRECTORY: directory,
    GITHUB_CREDENTIAL_ENCRYPTION_KEY: randomBytes(32).toString('hex') });
  for (const [key, value] of Object.entries(settings)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  const logger = Object.fromEntries(['log', 'error', 'warn', 'debug', 'verbose', 'fatal']
    .map(level => [level, (...args) => logs.push(args.map(String).join(' '))]));
  app = await configureApp(await NestFactory.create(createApplicationModule(), { logger, abortOnError: false }));
  await app.listen(0, '127.0.0.1');
  url = await app.getUrl();
  db = await openTestDataSource();
  initial = await readInitialSelection(db);
  github = app.get(GitHubConnectionService);
  const client = app.get(GitHubClient);
  client.exchange = async () => ({ accountLogin: 'chain-user', externalAccountReference: '9007199254740993',
    token: new GitHubAccessToken(FAKE_TOKEN), expiresAt: new Date(Date.now() + 1800000) });
  client.identity = async () => ({ accountLogin: 'chain-user', externalAccountReference: '9007199254740993' });
});
after(async () => {
  try { await app?.close(); await db?.destroy(); }
  finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    // mkdtemp가 만든 이 시험 전용 보관소만 지운다.
    if (directory) await rm(directory, { recursive: true, force: true });
  }
});
beforeEach(async () => {
  await resetTestDatabase(db); await restoreInitialSelection(db, initial);
  logs.length = 0; github.authorizations.clear();
});

const call = (path, options = {}) => fetch(url + path, { ...options, signal: AbortSignal.timeout(10000) });

test('실제 공급 연결: 운영 설정의 제품 조립에서 목록 판본·실제 고지로 LIVE 접수하고 보내기 검사와 실행 조회가 같은 전체 선정으로 읽는다', async () => {
  const devLogin = await call('/v1/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memberId: 'chain-323' }) });
  assert.equal(devLogin.status, 403, '운영 설정에서는 개발 로그인이 꺼져 있다');
  const queue = new MemoryRequestQueue();
  const dispatcher = new AnalysisRequestDispatcher(db, queue, new WorkerMessageValidator(CONTRACT_DIR), dispatchLog());
  for (const repository of new SelectedRepositoryCatalog().listCurrent()) {
    // 실제 회원은 Google 로그인과 같은 식별 접두사의 회원 행과 실제 세션 발급으로 만들고, GitHub 연결은 #231 함수로 한다.
    const memberId = randomUUID();
    const token = await db.transaction(async manager => {
      await manager.insert(MemberAccount, { memberId, identityReference: 'catchu:google:' + randomUUID(), accountState: 'ACTIVE' });
      return (await app.get(SessionService).create(manager, memberId)).access.accessToken;
    });
    const authorization = await github.authorize(memberId);
    await github.connect(memberId, 'SYNTHETIC_CODE', authorization.state);
    const headers = { Authorization: 'Bearer ' + token };
    const listed = await call('/v1/me/repositories', { headers });
    assert.equal(listed.status, 200);
    const item = (await listed.json()).items.find(row => row.repositoryId === repository.repositoryId);
    assert.deepEqual([item.ownerLogin, item.name, item.url], [repository.owner, repository.name, repository.url]);
    const notice = await call('/v1/analysis-notice', { headers });
    assert.equal(notice.status, 200);
    const { noticeRevision } = await notice.json();
    assert.equal(noticeRevision, REAL_NOTICE.noticeRevision);
    const response = await call('/v1/analysis-requests', { method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
      body: JSON.stringify({ repositoryId: item.repositoryId,
        consent: { accepted: true, noticeRevision, scopeRevision: item.allowedScopeRevision } }) });
    assert.equal(response.status, 202);
    const status = await response.json();
    assert.equal(status.sourceMode, 'LIVE');
    // 목록 판본·고지 판본·접수 판정과 저장 동의가 같다. 저장 동의는 원래 선정 참조를 담은 네 칸이다.
    const [consent] = await db.query(`SELECT c.notice_revision, c.scope_revision, c.consented_scope, a.source_mode
      FROM analysis_consent c JOIN analysis_attempt a ON a.request_id = c.request_id WHERE c.consent_id = $1`, [status.consentId]);
    assert.deepEqual(consent, { notice_revision: noticeRevision, scope_revision: item.allowedScopeRevision, source_mode: 'LIVE',
      consented_scope: { revision: item.allowedScopeRevision, repositoryId: item.repositoryId, allowedResourceTypes: TYPES,
        selectionReference: repository.selectionReference } });
    // 보내기 검사(모양·저장소·판본·계약 스키마)를 통과하고 큐 사본만 두 참조를 시도 ID로 바꾼다.
    const summary = await dispatcher.dispatchOnce();
    assert.deepEqual([summary.enqueued, summary.skipped, summary.paused], [1, 0, null]);
    const { data } = queue.jobs.get(status.attemptId);
    assert.deepEqual(data.allowedScope, { revision: item.allowedScopeRevision, repositoryId: item.repositoryId,
      allowedResourceTypes: TYPES, selectionReference: status.attemptId });
    assert.deepEqual([data.sourceMode, data.noticeRevision, data.consentId], ['LIVE', noticeRevision, status.consentId]);
    // worker가 큐 사본의 참조(시도 ID)로 실행 조회하면 원래 선정 참조의 좌표와 저장소 전체 선정을 받는다.
    const context = await call('/v1/internal/analysis-attempts/' + data.credentialContextReference + '/context',
      { headers: { 'x-worker-key': settings.WORKER_CONTEXT_API_KEY } });
    assert.equal(context.status, 200);
    const execution = await context.json();
    assert.deepEqual([execution.attemptId, execution.requestId, execution.consentId, execution.noticeRevision, execution.sourceMode],
      [status.attemptId, status.requestId, status.consentId, noticeRevision, 'LIVE']);
    assert.deepEqual(execution.allowedResourceTypes, TYPES);
    assert.deepEqual(execution.selection, { repositoryId: repository.repositoryId, wholeRepository: true });
    assert.deepEqual([execution.credential.repositoryId, execution.credential.scopeRevision, execution.credential.repository],
      [repository.repositoryId, item.allowedScopeRevision, { owner: repository.owner, name: repository.name }]);
    assert.equal(execution.credential.accessToken, FAKE_TOKEN);
  }
  assert.equal(logs.join('\n').includes(FAKE_TOKEN), false);
});

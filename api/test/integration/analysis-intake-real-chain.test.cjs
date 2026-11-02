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
const { GitHubRepositoryClient } = require('../../dist/member-repositories/github-repository.client');
const { MemberAccount } = require('../../dist/member-analysis/member-analysis.entity');
const { REAL_NOTICE } = require('../../dist/analysis-intake/analysis-notice');
const { AnalysisRequestDispatcher } = require('../../dist/analysis-queue/analysis-request.dispatcher');
const { WorkerMessageValidator } = require('../../dist/analysis-receiver/worker-message.validator');
const { SelectedRepositoryCatalog } = require('../../dist/member-repositories/selected-repository-catalog');
const { CONTRACT_DIR, MemoryRequestQueue, dispatchLog } = require('../helpers/queue-harness.cjs');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const { readCurrentSelection: readInitialSelection, restoreInitialSelection } = require('../support/repository-selection.cjs');

// 운영 설정의 제품 조립에서 회원 등록→고지→접수→실행 조회를 연결한다.
// GitHub OAuth·identity·공개 메타데이터와 C-03·메모리 요청 큐는 합성 대역이다.
// Google·GitHub·모델을 실제 호출하지 않으며 실제 고지의 U7 수정 승인을 대신하지 않는다.
const FAKE_TOKEN = 'SYNTHETIC_REAL_INTAKE_CHAIN_TOKEN';
const TYPES = ['COMMIT', 'PULL_REQUEST', 'ISSUE'];
const saved = {}, settings = {}, logs = [];
let app, db, url, directory, initial, github;
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'catchu-323-chain-test-'));
  Object.assign(settings, { NODE_ENV: 'production', DEV_LOGIN_ENABLED: undefined, AUTH_JWT_SECRET: randomBytes(32).toString('hex'),
    AUTH_ACCESS_TOKEN_TTL_SECONDS: '900', AUTH_WEB_ORIGIN: 'https://catchu.example',
    SHARE_LINK_WEB_BASE_URL: 'https://catchu.example', LINK_GRANT_SECRET: randomBytes(32).toString('hex'),
    CATCHU_EMBEDDING_API_KEY: 'synthetic-embedding-key', // 운영 모드 기동에 필요한 합성 임베딩 키(#431)
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
  require('../support/synthetic-daily-limit.cjs').bindSyntheticDailyLimit(app);
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

test('운영 설정의 제품 조립에서 직접 등록·동의 후 LIVE 접수하고 실행 조회가 같은 불변 사본을 읽는다', async () => {
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
    app.get(GitHubRepositoryClient).verify = async () => ({ repositoryId: repository.repositoryId,
      owner: repository.owner, name: repository.name, url: repository.url });
    const registered = await call('/v1/me/repositories', { method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ url: repository.url }) });
    assert.ok([200, 201].includes(registered.status));
    const registration = await registered.json();
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
    // 저장 동의는 등록 참조와 당시 좌표를 담은 여섯 필드다.
    const [consent] = await db.query(`SELECT c.notice_revision, c.scope_revision, c.consented_scope, a.source_mode
      FROM analysis_consent c JOIN analysis_attempt a ON a.request_id = c.request_id WHERE c.consent_id = $1`, [status.consentId]);
    assert.deepEqual(consent, { notice_revision: noticeRevision, scope_revision: item.allowedScopeRevision, source_mode: 'LIVE',
      consented_scope: { revision: item.allowedScopeRevision, repositoryId: item.repositoryId, allowedResourceTypes: TYPES,
        selectionReference: registration.registrationId, registrationId: registration.registrationId,
        repository: { owner: repository.owner, name: repository.name, url: repository.url } } });
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

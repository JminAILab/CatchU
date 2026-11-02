require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { mkdtemp, rm } = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { before, after, beforeEach, test } = require('node:test');
const { setTimeout: delay } = require('node:timers/promises');
const { NestFactory } = require('@nestjs/core');
const { decodeJwt } = require('jose');
const { AppModule } = require('../../dist/app.module');
const { configureApp } = require('../../dist/app.setup');
const { SessionService } = require('../../dist/auth/session.service');
const { SYNTHETIC_REPOSITORY } = require('../../dist/member-analysis/dev-member.service');
const { AnalysisConsent, AnalysisRequest, AnalysisAttempt, GitHubConnection, MemberAccount } =
  require('../../dist/member-analysis/member-analysis.entity');
const { AnalysisNoticeService, REAL_NOTICE, SYNTHETIC_NOTICE } = require('../../dist/analysis-intake/analysis-notice');
const { AnalysisIntakeService } = require('../../dist/analysis-intake/analysis-intake.service');
const { GitHubConnectionService } = require('../../dist/github-connection/github-connection.service');
const { GitHubClient, GitHubAccessToken } = require('../../dist/github-connection/github.client');
const { CredentialVault } = require('../../dist/github-connection/credential-vault');
const { RepositoryRegistration } = require('../../dist/member-repositories/repository-registration.entity');
const { RepositoryRegistrationService } = require('../../dist/member-repositories/repository-registration.service');
const { GitHubRepositoryClient } = require('../../dist/member-repositories/github-repository.client');
const { RegistrationContextSource } = require('../../dist/member-repositories/registration-context.source');
const { ApiError } = require('../../dist/common/errors');
const registered = new Map();
const { AllowedScopeRevision } = require('../../dist/member-repositories/repository-selection.entity');
const { SelectedRepositoryCatalog } = require('../../dist/member-repositories/selected-repository-catalog');
const { AnalysisRequestDispatcher } = require('../../dist/analysis-queue/analysis-request.dispatcher');
const { WorkerMessageValidator } = require('../../dist/analysis-receiver/worker-message.validator');
const { CONTRACT_DIR, MemoryRequestQueue, dispatchLog } = require('../helpers/queue-harness.cjs');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const { readCurrentSelection: readInitialSelection, restoreInitialSelection } = require('../support/repository-selection.cjs');

// #323 접수 회귀를 U7 회원 등록으로 전환했다. GitHub 메타데이터/C-03은 합성 대역이다.
// 검증 경계: 실제 Nest HTTP·인증 Guard·PostgreSQL, #252 DB 선정 근거(실제 마이그레이션
// 초기 자료)·#319 좌표 카탈로그, #231 연결·보관소를 쓴다. 실제 회원은 Google 로그인 대신 같은 식별 접두사의 회원 행과
// 실제 세션 발급으로 만들고, 연결은 GitHub 연동을 켠 서버에서 #231 authorize·connect로 시험 전용 보관소에 만든다(거부 사례는
// #231이 남기는 행 모양을 직접 넣는다). 시험 대역은 이름에 「대역」을 적은 시험의 오류 주입·판본 교체와 GitHub OAuth
// 응답(exchange)뿐이다. Google·GitHub·큐 서버·worker는 부르지 않는다.
const THEME = '570342307', ZOO = '547322698';
const { REGISTRATION_SCOPE_REVISION: SCOPE } = require('../../dist/member-repositories/registration-scope');
const NEXT_SCOPE = 'catchu:allowed-scope:test-323:v2';
const TYPES = ['COMMIT', 'PULL_REQUEST', 'ISSUE'];
const CONSENT_KEYS = ['allowedResourceTypes', 'registrationId', 'repository', 'repositoryId', 'revision', 'selectionReference'];
const RESPONSE_KEYS = ['requestId', 'repositoryId', 'consentId', 'attemptId', 'submittedAt', 'updatedAt', 'requestState',
  'lifecycle', 'processing', 'application', 'sourceMode', 'eligibleCandidateCount', 'registeredCatchIds', 'ownerResultsReady',
  'retry', 'failures', 'ownCommitObservation', 'observedOwnCommitCount', 'collectionLimitNotes'].sort();
const NONE = { requests: 0, consents: 0, attempts: 0, keys: 0 };
const TOKEN = 'SYNTHETIC_INTAKE_TOKEN_323';
let db, initial, accounts = 0;
before(async () => { db = await openTestDataSource(); initial = await readInitialSelection(db); });
beforeEach(async () => { await resetTestDatabase(db); await restoreInitialSelection(db, initial); });
after(async () => { await db?.destroy(); });

const consent = (changes = {}) => ({ accepted: true, noticeRevision: REAL_NOTICE.noticeRevision, scopeRevision: SCOPE, ...changes });
const command = (changes = {}) => ({ repositoryId: THEME, consent: consent(), ...changes });
const synthetic = (changes = {}) => ({ repositoryId: SYNTHETIC_REPOSITORY.repositoryId, consent: { accepted: true,
  noticeRevision: SYNTHETIC_NOTICE.noticeRevision, scopeRevision: SYNTHETIC_NOTICE.scopeRevision }, ...changes });
// 운영 설정에서도 받는 HTTPS 콜백이다. GitHub로 이동하지 않는다.
const github = directory => ({ GITHUB_CONNECTION_ENABLED: 'true', GITHUB_OAUTH_CLIENT_ID: 'fake-client',
  GITHUB_OAUTH_CLIENT_SECRET: 'FAKE_SECRET', GITHUB_OAUTH_CALLBACK_URL: 'https://catchu.example/github/callback',
  GITHUB_CREDENTIAL_DIRECTORY: directory, GITHUB_CREDENTIAL_ENCRYPTION_KEY: randomBytes(32).toString('hex') });

/** GitHub 연동을 켜고 이 시험 전용 보관소로 앱을 띄운다. 디렉터리는 mkdtemp에서 받은 이 경로만 지운다. */
async function start(t, overrides = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'catchu-323-vault-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const settings = { NODE_ENV: 'test', DEV_LOGIN_ENABLED: 'true', AUTH_JWT_SECRET: randomBytes(32).toString('hex'),
    AUTH_ACCESS_TOKEN_TTL_SECONDS: '900', AUTH_WEB_ORIGIN: 'https://catchu.example',
    SHARE_LINK_WEB_BASE_URL: 'https://catchu.example', LINK_GRANT_SECRET: randomBytes(32).toString('hex'),
    CATCHU_EMBEDDING_API_KEY: 'synthetic-embedding-key', // 운영 모드 기동에 필요한 합성 임베딩 키(#431)
    CORS_ALLOWED_ORIGINS: undefined, ...github(directory), ...overrides };
  const previous = Object.fromEntries(Object.keys(settings).map(k => [k, process.env[k]]));
  for (const [k, v] of Object.entries(settings)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  let app;
  const logs = [];
  const logger = Object.fromEntries(['log', 'error', 'warn', 'debug', 'verbose', 'fatal'].map(k =>
    [k, (...args) => logs.push(args.map(String).join(' '))]));
  t.after(async () => { try { await app?.close(); } finally {
    for (const [k, v] of Object.entries(previous)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  } });
  app = await configureApp(await NestFactory.create(AppModule, { logger, abortOnError: false }));
  require('../support/synthetic-daily-limit.cjs').bindSyntheticDailyLimit(app);
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  const call = (path, options) => fetch(base + path, { ...options, signal: AbortSignal.timeout(10000) });
  const auth = user => ({ headers: { Authorization: 'Bearer ' + user.token } });
  const post = (user, key = randomUUID(), body = command()) => call('/v1/analysis-requests', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + user.token, 'Idempotency-Key': key },
    body: JSON.stringify(body) });
  /**
   * 회원 행과 실제 세션으로 회원을 만든다. connection을 생략하면 #231 authorize·connect로 시험 보관소에 실제 연결을 만들고,
   * 객체면 #231 connect가 남기는 연결 행에 그 값을 덮어써 직접 넣으며, null이면 연결 행이 없다.
   */
  const member = async (identityReference, connection) => {
    const user = await db.transaction(async manager => {
      const memberId = randomUUID();
      await manager.insert(MemberAccount, { memberId, identityReference, accountState: 'ACTIVE' });
      if (connection) {
        accounts++;
        await manager.insert(GitHubConnection, Object.assign(new GitHubConnection(), { memberId, connectionState: 'CONNECTED',
          accountLogin: 'real-user-' + accounts, externalAccountReference: String(70000 + accounts),
          credentialReference: 'github-v1:' + randomUUID(), ...connection }));
      }
      return { memberId, token: (await app.get(SessionService).create(manager, memberId)).access.accessToken };
    });
    if (connection === undefined) {
      const { state } = await connections.authorize(user.memberId);
      await connections.connect(user.memberId, 'SYNTHETIC_CODE', state);
    }
    for (const version of new SelectedRepositoryCatalog().listCurrent()) {
      const registrationId = await require('../support/registered-analysis.cjs').ensureRegistration(db.manager, {
        memberId: user.memberId, repositoryId: version.repositoryId, scopeRevision: SCOPE,
        consentedScope: { repository: { owner: version.owner, name: version.name, url: version.url } },
      });
      registered.set(version.repositoryId, { revision: SCOPE, repositoryId: version.repositoryId, allowedResourceTypes: TYPES,
        selectionReference: registrationId, registrationId, repository: { owner: version.owner, name: version.name, url: version.url } });
    }
    return user;
  };
  const real = connection => member('catchu:google:' + randomUUID(), connection);
  const devLogin = async identifier => {
    const r = await call('/v1/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: identifier }) });
    assert.equal(r.status, 200);
    const { accessToken } = await r.json();
    return { token: accessToken, memberId: decodeJwt(accessToken).sub };
  };
  // 재전송·개발 회원이 #231 상태 갱신을 부르지 않는지 보려고 호출만 센다. 원래 함수를 그대로 부른다.
  const connections = app.get(GitHubConnectionService);
  const refreshStatus = connections.refreshStatus.bind(connections);
  const refreshed = [];
  connections.refreshStatus = async memberId => { refreshed.push(memberId); return refreshStatus(memberId); };
  // GitHub OAuth 응답만 시험 대역이다. 회원마다 다른 계정을 준다. 연결·보관·상태 갱신은 실제 #231 함수다.
  const client = app.get(GitHubClient);
  client.exchange = async () => {
    accounts++;
    return { accountLogin: 'real-user-' + accounts, externalAccountReference: String(70000 + accounts),
      token: new GitHubAccessToken(TOKEN + '-' + accounts), expiresAt: new Date(Date.now() + 3600000) };
  };
  client.identity = async token => {
    const value = token.reveal();
    const vault = /-vault-(\d+)$/.exec(value);
    const index = Number(value.split('-').at(-1));
    return vault ? { accountLogin: 'vault-user-' + vault[1], externalAccountReference: String(5000 + Number(vault[1])) }
      : { accountLogin: 'real-user-' + index, externalAccountReference: String(70000 + index) };
  };
  const metadata = app.get(GitHubRepositoryClient);
  metadata.verify = async coordinates => {
    const version = new SelectedRepositoryCatalog().listCurrent().find(item => item.owner === coordinates.owner && item.name === coordinates.name);
    return version ? { repositoryId: version.repositoryId, owner: version.owner, name: version.name, url: version.url } : { repositoryId: THEME, ...coordinates, url: 'https://github.com/' + coordinates.owner + '/' + coordinates.name };
  };
  return { app, call, auth, post, member, real, devLogin, logs, refreshed, connections, client, metadata, vault: app.get(CredentialVault),
    notices: app.get(AnalysisNoticeService), selections: app.get(RepositoryRegistrationService) };
}
async function error(r, status, code) {
  assert.equal(r.status, status); assert.equal(r.headers.get('cache-control'), 'no-store');
  const body = await r.json(); assert.equal(body.code, code, JSON.stringify(body));
  return body;
}
/** 새 실제 접수(202)의 상태 응답. 저장한 첫 시도와 응답의 방식이 LIVE다. */
async function accepted(r) {
  assert.equal(r.status, 202, r.status === 202 ? '' : JSON.stringify(await r.clone().json()));
  const status = await r.json();
  assert.equal(status.sourceMode, 'LIVE');
  assert.equal((await db.manager.findOneByOrFail(AnalysisAttempt, { attemptId: status.attemptId })).sourceMode, 'LIVE');
  return status;
}
async function counts() {
  const [row] = await db.query('SELECT (SELECT count(*)::int FROM analysis_request) requests, (SELECT count(*)::int FROM analysis_consent) consents, (SELECT count(*)::int FROM analysis_attempt) attempts, (SELECT count(*)::int FROM idempotency_record) keys');
  return row;
}
/** 요청의 저장 동의·첫 시도. */
async function stored(requestId) {
  const [row] = await db.query(`SELECT c.notice_revision, c.scope_revision, c.consented_scope, a.source_mode
    FROM analysis_request r JOIN analysis_consent c ON c.consent_id = r.consent_id
    JOIN analysis_attempt a ON a.attempt_id = r.current_attempt_id WHERE r.request_id = $1`, [requestId]);
  return row;
}
/** 실제 마이그레이션 초기 자료(#252 공급값)로 만든 저장 동의 여섯 칸의 기대값. */
function supplied(repositoryId) { return structuredClone(registered.get(repositoryId)); }
/** #252 갱신 절차와 같은 모양으로 새 범위 판본을 더하고 선정을 옮긴다. 이전 판본 행은 그대로다. */
async function moveScope(repositoryId) {
  await db.manager.insert(AllowedScopeRevision, { ...structuredClone(initial.scopes.find(scope => scope.scopeRevision === SCOPE)), scopeRevision: NEXT_SCOPE });
  await db.manager.update(RepositoryRegistration, { repositoryId }, { scopeRevision: NEXT_SCOPE });
}
async function terminal(requestId, processing = 'FAILED', changes = {}) {
  const request = await db.manager.findOneByOrFail(AnalysisRequest, { requestId });
  await db.manager.update(AnalysisAttempt, { attemptId: request.currentAttemptId }, {
    processing, application: 'APPLIED', eligibleCandidateCount: 0, ownerResultsReady: false,
    failures: processing === 'FAILED' ? [{ stage: 'DISPATCH', code: 'SYNTHETIC_CONFIRMED_FAILURE', message: '[합성] 실행되지 않은 확정 실패' }] : [],
    failureConfirmationReference: processing === 'FAILED' ? 'synthetic-confirmed:' + requestId : null, ...changes,
  });
  await db.manager.update(AnalysisRequest, { requestId }, { lifecycle: 'CLOSED' });
}
async function applyFailed(requestId, changes = {}) {
  const request = await db.manager.findOneByOrFail(AnalysisRequest, { requestId });
  await db.manager.update(AnalysisAttempt, { attemptId: request.currentAttemptId }, {
    processing: 'FAILED', application: 'APPLY_FAILED', eligibleCandidateCount: 0, ownerResultsReady: false,
    failures: [{ stage: 'APPLICATION', code: 'PROCESSING_DEADLINE_EXCEEDED', message: '정해진 시간 안에 결과를 반영하지 못했습니다.' }],
    failureConfirmationReference: null, ...changes,
  });
  await db.manager.update(AnalysisRequest, { requestId }, { lifecycle: 'CLOSED' });
}
/** 시험용 등록 Catch와 그 등록 연결을 만든다. */
async function registerCatch(requestId) {
  const request = await db.manager.findOneByOrFail(AnalysisRequest, { requestId });
  const catchId = randomUUID(), recordId = randomUUID();
  await db.query(`INSERT INTO catch_asset (catch_id, title, owner_id, source_request_id, source_result_id,
    source_candidate_id, work_identity, work_facts, subject_contribution, draft_status, reflection_status,
    reflection_questions, registration_assessment, source_mode)
    VALUES ($1, '합성 Catch', $2, $3, $4, 'candidate-1', $5, ARRAY['합성 사실'], '합성 기여', 'NOT_GENERATED',
    'NOT_GENERATED', ARRAY[]::text[], '{}'::jsonb, 'LIVE')`,
  [catchId, request.memberId, requestId, 'result-' + catchId, 'identity-' + catchId]);
  await db.query('INSERT INTO result_application_record VALUES ($1, $2, $3, $4, $5, now())',
    [recordId, requestId, request.currentAttemptId, 'result-' + catchId, 'a'.repeat(64)]);
  await db.query('INSERT INTO candidate_registration VALUES ($1, $2, $3, $4, $5, $6)',
    [randomUUID(), recordId, 'candidate-1', catchId, 'CREATED', true]);
}
/** 요청의 요청·동의·시도·멱등 키 행. */
function snapshot(requestId) {
  return db.query(`SELECT to_jsonb(r) AS request, to_jsonb(c) AS consent, to_jsonb(a) AS attempt,
    (SELECT coalesce(jsonb_agg(to_jsonb(k) ORDER BY k.key), '[]') FROM idempotency_record k WHERE k.request_id = r.request_id) AS keys
    FROM analysis_request r JOIN analysis_consent c ON c.consent_id = r.consent_id
    JOIN analysis_attempt a ON a.attempt_id = r.current_attempt_id WHERE r.request_id = $1`, [requestId]);
}
async function waitForMemberWaiters(blockerPid, expected) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const rows = await db.query(`SELECT waiting.pid FROM pg_locks waiting JOIN pg_locks held
      ON waiting.locktype = held.locktype AND waiting.database = held.database
      AND waiting.classid = held.classid AND waiting.objid = held.objid AND waiting.objsubid = held.objsubid
      WHERE held.pid = $1 AND held.locktype = 'advisory' AND held.granted AND NOT waiting.granted`, [blockerPid]);
    if (rows.length === expected) return rows.map(row => row.pid);
    await delay(20);
  }
  assert.fail('회원 접수 잠금의 대기 요청 수가 ' + expected + '가 되지 않았다');
}

for (const [label, overrides] of [['개발 로그인 켬', {}], ['DEV_LOGIN_ENABLED=false', { DEV_LOGIN_ENABLED: 'false' }],
  ['DEV_LOGIN_ENABLED 미지정', { DEV_LOGIN_ENABLED: undefined }], ['NODE_ENV=production', { NODE_ENV: 'production' }],
  ['NODE_ENV 미지정', { NODE_ENV: undefined }], ['NODE_ENV=preview', { NODE_ENV: 'preview' }]]) {
  test('실제 공급: 목록 판본과 실제 고지로 두 회원 등록 저장소를 LIVE 접수하고 동의 여섯 칸이 #252 공급값과 같다(' + label + ')', async t => {
    const s = await start(t, overrides);
    for (const repositoryId of [THEME, ZOO]) {
      const user = await s.real();
      const listed = await s.call('/v1/me/repositories', s.auth(user));
      assert.equal(listed.status, 200);
      const item = (await listed.json()).items.find(row => row.repositoryId === repositoryId);
      const notice = await s.call('/v1/analysis-notice', s.auth(user));
      assert.equal(notice.status, 200);
      const { noticeRevision } = await notice.json();
      const status = await accepted(await s.post(user, randomUUID(), { repositoryId,
        consent: { accepted: true, noticeRevision, scopeRevision: item.allowedScopeRevision } }));
      assert.deepEqual([status.repositoryId, status.lifecycle, status.processing, status.application],
        [repositoryId, 'ACTIVE', 'QUEUED', 'NOT_READY']);
      assert.deepEqual(status.retry, { allowed: false, reason: 'IN_PROGRESS' });
      const row = await stored(status.requestId);
      assert.deepEqual([row.notice_revision, row.scope_revision, row.source_mode],
        [REAL_NOTICE.noticeRevision, item.allowedScopeRevision, 'LIVE']);
      assert.deepEqual(row.consented_scope, supplied(repositoryId));
      assert.deepEqual(Object.keys(row.consented_scope).sort(), CONSENT_KEYS);
      assert.deepEqual(row.consented_scope.allowedResourceTypes, TYPES);
    }
    // 개발 회원·미지원 출처의 기존 경계는 그대로다.
    if (label === '개발 로그인 켬') {
      const developer = await s.devLogin('intake-323-' + randomUUID());
      const mock = await s.post(developer, randomUUID(), synthetic());
      assert.equal(mock.status, 202); assert.equal((await mock.json()).sourceMode, 'MOCK');
    } else {
      await error(await s.post(await s.member('catchu:dev-login:' + randomUUID(), null), randomUUID(), synthetic()), 403, 'INTERNAL_ERROR');
    }
    for (const identity of ['legacy:' + randomUUID(), 'catchu:google:']) {
      await error(await s.post(await s.member(identity)), 403, 'INTERNAL_ERROR');
    }
    assert.deepEqual(await db.query("SELECT count(*)::int AS live FROM analysis_attempt WHERE source_mode = 'LIVE'"), [{ live: 2 }]);
  });
}

test('실제 공급: 저장 동의는 큐 보내기의 모양·저장소·판본 검사를 통과하고 #232 선정 공급이 저장소 전체 선정으로 해석한다', async t => {
  const s = await start(t);
  const user = await s.real();
  const status = await accepted(await s.post(user));
  const row = await stored(status.requestId);
  // 저장 동의는 #252 접수 재확인이 같은 근거에서 주는 네 칸과 같다.
  const confirmed = await db.transaction('READ COMMITTED', async manager => s.selections.confirmForIntake(manager, user.memberId, THEME, await s.selections.prepareForIntake(user.memberId, THEME)));
  assert.deepEqual(row.consented_scope, confirmed.consentedScope);
  const queue = new MemoryRequestQueue();
  const log = dispatchLog();
  const summary = await new AnalysisRequestDispatcher(db, queue, new WorkerMessageValidator(CONTRACT_DIR), log).dispatchOnce();
  assert.deepEqual(summary, { read: 1, enqueued: 1, existing: 0, skipped: 0, paused: null });
  assert.deepEqual(log.entries, [{ event: 'ENQUEUED', requestId: status.requestId, attemptId: status.attemptId }]);
  const { data } = queue.jobs.get(status.attemptId);
  assert.deepEqual([data.sourceMode, data.consentId, data.noticeRevision], ['LIVE', status.consentId, REAL_NOTICE.noticeRevision]);
  // 큐 사본만 두 참조를 시도 ID로 바꾸고 DB의 원래 선정 참조는 그대로 둔다.
  assert.deepEqual(data.allowedScope, { revision: SCOPE, repositoryId: THEME, allowedResourceTypes: TYPES,
    selectionReference: status.attemptId });
  assert.equal(data.credentialContextReference, status.attemptId);
  assert.deepEqual((await stored(status.requestId)).consented_scope, supplied(THEME));
  // 내부 MOCK 메시지 준비 함수는 LIVE 시도를 준비하지 않는다. LIVE 메시지는 위 보내기가 저장 기록으로 만든다.
  await assert.rejects(s.app.get(AnalysisIntakeService).prepareExecutionRequest(user.memberId, status.requestId),
    e => e.code === 'CONSENT_REQUIRED');
  const context = { attemptId: status.attemptId, requestId: status.requestId, memberId: user.memberId, repositoryId: THEME,
    consentId: status.consentId, noticeRevision: row.notice_revision, scopeRevision: row.scope_revision,
    consentedScope: row.consented_scope, sourceMode: 'LIVE' };
  const source = new RegistrationContextSource();
  const whole = { attemptId: status.attemptId, requestId: status.requestId, memberId: user.memberId, repositoryId: THEME,
    scopeRevision: SCOPE, repository: { owner: 'ljm0850', name: 'TheMe' }, wholeRepository: true };
  assert.deepEqual(await source.resolve(db.manager, context, { lock: null }), whole);
  assert.deepEqual(await db.transaction(manager => source.resolve(manager, context, { lock: 'pessimistic_read' })), whole);
  // 부분 자료 종류·정의되지 않은 칸·큐 사본의 참조는 전체 선정으로 해석하지 않는다.
  for (const consentedScope of [{ ...row.consented_scope, allowedResourceTypes: ['COMMIT'] },
    { ...row.consented_scope, wholeRepository: true }, { ...row.consented_scope, selectionReference: status.attemptId }]) {
    assert.equal(await source.resolve(db.manager, { ...context, consentedScope }, { lock: null }), null);
  }
});

test('실제 공급: 합성·이전 고지나 배포된 현재 범위와 다른 판본은 403 CONSENT_REQUIRED다', async t => {
  const s = await start(t);
  const user = await s.real();
  for (const changes of [{ accepted: false }, { noticeRevision: SYNTHETIC_NOTICE.noticeRevision },
    { noticeRevision: 'catchu-real-analysis-notice-v1' }, { scopeRevision: SYNTHETIC_NOTICE.scopeRevision }, { scopeRevision: NEXT_SCOPE }]) {
    await error(await s.post(user, randomUUID(), command({ consent: consent(changes) })), 403, 'CONSENT_REQUIRED');
  }
  // 합성 저장소·합성 판본 본문은 실제 회원의 현재 선정 밖이다.
  await error(await s.post(user, randomUUID(), synthetic()), 404, 'RESOURCE_UNAVAILABLE');
  assert.deepEqual(await counts(), NONE);
  await moveScope(THEME);
  await error(await s.post(user), 403, 'CONSENT_REQUIRED');
  assert.deepEqual(await counts(), NONE);
  // DB에만 추가한 미배포 범위는 worker가 지원하지 않으므로 새 동의로도 접수하지 않는다.
  await error(await s.post(user, randomUUID(), command({ consent: consent({ scopeRevision: NEXT_SCOPE }) })), 403, 'CONSENT_REQUIRED');
  assert.deepEqual(await counts(), NONE);
});

test('대역(실제 고지 판본 제거): 현재 실제 고지가 없으면 합성 판본으로 대신하지 않고 403 CONSENT_REQUIRED', async t => {
  const s = await start(t);
  const user = await s.real();
  s.notices.realNotice = null;
  for (const body of [command(), command({ consent: consent({ noticeRevision: SYNTHETIC_NOTICE.noticeRevision }) })]) {
    await error(await s.post(user, randomUUID(), body), 403, 'CONSENT_REQUIRED');
  }
  assert.deepEqual(await counts(), NONE);
});

test('실제 공급: 연결 없음·해제·재인증 필요·보관 자격정보 없는 연결·합성 연결은 403 GITHUB_CONNECTION_REQUIRED', async t => {
  const s = await start(t);
  for (const connection of [null,
    { connectionState: 'DISCONNECTED', accountLogin: null, externalAccountReference: null, credentialReference: null },
    { connectionState: 'REAUTH_REQUIRED', credentialReference: null }, { credentialReference: null },
    { accountLogin: SYNTHETIC_REPOSITORY.ownerLogin, externalAccountReference: 'catchu:mock-github:x', credentialReference: null }]) {
    await error(await s.post(await s.real(connection)), 403, 'GITHUB_CONNECTION_REQUIRED');
  }
  assert.deepEqual(await counts(), NONE);
});

test('실제 보관소: 만료·이용 불가 자격정보는 상태 갱신 뒤 403, 보관소 오류는 500이고 같은 키 재전송은 갱신 없이 현재 상태다', async t => {
  const s = await start(t);
  // 보관 자격정보를 다시 저장할 수 있게 회원별 계정을 정해 연결한다. GitHub OAuth 응답만 시험 대역이다.
  const users = [];
  for (let index = 0; index < 5; index++) {
    const user = await s.real(null);
    s.client.exchange = async () => ({ accountLogin: 'vault-user-' + index, externalAccountReference: String(5000 + index),
      token: new GitHubAccessToken(TOKEN + '-vault-' + index), expiresAt: new Date(Date.now() + 1800000) });
    const authorization = await s.connections.authorize(user.memberId);
    await s.connections.connect(user.memberId, 'SYNTHETIC_CODE', authorization.state);
    users.push(user);
  }
  const [valid, expired, missing, broken, later] = users;
  const key = randomUUID(), laterKey = randomUUID();
  const first = await accepted(await s.post(valid, key));
  const laterFirst = await accepted(await s.post(later, laterKey));
  const expire = async (user, index) => db.manager.update(GitHubConnection, { memberId: user.memberId }, {
    credentialReference: await s.vault.save({ memberId: user.memberId, accountLogin: 'vault-user-' + index,
      externalAccountReference: String(5000 + index), token: new GitHubAccessToken(TOKEN), expiresAt: new Date(Date.now() - 1000) }) });
  await expire(expired, 1);
  await db.manager.update(GitHubConnection, { memberId: missing.memberId }, { credentialReference: 'github-v1:' + randomUUID() });
  for (const user of [expired, missing]) {
    await error(await s.post(user), 403, 'GITHUB_CONNECTION_REQUIRED');
    const row = await db.manager.findOneByOrFail(GitHubConnection, { memberId: user.memberId });
    assert.deepEqual([row.connectionState, row.credentialReference], ['REAUTH_REQUIRED', null]);
  }
  // 이용 불가가 아닌 보관소 오류는 재인증 필요로 바꾸지 않고 접수를 500으로 거부한다.
  await db.manager.update(GitHubConnection, { memberId: broken.memberId }, { credentialReference: 'github-v1:not-a-vault-reference' });
  await error(await s.post(broken), 500, 'INTERNAL_ERROR');
  assert.equal((await db.manager.findOneByOrFail(GitHubConnection, { memberId: broken.memberId })).connectionState, 'CONNECTED');
  assert.deepEqual(await counts(), { requests: 2, consents: 2, attempts: 2, keys: 2 });
  // 이미 접수된 키는 현재 연결을 보지 않는다. 보관소 오류·만료가 생겨도 같은 키·같은 본문은 갱신 없이 현재 상태다.
  await db.manager.update(GitHubConnection, { memberId: valid.memberId }, { credentialReference: 'github-v1:not-a-vault-reference' });
  await expire(later, 4);
  const refreshes = s.refreshed.length;
  for (const [user, sameKey, status] of [[valid, key, first], [later, laterKey, laterFirst]]) {
    const replay = await s.post(user, sameKey);
    assert.equal(replay.status, 200); assert.deepEqual(await replay.json(), status);
  }
  assert.equal(s.refreshed.length, refreshes);
  assert.equal((await db.manager.findOneByOrFail(GitHubConnection, { memberId: later.memberId })).connectionState, 'CONNECTED');
  // 새 키는 현재 연결을 다시 확인한다.
  await error(await s.post(valid), 500, 'INTERNAL_ERROR');
  await error(await s.post(later), 403, 'GITHUB_CONNECTION_REQUIRED');
  assert.equal((await db.manager.findOneByOrFail(GitHubConnection, { memberId: later.memberId })).connectionState, 'REAUTH_REQUIRED');
  assert.deepEqual(await counts(), { requests: 2, consents: 2, attempts: 2, keys: 2 });
  assert.equal(s.logs.join('\n').includes(TOKEN), false);
});

test('실제 보관소: GitHub 연동을 끈 서버는 남은 실제 연결로 새 접수·실패 재요청을 받지 않고 같은 키 재전송은 현재 상태를 준다', async t => {
  // 연동을 켠 서버에서 #231로 연결해 접수한 뒤, 같은 DB·세션 서명 키로 연동을 끈 서버를 띄운다. 연결 행·보관 참조는 남아 있다.
  const secret = randomBytes(32).toString('hex');
  const enabled = await start(t, { AUTH_JWT_SECRET: secret });
  const user = await enabled.real();
  const key = randomUUID();
  const first = await accepted(await enabled.post(user, key));
  const disabled = await start(t, { AUTH_JWT_SECRET: secret, GITHUB_CONNECTION_ENABLED: 'false' });
  const before = await counts();
  const replay = await disabled.post(user, key);
  assert.equal(replay.status, 200); assert.deepEqual(await replay.json(), first);
  await error(await disabled.post(user), 403, 'GITHUB_CONNECTION_REQUIRED');
  await terminal(first.requestId);
  const retry = command({ retryOfRequestId: first.requestId });
  await error(await disabled.post(user, randomUUID(), retry), 403, 'GITHUB_CONNECTION_REQUIRED');
  assert.deepEqual(await counts(), before);
  const connection = await db.manager.findOneByOrFail(GitHubConnection, { memberId: user.memberId });
  assert.equal(connection.connectionState, 'CONNECTED');
  // 같은 연결로 연동을 켠 서버에는 실패 재요청이 접수된다.
  const retried = await accepted(await enabled.post(user, randomUUID(), retry));
  assert.equal((await db.manager.findOneByOrFail(AnalysisRequest, { requestId: retried.requestId })).retryOfRequestId, first.requestId);
});

test('대역(같은 키 동시 요청·보관소 일시 오류): 기록 확인 뒤 같은 키 요청이 먼저 접수되면 갱신 실패 대신 그 접수의 현재 상태를 준다', async t => {
  const s = await start(t);
  const user = await s.real();
  const key = randomUUID();
  const refresh = s.connections.refreshStatus;
  let first;
  // 대역: 이 요청이 기록 확인을 지나 상태를 갱신하는 동안 같은 키·같은 본문 요청이 접수를 마치고, 그 뒤 갱신이 실패한다.
  s.connections.refreshStatus = async () => {
    s.connections.refreshStatus = refresh;
    first = await accepted(await s.post(user, key));
    throw new Error('synthetic-vault-io-323');
  };
  const replay = await s.post(user, key);
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), first);
  assert.deepEqual(await counts(), { requests: 1, consents: 1, attempts: 1, keys: 1 });
  assert.ok(s.logs.some(line => line.includes('갱신 실패는 응답에 쓰지 않음 requestId=' + first.requestId)));
  // 새 키라면 같은 갱신 실패는 그대로 500이고 행을 남기지 않는다.
  s.connections.refreshStatus = async () => { throw new Error('synthetic-vault-io-323'); };
  await error(await s.post(user), 500, 'INTERNAL_ERROR');
  assert.deepEqual(await counts(), { requests: 1, consents: 1, attempts: 1, keys: 1 });
  assert.equal(s.logs.join('\n').includes('synthetic-vault-io-323'), false);
});

test('실제 보관소: 개발 회원에 실제 GitHub 연결이 섞이면 새 접수·실패 재요청을 거부하고 LIVE 시도·자격정보 갱신이 없다', async t => {
  const s = await start(t);
  // 합성 연결의 개발 접수는 MOCK이다. 확정 실패로 닫아 실패 재요청 경로도 본다.
  const developer = await s.devLogin('intake-323-developer');
  const mock = await s.post(developer, randomUUID(), synthetic());
  assert.equal(mock.status, 202);
  const first = await mock.json();
  assert.equal(first.sourceMode, 'MOCK');
  await terminal(first.requestId);
  // 만료된 실제 자격정보를 보관한 실제 연결로 바꾼다. 실제 회원이었다면 갱신으로 재인증 필요가 됐을 상태다.
  const reference = await s.vault.save({ memberId: developer.memberId, accountLogin: 'real-account',
    externalAccountReference: '424242', token: new GitHubAccessToken(TOKEN), expiresAt: new Date(Date.now() - 1000) });
  await db.manager.update(GitHubConnection, { memberId: developer.memberId },
    { accountLogin: 'real-account', externalAccountReference: '424242', credentialReference: reference });
  const before = await counts();
  for (const body of [synthetic({ retryOfRequestId: first.requestId }), synthetic(), command(),
    command({ retryOfRequestId: first.requestId })]) {
    await error(await s.post(developer, randomUUID(), body), 500, 'INTERNAL_ERROR');
  }
  // 처음부터 실제 연결만 있는 개발 회원도 같다.
  const mixed = await s.member('catchu:dev-login:' + randomUUID(), { accountLogin: 'real-other', externalAccountReference: '434343' });
  for (const body of [synthetic(), command()]) await error(await s.post(mixed, randomUUID(), body), 500, 'INTERNAL_ERROR');
  assert.deepEqual(await counts(), before);
  const connection = await db.manager.findOneByOrFail(GitHubConnection, { memberId: developer.memberId });
  assert.deepEqual([connection.connectionState, connection.credentialReference], ['CONNECTED', reference]);
  assert.deepEqual(s.refreshed, []);
  assert.deepEqual(await db.query('SELECT source_mode, count(*)::int AS attempts FROM analysis_attempt GROUP BY source_mode'),
    [{ source_mode: 'MOCK', attempts: 1 }]);
  assert.equal(s.logs.join('\n').includes(TOKEN), false);
});

test('실제 공급: 현재 선정 목록 밖 저장소와 제외된 선정은 403 REPOSITORY_NOT_ALLOWED', async t => {
  const s = await start(t);
  const user = await s.real();
  for (const repositoryId of [SYNTHETIC_REPOSITORY.repositoryId, '999999999', 'TheMe']) {
    await error(await s.post(user, randomUUID(), command({ repositoryId })), 404, 'RESOURCE_UNAVAILABLE');
  }
  await db.manager.delete(RepositoryRegistration, { memberId: user.memberId, repositoryId: THEME });
  await error(await s.post(user), 404, 'RESOURCE_UNAVAILABLE');
  assert.deepEqual(await counts(), NONE);
  // 제외하지 않은 현재 선정은 그대로 받는다.
  await accepted(await s.post(user, randomUUID(), command({ repositoryId: ZOO })));
});

test('실제 공급·대역: 선정 공급 장애는 500이고 합성 자료·선정 없음·MOCK 시도로 바꾸지 않으며 내부 값을 노출하지 않는다', async t => {
  const s = await start(t);
  const user = await s.real();
  // 실제 공급: 선정 행이 카탈로그에 없는 선정 참조를 가리킨다(선정 자료 불일치).
  const verify = s.metadata.verify;
  s.metadata.verify = async () => { throw new Error('synthetic missing-323 metadata failure'); };
  const mismatch = await error(await s.post(user), 500, 'INTERNAL_ERROR');
  s.metadata.verify = verify;
  // 대역: 같은 생성 트랜잭션 안에서 실제 PostgreSQL 오류를 낸다.
  s.selections.confirmForIntake = manager => manager.query('SELECT 1 FROM __synthetic_missing_table_323');
  const failed = await error(await s.post(user, randomUUID(), command({ repositoryId: ZOO })), 500, 'INTERNAL_ERROR');
  const output = JSON.stringify([mismatch, failed]) + s.logs.join('\n');
  for (const value of ['missing-323', '__synthetic_missing_table_323', 'ljm0850', SYNTHETIC_REPOSITORY.repositoryId, user.token]) {
    assert.equal(output.includes(value), false, value);
  }
  assert.deepEqual(await counts(), NONE);
  delete s.selections.confirmForIntake;
  await accepted(await s.post(user));
});

for (const change of ['연결 해제', '재인증 필요', '고지 판본 변경', '범위 판본 변경', '공개 상태 변경']) {
  const kind = change === '고지 판본 변경' ? '대역(고지 판본 교체)' : '실제 공급';
  test(kind + ': 같은 키·같은 본문 재전송은 접수 뒤 ' + change + '에도 현재 상태를 주고 새 접수·실패 재요청에는 현재 조건을 적용한다', async t => {
    const s = await start(t);
    const user = await s.real();
    const key = randomUUID();
    const first = await accepted(await s.post(user, key));
    const [original] = await snapshot(first.requestId);
    let code = 'CONSENT_REQUIRED';
    if (change === '연결 해제' || change === '재인증 필요') {
      // #231 해제·만료 반영이 남기는 연결 행 모양이다.
      await db.manager.update(GitHubConnection, { memberId: user.memberId }, change === '연결 해제'
        ? { connectionState: 'DISCONNECTED', accountLogin: null, externalAccountReference: null, credentialReference: null }
        : { connectionState: 'REAUTH_REQUIRED', credentialReference: null });
      code = 'GITHUB_CONNECTION_REQUIRED';
    } else if (change === '고지 판본 변경') {
      // 대역: 새 고지 판본 배포를 같은 서버의 판본 교체로 흉내 낸다.
      s.notices.realNotice = { noticeRevision: 'catchu-real-analysis-notice-v3', text: '변경된 실제 고지' };
    } else if (change === '범위 판본 변경') {
      await moveScope(THEME);
    } else {
      s.metadata.verify = async () => { throw new ApiError('REPOSITORY_PRIVATE'); };
      code = 'REPOSITORY_PRIVATE';
    }
    const before = await counts();
    const refreshes = s.refreshed.length;
    const replay = await s.post(user, key);
    assert.equal(replay.status, 200); assert.deepEqual(await replay.json(), first);
    assert.equal(s.refreshed.length, refreshes, '재전송은 연결 상태 갱신을 부르지 않는다');
    await error(await s.post(user), 403, code);
    await terminal(first.requestId);
    await error(await s.post(user, randomUUID(), command({ retryOfRequestId: first.requestId })), 403, code);
    const closed = await s.post(user, key);
    assert.equal(closed.status, 200);
    const shown = await closed.json();
    assert.deepEqual([shown.requestId, shown.lifecycle, shown.sourceMode], [first.requestId, 'CLOSED', 'LIVE']);
    assert.deepEqual(await counts(), before);
    assert.deepEqual((await snapshot(first.requestId))[0].consent, original.consent);
  });
}

test('대역(새 좌표 판본): 좌표 판본이 바뀐 뒤 실패 재요청은 새 선정 참조로 동의를 저장하고 이전 동의의 원래 선정 참조는 그대로다', async t => {
  const s = await start(t);
  const user = await s.real();
  const first = await accepted(await s.post(user));
  await terminal(first.requestId);
  const versions = new SelectedRepositoryCatalog().listCurrent();
  const theme = versions.find(version => version.repositoryId === THEME);
  const renamed = { ...theme, name: 'renamed-fixture', url: 'https://github.com/' + theme.owner + '/renamed-fixture',
    selectionReference: 'catchu:selected-repository:test-323-renamed:570342307:v2' };
  // 이름 변경을 가정한 새 좌표 판본은 시험 카탈로그로 더한다. 선정 행의 참조 변경은 #252 갱신 절차와 같다.
  await db.manager.update(RepositoryRegistration, { memberId: user.memberId, repositoryId: THEME }, { name: renamed.name, repositoryUrl: renamed.url });
  const next = await accepted(await s.post(user, randomUUID(), command({ retryOfRequestId: first.requestId })));
  assert.deepEqual((await stored(next.requestId)).consented_scope, { ...supplied(THEME), repository: { owner: renamed.owner, name: renamed.name, url: renamed.url } });
  assert.deepEqual((await stored(first.requestId)).consented_scope, supplied(THEME));
});

test('실제 공급: 원자 접수·현재 상태 재응답·같은 저장소 새 키 200은 새 동의를 만들지 않고 같은 키 다른 본문은 409', async t => {
  const s = await start(t);
  const user = await s.real();
  const key = randomUUID();
  const first = await accepted(await s.post(user, key));
  assert.deepEqual(Object.keys(first).sort(), RESPONSE_KEYS);
  assert.deepEqual([first.registeredCatchIds, first.ownerResultsReady, first.eligibleCandidateCount, first.failures], [[], false, 0, []]);
  assert.deepEqual(await counts(), { requests: 1, consents: 1, attempts: 1, keys: 1 });
  const reordered = { consent: { scopeRevision: SCOPE, noticeRevision: REAL_NOTICE.noticeRevision, accepted: true }, repositoryId: THEME };
  const repeated = await s.post(user, key, reordered);
  assert.equal(repeated.status, 200); assert.deepEqual(await repeated.json(), first);
  const active = await s.post(user);
  assert.equal(active.status, 200); assert.deepEqual(await active.json(), first);
  assert.deepEqual(await counts(), { requests: 1, consents: 1, attempts: 1, keys: 2 });
  for (const body of [command({ repositoryId: ZOO }), command({ retryOfRequestId: randomUUID() }),
    command({ consent: consent({ noticeRevision: 'catchu-real-analysis-notice-v1' }) }), command({ consent: consent({ scopeRevision: 'old' }) })]) {
    await error(await s.post(user, key, body), 409, 'IDEMPOTENCY_CONFLICT');
  }
  assert.deepEqual(await counts(), { requests: 1, consents: 1, attempts: 1, keys: 2 });
});

test('실제 공급: 동시 같은 키·다른 키에도 회원 ACTIVE는 하나이고 두 회원 등록 저장소 동시 요청은 한 건 접수·한 건 409', async t => {
  const s = await start(t);
  const user = await s.real();
  const key = randomUUID();
  const same = await Promise.all(Array.from({ length: 8 }, () => s.post(user, key)));
  assert.equal(same.filter(r => r.status === 202).length, 1); assert.equal(same.filter(r => r.status === 200).length, 7);
  const ids = await Promise.all(same.map(r => r.json()));
  assert.equal(new Set(ids.map(v => v.requestId)).size, 1); assert.ok(ids.every(v => v.sourceMode === 'LIVE'));
  const different = await Promise.all(Array.from({ length: 8 }, () => s.post(user)));
  assert.ok(different.every(r => r.status === 200));
  assert.deepEqual(await counts(), { requests: 1, consents: 1, attempts: 1, keys: 9 });
  const other = await s.real();
  const rs = await Promise.all([s.post(other), s.post(other, randomUUID(), command({ repositoryId: ZOO }))]);
  assert.deepEqual(rs.map(r => r.status).sort(), [202, 409]);
  const created = await rs.find(r => r.status === 202).json();
  const conflict = await error(rs.find(r => r.status === 409), 409, 'ANALYSIS_IN_PROGRESS');
  assert.equal(conflict.details.existingRequestId, created.requestId);
  await terminal(created.requestId, 'EMPTY');
  await accepted(await s.post(other, randomUUID(), command({ repositoryId: created.repositoryId === THEME ? ZOO : THEME })));
});

test('실제 공급: 실패와 정상 완료 모두 최신 참조·새 실제 동의로 재분석하며 옛 요청은 재사용하지 못한다', async t => {
  const s = await start(t);
  const user = await s.real();
  const originalKey = randomUUID();
  const first = await accepted(await s.post(user, originalKey));
  await terminal(first.requestId);
  await error(await s.post(user), 409, 'RETRY_NOT_ALLOWED');
  const key = randomUUID();
  const body = command({ retryOfRequestId: first.requestId });
  const next = await accepted(await s.post(user, key, body));
  for (const field of ['requestId', 'consentId', 'attemptId']) assert.notEqual(first[field], next[field]);
  assert.equal((await db.manager.findOneByOrFail(AnalysisRequest, { requestId: next.requestId })).retryOfRequestId, first.requestId);
  const row = await stored(next.requestId);
  assert.deepEqual([row.notice_revision, row.consented_scope], [REAL_NOTICE.noticeRevision, supplied(THEME)]);
  assert.equal((await db.manager.findOneByOrFail(AnalysisConsent, { consentId: first.consentId })).requestId, first.requestId);
  const replay = await s.post(user, key, body);
  assert.equal(replay.status, 200); assert.equal((await replay.json()).requestId, next.requestId);
  assert.deepEqual((await (await s.post(user, originalKey)).json()).retry, { allowed: false, reason: 'IN_PROGRESS' });
  await terminal(next.requestId, 'EMPTY');
  assert.deepEqual((await (await s.post(user, originalKey)).json()).retry, { allowed: false, reason: 'REANALYSIS_DEFERRED' });
  for (const retryOfRequestId of [undefined, first.requestId]) {
    await error(await s.post(user, randomUUID(), command(retryOfRequestId ? { retryOfRequestId } : {})), 409, 'RETRY_NOT_ALLOWED');
  }
  await accepted(await s.post(user, randomUUID(), command({ retryOfRequestId: next.requestId })));
  assert.deepEqual(await counts(), { requests: 3, consents: 3, attempts: 3, keys: 3 });
});

test('실제 공급: 반영 실패로 닫힌 요청은 기존 Catch 유무와 무관하게 새 실제 동의로 재분석한다', async t => {
  const s = await start(t);
  const user = await s.real();
  const key = randomUUID();
  const first = await accepted(await s.post(user, key));
  await applyFailed(first.requestId, { processing: 'SUCCEEDED', eligibleCandidateCount: 2 });
  assert.deepEqual((await (await s.post(user, key)).json()).retry, { allowed: true, reason: 'FAILURE_WITHOUT_RESULTS' });
  await error(await s.post(user), 409, 'RETRY_NOT_ALLOWED');
  const next = await accepted(await s.post(user, randomUUID(), command({ retryOfRequestId: first.requestId })));
  assert.deepEqual((await stored(next.requestId)).consented_scope, supplied(THEME));
  const other = await s.real();
  const registered = await accepted(await s.post(other));
  await applyFailed(registered.requestId, { processing: 'SUCCEEDED', eligibleCandidateCount: 1 });
  await registerCatch(registered.requestId);
  await error(await s.post(other, randomUUID(), command()), 409, 'RETRY_NOT_ALLOWED');
  await accepted(await s.post(other, randomUUID(), command({ retryOfRequestId: registered.requestId })));
  assert.deepEqual(await counts(), { requests: 4, consents: 4, attempts: 4, keys: 4 });
});

test('실제 공급: 닫힌 최신 요청은 결과 무관 재분석하고 복구 중만 거부한다', async t => {
  const s = await start(t);
  for (const [processing, changes] of [['EMPTY', {}], ['SUCCEEDED', {}],
    ['PARTIAL_FAILED', {}], ['FAILED', { failureConfirmationReference: null }],
    ['FAILED', { failures: [] }], ['FAILED', { processing: 'UNCERTAIN' }],
    ['FAILED', { application: 'RECOVERING' }], ['FAILED', { eligibleCandidateCount: 1 }],
    ['FAILED', { ownerResultsReady: true }]]) {
    const user = await s.real();
    const first = await accepted(await s.post(user));
    await terminal(first.requestId, processing, changes);
    await error(await s.post(user, randomUUID(), command()), 409, 'RETRY_NOT_ALLOWED');
    const response = await s.post(user, randomUUID(), command({ retryOfRequestId: first.requestId }));
    if (changes.application === 'RECOVERING') await error(response, 409, 'RETRY_NOT_ALLOWED');
    else await accepted(response);
    assert.equal(await db.manager.countBy(AnalysisRequest, { memberId: user.memberId }), changes.application === 'RECOVERING' ? 1 : 2,
      JSON.stringify([processing, changes]));
  }
});

test('실제 공급: 다른 회원·없는·형식이 틀린 재요청 참조는 ACTIVE로 숨기지 않고 같은 404', async t => {
  const s = await start(t);
  const a = await s.real(), b = await s.real();
  const owned = await accepted(await s.post(b));
  await accepted(await s.post(a));
  for (const reference of [owned.requestId, randomUUID(), 'not-uuid']) {
    await error(await s.post(a, randomUUID(), command({ retryOfRequestId: reference })), 404, 'RESOURCE_UNAVAILABLE');
  }
  assert.equal((await counts()).requests, 2);
});

test('실제 공급: 이전 실패 키 재전송·새 실패 재요청의 잠금 경합은 200·202와 중복 없는 저장', async t => {
  const s = await start(t);
  const user = await s.real();
  const oldKey = randomUUID(), newKey = randomUUID();
  const first = await accepted(await s.post(user, oldKey));
  await terminal(first.requestId);
  const [original] = await snapshot(first.requestId);
  const blocker = db.createQueryRunner();
  const pending = [];
  let responses;
  await blocker.connect();
  try {
    await blocker.startTransaction();
    const [{ pid }] = await blocker.query('SELECT pg_backend_pid() AS pid');
    await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [JSON.stringify(['catchu:analysis-intake', user.memberId])]);
    // 새 키를 먼저 대기시킨다. 이전 키는 멱등 소유 확인의 KEY SHARE 뒤 같은 회원 잠금에서 기다린다.
    pending.push(s.post(user, newKey, command({ retryOfRequestId: first.requestId })));
    const [retryPid] = await waitForMemberWaiters(pid, 1);
    pending.push(s.post(user, oldKey));
    const waiters = await waitForMemberWaiters(pid, 2);
    assert.ok(waiters.includes(retryPid)); assert.equal(new Set(waiters).size, 2);
    await blocker.commitTransaction();
    responses = await Promise.all(pending);
  } finally {
    if (blocker.isTransactionActive) await blocker.rollbackTransaction();
    await Promise.allSettled(pending);
    await blocker.release();
  }
  const [retry, replay] = responses;
  const next = await accepted(retry);
  assert.equal(replay.status, 200);
  const old = await replay.json();
  assert.deepEqual([old.requestId, old.lifecycle, old.processing, old.retry], [first.requestId, 'CLOSED', 'FAILED', { allowed: false, reason: 'IN_PROGRESS' }]);
  assert.deepEqual(await counts(), { requests: 2, consents: 2, attempts: 2, keys: 2 });
  assert.equal(await db.manager.countBy(AnalysisRequest, { memberId: user.memberId, lifecycle: 'ACTIVE' }), 1);
  assert.deepEqual((await stored(next.requestId)).consented_scope, supplied(THEME));
  assert.deepEqual((await snapshot(first.requestId))[0], original);
  assert.equal((await s.post(user, newKey, command({ retryOfRequestId: first.requestId }))).status, 200);
  assert.deepEqual(await counts(), { requests: 2, consents: 2, attempts: 2, keys: 2 });
});

test('실제 공급: 저장 실패와 지연 커밋 실패는 요청·동의·시도·멱등 기록을 모두 롤백하고 같은 키로 다시 접수한다', async t => {
  const s = await start(t);
  const user = await s.real();
  for (const target of ['analysis_consent', 'idempotency_record']) {
    await db.query('ALTER TABLE ' + target + ' ADD CONSTRAINT test_323_fail CHECK (false) NOT VALID');
    try { await error(await s.post(user), 500, 'INTERNAL_ERROR'); }
    finally { await db.query('ALTER TABLE ' + target + ' DROP CONSTRAINT test_323_fail'); }
    assert.deepEqual(await counts(), NONE);
  }
  await db.query("CREATE FUNCTION test_323_commit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic-secret-commit-323'; END $$");
  await db.query('CREATE CONSTRAINT TRIGGER test_323_commit_fail AFTER INSERT ON idempotency_record DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION test_323_commit_fail()');
  const key = randomUUID();
  try {
    const body = await error(await s.post(user, key), 500, 'INTERNAL_ERROR');
    assert.equal(JSON.stringify(body).includes('synthetic-secret-commit-323'), false);
  } finally {
    await db.query('DROP TRIGGER test_323_commit_fail ON idempotency_record');
    await db.query('DROP FUNCTION test_323_commit_fail()');
  }
  assert.deepEqual(await counts(), NONE);
  await accepted(await s.post(user, key));
});

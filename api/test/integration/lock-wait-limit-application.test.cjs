require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { after, afterEach, before, beforeEach, test } = require('node:test');
const { NestFactory } = require('@nestjs/core');
const { DataSource } = require('typeorm');
const { decodeJwt } = require('jose');
const { AppModule } = require('../../dist/app.module');
const { configureApp } = require('../../dist/app.setup');
const { CONTRACT_DIR, event } = require('../helpers/receiver-harness.cjs');
const { AnalysisAttempt, AnalysisConsent, AnalysisRequest } = require('../../dist/member-analysis/member-analysis.entity');
const { SYNTHETIC_REPOSITORY } = require('../../dist/member-analysis/dev-member.service');
const { DatabaseReceiverStore } = require('../../dist/analysis-receiver/database-receiver.store');
const { AnalysisReceiver, ReceiverStorageError } = require('../../dist/analysis-receiver/analysis-receiver.service');
const { WorkerMessageValidator } = require('../../dist/analysis-receiver/worker-message.validator');
const { AnalysisRegistrationError, AnalysisRegistrationService } = require('../../dist/analysis-receiver/analysis-registration.service');
const { RepositoryRegistrationPort } = require('../../dist/analysis-receiver/repository-registration.port');
const { ResultApplicationService } = require('../../dist/result-application/result-application.service');
const { ANALYSIS_PROCESSING_DEADLINE_MS, AnalysisDeadlineService } = require('../../dist/analysis-deadline/analysis-deadline.service');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const {
  APP_LOCK_TIMEOUT_MS, NO_ROLE_PRIVILEGE, assertCapWait, assertQueuedCapWait, cleanUpLocks, createLockWaitRoles, hold, holdAdvisory,
  holdRow, sleepUntil, timed, waitUntilBlocked, waitUntilWaiting, withAppAccount,
} = require('../support/lock-wait-limit.cjs');

// #220: 결과 수신·반영과, 반영 중인 요청에 겹치는 접수 재응답·결과 재전달·진행 알림·시한 닫기의 잠금 대기를
// 앱 계정 3초 조건에서 본다. 수신·반영·닫기 서비스는 그 계정으로 띄운 앱의 DB 연결을 쓰고, 자료 준비와 잠금을 쥐는 쪽은
// 상한 없는 테스트 DB 계정이다. 반영 실패는 초기 잠금 실패·반영 중 실패·실패 기록 중 잠금 실패로 나누어
// 기존 계약(재전달로 자동 재반영하지 않음, 시한 판정이 닫음)대로 남는지 본다.
// 운영의 받기 소비자는 동시 1이라 한 api 안에서는 결과·진행 알림 수신이 반영과 겹치지 않는다. 반영 중 수신 경쟁은
// api가 여럿일 때의 경우이고, 접수 재응답(HTTP)과 시한 닫기는 한 api에서도 겹친다.
// 후보가 많은 합성 결과(40·100·300·500건)의 반영 시간은 이 환경에서 한 번 잰 값이며, 모든 부하에서 3초가 적정하다는 근거가 아니다.
// 반영과 겹친 경쟁 요청이 모두 성공하는 경우와 상한에서 실패하는 경우는 후보 수별 측정과 따로 조건을 만들어 확인한다.

const SUBMITTED = new Date('2026-10-14T00:00:00.000Z');
const DEADLINE = new Date(SUBMITTED.getTime() + ANALYSIS_PROCESSING_DEADLINE_MS);
const APPLICATION_DEADLINE = { stage: 'APPLICATION', code: 'PROCESSING_DEADLINE_EXCEEDED', message: '정해진 시간 안에 결과를 반영하지 못했습니다.' };
const STORAGE_FAILURE = { stage: 'APPLICATION', code: 'STORAGE_UNAVAILABLE', message: '결과 반영에 실패했습니다.' };
const FIXTURE = readFileSync(resolve(__dirname, '../../../worker/fixtures/m1-synthetic/results/succeeded-one-candidate.json'), 'utf8');
const ENV = {
  NODE_ENV: 'test', DEV_LOGIN_ENABLED: 'true', AUTH_JWT_SECRET: randomBytes(32).toString('hex'),
  AUTH_ACCESS_TOKEN_TTL_SECONDS: '900', AUTH_WEB_ORIGIN: 'https://catchu.example',
  SHARE_LINK_WEB_BASE_URL: 'https://catchu.example', LINK_GRANT_SECRET: randomBytes(32).toString('hex'),
};
const saved = {};
let db, roles, app, url, appDb;

before(async () => {
  for (const [key, value] of Object.entries(ENV)) { saved[key] = process.env[key]; process.env[key] = value; }
  db = await openTestDataSource();
  roles = await createLockWaitRoles(db);
  if (!roles) return;
  const logger = Object.fromEntries(['log', 'error', 'warn', 'debug', 'verbose', 'fatal'].map(level => [level, () => {}]));
  app = await withAppAccount(roles, async () =>
    configureApp(await NestFactory.create(AppModule, { logger, abortOnError: false })));
  require('../support/synthetic-daily-limit.cjs').bindSyntheticDailyLimit(app);
  await app.listen(0, '127.0.0.1');
  url = await app.getUrl();
  // 수신·반영·닫기 서비스도 앱 계정으로 연 이 앱의 DB 연결을 쓴다.
  appDb = app.get(DataSource);
});
after(async () => {
  try { await app?.close(); } finally {
    try { await roles?.drop(); } finally {
      await db?.destroy();
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    }
  }
});
beforeEach(async () => { await resetTestDatabase(db); });
// 대기 확인이나 검사가 실패해 시험이 잠금을 풀기 전에 끝나도, 다음 시험 전에 잠금을 풀고 시작한 작업이 끝나기를 기다린다.
afterEach(() => cleanUpLocks());

function ready(t) {
  if (roles) return true;
  t.skip(NO_ROLE_PRIVILEGE);
  return false;
}

function fill(value, context) {
  if (Array.isArray(value)) return value.map(item => fill(item, context));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, fill(item, context)]));
  return typeof value === 'string' ? value.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    assert.ok(Object.hasOwn(context, key), key);
    return context[key];
  }) : value;
}
/** #103 합성 결과를 요청 맥락으로 채우고 후보 하나를 count건으로 늘린다. 작업 정체가 모두 달라 후보마다 Catch가 하나씩 생긴다. */
function synthesize(context, count) {
  const result = fill(JSON.parse(FIXTURE), { ...context, caseId: randomUUID() });
  const [template] = result.candidates;
  result.candidates = Array.from({ length: count }, (_, index) => {
    const suffix = String(index + 1).padStart(3, '0');
    return { ...structuredClone(template), candidateId: `${template.candidateId}-${suffix}`,
      workIdentity: `${template.workIdentity}-${suffix}`,
      evidence: template.evidence.map(item => ({ ...structuredClone(item), evidenceId: `${item.evidenceId}-${suffix}` })) };
  });
  return result;
}
/** 접수 API를 대신해 요청·동의·첫 시도만 넣는다(analysis-deadline 시험과 같은 방식). */
async function prepare(count = 1) {
  const context = { requestId: randomUUID(), attemptId: randomUUID(), consentId: randomUUID(), memberId: randomUUID(),
    repositoryId: 'synthetic-repository', scopeRevision: 'synthetic-scope' };
  await db.transaction(async manager => {
    await manager.query("INSERT INTO member_account VALUES ($1, $2, 'ACTIVE')", [context.memberId, 'fixture:' + context.memberId]);
    await manager.insert(AnalysisRequest, { registrationId: await require('../support/registered-analysis.cjs').ensureRegistration(manager, context), requestId: context.requestId, memberId: context.memberId, repositoryId: context.repositoryId,
      consentId: context.consentId, currentAttemptId: context.attemptId, submittedAt: SUBMITTED, updatedAt: SUBMITTED });
    await manager.insert(AnalysisConsent, { consentId: context.consentId, requestId: context.requestId, memberId: context.memberId,
      repositoryId: context.repositoryId, accepted: true, noticeRevision: 'fixture', scopeRevision: context.scopeRevision,
      consentedScope: { synthetic: true }, consentedAt: SUBMITTED });
    await manager.insert(AnalysisAttempt, { attemptId: context.attemptId, requestId: context.requestId, sourceMode: 'MOCK',
      processing: 'QUEUED', application: 'NOT_READY' });
  });
  return synthesize(context, count);
}

const call = (path, options = {}) => fetch(url + path, { ...options, signal: AbortSignal.timeout(20000) });
async function login(identity) {
  const response = await call('/v1/auth/dev-login', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId: identity }) });
  assert.equal(response.status, 200);
  const { accessToken } = await response.json();
  return { token: accessToken, memberId: decodeJwt(accessToken).sub };
}
/** 실제 고지·선정 저장소 API의 응답으로 동의 본문을 만든다. */
async function consentBody(user) {
  const headers = { Authorization: 'Bearer ' + user.token };
  const notice = await (await call('/v1/analysis-notice', { headers })).json();
  const repositories = await (await call('/v1/me/repositories', { headers })).json();
  const repository = repositories.items.find(item => item.repositoryId === SYNTHETIC_REPOSITORY.repositoryId);
  assert.ok(repository, '합성 저장소가 선정 저장소 API에 있어야 한다');
  return { repositoryId: repository.repositoryId,
    consent: { accepted: true, noticeRevision: notice.noticeRevision, scopeRevision: repository.allowedScopeRevision } };
}
async function submit(user, key, body) {
  const response = await call('/v1/analysis-requests', { method: 'POST', headers: { 'Content-Type': 'application/json',
    Authorization: 'Bearer ' + user.token, 'Idempotency-Key': key }, body: JSON.stringify(body) });
  return { status: response.status, cacheControl: response.headers.get('cache-control'), body: await response.json() };
}
/** 실제 접수 API가 만든 요청에 맞춘 합성 결과. */
async function resultFor(requestId, count) {
  const [row] = await db.query(`SELECT r.current_attempt_id AS "attemptId", r.member_id AS "memberId",
      r.repository_id AS "repositoryId", r.consent_id AS "consentId", c.scope_revision AS "scopeRevision"
    FROM analysis_request r JOIN analysis_consent c ON c.consent_id = r.consent_id WHERE r.request_id = $1`, [requestId]);
  return synthesize({ requestId, ...row }, count);
}

// 필수 공급 경계의 시험 대역. 실제 GitHub 관측은 아니다.
const observation = context => ({ ownerId: context.memberId, repositoryId: context.repositoryId,
  githubRepository: { owner: 'synthetic-owner', name: 'synthetic-repo' }, confirmedSourceState: { synthetic: true, visibility: 'PUBLIC' },
  observationProvenance: { synthetic: true, provider: 'test' }, observedAt: new Date(), appliedRestriction: 'NONE' });
function pipeline() {
  const rejections = [], failures = [];
  const receiver = new AnalysisReceiver(new DatabaseReceiverStore(appDb), new WorkerMessageValidator(CONTRACT_DIR),
    { record: (kind, code) => rejections.push(`${kind}:${code}`) });
  const registration = new AnalysisRegistrationService(receiver, appDb, { observe: async context => observation(context) },
    { failed: code => failures.push(code) });
  return { receiver, registration, rejections, failures };
}
const applier = result => new ResultApplicationService(appDb, new RepositoryRegistrationPort(observation(result), result.repositoryId));
function deadline(at) {
  const logs = [];
  const service = new AnalysisDeadlineService(appDb, {
    closed: (requestId, attemptId, decision) => logs.push({ closed: decision, requestId }),
    unexpected: (requestId, processing, application) => logs.push({ unexpected: `${processing}/${application}`, requestId }),
    failed: (requestId, error) => logs.push({ failed: error, requestId }),
  }, () => at);
  return { service, logs };
}
async function stored(result) {
  const request = await db.manager.findOneByOrFail(AnalysisRequest, { requestId: result.requestId });
  const attempt = await db.manager.findOneByOrFail(AnalysisAttempt, { attemptId: result.attemptId });
  return { request, attempt };
}
const counts = async () => (await db.query(`SELECT (SELECT count(*)::int FROM result_application_record) AS receipts,
  (SELECT count(*)::int FROM repository_protection) AS protections, (SELECT count(*)::int FROM catch_asset) AS catches,
  (SELECT count(*)::int FROM catch_evidence) AS evidence, (SELECT count(*)::int FROM candidate_registration) AS registrations`))[0];
const NOTHING_REGISTERED = { receipts: 1, protections: 0, catches: 0, evidence: 0, registrations: 0 };
/** 후보 등록은 작업 정체 순서로 회원·작업 잠금을 잡는다. 마지막 작업의 잠금을 쥐면 앞의 후보를 모두 넣은 뒤 기다린다. */
const workLocks = result => result.candidates.map(c => c.workIdentity).sort().map(work => JSON.stringify([result.memberId, work]));
const lastWorkLock = result => workLocks(result).at(-1);
/** 기존 계약의 후속: 같은 결과의 재전달은 수신 확인만 하고 자동 재반영하지 않는다. */
async function assertNoReapply(result) {
  const before = await stored(result);
  const resent = await pipeline().registration.receiveResult(result, async () => {});
  assert.equal(resent.receipt.disposition, 'DUPLICATE');
  assert.equal(resent.receipt.code, 'ALREADY_RECEIVED');
  assert.equal(resent.application, undefined);
  assert.deepEqual(await stored(result), before);
}
function assertInternalError(result, label) {
  assert.equal(result.status, 500, `${label}: ${JSON.stringify(result.body)}`);
  assert.deepEqual(result.body, { code: 'INTERNAL_ERROR', message: result.body.message });
  assert.equal(result.cacheControl, 'no-store');
}

test('결과 수신: 요청 행을 3초 넘게 쥔 작업이 있으면 결과·진행 알림 수신은 저장 실패로 끝나 수신 기록·Receipt를 남기지 않고, 다시 오지 않은 결과의 요청은 처리 시한에 닫힌다', async t => {
  if (!ready(t)) return;
  const result = await prepare();
  const before = await stored(result);
  const { registration, rejections } = pipeline();
  const receipts = [];
  const held = await holdRow(db, 'analysis_request', 'request_id', result.requestId);
  let delivered, observed;
  try {
    [delivered, observed] = await Promise.all([
      timed(() => registration.receiveResult(result, async receipt => { receipts.push(receipt); })),
      timed(() => registration.receiveProgress(event({ requestId: result.requestId, attemptId: result.attemptId, state: 'RUNNING' }))),
    ]);
  } finally { await held.release(); }
  // 두 수신은 같은 요청 행을 줄지어 기다린다. 뒤에 선 쪽은 앞쪽이 포기한 뒤 한 번 더 기다려 상한을 넘길 수 있다.
  for (const [outcome, label] of [[delivered, '결과 수신'], [observed, '진행 알림 수신']]) {
    assert.equal(outcome.ok, false, label);
    assert.ok(outcome.error instanceof ReceiverStorageError, label);
    assertQueuedCapWait(outcome.ms, label);
  }
  assert.deepEqual(receipts, [], 'Receipt를 알리지 않는다');
  assert.deepEqual(rejections.sort(), ['ProcessingEvent:STORAGE_UNAVAILABLE', 'Result:STORAGE_UNAVAILABLE']);
  assert.deepEqual(await stored(result), before, '요청·시도는 그대로다');
  assert.deepEqual(await counts(), { receipts: 0, protections: 0, catches: 0, evidence: 0, registrations: 0 });
  // 큐 작업은 RECEIVER_STORAGE_UNAVAILABLE로 끝나고 worker는 결과를 다시 보내지 않는다(기존 계약). 요청은 처리 시한에 닫힌다.
  const { service, logs } = deadline(DEADLINE);
  assert.deepEqual(await service.closeOverdue(), { closed: 1, failed: 0 });
  assert.deepEqual(logs, [{ closed: 'PROCESSING_DEADLINE', requestId: result.requestId }]);
  t.diagnostic(`결과·진행 알림 수신 상한 초과(동시 2건): ${delivered.ms}ms·${observed.ms}ms 뒤 저장 실패, 수신 기록 0, 접수 60분 판정에서 PROCESSING_DEADLINE`);
});

test('결과 반영 ① 초기 잠금 실패: 반영이 요청 행을 3초 안에 얻지 못하면 실패를 기록하지 않고 수신 기록만 남으며, 재반영 없이 시한 판정에서 닫힌다', async t => {
  if (!ready(t)) return;
  const result = await prepare();
  const { registration, failures } = pipeline();
  let held;
  // 수신이 커밋되고 Receipt를 알린 뒤, 반영 트랜잭션이 요청 행을 잠그기 전에 다른 연결이 그 행을 쥔다.
  const outcome = await timed(() => registration.receiveResult(result, async receipt => {
    assert.equal(receipt.disposition, 'ACCEPTED');
    held = await holdRow(db, 'analysis_request', 'request_id', result.requestId);
  }));
  await held?.release();
  assert.equal(outcome.ok, false);
  assert.ok(outcome.error instanceof AnalysisRegistrationError);
  assertCapWait(outcome.ms, '반영의 초기 잠금');
  assert.deepEqual(failures, ['STORAGE_UNAVAILABLE']);
  const { request, attempt } = await stored(result);
  assert.equal(request.lifecycle, 'ACTIVE');
  assert.equal(attempt.processing, 'SUCCEEDED');
  assert.equal(attempt.application, 'PENDING', '실패 기록 없이 반영 대기로 남는다');
  assert.deepEqual(attempt.failures, result.failures);
  assert.equal(attempt.ownerResultsReady, false);
  assert.deepEqual(await counts(), NOTHING_REGISTERED);

  await assertNoReapply(result);
  assert.deepEqual(await deadline(new Date(DEADLINE.getTime() - 1)).service.closeOverdue(), { closed: 0, failed: 0 },
    '접수 60분 전에는 닫지 않는다');
  const { service, logs } = deadline(DEADLINE);
  assert.deepEqual(await service.closeOverdue(), { closed: 1, failed: 0 });
  assert.deepEqual(logs, [{ closed: 'APPLICATION_DEADLINE', requestId: result.requestId }]);
  const closed = await stored(result);
  assert.equal(closed.request.lifecycle, 'CLOSED');
  assert.equal(closed.attempt.application, 'APPLY_FAILED');
  assert.deepEqual(closed.attempt.failures, [...result.failures, APPLICATION_DEADLINE]);
  t.diagnostic(`반영 초기 잠금 실패: ${outcome.ms}ms 뒤 실패, 시도 PENDING 유지, 재전달은 DUPLICATE, 접수 60분 판정에서 APPLY_FAILED/CLOSED`);
});

test('결과 반영 ② 반영 중 실패: 후보 등록 잠금을 3초 안에 얻지 못하면 등록 전체가 롤백되고 반영 실패로 기록되며, 재반영 없이 다음 판정에서 닫힌다', async t => {
  if (!ready(t)) return;
  const candidates = 40;
  const result = await prepare(candidates);
  // 같은 회원의 같은 작업을 다른 반영이 등록 중인 상황을 만든다.
  const held = await holdAdvisory(db, lastWorkLock(result));
  const { registration, failures } = pipeline();
  const receiving = timed(() => registration.receiveResult(result, async () => {}));
  const applyPid = await waitUntilBlocked(db, held.pid, '후보 등록 잠금');
  const [{ granted }] = await db.query(
    "SELECT count(*)::int AS granted FROM pg_locks WHERE pid = $1 AND locktype = 'advisory' AND granted", [applyPid]);
  assert.equal(granted, candidates, '저장소 관측 잠금 1건과 앞선 작업 39건의 등록 잠금을 쥔 채 기다린다');
  const outcome = await receiving;
  await held.release();
  assert.equal(outcome.ok, false);
  assert.ok(outcome.error instanceof AnalysisRegistrationError);
  assertCapWait(outcome.ms, '반영 중 후보 등록 잠금');
  assert.deepEqual(failures, ['STORAGE_UNAVAILABLE']);
  const failed = await stored(result);
  assert.equal(failed.request.lifecycle, 'ACTIVE');
  assert.equal(failed.attempt.application, 'APPLY_FAILED');
  assert.deepEqual(failed.attempt.failures, [...result.failures, STORAGE_FAILURE]);
  assert.equal(failed.attempt.ownerResultsReady, false);
  assert.deepEqual(await counts(), NOTHING_REGISTERED, '반영 중 넣은 보호 기록·Catch·근거·등록은 모두 롤백된다');

  await assertNoReapply(result);
  const early = new Date(SUBMITTED.getTime() + 60 * 1000);
  const { service, logs } = deadline(early);
  assert.deepEqual(await service.closeOverdue(), { closed: 1, failed: 0 });
  assert.deepEqual(logs, [{ closed: 'APPLICATION_FAILED', requestId: result.requestId }]);
  const closed = await stored(result);
  assert.equal(closed.request.lifecycle, 'CLOSED');
  assert.deepEqual(closed.attempt, failed.attempt, '반영 실패 기록은 그대로 두고 시한 항목을 더하지 않는다');
  t.diagnostic(`반영 중 실패(후보 ${candidates}건 중 마지막 작업 잠금): ${outcome.ms}ms 뒤 실패, APPLY_FAILED(STORAGE_UNAVAILABLE), Catch 0, 다음 판정에서 CLOSED`);
});

test('결과 반영 ③ 실패 기록 중 잠금 실패: 반영 실패 뒤 실패 기록도 요청 행을 3초 안에 얻지 못하면 시도는 PENDING으로 남고, 재반영 없이 시한 판정에서 닫힌다', async t => {
  if (!ready(t)) return;
  const result = await prepare(40);
  const blocker = await holdAdvisory(db, lastWorkLock(result));
  const { registration, failures } = pipeline();
  const receiving = timed(() => registration.receiveResult(result, async () => {}));
  const applyPid = await waitUntilBlocked(db, blocker.pid, '후보 등록 잠금');
  // 반영 트랜잭션이 롤백되면 요청 행을 바로 이어받아, 뒤따르는 실패 기록보다 먼저 쥐는 연결.
  const takeover = hold(db, 'SELECT 1 FROM analysis_request WHERE request_id = $1 FOR UPDATE', [result.requestId]);
  await waitUntilBlocked(db, applyPid, '요청 행 이어받기');
  const outcome = await receiving;
  await (await takeover).release();
  await blocker.release();
  assert.equal(outcome.ok, false);
  assert.ok(outcome.error instanceof AnalysisRegistrationError);
  assert.ok(outcome.ms >= 2 * APP_LOCK_TIMEOUT_MS - 200, `반영과 실패 기록이 각각 상한만큼 기다렸다(${outcome.ms}ms)`);
  assert.deepEqual(failures, ['FAILURE_RECORDING_FAILED']);
  const { request, attempt } = await stored(result);
  assert.equal(request.lifecycle, 'ACTIVE');
  assert.equal(attempt.application, 'PENDING', '반영 실패를 기록하지 못해 반영 대기로 남는다');
  assert.deepEqual(attempt.failures, result.failures);
  assert.equal(attempt.ownerResultsReady, false);
  assert.deepEqual(await counts(), NOTHING_REGISTERED);

  await assertNoReapply(result);
  const { service, logs } = deadline(DEADLINE);
  assert.deepEqual(await service.closeOverdue(), { closed: 1, failed: 0 });
  assert.deepEqual(logs, [{ closed: 'APPLICATION_DEADLINE', requestId: result.requestId }]);
  const closed = await stored(result);
  assert.equal(closed.request.lifecycle, 'CLOSED');
  assert.equal(closed.attempt.application, 'APPLY_FAILED');
  assert.deepEqual(closed.attempt.failures, [...result.failures, APPLICATION_DEADLINE]);
  t.diagnostic(`실패 기록 중 잠금 실패: ${outcome.ms}ms 뒤 실패(FAILURE_RECORDING_FAILED), 시도 PENDING 유지, 접수 60분 판정에서 APPLY_FAILED/CLOSED`);
});

const REPLAYS = 3;
const outcomeOf = r => `${r.ok ? '성공' : '실패'} ${r.ms}ms`;
/** 접수 API로 요청을 만들고, 후보 count건의 합성 결과를 수신·저장한다(반영 전). */
async function receivedResult(identity, count) {
  const user = await login(identity);
  const body = await consentBody(user);
  const created = await submit(user, 'apply-key', body);
  assert.equal(created.status, 202, JSON.stringify(created.body));
  const result = await resultFor(created.body.requestId, count);
  const received = await pipeline().receiver.receiveResult(result);
  assert.equal(received.receipt.disposition, 'ACCEPTED');
  return { user, body, result, accepted: received.accepted };
}
/**
 * 반영은 요청 → 시도 순서로 잠근다. 시도 행(gate)을 쥐어 반영이 요청 행을 잡고 기다리게 한 뒤, 같은 요청의 접수 재응답
 * REPLAYS건·결과 재전달·진행 알림을 보내 모두 잠금을 기다리는 것까지 본다. 첫 재응답·재전달·진행 알림은 반영이 쥔
 * 요청 행에서, 나머지 재응답은 같은 키 잠금에서 기다린다. at.applyingAt은 반영을 시작한 때(곧바로 요청 행을 잡고 시도 행을
 * 기다린다), at.startedAt은 반영이 시도 행에 막힌 것을 보고 경쟁 요청을 보내기 직전, at.observedAt은 경쟁 요청이 모두
 * 기다리는 것을 본 때, at.appliedAt은 반영이 끝난 때다.
 */
async function contend({ user, body, result, accepted }) {
  const gate = await holdRow(db, 'analysis_attempt', 'attempt_id', result.attemptId);
  const at = { applyingAt: Date.now() };
  const applying = timed(() => applier(result).apply(accepted).finally(() => { at.appliedAt = Date.now(); }));
  const applyPid = await waitUntilBlocked(db, gate.pid, '반영 시작');
  const competitors = pipeline();
  at.startedAt = Date.now();
  const replays = Array.from({ length: REPLAYS }, () => timed(() => submit(user, 'apply-key', body)));
  const resend = timed(() => competitors.receiver.receiveResult(result));
  const progress = timed(() => competitors.receiver.receiveProgress(
    event({ requestId: result.requestId, attemptId: result.attemptId, state: 'RUNNING' })));
  await waitUntilWaiting(db, REPLAYS + 2, [applyPid], '반영과 겹친 요청');
  at.observedAt = Date.now();
  return { gate, applying, at, competing: { replays, resend, progress } };
}
/**
 * 경쟁 요청마다 결과가 계약에 맞는지 본다. 성공은 반영이 끝난 뒤의 기존 응답이고, 실패는 잠금 하나를 상한만큼 기다린 뒤의
 * 500(접수 재응답)이나 저장 실패(재전달·진행 알림)다. 시간은 요청 전체 시간이라 잠금 한 번의 대기와 같지 않다
 * (줄 선 요청은 상한보다 오래 기다린 뒤 성공할 수 있다).
 */
async function settle({ replays, resend, progress }, result) {
  const replayed = await Promise.all(replays);
  for (const replay of replayed) {
    replay.ok = replay.value.status === 200;
    if (replay.ok) assert.equal(replay.value.body.requestId, result.requestId);
    else {
      assertInternalError(replay.value, '접수 재응답');
      assert.ok(replay.ms >= APP_LOCK_TIMEOUT_MS - 100, `접수 재응답 ${replay.ms}ms`);
    }
  }
  const resent = await resend;
  if (resent.ok) assert.equal(resent.value.receipt.code, 'ALREADY_RECEIVED');
  else assert.ok(resent.error instanceof ReceiverStorageError && resent.ms >= APP_LOCK_TIMEOUT_MS - 100, `재전달 ${resent.ms}ms`);
  const observed = await progress;
  if (observed.ok) assert.equal(observed.value, 'TERMINAL_UNCHANGED');
  else assert.ok(observed.error instanceof ReceiverStorageError && observed.ms >= APP_LOCK_TIMEOUT_MS - 100, `진행 알림 ${observed.ms}ms`);
  return { replayed, resent, observed, all: [...replayed, resent, observed] };
}
/** 반영 결과는 경쟁과 관계없이 그대로고, 실패한 경쟁 요청은 수신 기록·보호 기록·Catch·근거·등록을 더 남기지 않는다. */
async function assertApplied(result, candidates) {
  const { request, attempt } = await stored(result);
  assert.equal(request.lifecycle, 'CLOSED');
  assert.equal(attempt.application, 'APPLIED');
  assert.deepEqual(await counts(), { receipts: 1, protections: 1, catches: candidates, evidence: candidates, registrations: candidates });
}

// 후보 수별 측정. 경쟁 요청의 잠금 대기는 보낸 뒤부터 반영이 끝날 때까지 이어질 수 있고, 시도 행을 풀기 전의 사전 조율
// (대기 확인·시한 닫기)도 그 안에 든다. 그래서 반영 보유만으로는 성공·실패를 가를 수 없어 여기서는 결과마다 계약에 맞는지만 보고,
// 모두 성공하는 경우와 상한에서 실패하는 경우는 아래 두 시험이 조건을 만들어 확인한다.
for (const candidates of [40, 100, 300, 500]) {
  test(`후보 ${candidates}건 결과 반영(측정): 반영이 요청·시도를 쥔 동안 접수 재응답·결과 재전달·진행 알림은 기다리고 시한 닫기는 건너뛰며, 반영 결과는 그대로다`, async t => {
    if (!ready(t)) return;
    const prepared = await receivedResult(`apply-${candidates}`, candidates);
    const { result } = prepared;
    const { gate, applying, at, competing } = await contend(prepared);
    const closing = await timed(() => deadline(new Date(Date.now() + ANALYSIS_PROCESSING_DEADLINE_MS + 60 * 1000)).service.closeOverdue());
    const releasedAt = Date.now();
    await gate.release();
    const applied = await applying;
    const holdMs = at.appliedAt - releasedAt;

    // 반영도 사전 조율 동안 시도 행을 기다린다. 그 대기가 상한을 넘으면 반영이 실패하므로 함께 남긴다.
    assert.equal(applied.ok, true, `반영의 시도 행 대기 ${releasedAt - at.applyingAt}ms: ${applied.error}`);
    assert.equal(applied.value.registeredCatchIds.length, candidates);
    assert.deepEqual(closing.value, { closed: 0, failed: 0 });
    assert.ok(closing.ms < 2000, `시한 닫기는 반영을 기다리지 않고 건너뛴다(${closing.ms}ms)`);
    const { replayed, resent, observed } = await settle(competing, result);
    await assertApplied(result, candidates);
    t.diagnostic(`후보 ${candidates}건: 반영 보유 ${holdMs}ms, 경쟁 요청을 보낸 뒤 반영이 끝나기까지 ${at.appliedAt - at.startedAt}ms, ` +
      `동시 경쟁 ${REPLAYS + 3}건(접수 재응답 ${REPLAYS}·재전달 1·진행 알림 1·시한 닫기 1)`);
    t.diagnostic(`  요청 전체 시간: 접수 재응답 [${replayed.map(r => `${r.value.status} ${r.ms}ms`).join(', ')}], 재전달 ${outcomeOf(resent)}, ` +
      `진행 알림 ${outcomeOf(observed)}, 시한 닫기 ${closing.ms}ms에 건너뜀`);
  });
}

test('결과 반영과 겹친 짧은 대기: 경쟁 요청을 보낸 뒤 반영이 끝나기까지가 상한보다 짧으면 접수 재응답·결과 재전달·진행 알림은 모두 기다린 뒤 성공한다', async t => {
  if (!ready(t)) return;
  const prepared = await receivedResult('apply-short', 1);
  const { result } = prepared;
  const { gate, applying, at, competing } = await contend(prepared);
  // 반영을 시작하고 약 1초 뒤 시도 행을 푼다. 반영이 막힌 것과 경쟁 요청이 모두 기다리는 것을 확인하는 시간도 이 1초에 들어
  // 반영의 시도 행 대기에 더해지지 않는다. 사전 조율이 그보다 길었으면 바로 푼다.
  await sleepUntil(at.applyingAt + 1000);
  await gate.release();
  const applied = await applying;
  // 경쟁 요청의 잠금 대기는 보낸 뒤 시작하고, 반영이 끝나면 앞 요청의 짧은 처리만 더 기다린다. 이 구간이 상한보다
  // 500ms 넘게 짧으면 어느 대기도 상한에 닿지 않는다.
  const windowMs = at.appliedAt - at.startedAt;
  assert.ok(windowMs < APP_LOCK_TIMEOUT_MS - 500, `전제: 경쟁 요청을 보낸 뒤 반영이 끝나기까지 ${windowMs}ms가 상한보다 500ms 넘게 짧아야 한다`);
  assert.equal(applied.ok, true, String(applied.error));
  const { all } = await settle(competing, result);
  assert.ok(all.every(r => r.ok), `경쟁 요청을 보낸 뒤 반영이 끝나기까지 ${windowMs}ms인데 실패한 경쟁 요청이 있다`);
  await assertApplied(result, 1);
  t.diagnostic(`짧은 대기: 경쟁 요청을 보낸 뒤 반영이 끝나기까지 ${windowMs}ms, 요청 전체 시간 [${all.map(outcomeOf).join(', ')}]`);
});

test('결과 반영과 겹친 상한 초과: 반영이 잠금마다 상한보다 짧게 기다리며 요청 행을 상한보다 오래 쥐면 맨 앞에서 기다린 경쟁 요청은 상한에서 실패하고, 반영은 성공하며 실패한 요청은 기록을 남기지 않는다', async t => {
  if (!ready(t)) return;
  const prepared = await receivedResult('apply-cap', 2);
  const { result } = prepared;
  // 반영은 요청 행을 쥔 채 시도 행 → 첫 작업 → 마지막 작업 잠금을 차례로 기다린다. 두 작업 잠금은 미리 쥐어 둔다.
  const [firstWork, lastWork] = await Promise.all(workLocks(result).map(text => holdAdvisory(db, text)));
  const { gate, applying, at, competing } = await contend(prepared);
  // 반영의 잠금 대기는 그 잠금을 기다리기 전의 시각(시도 행은 반영 시작, 작업 잠금은 앞 잠금을 풀기 직전)부터 그 잠금을 풀기
  // 직전까지로 잰다.
  let releasedAt = Date.now();
  const gateMs = releasedAt - at.applyingAt;
  await gate.release();
  // 작업 잠금은 앞 잠금을 풀고 2초 뒤 하나씩 푼다. 반영이 막힌 것을 확인하는 시간도 이 2초에 들어, 반영의 대기는 매번 상한보다
  // 짧고 요청 행 보유는 그 합만큼 길어진다. 확인이 2초보다 늦었으면 확인 직후 푼다.
  const workMs = [];
  for (const [held, label] of [[firstWork, '첫 작업 잠금'], [lastWork, '마지막 작업 잠금']]) {
    await waitUntilBlocked(db, held.pid, label);
    await sleepUntil(releasedAt + 2000);
    const now = Date.now();
    workMs.push(now - releasedAt);
    releasedAt = now;
    await held.release();
  }
  const applied = await applying;
  // 반영의 잠금 대기는 매번 상한보다 짧아 반영은 성공한다(시도 행 대기는 사전 조율 시간이라 함께 남긴다).
  assert.equal(applied.ok, true, `반영의 잠금 대기 시도 행 ${gateMs}ms·작업 ${workMs.join('ms·')}ms: ${applied.error}`);
  assert.equal(applied.value.registeredCatchIds.length, 2);
  // 맨 앞에서 기다린 경쟁 요청은 모두 기다리는 것을 보기 전에 반영을 기다리기 시작했고 반영이 끝나야 행을 얻으므로,
  // 그 잠금 대기는 이 구간보다 길다. 이 구간이 상한보다 500ms 넘게 길면 그 요청은 상한에 닿는다.
  const headWaitMs = at.appliedAt - at.observedAt;
  assert.ok(headWaitMs > APP_LOCK_TIMEOUT_MS + 500, `전제: 경쟁 요청이 모두 기다리는 것을 본 뒤 반영이 끝나기까지 ${headWaitMs}ms가 상한보다 500ms 넘게 길어야 한다`);
  const { all } = await settle(competing, result);
  assert.ok(all.some(r => !r.ok), `맨 앞의 잠금 대기가 ${headWaitMs}ms보다 긴데 상한 초과 실패가 없다`);
  await assertApplied(result, 2);
  const [{ requests, records }] = await db.query(`SELECT (SELECT count(*)::int FROM analysis_request) AS requests,
    (SELECT count(*)::int FROM idempotency_record) AS records`);
  assert.deepEqual({ requests, records }, { requests: 1, records: 1 }, '실패한 접수 재응답은 요청·멱등 기록을 더 남기지 않는다');
  t.diagnostic(`상한 초과: 반영의 잠금 대기 시도 행 ${gateMs}ms·작업 ${workMs.join('ms·')}ms, 경쟁 요청이 모두 기다리는 것을 본 뒤 ` +
    `반영이 끝나기까지 ${headWaitMs}ms, 요청 전체 시간 [${all.map(outcomeOf).join(', ')}]`);
});

test('시한 닫기: 요청을 잡은 뒤 시도 행을 기다리며, 짧은 보유는 기다려 닫고 3초를 넘기면 그 요청만 실패로 세고 다음 판정에서 닫는다', async t => {
  if (!ready(t)) return;
  // 제품 경로는 시도보다 요청을 먼저 잠그므로 시도 행만 쥔 연결은 이 시험에서만 만든다. 닫기가 기다리는 곳은 여기뿐이다.
  const waiting = await prepare();
  let held = await holdRow(db, 'analysis_attempt', 'attempt_id', waiting.attemptId);
  const startedAt = Date.now();
  const pending = timed(() => deadline(DEADLINE).service.closeOverdue());
  await waitUntilBlocked(db, held.pid, '시한 닫기');
  await sleepUntil(startedAt + 1000);
  const heldMs = await held.release();
  const closed = await pending;
  assert.deepEqual(closed.value, { closed: 1, failed: 0 });
  assert.ok(closed.ms >= 900 && closed.ms < APP_LOCK_TIMEOUT_MS, `보유 ${heldMs}ms 뒤 닫았다(${closed.ms}ms)`);

  const forced = await prepare();
  held = await holdRow(db, 'analysis_attempt', 'attempt_id', forced.attemptId);
  const { service, logs } = deadline(DEADLINE);
  let failed;
  try { failed = await timed(() => service.closeOverdue()); } finally { await held.release(); }
  assert.deepEqual(failed.value, { closed: 0, failed: 1 });
  assertCapWait(failed.ms, '시한 닫기의 시도 행 잠금');
  assert.deepEqual(logs, [{ failed: 'QueryFailedError:55P03', requestId: forced.requestId }]);
  const kept = await stored(forced);
  assert.equal(kept.request.lifecycle, 'ACTIVE');
  assert.equal(kept.attempt.processing, 'QUEUED');
  assert.equal(kept.attempt.application, 'NOT_READY');
  assert.deepEqual(kept.attempt.failures, []);
  assert.deepEqual(await deadline(DEADLINE).service.closeOverdue(), { closed: 1, failed: 0 });
  t.diagnostic(`시한 닫기 짧은 보유: 보유 ${heldMs}ms, 대기 포함 ${closed.ms}ms`);
  t.diagnostic(`시한 닫기 상한 초과: ${failed.ms}ms 뒤 그 요청만 실패(QueryFailedError:55P03), 다음 판정에서 닫음`);
});

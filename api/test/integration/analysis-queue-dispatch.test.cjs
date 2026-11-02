require('reflect-metadata');
// #233 보내기: 대기 시도를 DB에서 찾아 계약 v1 Request로 요청 큐에 넣는다. 실제 테스트 DB와 메모리 요청 큐를 쓴다.
// 실제 큐(Valkey)에 넣은 작업의 옵션·중복 무시·보관은 analysis-queue-valkey.test.cjs가 본다.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { after, before, beforeEach, test } = require('node:test');
const { NestFactory } = require('@nestjs/core');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const { CONTRACT_DIR, MemoryRequestQueue, RESOURCE_TYPES, dispatchLog, insertAttempt, useAppSettings } = require('../helpers/queue-harness.cjs');
const { AppModule } = require('../../dist/app.module');
const { configureApp } = require('../../dist/app.setup');
const { SYNTHETIC_REPOSITORY } = require('../../dist/member-analysis/dev-member.service');
const { WorkerMessageValidator } = require('../../dist/analysis-receiver/worker-message.validator');
const { AnalysisRequestDispatcher } = require('../../dist/analysis-queue/analysis-request.dispatcher');
const { ANALYSIS_PROCESSING_DEADLINE_MS } = require('../../dist/analysis-deadline/analysis-deadline.service');
const { checkMessage } = require('../helpers/worker-messages.cjs');

const validator = new WorkerMessageValidator(CONTRACT_DIR);
let db;
before(async () => { db = await openTestDataSource(); });
after(async () => { await db?.destroy(); });
beforeEach(async () => { await resetTestDatabase(db); });

function dispatcher(options = {}) {
  const queue = options.queue ?? new MemoryRequestQueue();
  const log = dispatchLog();
  const instance = new AnalysisRequestDispatcher(db, queue, validator, log, options.clock, options.commandTimeoutMs);
  return { dispatcher: instance, queue, log };
}
const tables = () => db.query(`SELECT (SELECT json_agg(r ORDER BY request_id) FROM analysis_request r) requests,
  (SELECT json_agg(c ORDER BY consent_id) FROM analysis_consent c) consents, (SELECT json_agg(a ORDER BY attempt_id) FROM analysis_attempt a) attempts`)
  .then(rows => rows[0]);

test('실제 접수 API가 저장한 대기 시도를 접수 기록 그대로(두 참조만 시도 ID) 넣고, DB는 바꾸지 않는다', async t => {
  useAppSettings(t);
  const app = await configureApp(await NestFactory.create(AppModule, { logger: false, abortOnError: false }));
  t.after(() => app.close());
  require('../support/synthetic-daily-limit.cjs').bindSyntheticDailyLimit(app);
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  const json = { 'Content-Type': 'application/json' };
  const { accessToken } = await (await fetch(base + '/v1/auth/dev-login', { method: 'POST', headers: json,
    body: JSON.stringify({ memberId: 'queue-dispatch-intake' }) })).json();
  const auth = { Authorization: 'Bearer ' + accessToken };
  const notice = await (await fetch(base + '/v1/analysis-notice', { headers: auth })).json();
  const accepted = await fetch(base + '/v1/analysis-requests', { method: 'POST', headers: { ...json, ...auth, 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({ repositoryId: SYNTHETIC_REPOSITORY.repositoryId,
      consent: { accepted: true, noticeRevision: notice.noticeRevision, scopeRevision: SYNTHETIC_REPOSITORY.allowedScopeRevision } }) });
  assert.equal(accepted.status, 202);
  const status = await accepted.json();

  const [request] = await db.query('SELECT * FROM analysis_request WHERE request_id = $1', [status.requestId]);
  const [consent] = await db.query('SELECT * FROM analysis_consent WHERE consent_id = $1', [request.consent_id]);
  const [attempt] = await db.query('SELECT * FROM analysis_attempt WHERE attempt_id = $1', [request.current_attempt_id]);
  // 정상 접수 행: 동의 행의 판본·저장소 칸이 동의 범위 JSON 안의 값과 같다(worker는 저장소 ID가 다르면 조용히 거부한다).
  assert.equal(consent.scope_revision, consent.consented_scope.revision);
  assert.equal(consent.repository_id, consent.consented_scope.repositoryId);
  assert.equal(request.repository_id, consent.repository_id);
  const before = await tables();

  const { dispatcher: d, queue, log } = dispatcher();
  assert.deepEqual(await d.dispatchOnce(), { read: 1, enqueued: 1, existing: 0, skipped: 0, paused: null });
  const job = queue.jobs.get(attempt.attempt_id);
  assert.equal(job.name, 'Request');
  assert.deepEqual(job.options, { jobId: attempt.attempt_id, attempts: 1, removeOnComplete: { age: 7200 },
    removeOnFail: { age: 7200 }, stackTraceLimit: 0 });
  // 보낸 메시지 13개 필드 = DB 접수 기록. 두 참조만 시도 ID로 바꾼 사본이다.
  assert.deepEqual(job.data, {
    schemaVersion: '2', messageId: `request-${attempt.attempt_id}`, requestId: request.request_id, attemptId: attempt.attempt_id,
    memberId: request.member_id, repositoryId: request.repository_id, consentId: consent.consent_id,
    noticeRevision: consent.notice_revision, consentedAt: consent.consented_at.toISOString(),
    allowedScope: { revision: consent.scope_revision, repositoryId: consent.repository_id,
      allowedResourceTypes: consent.consented_scope.allowedResourceTypes, selectionReference: attempt.attempt_id },
    credentialContextReference: attempt.attempt_id, sourceMode: attempt.source_mode, requestedAt: request.submitted_at.toISOString(),
  });
  assert.equal(Object.keys(job.data).length, 13);
  assert.ok(validator.request(job.data));
  // worker와 같은 규칙의 시험용 검사기로도 계약 v1 Request다.
  assert.equal(checkMessage('Request', job.data).verdict, 'VALID');
  assert.deepEqual(log.entries, [{ event: 'ENQUEUED', requestId: request.request_id, attemptId: attempt.attempt_id }]);
  // DB에 쓰지 않는다. 저장된 동의 범위(합성 선정 참조)도 그대로다.
  assert.deepEqual(await tables(), before);
  assert.equal(before.consents[0].consented_scope.selectionReference, 'catchu:synthetic-selection:v1');

  // 이미 큐에 있는 시도는 다시 넣지 않고 기록도 남기지 않는다.
  assert.deepEqual(await d.dispatchOnce(), { read: 1, enqueued: 0, existing: 1, skipped: 0, paused: null });
  assert.deepEqual(queue.calls.map(([kind]) => kind), ['getJob', 'add', 'getJob']);
  assert.equal(log.entries.length, 1);
});

test('동의 범위 모양·저장소 ID·판본이 어긋나거나 계약 스키마에 맞지 않으면 그 시도만 건너뛰고 고정 코드를 한 번 남긴다', async () => {
  const scope = (changes) => ({ revision: '00000000-0000-4000-8000-000000000201', repositoryId: 'synthetic-repo-0001',
    allowedResourceTypes: [...RESOURCE_TYPES], selectionReference: 'catchu:synthetic-selection:v1', ...changes });
  const cases = [
    ['CONSENT_SCOPE_INVALID', { consentedScope: scope({ allowedResourceTypes: 'COMMIT' }) }],
    ['CONSENT_SCOPE_INVALID', { consentedScope: scope({ extra: true }) }],
    ['CONSENT_SCOPE_INVALID', { consentedScope: { ...scope(), selectionReference: undefined } }],
    ['CONSENT_SCOPE_MISMATCH', { consentedScope: scope({ repositoryId: 'other-repository' }) }],
    ['CONSENT_SCOPE_MISMATCH', { consentedScope: scope({ revision: 'other-revision' }) }],
    ['REQUEST_SCHEMA_INVALID', { consentedScope: scope({ allowedResourceTypes: ['WIKI'] }) }],
    ['REQUEST_SCHEMA_INVALID', { consentedScope: scope({ allowedResourceTypes: [1] }) }],
  ];
  const rows = [];
  for (const [code, fixture] of cases) rows.push({ code, row: await insertAttempt(db, fixture) });
  const good = await insertAttempt(db);
  const { dispatcher: d, queue, log } = dispatcher();
  for (let round = 0; round < 2; round += 1) {
    const summary = await d.dispatchOnce();
    assert.equal(summary.skipped, cases.length);
    assert.equal(summary.enqueued + summary.existing, 1);
  }
  assert.deepEqual([...queue.jobs.keys()], [good.attemptId]);
  // 건너뛴 시도는 큐 명령을 보내지 않는다.
  assert.equal(queue.calls.some(([, id]) => id !== good.attemptId), false);
  const skipped = log.entries.filter(entry => entry.event === 'SKIPPED');
  assert.equal(skipped.length, cases.length, '같은 시도의 건너뜀은 회차마다 다시 남기지 않는다');
  for (const { code, row } of rows) {
    assert.deepEqual(skipped.find(entry => entry.attemptId === row.attemptId), { event: 'SKIPPED', requestId: row.requestId, attemptId: row.attemptId, code });
  }
});

test('보낼 대상은 ACTIVE 요청의 현재 시도 QUEUED·NOT_READY뿐이며 MOCK·LIVE는 거르지 않는다', async () => {
  await insertAttempt(db, { lifecycle: 'CLOSED' });
  await insertAttempt(db, { processing: 'RUNNING' });
  await insertAttempt(db, { processing: 'UNCERTAIN' });
  await insertAttempt(db, { processing: 'SUCCEEDED', application: 'PENDING' });
  await insertAttempt(db, { processing: 'FAILED', application: 'APPLIED', lifecycle: 'CLOSED' });
  await insertAttempt(db, { processing: 'SUCCEEDED', application: 'APPLY_FAILED' });
  // 요청의 현재 시도가 아닌 QUEUED 시도(예전 시도)는 보내지 않는다.
  const running = await insertAttempt(db, { processing: 'RUNNING' });
  const stale = randomUUID();
  await db.query("INSERT INTO analysis_attempt (attempt_id, request_id, processing, application, source_mode) VALUES ($1,$2,'QUEUED','NOT_READY','MOCK')",
    [stale, running.requestId]);
  const mock = await insertAttempt(db);
  const live = await insertAttempt(db, { sourceMode: 'LIVE' });
  const { dispatcher: d, queue } = dispatcher();
  assert.deepEqual(await d.dispatchOnce(), { read: 2, enqueued: 2, existing: 0, skipped: 0, paused: null });
  assert.deepEqual([...queue.jobs.keys()].sort(), [mock.attemptId, live.attemptId].sort());
  assert.equal(queue.jobs.get(live.attemptId).data.sourceMode, 'LIVE');
  assert.equal(queue.jobs.get(mock.attemptId).data.sourceMode, 'MOCK');
});

test('처리 시한 경계: 접수 후 정확히 60분이면 보내지 않고 그보다 1ms라도 안쪽이면 보낸다', async () => {
  const now = new Date('2026-10-16T01:00:00.000Z');
  const at = ms => new Date(now.getTime() - ms);
  const boundary = await insertAttempt(db, { submittedAt: at(ANALYSIS_PROCESSING_DEADLINE_MS) });
  const older = await insertAttempt(db, { submittedAt: at(ANALYSIS_PROCESSING_DEADLINE_MS + 1) });
  const inside = await insertAttempt(db, { submittedAt: at(ANALYSIS_PROCESSING_DEADLINE_MS - 1) });
  const fresh = await insertAttempt(db, { submittedAt: at(0) });
  const { dispatcher: d, queue } = dispatcher({ clock: () => now });
  await d.dispatchOnce();
  assert.deepEqual([...queue.jobs.keys()].sort(), [inside.attemptId, fresh.attemptId].sort());
  assert.equal(queue.jobs.has(boundary.attemptId), false);
  assert.equal(queue.jobs.has(older.attemptId), false);
});

async function insertMany(count, fixture = {}) {
  const rows = [];
  for (let index = 0; index < count; index += 1) rows.push(await insertAttempt(db, fixture));
  return rows.sort((a, b) => (a.requestId < b.requestId ? -1 : 1));
}

test('앞 100건이 이미 큐에 있어도 101번째 대기 시도는 다음 회차에 보내지고, 끝에 닿으면 처음부터 다시 읽는다', async () => {
  const rows = await insertMany(101);
  const { dispatcher: d, queue } = dispatcher();
  for (const row of rows.slice(0, 100)) queue.jobs.set(row.attemptId, { name: 'Request', data: {}, options: {} });
  assert.deepEqual(await d.dispatchOnce(), { read: 100, enqueued: 0, existing: 100, skipped: 0, paused: null });
  assert.deepEqual(await d.dispatchOnce(), { read: 1, enqueued: 1, existing: 0, skipped: 0, paused: null });
  assert.ok(queue.jobs.get(rows[100].attemptId).data.messageId);
  assert.deepEqual(await d.dispatchOnce(), { read: 100, enqueued: 0, existing: 100, skipped: 0, paused: null });
});

test('앞 100건의 동의 범위가 틀려도 101번째 대기 시도는 다음 회차에 보내진다', async () => {
  await insertMany(100, { consentedScope: { synthetic: true } });
  // 요청 ID 순서의 맨 뒤에 오도록 가장 큰 UUID를 준다.
  const last = await insertAttempt(db, { requestId: 'ffffffff-ffff-4fff-bfff-ffffffffffff' });
  const { dispatcher: d, queue } = dispatcher();
  assert.deepEqual(await d.dispatchOnce(), { read: 100, enqueued: 0, existing: 0, skipped: 100, paused: null });
  assert.deepEqual(await d.dispatchOnce(), { read: 1, enqueued: 1, existing: 0, skipped: 0, paused: null });
  assert.deepEqual([...queue.jobs.keys()], [last.attemptId]);
});

test('큐 연결이 준비되지 않으면 명령 없이 회차를 건너뛰고, 멈춤·재개는 상태가 바뀔 때만 남긴다', async () => {
  const row = await insertAttempt(db);
  const { dispatcher: d, queue, log } = dispatcher();
  queue.isReady = false;
  assert.equal((await d.dispatchOnce()).paused, 'QUEUE_NOT_READY');
  assert.equal((await d.dispatchOnce()).paused, 'QUEUE_NOT_READY');
  assert.deepEqual(queue.calls, []);
  queue.isReady = true;
  assert.equal((await d.dispatchOnce()).enqueued, 1);
  await d.dispatchOnce();
  assert.deepEqual(log.entries, [{ event: 'PAUSED', reason: 'QUEUE_NOT_READY' },
    { event: 'ENQUEUED', requestId: row.requestId, attemptId: row.attemptId }, { event: 'RESUMED' }]);
});

test('큐 명령이 상한을 넘으면 결과를 모르는 것으로 회차를 멈추고, 그 명령이 끝나기 전에는 새 명령을 쌓지 않는다', async () => {
  const row = await insertAttempt(db);
  const { dispatcher: d, queue, log } = dispatcher({ commandTimeoutMs: 50 });
  queue.next = { hang: true };
  assert.deepEqual(await d.dispatchOnce(), { read: 1, enqueued: 0, existing: 0, skipped: 0, paused: 'QUEUE_COMMAND_TIMEOUT' });
  assert.deepEqual(await d.dispatchOnce(), { read: 0, enqueued: 0, existing: 0, skipped: 0, paused: 'QUEUE_COMMAND_PENDING' });
  assert.deepEqual(queue.calls, [['getJob', row.attemptId]], '끝나지 않은 명령이 있으면 다음 회차는 명령을 보내지 않는다');
  queue.release();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await d.dispatchOnce()).enqueued, 1);
  assert.deepEqual(log.entries.map(entry => entry.reason ?? entry.event),
    ['QUEUE_COMMAND_TIMEOUT', 'QUEUE_COMMAND_PENDING', 'ENQUEUED', 'RESUMED']);
});

test('큐 명령 실패는 오류 이름만 남기고 그 시도에서 회차를 멈춘 뒤 다음 회차에 다시 시도한다', async () => {
  const row = await insertAttempt(db);
  const { dispatcher: d, queue, log } = dispatcher();
  const error = new Error('synthetic-redis-secret rediss://:synthetic-password@queue.example.internal');
  error.name = 'ReplyError';
  queue.next = { error };
  assert.equal((await d.dispatchOnce()).paused, 'QUEUE_COMMAND_FAILED');
  assert.deepEqual(log.entries, [{ event: 'PAUSED', reason: 'QUEUE_COMMAND_FAILED', error: 'ReplyError' }]);
  assert.equal(JSON.stringify(log.entries).includes('synthetic'), false);
  assert.equal((await d.dispatchOnce()).enqueued, 1);
  assert.ok(queue.jobs.has(row.attemptId));
});

test('보내기는 겹치지 않고, 멈춤 표시 뒤에는 진행 중인 회차만 끝내고 더 보내지 않는다', async () => {
  await insertAttempt(db);
  await insertAttempt(db);
  const { dispatcher: d, queue } = dispatcher({ commandTimeoutMs: 100 });
  queue.next = { hang: true };
  const first = d.dispatchOnce();
  assert.equal(d.dispatchOnce(), first, '진행 중이면 같은 실행을 함께 기다린다');
  await new Promise(resolve => setTimeout(resolve, 10));
  const stopped = d.stop();
  assert.equal((await first).paused, 'QUEUE_COMMAND_TIMEOUT');
  await stopped;
  queue.release();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(await d.dispatchOnce(), { read: 0, enqueued: 0, existing: 0, skipped: 0, paused: null });
  assert.equal(queue.calls.length, 1);
});

test('멈춤 표시 뒤에는 큐에 이미 있는지 확인한 시도라도 넣지 않는다', async () => {
  const row = await insertAttempt(db);
  const { dispatcher: d, queue, log } = dispatcher({ commandTimeoutMs: 1000 });
  queue.next = { hang: true };
  const running = d.dispatchOnce();
  await new Promise(resolve => setTimeout(resolve, 20));
  const stopped = d.stop();
  queue.release();
  assert.deepEqual(await running, { read: 1, enqueued: 0, existing: 0, skipped: 0, paused: null });
  await stopped;
  assert.deepEqual(queue.calls, [['getJob', row.attemptId]], 'getJob 뒤 add를 보내지 않는다');
  assert.deepEqual(log.entries, []);
});

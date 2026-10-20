require('reflect-metadata');
// #233 제품 조립(createApplicationModule)과 main의 큐 시작(startAnalysisQueue). 실제 테스트 DB와 실제 Valkey를 쓴다.
// 큐가 필요한 시험은 CATCHU_TEST_REDIS_URL이 있을 때만 돈다(analysis-queue-valkey.test.cjs와 같음).
// worker 쪽은 시험 대역이다: 결과는 worker와 같은 이름·ID·옵션으로 직접 넣는다. 보호 관측은 제품 공급(10월 정책 + 저장 당시 좌표)이다.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { after, before, beforeEach, test } = require('node:test');
const { NestFactory } = require('@nestjs/core');
const { Queue } = require('bullmq');
const IORedis = require('ioredis');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const { captureLogger, insertAttempt, useAppSettings, waitFor, workerResult } = require('../helpers/queue-harness.cjs');
const { createApplicationModule, startAnalysisQueue } = require('../../dist/application.module');
const { configureApp } = require('../../dist/app.setup');
const { AnalysisQueueRunner } = require('../../dist/analysis-queue/analysis-queue.module');
const { SelectedRepositoryCatalog } = require('../../dist/member-repositories/selected-repository-catalog');

const REDIS_URL = process.env.CATCHU_TEST_REDIS_URL;
const skip = REDIS_URL ? false : 'CATCHU_TEST_REDIS_URL이 없어 실제 큐 시험을 건너뜀';
// worker/docs/queue-consumer.md 「큐 규격」의 결과 옵션.
const resultOptions = jobId => ({ jobId, attempts: 1, removeOnComplete: { age: 1800 }, removeOnFail: { age: 1800 }, stackTraceLimit: 0 });
const SCOPE_REVISION = 'fixture-scope-not-product-approved';

let db;
before(async () => { db = await openTestDataSource(); });
after(async () => { await db?.destroy(); });
beforeEach(async () => { await resetTestDatabase(db); });

/** main과 같은 조립 함수로 앱을 띄우고 main과 같이 listen 뒤 큐를 시작한다. exit는 부른 값만 기록한다. */
async function startProduct(t, extra = {}) {
  useAppSettings(t, { CATCHU_QUEUE_REDIS_URL: undefined, CATCHU_QUEUE_PREFIX: undefined, ...extra });
  const { lines, logger } = captureLogger();
  const app = await configureApp(await NestFactory.create(createApplicationModule(), { logger, abortOnError: false }));
  let closing;
  const close = () => { closing ??= app.close(); return closing; };
  t.after(close);
  await app.listen(0, '127.0.0.1');
  const url = await app.getUrl();
  const exits = [];
  const started = startAnalysisQueue(app, code => exits.push(code));
  return { app, url, lines, exits, started, close };
}

/** 시험마다 새 접두사를 쓰고, 끝나면 앱을 닫은 뒤 두 큐를 지운다. */
async function startQueuedProduct(t) {
  const prefix = `catchu-test-${randomUUID().slice(0, 8)}`;
  const product = await startProduct(t, { CATCHU_QUEUE_REDIS_URL: REDIS_URL, CATCHU_QUEUE_PREFIX: prefix });
  const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
  const requests = new Queue('analysis-requests', { connection, prefix });
  const messages = new Queue('worker-messages', { connection, prefix });
  // 정리: 앱(보내기·받기)을 먼저 닫고 두 큐를 지운 뒤 연결을 닫는다.
  t.after(async () => {
    try { await product.close(); } finally {
      await requests.obliterate({ force: true });
      await messages.obliterate({ force: true });
      await requests.close();
      await messages.close();
      await connection.quit();
    }
  });
  const runner = product.app.get(AnalysisQueueRunner);
  await runner.waitUntilReady();
  return { ...product, runner, requests, messages };
}

/** worker처럼 결과를 넣고(작업 ID = 메시지 ID) 끝날 때까지 기다린다. */
async function deliverResult(s, message) {
  await s.messages.add('Result', message, resultOptions(message.messageId));
  await waitFor(async () => ['completed', 'failed'].includes(await s.messages.getJobState(message.messageId)), '결과 작업 끝남');
  return s.messages.getJobState(message.messageId);
}

/** 선정 저장소 하나의 LIVE 대기 시도. 동의에는 그 선정 판본의 참조를 처음부터 넣는다(동의 행은 고칠 수 없다). */
function insertLiveAttempt(version) {
  return insertAttempt(db, { sourceMode: 'LIVE', repositoryId: version.repositoryId, scopeRevision: SCOPE_REVISION,
    consentedScope: { revision: SCOPE_REVISION, repositoryId: version.repositoryId, allowedResourceTypes: ['COMMIT'],
      selectionReference: version.selectionReference } });
}
/** 근거 주소를 그 저장소의 주소로 둔 LIVE 결과. */
function liveResult(row, version) {
  const result = workerResult(row);
  result.sourceMode = 'LIVE';
  for (const candidate of result.candidates) for (const evidence of candidate.evidence) {
    evidence.sourceUrl = `${version.url}/commit/synthetic-sha`;
  }
  return result;
}
const attemptOf = row => db.query('SELECT processing, application FROM analysis_attempt WHERE attempt_id = $1', [row.attemptId])
  .then(rows => rows[0]);
const catchesOf = row => db.query('SELECT owner_id, visibility FROM catch_asset WHERE source_request_id = $1', [row.requestId]);

test('큐 주소가 없으면 제품 조립에 큐 실행기가 없고 시작하지 않는다', async t => {
  const product = await startProduct(t);
  assert.equal(product.started, false);
  assert.throws(() => product.app.get(AnalysisQueueRunner, { strict: false }));
  assert.equal(product.lines.some(line => line.includes('ANALYSIS_QUEUE')), false);
  assert.deepEqual(product.exits, []);
});

test('제품 조립은 대기 시도를 보내고, LIVE 결과를 저장 당시 좌표로 본인 PRIVATE Catch에 반영한다', { skip }, async t => {
  const s = await startQueuedProduct(t);
  assert.equal(s.started, true);
  const queued = await insertAttempt(db);
  await waitFor(() => s.requests.getJob(queued.attemptId), '대기 시도를 요청 큐에 넣음');

  for (const version of new SelectedRepositoryCatalog().listCurrent()) {
    const row = await insertLiveAttempt(version);
    assert.equal(await deliverResult(s, liveResult(row, version)), 'completed');
    assert.deepEqual(await attemptOf(row), { processing: 'SUCCEEDED', application: 'APPLIED' });
    assert.deepEqual(await catchesOf(row), [{ owner_id: row.memberId, visibility: 'PRIVATE' }]);
  }
  assert.deepEqual(s.exits, []);
});

test('제품 조립의 좌표 공급은 LIVE 전용이라 후보가 있는 MOCK 결과는 Catch 없이 반영 실패로 끝난다', { skip }, async t => {
  const s = await startQueuedProduct(t);
  const row = await insertAttempt(db);
  assert.equal(await deliverResult(s, workerResult(row)), 'completed');
  assert.deepEqual(await attemptOf(row), { processing: 'SUCCEEDED', application: 'APPLY_FAILED' });
  assert.deepEqual(await catchesOf(row), []);
  assert.ok(s.lines.some(line => line.includes('RESULT_APPLICATION_FAILED')));
});

test('큐를 조립해도 개발 주입·worker 결과를 받는 HTTP 경로는 없다', { skip }, async t => {
  const s = await startQueuedProduct(t);
  const row = await insertAttempt(db);
  const login = await fetch(s.url + '/v1/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memberId: 'queue-application-product' }) });
  assert.equal(login.status, 200);
  const { accessToken } = await login.json();
  // 인증한 요청이 404면 경로 자체가 없다(있는 경로라면 인증 뒤 다른 응답이 온다).
  for (const path of [`/v1/__test/analysis-receiver/${row.requestId}`, `/v1/analysis-requests/${row.requestId}/results`,
    '/v1/worker/results', `/v1/analysis-injection/${row.requestId}`]) {
    const response = await fetch(s.url + path, { method: 'POST',
      headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 404, path);
  }
});

test('받기가 예상 밖으로 멈추면 앱을 닫고 exit(1)을 한 번 부른다', { skip }, async t => {
  const s = await startQueuedProduct(t);
  await waitFor(() => s.runner.worker.isRunning(), '받기 시작');
  // 받기 실행이 끝나는 경우를 만든다(시험에서만 내부 객체를 닫는다).
  await s.runner.worker.close();
  await waitFor(() => s.exits.length > 0, 'exit 호출');
  assert.deepEqual(s.exits, [1]);
  await assert.rejects(fetch(s.url + '/health', { signal: AbortSignal.timeout(1000) }), 'HTTP 서버가 닫혀야 한다');
  assert.ok(s.lines.some(line => line.includes('ANALYSIS_QUEUE_CONSUMER_STOPPED')));
  assert.ok(s.lines.some(line => line.includes('분석 큐 받기가 멈춰')));
});

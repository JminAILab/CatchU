require('reflect-metadata');
// #233 실제 큐(Valkey) 시험. AppModule + AnalysisQueueModule.register(...)만 조립하고 실제 테스트 DB를 쓴다.
// CATCHU_TEST_REDIS_URL이 셸·CI 환경에 있으면 반드시 돈다(닿지 않으면 실패). 없으면 큐가 필요한 시험만 건너뛴다.
// .env에 적어도 npm test 실행기가 넘기지 않으므로 셸 환경변수로 준다(api/docs/analysis-queue.md 「시험」).
// worker 쪽은 시험 대역이다: 요청 작업은 시험용 BullMQ Worker가 끝내고, 진행 알림·결과는 worker와 같은 이름·ID·옵션으로 직접 넣는다.
// 보호 관측은 합성 대역이다(실제 GitHub 관측·#105 정책 공급자가 아님).
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const net = require('node:net');
const { after, before, beforeEach, test } = require('node:test');
const { setTimeout: sleep } = require('node:timers/promises');
const { Module } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { Job, Queue, Worker } = require('bullmq');
const IORedis = require('ioredis');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const { CONTRACT_DIR, captureLogger, insertAttempt, observation, useAppSettings, waitFor, workerEvent, workerResult } =
  require('../helpers/queue-harness.cjs');
const { applyPatch, checkMessage, readFixture } = require('../helpers/worker-messages.cjs');
const { AppModule } = require('../../dist/app.module');
const { AnalysisQueueModule, AnalysisQueueRunner } = require('../../dist/analysis-queue/analysis-queue.module');
const { requestJobOptions } = require('../../dist/analysis-queue/queue-spec');
const { ANALYSIS_PROCESSING_DEADLINE_MS } = require('../../dist/analysis-deadline/analysis-deadline.service');
const { DatabaseReceiverStore } = require('../../dist/analysis-receiver/database-receiver.store');
const { AnalysisReceiver } = require('../../dist/analysis-receiver/analysis-receiver.service');
const { WorkerMessageValidator } = require('../../dist/analysis-receiver/worker-message.validator');
const { AnalysisRegistrationService } = require('../../dist/analysis-receiver/analysis-registration.service');

const REDIS_URL = process.env.CATCHU_TEST_REDIS_URL;
const skip = REDIS_URL ? false : 'CATCHU_TEST_REDIS_URL이 없어 실제 큐 시험을 건너뜀';
// worker/docs/queue-consumer.md 「큐 규격」의 진행 알림·결과 옵션.
const EVENT_OPTIONS = { attempts: 1, removeOnComplete: true, removeOnFail: true, stackTraceLimit: 0 };
const resultOptions = jobId => ({ jobId, attempts: 1, removeOnComplete: { age: 1800 }, removeOnFail: { age: 1800 }, stackTraceLimit: 0 });

let db;
before(async () => {
  db = await openTestDataSource();
  if (!REDIS_URL) return;
  // 값이 있으면 건너뛰지 않는다. 닿지 않으면 짧은 상한으로 실패한다.
  const probe = new IORedis(REDIS_URL, { lazyConnect: true, connectTimeout: 2000, retryStrategy: () => null,
    enableOfflineQueue: false, maxRetriesPerRequest: 0 });
  probe.on('error', () => undefined);
  try {
    await probe.connect();
    assert.equal(await probe.ping(), 'PONG');
  } finally { probe.disconnect(); }
});
after(async () => { await db?.destroy(); });
beforeEach(async () => { await resetTestDatabase(db); });

async function within(promise, label, timeoutMs = 5000) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('시간 초과: ' + label)), timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}

/** 시험마다 새 접두사로 앱을 띄운다. 정리: 생산·소비 중지(app.close) → 두 큐 obliterate → 연결 닫기. */
async function startQueueApp(t, { observe = async context => observation(context) } = {}) {
  useAppSettings(t);
  const prefix = `catchu-test-${randomUUID().slice(0, 8)}`;
  const { lines, logger } = captureLogger();
  class TestModule {}
  Module({ imports: [AppModule, AnalysisQueueModule.register({ queue: { redisUrl: REDIS_URL, prefix },
    observations: { observe }, contractDirectory: CONTRACT_DIR })] })(TestModule);
  const app = await NestFactory.create(TestModule, { logger, abortOnError: false });
  let closing;
  const close = () => { closing ??= app.close(); return closing; };
  const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
  const requests = new Queue('analysis-requests', { connection, prefix });
  const messages = new Queue('worker-messages', { connection, prefix });
  const helpers = [];
  t.after(async () => {
    try { await close(); } finally {
      for (const helper of helpers) await helper.close();
      await requests.obliterate({ force: true });
      await messages.obliterate({ force: true });
      await requests.close();
      await messages.close();
      await connection.quit();
    }
  });
  await app.init();
  const runner = app.get(AnalysisQueueRunner);
  runner.start();
  await within(runner.waitUntilReady(), '큐 연결 준비');
  /** worker 대역: 요청 작업을 꺼내 handle 결과대로 완료·실패로 끝낸다. */
  const requestWorker = async handle => {
    const worker = new Worker('analysis-requests', handle, { connection: { url: REDIS_URL }, prefix });
    helpers.push(worker);
    await within(worker.waitUntilReady(), '시험용 worker 준비');
    return worker;
  };
  return { app, close, runner, prefix, connection, requests, messages, lines, requestWorker };
}

const requestOf = row => db.query('SELECT * FROM analysis_request WHERE request_id = $1', [row.requestId]).then(rows => rows[0]);
const attemptOf = row => db.query('SELECT * FROM analysis_attempt WHERE attempt_id = $1', [row.attemptId]).then(rows => rows[0]);
const counts = () => db.query(`SELECT (SELECT count(*)::int FROM result_application_record) receipts,
  (SELECT count(*)::int FROM catch_asset) catches`).then(rows => rows[0]);
const stateOf = (queue, id) => queue.getJobState(id);
// 수신·반영이 쓰는 표. 거부된 결과는 여기에 아무것도 남기지 않고 앞선 수신·반영 자료도 바꾸지 않는다.
const STORED_TABLES = ['result_application_record', 'candidate_registration', 'catch_asset', 'catch_evidence', 'repository_protection'];
/** 요청·시도 행과 수신·반영 표 전체. 시각까지 그대로인지 비교한다. */
async function snapshot(row) {
  const tables = {};
  for (const table of STORED_TABLES) tables[table] = await db.query(`SELECT * FROM ${table} ORDER BY 1`);
  return { request: await requestOf(row), attempt: await attemptOf(row), tables };
}
/** worker처럼 결과를 넣고(작업 ID = 메시지 ID) 끝날 때까지 기다린 뒤 Redis에서 그 작업을 다시 읽는다. */
async function deliverResult(s, message) {
  await s.messages.add('Result', message, resultOptions(message.messageId));
  await waitFor(async () => ['completed', 'failed'].includes(await stateOf(s.messages, message.messageId)), '결과 작업 끝남');
  return { state: await stateOf(s.messages, message.messageId), job: await Job.fromId(s.messages, message.messageId) };
}

test('같은 대기 시도를 두 번 보내고 같은 작업 ID로 다른 내용을 직접 넣어도 작업은 하나이고 첫 데이터 그대로다(대기·완료 보관·실패 보관)', { skip }, async t => {
  const s = await startQueueApp(t);
  const completed = await insertAttempt(db);
  const failed = await insertAttempt(db);
  await s.runner.dispatchOnce();
  await s.runner.dispatchOnce();
  const worker = await s.requestWorker(async job => {
    if (job.id === failed.attemptId) throw new Error('TEST_REQUEST_FAILED');
    return { handled: 'TEST' };
  });
  await waitFor(async () => await stateOf(s.requests, completed.attemptId) === 'completed' &&
    await stateOf(s.requests, failed.attemptId) === 'failed', '요청 작업 완료·실패');
  await worker.close();
  const waiting = await insertAttempt(db);
  await s.runner.dispatchOnce();
  await s.runner.dispatchOnce();
  for (const [row, state] of [[waiting, 'waiting'], [completed, 'completed'], [failed, 'failed']]) {
    // 같은 작업 ID·다른 내용을 직접 넣어도 큐가 무시한다.
    await s.requests.add('Request', { different: true, messageId: 'other' }, requestJobOptions(row.attemptId));
    assert.equal(await stateOf(s.requests, row.attemptId), state);
    const stored = await Job.fromId(s.requests, row.attemptId);
    assert.equal(stored.name, 'Request');
    assert.equal(stored.data.messageId, `request-${row.attemptId}`, state);
    assert.equal(stored.data.attemptId, row.attemptId);
    assert.equal(checkMessage('Request', stored.data).verdict, 'VALID');
  }
  const jobCounts = await s.requests.getJobCounts('waiting', 'active', 'delayed', 'prioritized', 'completed', 'failed');
  assert.deepEqual(jobCounts, { waiting: 1, active: 0, delayed: 0, prioritized: 0, completed: 1, failed: 1 });
  // Redis에서 다시 읽은 실제 적용 옵션: 재시도 1회·backoff 없음·stacktrace 없음, 보관은 처리 시한보다 길다.
  const stored = await Job.fromId(s.requests, waiting.attemptId);
  assert.equal(stored.opts.attempts, 1);
  assert.equal(stored.opts.backoff, undefined);
  assert.equal(stored.opts.stackTraceLimit, 0);
  assert.deepEqual(stored.opts.removeOnComplete, { age: 7200 });
  assert.deepEqual(stored.opts.removeOnFail, { age: 7200 });
  assert.ok(stored.opts.removeOnComplete.age * 1000 > ANALYSIS_PROCESSING_DEADLINE_MS);
  assert.deepEqual((await Job.fromId(s.requests, failed.attemptId)).stacktrace, []);
  // 키는 지정 접두사 아래에만 있다.
  assert.equal(await s.connection.exists(`${s.prefix}:analysis-requests:${waiting.attemptId}`), 1);
  assert.equal(await s.connection.exists(`bull:analysis-requests:${waiting.attemptId}`), 0);
  for (const row of [waiting, completed, failed]) {
    const keys = await s.connection.keys(`*${row.attemptId}*`);
    assert.ok(keys.length > 0);
    assert.equal(keys.every(key => key.startsWith(`${s.prefix}:analysis-requests:`)), true);
  }
});

for (const finish of ['completed', 'failed']) {
  test(`보관(${finish}): 정리는 2시간 넘은 작업만 지우고, 90분 된 작업은 남아 같은 작업 ID 재추가를 무시한다`, { skip }, async t => {
    const s = await startQueueApp(t);
    const handle = async () => {
      if (finish === 'failed') throw new Error('TEST_REQUEST_FAILED');
      return { handled: 'TEST' };
    };
    const kept = await insertAttempt(db);
    const removed = await insertAttempt(db);
    await s.runner.dispatchOnce();
    const first = await s.requestWorker(handle);
    await waitFor(async () => await stateOf(s.requests, kept.attemptId) === finish &&
      await stateOf(s.requests, removed.attemptId) === finish, '두 요청 작업 종료');
    await first.close();
    const option = finish === 'completed' ? 'removeOnComplete' : 'removeOnFail';
    assert.ok((await Job.fromId(s.requests, kept.attemptId)).opts[option].age * 1000 > ANALYSIS_PROCESSING_DEADLINE_MS);
    // 끝난 시각(집합의 점수)을 옮긴다. 실제로는 처리 시한으로 이미 닫혔을 요청이라 DB도 닫는다(보내기가 다시 넣지 않게).
    const set = `${s.prefix}:analysis-requests:${finish}`;
    assert.equal(await s.connection.zadd(set, 'XX', 'CH', Date.now() - 90 * 60 * 1000, kept.attemptId), 1);
    assert.equal(await s.connection.zadd(set, 'XX', 'CH', Date.now() - 130 * 60 * 1000, removed.attemptId), 1);
    await db.query("UPDATE analysis_request SET lifecycle = 'CLOSED' WHERE request_id = ANY($1)", [[kept.requestId, removed.requestId]]);
    // 같은 옵션의 다른 작업이 끝날 때 BullMQ가 그 작업의 보관값으로 정리한다.
    const trigger = await insertAttempt(db);
    await s.runner.dispatchOnce();
    const second = await s.requestWorker(handle);
    await waitFor(async () => await stateOf(s.requests, trigger.attemptId) === finish, '정리를 일으키는 작업 종료');
    await second.close();
    assert.equal(await stateOf(s.requests, kept.attemptId), finish);
    assert.equal(await Job.fromId(s.requests, removed.attemptId), undefined);
    assert.equal(await s.connection.zscore(set, removed.attemptId), null);
    await s.requests.add('Request', { different: true }, requestJobOptions(kept.attemptId));
    assert.equal((await Job.fromId(s.requests, kept.attemptId)).data.messageId, `request-${kept.attemptId}`);
    assert.equal(await s.requests.getWaitingCount(), 0);
  });
}

test('worker 형식 알림·결과: 받음·실행 중 반영, 수신 확인을 결과 작업 반환값으로, 같은 결과 재전달은 DUPLICATE, 같은 결과 ID의 다른 내용은 PAYLOAD_CONFLICT, 다른 작업 ID는 실패', { skip }, async t => {
  const s = await startQueueApp(t);
  const row = await insertAttempt(db, { submittedAt: new Date(Date.now() - 1000) });
  const initial = await requestOf(row);
  const received = workerEvent(row, 'RECEIVED');
  await s.messages.add('ProcessingEvent', received, { ...EVENT_OPTIONS, jobId: received.messageId });
  await waitFor(async () => (await requestOf(row)).updated_at > initial.updated_at, '받음 알림 반영');
  assert.equal((await attemptOf(row)).processing, 'QUEUED');
  const running = workerEvent(row, 'RUNNING');
  await s.messages.add('ProcessingEvent', running, { ...EVENT_OPTIONS, jobId: running.messageId });
  await waitFor(async () => (await attemptOf(row)).processing === 'RUNNING', '실행 중 알림 반영');

  const result = workerResult(row);
  await s.messages.add('Result', result, resultOptions(result.messageId));
  await waitFor(async () => await stateOf(s.messages, result.messageId) === 'completed', '결과 작업 완료');
  // 처리 함수가 돌려준 값을 Redis에서 다시 읽는다(worker가 수신 확인을 읽는 방식).
  const receipt = (await Job.fromId(s.messages, result.messageId)).returnvalue;
  assert.equal(typeof receipt, 'object');
  assert.equal(checkMessage('ResultReceipt', receipt).verdict, 'VALID');
  assert.deepEqual([receipt.resultId, receipt.requestId, receipt.attemptId], [result.resultId, row.requestId, row.attemptId]);
  assert.deepEqual([receipt.disposition, receipt.code], ['ACCEPTED', 'OK']);
  assert.deepEqual(await counts(), { receipts: 1, catches: 1 });
  assert.equal((await attemptOf(row)).application, 'APPLIED');

  // 같은 결과를 메시지 ID·작업 ID를 함께 바꿔 다시 넣으면 DUPLICATE이고 기록·Catch는 그대로다.
  const again = { ...result, messageId: `${result.messageId}-again` };
  await s.messages.add('Result', again, resultOptions(again.messageId));
  await waitFor(async () => await stateOf(s.messages, again.messageId) === 'completed', '재전달 결과 작업 완료');
  const duplicate = (await Job.fromId(s.messages, again.messageId)).returnvalue;
  assert.deepEqual([duplicate.disposition, duplicate.code], ['DUPLICATE', 'ALREADY_RECEIVED']);
  assert.deepEqual(await counts(), { receipts: 1, catches: 1 });

  // 같은 결과 ID에 다른 내용(메시지·작업 ID도 새 것)이면 PAYLOAD_CONFLICT이고 첫 수신·반영 자료는 그대로다(#121).
  // 바로 위 DUPLICATE가 같은 첫 결과로 '이미 받은 결과' 갈래에 닿으므로, 이 거부는 내용 차이 때문이다.
  const changed = workerResult(row, 'same-id-different-content');
  assert.deepEqual([changed.resultId, changed.requestId, changed.attemptId], [result.resultId, result.requestId, result.attemptId]);
  assert.notEqual(changed.messageId, result.messageId);
  assert.notDeepEqual(changed.candidates, result.candidates);
  assert.equal(checkMessage('Result', changed).verdict, 'VALID');
  const kept = await snapshot(row);
  const conflict = await deliverResult(s, changed);
  assert.equal(conflict.state, 'completed');
  const rejected = conflict.job.returnvalue;
  assert.equal(checkMessage('ResultReceipt', rejected).verdict, 'VALID');
  assert.deepEqual([rejected.resultId, rejected.requestId, rejected.attemptId], [result.resultId, row.requestId, row.attemptId]);
  assert.deepEqual([rejected.disposition, rejected.code], ['REJECTED', 'PAYLOAD_CONFLICT']);
  assert.deepEqual(await snapshot(row), kept);

  // 같은 데이터를 다른 작업 ID로 넣으면 수신 경로에 넘기지 않고 고정 코드로 실패한다.
  const otherRow = await insertAttempt(db);
  const other = workerResult(otherRow);
  const otherId = `other-${randomUUID()}`;
  await s.messages.add('Result', other, resultOptions(otherId));
  await waitFor(async () => await stateOf(s.messages, otherId) === 'failed', '작업 ID 불일치 실패');
  const failedJob = await Job.fromId(s.messages, otherId);
  assert.equal(failedJob.failedReason, 'JOB_ID_MISMATCH');
  assert.deepEqual(failedJob.stacktrace, []);
  assert.equal(failedJob.returnvalue, null);
  assert.deepEqual(await counts(), { receipts: 1, catches: 1 });
  assert.equal((await attemptOf(otherRow)).application, 'NOT_READY');

  const logs = s.lines.join('\n');
  assert.ok(logs.includes(`"event":"WORKER_RESULT_RECEIVED","jobId":"${result.messageId}","disposition":"ACCEPTED","code":"OK"`));
  assert.ok(logs.includes('"event":"WORKER_MESSAGE_FAILED","jobName":"Result","jobId":null,"code":"JOB_ID_MISMATCH"'));
  // 기록에 본문·밖에서 온 작업 ID를 싣지 않는다.
  for (const value of [result.candidates[0].title, result.candidates[0].draft.content, otherId]) assert.equal(logs.includes(value), false);
});

// 결과 수신 경계(#121): 세 식별자 중 하나라도 읽을 수 없는 결과는 수신 확인 없이(null) 끝나고, 세 식별자가 읽히는 잘못된 결과는
// 보낸 식별자를 그대로 담은 거부 수신 확인이 된다. 실제 큐를 거쳐 worker가 읽는 결과 작업 반환값으로 확인한다.
// 입력은 #103 공용 합성 세트의 식별 불가 사례·음성 대조다. 정상 결과의 대조군은 위 왕복 시험이다.
const NEGATIVE_CONTROLS = readFixture('cases.json').negativeControls;
const negativePatch = id => NEGATIVE_CONTROLS.find(control => control.id === id).patch;
const RECEIPT_BOUNDARY = [
  { name: '시도 ID 누락', code: null, build: row => workerResult(row, 'unidentifiable-missing-attempt-id') },
  { name: '결과 ID 빈 값', code: null, build: row => applyPatch(workerResult(row), negativePatch('empty-result-id')) },
  { name: '요청 ID가 문자열 아님', code: null, build: row => applyPatch(workerResult(row), negativePatch('non-string-request-id')) },
  { name: '후보 제목 키 없음', code: 'SCHEMA_INVALID', build: row => applyPatch(workerResult(row), negativePatch('missing-title')) },
  { name: '다른 회원', code: 'CONTEXT_MISMATCH', build: row => ({ ...workerResult(row), memberId: randomUUID() }) },
];
for (const c of RECEIPT_BOUNDARY) {
  const expected = c.code === null ? '반환값 null' : `보낸 식별자를 담은 REJECTED·${c.code}`;
  test(`결과 수신 경계(${c.name}): 실제 큐를 거치면 작업은 완료·${expected}이고 DB·보호 관측은 그대로다`, { skip }, async t => {
    const observed = [];
    const s = await startQueueApp(t, { observe: async context => { observed.push(context); return observation(context); } });
    const row = await insertAttempt(db);
    const message = c.build(row);
    // 작업 ID 검사(JOB_ID_MISMATCH)를 지나 E 수신까지 가는 메시지다.
    assert.equal(message.messageId, `message-mock-${row.attemptId}-result`);
    const before = await snapshot(row);
    const from = s.lines.length;

    const { state, job } = await deliverResult(s, message);
    assert.equal(state, 'completed');
    assert.equal(job.name, 'Result');
    assert.deepEqual(job.data, message);
    const logs = s.lines.slice(from).join('\n');
    if (c.code === null) {
      // 식별자를 추정하거나 새로 만들어 수신 확인을 채우지 않는다.
      assert.strictEqual(job.returnvalue, null);
      assert.ok(logs.includes('{"kind":"Result","code":"UNIDENTIFIABLE"}'));
      assert.ok(logs.includes(`"event":"WORKER_RESULT_RECEIVED","jobId":"${message.messageId}","disposition":null,"code":null`));
    } else {
      const receipt = job.returnvalue;
      assert.equal(checkMessage('ResultReceipt', receipt).verdict, 'VALID');
      assert.deepEqual([receipt.resultId, receipt.requestId, receipt.attemptId], [message.resultId, message.requestId, message.attemptId]);
      assert.deepEqual([receipt.disposition, receipt.code], ['REJECTED', c.code]);
      assert.ok(logs.includes(`{"kind":"Result","code":"${c.code}"}`));
      assert.ok(logs.includes(`"event":"WORKER_RESULT_RECEIVED","jobId":"${message.messageId}","disposition":"REJECTED","code":"${c.code}"`));
    }
    assert.deepEqual(await snapshot(row), before);
    for (const rows of Object.values(before.tables)) assert.deepEqual(rows, []);
    assert.deepEqual(observed, []);
    assert.equal(logs.includes(message.candidates[0].draft.content), false);
  });
}

test('처리 중인 결과가 있으면 종료는 그 작업이 끝날 때까지 기다리고, 끝난 작업은 완료·수신 확인으로 남는다', { skip }, async t => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let entered;
  const inSupplier = new Promise(resolve => { entered = resolve; });
  const s = await startQueueApp(t, { observe: async context => { entered(); await gate; return observation(context); } });
  const row = await insertAttempt(db);
  const result = workerResult(row);
  await s.messages.add('Result', result, resultOptions(result.messageId));
  await within(inSupplier, '보호 공급 호출');
  let closed = false;
  const closing = s.close().then(() => { closed = true; });
  await sleep(300);
  assert.equal(closed, false, '처리 중 작업이 끝나기 전에는 닫히지 않는다');
  release();
  await within(closing, '앱 종료', 10_000);
  assert.equal(await stateOf(s.messages, result.messageId), 'completed');
  assert.equal((await Job.fromId(s.messages, result.messageId)).returnvalue.disposition, 'ACCEPTED');
  assert.equal((await attemptOf(row)).application, 'APPLIED');
});

test('처리 중 작업이 끝나지 않으면 종료는 상한까지만 기다리고 기록을 남긴 뒤 연결을 닫는다', { skip }, async t => {
  const prefix = `catchu-test-${randomUUID().slice(0, 8)}`;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let entered;
  const inSupplier = new Promise(resolve => { entered = resolve; });
  const receiver = new AnalysisReceiver(new DatabaseReceiverStore(db), new WorkerMessageValidator(CONTRACT_DIR), { record: () => undefined });
  const registration = new AnalysisRegistrationService(receiver, db,
    { observe: async context => { entered(); await gate; return observation(context); } }, { failed: () => undefined });
  const lines = [];
  const logger = Object.fromEntries(['log', 'warn', 'error'].map(level => [level, value => lines.push(JSON.stringify(value))]));
  const runner = new AnalysisQueueRunner({ config: { redisUrl: REDIS_URL, prefix }, dataSource: db, registration,
    validator: new WorkerMessageValidator(CONTRACT_DIR), logger, limits: { consumerCloseTimeoutMs: 300, connectionQuitTimeoutMs: 500 } });
  const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
  const requests = new Queue('analysis-requests', { connection, prefix });
  const messages = new Queue('worker-messages', { connection, prefix });
  t.after(async () => {
    release();
    await runner.stop();
    await sleep(200);
    for (const queue of [requests, messages]) {
      await queue.obliterate({ force: true });
      await queue.close();
    }
    await connection.quit();
  });
  runner.start();
  await within(runner.waitUntilReady(), '큐 연결 준비');
  const row = await insertAttempt(db);
  const result = workerResult(row);
  await messages.add('Result', result, resultOptions(result.messageId));
  await within(inSupplier, '보호 공급 호출');
  const started = Date.now();
  await within(runner.stop(), '상한 있는 종료', 3000);
  assert.ok(Date.now() - started < 2000);
  assert.ok(lines.some(line => line === JSON.stringify({ event: 'ANALYSIS_QUEUE_SHUTDOWN_TIMEOUT', stage: 'CONSUMER' })));
});

test('제품 AppModule에는 큐 실행기가 없고, 큐 모듈을 조립해도 start 전에는 큐 서버에 붙지 않는다', async t => {
  useAppSettings(t);
  const product = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  await product.init();
  try {
    assert.throws(() => product.get(AnalysisQueueRunner, { strict: false }));
  } finally { await product.close(); }

  const { lines, logger } = captureLogger();
  class TestModule {}
  // 아무것도 듣지 않는 주소. 붙으려 하면 연결 오류 기록이 남는다.
  Module({ imports: [AppModule, AnalysisQueueModule.register({ queue: { redisUrl: 'redis://127.0.0.1:1', prefix: 'catchu-test' },
    observations: { observe: async () => null }, contractDirectory: CONTRACT_DIR })] })(TestModule);
  const app = await NestFactory.create(TestModule, { logger, abortOnError: false });
  await app.init();
  try {
    const runner = app.get(AnalysisQueueRunner);
    await assert.rejects(runner.dispatchOnce(), /not started/);
    await sleep(200);
    assert.equal(lines.some(line => line.includes('ANALYSIS_QUEUE')), false);
  } finally { await app.close(); }
});

test('큐 서버에 닿지 않으면 보내기는 명령 없이 건너뛰고, 종료는 상한 안에 연결을 끊고 끝난다', async t => {
  const lines = [];
  const logger = Object.fromEntries(['log', 'warn', 'error'].map(level => [level, value => lines.push(JSON.stringify(value))]));
  const runner = new AnalysisQueueRunner({ config: { redisUrl: 'redis://127.0.0.1:1', prefix: 'catchu-test' }, dataSource: db,
    registration: { receiveResult: async () => assert.fail(), receiveProgress: async () => assert.fail() },
    validator: new WorkerMessageValidator(CONTRACT_DIR), logger, limits: { connectionQuitTimeoutMs: 300 } });
  t.after(() => runner.stop());
  await insertAttempt(db);
  runner.start();
  await sleep(100);
  assert.equal((await runner.dispatchOnce()).paused, 'QUEUE_NOT_READY');
  const started = Date.now();
  await within(runner.stop(), '연결 없는 종료', 3000);
  assert.ok(Date.now() - started < 2000);
  assert.ok(lines.some(line => line.includes('"event":"ANALYSIS_QUEUE_ERROR"') && line.includes('ECONNREFUSED')));
  assert.equal(lines.some(line => line.includes('127.0.0.1:1')), false, '오류 기록에 주소를 싣지 않는다');
});

test('같은 출처에서 연달아 나는 같은 오류는 한 번만 남기고, 원본 연결이 다시 붙으면 그 연결을 쓰는 큐의 기록 상태도 비운다(합성 사건 배선 시험)', async t => {
  const lines = [];
  const logger = Object.fromEntries(['log', 'warn', 'error'].map(level => [level, value => lines.push(value)]));
  const runner = new AnalysisQueueRunner({ config: { redisUrl: 'redis://127.0.0.1:1', prefix: 'catchu-test' }, dataSource: db,
    registration: { receiveResult: async () => assert.fail(), receiveProgress: async () => assert.fail() },
    validator: new WorkerMessageValidator(CONTRACT_DIR), logger, limits: { connectionQuitTimeoutMs: 300 } });
  t.after(() => runner.stop());
  runner.start();
  // 실제 연결 대신 합성 사건을 보낸다(내부 객체 접근은 이 시험에서만).
  const synthetic = () => Object.assign(new Error('synthetic detail'), { name: 'SyntheticError' });
  const queueErrors = () => lines.filter(entry => entry.event === 'ANALYSIS_QUEUE_ERROR' && entry.source === 'REQUEST_QUEUE' &&
    entry.error === 'SyntheticError').length;
  runner.queue.emit('error', synthetic());
  runner.queue.emit('error', synthetic());
  assert.equal(queueErrors(), 1);
  runner.requestConnection.emit('error', synthetic());
  runner.requestConnection.emit('ready');
  runner.queue.emit('error', synthetic());
  assert.equal(queueErrors(), 2, '다시 붙은 뒤의 같은 오류는 다시 남긴다');
  assert.ok(lines.some(entry => entry.event === 'ANALYSIS_QUEUE_CONNECTED' && entry.source === 'REQUEST_CONNECTION'));
  assert.equal(JSON.stringify(lines).includes('synthetic detail'), false);
});

/** 모듈 없이 실행기를 직접 만든다(종료 상한을 짧게 바꾸는 시험용). 보호 관측은 observe가 정한다. */
function directRunner(t, { redisUrl = REDIS_URL, observe = async context => observation(context), limits = {} } = {}) {
  const prefix = `catchu-test-${randomUUID().slice(0, 8)}`;
  const receiver = new AnalysisReceiver(new DatabaseReceiverStore(db), new WorkerMessageValidator(CONTRACT_DIR), { record: () => undefined });
  const registration = new AnalysisRegistrationService(receiver, db, { observe }, { failed: () => undefined });
  const lines = [];
  const logger = Object.fromEntries(['log', 'warn', 'error'].map(level => [level, value => lines.push(value)]));
  const runner = new AnalysisQueueRunner({ config: { redisUrl, prefix }, dataSource: db, registration,
    validator: new WorkerMessageValidator(CONTRACT_DIR), logger, limits });
  const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
  const requests = new Queue('analysis-requests', { connection, prefix });
  const messages = new Queue('worker-messages', { connection, prefix });
  t.after(async () => {
    await runner.stop();
    for (const queue of [requests, messages]) {
      await queue.obliterate({ force: true });
      await queue.close();
    }
    await connection.quit();
  });
  return { runner, lines, requests, messages, prefix };
}
const shutdownTimeouts = (lines, stage) => lines.filter(line => line.event === 'ANALYSIS_QUEUE_SHUTDOWN_TIMEOUT' && line.stage === stage);

test('받기는 두 연결이 준비된 뒤에만 시작하고, 시작 전에 쌓여 있던 결과를 처리하는 중이면 종료가 그 작업을 기다린다', { skip }, async t => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let entered;
  const inSupplier = new Promise(resolve => { entered = resolve; });
  const { runner, messages, lines } = directRunner(t, {
    observe: async context => { entered(); await gate; return observation(context); },
    limits: { consumerCloseTimeoutMs: 5000 } });
  t.after(() => release());
  const row = await insertAttempt(db);
  const result = workerResult(row);
  await messages.add('Result', result, resultOptions(result.messageId));
  runner.start();
  // 준비를 기다리는 동안에는 소비를 시작하지 않는다(시험에서만 내부 객체를 본다).
  assert.equal(runner.worker.isRunning(), false);
  await within(inSupplier, '쌓여 있던 결과 처리 시작');
  let stopped = false;
  const stopping = runner.stop().then(() => { stopped = true; });
  await sleep(300);
  assert.equal(stopped, false, '처리 중 작업이 있으면 강제로 닫지 않고 기다린다');
  release();
  await within(stopping, '처리가 끝난 뒤 종료', 8000);
  assert.equal(await stateOf(messages, result.messageId), 'completed');
  assert.equal((await Job.fromId(messages, result.messageId)).returnvalue.disposition, 'ACCEPTED');
  assert.deepEqual(shutdownTimeouts(lines, 'CONSUMER'), []);
});

/** 시험용 TCP 중계. cut()은 듣기를 멈추고 열린 연결을 끊어, 붙어 있던 클라이언트가 재접속을 되풀이하게 한다. */
async function relay(target) {
  const sockets = new Set();
  const server = net.createServer(client => {
    const upstream = net.connect(Number(target.port || 6379), target.hostname);
    for (const socket of [client, upstream]) {
      sockets.add(socket);
      socket.on('error', () => undefined);
      socket.on('close', () => { client.destroy(); upstream.destroy(); });
    }
    client.pipe(upstream).pipe(client);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `redis://127.0.0.1:${server.address().port}`,
    cut: () => new Promise(resolve => { server.close(() => resolve()); for (const socket of sockets) socket.destroy(); }),
  };
}

test('큐 서버가 끊겨 다시 붙으려는 중에 멈추면 받기를 기다리지 않고 닫아 상한 안에 끝난다', { skip }, async t => {
  const link = await relay(new URL(REDIS_URL));
  const { runner, lines } = directRunner(t, { redisUrl: link.url, limits: { consumerCloseTimeoutMs: 3000, connectionQuitTimeoutMs: 300 } });
  t.after(() => link.cut());
  runner.start();
  await within(runner.waitUntilReady(), '큐 연결 준비');
  await waitFor(() => runner.worker.isRunning(), '받기 시작');
  await link.cut();
  await waitFor(() => runner.consumerConnection.status === 'reconnecting', '받기 연결 재접속 중');
  const started = Date.now();
  await within(runner.stop(), '재접속 중 종료', 6000);
  assert.ok(Date.now() - started < 1500, `종료에 ${Date.now() - started}ms`);
  assert.deepEqual(shutdownTimeouts(lines, 'CONSUMER'), [], 'BullMQ 일반 닫기에 매달리지 않는다');
});

test('받기 실행이 예상 밖으로 끝나면 다시 시작하지 않고 보내기까지 멈춘 뒤 onFailure를 한 번 부른다', { skip }, async t => {
  const { runner, lines, requests } = directRunner(t);
  let failures = 0;
  runner.start(() => { failures += 1; });
  await within(runner.waitUntilReady(), '큐 연결 준비');
  await waitFor(() => runner.worker.isRunning(), '받기 시작');
  // 받기 실행이 끝나는 경우를 만든다(시험에서만 내부 객체를 닫는다).
  await within(runner.worker.close(), '받기 닫기');
  await waitFor(() => failures === 1, 'onFailure 호출');
  assert.deepEqual(lines.filter(line => line.event === 'ANALYSIS_QUEUE_CONSUMER_STOPPED').map(line => line.error), ['RUN_ENDED']);
  assert.equal(runner.worker.isRunning(), false);
  // 멈춘 뒤에는 보낼 대기 시도가 있어도 넣지 않는다.
  const row = await insertAttempt(db);
  assert.equal((await runner.dispatchOnce()).enqueued, 0);
  assert.equal(await requests.getJob(row.attemptId), undefined);
  await runner.stop();
  assert.equal(failures, 1);
});

test('보내기의 DB 조회가 멎어도 종료는 보내기 상한까지만 기다리고 다음 단계로 간다', { skip }, async t => {
  const { runner, lines } = directRunner(t, { limits: { dispatchStopTimeoutMs: 500 } });
  const holder = db.createQueryRunner();
  await holder.connect();
  t.after(async () => {
    if (holder.isTransactionActive) await holder.rollbackTransaction();
    await holder.release();
  });
  runner.start();
  await within(runner.waitUntilReady(), '큐 연결 준비');
  // 대상 조회가 기다리게 요청 테이블을 잠근다.
  await holder.startTransaction();
  await holder.query('LOCK TABLE analysis_request IN ACCESS EXCLUSIVE MODE');
  const dispatching = runner.dispatchOnce();
  dispatching.catch(() => undefined);
  try {
    await sleep(200);
    const started = Date.now();
    await within(runner.stop(), 'DB 조회가 멎은 동안 종료', 5000);
    assert.ok(Date.now() - started < 2500, `종료에 ${Date.now() - started}ms`);
    assert.equal(shutdownTimeouts(lines, 'DISPATCH').length, 1);
  } finally {
    // 실패해도 잠금을 먼저 풀어 정리 단계가 멈추지 않게 한다.
    await holder.rollbackTransaction();
  }
  // 잠금이 풀리면 멈춘 보내기는 아무것도 넣지 않고 끝난다.
  assert.equal((await within(dispatching, '멈춘 보내기 끝남')).enqueued, 0);
});

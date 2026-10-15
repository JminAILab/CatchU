require('reflect-metadata');
// #233 받기: worker-messages 큐의 진행 알림·결과 작업을 실제 DB 수신·반영 경로로 넘기는 처리 함수.
// 작업은 worker 형식(작업 이름·작업 ID·데이터)의 객체로 직접 넘긴다. 실제 큐(Valkey) 왕복은 analysis-queue-valkey.test.cjs.
// 보호 관측은 합성 대역이다(실제 GitHub 관측·#105 정책 공급자가 아님).
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { after, before, beforeEach, test } = require('node:test');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const { CONTRACT_DIR, insertAttempt, observation, workerEvent, workerResult } = require('../helpers/queue-harness.cjs');
const { DatabaseReceiverStore } = require('../../dist/analysis-receiver/database-receiver.store');
const { AnalysisReceiver } = require('../../dist/analysis-receiver/analysis-receiver.service');
const { WorkerMessageValidator } = require('../../dist/analysis-receiver/worker-message.validator');
const { AnalysisRegistrationService } = require('../../dist/analysis-receiver/analysis-registration.service');
const { readAnalysisStatus } = require('../../dist/analysis-intake/analysis-status');
const { checkMessage } = require('../helpers/worker-messages.cjs');
const { AnalysisQueueError, WorkerMessageConsumer } = require('../../dist/analysis-queue/worker-message.consumer');

const validator = new WorkerMessageValidator(CONTRACT_DIR);
const SECRET = 'synthetic-consumer-secret-91c2';
let db;
before(async () => { db = await openTestDataSource(); });
after(async () => { await db?.destroy(); });
beforeEach(async () => { await resetTestDatabase(db); });

function consumer(observe = async context => observation(context)) {
  const logs = [];
  const receiver = new AnalysisReceiver(new DatabaseReceiverStore(db), validator, { record: (kind, code) => logs.push({ kind, code }) });
  const registration = new AnalysisRegistrationService(receiver, db, { observe }, { failed: code => logs.push({ stage: 'APPLICATION', code }) });
  const consumerLog = {
    progress: (jobId, decision) => logs.push({ event: 'PROGRESS', jobId, decision }),
    result: (jobId, receipt) => logs.push({ event: 'RESULT', jobId, disposition: receipt?.disposition ?? null, code: receipt?.code ?? null }),
    applicationFailed: jobId => logs.push({ event: 'APPLICATION_FAILED', jobId }),
  };
  return { consumer: new WorkerMessageConsumer(registration, consumerLog), logs };
}
const job = (name, data, id = data.messageId) => ({ name, id, data });
const attemptOf = row => db.query('SELECT * FROM analysis_attempt WHERE attempt_id = $1', [row.attemptId]).then(rows => rows[0]);
const requestOf = row => db.query('SELECT * FROM analysis_request WHERE request_id = $1', [row.requestId]).then(rows => rows[0]);
const counts = () => db.query(`SELECT (SELECT count(*)::int FROM result_application_record) receipts,
  (SELECT count(*)::int FROM catch_asset) catches, (SELECT count(*)::int FROM candidate_registration) registrations`).then(rows => rows[0]);
// worker가 수신 확인을 받아들이는 조건: ResultReceipt 스키마 통과와 세 식별자 일치(worker/app/consumer/receipts.py).
const receiptShape = (receipt, row, result) => {
  assert.equal(checkMessage('ResultReceipt', receipt).verdict, 'VALID');
  assert.equal(receipt.resultId, result.resultId);
  assert.equal(receipt.requestId, row.requestId);
  assert.equal(receipt.attemptId, row.attemptId);
};

test('받음 알림은 처리 상태를 QUEUED로 두고 관측만 저장하며(updated_at 증가), 실행 중 알림은 RUNNING으로 바꾼다', async () => {
  const row = await insertAttempt(db, { submittedAt: new Date(Date.now() - 1000) });
  const { consumer: c, logs } = consumer();
  const before = await requestOf(row);
  const received = workerEvent(row, 'RECEIVED');
  assert.equal(await c.process(job('ProcessingEvent', received)), null);
  const afterReceived = await requestOf(row);
  assert.equal((await attemptOf(row)).processing, 'QUEUED');
  assert.ok(afterReceived.updated_at > before.updated_at, '받음 알림도 수신 처리가 저장(updated_at)한다');
  assert.equal(await c.process(job('ProcessingEvent', workerEvent(row, 'RUNNING'))), null);
  assert.equal((await attemptOf(row)).processing, 'RUNNING');
  assert.ok((await requestOf(row)).updated_at > afterReceived.updated_at);
  assert.deepEqual(logs, [
    { event: 'PROGRESS', jobId: received.messageId, decision: 'OBSERVED' },
    { event: 'PROGRESS', jobId: `event-mock-${row.attemptId}-running`, decision: 'OBSERVED' },
  ]);
});

test('실행 불명 알림은 지금 수신 코드대로: 실행 중 뒤에는 RUNNING 유지, 대기에서는 UNCERTAIN, 닫힌 요청은 변경 없음', async () => {
  const { consumer: c, logs } = consumer();
  const running = await insertAttempt(db);
  await c.process(job('ProcessingEvent', workerEvent(running, 'RUNNING')));
  await c.process(job('ProcessingEvent', workerEvent(running, 'UNCERTAIN')));
  assert.equal((await attemptOf(running)).processing, 'RUNNING', '실행 중 → 실행 불명 전이를 더하지 않는다(10/6 결정)');

  const queued = await insertAttempt(db);
  await c.process(job('ProcessingEvent', workerEvent(queued, 'UNCERTAIN')));
  assert.equal((await attemptOf(queued)).processing, 'UNCERTAIN');

  const closed = await insertAttempt(db, { lifecycle: 'CLOSED', processing: 'FAILED', application: 'APPLIED' });
  const before = { attempt: await attemptOf(closed), request: await requestOf(closed) };
  assert.equal(await c.process(job('ProcessingEvent', workerEvent(closed, 'UNCERTAIN'))), null);
  assert.deepEqual({ attempt: await attemptOf(closed), request: await requestOf(closed) }, before);
  assert.equal(logs.at(-1).decision, 'TERMINAL_UNCHANGED');
});

test('worker 형식의 종결 결과는 수신 기록 1건·반영 APPLIED가 되고 수신 확인 객체를 그대로 돌려준다', async () => {
  const row = await insertAttempt(db);
  const result = workerResult(row);
  const { consumer: c, logs } = consumer();
  const receipt = await c.process(job('Result', result));
  assert.equal(typeof receipt, 'object', '문자열이 아닌 객체로 돌려준다');
  receiptShape(receipt, row, result);
  assert.equal(receipt.disposition, 'ACCEPTED');
  assert.equal(receipt.code, 'OK');
  assert.deepEqual(await counts(), { receipts: 1, catches: 1, registrations: 1 });
  const attempt = await attemptOf(row);
  assert.equal(attempt.processing, 'SUCCEEDED');
  assert.equal(attempt.application, 'APPLIED');
  assert.equal((await requestOf(row)).lifecycle, 'CLOSED');
  assert.deepEqual(logs.at(-1), { event: 'RESULT', jobId: result.messageId, disposition: 'ACCEPTED', code: 'OK' });
});

test('같은 결과 작업을 두 번 처리하면 두 번째는 DUPLICATE이고 수신 기록·Catch는 하나다', async () => {
  const row = await insertAttempt(db);
  const result = workerResult(row);
  const { consumer: c } = consumer();
  assert.equal((await c.process(job('Result', result))).disposition, 'ACCEPTED');
  const second = await c.process(job('Result', result));
  assert.equal(second.disposition, 'DUPLICATE');
  assert.equal(second.code, 'ALREADY_RECEIVED');
  receiptShape(second, row, result);
  assert.deepEqual(await counts(), { receipts: 1, catches: 1, registrations: 1 });
});

test('같은 데이터를 다른 작업 ID로 넣은 작업은 수신 경로에 넘기지 않고 JOB_ID_MISMATCH로 실패한다', async () => {
  const row = await insertAttempt(db);
  const result = workerResult(row);
  const { consumer: c } = consumer();
  await assert.rejects(c.process(job('Result', result, `message-mock-${randomUUID()}-result`)),
    error => error instanceof AnalysisQueueError && error.message === 'JOB_ID_MISMATCH');
  await assert.rejects(c.process(job('ProcessingEvent', workerEvent(row, 'RUNNING'), 'other-id')), { message: 'JOB_ID_MISMATCH' });
  assert.deepEqual(await counts(), { receipts: 0, catches: 0, registrations: 0 });
  assert.equal((await attemptOf(row)).processing, 'QUEUED');
});

test('#121에서 넘어온 경우(가): 알림 없이 온 FAILED·후보 0건 결과도 수락하고 0건 반영 뒤 재요청할 수 있다', async () => {
  const row = await insertAttempt(db);
  const { consumer: c } = consumer(async () => { throw new Error('후보가 없으면 보호 공급을 부르지 않는다'); });
  const receipt = await c.process(job('Result', workerResult(row, 'failed')));
  assert.equal(receipt.disposition, 'ACCEPTED');
  const attempt = await attemptOf(row);
  assert.equal(attempt.processing, 'FAILED');
  assert.equal(attempt.application, 'APPLIED');
  assert.deepEqual(await counts(), { receipts: 1, catches: 0, registrations: 0 });
  const { status } = await db.transaction(manager => readAnalysisStatus(manager, row.memberId, row.requestId));
  assert.equal(status.lifecycle, 'CLOSED');
  assert.deepEqual(status.retry, { allowed: true, reason: 'FAILURE_WITHOUT_RESULTS' });
});

test('#121에서 넘어온 경우(나): 닫힌 요청의 결과는 작업을 완료로 두고 거부 수신 확인을 돌려주며 아무것도 저장하지 않는다', async () => {
  const row = await insertAttempt(db, { lifecycle: 'CLOSED', processing: 'FAILED', application: 'APPLIED' });
  const { consumer: c } = consumer();
  const result = workerResult(row);
  const receipt = await c.process(job('Result', result));
  receiptShape(receipt, row, result);
  assert.equal(receipt.disposition, 'REJECTED');
  assert.equal(receipt.code, 'PAYLOAD_CONFLICT');
  assert.deepEqual(await counts(), { receipts: 0, catches: 0, registrations: 0 });
});

test('수신 뒤 반영이 실패하면(보호 공급 예외) 작업은 완료·ACCEPTED 반환, DB는 APPLY_FAILED. 후보 0건이면 공급을 부르지 않아 APPLIED', async () => {
  const withCandidate = await insertAttempt(db);
  const { consumer: c, logs } = consumer(async () => { throw new Error(SECRET); });
  const receipt = await c.process(job('Result', workerResult(withCandidate)));
  assert.equal(receipt.disposition, 'ACCEPTED');
  assert.equal((await attemptOf(withCandidate)).application, 'APPLY_FAILED');
  assert.deepEqual(logs.filter(entry => entry.event).map(entry => entry.event), ['RESULT', 'APPLICATION_FAILED']);
  assert.ok(logs.some(entry => entry.code === 'PROTECTION_UNAVAILABLE'));

  const empty = await insertAttempt(db);
  assert.equal((await c.process(job('Result', workerResult(empty, 'empty')))).disposition, 'ACCEPTED');
  assert.equal((await attemptOf(empty)).application, 'APPLIED');
  assert.equal(JSON.stringify(logs).includes(SECRET), false);
});

test('반영 실패를 기록하는 저장까지 실패해도 작업은 완료·ACCEPTED이고 수신 기록 1건·PENDING이 남는다', async () => {
  const row = await insertAttempt(db);
  const { consumer: c, logs } = consumer(async () => null);
  await db.query("ALTER TABLE analysis_attempt ADD CONSTRAINT test_queue_fail_record CHECK (application <> 'APPLY_FAILED') NOT VALID");
  let receipt;
  try { receipt = await c.process(job('Result', workerResult(row))); }
  finally { await db.query('ALTER TABLE analysis_attempt DROP CONSTRAINT test_queue_fail_record'); }
  assert.equal(receipt.disposition, 'ACCEPTED');
  assert.equal((await attemptOf(row)).application, 'PENDING');
  assert.equal((await counts()).receipts, 1);
  assert.ok(logs.some(entry => entry.code === 'FAILURE_RECORDING_FAILED'));
});

test('수신 커밋 자체가 실패하면 수신 확인 없이 RECEIVER_STORAGE_UNAVAILABLE로 실패하고 기록은 0건이다', async () => {
  const row = await insertAttempt(db);
  const { consumer: c, logs } = consumer();
  await db.query(`CREATE FUNCTION test_queue_receipt_commit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION '${SECRET}'; END; $$`);
  await db.query(`CREATE CONSTRAINT TRIGGER test_queue_receipt_commit AFTER INSERT ON result_application_record
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION test_queue_receipt_commit()`);
  let failure;
  try { failure = await c.process(job('Result', workerResult(row))).then(() => null, error => error); }
  finally {
    await db.query('DROP TRIGGER test_queue_receipt_commit ON result_application_record');
    await db.query('DROP FUNCTION test_queue_receipt_commit()');
  }
  assert.ok(failure instanceof AnalysisQueueError);
  assert.equal(failure.message, 'RECEIVER_STORAGE_UNAVAILABLE');
  assert.equal(failure.stack, 'AnalysisQueueError: RECEIVER_STORAGE_UNAVAILABLE');
  assert.equal(failure.cause, undefined);
  assert.deepEqual(await counts(), { receipts: 0, catches: 0, registrations: 0 });
  assert.equal((await attemptOf(row)).application, 'NOT_READY');
  assert.equal(logs.some(entry => entry.event === 'RESULT'), false);
  assert.equal(JSON.stringify(logs).includes(SECRET), false);
});

test('진행 알림 저장이 실패하면 RECEIVER_STORAGE_UNAVAILABLE로 실패한다', async () => {
  const row = await insertAttempt(db);
  const { consumer: c } = consumer();
  await db.query('ALTER TABLE analysis_request ADD CONSTRAINT test_queue_progress_fail CHECK (false) NOT VALID');
  try {
    await assert.rejects(c.process(job('ProcessingEvent', workerEvent(row, 'RUNNING'))), { message: 'RECEIVER_STORAGE_UNAVAILABLE' });
  } finally { await db.query('ALTER TABLE analysis_request DROP CONSTRAINT test_queue_progress_fail'); }
  assert.equal((await attemptOf(row)).processing, 'QUEUED');
});

test('식별할 수 없는 결과는 null을 돌려주고(작업 완료) 아무것도 저장하지 않는다', async () => {
  const row = await insertAttempt(db);
  const { consumer: c, logs } = consumer();
  const result = workerResult(row, 'unidentifiable-missing-attempt-id');
  assert.equal(await c.process(job('Result', result)), null);
  assert.deepEqual(await counts(), { receipts: 0, catches: 0, registrations: 0 });
  assert.deepEqual(logs.at(-1), { event: 'RESULT', jobId: result.messageId, disposition: null, code: null });
});

test('모르는 작업 이름은 UNKNOWN_JOB_NAME으로 실패하고, 본문·이름·ID의 비밀 표지가 실패 사유·stack·기록에 없다', async () => {
  const row = await insertAttempt(db);
  const { consumer: c, logs } = consumer(async () => { throw new Error(SECRET); });
  const failures = [];
  const capture = promise => promise.then(() => assert.fail('실패해야 한다'), error => failures.push(error));
  await capture(c.process({ name: `Report-${SECRET}`, id: `message-mock-${row.attemptId}-result`, data: workerResult(row) }));
  await capture(c.process({ name: 'Result', id: `${SECRET}-job`, data: workerResult(row) }));
  // 정상 식별자를 둔 채 본문에 표지를 넣은 결과와 진행 알림: 정상 처리되고 기록에 표지가 없다.
  const result = workerResult(row);
  result.candidates[0].title = SECRET;
  result.candidates[0].draft.content = SECRET;
  assert.equal((await c.process(job('Result', result))).disposition, 'ACCEPTED');
  assert.deepEqual(failures.map(error => error.message), ['UNKNOWN_JOB_NAME', 'JOB_ID_MISMATCH']);
  for (const error of failures) {
    assert.equal(error.name, 'AnalysisQueueError');
    assert.equal(`${error.message}\n${error.stack}`.includes(SECRET), false);
    assert.equal(error.stack.includes(' at '), false, '호출 위치를 싣지 않는다');
  }
  assert.equal(JSON.stringify(logs).includes(SECRET), false);
});

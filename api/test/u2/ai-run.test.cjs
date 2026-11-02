// U2 AiRun(계약 C-02, 기능 설계 W5·BR5.1~BR5.7, 시나리오 S19~S21, 비기능 NFR4.4·NFR4.9·NFR5.4·NFR6.1~6.3).
// 실제 큐 시험은 셸 환경변수 CATCHU_TEST_REDIS_URL이 있을 때만 돈다(10월 큐 시험과 같은 규칙, 있으면 닿지 않을 때 실패).
// DB 도우미 시험은 시험 안에서 만든 확인용 표를 쓰고 끝나면 지운다(다른 Unit의 실행 상태 표는 아직 없다).
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { after, before, test } = require('node:test');
const { Logger } = require('@nestjs/common');
const { Queue } = require('bullmq');
const IORedis = require('ioredis').default;
const { openTestDataSource } = require('../support/test-database.cjs');
const { AiRun } = require('../../dist/ai-run/ai-run');
const { AI_RUN_QUEUE, AI_RUN_JOB_RETENTION_SECONDS, AI_RUN_WORKER_OPTIONS, readStatus, isValidRunKey } = require('../../dist/ai-run/ai-run-spec');
const { persistDeadlineFailure, saveRunResult } = require('../../dist/ai-run/run-status-store');

const REDIS_URL = process.env.CATCHU_TEST_REDIS_URL;
const skip = REDIS_URL ? false : 'CATCHU_TEST_REDIS_URL이 없어 실제 큐 시험을 건너뜀';
const SECRET = 'SECRET_PAYLOAD_TEXT';

let db;
before(async () => { db = await openTestDataSource(); });
after(async () => { await db?.destroy(); });

function captureLogs(t) {
  const logs = [];
  Logger.overrideLogger(Object.fromEntries(['log', 'warn', 'error', 'debug', 'verbose', 'fatal']
    .map((level) => [level, (...args) => logs.push({ level, entry: args[0] })])));
  t.after(() => Logger.overrideLogger(false));
  return logs;
}
const events = (logs, name) => logs.filter((log) => log.entry?.event === name).map((log) => log.entry);

async function waitFor(check, timeoutMs = 10000) {
  const started = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - started > timeoutMs) throw new Error('기다린 상태가 오지 않았습니다');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** 시험마다 새 접두사의 AiRun과, 상태를 읽을 시험용 큐. */
function queueRun(t) {
  const prefix = `u2-ai-run-${randomUUID()}`;
  const run = new AiRun({ redisUrl: REDIS_URL, prefix });
  const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
  const inspect = new Queue(AI_RUN_QUEUE, { connection, prefix });
  t.after(async () => {
    await run.close();
    await inspect.obliterate({ force: true }).catch(() => undefined);
    await inspect.close();
    connection.disconnect();
  });
  return { run, inspect };
}
const payload = () => ({ publicationId: randomUUID() });

test('등록한 처리기가 runKey·payload로 실행되고, 작업 옵션은 시도 1회·2시간 보관이다', { skip }, async (t) => {
  captureLogs(t);
  const { run, inspect } = queueRun(t);
  const seen = [];
  run.registerHandler('BASE_SUMMARY', async (job) => { seen.push(job); });
  run.start();
  const data = payload();
  const runKey = `BASE_SUMMARY-${data.publicationId}`;
  assert.equal(await run.enqueueAfterCommit('BASE_SUMMARY', runKey, data), 'ENQUEUED');
  await waitFor(() => seen.length === 1);
  assert.deepEqual(seen, [{ runKey, payload: data }]);
  const job = await inspect.getJob(runKey);
  await waitFor(async () => (await job.getState()) === 'completed');
  assert.equal(job.opts.attempts, 1);
  assert.deepEqual(job.opts.removeOnComplete, { age: AI_RUN_JOB_RETENTION_SECONDS });
  assert.deepEqual(job.opts.removeOnFail, { age: AI_RUN_JOB_RETENTION_SECONDS });
  assert.equal(AI_RUN_JOB_RETENTION_SECONDS, 7200);
  assert.equal(AI_RUN_WORKER_OPTIONS.concurrency, 1);
  assert.equal(AI_RUN_WORKER_OPTIONS.maxStalledCount, 0);
});

test('같은 runKey를 두 번(끝난 뒤 한 번 더) 등록해도 처리기는 한 번만 돈다', { skip }, async (t) => {
  captureLogs(t);
  const { run, inspect } = queueRun(t);
  let calls = 0;
  run.registerHandler('EMBED_PUBLICATION', async () => { calls += 1; });
  const data = payload();
  const runKey = `EMBED_PUBLICATION-${data.publicationId}`;
  assert.equal(await run.enqueueAfterCommit('EMBED_PUBLICATION', runKey, data), 'ENQUEUED');
  assert.equal(await run.enqueueAfterCommit('EMBED_PUBLICATION', runKey, data), 'ENQUEUED');
  run.start();
  await waitFor(async () => (await (await inspect.getJob(runKey))?.getState()) === 'completed');
  assert.equal(await run.enqueueAfterCommit('EMBED_PUBLICATION', runKey, data), 'ENQUEUED', '보관 중인 같은 작업 ID는 무시된다');
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(calls, 1);
  assert.equal((await inspect.getJobCounts('completed')).completed, 1);
});

test('S20 콜론·빈 runKey와 계약 밖 payload는 등록하지 않고 ENQUEUE_FAILED, 로그에 payload가 없다. 처리기 중복 등록은 기동 실패', async (t) => {
  const logs = captureLogs(t);
  const run = new AiRun(null);
  t.after(() => run.close());
  const data = payload();
  for (const runKey of ['BASE_SUMMARY:1', '', 'has space', 'x'.repeat(129)]) {
    assert.equal(isValidRunKey(runKey), false);
    assert.equal(await run.enqueueAfterCommit('BASE_SUMMARY', runKey, data), 'ENQUEUE_FAILED');
  }
  assert.equal(await run.enqueueAfterCommit('BASE_SUMMARY', randomUUID(), { publicationId: data.publicationId, text: SECRET }), 'ENQUEUE_FAILED');
  assert.equal(await run.enqueueAfterCommit('JD_SUMMARY', randomUUID(), data), 'ENQUEUE_FAILED', 'JD_SUMMARY payload는 { runId }');
  assert.equal(await run.enqueueAfterCommit('QNA', randomUUID(), data), 'ENQUEUE_FAILED');
  const failed = events(logs, 'ai_run_enqueue_failed');
  assert.equal(failed.length, 7);
  assert.ok(failed.slice(0, 4).every((entry) => entry.runKey === null && entry.error === 'INVALID_JOB'));
  assert.ok(!JSON.stringify(logs).includes(SECRET) && !JSON.stringify(logs).includes(data.publicationId));

  run.registerHandler('JD_SUMMARY', async () => {});
  assert.throws(() => run.registerHandler('JD_SUMMARY', async () => {}), /이미 등록/);
  assert.throws(() => run.registerHandler('QNA', async () => {}), TypeError);
  assert.deepEqual(run.registeredKinds(), ['JD_SUMMARY']);
});

test('S19 Redis에 닿지 않거나 큐 주소가 없으면 예외 없이 ENQUEUE_FAILED이고, PENDING 행은 시한 뒤 읽으면 FAILED다', async (t) => {
  const logs = captureLogs(t);
  const down = new AiRun({ redisUrl: 'redis://127.0.0.1:1', prefix: `u2-down-${randomUUID()}` });
  const unconfigured = new AiRun(null);
  t.after(async () => { await down.close(); await unconfigured.close(); });
  const data = payload();
  const started = Date.now();
  assert.equal(await down.enqueueAfterCommit('BASE_SUMMARY', randomUUID(), data), 'ENQUEUE_FAILED');
  assert.ok(Date.now() - started < 6000, '명령 상한 안에 끝난다');
  assert.equal(await unconfigured.enqueueAfterCommit('BASE_SUMMARY', randomUUID(), data), 'ENQUEUE_FAILED');
  const failed = events(logs, 'ai_run_enqueue_failed');
  assert.equal(failed.length, 2);
  assert.equal(failed[1].error, 'QUEUE_NOT_CONFIGURED');
  assert.ok(!JSON.stringify(logs).includes('redis://'), '큐 주소를 남기지 않는다');
  // 등록에 실패한 접수 행은 PENDING으로 남고, 시한이 지나 읽으면 FAILED다.
  const row = { status: 'PENDING', deadlineAt: new Date(started + 60_000) };
  assert.equal(readStatus(row, new Date(started)), 'PENDING');
  assert.equal(readStatus(row, new Date(started + 60_000)), 'FAILED');
});

test('readStatus 경계: 시한과 같은 시각부터 FAILED, DONE·FAILED는 그대로', () => {
  const deadlineAt = new Date('2026-11-13T05:00:00.000Z');
  assert.equal(readStatus({ status: 'PENDING', deadlineAt }, new Date('2026-11-13T04:59:59.999Z')), 'PENDING');
  assert.equal(readStatus({ status: 'PENDING', deadlineAt }, deadlineAt), 'FAILED');
  assert.equal(readStatus({ status: 'DONE', deadlineAt }, new Date('2026-11-14T00:00:00Z')), 'DONE');
  assert.equal(readStatus({ status: 'FAILED', deadlineAt }, new Date('2026-11-12T00:00:00Z')), 'FAILED');
});

test('시한이 지난 PENDING만 조건부로 FAILED로 저장하고 DONE·시한 전 PENDING은 덮지 않는다', async (t) => {
  const table = `u2_run_probe_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  await db.query(`CREATE TABLE ${table} (run_id uuid PRIMARY KEY, status varchar NOT NULL, deadline_at timestamptz NOT NULL)`);
  t.after(() => db.query(`DROP TABLE ${table}`));
  const now = new Date('2026-11-13T05:00:00Z');
  const past = new Date('2026-11-13T04:00:00Z');
  const future = new Date('2026-11-13T06:00:00Z');
  const ids = { done: randomUUID(), late: randomUUID(), early: randomUUID() };
  await db.query(`INSERT INTO ${table} VALUES ($1, 'DONE', $4), ($2, 'PENDING', $4), ($3, 'PENDING', $5)`, [ids.done, ids.late, ids.early, past, future]);
  const persist = (runId) => persistDeadlineFailure(db.manager, { table, key: { run_id: runId } }, now);
  assert.equal(await persist(ids.done), false);
  assert.equal(await persist(ids.late), true);
  assert.equal(await persist(ids.early), false);
  assert.equal(await persist(ids.late), false, '이미 FAILED면 다시 바꾸지 않는다');
  const statuses = Object.fromEntries((await db.query(`SELECT run_id, status FROM ${table}`)).map((row) => [row.run_id, row.status]));
  assert.deepEqual(statuses, { [ids.done]: 'DONE', [ids.late]: 'FAILED', [ids.early]: 'PENDING' });
  await assert.rejects(persistDeadlineFailure(db.manager, { table: 'x; DROP TABLE member_account', key: { run_id: ids.done } }, now), TypeError);
  await assert.rejects(persistDeadlineFailure(db.manager, { table, key: {} }, now), TypeError);
});

test('S21 부모가 없거나 PENDING이 아니거나 시한이 지났으면 결과를 버리고, 저장 중 외래 키 위반도 버리며 다시 시도하지 않는다', async (t) => {
  const logs = captureLogs(t);
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const parent = `u2_parent_${suffix}`;
  const child = `u2_child_${suffix}`;
  await db.query(`CREATE TABLE ${parent} (publication_id uuid PRIMARY KEY)`);
  await db.query(`CREATE TABLE ${child} (publication_id uuid PRIMARY KEY REFERENCES ${parent} ON DELETE CASCADE, body text NOT NULL)`);
  t.after(async () => { await db.query(`DROP TABLE ${child}`); await db.query(`DROP TABLE ${parent}`); });
  const now = new Date('2026-11-13T05:00:00Z');
  const pending = { status: 'PENDING', deadlineAt: new Date('2026-11-13T06:00:00Z') };
  let saves = 0;
  const base = { kind: 'BASE_SUMMARY', runKey: 'BASE_SUMMARY-late', now, save: async () => { saves += 1; } };
  assert.equal(await saveRunResult({ ...base, readParent: async () => null }), 'DISCARDED');
  assert.equal(await saveRunResult({ ...base, readParent: async () => ({ ...pending, status: 'FAILED' }) }), 'DISCARDED');
  assert.equal(await saveRunResult({ ...base, readParent: async () => ({ ...pending, status: 'DONE' }) }), 'DISCARDED');
  assert.equal(await saveRunResult({ ...base, readParent: async () => ({ status: 'PENDING', deadlineAt: now }) }), 'DISCARDED');
  assert.equal(saves, 0);
  assert.equal(await saveRunResult({ ...base, readParent: async () => pending }), 'SAVED');
  assert.equal(saves, 1);

  // 부모를 읽은 뒤 저장 전에 탈퇴 등으로 부모가 지워진 경우: 실제 외래 키 위반(23503)을 버림으로 바꾼다.
  const deletedId = randomUUID();
  let attempts = 0;
  const outcome = await saveRunResult({ ...base, runKey: 'BASE_SUMMARY-deleted', readParent: async () => pending,
    save: async () => { attempts += 1; await db.query(`INSERT INTO ${child} VALUES ($1, $2)`, [deletedId, SECRET]); } });
  assert.equal(outcome, 'DISCARDED');
  assert.equal(attempts, 1, '다시 시도하지 않는다');
  const discarded = events(logs, 'ai_run_result_discarded');
  assert.deepEqual(discarded.map((entry) => entry.reason), ['PARENT_MISSING', 'PARENT_NOT_PENDING', 'PARENT_NOT_PENDING', 'PARENT_NOT_PENDING', 'PARENT_DELETED']);
  assert.ok(!JSON.stringify(logs).includes(SECRET));
  // 외래 키 위반이 아닌 저장 오류는 처리기 실패로 올린다.
  await assert.rejects(saveRunResult({ ...base, readParent: async () => pending, save: async () => { throw new TypeError('boom'); } }), TypeError);
});

test('처리기 예외는 로그 한 줄(kind·runKey·오류 이름)만 남기고 다시 돌리지 않으며, 등록 안 된 종류는 처리하지 않는다. 동시 실행은 1개다', { skip }, async (t) => {
  const logs = captureLogs(t);
  const { run, inspect } = queueRun(t);
  let calls = 0;
  let running = 0;
  let maxRunning = 0;
  run.registerHandler('BASE_SUMMARY', async (job) => {
    calls += 1;
    running += 1;
    maxRunning = Math.max(maxRunning, running);
    await new Promise((resolve) => setTimeout(resolve, 100));
    running -= 1;
    if (job.runKey.startsWith('fail-')) throw new RangeError(`처리 실패 ${SECRET}`);
  });
  run.start();
  const failKey = `fail-${randomUUID()}`;
  const okKey = `ok-${randomUUID()}`;
  const unknownKey = `jd-${randomUUID()}`;
  assert.equal(await run.enqueueAfterCommit('BASE_SUMMARY', failKey, payload()), 'ENQUEUED');
  assert.equal(await run.enqueueAfterCommit('BASE_SUMMARY', okKey, payload()), 'ENQUEUED');
  assert.equal(await run.enqueueAfterCommit('JD_SUMMARY', unknownKey, { runId: randomUUID() }), 'ENQUEUED');
  const stateOf = async (key) => (await inspect.getJob(key))?.getState();
  await waitFor(async () => (await stateOf(failKey)) === 'failed' && (await stateOf(okKey)) === 'completed' && (await stateOf(unknownKey)) === 'failed');
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(calls, 2, '실패한 작업을 다시 부르지 않는다');
  assert.equal(maxRunning, 1, '동시 1');
  assert.equal((await inspect.getJob(failKey)).attemptsMade, 1);
  assert.deepEqual(events(logs, 'ai_run_handler_failed'), [{ event: 'ai_run_handler_failed', kind: 'BASE_SUMMARY', runKey: failKey, error: 'RangeError' }]);
  assert.deepEqual(events(logs, 'ai_run_unknown_kind'), [{ event: 'ai_run_unknown_kind', kind: 'JD_SUMMARY', runKey: unknownKey }]);
  assert.ok(!JSON.stringify(logs).includes(SECRET));
});

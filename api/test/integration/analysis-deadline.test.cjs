require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { before, after, beforeEach, afterEach, test } = require('node:test');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const { CONTRACT_DIR, event } = require('../helpers/receiver-harness.cjs');
const { AnalysisRequest, AnalysisConsent, AnalysisAttempt } = require('../../dist/member-analysis/member-analysis.entity');
const { DatabaseReceiverStore } = require('../../dist/analysis-receiver/database-receiver.store');
const { AnalysisReceiver } = require('../../dist/analysis-receiver/analysis-receiver.service');
const { WorkerMessageValidator } = require('../../dist/analysis-receiver/worker-message.validator');
const { AnalysisRegistrationService, AnalysisRegistrationError } = require('../../dist/analysis-receiver/analysis-registration.service');
const { RepositoryRegistrationPort } = require('../../dist/analysis-receiver/repository-registration.port');
const { ResultApplicationService, ResultApplicationContextError } = require('../../dist/result-application/result-application.service');
const { AnalysisDeadlineService } = require('../../dist/analysis-deadline/analysis-deadline.service');

// 계약 「분석 접수·상태·재요청」의 처리 시한 초과 실패 항목이다.
const DISPATCH = { stage: 'DISPATCH', code: 'PROCESSING_DEADLINE_EXCEEDED', message: '정해진 시간 안에 분석을 마치지 못했습니다.' };
const APPLICATION = { stage: 'APPLICATION', code: 'PROCESSING_DEADLINE_EXCEEDED', message: '정해진 시간 안에 결과를 반영하지 못했습니다.' };
const SUBMITTED = new Date('2026-10-14T00:00:00.000Z');
const DEADLINE = new Date(SUBMITTED.getTime() + 60 * 60 * 1000);

let db;
before(async () => { db = await openTestDataSource(); });
after(async () => { await db?.destroy(); });
beforeEach(async () => { await resetTestDatabase(db); });

function fill(value, context) {
  if (Array.isArray(value)) return value.map(v => fill(v, context));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fill(v, context)]));
  return typeof value === 'string' ? value.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    assert.ok(Object.hasOwn(context, k)); return context[k];
  }) : value;
}
// 접수 API를 대신해 요청·동의·첫 시도만 넣고, 그 요청에 맞는 합성 결과를 함께 돌려준다.
async function prepare({ processing = 'QUEUED', application = 'NOT_READY', memberId = randomUUID(), file = 'succeeded-one-candidate' } = {}) {
  const context = { requestId: randomUUID(), attemptId: randomUUID(), consentId: randomUUID(), memberId,
    repositoryId: 'synthetic-repository', scopeRevision: 'synthetic-scope', caseId: randomUUID() };
  const result = fill(JSON.parse(readFileSync(resolve(__dirname, `../../../worker/fixtures/m1-synthetic/results/${file}.json`), 'utf8')), context);
  result.sourceMode = 'MOCK';
  await db.transaction(async manager => {
    await manager.query("INSERT INTO member_account VALUES ($1,$2,'ACTIVE') ON CONFLICT DO NOTHING", [memberId, 'fixture:' + memberId]);
    await manager.insert(AnalysisRequest, { ...context, currentAttemptId: context.attemptId, submittedAt: SUBMITTED, updatedAt: SUBMITTED });
    await manager.insert(AnalysisConsent, { ...context, accepted: true, noticeRevision: 'fixture', consentedScope: { synthetic: true }, consentedAt: SUBMITTED });
    await manager.insert(AnalysisAttempt, { attemptId: context.attemptId, requestId: context.requestId, sourceMode: 'MOCK', processing, application });
  });
  return result;
}
// 필수 공급 경계의 시험 대역. 실제 GitHub 관측은 아니다.
const observation = result => ({ ownerId: result.memberId, repositoryId: result.repositoryId,
  githubRepository: { owner: 'synthetic-owner', name: 'synthetic-repo' }, confirmedSourceState: { synthetic: true, visibility: 'PUBLIC' },
  observationProvenance: { synthetic: true, provider: 'test' }, observedAt: new Date(), appliedRestriction: 'NONE' });
function pipeline(observe = async context => observation(context)) {
  const receiver = new AnalysisReceiver(new DatabaseReceiverStore(db), new WorkerMessageValidator(CONTRACT_DIR), { record: () => {} });
  return { receiver, registration: new AnalysisRegistrationService(receiver, db, { observe }, { failed: () => {} }) };
}
const applier = result => new ResultApplicationService(db, new RepositoryRegistrationPort(observation(result), result.repositoryId));
function deadline(at = DEADLINE) {
  const logs = [];
  const service = new AnalysisDeadlineService(db, {
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
const counts = async () => (await db.query(`SELECT (SELECT count(*)::int FROM catch_asset) AS catches,
  (SELECT count(*)::int FROM candidate_registration) AS registrations,
  (SELECT count(*)::int FROM result_application_record) AS receipts`))[0];
const sleep = ms => new Promise(done => setTimeout(done, ms));
// holders 중 하나에게 막혀 기다리는 연결을 찾는다. 다른 연결의 대기(advisory·다른 행)는 세지 않는다.
async function waitUntilBlocked(holders, except = []) {
  for (let i = 0; i < 400; i += 1) {
    const rows = await db.query('SELECT pid FROM pg_stat_activity WHERE pg_blocking_pids(pid) && $1::int[]', [holders]);
    const found = rows.map(row => row.pid).filter(pid => !except.includes(pid));
    if (found.length > 0) return found[0];
    await sleep(5);
  }
  assert.fail(`${holders.join(',')}에 막힌 연결이 생기지 않았다`);
}
// 다른 연결이 행 하나를 잠가 둔다. 시도 행을 잡아 두면 요청을 먼저 잠근 작업이 그 시도에서 기다리므로,
// 누가 요청을 먼저 잡았는지 정한 채 두 작업을 겹치게 할 수 있다.
async function hold(table, column, ids) {
  const runner = db.createQueryRunner();
  await runner.connect();
  try {
    await runner.startTransaction();
    const [{ pid }] = await runner.query('SELECT pg_backend_pid() AS pid');
    await runner.query(`SELECT 1 FROM ${table} WHERE ${column} = ANY($1::uuid[]) FOR UPDATE`, [[].concat(ids)]);
    return { pid, release: async () => { try { await runner.commitTransaction(); } finally { await runner.release(); } } };
  } catch (error) {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    throw error;
  }
}
// 시험 안에서 시작한 작업. 시험이 중간에 실패해도 잠금이 풀린 뒤 끝까지 기다려, 다음 시험의 자료를 건드리지 않게 한다.
const inflight = [];
afterEach(async () => { await Promise.allSettled(inflight.splice(0)); });
const settle = promise => {
  inflight.push(promise);
  return promise.then(value => ({ status: 'fulfilled', value }), reason => ({ status: 'rejected', reason }));
};
// 잠금을 기다리지 않고 끝나는지 본다.
const within = (promise, ms) => {
  inflight.push(promise);
  return Promise.race([promise, sleep(ms).then(() => { throw new Error(`${ms}ms 안에 끝나지 않았다`); })]);
};

test('시한을 넘긴 대기·실행 중·실행 불명 요청은 실패로 닫히고 재요청 조건을 갖춘다', async () => {
  for (const processing of ['QUEUED', 'RUNNING', 'UNCERTAIN']) {
    const result = await prepare({ processing });
    const { service, logs } = deadline();
    assert.deepEqual(await service.closeOverdue(), { closed: 1, failed: 0 });
    assert.deepEqual(logs, [{ closed: 'PROCESSING_DEADLINE', requestId: result.requestId }]);
    const { request, attempt } = await stored(result);
    assert.equal(request.lifecycle, 'CLOSED');
    assert.deepEqual(request.updatedAt, DEADLINE);
    // 계약의 재요청 ①: FAILED/APPLIED/CLOSED, 적합 후보 0, 등록 0, 서버의 실패 확정 근거.
    assert.equal(attempt.processing, 'FAILED');
    assert.equal(attempt.application, 'APPLIED');
    assert.equal(attempt.eligibleCandidateCount, 0);
    assert.equal(attempt.ownerResultsReady, false);
    assert.deepEqual(attempt.failures, [DISPATCH]);
    assert.equal(attempt.failureConfirmationReference, 'PROCESSING_DEADLINE_EXCEEDED');
    assert.deepEqual(await counts(), { catches: 0, registrations: 0, receipts: 0 });
    await resetTestDatabase(db);
  }
});

test('시한 전의 처리 중·반영 대기 요청은 그대로 두고, 정확히 60분이 되면 닫는다', async () => {
  const waiting = [];
  for (const processing of ['QUEUED', 'RUNNING', 'UNCERTAIN']) waiting.push(await prepare({ processing }));
  waiting.push(await prepare({ processing: 'SUCCEEDED', application: 'PENDING' }));
  const before = await Promise.all(waiting.map(stored));
  const early = deadline(new Date(DEADLINE.getTime() - 1));
  assert.deepEqual(await early.service.closeOverdue(), { closed: 0, failed: 0 });
  assert.deepEqual(early.logs, []);
  assert.deepEqual(await Promise.all(waiting.map(stored)), before);
  assert.deepEqual(await deadline().service.closeOverdue(), { closed: 4, failed: 0 });
});

test('반영 대기에서 시한을 넘기면 처리 결과를 유지한 채 반영 실패로 닫고, 그 뒤 반영·재전달로 Catch가 생기지 않는다', async () => {
  const result = await prepare();
  const received = await pipeline().receiver.receiveResult(result);
  assert.equal(received.receipt.disposition, 'ACCEPTED');
  const { service, logs } = deadline();
  assert.deepEqual(await service.closeOverdue(), { closed: 1, failed: 0 });
  assert.deepEqual(logs, [{ closed: 'APPLICATION_DEADLINE', requestId: result.requestId }]);
  const closed = await stored(result);
  assert.equal(closed.request.lifecycle, 'CLOSED');
  // 계약의 재요청 ②: APPLY_FAILED/CLOSED, 등록 0. 처리 결과와 적합 후보 수는 그대로다.
  assert.equal(closed.attempt.processing, result.outcome);
  assert.equal(closed.attempt.eligibleCandidateCount, result.candidates.length);
  assert.equal(closed.attempt.application, 'APPLY_FAILED');
  assert.deepEqual(closed.attempt.failures, [...result.failures, APPLICATION]);
  assert.equal(closed.attempt.failureConfirmationReference, null);
  // 수신 직후 진행 중이던 반영은 닫힌 요청을 반영하지 않는다.
  await assert.rejects(applier(result).apply(received.accepted),
    error => error instanceof ResultApplicationContextError && error.reason === 'CONTEXT_MISMATCH');
  const resent = await pipeline().registration.receiveResult(result, async () => {});
  assert.equal(resent.receipt.code, 'ALREADY_RECEIVED');
  assert.equal(resent.application, undefined);
  assert.deepEqual(await stored(result), closed);
  assert.deepEqual(await counts(), { catches: 0, registrations: 0, receipts: 1 });
});

test('B가 맥락을 거부한 반영 실패는 시한을 기다리지 않고 다음 판정에서 닫는다', async () => {
  const result = await prepare();
  await assert.rejects(pipeline(async () => null).registration.receiveResult(result, async () => {}), AnalysisRegistrationError);
  const failed = await stored(result);
  assert.equal(failed.attempt.application, 'APPLY_FAILED');
  assert.equal(failed.request.lifecycle, 'ACTIVE');
  const early = new Date(SUBMITTED.getTime() + 60 * 1000);
  const { service, logs } = deadline(early);
  assert.deepEqual(await service.closeOverdue(), { closed: 1, failed: 0 });
  assert.deepEqual(logs, [{ closed: 'APPLICATION_FAILED', requestId: result.requestId }]);
  const closed = await stored(result);
  assert.equal(closed.request.lifecycle, 'CLOSED');
  assert.deepEqual(closed.request.updatedAt, early);
  // 반영 실패 기록(B 거부 사유)은 그대로이며 처리 시한 항목을 더하지 않는다.
  assert.deepEqual(closed.attempt, failed.attempt);
  assert.deepEqual(await counts(), { catches: 0, registrations: 0, receipts: 1 });
});

test('처리 시한으로 닫힌 뒤 도착한 결과는 PAYLOAD_CONFLICT, 진행 알림은 상태를 바꾸지 않는다', async () => {
  const result = await prepare({ processing: 'RUNNING' });
  await deadline().service.closeOverdue();
  const closed = await stored(result);
  const late = await pipeline().registration.receiveResult(result, async () => {});
  assert.equal(late.receipt.disposition, 'REJECTED');
  assert.equal(late.receipt.code, 'PAYLOAD_CONFLICT');
  assert.equal(late.application, undefined);
  const progress = await pipeline().receiver.receiveProgress(event({ requestId: result.requestId, attemptId: result.attemptId, state: 'UNCERTAIN' }));
  assert.equal(progress, 'TERMINAL_UNCHANGED');
  assert.deepEqual(await stored(result), closed);
  assert.deepEqual(await counts(), { catches: 0, registrations: 0, receipts: 0 });
});

test('반영이 먼저 끝나 닫힌 요청은 시한 판정이 바꾸지 않는다', async () => {
  const result = await prepare();
  const received = await pipeline().receiver.receiveResult(result);
  const applied = await applier(result).apply(received.accepted);
  const before = await stored(result);
  const { service, logs } = deadline();
  assert.deepEqual(await service.closeOverdue(), { closed: 0, failed: 0 });
  assert.deepEqual(logs, []);
  assert.deepEqual(await stored(result), before);
  assert.equal((await counts()).catches, applied.registeredCatchIds.length);
});

test('다른 작업이 오래 잠근 요청은 건너뛰고 나머지를 닫으며, 풀린 뒤 다음 판정에서 닫는다', async () => {
  const locked = await prepare({ processing: 'RUNNING' });
  const others = [await prepare(), await prepare({ processing: 'UNCERTAIN' })];
  const lock = await hold('analysis_request', 'request_id', locked.requestId);
  try {
    assert.deepEqual(await within(deadline().service.closeOverdue(), 2000), { closed: 2, failed: 0 });
    assert.equal((await stored(locked)).request.lifecycle, 'ACTIVE');
    for (const other of others) assert.equal((await stored(other)).request.lifecycle, 'CLOSED');
  } finally {
    await lock.release();
  }
  assert.deepEqual(await deadline().service.closeOverdue(), { closed: 1, failed: 0 });
  assert.deepEqual((await stored(locked)).attempt.failures, [DISPATCH]);
});

test('잠긴 후보가 100건 넘게 있어도 잠기지 않은 뒤쪽 요청을 닫는다', async () => {
  const locked = [];
  for (let i = 0; i < 100; i += 1) locked.push(await prepare({ processing: 'RUNNING' }));
  await db.query('UPDATE analysis_request SET submitted_at = $1 WHERE request_id = ANY($2::uuid[])',
    [new Date(SUBMITTED.getTime() - 60 * 1000), locked.map(result => result.requestId)]);
  const later = await prepare();
  const lock = await hold('analysis_request', 'request_id', locked.map(result => result.requestId));
  try {
    assert.deepEqual(await within(deadline().service.closeOverdue(), 2000), { closed: 1, failed: 0 });
    assert.equal((await stored(later)).request.lifecycle, 'CLOSED');
    assert.equal((await stored(locked[0])).request.lifecycle, 'ACTIVE');
  } finally {
    await lock.release();
  }
  assert.deepEqual(await deadline().service.closeOverdue(), { closed: 100, failed: 0 });
});

test('닫기가 요청을 먼저 잡으면 겹친 반영은 거부되고 반영 실패로 닫힌다', async () => {
  const result = await prepare();
  const received = await pipeline().receiver.receiveResult(result);
  const lock = await hold('analysis_attempt', 'attempt_id', result.attemptId);
  let closing;
  let applying;
  try {
    closing = settle(deadline().service.closeOverdue());
    const closer = await waitUntilBlocked([lock.pid]);
    applying = settle(applier(result).apply(received.accepted));
    await waitUntilBlocked([lock.pid, closer], [closer]);
  } finally {
    await lock.release();
  }
  const [closed, applied] = await Promise.all([closing, applying]);
  assert.deepEqual(closed.value, { closed: 1, failed: 0 });
  assert.equal(applied.status, 'rejected');
  assert.ok(applied.reason instanceof ResultApplicationContextError);
  const { request, attempt } = await stored(result);
  assert.equal(request.lifecycle, 'CLOSED');
  assert.equal(attempt.application, 'APPLY_FAILED');
  assert.deepEqual(attempt.failures, [...result.failures, APPLICATION]);
  const { catches, registrations } = await counts();
  assert.deepEqual({ catches, registrations }, { catches: 0, registrations: 0 });
});

test('반영이 요청을 먼저 잡으면 닫기는 기다리지 않고 건너뛰며, 반영 결과가 남는다', async () => {
  const result = await prepare();
  const received = await pipeline().receiver.receiveResult(result);
  const lock = await hold('analysis_attempt', 'attempt_id', result.attemptId);
  let applying;
  try {
    applying = settle(applier(result).apply(received.accepted));
    await waitUntilBlocked([lock.pid]);
    assert.deepEqual(await within(deadline().service.closeOverdue(), 2000), { closed: 0, failed: 0 });
  } finally {
    await lock.release();
  }
  const applied = await applying;
  assert.equal(applied.status, 'fulfilled');
  const { request, attempt } = await stored(result);
  assert.equal(request.lifecycle, 'CLOSED');
  assert.equal(attempt.application, 'APPLIED');
  assert.deepEqual(attempt.failures, result.failures);
  const { catches } = await counts();
  assert.ok(catches > 0);
  assert.equal(catches, applied.value.registeredCatchIds.length);
  assert.deepEqual(await deadline().service.closeOverdue(), { closed: 0, failed: 0 });
});

test('닫기가 요청을 먼저 잡으면 겹친 결과 수신은 PAYLOAD_CONFLICT다', async () => {
  const result = await prepare();
  const lock = await hold('analysis_attempt', 'attempt_id', result.attemptId);
  let closing;
  let receiving;
  try {
    closing = settle(deadline().service.closeOverdue());
    const closer = await waitUntilBlocked([lock.pid]);
    receiving = settle(pipeline().receiver.receiveResult(result));
    await waitUntilBlocked([lock.pid, closer], [closer]);
  } finally {
    await lock.release();
  }
  const [closed, received] = await Promise.all([closing, receiving]);
  assert.deepEqual(closed.value, { closed: 1, failed: 0 });
  assert.equal(received.value.receipt.code, 'PAYLOAD_CONFLICT');
  const { request, attempt } = await stored(result);
  assert.equal(request.lifecycle, 'CLOSED');
  assert.equal(attempt.processing, 'FAILED');
  assert.equal(attempt.application, 'APPLIED');
  assert.deepEqual(attempt.failures, [DISPATCH]);
  assert.deepEqual(await counts(), { catches: 0, registrations: 0, receipts: 0 });
});

test('결과 수신이 요청을 먼저 잡으면 닫기는 건너뛰고, 다음 판정에서 반영 대기를 반영 실패로 닫는다', async () => {
  const result = await prepare();
  const lock = await hold('analysis_attempt', 'attempt_id', result.attemptId);
  let receiving;
  try {
    receiving = settle(pipeline().receiver.receiveResult(result));
    await waitUntilBlocked([lock.pid]);
    assert.deepEqual(await within(deadline().service.closeOverdue(), 2000), { closed: 0, failed: 0 });
  } finally {
    await lock.release();
  }
  assert.equal((await receiving).value.receipt.disposition, 'ACCEPTED');
  assert.equal((await stored(result)).attempt.application, 'PENDING');
  assert.deepEqual(await deadline().service.closeOverdue(), { closed: 1, failed: 0 });
  const { request, attempt } = await stored(result);
  assert.equal(request.lifecycle, 'CLOSED');
  assert.equal(attempt.processing, result.outcome);
  assert.equal(attempt.application, 'APPLY_FAILED');
  assert.deepEqual(attempt.failures, [...result.failures, APPLICATION]);
  assert.deepEqual(await counts(), { catches: 0, registrations: 0, receipts: 1 });
});

test('여러 api가 같은 후보를 함께 골라도 요청마다 한 번만 닫는다', async () => {
  const results = [];
  for (let i = 0; i < 6; i += 1) results.push(await prepare({ processing: i % 2 ? 'RUNNING' : 'QUEUED' }));
  // 첫 후보를 가장 이른 접수로 두고 그 시도를 잠가, 첫 판정이 후보 목록을 고른 뒤 첫 요청을 쥔 채 기다리게 한다.
  await db.query('UPDATE analysis_request SET submitted_at = $1 WHERE request_id = $2',
    [new Date(SUBMITTED.getTime() - 1000), results[0].requestId]);
  const lock = await hold('analysis_attempt', 'attempt_id', results[0].attemptId);
  let first;
  try {
    first = settle(deadline().service.closeOverdue());
    await waitUntilBlocked([lock.pid]);
    // 두 번째 판정은 같은 후보를 고르고, 첫 판정이 쥔 요청만 건너뛴다.
    assert.deepEqual(await within(deadline().service.closeOverdue(), 2000), { closed: 5, failed: 0 });
  } finally {
    await lock.release();
  }
  assert.deepEqual((await first).value, { closed: 1, failed: 0 });
  for (const result of results) assert.deepEqual((await stored(result)).attempt.failures, [DISPATCH]);
});

test('계약 전이에 없는 조합은 판정 대상이 아니며, 100건이 쌓여도 다른 요청이 밀리지 않는다', async () => {
  const stuck = [];
  for (let i = 0; i < 100; i += 1) stuck.push(await prepare({ processing: 'SUCCEEDED', application: 'APPLIED' }));
  await db.query('UPDATE analysis_request SET submitted_at = $1 WHERE request_id = ANY($2::uuid[])',
    [new Date(SUBMITTED.getTime() - 60 * 1000), stuck.map(result => result.requestId)]);
  const before = await stored(stuck[0]);
  const overdue = await prepare({ processing: 'RUNNING' });
  const { service, logs } = deadline();
  assert.deepEqual(await service.closeOverdue(), { closed: 1, failed: 0 });
  assert.deepEqual(logs, [{ closed: 'PROCESSING_DEADLINE', requestId: overdue.requestId }]);
  assert.deepEqual(await stored(stuck[0]), before);
  const [{ n }] = await db.query("SELECT count(*)::int AS n FROM analysis_request WHERE lifecycle = 'ACTIVE'");
  assert.equal(n, 100);
});

test('요청 하나의 닫기가 실패하면 그 요청만 되돌리고 나머지는 닫으며, 다음 판정에서 다시 닫는다', async () => {
  const failing = await prepare({ processing: 'RUNNING' });
  const other = await prepare();
  // 이 요청을 닫는 UPDATE만 거부하는 시험용 제약. 시도 변경이 함께 되돌려지는지 본다.
  await db.query(`ALTER TABLE analysis_request ADD CONSTRAINT test_deadline_close_failure
    CHECK (request_id <> '${failing.requestId}'::uuid OR lifecycle = 'ACTIVE') NOT VALID`);
  try {
    const { service, logs } = deadline();
    assert.deepEqual(await service.closeOverdue(), { closed: 1, failed: 1 });
    assert.deepEqual(logs.filter(log => log.failed), [{ failed: 'QueryFailedError:23514', requestId: failing.requestId }]);
    const kept = await stored(failing);
    assert.equal(kept.request.lifecycle, 'ACTIVE');
    assert.equal(kept.attempt.processing, 'RUNNING');
    assert.equal(kept.attempt.application, 'NOT_READY');
    assert.deepEqual(kept.attempt.failures, []);
    assert.equal(kept.attempt.failureConfirmationReference, null);
    assert.equal((await stored(other)).request.lifecycle, 'CLOSED');
  } finally {
    await db.query('ALTER TABLE analysis_request DROP CONSTRAINT test_deadline_close_failure');
  }
  assert.deepEqual(await deadline().service.closeOverdue(), { closed: 1, failed: 0 });
  assert.deepEqual((await stored(failing)).attempt.failures, [DISPATCH]);
});

test('닫힌 요청의 회원은 같은 저장소에 새 동의·요청·시도를 만들 수 있다', async () => {
  const memberId = randomUUID();
  const result = await prepare({ memberId });
  // 재요청 판정·접수 API(#284)를 대신해 새 동의·요청·시도를 retryOfRequestId와 함께 넣는다.
  const create = () => db.transaction('READ COMMITTED', async manager => {
    const next = { requestId: randomUUID(), attemptId: randomUUID(), consentId: randomUUID() };
    const now = new Date();
    await manager.insert(AnalysisRequest, { requestId: next.requestId, memberId, repositoryId: result.repositoryId,
      consentId: next.consentId, currentAttemptId: next.attemptId, retryOfRequestId: result.requestId, submittedAt: now, updatedAt: now });
    await manager.insert(AnalysisConsent, { consentId: next.consentId, requestId: next.requestId, memberId, repositoryId: result.repositoryId,
      accepted: true, noticeRevision: 'fixture', scopeRevision: 'synthetic-scope', consentedScope: { synthetic: true }, consentedAt: now });
    await manager.insert(AnalysisAttempt, { attemptId: next.attemptId, requestId: next.requestId, sourceMode: 'MOCK' });
    return next;
  });
  // 진행 중 요청이 있는 동안은 회원당 ACTIVE 1개 제한에 걸린다.
  await assert.rejects(create(), error => error.driverError?.code === '23505');
  await deadline().service.closeOverdue();
  const next = await create();
  const created = await db.manager.findOneByOrFail(AnalysisRequest, { requestId: next.requestId });
  assert.equal(created.lifecycle, 'ACTIVE');
  assert.equal(created.retryOfRequestId, result.requestId);
  assert.notEqual(created.consentId, result.consentId);
  assert.notEqual(created.currentAttemptId, result.attemptId);
});

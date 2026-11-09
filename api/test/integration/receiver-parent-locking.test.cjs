require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const { before, after, test } = require('node:test');
const { openTestDataSource } = require('../support/test-database.cjs');
const { event, result, validator } = require('../helpers/receiver-harness.cjs');
const { AnalysisRequest, AnalysisConsent, AnalysisAttempt, MemberAccount } = require('../../dist/member-analysis/member-analysis.entity');
const { RepositoryRegistration } = require('../../dist/member-repositories/repository-registration.entity');
const { DatabaseReceiverStore } = require('../../dist/analysis-receiver/database-receiver.store');
const { AnalysisReceiver } = require('../../dist/analysis-receiver/analysis-receiver.service');

let db;
before(async () => { db = await openTestDataSource(); });
after(async () => { await db?.destroy(); });

function barrier() {
  let arrive, release;
  const reached = new Promise(resolve => { arrive = resolve; });
  const opened = new Promise(resolve => { release = resolve; });
  return { reached, release, async stop(value) { arrive(value); await opened; } };
}
// 실패한 실행도 즉시 관찰해 정리 중 unhandled rejection으로 원인을 잃지 않는다.
const settle = promise => promise.then(value => ({ value }), error => ({ error }));
function successful(outcome) { assert.equal(outcome.error, undefined); return outcome.value; }

function fixtureScope(t) {
  const members = [], records = [], runners = [], gates = [], pending = [];
  t.after(async () => {
    for (const gate of gates) gate.release();
    for (const runner of runners) {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      if (!runner.isReleased) await runner.release();
    }
    await Promise.all(pending);
    // 등록 전부터 보관한 자기 식별자만 지운다. TRUNCATE/전체 회원 삭제는 쓰지 않는다.
    for (const memberId of members) await db.manager.delete(MemberAccount, { memberId });
    for (const row of records) await assertDeleted(row);
  });
  return {
    gate() { const gate = barrier(); gates.push(gate); return gate; },
    track(promise) { const observed = settle(promise); pending.push(observed); return observed; },
    async runner() {
      const runner = db.createQueryRunner(); runners.push(runner);
      await runner.connect(); await runner.startTransaction();
      await runner.query("SET LOCAL statement_timeout = '10s'");
      const [{ pid }] = await runner.query('SELECT pg_backend_pid() AS pid');
      return { runner, pid };
    },
    async fixture() {
      const row = { memberId: randomUUID(), registrationId: randomUUID(), requestId: randomUUID(),
        attemptId: randomUUID(), consentId: randomUUID(), repositoryId: randomUUID(), scopeRevision: 'parent-lock-scope', sourceMode: 'MOCK' };
      members.push(row.memberId); records.push(row);
      await db.transaction(async manager => {
        await manager.insert(MemberAccount, { memberId: row.memberId, accountState: 'ACTIVE', identityReference: 'fixture:' + row.memberId });
        await manager.insert(RepositoryRegistration, { registrationId: row.registrationId, memberId: row.memberId,
          repositoryId: row.repositoryId, owner: 'synthetic-owner', name: 'synthetic-repo',
          repositoryUrl: 'https://github.com/synthetic-owner/synthetic-repo', scopeRevision: row.scopeRevision,
          registeredAt: new Date(), lastVerifiedAt: new Date() });
        await insertRequest(manager, row);
      });
      return row;
    },
  };
}
async function insertRequest(manager, row) {
  await manager.insert(AnalysisRequest, { requestId: row.requestId, memberId: row.memberId, registrationId: row.registrationId,
    repositoryId: row.repositoryId, consentId: row.consentId, currentAttemptId: row.attemptId,
    submittedAt: new Date(), updatedAt: new Date() });
  await manager.insert(AnalysisConsent, { consentId: row.consentId, requestId: row.requestId, memberId: row.memberId,
    repositoryId: row.repositoryId, accepted: true, noticeRevision: 'synthetic-notice', scopeRevision: row.scopeRevision,
    consentedScope: { synthetic: true }, consentedAt: new Date() });
  await manager.insert(AnalysisAttempt, { attemptId: row.attemptId, requestId: row.requestId, sourceMode: row.sourceMode });
}
async function counts(row) {
  return (await db.query(`SELECT
    (SELECT count(*)::int FROM analysis_request WHERE request_id = $1) AS requests,
    (SELECT count(*)::int FROM analysis_consent WHERE request_id = $1) AS consents,
    (SELECT count(*)::int FROM analysis_attempt WHERE request_id = $1) AS attempts,
    (SELECT count(*)::int FROM result_application_record WHERE request_id = $1) AS receipts,
    (SELECT count(*)::int FROM catch_asset WHERE source_request_id = $1) AS catches`, [row.requestId]))[0];
}
const assertDeleted = async row => assert.deepEqual(await counts(row), { requests: 0, consents: 0, attempts: 0, receipts: 0, catches: 0 });
async function assertUnchanged(row) {
  assert.deepEqual(await counts(row), { requests: 1, consents: 1, attempts: 1, receipts: 0, catches: 0 });
  const attempt = await db.manager.findOneByOrFail(AnalysisAttempt, { attemptId: row.attemptId });
  assert.equal(attempt.processing, 'QUEUED'); assert.equal(attempt.application, 'NOT_READY');
}
const parent = (kind, row) => kind === 'member'
  ? { table: 'member_account', key: 'member_id', id: row.memberId }
  : { table: 'repository_registration', key: 'registration_id', id: row.registrationId };
async function deleteParent(manager, kind, row) {
  const { table, key, id } = parent(kind, row);
  return manager.query(`DELETE FROM ${table} WHERE ${key} = $1`, [id]);
}

// 실제 EntityManager의 조회/잠금/저장/커밋을 실행한다. 대역은 반환값을 바꾸지 않고
// 두 연결을 교차 실행할 장벽과, 제품이 감추는 원본 SQLSTATE의 시험 내 관찰만 제공한다.
function instrument(scope, afterFind = async () => {}) {
  let gotPid;
  const pid = new Promise(resolve => { gotPid = resolve; });
  const errors = [], logs = [], locks = [];
  const source = { transaction: (isolation, work) => db.transaction(isolation, async manager => {
    const [{ pid: connectionPid }] = await manager.query('SELECT pg_backend_pid() AS pid');
    gotPid(connectionPid);
    const observed = new Proxy(manager, { get(target, key) {
      if (key === 'findOne') return async (entity, options) => {
        const row = await target.findOne(entity, options);
        if (options.lock) locks.push({ entity, id: row?.registrationId ?? row?.memberId ?? row?.requestId });
        await afterFind({ entity, options, row, pid: connectionPid });
        return row;
      };
      const value = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    } });
    return work(observed);
  }).catch(error => { errors.push(error.driverError?.code ?? error.code ?? error.name); throw error; }) };
  const receiver = new AnalysisReceiver(new DatabaseReceiverStore(source), validator, { record: (kind, code) => logs.push({ kind, code }) });
  return { pid, errors, logs, locks, run(kind, row) {
    return scope.track(kind === 'progress'
      ? receiver.receiveProgress(event({ requestId: row.requestId, attemptId: row.attemptId }))
      : receiver.receiveResult(result({ requestId: row.requestId, attemptId: row.attemptId, memberId: row.memberId,
        repositoryId: row.repositoryId, consentId: row.consentId, scopeRevision: row.scopeRevision, sourceMode: row.sourceMode,
        candidates: [], outcome: 'EMPTY', resultId: randomUUID(), messageId: randomUUID() })));
  } };
}
async function blocked(t, waiter, holder) {
  const end = Date.now() + 5000;
  while (Date.now() < end) {
    const [{ blockers }] = await db.query('SELECT pg_blocking_pids($1::int) AS blockers', [waiter]);
    if (blockers.includes(holder)) {
      t.diagnostic(JSON.stringify({ waiter, holder, blockers, observed: 'pg_blocking_pids' }));
      return;
    }
    await delay(10); // 대기 관계를 조회하는 간격이며, 시간 경과 자체를 통과 근거로 쓰지 않는다.
  }
  assert.fail('pg_blocking_pids에서 기대한 대기 관계를 관찰하지 못함');
}
function assertDecision(kind, outcome, expected) {
  const value = successful(outcome);
  assert.equal(kind === 'progress' ? value : value.receipt.code, expected);
  if (kind === 'result') assert.equal(value.receipt.disposition, expected === 'OK' ? 'ACCEPTED' : 'REJECTED');
}

let sequence = 0;
for (const first of ['delete', 'receive']) for (const parentKind of ['member', 'registration']) for (const kind of ['progress', 'result']) {
  const label = `L${++sequence} ${parentKind}/${kind}/${first} 선행`;
  test(label, { timeout: 20000 }, async t => {
    const scope = fixtureScope(t), row = await scope.fixture(), other = await scope.fixture();
    const deleting = await scope.runner();
    const gate = scope.gate();
    const observed = instrument(scope, async ({ entity, options, row: locked }) => {
      if (first === 'receive' && entity === RepositoryRegistration && options.lock && locked) await gate.stop();
    });
    let receiving;
    if (first === 'delete') {
      const { table, key, id } = parent(parentKind, row);
      await deleting.runner.query(`SELECT 1 FROM ${table} WHERE ${key} = $1 FOR UPDATE`, [id]);
      receiving = observed.run(kind, row);
      await blocked(t, await observed.pid, deleting.pid);
      // 예전 자식→부모 순서였다면 여기 DELETE의 CASCADE가 수신의 요청 잠금과 교착한다.
      successful(await scope.track(deleteParent(deleting.runner, parentKind, row)));
      await deleting.runner.commitTransaction();
      assertDecision(kind, await receiving, 'CONTEXT_MISMATCH');
    } else {
      receiving = observed.run(kind, row);
      await gate.reached;
      const deletion = scope.track(deleteParent(deleting.runner, parentKind, row));
      await blocked(t, deleting.pid, await observed.pid);
      gate.release();
      assertDecision(kind, await receiving, kind === 'progress' ? 'OBSERVED' : 'OK');
      successful(await deletion);
      await deleting.runner.commitTransaction();
    }
    assert.deepEqual(observed.errors, [], '40P01을 포함한 저장 오류가 없어야 한다');
    assert.ok(observed.logs.every(log => log.code !== 'STORAGE_UNAVAILABLE'));
    await assertDeleted(row); await assertUnchanged(other);
  });
}

test('L9 최초 요청 조회 뒤 부모 삭제는 오래된 맥락을 수락하지 않는다', { timeout: 20000 }, async t => {
  for (const parentKind of ['member', 'registration']) await t.test(parentKind, async child => {
    const scope = fixtureScope(child), row = await scope.fixture(), other = await scope.fixture(), gate = scope.gate();
    const observed = instrument(scope, async ({ entity, options }) => {
      if (entity === AnalysisRequest && !options.lock) await gate.stop();
    });
    const kind = parentKind === 'member' ? 'progress' : 'result';
    const receiving = observed.run(kind, row);
    await gate.reached;
    await deleteParent(db.manager, parentKind, row);
    gate.release();
    assertDecision(kind, await receiving, 'CONTEXT_MISMATCH');
    assert.deepEqual(observed.errors, []);
    await assertDeleted(row); await assertUnchanged(other);
  });
});

test('L10 최초 조회 뒤 요청의 부모 참조 변경은 새 부모를 추가로 잠그지 않고 거부한다', { timeout: 20000 }, async t => {
  const scope = fixtureScope(t), row = await scope.fixture(), replacement = await scope.fixture(), other = await scope.fixture(), gate = scope.gate();
  const observed = instrument(scope, async ({ entity, options }) => {
    if (entity === AnalysisRequest && !options.lock) await gate.stop();
  });
  const receiving = observed.run('progress', row);
  await gate.reached;
  // 불변 동의와 FK를 해제하지 않는다. 합성 요청을 지웠다 같은 ID로 새 부모에 생성해
  // 비잠금 읽기와 잠금 읽기의 차이를 실제 커밋된 자료로 만든다.
  await db.transaction(async manager => {
    await manager.delete(AnalysisRequest, { requestId: row.requestId });
    await manager.delete(AnalysisRequest, { requestId: replacement.requestId });
    await insertRequest(manager, { ...replacement, requestId: row.requestId, attemptId: row.attemptId, consentId: row.consentId });
  });
  gate.release();
  assertDecision('progress', await receiving, 'CONTEXT_MISMATCH');
  assert.deepEqual(observed.errors, []);
  assert.equal(observed.locks.filter(lock => lock.entity === MemberAccount).length, 1);
  assert.equal(observed.locks.filter(lock => lock.entity === RepositoryRegistration).length, 1);
  assert.equal(observed.locks.some(lock => lock.entity === RepositoryRegistration && lock.id === replacement.registrationId), false);
  assert.equal(observed.locks.some(lock => lock.entity === AnalysisAttempt), false);
  await assertUnchanged(row); await assertUnchanged(other);
});

test('L11 최초 조회 뒤 현재 시도 변경은 새 시도를 다시 읽고 지난 결과를 거부한다', { timeout: 20000 }, async t => {
  const scope = fixtureScope(t), row = await scope.fixture(), other = await scope.fixture(), gate = scope.gate();
  const observed = instrument(scope, async ({ entity, options }) => {
    if (entity === AnalysisRequest && !options.lock) await gate.stop();
  });
  const receiving = observed.run('result', row);
  await gate.reached;
  const nextAttemptId = randomUUID();
  await db.transaction(async manager => {
    await manager.insert(AnalysisAttempt, { attemptId: nextAttemptId, requestId: row.requestId, sourceMode: 'MOCK' });
    await manager.update(AnalysisRequest, { requestId: row.requestId }, { currentAttemptId: nextAttemptId });
  });
  gate.release();
  assertDecision('result', await receiving, 'STALE_ATTEMPT');
  assert.deepEqual(observed.errors, []);
  for (const attemptId of [row.attemptId, nextAttemptId]) {
    const attempt = await db.manager.findOneByOrFail(AnalysisAttempt, { attemptId });
    assert.equal(attempt.processing, 'QUEUED'); assert.equal(attempt.application, 'NOT_READY');
  }
  assert.equal((await counts(row)).receipts, 0);
  await assertUnchanged(other);
});

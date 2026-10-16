require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { before, after, beforeEach, test } = require('node:test');
const { Body, Controller, Inject, Module, Param, Post } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const { CONTRACT_DIR, event } = require('../helpers/receiver-harness.cjs');
const { AnalysisRequest, AnalysisConsent, AnalysisAttempt, MemberAccount } = require('../../dist/member-analysis/member-analysis.entity');
const { DatabaseReceiverStore } = require('../../dist/analysis-receiver/database-receiver.store');
const { AnalysisReceiver, ReceiverStorageError } = require('../../dist/analysis-receiver/analysis-receiver.service');
const { WorkerMessageValidator } = require('../../dist/analysis-receiver/worker-message.validator');
const { AnalysisRegistrationService, AnalysisRegistrationError, AnalysisReceiptDeliveryError } = require('../../dist/analysis-receiver/analysis-registration.service');
const { AnalysisReceiverModule } = require('../../dist/analysis-receiver/analysis-receiver.module');
const { DevAnalysisInjection } = require('../../dist/analysis-receiver/dev-analysis-injection');
const { AppModule } = require('../../dist/app.module');
const { OwnerCatchStore } = require('../../dist/catches/owner-catch-store');
const { configureApp } = require('../../dist/app.setup');
const { CurrentMemberId } = require('../../dist/auth/auth.decorators');
const { SessionService } = require('../../dist/auth/session.service');
let db;
before(async () => { db = await openTestDataSource(); });
after(async () => { await db?.destroy(); });
beforeEach(async () => { await resetTestDatabase(db); });

function template(file = 'succeeded-one-candidate') {
  return JSON.parse(readFileSync(resolve(__dirname, `../../../worker/fixtures/m1-synthetic/results/${file}.json`), 'utf8'));
}
function fill(value, context) {
  if (Array.isArray(value)) return value.map(v => fill(v, context));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, fill(v, context)]));
  return typeof value === 'string' ? value.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    assert.ok(Object.hasOwn(context, k)); return context[k];
  }) : value;
}
// 접수 API(#138)를 대신한 준비만 한다. 수신 행/보호 판단/Catch는 미리 넣지 않는다.
async function prepare(file, options = {}) {
  const context = { requestId: randomUUID(), attemptId: randomUUID(), consentId: randomUUID(),
    memberId: options.memberId ?? randomUUID(), repositoryId: 'synthetic-repository',
    scopeRevision: 'synthetic-scope', caseId: options.caseId ?? randomUUID() };
  const result = fill(template(file), context);
  result.sourceMode = options.sourceMode ?? 'MOCK';
  if (result.sourceMode === 'LIVE') for (const c of result.candidates) for (const e of c.evidence) {
    e.sourceUrl = 'https://github.com/synthetic-owner/synthetic-repo/commit/synthetic-sha';
  }
  await db.transaction(async manager => {
    await manager.query("INSERT INTO member_account VALUES ($1,$2,'ACTIVE') ON CONFLICT DO NOTHING", [context.memberId, 'fixture:' + context.memberId]);
    await manager.insert(AnalysisRequest, { ...context, currentAttemptId: context.attemptId, submittedAt: new Date(), updatedAt: new Date() });
    await manager.insert(AnalysisConsent, { ...context, accepted: true, noticeRevision: 'fixture', consentedScope: { synthetic: true }, consentedAt: new Date() });
    await manager.insert(AnalysisAttempt, { attemptId: context.attemptId, requestId: context.requestId, sourceMode: result.sourceMode });
  });
  return result;
}
// 필수 공급 경계의 시험 대역. 실제 GitHub 관측/자격정보 공급은 아니다.
function observation(context) {
  return { ownerId: context.memberId, repositoryId: context.repositoryId,
    githubRepository: { owner: 'synthetic-owner', name: 'synthetic-repo' },
    confirmedSourceState: { synthetic: true, visibility: 'PUBLIC' },
    observationProvenance: { synthetic: true, provider: 'test' },
    observedAt: new Date(), appliedRestriction: 'NONE' };
}
function pipeline(observe = async context => observation(context), source = db) {
  const logs = [];
  const receiver = new AnalysisReceiver(new DatabaseReceiverStore(source), new WorkerMessageValidator(CONTRACT_DIR), {
    record: (kind, code) => logs.push({ kind, code }),
  });
  const service = new AnalysisRegistrationService(receiver, source, { observe }, { failed: code => logs.push({ code }) });
  return { service, receiver, logs };
}
const receive = (service, result, ack = async () => {}) => service.receiveResult(result, ack);
const state = result => db.manager.findOneByOrFail(AnalysisAttempt, { attemptId: result.attemptId });
const counts = async () => (await db.query(`SELECT (SELECT count(*)::int FROM catch_asset) AS catches,
  (SELECT count(*)::int FROM catch_evidence) AS evidence, (SELECT count(*)::int FROM candidate_registration) AS registrations,
  (SELECT count(*)::int FROM result_application_record) AS receipts`))[0];

for (const [file, expected] of [['succeeded-one-candidate',1], ['empty',0], ['partial-failed',1], ['failed',0]]) {
  test(`#103 ${file}: 실제 수신 커밋 → Receipt → 실제 B/E 저장`, async () => {
    const result = await prepare(file);
    const { service } = pipeline();
    let acknowledged = false;
    const output = await receive(service, result, async receipt => {
      assert.equal(receipt.disposition, 'ACCEPTED');
      assert.equal((await counts()).receipts, 1); assert.equal((await counts()).catches, 0);
      assert.equal((await state(result)).application, 'PENDING');
      assert.deepEqual((await state(result)).failures, result.failures);
      acknowledged = true;
    });
    assert.ok(acknowledged);
    assert.equal(output.application.registeredCatchIds.length, expected);
    assert.equal(output.application.ownerResultsReady, expected > 0);
    assert.equal((await state(result)).application, 'APPLIED');
    assert.equal((await db.manager.findOneByOrFail(AnalysisRequest, { requestId: result.requestId })).lifecycle, 'CLOSED');
    const replay = await receive(service, { ...result, messageId: randomUUID() });
    assert.equal(replay.receipt.disposition, 'DUPLICATE'); assert.equal(replay.application, undefined);
    assert.equal((await counts()).catches, expected);
  });
}

test('제목 없는 GENERATED 후보도 실제 수신·B 등록 후 APPLIED/CLOSED이며 재전달에서 보존한다', async () => {
  const result = await prepare('succeeded-one-candidate');
  result.candidates[0].title = null;
  assert.equal(result.candidates[0].draft.status, 'GENERATED');
  const { service } = pipeline();
  const output = await receive(service, result);
  assert.equal(output.receipt.disposition, 'ACCEPTED');
  assert.equal(output.application.registeredCatchIds.length, 1);
  assert.equal(output.application.ownerResultsReady, true);
  const attempt = await state(result);
  assert.equal(attempt.application, 'APPLIED');
  assert.equal(attempt.ownerResultsReady, true);
  assert.equal((await db.manager.findOneByOrFail(AnalysisRequest, { requestId: result.requestId })).lifecycle, 'CLOSED');
  const [asset] = await db.query('SELECT * FROM catch_asset');
  assert.equal(asset.title, null);
  assert.equal(asset.draft_status, 'GENERATED');
  assert.equal(asset.draft_content, result.candidates[0].draft.content);
  assert.equal(asset.visibility, 'PRIVATE');
  const ownerCatches = new OwnerCatchStore(db);
  assert.equal((await ownerCatches.get(result.memberId, asset.catch_id)).title, null);
  assert.equal((await ownerCatches.list(result.memberId, {})).items[0].title, null);
  const beforeReplay = await counts();
  const replay = await receive(service, { ...result, messageId: randomUUID() });
  assert.equal(replay.receipt.disposition, 'DUPLICATE');
  assert.equal(replay.application, undefined);
  assert.deepEqual(await counts(), beforeReplay);
  assert.deepEqual(await db.query('SELECT * FROM catch_asset'), [asset]);
});

test('동시 수신 5회에서 수신/등록 하나, 동일 작업 두 후보는 Catch 하나', async () => {
  const result = await prepare('succeeded-one-candidate');
  result.candidates.push({ ...structuredClone(result.candidates[0]), candidateId: 'second-candidate' });
  const { service } = pipeline();
  const outputs = await Promise.all(Array.from({ length: 5 }, () => receive(service, result)));
  assert.equal(outputs.filter(r => r.receipt.disposition === 'ACCEPTED').length, 1);
  assert.equal(outputs.filter(r => r.receipt.disposition === 'DUPLICATE').length, 4);
  assert.equal(outputs.find(r => r.application).application.registeredCatchIds.length, 1);
  assert.equal((await counts()).registrations, 2); assert.equal((await counts()).catches, 1);
});

test('Receipt 전달 실패도 원문 비노출·수신 보존, 재전달로 자동 반영하지 않음', async () => {
  const result = await prepare();
  const { service, logs } = pipeline();
  await assert.rejects(receive(service, result, async () => { throw Error('synthetic-secret-transport'); }), AnalysisReceiptDeliveryError);
  assert.deepEqual(await counts(), { catches: 0, evidence: 0, registrations: 0, receipts: 1 });
  assert.equal((await state(result)).application, 'PENDING');
  assert.ok(logs.some(l => l.code === 'RECEIPT_DELIVERY_FAILED'));
  assert.equal(JSON.stringify(logs).includes('synthetic-secret-transport'), false);
  assert.equal((await receive(service, result)).receipt.disposition, 'DUPLICATE');
  assert.equal((await state(result)).application, 'PENDING');
});

test('맥락/과거 시도/결과 충돌 거부는 기존 DB를 바꾸거나 보호 공급을 조회하지 않음', async () => {
  const result = await prepare();
  // PostgreSQL의 UUID 비교가 입력 대소문자를 받아들여도 수신 맥락은 DB 정본이다.
  await new DatabaseReceiverStore(db).withRequest(result.requestId.toUpperCase(), async tx => {
    assert.equal(tx.snapshot.context.requestId, result.requestId);
  });
  const { service } = pipeline(async () => { throw Error('supplier must not be called'); });
  assert.equal((await receive(service, { ...result, memberId: randomUUID() })).receipt.code, 'CONTEXT_MISMATCH');
  assert.equal((await receive(service, { ...result, attemptId: randomUUID() })).receipt.code, 'STALE_ATTEMPT');
  assert.equal((await counts()).receipts, 0);
  const accepted = await pipeline().receiver.receiveResult(result);
  const before = await state(result);
  assert.equal(accepted.receipt.disposition, 'ACCEPTED');
  const changed = structuredClone(result); changed.candidates[0].title = 'different synthetic content';
  assert.equal((await receive(service, changed)).receipt.code, 'PAYLOAD_CONFLICT');
  assert.deepEqual(await state(result), before);
  assert.equal((await counts()).catches, 0);
});

test('진행 이벤트를 실제 DB에 저장하고 늦은 진행/닫힌 요청/잘못된 UUID를 보존·거부', async () => {
  const result = await prepare();
  const { service } = pipeline();
  const progress = event({ requestId: result.requestId, attemptId: result.attemptId });
  assert.equal(await service.receiveProgress(progress), 'OBSERVED');
  assert.equal((await state(result)).processing, 'RUNNING');
  await receive(service, result);
  assert.equal(await service.receiveProgress(progress), 'TERMINAL_UNCHANGED');
  assert.equal((await receive(service, { ...result, requestId: 'not-a-uuid' })).receipt.code, 'CONTEXT_MISMATCH');
  const closed = await prepare();
  await db.manager.update(AnalysisRequest, { requestId: closed.requestId }, { lifecycle: 'CLOSED' });
  assert.equal((await receive(service, closed)).receipt.code, 'PAYLOAD_CONFLICT');
  assert.equal((await counts()).receipts, 1);
});

for (const [label, supply] of [
  ['부재', async () => null], ['조회 실패', async () => { throw Error('private-source-error'); }],
  ['다른 회원', async c => ({ ...observation(c), ownerId: randomUUID() })],
  ['관측 근거 없음', async c => ({ ...observation(c), observationProvenance: null })],
]) test(`보호 공급 ${label}: NONE/준비 완료로 보정하지 않고 수신 보존·APPLY_FAILED`, async () => {
  const result = await prepare();
  const { service, logs } = pipeline(supply);
  await assert.rejects(receive(service, result), AnalysisRegistrationError);
  assert.deepEqual(await counts(), { catches: 0, evidence: 0, registrations: 0, receipts: 1 });
  assert.equal((await state(result)).application, 'APPLY_FAILED');
  assert.equal((await state(result)).ownerResultsReady, false);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM repository_protection'))[0].n, 0);
  assert.equal(JSON.stringify(logs).includes('private-source-error'), false);
  assert.equal((await receive(service, result)).receipt.disposition, 'DUPLICATE');
  assert.equal((await state(result)).application, 'APPLY_FAILED'); // 자동 복구하지 않는다.
});

test('공급 실패 시 이전 유효 관측 보존, 원본 재공개 관측으로 기존 SOURCE_PRIVATE를 자동 해제하지 않음', async () => {
  const result = await prepare();
  const existing = observation(result);
  await db.query(`INSERT INTO repository_protection (protection_id,owner_id,repository_id,applied_restriction,
    confirmed_source_state,observation_provenance,observed_at) VALUES ($1,$2,$3,'SOURCE_PRIVATE',$4,$5,$6)`,
    [randomUUID(),result.memberId,result.repositoryId,existing.confirmedSourceState,existing.observationProvenance,existing.observedAt]);
  const before = await db.query('SELECT * FROM repository_protection');
  await assert.rejects(receive(pipeline(async () => null).service, result), AnalysisRegistrationError);
  assert.deepEqual(await db.query('SELECT * FROM repository_protection'), before);
  const next = await prepare();
  await db.query(`INSERT INTO repository_protection (protection_id,owner_id,repository_id,applied_restriction,
    confirmed_source_state,observation_provenance,observed_at) VALUES ($1,$2,$3,'SOURCE_PRIVATE',$4,$5,$6)`,
    [randomUUID(),next.memberId,next.repositoryId,existing.confirmedSourceState,existing.observationProvenance,existing.observedAt]);
  const kept = await db.query('SELECT * FROM repository_protection WHERE owner_id=$1', [next.memberId]);
  await receive(pipeline().service, next);
  assert.deepEqual(await db.query('SELECT * FROM repository_protection WHERE owner_id=$1', [next.memberId]), kept);
});

// #314 10월 정책 공급자가 돌려주는 '관측 안 함' NONE과 같은 모양의 합성 값. 이 브랜치에는 그 공급자가 없다.
function notObserved(context) {
  return { ownerId: context.memberId, repositoryId: context.repositoryId,
    githubRepository: { owner: 'synthetic-owner', name: 'synthetic-repo' },
    confirmedSourceState: { observation: 'NOT_OBSERVED', sourceMode: context.sourceMode },
    observationProvenance: { policy: 'OCTOBER_2026_NOT_OBSERVED', description: '10월 관측 안 함(9/28 결정)' },
    observedAt: new Date(), appliedRestriction: 'NONE' };
}
// 앞선 등록이 남긴 보호 기록. 근거·시각을 정책값과 다르게 둬 덮어쓰기를 구분한다.
async function insertProtection(result, restriction) {
  await db.query(`INSERT INTO repository_protection (protection_id,owner_id,repository_id,applied_restriction,
    confirmed_source_state,observation_provenance,observed_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [randomUUID(), result.memberId, result.repositoryId, restriction, { synthetic: true, visibility: 'PRIVATE' },
      { synthetic: true, provider: 'earlier' }, new Date('2026-10-01T00:00:00Z')]);
  return db.query('SELECT * FROM repository_protection');
}

for (const sourceMode of ['MOCK', 'LIVE']) test(`기존 SOURCE_PRIVATE에 '관측 안 함' NONE 공급: 제한·확인 상태·출처·시각을 보존하고 Catch는 PRIVATE 등록(${sourceMode})`, async () => {
  const result = await prepare(undefined, { sourceMode });
  const before = await insertProtection(result, 'SOURCE_PRIVATE');
  const output = await receive(pipeline(async context => notObserved(context)).service, result);
  assert.equal(output.application.registeredCatchIds.length, 1);
  assert.equal(output.application.ownerResultsReady, true);
  assert.equal((await state(result)).application, 'APPLIED');
  assert.deepEqual(await db.query('SELECT * FROM repository_protection'), before);
  const [asset] = await db.query('SELECT catch_id, visibility FROM catch_asset');
  assert.equal(asset.visibility, 'PRIVATE');
  assert.equal((await new OwnerCatchStore(db).get(result.memberId, asset.catch_id)).catchId, asset.catch_id);
});

test("보호 기록이 없으면 '관측 안 함' NONE 기록을 Catch 등록과 함께 만든다", async () => {
  const result = await prepare();
  const supplied = notObserved(result);
  await receive(pipeline(async () => supplied).service, result);
  assert.deepEqual(await db.query(`SELECT owner_id, repository_id, applied_restriction, confirmed_source_state,
    observation_provenance, observed_at, observation_failure FROM repository_protection`), [{
    owner_id: result.memberId, repository_id: result.repositoryId, applied_restriction: 'NONE',
    confirmed_source_state: supplied.confirmedSourceState, observation_provenance: supplied.observationProvenance,
    observed_at: supplied.observedAt, observation_failure: null }]);
  assert.equal((await counts()).catches, 1);
  assert.equal((await state(result)).application, 'APPLIED');
});

for (const previous of [null, 'NONE', 'SOURCE_PRIVATE']) test(`'관측 안 함' 공급 뒤 근거 저장 실패: 보호 기록(${previous ?? '신규'})·Catch·완료를 함께 롤백하고 수신 보존`, async () => {
  const result = await prepare();
  const before = previous ? await insertProtection(result, previous) : [];
  await db.query('ALTER TABLE catch_evidence ADD CONSTRAINT test_reject_evidence CHECK (false) NOT VALID');
  const { service, logs } = pipeline(async context => notObserved(context));
  try { await assert.rejects(receive(service, result), AnalysisRegistrationError); }
  finally { await db.query('ALTER TABLE catch_evidence DROP CONSTRAINT test_reject_evidence'); }
  assert.deepEqual(await db.query('SELECT * FROM repository_protection'), before);
  assert.deepEqual(await counts(), { catches: 0, evidence: 0, registrations: 0, receipts: 1 });
  assert.equal((await state(result)).application, 'APPLY_FAILED');
  assert.ok(logs.some(l => l.code === 'STORAGE_UNAVAILABLE'));
});

test('수신 저장 실패/커밋 실패에서는 Receipt·후보·종결 상태를 만들지 않음', async () => {
  const result = await prepare();
  await db.query(`CREATE FUNCTION test_receipt_commit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'synthetic commit failure'; END; $$`);
  await db.query(`CREATE CONSTRAINT TRIGGER test_receipt_commit AFTER INSERT ON result_application_record
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION test_receipt_commit()`);
  let acknowledged = false;
  try { await assert.rejects(receive(pipeline().service, result, async () => { acknowledged = true; }), ReceiverStorageError); }
  finally {
    await db.query('DROP TRIGGER test_receipt_commit ON result_application_record');
    await db.query('DROP FUNCTION test_receipt_commit()');
  }
  assert.equal(acknowledged, false); assert.equal((await counts()).receipts, 0);
  assert.equal((await state(result)).application, 'NOT_READY');
});

for (const commit of [false, true]) test(`${commit ? '최종 커밋' : '중간 근거 저장'} 실패: 등록·보호·완료 롤백과 수신 보존`, async () => {
  const result = await prepare();
  if (commit) {
    await db.query(`CREATE FUNCTION test_application_commit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'synthetic private commit error'; END; $$`);
    await db.query(`CREATE CONSTRAINT TRIGGER test_application_commit AFTER INSERT ON catch_asset
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION test_application_commit()`);
  } else await db.query('ALTER TABLE catch_evidence ADD CONSTRAINT test_reject_evidence CHECK (false) NOT VALID');
  const { service, logs } = pipeline();
  try { await assert.rejects(receive(service, result), AnalysisRegistrationError); }
  finally {
    if (commit) {
      await db.query('DROP TRIGGER test_application_commit ON catch_asset');
      await db.query('DROP FUNCTION test_application_commit()');
    } else await db.query('ALTER TABLE catch_evidence DROP CONSTRAINT test_reject_evidence');
  }
  assert.deepEqual(await counts(), { catches: 0, evidence: 0, registrations: 0, receipts: 1 });
  assert.equal((await state(result)).application, 'APPLY_FAILED');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM repository_protection'))[0].n, 0);
  assert.ok(logs.some(l => l.code === 'STORAGE_UNAVAILABLE'));
  assert.equal(JSON.stringify(logs).includes('synthetic private commit error'), false);
});

test('실패 기록 자체의 실패도 숨기지 않고 수신 PENDING 보존', async () => {
  const result = await prepare();
  await db.query("ALTER TABLE analysis_attempt ADD CONSTRAINT test_fail_record CHECK (application <> 'APPLY_FAILED') NOT VALID");
  const { service, logs } = pipeline(async () => null);
  try { await assert.rejects(receive(service, result), AnalysisRegistrationError); }
  finally { await db.query('ALTER TABLE analysis_attempt DROP CONSTRAINT test_fail_record'); }
  assert.ok(logs.some(l => l.code === 'FAILURE_RECORDING_FAILED'));
  assert.equal((await state(result)).application, 'PENDING'); assert.equal((await counts()).receipts, 1);
});

for (const address of ['https://github.com/synthetic-owner/other/commit/x',
  'https://github.com/synthetic-owner/synthetic-repo-other/commit/x',
  'https://github.com.evil.invalid/synthetic-owner/synthetic-repo/commit/x',
  'https://github.com/synthetic-owner/synthetic-repo/../other/commit/x',
  'https://github.com/synthetic-owner/synthetic-repo/%2e%2e/other/commit/x']) {
  test('LIVE 다른 저장소/위장 호스트/정규화 우회 근거 주소 거부: ' + address, async () => {
    const result = await prepare(undefined, { sourceMode: 'LIVE' });
    result.candidates[0].evidence[0].sourceUrl = address;
    await assert.rejects(receive(pipeline().service, result), AnalysisRegistrationError);
    assert.equal((await counts()).catches, 0); assert.equal((await counts()).receipts, 1);
    assert.equal((await state(result)).failures.at(-1).code, 'INVALID_INPUT');
  });
}
test('LIVE 연결된 저장소 주소의 근거 허용, MOCK example.invalid 허용', async () => {
  await receive(pipeline().service, await prepare(undefined, { sourceMode: 'LIVE' }));
  await receive(pipeline().service, await prepare());
  assert.equal((await counts()).catches, 2);
});


function gate() {
  let release;
  const promise = new Promise(resolve => { release = resolve; });
  return { promise, release };
}
async function within(promise, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('잠금 단계 시간 초과: ' + label)), 8000);
    })]);
  } finally { clearTimeout(timer); }
}
// 실제 트랜잭션/SQL은 그대로 실행하고, 잠금 획득 직후의 진행 시점만 제어한다.
function lockObservedSource(onQuery, errors) {
  const source = Object.create(db);
  source.transaction = (...args) => {
    const work = args.pop();
    return db.transaction(...args, async manager => {
      const runner = manager.queryRunner;
      const originalQuery = runner.query;
      const query = originalQuery.bind(runner);
      const [{ pid }] = await query('SELECT pg_backend_pid() AS pid');
      await query("SET LOCAL statement_timeout = '10000ms'");
      runner.query = async (...queryArgs) => {
        try {
          const value = await query(...queryArgs);
          await onQuery(queryArgs[0], pid);
          return value;
        } catch (error) {
          if (error.driverError?.code) errors.push(error.driverError.code);
          throw error;
        }
      };
      try { return await work(manager); }
      finally { runner.query = originalQuery; }
    });
  };
  return source;
}
async function waitForBlock(waitingPid, blockingPid) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const [{ blocked }] = await db.query('SELECT $2::int = ANY(pg_blocking_pids($1::int)) AS blocked',
      [waitingPid, blockingPid]);
    if (blocked) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.fail('공개 경로가 반영 트랜잭션의 보호 잠금을 실제로 기다리지 않았습니다.');
}

test('기존 Catch 공개와 동일 작업 새 결과 반영은 잠금 경쟁에도 둘 다 커밋한다', async () => {
  const original = await prepare();
  const first = await receive(pipeline().service, original);
  const [catchId] = first.application.registeredCatchIds;
  await new OwnerCatchStore(db).confirm(original.memberId, catchId,
    { workFactsConfirmed: true, contributionConfirmed: true });
  const [beforeCatch] = await db.query('SELECT * FROM catch_asset WHERE catch_id=$1', [catchId]);
  const beforeEvidence = await db.query('SELECT * FROM catch_evidence WHERE catch_id=$1 ORDER BY catch_evidence_id', [catchId]);
  const next = await prepare(undefined, { memberId: original.memberId });
  next.candidates[0].workIdentity = original.candidates[0].workIdentity;
  next.candidates[0].title = '기존 본문을 바꾸지 않는 새 합성 후보';
  const catchLocked = gate(); const protectionLocked = gate(); const resumeApplication = gate();
  const errors = [];
  const visibilitySource = lockObservedSource(async (sql, pid) => {
    if (/FOR (?:NO KEY )?UPDATE OF c\b/.test(sql)) {
      catchLocked.release(pid);
      await within(protectionLocked.promise, '반영의 보호 잠금');
    }
  }, errors);
  const applicationSource = lockObservedSource(async (sql, pid) => {
    if (/repository_protection/.test(sql) && /FOR UPDATE/.test(sql)) {
      protectionLocked.release(pid);
      await within(resumeApplication.promise, '공개의 실제 보호 잠금 대기');
    }
  }, errors);
  const pending = [];
  try {
    const visibility = new OwnerCatchStore(visibilitySource).setVisibility(original.memberId, catchId, { visibility: 'PUBLIC' });
    pending.push(visibility);
    // 거부가 발생해도 finally에서 수집할 때까지 unhandled rejection을 만들지 않는다.
    visibility.catch(() => {});
    const visibilityPid = await within(catchLocked.promise, '공개의 Catch 잠금');
    const application = receive(pipeline(async context => observation(context), applicationSource).service, next);
    pending.push(application); application.catch(() => {});
    const applicationPid = await within(protectionLocked.promise, '반영의 보호 잠금');
    await waitForBlock(visibilityPid, applicationPid);
    resumeApplication.release();
    const outcomes = await within(Promise.allSettled(pending), '두 호출의 최종 커밋');
    assert.deepEqual(errors, [], '실제 SQL에서 교착/잠금 시간 초과가 없어야 한다');
    assert.deepEqual(outcomes.map(value => value.status), ['fulfilled', 'fulfilled']);
    const applied = outcomes[1].value.application;
    assert.deepEqual(applied.registeredCatchIds, [catchId]);
    assert.equal(applied.registrations[0].disposition, 'EXISTING');
    assert.equal(applied.ownerResultsReady, true);
    assert.equal((await state(next)).application, 'APPLIED');
    assert.equal((await db.manager.findOneByOrFail(AnalysisRequest, { requestId: next.requestId })).lifecycle, 'CLOSED');
    assert.deepEqual(await counts(), { catches: 1, evidence: beforeEvidence.length, registrations: 2, receipts: 2 });
    assert.deepEqual((await db.query('SELECT * FROM catch_asset WHERE catch_id=$1', [catchId]))[0],
      { ...beforeCatch, visibility: 'PUBLIC' });
    assert.deepEqual(await db.query('SELECT * FROM catch_evidence WHERE catch_id=$1 ORDER BY catch_evidence_id', [catchId]), beforeEvidence);
    const [protection] = await db.query('SELECT applied_restriction, confirmed_source_state FROM repository_protection WHERE owner_id=$1 AND repository_id=$2',
      [next.memberId, next.repositoryId]);
    assert.equal(protection.applied_restriction, 'NONE');
    assert.deepEqual(protection.confirmed_source_state, observation(next).confirmedSourceState);
    assert.equal((await receive(pipeline().service, next)).receipt.disposition, 'DUPLICATE');
    assert.equal((await counts()).catches, 1);
  } finally {
    protectionLocked.release(); resumeApplication.release();
    await Promise.allSettled(pending);
  }
});

// 네트워크 재현 전용 컨트롤러. 운영 worker/회원 API를 추가하지 않는다.
class InjectionProbe {
  constructor(injection) { this.injection = injection; }
  inject(memberId, requestId, body) { return this.injection.inject(memberId, requestId, body.kind, body.template, body.caseId); }
}
Controller('__test/receiver-db')(InjectionProbe);
Inject(DevAnalysisInjection)(InjectionProbe, undefined, 0);
Post(':requestId')(InjectionProbe.prototype, 'inject', Object.getOwnPropertyDescriptor(InjectionProbe.prototype, 'inject'));
CurrentMemberId()(InjectionProbe.prototype, 'inject', 0);
Param('requestId')(InjectionProbe.prototype, 'inject', 1);
Body()(InjectionProbe.prototype, 'inject', 2);

test('실제 HTTP/Auth/DB/E/B 조립: 인증·소유권, 정상·중복·저장 실패와 입력/토큰 비노출', async t => {
  const settings = { NODE_ENV: 'test', DEV_ANALYSIS_INJECTION_ENABLED: 'true', AUTH_JWT_SECRET: randomBytes(32).toString('hex'),
    AUTH_ACCESS_TOKEN_TTL_SECONDS: '900', AUTH_WEB_ORIGIN: 'https://catchu.example',
    LINK_GRANT_SECRET: randomBytes(32).toString('hex'), SHARE_LINK_WEB_BASE_URL: 'https://catchu.example' };
  const previous = Object.fromEntries(Object.keys(settings).map(k => [k, process.env[k]]));
  Object.assign(process.env, settings);
  let app;
  const logs = [];
  const logger = Object.fromEntries(['log','error','warn','debug','verbose','fatal'].map(k => [k, (...args) => logs.push(JSON.stringify(args))]));
  t.after(async () => {
    try { await app?.close(); } finally { for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    } }
  });
  class TestModule {}
  Module({ imports: [AppModule, AnalysisReceiverModule.registerDatabase({ contractDirectory: CONTRACT_DIR,
    observations: { observe: async context => observation(context) } })], controllers: [InjectionProbe] })(TestModule);
  app = await configureApp(await NestFactory.create(TestModule, { logger, abortOnError: false }));
  await app.listen(0,'127.0.0.1');
  const url = await app.getUrl();
  const result = await prepare();
  // #250의 DB Guard를 통과한 뒤 수신 소유권을 검사하도록 실제 회원·세션을 준비한다.
  const { token, other } = await db.transaction(async manager => {
    const otherMemberId = randomUUID();
    await manager.insert(MemberAccount, { memberId: otherMemberId,
      identityReference: 'receiver-other:' + otherMemberId, accountState: 'ACTIVE' });
    const sessions = app.get(SessionService);
    return {
      token: (await sessions.create(manager, result.memberId)).access.accessToken,
      other: (await sessions.create(manager, otherMemberId)).access.accessToken,
    };
  });
  const post = (r, auth) => fetch(`${url}/v1/__test/receiver-db/${r.requestId}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    body: JSON.stringify({ kind: 'Result', template: r, caseId: 'http-test' }), signal: AbortSignal.timeout(5000),
  });
  assert.equal((await post(result)).status, 401);
  assert.equal((await post(result, other)).status, 404);
  const response = await post(result, token);
  assert.equal(response.status, 201); assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const first = await response.json();
  assert.equal(first.application.registeredCatchIds.length, 1);
  const firstIds = await db.query('SELECT catch_id FROM catch_asset');
  assert.equal((await (await post(result, token)).json()).receipt.disposition, 'DUPLICATE');
  assert.deepEqual(await db.query('SELECT catch_id FROM catch_asset'), firstIds);
  const failed = await prepare(undefined, { memberId: result.memberId });
  await db.query('ALTER TABLE catch_evidence ADD CONSTRAINT test_http_fail CHECK (false) NOT VALID');
  let failedResponse;
  try { failedResponse = await post(failed, token); }
  finally { await db.query('ALTER TABLE catch_evidence DROP CONSTRAINT test_http_fail'); }
  assert.equal(failedResponse.status, 500);
  assert.deepEqual(await db.query('SELECT catch_id FROM catch_asset'), firstIds);
  assert.equal((await state(failed)).application, 'APPLY_FAILED'); assert.equal((await counts()).receipts, 2);
  const body = JSON.stringify(await failedResponse.json());
  for (const value of [token,other,'test_http_fail',failed.candidates[0].title]) {
    assert.equal((logs.join('\n') + body).includes(value), false);
  }
});

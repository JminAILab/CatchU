require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { resolve, join } = require('node:path');
const { before, after, beforeEach, test } = require('node:test');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const { AnalysisRequest, AnalysisAttempt, MemberAccount } = require('../../dist/member-analysis/member-analysis.entity');
const { ResultApplicationRecord } = require('../../dist/result-application/result-application.entity');
const { ResultApplicationService, ApplicationFailureRecordingError } = require('../../dist/result-application/result-application.service');
const { registerCandidates, CatchRegistrationContextError } = require('../../dist/catches/registration-service');
const { CatchRegistrationInputError } = require('../../dist/catches/registration-input-error');
const { prepare: prepareReceipt } = require('../support/result-application-fixture.cjs');
const { ShareLink } = require('../../dist/share-links/share-link.entity');
const { CreateShareLink1790745895865 } = require('../../dist/database/migrations/1790745895865-CreateShareLink');
const fixtureDir = resolve(__dirname, '../../../worker/fixtures/m1-synthetic');
const read = path => JSON.parse(readFileSync(join(fixtureDir,path),'utf8'));
let db;
before(async () => { db = await openTestDataSource(); });
after(async () => { await db?.destroy(); });
beforeEach(async () => { await resetTestDatabase(db); });

// #139 제외: 수신 이후의 정본을 시험 준비 단계에서 별도로 저장·커밋한다.
// 수신 검사·중복 판정은 기존 #164 구현을 재작성하지 않는다.
async function prepare(file = 'results/succeeded-one-candidate.json', options = {}) {
  const input = await prepareReceipt(db,file,options);
  // 명시적인 합성 보호 관찰. 실제 보호 판단 공급의 완료를 뜻하지 않는다.
  if (options.protection !== null) await db.query(`INSERT INTO repository_protection
    (protection_id,owner_id,repository_id,applied_restriction,confirmed_source_state,observation_provenance,observed_at)
    VALUES ($1,$2,$3,'NONE','{"synthetic":true}','{"fixture":true}',now()) ON CONFLICT DO NOTHING`,
    [randomUUID(),input.result.memberId,input.result.repositoryId]);
  return input;
}
function combinedService(source, register = registerCandidates) {
  return new ResultApplicationService(source, { register, classifyError(error) {
    if (error instanceof CatchRegistrationInputError || error instanceof CatchRegistrationContextError) return error.reason;
    return undefined;
  } });
}
const apply = input => combinedService(db).apply(input);
const state = input => db.manager.findOneByOrFail(AnalysisAttempt, { attemptId: input.result.attemptId });
const counts = async () => (await db.query(`SELECT (SELECT count(*)::int FROM catch_asset) AS catches,
  (SELECT count(*)::int FROM catch_evidence) AS evidence, (SELECT count(*)::int FROM candidate_registration) AS registrations,
  (SELECT count(*)::int FROM result_application_record) AS receipts`))[0];

for (const [file, expected] of [['succeeded-one-candidate',1], ['empty',0], ['partial-failed',1], ['failed',0]]) {
  test('#103 ' + file + ': 실제 B 저장·E 완료·종결을 함께 커밋하고 재반영 ID 유지', async () => {
    const input = await prepare('results/' + file + '.json');
    const before = await db.manager.findOneByOrFail(ResultApplicationRecord, { applicationRecordId: input.metadata.applicationRecordId });
    const first = await apply(input);
    const again = await apply(input);
    assert.deepEqual(again, first);
    assert.equal(first.registeredCatchIds.length, expected);
    assert.equal(first.ownerResultsReady, expected > 0);
    const attempt = await state(input);
    assert.equal(attempt.processing, input.result.outcome);
    assert.equal(attempt.application, 'APPLIED');
    assert.deepEqual(attempt.failures, input.result.failures);
    assert.equal((await db.manager.findOneByOrFail(AnalysisRequest, { requestId: input.result.requestId })).lifecycle, 'CLOSED');
    assert.deepEqual(await db.manager.findOneByOrFail(ResultApplicationRecord, { applicationRecordId: before.applicationRecordId }), before);
    assert.equal((await counts()).catches, expected);
    for (const asset of await db.query('SELECT * FROM catch_asset')) {
      assert.equal(asset.visibility, 'PRIVATE'); assert.equal(asset.source_mode, 'MOCK'); assert.ok(asset.title);
    }
  });
}

test('같은 결과 동시 반영은 한 묶음만 저장하고 같은 catchId로 수렴', async () => {
  const input = await prepare();
  const results = await Promise.all(Array.from({ length: 5 }, () => apply(input)));
  for (const result of results) assert.deepEqual(result, results[0]);
  assert.deepEqual(await counts(), { catches: 1, evidence: input.result.candidates[0].evidence.length, registrations: 1, receipts: 1 });
});

test('같은 작업 두 후보는 Catch 하나·등록 연결 둘이며 기존 본문과 공개 상태 유지', async () => {
  const entry = read('cases.json').cases.find(c => c.caseId === 'two-candidates-same-work');
  const input = await prepare(entry.messages[0].file);
  const first = await apply(input);
  assert.equal(first.registrations.length, 2);
  assert.equal(first.registeredCatchIds.length, 1);
  await db.query("UPDATE catch_asset SET visibility='PUBLIC', title='기존 제목'");
  const preserved = await db.query('SELECT * FROM catch_asset');
  const again = await apply(input);
  assert.deepEqual(again, first);
  const next = await prepare(undefined, { memberId: input.result.memberId, change: r => {
    r.candidates[0].workIdentity = input.result.candidates[0].workIdentity;
  } });
  assert.deepEqual((await apply(next)).registeredCatchIds, first.registeredCatchIds);
  assert.deepEqual(await db.query('SELECT * FROM catch_asset'), preserved);
});

test('중간 근거 저장 실패는 B 전체 롤백·수신 보존 후 별도 APPLY_FAILED, 명시적 재반영으로 복구', async () => {
  const input = await prepare();
  await db.query('ALTER TABLE catch_evidence ADD CONSTRAINT test_reject_evidence CHECK (false) NOT VALID');
  try { await assert.rejects(apply(input), e => e.code === '23514'); }
  finally { await db.query('ALTER TABLE catch_evidence DROP CONSTRAINT test_reject_evidence'); }
  assert.deepEqual(await counts(), { catches: 0, evidence: 0, registrations: 0, receipts: 1 });
  const failed = await state(input);
  assert.equal(failed.application, 'APPLY_FAILED');
  assert.equal(failed.ownerResultsReady, false);
  assert.equal(failed.failures.at(-1).code, 'STORAGE_UNAVAILABLE');
  assert.equal((await db.manager.findOneByOrFail(AnalysisRequest, { requestId: input.result.requestId })).lifecycle, 'ACTIVE');
  assert.equal((await apply(input)).ownerResultsReady, true);
});

test('지연 FK 커밋 실패까지 성공을 반환하지 않고 전체 롤백·실패 기록', async () => {
  const input = await prepare();
  const service = combinedService(db, async (m, value) => {
    const result = await registerCandidates(m, value);
    await m.update(AnalysisRequest, { requestId: value.requestId }, { consentId: randomUUID() });
    return result;
  });
  await assert.rejects(service.apply(input), e => e.code === '23503');
  assert.deepEqual(await counts(), { catches: 0, evidence: 0, registrations: 0, receipts: 1 });
  assert.equal((await state(input)).application, 'APPLY_FAILED');
});

test('B 입력 거부·맥락 거부와 DB 실패를 기존 오류 타입으로 구분', async () => {
  const bad = await prepare(undefined, { change: r => { r.candidates[0].subjectContribution = ''; } });
  await assert.rejects(apply(bad), e => e instanceof CatchRegistrationInputError && e.reason === 'INVALID_INPUT');
  assert.equal((await state(bad)).failures.at(-1).code, 'INVALID_INPUT');
  const missing = await prepare(undefined, { protection: null });
  await assert.rejects(apply(missing), e => e instanceof CatchRegistrationContextError && e.reason === 'CATCH_NOT_READY');
  assert.equal((await state(missing)).application, 'APPLY_FAILED');
  assert.equal((await counts()).catches, 0);
});

test('최초 보호 조회 실패만 있는 경우 실제 B 전체 롤백·수신 보존 후 E가 APPLY_FAILED를 기록한다', async () => {
  const input = await prepare(undefined, { protection: null });
  await db.query(`INSERT INTO repository_protection
    (protection_id, owner_id, repository_id, applied_restriction, observation_failure)
    VALUES ($1,$2,$3,'NONE',$4::jsonb)`,
  [randomUUID(), input.result.memberId, input.result.repositoryId,
    JSON.stringify({ synthetic: true, code: 'OBSERVATION_FAILED' })]);
  const receipt = await db.manager.findOneByOrFail(ResultApplicationRecord, {
    applicationRecordId: input.metadata.applicationRecordId,
  });
  const protectionBefore = await db.query('SELECT * FROM repository_protection');

  await assert.rejects(apply(input), e => e instanceof CatchRegistrationContextError && e.reason === 'CATCH_NOT_READY');

  assert.deepEqual(await counts(), { catches: 0, evidence: 0, registrations: 0, receipts: 1 });
  const failed = await state(input);
  assert.equal(failed.application, 'APPLY_FAILED');
  assert.equal(failed.ownerResultsReady, false);
  assert.equal(failed.processing, input.result.outcome);
  assert.equal(failed.failures.at(-1).code, 'CATCH_NOT_READY');
  assert.equal((await db.manager.findOneByOrFail(AnalysisRequest, { requestId: input.result.requestId })).lifecycle, 'ACTIVE');
  assert.deepEqual(await db.manager.findOneByOrFail(ResultApplicationRecord, {
    applicationRecordId: receipt.applicationRecordId,
  }), receipt);
  assert.deepEqual(await db.query('SELECT * FROM repository_protection'), protectionBefore);
});

test('일부 후보만 반환하면 전체 완료로 처리하지 않음', async () => {
  const input = await prepare();
  const service = combinedService(db, async (m, value) => { await registerCandidates(m, value); return []; });
  await assert.rejects(service.apply(input), e => e.reason === 'REGISTRATION_MISMATCH');
  assert.deepEqual(await counts(), { catches: 0, evidence: 0, registrations: 0, receipts: 1 });
  assert.equal((await state(input)).application, 'APPLY_FAILED');
});

test('수신 원문 지문·동의 범위 불일치는 기존 기록을 바꾸지 않음', async () => {
  const input = await prepare();
  const before = await state(input);
  const changed = structuredClone(input); changed.result.candidates[0].title = '다른 내용';
  await assert.rejects(apply(changed), e => e.reason === 'CONTEXT_MISMATCH');
  const scope = structuredClone(input); scope.result.scopeRevision = 'different';
  await assert.rejects(apply(scope), e => e.reason === 'CONTEXT_MISMATCH');
  assert.deepEqual(await state(input), before);
});

test('E 완료 저장 실패도 전체 롤백하고 기존 Catch·다른 완료 기록·두 수신 기록을 보존', async () => {
  const old = await prepare();
  await apply(old);
  const assets = await db.query('SELECT * FROM catch_asset');
  const oldState = await state(old);
  const input = await prepare(undefined, { memberId: old.result.memberId, change: r => {
    r.candidates[0].workIdentity = 'another-work';
  } });
  const receipt = await db.manager.findOneByOrFail(ResultApplicationRecord, { applicationRecordId: input.metadata.applicationRecordId });
  await db.query("ALTER TABLE analysis_attempt ADD CONSTRAINT test_reject_completion CHECK (application <> 'APPLIED') NOT VALID");
  try { await assert.rejects(apply(input), e => e.code === '23514'); }
  finally { await db.query('ALTER TABLE analysis_attempt DROP CONSTRAINT test_reject_completion'); }
  assert.deepEqual(await db.query('SELECT * FROM catch_asset'), assets);
  assert.deepEqual(await state(old), oldState);
  assert.equal((await state(input)).application, 'APPLY_FAILED');
  assert.equal((await counts()).registrations, 1);
  assert.equal((await counts()).receipts, 2);
  assert.deepEqual(await db.manager.findOneByOrFail(ResultApplicationRecord, { applicationRecordId: receipt.applicationRecordId }), receipt);
});

test('알 수 없는 반영 예외는 DB 오류로 단정하지 않고 원래 예외를 보존', async () => {
  const input = await prepare();
  const original = new Error('test-only-private-detail');
  await assert.rejects(combinedService(db, async () => { throw original; }).apply(input), e => e === original);
  const failed = await state(input);
  assert.equal(failed.failures.at(-1).code, 'APPLICATION_FAILED');
  assert.equal(JSON.stringify(failed.failures).includes(original.message), false);
});

test('E 수신 기록의 시도 유일성·복합 FK·지문 형식·엔티티 매핑을 검증', async () => {
  const input = await prepare();
  const receipt = await db.manager.findOneByOrFail(ResultApplicationRecord, { applicationRecordId: input.metadata.applicationRecordId });
  await assert.rejects(db.manager.insert(ResultApplicationRecord, { ...receipt, applicationRecordId: randomUUID() }), e => e.code === '23505');
  await assert.rejects(db.manager.update(ResultApplicationRecord, { applicationRecordId: receipt.applicationRecordId }, { requestId: randomUUID() }), e => e.code === '23503');
  await assert.rejects(db.manager.update(ResultApplicationRecord, { applicationRecordId: receipt.applicationRecordId }, { payloadFingerprint: 'unsafe-raw-value' }), e => e.code === '23514');
  const schema = 'e_metadata_' + randomUUID().replaceAll('-', '');
  await db.query('CREATE SCHEMA "' + schema + '"');
  const foundation = require('../../dist/member-analysis/member-analysis.entity');
  const { CreateMemberAnalysisFoundation1790500000000 } = require('../../dist/database/migrations/1790500000000-CreateMemberAnalysisFoundation');
  const { CreateResultApplicationRecord1790550000000 } = require('../../dist/database/migrations/1790550000000-CreateResultApplicationRecord');
  const isolated = await openTestDataSource({ schema, extra: { options: '-c search_path=' + schema },
    entities: [...Object.values(foundation).filter(v => typeof v === 'function'), ResultApplicationRecord, ShareLink],
    migrations: [CreateMemberAnalysisFoundation1790500000000, CreateResultApplicationRecord1790550000000, CreateShareLink1790745895865] });
  try {
    assert.deepEqual((await isolated.runMigrations()).map(m => m.name),
      ['CreateMemberAnalysisFoundation1790500000000', 'CreateResultApplicationRecord1790550000000', 'CreateShareLink1790745895865']);
    assert.equal((await isolated.query('SELECT tablename FROM pg_tables WHERE schemaname=$1', [schema])).length, 10);
    const diff = await isolated.driver.createSchemaBuilder().log();
    assert.deepEqual(diff.upQueries.map(q => q.query), []);
  } finally { await isolated.destroy(); await db.query('DROP SCHEMA "' + schema + '" CASCADE'); }
});

test('실패 기록 자체의 실패는 원래 반영 실패와 함께 전달하며 수신·기존 자료 보존', async () => {
  const input = await prepare();
  await db.query(`ALTER TABLE analysis_attempt ADD CONSTRAINT test_fail_record CHECK (application <> 'APPLY_FAILED') NOT VALID`);
  try {
    const service = combinedService(db, async () => { throw new CatchRegistrationInputError('INVALID_INPUT', 'title'); });
    await assert.rejects(service.apply(input), e => e instanceof ApplicationFailureRecordingError &&
      e.applicationFailure instanceof CatchRegistrationInputError && e.recordingFailure.code === '23514');
  } finally { await db.query('ALTER TABLE analysis_attempt DROP CONSTRAINT test_fail_record'); }
  assert.equal((await state(input)).application, 'PENDING');
  assert.equal((await counts()).receipts, 1);
});

test('늦은 실패 기록 전에 다른 실행이 성공하면 APPLIED·CLOSED를 보존', async () => {
  const input = await prepare();
  let calls = 0;
  const gatedSource = { async transaction(...args) {
    calls++;
    if (calls === 2) await apply(input); // 실패 rollback 후 다른 인스턴스가 완료한 상황.
    return db.transaction(...args);
  } };
  const service = combinedService(gatedSource, async () => { throw new Error('test failure'); });
  await assert.rejects(service.apply(input), /test failure/);
  assert.equal((await state(input)).application, 'APPLIED');
  assert.equal((await counts()).catches, 1);
});

test('늦은 실패 기록은 새 현재 시도로 옮겨간 요청을 덮어쓰지 않음', async () => {
  const input = await prepare();
  let calls = 0;
  const newAttemptId = randomUUID();
  const gatedSource = { async transaction(...args) {
    if (++calls === 2) await db.transaction(async m => {
      await m.insert(AnalysisAttempt, { attemptId: newAttemptId, requestId: input.result.requestId, sourceMode: 'MOCK' });
      await m.update(AnalysisRequest, { requestId: input.result.requestId }, { currentAttemptId: newAttemptId });
    });
    return db.transaction(...args);
  } };
  await assert.rejects(combinedService(gatedSource, async () => { throw new Error('test failure'); }).apply(input));
  assert.equal((await state(input)).application, 'PENDING');
  assert.equal((await db.manager.findOneByOrFail(AnalysisAttempt, { attemptId: newAttemptId })).application, 'NOT_READY');
});

test('#104→E→B 실제 마이그레이션 적용·역순 되돌리기에서 선행 데이터 보존', async () => {
  const schema = 'e_application_' + randomUUID().replaceAll('-', '');
  await db.query('CREATE SCHEMA "' + schema + '"');
  const isolated = await openTestDataSource({ schema, extra: { options: '-c search_path=' + schema } });
  try {
    const migrations = await isolated.runMigrations();
    assert.deepEqual(migrations.map(m => m.name), ['CreateMemberAnalysisFoundation1790500000000',
      'CreateResultApplicationRecord1790550000000', 'CreateCatchAssets1790600000000', 'CreateRepositoryProtection1790601000000', 'CreateShareLink1790745895865',
      'CreateAuthSessions1791648335731', 'AllowNullCatchTitle1791784385918']);
    assert.equal((await isolated.query('SELECT tablename FROM pg_tables WHERE schemaname=$1', [schema])).length, 16);
    assert.deepEqual((await isolated.driver.createSchemaBuilder().log()).upQueries.map(q => q.query), []);
    const memberId = randomUUID();
    await isolated.manager.insert(MemberAccount, { memberId, identityReference: 'preserve', accountState: 'ACTIVE' });
    await isolated.undoLastMigration(); // B 제목 null 허용
    await isolated.undoLastMigration(); // A 회원 세션·Refresh 기록
    assert.equal((await isolated.query("SELECT to_regclass('auth_session') AS name"))[0].name, null);
    assert.equal((await isolated.query("SELECT to_regclass('session_refresh_token') AS name"))[0].name, null);
    assert.equal(await isolated.manager.count(MemberAccount), 1);
    await isolated.undoLastMigration(); // C 공유 링크 및 멱등 FK
    assert.equal((await isolated.query("SELECT to_regclass('share_link') AS name"))[0].name,null);
    await isolated.undoLastMigration(); await isolated.undoLastMigration(); // B 보호 판단·등록 테이블
    assert.equal((await isolated.query("SELECT to_regclass('result_application_record') AS table_name"))[0].table_name, 'result_application_record');
    await isolated.undoLastMigration();
    assert.equal(await isolated.manager.count(MemberAccount), 1);
    assert.equal((await isolated.query("SELECT to_regclass('result_application_record') AS name"))[0].name,null);
    await isolated.undoLastMigration(); // 회원·분석 기반
    assert.deepEqual((await isolated.query('SELECT tablename FROM pg_tables WHERE schemaname=$1',[schema])).map(r=>r.tablename),['migrations']);
    await isolated.runMigrations();
    assert.deepEqual((await isolated.driver.createSchemaBuilder().log()).upQueries.map(q => q.query), []);
    const fk = await isolated.query(`SELECT confrelid::regclass::text AS target FROM pg_constraint
      WHERE conrelid='candidate_registration'::regclass AND conname='fk_candidate_registration_application_record_id'`);
    assert.equal(fk[0].target, 'result_application_record');
  } finally { await isolated.destroy(); await db.query('DROP SCHEMA "' + schema + '" CASCADE'); }
});

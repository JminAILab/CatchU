require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { before, after, beforeEach, test } = require('node:test');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const { prepare } = require('../support/result-application-fixture.cjs');
const { AnalysisRequest, AnalysisAttempt, MemberAccount } = require('../../dist/member-analysis/member-analysis.entity');
const { ResultApplicationRecord } = require('../../dist/result-application/result-application.entity');
const { ResultApplicationService, ResultApplicationContextError, ApplicationFailureRecordingError } = require('../../dist/result-application/result-application.service');
const foundation = require('../../dist/member-analysis/member-analysis.entity');
const { CreateMemberAnalysisFoundation1790500000000 } = require('../../dist/database/migrations/1790500000000-CreateMemberAnalysisFoundation');
const { CreateResultApplicationRecord1790550000000 } = require('../../dist/database/migrations/1790550000000-CreateResultApplicationRecord');
const { ShareLink } = require('../../dist/share-links/share-link.entity');
const { CreateShareLink1790745895865 } = require('../../dist/database/migrations/1790745895865-CreateShareLink');
const { AddAnalysisRequestHistoryIndex1792640486167 } = require('../../dist/database/migrations/1792640486167-AddAnalysisRequestHistoryIndex');
const { CascadeMemberAnalysisOnDelete1792817978011 } = require('../../dist/database/migrations/1792817978011-CascadeMemberAnalysisOnDelete');
const { CascadeResultApplicationOnDelete1792817978012 } = require('../../dist/database/migrations/1792817978012-CascadeResultApplicationOnDelete');
// ShareLink는 회원 멱등 기록의 실제 FK 참조이며 B 등록 대역과는 별개다.
// 이력 인덱스(#140)는 회원·분석 기반 엔티티에 선언되어 엔티티 DDL 대조에 필요하다.
const entities = [...Object.values(foundation).filter(v => typeof v === 'function'),ResultApplicationRecord,ShareLink];
const migrations = [CreateMemberAnalysisFoundation1790500000000,CreateResultApplicationRecord1790550000000,CreateShareLink1790745895865,
  AddAnalysisRequestHistoryIndex1792640486167,CascadeMemberAnalysisOnDelete1792817978011,CascadeResultApplicationOnDelete1792817978012];
const selfSchema = 'e_self_' + randomUUID().replaceAll('-','');
let db, schemaOwner;
before(async () => {
  schemaOwner = await openTestDataSource();
  await schemaOwner.query('CREATE SCHEMA "'+selfSchema+'"');
  db = await openTestDataSource({schema:selfSchema,entities,migrations,
    extra:{options:'-c search_path='+selfSchema+' -c TimeZone=UTC'}});
  await db.runMigrations();
  // 명시적인 등록 저장 대역: 실제 B 테이블/판정/중복 알고리즘을 제공하는 코드가 아니다.
  await db.query(`CREATE TABLE registration_probe (id uuid PRIMARY KEY, title text NOT NULL)`);
  await db.query(`CREATE TABLE candidate_registration (
    application_record_id uuid REFERENCES result_application_record(application_record_id), candidate_id text,
    catch_id uuid REFERENCES registration_probe(id), disposition text NOT NULL, owner_view_ready boolean NOT NULL,
    PRIMARY KEY(application_record_id,candidate_id))`);
});
after(async () => {
  try { await db?.destroy(); await schemaOwner?.query('DROP SCHEMA "'+selfSchema+'" CASCADE'); }
  finally { await schemaOwner?.destroy(); }
});
beforeEach(async () => { await resetTestDatabase(db); });

const readStored = (m, id) => m.query(`SELECT candidate_id AS "candidateId", catch_id AS "catchId",
  disposition, owner_view_ready AS "ownerViewReady" FROM candidate_registration WHERE application_record_id=$1`, [id]);
// 전달받은 manager로만 대역 저장. 후보 적합성·작업 동일성·보호 판단의 실제 B 구현은 검사하지 않는다.
async function storeProbe(manager, input, ready = true) {
  assert.equal(manager.queryRunner.isTransactionActive, true);
  const saved = await readStored(manager, input.applicationRecordId);
  if (saved.length > 0) return saved;
  const results = [];
  for (const candidate of input.candidates) {
    const id = randomUUID();
    await manager.query('INSERT INTO registration_probe VALUES($1,$2)', [id,candidate.title]);
    await manager.query('INSERT INTO candidate_registration VALUES($1,$2,$3,$4,$5)',
      [input.applicationRecordId,candidate.candidateId,id,'CREATED',ready]);
    results.push({ candidateId:candidate.candidateId, catchId:id, disposition:'CREATED', ownerViewReady:ready });
  }
  return results;
}
function service(register = storeProbe, classifyError = () => undefined, source = db) {
  return new ResultApplicationService(source, { register, classifyError });
}
const state = input => db.manager.findOneByOrFail(AnalysisAttempt, { attemptId: input.result.attemptId });
const count = table => db.query('SELECT count(*)::int AS n FROM ' + table).then(rows => rows[0].n);

for (const [file, ready] of [['succeeded-one-candidate',true], ['empty',false], ['partial-failed',true], ['failed',false]]) {
  test('E 자체 #103 ' + file + ': 등록 저장 대역과 E 완료를 함께 커밋·재반영', async () => {
    const input = await prepare(db, 'results/' + file + '.json');
    const receipt = await db.manager.findOneByOrFail(ResultApplicationRecord,{ applicationRecordId:input.metadata.applicationRecordId });
    const first = await service().apply(input);
    assert.deepEqual(await service().apply(input),first);
    assert.equal(first.ownerResultsReady,ready);
    const attempt = await state(input);
    assert.equal(attempt.processing,input.result.outcome);
    assert.equal(attempt.application,'APPLIED');
    assert.deepEqual(attempt.failures,input.result.failures);
    assert.equal((await db.manager.findOneByOrFail(AnalysisRequest,{requestId:input.result.requestId})).lifecycle,'CLOSED');
    assert.deepEqual(await db.manager.findOneByOrFail(ResultApplicationRecord,{applicationRecordId:receipt.applicationRecordId}),receipt);
  });
}

test('같은 결과 동시 E 반영은 하나의 저장 묶음으로 수렴', async () => {
  const input = await prepare(db);
  const results = await Promise.all(Array.from({length:5},() => service().apply(input)));
  for (const result of results) assert.deepEqual(result,results[0]);
  assert.equal(await count('registration_probe'),1);
});

test('열람 미준비 등록은 보존하지만 결과 진입 ID를 반환하지 않으며 재반영도 동일', async () => {
  const input = await prepare(db);
  const application = service((m,i) => storeProbe(m,i,false));
  const result = await application.apply(input);
  assert.equal(result.ownerResultsReady,false);
  assert.equal((await state(input)).ownerResultsReady,false);
  assert.deepEqual(result.registeredCatchIds,[]);
  assert.equal(result.registrations.length,1);
  assert.equal(result.registrations[0].ownerViewReady,false);
  assert.equal(await count('registration_probe'),1);
  assert.deepEqual(await readStored(db.manager,input.metadata.applicationRecordId),result.registrations);
  assert.deepEqual(await application.apply(input),result);
  assert.equal(await count('registration_probe'),1);
});

for (const [label, readiness, expectedIdIndexes] of [
  ['전부 미준비',[false,false,false],[]],
  ['준비·미준비 혼합',[false,true,true],[1]],
  ['모두 준비',[true,true,true],[0,1]],
]) {
  test(`결과 진입 ${label}: 준비된 ID만 중복 제거하고 전체 등록·재반영 ID를 보존`, async () => {
    const input = await prepare(db,undefined,{change: result => {
      const candidate = result.candidates[0];
      result.candidates = readiness.map((_,index) => ({
        ...structuredClone(candidate), candidateId: candidate.candidateId + '-' + index,
      }));
    }});
    // 명시적 B 저장 대역: 뒤의 두 후보가 같은 Catch를 참조하는 반환 경계만 검사한다.
    const catchIds = [randomUUID(),randomUUID()];
    const application = service(async (manager,value) => {
      const saved = await readStored(manager,value.applicationRecordId);
      if (saved.length > 0) return value.candidates.map(c => saved.find(r => r.candidateId === c.candidateId));
      const registrations = [];
      for (const [index,candidate] of value.candidates.entries()) {
        const catchId = catchIds[index === 0 ? 0 : 1];
        await manager.query('INSERT INTO registration_probe VALUES($1,$2) ON CONFLICT DO NOTHING',[catchId,candidate.title]);
        await manager.query('INSERT INTO candidate_registration VALUES($1,$2,$3,$4,$5)',
          [value.applicationRecordId,candidate.candidateId,catchId,'CREATED',readiness[index]]);
        registrations.push({candidateId:candidate.candidateId,catchId,disposition:'CREATED',ownerViewReady:readiness[index]});
      }
      return registrations;
    });
    const first = await application.apply(input);
    assert.deepEqual(first.registeredCatchIds,expectedIdIndexes.map(index => catchIds[index]));
    assert.equal(first.ownerResultsReady,expectedIdIndexes.length > 0);
    assert.equal((await state(input)).ownerResultsReady,first.ownerResultsReady);
    assert.equal((await state(input)).application,'APPLIED');
    assert.equal(first.registrations.length,3);
    assert.deepEqual(first.registrations.map(r => r.ownerViewReady),readiness);
    assert.deepEqual(await readStored(db.manager,input.metadata.applicationRecordId),first.registrations);
    assert.equal(await count('registration_probe'),2);
    assert.equal(await count('candidate_registration'),3);
    assert.deepEqual(await application.apply(input),first);
    assert.equal(await count('registration_probe'),2);
    assert.equal(await count('candidate_registration'),3);
  });
}

test('등록 저장 중 실패는 대역·E 완료 전체 롤백, 수신 보존 후 별도 실패 기록', async () => {
  const input = await prepare(db);
  await db.query('ALTER TABLE candidate_registration ADD CONSTRAINT reject_probe CHECK(false) NOT VALID');
  try { await assert.rejects(service().apply(input),e => e.code === '23514'); }
  finally { await db.query('ALTER TABLE candidate_registration DROP CONSTRAINT reject_probe'); }
  assert.equal(await count('registration_probe'),0);
  assert.equal(await count('result_application_record'),1);
  assert.equal((await state(input)).application,'APPLY_FAILED');
  assert.equal((await state(input)).failures.at(-1).code,'STORAGE_UNAVAILABLE');
  assert.equal((await db.manager.findOneByOrFail(AnalysisRequest,{requestId:input.result.requestId})).lifecycle,'ACTIVE');
  assert.equal((await service().apply(input)).ownerResultsReady,true);
});

test('최종 커밋의 지연 FK 실패도 성공을 반환하지 않음', async () => {
  const input = await prepare(db);
  await assert.rejects(service(async (m,i) => {
    const result = await storeProbe(m,i);
    await m.update(AnalysisRequest,{requestId:i.requestId},{consentId:randomUUID()});
    return result;
  }).apply(input),e => e.code === '23503');
  assert.equal(await count('registration_probe'),0);
  assert.equal(await count('result_application_record'),1);
  assert.equal((await state(input)).application,'APPLY_FAILED');
});

test('E 완료 상태 저장 실패도 등록 대역 전체 롤백', async () => {
  const input = await prepare(db);
  await db.query("ALTER TABLE analysis_attempt ADD CONSTRAINT reject_complete CHECK(application <> 'APPLIED') NOT VALID");
  try { await assert.rejects(service().apply(input),e => e.code === '23514'); }
  finally { await db.query('ALTER TABLE analysis_attempt DROP CONSTRAINT reject_complete'); }
  assert.equal(await count('registration_probe'),0);
  assert.equal((await state(input)).application,'APPLY_FAILED');
});

test('반환된 후보 누락·중복·저장값 불일치는 일부 저장을 완료로 만들지 않음', async () => {
  for (const transform of [() => [], rows => [...rows,...rows], rows => rows.map(r => ({...r,ownerViewReady:false}))]) {
    const input = await prepare(db);
    await assert.rejects(service(async (m,i) => transform(await storeProbe(m,i))).apply(input),
      e => e instanceof ResultApplicationContextError && e.reason === 'REGISTRATION_MISMATCH');
    assert.equal((await state(input)).application,'APPLY_FAILED');
    assert.equal(await count('registration_probe'),0);
    // 새 회원별 요청이므로 기존 수신·실패 기록은 보존한다.
  }
});

test('호출부의 명시적 등록 오류 분류와 미분류 내부 예외를 구분·원문 비노출', async () => {
  class Rejected extends Error {}
  const original = new Rejected('test-only-secret');
  const bad = await prepare(db);
  await assert.rejects(service(async () => { throw original; }, e => e instanceof Rejected ? 'INVALID_INPUT' : undefined).apply(bad),e => e === original);
  assert.equal((await state(bad)).failures.at(-1).code,'INVALID_INPUT');
  const unknown = await prepare(db);
  await assert.rejects(service(async () => { throw original; }).apply(unknown),e => e === original);
  assert.equal((await state(unknown)).failures.at(-1).code,'APPLICATION_FAILED');
  assert.equal(JSON.stringify((await state(unknown)).failures).includes(original.message),false);
});

test('수신 지문·동의 범위·현재 시도 불일치는 등록 함수를 호출하거나 기존 상태를 바꾸지 않음', async () => {
  const input = await prepare(db);
  const before = await state(input);
  for (const change of [r => {r.candidates[0].title='다른 내용';},r => {r.scopeRevision='다른 범위';}]) {
    const altered = structuredClone(input); change(altered.result);
    await assert.rejects(service(async () => assert.fail('등록 호출 불가')).apply(altered),e => e.reason === 'CONTEXT_MISMATCH');
    assert.deepEqual(await state(input),before);
  }
});

test('실패 기록 자체 실패도 원래 오류와 함께 전달·수신 보존', async () => {
  const input = await prepare(db);
  const original = new Error('probe-error');
  await db.query("ALTER TABLE analysis_attempt ADD CONSTRAINT reject_failure CHECK(application <> 'APPLY_FAILED') NOT VALID");
  try { await assert.rejects(service(async () => { throw original; }).apply(input),e =>
    e instanceof ApplicationFailureRecordingError && e.applicationFailure === original && e.recordingFailure.code === '23514'); }
  finally { await db.query('ALTER TABLE analysis_attempt DROP CONSTRAINT reject_failure'); }
  assert.equal((await state(input)).application,'PENDING');
  assert.equal(await count('result_application_record'),1);
});

test('뒤늦은 실패는 다른 실행의 성공을 덮어쓰지 않음', async () => {
  const input = await prepare(db); let calls = 0;
  const source = {async transaction(...args) {
    if (++calls === 2) await service().apply(input);
    return db.transaction(...args);
  }};
  await assert.rejects(service(async () => {throw new Error('probe failure');},() => undefined,source).apply(input));
  assert.equal((await state(input)).application,'APPLIED');
  assert.equal(await count('registration_probe'),1);
});

test('뒤늦은 실패는 다른 현재 시도를 덮어쓰지 않음', async () => {
  const input = await prepare(db); let calls = 0; const newAttemptId = randomUUID();
  const source = {async transaction(...args) {
    if (++calls === 2) await db.transaction(async m => {
      await m.insert(AnalysisAttempt,{attemptId:newAttemptId,requestId:input.result.requestId,sourceMode:'MOCK'});
      await m.update(AnalysisRequest,{requestId:input.result.requestId},{currentAttemptId:newAttemptId});
    });
    return db.transaction(...args);
  }};
  await assert.rejects(service(async () => {throw new Error('probe failure');},() => undefined,source).apply(input));
  assert.equal((await state(input)).application,'PENDING');
  assert.equal((await db.manager.findOneByOrFail(AnalysisAttempt,{attemptId:newAttemptId})).application,'NOT_READY');
});

test('E 수신 제약·물리 매핑 및 실제 기반→E 적용·역순 되돌리기', async () => {
  const input = await prepare(db);
  const receipt = await db.manager.findOneByOrFail(ResultApplicationRecord,{applicationRecordId:input.metadata.applicationRecordId});
  await assert.rejects(db.manager.insert(ResultApplicationRecord,{...receipt,applicationRecordId:randomUUID()}),e => e.code === '23505');
  await assert.rejects(db.manager.update(ResultApplicationRecord,{applicationRecordId:receipt.applicationRecordId},{requestId:randomUUID()}),e => e.code === '23503');
  await assert.rejects(db.manager.update(ResultApplicationRecord,{applicationRecordId:receipt.applicationRecordId},{payloadFingerprint:'bad'}),e => e.code === '23514');
  const schema = 'e_migration_' + randomUUID().replaceAll('-','');
  await db.query('CREATE SCHEMA "' + schema + '"');
  const isolated = await openTestDataSource({schema,entities,migrations,extra:{options:'-c search_path='+schema+' -c TimeZone=UTC'}});
  try {
    assert.deepEqual((await isolated.runMigrations()).map(m => m.name),
      ['CreateMemberAnalysisFoundation1790500000000','CreateResultApplicationRecord1790550000000','CreateShareLink1790745895865',
        'AddAnalysisRequestHistoryIndex1792640486167','CascadeMemberAnalysisOnDelete1792817978011','CascadeResultApplicationOnDelete1792817978012']);
    assert.equal((await isolated.query('SELECT tablename FROM pg_tables WHERE schemaname=$1',[schema])).length,10);
    assert.deepEqual((await isolated.driver.createSchemaBuilder().log()).upQueries,[]);
    await isolated.manager.insert(MemberAccount,{memberId:randomUUID(),identityReference:'preserve',accountState:'ACTIVE'});
    await isolated.undoLastMigration(); // #387 E 수신 기록 연쇄 삭제
    await isolated.undoLastMigration(); // #387 회원·분석 연쇄 삭제
    assert.equal(await isolated.manager.count(MemberAccount),1);
    await isolated.undoLastMigration(); // E 본인 이력 순서 인덱스(#140)
    assert.equal((await isolated.query("SELECT to_regclass('ix_analysis_request_member_id_submitted_at_request_id') AS name"))[0].name,null);
    assert.equal(await isolated.manager.count(MemberAccount),1);
    await isolated.undoLastMigration(); // C 공유 링크 및 멱등 FK
    assert.equal((await isolated.query("SELECT to_regclass('share_link') AS name"))[0].name,null);
    assert.equal((await isolated.query("SELECT to_regclass('result_application_record') AS name"))[0].name,'result_application_record');
    await isolated.undoLastMigration(); // E 수신 기록
    assert.equal(await isolated.manager.count(MemberAccount),1);
    assert.equal((await isolated.query("SELECT to_regclass('result_application_record') AS name"))[0].name,null);
    await isolated.undoLastMigration(); // 회원·분석 기반
    assert.deepEqual((await isolated.query('SELECT tablename FROM pg_tables WHERE schemaname=$1',[schema])).map(r=>r.tablename),['migrations']);
    await isolated.runMigrations();
    assert.deepEqual((await isolated.driver.createSchemaBuilder().log()).upQueries,[]);
  } finally { await isolated.destroy(); await db.query('DROP SCHEMA "'+schema+'" CASCADE'); }
});

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { after, before, beforeEach, describe, test } = require('node:test');
const { candidate, readCatchTestDatabase, createCatchDbFixture } = require('../support/catch-db-fixture.cjs');

const config = readCatchTestDatabase();
const workerFixtureRoot = [
  process.env.CATCH_WORKER_FIXTURE_ROOT,
  resolve(__dirname, '../../../worker/fixtures/m1-synthetic'),
].find((directory) => directory && existsSync(directory));

// #158의 worker fill_template/api fillTemplate과 같은 문자열 자리표시자 처리다.
// fixture JSON은 해당 작업본에서 그대로 읽으며 후보 내용은 복제·수정하지 않는다.
function fillWorkerTemplate(template, values) {
  if (Array.isArray(template)) return template.map((item) => fillWorkerTemplate(item, values));
  if (template !== null && typeof template === 'object') {
    return Object.fromEntries(Object.entries(template).map(([key, value]) => [key, fillWorkerTemplate(value, values)]));
  }
  if (typeof template !== 'string') return template;
  return template.replace(/\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g, (_, name) => {
    if (!Object.hasOwn(values, name)) throw new Error(`채울 값이 없는 자리표시자: ${name}`);
    return values[name];
  });
}

// 실제 회원·분석 기반과 PostgreSQL에서 B 저장·제약·트랜잭션을 검증한다.
// E 수신 기록·완료 처리·보호 관측은 명시적인 SQL 시험 대역이며 실제 E 연결을 증명하지 않는다.
describe('Catch 등록 PostgreSQL', {
  concurrency: false, timeout: 60000,
}, () => {
  let fixture;
  let db;
  let registerCandidates;
  let CatchRegistrationContextError;
  let CatchRegistrationInputError;
  let QueryFailedError;

  before(async () => {
    ({ registerCandidates, CatchRegistrationContextError } = require('../../dist/catches/registration-service'));
    ({ CatchRegistrationInputError } = require('../../dist/catches/registration-input-error'));
    ({ QueryFailedError } = require('typeorm'));
    fixture = await createCatchDbFixture(config);
    db = fixture.dataSource;
  });
  after(async () => { if (fixture) await fixture.close(); });
  beforeEach(async () => { await fixture.reset(); });

  const apply = (input) => db.transaction((manager) => registerCandidates(manager, input));
  // 등록 이후의 E 완료 상태를 시험이 명시한다. fixture.receipt는 기존 요청을 자동 종료하지 않는다.
  const completeApplication = (input) => db.transaction(async (manager) => {
    await manager.query("UPDATE analysis_attempt SET application = 'APPLIED', owner_results_ready = true WHERE attempt_id = $1", [input.attemptId]);
    await manager.query("UPDATE analysis_request SET lifecycle = 'CLOSED' WHERE request_id = $1", [input.requestId]);
  });
  const bCounts = async () => {
    const [row] = await db.query(`SELECT
      (SELECT count(*)::int FROM catch_asset) AS assets,
      (SELECT count(*)::int FROM catch_evidence) AS evidence,
      (SELECT count(*)::int FROM candidate_registration) AS registrations`);
    return row;
  };
  const empty = async () => {
    assert.deepEqual(await bCounts(), { assets: 0, evidence: 0, registrations: 0 });
  };
  const storedState = async () => ({
    assets: await db.query('SELECT * FROM catch_asset ORDER BY catch_id'),
    evidence: await db.query('SELECT * FROM catch_evidence ORDER BY catch_evidence_id'),
    registrations: await db.query('SELECT * FROM candidate_registration ORDER BY registration_id'),
    requests: await db.query('SELECT * FROM analysis_request ORDER BY request_id'),
    consents: await db.query('SELECT * FROM analysis_consent ORDER BY consent_id'),
    attempts: await db.query('SELECT * FROM analysis_attempt ORDER BY attempt_id'),
    receipts: await db.query('SELECT * FROM result_application_record ORDER BY application_record_id'),
  });
  const contextError = (reason) => (error) => {
    assert.ok(error instanceof CatchRegistrationContextError);
    assert.equal(error.reason, reason);
    return true;
  };
  const databaseError = (code) => (error) => {
    assert.ok(error instanceof QueryFailedError, '실제 DB 오류를 그대로 전달한다');
    assert.equal(error.driverError.code, code);
    return true;
  };

  test('실제 요청·동의·시도는 지정 ID로 연결되며 기존 ACTIVE 요청을 자동 종료하지 않는다', async () => {
    const ids = { ownerId: randomUUID(), requestId: randomUUID(), attemptId: randomUUID() };
    const input = await fixture.receipt(ids);
    assert.equal(input.ownerId, ids.ownerId);
    assert.equal(input.requestId, ids.requestId);
    assert.equal(input.attemptId, ids.attemptId);
    const [context] = await db.query(`SELECT request.member_id, request.request_id, request.current_attempt_id,
        consent.accepted, consent.repository_id, consent.consented_scope, attempt.source_mode
      FROM analysis_request request
      JOIN analysis_consent consent ON consent.consent_id = request.consent_id
      JOIN analysis_attempt attempt ON attempt.attempt_id = request.current_attempt_id`);
    assert.deepEqual(context, {
      member_id: ids.ownerId, request_id: ids.requestId, current_attempt_id: ids.attemptId,
      accepted: true, repository_id: 'synthetic-repository', consented_scope: { synthetic: true }, source_mode: 'MOCK',
    });
    const before = await storedState();
    await assert.rejects(fixture.receipt({ ownerId: input.ownerId }), databaseError('23505'));
    assert.deepEqual(await storedState(), before, '후속 seed 실패가 기존 요청·동의·시도·수신 기록을 바꾸지 않는다');
    await apply(input);
    await completeApplication(input);
    const next = await fixture.receipt({ ownerId: input.ownerId });
    assert.notEqual(next.requestId, input.requestId);
    assert.deepEqual(await db.query("SELECT request_id FROM analysis_request WHERE lifecycle = 'ACTIVE'"), [{ request_id: next.requestId }]);
  });

  test('새 후보는 PRIVATE Catch·근거·후보 연결을 함께 저장한다', async () => {
    const input = await fixture.receipt();
    const result = await apply(input);
    assert.equal(result.length, 1);
    assert.deepEqual(result[0], {
      candidateId: input.candidates[0].candidateId, catchId: result[0].catchId,
      disposition: 'CREATED', ownerViewReady: true,
    });
    assert.match(result[0].catchId, /^[0-9a-f-]{36}$/);
    const [asset] = await db.query('SELECT * FROM catch_asset');
    assert.equal(asset.catch_id, result[0].catchId);
    assert.equal(asset.owner_id, input.ownerId);
    assert.equal(asset.source_request_id, input.requestId);
    assert.equal(asset.source_result_id, input.resultId);
    assert.equal(asset.source_candidate_id, input.candidates[0].candidateId);
    assert.equal(asset.title, input.candidates[0].title);
    assert.equal(asset.visibility, 'PRIVATE');
    assert.equal(asset.work_facts_confirmed, false);
    assert.equal(asset.contribution_confirmed, false);
    assert.equal(asset.mismatch, false);
    assert.equal(asset.source_mode, 'MOCK');
    assert.deepEqual(asset.work_facts, input.candidates[0].workFacts);
    assert.deepEqual(asset.registration_assessment, {
      ...input.candidates[0].eligibility,
      groupingBasis: input.candidates[0].groupingBasis,
      groupingLimitations: input.candidates[0].groupingLimitations,
    });
    const [evidence] = await db.query('SELECT * FROM catch_evidence');
    assert.equal(evidence.catch_id, asset.catch_id);
    assert.equal(evidence.source_evidence_id, input.candidates[0].evidence[0].evidenceId);
    assert.equal(evidence.source_url, input.candidates[0].evidence[0].sourceUrl);
    assert.deepEqual(evidence.represented_facts, input.candidates[0].evidence[0].representedFacts);
    assert.deepEqual(await bCounts(), { assets: 1, evidence: 1, registrations: 1 });
    const [attempt] = await db.query('SELECT application, owner_results_ready FROM analysis_attempt');
    assert.deepEqual(attempt, { application: 'PENDING', owner_results_ready: false }, 'B는 E 완료 상태를 쓰지 않는다');
  });

  test('원 요청 저장소의 보호 판단이 없으면 이번 등록 전체를 롤백하고 준비됐다고 기록하지 않는다', async () => {
    const input = await fixture.receipt({
      candidates: [candidate(), candidate('synthetic-candidate-2', 'synthetic-work-2')],
    }, { protection: null });
    await assert.rejects(apply(input), contextError('CATCH_NOT_READY'));
    await empty();
    assert.equal((await db.query('SELECT count(*)::int AS n FROM repository_protection'))[0].n, 0,
      '서비스가 보호 판단을 임의로 만들어서는 안 된다');
    assert.deepEqual((await db.query('SELECT application, owner_results_ready FROM analysis_attempt'))[0], {
      application: 'PENDING', owner_results_ready: false,
    });
    assert.equal((await db.query('SELECT count(*)::int AS n FROM result_application_record'))[0].n, 1);
  });

  test('SOURCE_PRIVATE 보호가 있어도 본인 열람 준비는 허용하며 보호 판단을 바꾸지 않는다', async () => {
    const input = await fixture.receipt({}, { protection: 'SOURCE_PRIVATE' });
    const protectionBefore = await db.query('SELECT * FROM repository_protection');
    const first = await apply(input);
    assert.equal(first[0].ownerViewReady, true);
    assert.equal(first[0].disposition, 'CREATED');
    assert.deepEqual(await apply(input), first);
    assert.equal((await db.query('SELECT visibility FROM catch_asset'))[0].visibility, 'PRIVATE');
    assert.deepEqual(await db.query('SELECT * FROM repository_protection'), protectionBefore);
    assert.deepEqual(await bCounts(), { assets: 1, evidence: 1, registrations: 1 });
  });

  test('다른 소유자의 같은 저장소 보호 판단은 본인의 누락 판단을 대신하지 않는다', async () => {
    const input = await fixture.receipt({}, { protection: null });
    const other = await fixture.receipt();
    assert.notEqual(other.ownerId, input.ownerId);
    await assert.rejects(apply(input), contextError('CATCH_NOT_READY'));
    await empty();
    assert.deepEqual(await db.query('SELECT owner_id FROM repository_protection'), [{ owner_id: other.ownerId }]);
  });

  test('생성 실패·미생성 상태는 등록 후에도 보존한다', async () => {
    const source = candidate();
    source.draft = { status: 'FAILED', content: null };
    source.reflection = { status: 'NOT_GENERATED', questions: [] };
    await apply(await fixture.receipt({ candidates: [source] }));
    const [asset] = await db.query('SELECT draft_status, draft_content, reflection_status, reflection_questions FROM catch_asset');
    assert.deepEqual(asset, {
      draft_status: 'FAILED', draft_content: null, reflection_status: 'NOT_GENERATED', reflection_questions: [],
    });
  });

  test('호출자가 E 완료 상태를 같은 manager로 쓰면 B 자료와 함께 커밋된다', async () => {
    const input = await fixture.receipt();
    await db.transaction(async (manager) => {
      await registerCandidates(manager, input);
      await manager.query("UPDATE analysis_attempt SET application = 'APPLIED', owner_results_ready = true WHERE attempt_id = $1", [input.attemptId]);
      await manager.query("UPDATE analysis_request SET lifecycle = 'CLOSED' WHERE request_id = $1", [input.requestId]);
      // 다른 연결에는 아직 B 저장이나 E 완료 상태가 보이지 않아야 한다.
      await empty();
      assert.equal((await db.query('SELECT application FROM analysis_attempt'))[0].application, 'PENDING');
    });
    assert.deepEqual(await bCounts(), { assets: 1, evidence: 1, registrations: 1 });
    assert.deepEqual((await db.query('SELECT application, owner_results_ready FROM analysis_attempt'))[0], {
      application: 'APPLIED', owner_results_ready: true,
    });
    assert.equal((await db.query('SELECT lifecycle FROM analysis_request'))[0].lifecycle, 'CLOSED');
  });

  test('두 후보가 같은 작업이면 Catch 하나와 후보 연결 두 개를 만든다', async () => {
    const input = await fixture.receipt({ candidates: [candidate(), candidate('synthetic-candidate-2')] });
    const result = await apply(input);
    assert.equal(result[0].catchId, result[1].catchId);
    assert.deepEqual(result.map((item) => item.disposition), ['CREATED', 'EXISTING']);
    assert.deepEqual(await bCounts(), { assets: 1, evidence: 1, registrations: 2 });
  });

  test('같은 수신 기록 재호출은 같은 ID와 최초 CREATED 판정을 보존한다', async () => {
    const input = await fixture.receipt();
    const first = await apply(input);
    assert.deepEqual(await apply(input), first);
    assert.deepEqual(await bCounts(), { assets: 1, evidence: 1, registrations: 1 });
  });

  test('보호 판단이 없어진 뒤 재전달되면 과거 ready 값을 성공으로 다시 반환하지 않는다', async () => {
    const input = await fixture.receipt();
    await apply(input);
    const beforeAssets = await db.query('SELECT * FROM catch_asset');
    const beforeEvidence = await db.query('SELECT * FROM catch_evidence');
    const beforeRegistrations = await db.query('SELECT * FROM candidate_registration');
    await db.query('DELETE FROM repository_protection WHERE owner_id = $1', [input.ownerId]);
    await assert.rejects(apply(input), contextError('CATCH_NOT_READY'));
    assert.deepEqual(await db.query('SELECT * FROM catch_asset'), beforeAssets);
    assert.deepEqual(await db.query('SELECT * FROM catch_evidence'), beforeEvidence);
    assert.deepEqual(await db.query('SELECT * FROM candidate_registration'), beforeRegistrations);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM repository_protection'))[0].n, 0);
  });

  test('기존 Catch의 저장소 불일치는 원 요청의 보호 판단 부재보다 먼저 거부한다', async () => {
    const original = await fixture.receipt();
    const [created] = await apply(original);
    await completeApplication(original);
    await db.query('DELETE FROM repository_protection WHERE owner_id = $1', [original.ownerId]);
    const next = await fixture.receipt({
      ownerId: original.ownerId, candidates: [candidate('synthetic-next-candidate')],
    }, { repositoryId: 'synthetic-other-repository', protection: 'NONE' });
    await assert.rejects(apply(next), contextError('CONTEXT_MISMATCH'));
    assert.deepEqual(await bCounts(), { assets: 1, evidence: 1, registrations: 1 });
    assert.deepEqual(await db.query('SELECT catch_id, application_record_id FROM candidate_registration'), [{
      catch_id: created.catchId, application_record_id: original.applicationRecordId,
    }]);
    assert.deepEqual(await db.query('SELECT repository_id FROM repository_protection'), [{ repository_id: 'synthetic-other-repository' }]);
  });

  test('유효한 대문자 UUID도 같은 맥락으로 등록·재호출하며 입력을 바꾸지 않는다', async () => {
    const input = await fixture.receipt();
    const uppercase = { ...input };
    for (const field of ['applicationRecordId', 'requestId', 'attemptId', 'ownerId']) {
      uppercase[field] = uppercase[field].toUpperCase();
    }
    const before = structuredClone(uppercase);
    const created = await apply(uppercase);
    assert.deepEqual(await apply(input), created);
    assert.deepEqual(uppercase, before);
    const [asset] = await db.query('SELECT owner_id, source_request_id FROM catch_asset');
    assert.deepEqual(asset, { owner_id: input.ownerId, source_request_id: input.requestId });
    assert.deepEqual(await bCounts(), { assets: 1, evidence: 1, registrations: 1 });
  });

  test('같은 sourceMode·저장소의 다른 요청과 재반영은 기존 본문·출처·공개·확인·근거를 보존한다', async () => {
    const original = await fixture.receipt();
    const [first] = await apply(original);
    await completeApplication(original);
    await db.query(`UPDATE catch_asset SET visibility = 'PUBLIC', work_facts_confirmed = true,
      contribution_confirmed = true, mismatch = true WHERE catch_id = $1`, [first.catchId]);
    const beforeAsset = await db.query('SELECT * FROM catch_asset');
    const beforeEvidence = await db.query('SELECT * FROM catch_evidence');
    const source = candidate('synthetic-other-candidate');
    source.title = '[합성] 후속 제목';
    source.draft.content = '[합성] 후속 초안';
    source.evidence[0].sourceRevision = 'synthetic-new-revision';
    const other = await fixture.receipt({ ownerId: original.ownerId, candidates: [source] });
    const [existing] = await apply(other);
    assert.equal(existing.catchId, first.catchId);
    assert.equal(existing.disposition, 'EXISTING');
    assert.deepEqual(await db.query('SELECT * FROM catch_asset'), beforeAsset);
    assert.deepEqual(await db.query('SELECT * FROM catch_evidence'), beforeEvidence);
    assert.deepEqual(await bCounts(), { assets: 1, evidence: 1, registrations: 2 });
    const beforeReplay = await storedState();
    assert.deepEqual(await apply(original), [first]);
    assert.deepEqual(await apply(other), [existing]);
    assert.deepEqual(await storedState(), beforeReplay);
  });

  for (const { label, sourceMode, repositoryId } of [
    { label: 'sourceMode', sourceMode: 'LIVE', repositoryId: 'synthetic-repository' },
    { label: '저장소', sourceMode: 'MOCK', repositoryId: 'synthetic-other-repository' },
  ]) {
    test(`같은 소유자·작업의 기존 Catch와 ${label}가 다르면 새 연결을 거부한다`, async () => {
      const original = await fixture.receipt();
      await apply(original);
      await completeApplication(original);
      const next = await fixture.receipt({
        ownerId: original.ownerId, sourceMode, candidates: [candidate('synthetic-next-candidate')],
      }, { repositoryId });
      const before = await storedState();

      await assert.rejects(apply(next), contextError('CONTEXT_MISMATCH'));

      assert.deepEqual(await storedState(), before);
      assert.deepEqual(await bCounts(), { assets: 1, evidence: 1, registrations: 1 });
      assert.equal(before.receipts.length, 2, '새 수신 기록도 등록 트랜잭션 밖에 남아 있다');
    });

    test(`저장된 후보 연결도 기존 Catch와 ${label}가 다르면 재반영을 거부한다`, async () => {
      const original = await fixture.receipt();
      const [created] = await apply(original);
      await completeApplication(original);
      const next = await fixture.receipt({
        ownerId: original.ownerId, sourceMode, candidates: [candidate('synthetic-next-candidate')],
      }, { repositoryId });
      // 이전 구현이 허용했던 다른 맥락의 EXISTING 연결과 E 완료 기록을 재현한다.
      await db.query(`INSERT INTO candidate_registration
        (registration_id, application_record_id, candidate_id, catch_id, disposition, owner_view_ready)
        VALUES ($1,$2,$3,$4,'EXISTING',true)`,
      [randomUUID(), next.applicationRecordId, next.candidates[0].candidateId, created.catchId]);
      await completeApplication(next);
      const before = await storedState();

      await assert.rejects(apply(next), contextError('CONTEXT_MISMATCH'));

      assert.deepEqual(await storedState(), before, '기존 B 자료·E 완료 상태·수신 기록을 보존한다');
      assert.deepEqual(await bCounts(), { assets: 1, evidence: 1, registrations: 2 });
    });

    test(`앞 그룹 저장 뒤 기존 Catch의 ${label}가 충돌하면 전체 롤백하고 E·수신 기록을 보존한다`, async () => {
      const original = await fixture.receipt({ candidates: [candidate('synthetic-original', 'synthetic-z-work')] });
      await apply(original);
      await completeApplication(original);
      const next = await fixture.receipt({
        ownerId: original.ownerId, sourceMode,
        candidates: [candidate('synthetic-new', 'synthetic-a-work'), candidate('synthetic-conflict', 'synthetic-z-work')],
      }, { repositoryId });
      const before = await storedState();

      await assert.rejects(db.transaction(async (manager) => {
        try {
          await registerCandidates(manager, next);
        } catch (error) {
          contextError('CONTEXT_MISMATCH')(error);
          const [pending] = await manager.query(`SELECT
            (SELECT count(*)::int FROM catch_asset) AS assets,
            (SELECT count(*)::int FROM catch_evidence) AS evidence,
            (SELECT count(*)::int FROM candidate_registration) AS registrations`);
          assert.deepEqual(pending, { assets: 2, evidence: 2, registrations: 2 },
            '뒤 그룹 충돌 전에 앞 그룹의 Catch·근거·연결이 같은 트랜잭션에 저장되었다');
          throw error;
        }
        await manager.query("UPDATE analysis_attempt SET application = 'APPLIED', owner_results_ready = true WHERE attempt_id = $1", [next.attemptId]);
        await manager.query("UPDATE analysis_request SET lifecycle = 'CLOSED' WHERE request_id = $1", [next.requestId]);
      }), contextError('CONTEXT_MISMATCH'));

      assert.deepEqual(await storedState(), before, '앞 그룹 저장을 롤백하고 이전 완료·현재 대기·수신 기록을 보존한다');
      assert.deepEqual(await bCounts(), { assets: 1, evidence: 1, registrations: 1 });
      assert.equal(before.receipts.length, 2);
    });
  }

  test('기존 Catch의 원 요청 소유자가 다르면 재호출과 다른 요청의 참조를 거부한다', async () => {
    const original = await fixture.receipt();
    const [created] = await apply(original);
    await completeApplication(original);
    const otherOwner = await fixture.receipt();
    // 단일 FK만으로 잡히지 않는 owner/sourceRequest 불일치가 이미 저장된 경우를 재현한다.
    await db.query('UPDATE catch_asset SET source_request_id = $1 WHERE catch_id = $2', [otherOwner.requestId, created.catchId]);
    const beforeAssets = await db.query('SELECT * FROM catch_asset');
    const beforeEvidence = await db.query('SELECT * FROM catch_evidence');
    const beforeRegistrations = await db.query('SELECT * FROM candidate_registration');
    await assert.rejects(apply(original), contextError('CATCH_NOT_READY'));
    const next = await fixture.receipt({ ownerId: original.ownerId, candidates: [candidate('synthetic-next-candidate')] });
    await assert.rejects(apply(next), contextError('CATCH_NOT_READY'));
    assert.deepEqual(await db.query('SELECT * FROM catch_asset'), beforeAssets);
    assert.deepEqual(await db.query('SELECT * FROM catch_evidence'), beforeEvidence);
    assert.deepEqual(await db.query('SELECT * FROM candidate_registration'), beforeRegistrations);
    assert.deepEqual(await bCounts(), { assets: 1, evidence: 1, registrations: 1 });
  });

  test('서로 다른 작업은 같은 근거 ID가 있어도 각각 등록한다', async () => {
    const input = await fixture.receipt({
      candidates: [candidate(), candidate('synthetic-candidate-2', 'synthetic-work-2')],
    });
    const result = await apply(input);
    assert.notEqual(result[0].catchId, result[1].catchId);
    assert.deepEqual(await bCounts(), { assets: 2, evidence: 2, registrations: 2 });
  });

  test('뒤 후보가 잘못되면 이번 반영 전체를 거부하고 수신 기록은 남긴다', async () => {
    const invalid = candidate('synthetic-candidate-2', 'synthetic-work-2');
    invalid.subjectContribution = '';
    const input = await fixture.receipt({ candidates: [candidate(), invalid] });
    await assert.rejects(apply(input), (error) => error instanceof CatchRegistrationInputError);
    await empty();
    assert.equal((await db.query('SELECT count(*)::int AS n FROM result_application_record'))[0].n, 1);
  });

  test('근거 INSERT의 DB 실패는 Catch와 연결까지 롤백한다', async () => {
    const input = await fixture.receipt();
    await db.query("ALTER TABLE catch_evidence ADD CONSTRAINT fixture_evidence_failure CHECK (source_revision <> 'synthetic-revision-1')");
    try {
      await assert.rejects(apply(input), databaseError('23514'));
      await empty();
    } finally {
      await db.query('ALTER TABLE catch_evidence DROP CONSTRAINT fixture_evidence_failure');
    }
  });

  test('E 완료 기록이 실패하면 B 저장도 롤백되고 바깥에서 APPLY_FAILED만 남긴다', async () => {
    const input = await fixture.receipt();
    await assert.rejects(db.transaction(async (manager) => {
      await registerCandidates(manager, input);
      await manager.query("UPDATE analysis_request SET lifecycle = 'CLOSED' WHERE request_id = $1", [input.requestId]);
      // 실제 분석 시도의 CHECK 위반으로 E 완료 처리 대역의 저장 실패를 일으킨다.
      await manager.query("UPDATE analysis_attempt SET application = 'INVALID_FIXTURE', owner_results_ready = true WHERE attempt_id = $1", [input.attemptId]);
    }), databaseError('23514'));
    await db.query("UPDATE analysis_attempt SET application = 'APPLY_FAILED' WHERE attempt_id = $1", [input.attemptId]);
    await empty();
    assert.deepEqual((await db.query('SELECT application, owner_results_ready FROM analysis_attempt'))[0], {
      application: 'APPLY_FAILED', owner_results_ready: false,
    });
    assert.equal((await db.query('SELECT lifecycle FROM analysis_request'))[0].lifecycle, 'ACTIVE');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM result_application_record'))[0].n, 1);
  });

  test('지연 FK가 커밋에서 실패해도 B 저장과 E 완료 변경을 함께 롤백한다', async () => {
    const input = await fixture.receipt();
    const before = await storedState();
    let reachedCommit = false;
    await assert.rejects(db.transaction(async (manager) => {
      await registerCandidates(manager, input);
      await manager.query("UPDATE analysis_attempt SET application = 'APPLIED', owner_results_ready = true WHERE attempt_id = $1", [input.attemptId]);
      await manager.query("UPDATE analysis_request SET lifecycle = 'CLOSED', current_attempt_id = $1 WHERE request_id = $2", [randomUUID(), input.requestId]);
      assert.equal((await manager.query('SELECT count(*)::int AS n FROM catch_asset'))[0].n, 1,
        'B 저장은 같은 트랜잭션 안에 존재한다');
      reachedCommit = true;
    }), databaseError('23503'));
    assert.equal(reachedCommit, true, '본문의 SQL은 통과하고 deferred FK를 확인하는 커밋에서 실패한다');
    assert.deepEqual(await storedState(), before);
    await empty();
  });

  test('활성 트랜잭션 밖에서는 저장을 거부한다', async () => {
    await assert.rejects(registerCandidates(db.manager, await fixture.receipt()), contextError('TRANSACTION_REQUIRED'));
    await empty();
  });

  test('소유자·결과·출처 맥락이 다르면 저장을 거부한다', async () => {
    const input = await fixture.receipt();
    for (const patch of [
      { ownerId: randomUUID() }, { resultId: 'synthetic-other-result' }, { sourceMode: 'LIVE' },
    ]) {
      await assert.rejects(apply({ ...input, ...patch }), contextError('CONTEXT_MISMATCH'));
    }
    await empty();
  });

  test('현재 시도가 바뀐 늦은 수신 기록은 등록하지 않는다', async () => {
    const input = await fixture.receipt();
    const newer = randomUUID();
    await db.query(`INSERT INTO analysis_attempt(attempt_id, request_id, source_mode)
      VALUES ($1,$2,'MOCK')`, [newer, input.requestId]);
    await db.query('UPDATE analysis_request SET current_attempt_id = $1 WHERE request_id = $2', [newer, input.requestId]);
    await assert.rejects(apply(input), contextError('CONTEXT_MISMATCH'));
    await empty();
  });

  test('같은 수신 기록의 후보 집합 변경은 기존 등록을 보존하며 거부한다', async () => {
    const input = await fixture.receipt();
    await apply(input);
    const before = await db.query('SELECT * FROM candidate_registration');
    await assert.rejects(apply({ ...input, candidates: [candidate('synthetic-replacement')] }), contextError('REGISTRATION_MISMATCH'));
    assert.deepEqual(await db.query('SELECT * FROM candidate_registration'), before);
    assert.deepEqual(await bCounts(), { assets: 1, evidence: 1, registrations: 1 });
  });

  test('완료된 수신 기록 재전달과 후속 요청의 같은 작업 등록이 겹쳐도 기존 Catch를 보존한다', async () => {
    const first = await fixture.receipt();
    const created = await apply(first);
    await completeApplication(first);
    const second = await fixture.receipt({ ownerId: first.ownerId });
    const beforeAssets = await db.query('SELECT * FROM catch_asset');
    const beforeEvidence = await db.query('SELECT * FROM catch_evidence');
    const [left, right] = await Promise.all([apply(first), apply(second)]);
    assert.deepEqual(left, created, '완료된 수신 기록은 최초 CREATED 판정을 재생한다');
    assert.equal(left[0].catchId, right[0].catchId);
    assert.equal(right[0].disposition, 'EXISTING');
    assert.deepEqual(await db.query('SELECT * FROM catch_asset'), beforeAssets);
    assert.deepEqual(await db.query('SELECT * FROM catch_evidence'), beforeEvidence);
    assert.deepEqual(await bCounts(), { assets: 1, evidence: 1, registrations: 2 });
  });

  test('같은 수신 기록 동시 호출은 최초 ID와 판정을 함께 반환한다', async () => {
    const input = await fixture.receipt();
    const [left, right] = await Promise.all([apply(input), apply(input)]);
    assert.deepEqual(left, right);
    assert.equal(left[0].disposition, 'CREATED');
    assert.deepEqual(await bCounts(), { assets: 1, evidence: 1, registrations: 1 });
  });

  test('DB가 후보 연결의 FK와 유일성, Catch enum CHECK를 강제한다', async () => {
    const input = await fixture.receipt();
    const [result] = await apply(input);
    const insert = (recordId, candidateId, catchId) => db.query(`INSERT INTO candidate_registration
      (registration_id, application_record_id, candidate_id, catch_id, disposition, owner_view_ready)
      VALUES ($1,$2,$3,$4,'EXISTING',true)`, [randomUUID(), recordId, candidateId, catchId]);
    await assert.rejects(insert(randomUUID(), 'synthetic-new-candidate', result.catchId), databaseError('23503'));
    await assert.rejects(insert(input.applicationRecordId, 'synthetic-new-candidate', randomUUID()), databaseError('23503'));
    await assert.rejects(insert(input.applicationRecordId, input.candidates[0].candidateId, result.catchId), databaseError('23505'));
    await assert.rejects(db.query('UPDATE catch_asset SET owner_id = $1 WHERE catch_id = $2', [randomUUID(), result.catchId]), databaseError('23503'));
    await assert.rejects(db.query('UPDATE catch_asset SET source_request_id = $1 WHERE catch_id = $2', [randomUUID(), result.catchId]), databaseError('23503'));
    await assert.rejects(db.query("UPDATE catch_asset SET visibility = 'INVALID_FIXTURE'"), databaseError('23514'));
    assert.deepEqual(await bCounts(), { assets: 1, evidence: 1, registrations: 1 });
  });

  for (const [caseId, outcome, counts] of [
    ['succeeded-one-candidate', 'SUCCEEDED', { assets: 1, evidence: 1, registrations: 1 }],
    ['two-candidates-same-work', 'SUCCEEDED', { assets: 1, evidence: 1, registrations: 2 }],
    ['partial-failed', 'PARTIAL_FAILED', { assets: 1, evidence: 1, registrations: 1 }],
    ['empty', 'EMPTY', { assets: 0, evidence: 0, registrations: 0 }],
    ['failed', 'FAILED', { assets: 0, evidence: 0, registrations: 0 }],
  ]) {
    test(`#103 공용 합성 자료 ${caseId}: 후보를 그대로 등록하고 재전달 시 보존한다`, {
      skip: workerFixtureRoot ? false : '공용 합성 자료 없음: CATCH_WORKER_FIXTURE_ROOT 또는 worker/fixtures/m1-synthetic 필요',
    }, async () => {
      const sample = JSON.parse(readFileSync(resolve(workerFixtureRoot, 'context.sample.json'), 'utf8'));
      const template = JSON.parse(readFileSync(resolve(workerFixtureRoot, 'results', `${caseId}.json`), 'utf8'));
      const message = fillWorkerTemplate(template, {
        ...sample.values, caseId, requestId: randomUUID(), attemptId: randomUUID(), memberId: randomUUID(),
      });
      assert.equal(message.outcome, outcome);
      const candidatesBefore = structuredClone(message.candidates);
      const input = await fixture.receipt({
        requestId: message.requestId, attemptId: message.attemptId, resultId: message.resultId,
        ownerId: message.memberId, sourceMode: message.sourceMode, candidates: message.candidates,
      }, { repositoryId: message.repositoryId, protection: 'NONE' });
      await db.query('UPDATE analysis_attempt SET processing = $1 WHERE attempt_id = $2', [message.outcome, input.attemptId]);

      const first = await apply(input);
      assert.equal(first.length, message.candidates.length);
      assert.deepEqual(await bCounts(), counts);
      const assets = await db.query('SELECT * FROM catch_asset ORDER BY catch_id');
      const evidence = await db.query('SELECT * FROM catch_evidence ORDER BY catch_evidence_id');
      for (const asset of assets) {
        const source = message.candidates.find((item) => item.candidateId === asset.source_candidate_id);
        assert.ok(source);
        assert.equal(asset.title, source.title);
        assert.deepEqual(asset.work_facts, source.workFacts);
        assert.equal(asset.visibility, 'PRIVATE');
        assert.equal(asset.source_mode, message.sourceMode);
        assert.equal(asset.draft_status, source.draft.status);
        assert.equal(asset.draft_content, source.draft.content);
      }
      if (caseId === 'two-candidates-same-work') {
        assert.equal(new Set(first.map((item) => item.catchId)).size, 1);
        assert.deepEqual(first.map((item) => item.disposition).sort(), ['CREATED', 'EXISTING']);
      }
      const byCandidate = (items) => [...items].sort((left, right) => left.candidateId.localeCompare(right.candidateId));
      assert.deepEqual(byCandidate(await apply(input)), byCandidate(first));
      assert.deepEqual(await bCounts(), counts);
      assert.deepEqual(await db.query('SELECT * FROM catch_asset ORDER BY catch_id'), assets);
      assert.deepEqual(await db.query('SELECT * FROM catch_evidence ORDER BY catch_evidence_id'), evidence);
      assert.deepEqual(message.candidates, candidatesBefore);
      // 메시지 스키마·실패 분류·E의 종결 정책은 이 B 저장 시험이 판정하지 않는다.
      assert.deepEqual((await db.query('SELECT processing, application, owner_results_ready FROM analysis_attempt'))[0], {
        processing: outcome, application: 'PENDING', owner_results_ready: false,
      });
    });
  }

  test('B 마이그레이션 되돌리기는 선행 A/E 테이블·행을 보존하고 다시 적용된다', async () => {
    const input = await fixture.receipt();
    await apply(input);
    await db.undoLastMigration();
    try {
      assert.equal((await db.query('SELECT to_regclass($1)::text AS relation', [`${fixture.schema}.repository_protection`]))[0].relation, null);
      assert.deepEqual(await bCounts(), { assets: 1, evidence: 1, registrations: 1 }, '보호 마이그레이션의 down은 등록 자료를 지우지 않는다');
      await db.undoLastMigration();
      for (const table of ['catch_asset', 'catch_evidence', 'candidate_registration', 'repository_protection']) {
        assert.equal((await db.query('SELECT to_regclass($1)::text AS relation', [`${fixture.schema}.${table}`]))[0].relation, null);
      }
      for (const table of ['member_account', 'analysis_request', 'analysis_consent', 'analysis_attempt', 'result_application_record']) {
        assert.equal((await db.query(`SELECT count(*)::int AS n FROM ${table}`))[0].n, 1);
      }
    } finally {
      await db.runMigrations();
    }
    await empty();
    assert.equal((await db.query('SELECT count(*)::int AS n FROM repository_protection'))[0].n, 0,
      '보호 마이그레이션 up은 기존 회원·요청에 NONE을 임의로 채우지 않는다');
  });
});

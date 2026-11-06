require('reflect-metadata');
// #139: #138의 실제 접수 API가 DB에 저장한 요청·동의·시도를 개발용 주입(DevAnalysisInjection)과 수신 처리에 연결한다.
// 요청·동의·시도는 직접 넣지 않고 실제 HTTP 접수(POST /v1/analysis-requests)로 만든다. #103 공용 합성 세트
// (worker/fixtures/m1-synthetic)의 사례 목록을 그대로 따른다. worker·큐·GitHub는 연결하지 않는다.
// 보호 기록에는 실제 10월 정책 공급자를 쓰고 좌표는 합성 저장소 어댑터로 공급한다. 제품 앱에는 이 시험 조립을 등록하지 않는다.
// #114 연결 시험은 처리 시한 닫기(서비스 직접 호출)와 보내기 대상(메모리 요청 큐)까지 잇는다. 실제 큐·worker 실행은 보지 않는다.
// #140 연결 시험은 이 경로로 만든 상태를 본인 이력·개별 상태 조회 API로 읽어 같은 키 재응답과 비교한다.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { after, before, beforeEach, test } = require('node:test');
const { NestFactory } = require('@nestjs/core');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const { CONTRACT_DIR } = require('../helpers/receiver-harness.cjs');
const { startIntakeApp } = require('../helpers/intake-app.cjs');
const { MemoryRequestQueue, dispatchLog } = require('../helpers/queue-harness.cjs');
const { AppModule } = require('../../dist/app.module');
const { configureApp } = require('../../dist/app.setup');
const { DevAnalysisInjection } = require('../../dist/analysis-receiver/dev-analysis-injection');
const { OctoberRepositoryObservationSource } = require('../../dist/analysis-receiver/october-repository-observation.source');
const { WorkerMessageValidator } = require('../../dist/analysis-receiver/worker-message.validator');
const { AnalysisDeadlineService } = require('../../dist/analysis-deadline/analysis-deadline.service');
const { AnalysisNoticeService } = require('../../dist/analysis-intake/analysis-notice');
const { AnalysisRequestDispatcher } = require('../../dist/analysis-queue/analysis-request.dispatcher');
const { PublicCatchStore } = require('../../dist/catches/public-catch-store');
const { DevMemberService, SYNTHETIC_REPOSITORY } = require('../../dist/member-analysis/dev-member.service');

const FIXTURES = resolve(__dirname, '../../../worker/fixtures/m1-synthetic');
const read = file => JSON.parse(readFileSync(resolve(FIXTURES, file), 'utf8'));
const manifest = read('cases.json');

let db;
before(async () => { db = await openTestDataSource(); });
after(async () => { await db?.destroy(); });
beforeEach(async () => { await resetTestDatabase(db); });

async function start(t, options) {
  const s = await startIntakeApp(db, options);
  t.after(() => s.close());
  return s;
}

async function counts() {
  const [row] = await db.query(`SELECT (SELECT count(*)::int FROM analysis_request) requests,
    (SELECT count(*)::int FROM analysis_consent) consents, (SELECT count(*)::int FROM analysis_attempt) attempts,
    (SELECT count(*)::int FROM result_application_record) receipts, (SELECT count(*)::int FROM catch_asset) catches,
    (SELECT count(*)::int FROM candidate_registration) registrations`);
  return row;
}
const attemptOf = requestId => db.query(`SELECT a.* FROM analysis_attempt a JOIN analysis_request r
  ON r.current_attempt_id = a.attempt_id WHERE r.request_id = $1`, [requestId]).then(rows => rows[0]);
const requestOf = requestId => db.query('SELECT * FROM analysis_request WHERE request_id = $1', [requestId]).then(rows => rows[0]);
// 표 전체를 행 순서와 무관하게 읽는다. 표 이름은 시험 안의 상수만 넣는다.
const tableRows = tables => Promise.all(tables.map(table =>
  db.query(`SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY to_jsonb(t)::text`).then(rows => [table, rows.map(r => r.row)])))
  .then(Object.fromEntries);
const requestRows = requestId => db.query(`SELECT to_jsonb(r) AS request, to_jsonb(c) AS consent, to_jsonb(a) AS attempt
  FROM analysis_request r JOIN analysis_consent c ON c.request_id = r.request_id
  JOIN analysis_attempt a ON a.request_id = r.request_id WHERE r.request_id = $1`, [requestId]);
/** 개발 회원의 선정 저장소에 둘째 합성 저장소를 더한다(db/analysis-intake.test.cjs의 otherRepository와 같은 방식). */
function secondRepository(app) {
  const second = { ...SYNTHETIC_REPOSITORY, repositoryId: 'synthetic-second' };
  const members = app.get(DevMemberService);
  const readConnection = members.readConnection.bind(members);
  members.readConnection = async (memberId, manager) =>
    ({ ...await readConnection(memberId, manager), repositories: [SYNTHETIC_REPOSITORY, second] });
  const notices = app.get(AnalysisNoticeService);
  const scope = notices.scope.bind(notices);
  notices.scope = (repositoryId, revision, mode) => ({ ...scope(SYNTHETIC_REPOSITORY.repositoryId, revision, mode), repositoryId });
  return second;
}
function patch(input, operations) {
  for (const operation of operations) {
    const segments = operation.path.split('/').slice(1).map(part => part.replaceAll('~1', '/').replaceAll('~0', '~'));
    const key = segments.pop();
    const parent = segments.reduce((node, part) => node[part], input);
    if (operation.op === 'remove') delete parent[key];
    else if (operation.op === 'replace') parent[key] = operation.value;
    else throw new Error('Unsupported fixture patch');
  }
  return input;
}
/** 실제 접수로 요청을 만들고 접수 맥락을 API 응답·DB에서 읽는다. */
async function accepted(s, label) {
  const user = await s.login('intake-receiver-' + label);
  const intake = await s.submit(user);
  assert.equal(intake.status.processing, 'QUEUED');
  assert.equal(intake.status.lifecycle, 'ACTIVE');
  assert.equal(intake.status.application, 'NOT_READY');
  return { user, intake, requestId: intake.status.requestId, attemptId: intake.status.attemptId };
}

test('실제 접수 API가 저장한 요청·동의·시도 맥락으로 합성 결과를 채워 주입하면 수신 기록이 그 맥락에 남는다', async t => {
  const s = await start(t);
  const { user, intake, requestId, attemptId } = await accepted(s, 'context');
  const before = await counts();
  assert.deepEqual([before.requests, before.consents, before.attempts, before.receipts, before.catches], [1, 1, 1, 0, 0]);
  const entry = manifest.cases.find(c => c.caseId === 'succeeded-one-candidate');
  const response = await s.inject(user, requestId, 'Result', read(entry.messages[0].file), entry.caseId);
  assert.equal(response.status, 201, response.text);
  assert.equal(response.body.receipt.disposition, 'ACCEPTED');
  assert.equal(response.body.receipt.code, 'OK');
  assert.equal(response.body.receipt.requestId, requestId);
  assert.equal(response.body.receipt.attemptId, attemptId);
  // 수신 기록은 접수 응답·접수 요청 본문의 값과 같은 요청·시도·동의에 남는다.
  const [record] = await db.query('SELECT * FROM result_application_record');
  assert.equal(record.request_id, requestId);
  assert.equal(record.attempt_id, attemptId);
  assert.equal(record.result_id, response.body.receipt.resultId);
  const [consent] = await db.query('SELECT * FROM analysis_consent WHERE consent_id = $1', [intake.status.consentId]);
  assert.equal(consent.request_id, requestId);
  assert.equal(consent.scope_revision, intake.body.consent.scopeRevision);
  assert.equal(consent.notice_revision, intake.body.consent.noticeRevision);
  assert.equal(consent.repository_id, intake.body.repositoryId);
  assert.equal(consent.member_id, user.memberId);
  // 접수 API 재조회에서 같은 요청의 반영 완료 상태가 보인다. 수신 확인이 아니라 반영 결과다.
  const after = await s.status(user, intake);
  assert.equal(after.requestId, requestId);
  assert.equal(after.attemptId, attemptId);
  assert.equal(after.processing, 'SUCCEEDED');
  assert.equal(after.application, 'APPLIED');
  assert.equal(after.lifecycle, 'CLOSED');
  assert.equal(after.sourceMode, 'MOCK');
  assert.equal(after.registeredCatchIds.length, 1);
  assert.equal(after.ownerResultsReady, true);
  const [catchRow] = await db.query('SELECT * FROM catch_asset');
  assert.equal(catchRow.catch_id, after.registeredCatchIds[0]);
  assert.equal(catchRow.owner_id, user.memberId);
  assert.equal(catchRow.source_request_id, requestId);
  assert.equal(catchRow.source_mode, 'MOCK');
  assert.equal(catchRow.visibility, 'PRIVATE');
});

test('U7 재분석은 진행·실패·성공 동안 기존 Catch 내용·설명·공개·근거를 보존하고 새 작업만 더한다', async t => {
  const s = await start(t), user = await s.login('u7-retained-reanalysis');
  const first = await s.submit(user);
  const originalResult = read('results/succeeded-one-candidate.json');
  assert.equal((await s.inject(user, first.status.requestId, 'Result', originalResult, 'retained')).status, 201);
  const [asset] = await db.query('SELECT catch_id FROM catch_asset WHERE owner_id = $1', [user.memberId]);
  await db.query(`UPDATE catch_asset SET author_description=$2, author_description_updated_at=now(), visibility='PUBLIC'
    WHERE catch_id=$1`, [asset.catch_id, '회원이 직접 작성한 설명']);
  const preserved = async () => ({
    asset: await db.query('SELECT to_jsonb(c) AS row FROM catch_asset c WHERE catch_id=$1', [asset.catch_id]),
    evidence: await db.query('SELECT to_jsonb(e) AS row FROM catch_evidence e WHERE catch_id=$1 ORDER BY position', [asset.catch_id]),
  });
  const saved = await preserved();
  const failed = await s.submit(user, randomUUID(), { retryOfRequestId: first.status.requestId });
  assert.notEqual(failed.status.consentId, first.status.consentId);
  assert.deepEqual(await preserved(), saved, '진행 중에도 기존 Catch를 지우거나 바꾸지 않는다');
  assert.equal((await s.inject(user, failed.status.requestId, 'Result', read('results/failed.json'), 'failed-reanalysis')).status, 201);
  assert.deepEqual(await preserved(), saved, '실패해도 기존 Catch를 보존한다');
  const next = await s.submit(user, randomUUID(), { retryOfRequestId: failed.status.requestId });
  const result = structuredClone(originalResult);
  result.candidates[0].title = '같은 작업에서 새로 생성된 제목';
  result.candidates[0].draft.content = '기존 Catch에 덮어쓰면 안 되는 새 초안';
  const fresh = structuredClone(result.candidates[0]);
  fresh.candidateId += '-new'; fresh.workIdentity += '-new'; fresh.evidence[0].evidenceId += '-new';
  result.candidates.push(fresh);
  const applied = await s.inject(user, next.status.requestId, 'Result', result, 'retained');
  assert.equal(applied.status, 201, applied.text);
  assert.equal(applied.body.application.registeredCatchIds.length, 2);
  assert.ok(applied.body.application.registeredCatchIds.includes(asset.catch_id));
  assert.deepEqual(await preserved(), saved, '같은 작업의 최초 내용·설명·공개·근거를 유지한다');
  assert.equal((await counts()).catches, 2, '새 작업만 한 개 더한다');
  const [added] = await db.query('SELECT visibility, author_description FROM catch_asset WHERE catch_id <> $1', [asset.catch_id]);
  assert.deepEqual(added, { visibility: 'PRIVATE', author_description: null });
});

for (const entry of manifest.cases) {
  test(`#103 ${entry.caseId}: 실제 접수 → 개발 주입 → DB 수신 → 접수 API 상태`, async t => {
    const s = await start(t);
    let current = await accepted(s, entry.caseId);
    for (const [index, message] of entry.messages.entries()) {
      if (entry.delivery === 'SEPARATE_REQUESTS' && index > 0) current = await accepted(s, `${entry.caseId}-${index}`);
      const { user, intake, requestId, attemptId } = current;
      const before = await counts();
      const response = await s.inject(user, requestId, message.schema, read(message.file), entry.caseId);
      assert.equal(response.status, 201, response.text);
      const expected = message.expected;
      if (message.schema === 'ProcessingEvent') {
        // 진행 이벤트는 수신 확인을 만들지 않고 수신 기록을 늘리지 않는다.
        assert.equal(response.body, 'OBSERVED');
        assert.equal((await counts()).receipts, 0);
      } else if (expected.receipt === null) {
        assert.deepEqual(response.body, { receipt: null });
        assert.deepEqual(await counts(), before, '식별 불가 메시지는 아무것도 저장하지 않는다');
      } else {
        assert.equal(response.body.receipt.disposition, expected.receipt.disposition);
        assert.equal(response.body.receipt.code, expected.receipt.code);
        assert.equal(response.body.receipt.requestId, requestId);
        assert.equal(response.body.receipt.attemptId, attemptId);
      }
      const after = await s.status(user, intake);
      assert.equal(after.processing, expected.processingAfter);
      assert.equal(after.registeredCatchIds.length, expected.catchesAfter);
      assert.equal((await counts()).catches, expected.catchesAfter);
      const attempt = await attemptOf(requestId);
      assert.equal(attempt.processing, expected.processingAfter);
      if (message.schema === 'Result' && expected.receipt?.disposition === 'ACCEPTED') {
        assert.equal(after.application, 'APPLIED');
        assert.equal(after.lifecycle, 'CLOSED');
        assert.equal(after.ownerResultsReady, expected.catchesAfter > 0);
      }
      if (expected.receipt?.disposition === 'DUPLICATE') {
        assert.equal(response.body.application, undefined, '재전달은 새 반영을 만들지 않는다');
        assert.equal((await counts()).receipts, 1);
      }
      if (expected.receipt?.disposition === 'REJECTED') {
        assert.equal((await counts()).receipts, 1, '거부는 기존 수신 기록을 덮어쓰거나 늘리지 않는다');
        assert.equal(after.application, 'APPLIED');
      }
    }
  });
}

for (const control of manifest.negativeControls) {
  test(`#103 음성 대조 ${control.id}: 실제 접수 요청에 주입해도 수신 기록·Catch를 만들지 않는다`, async t => {
    const s = await start(t);
    const { user, intake, requestId } = await accepted(s, control.id);
    const response = await s.inject(user, requestId, control.schema, patch(read(control.file), control.patch), control.id);
    assert.equal(response.status, 201, response.text);
    if (control.check.verdict === 'UNIDENTIFIABLE') assert.deepEqual(response.body, { receipt: null });
    else {
      assert.equal(response.body.receipt.disposition, 'REJECTED');
      assert.equal(response.body.receipt.code, 'SCHEMA_INVALID');
    }
    const after = await counts();
    assert.equal(after.receipts, 0);
    assert.equal(after.catches, 0);
    const current = await s.status(user, intake);
    assert.equal(current.processing, 'QUEUED');
    assert.equal(current.lifecycle, 'ACTIVE');
    assert.equal(current.application, 'NOT_READY');
  });
}

test('종결 결과보다 늦게 온 진행 이벤트는 종결 상태와 반영 결과를 되돌리지 않는다', async t => {
  const s = await start(t);
  const { user, intake, requestId } = await accepted(s, 'late-progress');
  const early = await s.inject(user, requestId, 'ProcessingEvent', read('events/running.json'), 'late-progress');
  assert.equal(early.body, 'OBSERVED');
  assert.equal((await attemptOf(requestId)).processing, 'RUNNING');
  const result = await s.inject(user, requestId, 'Result', read('results/succeeded-one-candidate.json'), 'late-progress');
  assert.equal(result.body.receipt.disposition, 'ACCEPTED');
  const settled = await s.status(user, intake);
  const attemptBefore = await attemptOf(requestId);
  const requestBefore = await requestOf(requestId);
  for (const file of ['events/running.json', 'events/uncertain.json']) {
    const late = await s.inject(user, requestId, 'ProcessingEvent', read(file), 'late-progress');
    assert.equal(late.status, 201, late.text);
    assert.equal(late.body, 'TERMINAL_UNCHANGED');
  }
  assert.deepEqual(await s.status(user, intake), settled);
  assert.deepEqual(await attemptOf(requestId), attemptBefore);
  assert.equal((await requestOf(requestId)).lifecycle, requestBefore.lifecycle);
  assert.equal((await counts()).receipts, 1);
  assert.equal((await counts()).catches, 1);
});

test('접수 맥락과 다른 메시지는 거부되고 기존 수신 기록·Catch를 덮어쓰지 않는다', async t => {
  const s = await start(t);
  const { user, intake, requestId } = await accepted(s, 'mismatch');
  const base = read('results/succeeded-one-candidate.json');
  // 접수된 요청에 정상 결과를 먼저 수신한다. 이후 어긋난 메시지가 이 기록을 바꾸지 못해야 한다.
  assert.equal((await s.inject(user, requestId, 'Result', base, 'mismatch')).body.receipt.disposition, 'ACCEPTED');
  const settled = await s.status(user, intake);
  const snapshot = await db.query('SELECT * FROM result_application_record');
  const catches = await db.query('SELECT * FROM catch_asset ORDER BY catch_id');
  // 다른 요청·회원 ID가 채워진 템플릿은 주입 단계에서 거부한다.
  for (const field of ['requestId', 'memberId']) {
    const template = { ...base, [field]: randomUUID() };
    assert.equal((await s.inject(user, requestId, 'Result', template, 'mismatch')).status, 403);
  }
  // 접수 맥락과 다른 시도·동의 판본·저장소·동의 ID는 수신 처리가 거부한다.
  for (const [label, changes, code] of [
    ['다른 시도', { attemptId: randomUUID() }, 'STALE_ATTEMPT'],
    ['다른 동의 판본', { scopeRevision: 'other-scope-revision' }, 'CONTEXT_MISMATCH'],
    ['다른 저장소', { repositoryId: 'other-repository' }, 'CONTEXT_MISMATCH'],
    ['다른 동의', { consentId: randomUUID() }, 'CONTEXT_MISMATCH'],
  ]) {
    const response = await s.inject(user, requestId, 'Result',
      { ...base, ...changes, resultId: 'mismatch-' + label, messageId: randomUUID() }, 'mismatch');
    assert.equal(response.status, 201, response.text);
    assert.equal(response.body.receipt.disposition, 'REJECTED', label);
    assert.equal(response.body.receipt.code, code, label);
  }
  // 형식이 틀리거나 식별할 수 없는 결과(#103 음성 대조)도 이미 받은 수신 기록·Catch를 바꾸지 못한다(#114 기준 4).
  for (const control of manifest.negativeControls) {
    const template = patch({ ...read(control.file), resultId: 'format-' + control.id, messageId: randomUUID() }, control.patch);
    const response = await s.inject(user, requestId, control.schema, template, 'mismatch');
    assert.equal(response.status, 201, response.text);
    if (control.check.verdict === 'UNIDENTIFIABLE') assert.deepEqual(response.body, { receipt: null }, control.id);
    else assert.deepEqual([response.body.receipt.disposition, response.body.receipt.code], ['REJECTED', 'SCHEMA_INVALID'], control.id);
  }
  // 같은 결과 ID의 다른 내용은 기존 기록을 유지하고 거부한다.
  const conflict = await s.inject(user, requestId, 'Result', read('results/same-id-different-content.json'), 'succeeded-one-candidate');
  assert.equal(conflict.body.receipt.disposition, 'REJECTED');
  assert.equal(conflict.body.receipt.code, 'PAYLOAD_CONFLICT');
  assert.deepEqual(await s.status(user, intake), settled);
  assert.deepEqual(await db.query('SELECT * FROM result_application_record'), snapshot);
  assert.deepEqual(await db.query('SELECT * FROM catch_asset ORDER BY catch_id'), catches);
});

test('본인이 아닌 회원·인증 없음·다른 요청 ID로는 주입하지 못하고 접수 상태를 바꾸지 않는다', async t => {
  const s = await start(t);
  const owner = await accepted(s, 'owner');
  const other = await s.login('intake-receiver-other');
  const template = read('results/succeeded-one-candidate.json');
  assert.equal((await s.inject(null, owner.requestId, 'Result', template)).status, 401);
  assert.equal((await s.inject(other, owner.requestId, 'Result', template)).status, 404);
  assert.equal((await s.inject(owner.user, randomUUID(), 'Result', template)).status, 404);
  assert.equal((await s.inject(owner.user, owner.requestId, 'Report', template)).status, 403);
  const current = await s.status(owner.user, owner.intake);
  assert.equal(current.processing, 'QUEUED');
  assert.deepEqual(await counts(), { requests: 1, consents: 1, attempts: 1, receipts: 0, catches: 0, registrations: 0 });
});

test('수신 메타데이터 저장에 실패하면 수신 성공으로 표시하지 않고 같은 메시지를 다시 수신할 수 있다', async t => {
  const s = await start(t);
  const { user, intake, requestId } = await accepted(s, 'storage');
  const template = read('results/succeeded-one-candidate.json');
  await db.query('ALTER TABLE result_application_record ADD CONSTRAINT test_receipt_fail CHECK (false) NOT VALID');
  let failed;
  try { failed = await s.inject(user, requestId, 'Result', template, 'storage'); }
  finally { await db.query('ALTER TABLE result_application_record DROP CONSTRAINT test_receipt_fail'); }
  assert.equal(failed.status, 500, failed.text);
  assert.equal(failed.body.code, 'INTERNAL_ERROR');
  assert.equal(failed.text.includes('test_receipt_fail'), false);
  assert.equal(failed.text.includes('receipt'), false);
  assert.deepEqual(await counts(), { requests: 1, consents: 1, attempts: 1, receipts: 0, catches: 0, registrations: 0 });
  const unchanged = await s.status(user, intake);
  assert.equal(unchanged.processing, 'QUEUED');
  assert.equal(unchanged.lifecycle, 'ACTIVE');
  assert.equal(unchanged.application, 'NOT_READY');
  // 실패한 전달은 수신으로 남지 않아, 제약을 풀면 같은 메시지가 새 결과로 수락된다.
  const retried = await s.inject(user, requestId, 'Result', template, 'storage');
  assert.equal(retried.body.receipt.disposition, 'ACCEPTED');
  assert.equal((await s.status(user, intake)).application, 'APPLIED');
  assert.equal((await counts()).receipts, 1);
});

test('개발 주입을 켜지 않으면 접수한 요청에도 주입하지 못하고, 제품 AppModule에는 주입 경로가 없다', async t => {
  const off = await start(t, { injection: false });
  const { user, intake, requestId } = await accepted(off, 'blocked');
  const before = await counts();
  const blocked = await off.inject(user, requestId, 'Result', read('results/succeeded-one-candidate.json'), 'blocked');
  assert.equal(blocked.status, 403);
  assert.deepEqual(await counts(), before);
  assert.equal((await off.status(user, intake)).processing, 'QUEUED');
  await off.app.close();

  // 시험용 조립을 뺀 제품 AppModule: 주입 제공자도, 주입·worker 수신 경로도 없다.
  process.env.DEV_ANALYSIS_INJECTION_ENABLED = 'true';
  const product = await configureApp(await NestFactory.create(AppModule,
    { logger: false, abortOnError: false }));
  t.after(async () => { await product.close(); });
  await product.listen(0, '127.0.0.1');
  assert.throws(() => product.get(DevAnalysisInjection, { strict: false }));
  const base = await product.getUrl();
  const token = (await (await fetch(base + '/v1/auth/dev-login', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId: 'intake-receiver-product' }) })).json()).accessToken;
  for (const path of [`/v1/__test/analysis-receiver/${requestId}`, `/v1/analysis-requests/${requestId}/results`,
    `/v1/worker/results`, `/v1/analysis-injection/${requestId}`]) {
    const response = await fetch(base + path, { method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 404, path);
  }
});

test('10월 정책으로 실제 접수·Catch 저장·본인 조회·확인·공개·숨김을 연결한다', async t => {
  const s = await start(t);
  const { user, requestId, intake } = await accepted(s, 'october-policy');
  const result = await s.inject(user, requestId, 'Result', read('results/succeeded-one-candidate.json'), 'october-policy');
  assert.equal(result.status, 201, result.text);
  assert.equal(result.body.receipt.disposition, 'ACCEPTED');
  const [catchId] = result.body.application.registeredCatchIds;
  const [protection] = await db.query('SELECT * FROM repository_protection');
  assert.equal(protection.applied_restriction, 'NONE');
  assert.deepEqual(protection.confirmed_source_state, { observation: 'NOT_OBSERVED', sourceMode: 'MOCK' });
  assert.equal(protection.observation_provenance.description, '10월 관측 안 함(9/28 결정)');
  assert.equal(protection.observation_provenance.requestId, requestId);
  assert.ok(Number.isFinite(protection.observed_at.getTime()));
  const auth = { Authorization: 'Bearer ' + user.token };
  const detailPath = '/v1/catches/' + catchId;
  const detail = await s.call(detailPath, { headers: auth });
  assert.equal(detail.status, 200);
  assert.equal((await detail.json()).visibility, 'PRIVATE');
  const list = await s.call('/v1/catches?repositoryId=' + encodeURIComponent(SYNTHETIC_REPOSITORY.repositoryId), { headers: auth });
  assert.deepEqual((await list.json()).items.map(item => item.catchId), [catchId]);
  const other = await s.login('october-other');
  assert.equal((await s.call(detailPath, { headers: { Authorization: 'Bearer ' + other.token } })).status, 404);
  const publicCatches = new PublicCatchStore(db);
  assert.deepEqual((await publicCatches.list(user.memberId, {})).catches, []);
  const put = (suffix, body) => s.call(detailPath + suffix, { method: 'PUT',
    headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await put('/visibility', { visibility: 'PUBLIC' })).status, 409);
  const confirmed = await put('/confirmation', { workFactsConfirmed: true, contributionConfirmed: true });
  assert.equal(confirmed.status, 200);
  assert.equal((await confirmed.json()).visibility, 'PRIVATE');
  assert.deepEqual((await publicCatches.list(user.memberId, {})).catches, []);
  assert.equal((await put('/visibility', { visibility: 'PUBLIC' })).status, 200);
  assert.equal((await publicCatches.get(user.memberId, catchId)).catchId, catchId);
  assert.equal((await put('/visibility', { visibility: 'PRIVATE' })).status, 200);
  assert.deepEqual((await publicCatches.list(user.memberId, {})).catches, []);
  assert.equal((await s.status(user, intake)).application, 'APPLIED');
  const repeated = await s.inject(user, requestId, 'Result', read('results/succeeded-one-candidate.json'), 'october-policy');
  assert.equal(repeated.body.receipt.disposition, 'DUPLICATE');
  assert.equal((await counts()).catches, 1);
  assert.deepEqual(await db.query('SELECT * FROM repository_protection'), [protection]);
});

// #114 기준 5: 위 시험은 다시 숨긴 뒤 재전달한다. 공개 상태에서 온 재전달도 Catch·근거·확인·공개 상태를 바꾸지 않는다.
for (const file of ['succeeded-one-candidate', 'two-candidates-same-work']) {
  test(`공개로 바꾼 Catch에 같은 결과(${file})가 다시 와도 Catch·근거·등록·확인·공개 상태를 그대로 둔다`, async t => {
    const s = await start(t);
    const { user, requestId, intake } = await accepted(s, 'public-' + file);
    const template = read(`results/${file}.json`);
    const first = await s.inject(user, requestId, 'Result', template, 'public-' + file);
    assert.equal(first.body.receipt.disposition, 'ACCEPTED');
    const [catchId] = first.body.application.registeredCatchIds;
    const headers = { Authorization: 'Bearer ' + user.token, 'Content-Type': 'application/json' };
    const put = (suffix, body) => s.call(`/v1/catches/${catchId}${suffix}`, { method: 'PUT', headers, body: JSON.stringify(body) });
    assert.equal((await put('/confirmation', { workFactsConfirmed: true, contributionConfirmed: true })).status, 200);
    assert.equal((await put('/visibility', { visibility: 'PUBLIC' })).status, 200);
    const TABLES = ['catch_asset', 'catch_evidence', 'candidate_registration', 'repository_protection', 'result_application_record'];
    const before = await tableRows(TABLES);
    for (const table of TABLES) assert.ok(before[table].length > 0, `${table}에 비교할 행이 있어야 한다`);
    assert.equal(before.catch_asset.length, 1);
    assert.equal(before.catch_asset[0].visibility, 'PUBLIC');
    assert.equal(before.catch_asset[0].work_facts_confirmed, true);
    const settled = await s.status(user, intake);
    const again = await s.inject(user, requestId, 'Result', template, 'public-' + file);
    assert.equal(again.status, 201, again.text);
    assert.deepEqual([again.body.receipt.disposition, again.body.receipt.code], ['DUPLICATE', 'ALREADY_RECEIVED']);
    assert.equal(again.body.application, undefined);
    assert.deepEqual(await tableRows(TABLES), before);
    assert.deepEqual(await s.status(user, intake), settled);
  });
}

// #114 IV-17·IV-18: 한 개발 회원이 합성 저장소 두 개로, 실제 접수부터 반영 실패 → 닫기 → 같은 결과 재전달 → 새 동의 재요청을 잇는다.
// 저장소 B는 위 좌표 어댑터가 모르는 저장소라 좌표 없음으로 반영이 실패한다(실패는 시험에서 강제). 닫기는 main만 주기 실행하므로
// 처리 시한 서비스를 직접 부르고, 새 분석을 보내지 않는지는 실제 보내기 코드를 메모리 요청 큐에 붙여 본다.
test('반영에 실패한 요청은 같은 결과로 다시 반영하지 않고 닫히며, 새 동의로 다시 요청해도 다른 요청의 Catch·링크는 그대로다', async t => {
  const s = await start(t);
  const second = secondRepository(s.app);
  const user = await s.login('intake-receiver-apply-failure-chain');
  const headers = { Authorization: 'Bearer ' + user.token, 'Content-Type': 'application/json' };
  const template = read('results/succeeded-one-candidate.json');

  // 저장소 A: 정상 반영된 Catch를 확인·공개한다. 끝까지 바뀌지 않아야 할 기존 자료다.
  const a = await s.submit(user);
  const applied = await s.inject(user, a.status.requestId, 'Result', template, 'chain-a');
  assert.equal(applied.body.receipt.disposition, 'ACCEPTED');
  const [catchId] = applied.body.application.registeredCatchIds;
  const put = (suffix, body) => s.call(`/v1/catches/${catchId}${suffix}`, { method: 'PUT', headers, body: JSON.stringify(body) });
  assert.equal((await put('/confirmation', { workFactsConfirmed: true, contributionConfirmed: true })).status, 200);
  assert.equal((await put('/visibility', { visibility: 'PUBLIC' })).status, 200);
  // 10월 공유 링크 발급·수신자 Catch 상세 경로는 U4 제출 3(W6)에서 발행본 흐름으로 대체돼 여기서는 쓰지 않는다. 받은 사람 열람이 원본 변경과
  // 무관하게 고정 사본을 돌려주는 것은 test/publications/recipient-api.test.cjs·publications-manage-api.test.cjs(S10)가 본다.
  const KEPT = ['catch_asset', 'catch_evidence', 'candidate_registration', 'repository_protection'];
  const kept = await tableRows(KEPT);
  for (const table of KEPT) assert.ok(kept[table].length > 0, `${table}에 지킬 행이 있어야 한다`);
  const requestA = await requestRows(a.status.requestId);

  // 저장소 B: 실제 접수 → 결과 수신 → 반영 실패. 수신 기록은 남고 Catch는 생기지 않는다.
  const b = await s.submit(user, randomUUID(), { repositoryId: second.repositoryId });
  const failed = await s.inject(user, b.status.requestId, 'Result', template, 'chain-b');
  assert.equal(failed.status, 500, failed.text);
  assert.equal(failed.body.code, 'INTERNAL_ERROR');
  const receipts = await tableRows(['result_application_record']);
  assert.equal(receipts.result_application_record.length, 2);
  const unresolved = await s.status(user, b);
  assert.deepEqual([unresolved.application, unresolved.lifecycle], ['APPLY_FAILED', 'ACTIVE']);
  assert.deepEqual(await tableRows(KEPT), kept);

  // 처리 시한 판정이 반영 실패 요청을 시한 전에 닫는다. A는 반영이 끝나 이미 닫혀 있어 대상이 아니다.
  assert.deepEqual(await s.app.get(AnalysisDeadlineService).closeOverdue(), { closed: 1, failed: 0 });
  const closed = await s.status(user, b);
  assert.deepEqual([closed.processing, closed.application, closed.lifecycle], ['SUCCEEDED', 'APPLY_FAILED', 'CLOSED']);
  assert.deepEqual(closed.registeredCatchIds, []);
  assert.equal(closed.ownerResultsReady, false);
  assert.deepEqual(closed.retry, { allowed: true, reason: 'FAILURE_WITHOUT_RESULTS' });
  const requestB = await requestRows(b.status.requestId);

  // 같은 결과가 다시 와도 이미 받은 것으로 답할 뿐 반영을 다시 시도하지 않는다.
  const again = await s.inject(user, b.status.requestId, 'Result', template, 'chain-b');
  assert.equal(again.status, 201, again.text);
  assert.deepEqual([again.body.receipt.disposition, again.body.receipt.code], ['DUPLICATE', 'ALREADY_RECEIVED']);
  assert.equal(again.body.application, undefined);
  assert.deepEqual(await s.status(user, b), closed);

  // 새 분석을 보내지 않는다: 보내기 대상에 A·B의 시도가 없다.
  const queue = new MemoryRequestQueue();
  const dispatcher = new AnalysisRequestDispatcher(db, queue, new WorkerMessageValidator(CONTRACT_DIR), dispatchLog());
  assert.deepEqual(await dispatcher.dispatchOnce(), { read: 0, enqueued: 0, existing: 0, skipped: 0, paused: null });

  // 사용자가 새 동의로 다시 요청하면 새 요청·동의·시도가 생기고, 보내기 대상은 그 새 시도뿐이다.
  const retry = await s.submit(user, randomUUID(), { repositoryId: second.repositoryId, retryOfRequestId: b.status.requestId });
  for (const field of ['requestId', 'consentId', 'attemptId']) assert.notEqual(retry.status[field], b.status[field]);
  assert.deepEqual([retry.status.processing, retry.status.application, retry.status.lifecycle], ['QUEUED', 'NOT_READY', 'ACTIVE']);
  assert.equal((await requestOf(retry.status.requestId)).retry_of_request_id, b.status.requestId);
  assert.deepEqual(await dispatcher.dispatchOnce(), { read: 1, enqueued: 1, existing: 0, skipped: 0, paused: null });
  assert.deepEqual([...queue.jobs.keys()], [retry.status.attemptId]);

  // 다른 요청의 Catch·근거·보호 기록, 두 원 요청과 수신 기록이 그대로다.
  assert.deepEqual(await tableRows(KEPT), kept);
  assert.deepEqual(await tableRows(['result_application_record']), receipts);
  assert.deepEqual(await requestRows(a.status.requestId), requestA);
  assert.deepEqual(await requestRows(b.status.requestId), requestB);
});

for (const [label, findForRegistration] of [
  ['좌표 없음', async () => null],
  ['다른 시도', async context => ({ ...context, attemptId: randomUUID(), githubRepository: { owner: 'synthetic', name: 'repo' } })],
  ['조회 실패', async () => { throw Error('synthetic-secret-coordinate-error'); }],
]) {
  test(`10월 공급자 ${label}: 실제 수신은 남기고 Catch·보호 기록 없이 반영 실패`, async t => {
    const s = await start(t, { protection: new OctoberRepositoryObservationSource({ findForRegistration }) });
    const { user, requestId, intake } = await accepted(s, label);
    const response = await s.inject(user, requestId, 'Result', read('results/succeeded-one-candidate.json'), label);
    assert.equal(response.status, 500, response.text);
    assert.equal(response.body.code, 'INTERNAL_ERROR');
    assert.equal((await s.status(user, intake)).application, 'APPLY_FAILED');
    assert.equal((await counts()).receipts, 1);
    assert.equal((await counts()).catches, 0);
    assert.deepEqual(await db.query('SELECT * FROM repository_protection'), []);
    assert.equal((response.text + s.logs.join('\n')).includes('synthetic-secret-coordinate-error'), false);
  });
}

test('10월 정책 저장 후 Catch 근거 저장이 실패하면 같은 반영 트랜잭션을 모두 되돌린다', async t => {
  const s = await start(t);
  const { user, requestId, intake } = await accepted(s, 'october-rollback');
  await db.query('ALTER TABLE catch_evidence ADD CONSTRAINT test_october_fail CHECK (false) NOT VALID');
  let response;
  try { response = await s.inject(user, requestId, 'Result', read('results/succeeded-one-candidate.json'), 'october-rollback'); }
  finally { await db.query('ALTER TABLE catch_evidence DROP CONSTRAINT test_october_fail'); }
  assert.equal(response.status, 500, response.text);
  assert.deepEqual(await counts(), { requests: 1, consents: 1, attempts: 1, receipts: 1, catches: 0, registrations: 0 });
  assert.deepEqual(await db.query('SELECT * FROM repository_protection'), []);
  const status = await s.status(user, intake);
  assert.equal(status.application, 'APPLY_FAILED');
  assert.equal(status.ownerResultsReady, false);
});

const STATUS_TABLES = ['analysis_request', 'analysis_consent', 'analysis_attempt', 'idempotency_record',
  'result_application_record', 'candidate_registration', 'catch_asset'];

// #140: 실제 접수(#138) → 개발 주입·DB 수신(#139) → 반영·B 등록(#105)으로 만든 상태를 조회 API로 읽는다. 사례 목록은 #103 공용 합성 세트다.
// 조회 응답은 같은 키 재응답(접수의 잠금 판정)과 같아야 하고, 조회는 행을 바꾸지 않는다.
test('#140 #103 사례별 실제 접수 → 개발 주입 → DB 수신·반영 상태를 개별 상태·이력 조회 API가 같은 키 재응답과 같게 읽는다', async t => {
  const s = await start(t);
  const settled = [];
  for (const entry of manifest.cases) {
    let current = null;
    for (const [index, message] of entry.messages.entries()) {
      if (!current || entry.delivery === 'SEPARATE_REQUESTS') {
        current = { ...await accepted(s, `history-${entry.caseId}-${index}`), entry };
        settled.push(current);
      }
      const response = await s.inject(current.user, current.requestId, message.schema, read(message.file), entry.caseId);
      assert.equal(response.status, 201, response.text);
      current.expected = message.expected;
    }
  }
  const rows = await tableRows(STATUS_TABLES);
  const reads = [];
  for (const item of settled) {
    const one = await s.lookup(item.user, item.requestId);
    assert.equal(one.status, 200);
    reads.push({ item, one: one.body, listed: await s.history(item.user) });
  }
  assert.deepEqual(await tableRows(STATUS_TABLES), rows, '조회는 수신·반영 결과를 바꾸지 않는다');
  for (const { item, one, listed } of reads) {
    const label = item.entry.caseId;
    assert.deepEqual(listed, { items: [one], page: { nextCursor: null } }, label);
    assert.deepEqual(one, await s.status(item.user, item.intake), label);
    assert.equal(one.processing, item.expected.processingAfter, label);
    // 결과 진입 대상은 B가 본인 열람 준비를 마친 원 요청의 Catch뿐이다.
    const catches = await db.query('SELECT catch_id FROM catch_asset WHERE source_request_id = $1 ORDER BY catch_id', [item.requestId]);
    assert.equal(catches.length, item.expected.catchesAfter, label);
    assert.deepEqual([...one.registeredCatchIds].sort(), catches.map(row => row.catch_id), label);
    assert.equal(one.ownerResultsReady, catches.length > 0, label);
  }
  const byCase = caseId => reads.filter(entry => entry.item.entry.caseId === caseId).map(entry => entry.one);
  const pick = status => [status.processing, status.application, status.lifecycle, status.eligibleCandidateCount, status.retry];
  // 정상 0건은 정상 완료로 닫히며, 아직 처리 전이라 후보 수가 0인 대기 요청과 구분된다.
  assert.deepEqual(pick(byCase('empty')[0]), ['EMPTY', 'APPLIED', 'CLOSED', 0, { allowed: true, reason: 'ANALYSIS_FINISHED' }]);
  assert.deepEqual(pick(byCase('unidentifiable')[0]), ['QUEUED', 'NOT_READY', 'ACTIVE', 0, { allowed: false, reason: 'IN_PROGRESS' }]);
  assert.deepEqual(pick(byCase('failed')[0]), ['FAILED', 'APPLIED', 'CLOSED', 0, { allowed: true, reason: 'FAILURE_WITHOUT_RESULTS' }]);
  const [running, uncertain] = byCase('progress-events');
  assert.deepEqual(pick(running), ['RUNNING', 'NOT_READY', 'ACTIVE', 0, { allowed: false, reason: 'IN_PROGRESS' }]);
  assert.deepEqual(pick(uncertain), ['UNCERTAIN', 'NOT_READY', 'ACTIVE', 0, { allowed: false, reason: 'EXECUTION_UNCERTAIN' }]);
  // 같은 작업을 가리키는 두 후보는 B 등록 연결 두 건이지만 결과 진입 Catch ID는 하나다.
  const sameWork = reads.find(entry => entry.item.entry.caseId === 'two-candidates-same-work');
  const links = await db.query(`SELECT cr.catch_id FROM candidate_registration cr JOIN result_application_record r
    ON r.application_record_id = cr.application_record_id WHERE r.request_id = $1`, [sameWork.item.requestId]);
  assert.equal(links.length, 2);
  assert.deepEqual(sameWork.one.registeredCatchIds, [links[0].catch_id]);
  // 다른 회원의 요청 ID는 없는 요청과 같은 404다.
  const foreign = await s.lookup(reads[0].item.user, reads[1].item.requestId);
  const missing = await s.lookup(reads[0].item.user, randomUUID());
  assert.deepEqual([foreign.status, missing.status, missing.body.code], [404, 404, 'RESOURCE_UNAVAILABLE']);
  assert.deepEqual(foreign.body, missing.body);
});

test('#140 반영 실패 → 처리 시한 닫기 → 실패 재요청까지의 이력을 조회 API가 같은 키 재응답과 같게 읽는다', async t => {
  const s = await start(t);
  const second = secondRepository(s.app);
  const user = await s.login('history-apply-failure-chain');
  const template = read('results/succeeded-one-candidate.json');
  const a = await s.submit(user);
  const applied = await s.inject(user, a.status.requestId, 'Result', template, 'history-a');
  assert.equal(applied.body.receipt.disposition, 'ACCEPTED');
  // 저장소 B는 좌표 어댑터가 모르는 저장소라 반영이 실패한다(위 #114 연결 시험과 같은 강제 실패).
  const b = await s.submit(user, randomUUID(), { repositoryId: second.repositoryId });
  assert.equal((await s.inject(user, b.status.requestId, 'Result', template, 'history-b')).status, 500);

  // 닫히기 전 반영 실패: 처리 결과(SUCCEEDED)를 처리 실패로 바꾸지 않고 재요청도 열지 않는다.
  const unresolved = await s.lookup(user, b.status.requestId);
  assert.equal(unresolved.status, 200);
  assert.deepEqual(unresolved.body, await s.status(user, b));
  assert.deepEqual([unresolved.body.processing, unresolved.body.application, unresolved.body.lifecycle,
    unresolved.body.registeredCatchIds, unresolved.body.ownerResultsReady, unresolved.body.retry.allowed],
  ['SUCCEEDED', 'APPLY_FAILED', 'ACTIVE', [], false, false]);

  // 처리 시한 닫기 뒤 반영 실패로 닫힌 요청은 등록 Catch가 없으므로 재요청할 수 있다(PR #296).
  assert.deepEqual(await s.app.get(AnalysisDeadlineService).closeOverdue(), { closed: 1, failed: 0 });
  const closed = await s.lookup(user, b.status.requestId);
  assert.deepEqual(closed.body, await s.status(user, b));
  assert.deepEqual([closed.body.application, closed.body.lifecycle, closed.body.retry],
    ['APPLY_FAILED', 'CLOSED', { allowed: true, reason: 'FAILURE_WITHOUT_RESULTS' }]);

  const retry = await s.submit(user, randomUUID(), { repositoryId: second.repositoryId, retryOfRequestId: b.status.requestId });
  const before = await counts();
  const listed = await s.history(user);
  assert.deepEqual(listed.items.map(item => item.requestId), [retry.status.requestId, b.status.requestId, a.status.requestId]);
  assert.equal(listed.page.nextCursor, null);
  const [newest, failedApply, done] = listed.items;
  assert.deepEqual([newest.processing, newest.application, newest.lifecycle], ['QUEUED', 'NOT_READY', 'ACTIVE']);
  // 새 요청이 생긴 원 요청은 다시 재요청 대상으로 보이지 않는다.
  assert.deepEqual(failedApply.retry, { allowed: false, reason: 'IN_PROGRESS' });
  assert.deepEqual([done.registeredCatchIds, done.ownerResultsReady, done.retry],
    [applied.body.application.registeredCatchIds, true, { allowed: false, reason: 'IN_PROGRESS' }]);
  for (const [item, accepted] of [[newest, retry], [failedApply, b], [done, a]]) {
    assert.deepEqual((await s.lookup(user, item.requestId)).body, item);
    assert.deepEqual(await s.status(user, accepted), item);
  }
  const paged = [];
  let cursor = null;
  do {
    const page = await s.history(user, '?limit=1' + (cursor ? '&cursor=' + cursor : ''));
    paged.push(...page.items);
    cursor = page.page.nextCursor;
  } while (cursor);
  assert.deepEqual(paged, listed.items);
  // 조회·재응답은 새 요청·시도·수신 기록·Catch를 만들지 않는다.
  assert.deepEqual(await counts(), before);
});

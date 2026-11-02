require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { before, after, beforeEach, test } = require('node:test');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const { readInitialSelection, restoreInitialSelection } = require('../support/repository-selection.cjs');
const { u7Fixture } = require('../support/u7-fixture.cjs');
const { ApiError } = require('../../dist/common/errors');
const { AnalysisRequest, AnalysisAttempt, AnalysisConsent, GitHubConnection } = require('../../dist/member-analysis/member-analysis.entity');
let db, initial, calls, deny, broken;
const provider = { async consume(memberId, kind, now, manager) {
  calls++; assert.equal(kind, 'ANALYSIS'); assert.ok(now instanceof Date); assert.equal(manager.queryRunner.isTransactionActive, true);
  if (deny) return 'LIMIT_REACHED';
  await manager.query('INSERT INTO u7_test_consumption VALUES ($1)', [memberId]);
  if (broken) throw new Error('synthetic consumer failed');
  return 'ALLOWED';
} };
before(async () => { db = await openTestDataSource(); initial = await readInitialSelection(db); await db.query('CREATE TABLE u7_test_consumption (member_id uuid NOT NULL)'); });
after(async () => { await db?.query('DROP TABLE IF EXISTS u7_test_consumption'); await db?.destroy(); });
beforeEach(async () => { await resetTestDatabase(db); await restoreInitialSelection(db, initial); calls = 0; deny = false; broken = false; });
const used = async () => (await db.query('SELECT count(*)::int n FROM u7_test_consumption'))[0].n;
async function terminal(status, processing = 'FAILED', application = 'APPLIED', extra = {}) {
  await db.manager.update(AnalysisAttempt, { attemptId: status.attemptId }, { processing, application,
    failures: [{ stage: 'COLLECTION', code: 'SYNTHETIC_FAILURE', message: '합성 확정 실패' }],
    failureConfirmationReference: 'synthetic-confirmed', ...extra });
  await db.manager.update(AnalysisRequest, { requestId: status.requestId }, { lifecycle: 'CLOSED' });
}
test('C2 새 등록·현재 동의는 불변 좌표 사본과 한 번 소비로 접수된다', async () => {
  const f = await u7Fixture(db, provider); assert.equal(calls, 0); const { status } = await f.create();
  const request = await db.manager.findOneByOrFail(AnalysisRequest, { requestId: status.requestId });
  const consent = await db.manager.findOneByOrFail(AnalysisConsent, { consentId: request.consentId });
  assert.equal(request.registrationId, f.registration.registrationId);
  assert.equal(consent.consentedScope.registrationId, f.registration.registrationId);
  assert.equal(consent.consentedScope.repository.url, f.registration.url);
  assert.equal(await used(), 1); assert.equal(status.ownCommitObservation, 'UNKNOWN');
});
test('C2 없거나 낡은 동의·미등록 저장소는 한도를 소비하지 않는다', async () => {
  const f = await u7Fixture(db, provider);
  for (const body of [{ repositoryId: '123456' }, { ...f.input(), consent: { ...f.input().consent, accepted: false } },
    { ...f.input(), consent: { ...f.input().consent, noticeRevision: 'old' } }, { ...f.input(), consent: { ...f.input().consent, scopeRevision: 'old' } },
    { ...f.input(), repositoryId: '999999' }]) await assert.rejects(f.create(randomUUID(), body));
  assert.equal(calls, 0); assert.equal(await db.manager.count(AnalysisRequest), 0);
});
test('C2 외부 확인 뒤 연결 교체와 등록 범위 변경을 접수 잠금 안에서 재대조한다', async () => {
  const f = await u7Fixture(db, provider); const verify = f.client.verify;
  f.client.verify = async coords => { await db.manager.update(GitHubConnection, { memberId: f.memberId }, { credentialReference: 'github-v1:' + randomUUID() }); return verify(coords); };
  await assert.rejects(f.create(), e => e.code === 'GITHUB_CONNECTION_REQUIRED'); assert.equal(calls, 0);
});
test('C2 접수의 공개 확인 실패는 404 계열과 장애 안내를 구분하고 동의·한도를 저장하지 않는다', async () => {
  for (const [code, message] of [
    ['REPOSITORY_PRIVATE', '비공개이거나 없는 저장소라 확인할 수 없습니다. 공개 저장소 주소인지 확인해 주세요.'],
    ['REPOSITORY_UNVERIFIED', 'GitHub에서 저장소를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.'],
  ]) {
    const f = await u7Fixture(db, provider);
    f.client.verify = async () => { throw new ApiError(code); };
    await assert.rejects(f.create(), error => {
      assert.equal(error.code, code); assert.equal(error.getResponse().message, message); return true;
    });
  }
  assert.equal(calls, 0); assert.equal(await used(), 0);
  assert.equal(await db.manager.count(AnalysisConsent), 0);
  assert.equal(await db.manager.count(AnalysisRequest), 0);
});
test('C2 동일 키 재응답·동시 접수·같은 ACTIVE의 다른 키는 중복 소비하지 않는다', async () => {
  const f = await u7Fixture(db, provider), key = randomUUID();
  const outcomes = await Promise.all([f.create(key), f.create(key), f.create()]);
  assert.equal(new Set(outcomes.map(r => r.status.requestId)).size, 1); assert.equal(calls, 1);
  const checks = f.checks(); f.github.refreshStatus = async () => { throw new Error('must not refresh'); };
  assert.equal((await f.create(key)).existing, true); assert.equal(f.checks(), checks); assert.equal(await used(), 1);
});
test('C2 한도 도달은 429 DAILY_LIMIT_REACHED로 거부하며 남은 횟수를 노출하지 않는다', async () => {
  const f = await u7Fixture(db, provider); deny = true;
  await assert.rejects(f.create(), e => { assert.equal(e.getStatus(), 429); assert.equal(e.code, 'DAILY_LIMIT_REACHED'); assert.equal(JSON.stringify(e.getResponse()).includes('remaining'), false); return true; });
  assert.equal(await used(), 0); assert.equal(await db.manager.count(AnalysisRequest), 0);
});
test('C2 소비와 접수는 함께 롤백하고 실행 실패에는 소비를 환급하지 않는다', async () => {
  const f = await u7Fixture(db, provider); broken = true; const key = randomUUID();
  await assert.rejects(f.create(key), /synthetic consumer failed/); assert.equal(await used(), 0);
  broken = false; const { status } = await f.create(key); await terminal(status); assert.equal(await used(), 1);
  const missing = await u7Fixture(db, undefined); await assert.rejects(missing.create(), e => e.code === 'INTERNAL_ERROR');
});
test('C2 두 허용 실패 분기는 새 동의·키·요청 연결과 한도를 요구한다', async () => {
  for (const [processing, application] of [['FAILED', 'APPLIED'], ['SUCCEEDED', 'APPLY_FAILED']]) {
    const f = await u7Fixture(db, provider); const first = await f.create(); await terminal(first.status, processing, application);
    const second = await f.create(randomUUID(), { ...f.input(), retryOfRequestId: first.status.requestId });
    assert.notEqual(second.status.consentId, first.status.consentId); assert.notEqual(second.status.requestId, first.status.requestId);
    assert.equal((await db.manager.findOneByOrFail(AnalysisRequest, { requestId: second.status.requestId })).retryOfRequestId, first.status.requestId);
  }
  assert.equal(await used(), 4);
});
test('C2 종료된 최신 분석은 결과와 무관하게 새 동의·하루 제한으로 재분석한다', async () => {
  for (const [processing, application, extra] of [['EMPTY','APPLIED',{}], ['PARTIAL_FAILED','APPLIED',{eligibleCandidateCount:1}],
    ['UNCERTAIN','APPLIED',{}], ['SUCCEEDED','APPLIED',{ownerResultsReady:true}], ['FAILED','APPLIED',{failureConfirmationReference:null}]]) {
    const f = await u7Fixture(db, provider); const first = await f.create(); await terminal(first.status, processing, application, extra);
    deny = true;
    const body = { ...f.input(), retryOfRequestId: first.status.requestId };
    await assert.rejects(f.create(randomUUID(), body), e => e.code === 'DAILY_LIMIT_REACHED');
    deny = false;
    await assert.rejects(f.create(randomUUID(), { ...body, consent: { ...body.consent, accepted: false } }));
    const key = randomUUID(), next = await f.create(key, body);
    assert.notEqual(next.status.requestId, first.status.requestId);
    assert.notEqual(next.status.consentId, first.status.consentId);
    assert.equal((await f.create(key, body)).status.requestId, next.status.requestId);
  }
  assert.equal(await used(), 10);
});
test('C2 진행·반영·복구 중에는 재분석을 접수하거나 한도를 소비하지 않는다', async () => {
  for (const application of ['NOT_READY', 'PENDING', 'APPLYING', 'RECOVERING']) {
    const f = await u7Fixture(db, provider), first = await f.create();
    await terminal(first.status, 'FAILED', application);
    await assert.rejects(f.create(randomUUID(), { ...f.input(), retryOfRequestId: first.status.requestId }), e => e.code === 'RETRY_NOT_ALLOWED');
  }
  assert.equal(await used(), 4);
});

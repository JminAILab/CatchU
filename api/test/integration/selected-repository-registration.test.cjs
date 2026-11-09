require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { before, after, beforeEach, test } = require('node:test');
const { NestFactory } = require('@nestjs/core');
const { DataSource } = require('typeorm');
const { resetTestDatabase } = require('../support/test-database.cjs');
const { CONTRACT_DIR } = require('../helpers/receiver-harness.cjs');
const { MemberAccount, AnalysisRequest, AnalysisAttempt } = require('../../dist/member-analysis/member-analysis.entity');
const { insertCurrentAnalysis: insertInitialAnalysis } = require('../support/registered-analysis.cjs');
const { SelectedRepositoryCatalog } = require('../../dist/member-repositories/selected-repository-catalog');
const { SelectedRepositoryRegistrationSource } = require('../../dist/analysis-receiver/selected-repository-registration.source');
const { OctoberRepositoryObservationSource } = require('../../dist/analysis-receiver/october-repository-observation.source');
const { AnalysisReceiverModule } = require('../../dist/analysis-receiver/analysis-receiver.module');
const { AnalysisRegistrationService, AnalysisRegistrationError } = require('../../dist/analysis-receiver/analysis-registration.service');
const { AnalysisQueueModule } = require('../../dist/analysis-queue/analysis-queue.module');
const { OwnerCatchStore } = require('../../dist/catches/owner-catch-store');
let app, db, service, factoryCalls = 0;
const catalog = new SelectedRepositoryCatalog();
before(async () => {
  app = await NestFactory.createApplicationContext(AnalysisReceiverModule.registerDatabase({
    contractDirectory: CONTRACT_DIR,
    observationsFactory: database => {
      assert.ok(database.isInitialized);
      factoryCalls++;
      return new OctoberRepositoryObservationSource(new SelectedRepositoryRegistrationSource(database, catalog));
    },
  }), {logger: false});
  db = app.get(DataSource);
  service = app.get(AnalysisRegistrationService);
});
after(async () => { await app?.close(); });
beforeEach(async () => { await resetTestDatabase(db); });

// 실제 좌표 + 합성 동의/결과로 내부 저장 경로만 검사한다. 실제 접수·GitHub·LLM 호출은 없다.
async function prepare(version, selectionReference = version.selectionReference) {
  const member = Object.assign(new MemberAccount(), {identityReference: `fixture:${randomUUID()}`, accountState: 'ACTIVE'});
  await db.manager.insert(MemberAccount, member);
  const scopeRevision = 'fixture-scope-not-product-approved';
  const request = await db.transaction(manager => insertInitialAnalysis(manager, {
    memberId: member.memberId, repositoryId: version.repositoryId, sourceMode: 'LIVE',
    noticeRevision: 'fixture-notice-not-product-approved', scopeRevision,
    consentedScope: {revision: scopeRevision, repositoryId: version.repositoryId,
      allowedResourceTypes: ['COMMIT'], selectionReference},
  }));
  const context = {requestId: request.requestId, attemptId: request.currentAttemptId,
    memberId: member.memberId, repositoryId: version.repositoryId, consentId: request.consentId,
    scopeRevision, caseId: randomUUID()};
  const template = readFileSync(resolve(__dirname, '../../../worker/fixtures/m1-synthetic/results/succeeded-one-candidate.json'), 'utf8');
  const result = JSON.parse(template.replace(/\{\{(\w+)\}\}/g, (_, key) => context[key]));
  result.sourceMode = 'LIVE';
  for (const candidate of result.candidates) for (const evidence of candidate.evidence) {
    evidence.sourceUrl = `${version.url}/commit/synthetic-sha`;
  }
  return result;
}
const counts = async () => (await db.query(`SELECT
  (SELECT count(*)::int FROM catch_asset) AS catches,
  (SELECT count(*)::int FROM catch_evidence) AS evidence,
  (SELECT count(*)::int FROM candidate_registration) AS registrations,
  (SELECT count(*)::int FROM result_application_record) AS receipts`))[0];

for (const version of catalog.listCurrent()) {
  test(`${version.name}: Nest DB 공급 → 종결 결과 좌표 조회 → 본인 PRIVATE Catch 저장·중복 보존`, async () => {
    assert.equal(factoryCalls, 1);
    const result = await prepare(version);
    const accepted = await service.receiveResult(result, async receipt => assert.equal(receipt.disposition, 'ACCEPTED'));
    assert.equal(accepted.application.registeredCatchIds.length, 1);
    assert.deepEqual(await counts(), {catches: 1, evidence: 1, registrations: 1, receipts: 1});
    const catchId = accepted.application.registeredCatchIds[0];
    const [asset] = await db.query('SELECT * FROM catch_asset WHERE catch_id = $1', [catchId]);
    assert.equal(asset.owner_id, result.memberId);
    assert.equal(asset.source_request_id, result.requestId);
    assert.equal(asset.visibility, 'PRIVATE');
    const state = await db.manager.findOneByOrFail(AnalysisAttempt, {attemptId: result.attemptId});
    assert.equal(state.processing, 'SUCCEEDED');
    assert.equal(state.application, 'APPLIED');
    assert.equal((await db.manager.findOneByOrFail(AnalysisRequest, {requestId: result.requestId})).lifecycle, 'CLOSED');
    const owner = new OwnerCatchStore(db);
    assert.equal((await owner.list(result.memberId, {})).items[0].catchId, catchId);
    assert.equal((await owner.get(result.memberId, catchId)).catchId, catchId);
    assert.equal((await owner.get(result.memberId, catchId)).repositoryId, version.repositoryId);
    const replay = await service.receiveResult({...result, messageId: randomUUID()}, async () => {});
    assert.equal(replay.receipt.disposition, 'DUPLICATE');
    assert.deepEqual(await counts(), {catches: 1, evidence: 1, registrations: 1, receipts: 1});
  });
}

test('다른 실제 저장소의 근거는 승인한 좌표로 바꾸지 않고 반영 거부한다', async () => {
  const result = await prepare(catalog.listCurrent()[0]);
  result.candidates[0].evidence[0].sourceUrl = `${catalog.listCurrent()[1].url}/commit/synthetic-sha`;
  await assert.rejects(service.receiveResult(result, async () => {}), AnalysisRegistrationError);
  assert.deepEqual(await counts(), {catches: 0, evidence: 0, registrations: 0, receipts: 1});
  assert.equal((await db.manager.findOneByOrFail(AnalysisAttempt, {attemptId: result.attemptId})).application, 'APPLY_FAILED');
});

test('알 수 없는 등록 동의는 현재 목록이나 결과 URL로 보정하지 않고 수신부터 거부한다', async () => {
  const result = await prepare(catalog.listCurrent()[0], 'unknown-selection');
  const received = await service.receiveResult(result, async () => {});
  assert.equal(received.receipt.disposition, 'REJECTED');
  assert.deepEqual(await counts(), {catches: 0, evidence: 0, registrations: 0, receipts: 0});
});

test('수신 모듈은 객체 또는 DB 공급 함수 중 하나만 받고 큐 모듈도 같은 함수를 넘긴다', () => {
  assert.throws(() => AnalysisReceiverModule.registerDatabase({contractDirectory: CONTRACT_DIR}), /Exactly one/);
  const observations = {observe: async () => null};
  const observationsFactory = () => observations;
  assert.throws(() => AnalysisReceiverModule.registerDatabase({contractDirectory: CONTRACT_DIR,
    observations, observationsFactory}), /Exactly one/);
  assert.doesNotThrow(() => AnalysisReceiverModule.registerDatabase({contractDirectory: CONTRACT_DIR, observations}));
  const composed = AnalysisQueueModule.register({queue: {}, contractDirectory: CONTRACT_DIR, observationsFactory});
  const receiver = composed.imports.find(item => item.module === AnalysisReceiverModule);
  const provider = receiver.providers.find(item => item.provide === AnalysisRegistrationService);
  assert.ok(provider.useFactory({}, db) instanceof AnalysisRegistrationService);
});

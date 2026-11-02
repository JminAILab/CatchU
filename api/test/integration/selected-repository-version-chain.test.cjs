require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { before, after, beforeEach, test } = require('node:test');
const { NestFactory } = require('@nestjs/core');
const { DataSource } = require('typeorm');
const { resetTestDatabase } = require('../support/test-database.cjs');
const { CONTRACT_DIR, validator, result: makeResult } = require('../helpers/receiver-harness.cjs');
const { MemberAccount, GitHubConnection, AnalysisConsent, AnalysisAttempt } = require('../../dist/member-analysis/member-analysis.entity');
const { insertCurrentAnalysis: insertInitialAnalysis } = require('../support/registered-analysis.cjs');
const { buildRequestMessage } = require('../../dist/analysis-queue/analysis-request.dispatcher');
const { WorkerContextService } = require('../../dist/worker-context/worker-context.service');
const { GitHubAccessToken } = require('../../dist/github-connection/github.client');
const { SelectedRepositoryCatalog } = require('../../dist/member-repositories/selected-repository-catalog');
const { SelectedRepositoryRegistrationSource } = require('../../dist/analysis-receiver/selected-repository-registration.source');
const { OctoberRepositoryObservationSource } = require('../../dist/analysis-receiver/october-repository-observation.source');
const { AnalysisReceiverModule } = require('../../dist/analysis-receiver/analysis-receiver.module');
const { AnalysisRegistrationService, AnalysisRegistrationError } = require('../../dist/analysis-receiver/analysis-registration.service');
const { OwnerCatchStore } = require('../../dist/catches/owner-catch-store');

let app, db, service, catalog, workerContext, credentialCalls;
const fixtures = new Map(), selectionLocks = [];
const version = new SelectedRepositoryCatalog().listCurrent()[0];
const renamed = {...version, name: 'renamed-fixture', url: 'https://github.com/' + version.owner + '/renamed-fixture',
  selectionReference: 'fixture:renamed-coordinate-version'};

// #252의 현재 선정/전체 범위 판정과 GitHub 자격정보는 명시적 시험 대역이다.
// 실제 DB 요청·동의·시도, 큐 메시지 조립, 실행 조회와 Catch 저장을 연결한다.
// 실제 #252 선정 행 잠금·HTTP·Redis·GitHub 수집·LLM 실행을 검증하지 않는다. 실제 선정 공급의 같은 흐름은
// repository-selection-chain.test.cjs, 선정 행 잠금은 test/db/repository-selection-*.test.cjs에 있다.
const selectionSource = {resolve: async (manager, context, options) => {
  assert.ok([null, 'pessimistic_read'].includes(options.lock));
  if (options.lock) assert.equal(manager.queryRunner?.isTransactionActive, true);
  selectionLocks.push(options.lock);
  const fixture = fixtures.get(context.attemptId);
  // 자료 종류만으로 전체 동의를 추정하지 않는다. 미리 승인한 전체 범위와 활성 판정을 대조한다.
  if (!fixture?.active || !fixture.wholeRepository ||
      !isDeepStrictEqual(context.consentedScope, fixture.scope) ||
      ['attemptId', 'requestId', 'memberId', 'repositoryId', 'scopeRevision']
        .some(key => context[key] !== fixture.context[key])) return null;
  const selected = context.consentedScope.repository;
  if (!selected || !context.consentedScope.registrationId) return null;
  return {...fixture.context, repository: {owner: selected.owner, name: selected.name}, wholeRepository: true};
}};

before(async () => {
  app = await NestFactory.createApplicationContext(AnalysisReceiverModule.registerDatabase({
    contractDirectory: CONTRACT_DIR,
    observationsFactory: database => new OctoberRepositoryObservationSource(
      new SelectedRepositoryRegistrationSource(database, {resolve: reference => catalog.resolve(reference)})),
  }), {logger: false});
  db = app.get(DataSource);
  service = app.get(AnalysisRegistrationService);
  workerContext = new WorkerContextService(db, {resolveCredential: async memberId => {
    credentialCalls++;
    return {memberId, accountLogin: 'fixture-user', externalAccountReference: '123456',
      token: new GitHubAccessToken('SYNTHETIC_VERSION_CHAIN_TOKEN'), expiresAt: new Date(Date.now() + 3600000)};
  }}, selectionSource);
});
after(async () => { await app?.close(); });
beforeEach(async () => {
  await resetTestDatabase(db);
  catalog = new SelectedRepositoryCatalog([version], [version.selectionReference]);
  fixtures.clear(); selectionLocks.length = 0; credentialCalls = 0;
});

async function prepare() {
  const member = Object.assign(new MemberAccount(), {identityReference: 'fixture:' + randomUUID(), accountState: 'ACTIVE'});
  await db.manager.insert(MemberAccount, member);
  await db.manager.insert(GitHubConnection, Object.assign(new GitHubConnection(), {
    memberId: member.memberId, connectionState: 'CONNECTED', credentialReference: 'fixture:credential',
    accountLogin: 'fixture-user', externalAccountReference: '123456',
  }));
  let scope = {revision: 'fixture-approved-full-scope', repositoryId: version.repositoryId,
    allowedResourceTypes: ['COMMIT'], selectionReference: version.selectionReference};
  const request = await db.transaction(manager => insertInitialAnalysis(manager, {
    memberId: member.memberId, repositoryId: version.repositoryId, sourceMode: 'LIVE',
    noticeRevision: 'fixture-notice-not-product-approved', scopeRevision: scope.revision, consentedScope: scope,
  }));
  const context = {requestId: request.requestId, attemptId: request.currentAttemptId, memberId: member.memberId,
    repositoryId: version.repositoryId, scopeRevision: scope.revision};
  const consent = await db.manager.findOneByOrFail(AnalysisConsent, {consentId: request.consentId});
  scope = consent.consentedScope;
  fixtures.set(context.attemptId, {context, scope: structuredClone(scope), active: true, wholeRepository: true});
  const attempt = await db.manager.findOneByOrFail(AnalysisAttempt, {attemptId: context.attemptId});
  const built = buildRequestMessage({...context, registrationId: request.registrationId, submittedAt: request.submittedAt, sourceMode: attempt.sourceMode,
    consentId: consent.consentId, noticeRevision: consent.noticeRevision, scopeRevision: consent.scopeRevision,
    consentedScope: consent.consentedScope, consentedAt: consent.consentedAt}, validator);
  assert.ok(built.message, JSON.stringify(built));
  const message = built.message;
  assert.equal(message.allowedScope.selectionReference, context.attemptId);
  assert.equal(message.credentialContextReference, context.attemptId);
  assert.notEqual(message.allowedScope.selectionReference, scope.selectionReference);
  assert.equal(message.repositoryId, scope.repositoryId);
  assert.equal(message.allowedScope.repositoryId, scope.repositoryId);
  assert.equal(message.allowedScope.revision, scope.revision);
  const execution = await workerContext.read(message.credentialContextReference);
  assert.equal(execution.requestId, message.requestId);
  assert.equal(execution.attemptId, message.attemptId);
  assert.equal(execution.credential.repositoryId, message.repositoryId);
  assert.equal(execution.selection.repositoryId, message.repositoryId);
  assert.equal(execution.credential.scopeRevision, message.allowedScope.revision);
  assert.deepEqual(execution.credential.repository, {owner: version.owner, name: version.name});
  assert.deepEqual(selectionLocks, [null, 'pessimistic_read']);
  assert.equal(credentialCalls, 1);
  assert.deepEqual((await db.manager.findOneByOrFail(AnalysisConsent,
    {consentId: request.consentId})).consentedScope, scope, '큐 사본이 DB의 원래 좌표 참조를 바꾸지 않음');
  // 분석 결과의 좌표는 상수 fixture가 아니라 실행 조회가 돌려준 좌표에서 만든다.
  const coordinates = execution.credential.repository;
  const result = makeResult({...context, consentId: request.consentId, sourceMode: 'LIVE',
    resultId: randomUUID(), messageId: randomUUID(), finishedAt: new Date().toISOString()});
  result.candidates[0].evidence[0].sourceUrl = 'https://github.com/' + coordinates.owner + '/' + coordinates.name + '/commit/synthetic-sha';
  return {request, context, scope, result};
}
const counts = async () => (await db.query('SELECT ' +
  '(SELECT count(*)::int FROM catch_asset) AS catches, ' +
  '(SELECT count(*)::int FROM catch_evidence) AS evidence, ' +
  '(SELECT count(*)::int FROM result_application_record) AS receipts'))[0];

for (const change of ['현재 선정 제외', '같은 ID의 이름 판본 변경']) {
  test('실행 조회 뒤 ' + change + ': 원래 동의 판본으로 Catch를 저장한다', async () => {
    const {request, context, scope, result} = await prepare();
    fixtures.get(context.attemptId).active = false; // 실행 이후의 변화이며 새 실행 허가를 의미하지 않는다.
    catalog = change === '현재 선정 제외' ? new SelectedRepositoryCatalog([version], [])
      : new SelectedRepositoryCatalog([version, renamed], [renamed.selectionReference]);
    const received = await service.receiveResult(result, async receipt => assert.equal(receipt.disposition, 'ACCEPTED'));
    assert.equal(received.application.registeredCatchIds.length, 1);
    assert.deepEqual(await counts(), {catches: 1, evidence: 1, receipts: 1});
    const catchId = received.application.registeredCatchIds[0];
    const asset = await new OwnerCatchStore(db).get(context.memberId, catchId);
    assert.equal(asset.repositoryId, context.repositoryId);
    const [stored] = await db.query('SELECT source_url FROM catch_evidence WHERE catch_id = $1', [catchId]);
    assert.equal(stored.source_url, result.candidates[0].evidence[0].sourceUrl);
    assert.deepEqual((await db.manager.findOneByOrFail(AnalysisConsent, {consentId: request.consentId})).consentedScope, scope);
    assert.equal((await db.manager.findOneByOrFail(AnalysisAttempt, {attemptId: context.attemptId})).application, 'APPLIED');
    assert.equal(credentialCalls, 1, 'Catch 등록은 실행 허가나 GitHub 자격정보를 다시 조회하지 않음');
  });
}

test('같은 repositoryId·scopeRevision이라도 다른 좌표 판본의 근거는 Catch에 저장하지 않는다', async () => {
  const {context, result} = await prepare();
  catalog = new SelectedRepositoryCatalog([version, renamed], [renamed.selectionReference]);
  result.candidates[0].evidence[0].sourceUrl = renamed.url + '/commit/synthetic-sha';
  await assert.rejects(service.receiveResult(result, async receipt => assert.equal(receipt.disposition, 'ACCEPTED')),
    AnalysisRegistrationError);
  assert.deepEqual(await counts(), {catches: 0, evidence: 0, receipts: 1});
  assert.equal((await db.manager.findOneByOrFail(AnalysisAttempt, {attemptId: context.attemptId})).application, 'APPLY_FAILED');
});

test('실행 조회 후 결과의 범위 판본을 바꾸면 수신 단계에서 거부한다', async () => {
  const {context, result} = await prepare();
  const received = await service.receiveResult({...result, scopeRevision: 'different-fixture-scope'}, async () => {});
  assert.equal(received.receipt.disposition, 'REJECTED');
  assert.equal(received.receipt.code, 'CONTEXT_MISMATCH');
  assert.deepEqual(await counts(), {catches: 0, evidence: 0, receipts: 0});
  assert.equal((await db.manager.findOneByOrFail(AnalysisAttempt, {attemptId: context.attemptId})).application, 'NOT_READY');
});

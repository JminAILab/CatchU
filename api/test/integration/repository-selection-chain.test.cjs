require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { before, after, beforeEach, test } = require('node:test');
const { NestFactory } = require('@nestjs/core');
const { DataSource } = require('typeorm');
const { resetTestDatabase } = require('../support/test-database.cjs');
const { readInitialSelection, restoreInitialSelection } = require('../support/repository-selection.cjs');
const { CONTRACT_DIR, validator, result: makeResult } = require('../helpers/receiver-harness.cjs');
const { MemberAccount, GitHubConnection, AnalysisConsent, AnalysisAttempt, AnalysisRequest } =
  require('../../dist/member-analysis/member-analysis.entity');
const { insertInitialAnalysis } = require('../../dist/member-analysis/initial-analysis');
const { REAL_NOTICE } = require('../../dist/analysis-intake/analysis-notice');
const { buildRequestMessage } = require('../../dist/analysis-queue/analysis-request.dispatcher');
const { WorkerContextService } = require('../../dist/worker-context/worker-context.service');
const { GitHubAccessToken } = require('../../dist/github-connection/github.client');
const { RepositorySelection } = require('../../dist/member-repositories/repository-selection.entity');
const { RepositorySelectionService, DatabaseRepositorySelectionSource } =
  require('../../dist/member-repositories/repository-selection.source');
const { SelectedRepositoryCatalog } = require('../../dist/member-repositories/selected-repository-catalog');
const { SelectedRepositoryRegistrationSource } = require('../../dist/analysis-receiver/selected-repository-registration.source');
const { OctoberRepositoryObservationSource } = require('../../dist/analysis-receiver/october-repository-observation.source');
const { AnalysisReceiverModule } = require('../../dist/analysis-receiver/analysis-receiver.module');
const { AnalysisRegistrationService, AnalysisRegistrationError } = require('../../dist/analysis-receiver/analysis-registration.service');

// 실제 공급 검사: DB 선정 행·범위 정의를 실제 접수 재확인·worker 선정 공급·#319 등록 좌표 공급이 같은 카탈로그로 읽는다.
// 시험 대역은 GitHub 자격정보(resolveCredential)와 이름 변경을 가정한 새 좌표 판본 하나다. HTTP·Redis·GitHub·LLM은 쓰지 않는다.
// 합성 선정 대역으로 같은 흐름을 본 검사는 selected-repository-version-chain.test.cjs에 있다.
const THEME = '570342307';
const versions = new SelectedRepositoryCatalog().listCurrent();
const theme = versions.find(version => version.repositoryId === THEME);
const renamed = { ...theme, name: 'renamed-fixture', url: 'https://github.com/' + theme.owner + '/renamed-fixture',
  selectionReference: 'catchu:selected-repository:test-renamed:570342307:v2' };
// 새 판본을 더해도 이전 판본은 그대로다. 세 공급이 이 카탈로그 하나를 쓴다.
const catalog = new SelectedRepositoryCatalog([...versions, renamed], versions.map(version => version.selectionReference));
let app, db, service, initial, selections, registration, workerContext, credentialCalls;

before(async () => {
  app = await NestFactory.createApplicationContext(AnalysisReceiverModule.registerDatabase({
    contractDirectory: CONTRACT_DIR,
    observationsFactory: database => new OctoberRepositoryObservationSource(new SelectedRepositoryRegistrationSource(database, catalog)),
  }), { logger: false });
  db = app.get(DataSource);
  service = app.get(AnalysisRegistrationService);
  initial = await readInitialSelection(db);
  selections = new RepositorySelectionService(db, catalog);
  registration = new SelectedRepositoryRegistrationSource(db, catalog);
  workerContext = new WorkerContextService(db, { resolveCredential: async memberId => {
    credentialCalls++;
    return { memberId, accountLogin: 'chain-user', externalAccountReference: '123456',
      token: new GitHubAccessToken('SYNTHETIC_SELECTION_CHAIN_TOKEN'), expiresAt: new Date(Date.now() + 3600000) };
  } }, new DatabaseRepositorySelectionSource(catalog));
});
after(async () => { await app?.close(); });
beforeEach(async () => {
  await resetTestDatabase(db);
  await restoreInitialSelection(db, initial);
  credentialCalls = 0;
});

const scopeUnverified = reason => error => error?.code === 'RESOURCE_UNAVAILABLE' && error.details?.violations?.[0]?.reason === reason;
const CHANGES = {
  '현재 선정 제외': () => db.manager.update(RepositorySelection, { repositoryId: THEME }, { active: false }),
  '새 좌표 판본 추가': () => db.manager.update(RepositorySelection, { repositoryId: THEME },
    { selectionReference: renamed.selectionReference }),
};

async function prepare() {
  const member = Object.assign(new MemberAccount(), { identityReference: 'catchu:google:' + randomUUID(), accountState: 'ACTIVE' });
  await db.manager.insert(MemberAccount, member);
  // #231 connect가 남기는 행 모양. 자격정보 원문은 위 시험 대역이 준다.
  await db.manager.insert(GitHubConnection, Object.assign(new GitHubConnection(), { memberId: member.memberId,
    connectionState: 'CONNECTED', credentialReference: 'github-v1:' + randomUUID(), accountLogin: 'chain-user',
    externalAccountReference: '123456' }));
  // #323이 할 접수와 같은 순서: 생성 트랜잭션에서 재확인한 동의 네 칸을 그대로 저장한다.
  const { request, selection } = await db.transaction('READ COMMITTED', async manager => {
    const current = await selections.confirmForIntake(manager, member.memberId, THEME);
    return { selection: current, request: await insertInitialAnalysis(manager, { memberId: member.memberId, repositoryId: THEME,
      sourceMode: 'LIVE', noticeRevision: REAL_NOTICE.noticeRevision, scopeRevision: current.scopeRevision,
      consentedScope: current.consentedScope }) };
  });
  const context = { requestId: request.requestId, attemptId: request.currentAttemptId, memberId: member.memberId,
    repositoryId: THEME, scopeRevision: selection.scopeRevision };
  const consent = await db.manager.findOneByOrFail(AnalysisConsent, { consentId: request.consentId });
  const attempt = await db.manager.findOneByOrFail(AnalysisAttempt, { attemptId: context.attemptId });
  const built = buildRequestMessage({ ...context, submittedAt: request.submittedAt, sourceMode: attempt.sourceMode,
    consentId: consent.consentId, noticeRevision: consent.noticeRevision, scopeRevision: consent.scopeRevision,
    consentedScope: consent.consentedScope, consentedAt: consent.consentedAt }, validator);
  assert.ok(built.message, JSON.stringify(built));
  const message = built.message;
  // 큐 사본의 두 참조는 시도 ID다. 좌표 판본으로 해석하지 않고 DB의 원래 동의는 바꾸지 않는다.
  assert.equal(message.allowedScope.selectionReference, context.attemptId);
  assert.equal(message.credentialContextReference, context.attemptId);
  assert.equal(message.allowedScope.revision, selection.scopeRevision);
  assert.deepEqual(message.allowedScope.allowedResourceTypes, selection.allowedResourceTypes);
  const execution = await workerContext.read(message.credentialContextReference);
  assert.deepEqual(execution.credential.repository, { owner: theme.owner, name: theme.name });
  assert.deepEqual(execution.selection, { repositoryId: THEME, wholeRepository: true });
  // 저장 동의의 원래 선정 참조를 worker와 등록 공급이 같은 좌표로 해석한다.
  const snapshot = await registration.findForRegistration({ ...context, consentId: consent.consentId, sourceMode: 'LIVE' });
  assert.deepEqual(snapshot.githubRepository, execution.credential.repository);
  assert.deepEqual(consent.consentedScope, selection.consentedScope);
  assert.equal(credentialCalls, 1);
  const coordinates = execution.credential.repository;
  const result = makeResult({ ...context, consentId: request.consentId, sourceMode: 'LIVE',
    resultId: randomUUID(), messageId: randomUUID(), finishedAt: new Date().toISOString() });
  result.candidates[0].evidence[0].sourceUrl = 'https://github.com/' + coordinates.owner + '/' + coordinates.name + '/commit/synthetic-sha';
  return { request, context, consent, result };
}

for (const [label, change] of Object.entries(CHANGES)) {
  test('실행 조회 뒤 ' + label + ': 새 실행 허가는 막고 원래 선정 참조의 당시 좌표로 Catch를 저장한다', async () => {
    const { request, context, consent, result } = await prepare();
    await change();
    await assert.rejects(workerContext.read(context.attemptId), scopeUnverified('SCOPE_UNVERIFIED'));
    const received = await service.receiveResult(result, async receipt => assert.equal(receipt.disposition, 'ACCEPTED'));
    assert.equal(received.application.registeredCatchIds.length, 1);
    const [stored] = await db.query('SELECT source_url FROM catch_evidence WHERE catch_id = $1', [received.application.registeredCatchIds[0]]);
    assert.equal(stored.source_url, result.candidates[0].evidence[0].sourceUrl);
    assert.deepEqual((await db.manager.findOneByOrFail(AnalysisConsent, { consentId: request.consentId })).consentedScope,
      consent.consentedScope, '저장 동의의 선정 참조를 덮어쓰지 않는다');
    assert.equal((await db.manager.findOneByOrFail(AnalysisAttempt, { attemptId: context.attemptId })).application, 'APPLIED');
    assert.equal(credentialCalls, 1, 'Catch 등록은 실행 허가나 GitHub 자격정보를 다시 조회하지 않는다');
  });
}

test('새 좌표 판본 뒤 목록은 새 좌표를 주고, 그 좌표의 근거는 이전 판본에 동의한 결과로 저장하지 않는다', async () => {
  const { context, result } = await prepare();
  await CHANGES['새 좌표 판본 추가']();
  const listed = (await selections.listEligible(context.memberId)).find(item => item.repositoryId === THEME);
  assert.deepEqual([listed.ownerLogin, listed.name, listed.url], [renamed.owner, renamed.name, renamed.url]);
  result.candidates[0].evidence[0].sourceUrl = renamed.url + '/commit/synthetic-sha';
  await assert.rejects(service.receiveResult(result, async receipt => assert.equal(receipt.disposition, 'ACCEPTED')),
    AnalysisRegistrationError);
  assert.equal((await db.manager.findOneByOrFail(AnalysisAttempt, { attemptId: context.attemptId })).application, 'APPLY_FAILED');
});

test('시도 종결·요청 닫힘·선정 제외·새 좌표 판본 뒤에도 원래 선정 참조로 당시 좌표를 조회한다', async () => {
  const { request, context, consent, result } = await prepare();
  const received = await service.receiveResult(result, async receipt => assert.equal(receipt.disposition, 'ACCEPTED'));
  assert.equal(received.application.registeredCatchIds.length, 1);
  await db.manager.update(AnalysisRequest, { requestId: request.requestId }, { lifecycle: 'CLOSED', updatedAt: new Date() });
  await CHANGES['새 좌표 판본 추가']();
  await CHANGES['현재 선정 제외']();
  await assert.rejects(workerContext.read(context.attemptId), scopeUnverified('ATTEMPT_NOT_ACTIVE'));
  const snapshot = await registration.findForRegistration({ ...context, consentId: consent.consentId, sourceMode: 'LIVE' });
  assert.deepEqual(snapshot.githubRepository, { owner: theme.owner, name: theme.name });
  const stored = catalog.resolve(consent.consentedScope.selectionReference);
  assert.deepEqual([stored.repositoryId, stored.owner, stored.name, stored.url], [THEME, theme.owner, theme.name, theme.url]);
  assert.deepEqual(catalog.resolve(renamed.selectionReference).name, renamed.name, '새 판본은 이전 판본을 바꾸지 않고 더해진다');
});

require('reflect-metadata');
// 실제 PostgreSQL·Valkey·worker 제품 함수를 잇는다. GitHub/모델/인증/C-03 제공자는 합성 시험 경계다.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { before, after, beforeEach, test } = require('node:test');
const { Module } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { Queue } = require('bullmq');
const IORedis = require('ioredis');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const { readCurrentSelection: readInitialSelection, restoreInitialSelection } = require('../support/repository-selection.cjs');
const { u7Fixture } = require('../support/u7-fixture.cjs');
const { CONTRACT_DIR, MemoryRequestQueue, dispatchLog, waitFor } = require('../helpers/queue-harness.cjs');
const { AnalysisRequest, AnalysisAttempt, AnalysisConsent, MemberAccount } = require('../../dist/member-analysis/member-analysis.entity');
const { MemberKindService } = require('../../dist/member-analysis/member-kind');
const { RepositoryRegistration } = require('../../dist/member-repositories/repository-registration.entity');
const { RepositoryRegistrationService } = require('../../dist/member-repositories/repository-registration.service');
const { MemberRepositoriesController } = require('../../dist/member-repositories/member-repositories.controller');
const { MemberRepositoriesService } = require('../../dist/member-repositories/member-repositories.service');
const { RegistrationContextSource } = require('../../dist/member-repositories/registration-context.source');
const { AnalysisIntakeService } = require('../../dist/analysis-intake/analysis-intake.service');
const { AnalysisHistoryService } = require('../../dist/analysis-intake/analysis-history');
const { AnalysisIntakeController } = require('../../dist/analysis-intake/analysis-intake.controller');
const { AnalysisRequestDispatcher } = require('../../dist/analysis-queue/analysis-request.dispatcher');
const { AnalysisQueueRunner } = require('../../dist/analysis-queue/analysis-queue.module');
const { WorkerMessageValidator } = require('../../dist/analysis-receiver/worker-message.validator');
const { AnalysisReceiver } = require('../../dist/analysis-receiver/analysis-receiver.service');
const { DatabaseReceiverStore } = require('../../dist/analysis-receiver/database-receiver.store');
const { AnalysisRegistrationService } = require('../../dist/analysis-receiver/analysis-registration.service');
const { SelectedRepositoryRegistrationSource } = require('../../dist/analysis-receiver/selected-repository-registration.source');
const { OctoberRepositoryObservationSource } = require('../../dist/analysis-receiver/october-repository-observation.source');
const { AUTHENTICATED_MEMBER } = require('../../dist/auth/auth.decorators');
const { OwnerCatchStore } = require('../../dist/catches/owner-catch-store');

const REDIS_URL = process.env.CATCHU_TEST_REDIS_URL;
const PYTHON = process.env.CATCHU_TEST_WORKER_PYTHON ?? resolve(__dirname, '../../../worker/.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const validator = new WorkerMessageValidator(CONTRACT_DIR);
const resources = { repositoryId: '424242', accountId: '1001', url: 'https://github.com/catchu-synthetic-owner/catchu-synthetic-repo' };
let db, initial, consumed;
const provider = { async consume(_member, kind, _now, manager) { assert.equal(kind, 'ANALYSIS'); assert.ok(manager.queryRunner.isTransactionActive); consumed++; return 'ALLOWED'; } };
before(async () => { db = await openTestDataSource(); initial = await readInitialSelection(db); });
after(async () => { await db?.destroy(); });
beforeEach(async () => { await resetTestDatabase(db); await restoreInitialSelection(db, initial); consumed = 0; });

async function prepare() {
  const fixture = await u7Fixture(db, provider, resources);
  const { status } = await fixture.create();
  const request = await db.manager.findOneByOrFail(AnalysisRequest, { requestId: status.requestId });
  const consent = await db.manager.findOneByOrFail(AnalysisConsent, { consentId: status.consentId });
  const queue = new MemoryRequestQueue();
  const dispatcher = new AnalysisRequestDispatcher(db, queue, validator, dispatchLog());
  assert.equal((await dispatcher.dispatchOnce()).enqueued, 1);
  const message = queue.jobs.get(status.attemptId).data;
  return { ...fixture, status, request, consent, message };
}
function pipeline() {
  const receiver = new AnalysisReceiver(new DatabaseReceiverStore(db), validator, { record() {} });
  return new AnalysisRegistrationService(receiver, db,
    new OctoberRepositoryObservationSource(new SelectedRepositoryRegistrationSource(db)), { failed() {} });
}
function worker(message, count) {
  assert.ok(existsSync(PYTHON), 'worker 잠금 의존성과 CATCHU_TEST_WORKER_PYTHON 실행 파일 필요');
  const output = spawnSync(PYTHON, ['tests/u7_chain_output.py'], { cwd: resolve(__dirname, '../../../worker'),
    input: JSON.stringify({ request: message, count }), encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, PYTHONPATH: '.', PYTHONIOENCODING: 'utf-8' } });
  assert.equal(output.status, 0, output.stderr);
  const value = JSON.parse(output.stdout); assert.equal(validator.result(value.result), true); return value;
}
async function contextOf(f) {
  return new RegistrationContextSource().resolve(db.manager, { ...f.message,
    scopeRevision: f.consent.scopeRevision, consentedScope: f.consent.consentedScope }, { lock: null });
}
test('I1 회원 등록→새 동의→접수 DB는 같은 소유자·GitHub ID·불변 사본을 보존한다', async () => {
  const f = await prepare(); assert.equal(f.request.registrationId, f.registration.registrationId);
  assert.equal(f.consent.memberId, f.memberId); assert.equal(f.consent.repositoryId, resources.repositoryId);
  await db.manager.update(RepositoryRegistration, { registrationId: f.registration.registrationId }, { name: 'renamed', repositoryUrl: 'https://github.com/catchu-synthetic-owner/renamed' });
  assert.deepEqual((await contextOf(f)).repository, { owner: 'catchu-synthetic-owner', name: 'catchu-synthetic-repo' });
  assert.equal(consumed, 1);
});
test('I2 소비 경계는 동일 키·ACTIVE 중복 소비를 막고 실제 C-03 부재를 닫는다', async t => {
  const f = await u7Fixture(db, provider, resources), key = randomUUID();
  const replies = await Promise.all([f.create(key), f.create(key), f.create()]);
  assert.equal(new Set(replies.map(value => value.status.requestId)).size, 1); assert.equal(consumed, 1);
  const missing = await u7Fixture(db, undefined, resources);
  await assert.rejects(missing.create(), error => error.code === 'INTERNAL_ERROR');
  t.diagnostic('합성 C-03 소비 경계 검사. U2 실제 제공자/KST 원자 계산 통합은 #414 미연결로 미검증.');
});
test('I3 접수 DB→dispatcher→worker 컨텍스트는 v2·등록 사본·시도 참조를 구분한다', async () => {
  const f = await prepare(), context = await contextOf(f);
  assert.equal(f.message.schemaVersion, '2'); assert.equal(f.message.allowedScope.selectionReference, f.status.attemptId);
  assert.equal(f.message.credentialContextReference, f.status.attemptId);
  assert.equal(context.repositoryId, resources.repositoryId);
  assert.equal(JSON.stringify(f.message).includes('synthetic-token'), false);
  assert.equal(Object.hasOwn(f.message.allowedScope, 'registrationId'), false);
});
test('I4 worker 수집→후보→합성 생성→Result는 NONE/FOUND와 후보 수를 유지한다', async () => {
  const f = await prepare();
  const empty = worker(f.message, 0); assert.equal(empty.result.ownCommitObservation, 'NONE'); assert.equal(empty.result.candidates.length, 0);
  const found = worker(f.message, 1); assert.equal(found.result.ownCommitObservation, 'FOUND'); assert.equal(found.result.observedOwnCommitCount, 1);
  assert.equal(found.metrics.generationCalls, 1); assert.equal(found.result.candidates.length, 1);
});
test('I5 실제 Valkey Result→수신 receipt→본인 Catch DB 연결', { skip: REDIS_URL ? false : '전용 CATCHU_TEST_REDIS_URL 미설정' }, async t => {
  const f = await prepare(), generated = worker(f.message, 1);
  const prefix = 'catchu-u7-' + randomUUID();
  const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
  const messages = new Queue('worker-messages', { connection, prefix });
  const requests = new Queue('analysis-requests', { connection, prefix });
  const runner = new AnalysisQueueRunner({ config: { redisUrl: REDIS_URL, prefix }, dataSource: db,
    registration: pipeline(), validator, logger: { log() {}, warn() {}, error() {} } });
  t.after(async () => { await runner.stop(); for (const queue of [messages, requests]) { await queue.obliterate({ force: true }); await queue.close(); } await connection.quit(); });
  runner.start(); await runner.waitUntilReady();
  const result = generated.result;
  await messages.add('Result', result, { jobId: result.messageId, attempts: 1, removeOnComplete: false });
  await waitFor(async () => ['completed','failed'].includes(await messages.getJobState(result.messageId)), 'U7 결과 반영');
  const job = await messages.getJob(result.messageId);
  assert.equal(job.returnvalue.disposition, 'ACCEPTED');
  const status = await new AnalysisHistoryService(db).get(f.memberId, f.status.requestId);
  assert.equal(status.application, 'APPLIED'); assert.equal(status.ownerResultsReady, true);
  assert.equal(status.ownCommitObservation, 'FOUND'); assert.equal(status.registeredCatchIds.length, 1);
  assert.equal((await new OwnerCatchStore(db).get(f.memberId, status.registeredCatchIds[0])).repositoryId, resources.repositoryId);
});
test('I6 회원·등록·요청 삭제 뒤 늦은 컨텍스트·결과는 부모를 부활시키지 않는다', async () => {
  for (const kind of ['member','registration','request']) {
    const f = await prepare(), output = worker(f.message, 0);
    if (kind === 'member') await db.manager.delete(MemberAccount, { memberId: f.memberId });
    else if (kind === 'registration') await db.manager.delete(RepositoryRegistration, { registrationId: f.registration.registrationId });
    else await db.manager.delete(AnalysisRequest, { requestId: f.status.requestId });
    assert.equal(await contextOf(f), null);
    assert.equal((await pipeline().receiveResult(output.result, async () => {})).receipt.disposition, 'REJECTED');
    assert.equal(await db.manager.count(AnalysisAttempt, { where: { requestId: f.status.requestId } }), 0);
  }
});
test('I7 web 응답 해석→실제 Nest 등록·접수·상태→본인 Catch 경계', async t => {
  const f = await u7Fixture(db, provider, resources);
  await db.manager.delete(RepositoryRegistration, { registrationId: f.registration.registrationId });
  const memberRepositories = new MemberRepositoriesService({}, new MemberKindService(db), f.github, f.registrations);
  class HttpBoundaryModule {}
  Module({ controllers: [MemberRepositoriesController, AnalysisIntakeController], providers: [
    { provide: RepositoryRegistrationService, useValue: f.registrations }, { provide: MemberRepositoriesService, useValue: memberRepositories },
    { provide: AnalysisIntakeService, useValue: f.intake }, { provide: AnalysisHistoryService, useValue: new AnalysisHistoryService(db) },
  ] })(HttpBoundaryModule);
  const app = await NestFactory.create(HttpBoundaryModule, { logger: false });
  // 이 경계 시험의 인증 대역. 실제 세션/Guard 검사는 기존 API 회귀가 맡는다.
  app.use((request, _response, next) => { request[AUTHENTICATED_MEMBER] = { memberId: f.memberId }; next(); });
  app.setGlobalPrefix('v1'); await app.listen(0, '127.0.0.1'); t.after(() => app.close());
  const url = await app.getUrl();
  const web = require('../../../web/src/features/repository-management/repository-api.ts');
  const post = (path, body, headers = {}) => fetch(url + '/v1' + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const registration = await post('/me/repositories', { url: resources.url }); assert.equal(registration.status, 201);
  assert.equal(await db.manager.count(AnalysisRequest), 0);
  const list = await (await fetch(url + '/v1/me/repositories')).json(); assert.ok(web.readRepository(list.items[0]));
  const notice = await (await fetch(url + '/v1/analysis-notice')).json();
  const accepted = await post('/analysis-requests', { repositoryId: resources.repositoryId, consent: { accepted: true,
    noticeRevision: notice.noticeRevision, scopeRevision: list.items[0].allowedScopeRevision } }, { 'idempotency-key': randomUUID() });
  assert.equal(accepted.status, 202); const status = await accepted.json(); assert.ok(web.readAnalysis(status));
  const history = await (await fetch(url + '/v1/analysis-requests/' + status.requestId)).json();
  assert.equal(web.readAnalysis(history).requestId, status.requestId); assert.equal(consumed, 1);
});
test('I8 합성500 상세·후보는 보존하고 생성300 상한과 미생성200을 Result·DB에 반영한다', async t => {
  const f = await prepare(), generated = worker(f.message, 500);
  // #424 2026-11-01 상한: 목록3000·상세1500 안에서 본인500과 타인 뿌리 커밋1을 모두 읽는다.
  assert.equal(generated.metrics.listed, 501); assert.equal(generated.metrics.relations, 500);
  assert.equal(generated.metrics.details, 500); assert.equal(generated.metrics.candidates, 500); assert.equal(generated.metrics.generationCalls, 300);
  assert.ok(generated.metrics.receivedBytes > 0); assert.ok(generated.metrics.elapsedSeconds > 0);
  assert.ok(generated.metrics.resultBytes < 8 * 1024 * 1024); assert.equal(generated.result.observedOwnCommitCount, 500);
  assert.equal(generated.result.ownCommitObservation, 'FOUND'); assert.deepEqual(generated.result.collectionLimitNotes, []);
  assert.equal(generated.result.outcome, 'PARTIAL_FAILED'); assert.equal(generated.result.candidates.length, 500);
  assert.equal(generated.result.candidates.filter(candidate => candidate.draft.status === 'GENERATED').length, 300);
  assert.equal(generated.result.candidates.filter(candidate => candidate.draft.status === 'NOT_GENERATED').length, 200);
  assert.deepEqual(generated.result.failures.map(({ stage, code }) => ({ stage, code })),
    [{ stage: 'ANALYSIS', code: 'GENERATION_BUDGET_EXHAUSTED' }]);
  const applied = await pipeline().receiveResult(generated.result, async receipt => assert.equal(receipt.disposition, 'ACCEPTED'));
  assert.equal(applied.application.registeredCatchIds.length, 500);
  const stored = await db.query('SELECT draft_status, count(*)::int n FROM catch_asset WHERE source_request_id=$1 GROUP BY draft_status ORDER BY draft_status', [f.status.requestId]);
  assert.deepEqual(stored, [{ draft_status: 'GENERATED', n: 300 }, { draft_status: 'NOT_GENERATED', n: 200 }]);
  const status = await new AnalysisHistoryService(db).get(f.memberId, f.status.requestId);
  assert.equal(status.processing, 'PARTIAL_FAILED'); assert.equal(status.application, 'APPLIED'); assert.equal(status.ownerResultsReady, true);
  assert.equal(status.registeredCatchIds.length, 500);
  t.diagnostic(JSON.stringify({ synthetic: true, ...generated.metrics, applied: 500, full500Analysis: false }));
});

require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { before, after, beforeEach, test } = require('node:test');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const { readInitialSelection, restoreInitialSelection } = require('../support/repository-selection.cjs');
const { MemberAccount, GitHubConnection, AnalysisRequest, AnalysisAttempt, AnalysisConsent } = require('../../dist/member-analysis/member-analysis.entity');
const { RepositoryRegistration } = require('../../dist/member-repositories/repository-registration.entity');
const { RepositoryRegistrationService, REGISTRATION_SCOPE_REVISION } = require('../../dist/member-repositories/repository-registration.service');
const { insertInitialAnalysis } = require('../../dist/member-analysis/initial-analysis');
const { AddRepositoryRegistration1793245460352: Migration } = require('../../dist/database/migrations/1793245460352-AddRepositoryRegistration');
let db, initial, service, metadata, github;
before(async () => { db = await openTestDataSource(); initial = await readInitialSelection(db); });
after(() => db?.destroy());
beforeEach(async () => {
  await resetTestDatabase(db); await restoreInitialSelection(db, initial);
  metadata = { repositoryId: '123456', owner: 'public-owner', name: 'repo', url: 'https://github.com/public-owner/repo' };
  github = { requireAvailable() {}, async resolveCredential(id) {
    const connection = await db.manager.findOneByOrFail(GitHubConnection, { memberId: id });
    return { externalAccountReference: connection.externalAccountReference, token: 'synthetic-token' };
  } };
  service = new RepositoryRegistrationService(db, github, { async verify() { return { ...metadata }; } });
});
async function member() {
  const row = Object.assign(new MemberAccount(), { identityReference: 'catchu:google:' + randomUUID(), accountState: 'ACTIVE' });
  await db.manager.insert(MemberAccount, row);
  await db.manager.insert(GitHubConnection, Object.assign(new GitHubConnection(), { memberId: row.memberId,
    connectionState: 'CONNECTED', accountLogin: 'synthetic-user', externalAccountReference: '9988', credentialReference: 'github-v1:' + randomUUID() }));
  return row.memberId;
}
const register = id => service.register(id, { url: metadata.url });
async function accepted(id) {
  await register(id); const prepared = await service.prepareForIntake(id, metadata.repositoryId);
  return db.transaction('READ COMMITTED', async m => {
    const scope = await service.confirmForIntake(m, id, metadata.repositoryId, prepared);
    return insertInitialAnalysis(m, { memberId: id, repositoryId: metadata.repositoryId, ...scope,
      noticeRevision: 'synthetic-notice', consentedAt: new Date(), sourceMode: 'LIVE' });
  });
}
test('C1 공개 직접 등록은 전역 선정 목록을 늘리지 않고 회원 등록만 남긴다', async () => {
  const id = await member(); const before = await db.query('SELECT count(*)::int n FROM repository_selection');
  const item = await register(id);
  assert.equal(item.repositoryId, metadata.repositoryId); assert.equal(item.ownerLogin, metadata.owner);
  assert.deepEqual(await service.listEligible(id), [item]);
  assert.deepEqual(await db.query('SELECT count(*)::int n FROM repository_selection'), before);
});
test('C1 동시 중복 등록과 좌표 갱신은 같은 회원·GitHub ID의 한 행으로 합쳐진다', async () => {
  const id = await member(); const results = await Promise.all([register(id), register(id), register(id)]);
  assert.equal(new Set(results.map(r => r.registrationId)).size, 1);
  metadata.name = 'renamed'; metadata.url = 'https://github.com/public-owner/renamed';
  const next = await register(id); assert.equal(next.registrationId, results[0].registrationId); assert.equal(next.name, 'renamed');
});
test('C1 회원별 목록·등록 참조는 격리되고 같은 GitHub ID를 각각 등록할 수 있다', async () => {
  const a = await member(), b = await member(); const first = await register(a);
  assert.deepEqual(await service.listEligible(b), []);
  await assert.rejects(service.prepareForIntake(b, first.repositoryId), e => e.code === 'RESOURCE_UNAVAILABLE');
  assert.notEqual((await register(b)).registrationId, first.registrationId);
});
test('C1 공개 확인 중 연결이 교체되면 등록 저장을 거부한다', async () => {
  const id = await member();
  service = new RepositoryRegistrationService(db, github, { async verify() {
    await db.manager.update(GitHubConnection, { memberId: id }, { credentialReference: 'github-v1:' + randomUUID() }); return metadata;
  } });
  await assert.rejects(register(id), e => e.code === 'GITHUB_CONNECTION_REQUIRED');
  assert.equal(await db.manager.count(RepositoryRegistration), 0);
});
test('C1 회원·등록 삭제는 요청·동의·시도를 함께 삭제하고 타 회원 등록은 유지한다', async () => {
  const a = await member(), b = await member(); const request = await accepted(a); await register(b);
  await db.manager.delete(RepositoryRegistration, { memberId: a });
  for (const entity of [AnalysisRequest, AnalysisConsent, AnalysisAttempt]) assert.equal(await db.manager.count(entity), 0);
  assert.equal(await db.manager.count(RepositoryRegistration), 1);
  await db.manager.delete(MemberAccount, { memberId: b }); assert.equal(await db.manager.count(RepositoryRegistration), 0);
  assert.ok(request.requestId);
});
test('C1 복합 소유 FK와 관측 조합 CHECK는 위조 소유·NULL·음수 조합을 거부한다', async () => {
  const a = await member(), b = await member(); const request = await accepted(a); const foreign = await register(b);
  await assert.rejects(db.manager.update(AnalysisRequest, { requestId: request.requestId }, { registrationId: foreign.registrationId }), e => e.code === '23503');
  for (const [ownCommitObservation, observedOwnCommitCount] of [['NONE', null], ['FOUND', null], ['FOUND', 0], ['NONE', 2], ['UNKNOWN', 0], ['FOUND', -1]]) {
    await assert.rejects(db.manager.update(AnalysisAttempt, { attemptId: request.currentAttemptId }, { ownCommitObservation, observedOwnCommitCount }), e => e.code === '23514');
  }
});
test('C1 좌표 갱신은 접수 당시 동의 사본을 바꾸지 않고 사본 갱신 자체도 금지한다', async () => {
  const id = await member(), request = await accepted(id);
  const consent = await db.manager.findOneByOrFail(AnalysisConsent, { consentId: request.consentId });
  metadata.name = 'renamed'; metadata.url = 'https://github.com/public-owner/renamed'; await register(id);
  assert.deepEqual((await db.manager.findOneByOrFail(AnalysisConsent, { consentId: request.consentId })).consentedScope, consent.consentedScope);
  await assert.rejects(db.manager.update(AnalysisConsent, { consentId: request.consentId }, { consentedScope: {} }), e => e.code === '23514');
});
test('C1 마이그레이션 up/down/up과 미준비 자료 거부를 실제 PostgreSQL에서 확인한다', async () => {
  const runner = db.createQueryRunner(); await runner.connect();
  try {
    const migration = new Migration();
    await runner.startTransaction(); await migration.down(runner); await migration.up(runner); await runner.commitTransaction();
    assert.deepEqual((await db.driver.createSchemaBuilder().log()).upQueries.map(q => q.query), []);
    const id = await member(); await accepted(id);
    await assert.rejects(migration.down(runner), e => e.code === '23514' && e.message.includes('preservation'));
    await assert.rejects(migration.up(runner), e => e.code === '23514' && e.message.includes('retrospective consent'));
  } finally { if (runner.isTransactionActive) await runner.rollbackTransaction(); await runner.release(); }
  assert.equal(REGISTRATION_SCOPE_REVISION, 'catchu:allowed-scope:2026-10-19:v1');
});

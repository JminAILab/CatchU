require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { before, after, beforeEach, test } = require('node:test');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const { readInitialSelection, restoreInitialSelection } = require('../support/repository-selection.cjs');
const { u7Fixture } = require('../support/u7-fixture.cjs');
const { ExpandRepositoryAnalysisScope1793585769819: Migration } = require('../../dist/database/migrations/1793585769819-ExpandRepositoryAnalysisScope');
const { REGISTRATION_SCOPE_REVISION: CURRENT } = require('../../dist/member-repositories/registration-scope');
const { RepositoryRegistration } = require('../../dist/member-repositories/repository-registration.entity');
const { AllowedScopeRevision } = require('../../dist/member-repositories/repository-selection.entity');
const { MemberAccount, GitHubConnection, AnalysisConsent } = require('../../dist/member-analysis/member-analysis.entity');
const { insertInitialAnalysis } = require('../../dist/member-analysis/initial-analysis');
const { RegistrationContextSource } = require('../../dist/member-repositories/registration-context.source');
const { SelectedRepositoryRegistrationSource } = require('../../dist/analysis-receiver/selected-repository-registration.source');
const { WorkerContextService } = require('../../dist/worker-context/worker-context.service');
const { GitHubAccessToken } = require('../../dist/github-connection/github.client');
const OLD = 'catchu:allowed-scope:2026-10-19:v1';
let db, initial;
before(async () => { db = await openTestDataSource(); initial = await readInitialSelection(db); });
after(async () => { await db?.destroy(); });
beforeEach(async () => { await resetTestDatabase(db); await restoreInitialSelection(db, initial); });
const migrate = direction => db.transaction(manager => new Migration()[direction](manager.queryRunner));

async function historicalRequest() {
  const memberId = randomUUID(), registrationId = randomUUID(), repositoryId = '424242';
  await db.manager.insert(MemberAccount, { memberId, identityReference: 'catchu:google:' + randomUUID(), accountState: 'ACTIVE' });
  await db.manager.insert(GitHubConnection, Object.assign(new GitHubConnection(), { memberId,
    connectionState: 'CONNECTED', accountLogin: 'synthetic-owner', externalAccountReference: '1001', credentialReference: 'github-v1:' + randomUUID() }));
  const repository = { owner: 'synthetic-owner', name: 'synthetic-repo', url: 'https://github.com/synthetic-owner/synthetic-repo' };
  await db.manager.insert(RepositoryRegistration, { registrationId, memberId, repositoryId, owner: repository.owner,
    name: repository.name, repositoryUrl: repository.url, scopeRevision: OLD, registeredAt: new Date(), lastVerifiedAt: new Date() });
  const consentedScope = { revision: OLD, repositoryId, allowedResourceTypes: ['COMMIT', 'PULL_REQUEST', 'ISSUE'],
    selectionReference: registrationId, registrationId, repository };
  const request = await db.transaction(manager => insertInitialAnalysis(manager, { memberId, repositoryId, registrationId,
    noticeRevision: 'catchu-real-analysis-notice-v2', scopeRevision: OLD, consentedScope, sourceMode: 'LIVE' }));
  return { ...request, memberId, repositoryId, registrationId, attemptId: request.currentAttemptId, sourceMode: 'LIVE',
    scopeRevision: OLD, consentedScope };
}

test('범위 migration은 현재 포인터만 전환하며 구판 동의·과거 좌표를 up/down/up 뒤에도 보존한다', async () => {
  const old = await historicalRequest();
  const consent = await db.manager.findOneByOrFail(AnalysisConsent, { consentId: old.consentId });
  const definition = await db.manager.findOneByOrFail(AllowedScopeRevision, { scopeRevision: OLD });
  const historical = new SelectedRepositoryRegistrationSource(db);
  const coordinates = await historical.findForRegistration(old);
  assert.ok(coordinates);
  await migrate('up');
  const current = await db.manager.findOneByOrFail(AllowedScopeRevision, { scopeRevision: CURRENT });
  assert.deepEqual(current.collectionTerms.range.value, { defaultBranchCommits: 3000, linkedAccountCommitDetails: 1500,
    pullRequests: 600, linkedAccountPullRequestCommitLists: 30, issueListItems: 1000 });
  assert.deepEqual(current.collectionTerms.limits.value, { ...definition.collectionTerms.limits.value, calls: 2500, collectionSeconds: 1800 });
  assert.equal(current.collectionTerms.range.status, 'PROPOSED'); assert.equal(current.collectionTerms.limits.status, 'PROPOSED');
  assert.equal((await db.manager.findOneByOrFail(RepositoryRegistration, { registrationId: old.registrationId })).scopeRevision, CURRENT);
  assert.deepEqual(await db.query('SELECT DISTINCT scope_revision FROM repository_selection'), [{ scope_revision: CURRENT }]);
  let credentials = 0;
  const context = new WorkerContextService(db, { async resolveCredential() { credentials++; } }, new RegistrationContextSource());
  await assert.rejects(context.read(old.attemptId), error => error.code === 'RESOURCE_UNAVAILABLE' &&
    error.details?.violations?.[0]?.reason === 'SCOPE_UNVERIFIED');
  assert.equal(credentials, 0, '구판 대기 시도는 GitHub 자격정보 조회 전에 거부한다');
  assert.deepEqual(await historical.findForRegistration(old), coordinates);
  assert.deepEqual(await db.manager.findOneByOrFail(AnalysisConsent, { consentId: old.consentId }), consent);
  assert.deepEqual(await db.manager.findOneByOrFail(AllowedScopeRevision, { scopeRevision: OLD }), definition);
  await migrate('down');
  assert.equal((await db.manager.findOneByOrFail(RepositoryRegistration, { registrationId: old.registrationId })).scopeRevision, OLD);
  assert.deepEqual(await db.query('SELECT DISTINCT scope_revision FROM repository_selection'), [{ scope_revision: OLD }]);
  assert.deepEqual(await db.manager.findOneByOrFail(AllowedScopeRevision, { scopeRevision: CURRENT }), current);
  await migrate('up');
  assert.deepEqual(await db.manager.findOneByOrFail(AnalysisConsent, { consentId: old.consentId }), consent);
  assert.deepEqual(await historical.findForRegistration(old), coordinates);
});

test('현재 판본의 신규 동의·worker 조회는 성공하고 구판·미배포판본 접수는 미소비로 거부한다', async () => {
  await migrate('up');
  let consumed = 0;
  const fixture = await u7Fixture(db, { async consume() { consumed++; return 'ALLOWED'; } });
  assert.equal(fixture.registration.allowedScopeRevision, CURRENT);
  for (const revision of [OLD, 'catchu:allowed-scope:unpublished']) {
    await assert.rejects(fixture.create(randomUUID(), { ...fixture.input(), consent: { ...fixture.input().consent, scopeRevision: revision } }),
      error => error.code === 'CONSENT_REQUIRED');
  }
  assert.equal(consumed, 0);
  const key = randomUUID(), { status } = await fixture.create(key);
  const consent = await db.manager.findOneByOrFail(AnalysisConsent, { consentId: status.consentId });
  let credentials = 0;
  const context = new WorkerContextService(db, { async resolveCredential(memberId) {
    credentials++;
    return { memberId, accountLogin: fixture.connection.accountLogin, externalAccountReference: fixture.connection.externalAccountReference,
      token: new GitHubAccessToken('SYNTHETIC_SCOPE_TOKEN'), expiresAt: new Date(Date.now() + 3600000) };
  } }, new RegistrationContextSource());
  const resolved = await context.read(status.attemptId);
  assert.equal(resolved.credential.scopeRevision, CURRENT); assert.equal(credentials, 1);
  await db.manager.update(RepositoryRegistration, { registrationId: fixture.registration.registrationId }, { scopeRevision: OLD });
  await assert.rejects(fixture.create(randomUUID(), { ...fixture.input(), consent: { ...fixture.input().consent, scopeRevision: OLD } }),
    error => error.code === 'CONSENT_REQUIRED');
  await assert.rejects(context.read(status.attemptId), error => error.details?.violations?.[0]?.reason === 'SCOPE_UNVERIFIED');
  assert.equal(credentials, 1);
  assert.equal((await fixture.create(key)).status.requestId, status.requestId, '동일 키 응답은 새 동의로 바꾸지 않는다');
  assert.equal(consumed, 1);
  assert.deepEqual(await db.manager.findOneByOrFail(AnalysisConsent, { consentId: status.consentId }), consent);
});

test('새 판본 동의가 생긴 뒤 down은 자료와 현재 포인터를 바꾸지 않고 거부한다', async () => {
  await migrate('up');
  const fixture = await u7Fixture(db, { async consume() { return 'ALLOWED'; } });
  const { status } = await fixture.create();
  const consent = await db.manager.findOneByOrFail(AnalysisConsent, { consentId: status.consentId });
  await assert.rejects(migrate('down'), /preservation of analysis consents/);
  assert.equal((await db.manager.findOneByOrFail(RepositoryRegistration, { registrationId: fixture.registration.registrationId })).scopeRevision, CURRENT);
  assert.deepEqual(await db.manager.findOneByOrFail(AnalysisConsent, { consentId: status.consentId }), consent);
});

test('이미 존재하는 새 판본의 의미가 다르면 덮어쓰거나 포인터를 전환하지 않는다', async () => {
  const definition = { ...initial.scopes[0], scopeRevision: CURRENT, collectionTerms: { synthetic: 'different' } };
  await db.manager.insert(AllowedScopeRevision, definition);
  const before = await db.manager.findOneByOrFail(AllowedScopeRevision, { scopeRevision: CURRENT });
  await assert.rejects(migrate('up'), /different immutable definition/);
  assert.deepEqual(await db.manager.findOneByOrFail(AllowedScopeRevision, { scopeRevision: CURRENT }), before);
  assert.deepEqual(await db.query('SELECT DISTINCT scope_revision FROM repository_selection'), [{ scope_revision: OLD }]);
});

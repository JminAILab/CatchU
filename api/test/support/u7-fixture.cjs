const { randomUUID } = require('node:crypto');
const { MemberAccount, GitHubConnection } = require('../../dist/member-analysis/member-analysis.entity');
const { MemberKindService } = require('../../dist/member-analysis/member-kind');
const { RepositoryRegistrationService, REGISTRATION_SCOPE_REVISION } = require('../../dist/member-repositories/repository-registration.service');
const { AnalysisIntakeService } = require('../../dist/analysis-intake/analysis-intake.service');
const { AnalysisNoticeService, REAL_NOTICE } = require('../../dist/analysis-intake/analysis-notice');

async function u7Fixture(db, provider, options = {}) {
  const account = Object.assign(new MemberAccount(), { identityReference: 'catchu:google:' + randomUUID(), accountState: 'ACTIVE' });
  await db.manager.insert(MemberAccount, account);
  const memberId = account.memberId;
  const connection = Object.assign(new GitHubConnection(), { memberId, connectionState: 'CONNECTED', accountLogin: 'synthetic-user',
    externalAccountReference: options.accountId ?? '9988', credentialReference: 'github-v1:' + randomUUID() });
  await db.manager.insert(GitHubConnection, connection);
  let checks = 0;
  const github = { requireAvailable() {}, async refreshStatus() {}, async resolveCredential() {
    return { externalAccountReference: connection.externalAccountReference, token: 'synthetic-token' };
  } };
  const client = { async verify(coordinates) { checks++; return { ...coordinates, repositoryId: options.repositoryId ?? '123456' }; } };
  const registrations = new RepositoryRegistrationService(db, github, client);
  const registration = await registrations.register(memberId, { url: options.url ?? 'https://github.com/synthetic-owner/synthetic-repo' });
  const intake = new AnalysisIntakeService(db, {}, new AnalysisNoticeService(), new MemberKindService(db), registrations, github, provider);
  const input = () => ({ repositoryId: registration.repositoryId, consent: { accepted: true,
    noticeRevision: REAL_NOTICE.noticeRevision, scopeRevision: REGISTRATION_SCOPE_REVISION } });
  return { memberId, connection, registrations, registration, intake, input, client, github, checks: () => checks,
    create: (key = randomUUID(), body = input()) => intake.create(memberId, key, body) };
}
module.exports = { u7Fixture };

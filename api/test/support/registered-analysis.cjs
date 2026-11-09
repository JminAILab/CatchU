// 합성 시험 자료만 등록한다. 제품 접수는 공개 확인을 거친 RepositoryRegistrationService를 쓴다.
const { RepositoryRegistration } = require('../../dist/member-repositories/repository-registration.entity');
const { insertInitialAnalysis: insert } = require('../../dist/member-analysis/initial-analysis');
const { requireCreationTransaction } = require('../../dist/member-analysis/transaction');

async function ensureRegistration(manager, input) {
  let row = await manager.findOneBy(RepositoryRegistration, { memberId: input.memberId, repositoryId: input.repositoryId });
  if (row) return row.registrationId;
  const repository = input.consentedScope?.repository ?? { owner: 'synthetic-owner', name: 'synthetic-repository' };
  row = Object.assign(new RepositoryRegistration(), { memberId: input.memberId, repositoryId: input.repositoryId,
    owner: repository.owner, name: repository.name, repositoryUrl: repository.url ?? `https://github.com/${repository.owner}/${repository.name}`,
    scopeRevision: input.scopeRevision ?? 'synthetic-scope', registeredAt: new Date(), lastVerifiedAt: new Date() });
  if (input.registrationId ?? input.consentedScope?.registrationId) row.registrationId = input.registrationId ?? input.consentedScope.registrationId;
  await manager.insert(RepositoryRegistration, row);
  return row.registrationId;
}
async function insertInitialAnalysis(manager, input) {
  await requireCreationTransaction(manager);
  const registrationId = await ensureRegistration(manager, input);
  return insert(manager, { ...input, registrationId });
}
async function insertCurrentAnalysis(manager, input) {
  const { SelectedRepositoryCatalog } = require('../../dist/member-repositories/selected-repository-catalog');
  const version = new SelectedRepositoryCatalog().resolve(input.consentedScope?.selectionReference);
  if (input.sourceMode === 'LIVE' && version && Object.keys(input.consentedScope).every(key =>
    ['revision', 'repositoryId', 'allowedResourceTypes', 'selectionReference'].includes(key))) {
    const registrationId = await ensureRegistration(manager, { ...input, consentedScope: { repository: version } });
    input.consentedScope = { ...input.consentedScope, registrationId, selectionReference: registrationId,
      allowedResourceTypes: input.consentedScope.allowedResourceTypes ?? ['COMMIT'],
      repository: { owner: version.owner, name: version.name, url: version.url } };
  }
  return insertInitialAnalysis(manager, input);
}
module.exports = { ensureRegistration, insertInitialAnalysis, insertCurrentAnalysis };

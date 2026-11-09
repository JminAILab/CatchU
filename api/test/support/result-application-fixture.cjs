require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { ensureRegistration } = require('./registered-analysis.cjs');
const { readFileSync } = require('node:fs');
const { resolve, join } = require('node:path');
const { AnalysisRequest, AnalysisConsent, AnalysisAttempt } = require('../../dist/member-analysis/member-analysis.entity');
const { ResultApplicationRecord } = require('../../dist/result-application/result-application.entity');
const { resultFingerprint } = require('../../dist/analysis-receiver/analysis-receiver.service');
const { WorkerMessageValidator } = require('../../dist/analysis-receiver/worker-message.validator');
const fixtureDir = resolve(__dirname, '../../../worker/fixtures/m1-synthetic');
const validator = new WorkerMessageValidator(resolve(__dirname, '../../../api/contracts/repository-analysis'));
function fillTemplate(value, context) {
  if (Array.isArray(value)) return value.map(v => fillTemplate(v, context));
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,fillTemplate(v,context)]));
  if (typeof value !== 'string') return value;
  return value.replace(/\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g, (_, name) => {
    assert.ok(Object.hasOwn(context, name)); return context[name];
  });
}

// #139는 제외한다. 수신 이후의 정본을 실제 E 테이블에 시험 준비로 저장·커밋한다.
async function prepare(db, file = 'results/succeeded-one-candidate.json', options = {}) {
  const context = { caseId: randomUUID(), requestId: randomUUID(), attemptId: randomUUID(),
    memberId: options.memberId || randomUUID(), repositoryId: options.repositoryId || 'synthetic-repository',
    consentId: randomUUID(), scopeRevision: 'synthetic-scope' };
  const result = fillTemplate(JSON.parse(readFileSync(join(fixtureDir,file),'utf8')), context);
  options.change?.(result);
  assert.equal(validator.result(result), true);
  const metadata = { applicationRecordId: randomUUID(), requestId: result.requestId, attemptId: result.attemptId,
    resultId: result.resultId, payloadFingerprint: resultFingerprint(result), receivedAt: new Date().toISOString() };
  await db.transaction('READ COMMITTED', async m => {
    await m.query("INSERT INTO member_account VALUES ($1,$2,'ACTIVE') ON CONFLICT DO NOTHING", [context.memberId, 'fixture:' + context.memberId]);
    await m.insert(AnalysisRequest, { registrationId: await ensureRegistration(m, context), requestId: context.requestId, memberId: context.memberId, repositoryId: context.repositoryId,
      consentId: context.consentId, currentAttemptId: context.attemptId, submittedAt: new Date(), updatedAt: new Date() });
    await m.insert(AnalysisConsent, { consentId: context.consentId, requestId: context.requestId, memberId: context.memberId,
      repositoryId: context.repositoryId, accepted: true, noticeRevision: 'fixture', scopeRevision: context.scopeRevision,
      consentedScope: { synthetic: true }, consentedAt: new Date() });
    await m.insert(AnalysisAttempt, { attemptId: context.attemptId, requestId: context.requestId, sourceMode: 'MOCK',
      processing: result.outcome, application: 'PENDING', eligibleCandidateCount: result.candidates.length, failures: result.failures });
    await m.insert(ResultApplicationRecord, { ...metadata, receivedAt: new Date(metadata.receivedAt) });
  });
  return { result, metadata };
}
module.exports = { prepare };

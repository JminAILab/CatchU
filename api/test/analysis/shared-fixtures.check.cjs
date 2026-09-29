// 선택 명령 npm run test:analysis-fixtures에서 실행. 자료가 없으면 skip 대신 실패한다.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { test } = require('node:test');
const { DevAnalysisInjection, readDevInjectionConfig } = require('../../dist/analysis-receiver/dev-analysis-injection');
const { context, harness } = require('../helpers/receiver-harness.cjs');

const fixtureDirectory = process.env.ANALYSIS_FIXTURE_DIR || resolve(__dirname, '../../../worker/fixtures/m1-synthetic');
const read = (path) => JSON.parse(readFileSync(join(fixtureDirectory, path), 'utf8'));
const manifest = read('cases.json');
const config = readDevInjectionConfig({ NODE_ENV: 'test', DEV_ANALYSIS_INJECTION_ENABLED: 'true' });

function setup(caseId) {
  const accepted = context({ requestId: `request-${caseId}`, attemptId: `attempt-${caseId}`,
    memberId: `member-${caseId}`, repositoryId: `repository-${caseId}`, consentId: `consent-${caseId}` });
  const current = harness(accepted);
  return { ...current, accepted, injector: new DevAnalysisInjection(current.store, current.receiver, config) };
}

for (const entry of manifest.cases) {
  test(`#103 공용 자료 수신: ${entry.caseId}`, async () => {
    let current = setup(entry.caseId);
    for (const [index, message] of entry.messages.entries()) {
      if (entry.delivery === 'SEPARATE_REQUESTS') current = setup(`${entry.caseId}-${index}`);
      const output = await current.injector.inject(current.accepted.memberId, current.accepted.requestId,
        message.schema, read(message.file), entry.caseId);
      if (message.schema === 'ProcessingEvent') {
        assert.equal(output, 'OBSERVED');
      } else if (message.expected.receipt === null) {
        assert.deepEqual(output, { receipt: null });
      } else {
        assert.equal(output.receipt.disposition, message.expected.receipt.disposition);
        assert.equal(output.receipt.code, message.expected.receipt.code);
        if (output.accepted) {
          // 후보를 B로 보내기 전 임의로 제거하지 않는다. B 등록 판정은 이 검사의 대상이 아니다.
          assert.equal(output.accepted.result.candidates.length, read(message.file).candidates.length);
          assert.equal(output.accepted.result.sourceMode, 'MOCK');
        }
      }
      assert.equal(current.store.state.processing, message.expected.processingAfter);
      assert.equal(current.store.state.ownerResultsReady, false);
      assert.deepEqual(current.store.state.registeredCatchIds, []);
    }
  });
}

for (const entry of manifest.negativeControls) {
  test(`#103 음성 대조: ${entry.id}`, async () => {
    const current = setup(entry.id);
    const input = read(entry.file);
    for (const patch of entry.patch) {
      const segments = patch.path.split('/').slice(1).map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'));
      const key = segments.pop();
      const parent = segments.reduce((node, part) => node[part], input);
      if (patch.op === 'remove') delete parent[key];
      else if (patch.op === 'replace') parent[key] = patch.value;
      else throw new Error('Unsupported fixture patch');
    }
    const output = await current.injector.inject(current.accepted.memberId, current.accepted.requestId, entry.schema, input, entry.id);
    if (entry.check.verdict === 'UNIDENTIFIABLE') assert.deepEqual(output, { receipt: null });
    else assert.equal(output.receipt.code, 'SCHEMA_INVALID');
    assert.equal(current.store.savedResults, 0);
  });
}

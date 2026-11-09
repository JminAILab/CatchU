import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAnalysisRequestApi } from '../src/features/analysis-request/analysis-request-api.ts';
import { readAnalysis } from '../src/features/repository-management/repository-api.ts';

// 합성 응답 검사. common.yaml AnalysisStatus·Failure의 형식을 확인하며 실제 HTTP·DB 접수는 아니다.
const body = { repositoryId: 'r1', consent: { accepted: true, noticeRevision: 'n1', scopeRevision: 's1' } };
const status = () => ({
  requestId: 'request-1', repositoryId: 'r1', consentId: 'consent-1', attemptId: 'attempt-1',
  submittedAt: '2026-10-19T00:00:00Z', updatedAt: '2026-10-19T09:00:00+09:00',
  requestState: 'ACCEPTED', lifecycle: 'ACTIVE', processing: 'QUEUED', application: 'NOT_READY', sourceMode: 'MOCK',
  eligibleCandidateCount: 0, registeredCatchIds: [], ownerResultsReady: false,
  ownCommitObservation: 'UNKNOWN', observedOwnCommitCount: null, collectionLimitNotes: [],
  retry: { allowed: false, reason: 'IN_PROGRESS' }, failures: [],
});
const failure = () => ({ stage: 'COLLECTION', code: 'FAILED', message: '합성 실패', candidateId: 'candidate-1' });
async function create(httpStatus, data) {
  const api = createAnalysisRequestApi(async () => ({ kind: 'success', status: httpStatus, data }));
  return api.create(body, 'same-key');
}
const invalid = (httpStatus) => ({ kind: 'lookup-failed', status: httpStatus, code: 'LOOKUP_FAILED' });

for (const httpStatus of [200, 202]) {
  test(`${httpStatus}: AnalysisStatus 필수 필드가 하나라도 없으면 접수 확정 대신 응답 불명으로 남긴다`, async () => {
    for (const field of Object.keys(status())) {
      const value = status();
      delete value[field];
      assert.deepEqual(await create(httpStatus, value), invalid(httpStatus), field);
    }
    for (const field of ['allowed', 'reason']) {
      const value = status();
      delete value.retry[field];
      assert.deepEqual(await create(httpStatus, value), invalid(httpStatus), `retry.${field}`);
    }
    for (const field of ['stage', 'code', 'message']) {
      const value = { ...status(), failures: [failure()] };
      delete value.failures[0][field];
      assert.deepEqual(await create(httpStatus, value), invalid(httpStatus), `failures[0].${field}`);
    }
  });

  test(`${httpStatus}: ID·상태·개수·시각·중첩 실패 형식 오류를 접수 성공으로 처리하지 않는다`, async () => {
    const fields = [
      ...['requestId', 'repositoryId', 'consentId', 'attemptId'].flatMap((field) => [[field, ''], [field, 1], [field, null]]),
      ['requestState', 'PENDING'], ['requestState', null], ['sourceMode', 'OTHER'], ['sourceMode', 1],
      ['lifecycle', 'DONE'], ['processing', 'DONE'], ['application', 'DONE'],
      ['eligibleCandidateCount', -1], ['eligibleCandidateCount', 1.5], ['eligibleCandidateCount', '0'],
      ['eligibleCandidateCount', null], ['eligibleCandidateCount', Infinity],
      ['registeredCatchIds', null], ['registeredCatchIds', ['']], ['registeredCatchIds', [1]],
      ['ownerResultsReady', 'false'], ['ownerResultsReady', null],
      ['retry', null], ['retry', []], ['retry', { allowed: 1, reason: 'IN_PROGRESS' }],
      ['retry', { allowed: false, reason: 'UNKNOWN' }], ['retry', { allowed: false, reason: null }],
      ['failures', null], ['failures', [null]], ['failures', [{ ...failure(), stage: 'UNKNOWN' }]],
      ['failures', [{ ...failure(), code: 1 }]], ['failures', [{ ...failure(), message: null }]],
      ['failures', [{ ...failure(), candidateId: '' }]], ['failures', [{ ...failure(), candidateId: null }]],
      ['failures', [{ ...failure(), candidateId: 1 }]],
      ...['submittedAt', 'updatedAt'].flatMap((field) => [
        [field, null], [field, 123], [field, '2026-10-19'], [field, '2026-10-19T00:00:00'],
        [field, '2026-02-30T00:00:00Z'], [field, '2026-10-19T24:00:00Z'], [field, 'not-a-date'],
      ]),
    ];
    for (const [field, value] of fields) {
      assert.deepEqual(await create(httpStatus, { ...status(), [field]: value }), invalid(httpStatus), `${field}: ${JSON.stringify(value)}`);
    }
  });
}

test('200 재응답은 종료된 현재 상태도 허용하고 추가 응답 필드는 무시한다', async () => {
  const value = {
    ...status(), lifecycle: 'CLOSED', processing: 'SUCCEEDED', application: 'APPLIED', sourceMode: 'LIVE',
    eligibleCandidateCount: 1, registeredCatchIds: ['catch-1'], ownerResultsReady: true,
    retry: { allowed: false, reason: 'RESULTS_EXIST', futureField: 'ignored' },
    failures: [{ ...failure(), futureField: 'ignored' }], futureField: 'ignored',
    submittedAt: '2024-02-29T23:59:59.123456Z', updatedAt: '2026-10-19t09:00:00+09:00',
  };
  assert.deepEqual(await create(200, value), { kind: 'success', data: { kind: 'existing', status: readAnalysis(value) } });
});

test('계약의 상태 enum·실패 단계·재요청 사유 전체를 읽고 업무 상태 조합은 다시 판정하지 않는다', async () => {
  const values = {
    lifecycle: ['ACTIVE', 'CLOSED'],
    processing: ['QUEUED', 'RUNNING', 'UNCERTAIN', 'SUCCEEDED', 'EMPTY', 'PARTIAL_FAILED', 'FAILED'],
    application: ['NOT_READY', 'PENDING', 'APPLYING', 'RECOVERING', 'APPLIED', 'APPLY_FAILED'],
    sourceMode: ['MOCK', 'LIVE'],
  };
  for (const [field, entries] of Object.entries(values)) {
    for (const value of entries) assert.equal((await create(200, { ...status(), [field]: value })).kind, 'success', `${field}: ${value}`);
  }
  for (const stage of ['COLLECTION', 'ANALYSIS', 'DRAFT', 'REFLECTION', 'APPLICATION', 'DISPATCH']) {
    assert.equal((await create(200, { ...status(), failures: [{ stage, code: '', message: '' }] })).kind, 'success', stage);
  }
  for (const reason of ['FAILURE_WITHOUT_RESULTS', 'ANALYSIS_FINISHED', 'IN_PROGRESS', 'RESULTS_EXIST', 'NOT_FAILED', 'EXECUTION_UNCERTAIN', 'APPLICATION_UNRESOLVED', 'REANALYSIS_DEFERRED']) {
    assert.equal((await create(200, { ...status(), retry: { allowed: true, reason } })).kind, 'success', reason);
  }
});

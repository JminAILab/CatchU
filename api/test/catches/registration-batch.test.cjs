const assert = require('node:assert/strict');
const { test } = require('node:test');
const { prepareRegistrationBatch } = require('../../dist/catches/registration-batch');

// B의 저장 전 검사 전용 합성 값이다. 공용 #103 자료나 실제 작업 동일성 판정이 아니다.
function candidate(candidateId = 'candidate-1', workIdentity = 'synthetic-work-1') {
  return {
    candidateId, workIdentity,
    title: '[합성] 오류 응답 처리',
    workFacts: ['[합성] 오류 응답을 구분했다.'],
    subjectContribution: '[합성] 응답 분기를 구현했다.',
    groupingBasis: '[합성] 동일 작업 키',
    groupingLimitations: ['[합성] 실제 작업 동일성은 검증하지 않았다.'],
    eligibility: {
      workFactsVerified: true, contributionVerified: true, independentOfFailures: true,
    },
    draft: { status: 'GENERATED', content: '[합성] 오류 응답 설명' },
    reflection: { status: 'GENERATED', questions: ['[합성] 무엇을 확인했나요?'] },
    evidence: [{
      evidenceId: 'evidence-1', sourceUrl: 'https://example.invalid/pull/1',
      sourceRevision: 'synthetic-revision-1', representedFacts: ['[합성] 응답 변경'],
      contributionScope: '[합성] 응답 구현', coverageLimits: [],
    }],
  };
}

test('적합 후보의 저장값은 미공개·미확인이며 저장 완료 정보는 만들지 않는다', () => {
  const groups = prepareRegistrationBatch([candidate()], 'MOCK');
  assert.equal(groups.length, 1);
  const prepared = groups[0].candidates[0];
  assert.equal(prepared.candidateId, 'candidate-1');
  assert.equal(prepared.content.asset.visibility, 'PRIVATE');
  assert.equal(prepared.content.asset.workFactsConfirmed, false);
  assert.equal(prepared.content.asset.contributionConfirmed, false);
  assert.equal(prepared.content.asset.sourceMode, 'MOCK');
  assert.equal('catchId' in prepared, false);
  assert.equal('ownerViewReady' in prepared, false);
});

test('같은 작업은 제목이 달라도 한 묶음이며 두 후보의 내용을 각각 보존한다', () => {
  const first = candidate();
  const second = candidate('candidate-2');
  second.title = '[합성] 다른 제목';
  second.draft.content = '[합성] 다른 초안';
  const groups = prepareRegistrationBatch([first, second], 'MOCK');
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].candidates.map((item) => item.candidateId), ['candidate-1', 'candidate-2']);
  assert.deepEqual(groups[0].candidates.map((item) => item.content.asset.title), [first.title, second.title]);
  assert.equal(groups[0].candidates[0].content.asset.draftContent, first.draft.content);
  assert.equal(groups[0].candidates[1].content.asset.draftContent, second.draft.content);
});

test('서로 다른 작업은 제목과 근거가 같아도 합치지 않는다', () => {
  const groups = prepareRegistrationBatch([
    candidate('candidate-1', 'synthetic-work-1'),
    candidate('candidate-2', 'synthetic-work-2'),
  ], 'MOCK');
  assert.equal(groups.length, 2);
  assert.ok(groups.every((group) => group.candidates.length === 1));
});

test('작업 키를 공백 제거·대소문자 변환으로 임의 정규화하지 않는다', () => {
  const keys = ['work', 'Work', 'work ', '__proto__', 'constructor'];
  const groups = prepareRegistrationBatch(keys.map((key, index) => candidate(`candidate-${index}`, key)), 'MOCK');
  assert.deepEqual(groups.map((group) => group.workIdentity), keys);
});

test('후보가 없으면 빈 준비 결과만 반환하고 결과의 성공·실패를 판정하지 않는다', () => {
  assert.deepEqual(prepareRegistrationBatch([], 'MOCK'), []);
  assert.throws(() => prepareRegistrationBatch([], 'UNKNOWN'), TypeError);
});

test('같은 결과 안의 후보 ID 중복은 작업 키가 같거나 달라도 거부한다', () => {
  for (const key of ['synthetic-work-1', 'synthetic-work-2']) {
    assert.throws(() => prepareRegistrationBatch([candidate(), candidate('candidate-1', key)], 'MOCK'), TypeError);
  }
});

test('근거·기여 확인 또는 실패 영향 분리 조건이 충족되지 않으면 거부한다', () => {
  for (const field of ['workFactsVerified', 'contributionVerified', 'independentOfFailures']) {
    for (const value of [false, 'true', undefined]) {
      const input = candidate();
      input.eligibility[field] = value;
      assert.throws(() => prepareRegistrationBatch([input], 'MOCK'), TypeError);
    }
  }
});

test('등록에 필요한 제목·작업·기여·근거 누락과 잘못된 형식을 거부한다', () => {
  const invalid = [
    null,
    { ...candidate(), candidateId: '' },
    { ...candidate(), title: '' },
    { ...candidate(), workIdentity: '' },
    { ...candidate(), workFacts: [] },
    { ...candidate(), workFacts: [null] },
    { ...candidate(), subjectContribution: '' },
    { ...candidate(), groupingLimitations: 'not-an-array' },
    { ...candidate(), evidence: [] },
    { ...candidate(), evidence: [null] },
    { ...candidate(), reflection: { status: 'GENERATED', questions: [null] } },
  ];
  for (const input of invalid) {
    assert.throws(() => prepareRegistrationBatch([input], 'MOCK'), TypeError);
  }
  for (const patch of [
    { evidenceId: '' }, { sourceUrl: 'not-a-uri' }, { sourceRevision: '' },
    { representedFacts: [] }, { contributionScope: null }, { coverageLimits: [null] },
  ]) {
    const input = candidate();
    Object.assign(input.evidence[0], patch);
    assert.throws(() => prepareRegistrationBatch([input], 'MOCK'), TypeError);
  }
});

test('한 후보 안에서 같은 근거 ID를 두 번 등록하려는 입력은 거부한다', () => {
  const input = candidate();
  input.evidence.push({ ...input.evidence[0] });
  assert.throws(() => prepareRegistrationBatch([input], 'MOCK'), TypeError);
});

test('초안이나 질문 중 하나만 실패해도 다른 등록 조건이 맞으면 준비한다', () => {
  const draftFailed = candidate();
  draftFailed.draft = { status: 'FAILED', content: null };
  const questionFailed = candidate('candidate-2', 'synthetic-work-2');
  questionFailed.reflection = { status: 'FAILED', questions: [] };
  const groups = prepareRegistrationBatch([draftFailed, questionFailed], 'LIVE');
  const first = groups[0].candidates[0].content.asset;
  const second = groups[1].candidates[0].content.asset;
  assert.equal(first.draftStatus, 'FAILED');
  assert.equal(first.draftContent, null);
  assert.equal(first.reflectionStatus, 'GENERATED');
  assert.equal(second.draftStatus, 'GENERATED');
  assert.equal(second.reflectionStatus, 'FAILED');
  assert.equal(second.sourceMode, 'LIVE');
});

test('뒤쪽 후보가 잘못되면 앞쪽 후보만 성공 반환하거나 입력을 수정하지 않는다', () => {
  const inputs = [candidate(), { ...candidate('candidate-2'), title: '' }];
  const before = structuredClone(inputs);
  assert.throws(() => prepareRegistrationBatch(inputs, 'MOCK'), TypeError);
  assert.deepEqual(inputs, before);
});

test('분류 결과와 입력의 배열을 분리하고 오류에 후보 원문을 싣지 않는다', () => {
  const input = candidate();
  const result = prepareRegistrationBatch([input], 'MOCK');
  input.groupingLimitations.push('입력 변경');
  input.evidence[0].coverageLimits.push('입력 변경');
  assert.equal(result[0].candidates[0].groupingLimitations.length, 1);
  assert.deepEqual(result[0].candidates[0].content.evidence[0].coverageLimits, []);

  input.evidence[0].sourceUrl = 'private-synthetic-value';
  assert.throws(() => prepareRegistrationBatch([input], 'MOCK'), (error) => {
    assert.ok(error instanceof TypeError);
    assert.equal(error.message.includes('private-synthetic-value'), false);
    assert.equal(error.message.includes(input.title), false);
    return true;
  });
});

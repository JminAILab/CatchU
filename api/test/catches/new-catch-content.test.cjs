const assert = require('node:assert/strict');
const { test } = require('node:test');
const { prepareNewCatchContent } = require('../../dist/catches/new-catch-content');
const { CatchRegistrationInputError } = require('../../dist/catches/registration-input-error');

function invalidInput(field) {
  return (error) => {
    assert.ok(error instanceof CatchRegistrationInputError);
    assert.ok(error instanceof TypeError);
    assert.equal(error.reason, 'INVALID_INPUT');
    assert.equal(error.field, field);
    return true;
  };
}

// 이 변환 함수만 검사하는 합성 값이다. #103의 공용 Result 세트를 대체하지 않는다.
function candidate() {
  return {
    title: '[합성] 로그인 오류 처리',
    workIdentity: 'synthetic-work-1',
    workFacts: ['[합성] 실패 응답을 구분했다.'],
    subjectContribution: '[합성] 오류 분기를 작성했다.',
    draft: { status: 'GENERATED', content: '[합성] 근거에 따른 설명 초안' },
    reflection: { status: 'GENERATED', questions: ['[합성] 어떤 경계를 확인했나요?'] },
    evidence: [{
      evidenceId: 'synthetic-evidence-1',
      sourceUrl: 'https://example.invalid/pull/1',
      sourceRevision: 'synthetic-revision-1',
      representedFacts: ['[합성] 오류 분기 변경'],
      contributionScope: '[합성] 해당 분기 구현',
      coverageLimits: ['[합성] 외부 호출은 검증하지 않았다.'],
    }],
  };
}

test('새 Catch는 입력에 공개·확인 값을 주입해도 미공개·미확인으로 시작한다', () => {
  const input = {
    ...candidate(), visibility: 'PUBLIC', workFactsConfirmed: true,
    contributionConfirmed: true, mismatch: true, ownerResultsReady: true,
  };
  const { asset } = prepareNewCatchContent(input, 'MOCK');
  assert.equal(asset.visibility, 'PRIVATE');
  assert.equal(asset.workFactsConfirmed, false);
  assert.equal(asset.contributionConfirmed, false);
  assert.equal(asset.mismatch, false);
  assert.equal('ownerResultsReady' in asset, false);
  assert.equal('catchId' in asset, false);
});

test('후보의 null·문자열 제목과 설명·작업 키·근거의 출처·한계를 변조하지 않는다', () => {
  for (const title of [null, candidate().title]) {
    const input = { ...candidate(), title };
    const result = prepareNewCatchContent(input, 'MOCK');
    assert.equal(result.asset.title, title);
    assert.equal(result.asset.draftStatus, 'GENERATED');
    assert.equal(result.asset.draftContent, input.draft.content);
    assert.equal(result.asset.workIdentity, input.workIdentity);
    assert.equal(result.evidence[0].sourceEvidenceId, input.evidence[0].evidenceId);
    assert.equal(result.evidence[0].sourceRevision, input.evidence[0].sourceRevision);
    assert.deepEqual(result.evidence[0].coverageLimits, input.evidence[0].coverageLimits);
  }
});

for (const status of ['FAILED', 'NOT_GENERATED']) {
  test(`초안·질문이 ${status}여도 내용을 꾸며 넣거나 근거를 버리지 않는다`, () => {
    const input = { ...candidate(), title: null };
    input.draft = { status, content: null };
    input.reflection = { status, questions: [] };
    const { asset, evidence } = prepareNewCatchContent(input, 'MOCK');
    assert.equal(asset.title, null);
    assert.equal(asset.draftStatus, status);
    assert.equal(asset.draftContent, null);
    assert.equal(asset.reflectionStatus, status);
    assert.deepEqual(asset.reflectionQuestions, []);
    assert.equal(evidence.length, 1);
    assert.equal(asset.visibility, 'PRIVATE');
  });
}

test('생성 상태와 본문이 모순되면 임의 보정하지 않고 거부한다', () => {
  for (const draft of [
    { status: 'GENERATED', content: null },
    { status: 'FAILED', content: '[합성] 이전 본문' },
    { status: 'NOT_GENERATED', content: '' },
    { status: 'UNKNOWN', content: null },
  ]) {
    assert.throws(
      () => prepareNewCatchContent({ ...candidate(), draft }, 'MOCK'),
      invalidInput(draft.status === 'UNKNOWN' ? 'draft.status' : 'draft.content'),
    );
  }
  const input = candidate();
  input.reflection.status = 'UNKNOWN';
  assert.throws(() => prepareNewCatchContent(input, 'MOCK'), invalidInput('reflection.status'));
});

test('MOCK/LIVE를 보존하고 알 수 없는 생성 방식을 실제 분석으로 바꾸지 않는다', () => {
  for (const mode of ['MOCK', 'LIVE']) {
    assert.equal(prepareNewCatchContent(candidate(), mode).asset.sourceMode, mode);
  }
  assert.throws(() => prepareNewCatchContent(candidate(), 'UNKNOWN'), invalidInput('sourceMode'));
});

test('변환 중 발생한 일반 Error와 TypeError는 입력 거부로 재분류하지 않는다', () => {
  for (const ErrorType of [Error, TypeError]) {
    const input = candidate();
    const unexpected = new ErrorType('synthetic unexpected failure');
    Object.defineProperty(input.draft, 'status', { get() { throw unexpected; } });
    assert.throws(() => prepareNewCatchContent(input, 'MOCK'), (error) => {
      assert.equal(error, unexpected);
      assert.equal(error instanceof CatchRegistrationInputError, false);
      return true;
    });
  }
});

test('변환 전후 배열을 공유하지 않아 후보 변경이 준비한 근거를 바꾸지 않는다', () => {
  const input = candidate();
  const result = prepareNewCatchContent(input, 'MOCK');
  input.workFacts.push('변경');
  input.reflection.questions.push('변경');
  input.evidence[0].representedFacts.push('변경');
  input.evidence[0].coverageLimits.push('변경');
  input.evidence[0].sourceRevision = '변경';
  input.evidence.push({ ...input.evidence[0] });
  assert.equal(result.asset.workFacts.length, 1);
  assert.equal(result.asset.reflectionQuestions.length, 1);
  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0].representedFacts.length, 1);
  assert.equal(result.evidence[0].coverageLimits.length, 1);
  assert.equal(result.evidence[0].sourceRevision, 'synthetic-revision-1');

  result.evidence[0].representedFacts.push('출력 변경');
  assert.equal(input.evidence[0].representedFacts.length, 2);
});

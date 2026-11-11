const assert = require('node:assert/strict');
const { test } = require('node:test');
const { prepareRegistrationBatch } = require('../../dist/catches/registration-batch');
const { CatchRegistrationInputError } = require('../../dist/catches/registration-input-error');

function inputError(reason, field) {
  return (error) => {
    assert.ok(error instanceof CatchRegistrationInputError);
    assert.ok(error instanceof TypeError);
    assert.equal(error.name, 'CatchRegistrationInputError');
    assert.equal(error.reason, reason);
    assert.equal(error.field, field);
    return true;
  };
}

// 합성 커밋 SHA(16진수 한 글자 40개).
const sha = (letter) => letter.repeat(40);

// B의 저장 전 검사 전용 합성 값이다. 공용 #103 자료나 실제 작업 동일성 판정이 아니다.
function candidate(candidateId = 'candidate-1', workIdentity = 'synthetic-work-1', ownCommitShas = [sha('a')]) {
  return {
    ownCommitShas,
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

test('제목은 null 또는 비어 있지 않은 문자열 그대로 보존하고 누락·잘못된 형식은 거부한다', () => {
  for (const title of [null, '[합성] 기존 제목', ' ']) {
    const input = { ...candidate(), title };
    const prepared = prepareRegistrationBatch([input], 'MOCK')[0].candidates[0];
    assert.equal(prepared.content.asset.title, title);
    assert.equal(prepared.content.asset.draftStatus, 'GENERATED');
    assert.equal(prepared.content.asset.draftContent, input.draft.content);
  }
  const missingTitle = candidate();
  delete missingTitle.title;
  for (const input of [
    missingTitle,
    ...[undefined, '', 123, false, [], {}].map((title) => ({ ...candidate(), title })),
  ]) {
    assert.throws(() => prepareRegistrationBatch([input], 'MOCK'), inputError('INVALID_INPUT', 'title'));
  }
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
  assert.throws(() => prepareRegistrationBatch([], 'UNKNOWN'), inputError('INVALID_INPUT', 'sourceMode'));
  assert.throws(() => prepareRegistrationBatch(null, 'MOCK'), inputError('INVALID_INPUT', 'candidates'));
});

test('같은 결과 안의 후보 ID 중복은 작업 키가 같거나 달라도 거부한다', () => {
  for (const key of ['synthetic-work-1', 'synthetic-work-2']) {
    assert.throws(
      () => prepareRegistrationBatch([candidate(), candidate('candidate-1', key)], 'MOCK'),
      inputError('INVALID_INPUT', 'candidateId'),
    );
  }
});

test('근거·기여 확인 또는 실패 영향 분리 조건이 충족되지 않으면 거부한다', () => {
  for (const field of ['workFactsVerified', 'contributionVerified', 'independentOfFailures']) {
    for (const value of [false, 'true', undefined]) {
      const input = candidate();
      input.eligibility[field] = value;
      assert.throws(
        () => prepareRegistrationBatch([input], 'MOCK'),
        inputError('REGISTRATION_INELIGIBLE', 'eligibility'),
      );
    }
  }
});

test('등록에 필요한 제목·작업·기여·근거 누락과 잘못된 형식을 거부한다', () => {
  const invalid = [
    [null, 'candidate'],
    [{ ...candidate(), candidateId: '' }, 'candidateId'],
    [{ ...candidate(), title: '' }, 'title'],
    [{ ...candidate(), workIdentity: '' }, 'workIdentity'],
    [{ ...candidate(), workFacts: [] }, 'workFacts'],
    [{ ...candidate(), workFacts: [null] }, 'workFacts'],
    [{ ...candidate(), subjectContribution: '' }, 'subjectContribution'],
    [{ ...candidate(), groupingLimitations: 'not-an-array' }, 'groupingLimitations'],
    [{ ...candidate(), evidence: [] }, 'evidence'],
    [{ ...candidate(), evidence: [null] }, 'evidence'],
    [{ ...candidate(), draft: null }, 'draft'],
    [{ ...candidate(), reflection: null }, 'reflection'],
    [{ ...candidate(), reflection: { status: 'GENERATED', questions: [null] } }, 'reflection.questions'],
  ];
  for (const [input, field] of invalid) {
    assert.throws(() => prepareRegistrationBatch([input], 'MOCK'), inputError('INVALID_INPUT', field));
  }
  for (const patch of [
    { evidenceId: '' }, { sourceUrl: 'not-a-uri' }, { sourceRevision: '' },
    { representedFacts: [] }, { contributionScope: null }, { coverageLimits: [null] },
  ]) {
    const input = candidate();
    Object.assign(input.evidence[0], patch);
    assert.throws(
      () => prepareRegistrationBatch([input], 'MOCK'),
      inputError('INVALID_INPUT', `evidence.${Object.keys(patch)[0]}`),
    );
  }
});

test('한 후보 안에서 같은 근거 ID를 두 번 등록하려는 입력은 거부한다', () => {
  const input = candidate();
  input.evidence.push({ ...input.evidence[0] });
  assert.throws(() => prepareRegistrationBatch([input], 'MOCK'), inputError('INVALID_INPUT', 'evidence.evidenceId'));
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
  for (const [patch, reason, field] of [
    [{ title: '' }, 'INVALID_INPUT', 'title'],
    [{ eligibility: { ...candidate().eligibility, independentOfFailures: false } }, 'REGISTRATION_INELIGIBLE', 'eligibility'],
    [{ draft: { status: 'GENERATED', content: null } }, 'INVALID_INPUT', 'draft.content'],
  ]) {
    const inputs = [candidate(), { ...candidate('candidate-2'), ...patch }];
    const before = structuredClone(inputs);
    let result;
    assert.throws(() => { result = prepareRegistrationBatch(inputs, 'MOCK'); }, inputError(reason, field));
    assert.equal(result, undefined);
    assert.deepEqual(inputs, before);
  }
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
    inputError('INVALID_INPUT', 'evidence.sourceUrl')(error);
    assert.equal(error.message.includes('private-synthetic-value'), false);
    assert.equal(error.message.includes(input.title), false);
    return true;
  });
});

test('입력 거부 오류의 메시지·필드·원인에 후보 본문·ID·URL을 싣지 않는다', () => {
  const input = candidate('private-synthetic-candidate', 'private-synthetic-work');
  input.title = 'private-synthetic-title';
  input.draft.content = 'private-synthetic-body';
  input.evidence[0].evidenceId = 'private-synthetic-evidence';
  input.evidence[0].sourceUrl = 'https://example.invalid/private-synthetic-source?secret=synthetic';
  const privateValues = [
    input.candidateId, input.workIdentity, input.title, input.draft.content,
    input.evidence[0].evidenceId, input.evidence[0].sourceUrl,
  ];
  for (const [inputs, reason, field] of [
    [[input, input], 'INVALID_INPUT', 'candidateId'],
    [[{ ...input, evidence: [input.evidence[0], input.evidence[0]] }], 'INVALID_INPUT', 'evidence.evidenceId'],
    [[{ ...input, eligibility: undefined }], 'REGISTRATION_INELIGIBLE', 'eligibility'],
    [[{ ...input, draft: { status: 'FAILED', content: input.draft.content } }], 'INVALID_INPUT', 'draft.content'],
    [[{ ...input, evidence: [{ ...input.evidence[0], sourceUrl: 'private-synthetic-invalid-url' }] }], 'INVALID_INPUT', 'evidence.sourceUrl'],
  ]) {
    assert.throws(() => prepareRegistrationBatch(inputs, 'MOCK'), (error) => {
      inputError(reason, field)(error);
      assert.equal('cause' in error, false);
      const reported = `${error.stack}\n${JSON.stringify(error)}`;
      for (const value of [...privateValues, 'private-synthetic-invalid-url']) {
        assert.equal(reported.includes(value), false);
      }
      return true;
    });
  }
});

test('CR2: 같은 열쇠 후보들의 본인 커밋은 앞 후보 목록 뒤에 새 SHA를 처음 나온 순서로 잇는다', () => {
  const groups = prepareRegistrationBatch([
    candidate('candidate-1', 'synthetic-work-1', [sha('c'), sha('a')]),
    candidate('candidate-2', 'synthetic-work-2', [sha('f')]),
    candidate('candidate-3', 'synthetic-work-1', [sha('a'), sha('d'), sha('b')]),
  ], 'LIVE');
  assert.deepEqual(groups.map((group) => group.workIdentity), ['synthetic-work-1', 'synthetic-work-2']);
  assert.deepEqual(groups[0].ownCommitShas, [sha('c'), sha('a'), sha('d'), sha('b')]);
  assert.deepEqual(groups[1].ownCommitShas, [sha('f')]);
});

test('CR2: 본인 커밋 목록이 비거나 3,000개를 넘거나 형식·중복이 틀리면 값을 싣지 않고 거부한다', () => {
  const many = Array.from({ length: 3001 }, (_, index) => index.toString(16).padStart(40, '0'));
  const missing = candidate();
  delete missing.ownCommitShas;
  const inputs = [[], 'not-an-array', [sha('A')], ['abc'], [sha('a'), sha('a')], [null], many]
    .map((ownCommitShas) => candidate('candidate-1', 'synthetic-work-1', ownCommitShas));
  for (const input of [missing, ...inputs]) {
    assert.throws(() => prepareRegistrationBatch([input], 'MOCK'),
      (error) => {
        inputError('INVALID_INPUT', 'ownCommitShas')(error);
        assert.equal(error.message.includes(sha('a')), false);
        return true;
      });
  }
  // 상한 3,000개는 받는다.
  const groups = prepareRegistrationBatch([candidate('candidate-1', 'synthetic-work-1', many.slice(0, 3000))], 'MOCK');
  assert.equal(groups[0].ownCommitShas.length, 3000);
});

test('검사 중 뜻밖의 Error와 TypeError를 입력 거부로 감싸지 않는다', () => {
  for (const ErrorType of [Error, TypeError]) {
    for (const field of ['title', 'sourceUrl']) {
      const input = candidate();
      const unexpected = new ErrorType('synthetic unexpected failure');
      const target = field === 'sourceUrl' ? input.evidence[0] : input;
      let reads = 0;
      Object.defineProperty(target, field, {
        get() {
          // URL 검사에서 원문 getter 오류까지 포괄해서 감싸던 경계도 확인한다.
          if (field === 'sourceUrl' && reads++ === 0) return 'https://example.invalid/pull/1';
          throw unexpected;
        },
      });
      assert.throws(() => prepareRegistrationBatch([input], 'MOCK'), (error) => {
        assert.equal(error, unexpected);
        assert.equal(error instanceof CatchRegistrationInputError, false);
        return true;
      });
    }
  }
});

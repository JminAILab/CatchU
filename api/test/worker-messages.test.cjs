const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  Verdict,
  applyPatch,
  checkMessage,
  fillTemplate,
  readFixture,
  unidentifiedFields,
} = require('./helpers/worker-messages.cjs');

// #103 본문 「범위」의 사례 9가지와 cases.json 사례 ID의 대응. worker 테스트와 같은 표다.
const ISSUE_CASES = {
  'succeeded-one-candidate': '적합 후보 1건(SUCCEEDED)',
  empty: '정상 0건(EMPTY)',
  'partial-failed': '부분 실패(PARTIAL_FAILED)',
  failed: '실패(FAILED)',
  unidentifiable: '식별 불가(세 ID 중 누락)',
  redelivery: '같은 결과 재전달',
  'same-id-different-content': '같은 ID의 다른 내용',
  'two-candidates-same-work': '두 후보가 같은 작업',
  'progress-events': '진행 알림(RUNNING·UNCERTAIN)',
};

const cases = readFixture('cases.json');
const context = readFixture('context.sample.json').values;

function fill(file, caseId) {
  return fillTemplate(readFixture(file), { ...context, caseId });
}

test('합성 세트는 #103 본문의 사례 9가지를 담는다', () => {
  assert.deepEqual(
    Object.fromEntries(cases.cases.map((item) => [item.caseId, item.issueName])),
    ISSUE_CASES,
  );
});

for (const item of cases.cases) {
  item.messages.forEach((spec, index) => {
    test(`사례 ${item.caseId} 메시지 ${index + 1}은 worker와 같은 판정을 낸다`, () => {
      const message = fill(spec.file, item.caseId);
      assert.doesNotMatch(JSON.stringify(message), /\{\{/);

      const result = checkMessage(spec.schema, message);
      assert.equal(result.verdict, spec.check.verdict);
      assert.deepEqual(result.unidentifiedFields, spec.check.unidentifiedFields);
      if (result.verdict === Verdict.VALID) assert.deepEqual(result.errors, []);
    });
  });
}

for (const spec of cases.negativeControls) {
  test(`음성 대조 ${spec.id}는 worker와 같은 이유로 거부된다`, () => {
    const valid = fill(spec.file, 'succeeded-one-candidate');
    const result = checkMessage(spec.schema, applyPatch(valid, spec.patch));

    assert.equal(result.verdict, spec.check.verdict);
    if (spec.check.unidentifiedFields) {
      assert.deepEqual(result.unidentifiedFields, spec.check.unidentifiedFields);
    }
    for (const error of spec.check.errorsInclude ?? []) {
      assert.ok(
        result.errors.some((actual) => actual.path === error.path && actual.keyword === error.keyword),
        `${error.path} ${error.keyword} 오류가 없음`,
      );
    }
  });
}

test('식별자는 비어 있지 않은 문자열일 때만 읽힌다', () => {
  assert.deepEqual(unidentifiedFields([]), ['resultId', 'requestId', 'attemptId']);
  assert.deepEqual(unidentifiedFields({ resultId: 'r', requestId: ' ', attemptId: null }), [
    'attemptId',
  ]);
});

test('채울 값이 없는 자리표시자는 오류로 막는다', () => {
  assert.throws(() => fillTemplate({ requestId: '{{requestId}}' }, {}), /requestId/);
});

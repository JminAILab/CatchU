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

// NC3 결과 v4(C4)의 모양 경계. 종류별 개수·소속·시각 순서는 등록 입력 검사가 본다(registration-batch 시험).
function resultWithFacts(revisitFacts) {
  const message = fill('results/succeeded-one-candidate.json', 'succeeded-one-candidate');
  message.candidates[0].revisitFacts = revisitFacts;
  return message;
}
const fact = (overrides = {}) => ({ kind: 'TEST_FILES_PRESENT', paths: ['tests/a.test.ts'], commits: ['a'.repeat(40)], ...overrides });

test('NC3 S19 결과 v4는 판본 "3"을 거부하고, 새 칸 셋 가운데 하나라도 빠지면 거부한다', () => {
  const valid = fill('results/succeeded-one-candidate.json', 'succeeded-one-candidate');
  assert.equal(checkMessage('Result', valid).verdict, Verdict.VALID);
  assert.equal(checkMessage('Result', { ...valid, schemaVersion: '3' }).verdict, Verdict.SCHEMA_INVALID);
  for (const field of ['revisitFacts', 'firstWorkAt', 'lastWorkAt']) {
    const missing = structuredClone(valid);
    delete missing.candidates[0][field];
    assert.equal(checkMessage('Result', missing).verdict, Verdict.SCHEMA_INVALID, field);
  }
  const badTime = structuredClone(valid);
  badTime.candidates[0].lastWorkAt = '2026-02-30T00:00:00Z';
  assert.equal(checkMessage('Result', badTime).verdict, Verdict.SCHEMA_INVALID);
});

test('NC3 NFR1.4 RevisitFact는 모르는 칸·모르는 kind·31번째 사실·21개 경로·1,025자 경로·짧은 식별값을 거부한다', () => {
  assert.equal(checkMessage('Result', resultWithFacts(Array.from({ length: 30 }, () => fact()))).verdict, Verdict.VALID);
  assert.equal(checkMessage('Result', resultWithFacts([fact({ paths: ['가'.repeat(1024)] })])).verdict, Verdict.VALID);
  const rejected = [
    Array.from({ length: 31 }, () => fact()),
    [{ ...fact(), line: '숨긴 줄 글자' }],
    [fact({ kind: 'RENAMED' })],
    [fact({ paths: Array.from({ length: 21 }, (_, index) => `tests/${index}.test.ts`) })],
    [fact({ commits: Array.from({ length: 21 }, (_, index) => index.toString(16).padStart(40, '0')) })],
    [fact({ paths: ['가'.repeat(1025)] })],
    [fact({ paths: [''] })],
    [fact({ commits: ['a'.repeat(7)] })],
    [fact({ commits: ['A'.repeat(40)] })],
  ];
  for (const facts of rejected) {
    assert.equal(checkMessage('Result', resultWithFacts(facts)).verdict, Verdict.SCHEMA_INVALID);
  }
});

test('식별자는 비어 있지 않은 문자열일 때만 읽힌다', () => {
  assert.deepEqual(unidentifiedFields([]), ['resultId', 'requestId', 'attemptId']);
  assert.deepEqual(unidentifiedFields({ resultId: 'r', requestId: ' ', attemptId: null }), [
    'attemptId',
  ]);
});

test('채울 값이 없는 자리표시자는 오류로 막는다', () => {
  assert.throws(() => fillTemplate({ requestId: '{{requestId}}' }, {}), /requestId/);
});

// 새 Catch NC2 — 작업 전체 한계 문장 상수와 고르기(기능 설계 BR1.3·BR1.6, 신뢰성 설계 3절, 계약 C6, NFR8.2).
//
// 먼저 정한 시나리오·기대 결과·실패 조건(US6.3, Unit 시험 안내 「실패 조건」 문장 대조). 세부 시험 코드는 구현 뒤 쓴다.
// - 기대: 고르기는 상수 한계 문장 둘과 글자까지 같은 문장, 같은 작업 경고 앞부분 둘로 시작하는 문장만 근거 순서대로 고르고 같은 글자는 한 번이다.
//         api 상수 넷은 worker/app/candidates/build.py 글자에 따옴표 경계째(한계 문장은 "…", 경고 앞부분은 f"…) 있다.
//         원본 글자에서 한 문장만 바꾼 사본으로 같은 검사를 돌리면 실패하고, 실패 메시지는 그 상수 이름과 두 파일 경로를 함께 고치라고 알린다.
// - 실패 조건: worker 원본 한 문장만 바꿨는데 통과, 다른 문장 안에 같은 글자가 있어 통과, 실패 메시지에 상수 이름·두 파일 경로가 없음,
//         근거별 조회 상태나 다른 한계가 골라짐, 같은 문장이 두 번 골라짐.
//
// worker 파일은 읽기만 한다(경로 기준은 test/analysis/shared-fixtures.check.cjs와 같다). DB를 쓰지 않는다.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const { WORK_LIMIT_PREFIXES, WORK_LIMIT_SENTENCES, isWorkLimit, pickWorkLimits } = require('../../dist/publications/work-limit-sentences');

const WORKER_FILE = resolve(__dirname, '../../../worker/app/candidates/build.py');
const LISTS = WORK_LIMIT_SENTENCES._LISTS_INCOMPLETE;
const EARLIER = WORK_LIMIT_SENTENCES._EARLIER_LIST_INCOMPLETE;
const RESUBMISSION = `${WORK_LIMIT_PREFIXES.RESUBMISSION_UNCONFIRMED}PR #3·#5, 공백을 무시한 변경 비교로 같은 변경을 확정하지 못함)`;
const CHERRY_PICK = `${WORK_LIMIT_PREFIXES.CHERRY_PICK_UNCONFIRMED}커밋 aaaaaaaaaaaa·bbbbbbbbbbbb, 공백을 무시한 변경 비교로 같은 변경을 확정하지 못함)`;

/** 상수 넷과 worker 원본에서 찾을 따옴표 경계 글자. 한계 문장은 큰따옴표째, 경고 앞부분은 f-string 시작째다(BR1.6). */
const NEEDLES = [
  ...Object.entries(WORK_LIMIT_SENTENCES).map(([name, sentence]) => ({ name, needle: `"${sentence}"` })),
  ...Object.entries(WORK_LIMIT_PREFIXES).map(([name, prefix]) => ({ name, needle: `f"${prefix}` })),
];

/** worker 원본 글자에 상수 넷이 따옴표 경계째 있는지 본다. 없는 상수가 있으면 그 이름과 함께 고칠 두 파일을 알리는 오류를 던진다. */
function assertWorkerSentences(source) {
  const missing = NEEDLES.filter(({ needle }) => !source.includes(needle)).map(({ name }) => name);
  if (missing.length > 0) {
    throw new assert.AssertionError({ message: missing.map((name) => `${name}: worker/app/candidates/build.py의 이 문장이 바뀌었다면 `
      + 'api/src/publications/work-limit-sentences.ts의 같은 상수도 함께 고친다').join('\n') });
  }
}

test('NC2 AC6.3.1 고르기: 두 근거의 같은 한계 문장은 처음 나온 자리에 한 번만 둔다', () => {
  assert.deepEqual(pickWorkLimits([[LISTS], [LISTS, EARLIER], [EARLIER]]), [LISTS, EARLIER]);
});

test('NC2 AC6.3.2 고르기: 같은 작업 경고 앞부분으로 시작하는 문장은 고르고 근거별 조회 상태·본인 커밋 20건 한계·비슷한 다른 문장은 빼며 근거 순서를 지킨다', () => {
  const perEvidence = ['병합 커밋이라 변경 내용을 조회하지 않았다', '본인 커밋이 20건을 넘어 최근 20건만 근거로 담았다',
    'PR 조회가 허용되지 않아 PR 소속은 확인하지 않았다', `${LISTS}.`, `앞말 ${LISTS}`, '같은 작업을 다시 낸 것일 수 있다', ''];
  assert.deepEqual(pickWorkLimits([[perEvidence[0], CHERRY_PICK], perEvidence, [RESUBMISSION, LISTS]]), [CHERRY_PICK, RESUBMISSION, LISTS]);
  for (const sentence of perEvidence) assert.equal(isWorkLimit(sentence), false, sentence);
  for (const sentence of [LISTS, EARLIER, RESUBMISSION, CHERRY_PICK]) assert.equal(isWorkLimit(sentence), true, sentence);
});

test('NC2 AC6.3.3 고르기: 근거가 없거나 고를 문장이 없으면 빈 배열이고 입력을 바꾸지 않는다', () => {
  assert.deepEqual(pickWorkLimits([]), []);
  assert.deepEqual(pickWorkLimits([[], ['병합 커밋이라 변경 내용을 조회하지 않았다']]), []);
  const input = Object.freeze([Object.freeze([LISTS, LISTS])]);
  assert.deepEqual(pickWorkLimits(input), [LISTS]);
  assert.equal(Object.isFrozen(WORK_LIMIT_SENTENCES) && Object.isFrozen(WORK_LIMIT_PREFIXES), true, '상수는 바꿀 수 없다');
});

test('NC2 C6 대조: api 한계 문장 상수 넷이 worker 원본에 따옴표 경계째 있다', () => {
  assert.equal(NEEDLES.length, 4);
  assertWorkerSentences(readFileSync(WORKER_FILE, 'utf8'));
});

test('NC2 C6 반례: 원본에서 한 문장만 바꾸면 그 상수 이름과 고칠 두 파일 경로를 담은 메시지로 실패한다', () => {
  const source = readFileSync(WORKER_FILE, 'utf8');
  for (const { name, needle } of NEEDLES) {
    assert.ok(source.includes(needle), name);
    // 따옴표 바로 안쪽에 글자를 끼워 한 문장만 바꾼다. 나머지 셋은 그대로다.
    const changed = source.replace(needle, needle.replace(/^(f?")/, '$1바뀐 '));
    assert.throws(() => assertWorkerSentences(changed), (error) => {
      assert.ok(error.message.startsWith(`${name}: `), error.message);
      assert.equal(error.message.split('\n').length, 1, '바꾼 상수 하나만 알린다');
      assert.ok(error.message.includes('worker/app/candidates/build.py') && error.message.includes('api/src/publications/work-limit-sentences.ts'));
      return true;
    }, name);
  }
});

test('NC2 C6 반례: 문장이 다른 문장 안에만 있거나 따옴표 경계가 없으면 통과하지 않는다', () => {
  const source = readFileSync(WORKER_FILE, 'utf8');
  const inside = source.replace(`"${LISTS}"`, `"앞말 ${LISTS}"`);
  assert.throws(() => assertWorkerSentences(inside), /_LISTS_INCOMPLETE/);
  const unquoted = source.replace(`f"${WORK_LIMIT_PREFIXES.CHERRY_PICK_UNCONFIRMED}`, `"${WORK_LIMIT_PREFIXES.CHERRY_PICK_UNCONFIRMED}`);
  assert.throws(() => assertWorkerSentences(unquoted), /CHERRY_PICK_UNCONFIRMED/);
});

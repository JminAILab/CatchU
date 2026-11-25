// 발행 프리셋 U1 — 프리셋 경로 본문 검사(규칙 BR1.2·BR1.4·BR2.4, NFR2.6·NFR3.1, 기능 설계 검토 R-06). DB 없는 순수 함수 시험.
//
// 먼저 정한 시나리오·기대 결과·실패 조건(unit-test-instructions 「저장」·「세기」 묶음). 세부 시험 코드는 구현 뒤 쓴다.
// - 이름: 앞뒤 공백을 뺀 1~50자(코드 포인트)를 뺀 값으로 받고, HTML을 해석하지 않는다. 0자·51자·문자열 아님·NUL은 400 field name.
// - 저장 항목: 0~20개, 같은 (종류, ID) 두 번 안 됨, kind 셋·UUID만. 21개·중복은 400 field items. 정의 밖 칸은 400 body.
// - 세기 항목: 1~50개. 0개·51개는 400 field items.
// - 오류 응답에 입력값(이름·ID)을 담지 않는다.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { ApiError } = require('../../dist/common/errors');
const { PRESET_LIMITS, emptyPresetQuery, presetIdInput, presetMeasureInput, presetSaveInput } = require('../../dist/presets/preset-input');

const catchRef = (sourceId = randomUUID()) => ({ kind: 'CATCH', sourceId });
const textRef = (sourceId = randomUUID()) => ({ kind: 'TEXT_MATERIAL', sourceId });

function violationsOf(run) {
  try {
    run();
  } catch (error) {
    assert.ok(error instanceof ApiError);
    assert.equal(error.code, 'VALIDATION_FAILED');
    return error.details.violations;
  }
  return assert.fail('400이어야 한다');
}

test('이름은 앞뒤 공백을 뺀 1~50자(코드 포인트)를 그 값으로 받고, 같은 글자를 HTML로 바꾸지 않는다(BR1.2, NFR3.1)', () => {
  assert.equal(presetSaveInput({ name: '  면접용  ', items: [] }).name, '면접용');
  assert.equal(presetSaveInput({ name: '가', items: [] }).name, '가');
  assert.equal([...presetSaveInput({ name: '가'.repeat(48) + '😀😀', items: [] }).name].length, 50, '50 코드 포인트');
  assert.equal(presetSaveInput({ name: '<b>굵게</b>', items: [] }).name, '<b>굵게</b>');
  assert.equal(PRESET_LIMITS.nameMax, 50);
});

test('이름 0자·51자·문자열 아님·NUL·고립 서로게이트는 400 field name이고 입력값을 담지 않는다', () => {
  const cases = [
    [{ name: '   ', items: [] }, [{ field: 'name', reason: 'isNotEmpty' }]],
    [{ name: '가'.repeat(51), items: [] }, [{ field: 'name', reason: 'maxLength' }]],
    [{ name: 7, items: [] }, [{ field: 'name', reason: 'isString' }]],
    [{ items: [] }, [{ field: 'name', reason: 'isString' }]],
    [{ name: 'a\u0000', items: [] }, [{ field: 'name', reason: 'noNul' }]],
    [{ name: 'a\uD800', items: [] }, [{ field: 'name', reason: 'isWellFormed' }]],
  ];
  for (const [body, violations] of cases) assert.deepEqual(violationsOf(() => presetSaveInput(body)), violations, JSON.stringify(body));
});

test('저장 항목은 0~20개이고 배열 순서를 지키며 ID를 소문자로 맞춘다. 21개·중복은 400 field items다(BR1.4·BR1.6)', () => {
  const id = randomUUID();
  const twenty = Array.from({ length: 20 }, () => textRef());
  assert.deepEqual(presetSaveInput({ name: 'n', items: [] }).items, []);
  assert.deepEqual(presetSaveInput({ name: 'n', items: twenty }).items, twenty);
  assert.deepEqual(presetSaveInput({ name: 'n', items: [catchRef(id.toUpperCase())] }).items, [catchRef(id)]);
  assert.deepEqual(violationsOf(() => presetSaveInput({ name: 'n', items: [...twenty, textRef()] })), [{ field: 'items', reason: 'maxItems' }]);
  assert.deepEqual(violationsOf(() => presetSaveInput({ name: 'n', items: [catchRef(id), textRef(id), catchRef(id.toUpperCase())] })),
    [{ field: 'items', reason: 'arrayUnique' }], '종류가 다르면 같은 ID도 다른 자료');
});

test('항목 모양(객체·kind 셋·UUID·추가 칸)과 정의 밖 칸은 위치만 알리는 400이다(NFR2.6)', () => {
  const secret = 'SECRET-NAME-MUST-NOT-LEAVE';
  const cases = [
    [{ name: 'n', items: 'x' }, [{ field: 'items', reason: 'isArray' }]],
    [{ name: 'n', items: [{ kind: 'IMAGE', sourceId: randomUUID() }] }, [{ field: 'items[0].kind', reason: 'isIn' }]],
    [{ name: 'n', items: [{ kind: 'CATCH', sourceId: 'not-a-uuid' }] }, [{ field: 'items[0].sourceId', reason: 'isUuid' }]],
    [{ name: 'n', items: [{ ...catchRef(), [secret]: 1 }] }, [{ field: 'items[0]', reason: 'isObject' }]],
    [{ name: 'n', items: [null] }, [{ field: 'items[0]', reason: 'isObject' }]],
    [{ name: secret, items: [], [secret]: true }, [{ field: 'body', reason: 'whitelistValidation' }]],
  ];
  for (const [body, violations] of cases) {
    const found = violationsOf(() => presetSaveInput(body));
    assert.deepEqual(found, violations);
    assert.equal(JSON.stringify(found).includes(secret), false, '입력값을 담지 않는다');
  }
  assert.deepEqual(violationsOf(() => presetSaveInput([])), [{ field: 'body', reason: 'isObject' }]);
});

test('세기 항목은 1~50개이고 같은 자료 두 번은 안 되며, 저장 칸 이름은 정의 밖이다(BR2.4)', () => {
  const fifty = Array.from({ length: 50 }, () => catchRef());
  assert.deepEqual(presetMeasureInput({ items: fifty }), fifty);
  assert.deepEqual(violationsOf(() => presetMeasureInput({ items: [] })), [{ field: 'items', reason: 'arrayMinSize' }]);
  assert.deepEqual(violationsOf(() => presetMeasureInput({ items: [...fifty, catchRef()] })), [{ field: 'items', reason: 'maxItems' }]);
  assert.deepEqual(violationsOf(() => presetMeasureInput({ items: [fifty[0], fifty[0]] })), [{ field: 'items', reason: 'arrayUnique' }]);
  assert.deepEqual(violationsOf(() => presetMeasureInput({ name: 'n', items: [fifty[0]] })), [{ field: 'body', reason: 'whitelistValidation' }]);
});

test('경로 ID는 UUID일 때만 소문자로 받고 아니면 null(없는 프리셋과 같은 404)이다. 쿼리는 받지 않는다(NFR2.2)', () => {
  const id = randomUUID();
  assert.equal(presetIdInput(id.toUpperCase()), id);
  for (const value of ['not-a-uuid', '', undefined, 7]) assert.equal(presetIdInput(value), null);
  emptyPresetQuery({});
  assert.deepEqual(violationsOf(() => emptyPresetQuery({ x: '1' })), [{ field: 'query', reason: 'whitelistValidation' }]);
});

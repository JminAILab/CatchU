const assert = require('node:assert/strict');
const { test } = require('node:test');
const { validateProfileInput, PROFILE_LIMITS } = require('../dist/member-profile/profile-input');
const base = () => ({ displayName: '이름', introduction: '', desiredRole: '', skills: [] });
function invalid(body, field, reason) {
  assert.throws(() => validateProfileInput(body), error => error.getStatus() === 400
    && error.code === 'VALIDATION_FAILED'
    && error.details.violations.some(v => v.field === field && v.reason === reason));
}

test('표시 이름만 trim하고 내부 공백·대소문자·유니코드 조합과 선택 입력은 보존', () => {
  const body = { displayName: ' \tA  e\u0301 한글\n', introduction: ' 소개 ', desiredRole: ' 개발 ', skills: ['React', 'react', ' ', ''] };
  assert.deepEqual(validateProfileInput(body), { ...body, displayName: 'A  e\u0301 한글' });
  const result = validateProfileInput(body);
  result.skills.push('별도');
  assert.equal(body.skills.length, 4);
});
test('빈 이름·공백 이름은 거부하지만 선택 문자열 빈 값·빈 배열은 허용', () => {
  assert.deepEqual(validateProfileInput(base()), base());
  for (const displayName of ['', ' ', '\t\n', '\u00a0\u3000']) invalid({ ...base(), displayName }, 'displayName', 'isNotEmpty');
});
for (const field of ['displayName', 'introduction', 'desiredRole', 'skills']) {
  test(`${field}의 NUL은 위치와 관계없이 거부하고 원본을 변경하지 않는다`, () => {
    for (const value of ['\u0000검토용', '검토\u0000용', '검토용\u0000']) {
      const body = { ...base(), [field]: field === 'skills' ? ['정상', value] : value };
      const original = structuredClone(body);
      invalid(body, field === 'skills' ? 'skills.1' : field, 'noNul');
      assert.deepEqual(body, original);
      try { validateProfileInput(body); } catch (error) {
        assert.ok(!JSON.stringify(error.details).includes('검토'));
      }
    }
  });
}
test('NUL 이외의 제어문자를 금지하지 않고 한글·이모지와 내부 공백을 보존', () => {
  const body = { displayName: '  한글😀\u0001이름\t끝  ', introduction: '\t소개\n\u0001',
    desiredRole: '직무\r\n\u0002', skills: ['React😀\t\n\u0003', ''] };
  assert.deepEqual(validateProfileInput(body), { ...body, displayName: body.displayName.trim() });
});
for (const [field, limit] of [['displayName', 50], ['introduction', 200], ['desiredRole', 100]]) {
  test(`${field} 코드 포인트 ${limit} 경계는 보존하고 ${limit + 1}은 거부`, () => {
    const value = '😀'.repeat(limit);
    const body = { ...base(), [field]: field === 'displayName' ? ` ${value} ` : value };
    assert.equal(validateProfileInput(body)[field], value);
    invalid({ ...base(), [field]: value + '가' }, field, 'maxLength');
  });
}
test('기술 목록 20개·각 50자 경계와 초과를 구분하고 입력을 자르지 않는다', () => {
  const body = { ...base(), skills: Array(20).fill('😀'.repeat(50)) };
  assert.deepEqual(validateProfileInput(body), body);
  invalid({ ...base(), skills: Array(21).fill('기술') }, 'skills', 'arrayMaxSize');
  invalid({ ...base(), skills: ['가'.repeat(51)] }, 'skills.0', 'maxLength');
});
test('결합 글자와 이모지도 코드 포인트 단위로 계산한다', () => {
  assert.equal(PROFILE_LIMITS.displayName, 50);
  assert.equal(validateProfileInput({ ...base(), displayName: 'e\u0301'.repeat(25) }).displayName, 'e\u0301'.repeat(25));
  invalid({ ...base(), displayName: 'e\u0301'.repeat(26) }, 'displayName', 'maxLength');
});
test('필수 필드 누락·null·잘못된 타입·기술 원소 타입을 거부', () => {
  for (const body of [null, [], '입력', 1]) invalid(body, 'body', 'isObject');
  for (const field of ['displayName', 'introduction', 'desiredRole', 'skills']) {
    const body = base(); delete body[field];
    invalid(body, field, field === 'skills' ? 'isArray' : 'isString');
    invalid({ ...base(), [field]: null }, field, field === 'skills' ? 'isArray' : 'isString');
  }
  invalid({ ...base(), displayName: 7 }, 'displayName', 'isString');
  invalid({ ...base(), skills: ['정상', 1] }, 'skills.1', 'isString');
});
test('추가 필드와 변환 시 누락되는 특수 키도 거부하고 입력 이름·값을 반사하지 않는다', () => {
  for (const key of ['memberId', 'profileId', 'github', 'inputProvenance', 'constructor', '__proto__', 'synthetic-secret-field']) {
    const body = { ...base(), [key]: 'synthetic-secret-value' };
    invalid(body, 'body', 'whitelistValidation');
    try { validateProfileInput(body); } catch (error) {
      assert.ok(!JSON.stringify(error.details).includes(key));
      assert.ok(!JSON.stringify(error.details).includes('synthetic-secret-value'));
    }
  }
});

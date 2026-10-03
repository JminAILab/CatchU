const assert = require('node:assert/strict');
const { test } = require('node:test');
const { validateShareCreate, shareLinkExpiresAt } = require('../dist/share-links/share-create.js');

test('trim 결과가 빈 제목과 문자열이 아닌 제목을 거부한다', () => {
  for (const title of ['', ' \t\n', '\u3000', null, 123, {}, []]) {
    const result = validateShareCreate({ title });
    assert.equal(result.valid, false);
    assert.ok(result.violations.some(({ field }) => field === 'title'));
  }
  assert.equal(validateShareCreate({}).valid, false);
});

test('제목 앞뒤 공백만 정규화하고 원본 객체를 변경하지 않는다', () => {
  const body = Object.freeze({ title: '  My  Catch \n' });
  assert.deepEqual(validateShareCreate(body), { valid: true, value: { title: 'My  Catch' } });
  assert.equal(body.title, '  My  Catch \n');
});

test('객체가 아닌 요청을 거부한다', () => {
  for (const body of [null, undefined, [], 'title', 1, true]) {
    assert.equal(validateShareCreate(body).valid, false);
  }
});

test('클라이언트 소유자·만료시각과 알 수 없는 필드를 거부한다', () => {
  for (const key of ['ownerId', 'memberId', 'expiresAt', 'unexpected']) {
    assert.equal(validateShareCreate({ title: 'Catch', [key]: 'value' }).valid, false);
  }
});

test('비밀번호 생략은 허용하지만 null·빈 문자열·다른 타입은 거부한다', () => {
  assert.deepEqual(validateShareCreate({ title: 'Catch' }), { valid: true, value: { title: 'Catch' } });
  for (const password of [null, '', undefined, 123, false, {}]) {
    assert.equal(validateShareCreate({ title: 'Catch', password }).valid, false);
  }
});

test('비밀번호는 trim하거나 대소문자를 바꾸지 않는다', () => {
  for (const password of ['  Synthetic Password  ', ' ']) {
    assert.deepEqual(validateShareCreate({ title: ' Catch ', password }), {
      valid: true, value: { title: 'Catch', password },
    });
  }
});

test('오류 결과에 원문 비밀번호나 임의 필드 이름을 반사하지 않는다', () => {
  const secret = 'synthetic-only-secret';
  const result = validateShareCreate({ title: ' ', password: secret, [secret]: secret });
  assert.equal(result.valid, false);
  assert.equal(JSON.stringify(result).includes(secret), false);
});

test('제목 정규화 결과는 요청 키 순서·제목 앞뒤 공백과 무관하다', () => {
  assert.deepEqual(
    validateShareCreate({ password: 'synthetic', title: ' Catch ' }),
    validateShareCreate({ title: 'Catch', password: 'synthetic' }),
  );
});

test('월말·윤년·서머타임 경계에서도 정확히 30일 후 만료한다', () => {
  for (const [start, expected] of [
    ['2026-01-31T12:00:00Z', '2026-03-02T12:00:00.000Z'],
    ['2024-02-01T12:00:00Z', '2024-03-02T12:00:00.000Z'],
    ['2026-03-01T12:00:00-05:00', '2026-03-31T17:00:00.000Z'],
    ['2026-09-29T23:59:59.123+09:00', '2026-10-29T14:59:59.123Z'],
  ]) {
    const issuedAt = new Date(start);
    const before = issuedAt.getTime();
    assert.equal(shareLinkExpiresAt(issuedAt).toISOString(), expected);
    assert.equal(issuedAt.getTime(), before);
  }
});

test('잘못된 시각이나 Date 범위를 넘는 만료시각을 거부한다', () => {
  assert.throws(() => shareLinkExpiresAt(new Date(NaN)), RangeError);
  assert.throws(() => shareLinkExpiresAt(new Date(8640000000000000)), RangeError);
});

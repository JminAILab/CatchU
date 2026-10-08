const assert = require('node:assert/strict');
const { randomBytes, scryptSync } = require('node:crypto');
const { test } = require('node:test');
const {
  hashLinkPassword, verifyLinkPassword, PasswordVerifierFormatError, PASSWORD_HASH_PARAMS,
} = require('../dist/share-links/link-password.js');

const PASSWORD = 'synthetic-only-password';

// 모듈을 거치지 않고 저장 형식대로 검증값을 만든다. 이전 매개변수로 저장된 값을 흉내 낸다.
function verifierWith(password, params) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32, { ...params, maxmem: 128 * params.N * params.r * 2 });
  return ['scrypt', '1', params.N, params.r, params.p, salt.toString('base64url'), hash.toString('base64url')].join('$');
}

test('새 검증값은 OWASP 권고 조합 N=2^15·r=8·p=3으로 저장된다(#219)', async () => {
  assert.deepEqual({ ...PASSWORD_HASH_PARAMS }, { N: 2 ** 15, r: 8, p: 3 });
  const stored = await hashLinkPassword(PASSWORD);
  assert.deepEqual(stored.split('$').slice(2, 5), ['32768', '8', '3']);
  assert.equal(await verifyLinkPassword(PASSWORD, stored), true);
});

test('이전 매개변수 N=2^15·r=8·p=1로 저장된 값도 계속 검증된다(#219)', async () => {
  const legacy = verifierWith(PASSWORD, { N: 2 ** 15, r: 8, p: 1 });
  assert.equal(await verifyLinkPassword(PASSWORD, legacy), true);
  assert.equal(await verifyLinkPassword(`${PASSWORD}x`, legacy), false);
});

test('검증값은 원문을 포함하지 않고 형식·매개변수를 기록한다', async () => {
  const stored = await hashLinkPassword(PASSWORD);
  assert.equal(stored.includes(PASSWORD), false);
  const [prefix, version, N, r, p, salt, hash] = stored.split('$');
  assert.deepEqual([prefix, version, Number(N), Number(r), Number(p)],
    ['scrypt', '1', PASSWORD_HASH_PARAMS.N, PASSWORD_HASH_PARAMS.r, PASSWORD_HASH_PARAMS.p]);
  assert.equal(Buffer.from(salt, 'base64url').length, 16);
  assert.equal(Buffer.from(hash, 'base64url').length, 32);
});

test('같은 비밀번호도 매번 다른 salt로 다른 검증값이 된다', async () => {
  const [a, b] = await Promise.all([hashLinkPassword(PASSWORD), hashLinkPassword(PASSWORD)]);
  assert.notEqual(a, b);
  assert.equal(await verifyLinkPassword(PASSWORD, a), true);
  assert.equal(await verifyLinkPassword(PASSWORD, b), true);
});

test('맞는 비밀번호만 통과하고 공백·대소문자·유니코드 조합을 바꾸지 않는다', async () => {
  const original = ' Synthetic 한글 ';
  const stored = await hashLinkPassword(original);
  assert.equal(await verifyLinkPassword(original, stored), true);
  for (const other of ['Synthetic 한글', ' synthetic 한글 ', ' Synthetic 한글  ', ' Synthetic 한글 '.normalize('NFD'), 'x']) {
    assert.equal(await verifyLinkPassword(other, stored), false, JSON.stringify(other));
  }
});

test('빈 비밀번호나 문자열이 아닌 값은 해시하지 않는다', async () => {
  for (const value of ['', null, undefined, 123, {}]) {
    await assert.rejects(hashLinkPassword(value), TypeError);
  }
});

test('깨진 검증값은 false로 숨기지 않고 형식 오류로 알린다', async () => {
  const stored = await hashLinkPassword(PASSWORD);
  const parts = stored.split('$');
  const broken = [
    '', 'plain-text', null, 42,
    ['bcrypt', ...parts.slice(1)].join('$'),
    ['scrypt', '2', ...parts.slice(2)].join('$'),
    [...parts.slice(0, 2), '1024', ...parts.slice(3)].join('$'),
    [...parts.slice(0, 2), '1048576', ...parts.slice(3)].join('$'),
    [...parts.slice(0, 2), '30000', ...parts.slice(3)].join('$'),
    [...parts.slice(0, 3), '99', ...parts.slice(4)].join('$'),
    [...parts.slice(0, 5), 'AAAA', parts[6]].join('$'),
    [...parts.slice(0, 6), `${parts[6]}!`].join('$'),
    `${stored}$extra`,
  ];
  for (const value of broken) {
    await assert.rejects(verifyLinkPassword(PASSWORD, value), PasswordVerifierFormatError, String(value));
  }
});

test('형식 오류 메시지에 원문이나 저장값을 넣지 않는다', async () => {
  const secret = 'synthetic-secret-value';
  await assert.rejects(verifyLinkPassword(secret, `scrypt$1$${secret}`), (error) => {
    assert.equal(String(error.message).includes(secret), false);
    return true;
  });
  await assert.rejects(hashLinkPassword(''), (error) => {
    assert.equal(String(error.message).includes(secret), false);
    return true;
  });
});

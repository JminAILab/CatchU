const assert = require('node:assert/strict');
const { test } = require('node:test');
const { validateShareCreate } = require('../dist/share-links/share-create.js');
const { hashLinkPassword } = require('../dist/share-links/link-password.js');
const {
  shareCreateFingerprint, isSameShareCreate, matchStoredShareCreate, verifyPendingPassword,
} = require('../dist/share-links/share-create-fingerprint.js');

const valid = (body) => {
  const result = validateShareCreate(body);
  assert.equal(result.valid, true);
  return result.value;
};

test('필드 순서와 제목 앞뒤 공백은 같은 지문이 된다', () => {
  const a = shareCreateFingerprint(valid({ title: ' Catch ', password: 'synthetic' }));
  const b = shareCreateFingerprint(valid({ password: 'synthetic', title: 'Catch' }));
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test('제목 안쪽 내용·대소문자·유니코드 조합이 다르면 다른 지문이 된다', () => {
  const base = shareCreateFingerprint(valid({ title: 'My Catch' }));
  for (const title of ['My  Catch', 'my catch', 'My Catch!', '카탈로그'.normalize('NFD')]) {
    assert.notEqual(shareCreateFingerprint(valid({ title })), base, title);
  }
  assert.notEqual(
    shareCreateFingerprint(valid({ title: '카탈로그' })),
    shareCreateFingerprint(valid({ title: '카탈로그'.normalize('NFD') })),
  );
});

test('비밀번호 원문은 지문에 들어가지 않고 설정 여부만 반영된다', () => {
  const withA = shareCreateFingerprint(valid({ title: 'Catch', password: 'synthetic-a' }));
  const withB = shareCreateFingerprint(valid({ title: 'Catch', password: 'synthetic-b' }));
  const without = shareCreateFingerprint(valid({ title: 'Catch' }));
  assert.equal(withA, withB);
  assert.notEqual(withA, without);
});

test('검증을 거치지 않은 값은 지문을 만들지 않는다', () => {
  for (const input of [null, {}, { title: '' }, { title: ' Catch ' }, { title: 1 }]) {
    assert.throws(() => shareCreateFingerprint(input), TypeError);
  }
});

test('같은 키 재요청: 같은 제목·같은 비밀번호만 같은 요청으로 본다', async () => {
  const first = valid({ title: 'Catch', password: 'synthetic-a' });
  const stored = { requestFingerprint: shareCreateFingerprint(first), passwordVerifier: await hashLinkPassword('synthetic-a') };
  assert.equal(await isSameShareCreate(valid({ password: 'synthetic-a', title: ' Catch ' }), stored), true);
  assert.equal(await isSameShareCreate(valid({ title: 'Catch', password: 'synthetic-b' }), stored), false);
  assert.equal(await isSameShareCreate(valid({ title: 'Catch' }), stored), false);
  assert.equal(await isSameShareCreate(valid({ title: 'Other', password: 'synthetic-a' }), stored), false);
});

test('같은 키 재요청: 비밀번호 없는 링크', async () => {
  const stored = { requestFingerprint: shareCreateFingerprint(valid({ title: 'Catch' })), passwordVerifier: null };
  assert.equal(await isSameShareCreate(valid({ title: ' Catch' }), stored), true);
  assert.equal(await isSameShareCreate(valid({ title: 'Catch', password: 'synthetic' }), stored), false);
});

test('기록과 링크의 비밀번호 설정 여부가 어긋나면 409가 아닌 서버 오류로 올린다', async () => {
  const withPassword = valid({ title: 'Catch', password: 'synthetic' });
  await assert.rejects(isSameShareCreate(withPassword,
    { requestFingerprint: shareCreateFingerprint(withPassword), passwordVerifier: null }));
  const without = valid({ title: 'Catch' });
  await assert.rejects(isSameShareCreate(without,
    { requestFingerprint: shareCreateFingerprint(without), passwordVerifier: await hashLinkPassword('synthetic') }));
});

test('잠금 안에서 쓰는 판정은 해시를 계산하지 않고 비교 대상만 돌려준다(#220)', async () => {
  const link = require('../dist/share-links/link-password.js');
  const original = link.verifyLinkPassword;
  let calls = 0;
  link.verifyLinkPassword = async (...args) => { calls += 1; return original(...args); };
  try {
    const first = valid({ title: 'Catch', password: 'synthetic-a' });
    const verifier = await hashLinkPassword('synthetic-a');
    const stored = { requestFingerprint: shareCreateFingerprint(first), passwordVerifier: verifier };

    const same = matchStoredShareCreate(valid({ title: ' Catch ', password: 'synthetic-a' }), stored);
    assert.deepEqual(same, { same: true, passwordCheck: { password: 'synthetic-a', verifier } });
    // 비밀번호만 다른 요청도 여기서는 같은 본문이다. 비교 대상을 반드시 비교해야 한다.
    const other = matchStoredShareCreate(valid({ title: 'Catch', password: 'synthetic-b' }), stored);
    assert.deepEqual(other, { same: true, passwordCheck: { password: 'synthetic-b', verifier } });
    assert.deepEqual(matchStoredShareCreate(valid({ title: 'Other', password: 'synthetic-a' }), stored), { same: false });
    assert.deepEqual(matchStoredShareCreate(valid({ title: 'Catch' }), stored), { same: false });
    assert.equal(calls, 0, '판정만으로는 해시를 계산하지 않는다');

    assert.equal(await verifyPendingPassword(same.passwordCheck), true);
    assert.equal(await verifyPendingPassword(other.passwordCheck), false);
    assert.equal(await verifyPendingPassword(null), true, '비교 대상이 없으면(비밀번호 없는 링크) 통과');
    assert.equal(calls, 2);

    const plain = { requestFingerprint: shareCreateFingerprint(valid({ title: 'Catch' })), passwordVerifier: null };
    assert.deepEqual(matchStoredShareCreate(valid({ title: ' Catch' }), plain), { same: true, passwordCheck: null });
    assert.deepEqual(matchStoredShareCreate(valid({ title: 'Catch', password: 'synthetic' }), plain), { same: false });
    const withPassword = valid({ title: 'Catch', password: 'synthetic' });
    assert.throws(() => matchStoredShareCreate(withPassword,
      { requestFingerprint: shareCreateFingerprint(withPassword), passwordVerifier: null }), /inconsistent/);
  } finally {
    link.verifyLinkPassword = original;
  }
});

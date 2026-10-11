const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { issueLinkGrant, verifyLinkGrant, readLinkGrantKey, LINK_GRANT_TTL_MS } = require('../dist/share-links/link-grant.js');

const key = randomBytes(32);
const NOW = new Date('2026-10-01T00:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const farExpiry = new Date(NOW.getTime() + 100 * HOUR);

test('grant는 발급한 링크에서만, 만료 전까지만 유효하다', () => {
  const linkId = randomUUID();
  const grant = issueLinkGrant(key, linkId, farExpiry, NOW);
  assert.equal(verifyLinkGrant(key, grant, linkId, NOW), true);
  assert.equal(verifyLinkGrant(key, grant, randomUUID(), NOW), false, '다른 링크에 쓸 수 없다');
  assert.equal(verifyLinkGrant(key, grant, linkId, new Date(NOW.getTime() + LINK_GRANT_TTL_MS - 1)), true);
  assert.equal(verifyLinkGrant(key, grant, linkId, new Date(NOW.getTime() + LINK_GRANT_TTL_MS)), false, '발급 후 2시간이면 만료');
  assert.equal(verifyLinkGrant(randomBytes(32), grant, linkId, NOW), false, '다른 키로 서명한 grant는 무효');
});

test('grant 수명은 링크 만료 시각을 넘지 않는다', () => {
  const linkId = randomUUID();
  const soon = new Date(NOW.getTime() + 30 * 60 * 1000);
  const grant = issueLinkGrant(key, linkId, soon, NOW);
  assert.equal(verifyLinkGrant(key, grant, linkId, new Date(soon.getTime() - 1)), true);
  assert.equal(verifyLinkGrant(key, grant, linkId, soon), false);
  assert.throws(() => issueLinkGrant(key, linkId, NOW, NOW), TypeError, '이미 만료된 링크에는 발급하지 않는다');
});

test('고치거나 형식이 틀린 grant는 예외 없이 무효다', () => {
  const linkId = randomUUID();
  const grant = issueLinkGrant(key, linkId, farExpiry, NOW);
  const [version, payload, signature] = grant.split('.');
  const forged = Buffer.from(JSON.stringify([linkId, NOW.getTime() + 1000 * HOUR])).toString('base64url');
  for (const value of [
    undefined, null, 123, '', 'x', `${version}.${payload}`, `g0.${payload}.${signature}`,
    `${version}.${forged}.${signature}`, `${version}.${payload}.${signature.slice(0, -2)}AA`, 'g1.' + 'a'.repeat(600) + '.b',
  ]) {
    assert.equal(verifyLinkGrant(key, value, linkId, NOW), false, String(value).slice(0, 30));
  }
});

test('서명 키는 development·test 밖에서 필수·형식 검사·회원 JWT 키와 분리, development·test는 없으면 무작위', () => {
  const secret = randomBytes(32).toString('hex');
  // 판정할 수 없는 환경(미지정·빈 값·staging 같은 다른 값)도 production과 같이 키가 없으면 기동을 멈춘다(#242).
  for (const NODE_ENV of ['production', undefined, '', 'staging']) {
    for (const LINK_GRANT_SECRET of [undefined, '']) {
      assert.throws(() => readLinkGrantKey({ NODE_ENV, LINK_GRANT_SECRET }),
        /LINK_GRANT_SECRET is required unless NODE_ENV is development or test/,
        `NODE_ENV ${JSON.stringify(NODE_ENV) ?? '미지정'}, 키 ${JSON.stringify(LINK_GRANT_SECRET) ?? '미지정'}`);
    }
  }
  assert.throws(() => readLinkGrantKey({ LINK_GRANT_SECRET: 'short' }), (error) => {
    assert.match(error.message, /64 hex characters/);
    assert.equal(error.message.includes('short'), false);
    return true;
  });
  // 공백뿐인 키는 누락으로 보지 않는다. 임시 키를 만드는 development에서도 형식 오류다.
  assert.throws(() => readLinkGrantKey({ NODE_ENV: 'development', LINK_GRANT_SECRET: '   ' }), /64 hex characters/);
  assert.throws(() => readLinkGrantKey({ LINK_GRANT_SECRET: secret, AUTH_JWT_SECRET: secret.toUpperCase() }), /must differ/);
  assert.deepEqual(readLinkGrantKey({ NODE_ENV: 'production', LINK_GRANT_SECRET: secret }), Buffer.from(secret, 'hex'));
  const a = readLinkGrantKey({ NODE_ENV: 'development' });
  const b = readLinkGrantKey({ NODE_ENV: 'test' });
  assert.equal(a.length, 32);
  assert.notDeepEqual(a, b);
});

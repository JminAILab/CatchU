const assert = require('node:assert/strict');
const { test } = require('node:test');
const { generateLinkToken, isLinkTokenFormat, buildRecipientLinkUrl } = require('../dist/share-links/link-token.js');

test('토큰은 43자 base64url이고 매번 다르다', () => {
  const tokens = new Set(Array.from({ length: 1000 }, () => generateLinkToken()));
  assert.equal(tokens.size, 1000);
  for (const token of tokens) {
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(Buffer.from(token, 'base64url').length, 32);
    assert.equal(isLinkTokenFormat(token), true);
  }
});

test('토큰 형식이 아닌 값은 거부한다', () => {
  const token = generateLinkToken();
  for (const value of ['', 'short', `${token}A`, token.slice(1), `${token.slice(1)}=`, `${token.slice(1)}+`,
    `${token.slice(1)}/`, ` ${token.slice(1)}`, null, undefined, 123, {}]) {
    assert.equal(isLinkTokenFormat(value), false, String(value));
  }
});

test('수신자 URL은 web 기준 주소 뒤에 /s/<token>을 붙인다', () => {
  const token = generateLinkToken();
  assert.equal(buildRecipientLinkUrl('https://catchu.example', token), `https://catchu.example/s/${token}`);
  assert.equal(buildRecipientLinkUrl('https://catchu.example/', token), `https://catchu.example/s/${token}`);
  assert.equal(buildRecipientLinkUrl('http://localhost:3000', token), `http://localhost:3000/s/${token}`);
  assert.equal(buildRecipientLinkUrl('https://catchu.example/app//', token), `https://catchu.example/app/s/${token}`);
  assert.doesNotThrow(() => new URL(buildRecipientLinkUrl('https://catchu.example', token)));
});

test('잘못된 기준 주소와 토큰은 URL을 만들지 않는다', () => {
  const token = generateLinkToken();
  for (const base of ['', 'catchu.example', '/relative', 'ftp://catchu.example', 'javascript:alert(1)',
    'https://catchu.example?x=1', 'https://catchu.example#frag', 'https://user:pw@catchu.example']) {
    assert.throws(() => buildRecipientLinkUrl(base, token), TypeError, base);
  }
  assert.throws(() => buildRecipientLinkUrl('https://catchu.example', 'not-a-token'), TypeError);
});

test('오류 메시지에 토큰이나 기준 주소를 넣지 않는다', () => {
  const token = generateLinkToken();
  assert.throws(() => buildRecipientLinkUrl('https://user:pw@catchu.example', token), (error) => {
    assert.equal(error.message.includes(token), false);
    assert.equal(error.message.includes('pw@'), false);
    return true;
  });
});

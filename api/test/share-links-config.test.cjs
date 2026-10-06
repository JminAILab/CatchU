const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readShareLinksConfig, DEV_SHARE_LINK_WEB_BASE_URL } = require('../dist/share-links/share-links.config.js');
const { validateShareCreate } = require('../dist/share-links/share-create.js');

test('공유 URL 주소가 없으면 production은 기동 실패, 개발·테스트는 web 개발 서버 주소다', () => {
  assert.throws(() => readShareLinksConfig({ NODE_ENV: 'production' }), /SHARE_LINK_WEB_BASE_URL is required in production/);
  assert.throws(() => readShareLinksConfig({ NODE_ENV: 'production', SHARE_LINK_WEB_BASE_URL: '  ' }), /required in production/);
  assert.deepEqual(readShareLinksConfig({ NODE_ENV: 'development' }), { webBaseUrl: DEV_SHARE_LINK_WEB_BASE_URL });
  assert.deepEqual(readShareLinksConfig({ NODE_ENV: 'production', SHARE_LINK_WEB_BASE_URL: ' https://catchu.example ' }),
    { webBaseUrl: 'https://catchu.example' });
});

test('형식이 틀린 공유 URL 주소는 값을 드러내지 않고 기동을 멈춘다', () => {
  for (const value of ['catchu.example', 'ftp://catchu.example', 'https://catchu.example?x=1', 'https://user:pw@catchu.example']) {
    assert.throws(() => readShareLinksConfig({ SHARE_LINK_WEB_BASE_URL: value }), (error) => {
      assert.match(error.message, /must be an absolute http\(s\) URL/);
      assert.equal(error.message.includes(value), false);
      return true;
    });
  }
});

test('입력 오류의 reason은 공통 ValidationPipe처럼 규칙 이름이다', () => {
  assert.deepEqual(validateShareCreate({ title: ' ' }).violations, [{ field: 'title', reason: 'isNotEmpty' }]);
  assert.deepEqual(validateShareCreate({ title: 1 }).violations, [{ field: 'title', reason: 'isString' }]);
  assert.deepEqual(validateShareCreate({ title: 'x', password: 1 }).violations, [{ field: 'password', reason: 'isString' }]);
  assert.deepEqual(validateShareCreate({ title: 'x', password: '' }).violations, [{ field: 'password', reason: 'isNotEmpty' }]);
  assert.deepEqual(validateShareCreate({ title: 'x', extra: 1 }).violations, [{ field: 'body', reason: 'whitelistValidation' }]);
  assert.deepEqual(validateShareCreate('x').violations, [{ field: 'body', reason: 'isObject' }]);
});

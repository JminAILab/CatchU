const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readShareLinksConfig, DEV_SHARE_LINK_WEB_BASE_URL } = require('../dist/share-links/share-links.config.js');
// 10월 발급 입력 검사(share-create.ts)는 U4 제출 3(W6)에서 발급 API와 함께 지웠다. 발행 입력 검사는 test/publications/publish-api.test.cjs가 본다.

const REQUIRED = /SHARE_LINK_WEB_BASE_URL is required unless NODE_ENV is development or test/;
const HTTPS_ONLY = /SHARE_LINK_WEB_BASE_URL must be an https URL unless NODE_ENV is development or test/;
// production이 아니어도 development·test가 아니면(값 없음·다른 값) 운영과 같이 다룬다.
const STRICT_ENVS = ['production', undefined, 'staging'];

test('공유 URL 주소가 없으면 development·test만 web 개발 서버 주소를 쓰고 그 밖은 기동 실패다', () => {
  for (const NODE_ENV of STRICT_ENVS) {
    assert.throws(() => readShareLinksConfig({ NODE_ENV }), REQUIRED, String(NODE_ENV));
    assert.throws(() => readShareLinksConfig({ NODE_ENV, SHARE_LINK_WEB_BASE_URL: '  ' }), REQUIRED, String(NODE_ENV));
  }
  for (const NODE_ENV of ['development', 'test']) {
    assert.deepEqual(readShareLinksConfig({ NODE_ENV }), { webBaseUrl: DEV_SHARE_LINK_WEB_BASE_URL });
  }
  assert.deepEqual(readShareLinksConfig({ NODE_ENV: 'production', SHARE_LINK_WEB_BASE_URL: ' https://catchu.example ' }),
    { webBaseUrl: 'https://catchu.example' });
});

test('production 등 development·test가 아니면 http 공유 URL 주소는 값을 드러내지 않고 기동을 멈춘다', () => {
  for (const NODE_ENV of STRICT_ENVS) {
    for (const value of ['http://catchu.example', 'http://localhost:3000', 'HTTP://catchu.example/share']) {
      assert.throws(() => readShareLinksConfig({ NODE_ENV, SHARE_LINK_WEB_BASE_URL: value }), (error) => {
        assert.match(error.message, HTTPS_ONLY);
        assert.equal(error.message.includes(value), false);
        return true;
      }, `${NODE_ENV} ${value}`);
    }
    assert.deepEqual(readShareLinksConfig({ NODE_ENV, SHARE_LINK_WEB_BASE_URL: 'https://catchu.example/share/' }),
      { webBaseUrl: 'https://catchu.example/share/' });
  }
  for (const NODE_ENV of ['development', 'test']) {
    assert.deepEqual(readShareLinksConfig({ NODE_ENV, SHARE_LINK_WEB_BASE_URL: 'http://192.168.0.10:3000' }),
      { webBaseUrl: 'http://192.168.0.10:3000' });
  }
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

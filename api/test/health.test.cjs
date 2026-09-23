require('reflect-metadata');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');

test('GET /health는 외부 의존 없이 200과 status만 반환한다', { timeout: 10000 }, async (t) => {
  const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  t.after(() => app.close());
  // 다른 개발 서버와 충돌하지 않도록 테스트에서만 임의의 로컬 포트를 사용한다.
  await app.listen(0, '127.0.0.1');
  const address = await app.getUrl();
  const response = await fetch(`${address}/health`, { signal: AbortSignal.timeout(3000) });

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^application\/json\b/);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

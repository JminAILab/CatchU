require('reflect-metadata');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { configureApp } = require('../dist/app.setup');
const { randomBytes } = require('node:crypto');

process.env.AUTH_JWT_SECRET = randomBytes(32).toString('hex');
process.env.AUTH_ACCESS_TOKEN_TTL_SECONDS = '900';
// 공유 URL 기본값(http)은 development·test에서만 쓴다(#218).
process.env.NODE_ENV = 'test';
delete process.env.DEV_LOGIN_ENABLED;

test('GET /health는 200과 status만 반환하고 연결 유지 65초를 알린다', { timeout: 10000 }, async (t) => {
  const app = await configureApp(await NestFactory.create(AppModule, { logger: false, abortOnError: false }));
  t.after(() => app.close());
  // 다른 개발 서버와 충돌하지 않도록 테스트에서만 임의의 로컬 포트를 사용한다.
  await app.listen(0, '127.0.0.1');
  const address = await app.getUrl();
  const response = await fetch(`${address}/health`, { signal: AbortSignal.timeout(3000) });

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^application\/json\b/);
  assert.deepEqual(await response.json(), { status: 'ok' });
  // 앞단 유휴 시간(ALB 60초)보다 길게 쉬는 연결을 유지한다(Node 기본 5초). 머리글은 서버의 연결 유지 시간으로 만들어진다.
  assert.equal(app.getHttpServer().keepAliveTimeout, 65000);
  assert.equal(response.headers.get('keep-alive'), 'timeout=65');
});

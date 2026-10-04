require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { test } = require('node:test');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { configureApp } = require('../dist/app.setup');

const WEB = 'http://localhost:3000';
// #217 완료 기준의 값. 코드의 상수를 그대로 가져오지 않고 기대값을 따로 적는다.
const EXPECTED = {
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

async function start(t, env) {
  const keys = ['AUTH_JWT_SECRET', 'AUTH_ACCESS_TOKEN_TTL_SECONDS', 'DEV_LOGIN_ENABLED', 'NODE_ENV', 'CORS_ALLOWED_ORIGINS', 'SHARE_LINK_WEB_BASE_URL'];
  const before = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  Object.assign(process.env, { AUTH_JWT_SECRET: randomBytes(32).toString('hex'), AUTH_ACCESS_TOKEN_TTL_SECONDS: '60' }, env);
  let app;
  t.after(async () => {
    try { if (app) await app.close(); }
    finally {
      for (const [key, value] of Object.entries(before)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
  app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  await configureApp(app);
  await app.listen(0, '127.0.0.1');
  const url = await app.getUrl();
  return (path, options = {}) => fetch(`${url}${path}`, { ...options, signal: AbortSignal.timeout(3000) });
}

function assertSecurityHeaders(response, label, hsts = null) {
  for (const [name, value] of Object.entries(EXPECTED)) assert.equal(response.headers.get(name), value, `${label}: ${name}`);
  assert.equal(response.headers.get('x-powered-by'), null, `${label}: X-Powered-By가 없다`);
  assert.equal(response.headers.get('strict-transport-security'), hsts, `${label}: HSTS`);
}

const json = (body) => ({ method: 'POST', headers: { Origin: WEB, 'Content-Type': 'application/json' }, body });

test('성공·오류·CORS 사전 요청과 Nest 밖 오류 응답 모두 보안 헤더를 받고 X-Powered-By가 없다', { timeout: 15000 }, async (t) => {
  const request = await start(t, { NODE_ENV: 'test', DEV_LOGIN_ENABLED: 'true', CORS_ALLOWED_ORIGINS: WEB });
  const cases = [
    ['GET /health', await request('/health'), 200],
    ['/v1 기능 경로 성공', await request('/v1/auth/dev-login', json(JSON.stringify({ memberId: 'headers-member' }))), 200],
    ['/v1 인증 거부', await request('/v1/share-links', json('{}')), 401],
    ['/v1 없는 경로', await request('/v1/__missing'), 404],
    ['/v1 본문 해석 오류', await request('/v1/auth/dev-login', json('{"memberId":')), 400],
    ['/v1 밖 없는 경로(Nest 밖)', await request('/nope'), 404],
    ['/v1 밖 본문 해석 오류(Nest 밖)', await request('/nope', json('{"a":')), 400],
    ['CORS 사전 요청', await request('/v1/auth/dev-login', {
      method: 'OPTIONS', headers: { Origin: WEB, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
    }), 204],
  ];
  for (const [label, response, status] of cases) {
    assert.equal(response.status, status, label);
    assertSecurityHeaders(response, label);
  }
});

test('HSTS는 NODE_ENV=production에서만 붙는다', { timeout: 15000 }, async (t) => {
  const request = await start(t, { NODE_ENV: 'production', SHARE_LINK_WEB_BASE_URL: 'https://catchu.example' });
  const health = await request('/health');
  assert.equal(health.status, 200);
  assertSecurityHeaders(health, 'GET /health', 'max-age=31536000');
  const missing = await request('/nope');
  assert.equal(missing.status, 404);
  assertSecurityHeaders(missing, '/v1 밖 없는 경로(Nest 밖)', 'max-age=31536000');
});

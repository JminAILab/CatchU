require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { test } = require('node:test');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { configureApp } = require('../dist/app.setup');
const { readCorsOrigins } = require('../dist/cors');

const WEB = 'http://localhost:3000';

async function start(t, corsValue) {
  const keys = ['AUTH_JWT_SECRET', 'AUTH_ACCESS_TOKEN_TTL_SECONDS', 'DEV_LOGIN_ENABLED', 'NODE_ENV', 'CORS_ALLOWED_ORIGINS'];
  const before = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    AUTH_JWT_SECRET: randomBytes(32).toString('hex'),
    AUTH_ACCESS_TOKEN_TTL_SECONDS: '60',
    DEV_LOGIN_ENABLED: 'true',
    NODE_ENV: 'test',
  });
  if (corsValue === undefined) delete process.env.CORS_ALLOWED_ORIGINS;
  else process.env.CORS_ALLOWED_ORIGINS = corsValue;
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
  // 설정 오류로 configureApp이 실패해도 DB 연결을 닫도록 먼저 app을 잡아 둔다.
  app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  await configureApp(app);
  await app.listen(0, '127.0.0.1');
  const url = await app.getUrl();
  return (path, options = {}) => fetch(`${url}${path}`, { ...options, signal: AbortSignal.timeout(3000) });
}

const preflight = (request, origin, headers = 'authorization,content-type,idempotency-key') => request('/v1/auth/dev-login', {
  method: 'OPTIONS',
  headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': headers },
});

test('출처 목록은 정확한 http(s) 출처만 받고 값은 오류에 넣지 않는다', () => {
  assert.deepEqual(readCorsOrigins(undefined), []);
  assert.deepEqual(readCorsOrigins(''), []);
  assert.deepEqual(readCorsOrigins('  '), []);
  assert.deepEqual(readCorsOrigins(WEB), [WEB]);
  assert.deepEqual(readCorsOrigins(`${WEB}, https://catchu.example`), [WEB, 'https://catchu.example']);
  for (const value of ['*', `${WEB}/`, 'localhost:3000', 'ftp://localhost:3000', `${WEB}/path`, `${WEB}?q=1`,
    'http://user:secret-value@localhost:3000', `${WEB},`, 'HTTP://LOCALHOST:3000']) {
    assert.throws(() => readCorsOrigins(value), (error) => {
      assert.match(error.message, /CORS_ALLOWED_ORIGINS/);
      assert.equal(error.message.includes('secret-value'), false);
      return true;
    }, value);
  }
});

test('허용한 web 출처는 CORS 헤더를 받고 Retry-After를 읽을 수 있다', async (t) => {
  const request = await start(t, WEB);
  const options = await preflight(request, WEB);
  assert.equal(options.status, 204);
  assert.equal(options.headers.get('access-control-allow-origin'), WEB);
  const allowed = options.headers.get('access-control-allow-headers').toLowerCase().split(',');
  for (const header of ['authorization', 'content-type', 'idempotency-key', 'x-link-grant']) assert.ok(allowed.includes(header), header);
  assert.equal(options.headers.get('access-control-allow-credentials'), null, '쿠키를 쓰지 않으므로 credentials를 허용하지 않는다');

  const login = await request('/v1/auth/dev-login', {
    method: 'POST', headers: { Origin: WEB, 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId: 'cors-member' }),
  });
  assert.equal(login.status, 200);
  assert.equal(login.headers.get('access-control-allow-origin'), WEB);
  assert.equal(login.headers.get('access-control-expose-headers'), 'Retry-After');
  assert.match(login.headers.get('vary') ?? '', /Origin/i);

  const failed = await request('/v1/__missing', { headers: { Origin: WEB } });
  assert.equal(failed.status, 404);
  assert.equal(failed.headers.get('access-control-allow-origin'), WEB, '오류 응답도 web이 읽을 수 있다');
});

test('목록 밖 출처와 CORS 미설정은 허용 헤더를 받지 못한다', async (t) => {
  const request = await start(t, WEB);
  for (const origin of ['http://127.0.0.1:3000', 'http://localhost:3001', 'https://localhost:3000']) {
    const options = await preflight(request, origin);
    assert.equal(options.headers.get('access-control-allow-origin'), null, origin);
    const get = await request('/health', { headers: { Origin: origin } });
    assert.equal(get.headers.get('access-control-allow-origin'), null, origin);
  }

  const closed = await start(t, undefined);
  const options = await preflight(closed, WEB);
  assert.equal(options.headers.get('access-control-allow-origin'), null);
  const get = await closed('/health', { headers: { Origin: WEB } });
  assert.equal(get.status, 200);
  assert.equal(get.headers.get('access-control-allow-origin'), null);
});

test('잘못된 CORS 설정이면 앱을 시작하지 않는다', async (t) => {
  await assert.rejects(start(t, '*'), /CORS_ALLOWED_ORIGINS/);
});

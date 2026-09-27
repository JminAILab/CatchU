require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { test } = require('node:test');
const { Controller, Get, Module } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { SignJWT } = require('jose');
const { AppModule } = require('../dist/app.module');
const { CurrentMemberId, Public } = require('../dist/auth/auth.decorators');
const { readAuthConfig } = require('../dist/auth/auth.config');

// 검증용 보호 API는 제품 src/에 등록하지 않는다.
class ProbeController {
  member(memberId) { return { memberId }; }
  publicRoute() { return { public: true }; }
}
Controller('__test')(ProbeController);
Get('member')(ProbeController.prototype, 'member', Object.getOwnPropertyDescriptor(ProbeController.prototype, 'member'));
CurrentMemberId()(ProbeController.prototype, 'member', 0);
Get('public')(ProbeController.prototype, 'publicRoute', Object.getOwnPropertyDescriptor(ProbeController.prototype, 'publicRoute'));
Public()(ProbeController.prototype, 'publicRoute', Object.getOwnPropertyDescriptor(ProbeController.prototype, 'publicRoute'));
class ProbeModule {}
Module({ imports: [AppModule], controllers: [ProbeController] })(ProbeModule);

async function start(t, overrides = {}) {
  const envKeys = ['AUTH_JWT_SECRET', 'AUTH_ACCESS_TOKEN_TTL_SECONDS', 'DEV_LOGIN_ENABLED', 'NODE_ENV'];
  const before = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  const secret = randomBytes(32).toString('hex');
  const settings = {
    AUTH_JWT_SECRET: secret,
    AUTH_ACCESS_TOKEN_TTL_SECONDS: '60',
    DEV_LOGIN_ENABLED: 'true',
    NODE_ENV: 'test',
    ...overrides,
  };
  for (const [key, value] of Object.entries(settings)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const logs = [];
  const logger = Object.fromEntries(['log', 'error', 'warn', 'debug', 'verbose', 'fatal'].map((level) =>
    [level, (...args) => logs.push(args.map(String).join(' '))]));
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
  app = await NestFactory.create(ProbeModule, { logger, abortOnError: false });
  await app.listen(0, '127.0.0.1');
  const url = await app.getUrl();
  const request = (path, options = {}) => fetch(`${url}${path}`, {
    ...options, signal: AbortSignal.timeout(3000),
  });
  const login = (body = { memberId: 'test-member-87' }) => request('/auth/dev-login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const protectedRequest = (token, path = '/__test/member') => request(path, {
    headers: token === undefined ? {} : { Authorization: `Bearer ${token}` },
  });
  const sign = (claims = {}, algorithm = 'HS256') => new SignJWT({
    sub: 'test-member-87', iss: 'catchu-api', aud: 'catchu-member-api',
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 60,
    ...claims,
  }).setProtectedHeader({ alg: algorithm, typ: 'JWT' }).sign(Buffer.from(secret, 'hex'));
  return { request, login, protectedRequest, sign, logs, secret };
}

test('토큰 없는 보호 API는 401, health와 명시적 공개 경로는 200', async (t) => {
  const server = await start(t);
  assert.equal((await server.protectedRequest()).status, 401);
  assert.equal((await server.request('/health')).status, 200);
  assert.equal((await server.request('/__test/public')).status, 200);
  assert.equal((await server.request('/__test/member', { headers: { Authorization: 'Basic invalid' } })).status, 401);
});

test('개발 로그인 토큰의 회원 ID를 읽으며 요청 입력으로 대체하지 않는다', async (t) => {
  const server = await start(t);
  const response = await server.login();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const { accessToken, tokenType, expiresIn } = await response.json();
  assert.equal(tokenType, 'Bearer');
  assert.equal(expiresIn, 60);
  const member = await server.protectedRequest(accessToken, '/__test/member?memberId=someone-else');
  assert.equal(member.status, 200);
  assert.deepEqual(await member.json(), { memberId: 'test-member-87' });
  assert.equal((await server.request('/__test/member?memberId=test-member-87')).status, 401);
});

test('변조·만료 토큰과 필수 값 없는 토큰을 401로 거부하고 토큰을 기록하지 않는다', async (t) => {
  const server = await start(t);
  const { accessToken } = await (await server.login()).json();
  const pieces = accessToken.split('.');
  pieces[2] = (pieces[2][0] === 'A' ? 'B' : 'A') + pieces[2].slice(1);
  const tokens = [
    pieces.join('.'),
    await server.sign({ iat: 1, exp: 2 }),
    await server.sign({ sub: undefined }),
    await server.sign({ sub: '' }),
    await server.sign({ sub: '   ' }),
    await server.sign({ sub: 87 }),
    await server.sign({ exp: undefined }),
    await server.sign({ iat: undefined }),
    await server.sign({ iss: 'another-issuer' }),
    await server.sign({ aud: 'another-service' }),
    await server.sign({}, 'HS384'),
  ];
  for (const token of tokens) {
    const response = await server.protectedRequest(token);
    assert.equal(response.status, 401);
    assert.equal((await response.text()).includes(token), false, '오류 응답에 토큰을 노출하지 않는다');
  }
  assert.equal((await server.protectedRequest(accessToken)).status, 200);
  assert.ok(server.logs.length > 0, '실제 Nest 로그가 수집돼야 한다');
  for (const sensitive of [accessToken, server.secret, ...tokens]) {
    assert.equal(server.logs.join('\n').includes(sensitive), false, '서버 로그에 토큰·키를 노출하지 않는다');
  }
});

for (const [label, overrides] of [
  ['설정 없음', { DEV_LOGIN_ENABLED: undefined }],
  ['명시적 비활성', { DEV_LOGIN_ENABLED: 'false' }],
  ['정확한 true가 아닌 값', { DEV_LOGIN_ENABLED: '1' }],
  ['운영 환경에서 활성화 요청', { NODE_ENV: 'production' }],
]) {
  test(`개발 로그인 거부: ${label}`, async (t) => {
    const server = await start(t, overrides);
    assert.equal((await server.login()).status, 403);
    assert.equal((await server.request('/health')).status, 200);
    assert.equal((await server.protectedRequest()).status, 401);
  });
}

test('개발 로그인은 유효한 회원 ID 하나만 받는다', async (t) => {
  const server = await start(t);
  for (const body of [{}, { memberId: '' }, { memberId: ' ' }, { memberId: 87 }, { memberId: 'id', admin: true }]) {
    assert.equal((await server.login(body)).status, 400);
  }
});

test('비밀값 기본값이 없고 수명·서명 키 설정 오류에 실제 값을 노출하지 않는다', () => {
  const secret = randomBytes(32).toString('hex');
  assert.throws(() => readAuthConfig({}), /AUTH_JWT_SECRET/);
  for (const ttl of [undefined, '', '0', '-1', '1.5', 'NaN', '9007199254740991']) {
    assert.throws(() => readAuthConfig({ AUTH_JWT_SECRET: secret, AUTH_ACCESS_TOKEN_TTL_SECONDS: ttl }), /AUTH_ACCESS_TOKEN_TTL_SECONDS/);
  }
  const invalidSecret = randomBytes(16).toString('hex');
  assert.throws(
    () => readAuthConfig({ AUTH_JWT_SECRET: invalidSecret, AUTH_ACCESS_TOKEN_TTL_SECONDS: '60' }),
    (error) => error.message.includes('AUTH_JWT_SECRET') && !error.message.includes(invalidSecret),
  );
});

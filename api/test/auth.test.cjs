require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { test } = require('node:test');
const { Controller, Get, Module } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { SignJWT, decodeJwt } = require('jose');
const { AppModule } = require('../dist/app.module');
const { configureApp } = require('../dist/app.setup');
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
  const envKeys = ['AUTH_JWT_SECRET', 'AUTH_ACCESS_TOKEN_TTL_SECONDS', 'DEV_LOGIN_ENABLED', 'NODE_ENV', 'SHARE_LINK_WEB_BASE_URL', 'LINK_GRANT_SECRET'];
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
  app = await configureApp(await NestFactory.create(ProbeModule, { logger, abortOnError: false }));
  await app.listen(0, '127.0.0.1');
  const url = await app.getUrl();
  const request = (path, options = {}) => fetch(`${url}${path}`, {
    ...options, signal: AbortSignal.timeout(3000),
  });
  const login = (body = { memberId: 'test-member-87' }) => request('/v1/auth/dev-login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const protectedRequest = (token, path = '/v1/__test/member') => request(path, {
    headers: token === undefined ? {} : { Authorization: `Bearer ${token}` },
  });
  const sign = (claims = {}, algorithm = 'HS256') => new SignJWT({
    sub: 'test-member-87', iss: 'catchu-api', aud: 'catchu-member-api',
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 60,
    ...claims,
  }).setProtectedHeader({ alg: algorithm, typ: 'JWT' }).sign(Buffer.from(secret, 'hex'));
  return { request, login, protectedRequest, sign, logs, secret };
}

async function assertAuthError(response, code) {
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.equal(body.code, code);
  assert.deepEqual(Object.keys(body).sort(), ['code', 'message']);
  const message = code === 'AUTH_REQUIRED'
    ? '로그인이 필요합니다.'
    : '로그인 정보가 유효하지 않습니다. 다시 로그인해 주세요.';
  assert.ok(body.message === message, '인증 오류에는 고정 안내만 담는다');
}

test('토큰 없는 보호 API는 AUTH_REQUIRED, health와 명시적 공개 경로는 200', async (t) => {
  const server = await start(t);
  await assertAuthError(await server.protectedRequest(), 'AUTH_REQUIRED');
  for (const path of ['/health', '/v1/__test/public']) {
    const response = await server.request(path);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  for (const path of ['/auth/dev-login', '/v1/health']) {
    const response = await server.request(path, { method: path.includes('login') ? 'POST' : 'GET' });
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
});

test('존재하지만 잘못된 Authorization 헤더는 AUTH_INVALID이며 원문을 노출하지 않는다', async (t) => {
  const server = await start(t);
  const marker = 'synthetic-header-value-87';
  for (const authorization of [
    '', 'Bearer', `Basic ${marker}`, `Bearer ${marker} extra`,
    `Bearer ${marker},other`, `Bearer  ${marker}`, `Bearer\t${marker}`,
  ]) {
    await assertAuthError(await server.request('/v1/__test/member', {
      headers: { Authorization: authorization },
    }), 'AUTH_INVALID');
  }
  assert.equal(server.logs.join('\n').includes(marker), false, '잘못된 인증 헤더도 로그에 남기지 않는다');
});

test('개발 로그인 토큰의 회원 ID를 읽으며 요청 입력으로 대체하지 않는다', async (t) => {
  const server = await start(t);
  const response = await server.login();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const { accessToken, tokenType, expiresIn } = await response.json();
  assert.equal(tokenType, 'Bearer');
  assert.equal(expiresIn, 60);
  const member = await server.protectedRequest(accessToken, '/v1/__test/member?memberId=someone-else');
  assert.equal(member.status, 200);
  assert.equal(member.headers.get('cache-control'), 'no-store');
  const memberId = decodeJwt(accessToken).sub;
  assert.match(memberId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(memberId, 'test-member-87');
  assert.deepEqual(await member.json(), { memberId });
  await assertAuthError(await server.request('/v1/__test/member?memberId=test-member-87'), 'AUTH_REQUIRED');
  const lowerCase = await server.request('/v1/__test/member', { headers: { authorization: `bearer ${accessToken}` } });
  assert.equal(lowerCase.status, 200, '인증 스킴의 기존 대소문자 무시 처리를 유지한다');
});

test('변조·만료·필수 값 오류 토큰은 AUTH_INVALID이며 토큰·JWT 오류를 노출하지 않는다', async (t) => {
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
    'invalid.jwt.value',
  ];
  for (const token of tokens) {
    const response = await server.protectedRequest(token);
    await assertAuthError(response, 'AUTH_INVALID');
  }
  assert.equal((await server.protectedRequest(accessToken)).status, 200);
  assert.ok(server.logs.length > 0, '실제 Nest 로그가 수집돼야 한다');
  for (const sensitive of [accessToken, server.secret, ...tokens]) {
    assert.equal(server.logs.join('\n').includes(sensitive), false, '서버 로그에 토큰·키를 노출하지 않는다');
  }
  assert.equal(/JWTExpired|JWTClaimValidationFailed|ERR_JWT|ERR_JWS|claim timestamp check failed/.test(server.logs.join('\n')), false,
    'JWT 라이브러리의 내부 오류를 로그로 전달하지 않는다');
});

for (const environment of ['development', 'test']) {
  test(`명시적으로 켠 개발 로그인은 ${environment}에서 허용`, async (t) => {
    const server = await start(t, { NODE_ENV: environment });
    const response = await server.login();
    assert.equal(response.status, 200);
    const { accessToken } = await response.json();
    assert.equal((await server.protectedRequest(accessToken)).status, 200);
    assert.equal(server.logs.join('\n').includes(accessToken), false);
  });
}

for (const [label, overrides] of [
  ['설정 없음', { DEV_LOGIN_ENABLED: undefined }],
  ['명시적 비활성', { DEV_LOGIN_ENABLED: 'false' }],
  ['정확한 true가 아닌 값', { DEV_LOGIN_ENABLED: '1' }],
  ['NODE_ENV 미지정', { NODE_ENV: undefined }],
  ['NODE_ENV 공란', { NODE_ENV: '' }],
  ['staging 환경', { NODE_ENV: 'staging' }],
  ['그 밖의 환경', { NODE_ENV: 'preview' }],
  ['대소문자가 다른 환경', { NODE_ENV: 'Development' }],
  ['공백이 포함된 환경', { NODE_ENV: 'test ' }],
  ['운영 환경에서 활성화 요청', { NODE_ENV: 'production' }],
]) {
  test(`개발 로그인 거부: ${label}`, async (t) => {
    // development·test가 아니면 https 공유 URL 주소(#147·#218)와 grant 서명 키(#150·#242)가 필수라 합성 값을 함께 준다.
    // 키가 없어 기동이 실패하면 아래 403 확인이 grant 설정 오류에 가려진다.
    const server = await start(t, {
      SHARE_LINK_WEB_BASE_URL: 'https://catchu.example', LINK_GRANT_SECRET: randomBytes(32).toString('hex'), ...overrides,
    });
    for (const body of [
      { memberId: 'test-member-87' }, {}, { memberId: ' id ', admin: true }, [],
      { memberId: 'valid-member', constructor: 'extra' },
    ]) {
      const response = await server.login(body);
      assert.equal(response.status, 403, '플래그·허용 환경 검사는 DTO 검증보다 먼저 적용한다');
      assert.equal(response.headers.get('cache-control'), 'no-store');
      const denied = await response.json();
      assert.equal(denied.code, 'INTERNAL_ERROR', '전용 거부 코드 미결: 기존 #88 처리를 유지한다');
      assert.equal('accessToken' in denied, false);
      assert.equal(denied.details, undefined);
    }
    assert.equal((await server.request('/health')).status, 200);
    assert.equal((await server.protectedRequest()).status, 401);
  });
}

test('개발 로그인의 잘못된 회원 ID는 VALIDATION_FAILED와 필드·규칙 이름으로 응답한다', async (t) => {
  const server = await start(t);
  for (const body of [
    {}, { memberId: '' }, { memberId: ' ' }, { memberId: ' id' }, { memberId: 'id ' },
    { memberId: 87 }, { memberId: null }, { memberId: true }, { memberId: {} }, { memberId: [] },
  ]) {
    const response = await server.login(body);
    assert.equal(response.status, 400);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const invalid = await response.json();
    assert.equal(invalid.code, 'VALIDATION_FAILED');
    assert.deepEqual(invalid.details, { violations: [{ field: 'memberId', reason: 'isMemberId' }] });
  }
});

test('개발 로그인은 추가 필드를 제거해 통과시키지 않고 입력값 없이 검증 오류로 거부한다', async (t) => {
  const server = await start(t);
  const marker = 'synthetic-extra-value-87';
  const response = await server.login({ memberId: 'valid-member', admin: marker });
  assert.equal(response.status, 400);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.equal(body.code, 'VALIDATION_FAILED');
  assert.deepEqual(body.details, { violations: [{ field: 'admin', reason: 'whitelistValidation' }] });
  assert.equal(JSON.stringify(body).includes(marker), false);
  assert.equal(server.logs.join('\n').includes(marker), false);
  for (const field of ['constructor', '__proto__']) {
    const reserved = await server.login({ memberId: 'valid-member', [field]: marker });
    assert.equal(reserved.status, 400, '변환기가 지우는 필드도 추가 입력으로 거부한다');
    const invalid = await reserved.json();
    assert.equal(reserved.headers.get('cache-control'), 'no-store');
    assert.equal(invalid.code, 'VALIDATION_FAILED');
    assert.deepEqual(invalid.details, { violations: [{ field, reason: 'whitelistValidation' }] });
    assert.equal(JSON.stringify(invalid).includes(marker), false);
  }
  const array = await server.login([{ memberId: 'valid-member' }]);
  assert.equal(array.status, 400);
  assert.equal((await array.json()).code, 'VALIDATION_FAILED');
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

// #222 보안 사건 기록. 회원 토큰 변조·만료·형식 오류(AUTH_INVALID)만 SecurityEvent 경고 한 줄로 남긴다.
const SECURITY_EVENT = /^AUTH_INVALID GET \/v1\/__test\/member requestId=([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}) at=(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)$/;
const securityEvents = (logs) => logs
  .filter((line) => line.endsWith(' SecurityEvent'))
  .map((line) => line.slice(0, -' SecurityEvent'.length));

test('회원 토큰 변조·만료·형식 오류는 보안 사건 한 줄씩, 분류 코드·경로 틀·시각·요청 식별자만 남긴다', async (t) => {
  const server = await start(t);
  const { accessToken } = await (await server.login()).json();
  const pieces = accessToken.split('.');
  pieces[2] = (pieces[2][0] === 'A' ? 'B' : 'A') + pieces[2].slice(1);
  const tampered = pieces.join('.');
  const expired = await server.sign({ iat: 1, exp: 2 });
  const marker = 'synthetic-header-value-222';
  const startedAt = Date.now();
  const responses = [
    await server.protectedRequest(tampered),
    await server.protectedRequest(expired),
    await server.request('/v1/__test/member', { headers: { Authorization: `Bearer ${marker} extra` } }),
  ];
  const finishedAt = Date.now();
  for (const response of responses) await assertAuthError(response, 'AUTH_INVALID');

  const events = securityEvents(server.logs);
  assert.equal(events.length, 3, '거부 한 건마다 보안 사건이 한 줄씩 남는다');
  const ids = events.map((line) => {
    const match = SECURITY_EVENT.exec(line);
    assert.ok(match, `정해진 필드만 담는다: ${line.replace(/requestId=\S+/, 'requestId=…')}`);
    const at = Date.parse(match[2]);
    assert.ok(at >= startedAt - 1000 && at <= finishedAt + 1000, '기록 시각은 요청을 처리한 시각이다');
    return match[1];
  });
  assert.equal(new Set(ids).size, 3, '요청 식별자는 요청마다 다르다');

  const logText = server.logs.join('\n');
  for (const sensitive of [accessToken, tampered, expired, marker, server.secret]) {
    assert.equal(logText.includes(sensitive), false, '보안 사건에 토큰·키·헤더 원문을 넣지 않는다');
  }
  for (const response of responses) {
    const headerValues = [...response.headers.values()].join('\n');
    for (const id of ids) assert.equal(headerValues.includes(id), false, '요청 식별자를 응답으로 내보내지 않는다');
  }
});

test('토큰 없는 요청·정상 요청·다른 업무 거부는 보안 사건으로 남기지 않는다', async (t) => {
  const server = await start(t);
  const { accessToken } = await (await server.login()).json();
  await assertAuthError(await server.protectedRequest(), 'AUTH_REQUIRED');
  assert.equal((await server.protectedRequest(accessToken)).status, 200);
  assert.equal((await server.login({ memberId: '' })).status, 400);
  assert.equal((await server.request('/v1/__test/missing')).status, 404);
  assert.deepEqual(securityEvents(server.logs), [], 'AUTH_REQUIRED·성공·입력 오류·없는 경로는 보안 사건이 아니다');
});

test('요청 식별자는 같은 요청에 같은 값, 다른 요청에 다른 값이다', () => {
  const { requestIdOf } = require('../dist/common/http/request-id');
  const first = {};
  const second = {};
  assert.equal(requestIdOf(first), requestIdOf(first));
  assert.notEqual(requestIdOf(first), requestIdOf(second));
});

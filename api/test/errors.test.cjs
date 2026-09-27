require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { test } = require('node:test');
const { Controller, Get, Post, Body, Module, ForbiddenException, ConflictException, UnauthorizedException } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { Public } = require('../dist/auth/auth.decorators');
const { ApiError, ERROR_STATUS } = require('../dist/common/errors');

// AppModule의 인증 설정(#87)이 요구하는 값. 테스트마다 무작위 키를 쓰고 개발 로그인은 끈다.
process.env.AUTH_JWT_SECRET = randomBytes(32).toString('hex');
process.env.AUTH_ACCESS_TOKEN_TTL_SECONDS = '60';
delete process.env.DEV_LOGIN_ENABLED;

// 오류를 일부러 내는 검증용 경로는 테스트 안에만 두고 제품 src/에 등록하지 않는다.
// 전역 인증 Guard를 통과하도록 @Public()으로 표시한다. protectedRoute만 인증을 요구한다.
const FAKE_SECRET = 'probe-fake-secret-7f3a';
class ProbeController {
  apiError(code) { throw new ApiError(code); }
  inProgress() {
    throw new ApiError('ANALYSIS_IN_PROGRESS', { details: { existingRequestId: 'req-1', extra: 'drop-me' } });
  }
  violations() {
    throw new ApiError('VALIDATION_FAILED', { details: { violations: [{ field: 'title', reason: 'isNotEmpty', value: FAKE_SECRET }] } });
  }
  emptyDetails() { throw new ApiError('INVALID_REQUEST', { details: { other: 1 } }); }
  customMessage() { throw new ApiError('RETRY_NOT_ALLOWED', { message: '결과가 이미 있어 다시 요청할 수 없습니다.' }); }
  boom() { throw new Error(`SELECT * FROM members WHERE token='${FAKE_SECRET}'`); }
  forbidden() { throw new ForbiddenException(); }
  conflict() { throw new ConflictException(); }
  unauthorized() { throw new UnauthorizedException(); }
  echo(body) { return { received: typeof body }; }
  protectedRoute() { return { ok: true }; }
}
Controller('__test')(ProbeController);
const route = (decorator, name) => decorator(ProbeController.prototype, name, Object.getOwnPropertyDescriptor(ProbeController.prototype, name));
const publicRoute = (decorator, name) => { route(decorator, name); route(Public(), name); };
const { Param } = require('@nestjs/common');
publicRoute(Get('api-error/:code'), 'apiError');
Param('code')(ProbeController.prototype, 'apiError', 0);
publicRoute(Get('in-progress'), 'inProgress');
publicRoute(Get('violations'), 'violations');
publicRoute(Get('empty-details'), 'emptyDetails');
publicRoute(Get('custom-message'), 'customMessage');
publicRoute(Get('boom'), 'boom');
publicRoute(Get('forbidden'), 'forbidden');
publicRoute(Get('conflict'), 'conflict');
publicRoute(Get('unauthorized'), 'unauthorized');
publicRoute(Post('echo'), 'echo');
Body()(ProbeController.prototype, 'echo', 0);
route(Get('protected'), 'protectedRoute');
class ProbeModule {}
Module({ imports: [AppModule], controllers: [ProbeController] })(ProbeModule);

async function start(t) {
  const logs = [];
  const logger = Object.fromEntries(['log', 'error', 'warn', 'debug', 'verbose', 'fatal'].map((level) =>
    [level, (...args) => logs.push(`[${level}] ${args.map(String).join(' ')}`)]));
  const app = await NestFactory.create(ProbeModule, { logger, abortOnError: false });
  t.after(() => app.close());
  await app.listen(0, '127.0.0.1');
  const url = await app.getUrl();
  const request = async (path, options = {}) => {
    const response = await fetch(`${url}${path}`, { ...options, signal: AbortSignal.timeout(3000) });
    const text = await response.text();
    return { status: response.status, headers: response.headers, text, json: () => JSON.parse(text) };
  };
  return { request, logs };
}

function assertErrorShape(res, status, code) {
  assert.equal(res.status, status);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.match(res.headers.get('content-type'), /^application\/json\b/);
  const body = res.json();
  assert.equal(body.code, code);
  assert.equal(typeof body.message, 'string');
  assert.ok(body.message.length > 0);
  for (const key of Object.keys(body)) assert.ok(['code', 'message', 'details'].includes(key), `허용되지 않은 키: ${key}`);
  return body;
}

test('ApiError는 기본 구분 6가지 상태와 code로 응답한다', { timeout: 10000 }, async (t) => {
  const { request } = await start(t);
  const cases = [
    ['INVALID_REQUEST', 400], ['AUTH_REQUIRED', 401], ['CONSENT_REQUIRED', 403],
    ['RESOURCE_UNAVAILABLE', 404], ['LINK_LIMIT_REACHED', 409], ['INTERNAL_ERROR', 500],
  ];
  for (const [code, status] of cases) {
    assert.equal(ERROR_STATUS[code], status);
    const body = assertErrorShape(await request(`/__test/api-error/${code}`), status, code);
    assert.equal(body.details, undefined);
  }
});

test('명세가 문구를 정한 코드는 명세 문구로 응답한다', { timeout: 10000 }, async (t) => {
  const { request } = await start(t);
  assert.equal((await request('/__test/api-error/RESOURCE_UNAVAILABLE')).json().message, '현재 열람할 수 없는 자료입니다.');
  assert.equal((await request('/__test/api-error/LINK_UNAVAILABLE')).json().message, '이 링크는 열람할 수 없습니다.');
  assert.equal((await request('/__test/api-error/INTERNAL_ERROR')).json().message, '처리 중 오류가 발생했습니다.');
  assert.equal((await request('/__test/custom-message')).json().message, '결과가 이미 있어 다시 요청할 수 없습니다.');
});

test('details는 명세의 두 키만 담고 나머지는 버린다', { timeout: 10000 }, async (t) => {
  const { request } = await start(t);
  const inProgress = assertErrorShape(await request('/__test/in-progress'), 409, 'ANALYSIS_IN_PROGRESS');
  assert.deepEqual(inProgress.details, { existingRequestId: 'req-1' });

  const res = await request('/__test/violations');
  const violations = assertErrorShape(res, 400, 'VALIDATION_FAILED');
  assert.deepEqual(violations.details, { violations: [{ field: 'title', reason: 'isNotEmpty' }] });
  assert.equal(res.text.includes(FAKE_SECRET), false, '입력값을 응답에 담지 않는다');

  const empty = assertErrorShape(await request('/__test/empty-details'), 400, 'INVALID_REQUEST');
  assert.equal(empty.details, undefined, '허용 키가 없으면 details 자체를 생략한다');
});

test('예상 밖 예외는 500 일반 안내만 응답하고 원인은 서버 로그에만 남긴다', { timeout: 10000 }, async (t) => {
  const { request, logs } = await start(t);
  const res = await request('/__test/boom?token=query-fake-token', {
    headers: { Authorization: 'Bearer header-fake-token', Cookie: 'sid=cookie-fake' },
  });
  const body = assertErrorShape(res, 500, 'INTERNAL_ERROR');
  assert.deepEqual(body, { code: 'INTERNAL_ERROR', message: '처리 중 오류가 발생했습니다.' });
  for (const leaked of [FAKE_SECRET, 'SELECT', 'stack', 'at ProbeController']) {
    assert.equal(res.text.includes(leaked), false, `응답에 ${leaked} 없음`);
  }

  const log = logs.join('\n');
  assert.match(log, /\[error\] GET \/__test\/boom → 500 INTERNAL_ERROR \(Error\)/, '원인을 서버 로그에서 찾을 수 있다');
  assert.match(log, /at ProbeController\.boom/, '스택을 서버 로그에 남긴다');
  for (const leaked of ['header-fake-token', 'cookie-fake', 'query-fake-token']) {
    assert.equal(log.includes(leaked), false, `로그에 ${leaked} 없음`);
  }
});

test('업무 거부(ApiError 4xx)는 서버 오류 로그를 남기지 않는다', { timeout: 10000 }, async (t) => {
  const { request, logs } = await start(t);
  await request('/__test/api-error/CONSENT_REQUIRED');
  assert.equal(logs.some((l) => l.startsWith('[error]') || l.startsWith('[warn]')), false);
});

test('요청 본문 오류와 없는 경로도 같은 형식으로 응답한다(잠정 — #88 결정 대기)', { timeout: 10000 }, async (t) => {
  const { request, logs } = await start(t);
  const post = (body) => request('/__test/echo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });

  const truncated = await post('{"a":');
  assertErrorShape(truncated, 400, 'INVALID_REQUEST');
  assert.equal(truncated.text.includes('JSON'), false, 'JSON 해석기 문구를 내보내지 않는다');

  assertErrorShape(await post('{a:1}'), 400, 'INVALID_REQUEST');
  assertErrorShape(await post(JSON.stringify({ pad: 'x'.repeat(200 * 1024) })), 413, 'INVALID_REQUEST');

  const missing = await request('/no-such-path');
  assertErrorShape(missing, 404, 'RESOURCE_UNAVAILABLE');
  assert.equal(missing.text.includes('no-such-path'), false, '요청 경로를 되돌려 보내지 않는다');

  assert.equal(logs.some((l) => l.startsWith('[error]')), false, '클라이언트 오류는 서버 오류로 기록하지 않는다');
});

test('코드 없는 HttpException은 상태를 보존하고 일반 코드로 응답한다(잠정 — #88 결정 대기)', { timeout: 10000 }, async (t) => {
  const { request, logs } = await start(t);
  assertErrorShape(await request('/__test/forbidden'), 403, 'INTERNAL_ERROR');
  assertErrorShape(await request('/__test/conflict'), 409, 'INTERNAL_ERROR');
  assertErrorShape(await request('/__test/unauthorized'), 401, 'AUTH_REQUIRED');
  assert.ok(logs.some((l) => l.startsWith('[warn]') && l.includes('ForbiddenException')), '코드 누락을 경고로 남긴다');
});

test('인증 Guard(#87)의 401도 필터를 거쳐 같은 형식으로 응답한다(AUTH 코드 구분은 #87 후속)', { timeout: 10000 }, async (t) => {
  const { request, logs } = await start(t);
  assertErrorShape(await request('/__test/protected'), 401, 'AUTH_REQUIRED');
  const forged = await request('/__test/protected', { headers: { Authorization: 'Bearer forged.fake.token' } });
  // #87이 AUTH_INVALID로 나눠 던지기 전까지는 위조 토큰도 AUTH_REQUIRED로 나간다.
  assertErrorShape(forged, 401, 'AUTH_REQUIRED');
  assert.equal(logs.join('\n').includes('forged.fake.token'), false, '토큰을 로그에 남기지 않는다');
});

test('개발 로그인 거부(403)도 같은 형식과 no-store로 응답한다', { timeout: 10000 }, async (t) => {
  const { request } = await start(t);
  const res = await request('/auth/dev-login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId: 'm-1' }),
  });
  assertErrorShape(res, 403, 'INTERNAL_ERROR');
});

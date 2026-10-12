require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { test } = require('node:test');
const { Controller, Get, Post, Body, Module, ForbiddenException, ConflictException, UnauthorizedException, PayloadTooLargeException } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { configureApp } = require('../dist/app.setup');
const { Public } = require('../dist/auth/auth.decorators');
const { ApiError, ERROR_STATUS } = require('../dist/common/errors');

// AppModule의 인증 설정(#87)이 요구하는 값. 테스트마다 무작위 키를 쓰고 개발 로그인은 끈다.
process.env.AUTH_JWT_SECRET = randomBytes(32).toString('hex');
process.env.AUTH_ACCESS_TOKEN_TTL_SECONDS = '60';
// 공유 URL 기본값(http)은 development·test에서만 쓴다(#218).
process.env.NODE_ENV = 'test';
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
  apiBoom() { throw new ApiError('INTERNAL_ERROR'); }
  multilineBoom() { throw new Error(`외부 처리 오류\n    at token=${FAKE_SECRET}\n${FAKE_SECRET}`); }
  trimmedMessage() {
    const error = new Error(`외부 처리 오류\n    at token=${FAKE_SECRET}`);
    void error.stack; // 스택 문자열이 만들어진 뒤
    error.message = '외부 처리 오류'; // 메시지만 첫 줄로 줄인 경우
    throw error;
  }
  mimicMessage() {
    const error = new Error(`외부 처리 오류\n    at query (token=${FAKE_SECRET}:1:1)`);
    void error.stack; // 스택 문자열이 만들어진 뒤
    error.message = '외부 처리 오류'; // 메시지만 첫 줄로 줄이고, 남은 줄이 코드 위치 형식을 흉내 내는 경우
    throw error;
  }
  brokenStack() {
    const error = new Error(FAKE_SECRET);
    Object.defineProperty(error, 'stack', { get() { throw new Error(FAKE_SECRET); } });
    throw error;
  }
  renamedError() {
    const error = new Error('일반 메시지');
    error.name = `Error\n token=${FAKE_SECRET}`; // 이름에 개행과 외부 값이 섞인 경우
    throw error;
  }
  renamedForbidden() {
    const error = new ForbiddenException();
    error.name = `ForbiddenException\n token=${FAKE_SECRET}`;
    throw error;
  }
  namedClass() {
    // 계산된 이름으로 만든 클래스: constructor.name에도 외부 값이 들어간다.
    const Named = { [`token=${FAKE_SECRET}`]: class extends TypeError {} }[`token=${FAKE_SECRET}`];
    throw new Named('일반 메시지');
  }
  staleStack() { const error = new Error('안전한 메시지'); error.stack = `Error: ${FAKE_SECRET}\n    at token=${FAKE_SECRET}\n    at ProbeController.staleStack (test:1:1)`; throw error; }
  tooLarge() { throw new PayloadTooLargeException(); }
  tokenBoom() { return this.boom(); }
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
publicRoute(Get('api-boom'), 'apiBoom');
publicRoute(Get('multiline-boom'), 'multilineBoom');
publicRoute(Get('trimmed-message'), 'trimmedMessage');
publicRoute(Get('stale-stack'), 'staleStack');
publicRoute(Get('mimic-message'), 'mimicMessage');
publicRoute(Get('broken-stack'), 'brokenStack');
publicRoute(Get('renamed-error'), 'renamedError');
publicRoute(Get('renamed-forbidden'), 'renamedForbidden');
publicRoute(Get('named-class'), 'namedClass');
publicRoute(Get('too-large'), 'tooLarge');
publicRoute(Get('token/:token'), 'tokenBoom');
publicRoute(Get('forbidden'), 'forbidden');
publicRoute(Get('conflict'), 'conflict');
publicRoute(Get('unauthorized'), 'unauthorized');
publicRoute(Post('echo'), 'echo');
Body()(ProbeController.prototype, 'echo', 0);
route(Get('protected'), 'protectedRoute');
class ProbeModule {}
Module({ imports: [AppModule], controllers: [ProbeController] })(ProbeModule);

// 코드 위치는 함수 이름 없이 `at 파일:줄:칸`으로 남는다. 이 파일에서 해당 코드가 있는 줄로 확인한다.
const SOURCE_LINES = require('node:fs').readFileSync(__filename, 'utf8').split('\n');
const lineOf = (marker) => {
  const index = SOURCE_LINES.findIndex((line) => line.includes(marker));
  assert.ok(index >= 0, `표식 없음: ${marker}`);
  return index + 1;
};
// offset: 표식 줄에서 오류를 만드는 줄까지의 거리
const frameAt = (marker, offset = 0) => new RegExp(`    at test/errors\\.test\\.cjs:${lineOf(marker) + offset}:\\d+`);
const ANY_OWN_FRAME = /at test\/errors\.test\.cjs:\d+:\d+/;

async function start(t) {
  const logs = [];
  const logger = Object.fromEntries(['log', 'error', 'warn', 'debug', 'verbose', 'fatal'].map((level) =>
    [level, (...args) => logs.push(`[${level}] ${args.map(String).join(' ')}`)]));
  const app = await configureApp(await NestFactory.create(ProbeModule, { logger, abortOnError: false }));
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
    const body = assertErrorShape(await request(`/v1/__test/api-error/${code}`), status, code);
    assert.equal(body.details, undefined);
  }
});

test('명세가 문구를 정한 코드는 명세 문구로 응답한다', { timeout: 10000 }, async (t) => {
  const { request } = await start(t);
  assert.equal((await request('/v1/__test/api-error/RESOURCE_UNAVAILABLE')).json().message, '현재 열람할 수 없는 자료입니다.');
  assert.equal((await request('/v1/__test/api-error/LINK_UNAVAILABLE')).json().message, '이 링크는 열람할 수 없습니다.');
  assert.equal((await request('/v1/__test/api-error/INTERNAL_ERROR')).json().message, '처리 중 오류가 발생했습니다.');
  assert.equal((await request('/v1/__test/custom-message')).json().message, '결과가 이미 있어 다시 요청할 수 없습니다.');
});

test('details는 명세의 두 키만 담고 나머지는 버린다', { timeout: 10000 }, async (t) => {
  const { request } = await start(t);
  const inProgress = assertErrorShape(await request('/v1/__test/in-progress'), 409, 'ANALYSIS_IN_PROGRESS');
  assert.deepEqual(inProgress.details, { existingRequestId: 'req-1' });

  const res = await request('/v1/__test/violations');
  const violations = assertErrorShape(res, 400, 'VALIDATION_FAILED');
  assert.deepEqual(violations.details, { violations: [{ field: 'title', reason: 'isNotEmpty' }] });
  assert.equal(res.text.includes(FAKE_SECRET), false, '입력값을 응답에 담지 않는다');

  const empty = assertErrorShape(await request('/v1/__test/empty-details'), 400, 'INVALID_REQUEST');
  assert.equal(empty.details, undefined, '허용 키가 없으면 details 자체를 생략한다');
});

test('예상 밖 예외는 500 일반 안내만 응답하고 원인은 서버 로그에만 남긴다', { timeout: 10000 }, async (t) => {
  const { request, logs } = await start(t);
  const res = await request('/v1/__test/boom?token=query-fake-token', {
    headers: { Authorization: 'Bearer header-fake-token', Cookie: 'sid=cookie-fake' },
  });
  const body = assertErrorShape(res, 500, 'INTERNAL_ERROR');
  assert.deepEqual(body, { code: 'INTERNAL_ERROR', message: '처리 중 오류가 발생했습니다.' });
  for (const leaked of [FAKE_SECRET, 'SELECT', 'stack', 'errors.test.cjs']) {
    assert.equal(res.text.includes(leaked), false, `응답에 ${leaked} 없음`);
  }

  const log = logs.join('\n');
  assert.match(log, /\[error\] GET \/v1\/__test\/boom → 500 INTERNAL_ERROR \(Error\)/, '원인을 서버 로그에서 찾을 수 있다');
  assert.match(log, frameAt('  boom() {'), '코드 위치를 서버 로그에 남긴다');
  for (const leaked of [FAKE_SECRET, 'SELECT', 'header-fake-token', 'cookie-fake', 'query-fake-token']) {
    assert.equal(log.includes(leaked), false, `로그에 ${leaked} 없음`);
  }
});

test('업무 거부(ApiError 4xx)는 서버 오류 로그를 남기지 않는다', { timeout: 10000 }, async (t) => {
  const { request, logs } = await start(t);
  await request('/v1/__test/api-error/CONSENT_REQUIRED');
  assert.equal(logs.some((l) => l.startsWith('[error]') || l.startsWith('[warn]')), false);
});

test('요청 본문 오류와 없는 경로는 9/28 결정의 형식으로 응답한다', { timeout: 10000 }, async (t) => {
  const { request, logs } = await start(t);
  const post = (body) => request('/v1/__test/echo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });

  const truncated = await post('{"a":');
  assertErrorShape(truncated, 400, 'INVALID_REQUEST');
  assert.equal(truncated.text.includes('JSON'), false, 'JSON 해석기 문구를 내보내지 않는다');

  assertErrorShape(await post('{a:1}'), 400, 'INVALID_REQUEST');
  assert.equal(assertErrorShape(await post(JSON.stringify({ pad: 'x'.repeat(200 * 1024) })), 400, 'INVALID_REQUEST').message, '요청 본문이 너무 큽니다.');
  assertErrorShape(await request('/v1/__test/too-large'), 400, 'INVALID_REQUEST');

  const missing = await request('/no-such-path');
  assertErrorShape(missing, 404, 'RESOURCE_UNAVAILABLE');
  assert.equal(missing.text.includes('no-such-path'), false, '요청 경로를 되돌려 보내지 않는다');

  assert.equal(logs.some((l) => l.startsWith('[error]')), false, '클라이언트 오류는 서버 오류로 기록하지 않는다');
});

test('코드 없는 HttpException은 9/28 결정대로 상태를 보존하고 일반 코드로 응답한다', { timeout: 10000 }, async (t) => {
  const { request, logs } = await start(t);
  assertErrorShape(await request('/v1/__test/forbidden'), 403, 'INTERNAL_ERROR');
  assertErrorShape(await request('/v1/__test/conflict'), 409, 'INTERNAL_ERROR');
  assertErrorShape(await request('/v1/__test/unauthorized'), 401, 'AUTH_REQUIRED');
  assert.ok(logs.some((l) => l.startsWith('[warn]') && l.includes('ForbiddenException')), '코드 누락을 경고로 남긴다');
});

test('인증 Guard(#87)의 토큰 없음·잘못된 토큰은 공통 필터에서 다른 AUTH 코드로 응답한다', { timeout: 10000 }, async (t) => {
  const { request, logs } = await start(t);
  assertErrorShape(await request('/v1/__test/protected'), 401, 'AUTH_REQUIRED');
  const forged = await request('/v1/__test/protected', { headers: { Authorization: 'Bearer forged.fake.token' } });
  assertErrorShape(forged, 401, 'AUTH_INVALID');
  assert.equal(logs.join('\n').includes('forged.fake.token'), false, '토큰을 로그에 남기지 않는다');
});

test('개발 로그인 거부(403)도 같은 형식과 no-store로 응답한다', { timeout: 10000 }, async (t) => {
  const { request } = await start(t);
  const res = await request('/v1/auth/dev-login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId: 'm-1' }),
  });
  assertErrorShape(res, 403, 'INTERNAL_ERROR');
});

test('기능 경로는 /v1 아래에서 응답하고 /health는 접두사 없이 응답한다', { timeout: 10000 }, async (t) => {
  const { request } = await start(t);
  assert.equal((await request('/v1/__test/api-error/CONSENT_REQUIRED')).status, 403);
  assertErrorShape(await request('/__test/api-error/CONSENT_REQUIRED'), 404, 'RESOURCE_UNAVAILABLE');
  assert.equal((await request('/health')).status, 200);
  assertErrorShape(await request('/v1/health'), 404, 'RESOURCE_UNAVAILABLE');
});

test('성공 응답에도 Cache-Control: no-store가 붙는다', { timeout: 10000 }, async (t) => {
  const { request } = await start(t);
  const echo = await request('/v1/__test/echo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"a":1}' });
  assert.equal(echo.status, 201);
  assert.equal(echo.headers.get('cache-control'), 'no-store');
  const health = await request('/health');
  assert.equal(health.status, 200);
  assert.equal(health.headers.get('cache-control'), 'no-store');
});

test('/v1 밖의 없는 경로와 본문 오류도 HTML이 아닌 같은 형식으로 응답한다', { timeout: 10000 }, async (t) => {
  const { request } = await start(t);
  const missing = await request('/nope');
  assertErrorShape(missing, 404, 'RESOURCE_UNAVAILABLE');
  assert.equal(missing.text.includes('<html'), false);
  const post = (p, body) => request(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  assertErrorShape(await post('/nope', '{"a":'), 400, 'INVALID_REQUEST');
  assertErrorShape(await post('/nope', JSON.stringify({ pad: 'x'.repeat(200 * 1024) })), 400, 'INVALID_REQUEST');
  assertErrorShape(await request('/health', { method: 'DELETE' }), 404, 'RESOURCE_UNAVAILABLE');
});

test('ApiError 5xx도 메시지 대신 코드 위치를 기록하며 URL의 토큰을 남기지 않는다', async (t) => {
  const { request, logs } = await start(t);
  assertErrorShape(await request('/v1/__test/api-boom'), 500, 'INTERNAL_ERROR');
  assertErrorShape(await request(`/v1/__test/token/${FAKE_SECRET}`), 500, 'INTERNAL_ERROR');
  assertErrorShape(await request(`/unknown/${FAKE_SECRET}`), 404, 'RESOURCE_UNAVAILABLE');
  const log = logs.join('\n');
  assert.match(log, frameAt('  apiBoom() {'), 'ApiError도 코드 위치를 남긴다');
  assert.equal(log.includes('처리 중 오류가 발생했습니다.'), false, '메시지를 로그에 남기지 않는다');
  assert.equal(log.includes(FAKE_SECRET), false);
});

test('여러 줄 오류 메시지는 코드 위치처럼 보여도 로그에 남기지 않는다', { timeout: 10000 }, async (t) => {
  const { request, logs } = await start(t);
  const res = await request('/v1/__test/multiline-boom');
  assertErrorShape(res, 500, 'INTERNAL_ERROR');
  assert.equal(res.text.includes(FAKE_SECRET), false, '응답에 메시지 없음');

  const log = logs.join('\n');
  assert.match(log, /\[error\] GET \/v1\/__test\/multiline-boom → 500 INTERNAL_ERROR \(Error\)/);
  assert.match(log, frameAt('  multilineBoom() {'), '실제 코드 위치는 남긴다');
  for (const leaked of [FAKE_SECRET, 'token=', '외부 처리 오류']) {
    assert.equal(log.includes(leaked), false, `로그에 ${leaked} 없음`);
  }
});

test('스택 생성 뒤 메시지를 줄여도 원문은 남기지 않고 실제 코드 위치만 남긴다', { timeout: 10000 }, async (t) => {
  const { request, logs } = await start(t);
  // 남은 줄이 코드 위치 형식이 아닌 경우와, 코드 위치 형식을 흉내 내는 경우
  for (const [path, marker] of [['trimmed-message', '  trimmedMessage() {'], ['mimic-message', '  mimicMessage() {']]) {
    logs.length = 0;
    assertErrorShape(await request(`/v1/__test/${path}`), 500, 'INTERNAL_ERROR');
    const log = logs.join('\n');
    assert.match(log, new RegExp(`\\[error\\] GET /v1/__test/${path} → 500 INTERNAL_ERROR \\(Error\\)`), `${path}: 오류 발생은 기록한다`);
    assert.match(log, frameAt(marker, 1), `${path}: 오류를 만든 실제 위치를 남긴다`);
    for (const leaked of [FAKE_SECRET, 'token=', '외부 처리 오류', 'query (']) {
      assert.equal(log.includes(leaked), false, `${path}: 로그에 ${leaked} 없음`);
    }
  }
});

test('수집 기록이 없거나 스택 접근이 실패하면 코드 위치를 생략하고 응답은 유지한다', { timeout: 10000 }, async (t) => {
  const { request, logs } = await start(t);
  // 스택을 먼저 덮어쓴 경우, 스택 접근 자체가 예외를 던지는 경우
  for (const path of ['stale-stack', 'broken-stack']) {
    logs.length = 0;
    assertErrorShape(await request(`/v1/__test/${path}`), 500, 'INTERNAL_ERROR');
    const log = logs.join('\n');
    assert.match(log, new RegExp(`\\[error\\] GET /v1/__test/${path} → 500 INTERNAL_ERROR \\(Error\\)`), `${path}: 오류 발생은 기록한다`);
    assert.doesNotMatch(log, ANY_OWN_FRAME, `${path}: 문자열 파싱으로 위치를 만들지 않는다`);
    for (const leaked of [FAKE_SECRET, 'token=']) {
      assert.equal(log.includes(leaked), false, `${path}: 로그에 ${leaked} 없음`);
    }
  }
});

test('예외 이름은 원문 대신 허용 목록의 고정 분류명으로 기록한다', { timeout: 10000 }, async (t) => {
  const { request, logs } = await start(t);
  // [경로, 기대 상태, 기대 코드, 로그 수준, 기대 분류명]
  const cases = [
    ['renamed-error', 500, 'INTERNAL_ERROR', 'error', 'Error'],
    ['renamed-forbidden', 403, 'INTERNAL_ERROR', 'warn', 'ForbiddenException'],
    ['named-class', 500, 'INTERNAL_ERROR', 'error', 'TypeError'],
  ];
  for (const [path, status, code, level, kind] of cases) {
    logs.length = 0;
    const res = await request(`/v1/__test/${path}`);
    assertErrorShape(res, status, code);
    assert.equal(res.text.includes(FAKE_SECRET), false, `${path}: 응답에 이름 원문 없음`);

    const entry = logs.find((line) => line.startsWith(`[${level}] GET /v1/__test/${path}`));
    assert.ok(entry, `${path}: ${level} 로그를 남긴다`);
    assert.match(entry, new RegExp(`→ ${status} ${code} \\(${kind}\\)`), `${path}: 고정 분류명 ${kind}`);
    const log = logs.join('\n');
    for (const leaked of [FAKE_SECRET, 'token=']) {
      assert.equal(log.includes(leaked), false, `${path}: 로그에 ${leaked} 없음`);
    }
    // 오류 이름에 넣은 개행·가짜 값이 섞이지 않았는지 첫 줄에서 확인한다: 분류명 바로 뒤에는 코드 위치나 로거 문맥만 온다.
    // 코드 위치 사이의 정상 개행은 검사 대상이 아니다.
    assert.match(entry.split('\n')[0], new RegExp(`\\(${kind}\\)(?: {5}at | ApiExceptionFilter$|$)`), `${path}: 분류명 뒤에 이름 원문 없음`);
  }
});

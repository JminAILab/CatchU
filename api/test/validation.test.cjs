require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { test } = require('node:test');
const { Body, Controller, Module, Post } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { IsInt, IsNotEmpty, IsString, MaxLength, ValidateNested } = require('class-validator');
const { Type } = require('class-transformer');
const { AppModule } = require('../dist/app.module');
const { configureApp } = require('../dist/app.setup');
const { Public } = require('../dist/auth/auth.decorators');

process.env.AUTH_JWT_SECRET = randomBytes(32).toString('hex');
process.env.AUTH_ACCESS_TOKEN_TTL_SECONDS = '60';
delete process.env.DEV_LOGIN_ENABLED;

// 검증 대상 DTO와 경로는 테스트 안에만 둔다.
const FAKE_INPUT = 'probe-fake-input-91c2';
class ConsentDto {}
IsString()(ConsentDto.prototype, 'noticeRevision');
IsNotEmpty()(ConsentDto.prototype, 'noticeRevision');
class CreateDto {}
IsString()(CreateDto.prototype, 'title');
IsNotEmpty()(CreateDto.prototype, 'title');
MaxLength(5)(CreateDto.prototype, 'title');
IsInt()(CreateDto.prototype, 'count');
ValidateNested()(CreateDto.prototype, 'consent');
Type(() => ConsentDto)(CreateDto.prototype, 'consent');

class ProbeController {
  create(body) { return { title: body.title, isDto: body instanceof CreateDto }; }
}
Controller('__test')(ProbeController);
Post('create')(ProbeController.prototype, 'create', Object.getOwnPropertyDescriptor(ProbeController.prototype, 'create'));
Public()(ProbeController.prototype, 'create', Object.getOwnPropertyDescriptor(ProbeController.prototype, 'create'));
Body()(ProbeController.prototype, 'create', 0);
Reflect.defineMetadata('design:paramtypes', [CreateDto], ProbeController.prototype, 'create');
class ProbeModule {}
Module({ imports: [AppModule], controllers: [ProbeController] })(ProbeModule);

async function start(t) {
  const app = await configureApp(await NestFactory.create(ProbeModule, { logger: false, abortOnError: false }));
  t.after(() => app.close());
  await app.listen(0, '127.0.0.1');
  const url = await app.getUrl();
  return async (body) => {
    const res = await fetch(`${url}/v1/__test/create`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      signal: AbortSignal.timeout(3000),
    });
    const text = await res.text();
    return { status: res.status, cache: res.headers.get('cache-control'), text, json: JSON.parse(text) };
  };
}

const valid = { title: 'ok', count: 1, consent: { noticeRevision: 'n1' } };

test('올바른 DTO는 통과하고 DTO 인스턴스로 변환된다', { timeout: 10000 }, async (t) => {
  const post = await start(t);
  const res = await post(valid);
  assert.equal(res.status, 201);
  assert.deepEqual(res.json, { title: 'ok', isDto: true });
});

test('검증 실패는 400 VALIDATION_FAILED와 필드·규칙 이름만 담는다', { timeout: 10000 }, async (t) => {
  const post = await start(t);
  const res = await post({ title: FAKE_INPUT, count: 'x', consent: { noticeRevision: '' } });
  assert.equal(res.status, 400);
  assert.equal(res.cache, 'no-store');
  assert.equal(res.json.code, 'VALIDATION_FAILED');
  assert.deepEqual(Object.keys(res.json.details), ['violations']);
  const got = res.json.details.violations.map((v) => `${v.field}:${v.reason}`).sort();
  assert.deepEqual(got, ['consent.noticeRevision:isNotEmpty', 'count:isInt', 'title:maxLength']);
  for (const v of res.json.details.violations) assert.deepEqual(Object.keys(v).sort(), ['field', 'reason']);
  assert.equal(res.text.includes(FAKE_INPUT), false, '입력값을 응답에 담지 않는다');
});

test('필수 필드 누락도 VALIDATION_FAILED다', { timeout: 10000 }, async (t) => {
  const post = await start(t);
  const res = await post({ count: 1, consent: { noticeRevision: 'n1' } });
  assert.equal(res.json.code, 'VALIDATION_FAILED');
  assert.ok(res.json.details.violations.some((v) => v.field === 'title' && v.reason === 'isNotEmpty'));
});

test('선언되지 않은 필드는 거부한다(명세: 알 수 없는 필드 거부)', { timeout: 10000 }, async (t) => {
  const post = await start(t);
  const res = await post({ ...valid, memberId: 'someone-else' });
  assert.equal(res.status, 400);
  assert.equal(res.json.code, 'VALIDATION_FAILED');
  assert.deepEqual(res.json.details.violations, [{ field: 'memberId', reason: 'whitelistValidation' }]);
});

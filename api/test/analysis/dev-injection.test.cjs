require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { test } = require('node:test');
const { Body, Controller, Module, Param, Post, Inject } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { SignJWT, decodeJwt } = require('jose');
const { DevAnalysisInjection, readDevInjectionConfig } = require('../../dist/analysis-receiver/dev-analysis-injection');
const { AnalysisReceiverModule } = require('../../dist/analysis-receiver/analysis-receiver.module');
const { AppModule } = require('../../dist/app.module');
const { configureApp } = require('../../dist/app.setup');
const { CurrentMemberId } = require('../../dist/auth/auth.decorators');
const { CONTRACT_DIR, context, harness, result, event } = require('../helpers/receiver-harness.cjs');

function template() {
  const input = result();
  for (const field of ['memberId', 'repositoryId', 'requestId', 'attemptId', 'consentId', 'scopeRevision']) {
    input[field] = `{{${field}}}`;
  }
  input.resultId = '{{caseId}}-result';
  return input;
}

function injection(setup, overrides = {}) {
  return new DevAnalysisInjection(setup.store, setup.receiver,
    readDevInjectionConfig({ NODE_ENV: 'test', DEV_ANALYSIS_INJECTION_ENABLED: 'true', ...overrides }));
}

for (const [label, env] of [
  ['설정 없음', { DEV_ANALYSIS_INJECTION_ENABLED: undefined }],
  ['false', { DEV_ANALYSIS_INJECTION_ENABLED: 'false' }],
  ['1', { DEV_ANALYSIS_INJECTION_ENABLED: '1' }],
  ['production + true', { NODE_ENV: 'production' }],
  ['미지정 환경', { NODE_ENV: undefined }],
]) {
  test(`개발 주입 차단: ${label}`, async () => {
    const setup = harness();
    await assert.rejects(injection(setup, env).inject('test-member', 'test-request', 'Result', template(), 'case'),
      (error) => error.getStatus() === 403);
    assert.equal(setup.store.commits, 0);
  });
}

test('접수 대역의 본인 맥락으로만 템플릿을 채우며 MOCK을 유지한다', async () => {
  const setup = harness(context({ consentId: 'accepted-consent', scopeRevision: 'accepted-scope' }));
  const input = template();
  const before = structuredClone(input);
  const output = await injection(setup).inject('test-member', 'test-request', 'Result', input, 'case');
  assert.equal(output.receipt.disposition, 'ACCEPTED');
  assert.equal(output.accepted.result.consentId, 'accepted-consent');
  assert.equal(output.accepted.result.scopeRevision, 'accepted-scope');
  assert.equal(output.accepted.result.sourceMode, 'MOCK');
  assert.deepEqual(input, before);
});

test('타인/없는 요청, LIVE 요청/템플릿, 고정 값으로 요청을 바꾸는 주입은 차단한다', async () => {
  const setup = harness();
  for (const [member, request] of [['other-member', 'test-request'], ['test-member', 'unknown']]) {
    await assert.rejects(injection(setup).inject(member, request, 'Result', template(), 'case'),
      (error) => error.getStatus() === 404);
  }
  for (const fields of [{ sourceMode: 'LIVE' }, { requestId: 'another' }, { memberId: 'another' }]) {
    await assert.rejects(injection(setup).inject('test-member', 'test-request', 'Result', { ...template(), ...fields }, 'case'),
      (error) => error.getStatus() === 403);
  }
  const live = harness(context({ sourceMode: 'LIVE' }));
  await assert.rejects(injection(live).inject('test-member', 'test-request', 'Result', template(), 'case'),
    (error) => error.getStatus() === 403);
  assert.equal(setup.store.savedResults, 0);
});

test('주입도 식별자 누락을 복구하지 않으며 진행 이벤트에 Receipt를 만들지 않는다', async () => {
  const setup = harness();
  const input = template(); delete input.attemptId;
  assert.deepEqual(await injection(setup).inject('test-member', 'test-request', 'Result', input, 'case'), { receipt: null });
  assert.deepEqual(await injection(setup).inject('test-member', 'test-request', 'Result',
    { ...template(), requestId: '' }, 'case'), { receipt: null });
  assert.equal(await injection(setup).inject('test-member', 'test-request', 'ProcessingEvent', event(), 'case'), 'OBSERVED');
  await assert.rejects(injection(setup).inject('test-member', 'test-request', 'Result',
    { ...template(), messageId: '{{unknown}}' }, 'case'), /Unknown synthetic fixture placeholder/);
});

// 이 컨트롤러는 테스트 안에만 존재한다. 운영 라우트나 추가 API 계약이 아니다.
class InjectionProbeController {
  constructor(injector) { this.injector = injector; }
  inject(memberId, requestId, body) {
    return this.injector.inject(memberId, requestId, body.kind, body.template, body.caseId);
  }
}
Controller('__test/analysis')(InjectionProbeController);
Inject(DevAnalysisInjection)(InjectionProbeController, undefined, 0);
Post(':requestId/message')(InjectionProbeController.prototype, 'inject', Object.getOwnPropertyDescriptor(InjectionProbeController.prototype, 'inject'));
CurrentMemberId()(InjectionProbeController.prototype, 'inject', 0);
Param('requestId')(InjectionProbeController.prototype, 'inject', 1);
Body()(InjectionProbeController.prototype, 'inject', 2);

async function server(t, overrides) {
  const settings = { AUTH_JWT_SECRET: randomBytes(32).toString('hex'), AUTH_ACCESS_TOKEN_TTL_SECONDS: '60',
    DEV_LOGIN_ENABLED: 'true', NODE_ENV: 'test', DEV_ANALYSIS_INJECTION_ENABLED: 'true', ...overrides };
  const before = Object.fromEntries(Object.keys(settings).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(settings)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  const setup = harness();
  const logs = [];
  const logger = Object.fromEntries(['log', 'error', 'warn', 'debug', 'verbose', 'fatal'].map((level) =>
    [level, (...args) => logs.push(JSON.stringify(args))]));
  class TestModule {}
  Module({ imports: [AppModule, AnalysisReceiverModule.register({ store: setup.store, contractDirectory: CONTRACT_DIR })],
    controllers: [InjectionProbeController] })(TestModule);
  let app;
  t.after(async () => {
    try { if (app) await app.close(); }
    finally {
      for (const [key, value] of Object.entries(before)) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    }
  });
  app = await configureApp(await NestFactory.create(TestModule, { logger, abortOnError: false }));
  await app.listen(0, '127.0.0.1');
  const url = await app.getUrl();
  const post = (path, body, token) => fetch(`${url}${path}`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body), signal: AbortSignal.timeout(3000) });
  const issueTestToken = () => new SignJWT({ sub: 'test-member', iss: 'catchu-api', aud: 'catchu-member-api',
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 60 })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).sign(Buffer.from(settings.AUTH_JWT_SECRET, 'hex'));
  return { ...setup, logs, post, issueTestToken };
}

test('#87 Guard/CurrentMemberId와 연결한 테스트 전용 주입: 인증 없음/타인 차단, 본인 정상', async (t) => {
  const app = await server(t);
  const body = { kind: 'Result', template: template(), caseId: 'case', memberId: 'other-member' };
  const path = '/v1/__test/analysis/test-request/message';
  assert.equal((await app.post(path, body)).status, 401);
  const own = await (await app.post('/v1/auth/dev-login', { memberId: 'test-member' })).json();
  const other = await (await app.post('/v1/auth/dev-login', { memberId: 'other-member' })).json();
  const memberId = decodeJwt(own.accessToken).sub;
  app.store.state.context.memberId = memberId; // 실제 회원 UUID, 분석 접수는 기존 메모리 대역.
  assert.equal((await app.post(path, { ...body, memberId: 'test-member' }, other.accessToken)).status, 404);
  const accepted = await (await app.post(path, body, own.accessToken)).json();
  assert.equal(accepted.receipt.disposition, 'ACCEPTED');
  assert.equal(accepted.accepted.result.memberId, memberId);
  const rejected = await app.post(path, { ...body, template: { ...template(), extra: 'synthetic-secret-marker' } }, own.accessToken);
  assert.equal((await rejected.json()).receipt.code, 'SCHEMA_INVALID');
  for (const sensitive of [own.accessToken, other.accessToken, 'synthetic-secret-marker']) {
    assert.equal(app.logs.join('\n').includes(sensitive), false);
  }
});

test('Nest 조립 시 주입 설정 없음이면 인증해도 거부한다', async (t) => {
  const app = await server(t, { DEV_ANALYSIS_INJECTION_ENABLED: undefined });
  const own = await (await app.post('/v1/auth/dev-login', { memberId: 'test-member' })).json();
  assert.equal((await app.post('/v1/__test/analysis/test-request/message',
    { kind: 'Result', template: template(), caseId: 'case' }, own.accessToken)).status, 403);
});

test('Nest 조립 시 production + 주입 설정 true라도 인증된 주입을 거부한다', async (t) => {
  // production은 공유 URL 주소가 필수(#147)라 합성 주소를 함께 준다.
  const app = await server(t, { NODE_ENV: 'production', SHARE_LINK_WEB_BASE_URL: 'https://catchu.example' });
  assert.equal((await app.post('/v1/__test/analysis/test-request/message',
    { kind: 'Result', template: template(), caseId: 'case' }, await app.issueTestToken())).status, 403);
  assert.equal(app.store.commits, 0);
});

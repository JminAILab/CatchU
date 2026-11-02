require('reflect-metadata');
// 실제 접수 API → 개발 주입(DevAnalysisInjection) → DB 수신·반영을 잇는 시험용 앱 조립.
// #114 연결 시험(test/integration/analysis-intake-receiver.test.cjs)과 #123 화면 통합 시험이 함께 쓴다.
// worker·큐·GitHub는 연결하지 않는다. 보호 기록에는 실제 10월 정책 공급자를 쓰고 좌표는 합성 저장소 어댑터로 공급한다.
// 제품 앱에는 이 시험 조립을 등록하지 않는다.
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { Body, Controller, Inject, Module, Param, Post } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { decodeJwt } = require('jose');
const { CONTRACT_DIR } = require('./receiver-harness.cjs');
const { AppModule } = require('../../dist/app.module');
const { configureApp } = require('../../dist/app.setup');
const { CurrentMemberId } = require('../../dist/auth/auth.decorators');
const { AnalysisReceiverModule } = require('../../dist/analysis-receiver/analysis-receiver.module');
const { DevAnalysisInjection } = require('../../dist/analysis-receiver/dev-analysis-injection');
const { DatabaseReceiverStore } = require('../../dist/analysis-receiver/database-receiver.store');
const { OctoberRepositoryObservationSource } = require('../../dist/analysis-receiver/october-repository-observation.source');
const { SYNTHETIC_REPOSITORY } = require('../../dist/member-analysis/dev-member.service');

// 네트워크 재현 전용 컨트롤러. 운영 worker·회원 API를 추가하지 않는다.
class InjectionProbe {
  constructor(injection) { this.injection = injection; }
  inject(memberId, requestId, body) { return this.injection.inject(memberId, requestId, body.kind, body.template, body.caseId); }
}
Controller('__test/analysis-receiver')(InjectionProbe);
Inject(DevAnalysisInjection)(InjectionProbe, undefined, 0);
Post(':requestId')(InjectionProbe.prototype, 'inject', Object.getOwnPropertyDescriptor(InjectionProbe.prototype, 'inject'));
CurrentMemberId()(InjectionProbe.prototype, 'inject', 0);
Param('requestId')(InjectionProbe.prototype, 'inject', 1);
Body()(InjectionProbe.prototype, 'inject', 2);

// 시험용 좌표 어댑터: 접수 정본을 DB에서 읽고 #104 합성 저장소만 매핑한다.
// LIVE 좌표를 임의로 만들거나 #252의 실제 제공자 구현으로 취급하지 않는다.
const syntheticObservations = db => new OctoberRepositoryObservationSource({
  findForRegistration: context => new DatabaseReceiverStore(db).withRequest(context.requestId, async tx => {
    const stored = tx.snapshot?.context;
    if (!stored || stored.sourceMode !== 'MOCK' || stored.repositoryId !== SYNTHETIC_REPOSITORY.repositoryId ||
      stored.scopeRevision !== SYNTHETIC_REPOSITORY.allowedScopeRevision) return null;
    return { ...stored, githubRepository: { owner: SYNTHETIC_REPOSITORY.ownerLogin, name: SYNTHETIC_REPOSITORY.name } };
  }),
});

/**
 * 시험 앱을 띄운다. 끝나면 `close()`로 앱을 닫고 바꾼 환경변수를 되돌린다(기동 실패 때는 여기서 되돌린다).
 * `settings`는 기본 환경값을 덮어쓴다(값이 undefined면 지운다). `port` 0은 빈 포트다.
 */
async function startIntakeApp(db, { injection = true, protection = syntheticObservations(db), settings: extra = {}, port = 0 } = {}) {
  const settings = { NODE_ENV: 'test', DEV_LOGIN_ENABLED: 'true',
    DEV_ANALYSIS_INJECTION_ENABLED: injection ? 'true' : undefined,
    AUTH_JWT_SECRET: randomBytes(32).toString('hex'), AUTH_ACCESS_TOKEN_TTL_SECONDS: '900',
    AUTH_WEB_ORIGIN: 'https://catchu.example', SHARE_LINK_WEB_BASE_URL: 'https://catchu.example',
    LINK_GRANT_SECRET: randomBytes(32).toString('hex'), ...extra };
  const previous = Object.fromEntries(Object.keys(settings).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(settings)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  const logs = [];
  const logger = Object.fromEntries(['log', 'error', 'warn', 'debug', 'verbose', 'fatal'].map(level =>
    [level, (...args) => logs.push(args.map(String).join(' '))]));
  let app;
  const close = async () => {
    try { await app?.close(); } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    }
  };
  try {
    class TestModule {}
    Module({ imports: [AppModule, AnalysisReceiverModule.registerDatabase({ contractDirectory: CONTRACT_DIR, observations: protection })],
      controllers: [InjectionProbe] })(TestModule);
    app = await configureApp(await NestFactory.create(TestModule, { logger, abortOnError: false }));
    await app.listen(port, '127.0.0.1');
  } catch (error) {
    await close();
    throw error;
  }
  const base = await app.getUrl();
  const call = (path, options = {}) => fetch(base + path, { ...options, signal: AbortSignal.timeout(15000) });
  const json = { 'Content-Type': 'application/json' };
  const login = async id => {
    const response = await call('/v1/auth/dev-login', { method: 'POST', headers: json, body: JSON.stringify({ memberId: id }) });
    assert.equal(response.status, 200);
    const { accessToken } = await response.json();
    return { token: accessToken, memberId: decodeJwt(accessToken).sub };
  };
  const auth = user => ({ Authorization: 'Bearer ' + user.token });
  // 실제 고지·선정 저장소 API의 응답으로 동의를 만들고 실제 접수 API를 호출한다. 재요청은 원 요청 ID를 함께 보낸다.
  const submit = async (user, key = randomUUID(), { repositoryId = SYNTHETIC_REPOSITORY.repositoryId, retryOfRequestId } = {}) => {
    const notice = await (await call('/v1/analysis-notice', { headers: auth(user) })).json();
    const repositories = await (await call('/v1/me/repositories', { headers: auth(user) })).json();
    const repository = repositories.items.find(item => item.repositoryId === repositoryId);
    assert.ok(repository, '접수할 합성 저장소가 선정 저장소 API에 있어야 한다');
    const body = { repositoryId: repository.repositoryId,
      consent: { accepted: true, noticeRevision: notice.noticeRevision, scopeRevision: repository.allowedScopeRevision },
      ...(retryOfRequestId ? { retryOfRequestId } : {}) };
    const response = await call('/v1/analysis-requests', { method: 'POST',
      headers: { ...json, ...auth(user), 'Idempotency-Key': key }, body: JSON.stringify(body) });
    assert.equal(response.status, 202, await response.clone().text());
    return { key, body, status: await response.json() };
  };
  // 같은 멱등 키 재호출은 저장된 현재 상태를 돌려준다(접수 API의 기존 재응답 계약).
  const status = async (user, accepted) => {
    const response = await call('/v1/analysis-requests', { method: 'POST',
      headers: { ...json, ...auth(user), 'Idempotency-Key': accepted.key }, body: JSON.stringify(accepted.body) });
    assert.equal(response.status, 200);
    return response.json();
  };
  const inject = async (user, requestId, kind, template, caseId = 'case') => {
    const response = await call(`/v1/__test/analysis-receiver/${requestId}`, { method: 'POST',
      headers: { ...json, ...(user ? auth(user) : {}) }, body: JSON.stringify({ kind, template, caseId }) });
    const text = await response.text();
    let body = text;
    try { body = JSON.parse(text); } catch { /* 진행 이벤트는 문자열 */ }
    return { status: response.status, body, text };
  };
  // #140 조회 API: 개별 상태와 본인 이력을 같은 회원 인증으로 읽는다.
  const lookup = async (user, requestId) => {
    const response = await call(`/v1/analysis-requests/${requestId}`, { headers: auth(user) });
    return { status: response.status, body: await response.json() };
  };
  const history = async (user, search = '') => {
    const response = await call(`/v1/analysis-requests${search}`, { headers: auth(user) });
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  };
  return { app, base, logs, close, login, submit, status, inject, call, lookup, history };
}

module.exports = { startIntakeApp, syntheticObservations };

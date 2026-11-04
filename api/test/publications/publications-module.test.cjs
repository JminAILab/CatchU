// U4 제출 2 — PublicationsModule 구성(src/publications/publications.module.ts) 시험.
//
// 먼저 정한 시나리오·기대 결과·실패 조건(U4 보안 설계 「PublicationsModule 공급자 구성 (R-01)」·「재사용하는 10월 도구」,
// 논리 구성 요소 「의존 방향 (R-05)」, NFR1.5·NFR1.6, team.md Testing Posture). 세부 시험 코드는 구현 뒤 쓴다.
//
// 공급자 선언 (R-01)
//   - 기대: 모듈 안에 grant 키(readLinkGrantKey)·web 주소 설정(readShareLinksConfig)·발행 빈도 제한기·시계(PUBLICATIONS_CLOCK)·
//           C-10 DB 구현이 있고, C-10 DB 구현은 내보낸 토큰 PUBLICATION_ACCESS로 다른 모듈(U5)이 주입받는다. 발행 빈도 제한기는 10월 발급
//           제한기와 다른 인스턴스다. unlock 정책·제어(UNLOCK_POLICY·UNLOCK_CONTROLS)는 제출 3이 받은 사람 unlock을 옮길 때 넣는다:
//           지금 선언하면 ShareLinksModule과 인스턴스가 둘이 되어 app.get(UNLOCK_CONTROLS, { strict: false })로 제한기를 얻는 10월
//           unlock 시험이 실제 unlock 경로와 다른 제한기를 본다(PR #468 CI).
//   - 실패 조건: 토큰이 내보내지지 않음, 가짜 PublicationAccess가 앱에 등록됨, UNLOCK_CONTROLS가 이 모듈에 선언됨.
// 기동 검사 (NFR1.5·NFR1.6, #218·#242)
//   - 기대: 운영 설정(NODE_ENV가 development·test가 아님)에서 LINK_GRANT_SECRET 없음·64자 hex 아님·AUTH_JWT_SECRET과 같음이면 기동 실패,
//           SHARE_LINK_WEB_BASE_URL이 없거나 http면 기동 실패. test에서는 둘 다 없어도 기동한다. 오류 메시지에 키 값이 없다.
//   - 실패 조건: 운영 설정 누락인데 기동 성공.
// 의존 방향 (R-05)
//   - 기대: publications는 share-links 폴더에서 표·API 비의존 도구만 가져오고 share-links.module·share-links.service·link-access.service·
//           두 컨트롤러·recipient 모듈을 import하지 않는다. catches·materials는 publications를 import하지 않는다.
//   - 실패 조건: 금지 import.
// 경로 (보안 설계 「경로 중복 확인」의 제출 2 부분)
//   - 기대: 기본 앱(AppModule)에 PublicationsModule이 등록돼 /v1/publications 다섯 경로가 열리고, 등록된 (메서드, 경로) 쌍에 중복이 없다.
//           10월 작성자 경로(/v1/share-links)는 아직 그대로다.
//   - 실패 조건: 같은 (메서드, 경로)가 둘 이상.
//
// 테스트 DB를 쓰되 HTTP 요청은 보내지 않는다. 큐·임베딩 키는 비워 실제 외부에 붙지 않는다.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { readdirSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { Global, Inject, Injectable, Module } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { DataSource } = require('typeorm');
const { AppModule } = require('../../dist/app.module');
const { configureApp } = require('../../dist/app.setup');
const { AuthModule } = require('../../dist/auth/auth.module');
const { ErrorsModule } = require('../../dist/common/errors/errors.module');
const { LINK_GRANT_KEY } = require('../../dist/share-links/link-grant');
const { RequestRateLimiter } = require('../../dist/share-links/request-rate-limiter');
const { SHARE_LINK_ISSUE_LIMITER } = require('../../dist/share-links/issue-rate-limit');
const { SHARE_LINKS_CONFIG } = require('../../dist/share-links/share-links.config');
const { ShareLinksModule } = require('../../dist/share-links/share-links.module');
const { UNLOCK_CONTROLS, UNLOCK_POLICY } = require('../../dist/share-links/unlock-policy');
const { DbPublicationAccess } = require('../../dist/publications/db-publication-access');
const {
  PUBLICATION_ACCESS, PUBLICATIONS_CLOCK, PUBLISH_RATE_LIMITER, PublicationsModule,
} = require('../../dist/publications/publications.module');
const { openTestDataSource } = require('../support/test-database.cjs');
const { PUBLISH_SETTINGS, setEnv, collectingLogger } = require('./support.cjs');

const SRC = join(__dirname, '..', '..', 'src');
const PRODUCTION = { NODE_ENV: 'production', AUTH_WEB_ORIGIN: 'https://catchu.example', SHARE_LINK_WEB_BASE_URL: 'https://catchu.example',
  LINK_GRANT_SECRET: randomBytes(32).toString('hex'), DEV_LOGIN_ENABLED: undefined, CATCHU_EMBEDDING_API_KEY: `synthetic-embedding-key-${randomUUID()}` };

/** U5 자리: PublicationsModule을 imports에 넣고 PUBLICATION_ACCESS를 주입받는다. */
function consumerModule() {
  class Consumer {
    constructor(access) { this.access = access; }
  }
  Inject(PUBLICATION_ACCESS)(Consumer, undefined, 0);
  Injectable()(Consumer);
  class ConsumerModule {}
  Module({ imports: [PublicationsModule], providers: [Consumer], exports: [Consumer] })(ConsumerModule);
  return { Consumer, ConsumerModule };
}

/** 기본 앱 + 소비 모듈을 init까지 띄운다. */
async function bootApp(t, env = {}) {
  const restore = setEnv({ ...PUBLISH_SETTINGS, ...env });
  const consumer = consumerModule();
  class RootModule {}
  Module({ imports: [AppModule, consumer.ConsumerModule] })(RootModule);
  const app = await NestFactory.create(RootModule, { logger: collectingLogger([]), abortOnError: false });
  t.after(async () => { try { await app.close(); } finally { restore(); } });
  await configureApp(app);
  return { app, consumer: app.get(consumer.Consumer) };
}

/**
 * PublicationsModule만(ShareLinksModule 없이) 띄워 기동 검사가 이 모듈의 공급자에서 나는지 본다.
 * DataSource는 테스트 DB 연결을 전역 모듈로 공급한다. 기동 실패면 그 오류를 돌려준다.
 */
async function bootPublicationsOnly(t, env, db) {
  const restore = setEnv({ ...PUBLISH_SETTINGS, ...env });
  class FixtureDatabaseModule {}
  Global()(FixtureDatabaseModule);
  Module({ providers: [{ provide: DataSource, useValue: db }], exports: [DataSource] })(FixtureDatabaseModule);
  class RootModule {}
  Module({ imports: [FixtureDatabaseModule, AuthModule, ErrorsModule, PublicationsModule] })(RootModule);
  let app;
  t.after(async () => { try { await app?.close(); } finally { restore(); } });
  try {
    app = await NestFactory.create(RootModule, { logger: false, abortOnError: false });
    await app.init();
    return { app, error: null };
  } catch (error) {
    return { app, error };
  }
}

/** Express에 등록된 (메서드, 경로) 쌍. */
function registeredRoutes(app) {
  const instance = app.getHttpAdapter().getInstance();
  const stack = instance.router?.stack ?? instance._router?.stack ?? [];
  return stack.filter((layer) => layer.route).flatMap((layer) =>
    Object.keys(layer.route.methods).filter((method) => layer.route.methods[method]).map((method) => `${method.toUpperCase()} ${layer.route.path}`));
}

test('PublicationsModule이 자기 공급자(grant 키·web 주소·발행 빈도 제한기·시계·C-10 DB 구현)를 선언하고 PUBLICATION_ACCESS를 내보내며, unlock 제어는 선언하지 않는다', async (t) => {
  const { app, consumer } = await bootApp(t);
  const scope = app.select(PublicationsModule);
  const access = scope.get(PUBLICATION_ACCESS);
  assert.ok(access instanceof DbPublicationAccess, '앱에는 DB 구현만 등록된다(메모리 가짜 아님)');
  assert.equal(consumer.access, access, '다른 모듈이 같은 인스턴스를 주입받는다');
  assert.deepEqual(['resolveForRecipient', 'resolveForOwner', 'readSnapshot'].every((name) => typeof access[name] === 'function'), true);
  assert.ok(Buffer.isBuffer(scope.get(LINK_GRANT_KEY)) && scope.get(LINK_GRANT_KEY).length === 32);
  assert.equal(scope.get(SHARE_LINKS_CONFIG).webBaseUrl, 'https://catchu.example');
  // unlock 제어는 ShareLinksModule 하나에만 있어야 한다. 둘이면 10월 unlock 시험의 비엄격 조회가 뒤에 등록된 이 모듈의 인스턴스를 받아
  // 실제 unlock 경로(LinkAccessService)와 다른 제한기를 본다.
  for (const token of [UNLOCK_POLICY, UNLOCK_CONTROLS]) assert.throws(() => scope.get(token, { strict: true }), /Nest could not find/);
  assert.equal(app.get(UNLOCK_CONTROLS, { strict: false }), app.select(ShareLinksModule).get(UNLOCK_CONTROLS),
    '앱 전체에서 비엄격으로 찾은 unlock 제어가 ShareLinksModule의 것이다');
  const limiter = scope.get(PUBLISH_RATE_LIMITER);
  assert.ok(limiter instanceof RequestRateLimiter);
  assert.notEqual(limiter, app.select(ShareLinksModule).get(SHARE_LINK_ISSUE_LIMITER), '10월 발급 제한기와 다른 인스턴스');
  assert.deepEqual(limiter.take('synthetic-member', new Date()), { allowed: true });
  const clock = scope.get(PUBLICATIONS_CLOCK);
  assert.ok(clock() instanceof Date);
});

test('기본 앱에 /v1/publications 다섯 경로가 열리고 등록된 (메서드, 경로) 쌍에 중복이 없으며, 10월 /v1/share-links 경로는 아직 그대로다', async (t) => {
  const { app } = await bootApp(t);
  const routes = registeredRoutes(app);
  assert.ok(routes.length > 0, '경로를 읽었다');
  const duplicates = routes.filter((route, index) => routes.indexOf(route) !== index);
  assert.deepEqual(duplicates, []);
  for (const route of ['POST /v1/publications', 'GET /v1/publications', 'GET /v1/publications/:publicationId',
    'PUT /v1/publications/:publicationId/stop', 'DELETE /v1/publications/:publicationId']) {
    assert.ok(routes.includes(route), route);
  }
  assert.ok(!routes.some((route) => route.includes('/publications/:publicationId/reindex')), 'C-09 합의 전 reindex 경로 없음');
  assert.ok(routes.includes('POST /v1/share-links') && routes.includes('GET /v1/public/links/:token'), '10월 경로는 제출 3에서 바꾼다');
});

test('운영 설정에서 LINK_GRANT_SECRET 없음·64자 hex 아님·AUTH_JWT_SECRET과 같음, SHARE_LINK_WEB_BASE_URL 없음·http면 기동이 멈춘다(키 값 비노출)', async (t) => {
  const db = await openTestDataSource();
  t.after(() => db.destroy());
  const cases = [
    [{ ...PRODUCTION, LINK_GRANT_SECRET: undefined }, /LINK_GRANT_SECRET is required/],
    [{ ...PRODUCTION, LINK_GRANT_SECRET: 'not-hex' }, /64 hex characters/],
    [{ ...PRODUCTION, LINK_GRANT_SECRET: PUBLISH_SETTINGS.AUTH_JWT_SECRET }, /must differ from AUTH_JWT_SECRET/],
    [{ ...PRODUCTION, SHARE_LINK_WEB_BASE_URL: undefined }, /SHARE_LINK_WEB_BASE_URL is required/],
    [{ ...PRODUCTION, SHARE_LINK_WEB_BASE_URL: 'http://catchu.example' }, /must be an https URL/],
  ];
  for (const [env, pattern] of cases) {
    const { error } = await bootPublicationsOnly(t, env, db);
    assert.ok(error instanceof Error, `기동이 실패해야 한다: ${JSON.stringify(Object.keys(env))}`);
    assert.match(error.message, pattern);
    if (env.LINK_GRANT_SECRET) assert.ok(!error.message.includes(env.LINK_GRANT_SECRET), '키 값은 메시지에 없다');
  }
  const production = await bootPublicationsOnly(t, PRODUCTION, db);
  assert.equal(production.error, null, '운영 설정이 갖춰지면 뜬다');
  const test = await bootPublicationsOnly(t, { NODE_ENV: 'test', LINK_GRANT_SECRET: undefined, SHARE_LINK_WEB_BASE_URL: undefined }, db);
  assert.equal(test.error, null, 'test에서는 둘 다 없어도 뜬다');
  assert.equal(test.app.select(PublicationsModule).get(SHARE_LINKS_CONFIG).webBaseUrl, 'http://localhost:3000');
});

test('의존 방향: publications는 share-links의 도구 파일만 가져오고, catches·materials는 publications를 가져오지 않는다', () => {
  const sources = (dir) => readdirSync(join(SRC, dir)).filter((name) => name.endsWith('.ts')).map((name) => [name, readFileSync(join(SRC, dir, name), 'utf8')]);
  const imports = (code) => [...code.matchAll(/from '([^']+)'/g)].map((match) => match[1]);
  const forbidden = ['share-links.module', 'share-links.service', 'link-access.service', 'share-links.controller', 'public-links.controller',
    'share-link.entity', 'share-create', 'share-link-issuance', 'share-link-list', 'share-link-response', 'share-link-state', 'issue-rate-limit', '/recipient/'];
  for (const [name, code] of sources('publications')) {
    for (const target of imports(code)) {
      assert.ok(!forbidden.some((bad) => target.includes(bad)), `${name}: ${target}`);
    }
  }
  for (const dir of ['catches', 'materials']) {
    for (const [name, code] of sources(dir)) {
      assert.ok(!imports(code).some((target) => target.includes('publications')), `${dir}/${name}이 publications를 가져온다`);
    }
  }
});

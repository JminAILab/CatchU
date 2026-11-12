// U4 제출 3 — 경로 경계(AppModule에 등록된 경로·모듈 구성·인증 예외) 시험. 10월 두 경계 시험 `test/public-links-auth-boundary.test.cjs`·
// `test/recipient-module-boundary.test.cjs`를 대체한다(보안 설계 「`PublicationsModule` 공급자 구성 (R-01)」·R-02·R-07, BR9.1, NFR1.1·NFR1.5·NFR1.6, OQ-U4-3).
// Step 19(2026-11-05)에서 확정했고, 세부 시험 코드는 Step 20·21 구현 뒤 Step 23에서 썼다.
//
// 경로 (W6 뒤 AppModule을 띄워 등록된 (메서드, 경로)를 읽는다)
//   - 기대: 등록된 (메서드, 경로)에 중복이 없다. 받은 사람 세 경로 GET /v1/public/links/:token·POST /v1/public/links/:token/unlock·
//           GET /v1/public/links/:token/items/:publishedItemId/pdf(U8 계획 9.1, C-12 더하는 변경으로 2026-11-11에 더함)는 PublicationsModule의
//           새 컨트롤러 하나에만 연결된다. 다음 경로는 없다: GET /v1/public/links/:token/catches/:catchId(10월 Catch 상세), GET·POST /v1/share-links와
//           PUT /v1/share-links/:linkId/stop(10월 발급·목록·중지). 발행·작성자 관리 경로(/v1/publications...)·설명·자료 경로는 그대로다.
//   - 실패 조건: 같은 (메서드, 경로)가 두 컨트롤러에 있음(10월 RecipientController·PublicLinksController가 남음), 옛 경로가 404가 아닌 응답을 함.
// 인증 예외 (NFR1.1, 보안 점검)
//   - 기대: @Public()은 받은 사람 세 메서드에만 붙고 클래스에는 없다. 같은 컨트롤러에 더해질 미지정 메서드는 회원 인증 예외를 상속하지 않는다.
//           받은 사람 세 경로는 회원 토큰 없이 Guard를 통과하고, 작성자 경로(/v1/publications..., PDF 사본 열람 포함)는 회원 토큰 없이 401이다.
//   - 실패 조건: 클래스 단위 @Public(), 미지정 경로가 인증 없이 통과.
// 모듈 구성 (R-01·R-02, OQ-U4-3)
//   - 기대: AppModule 모듈 목록에 ShareLinksModule·RecipientModule이 없고 PublicationsModule이 한 번 등록된다. grant 키·web 주소 설정·unlock 정책·제어
//           (UNLOCK_POLICY·UNLOCK_CONTROLS)·발행 빈도 제한기·PUBLICATIONS_CLOCK은 PublicationsModule에만 선언돼 제한기 싱글턴이 하나다
//           (publications-module.test.cjs가 공급자·기동 검사를 본다). PublicationsModule은 share-links.service.ts·ShareLinksModule을 import하지 않고
//           OwnerProfileReaderModule을 import한다. share_link 표·share-link.entity.ts·member-analysis의 createShareLink·idempotent-creation.ts는 남는다.
//   - 실패 조건: 두 모듈이 함께 등록된 판본, 제한기 두 벌 또는 없음, PublicationsModule이 ShareLinksModule을 import, 공용 표·엔티티가 지워짐.
// 운영 기동 검사 유지 (R-01 확인 항목, #218)
//   - 기대: 운영 설정에서 LINK_GRANT_SECRET·SHARE_LINK_WEB_BASE_URL 검사가 ShareLinksModule을 뺀 뒤에도 남는다(publications-module.test.cjs의
//           "운영 설정에서 ... 기동이 멈춘다"가 PublicationsModule만 띄워 확인한다). 환경변수 이름은 그대로다.
//   - 실패 조건: ShareLinksModule 제거로 기동 검사가 사라짐, 환경변수 이름 변경.
//
// 실제 AppModule을 테스트 DB로 띄운다(HTTP는 인증 예외 확인에만 보낸다). 비밀값은 합성이다.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { existsSync, readdirSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { after, before, test } = require('node:test');
const { AppModule } = require('../../dist/app.module');
const { PUBLIC_ROUTE } = require('../../dist/auth/auth.decorators');
const { PublicationsController } = require('../../dist/publications/publications.controller');
const { PublicationsModule } = require('../../dist/publications/publications.module');
const { RecipientAccessService } = require('../../dist/publications/recipient-access.service');
const { RecipientLinksController } = require('../../dist/publications/recipient-links.controller');
const { UNLOCK_CONTROLS, UNLOCK_POLICY } = require('../../dist/share-links/unlock-policy');
const { openTestDataSource } = require('../support/test-database.cjs');
const { PUBLISH_SETTINGS, setEnv, startApp, expectError } = require('./support.cjs');

const SRC = join(__dirname, '..', '..', 'src');
let server, db, restore;
before(async () => {
  restore = setEnv(PUBLISH_SETTINGS);
  server = await startApp(AppModule);
  db = await openTestDataSource();
});
after(async () => {
  await server?.app.close();
  await db?.destroy();
  restore?.();
});

/** Express에 등록된 (메서드, 경로) 쌍. */
function registeredRoutes(app) {
  const instance = app.getHttpAdapter().getInstance();
  const stack = instance.router?.stack ?? instance._router?.stack ?? [];
  return stack.filter((layer) => layer.route).flatMap((layer) =>
    Object.keys(layer.route.methods).filter((method) => layer.route.methods[method]).map((method) => `${method.toUpperCase()} ${layer.route.path}`));
}
const moduleNames = (module, key) => (Reflect.getMetadata(key, module) ?? []).map((entry) => entry.name ?? String(entry));

test('등록된 (메서드, 경로)에 중복이 없고, 받은 사람 세 경로(열람·unlock·PDF 사본)는 PublicationsModule의 RecipientLinksController 하나에만 있으며, 10월 Catch 상세·발급·목록·중지 경로는 없다', async () => {
  const routes = registeredRoutes(server.app);
  assert.ok(routes.length > 0, '경로를 읽었다');
  assert.deepEqual(routes.filter((route, index) => routes.indexOf(route) !== index), [], '중복 없음');
  for (const route of ['GET /v1/public/links/:token', 'POST /v1/public/links/:token/unlock', 'GET /v1/public/links/:token/items/:publishedItemId/pdf',
    'GET /v1/publications/:publicationId/items/:publishedItemId/pdf', 'POST /v1/publications', 'GET /v1/publications',
    'GET /v1/publications/:publicationId', 'PUT /v1/publications/:publicationId/stop', 'DELETE /v1/publications/:publicationId',
    'GET /v1/catches/:catchId/description', 'GET /v1/text-materials']) {
    assert.ok(routes.includes(route), route);
  }
  for (const route of routes) {
    assert.ok(!route.includes('/public/links/:token/catches'), `10월 Catch 상세 경로 없음: ${route}`);
    assert.ok(!route.includes('/share-links'), `10월 발급·목록·중지 경로 없음: ${route}`);
  }
  // 받은 사람 경로를 선언한 컨트롤러는 PublicationsModule의 RecipientLinksController뿐이다(10월 두 컨트롤러 파일은 없다).
  const controllers = moduleNames(PublicationsModule, 'controllers');
  assert.deepEqual(controllers.sort(), ['PublicationsController', 'RecipientLinksController']);
  assert.equal(Reflect.getMetadata('path', RecipientLinksController), 'public/links');
  assert.notEqual(Reflect.getMetadata('path', PublicationsController), 'public/links');
  for (const file of ['share-links/public-links.controller.ts', 'share-links/share-links.controller.ts', 'recipient/recipient.controller.ts']) {
    assert.equal(existsSync(join(SRC, file)), false, `${file}은 지웠다`);
  }
  const prototypeRoutes = Object.getOwnPropertyNames(RecipientLinksController.prototype).filter((name) => name !== 'constructor')
    .map((name) => [Reflect.getMetadata('method', RecipientLinksController.prototype[name]), Reflect.getMetadata('path', RecipientLinksController.prototype[name])]);
  // U8 계획 9.1(C-12 더하는 변경)로 PDF 사본 열람 GET 하나가 더해져 세 메서드다.
  assert.deepEqual(prototypeRoutes.sort(), [[0, ':token'], [1, ':token/unlock'], [0, ':token/items/:publishedItemId/pdf']].sort(),
    'GET :token, POST :token/unlock, GET :token/items/:publishedItemId/pdf 세 메서드만');

  // 옛 경로는 Nest 밖 404(RESOURCE_UNAVAILABLE)이고 링크 판정(LINK_UNAVAILABLE)에 닿지 않는다.
  const token = 'A'.repeat(43);
  expectError(await server.call('GET', `/public/links/${token}/catches/00000000-0000-4000-8000-000000000000`), 404, 'RESOURCE_UNAVAILABLE');
  expectError(await server.call('POST', '/share-links', { body: { title: 'x' } }), 404, 'RESOURCE_UNAVAILABLE');
  expectError(await server.call('GET', '/share-links'), 404, 'RESOURCE_UNAVAILABLE');
  expectError(await server.call('PUT', '/share-links/00000000-0000-4000-8000-000000000000/stop'), 404, 'RESOURCE_UNAVAILABLE');
});

test('@Public()은 받은 사람 세 메서드(열람·unlock·PDF 사본)에만 붙고 클래스에는 없으며, 미지정 메서드는 예외를 상속하지 않고, 작성자 경로는 회원 토큰 없이 401이다', async () => {
  assert.equal(Reflect.getMetadata(PUBLIC_ROUTE, RecipientLinksController), undefined, '클래스 단위 @Public() 없음');
  assert.equal(Reflect.getMetadata(PUBLIC_ROUTE, RecipientLinksController.prototype.read), true);
  assert.equal(Reflect.getMetadata(PUBLIC_ROUTE, RecipientLinksController.prototype.unlock), true);
  assert.equal(Reflect.getMetadata(PUBLIC_ROUTE, RecipientLinksController.prototype.pdf), true, 'PDF 사본 열람(U8 계획 9.1)도 받은 사람 경로다');
  class Extended extends RecipientLinksController {
    extra() { return 'synthetic'; }
  }
  assert.equal(Reflect.getMetadata(PUBLIC_ROUTE, Extended.prototype.extra), undefined, '더해진 메서드는 예외를 상속하지 않는다');
  for (const name of Object.getOwnPropertyNames(PublicationsController.prototype).filter((name) => name !== 'constructor')) {
    assert.equal(Reflect.getMetadata(PUBLIC_ROUTE, PublicationsController.prototype[name]), undefined, `작성자 경로 ${name}에 @Public() 없음`);
  }
  // 받은 사람 경로는 회원 토큰 없이 Guard를 지나 링크 판정까지 간다(없는 토큰이라 404). 작성자 경로는 401.
  expectError(await server.call('GET', `/public/links/${'B'.repeat(43)}`), 404, 'LINK_UNAVAILABLE');
  expectError(await server.call('POST', `/public/links/${'B'.repeat(43)}/unlock`, { body: { password: 'synthetic' } }), 404, 'LINK_UNAVAILABLE');
  expectError(await server.call('GET', `/public/links/${'B'.repeat(43)}/items/00000000-0000-4000-8000-000000000000/pdf`), 404, 'LINK_UNAVAILABLE');
  expectError(await server.call('GET', '/publications'), 401, 'AUTH_REQUIRED');
  expectError(await server.call('POST', '/publications', { body: {} }), 401, 'AUTH_REQUIRED');
  expectError(await server.call('GET', '/publications/00000000-0000-4000-8000-000000000000/items/00000000-0000-4000-8000-000000000000/pdf'), 401, 'AUTH_REQUIRED');
});

test('AppModule에 ShareLinksModule·RecipientModule이 없고 PublicationsModule이 한 번 등록되며, unlock 제어는 PublicationsModule에만 하나고 받은 사람 서비스가 그것을 쓴다', () => {
  const imports = moduleNames(AppModule, 'imports');
  assert.equal(imports.filter((name) => name === 'PublicationsModule').length, 1);
  assert.ok(!imports.includes('ShareLinksModule') && !imports.includes('RecipientModule'), imports.join(','));
  for (const file of ['share-links/share-links.module.ts', 'share-links/share-links.service.ts', 'share-links/link-access.service.ts', 'recipient/recipient.module.ts']) {
    assert.equal(existsSync(join(SRC, file)), false, `${file}은 지웠다`);
  }
  for (const kept of ['share-links/share-link.entity.ts', 'share-links/link-token.ts', 'share-links/link-grant.ts', 'share-links/link-password.ts',
    'share-links/unlock-policy.ts', 'share-links/client-address.ts', 'share-links/share-links.config.ts', 'member-analysis/idempotent-creation.ts']) {
    assert.equal(existsSync(join(SRC, kept)), true, `${kept}은 남긴다(OQ-U4-3)`);
  }
  const scope = server.app.select(PublicationsModule);
  const controls = scope.get(UNLOCK_CONTROLS, { strict: true });
  assert.ok(scope.get(UNLOCK_POLICY, { strict: true }));
  assert.equal(server.app.get(UNLOCK_CONTROLS, { strict: false }), controls, '앱 전체에서 비엄격으로 찾아도 같은 인스턴스(두 벌 아님)');
  assert.equal(server.app.get(RecipientAccessService).controls, controls, '받은 사람 unlock이 그 제한기를 쓴다');
  const moduleSource = readFileSync(join(SRC, 'publications', 'publications.module.ts'), 'utf8');
  assert.ok(moduleSource.includes("from '../member-profile/owner-profile-reader.module'"));
  const forbidden = ['share-links.module', 'share-links.service', 'link-access.service', '/recipient/'];
  for (const name of readdirSync(join(SRC, 'publications')).filter((name) => name.endsWith('.ts'))) {
    const code = readFileSync(join(SRC, 'publications', name), 'utf8');
    for (const target of [...code.matchAll(/from '([^']+)'/g)].map((match) => match[1])) {
      assert.ok(!forbidden.some((bad) => target.includes(bad)), `${name}: ${target}`);
    }
  }
});

test('share_link 표는 OQ-U4-3 결정 전까지 남는다(테스트 DB 마이그레이션 기준)', async () => {
  const [{ name }] = await db.query("SELECT to_regclass('share_link')::text AS name");
  assert.equal(name, 'share_link');
});

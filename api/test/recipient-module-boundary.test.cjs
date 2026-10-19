require('reflect-metadata');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { MODULE_METADATA } = require('@nestjs/common/constants');
const { Reflector } = require('@nestjs/core');
const { AccessTokenGuard } = require('../dist/auth/access-token.guard');
const { PUBLIC_ROUTE } = require('../dist/auth/auth.decorators');
const { AppModule } = require('../dist/app.module');
const { PublicCatchStore } = require('../dist/catches/public-catch-store');
const { OwnerProfileReader } = require('../dist/member-profile/owner-profile-reader');
const { OwnerProfileReaderModule } = require('../dist/member-profile/owner-profile-reader.module');
const { RecipientController } = require('../dist/recipient/recipient.controller');
const { RecipientModule } = require('../dist/recipient/recipient.module');
const { RecipientService } = require('../dist/recipient/recipient.service');
const { LinkAccessService } = require('../dist/share-links/link-access.service');
const { ShareLinksModule } = require('../dist/share-links/share-links.module');

// #151 수신자 조회의 회원 인증 예외 범위와 제품 앱 조립 경계를 DB 없이 확인한다(모듈 메타데이터 구조 검사).
// 제품 앱의 실제 HTTP 응답은 test/recipient/recipient-app.test.cjs가 확인한다.
const guard = new AccessTokenGuard(new Reflector(), {
  verify() { assert.fail('회원 토큰 없는 요청에서 토큰 검증을 호출하면 안 된다'); },
});
const context = (handler) => ({
  getHandler: () => handler,
  getClass: () => RecipientController,
  switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
});

test('수신자 목록·상세는 회원 토큰 없이 Guard를 통과하고, 예외는 메서드에만 붙어 있다', async () => {
  for (const handler of [RecipientController.prototype.collection, RecipientController.prototype.catch]) {
    assert.equal(await guard.canActivate(context(handler)), true);
    assert.equal(Reflect.getMetadata(PUBLIC_ROUTE, handler), true);
  }
  assert.equal(Reflect.getMetadata(PUBLIC_ROUTE, RecipientController), undefined);
  await assert.rejects(guard.canActivate(context(function futureRoute() {})), { code: 'AUTH_REQUIRED' });
});

test('수신자 모듈은 실제 A 공급 함수·#150 판정·B 조회만 조립하고 시험 대역을 받는 조립 경로가 없다', () => {
  assert.equal(typeof RecipientModule.register, 'undefined', '공급자를 주입받는 동적 조립을 두지 않는다');
  assert.deepEqual(Reflect.getMetadata(MODULE_METADATA.IMPORTS, RecipientModule).map((m) => m.name).sort(),
    ['CatchesModule', 'OwnerProfileReaderModule', 'ShareLinksModule']);
  assert.deepEqual(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, RecipientModule), [RecipientService]);
  assert.deepEqual(Reflect.getMetadata('design:paramtypes', RecipientService), [LinkAccessService, PublicCatchStore, OwnerProfileReader]);
  // 링크와 소유 회원을 같은 시점으로 판정하도록 #150 판정도 A 공급 함수를 받는다.
  assert.ok(Reflect.getMetadata(MODULE_METADATA.IMPORTS, ShareLinksModule).includes(OwnerProfileReaderModule));
  assert.ok(Reflect.getMetadata('design:paramtypes', LinkAccessService).includes(OwnerProfileReader));
});

test('구조 검사: AppModule이 수신자 모듈·컨트롤러를 한 번 등록한다', () => {
  const seen = new Set();
  const controllers = [];
  const modules = [];
  const visit = (entry) => {
    const module = entry && typeof entry === 'object' && 'module' in entry ? entry.module : entry;
    if (!module || seen.has(module)) return;
    seen.add(module);
    modules.push(module);
    controllers.push(...(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, module) ?? []), ...(entry.controllers ?? []));
    for (const child of [...(Reflect.getMetadata(MODULE_METADATA.IMPORTS, module) ?? []), ...(entry.imports ?? [])]) visit(child);
  };
  visit(AppModule);
  assert.ok(Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule).includes(RecipientModule));
  assert.equal(modules.filter((module) => module === RecipientModule).length, 1);
  assert.equal(controllers.filter((controller) => controller === RecipientController).length, 1);
});

require('reflect-metadata');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { MODULE_METADATA } = require('@nestjs/common/constants');
const { Reflector } = require('@nestjs/core');
const { AccessTokenGuard } = require('../dist/auth/access-token.guard');
const { PUBLIC_ROUTE } = require('../dist/auth/auth.decorators');
const { AppModule } = require('../dist/app.module');
const { RecipientController } = require('../dist/recipient/recipient.controller');
const { RecipientModule } = require('../dist/recipient/recipient.module');
const { PUBLIC_PROFILE_SOURCE } = require('../dist/recipient/public-profile-source');

// #151 수신자 조회의 회원 인증 예외 범위와 제품 앱 조립 경계를 DB 없이 확인한다.
// 제품 앱 경계는 모듈 메타데이터를 순회하는 구조 검사다. 제품 앱을 띄워 해당 경로의 HTTP 응답을 확인하지는 않는다.
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

test('수신자 모듈은 공개 프로필 공급자 없이 조립되지 않는다', () => {
  for (const options of [undefined, {}, { profileSource: null }, { profileSource: {} }, { profileSource: { read: 'x' } }]) {
    assert.throws(() => RecipientModule.register(options), /requires a public profile source/);
  }
  const source = { async read() { return { displayName: '', introduction: '', desiredRole: '', skills: [] }; } };
  const registered = RecipientModule.register({ profileSource: source });
  assert.equal(registered.providers.find((provider) => provider.provide === PUBLIC_PROFILE_SOURCE).useValue, source);
});

test('구조 검사: A의 공급자가 정해지기 전까지 AppModule의 모듈·컨트롤러 메타데이터에 수신자 모듈·컨트롤러가 없다', () => {
  const seen = new Set();
  const controllers = [];
  const visit = (entry) => {
    const module = entry && typeof entry === 'object' && 'module' in entry ? entry.module : entry;
    if (!module || seen.has(entry)) return;
    seen.add(entry);
    assert.notEqual(module, RecipientModule, '제품 앱이 수신자 모듈을 가져오면 안 된다');
    controllers.push(...(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, module) ?? []), ...(entry.controllers ?? []));
    for (const child of [...(Reflect.getMetadata(MODULE_METADATA.IMPORTS, module) ?? []), ...(entry.imports ?? [])]) visit(child);
  };
  visit(AppModule);
  assert.ok(controllers.length > 0);
  assert.ok(!controllers.includes(RecipientController));
});

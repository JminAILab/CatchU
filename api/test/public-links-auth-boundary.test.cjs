require('reflect-metadata');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Reflector } = require('@nestjs/core');
const { AccessTokenGuard } = require('../dist/auth/access-token.guard');
const { PublicLinksController } = require('../dist/share-links/public-links.controller');

// 실제 컨트롤러의 공개 범위를 실제 Guard로 확인한다. DB와 토큰 검증은 필요 없는 경로다.
const guard = new AccessTokenGuard(new Reflector(), {
  verify() { assert.fail('회원 토큰 없는 요청에서 토큰 검증을 호출하면 안 된다'); },
});
const context = (handler) => ({
  getHandler: () => handler,
  getClass: () => PublicLinksController,
  switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
});

test('unlock은 회원 토큰 없이 인증 Guard를 통과한다', async () => {
  assert.equal(await guard.canActivate(context(PublicLinksController.prototype.unlock)), true);
});

test('같은 컨트롤러에 추가될 미지정 메서드는 회원 인증 예외를 상속하지 않는다', async () => {
  await assert.rejects(guard.canActivate(context(function futureRoute() {})), {
    code: 'AUTH_REQUIRED',
  });
});

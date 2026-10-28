// U2 AiConsentGate·동의 API(계약 C-04, 기능 설계 W2·BR2.1~BR2.3, 시나리오 S5·S6, 비기능 NFR2.4).
// 실제 AppModule(공통 Guard·오류 필터)과 테스트 DB를 쓴다. 회원은 개발 로그인으로 만든 실제 세션이다.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { before, after, beforeEach, test } = require('node:test');
const { Controller, Module, Post } = require('@nestjs/common');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const { AppModule } = require('../../dist/app.module');
const { CurrentMemberId } = require('../../dist/auth/auth.decorators');
const { AI_NOTICE_VERSION, AiConsentGate, AiConsentRequired } = require('../../dist/ai-consent/ai-consent.gate');
const { AiConsentModule } = require('../../dist/ai-consent/ai-consent.module');
const { DailyRunLimit } = require('../../dist/daily-run-limit/daily-run-limit');
const { DailyRunLimitModule } = require('../../dist/daily-run-limit/daily-run-limit.module');
const { APP_SETTINGS, WEB_ORIGIN, setEnv, startApp, expectError } = require('./support.cjs');

// 소비 Unit 접수 순서를 흉내 내는 시험용 경로(제품 src에 두지 않는다): require → consume(NFR2.4).
class ProbeController {
  constructor(gate, runLimit) { this.gate = gate; this.runLimit = runLimit; }
  async accept(memberId) {
    await this.gate.require(memberId);
    return { decision: await this.runLimit.consume(memberId, 'JD_SUMMARY', new Date()) };
  }
}
Controller('__u2')(ProbeController);
Reflect.defineMetadata('design:paramtypes', [AiConsentGate, DailyRunLimit], ProbeController);
CurrentMemberId()(ProbeController.prototype, 'accept', 0);
Post('accept')(ProbeController.prototype, 'accept', Object.getOwnPropertyDescriptor(ProbeController.prototype, 'accept'));
class ProbeModule {}
Module({ imports: [AppModule, AiConsentModule, DailyRunLimitModule], controllers: [ProbeController] })(ProbeModule);

let server, db, restore;
before(async () => {
  restore = setEnv(APP_SETTINGS);
  server = await startApp(ProbeModule);
  db = await openTestDataSource();
});
after(async () => { await server?.app.close(); await db?.destroy(); restore?.(); });
beforeEach(async () => { await resetTestDatabase(db); });

const consentRows = (memberId) => db.query('SELECT notice_version FROM ai_consent WHERE member_id = $1 ORDER BY notice_version', [memberId]);
const runCount = async (memberId) => (await db.query('SELECT coalesce(sum(count), 0)::int AS n FROM daily_execution_count WHERE member_id = $1', [memberId]))[0].n;
const consent = (token, body = { noticeVersion: AI_NOTICE_VERSION }, origin = WEB_ORIGIN) => server.call('POST', '/ai-consent', { token, body, origin });

test('S5 동의 없는 회원의 실행 접수는 403 AI_CONSENT_REQUIRED이고 하루 횟수를 쓰지 않는다', async () => {
  const member = await server.login();
  assert.deepEqual((await server.call('GET', '/ai-consent', { token: member.token })).body, { consented: false, noticeVersion: AI_NOTICE_VERSION });
  const response = await server.call('POST', '/__u2/accept', { token: member.token });
  expectError(response, 403, 'AI_CONSENT_REQUIRED');
  assert.deepEqual(Object.keys(response.body).sort(), ['code', 'message']);
  assert.equal(await runCount(member.memberId), 0);
  await assert.rejects(new AiConsentGate(db).require(member.memberId), (error) => error instanceof AiConsentRequired && error.getStatus() === 403);
});

test('현재 판본으로 동의하면 204로 기록되고, 그 뒤 접수는 동의를 통과해 하루 횟수를 쓴다', async () => {
  const member = await server.login();
  const response = await consent(member.token);
  assert.equal(response.status, 204, response.text);
  assert.equal(response.text, '');
  assert.deepEqual(await consentRows(member.memberId), [{ notice_version: AI_NOTICE_VERSION }]);
  assert.deepEqual((await server.call('GET', '/ai-consent', { token: member.token })).body, { consented: true, noticeVersion: AI_NOTICE_VERSION });
  const accepted = await server.call('POST', '/__u2/accept', { token: member.token });
  assert.equal(accepted.status, 201, accepted.text);
  assert.deepEqual(accepted.body, { decision: 'ALLOWED' });
  assert.equal(await runCount(member.memberId), 1);
  // 다른 회원은 그 동의로 통과하지 않는다.
  const other = await server.login();
  expectError(await server.call('POST', '/__u2/accept', { token: other.token }), 403, 'AI_CONSENT_REQUIRED');
});

test('같은 판본을 다시 보내도 204이고 행은 하나다', async () => {
  const member = await server.login();
  assert.equal((await consent(member.token)).status, 204);
  assert.equal((await consent(member.token)).status, 204);
  assert.equal((await consentRows(member.memberId)).length, 1);
});

test('S6 옛 판본·잘못된 본문은 400 VALIDATION_FAILED이고 기록하지 않는다', async () => {
  const member = await server.login();
  const old = await consent(member.token, { noticeVersion: '2026-10-v0' });
  expectError(old, 400, 'VALIDATION_FAILED');
  assert.deepEqual(old.body.details, { violations: [{ field: 'noticeVersion', reason: 'currentNoticeVersion' }] });
  for (const body of [{}, { noticeVersion: 1 }, { noticeVersion: AI_NOTICE_VERSION, memberId: member.memberId }, [AI_NOTICE_VERSION]]) {
    expectError(await consent(member.token, body), 400, 'VALIDATION_FAILED');
  }
  expectError(await server.call('POST', `/ai-consent?memberId=${member.memberId}`, { token: member.token, body: { noticeVersion: AI_NOTICE_VERSION }, origin: WEB_ORIGIN }),
    400, 'VALIDATION_FAILED');
  assert.deepEqual(await consentRows(member.memberId), []);
});

test('인증 없음은 401, 허용 출처가 아닌 동의 기록은 403 AUTH_ORIGIN_FORBIDDEN이며 기록하지 않는다', async () => {
  expectError(await server.call('GET', '/ai-consent'), 401, 'AUTH_REQUIRED');
  expectError(await server.call('POST', '/ai-consent', { body: { noticeVersion: AI_NOTICE_VERSION }, origin: WEB_ORIGIN }), 401, 'AUTH_REQUIRED');
  expectError(await server.call('POST', '/__u2/accept', { token: 'not-a-jwt' }), 401, 'AUTH_INVALID');
  const member = await server.login();
  expectError(await consent(member.token, { noticeVersion: AI_NOTICE_VERSION }, 'https://evil.example'), 403, 'AUTH_ORIGIN_FORBIDDEN');
  expectError(await consent(member.token, { noticeVersion: AI_NOTICE_VERSION }, null), 403, 'AUTH_ORIGIN_FORBIDDEN');
  assert.deepEqual(await consentRows(member.memberId), []);
});

test('판본을 올리면 옛 판본 동의만 있는 회원은 다시 동의해야 한다', async () => {
  const member = await server.login();
  const gate = new AiConsentGate(db);
  await db.query("INSERT INTO ai_consent (consent_id, member_id, notice_version, consented_at) VALUES (gen_random_uuid(), $1, '2026-10-v0', now())",
    [member.memberId]);
  assert.equal(await gate.hasConsented(member.memberId), false, '옛 판본 동의는 현재 판본 동의가 아니다(BR2.1)');
  expectError(await server.call('POST', '/__u2/accept', { token: member.token }), 403, 'AI_CONSENT_REQUIRED');
  await gate.record(member.memberId, AI_NOTICE_VERSION, new Date());
  assert.equal(await gate.hasConsented(member.memberId), true);
  assert.deepEqual(await consentRows(member.memberId), [{ notice_version: '2026-10-v0' }, { notice_version: AI_NOTICE_VERSION }]);
});

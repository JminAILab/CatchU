require('reflect-metadata');
// #139: #138의 실제 접수 API가 DB에 저장한 요청·동의·시도를 개발용 주입(DevAnalysisInjection)과 수신 처리에 연결한다.
// 요청·동의·시도는 직접 넣지 않고 실제 HTTP 접수(POST /v1/analysis-requests)로 만든다. #103 공용 합성 세트
// (worker/fixtures/m1-synthetic)의 사례 목록을 그대로 따른다. worker·큐·GitHub는 연결하지 않으며 보호 관측은
// 명시적 합성 대역이다. 시험용 조립(주입 컨트롤러·관측 대역)은 이 파일 안에서만 만들고 제품 AppModule에 등록하지 않는다.
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { after, before, beforeEach, test } = require('node:test');
const { Body, Controller, Inject, Module, Param, Post } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { decodeJwt } = require('jose');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const { CONTRACT_DIR } = require('../helpers/receiver-harness.cjs');
const { AppModule } = require('../../dist/app.module');
const { configureApp } = require('../../dist/app.setup');
const { CurrentMemberId } = require('../../dist/auth/auth.decorators');
const { AnalysisReceiverModule } = require('../../dist/analysis-receiver/analysis-receiver.module');
const { DevAnalysisInjection } = require('../../dist/analysis-receiver/dev-analysis-injection');
const { SYNTHETIC_REPOSITORY } = require('../../dist/member-analysis/dev-member.service');

const FIXTURES = resolve(__dirname, '../../../worker/fixtures/m1-synthetic');
const read = file => JSON.parse(readFileSync(resolve(FIXTURES, file), 'utf8'));
const manifest = read('cases.json');

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

// 보호 관측은 실제 GitHub 조회가 아니라 접수 맥락에서 만든 합성 대역이다.
const observations = { observe: async context => ({
  ownerId: context.memberId, repositoryId: context.repositoryId,
  githubRepository: { owner: 'synthetic-owner', name: 'synthetic-repo' },
  confirmedSourceState: { synthetic: true, visibility: 'PUBLIC' },
  observationProvenance: { synthetic: true, provider: 'test' },
  observedAt: new Date(), appliedRestriction: 'NONE' }) };

let db;
before(async () => { db = await openTestDataSource(); });
after(async () => { await db?.destroy(); });
beforeEach(async () => { await resetTestDatabase(db); });

async function start(t, { injection = true } = {}) {
  const settings = { NODE_ENV: 'test', DEV_LOGIN_ENABLED: 'true',
    DEV_ANALYSIS_INJECTION_ENABLED: injection ? 'true' : undefined,
    AUTH_JWT_SECRET: randomBytes(32).toString('hex'), AUTH_ACCESS_TOKEN_TTL_SECONDS: '900',
    AUTH_WEB_ORIGIN: 'https://catchu.example', SHARE_LINK_WEB_BASE_URL: 'https://catchu.example',
    LINK_GRANT_SECRET: randomBytes(32).toString('hex') };
  const previous = Object.fromEntries(Object.keys(settings).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(settings)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  const logs = [];
  const logger = Object.fromEntries(['log', 'error', 'warn', 'debug', 'verbose', 'fatal'].map(level =>
    [level, (...args) => logs.push(args.map(String).join(' '))]));
  let app;
  t.after(async () => {
    try { await app?.close(); } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    }
  });
  class TestModule {}
  Module({ imports: [AppModule, AnalysisReceiverModule.registerDatabase({ contractDirectory: CONTRACT_DIR, observations })],
    controllers: [InjectionProbe] })(TestModule);
  app = await configureApp(await NestFactory.create(TestModule, { logger, abortOnError: false }));
  await app.listen(0, '127.0.0.1');
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
  // 실제 고지·선정 저장소 API의 응답으로 동의를 만들고 실제 접수 API를 호출한다.
  const submit = async (user, key = randomUUID()) => {
    const notice = await (await call('/v1/analysis-notice', { headers: auth(user) })).json();
    const repositories = await (await call('/v1/me/repositories', { headers: auth(user) })).json();
    const repository = repositories.items.find(item => item.repositoryId === SYNTHETIC_REPOSITORY.repositoryId);
    assert.ok(repository, '합성 저장소가 선정 저장소 API에 있어야 한다');
    const body = { repositoryId: repository.repositoryId,
      consent: { accepted: true, noticeRevision: notice.noticeRevision, scopeRevision: repository.allowedScopeRevision } };
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
  return { app, logs, login, submit, status, inject, call };
}

async function counts() {
  const [row] = await db.query(`SELECT (SELECT count(*)::int FROM analysis_request) requests,
    (SELECT count(*)::int FROM analysis_consent) consents, (SELECT count(*)::int FROM analysis_attempt) attempts,
    (SELECT count(*)::int FROM result_application_record) receipts, (SELECT count(*)::int FROM catch_asset) catches,
    (SELECT count(*)::int FROM candidate_registration) registrations`);
  return row;
}
const attemptOf = requestId => db.query(`SELECT a.* FROM analysis_attempt a JOIN analysis_request r
  ON r.current_attempt_id = a.attempt_id WHERE r.request_id = $1`, [requestId]).then(rows => rows[0]);
const requestOf = requestId => db.query('SELECT * FROM analysis_request WHERE request_id = $1', [requestId]).then(rows => rows[0]);
function patch(input, operations) {
  for (const operation of operations) {
    const segments = operation.path.split('/').slice(1).map(part => part.replaceAll('~1', '/').replaceAll('~0', '~'));
    const key = segments.pop();
    const parent = segments.reduce((node, part) => node[part], input);
    if (operation.op === 'remove') delete parent[key];
    else if (operation.op === 'replace') parent[key] = operation.value;
    else throw new Error('Unsupported fixture patch');
  }
  return input;
}
/** 실제 접수로 요청을 만들고 접수 맥락을 API 응답·DB에서 읽는다. */
async function accepted(s, label) {
  const user = await s.login('intake-receiver-' + label);
  const intake = await s.submit(user);
  assert.equal(intake.status.processing, 'QUEUED');
  assert.equal(intake.status.lifecycle, 'ACTIVE');
  assert.equal(intake.status.application, 'NOT_READY');
  return { user, intake, requestId: intake.status.requestId, attemptId: intake.status.attemptId };
}

test('실제 접수 API가 저장한 요청·동의·시도 맥락으로 합성 결과를 채워 주입하면 수신 기록이 그 맥락에 남는다', async t => {
  const s = await start(t);
  const { user, intake, requestId, attemptId } = await accepted(s, 'context');
  const before = await counts();
  assert.deepEqual([before.requests, before.consents, before.attempts, before.receipts, before.catches], [1, 1, 1, 0, 0]);
  const entry = manifest.cases.find(c => c.caseId === 'succeeded-one-candidate');
  const response = await s.inject(user, requestId, 'Result', read(entry.messages[0].file), entry.caseId);
  assert.equal(response.status, 201, response.text);
  assert.equal(response.body.receipt.disposition, 'ACCEPTED');
  assert.equal(response.body.receipt.code, 'OK');
  assert.equal(response.body.receipt.requestId, requestId);
  assert.equal(response.body.receipt.attemptId, attemptId);
  // 수신 기록은 접수 응답·접수 요청 본문의 값과 같은 요청·시도·동의에 남는다.
  const [record] = await db.query('SELECT * FROM result_application_record');
  assert.equal(record.request_id, requestId);
  assert.equal(record.attempt_id, attemptId);
  assert.equal(record.result_id, response.body.receipt.resultId);
  const [consent] = await db.query('SELECT * FROM analysis_consent WHERE consent_id = $1', [intake.status.consentId]);
  assert.equal(consent.request_id, requestId);
  assert.equal(consent.scope_revision, intake.body.consent.scopeRevision);
  assert.equal(consent.notice_revision, intake.body.consent.noticeRevision);
  assert.equal(consent.repository_id, intake.body.repositoryId);
  assert.equal(consent.member_id, user.memberId);
  // 접수 API 재조회에서 같은 요청의 반영 완료 상태가 보인다. 수신 확인이 아니라 반영 결과다.
  const after = await s.status(user, intake);
  assert.equal(after.requestId, requestId);
  assert.equal(after.attemptId, attemptId);
  assert.equal(after.processing, 'SUCCEEDED');
  assert.equal(after.application, 'APPLIED');
  assert.equal(after.lifecycle, 'CLOSED');
  assert.equal(after.sourceMode, 'MOCK');
  assert.equal(after.registeredCatchIds.length, 1);
  assert.equal(after.ownerResultsReady, true);
  const [catchRow] = await db.query('SELECT * FROM catch_asset');
  assert.equal(catchRow.catch_id, after.registeredCatchIds[0]);
  assert.equal(catchRow.owner_id, user.memberId);
  assert.equal(catchRow.source_request_id, requestId);
  assert.equal(catchRow.source_mode, 'MOCK');
  assert.equal(catchRow.visibility, 'PRIVATE');
});

for (const entry of manifest.cases) {
  test(`#103 ${entry.caseId}: 실제 접수 → 개발 주입 → DB 수신 → 접수 API 상태`, async t => {
    const s = await start(t);
    let current = await accepted(s, entry.caseId);
    for (const [index, message] of entry.messages.entries()) {
      if (entry.delivery === 'SEPARATE_REQUESTS' && index > 0) current = await accepted(s, `${entry.caseId}-${index}`);
      const { user, intake, requestId, attemptId } = current;
      const before = await counts();
      const response = await s.inject(user, requestId, message.schema, read(message.file), entry.caseId);
      assert.equal(response.status, 201, response.text);
      const expected = message.expected;
      if (message.schema === 'ProcessingEvent') {
        // 진행 이벤트는 수신 확인을 만들지 않고 수신 기록을 늘리지 않는다.
        assert.equal(response.body, 'OBSERVED');
        assert.equal((await counts()).receipts, 0);
      } else if (expected.receipt === null) {
        assert.deepEqual(response.body, { receipt: null });
        assert.deepEqual(await counts(), before, '식별 불가 메시지는 아무것도 저장하지 않는다');
      } else {
        assert.equal(response.body.receipt.disposition, expected.receipt.disposition);
        assert.equal(response.body.receipt.code, expected.receipt.code);
        assert.equal(response.body.receipt.requestId, requestId);
        assert.equal(response.body.receipt.attemptId, attemptId);
      }
      const after = await s.status(user, intake);
      assert.equal(after.processing, expected.processingAfter);
      assert.equal(after.registeredCatchIds.length, expected.catchesAfter);
      assert.equal((await counts()).catches, expected.catchesAfter);
      const attempt = await attemptOf(requestId);
      assert.equal(attempt.processing, expected.processingAfter);
      if (message.schema === 'Result' && expected.receipt?.disposition === 'ACCEPTED') {
        assert.equal(after.application, 'APPLIED');
        assert.equal(after.lifecycle, 'CLOSED');
        assert.equal(after.ownerResultsReady, expected.catchesAfter > 0);
      }
      if (expected.receipt?.disposition === 'DUPLICATE') {
        assert.equal(response.body.application, undefined, '재전달은 새 반영을 만들지 않는다');
        assert.equal((await counts()).receipts, 1);
      }
      if (expected.receipt?.disposition === 'REJECTED') {
        assert.equal((await counts()).receipts, 1, '거부는 기존 수신 기록을 덮어쓰거나 늘리지 않는다');
        assert.equal(after.application, 'APPLIED');
      }
    }
  });
}

for (const control of manifest.negativeControls) {
  test(`#103 음성 대조 ${control.id}: 실제 접수 요청에 주입해도 수신 기록·Catch를 만들지 않는다`, async t => {
    const s = await start(t);
    const { user, intake, requestId } = await accepted(s, control.id);
    const response = await s.inject(user, requestId, control.schema, patch(read(control.file), control.patch), control.id);
    assert.equal(response.status, 201, response.text);
    if (control.check.verdict === 'UNIDENTIFIABLE') assert.deepEqual(response.body, { receipt: null });
    else {
      assert.equal(response.body.receipt.disposition, 'REJECTED');
      assert.equal(response.body.receipt.code, 'SCHEMA_INVALID');
    }
    const after = await counts();
    assert.equal(after.receipts, 0);
    assert.equal(after.catches, 0);
    const current = await s.status(user, intake);
    assert.equal(current.processing, 'QUEUED');
    assert.equal(current.lifecycle, 'ACTIVE');
    assert.equal(current.application, 'NOT_READY');
  });
}

test('종결 결과보다 늦게 온 진행 이벤트는 종결 상태와 반영 결과를 되돌리지 않는다', async t => {
  const s = await start(t);
  const { user, intake, requestId } = await accepted(s, 'late-progress');
  const early = await s.inject(user, requestId, 'ProcessingEvent', read('events/running.json'), 'late-progress');
  assert.equal(early.body, 'OBSERVED');
  assert.equal((await attemptOf(requestId)).processing, 'RUNNING');
  const result = await s.inject(user, requestId, 'Result', read('results/succeeded-one-candidate.json'), 'late-progress');
  assert.equal(result.body.receipt.disposition, 'ACCEPTED');
  const settled = await s.status(user, intake);
  const attemptBefore = await attemptOf(requestId);
  const requestBefore = await requestOf(requestId);
  for (const file of ['events/running.json', 'events/uncertain.json']) {
    const late = await s.inject(user, requestId, 'ProcessingEvent', read(file), 'late-progress');
    assert.equal(late.status, 201, late.text);
    assert.equal(late.body, 'TERMINAL_UNCHANGED');
  }
  assert.deepEqual(await s.status(user, intake), settled);
  assert.deepEqual(await attemptOf(requestId), attemptBefore);
  assert.equal((await requestOf(requestId)).lifecycle, requestBefore.lifecycle);
  assert.equal((await counts()).receipts, 1);
  assert.equal((await counts()).catches, 1);
});

test('접수 맥락과 다른 메시지는 거부되고 기존 수신 기록·Catch를 덮어쓰지 않는다', async t => {
  const s = await start(t);
  const { user, intake, requestId } = await accepted(s, 'mismatch');
  const base = read('results/succeeded-one-candidate.json');
  // 접수된 요청에 정상 결과를 먼저 수신한다. 이후 어긋난 메시지가 이 기록을 바꾸지 못해야 한다.
  assert.equal((await s.inject(user, requestId, 'Result', base, 'mismatch')).body.receipt.disposition, 'ACCEPTED');
  const settled = await s.status(user, intake);
  const snapshot = await db.query('SELECT * FROM result_application_record');
  const catches = await db.query('SELECT * FROM catch_asset ORDER BY catch_id');
  // 다른 요청·회원 ID가 채워진 템플릿은 주입 단계에서 거부한다.
  for (const field of ['requestId', 'memberId']) {
    const template = { ...base, [field]: randomUUID() };
    assert.equal((await s.inject(user, requestId, 'Result', template, 'mismatch')).status, 403);
  }
  // 접수 맥락과 다른 시도·동의 판본·저장소·동의 ID는 수신 처리가 거부한다.
  for (const [label, changes, code] of [
    ['다른 시도', { attemptId: randomUUID() }, 'STALE_ATTEMPT'],
    ['다른 동의 판본', { scopeRevision: 'other-scope-revision' }, 'CONTEXT_MISMATCH'],
    ['다른 저장소', { repositoryId: 'other-repository' }, 'CONTEXT_MISMATCH'],
    ['다른 동의', { consentId: randomUUID() }, 'CONTEXT_MISMATCH'],
  ]) {
    const response = await s.inject(user, requestId, 'Result',
      { ...base, ...changes, resultId: 'mismatch-' + label, messageId: randomUUID() }, 'mismatch');
    assert.equal(response.status, 201, response.text);
    assert.equal(response.body.receipt.disposition, 'REJECTED', label);
    assert.equal(response.body.receipt.code, code, label);
  }
  // 같은 결과 ID의 다른 내용은 기존 기록을 유지하고 거부한다.
  const conflict = await s.inject(user, requestId, 'Result', read('results/same-id-different-content.json'), 'succeeded-one-candidate');
  assert.equal(conflict.body.receipt.disposition, 'REJECTED');
  assert.equal(conflict.body.receipt.code, 'PAYLOAD_CONFLICT');
  assert.deepEqual(await s.status(user, intake), settled);
  assert.deepEqual(await db.query('SELECT * FROM result_application_record'), snapshot);
  assert.deepEqual(await db.query('SELECT * FROM catch_asset ORDER BY catch_id'), catches);
});

test('본인이 아닌 회원·인증 없음·다른 요청 ID로는 주입하지 못하고 접수 상태를 바꾸지 않는다', async t => {
  const s = await start(t);
  const owner = await accepted(s, 'owner');
  const other = await s.login('intake-receiver-other');
  const template = read('results/succeeded-one-candidate.json');
  assert.equal((await s.inject(null, owner.requestId, 'Result', template)).status, 401);
  assert.equal((await s.inject(other, owner.requestId, 'Result', template)).status, 404);
  assert.equal((await s.inject(owner.user, randomUUID(), 'Result', template)).status, 404);
  assert.equal((await s.inject(owner.user, owner.requestId, 'Report', template)).status, 403);
  const current = await s.status(owner.user, owner.intake);
  assert.equal(current.processing, 'QUEUED');
  assert.deepEqual(await counts(), { requests: 1, consents: 1, attempts: 1, receipts: 0, catches: 0, registrations: 0 });
});

test('수신 메타데이터 저장에 실패하면 수신 성공으로 표시하지 않고 같은 메시지를 다시 수신할 수 있다', async t => {
  const s = await start(t);
  const { user, intake, requestId } = await accepted(s, 'storage');
  const template = read('results/succeeded-one-candidate.json');
  await db.query('ALTER TABLE result_application_record ADD CONSTRAINT test_receipt_fail CHECK (false) NOT VALID');
  let failed;
  try { failed = await s.inject(user, requestId, 'Result', template, 'storage'); }
  finally { await db.query('ALTER TABLE result_application_record DROP CONSTRAINT test_receipt_fail'); }
  assert.equal(failed.status, 500, failed.text);
  assert.equal(failed.body.code, 'INTERNAL_ERROR');
  assert.equal(failed.text.includes('test_receipt_fail'), false);
  assert.equal(failed.text.includes('receipt'), false);
  assert.deepEqual(await counts(), { requests: 1, consents: 1, attempts: 1, receipts: 0, catches: 0, registrations: 0 });
  const unchanged = await s.status(user, intake);
  assert.equal(unchanged.processing, 'QUEUED');
  assert.equal(unchanged.lifecycle, 'ACTIVE');
  assert.equal(unchanged.application, 'NOT_READY');
  // 실패한 전달은 수신으로 남지 않아, 제약을 풀면 같은 메시지가 새 결과로 수락된다.
  const retried = await s.inject(user, requestId, 'Result', template, 'storage');
  assert.equal(retried.body.receipt.disposition, 'ACCEPTED');
  assert.equal((await s.status(user, intake)).application, 'APPLIED');
  assert.equal((await counts()).receipts, 1);
});

test('개발 주입을 켜지 않으면 접수한 요청에도 주입하지 못하고, 제품 AppModule에는 주입 경로가 없다', async t => {
  const off = await start(t, { injection: false });
  const { user, intake, requestId } = await accepted(off, 'blocked');
  const before = await counts();
  const blocked = await off.inject(user, requestId, 'Result', read('results/succeeded-one-candidate.json'), 'blocked');
  assert.equal(blocked.status, 403);
  assert.deepEqual(await counts(), before);
  assert.equal((await off.status(user, intake)).processing, 'QUEUED');
  await off.app.close();

  // 시험용 조립을 뺀 제품 AppModule: 주입 제공자도, 주입·worker 수신 경로도 없다.
  process.env.DEV_ANALYSIS_INJECTION_ENABLED = 'true';
  const product = await configureApp(await NestFactory.create(AppModule,
    { logger: false, abortOnError: false }));
  t.after(async () => { await product.close(); });
  await product.listen(0, '127.0.0.1');
  assert.throws(() => product.get(DevAnalysisInjection, { strict: false }));
  const base = await product.getUrl();
  const token = (await (await fetch(base + '/v1/auth/dev-login', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId: 'intake-receiver-product' }) })).json()).accessToken;
  for (const path of [`/v1/__test/analysis-receiver/${requestId}`, `/v1/analysis-requests/${requestId}/results`,
    `/v1/worker/results`, `/v1/analysis-injection/${requestId}`]) {
    const response = await fetch(base + path, { method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 404, path);
  }
});

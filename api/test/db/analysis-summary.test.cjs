require('reflect-metadata');
// #428 홈용 본인 분석 접수 이력 유무(GET /v1/me/analysis-summary). 실제 Nest HTTP·인증 Guard·전용 PostgreSQL에서 처리 상태와 무관한 true,
// 이력 없음 false, 회원 경계, 선정 목록에 없는 저장소, 조회 실패 500, 인증 401, 쿼리 400을 확인하고, 모든 응답을 dev에 병합된
// 회원 API 계약(member-api.yaml·common.yaml)의 응답 코드·본문 스키마·no-store 헤더와 대조한다.
// 요청은 실제 접수 API(#138)로 만들고, 처리 상태와 선정 목록에 없는 저장소의 이력은 시험 DB에 합성으로 구성한다.
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { after, before, beforeEach, test } = require('node:test');
const { NestFactory } = require('@nestjs/core');
const { decodeJwt } = require('jose');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const YAML = require('yaml');
const { AppModule } = require('../../dist/app.module');
const { configureApp } = require('../../dist/app.setup');
const { SYNTHETIC_REPOSITORY } = require('../../dist/member-analysis/dev-member.service');
const { AnalysisAttempt, AnalysisConsent, AnalysisRequest } = require('../../dist/member-analysis/member-analysis.entity');
const { SYNTHETIC_NOTICE } = require('../../dist/analysis-intake/analysis-notice');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');

const CONTRACT = resolve(__dirname, '../../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design');
const contract = file => YAML.parse(readFileSync(resolve(CONTRACT, file), 'utf8'));
const common = contract('common.yaml');
const operation = contract('member-api.yaml').paths['/me/analysis-summary'].get;
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
// 회원 API의 `./common.yaml#` 참조를 공통 스키마와 같은 문서 안 참조로 바꿔 계약 스키마를 그대로 컴파일한다.
const compile = schema => ajv.compile({ ...JSON.parse(JSON.stringify(schema).replaceAll('./common.yaml#', '#')),
  components: common.components });
/** 계약이 이 경로에 적은 응답 코드별 본문 검사기. 오류 응답은 common.yaml의 Error400 등이 가리키는 Error 스키마다. */
const declared = Object.fromEntries(Object.entries(operation.responses).map(([code, response]) => {
  const definition = response.$ref ? common.components.responses[response.$ref.split('/').at(-1)] : response;
  return [code, compile(definition.content['application/json'].schema)];
}));
const NO_STORE = common.components.headers.NoStore.schema;
/** 응답 코드가 계약의 응답 목록에 있고, 본문이 그 코드의 스키마를, Cache-Control이 NoStore 헤더를 따르는지 본다. */
function assertContract(response) {
  const validate = declared[String(response.status)];
  assert.ok(validate, `계약에 없는 응답 코드 ${response.status}`);
  assert.ok(validate(response.body), JSON.stringify(validate.errors));
  assert.ok(NO_STORE.enum.includes(response.cache), `Cache-Control ${response.cache}`);
}
const TRUE = { hasAcceptedAnalysisRepository: true };
const FALSE = { hasAcceptedAnalysisRepository: false };

let db;
before(async () => { db = await openTestDataSource(); });
after(async () => { await db?.destroy(); });
beforeEach(async () => { await resetTestDatabase(db); });

const command = (changes = {}) => ({ repositoryId: SYNTHETIC_REPOSITORY.repositoryId,
  consent: { accepted: true, noticeRevision: SYNTHETIC_NOTICE.noticeRevision, scopeRevision: SYNTHETIC_NOTICE.scopeRevision },
  ...changes });

async function start(t) {
  const settings = { NODE_ENV: 'test', DEV_LOGIN_ENABLED: 'true', AUTH_JWT_SECRET: randomBytes(32).toString('hex'),
    AUTH_ACCESS_TOKEN_TTL_SECONDS: '900', AUTH_WEB_ORIGIN: 'https://catchu.example',
    SHARE_LINK_WEB_BASE_URL: 'https://catchu.example', LINK_GRANT_SECRET: randomBytes(32).toString('hex'),
    CORS_ALLOWED_ORIGINS: undefined };
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
  app = await configureApp(await NestFactory.create(AppModule, { logger, abortOnError: false }));
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  const call = (path, options = {}) => fetch(base + path, { ...options, signal: AbortSignal.timeout(10000) });
  const auth = user => (user ? { Authorization: 'Bearer ' + user.token } : {});
  const login = async id => {
    const response = await call('/v1/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: id }) });
    assert.equal(response.status, 200);
    const { accessToken } = await response.json();
    return { token: accessToken, memberId: decodeJwt(accessToken).sub };
  };
  const read = async (headers, path) => {
    const response = await call(path, { headers });
    return { status: response.status, cache: response.headers.get('cache-control'), body: await response.json() };
  };
  const get = (user, path) => read(auth(user), path);
  const summary = (user, search = '') => get(user, '/v1/me/analysis-summary' + search);
  const summaryWith = headers => read(headers, '/v1/me/analysis-summary');
  // 실제 접수 API(#138). 새 접수는 202다.
  const submit = async (user, changes = {}) => {
    const response = await call('/v1/analysis-requests', { method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(user), 'Idempotency-Key': randomUUID() },
      body: JSON.stringify(command(changes)) });
    return { status: response.status, body: await response.json() };
  };
  return { logs, login, get, summary, summaryWith, submit };
}

/** 시험 DB에 요청·동의·시도를 직접 넣는다. 현재 선정 목록에 없는 저장소의 지난 접수를 만들 때 쓴다. */
async function insertRequest(memberId, { repositoryId, submittedAt = new Date(), lifecycle = 'CLOSED', ...attempt }) {
  const [requestId, consentId, attemptId] = [randomUUID(), randomUUID(), randomUUID()];
  await db.transaction('READ COMMITTED', async manager => {
    await manager.insert(AnalysisRequest, { requestId, memberId, repositoryId, consentId, currentAttemptId: attemptId,
      submittedAt, updatedAt: submittedAt, lifecycle });
    await manager.insert(AnalysisConsent, { consentId, requestId, memberId, repositoryId, accepted: true,
      noticeRevision: SYNTHETIC_NOTICE.noticeRevision, scopeRevision: SYNTHETIC_NOTICE.scopeRevision,
      consentedScope: { synthetic: true }, consentedAt: submittedAt });
    await manager.insert(AnalysisAttempt, { attemptId, requestId, sourceMode: 'MOCK', ...attempt });
  });
  return requestId;
}
/** 현재 시도와 요청의 진행·종료 상태를 바꿔 합성 상태를 만든다. */
async function setState(requestId, { lifecycle, ...attempt }) {
  const [{ attemptId }] = await db.query('SELECT current_attempt_id AS "attemptId" FROM analysis_request WHERE request_id = $1', [requestId]);
  await db.manager.update(AnalysisAttempt, { attemptId }, attempt);
  await db.manager.update(AnalysisRequest, { requestId }, { lifecycle });
}
const TABLES = ['analysis_request', 'analysis_consent', 'analysis_attempt', 'idempotency_record'];
/** 접수 관련 표 전체를 행 순서와 무관하게 읽는다. 표 이름은 시험 안의 상수만 넣는다. */
const tables = () => Promise.all(TABLES.map(table =>
  db.query(`SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY to_jsonb(t)::text`).then(rows => [table, rows.map(r => r.row)])))
  .then(Object.fromEntries);
/** 표를 잠시 다른 이름으로 바꿔 조회 문장이 실패하게 한다. 표 이름은 시험 안의 상수만 넣는다. */
async function withHiddenTable(table, run) {
  await db.query(`ALTER TABLE ${table} RENAME TO ${table}_hidden_428`);
  try { return await run(); } finally { await db.query(`ALTER TABLE ${table}_hidden_428 RENAME TO ${table}`); }
}

const QUEUED = { processing: 'QUEUED', application: 'NOT_READY', eligibleCandidateCount: 0, ownerResultsReady: false, failures: [],
  failureConfirmationReference: null };
// 한 요청의 상태를 차례로 바꾼다. 회원당 진행 중 요청은 하나라 진행 중 상태를 먼저, 닫힌 상태를 뒤에 둔다.
const STATES = [
  ['대기', { ...QUEUED, lifecycle: 'ACTIVE' }],
  ['진행', { ...QUEUED, processing: 'RUNNING', lifecycle: 'ACTIVE' }],
  ['실행 불명', { ...QUEUED, processing: 'UNCERTAIN', lifecycle: 'ACTIVE' }],
  ['반영 대기', { ...QUEUED, processing: 'SUCCEEDED', application: 'PENDING', eligibleCandidateCount: 1, lifecycle: 'ACTIVE' }],
  ['정상 완료', { ...QUEUED, processing: 'SUCCEEDED', application: 'APPLIED', eligibleCandidateCount: 1, ownerResultsReady: true,
    lifecycle: 'CLOSED' }],
  ['정상 0건', { ...QUEUED, processing: 'EMPTY', application: 'APPLIED', lifecycle: 'CLOSED' }],
  ['부분 실패', { ...QUEUED, processing: 'PARTIAL_FAILED', application: 'APPLIED', eligibleCandidateCount: 1, ownerResultsReady: true,
    failures: [{ stage: 'ANALYSIS', code: 'SYNTHETIC_PARTIAL', message: '[합성] 일부 후보 분석 실패' }], lifecycle: 'CLOSED' }],
  ['반영 실패로 닫힘', { ...QUEUED, processing: 'SUCCEEDED', application: 'APPLY_FAILED', eligibleCandidateCount: 2, lifecycle: 'CLOSED' }],
  // 마지막은 재요청할 수 있는 확정 실패다. 이어서 실제 실패 재요청을 보낸다.
  ['실패(확정)', { ...QUEUED, processing: 'FAILED', application: 'APPLIED',
    failures: [{ stage: 'DISPATCH', code: 'SYNTHETIC_CONFIRMED_FAILURE', message: '[합성] 실행되지 않은 확정 실패' }],
    failureConfirmationReference: 'synthetic-confirmed-failure', lifecycle: 'CLOSED' }],
];

test('계약 읽기: 병합된 회원 API의 이 경로는 응답 200·400·401·500만 두고, 200 본문은 필수 boolean 하나다', () => {
  assert.deepEqual(Object.keys(operation.responses), ['200', '400', '401', '500']);
  assert.equal(operation.parameters, undefined);
  assert.equal(operation.requestBody, undefined);
  // 시험이 쓰는 검사기가 실제로 다른 모양을 거부하는지 먼저 본다.
  for (const [body, valid] of [[TRUE, true], [FALSE, true], [{}, false], [{ hasAcceptedAnalysisRepository: 'true' }, false],
    [{ hasAcceptedAnalysisRepository: null }, false], [{ ...TRUE, count: 1 }, false]]) {
    assert.equal(declared['200'](body), valid, JSON.stringify(body));
  }
  assert.equal(declared['500']({ code: 'INTERNAL_ERROR', message: '안내' }), true);
  assert.equal(declared['500']({ ...FALSE, code: 'INTERNAL_ERROR', message: '안내' }), false);
});

test('이력이 없으면 200 false이고, 본인 접수가 생기면 처리 상태와 실패 재요청에 관계없이 true다', async t => {
  const s = await start(t);
  const user = await s.login('summary-states');
  const empty = await s.summary(user);
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.body, FALSE);
  assertContract(empty);

  const created = await s.submit(user);
  assert.equal(created.status, 202);
  const { requestId } = created.body;
  for (const [label, state] of STATES) {
    await setState(requestId, state);
    const rows = await tables();
    const response = await s.summary(user);
    assert.equal(response.status, 200, label);
    assert.deepEqual(response.body, TRUE, label);
    assertContract(response);
    assert.deepEqual(await tables(), rows, `${label}: 조회는 요청·동의·시도를 바꾸지 않는다`);
  }
  // 확정 실패 뒤 실제 실패 재요청(#138). 원 요청은 닫힌 실패로 남고 새 요청이 진행 중이어도 true다.
  const retried = await s.submit(user, { retryOfRequestId: requestId });
  assert.equal(retried.status, 202, JSON.stringify(retried.body));
  const afterRetry = await s.summary(user);
  assert.deepEqual(afterRetry.body, TRUE);
  assertContract(afterRetry);
  // 이 값은 GET /v1/me 응답에 더하지 않는다(#428 제외 범위).
  const me = await s.get(user, '/v1/me');
  assert.equal(me.status, 200);
  assert.equal(Object.hasOwn(me.body, 'hasAcceptedAnalysisRepository'), false);
});

test('다른 회원의 요청은 세지 않는다: 다른 회원에게만 접수 이력이 있으면 false이고, 요청으로 회원을 고를 수 없다', async t => {
  const s = await start(t);
  const a = await s.login('summary-member-a');
  const b = await s.login('summary-member-b');
  assert.equal((await s.submit(b)).status, 202);
  await insertRequest(b.memberId, { repositoryId: 'synthetic-summary-other', submittedAt: new Date(Date.now() - 60_000),
    processing: 'EMPTY', application: 'APPLIED' });
  const onlyOther = await s.summary(a);
  assert.equal(onlyOther.status, 200);
  assert.deepEqual(onlyOther.body, FALSE);
  assertContract(onlyOther);
  assert.deepEqual((await s.summary(b)).body, TRUE);
  const chosen = await s.summary(a, '?memberId=' + b.memberId);
  assert.equal(chosen.status, 400);
  assert.equal(JSON.stringify(chosen.body).includes(b.memberId), false);
  assert.equal((await s.submit(a)).status, 202);
  assert.deepEqual((await s.summary(a)).body, TRUE);
});

test('현재 선정 목록에 없는 저장소의 지난 접수도 true로 센다', async t => {
  const s = await start(t);
  const user = await s.login('summary-removed-repository');
  const removed = 'synthetic-summary-removed-repo';
  const repositories = await s.get(user, '/v1/me/repositories');
  assert.equal(repositories.status, 200);
  assert.ok(repositories.body.items.length > 0);
  assert.equal(repositories.body.items.some(item => item.repositoryId === removed), false);
  assert.deepEqual((await s.summary(user)).body, FALSE);
  // 선정 목록과 요청 사이에는 FK가 없어, 선정에서 빠진 저장소의 요청 행도 그대로 남는다.
  await insertRequest(user.memberId, { repositoryId: removed, processing: 'EMPTY', application: 'APPLIED' });
  const response = await s.summary(user);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, TRUE);
  assertContract(response);
});

test('조회 실패는 false로 바꾸지 않고 500 INTERNAL_ERROR이며, 장애가 풀리면 같은 값을 다시 읽는다', async t => {
  const s = await start(t);
  const fresh = await s.login('summary-failure-empty');
  const owner = await s.login('summary-failure-owner');
  assert.equal((await s.submit(owner)).status, 202);
  const rows = await tables();
  const failures = await withHiddenTable('analysis_request', async () => [await s.summary(fresh), await s.summary(owner)]);
  for (const failed of failures) {
    assert.equal(failed.status, 500);
    assert.deepEqual(Object.keys(failed.body).sort(), ['code', 'message']);
    assert.equal(failed.body.code, 'INTERNAL_ERROR');
    assertContract(failed);
    const text = JSON.stringify(failed.body);
    for (const leaked of ['analysis_request', 'SELECT', 'relation', fresh.memberId, owner.memberId]) {
      assert.equal(text.includes(leaked), false, leaked);
    }
  }
  // 실패는 삼키지 않고 경로 틀·코드만 기록한다. SQL·표 이름·회원 ID는 기록하지 않는다.
  const log = s.logs.join('\n');
  assert.equal(s.logs.filter(line => line.includes('GET /v1/me/analysis-summary → 500 INTERNAL_ERROR')).length, 2);
  for (const leaked of ['analysis_request', 'SELECT', fresh.memberId, owner.memberId]) assert.equal(log.includes(leaked), false, leaked);
  assert.deepEqual(await tables(), rows, '조회 실패도 요청·동의·시도를 바꾸지 않는다');
  assert.deepEqual((await s.summary(fresh)).body, FALSE);
  assert.deepEqual((await s.summary(owner)).body, TRUE);
});

test('인증이 없거나 잘못되면 공통 401이고 이력 유무를 알려 주지 않는다', async t => {
  const s = await start(t);
  const owner = await s.login('summary-auth');
  assert.equal((await s.submit(owner)).status, 202);
  for (const [headers, code] of [
    [{}, 'AUTH_REQUIRED'],
    [{ Authorization: 'Bearer not-a-token' }, 'AUTH_INVALID'],
    [{ Authorization: 'Bearer ' + owner.token.slice(0, -2) + (owner.token.endsWith('AA') ? 'BB' : 'AA') }, 'AUTH_INVALID'],
    [{ Authorization: 'Basic ' + Buffer.from('member:password').toString('base64') }, 'AUTH_INVALID'],
  ]) {
    const denied = await s.summaryWith(headers);
    assert.equal(denied.status, 401);
    assert.equal(denied.body.code, code);
    assert.equal(Object.hasOwn(denied.body, 'hasAcceptedAnalysisRepository'), false);
    assertContract(denied);
  }
  assert.deepEqual((await s.summary(owner)).body, TRUE);
});

test('쿼리가 붙으면 400 VALIDATION_FAILED이고 입력값을 응답에 담지 않는다', async t => {
  const s = await start(t);
  const user = await s.login('summary-query');
  assert.equal((await s.submit(user)).status, 202);
  for (const search of ['?x=1', '?x', '?x=', '?limit=20', '?cursor=abc', '?hasAcceptedAnalysisRepository=false',
    '?memberId=' + user.memberId, '?a=1&a=2']) {
    const rejected = await s.summary(user, search);
    assert.equal(rejected.status, 400, search);
    assert.equal(rejected.body.code, 'VALIDATION_FAILED');
    assert.deepEqual(rejected.body.details, { violations: [{ field: 'query', reason: 'whitelistValidation' }] }, search);
    assert.equal(JSON.stringify(rejected.body).includes(user.memberId), false);
    assertContract(rejected);
  }
  assert.deepEqual((await s.summary(user)).body, TRUE);
});

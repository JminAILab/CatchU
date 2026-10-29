require('reflect-metadata');
// #140 본인 분석 이력·개별 상태 조회. 실제 Nest HTTP·인증 Guard·전용 PostgreSQL에서 회원 경계·페이지·입력 검사·상태 조합·
// 조회 실패·상태 불변·한 시점 읽기를 확인한다. 요청은 실제 접수 API(#138)로 만들거나 페이지·판정 범위 시험에서 직접 넣고,
// 처리·반영 상태는 시험 DB에 합성으로 구성한다. 실제 수신·반영으로 만든 상태의 조회는 test/integration/analysis-intake-receiver.test.cjs에서 본다.
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { after, before, beforeEach, test } = require('node:test');
const { NestFactory } = require('@nestjs/core');
const { decodeJwt } = require('jose');
const { DataSource } = require('typeorm');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const YAML = require('yaml');
const { AppModule } = require('../../dist/app.module');
const { configureApp } = require('../../dist/app.setup');
const { SYNTHETIC_REPOSITORY } = require('../../dist/member-analysis/dev-member.service');
const { AnalysisAttempt, AnalysisConsent, AnalysisRequest } = require('../../dist/member-analysis/member-analysis.entity');
const { SYNTHETIC_NOTICE } = require('../../dist/analysis-intake/analysis-notice');
const { readAnalysisStatus } = require('../../dist/analysis-intake/analysis-status');
const { encodeHistoryCursor, parseHistoryQuery } = require('../../dist/analysis-intake/analysis-history');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');

const CONTRACT = resolve(__dirname, '../../../api/contracts/repository-analysis');
const contract = file => YAML.parse(readFileSync(resolve(CONTRACT, file), 'utf8'));
const common = contract('common.yaml');
const memberApi = YAML.parse(readFileSync(resolve(__dirname, '../../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/member-api.yaml'), 'utf8'));
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
// 회원 API의 `./common.yaml#` 참조를 공통 스키마와 같은 문서 안 참조로 바꿔 200 응답 스키마를 그대로 컴파일한다.
const response200 = operation => ajv.compile({ ...JSON.parse(JSON.stringify(
  operation.responses['200'].content['application/json'].schema).replaceAll('./common.yaml#', '#')), components: common.components });
const validList = response200(memberApi.paths['/analysis-requests'].get);
const validStatus = response200(memberApi.paths['/analysis-requests/{requestId}'].get);

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
  require('../support/synthetic-daily-limit.cjs').bindSyntheticDailyLimit(app);
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
  const get = async (user, path) => {
    const response = await call(path, { headers: auth(user) });
    return { status: response.status, cache: response.headers.get('cache-control'), body: await response.json() };
  };
  const one = (user, requestId, search = '') => get(user, `/v1/analysis-requests/${requestId}${search}`);
  const list = (user, search = '') => get(user, `/v1/analysis-requests${search}`);
  // 실제 접수 API. 같은 키·같은 본문을 다시 보내면 #138의 현재 상태 재응답(200)이다.
  const submit = async (user, key = randomUUID(), changes = {}) => {
    const response = await call('/v1/analysis-requests', { method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(user), 'Idempotency-Key': key }, body: JSON.stringify(command(changes)) });
    return { status: response.status, key, changes, body: await response.json() };
  };
  return { app, logs, login, one, list, submit };
}

/** 시험 DB에 요청·동의·시도를 직접 넣는다. 페이지 순서와 회원 단위 재요청 판정의 조합을 만들 때만 쓴다. */
async function insertRequest(memberId, { repositoryId = 'synthetic-history-repo', submittedAt = new Date(), lifecycle = 'CLOSED',
  retryOfRequestId = null, ...attempt } = {}) {
  const [requestId, consentId, attemptId] = [randomUUID(), randomUUID(), randomUUID()];
  await db.transaction('READ COMMITTED', async manager => {
    await manager.insert(AnalysisRequest, { registrationId: await require('../support/registered-analysis.cjs').ensureRegistration(manager, { memberId, repositoryId }), requestId, memberId, repositoryId, consentId, currentAttemptId: attemptId,
      retryOfRequestId, submittedAt, updatedAt: submittedAt, lifecycle });
    await manager.insert(AnalysisConsent, { consentId, requestId, memberId, repositoryId, accepted: true,
      noticeRevision: SYNTHETIC_NOTICE.noticeRevision, scopeRevision: SYNTHETIC_NOTICE.scopeRevision,
      consentedScope: { synthetic: true }, consentedAt: submittedAt });
    await manager.insert(AnalysisAttempt, { attemptId, requestId, sourceMode: 'MOCK', ...attempt });
  });
  return requestId;
}
/** 현재 시도와 요청의 진행·종료 상태를 바꿔 합성 상태 조합을 만든다. */
async function setState(requestId, { lifecycle, ...attempt }) {
  const [{ attemptId }] = await db.query('SELECT current_attempt_id AS "attemptId" FROM analysis_request WHERE request_id = $1', [requestId]);
  if (Object.keys(attempt).length) await db.manager.update(AnalysisAttempt, { attemptId }, attempt);
  if (lifecycle) await db.manager.update(AnalysisRequest, { requestId }, { lifecycle });
}
/**
 * 원 요청의 Catch 본체와 현재 시도의 B 등록 연결을 만든다. candidates가 둘 이상이면 같은 Catch를 가리키는 후보 연결이 여럿이다.
 * link=false는 등록 연결 없이 Catch 본체만 남긴 경우다.
 */
async function addCatch(requestId, { ready = true, link = true, candidates = ['candidate-1'] } = {}) {
  const [request] = await db.query('SELECT member_id AS "memberId", current_attempt_id AS "attemptId" FROM analysis_request WHERE request_id = $1',
    [requestId]);
  const catchId = randomUUID();
  await db.query(`INSERT INTO catch_asset (catch_id, title, owner_id, source_request_id, source_result_id,
    source_candidate_id, work_identity, work_facts, subject_contribution, draft_status, reflection_status,
    reflection_questions, registration_assessment, source_mode)
    VALUES ($1, '[합성] Catch', $2, $3, $4, $5, $6, ARRAY['[합성] 사실'], '[합성] 기여', 'NOT_GENERATED',
    'NOT_GENERATED', ARRAY[]::text[], '{}'::jsonb, 'MOCK')`,
  [catchId, request.memberId, requestId, 'result-' + catchId, candidates[0], 'identity-' + catchId]);
  if (link) {
    // 수신 기록은 시도마다 하나다. 같은 시도의 두 번째 Catch는 기존 기록에 연결한다.
    let [record] = await db.query('SELECT application_record_id AS id FROM result_application_record WHERE attempt_id = $1', [request.attemptId]);
    if (!record) {
      record = { id: randomUUID() };
      await db.query('INSERT INTO result_application_record VALUES ($1, $2, $3, $4, $5, now())',
        [record.id, requestId, request.attemptId, 'result-' + catchId, 'a'.repeat(64)]);
    }
    for (const [index, candidateId] of candidates.entries()) {
      await db.query('INSERT INTO candidate_registration VALUES ($1, $2, $3, $4, $5, $6)',
        [randomUUID(), record.id, candidateId, catchId, index === 0 ? 'CREATED' : 'EXISTING', ready]);
    }
  }
  return catchId;
}
async function addReceipt(requestId) {
  const [{ attemptId }] = await db.query('SELECT current_attempt_id AS "attemptId" FROM analysis_request WHERE request_id = $1', [requestId]);
  await db.query('INSERT INTO result_application_record VALUES ($1, $2, $3, $4, $5, now())',
    [randomUUID(), requestId, attemptId, 'result-' + randomUUID(), 'b'.repeat(64)]);
}
const TABLES = ['analysis_request', 'analysis_consent', 'analysis_attempt', 'idempotency_record', 'result_application_record',
  'candidate_registration', 'catch_asset'];
/** 상태 조회와 관련된 표 전체를 행 순서와 무관하게 읽는다. 표 이름은 시험 안의 상수만 넣는다. */
const tables = () => Promise.all(TABLES.map(table =>
  db.query(`SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY to_jsonb(t)::text`).then(rows => [table, rows.map(r => r.row)])))
  .then(Object.fromEntries);
/** 표를 잠시 다른 이름으로 바꿔 조회 문장이 실패하게 한다. 표 이름은 시험 안의 상수만 넣는다. */
async function withHiddenTable(table, run) {
  await db.query(`ALTER TABLE ${table} RENAME TO ${table}_hidden_140`);
  try { return await run(); } finally { await db.query(`ALTER TABLE ${table}_hidden_140 RENAME TO ${table}`); }
}
const CONFIRMED_FAILURE = { processing: 'FAILED', application: 'APPLIED', eligibleCandidateCount: 0, ownerResultsReady: false,
  failures: [{ stage: 'DISPATCH', code: 'SYNTHETIC_CONFIRMED_FAILURE', message: '[합성] 실행되지 않은 확정 실패' }],
  failureConfirmationReference: 'synthetic-confirmed-failure' };
const UNAVAILABLE = { code: 'RESOURCE_UNAVAILABLE', message: '현재 열람할 수 없는 자료입니다.' };

// 처리·반영·종료 상태 조합. retryAfter는 같은 회원이 원 요청을 retryOfRequestId로 보낸 새 접수의 결과(닫힌 요청만)다.
const COMBINATIONS = [
  { label: '대기', expect: { lifecycle: 'ACTIVE', processing: 'QUEUED', application: 'NOT_READY', eligibleCandidateCount: 0 },
    retry: { allowed: false, reason: 'IN_PROGRESS' } },
  { label: '진행', state: { processing: 'RUNNING' }, retry: { allowed: false, reason: 'IN_PROGRESS' } },
  { label: '실행 불명', state: { processing: 'UNCERTAIN' }, retry: { allowed: false, reason: 'EXECUTION_UNCERTAIN' } },
  // 처리 종료·후보 존재만으로 본인 열람 준비를 true로 만들지 않는다.
  { label: '반영 대기(후보 2건)', state: { processing: 'SUCCEEDED', application: 'PENDING', eligibleCandidateCount: 2 },
    retry: { allowed: false, reason: 'RESULTS_EXIST' } },
  { label: '반영 중(정상 0건)', state: { processing: 'EMPTY', application: 'APPLYING' },
    retry: { allowed: false, reason: 'APPLICATION_UNRESOLVED' } },
  { label: '복구 중(처리 실패)', state: { ...CONFIRMED_FAILURE, application: 'RECOVERING' },
    retry: { allowed: false, reason: 'APPLICATION_UNRESOLVED' } },
  { label: '닫히지 않은 반영 실패(처리 실패)', state: { ...CONFIRMED_FAILURE, application: 'APPLY_FAILED' },
    retry: { allowed: false, reason: 'APPLICATION_UNRESOLVED' } },
  { label: '닫히지 않은 반영 실패(처리 성공·후보 1건)', state: { processing: 'SUCCEEDED', application: 'APPLY_FAILED', eligibleCandidateCount: 1 },
    retry: { allowed: false, reason: 'RESULTS_EXIST' } },
  // 같은 Catch를 가리키는 후보 연결 두 건은 ID 하나로, 열람 준비 전 등록은 결과 진입 대상에서 뺀다.
  { label: '정상 완료', state: { processing: 'SUCCEEDED', application: 'APPLIED', eligibleCandidateCount: 3, ownerResultsReady: true, lifecycle: 'CLOSED' },
    catches: [{ ready: true, candidates: ['candidate-1', 'candidate-2'] }, { ready: false, candidates: ['candidate-3'] }],
    registered: [0], retry: { allowed: false, reason: 'RESULTS_EXIST' }, retryAfter: [409, 'REANALYSIS_DEFERRED'] },
  { label: '정상 완료·열람 준비 전', state: { processing: 'SUCCEEDED', application: 'APPLIED', eligibleCandidateCount: 1, lifecycle: 'CLOSED' },
    catches: [{ ready: false }], registered: [], retry: { allowed: false, reason: 'RESULTS_EXIST' }, retryAfter: [409, 'REANALYSIS_DEFERRED'] },
  { label: '정상 0건', state: { processing: 'EMPTY', application: 'APPLIED', lifecycle: 'CLOSED' }, receipt: true,
    retry: { allowed: false, reason: 'REANALYSIS_DEFERRED' }, retryAfter: [409, 'REANALYSIS_DEFERRED'] },
  { label: '부분 실패', state: { processing: 'PARTIAL_FAILED', application: 'APPLIED', eligibleCandidateCount: 1, ownerResultsReady: true,
    lifecycle: 'CLOSED', failures: [{ stage: 'ANALYSIS', code: 'SYNTHETIC_PARTIAL', message: '[합성] 일부 후보 분석 실패' }] },
  catches: [{ ready: true }], registered: [0], retry: { allowed: false, reason: 'RESULTS_EXIST' }, retryAfter: [409, 'REANALYSIS_DEFERRED'] },
  { label: '실패(확정)', state: { ...CONFIRMED_FAILURE, lifecycle: 'CLOSED' }, retry: { allowed: true, reason: 'FAILURE_WITHOUT_RESULTS' },
    retryAfter: [202] },
  { label: '실패(확정 근거 없음)', state: { ...CONFIRMED_FAILURE, failureConfirmationReference: null, lifecycle: 'CLOSED' },
    retry: { allowed: false, reason: 'NOT_FAILED' }, retryAfter: [409, 'RETRY_NOT_ALLOWED'] },
  // PR #296: 반영 실패로 닫힌 요청은 처리 결과·후보 수와 관계없이 등록 Catch가 없으면 재요청할 수 있다.
  { label: '반영 실패로 닫힘', state: { processing: 'SUCCEEDED', application: 'APPLY_FAILED', eligibleCandidateCount: 2, lifecycle: 'CLOSED' },
    retry: { allowed: true, reason: 'FAILURE_WITHOUT_RESULTS' }, retryAfter: [202] },
  { label: '반영 실패로 닫힘·열람 준비 전 등록', state: { processing: 'SUCCEEDED', application: 'APPLY_FAILED', eligibleCandidateCount: 1,
    lifecycle: 'CLOSED' }, catches: [{ ready: false }], registered: [], retry: { allowed: false, reason: 'RESULTS_EXIST' },
  retryAfter: [409, 'REANALYSIS_DEFERRED'] },
  { label: '반영 실패로 닫힘·Catch 본체만', state: { processing: 'EMPTY', application: 'APPLY_FAILED', lifecycle: 'CLOSED' },
    catches: [{ link: false }], registered: [], retry: { allowed: false, reason: 'RESULTS_EXIST' }, retryAfter: [409, 'REANALYSIS_DEFERRED'] },
];

for (const combination of COMBINATIONS) {
  test(`상태 조합 ${combination.label}: 개별 상태·이력이 계약 형식이고 접수 API 재응답과 같은 판정이다`, async t => {
    const s = await start(t);
    const user = await s.login('history-state-' + COMBINATIONS.indexOf(combination));
    const created = await s.submit(user);
    assert.equal(created.status, 202);
    const { requestId } = created.body;
    if (combination.state) await setState(requestId, combination.state);
    const catchIds = [];
    for (const options of combination.catches ?? []) catchIds.push(await addCatch(requestId, options));
    if (combination.receipt) await addReceipt(requestId);

    const rows = await tables();
    const one = await s.one(user, requestId);
    const listed = await s.list(user);
    assert.deepEqual(await tables(), rows, '조회는 요청·시도·동의·등록·Catch·수신 기록을 바꾸지 않는다');
    assert.equal(one.status, 200);
    assert.equal(one.cache, 'no-store');
    assert.ok(validStatus(one.body), JSON.stringify(validStatus.errors));
    assert.equal(listed.status, 200);
    assert.equal(listed.cache, 'no-store');
    assert.ok(validList(listed.body), JSON.stringify(validList.errors));
    assert.deepEqual(listed.body, { items: [one.body], page: { nextCursor: null } });

    const status = one.body;
    const expected = { lifecycle: 'ACTIVE', processing: 'QUEUED', application: 'NOT_READY', eligibleCandidateCount: 0,
      ...Object.fromEntries(Object.entries(combination.state ?? {}).filter(([key]) =>
        ['lifecycle', 'processing', 'application', 'eligibleCandidateCount'].includes(key))), ...combination.expect };
    for (const [field, value] of Object.entries(expected)) assert.equal(status[field], value, field);
    const registered = (combination.registered ?? []).map(index => catchIds[index]);
    assert.deepEqual(status.registeredCatchIds, registered);
    assert.equal(status.ownerResultsReady, combination.state?.ownerResultsReady ?? false);
    assert.deepEqual(status.retry, combination.retry);
    for (const field of ['requestId', 'repositoryId', 'consentId', 'attemptId', 'submittedAt', 'requestState', 'sourceMode']) {
      assert.equal(status[field], created.body[field], field);
    }
    // 같은 키 재응답은 #138 접수의 잠금 판정이다. 조회와 같은 응답이어야 화면이 두 경로를 다르게 해석하지 않는다.
    const replay = await s.submit(user, created.key);
    assert.equal(replay.status, 200);
    assert.deepEqual(replay.body, status);
    if (combination.retryAfter) {
      // 조회의 retry.allowed와 실제 실패 재요청 접수 결과가 일치한다.
      const [code, error] = combination.retryAfter;
      const retried = await s.submit(user, randomUUID(), { retryOfRequestId: requestId });
      assert.equal(retried.status, code, JSON.stringify(retried.body));
      if (error) assert.equal(retried.body.code, error);
      else assert.notEqual(retried.body.requestId, requestId);
    }
  });
}

test('정상 0건·초기 후보 수 0·조회 실패를 서로 다른 응답으로 구분한다', async t => {
  const s = await start(t);
  const initial = await s.login('history-zero-initial');
  const empty = await s.login('history-zero-empty');
  const queued = (await s.submit(initial)).body.requestId;
  const finished = (await s.submit(empty)).body.requestId;
  await setState(finished, { processing: 'EMPTY', application: 'APPLIED', lifecycle: 'CLOSED' });
  await addReceipt(finished);
  const pick = status => [status.processing, status.application, status.lifecycle, status.eligibleCandidateCount,
    status.registeredCatchIds, status.ownerResultsReady, status.retry];
  assert.deepEqual(pick((await s.one(initial, queued)).body),
    ['QUEUED', 'NOT_READY', 'ACTIVE', 0, [], false, { allowed: false, reason: 'IN_PROGRESS' }]);
  assert.deepEqual(pick((await s.one(empty, finished)).body),
    ['EMPTY', 'APPLIED', 'CLOSED', 0, [], false, { allowed: false, reason: 'REANALYSIS_DEFERRED' }]);
  await withHiddenTable('analysis_attempt', async () => {
    for (const [user, requestId] of [[initial, queued], [empty, finished]]) {
      const failed = await s.one(user, requestId);
      assert.equal(failed.status, 500);
      assert.equal(failed.body.code, 'INTERNAL_ERROR');
    }
  });
});

test('정상 빈 이력은 200 빈 목록이고, 조회 장애는 빈 목록·404·결과 없음으로 바꾸지 않고 500이며 상태를 바꾸지 않는다', async t => {
  const s = await start(t);
  const fresh = await s.login('history-empty');
  const owner = await s.login('history-failure');
  const created = await s.submit(owner);
  await setState(created.body.requestId, { processing: 'SUCCEEDED', application: 'APPLIED', eligibleCandidateCount: 1,
    ownerResultsReady: true, lifecycle: 'CLOSED' });
  await addCatch(created.body.requestId);
  const empty = await s.list(fresh);
  assert.equal(empty.status, 200);
  assert.equal(empty.cache, 'no-store');
  assert.deepEqual(empty.body, { items: [], page: { nextCursor: null } });
  assert.ok(validList(empty.body));

  const rows = await tables();
  const failures = [];
  // 첫 문장(요청 목록·요청 행)이 실패하는 경우와, 요청은 읽었지만 등록 연결 조회가 실패하는 경우.
  await withHiddenTable('analysis_request', async () => {
    failures.push(await s.list(fresh), await s.list(owner), await s.one(owner, created.body.requestId));
  });
  await withHiddenTable('candidate_registration', async () => {
    failures.push(await s.list(owner), await s.one(owner, created.body.requestId));
  });
  for (const failed of failures) {
    assert.equal(failed.status, 500);
    assert.equal(failed.cache, 'no-store');
    assert.deepEqual(Object.keys(failed.body).sort(), ['code', 'message']);
    assert.equal(failed.body.code, 'INTERNAL_ERROR');
    const text = JSON.stringify(failed.body);
    for (const leaked of ['analysis_request', 'candidate_registration', 'SELECT', 'relation', created.body.requestId]) {
      assert.equal(text.includes(leaked), false, leaked);
    }
  }
  assert.deepEqual(await tables(), rows, '조회 실패도 상태를 바꾸거나 새 요청·시도를 만들지 않는다');
  // 장애가 풀리면 같은 요청을 그대로 다시 읽는다.
  const recovered = await s.one(owner, created.body.requestId);
  assert.equal(recovered.status, 200);
  assert.equal(recovered.body.registeredCatchIds.length, 1);
});

test('회원 경계: 목록은 본인 요청만, 타인·없는 요청·UUID가 아닌 ID는 같은 404이고 인증이 없으면 401이다', async t => {
  const s = await start(t);
  const a = await s.login('history-member-a');
  const b = await s.login('history-member-b');
  const requestA = (await s.submit(a)).body.requestId;
  const requestB = (await s.submit(b)).body.requestId;
  assert.deepEqual((await s.list(a)).body.items.map(item => item.requestId), [requestA]);
  assert.deepEqual((await s.list(b)).body.items.map(item => item.requestId), [requestB]);
  assert.equal((await s.one(a, requestA)).status, 200);
  assert.equal((await s.one(b, requestB)).status, 200);
  const rows = await tables();
  for (const [user, requestId] of [[a, requestB], [b, requestA], [a, randomUUID()], [a, requestB.toUpperCase()],
    [a, 'not-a-uuid'], [a, requestB + '0'], [a, '%20'], [a, encodeURIComponent('../' + requestB)]]) {
    const denied = await s.one(user, requestId);
    assert.equal(denied.status, 404);
    assert.equal(denied.cache, 'no-store');
    assert.deepEqual(denied.body, UNAVAILABLE);
  }
  for (const response of [await s.list(null), await s.one(null, requestA)]) {
    assert.equal(response.status, 401);
    assert.equal(response.body.code, 'AUTH_REQUIRED');
  }
  assert.deepEqual(await tables(), rows);
});

test('이력 페이지: 접수 시각 최신순·같은 시각은 requestId 역순이고, cursor는 본인·위치에만 묶인다', async t => {
  const s = await start(t);
  const user = await s.login('history-paging');
  const other = await s.login('history-paging-other');
  const at = seconds => new Date(Date.parse('2026-10-22T01:00:00.000Z') + seconds * 1000);
  const closed = { processing: 'EMPTY', application: 'APPLIED' };
  const inserted = [];
  for (const [index, seconds] of [0, 10, 20, 20, 20, 30].entries()) {
    const submittedAt = at(seconds);
    const lifecycle = index === 5 ? 'ACTIVE' : 'CLOSED';
    const requestId = await insertRequest(user.memberId, { repositoryId: `synthetic-history-${index}`, submittedAt, lifecycle,
      ...(lifecycle === 'CLOSED' ? closed : {}) });
    inserted.push({ requestId, submittedAt });
  }
  await insertRequest(other.memberId, { submittedAt: at(25), ...closed });
  const expected = [...inserted].sort((x, y) => y.submittedAt - x.submittedAt || (x.requestId < y.requestId ? 1 : -1))
    .map(row => row.requestId);
  const full = await s.list(user);
  assert.deepEqual(full.body.items.map(item => item.requestId), expected);
  assert.equal(full.body.page.nextCursor, null);
  for (const item of full.body.items) assert.deepEqual((await s.one(user, item.requestId)).body, item);

  const seen = [];
  let cursor = null;
  let pages = 0;
  do {
    const page = await s.list(user, '?limit=2' + (cursor ? '&cursor=' + cursor : ''));
    assert.equal(page.status, 200);
    assert.ok(validList(page.body), JSON.stringify(validList.errors));
    seen.push(...page.body.items.map(item => item.requestId));
    cursor = page.body.page.nextCursor;
    pages += 1;
  } while (cursor);
  assert.deepEqual(seen, expected);
  assert.equal(pages, 3);
  assert.deepEqual((await s.list(user, '?limit=6')).body.page, { nextCursor: null });
  assert.equal((await s.list(user, '?limit=5')).body.items.length, 5);
  assert.equal((await s.list(user, '?limit=1')).body.items.length, 1);
  assert.equal((await s.list(user, '?limit=100')).body.items.length, 6);

  // 첫 페이지 뒤에 더 최근 요청이 생겨도 다음 페이지는 받은 위치 다음부터 이어진다(중복·누락 없음).
  const first = await s.list(user, '?limit=2');
  await insertRequest(user.memberId, { repositoryId: 'synthetic-history-new', submittedAt: at(40), ...closed });
  const second = await s.list(user, '?limit=2&cursor=' + first.body.page.nextCursor);
  assert.deepEqual(second.body.items.map(item => item.requestId), expected.slice(2, 4));
  // 다른 회원이 받은 cursor는 쓸 수 없다. 위치만 담고 권한을 담지 않는다.
  const foreign = await s.list(other, '?cursor=' + first.body.page.nextCursor);
  assert.equal(foreign.status, 400);
  assert.deepEqual(foreign.body.details, { violations: [{ field: 'cursor', reason: 'isCursor' }] });
});

test('이력 쿼리·개별 상태의 입력 오류는 400 VALIDATION_FAILED이고 입력값을 응답에 담지 않는다', async t => {
  const s = await start(t);
  const user = await s.login('history-input');
  const requestId = (await s.submit(user)).body.requestId;
  const raw = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = new Date().toISOString();
  const cases = [
    ['?limit=0', 'limit', 'min'], ['?limit=101', 'limit', 'max'], ['?limit=abc', 'limit', 'isInt'], ['?limit=1.5', 'limit', 'isInt'],
    ['?limit=-1', 'limit', 'isInt'], ['?limit=', 'limit', 'isInt'], ['?limit=1&limit=2', 'limit', 'isInt'],
    ['?cursor=', 'cursor', 'isCursor'], ['?cursor=not-a-cursor', 'cursor', 'isCursor'], ['?cursor=a&cursor=b', 'cursor', 'isCursor'],
    ['?cursor=' + raw([2, user.memberId, now, requestId]), 'cursor', 'isCursor'],
    ['?cursor=' + raw([1, randomUUID(), now, requestId]), 'cursor', 'isCursor'],
    ['?cursor=' + raw([1, user.memberId, now, 'not-a-uuid']), 'cursor', 'isCursor'],
    ['?cursor=' + raw([1, user.memberId, '2026-10-22', requestId]), 'cursor', 'isCursor'],
    ['?cursor=' + raw([1, user.memberId, now, requestId, 'extra']), 'cursor', 'isCursor'],
    ['?cursor=' + raw({ v: 1, memberId: user.memberId, submittedAt: now, requestId }), 'cursor', 'isCursor'],
    ['?page=2', 'query', 'whitelistValidation'], ['?memberId=' + user.memberId, 'query', 'whitelistValidation'],
  ];
  for (const [search, field, reason] of cases) {
    const rejected = await s.list(user, search);
    assert.equal(rejected.status, 400, search);
    assert.equal(rejected.cache, 'no-store');
    assert.equal(rejected.body.code, 'VALIDATION_FAILED');
    assert.deepEqual(rejected.body.details, { violations: [{ field, reason }] }, search);
    assert.equal(JSON.stringify(rejected.body).includes(user.memberId), false);
  }
  for (const search of ['?limit=1', '?view=full']) {
    const rejected = await s.one(user, requestId, search);
    assert.equal(rejected.status, 400);
    assert.deepEqual(rejected.body.details, { violations: [{ field: 'query', reason: 'whitelistValidation' }] });
  }
  // 본인이 받은 cursor 형식은 직접 만든 값도 위치로만 쓴다(권한은 매번 인증 회원으로 다시 판정).
  const position = encodeHistoryCursor(user.memberId, { submittedAt: new Date(Date.now() + 60_000), requestId: randomUUID() });
  assert.deepEqual((await s.list(user, '?cursor=' + position)).body.items.map(item => item.requestId), [requestId]);
  assert.deepEqual(parseHistoryQuery(user.memberId, {}), { limit: 20, after: null });
});

test('재요청 판정은 접수와 같다: 다른 진행 중 요청이 있으면 IN_PROGRESS, 같은 저장소의 후속 요청이 있으면 REANALYSIS_DEFERRED', async t => {
  const s = await start(t);
  const user = await s.login('history-retry-scope');
  const at = seconds => new Date(Date.parse('2026-10-22T02:00:00.000Z') + seconds * 1000);
  const check = async (requestId, retry) => {
    const one = await s.one(user, requestId);
    assert.deepEqual(one.body.retry, retry);
    // 접수(#138)가 같은 키 재응답·선행 이력 판정에 쓰는 잠금 읽기와 같은 응답이다.
    const locked = await db.transaction('READ COMMITTED', manager => readAnalysisStatus(manager, user.memberId, requestId));
    assert.deepEqual(one.body, locked.status);
    const listed = (await s.list(user)).body.items.find(item => item.requestId === requestId);
    assert.deepEqual(listed, one.body);
  };
  const original = await insertRequest(user.memberId, { repositoryId: 'synthetic-x', submittedAt: at(0), ...CONFIRMED_FAILURE });
  await check(original, { allowed: true, reason: 'FAILURE_WITHOUT_RESULTS' });
  const elsewhere = await insertRequest(user.memberId, { repositoryId: 'synthetic-y', submittedAt: at(10), lifecycle: 'ACTIVE' });
  await check(original, { allowed: false, reason: 'IN_PROGRESS' });
  await setState(elsewhere, { processing: 'EMPTY', application: 'APPLIED', lifecycle: 'CLOSED' });
  await check(original, { allowed: true, reason: 'FAILURE_WITHOUT_RESULTS' });
  const followUp = await insertRequest(user.memberId, { repositoryId: 'synthetic-x', submittedAt: at(20), retryOfRequestId: original,
    ...CONFIRMED_FAILURE });
  await check(original, { allowed: false, reason: 'REANALYSIS_DEFERRED' });
  await check(followUp, { allowed: true, reason: 'FAILURE_WITHOUT_RESULTS' });
});

// 조회 트랜잭션의 첫 조회(요청 행) 직후 멈춘 사이 다른 연결이 반영을 커밋한다. 한 시점으로 읽지 않으면(READ COMMITTED)
// 요청은 ACTIVE인데 시도는 APPLIED이고 등록 Catch가 보이는 섞인 응답이 된다.
for (const path of ['개별 상태', '이력']) {
  test(`한 시점 읽기(${path}): 조회 중 반영이 커밋돼도 요청·현재 시도·등록 정보가 섞이지 않는다`, async t => {
    const s = await start(t);
    const user = await s.login('history-snapshot-' + path);
    const created = await s.submit(user);
    const { requestId } = created.body;
    await setState(requestId, { processing: 'SUCCEEDED', application: 'PENDING', eligibleCandidateCount: 1 });
    const beforeApply = (await s.one(user, requestId)).body;
    assert.deepEqual([beforeApply.lifecycle, beforeApply.application, beforeApply.registeredCatchIds], ['ACTIVE', 'PENDING', []]);

    const dataSource = s.app.get(DataSource);
    const transaction = dataSource.transaction;
    t.after(() => { dataSource.transaction = transaction; });
    let paused;
    const reached = new Promise(resolve => { paused = resolve; });
    let resume;
    const resumed = new Promise(resolve => { resume = resolve; });
    dataSource.transaction = function (...args) {
      dataSource.transaction = transaction;
      const run = args.pop();
      return transaction.call(this, ...args, async manager => {
        const runner = manager.queryRunner;
        const query = runner.query.bind(runner);
        runner.query = async (...input) => {
          const result = await query(...input);
          if (/FROM "analysis_request"/.test(input[0])) {
            runner.query = query;
            paused();
            await resumed;
          }
          return result;
        };
        return run(manager);
      });
    };
    const pending = path === '개별 상태' ? s.one(user, requestId) : s.list(user);
    await reached;
    // 다른 연결에서 반영 결과(등록 Catch·열람 준비·반영 완료·요청 닫기)를 커밋한다. 조회는 행 잠금을 잡지 않아 기다리지 않는다.
    const catchId = await addCatch(requestId);
    await setState(requestId, { application: 'APPLIED', ownerResultsReady: true, lifecycle: 'CLOSED' });
    resume();
    const response = await pending;
    assert.equal(response.status, 200);
    assert.deepEqual(path === '개별 상태' ? response.body : response.body.items[0], beforeApply);
    const afterApply = (await s.one(user, requestId)).body;
    assert.deepEqual([afterApply.lifecycle, afterApply.application, afterApply.registeredCatchIds, afterApply.ownerResultsReady],
      ['CLOSED', 'APPLIED', [catchId], true]);
  });
}

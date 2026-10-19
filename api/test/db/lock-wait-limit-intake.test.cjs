require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { after, afterEach, before, beforeEach, test } = require('node:test');
const { NestFactory } = require('@nestjs/core');
const { decodeJwt } = require('jose');
const { AppModule } = require('../../dist/app.module');
const { configureApp } = require('../../dist/app.setup');
const { SYNTHETIC_REPOSITORY } = require('../../dist/member-analysis/dev-member.service');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const {
  APP_LOCK_TIMEOUT_MS, NO_ROLE_PRIVILEGE, assertCapWait, cleanUpLocks, createLockWaitRoles, holdAdvisory, holdRow,
  sleepUntil, summarize, timed, waitUntilBlocked, withAppAccount,
} = require('../support/lock-wait-limit.cjs');

// #220: 분석 접수(POST /v1/analysis-requests)와 같은 키 재응답이 기다리는 잠금을 앱 계정 3초 조건에서 본다.
// 접수는 키 잠금 → 회원 접수 잠금 → 요청·시도 행 순서로 기다린다. 결과 수신·반영은 요청 행을 FOR UPDATE로 잡으므로
// 같은 행을 쥔 시험 연결로 그 경쟁을 재현한다. 측정값은 이 환경의 한 번 실행이며 부하 기준이 아니다.

const ENV = {
  NODE_ENV: 'test', DEV_LOGIN_ENABLED: 'true', AUTH_JWT_SECRET: randomBytes(32).toString('hex'),
  AUTH_ACCESS_TOKEN_TTL_SECONDS: '900', AUTH_WEB_ORIGIN: 'https://catchu.example',
  SHARE_LINK_WEB_BASE_URL: 'https://catchu.example', LINK_GRANT_SECRET: randomBytes(32).toString('hex'),
};
const saved = {};
let db, roles, app, url;

before(async () => {
  for (const [key, value] of Object.entries(ENV)) { saved[key] = process.env[key]; process.env[key] = value; }
  db = await openTestDataSource();
  roles = await createLockWaitRoles(db);
  if (!roles) return;
  const logger = Object.fromEntries(['log', 'error', 'warn', 'debug', 'verbose', 'fatal'].map(level => [level, () => {}]));
  app = await withAppAccount(roles, async () =>
    configureApp(await NestFactory.create(AppModule, { logger, abortOnError: false })));
  await app.listen(0, '127.0.0.1');
  url = await app.getUrl();
});
after(async () => {
  try { await app?.close(); } finally {
    try { await roles?.drop(); } finally {
      await db?.destroy();
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    }
  }
});
beforeEach(async () => { await resetTestDatabase(db); });
// 대기 확인이나 검사가 실패해 시험이 잠금을 풀기 전에 끝나도, 다음 시험 전에 잠금을 풀고 시작한 요청이 끝나기를 기다린다.
afterEach(() => cleanUpLocks());

function ready(t) {
  if (roles) return true;
  t.skip(NO_ROLE_PRIVILEGE);
  return false;
}

const call = (path, options = {}) => fetch(url + path, { ...options, signal: AbortSignal.timeout(15000) });
async function login(identity) {
  const response = await call('/v1/auth/dev-login', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId: identity }) });
  assert.equal(response.status, 200);
  const { accessToken } = await response.json();
  return { token: accessToken, memberId: decodeJwt(accessToken).sub };
}
/** 실제 고지·선정 저장소 API의 응답으로 동의 본문을 만든다. */
async function consentBody(user) {
  const headers = { Authorization: 'Bearer ' + user.token };
  const notice = await (await call('/v1/analysis-notice', { headers })).json();
  const repositories = await (await call('/v1/me/repositories', { headers })).json();
  const repository = repositories.items.find(item => item.repositoryId === SYNTHETIC_REPOSITORY.repositoryId);
  assert.ok(repository, '합성 저장소가 선정 저장소 API에 있어야 한다');
  return { repositoryId: repository.repositoryId,
    consent: { accepted: true, noticeRevision: notice.noticeRevision, scopeRevision: repository.allowedScopeRevision } };
}
async function submit(user, key, body) {
  const response = await call('/v1/analysis-requests', { method: 'POST', headers: { 'Content-Type': 'application/json',
    Authorization: 'Bearer ' + user.token, 'Idempotency-Key': key }, body: JSON.stringify(body) });
  return { status: response.status, cacheControl: response.headers.get('cache-control'), body: await response.json() };
}
const intakeLockText = memberId => JSON.stringify(['catchu:analysis-intake', memberId]);
const keyLockText = (memberId, key) => JSON.stringify(['catchu:idempotency', memberId, 'createAnalysisRequest', key]);
async function counts() {
  const [row] = await db.query(`SELECT (SELECT count(*)::int FROM analysis_request) AS requests,
    (SELECT count(*)::int FROM analysis_consent) AS consents, (SELECT count(*)::int FROM analysis_attempt) AS attempts,
    (SELECT count(*)::int FROM idempotency_record) AS records`);
  return row;
}
async function stored() {
  return {
    requests: await db.query('SELECT * FROM analysis_request ORDER BY request_id'),
    consents: await db.query('SELECT * FROM analysis_consent ORDER BY consent_id'),
    attempts: await db.query('SELECT * FROM analysis_attempt ORDER BY attempt_id'),
    records: await db.query('SELECT * FROM idempotency_record ORDER BY idempotency_id'),
  };
}
function assertInternalError(result, label) {
  assert.equal(result.status, 500, `${label}: ${JSON.stringify(result.body)}`);
  assert.deepEqual(result.body, { code: 'INTERNAL_ERROR', message: result.body.message });
  assert.equal(result.cacheControl, 'no-store');
}

test('분석 접수: 회원 접수 잠금을 3초 안에 얻지 못하면 500이고 요청·동의·시도·멱등 기록을 남기지 않으며 같은 키로 다시 접수한다', async t => {
  if (!ready(t)) return;
  const user = await login('intake-member-lock');
  const body = await consentBody(user);
  const held = await holdAdvisory(db, intakeLockText(user.memberId));
  let failed;
  try { failed = await timed(() => submit(user, 'member-lock-key', body)); } finally { await held.release(); }
  assertInternalError(failed.value, '회원 접수 잠금');
  assertCapWait(failed.ms, '회원 접수 잠금');
  assert.deepEqual(await counts(), { requests: 0, consents: 0, attempts: 0, records: 0 });
  const retried = await submit(user, 'member-lock-key', body);
  assert.equal(retried.status, 202, JSON.stringify(retried.body));
  assert.deepEqual(await counts(), { requests: 1, consents: 1, attempts: 1, records: 1 });
  t.diagnostic(`회원 접수 잠금 상한 초과: ${failed.ms}ms 뒤 500, 같은 키 재접수 202`);
});

test('분석 접수: 같은 키 잠금을 3초 안에 얻지 못하면 500이고 아무 기록도 남기지 않으며 같은 키로 다시 접수한다', async t => {
  if (!ready(t)) return;
  const user = await login('intake-key-lock');
  const body = await consentBody(user);
  const held = await holdAdvisory(db, keyLockText(user.memberId, 'key-lock-key'));
  let failed;
  try { failed = await timed(() => submit(user, 'key-lock-key', body)); } finally { await held.release(); }
  assertInternalError(failed.value, '키 잠금');
  assertCapWait(failed.ms, '키 잠금');
  assert.deepEqual(await counts(), { requests: 0, consents: 0, attempts: 0, records: 0 });
  const retried = await submit(user, 'key-lock-key', body);
  assert.equal(retried.status, 202, JSON.stringify(retried.body));
  t.diagnostic(`키 잠금 상한 초과: ${failed.ms}ms 뒤 500, 같은 키 재접수 202`);
});

test('분석 접수 재응답: 결과 수신·반영처럼 요청 행을 3초 넘게 쥐면 같은 키 재응답과 다른 키 접수가 500이고 기존 기록은 그대로다', async t => {
  if (!ready(t)) return;
  const user = await login('intake-replay');
  const body = await consentBody(user);
  const created = await submit(user, 'replay-key', body);
  assert.equal(created.status, 202, JSON.stringify(created.body));
  const before = await stored();
  const held = await holdRow(db, 'analysis_request', 'request_id', created.body.requestId);
  let replay, other;
  try {
    // 두 요청은 서로 다른 키 잠금을 쥐고 같은 요청 행에서 함께 기다린다.
    [replay, other] = await Promise.all([timed(() => submit(user, 'replay-key', body)), timed(() => submit(user, 'other-key', body))]);
  } finally { await held.release(); }
  assertInternalError(replay.value, '같은 키 재응답');
  assertCapWait(replay.ms, '같은 키 재응답');
  assertInternalError(other.value, '진행 중 요청이 있는 다른 키 접수');
  assertCapWait(other.ms, '진행 중 요청이 있는 다른 키 접수');
  // 기존 요청·동의·시도·멱등 기록은 한 칸도 바뀌지 않고, 실패한 다른 키의 기록도 없다.
  assert.deepEqual(await stored(), before);

  const replayed = await submit(user, 'replay-key', body);
  assert.equal(replayed.status, 200);
  assert.equal(replayed.body.requestId, created.body.requestId);
  const reused = await submit(user, 'other-key', body);
  assert.equal(reused.status, 200, '진행 중인 같은 저장소 요청을 돌려준다');
  assert.equal(reused.body.requestId, created.body.requestId);
  t.diagnostic(`요청 행 잠금 상한 초과(동시 2건): 같은 키 ${replay.ms}ms·다른 키 ${other.ms}ms 뒤 500, 풀린 뒤 둘 다 200`);
});

test('분석 접수: 짧게 쥔 회원 잠금은 기다린 뒤 접수되고, 첫 접수의 같은 키·다른 키 동시 요청은 요청 하나로 모인다', async t => {
  if (!ready(t)) return;
  const user = await login('intake-normal');
  const body = await consentBody(user);
  const held = await holdAdvisory(db, intakeLockText(user.memberId));
  const startedAt = Date.now();
  const pending = timed(() => submit(user, 'normal-key', body));
  await waitUntilBlocked(db, held.pid, '분석 접수');
  await sleepUntil(startedAt + 1000);
  const heldMs = await held.release();
  const waited = await pending;
  assert.equal(waited.value.status, 202, JSON.stringify(waited.value.body));
  assert.ok(waited.ms >= 900 && waited.ms < APP_LOCK_TIMEOUT_MS, `보유 ${heldMs}ms 뒤 접수(${waited.ms}ms)`);

  const burstUser = await login('intake-burst');
  const burstBody = await consentBody(burstUser);
  const perKind = 5;
  const burst = await Promise.all([
    ...Array.from({ length: perKind }, () => timed(() => submit(burstUser, 'burst-key', burstBody))),
    ...Array.from({ length: perKind }, (_, index) => timed(() => submit(burstUser, `burst-other-${index}`, burstBody))),
  ]);
  const statuses = burst.map(r => r.value.status).sort();
  assert.deepEqual(statuses, [200, 200, 200, 200, 200, 200, 200, 200, 200, 202]);
  assert.equal(new Set(burst.map(r => r.value.body.requestId)).size, 1, '모두 같은 요청을 돌려준다');
  const [{ n: requests }] = await db.query('SELECT count(*)::int AS n FROM analysis_request WHERE member_id = $1', [burstUser.memberId]);
  const [{ n: records }] = await db.query('SELECT count(*)::int AS n FROM idempotency_record WHERE member_id = $1', [burstUser.memberId]);
  assert.equal(requests, 1);
  assert.equal(records, perKind + 1, '같은 키 기록 1건과 다른 키마다 1건');
  t.diagnostic(`회원 접수 잠금 짧은 보유: 보유 ${heldMs}ms, 대기 포함 ${waited.ms}ms`);
  t.diagnostic(`첫 접수 동시 ${burst.length}건(같은 키 ${perKind}·다른 키 ${perKind}) 응답(ms): ${JSON.stringify(summarize(burst.map(r => r.ms)))}`);
});

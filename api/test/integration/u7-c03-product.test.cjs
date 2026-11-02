// #424 후속 연결: U7 F2·BR3.1과 계약 C-03. 제품 조립·인증·접수·C-03·DB는 실제 구현이다.
// Google 회원/연결은 합성 행, GitHub 자격정보·메타데이터는 대역이다. 외부 분석 완료 증거가 아니다.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { before, after, beforeEach, test } = require('node:test');
const { createApplicationModule } = require('../../dist/application.module');
const { AnalysisIntakeModule } = require('../../dist/analysis-intake/analysis-intake.module');
const { ANALYSIS_DAILY_RUN_LIMIT } = require('../../dist/analysis-intake/daily-run-limit.consumer');
const { DailyRunLimit, DAILY_RUN_LIMIT } = require('../../dist/daily-run-limit/daily-run-limit');
const { SessionService } = require('../../dist/auth/session.service');
const { GitHubConnectionService } = require('../../dist/github-connection/github-connection.service');
const { GitHubRepositoryClient } = require('../../dist/member-repositories/github-repository.client');
const { MemberAccount, GitHubConnection, AnalysisRequest, AnalysisAttempt } = require('../../dist/member-analysis/member-analysis.entity');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const { readInitialSelection, restoreInitialSelection } = require('../support/repository-selection.cjs');
const { APP_SETTINGS, setEnv, startApp } = require('../u2/support.cjs');

let db, initial;
before(async () => { db = await openTestDataSource(); initial = await readInitialSelection(db); });
after(async () => { await db?.destroy(); });
beforeEach(async () => { await resetTestDatabase(db); await restoreInitialSelection(db, initial); });
const NOW = new Date('2026-11-02T14:59:59.000Z'); // KST 자정 1초 전
const countRows = memberId => db.query('SELECT usage_date::text, count FROM daily_execution_count WHERE member_id=$1 ORDER BY usage_date', [memberId]);
const seedCount = (memberId, count) => db.query('INSERT INTO daily_execution_count VALUES ($1, $2, $3)', [memberId, '2026-11-02', count]);
async function sizes() {
  const result = {};
  for (const table of ['analysis_request', 'analysis_consent', 'analysis_attempt', 'idempotency_record']) {
    result[table] = (await db.query(`SELECT count(*)::int n FROM ${table}`))[0].n;
  }
  return result;
}
const EMPTY = { analysis_request: 0, analysis_consent: 0, analysis_attempt: 0, idempotency_record: 0 };

async function start(t) {
  t.mock.timers.enable({ apis: ['Date'], now: NOW });
  const restore = setEnv({ ...APP_SETTINGS, GITHUB_CONNECTION_ENABLED: undefined,
    WORKER_CONTEXT_ENABLED: undefined, CATCHU_QUEUE_REDIS_URL: undefined });
  let app;
  t.after(async () => { try { await app?.close(); } finally { restore(); } });
  const running = await startApp(createApplicationModule());
  app = running.app;
  const limit = app.get(DailyRunLimit);
  assert.equal(app.select(AnalysisIntakeModule).get(ANALYSIS_DAILY_RUN_LIMIT, { strict: true }), limit,
    '제품 모듈의 소비 토큰이 U2 실제 제공자와 같은 객체여야 한다');
  const github = app.get(GitHubConnectionService);
  t.mock.method(github, 'requireAvailable', () => {});
  t.mock.method(github, 'refreshStatus', async () => {});
  t.mock.method(github, 'resolveCredential', async () => ({ externalAccountReference: '9988', token: 'synthetic-only' }));
  t.mock.method(app.get(GitHubRepositoryClient), 'verify', async coords => ({ ...coords, repositoryId: '123456' }));
  async function member() {
    const account = Object.assign(new MemberAccount(), { identityReference: 'catchu:google:' + randomUUID(), accountState: 'ACTIVE' });
    await db.manager.insert(MemberAccount, account);
    await db.manager.insert(GitHubConnection, Object.assign(new GitHubConnection(), { memberId: account.memberId,
      connectionState: 'CONNECTED', accountLogin: 'synthetic-user', externalAccountReference: '9988',
      credentialReference: 'github-v1:' + randomUUID() }));
    const token = (await db.transaction(manager => app.get(SessionService).create(manager, account.memberId))).access.accessToken;
    const registered = await running.call('POST', '/me/repositories', { token, body: { url: 'https://github.com/synthetic-owner/synthetic-repo' } });
    assert.equal(registered.status, 201, registered.text);
    const notice = await running.call('GET', '/analysis-notice', { token });
    assert.equal(notice.status, 200, notice.text);
    const body = { repositoryId: registered.body.repositoryId, consent: { accepted: true,
      noticeRevision: notice.body.noticeRevision, scopeRevision: registered.body.allowedScopeRevision } };
    const submit = async (key = randomUUID(), input = body) => {
      const response = await fetch(running.url + '/v1/analysis-requests', { method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify(input), signal: AbortSignal.timeout(10000) });
      return { status: response.status, body: await response.json(), headers: response.headers };
    };
    return { memberId: account.memberId, token, body, submit };
  }
  return { ...running, limit, member };
}

test('실제 제품 주입: 등록·조회·동의 거부는 미소비, 동시 접수와 재응답은 DB 1회만 소비한다', async t => {
  const app = await start(t), user = await app.member(), other = await app.member();
  assert.equal((await app.call('GET', '/me/repositories', { token: user.token })).status, 200);
  const rejected = await user.submit(randomUUID(), { ...user.body, consent: { ...user.body.consent, accepted: false } });
  assert.equal(rejected.status, 403);
  assert.equal(rejected.body.code, 'CONSENT_REQUIRED');
  assert.deepEqual(await countRows(user.memberId), []);
  assert.deepEqual(await sizes(), EMPTY);
  const key = randomUUID();
  const results = await Promise.all([user.submit(key), user.submit(key), user.submit()]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 200, 202]);
  assert.equal(new Set(results.map(r => r.body.requestId)).size, 1);
  assert.equal(results[0].body.sourceMode, 'LIVE');
  assert.equal((await user.submit(key)).status, 200);
  assert.deepEqual(await countRows(user.memberId), [{ usage_date: '2026-11-02', count: 1 }]);
  assert.deepEqual(await countRows(other.memberId), []);
});

test('공유 한도: 요약이 쓴 마지막 횟수 뒤 U7 HTTP는 정확한 429를 반환하고 접수 행을 남기지 않는다', async t => {
  const app = await start(t), user = await app.member();
  await seedCount(user.memberId, DAILY_RUN_LIMIT - 1);
  assert.equal(await app.limit.consume(user.memberId, 'JD_SUMMARY', new Date()), 'ALLOWED');
  const denied = await user.submit();
  assert.equal(denied.status, 429);
  assert.deepEqual(denied.body, { code: 'DAILY_LIMIT_REACHED', message: '오늘 한도에 도달했습니다' });
  assert.equal(denied.headers.get('retry-after'), null);
  assert.deepEqual(await countRows(user.memberId), [{ usage_date: '2026-11-02', count: DAILY_RUN_LIMIT }]);
  assert.deepEqual(await sizes(), EMPTY);
});

test('KST 자정: 거부된 키로 다음 날 접수하면 새 날짜 1회이며 전날 횟수는 유지된다', async t => {
  const app = await start(t), user = await app.member(), key = randomUUID();
  await seedCount(user.memberId, DAILY_RUN_LIMIT);
  assert.equal((await user.submit(key)).status, 429);
  t.mock.timers.setTime(new Date('2026-11-02T15:00:00.000Z').getTime());
  assert.equal((await user.submit(key)).status, 202);
  assert.deepEqual(await countRows(user.memberId), [
    { usage_date: '2026-11-02', count: DAILY_RUN_LIMIT }, { usage_date: '2026-11-03', count: 1 },
  ]);
});

test('소비 후 접수 저장 실패는 같은 DB 트랜잭션으로 횟수·요청·동의·시도·키를 모두 롤백한다', async t => {
  const app = await start(t), user = await app.member(), key = randomUUID();
  // 접수 INSERT 시 실제 소비 행이 같은 트랜잭션에 보이는지 확인한 뒤 강제로 실패시킨다.
  await db.query(`CREATE FUNCTION u7_c03_fail_intake() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM daily_execution_count WHERE member_id=NEW.member_id AND count=1) THEN
        RAISE EXCEPTION 'consumption missing' USING ERRCODE='P0002';
      END IF;
      RAISE EXCEPTION 'synthetic intake failure' USING ERRCODE='P0001';
    END $$`);
  await db.query('CREATE TRIGGER u7_c03_fail_intake BEFORE INSERT ON analysis_request FOR EACH ROW EXECUTE FUNCTION u7_c03_fail_intake()');
  try {
    // 직접 서비스 호출로 DB 오류 분류도 대조한다. 소비/접수 구현은 대체하지 않는다.
    const { AnalysisIntakeService } = require('../../dist/analysis-intake/analysis-intake.service');
    await assert.rejects(app.app.get(AnalysisIntakeService).create(user.memberId, key, user.body), error => error.driverError?.code === 'P0001');
    assert.deepEqual(await countRows(user.memberId), []);
    assert.deepEqual(await sizes(), EMPTY);
  } finally {
    await db.query('DROP TRIGGER u7_c03_fail_intake ON analysis_request');
    await db.query('DROP FUNCTION u7_c03_fail_intake()');
  }
  assert.equal((await user.submit(key)).status, 202);
  assert.deepEqual(await countRows(user.memberId), [{ usage_date: '2026-11-02', count: 1 }]);
});

test('확정 실행 실패는 환급하지 않으며 허용된 재요청은 새 접수 1회를 소비한다', async t => {
  const app = await start(t), user = await app.member();
  const first = await user.submit();
  assert.equal(first.status, 202);
  await db.manager.update(AnalysisAttempt, { attemptId: first.body.attemptId }, { processing: 'FAILED', application: 'APPLIED',
    failures: [{ stage: 'COLLECTION', code: 'SYNTHETIC_FAILURE', message: '합성 확정 실패' }], failureConfirmationReference: 'synthetic-confirmed' });
  await db.manager.update(AnalysisRequest, { requestId: first.body.requestId }, { lifecycle: 'CLOSED' });
  assert.deepEqual(await countRows(user.memberId), [{ usage_date: '2026-11-02', count: 1 }]);
  const second = await user.submit(randomUUID(), { ...user.body, retryOfRequestId: first.body.requestId });
  assert.equal(second.status, 202);
  assert.notEqual(second.body.requestId, first.body.requestId);
  assert.deepEqual(await countRows(user.memberId), [{ usage_date: '2026-11-02', count: 2 }]);
});

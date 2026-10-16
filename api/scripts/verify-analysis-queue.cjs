// #233 완료 기준 8의 수동 검증 전용(CI에서 돌지 않는다). 실제 테스트 DB·큐(Valkey)와 따로 띄운 worker로
// api의 보내기 → worker 처리 → api의 받기 → 수신·반영·수신 확인을 한 번 돌리고 증거를 JSON으로 출력한다.
// worker는 큐 검증 키트의 시험용 worker(docs/queue-verification/py/f_worker.py) 또는 dev의 실제 worker 소비자(MOCK)다.
// 실행 방법·worker 띄우는 명령은 api/docs/analysis-queue.md 「수동 검증」에 있다.
//
// - 자료는 모두 합성이다. 접수 기록은 worker 합성 맥락(worker/fixtures/m1-synthetic/context.sample.json)의 ID로 넣는다.
//   키트 worker가 그 고정 맥락과 대조하기 때문이다. 실제 GitHub·LLM·보호 공급을 부르지 않는다(보호 관측은 합성 대역).
// - 테스트 DB(이름이 _test로 끝나야 함)를 npm test처럼 비우고 쓴다. 개발 DB·.env의 DB_*는 쓰지 않는다.
// - api는 모듈의 주기 보내기가 행을 찾게 한다(큐에 직접 넣지 않는다). 결과 작업의 반환값(수신 확인)은 BullMQ가 완료 때
//   내보내는 완료 기록(QueueEvents)으로 받는다. 실제 worker는 수신 확인을 읽은 뒤 결과 작업을 지우기 때문이다.
require('reflect-metadata');
const { randomBytes } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { Module } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { Queue, QueueEvents } = require('bullmq');
const { AppModule } = require('../dist/app.module');
const { readAnalysisQueueConfig } = require('../dist/analysis-queue/analysis-queue.config');
const { AnalysisQueueModule, AnalysisQueueRunner } = require('../dist/analysis-queue/analysis-queue.module');
const { openTestDataSource, resetTestDatabase } = require('../test/support/test-database.cjs');
const { CONTRACT_DIR } = require('../test/helpers/receiver-harness.cjs');
const { checkMessage } = require('../test/helpers/worker-messages.cjs');

const FIXTURES = resolve(__dirname, '../../worker/fixtures/m1-synthetic');
// worker/app/processing/synthetic.py의 고지 판본·허용 자료 종류.
const NOTICE_REVISION = '00000000-0000-4000-8000-000000000301';
const RESOURCE_TYPES = ['COMMIT', 'PULL_REQUEST', 'ISSUE'];
const TIMEOUT_MS = Number(process.env.VERIFY_TIMEOUT_MS || 90_000);
// 원인으로 남길 수 있는 값. 목록에 없으면 이름만 남긴다(주소·SQL·본문이 섞일 수 있는 메시지는 출력하지 않는다).
const SAFE_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', '28P01', '3D000', '42P01', '08001', '08006']);

function usage() {
  return [
    '사용: CATCHU_QUEUE_REDIS_URL=redis://127.0.0.1:<포트> CATCHU_QUEUE_PREFIX=<접두사> TEST_DB_PORT=<포트> \\',
    '      node scripts/verify-analysis-queue.cjs --worker kit|dev',
    'worker를 같은 큐 주소·접두사로 먼저 띄운다(api/docs/analysis-queue.md 「수동 검증」).',
  ].join('\n');
}

function safeReason(error) {
  for (const code of [error?.code, error?.cause?.code, error?.driverError?.code]) if (SAFE_CODES.has(code)) return code;
  return error?.name ?? 'unknown';
}

async function waitFor(check, label) {
  const deadline = Date.now() + TIMEOUT_MS;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) throw Object.assign(new Error(label), { name: 'VerificationTimeout', stage: label });
    await new Promise(done => setTimeout(done, 200));
  }
}

async function main() {
  const workerKind = process.argv[process.argv.indexOf('--worker') + 1];
  if (!['kit', 'dev'].includes(workerKind) || !process.env.CATCHU_QUEUE_REDIS_URL) {
    console.error(usage());
    return 2;
  }
  // .env·개발 DB를 읽지 않는다. npm test 실행기와 같은 테스트 DB 값만 쓴다.
  Object.assign(process.env, {
    NODE_ENV: 'test', DB_HOST: process.env.TEST_DB_HOST || '127.0.0.1', DB_PORT: process.env.TEST_DB_PORT || '5433',
    DB_USER: process.env.TEST_DB_USER || 'catchu', DB_PASSWORD: process.env.TEST_DB_PASSWORD || 'catchu_local',
    DB_NAME: process.env.TEST_DB_NAME || 'catchu_test', AUTH_JWT_SECRET: randomBytes(32).toString('hex'),
    AUTH_ACCESS_TOKEN_TTL_SECONDS: '900', SHARE_LINK_WEB_BASE_URL: 'http://localhost:3000',
  });
  const config = readAnalysisQueueConfig(process.env);
  const db = await openTestDataSource();
  const closers = [() => db.destroy()];
  try {
    await db.runMigrations();
    await resetTestDatabase(db);
    const { values } = JSON.parse(readFileSync(resolve(FIXTURES, 'context.sample.json'), 'utf8'));
    const now = new Date();
    // 접수 API가 만드는 것과 같은 모양(요청 ACTIVE·시도 QUEUED/NOT_READY·MOCK)을 합성 맥락 ID로 한 트랜잭션에 넣는다.
    await db.transaction(async manager => {
      await manager.query("INSERT INTO member_account (member_id, identity_reference, account_state) VALUES ($1, $2, 'ACTIVE')",
        [values.memberId, 'verify-analysis-queue:' + values.memberId]);
      await manager.query(`INSERT INTO analysis_request (request_id, member_id, repository_id, consent_id, current_attempt_id,
        submitted_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $6)`,
      [values.requestId, values.memberId, values.repositoryId, values.consentId, values.attemptId, now]);
      await manager.query(`INSERT INTO analysis_consent (consent_id, request_id, member_id, repository_id, accepted,
        notice_revision, scope_revision, consented_scope, consented_at) VALUES ($1, $2, $3, $4, true, $5, $6, $7, $8)`,
      [values.consentId, values.requestId, values.memberId, values.repositoryId, NOTICE_REVISION, values.scopeRevision,
        { revision: values.scopeRevision, repositoryId: values.repositoryId, allowedResourceTypes: RESOURCE_TYPES,
          selectionReference: 'catchu:synthetic-selection:v1' }, now]);
      await manager.query(`INSERT INTO analysis_attempt (attempt_id, request_id, processing, application, source_mode)
        VALUES ($1, $2, 'QUEUED', 'NOT_READY', 'MOCK')`, [values.attemptId, values.requestId]);
    });

    // 결과 메시지 ID는 message-<표지>-<시도>-result다. 표지는 dev worker가 mock, 키트 worker가 사례 이름이다.
    const isResultJob = jobId => jobId.startsWith('message-') && jobId.endsWith(`-${values.attemptId}-result`);
    const completions = {};
    const failures = {};
    const listen = async name => {
      const events = new QueueEvents(name, { connection: { url: config.redisUrl }, prefix: config.prefix });
      closers.unshift(() => events.close());
      events.on('completed', ({ jobId, returnvalue }) => { completions[jobId] = returnvalue; });
      events.on('failed', ({ jobId, failedReason }) => { failures[jobId] = failedReason; });
      events.on('error', () => undefined);
      await events.waitUntilReady();
    };
    await listen('analysis-requests');
    await listen('worker-messages');

    // 실행기 기록은 고정 코드·식별자만 담는다(본문·주소 없음). 증거로 사건 이름만 모은다.
    const events = [];
    const logger = Object.fromEntries(['log', 'error', 'warn', 'debug', 'verbose', 'fatal'].map(level => [level, value => {
      if (value && typeof value === 'object' && typeof value.event === 'string') events.push({ level, ...value });
    }]));
    class VerifyModule {}
    // 보호 관측은 합성 대역이다. 실제 GitHub 관측·#105 정책 공급자가 아니다.
    Module({ imports: [AppModule, AnalysisQueueModule.register({ queue: config, contractDirectory: CONTRACT_DIR,
      observations: { observe: async context => ({ ownerId: context.memberId, repositoryId: context.repositoryId,
        githubRepository: { owner: 'catchu-synthetic-owner', name: 'catchu-synthetic-repo' },
        confirmedSourceState: { synthetic: true, visibility: 'PUBLIC' }, observationProvenance: { synthetic: true, provider: 'verify-script' },
        observedAt: new Date(), appliedRestriction: 'NONE' }) } })] })(VerifyModule);
    const app = await NestFactory.create(VerifyModule, { logger, abortOnError: false });
    closers.unshift(() => app.close());
    await app.init();
    const runner = app.get(AnalysisQueueRunner);
    const started = Date.now();
    runner.start();

    const requests = new Queue('analysis-requests', { connection: { url: config.redisUrl }, prefix: config.prefix });
    closers.unshift(() => requests.close());
    await waitFor(() => events.some(entry => entry.event === 'ANALYSIS_REQUEST_ENQUEUED'), '주기 보내기가 대기 시도를 넣음');
    const requestJob = await requests.getJob(values.attemptId);
    await waitFor(() => Object.hasOwn(completions, values.attemptId) || Object.hasOwn(failures, values.attemptId), 'worker가 요청 작업을 끝냄');
    const resultJobId = await waitFor(() => [...Object.keys(completions), ...Object.keys(failures)].find(isResultJob), 'api가 결과 작업을 끝냄');
    const label = resultJobId.slice('message-'.length, -`-${values.attemptId}-result`.length);
    // QueueEvents가 반환값을 JSON에서 풀어 준다.
    const receipt = completions[resultJobId] ?? null;
    const [state] = await db.query(`SELECT r.lifecycle, a.processing, a.application, a.owner_results_ready AS "ownerResultsReady",
      (SELECT count(*)::int FROM result_application_record) AS receipts, (SELECT count(*)::int FROM catch_asset) AS catches
      FROM analysis_request r JOIN analysis_attempt a ON a.attempt_id = r.current_attempt_id WHERE r.request_id = $1`, [values.requestId]);
    const evidence = {
      worker: workerKind, prefix: config.prefix, elapsedMs: Date.now() - started,
      requestJob: { id: values.attemptId, name: requestJob?.name, opts: requestJob && {
        attempts: requestJob.opts.attempts, backoff: requestJob.opts.backoff ?? null, stackTraceLimit: requestJob.opts.stackTraceLimit,
        removeOnComplete: requestJob.opts.removeOnComplete, removeOnFail: requestJob.opts.removeOnFail },
        messageValid: requestJob ? checkMessage('Request', requestJob.data).verdict : null,
        completed: completions[values.attemptId] ?? null,
        failedReason: failures[values.attemptId] ?? null },
      resultJob: { id: resultJobId, failedReason: failures[resultJobId] ?? null, receipt,
        receiptValid: receipt ? checkMessage('ResultReceipt', receipt).verdict : null,
        idsMatch: receipt ? receipt.requestId === values.requestId && receipt.attemptId === values.attemptId &&
          receipt.resultId === `result-${label}-${values.attemptId}` : false },
      db: state,
      apiEvents: events.map(({ level, event, code, decision, disposition, reason, stage }) =>
        Object.fromEntries(Object.entries({ level, event, code, decision, disposition, reason, stage }).filter(([, value]) => value !== undefined))),
      kitReadReceipt: workerKind === 'kit'
        ? `Q77_PREFIX=${config.prefix} Q77_REDIS_URL=<큐 주소> uv run --locked python py/tools.py read-receipt ${resultJobId}`
        : null,
    };
    console.log(JSON.stringify(evidence, null, 2));
    const ok = receipt?.disposition === 'ACCEPTED' && evidence.resultJob.receiptValid === 'VALID' && evidence.resultJob.idsMatch &&
      state.receipts === 1 && state.application === 'APPLIED' && state.lifecycle === 'CLOSED' && state.catches >= 1;
    console.error(ok ? '판정: 통과' : '판정: 실패(위 증거 확인)');
    return ok ? 0 : 1;
  } finally {
    for (const close of closers) await close().catch(() => undefined);
  }
}

main().then(code => { process.exitCode = code; }, error => {
  console.error(`검증 실패: ${error?.stage ?? 'unknown'} (${safeReason(error)})`);
  process.exitCode = 1;
});

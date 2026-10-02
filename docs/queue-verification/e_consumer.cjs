// E 쪽 실험 소비자: F→E 큐에서 진행 알림·결과를 꺼내 dev의 실제 E 수신 처리(AnalysisReceiver)에 넘긴다.
// 수신 확인(ResultReceipt)은 BullMQ 작업의 반환값으로 돌려준다. B 등록·반영은 하지 않는다.
//
// 환경변수: RUN_DIR, Q77_PREFIX, E_CRASH(after-commit), E_LOCK_MS, E_STALLED_MS, E_MAX_STALLED,
//          E_CONTEXT_SCOPE_REVISION(E 접수 맥락의 허용 범위 판본을 바꿔 결과를 거부하게 하는 시험용)
const { join } = require('node:path');
const { existsSync, readFileSync, writeFileSync } = require('node:fs');
const { isDeepStrictEqual } = require('node:util');
const { Worker } = require('bullmq');
const IORedis = require('ioredis');
const { REPO_ROOT, CONTRACT_DIR, EVENT_QUEUE, redisOptions, acceptedContext, attemptKey, appendLine } = require('./lib/common.cjs');
const { FileReceiverStore } = require('./lib/e-store.cjs');

const { AnalysisReceiver } = require(join(REPO_ROOT, 'api/dist/analysis-receiver/analysis-receiver.service.js'));
const { WorkerMessageValidator } = require(join(REPO_ROOT, 'api/dist/analysis-receiver/worker-message.validator.js'));

const runDir = process.env.RUN_DIR;
const prefix = process.env.Q77_PREFIX;
const crash = process.env.E_CRASH || '';
const log = (entry) => appendLine(join(runDir, 'e-log.jsonl'), { at: new Date().toISOString(), pid: process.pid, ...entry });

const context = acceptedContext();
if (process.env.E_CONTEXT_SCOPE_REVISION) context.scopeRevision = process.env.E_CONTEXT_SCOPE_REVISION;
const store = new FileReceiverStore(join(runDir, 'e-store.json'), context);
const rejections = [];
const receiver = new AnalysisReceiver(store, new WorkerMessageValidator(CONTRACT_DIR), {
  record: (kind, code) => rejections.push({ kind, code }),
});

// F가 전달 전에 보존한 결과와, 큐를 거쳐 받은 결과가 같은지(재전달 때 새로 붙는 messageId 제외) 본다.
function sameAsStored(result) {
  if (!result || typeof result.attemptId !== 'string') return null;
  const path = join(runDir, 'f-store', 'attempts', attemptKey(result.attemptId), 'result.json');
  if (!existsSync(path)) return null;
  const stored = JSON.parse(readFileSync(path, 'utf8'));
  const { messageId: a, ...left } = stored;
  const { messageId: b, ...right } = result;
  return isDeepStrictEqual(left, right);
}

async function handle(job) {
  if (job.name === 'ProcessingEvent') {
    const decision = await receiver.receiveProgress(job.data);
    log({ kind: 'ProcessingEvent', jobId: job.id, state: job.data && job.data.state, decision, attemptsStarted: job.attemptsStarted, stalledCounter: job.stalledCounter });
    return { decision };
  }
  if (job.name === 'Result') {
    const received = await receiver.receiveResult(job.data);
    const receipt = received.receipt;
    log({
      // bodyReturnedByReceiver: E 수신 처리가 등록 경로에 넘길 본문을 반환했는가. 실제 등록은 하지 않는다.
      kind: 'Result', jobId: job.id, resultId: job.data && job.data.resultId, disposition: receipt && receipt.disposition,
      code: receipt && receipt.code, bodyReturnedByReceiver: Boolean(received.accepted),
      sameAsStored: sameAsStored(job.data), attemptsStarted: job.attemptsStarted, stalledCounter: job.stalledCounter,
    });
    if (crash === 'after-commit') {
      // E 수신 기록은 커밋됐지만 큐 작업 완료(수신 확인 반환)는 하지 못한 채 죽는다.
      log({ kind: 'crash', point: 'after-commit-before-ack', jobId: job.id });
      process.kill(process.pid, 'SIGKILL');
    }
    return receipt;
  }
  log({ kind: 'unknown-message', jobId: job.id, name: job.name });
  return null;
}

const connection = new IORedis(redisOptions());
const worker = new Worker(EVENT_QUEUE, handle, {
  connection, prefix, concurrency: 1,
  lockDuration: Number(process.env.E_LOCK_MS || 30000),
  stalledInterval: Number(process.env.E_STALLED_MS || 30000),
  maxStalledCount: Number(process.env.E_MAX_STALLED || 1),
});
worker.on('ready', () => writeFileSync(join(runDir, `e-ready-${process.pid}`), ''));
worker.on('failed', (job, error) => log({ kind: 'job-failed', jobId: job && job.id, reason: error.message }));
worker.on('error', (error) => log({ kind: 'worker-error', message: error.message }));

async function shutdown() {
  await worker.close();
  await connection.quit();
  if (rejections.length) log({ kind: 'rejection-log', rejections });
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

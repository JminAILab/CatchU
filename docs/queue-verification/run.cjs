// #77 BullMQ 검증 실행기. 시나리오마다 큐 접두사·작업 폴더를 따로 두고, F(Python)·E(Node) 프로세스를
// 띄우고 죽이고 다시 띄우며 모의 분석 호출 횟수와 E 수신 상태를 기록한다. 제품 코드가 아니다.
//
// 사용: node run.cjs --engine <redis-7.2.11|valkey-7.2.11|valkey-8.1.6> [시나리오 접두사...]
//   --engine을 주면 실험 전용 컨테이너(catchu-q77-main, 127.0.0.1:6390)를 NCP와 비슷한 조건으로 띄우고 끝나면 지운다.
//   --engine 없이 실행하면 Q77_REDIS_URL의 서버를 그대로 쓴다(P 시나리오는 건너뜀).
// 결과: runs/<라벨>/summary*.json
//
// 판정 값: meets=true 충족, false 미충족, null 무효(observed.valid=false: 시험 전제가 성립하지 않음) 또는 건너뜀.
const { spawn, execFileSync } = require('node:child_process');
const { join } = require('node:path');
const { existsSync, openSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { isDeepStrictEqual } = require('node:util');
const { Queue, QueueEvents, Worker } = require('bullmq');
const IORedis = require('ioredis');
const {
  KIT_DIR, RUNS_DIR, REDIS_URL, REQUEST_QUEUE, EVENT_QUEUE, redisOptions, parseInfo, attemptKey, readJsonLines, ensureDir, listFiles,
} = require('./lib/common.cjs');

const PYTHON = join(KIT_DIR, '.venv/bin/python');
const FAST = { lock: 2000, stalled: 1000 }; // 중단 복구를 빨리 보려고 줄인 값. 제품 값이 아니다.
const TERMINAL_STATES = ['SUCCEEDED', 'EMPTY', 'PARTIAL_FAILED', 'FAILED'];
const QUIET_MS = FAST.lock + FAST.stalled * 2; // "더 일어나는 일이 없음"을 보는 관찰 구간
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// NCP Cloud DB for Cache가 공개한 조건 중 로컬에서 흉내 낼 수 있는 것: 사용 불가 명령 10개, 상시 영속성 없음(확인 안 됨 →
// 보수적으로 끔). maxmemory-policy는 BullMQ 요구값인 noeviction으로 둔다(NCP 기본값은 미확인).
const NCP_BLOCKED = ['BGREWRITEAOF', 'BGSAVE', 'SAVE', 'SLAVEOF', 'FLUSHALL', 'FLUSHDB', 'CONFIG', 'KEYS', 'MIGRATE', 'SHUTDOWN'];
const NCP_LIKE_ARGS = ['--appendonly', 'no', '--save', '', '--maxmemory-policy', 'noeviction',
  ...NCP_BLOCKED.flatMap((command) => ['--rename-command', command, ''])];
const ENGINES = {
  'redis-7.2.11': { image: 'redis:7.2.11-alpine', server: 'redis-server' },
  'valkey-7.2.11': { image: 'valkey/valkey:7.2.11-alpine', server: 'valkey-server' },
  'valkey-8.1.6': { image: 'valkey/valkey:8.1.6-alpine', server: 'valkey-server' },
};

const argv = process.argv.slice(2);
const engineIndex = argv.indexOf('--engine');
const ENGINE = engineIndex >= 0 ? argv[engineIndex + 1] : null;
const FILTERS = argv.filter((_, index) => engineIndex < 0 || (index !== engineIndex && index !== engineIndex + 1));
const LABEL = process.env.Q77_LABEL || (ENGINE ? `${ENGINE}-ncp-like` : 'external');

async function waitFor(check, timeoutMs, what) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > until) throw new Error(`시간 초과: ${what}`);
    await sleep(100);
  }
}

const settles = (promise) => promise.then(() => true, () => false);

function docker(args) {
  return execFileSync('docker', args, { encoding: 'utf8' }).trim();
}

async function startContainer(name, port, serverArgs) {
  const engine = ENGINES[ENGINE];
  docker(['rm', '-f', '-v', name]); // -v: 이미지가 만든 익명 볼륨도 지운다
  docker(['run', '-d', '--name', name, '-p', `127.0.0.1:${port}:6379`, engine.image, engine.server, ...serverArgs]);
  const url = `redis://127.0.0.1:${port}`;
  await waitForPing(url);
  return url;
}

async function waitForPing(url) {
  await waitFor(async () => {
    const client = new IORedis({ ...redisOptions(url), lazyConnect: true, retryStrategy: () => null });
    client.on('error', () => {});
    try { await client.connect(); return (await client.ping()) === 'PONG'; } catch { return false; } finally { client.disconnect(); }
  }, 20000, `${url} 응답`);
}

class Run {
  constructor(id, redisUrl = REDIS_URL) {
    this.id = id;
    this.redisUrl = redisUrl;
    this.dir = join(RUNS_DIR, LABEL, id);
    rmSync(this.dir, { recursive: true, force: true });
    ensureDir(this.dir);
    this.prefix = `q77-${id}`.replace(/[^A-Za-z0-9-]/g, '-');
    this.connection = new IORedis(redisOptions(redisUrl));
    this.connection.on('error', () => {}); // 장애 시나리오에서 재연결 중 오류는 예상된 것이다.
    this.requests = new Queue(REQUEST_QUEUE, { connection: this.connection, prefix: this.prefix });
    this.events = new Queue(EVENT_QUEUE, { connection: this.connection, prefix: this.prefix });
    this.children = new Set();
  }

  env(extra) {
    return { ...process.env, RUN_DIR: this.dir, Q77_PREFIX: this.prefix, Q77_REDIS_URL: this.redisUrl, ...extra };
  }

  spawnProcess(kind, command, args, env) {
    const before = new Set(listFiles(this.dir).filter((name) => name.startsWith(`${kind}-ready-`)));
    const fd = openSync(join(this.dir, `${kind}-${Date.now()}.log`), 'a');
    const child = spawn(command, args, { cwd: KIT_DIR, env: this.env(env), stdio: ['ignore', fd, fd] });
    child.exited = new Promise((resolve) => child.on('exit', (code, signal) => resolve({ code, signal })));
    this.children.add(child);
    child.exited.then(() => this.children.delete(child));
    child.ready = waitFor(() => listFiles(this.dir).some((name) => name.startsWith(`${kind}-ready-`) && !before.has(name)),
      20000, `${kind} 준비`);
    return child;
  }

  startF(env = {}) { return this.spawnProcess('f', PYTHON, ['py/f_worker.py'], env); }
  startE(env = {}) { return this.spawnProcess('e', process.execPath, ['e_consumer.cjs'], env); }
  startEcho() { return this.spawnProcess('echo', PYTHON, ['py/echo_worker.py'], {}); }

  python(args) {
    return execFileSync(PYTHON, args, { cwd: KIT_DIR, env: this.env({}), encoding: 'utf8' }).trim();
  }

  calls() { return readJsonLines(join(this.dir, 'analysis-calls.jsonl')).length; }
  eLog() { return readJsonLines(join(this.dir, 'e-log.jsonl')); }
  fLog() { return readJsonLines(join(this.dir, 'f-log.jsonl')); }
  eResults() { return this.eLog().filter((e) => e.kind === 'Result'); }
  eStore() {
    const path = join(this.dir, 'e-store.json');
    return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
  }

  // F 보호 worker의 시도별 기록 폴더(폴더 이름은 attemptId의 해시 키)
  folder(attemptId) { return join(this.dir, 'f-store', 'attempts', attemptKey(attemptId)); }
  attemptFiles(attemptId) {
    const dir = this.folder(attemptId);
    const has = (name) => existsSync(join(dir, name));
    return {
      request: has('request.json'), started: has('started'), result: has('result.json'),
      sent: readJsonLines(join(dir, 'sent.jsonl')).length, uncertainSent: readJsonLines(join(dir, 'uncertain-sent.jsonl')).length,
      delivered: has('delivered'), rejected: has('rejected'), needsHuman: has('needs-human'),
    };
  }
  stored(attemptId) {
    const path = join(this.folder(attemptId), 'result.json');
    return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
  }
  sentLog(attemptId) { return readJsonLines(join(this.folder(attemptId), 'sent.jsonl')); }

  async stopAll() {
    for (const child of [...this.children]) {
      child.kill('SIGTERM');
      const done = await Promise.race([child.exited, sleep(5000).then(() => null)]);
      if (!done) { child.kill('SIGKILL'); await child.exited; }
    }
  }

  async close() {
    await this.stopAll();
    await this.requests.obliterate({ force: true }).catch(() => {});
    await this.events.obliterate({ force: true }).catch(() => {});
    await this.requests.close().catch(() => {});
    await this.events.close().catch(() => {});
    this.connection.disconnect();
  }
}

function syntheticRequest(run) {
  return JSON.parse(run.python(['py/tools.py', 'synthetic-request']));
}

function summarizeE(run) {
  const store = run.eStore();
  const results = run.eResults();
  return {
    eProcessing: store && store.processing,
    eApplication: store && store.application,
    eObserved: store ? store.observations.map((o) => o.state) : [],
    resultReceipts: results.map((e) => `${e.disposition}/${e.code}`),
    bodyReturnedByReceiver: results.map((e) => e.bodyReturnedByReceiver),
    sameAsStored: results.map((e) => e.sameAsStored),
  };
}

const F_ACTION_KINDS = ['skip-analysis', 'stalled', 'job-failed', 'process-error', 'worker-error', 'delivery-check',
  'attempt-error', 'invalid-receipt', 'recheck-deferred', 'recheck-error'];

function fSummary(run) {
  const log = run.fLog();
  return {
    fActions: log.filter((l) => F_ACTION_KINDS.includes(l.kind)).map((l) => {
      if (l.kind === 'delivery-check') return `delivery-check(${l.reason}):${l.state}`;
      if (l.kind === 'skip-analysis') return `skip:${l.why}${l.delivery ? `:${l.delivery}` : ''}`;
      return `${l.kind}${l.reason ? `:${String(l.reason).slice(0, 80)}` : ''}`;
    }),
    fJobResults: log.filter((l) => l.kind === 'job-completed').map((l) => l.action),
    fSent: log.filter((l) => l.kind === 'sent').map((l) => l.state || l.name),
  };
}

const jobStarts = (run, jobId) => run.fLog().filter((l) => l.kind === 'job-start' && l.jobId === jobId);
const jobCompletions = (run, jobId) => run.fLog().filter((l) => l.kind === 'job-completed' && l.jobId === jobId);

// 요청 작업이 끝날 때까지 기다린다. removeOnComplete로 지워진 작업은 F의 완료 기록 횟수로 판단한다.
async function settleRequest(run, jobId, { completions = 1 } = {}) {
  await waitFor(async () => {
    const done = run.fLog().filter((l) => ['job-completed', 'job-failed'].includes(l.kind) && l.jobId === jobId).length;
    if (done < completions) return false;
    const state = await run.requests.getJobState(jobId);
    return ['completed', 'failed', 'unknown'].includes(state);
  }, 30000, `요청 작업 ${jobId} 종료`);
}

// 두 큐에 기다리거나 처리 중인 작업이 없을 때까지 기다린다(E가 떠 있을 때만 쓴다).
async function drained(run, what = '큐 비움') {
  const busy = async (queue) => {
    const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'prioritized');
    return Object.values(counts).some((n) => n > 0);
  };
  await waitFor(async () => !(await busy(run.requests)) && !(await busy(run.events)), 30000, what);
}

// Result 작업의 반환값(수신 확인)이 생길 때까지 기다린다.
async function waitReceipt(run, messageId, timeoutMs = 20000) {
  return waitFor(async () => {
    const job = await run.events.getJob(messageId);
    return job && job.returnvalue ? job.returnvalue : null;
  }, timeoutMs, `수신 확인 ${messageId}`);
}

async function jobIds(queue) {
  const jobs = await queue.getJobs(['waiting', 'active', 'completed', 'failed', 'delayed', 'prioritized']);
  return jobs.filter(Boolean).map((job) => job.id).sort();
}

async function eventJobCount(run) {
  return (await run.events.getJobs(['waiting', 'active', 'completed', 'failed', 'delayed'])).filter(Boolean).length;
}

const isoAgo = (ms) => new Date(Date.now() - ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

// ---------------------------------------------------------------------------------------------
// A. Node↔Python 연결
// ---------------------------------------------------------------------------------------------

function edgeRequest(base) {
  const text = '한글 선정 참조 🙂 "따옴표" \\ 역슬래시\n줄바꿈 구분자\t탭';
  return {
    ...base,
    messageId: `${base.messageId}-edge-한글`,
    allowedScope: { ...base.allowedScope, allowedResourceTypes: [], selectionReference: text },
    credentialContextReference: `참조-${text}`,
  };
}

const TYPE_PROBE = {
  zero: 0, negative: -1, maxSafe: 9007199254740991, fraction: 1.5, yes: true, no: false, nothing: null,
  emptyList: [], emptyObject: {}, nested: { list: [1, '둘', null, [], {}] }, korean: '한글', emoji: '🙂', empty: '',
};

async function scenarioEcho(run) {
  const request = syntheticRequest(run);
  const template = JSON.parse(readFileSync(join(KIT_DIR, '../../worker/fixtures/m1-synthetic/results/succeeded-one-candidate.json'), 'utf8'));
  const cases = [
    { name: 'synthetic-request', schema: 'Request', message: request },
    { name: 'edge-request', schema: 'Request', message: edgeRequest(request) },
    { name: 'result-template', schema: null, message: template },
    { name: 'type-probe', schema: null, message: TYPE_PROBE },
  ];
  const echo = run.startEcho();
  await echo.ready;
  const queue = new Queue('interop-echo', { connection: run.connection, prefix: run.prefix });
  const events = new QueueEvents('interop-echo', { connection: redisOptions(run.redisUrl), prefix: run.prefix });
  await events.waitUntilReady();
  const back = [];
  const backWorker = new Worker('interop-back', async (job) => { back.push(job.data); }, { connection: redisOptions(run.redisUrl), prefix: run.prefix });
  const rows = [];
  for (const item of cases) {
    const job = await queue.add(item.name, { schema: item.schema, message: item.message }, { jobId: `echo-${item.name}` });
    const reply = await job.waitUntilFinished(events, 15000);
    const backReply = await waitFor(() => back.find((b) => b.jobId === job.id), 10000, 'Python 생산자 → Node 소비자');
    rows.push({
      case: item.name,
      schema: item.schema,
      pythonVerdict: reply.verdict,
      nodeToPythonToReturnValueEqual: isDeepStrictEqual(reply.message, item.message),
      pythonProducerToNodeEqual: isDeepStrictEqual(backReply.message, item.message),
      pythonTypes: item.name === 'type-probe' ? reply.types : undefined,
    });
  }
  await backWorker.close();
  await events.close();
  await queue.obliterate({ force: true });
  await queue.close();
  // Request는 worker 계약 검사를 반드시 거쳐 VALID여야 한다(검사를 건너뛴 null은 통과가 아니다).
  const meets = rows.every((r) => r.nodeToPythonToReturnValueEqual && r.pythonProducerToNodeEqual &&
    (r.schema ? r.pythonVerdict === 'VALID' : r.pythonVerdict === null));
  return { requirement: '왕복 값이 그대로이고 Request는 worker 계약 검사 VALID', observed: { rows }, meets };
}

// 합성 시나리오별 기대 종결값과 실패 단계. F 보존본이 아니라 시나리오 정의(fake_generator·합성 결과 세트)에서 정한다.
const PROCESS_EXPECT = {
  'succeeded-one-candidate': { outcome: 'SUCCEEDED', stages: [] },
  empty: { outcome: 'EMPTY', stages: [] },
  'partial-failed': { outcome: 'PARTIAL_FAILED', stages: ['COLLECTION'] },
  failed: { outcome: 'FAILED', stages: ['COLLECTION'] },
  'draft-failed': { outcome: 'PARTIAL_FAILED', stages: ['DRAFT'] },
  'reflection-failed': { outcome: 'PARTIAL_FAILED', stages: ['REFLECTION'] },
  'execution-unknown': { outcome: null },
};

function processScenario(fakeScenario) {
  const expected = PROCESS_EXPECT[fakeScenario];
  return async (run) => {
    const e = run.startE();
    const f = run.startF({ F_MODE: 'guarded', F_SCENARIO: fakeScenario });
    await Promise.all([e.ready, f.ready]);
    const request = syntheticRequest(run);
    await run.requests.add('Request', request, { jobId: request.attemptId });
    await settleRequest(run, request.attemptId);
    const stored = run.stored(request.attemptId);
    let receipt = null;
    if (expected.outcome) {
      await waitReceipt(run, stored.messageId);
      receipt = JSON.parse(run.python(['py/tools.py', 'read-receipt', stored.messageId]));
    }
    await drained(run);
    const observed = {
      expectedOutcome: expected.outcome, expectedFailureStages: expected.stages,
      calls: run.calls(), requestJob: await run.requests.getJobState(request.attemptId), ...summarizeE(run),
      fOutcome: stored && stored.outcome, fFailureStages: stored ? stored.failures.map((x) => x.stage).sort() : null,
      receiptReadByPython: receipt && receipt.returnvalue && `${receipt.returnvalue.disposition}/${receipt.returnvalue.code}`,
    };
    const meets = expected.outcome === null
      ? observed.calls === 1 && stored === null && observed.resultReceipts.length === 0 &&
        observed.eObserved.join() === 'RECEIVED,RUNNING,UNCERTAIN'
      : observed.calls === 1 && observed.requestJob === 'completed' && observed.resultReceipts.join() === 'ACCEPTED/OK' &&
        observed.sameAsStored.join() === 'true' && observed.bodyReturnedByReceiver.join() === 'true' &&
        observed.fOutcome === expected.outcome && observed.eProcessing === expected.outcome &&
        isDeepStrictEqual(observed.fFailureStages, [...expected.stages].sort()) &&
        observed.eApplication === 'PENDING' && observed.receiptReadByPython === 'ACCEPTED/OK';
    return {
      requirement: expected.outcome === null
        ? '분석 1회, 결과 없음, E가 RECEIVED·RUNNING·UNCERTAIN을 받음'
        : `분석 1회, 종결값 ${expected.outcome}·실패 단계 [${expected.stages}], E ACCEPTED, 큐를 거친 결과가 F 보존본과 같음, Python이 수신 확인을 읽음`,
      observed, meets,
    };
  };
}

// ---------------------------------------------------------------------------------------------
// B. 중복 전달
// ---------------------------------------------------------------------------------------------

function duplicateScenario({ mode, removeOnComplete, secondJobId }) {
  return async (run) => {
    const e = run.startE();
    const f = run.startF({ F_MODE: mode });
    await Promise.all([e.ready, f.ready]);
    const request = syntheticRequest(run);
    const first = await run.requests.add('Request', request, { jobId: request.attemptId, removeOnComplete });
    await settleRequest(run, first.id);
    await waitReceipt(run, run.stored(request.attemptId).messageId);
    const secondId = secondJobId ? `${request.attemptId}-republish` : request.attemptId;
    const second = await run.requests.add('Request', { ...request }, { jobId: secondId, removeOnComplete });
    const secondState = await run.requests.getJobState(second.id);
    const queueIgnored = secondId === first.id && !removeOnComplete; // 완료 작업이 남아 있으면 큐가 두 번째 추가를 버린다
    if (!queueIgnored) await settleRequest(run, second.id, { completions: secondId === first.id ? 2 : 1 });
    await drained(run);
    const starts = jobStarts(run, second.id).length;
    const completions = jobCompletions(run, second.id);
    const secondAction = completions.length ? completions[completions.length - 1].action : null;
    const observed = {
      firstAdd: first.id, secondAdd: second.id, secondStateRightAfterAdd: secondState, secondJobStarts: starts, secondAction,
      requestJobsInRedis: await jobIds(run.requests), calls: run.calls(), ...summarizeE(run), ...fSummary(run),
    };
    // 시험 전제: 큐가 버리는 경우는 두 번째가 처리되지 않았어야 하고, 그 밖에는 두 번째 작업이 실제로 처리·완료됐어야 한다.
    observed.valid = queueIgnored
      ? secondState === 'completed' && starts === 1
      : starts === (secondId === first.id ? 2 : 1) && secondAction !== null;
    const guardOk = mode !== 'guarded' || queueIgnored ||
      (secondAction === 'result-already-stored' && observed.fActions.includes('skip:result-stored:delivered'));
    const meets = observed.valid ? observed.calls === 1 && guardOk && observed.resultReceipts.join() === 'ACCEPTED/OK' : null;
    return {
      requirement: mode === 'guarded'
        ? '같은 요청이 두 번 전달돼도 분석 1회, 두 번째는 보존 결과 분기로 가고 이미 수락된 결과는 다시 보내지 않음'
        : '같은 요청이 두 번 전달돼도 분석 1회',
      observed, meets,
    };
  };
}

async function scenarioDedupOption(run) {
  const request = syntheticRequest(run);
  const events = new QueueEvents(REQUEST_QUEUE, { connection: redisOptions(run.redisUrl), prefix: run.prefix });
  await events.waitUntilReady();
  const deduplicated = [];
  events.on('deduplicated', (args) => deduplicated.push(args));
  const opts = { deduplication: { id: request.attemptId } };
  const a = await run.requests.add('Request', request, opts);
  const b = await run.requests.add('Request', request, opts);
  const whileWaiting = await jobIds(run.requests);
  const e = run.startE();
  const f = run.startF({ F_MODE: 'guarded' });
  await Promise.all([e.ready, f.ready]);
  await settleRequest(run, a.id);
  const c = await run.requests.add('Request', request, opts);
  await settleRequest(run, c.id);
  await drained(run);
  await events.close();
  const thirdCompletion = jobCompletions(run, c.id);
  const observed = {
    firstAdd: a.id, secondAddWhileWaiting: b.id, jobsWhileWaiting: whileWaiting, deduplicatedEvents: deduplicated.length,
    thirdAddAfterCompletion: c.id, thirdAction: thirdCompletion.length ? thirdCompletion[0].action : null,
    requestJobsInRedis: await jobIds(run.requests), calls: run.calls(), ...summarizeE(run), ...fSummary(run),
  };
  const meets = whileWaiting.length === 1 && c.id !== a.id && observed.thirdAction === 'result-already-stored' &&
    observed.calls === 1 && observed.resultReceipts.join() === 'ACCEPTED/OK';
  return { requirement: '대기 중 두 번째 추가는 무시되고, 완료 뒤 추가는 새 작업이 되며(큐 중복 방지 해제), 보호 F는 보존 결과 분기로 분석 1회', observed, meets };
}

// 같은 시도 ID로 내용이 다른 요청이 다시 오면 보존 결과를 주지도, 분석하지도 않는다.
async function scenarioRequestMismatch(run) {
  const e = run.startE();
  const f = run.startF({ F_MODE: 'guarded' });
  await Promise.all([e.ready, f.ready]);
  const request = syntheticRequest(run);
  await run.requests.add('Request', request, { jobId: request.attemptId });
  await settleRequest(run, request.attemptId);
  await waitReceipt(run, run.stored(request.attemptId).messageId);
  const changed = { ...request, messageId: `${request.messageId}-changed`, requestedAt: isoAgo(0) };
  const second = await run.requests.add('Request', changed, { jobId: `${request.attemptId}-changed` });
  await settleRequest(run, second.id);
  await drained(run);
  const completion = jobCompletions(run, second.id);
  const observed = {
    secondAction: completion.length ? completion[0].action : null, calls: run.calls(),
    sentCount: run.attemptFiles(request.attemptId).sent, ...summarizeE(run), ...fSummary(run),
  };
  const meets = observed.secondAction === 'request-mismatch' && observed.calls === 1 && observed.sentCount === 1 &&
    observed.resultReceipts.join() === 'ACCEPTED/OK';
  return { requirement: '같은 시도 ID·다른 내용의 요청은 분석·재전송 없이 멈춤(사람 확인)', observed, meets };
}

// ---------------------------------------------------------------------------------------------
// C. worker 중단과 재기동
// ---------------------------------------------------------------------------------------------

// 중단 지점별 시험 전제(죽은 직후 기록 상태)와 기대 결과.
//   before-call  생성기 호출 전 → 다시 실행해 정상 종결
//   after-marker 시작 표식 뒤·분석 호출 전(보호 F만) → 분석 없이 UNCERTAIN
//   during-call  분석 호출 중 → UNCERTAIN
//   before-store 분석 끝·결과 보존 전(보호 F만) → UNCERTAIN
//   after-store  결과 보존 뒤·전송 전 → 보존 결과를 보내 수락
const CRASH_POINTS = {
  'before-call': { callsByCrashed: 0, started: false, result: false, expect: 'terminal', totalCalls: 1 },
  'after-marker': { callsByCrashed: 0, started: true, result: false, expect: 'uncertain', totalCalls: 0 },
  'during-call': { callsByCrashed: 1, started: true, result: false, expect: 'uncertain', totalCalls: 1 },
  'before-store': { callsByCrashed: 1, started: true, result: false, expect: 'uncertain', totalCalls: 1 },
  'after-store': { callsByCrashed: 1, started: true, result: true, expect: 'stored-accepted', totalCalls: 1 },
};

function crashScenario({ mode, maxStalled, point }) {
  const spec = CRASH_POINTS[point];
  return async (run) => {
    const fEnv = { F_MODE: mode, F_LOCK_MS: String(FAST.lock), F_STALLED_MS: String(FAST.stalled), F_MAX_STALLED: String(maxStalled) };
    const e = run.startE();
    const f1 = run.startF({ ...fEnv, F_CRASH: point });
    await Promise.all([e.ready, f1.ready]);
    const request = syntheticRequest(run);
    await run.requests.add('Request', request, { jobId: request.attemptId });
    const exit = await Promise.race([f1.exited, sleep(15000).then(() => null)]);
    const atCrash = run.attemptFiles(request.attemptId);
    const crashLog = run.fLog().find((l) => l.kind === 'crash' && l.pid === f1.pid);
    const callsByCrashed = readJsonLines(join(run.dir, 'analysis-calls.jsonl')).filter((c) => c.pid === f1.pid).length;
    const stateAtCrash = await run.requests.getJobState(request.attemptId);
    const f2 = run.startF(fEnv);
    await f2.ready;
    await waitFor(async () => ['completed', 'failed'].includes(await run.requests.getJobState(request.attemptId)), 20000, '요청 작업 종료');
    await drained(run);
    await sleep(QUIET_MS); // 늦은 재실행·재전송이 없는지 보는 관찰 구간
    await drained(run);
    const job = await run.requests.getJob(request.attemptId);
    const files = run.attemptFiles(request.attemptId);
    const observed = {
      crashExit: exit && exit.signal, crashLogPoint: crashLog && crashLog.point, callsByCrashedProcess: callsByCrashed,
      filesAtCrash: atCrash, stateAtCrash, expected: spec.expect,
      calls: run.calls(), requestJob: await run.requests.getJobState(request.attemptId),
      failedReason: job && job.failedReason, attemptsStarted: job && job.attemptsStarted, stalledCounter: job && job.stalledCounter,
      filesAfter: files, ...summarizeE(run), ...fSummary(run),
    };
    // 시험 전제: 지정한 지점에서 죽었는지 — 죽은 프로세스의 기록·분석 호출 수·시도 기록 상태가 그 지점과 맞아야 한다.
    observed.valid = Boolean(exit && exit.signal === 'SIGKILL') && observed.crashLogPoint === point &&
      callsByCrashed === spec.callsByCrashed && atCrash.result === spec.result && atCrash.sent === 0 &&
      atCrash.started === (mode === 'guarded' && spec.started);
    const receipts = observed.resultReceipts.join();
    const outcomes = {
      terminal: observed.calls === spec.totalCalls && receipts === 'ACCEPTED/OK' && observed.eProcessing === 'SUCCEEDED' &&
        observed.sameAsStored.join() === 'true',
      uncertain: observed.calls === spec.totalCalls && receipts === '' && !files.result && observed.eObserved.includes('UNCERTAIN'),
      'stored-accepted': observed.calls === spec.totalCalls && receipts === 'ACCEPTED/OK' && observed.eProcessing === 'SUCCEEDED' &&
        observed.sameAsStored.join() === 'true',
    };
    return {
      requirement: {
        terminal: '분석 전 중단 → 다시 실행해 분석 1회·정상 종결·E 수락',
        uncertain: `분석 재실행 없음(호출 ${spec.totalCalls}회), 결과 없음, E가 UNCERTAIN을 받음`,
        'stored-accepted': '분석 재실행 없음(호출 1회), 보존 결과를 보내 E 수락',
      }[spec.expect],
      observed, meets: observed.valid ? outcomes[spec.expect] : null,
    };
  };
}

// ---------------------------------------------------------------------------------------------
// D. 결과 전달·수신 확인
// ---------------------------------------------------------------------------------------------

async function normalRun(run, eEnv = {}, fEnv = {}) {
  const e = run.startE(eEnv);
  const f = run.startF({ F_MODE: 'guarded', ...fEnv });
  await Promise.all([e.ready, f.ready]);
  const request = syntheticRequest(run);
  await run.requests.add('Request', request, { jobId: request.attemptId });
  return { request, e, f };
}

async function scenarioResend(run) {
  const { request } = await normalRun(run);
  await settleRequest(run, request.attemptId);
  await waitReceipt(run, run.stored(request.attemptId).messageId);
  run.python(['py/tools.py', 'resend', request.attemptId]);
  const sent = await waitFor(() => { const lines = run.sentLog(request.attemptId); return lines.length >= 2 && lines; }, 10000, '재전송 기록');
  await waitReceipt(run, sent[1].messageId);
  const receipt = JSON.parse(run.python(['py/tools.py', 'read-receipt', sent[1].messageId]));
  const observed = {
    calls: run.calls(), ...summarizeE(run), resentMessageId: sent[1].messageId,
    receiptReadByPython: `${receipt.returnvalue.disposition}/${receipt.returnvalue.code}`,
  };
  const meets = observed.calls === 1 && observed.resultReceipts.join() === 'ACCEPTED/OK,DUPLICATE/ALREADY_RECEIVED' &&
    observed.sameAsStored.join() === 'true,true' && observed.receiptReadByPython === 'DUPLICATE/ALREADY_RECEIVED';
  return { requirement: '보존 결과 재전달은 분석 없이 같은 결과로, E는 DUPLICATE', observed, meets };
}

async function scenarioECrashAfterCommit(run) {
  const eFast = { E_LOCK_MS: String(FAST.lock), E_STALLED_MS: String(FAST.stalled), E_MAX_STALLED: '1' };
  const { e, request } = await normalRun(run, { ...eFast, E_CRASH: 'after-commit' });
  const exit = await Promise.race([e.exited, sleep(20000).then(() => null)]);
  const storeAfterCrash = run.eStore();
  const e2 = run.startE(eFast);
  await e2.ready;
  const messageId = run.stored(request.attemptId).messageId;
  const finalReceipt = await waitReceipt(run, messageId);
  await drained(run);
  const resultJob = await run.events.getJob(messageId);
  const observed = {
    crashExit: exit && exit.signal, eApplicationAfterCrash: storeAfterCrash.application, calls: run.calls(), ...summarizeE(run),
    resultJobState: resultJob && await resultJob.getState(), resultJobStalledCounter: resultJob && resultJob.stalledCounter,
    finalReturnValue: `${finalReceipt.disposition}/${finalReceipt.code}`,
  };
  observed.valid = observed.crashExit === 'SIGKILL' && observed.eApplicationAfterCrash === 'PENDING';
  const meets = observed.valid ? observed.calls === 1 && observed.resultReceipts.join() === 'ACCEPTED/OK,DUPLICATE/ALREADY_RECEIVED' &&
    observed.resultJobState === 'completed' && observed.finalReturnValue === 'DUPLICATE/ALREADY_RECEIVED' : null;
  return { requirement: '수신 확인 반환 전 E가 죽으면 큐가 결과를 다시 주고, E는 DUPLICATE로 수렴, 분석 1회(등록 중복은 시험 안 함)', observed, meets };
}

async function scenarioEDown(run) {
  const f = run.startF({ F_MODE: 'guarded' });
  await f.ready;
  const request = syntheticRequest(run);
  await run.requests.add('Request', request, { jobId: request.attemptId });
  await settleRequest(run, request.attemptId);
  const stored = run.stored(request.attemptId);
  const before = JSON.parse(run.python(['py/tools.py', 'read-receipt', stored.messageId]));
  await sleep(3000); // E가 꺼져 있는 시간
  const e = run.startE();
  await e.ready;
  await waitReceipt(run, stored.messageId);
  const after = JSON.parse(run.python(['py/tools.py', 'read-receipt', stored.messageId]));
  const observed = {
    calls: run.calls(), receiptBeforeE: `${before.state}/${before.returnvalue}`,
    receiptAfterE: `${after.state}/${after.returnvalue && after.returnvalue.disposition}`, ...summarizeE(run),
  };
  const meets = observed.calls === 1 && before.state === 'waiting' && before.returnvalue === null &&
    observed.receiptAfterE === 'completed/ACCEPTED' && observed.resultReceipts.join() === 'ACCEPTED/OK';
  return { requirement: 'E가 꺼진 동안 결과는 큐에서 기다리고(수신 확인 없음 = 실패 아님), E 기동 뒤 ACCEPTED, 분석 1회', observed, meets };
}

async function scenarioLateEvent(run) {
  const { request } = await normalRun(run);
  await settleRequest(run, request.attemptId);
  await waitReceipt(run, run.stored(request.attemptId).messageId);
  const late = {
    schemaVersion: '1', messageId: `event-late-${request.attemptId}-running`, requestId: request.requestId,
    attemptId: request.attemptId, state: 'RUNNING', observedAt: isoAgo(60000),
  };
  await run.events.add('ProcessingEvent', late, { jobId: late.messageId });
  await waitFor(() => run.eLog().some((l) => l.jobId === late.messageId), 10000, '늦은 진행 알림 처리');
  const decision = run.eLog().find((l) => l.jobId === late.messageId).decision;
  const observed = { lateEventDecision: decision, ...summarizeE(run) };
  return { requirement: '종결 뒤 늦은 RUNNING은 상태를 되돌리지 않음', observed, meets: decision === 'TERMINAL_UNCHANGED' && observed.eProcessing === 'SUCCEEDED' };
}

// ---------------------------------------------------------------------------------------------
// G. 기록 수명보다 오래된 요청
// ---------------------------------------------------------------------------------------------

async function scenarioTooOld(run) {
  const e = run.startE();
  const f = run.startF({ F_MODE: 'guarded', F_MAX_REQUEST_AGE_SECONDS: '60' });
  await Promise.all([e.ready, f.ready]);
  const request = { ...syntheticRequest(run), requestedAt: isoAgo(2 * 3600 * 1000) };
  await run.requests.add('Request', request, { jobId: request.attemptId });
  await settleRequest(run, request.attemptId);
  await drained(run);
  const completion = jobCompletions(run, request.attemptId);
  const observed = {
    requestedAt: request.requestedAt, maxAgeSeconds: 60, action: completion.length ? completion[0].action : null,
    calls: run.calls(), files: run.attemptFiles(request.attemptId), ...summarizeE(run),
  };
  const meets = observed.action === 'too-old' && observed.calls === 0 && !observed.files.request && !observed.files.started &&
    observed.eObserved.join() === 'UNCERTAIN' && observed.eProcessing === 'UNCERTAIN' && observed.resultReceipts.length === 0;
  return { requirement: '시도 기록이 없고 접수 시각이 기록 수명보다 오래된 요청은 분석하지 않고 UNCERTAIN', observed, meets };
}

// ---------------------------------------------------------------------------------------------
// L. 살아 있는 worker의 잠금 상실
// ---------------------------------------------------------------------------------------------

function lockLossScenario({ mode, runIn }) {
  const expectStall = runIn === 'loop';
  return async (run) => {
    const e = run.startE();
    const f = run.startF({
      F_MODE: mode, F_RUN_IN: runIn, F_ANALYSIS_SECONDS: '6',
      F_LOCK_MS: String(FAST.lock), F_STALLED_MS: String(FAST.stalled), F_MAX_STALLED: '1',
    });
    await Promise.all([e.ready, f.ready]);
    const request = syntheticRequest(run);
    await run.requests.add('Request', request, { jobId: request.attemptId });
    await waitFor(async () => ['completed', 'failed'].includes(await run.requests.getJobState(request.attemptId)), 40000, '요청 작업 종료');
    await drained(run);
    await sleep(QUIET_MS); // 늦은 재실행이 없는지 보는 관찰 구간
    await drained(run);
    const job = await run.requests.getJob(request.attemptId);
    const observed = {
      calls: run.calls(), requestJob: await run.requests.getJobState(request.attemptId), failedReason: job && job.failedReason,
      attemptsStarted: job && job.attemptsStarted, stalledCounter: job && job.stalledCounter,
      stalledEvents: run.fLog().filter((l) => l.kind === 'stalled').length, ...summarizeE(run), ...fSummary(run),
    };
    const lostLock = observed.stalledCounter > 0 || observed.stalledEvents > 0;
    // 시험 전제: 이벤트 루프를 막는 구성은 실제로 잠금을 잃었어야 한다. 별도 스레드 구성은 잠금을 잃지 않아야 하는 것이 관찰 대상이다.
    observed.valid = expectStall ? lostLock : true;
    const accepted = observed.resultReceipts.filter((r) => r === 'ACCEPTED/OK').length;
    const meets = observed.valid ? observed.calls === 1 && observed.requestJob === 'completed' && accepted === 1 &&
      observed.resultReceipts.every((r) => r === 'ACCEPTED/OK' || r === 'DUPLICATE/ALREADY_RECEIVED') && (expectStall || !lostLock) : null;
    return {
      requirement: expectStall
        ? '분석(6초)이 잠금 시간(2초)보다 길어 잠금을 잃어도 분석 1회, 요청 작업 완료, E 수락 1회'
        : '분석(6초)을 별도 스레드에서 돌리면 잠금을 잃지 않고 분석 1회, 요청 작업 완료, E 수락',
      observed, meets,
    };
  };
}

// ---------------------------------------------------------------------------------------------
// P. 큐 저장소 조건 — 별도 컨테이너(127.0.0.1:6391)를 띄웠다 지운다
// ---------------------------------------------------------------------------------------------

const AUX = { name: 'catchu-q77-aux', port: 6391 };

function auxScenario(serverArgs, body) {
  return async (run) => {
    if (!ENGINE) return { requirement: null, observed: { skipped: '--engine 없이 실행' }, meets: null };
    try {
      return await body(run, AUX.name);
    } finally {
      await run.close();
      docker(['rm', '-f', '-v', AUX.name]);
    }
  };
}

async function auxRun(id, serverArgs) {
  const url = await startContainer(AUX.name, AUX.port, serverArgs);
  return new Run(id, url);
}

async function restartAux(name, downMs = 0) {
  if (downMs) { docker(['stop', '-t', '1', name]); await sleep(downMs); docker(['start', name]); } else docker(['restart', '-t', '1', name]);
  await waitForPing(`redis://127.0.0.1:${AUX.port}`);
}

async function queuedJobAcrossRestart(run, name) {
  const request = syntheticRequest(run);
  await run.requests.add('Request', request, { jobId: request.attemptId });
  await sleep(1500); // appendfsync everysec이 디스크에 쓸 시간
  const before = await run.requests.getJobState(request.attemptId);
  await restartAux(name);
  const after = await run.requests.getJobState(request.attemptId);
  return { request, before, after };
}

const RECHECK = { F_RECHECK_SECONDS: '2' };

function persistenceScenarios() {
  return [
    {
      id: 'P1-restart-no-persistence',
      title: 'NCP와 비슷한 조건(상시 영속성 없음)에서 Redis 재시작 → 대기 요청 유실, 실행기가 같은 요청을 다시 넣음',
      serverArgs: NCP_LIKE_ARGS,
      body: async (run, name) => {
        const e = run.startE();
        await e.ready;
        const { request, before, after } = await queuedJobAcrossRestart(run, name);
        const eAfterLoss = run.eStore() && run.eStore().processing;
        // E의 재발행 구현 대신 실행기가 같은 jobId로 다시 넣는다. F 보호가 있으므로 다시 넣어도 분석은 한 번이다.
        const f = run.startF({ F_MODE: 'guarded' });
        await f.ready;
        await run.requests.add('Request', request, { jobId: request.attemptId });
        await settleRequest(run, request.attemptId);
        await waitReceipt(run, run.stored(request.attemptId).messageId);
        const observed = { stateBeforeRestart: before, stateAfterRestart: after, eProcessingAfterLoss: eAfterLoss, calls: run.calls(), ...summarizeE(run) };
        observed.valid = before === 'waiting' && after === 'unknown' && eAfterLoss === 'QUEUED';
        return {
          requirement: '큐에서 요청이 사라져도 E 접수 기록(QUEUED)으로 다시 넣을 수 있고, 다시 넣어도 분석 1회',
          observed, meets: observed.valid ? observed.calls === 1 && observed.resultReceipts.join() === 'ACCEPTED/OK' : null,
        };
      },
    },
    {
      id: 'P2-restart-aof',
      title: '로컬 비교: AOF(everysec)를 켠 Redis 재시작 → 대기 요청 유지',
      serverArgs: ['--appendonly', 'yes', '--appendfsync', 'everysec', '--maxmemory-policy', 'noeviction'],
      body: async (run, name) => {
        const { request, before, after } = await queuedJobAcrossRestart(run, name);
        const e = run.startE();
        const f = run.startF({ F_MODE: 'guarded' });
        await Promise.all([e.ready, f.ready]);
        await settleRequest(run, request.attemptId);
        await waitReceipt(run, run.stored(request.attemptId).messageId);
        const observed = { stateBeforeRestart: before, stateAfterRestart: after, calls: run.calls(), ...summarizeE(run) };
        return {
          requirement: '(로컬 비교) 영속성이 있으면 재시작 뒤에도 요청이 남아 처리됨',
          observed, meets: after === 'waiting' && observed.calls === 1 && observed.resultReceipts.join() === 'ACCEPTED/OK',
        };
      },
    },
    {
      id: 'P3-outage-midrun',
      title: 'NCP와 비슷한 조건에서 분석 중 Redis가 12초 멈췄다 빈 상태로 복귀',
      serverArgs: NCP_LIKE_ARGS,
      body: async (run, name) => {
        const e = run.startE();
        const f = run.startF({ F_MODE: 'guarded', F_ANALYSIS_SECONDS: '3' });
        await Promise.all([e.ready, f.ready]);
        const request = syntheticRequest(run);
        await run.requests.add('Request', request, { jobId: request.attemptId });
        await waitFor(() => run.calls() === 1, 10000, '분석 시작');
        await restartAux(name, 12000);
        // 판정은 프로세스를 다시 띄우기 전에 한다. 재기동 뒤의 기동 점검이 재연결 실패를 가릴 수 있기 때문이다.
        const acceptedBeforeRestart = await settles(waitFor(
          () => run.eResults().some((l) => l.disposition === 'ACCEPTED'), 30000, '장애 복귀 뒤 수신'));
        const files = run.attemptFiles(request.attemptId);
        const eBeforeFRestart = summarizeE(run);
        const fAlive = run.children.size;
        await run.stopAll();
        const e2 = run.startE();
        const f2 = run.startF({ F_MODE: 'guarded' });
        await Promise.all([e2.ready, f2.ready]);
        await settles(waitFor(() => run.eResults().length > 0, 20000, '기동 점검 뒤 수신'));
        await settles(drained(run));
        const observed = {
          calls: run.calls(), acceptedBeforeRestart, filesBeforeRestart: files, eBeforeFRestart,
          processesAliveAfterOutage: fAlive, requestJobAfterOutage: await run.requests.getJobState(request.attemptId),
          ...summarizeE(run), ...fSummary(run),
        };
        return {
          requirement: '큐 장애 중에도 분석을 다시 하지 않고, 서버 복귀 뒤 프로세스 재기동 없이 결과가 E에 닿음',
          observed, meets: observed.calls === 1 && acceptedBeforeRestart && eBeforeFRestart.resultReceipts.join() === 'ACCEPTED/OK',
        };
      },
    },
    {
      id: 'P5-result-lost-then-republish',
      title: 'NCP와 비슷한 조건에서 F가 결과를 보낸 뒤 E가 받기 전에 큐 자료가 사라짐 → 실행기가 같은 요청을 다시 넣음',
      serverArgs: NCP_LIKE_ARGS,
      body: async (run, name) => {
        const f = run.startF({ F_MODE: 'guarded' });
        await f.ready;
        const request = syntheticRequest(run);
        await run.requests.add('Request', request, { jobId: request.attemptId });
        await settleRequest(run, request.attemptId);
        const sentBeforeRestart = run.attemptFiles(request.attemptId).sent;
        const waitingBeforeRestart = await run.events.getJobState(run.stored(request.attemptId).messageId);
        await restartAux(name);
        const workerMessagesAfterRestart = await eventJobCount(run);
        const e = run.startE();
        await e.ready;
        const eBeforeRepublish = run.eStore().processing;
        await run.requests.add('Request', request, { jobId: request.attemptId });
        await settleRequest(run, request.attemptId, { completions: 2 });
        const resent = await waitFor(() => { const lines = run.sentLog(request.attemptId); return lines.length >= 2 && lines; }, 10000, '재전송 기록');
        await waitReceipt(run, resent[resent.length - 1].messageId);
        await drained(run);
        const observed = {
          calls: run.calls(), sentBeforeRestart, waitingBeforeRestart, workerMessagesAfterRestart, eProcessingBeforeRepublish: eBeforeRepublish,
          sentAfter: run.attemptFiles(request.attemptId).sent, ...summarizeE(run), ...fSummary(run),
        };
        // 시험 전제: 결과를 한 번 보냈고, 그 결과가 큐에서 기다리다 재시작으로 사라졌으며, E는 아무것도 받지 못했다.
        observed.valid = sentBeforeRestart === 1 && waitingBeforeRestart === 'waiting' && workerMessagesAfterRestart === 0 &&
          eBeforeRepublish === 'QUEUED';
        return {
          requirement: 'F가 결과를 보낸 뒤 큐 자료가 사라져도, 같은 요청을 다시 넣으면 분석 없이 보존 결과가 새 메시지 ID로 다시 가서 E가 받음',
          observed, meets: observed.valid ? observed.calls === 1 && observed.resultReceipts.join() === 'ACCEPTED/OK' &&
            observed.sameAsStored.join() === 'true' : null,
        };
      },
    },
    {
      id: 'P6-uncertain-lost-then-republish',
      title: 'NCP와 비슷한 조건에서 UNCERTAIN 알림이 E에 닿기 전에 큐 자료가 사라짐 → 실행기가 같은 요청을 다시 넣음',
      serverArgs: NCP_LIKE_ARGS,
      body: async (run, name) => {
        const f = run.startF({ F_MODE: 'guarded', F_SCENARIO: 'execution-unknown' });
        await f.ready;
        const request = syntheticRequest(run);
        await run.requests.add('Request', request, { jobId: request.attemptId });
        await settleRequest(run, request.attemptId);
        const pending = await run.events.getJobs(['waiting']);
        const uncertainWaiting = pending.filter((j) => j && j.data.state === 'UNCERTAIN').length;
        await restartAux(name);
        const workerMessagesAfterRestart = await eventJobCount(run);
        const e = run.startE();
        await e.ready;
        const eBeforeRepublish = run.eStore().processing;
        await run.requests.add('Request', request, { jobId: request.attemptId });
        await settleRequest(run, request.attemptId, { completions: 2 });
        await drained(run);
        const completions = jobCompletions(run, request.attemptId);
        const observed = {
          calls: run.calls(), uncertainWaitingBeforeRestart: uncertainWaiting, workerMessagesAfterRestart,
          eProcessingBeforeRepublish: eBeforeRepublish, secondAction: completions.length > 1 ? completions[1].action : null,
          files: run.attemptFiles(request.attemptId), ...summarizeE(run), ...fSummary(run),
        };
        observed.valid = uncertainWaiting === 1 && workerMessagesAfterRestart === 0 && eBeforeRepublish === 'QUEUED';
        return {
          requirement: '실행 불명 알림이 큐에서 사라져도, 같은 요청을 다시 넣으면 분석 없이 UNCERTAIN을 다시 보내 E가 받음',
          observed, meets: observed.valid ? observed.calls === 1 && observed.secondAction === 'uncertain-no-rerun' &&
            observed.eObserved.join() === 'UNCERTAIN' && observed.eProcessing === 'UNCERTAIN' : null,
        };
      },
    },
    {
      id: 'P7-periodic-recheck-resend',
      title: 'NCP와 비슷한 조건에서 결과가 E에 닿기 전에 큐 자료가 사라짐 → 재발행 없이 F 주기 점검(2초)이 다시 보냄',
      serverArgs: NCP_LIKE_ARGS,
      body: async (run, name) => {
        const f = run.startF({ F_MODE: 'guarded', ...RECHECK });
        await f.ready;
        const request = syntheticRequest(run);
        await run.requests.add('Request', request, { jobId: request.attemptId });
        await settleRequest(run, request.attemptId);
        const sentBeforeRestart = run.attemptFiles(request.attemptId).sent;
        const waitingBeforeRestart = await run.events.getJobState(run.stored(request.attemptId).messageId);
        await restartAux(name);
        const workerMessagesAfterRestart = await eventJobCount(run);
        const e = run.startE();
        await e.ready;
        const delivered = await settles(waitFor(() => run.attemptFiles(request.attemptId).delivered, 30000, '주기 점검의 전달 확인'));
        await drained(run);
        const observed = {
          calls: run.calls(), sentBeforeRestart, waitingBeforeRestart, workerMessagesAfterRestart, deliveredMarker: delivered,
          files: run.attemptFiles(request.attemptId), requestJobs: jobStarts(run, request.attemptId).length, ...summarizeE(run), ...fSummary(run),
        };
        observed.valid = sentBeforeRestart === 1 && waitingBeforeRestart === 'waiting' && workerMessagesAfterRestart === 0;
        return {
          requirement: '큐가 결과를 잃어도 요청 재발행 없이 F 주기 점검이 보존 결과를 다시 보내 E가 받고, 받은 뒤 전달 표식을 남김',
          observed, meets: observed.valid ? observed.calls === 1 && observed.requestJobs === 1 && delivered &&
            observed.files.sent >= 2 && observed.resultReceipts.join() === 'ACCEPTED/OK' && observed.sameAsStored.join() === 'true' : null,
        };
      },
    },
    {
      id: 'P8-rejected-not-resent',
      title: 'NCP와 비슷한 조건에서 E가 결과를 거부(REJECTED)한 뒤 큐 자료가 사라짐 → F 주기 점검이 다시 보내지 않음',
      serverArgs: NCP_LIKE_ARGS,
      body: async (run, name) => {
        const e = run.startE({ E_CONTEXT_SCOPE_REVISION: '00000000-0000-4000-8000-000000000299' });
        const f = run.startF({ F_MODE: 'guarded', ...RECHECK });
        await Promise.all([e.ready, f.ready]);
        const request = syntheticRequest(run);
        await run.requests.add('Request', request, { jobId: request.attemptId });
        await settleRequest(run, request.attemptId);
        const firstReceipt = await waitReceipt(run, run.stored(request.attemptId).messageId);
        const rejectedMarker = await settles(waitFor(() => run.attemptFiles(request.attemptId).rejected, 15000, '거부 표식'));
        await restartAux(name);
        const workerMessagesAfterRestart = await eventJobCount(run);
        const checksBefore = run.fLog().filter((l) => l.kind === 'delivery-check').length;
        await waitFor(() => run.fLog().filter((l) => l.kind === 'delivery-check').length >= checksBefore + 3, 20000, '재시작 뒤 주기 점검 3회');
        const checksAfter = run.fLog().filter((l) => l.kind === 'delivery-check').slice(checksBefore);
        const observed = {
          firstReceipt: `${firstReceipt.disposition}/${firstReceipt.code}`, rejectedMarker, workerMessagesAfterRestart,
          checksAfterRestart: checksAfter.map((l) => l.state), calls: run.calls(), files: run.attemptFiles(request.attemptId),
          ...summarizeE(run), ...fSummary(run),
        };
        observed.valid = firstReceipt.disposition === 'REJECTED' && rejectedMarker && workerMessagesAfterRestart === 0;
        return {
          requirement: 'E가 거부한 결과는 큐 자료가 사라진 뒤에도 다시 보내지 않음(거부 표식을 큐 밖에 보존)',
          observed, meets: observed.valid ? observed.calls === 1 && observed.files.sent === 1 &&
            checksAfter.every((l) => l.state === 'rejected') && observed.resultReceipts.length === 1 : null,
        };
      },
    },
    {
      id: 'P4-eviction-policy-warning',
      title: 'maxmemory-policy가 noeviction이 아닐 때 Node·Python BullMQ의 반응',
      serverArgs: [...NCP_LIKE_ARGS.filter((arg, i, all) => !(arg === 'noeviction' || all[i + 1] === 'noeviction')), '--maxmemory-policy', 'allkeys-lru'],
      body: async (run) => {
        const warnings = [];
        const original = console.warn;
        console.warn = (...args) => warnings.push(args.join(' '));
        const queue = new Queue('policy-check', { connection: redisOptions(run.redisUrl), prefix: run.prefix });
        await queue.add('probe', { ok: true });
        await queue.waitUntilReady();
        await sleep(500);
        console.warn = original;
        await queue.obliterate({ force: true });
        await queue.close();
        const python = run.python(['-W', 'always', '-c', [
          'import asyncio, warnings, os',
          'from bullmq import Queue',
          'import json',
          'async def main():',
          '    phases = {}',
          '    q = Queue("policy-check-py", {"connection": os.environ["Q77_REDIS_URL"], "prefix": os.environ["Q77_PREFIX"]})',
          '    with warnings.catch_warnings(record=True) as caught:',
          '        warnings.simplefilter("always")',
          '        job = await q.add("probe", {"ok": True})',
          '        phases["afterAdd"] = [str(w.message) for w in caught]',
          '        await q.getJobState(job.id)',
          '        phases["afterGetJobState"] = [str(w.message) for w in caught]',
          '    await q.obliterate(force=True)',
          '    await q.close()',
          '    print(json.dumps(phases))',
          'asyncio.run(main())',
        ].join('\n')]);
        const pythonWarnings = JSON.parse(python);
        const pythonWarned = Object.values(pythonWarnings).flat().some((w) => w.includes('noeviction'));
        const observed = {
          nodeWarnings: [...new Set(warnings)], nodeWarningCount: warnings.length, pythonWarnings, pythonWarned, addStillWorked: true,
        };
        return {
          requirement: '정책이 잘못돼도 연결은 막히지 않으므로, Node·Python 모두 경고를 내는지 확인(관찰)',
          observed, meets: warnings.some((w) => w.includes('noeviction')) && pythonWarned,
        };
      },
    },
  ];
}

// ---------------------------------------------------------------------------------------------

const CRASH_COMBOS = [
  { mode: 'naive', maxStalled: 1, points: ['before-call', 'during-call', 'after-store'] },
  { mode: 'naive', maxStalled: 0, points: ['before-call', 'during-call', 'after-store'] },
  { mode: 'guarded', maxStalled: 1, points: Object.keys(CRASH_POINTS) },
  { mode: 'guarded', maxStalled: 0, points: Object.keys(CRASH_POINTS) },
];

const SCENARIOS = [
  { id: 'A1-echo', variant: '연결', title: 'Node→Python→Node 왕복과 Python 생산자→Node 소비자', run: scenarioEcho },
  ...Object.keys(PROCESS_EXPECT).map((name, index) => ({ id: `A2-${index + 1}-${name}`, variant: '연결', title: `요청→F 처리(${name})→E 수신`, run: processScenario(name) })),
  { id: 'B1-same-jobid-kept', variant: '큐만', title: '같은 jobId 재추가(완료 작업 보존) · 일반 F', run: duplicateScenario({ mode: 'naive', removeOnComplete: false, secondJobId: false }) },
  { id: 'B2-same-jobid-removed-naive', variant: '큐만', title: '같은 jobId 재추가(완료 작업 삭제) · 일반 F', run: duplicateScenario({ mode: 'naive', removeOnComplete: true, secondJobId: false }) },
  { id: 'B3-same-jobid-removed-guarded', variant: '앱 보호', title: '같은 jobId 재추가(완료 작업 삭제) · 보호 F', run: duplicateScenario({ mode: 'guarded', removeOnComplete: true, secondJobId: false }) },
  { id: 'B4-new-jobid-naive', variant: '큐만', title: '다른 jobId로 같은 요청 재발행 · 일반 F', run: duplicateScenario({ mode: 'naive', removeOnComplete: false, secondJobId: true }) },
  { id: 'B5-new-jobid-guarded', variant: '앱 보호', title: '다른 jobId로 같은 요청 재발행 · 보호 F', run: duplicateScenario({ mode: 'guarded', removeOnComplete: false, secondJobId: true }) },
  { id: 'B6-dedup-option', variant: '큐 옵션', title: 'BullMQ deduplication 옵션의 적용 구간 · 보호 F', run: scenarioDedupOption },
  { id: 'B7-same-attempt-changed', variant: '앱 보호', title: '같은 시도 ID·다른 내용(requestedAt)의 요청 · 보호 F', run: scenarioRequestMismatch },
  ...CRASH_COMBOS.flatMap(({ mode, maxStalled, points }) => points.map((point) => ({
    id: `C-${mode}-stall${maxStalled}-${point}`,
    variant: mode === 'naive' ? '큐만' : '앱 보호',
    title: `${mode === 'naive' ? '일반' : '보호'} F · maxStalledCount=${maxStalled} · ${point}에서 강제 종료 후 재기동`,
    run: crashScenario({ mode, maxStalled, point }),
  }))),
  { id: 'D1-resend', variant: '앱 보호', title: '보존 결과 재전달', run: scenarioResend },
  { id: 'D2-e-crash-after-commit', variant: '큐만', title: 'E 수신 기록 커밋 뒤·큐 완료 전 E 중단', run: scenarioECrashAfterCommit },
  { id: 'D3-e-down', variant: '큐만', title: 'E가 꺼진 동안 결과 전달(지연)', run: scenarioEDown },
  { id: 'D4-late-event', variant: 'E 수신', title: '종결 뒤 늦게 도착한 RUNNING', run: scenarioLateEvent },
  { id: 'G1-request-too-old', variant: '앱 보호', title: '기록 없이 기록 수명(60초)보다 오래된 요청 · 보호 F', run: scenarioTooOld },
  { id: 'L1-loop-naive', variant: '큐만', title: '분석이 이벤트 루프를 막음 · 일반 F', run: lockLossScenario({ mode: 'naive', runIn: 'loop' }) },
  { id: 'L2-loop-guarded', variant: '앱 보호', title: '분석이 이벤트 루프를 막음 · 보호 F', run: lockLossScenario({ mode: 'guarded', runIn: 'loop' }) },
  { id: 'L3-thread-naive', variant: '큐만', title: '분석을 별도 스레드에서 실행 · 일반 F', run: lockLossScenario({ mode: 'naive', runIn: 'thread' }) },
  ...persistenceScenarios().map((s) => ({ id: s.id, variant: '저장소', title: s.title, aux: s.serverArgs, run: auxScenario(s.serverArgs, s.body) })),
];

async function describeServer(url) {
  const client = new IORedis(redisOptions(url));
  const info = parseInfo(await client.info());
  let config;
  try { config = await client.config('GET', 'maxmemory-policy'); } catch (error) { config = `거부됨: ${error.message}`; }
  client.disconnect();
  return {
    redisVersion: info.redis_version, valkeyVersion: info.valkey_version, maxmemoryPolicy: info.maxmemory_policy,
    aofEnabled: info.aof_enabled, configCommand: config,
  };
}

function statusOf(row) {
  if (row.error) return 'ERROR';
  if (row.meets === null) return row.observed.valid === false ? 'INVALID' : 'SKIP';
  return row.meets ? 'MEETS' : 'MISSES';
}

async function main() {
  if (ENGINE && !ENGINES[ENGINE]) throw new Error(`알 수 없는 엔진: ${ENGINE}`);
  const mainUrl = ENGINE ? await startContainer('catchu-q77-main', 6390, NCP_LIKE_ARGS) : REDIS_URL;
  const selected = SCENARIOS.filter((s) => FILTERS.length === 0 || FILTERS.some((f) => s.id.startsWith(f)));
  const environment = {
    label: LABEL, engine: ENGINE, image: ENGINE && ENGINES[ENGINE].image, serverArgs: ENGINE ? NCP_LIKE_ARGS : null,
    ...(await describeServer(mainUrl)), node: process.version,
    bullmqNode: require('bullmq/package.json').version, ioredis: require('ioredis/package.json').version,
    python: execFileSync(PYTHON, ['-c', 'import sys,importlib.metadata as m;print(sys.version.split()[0], "bullmq", m.version("bullmq"), "redis-py", m.version("redis"))'], { encoding: 'utf8' }).trim(),
    fastTimings: FAST, startedAt: new Date().toISOString(),
  };
  console.log(JSON.stringify(environment));
  const results = [];
  try {
    for (const scenario of selected) {
      const ownContainer = Boolean(scenario.aux && ENGINE);
      const run = ownContainer ? await auxRun(scenario.id, scenario.aux) : new Run(scenario.id, mainUrl);
      const started = Date.now();
      let outcome;
      try {
        outcome = await scenario.run(run);
      } catch (error) {
        outcome = { requirement: null, observed: { error: error.message, calls: run.calls(), ...summarizeE(run), ...fSummary(run) }, meets: false, error: true };
      } finally {
        if (!ownContainer) await run.close();
      }
      const row = { id: scenario.id, variant: scenario.variant, title: scenario.title, seconds: Math.round((Date.now() - started) / 100) / 10, ...outcome };
      row.status = statusOf(row);
      results.push(row);
      console.log(`${row.status.padEnd(7)} ${row.id} (${row.seconds}s) calls=${row.observed.calls ?? '-'} ${JSON.stringify(row.observed).slice(0, 300)}`);
    }
  } finally {
    if (ENGINE) docker(['rm', '-f', '-v', 'catchu-q77-main']);
  }
  const out = join(ensureDir(join(RUNS_DIR, LABEL)), FILTERS.length ? `summary-${FILTERS.join('_')}.json` : 'summary.json');
  writeFileSync(out, JSON.stringify({ environment, results }, null, 1));
  console.log(`결과: ${out}`);
}

main().catch((error) => { console.error(error); process.exit(1); });

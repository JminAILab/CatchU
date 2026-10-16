// #77 실험 공통 설정. 제품 코드가 아니며 api·worker 실행 경로에 연결하지 않는다.
const { readFileSync, mkdirSync, writeFileSync, openSync, fsyncSync, closeSync, renameSync, existsSync, readdirSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { createHash } = require('node:crypto');

const KIT_DIR = resolve(__dirname, '..');
const REPO_ROOT = resolve(KIT_DIR, '../..');
const RUNS_DIR = join(KIT_DIR, 'runs');
const CONTRACT_DIR = join(REPO_ROOT, 'aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design');
const FIXTURE_DIR = join(REPO_ROOT, 'worker/fixtures/m1-synthetic');

// 실험 전용 Redis. 기존 로컬 Redis(6379)와 겹치지 않게 다른 포트를 기본값으로 둔다.
const REDIS_URL = process.env.Q77_REDIS_URL || 'redis://127.0.0.1:6390';

// E→F 요청 큐와 F→E 진행·결과 큐. 이름은 실험용이며 제품 이름을 정하지 않는다.
const REQUEST_QUEUE = 'analysis-requests';
const EVENT_QUEUE = 'worker-messages';

function redisOptions(redisUrl = REDIS_URL) {
  const url = new URL(redisUrl);
  // BullMQ Worker는 maxRetriesPerRequest=null을 요구한다. 계정·비밀번호·TLS(rediss)도 Python 쪽처럼 주소에서 읽는다.
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    tls: url.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

// INFO 결과를 {키: 값}으로. NCP처럼 CONFIG가 막힌 서버에서도 읽힌다(BullMQ도 INFO로 판본·축출 정책을 본다).
function parseInfo(text) {
  return Object.fromEntries(text.split('\r\n').filter((line) => line.includes(':') && !line.startsWith('#'))
    .map((line) => [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 1)]));
}

function acceptedContext() {
  const sample = JSON.parse(readFileSync(join(FIXTURE_DIR, 'context.sample.json'), 'utf8'));
  return { ...sample.values, sourceMode: 'MOCK' };
}

// F 보호 worker가 시도별 기록 폴더 이름으로 쓰는 키(py/f_worker.py attempt_key와 같다).
function attemptKey(attemptId) {
  return createHash('sha256').update(attemptId).digest('hex').slice(0, 32);
}

function fsyncDir(dir) {
  const fd = openSync(dir, 'r');
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

// 쓰기 → fsync → rename → 디렉터리 fsync. 프로세스가 강제 종료돼도 반쯤 쓴 파일이 남지 않게 한다.
function writeJsonDurable(path, value) {
  const tmp = `${path}.tmp-${process.pid}`;
  const fd = openSync(tmp, 'w');
  try {
    writeFileSync(fd, JSON.stringify(value, null, 1));
    fsyncSync(fd);
  } finally { closeSync(fd); }
  renameSync(tmp, path);
  fsyncDir(resolve(path, '..'));
}

function appendLine(path, value) {
  const fd = openSync(path, 'a');
  try {
    writeFileSync(fd, `${JSON.stringify(value)}\n`);
    fsyncSync(fd);
  } finally { closeSync(fd); }
}

function readJsonLines(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
  return path;
}

function listFiles(dir) {
  return existsSync(dir) ? readdirSync(dir) : [];
}

module.exports = {
  KIT_DIR, REPO_ROOT, RUNS_DIR, CONTRACT_DIR, FIXTURE_DIR, REDIS_URL, REQUEST_QUEUE, EVENT_QUEUE,
  redisOptions, parseInfo, acceptedContext, attemptKey, writeJsonDurable, appendLine, readJsonLines, ensureDir, listFiles,
};

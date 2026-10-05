#!/usr/bin/env node
/**
 * 링크 비밀번호 해시 1회 계산 시간과 메모리 사용량 측정(#219).
 * 배포 서버와 같은 사양에서 `npm run build` 뒤 `node scripts/measure-link-password.cjs`로 실행하고 출력을 PR·이슈에 남긴다.
 * 합성 비밀번호만 쓰며 DB·환경변수를 읽지 않는다.
 *
 * - 시간: 빌드된 hashLinkPassword·verifyLinkPassword를 차례로 여러 번 불러 중앙값·최소·최대를 낸다.
 * - 메모리: 새 프로세스에서 모듈만 읽은 뒤의 최대 RSS와, 해시를 n개 동시에 계산한 뒤의 최대 RSS 차이.
 *   Node는 해시를 libuv 작업 스레드(기본 4개, UV_THREADPOOL_SIZE)에서 계산하므로 동시 4개가 한 프로세스의 최대치다.
 */
const { spawnSync } = require('node:child_process');
const { randomBytes, scryptSync } = require('node:crypto');
const os = require('node:os');
const path = require('node:path');

const MODULE = path.join(__dirname, '..', 'dist', 'share-links', 'link-password.js');
const PASSWORD = 'synthetic-measure-password';
const RUNS = 20;
const LEGACY = { N: 2 ** 15, r: 8, p: 1 };

function load() {
  try {
    return require(MODULE);
  } catch {
    console.error('dist가 없습니다. api 폴더에서 npm run build를 먼저 실행하세요.');
    process.exit(1);
  }
}

function legacyVerifier() {
  const salt = randomBytes(16);
  const hash = scryptSync(PASSWORD, salt, 32, { ...LEGACY, maxmem: 128 * LEGACY.N * LEGACY.r * 2 });
  return ['scrypt', '1', LEGACY.N, LEGACY.r, LEGACY.p, salt.toString('base64url'), hash.toString('base64url')].join('$');
}

async function timeMs(fn) {
  const start = process.hrtime.bigint();
  await fn();
  return Number(process.hrtime.bigint() - start) / 1e6;
}

async function sample(fn) {
  await fn();
  const values = [];
  for (let i = 0; i < RUNS; i += 1) values.push(await timeMs(fn));
  values.sort((a, b) => a - b);
  const fmt = (v) => v.toFixed(1);
  return `중앙값 ${fmt(values[Math.floor(RUNS / 2)])} ms (최소 ${fmt(values[0])}, 최대 ${fmt(values[RUNS - 1])}, ${RUNS}회)`;
}

// 자식 프로세스: 모듈을 읽은 뒤와 해시 n개를 동시에 계산한 뒤의 최대 RSS(MiB)를 출력한다.
async function rssChild(concurrent) {
  const { hashLinkPassword } = load();
  const before = process.resourceUsage().maxRSS;
  await Promise.all(Array.from({ length: concurrent }, () => hashLinkPassword(PASSWORD)));
  const after = process.resourceUsage().maxRSS;
  process.stdout.write(JSON.stringify({ before: before / 1024, after: after / 1024 }));
}

function rssDelta(concurrent) {
  const child = spawnSync(process.execPath, [__filename, '--rss-child', String(concurrent)], { encoding: 'utf8' });
  if (child.status !== 0) throw new Error(`측정 프로세스 실패: ${child.stderr}`);
  const { before, after } = JSON.parse(child.stdout);
  return `최대 RSS ${before.toFixed(0)} → ${after.toFixed(0)} MiB (증가 ${(after - before).toFixed(0)} MiB)`;
}

async function main() {
  const { hashLinkPassword, verifyLinkPassword, PASSWORD_HASH_PARAMS } = load();
  const { N, r, p } = PASSWORD_HASH_PARAMS;
  const stored = await hashLinkPassword(PASSWORD);
  const legacy = legacyVerifier();

  console.log(`환경: Node ${process.version}, ${os.platform()} ${os.arch()}, ${os.cpus()[0]?.model ?? '알 수 없음'} ${os.cpus().length}코어, `
    + `메모리 ${(os.totalmem() / 2 ** 30).toFixed(1)} GiB, 작업 스레드 ${process.env.UV_THREADPOOL_SIZE ?? '4(기본)'}`);
  console.log(`설정: N=2^${Math.log2(N)}, r=${r}, p=${p} (이론 메모리 128·N·r = ${(128 * N * r) / 2 ** 20} MiB)`);
  console.log(`새 비밀번호 저장(hashLinkPassword): ${await sample(() => hashLinkPassword(PASSWORD))}`);
  console.log(`비밀번호 확인(verifyLinkPassword): ${await sample(() => verifyLinkPassword(PASSWORD, stored))}`);
  console.log(`이전 값(N=2^15, r=8, p=1) 확인: ${await sample(() => verifyLinkPassword(PASSWORD, legacy))}`);
  for (const concurrent of [4, 8]) {
    const wall = await timeMs(() => Promise.all(Array.from({ length: concurrent }, () => hashLinkPassword(PASSWORD))));
    console.log(`동시 ${concurrent}개 저장: 전체 ${wall.toFixed(1)} ms`);
  }
  for (const concurrent of [1, 4]) console.log(`메모리, 동시 ${concurrent}개: ${rssDelta(concurrent)}`);
}

if (process.argv[2] === '--rss-child') {
  rssChild(Number(process.argv[3])).catch((error) => { console.error(error); process.exit(1); });
} else {
  main().catch((error) => { console.error(error); process.exit(1); });
}

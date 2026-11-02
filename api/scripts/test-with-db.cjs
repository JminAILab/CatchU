// npm test 실행기: 테스트 DB에 마이그레이션을 적용한 뒤 test/ 아래 테스트를 실행한다.
// 테스트 DB 값은 셸 환경변수 > api/.env > 기본값(README 「DB 테스트」의 docker run 명령과 같은 값) 순서로 정한다.
// 실행하는 테스트에는 이 값을 DB_*로 넘기므로 개발 DB(.env의 DB_*)는 쓰지 않는다.
//
// [실험] 두 줄 실행: 대기 시간이 대부분인 잠금 대기 시험(test/**/lock-wait-limit-*.test.cjs)과
// 실제 Retry-After 1분을 기다리는 발급 통합 시험(test/db/share-links-web-integration.test.cjs)은 둘째 DB에서 첫째 줄과 동시에 돌린다.
//   0. 공용 dist를 지우고 다시 만드는 test/db/build-output.test.cjs는 두 줄이 시작하기 전에 혼자 끝낸다.
//   1. 첫째 줄(TEST_DB_NAME)과 둘째 줄(둘째 DB)은 각각 파일을 한 번에 하나씩 돌린다(--test-concurrency=1).
//   2. 둘 다 끝나기를 기다리고, 어느 쪽이 실패해도 실패로 끝낸다.
// 인자를 주면(npm test -- test/db/x.test.cjs) 그 파일만 첫째 DB에서 한 줄로 돌린다.
// 커버리지(npm run test:coverage, 첫 인자 --coverage): 줄을 나누면 보고도 둘로 갈리므로 build-output 뒤의 모든 파일을 첫째 DB에서
// 한 줄로 돌려 표 하나로 낸다. 표는 dist/의 컴파일된 JS 기준이다(원본 위치 대응을 켜 본 시험에서 줄 수가 틀리게 나왔다).
// 표에 넣을 범위는 셸 환경변수 TEST_COVERAGE_INCLUDE(glob, 기본 dist/**)로 좁힌다. Unit 폴더만 넣으면 맨 아래 비율이 그 Unit의 값이다.
const { spawn, spawnSync } = require('node:child_process');
const { existsSync, readFileSync, readdirSync } = require('node:fs');
const { relative, resolve } = require('node:path');
const { parseEnv } = require('node:util');

const apiDir = resolve(__dirname, '..');
const DEFAULTS = {
  TEST_DB_HOST: '127.0.0.1',
  TEST_DB_PORT: '5433',
  TEST_DB_USER: 'catchu',
  TEST_DB_PASSWORD: 'catchu_local',
  TEST_DB_NAME: 'catchu_test',
};
const PRE_PHASE = 'test/db/build-output.test.cjs';
const MAX_DB_NAME_BYTES = 63; // PostgreSQL 식별자 한도. 넘으면 잘려서 만든 이름과 접속하는 이름이 달라진다.
const LOCK_WAIT_LANE = /^test\/(?:.*\/)?lock-wait-limit-[^/]*\.test\.cjs$/;
const REAL_WAIT_TEST = 'test/db/share-links-web-integration.test.cjs';
const inWaitLane = (file) => LOCK_WAIT_LANE.test(file) || file === REAL_WAIT_TEST;

function readSettings() {
  const envPath = resolve(apiDir, '.env');
  const file = existsSync(envPath) ? parseEnv(readFileSync(envPath, 'utf8')) : {};
  return Object.fromEntries(Object.entries(DEFAULTS)
    .map(([key, fallback]) => [key, process.env[key] || file[key] || fallback]));
}

function listTests(dir = resolve(apiDir, 'test')) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : listTests(path);
    return entry.name.endsWith('.test.cjs') ? [relative(apiDir, path).split('\\').join('/')] : [];
  }).sort();
}

const laneDatabaseName = (name) => `${name.replace(/_test$/, '')}_lock_test`;

function env(settings, database) {
  return {
    ...process.env,
    DB_HOST: settings.TEST_DB_HOST,
    DB_PORT: settings.TEST_DB_PORT,
    DB_USER: settings.TEST_DB_USER,
    DB_PASSWORD: settings.TEST_DB_PASSWORD,
    DB_NAME: database,
  };
}

// 데이터베이스마다 새 프로세스에서 마이그레이션한다. 환경값으로 만든 DataSource를 한 프로세스에서 다시 쓰지 않는다.
async function migrate(settings, database) {
  const target = `${settings.TEST_DB_HOST}:${settings.TEST_DB_PORT}/${database}`;
  const script = `const ds = require('./dist/database/data-source').default;
    ds.initialize().then(() => ds.runMigrations()).then((applied) => ds.destroy().then(() => console.log(applied.length)))
      .catch((error) => { console.error(error.message); process.exit(1); });`;
  const result = spawnSync(process.execPath, ['-e', script], { cwd: apiDir, env: env(settings, database), encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) {
    console.error(`테스트 DB(${target})에 접속하지 못했거나 마이그레이션에 실패했습니다: ${(result.stderr || '').trim()}`);
    console.error('api/README.md 「DB 테스트」의 docker run 명령으로 테스트 DB를 띄운 뒤 다시 실행하세요.');
    return false;
  }
  console.log(`테스트 DB(${target}) 마이그레이션 적용: 새로 적용 ${result.stdout.trim()}개`);
  return true;
}

async function ensureDatabase(settings, name) {
  const dataSource = require('../dist/database/data-source').default;
  await dataSource.initialize();
  try {
    const rows = await dataSource.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (rows.length === 0) await dataSource.query(`CREATE DATABASE "${name.replaceAll('"', '""')}"`);
  } finally {
    await dataSource.destroy();
  }
}

const COVERAGE = ['--experimental-test-coverage', `--test-coverage-include=${process.env.TEST_COVERAGE_INCLUDE || 'dist/**'}`];
const nodeTest = (files, extra = []) => ['--test', '--test-concurrency=1', ...extra, ...files];
// 첫째 DB에서 한 줄로 돌리고 종료 코드를 돌려준다.
const runSync = (files, extra = []) => spawnSync(process.execPath, nodeTest(files, extra),
  { cwd: apiDir, env: process.env, stdio: 'inherit', windowsHide: true }).status ?? 1;

function runLane(label, files, settings, database, { buffer }) {
  return new Promise((done) => {
    const started = Date.now();
    const child = spawn(process.execPath, nodeTest(files), { cwd: apiDir, env: env(settings, database), windowsHide: true,
      stdio: buffer ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
    const chunks = [];
    if (buffer) for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => chunks.push(chunk));
    child.on('close', (code, signal) => {
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      if (buffer) {
        process.stdout.write(`\n===== ${label} 시작 =====\n${Buffer.concat(chunks).toString('utf8')}\n===== ${label} 끝(${database}, ${files.length}개 파일, ${seconds}초) =====\n`);
      } else {
        console.log(`\n===== ${label} 끝(${database}, ${files.length}개 파일, ${seconds}초) =====`);
      }
      done(code ?? (signal ? 1 : 0));
    });
  });
}

async function main() {
  const settings = readSettings();
  const target = `${settings.TEST_DB_HOST}:${settings.TEST_DB_PORT}/${settings.TEST_DB_NAME}`;
  if (!settings.TEST_DB_NAME.endsWith('_test')) {
    console.error(`TEST_DB_NAME은 _test로 끝나야 합니다(현재 ${settings.TEST_DB_NAME}). 개발 DB를 테스트에 쓰지 않기 위한 확인입니다.`);
    return 1;
  }
  Object.assign(process.env, env(settings, settings.TEST_DB_NAME));

  try {
    // 접속 확인용 첫 연결(데이터베이스가 없거나 접속할 수 없으면 여기서 멈춘다).
    const dataSource = require('../dist/database/data-source').default;
    await dataSource.initialize();
    await dataSource.destroy();
  } catch (error) {
    console.error(`테스트 DB(${target})에 접속하지 못했습니다: ${error.message}`);
    console.error('api/README.md 「DB 테스트」의 docker run 명령으로 테스트 DB를 띄운 뒤 다시 실행하세요.');
    return 1;
  }
  if (!await migrate(settings, settings.TEST_DB_NAME)) return 1;

  // 인자를 주면 그 파일만 한 줄로 실행한다(npm test -- test/db/x.test.cjs, 커버리지는 npm run test:coverage -- test/x.test.cjs).
  const args = process.argv.slice(2);
  const coverage = args[0] === '--coverage';
  const targets = coverage ? args.slice(1) : args;
  if (targets.length > 0) return runSync(targets, coverage ? COVERAGE : []);

  const all = listTests();
  const waitLane = all.filter(inWaitLane);
  const mainLane = all.filter((file) => file !== PRE_PHASE && !inWaitLane(file));
  if (!all.includes(PRE_PHASE) || !waitLane.some((file) => LOCK_WAIT_LANE.test(file))
    || waitLane.length + mainLane.length + 1 !== all.length) {
    console.error('시험 파일을 줄로 나누지 못했습니다(build-output·잠금 대기 파일을 찾지 못했거나 중복·누락이 있습니다).');
    return 1;
  }

  // 커버리지는 dist를 다시 만드는 시험을 먼저 혼자 끝내고(표에 넣지 않는다), 나머지를 첫째 DB에서 한 줄로 잰다.
  // node --test는 인자 순서대로 돌리지 않으므로 한 번에 넘기지 않는다.
  if (coverage) {
    const preCode = runSync([PRE_PHASE]);
    return preCode !== 0 ? preCode : runSync(all.filter((file) => file !== PRE_PHASE), COVERAGE);
  }

  // 둘째 줄 데이터베이스 이름은 시험을 시작하기 전에 확인한다.
  const laneDatabase = laneDatabaseName(settings.TEST_DB_NAME);
  if (laneDatabase === settings.TEST_DB_NAME || !laneDatabase.endsWith('_test')) {
    console.error(`둘째 줄 데이터베이스 이름이 잘못됐습니다(${laneDatabase}).`);
    return 1;
  }
  if (Buffer.byteLength(laneDatabase) > MAX_DB_NAME_BYTES) {
    const limit = MAX_DB_NAME_BYTES - (Buffer.byteLength(laneDatabase) - Buffer.byteLength(settings.TEST_DB_NAME));
    console.error(`둘째 줄 데이터베이스 이름(${laneDatabase})이 ${MAX_DB_NAME_BYTES}바이트를 넘습니다. TEST_DB_NAME을 ${limit}바이트 이하로 줄이세요.`);
    return 1;
  }

  // 0. dist를 지우고 다시 만드는 시험은 두 줄이 dist를 읽기 전에 혼자 끝낸다.
  const preCode = runSync([PRE_PHASE]);
  if (preCode !== 0) return preCode;

  // 둘째 줄의 데이터베이스를 만들고 마이그레이션한다.
  await ensureDatabase(settings, laneDatabase);
  if (!await migrate(settings, laneDatabase)) return 1;

  const [mainCode, waitCode] = await Promise.all([
    runLane('첫째 줄', mainLane, settings, settings.TEST_DB_NAME, { buffer: false }),
    runLane('둘째 줄(대기)', waitLane, settings, laneDatabase, { buffer: true }),
  ]);
  return mainCode !== 0 ? mainCode : waitCode;
}

main().then((code) => { process.exitCode = code; }, (error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

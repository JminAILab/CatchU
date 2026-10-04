// npm test 실행기: 테스트 DB에 마이그레이션을 적용한 뒤 test/ 아래 테스트를 한 파일씩 차례로 실행한다.
// 테스트 DB 값은 셸 환경변수 > api/.env > 기본값(README 「DB 테스트」의 docker run 명령과 같은 값) 순서로 정한다.
// 실행하는 테스트에는 이 값을 DB_*로 넘기므로 개발 DB(.env의 DB_*)는 쓰지 않는다.
const { spawnSync } = require('node:child_process');
const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { parseEnv } = require('node:util');

const apiDir = resolve(__dirname, '..');
const DEFAULTS = {
  TEST_DB_HOST: '127.0.0.1',
  TEST_DB_PORT: '5433',
  TEST_DB_USER: 'catchu',
  TEST_DB_PASSWORD: 'catchu_local',
  TEST_DB_NAME: 'catchu_test',
};

function readSettings() {
  const envPath = resolve(apiDir, '.env');
  const file = existsSync(envPath) ? parseEnv(readFileSync(envPath, 'utf8')) : {};
  return Object.fromEntries(Object.entries(DEFAULTS)
    .map(([key, fallback]) => [key, process.env[key] || file[key] || fallback]));
}

async function main() {
  const settings = readSettings();
  const target = `${settings.TEST_DB_HOST}:${settings.TEST_DB_PORT}/${settings.TEST_DB_NAME}`;
  if (!settings.TEST_DB_NAME.endsWith('_test')) {
    console.error(`TEST_DB_NAME은 _test로 끝나야 합니다(현재 ${settings.TEST_DB_NAME}). 개발 DB를 테스트에 쓰지 않기 위한 확인입니다.`);
    return 1;
  }
  Object.assign(process.env, {
    DB_HOST: settings.TEST_DB_HOST,
    DB_PORT: settings.TEST_DB_PORT,
    DB_USER: settings.TEST_DB_USER,
    DB_PASSWORD: settings.TEST_DB_PASSWORD,
    DB_NAME: settings.TEST_DB_NAME,
  });

  const dataSource = require('../dist/database/data-source').default;
  try {
    await dataSource.initialize();
  } catch (error) {
    console.error(`테스트 DB(${target})에 접속하지 못했습니다: ${error.message}`);
    console.error('api/README.md 「DB 테스트」의 docker run 명령으로 테스트 DB를 띄운 뒤 다시 실행하세요.');
    return 1;
  }
  try {
    const applied = await dataSource.runMigrations();
    console.log(`테스트 DB(${target}) 마이그레이션 적용: 새로 적용 ${applied.length}개`);
  } finally {
    await dataSource.destroy();
  }

  // DB를 함께 쓰므로 파일을 병렬로 돌리지 않는다. 인자를 주면 그 파일만 실행한다(npm test -- test/db/x.test.cjs).
  const targets = process.argv.slice(2);
  // 링크 전체 실패 상한이 정해지기 전에도 앱을 띄워 검사할 수 있게, 시험에서만 제한 없는 링크 정책을 명시적으로 허용한다.
  // 자식 프로세스(dist/main.js를 띄우는 검사 포함)까지 이어지도록 NODE_OPTIONS로 미리 불러온다.
  // 경로는 큰따옴표로 감싸고 역슬래시를 이스케이프한다(공백이 있는 Windows 경로).
  const preload = `--require=${JSON.stringify(resolve(apiDir, 'test/support/allow-unlimited-unlock-link.cjs'))}`;
  const env = { ...process.env, NODE_OPTIONS: [process.env.NODE_OPTIONS, preload].filter(Boolean).join(' ') };
  const result = spawnSync(process.execPath, [
    '--test', '--test-concurrency=1', ...(targets.length > 0 ? targets : ['test/**/*.test.cjs']),
  ], { cwd: apiDir, env, stdio: 'inherit', windowsHide: true });
  return result.status ?? 1;
}

main().then((code) => { process.exitCode = code; }, (error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

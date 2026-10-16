const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
const { after, before, test } = require('node:test');
const { assertTestDatabaseName, openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');

const apiDir = resolve(__dirname, '../..');
let dataSource;
before(async () => { dataSource = await openTestDataSource(); });
after(async () => {
  await dataSource.query('DROP TABLE IF EXISTS reset_probe');
  await dataSource.destroy();
});

test('npm test는 _test로 끝나는 테스트 DB로만 테스트를 실행한다', () => {
  assert.match(process.env.DB_NAME, /_test$/);
  assert.equal(dataSource.options.database, process.env.DB_NAME);
});

test('이름이 _test로 끝나지 않는 DB는 초기화·접속을 거부한다', async () => {
  assert.throws(() => assertTestDatabaseName('catchu'), /_test/);
  assert.doesNotThrow(() => assertTestDatabaseName('catchu_test'));

  const saved = process.env.DB_NAME;
  process.env.DB_NAME = 'catchu';
  try {
    await assert.rejects(openTestDataSource(), /_test/);
  } finally {
    process.env.DB_NAME = saved;
  }
});

test('실행기는 TEST_DB_NAME이 _test로 끝나지 않으면 마이그레이션·테스트 전에 멈춘다', () => {
  const result = spawnSync(process.execPath, ['scripts/test-with-db.cjs'], {
    cwd: apiDir, env: { ...process.env, TEST_DB_NAME: 'catchu' }, encoding: 'utf8', windowsHide: true,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /TEST_DB_NAME/);
});

test('초기화는 마이그레이션 기록을 남기고 나머지 테이블 자료를 지운다', async () => {
  await dataSource.query('CREATE TABLE IF NOT EXISTS reset_probe (id int PRIMARY KEY)');
  await dataSource.query('INSERT INTO reset_probe (id) VALUES (1), (2)');
  const count = async (table) => Number((await dataSource.query(`SELECT count(*) AS n FROM ${table}`))[0].n);
  const migrations = await count('migrations');

  await resetTestDatabase(dataSource);

  assert.equal(await count('reset_probe'), 0);
  assert.equal(await count('migrations'), migrations);
});

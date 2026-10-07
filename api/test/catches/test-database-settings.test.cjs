const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readCatchTestDatabase } = require('../support/catch-db-fixture.cjs');

const runnerSettings = {
  DB_HOST: '127.0.0.1', DB_PORT: '5433', DB_USER: 'synthetic',
  DB_PASSWORD: 'synthetic-only', DB_NAME: 'runner_test',
};
const explicitSettings = {
  CATCH_DB_TEST_REQUIRED: '1', TEST_DB_HOST: '127.0.0.1', TEST_DB_PORT: '5434',
  TEST_DB_USER: 'synthetic', TEST_DB_PASSWORD: 'synthetic-only', TEST_DB_NAME: 'explicit_test',
};

test('공통 실행기가 전달한 테스트 DB를 TEST_DB 변수 없이 사용한다', () => {
  const config = readCatchTestDatabase(runnerSettings);
  assert.equal(config.database, 'runner_test');
  assert.equal(config.port, 5433);
  assert.equal(config.synchronize, false);
});

test('전체 검사에서는 원래 TEST_DB 변수보다 공통 실행기의 확정값을 따른다', () => {
  const config = readCatchTestDatabase({ ...runnerSettings, TEST_DB_NAME: 'ignored', TEST_DB_PORT: 'invalid' });
  assert.equal(config.database, 'runner_test');
  assert.equal(config.port, 5433);
});

test('공통 설정이 없거나 개발 DB 이름이면 건너뛰지 않고 실패한다', () => {
  assert.throws(() => readCatchTestDatabase({}), /DB 설정이 없습니다/);
  assert.throws(() => readCatchTestDatabase({ ...runnerSettings, DB_NAME: 'synthetic_dev' }), /_test/);
});

test('B 전용 검사는 명시한 테스트 DB만 사용하고 누락·잘못된 이름을 거부한다', () => {
  assert.equal(readCatchTestDatabase({ ...runnerSettings, ...explicitSettings }).database, 'explicit_test');
  assert.throws(() => readCatchTestDatabase({ CATCH_DB_TEST_REQUIRED: '1', ...runnerSettings }), /Catch DB 검사/);
  assert.throws(() => readCatchTestDatabase({ ...explicitSettings, TEST_DB_NAME: 'synthetic_dev' }), /_test/);
});

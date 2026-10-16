// DB를 쓰는 테스트의 공용 지원. npm test(scripts/test-with-db.cjs)가 넘긴 DB_*(테스트 DB)로 접속한다.
require('reflect-metadata');
const { DataSource } = require('typeorm');
const { buildDataSourceOptions, readDatabaseConfig } = require('../../dist/database/database.config');

function assertTestDatabaseName(name) {
  if (typeof name !== 'string' || !name.endsWith('_test')) {
    throw new Error(`테스트 DB 이름은 _test로 끝나야 합니다(현재 ${name}). 개발 DB를 초기화하지 않기 위한 확인입니다.`);
  }
}

/** 테스트 DB에 접속한다. overrides로 엔티티 등을 바꿀 수 있다(예: { entities: [ProbeEntity] }). */
async function openTestDataSource(overrides = {}) {
  const config = readDatabaseConfig();
  assertTestDatabaseName(config.database);
  return new DataSource({ ...buildDataSourceOptions(config), ...overrides }).initialize();
}

/** 마이그레이션 기록을 뺀 현재 스키마의 모든 테이블 자료를 지운다. 각 테스트 앞에서 부른다. */
async function resetTestDatabase(dataSource) {
  assertTestDatabaseName(dataSource.options.database);
  const migrationsTable = dataSource.options.migrationsTableName ?? 'migrations';
  const rows = await dataSource.query(
    'SELECT tablename FROM pg_tables WHERE schemaname = current_schema() AND tablename <> $1',
    [migrationsTable],
  );
  if (rows.length === 0) return;
  const tables = rows.map(({ tablename }) => `"${tablename.replaceAll('"', '""')}"`).join(', ');
  await dataSource.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
}

module.exports = { assertTestDatabaseName, openTestDataSource, resetTestDatabase };

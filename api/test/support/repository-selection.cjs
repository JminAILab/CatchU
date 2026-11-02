// #252 선정 시험 지원. 다른 테스트의 resetTestDatabase(TRUNCATE)가 지운 초기 선정 자료를
// 실제 마이그레이션이 넣는 값 그대로 되돌린다. 초기 값을 테스트에 따로 적지 않는다.
const { randomUUID } = require('node:crypto');
const { openTestDataSource } = require('./test-database.cjs');
const { AllowedScopeRevision, RepositorySelection } = require('../../dist/member-repositories/repository-selection.entity');
const { CreateRepositorySelection1792383899264 } = require('../../dist/database/migrations/1792383899264-CreateRepositorySelection');

/** 빈 격리 스키마에 선정 마이그레이션만 적용해 그 초기 자료를 읽는다. 스키마는 끝나면 지운다. */
async function readInitialSelection(db, current = false) {
  const schema = 'test_252_' + randomUUID().replaceAll('-', '');
  await db.query('CREATE SCHEMA "' + schema + '"');
  try {
    const isolated = await openTestDataSource({ schema, extra: { options: '-c search_path=' + schema + ',public -c TimeZone=UTC' },
      ...(current ? {} : { entities: [AllowedScopeRevision, RepositorySelection], migrations: [CreateRepositorySelection1792383899264] }) });
    try {
      await isolated.runMigrations();
      return Object.freeze({
        scopes: await isolated.manager.find(AllowedScopeRevision, { order: { scopeRevision: 'ASC' } }),
        selections: await isolated.manager.find(RepositorySelection, { order: { repositoryId: 'ASC' } }),
      });
    } finally { await isolated.destroy(); }
  } finally { await db.query('DROP SCHEMA "' + schema + '" CASCADE'); }
}

async function restoreInitialSelection(db, initial) {
  await db.manager.insert(AllowedScopeRevision, initial.scopes.map(row => structuredClone({ ...row })));
  await db.manager.insert(RepositorySelection, initial.selections.map(row => ({ ...row })));
}

// U7 제품 경로는 최신 마이그레이션의 판본/포인터를 쓴다. 구 #252 판본 자체의 회귀는 위 기본값을 유지한다.
const readCurrentSelection = db => readInitialSelection(db, true);
module.exports = { readInitialSelection, readCurrentSelection, restoreInitialSelection };

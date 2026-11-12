const assert = require('node:assert/strict');
const { test } = require('node:test');
const { candidate, createCatchDbFixture, readCatchTestDatabase } = require('../support/catch-db-fixture.cjs');
const { registerCandidates } = require('../../dist/catches/registration-service');

// NC3 catch_asset 칸 셋(revisit_facts·first_work_at·last_work_at)의 마이그레이션과 DB 검사(BR6.2, NFR7.1, NFR8.2).
// 경로·SHA는 합성 값이다. 시간은 단정하지 않는다.
const sha = (letter) => letter.repeat(40);
const factCandidate = () => ({
  ...candidate(), ownCommitShas: [sha('a'), sha('b')],
  revisitFacts: [{ kind: 'REWORKED_LINES', paths: ['src/a.ts'], commits: [sha('a'), sha('b')] }],
  firstWorkAt: '2025-03-02T10:00:00Z', lastWorkAt: '2025-04-10T09:30:00Z',
});
const checkViolation = (error) => error.driverError?.code === '23514';

async function withFixture(work) {
  const fixture = await createCatchDbFixture(readCatchTestDatabase());
  try {
    await work(fixture, fixture.dataSource);
  } finally {
    await fixture.close();
  }
}

const columns = (db, schema) => db.query(`SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'catch_asset'
    AND column_name IN ('revisit_facts', 'first_work_at', 'last_work_at') ORDER BY column_name`, [schema]);

test('NC3 NFR7.1 마이그레이션 전 행은 빈 배열과 NULL이 되고, 되돌리면 칸과 검사가 사라진다', async () => {
  await withFixture(async (fixture, db) => {
    const input = await fixture.receipt({ candidates: [factCandidate()] });
    const [registration] = await db.transaction((manager) => registerCandidates(manager, input));
    const stored = await db.query('SELECT revisit_facts, first_work_at, last_work_at FROM catch_asset');
    assert.deepEqual(stored[0].revisit_facts, factCandidate().revisitFacts);

    await db.undoLastMigration();
    assert.deepEqual(await columns(db, fixture.schema), []);
    const checks = () => db.query(`SELECT conname FROM pg_constraint WHERE conrelid = $1::regclass
      AND (conname LIKE 'ck_catch_asset_revisit_facts_%' OR conname LIKE 'ck_catch_asset_first_work_at_%')
      ORDER BY conname`, [`${fixture.schema}.catch_asset`]);
    assert.deepEqual(await checks(), []);

    // 칸이 없던 때의 행은 다시 올리면 기본값(빈 배열·NULL)이다. 옛 Catch에 값을 채우지 않는다.
    await db.runMigrations();
    assert.deepEqual(await db.query('SELECT catch_id, revisit_facts, first_work_at, last_work_at FROM catch_asset'), [
      { catch_id: registration.catchId, revisit_facts: [], first_work_at: null, last_work_at: null },
    ]);
    assert.deepEqual((await columns(db, fixture.schema)).map((row) => [row.column_name, row.data_type, row.is_nullable]), [
      ['first_work_at', 'timestamp with time zone', 'YES'],
      ['last_work_at', 'timestamp with time zone', 'YES'],
      ['revisit_facts', 'jsonb', 'NO'],
    ]);
    assert.equal((await checks()).length, 2);
    // 엔티티와 마이그레이션이 같은 모양이다.
    assert.deepEqual((await db.driver.createSchemaBuilder().log()).upQueries.map((query) => query.query), []);
  });
});

test('NC3 NFR8.2 DB 검사는 배열 아닌 사실과 시각 하나만·뒤바뀐 시각을 거부한다', async () => {
  await withFixture(async (fixture, db) => {
    const input = await fixture.receipt({ candidates: [factCandidate()] });
    const [{ catchId }] = await db.transaction((manager) => registerCandidates(manager, input));
    const before = await db.query('SELECT revisit_facts, first_work_at, last_work_at FROM catch_asset');
    const writes = [
      ['UPDATE catch_asset SET revisit_facts = $1::jsonb WHERE catch_id = $2', ['{"kind":"REVERTED"}', catchId]],
      ['UPDATE catch_asset SET revisit_facts = $1::jsonb WHERE catch_id = $2', ['"text"', catchId]],
      ['UPDATE catch_asset SET last_work_at = NULL WHERE catch_id = $1', [catchId]],
      ['UPDATE catch_asset SET first_work_at = NULL WHERE catch_id = $1', [catchId]],
      ['UPDATE catch_asset SET first_work_at = last_work_at + interval \'1 second\' WHERE catch_id = $1', [catchId]],
    ];
    for (const [query, parameters] of writes) {
      await assert.rejects(db.query(query, parameters), checkViolation);
    }
    await assert.rejects(db.query('UPDATE catch_asset SET revisit_facts = NULL WHERE catch_id = $1', [catchId]),
      (error) => error.driverError?.code === '23502');
    assert.deepEqual(await db.query('SELECT revisit_facts, first_work_at, last_work_at FROM catch_asset'), before);
    // 둘 다 NULL이거나 같은 시각은 받는다.
    await db.query('UPDATE catch_asset SET first_work_at = last_work_at WHERE catch_id = $1', [catchId]);
    await db.query('UPDATE catch_asset SET first_work_at = NULL, last_work_at = NULL WHERE catch_id = $1', [catchId]);
  });
});

test('NC3 NFR8.2 검사를 어기는 쓰기가 등록 트랜잭션 안에 있으면 그 결과의 Catch가 하나도 남지 않는다', async () => {
  await withFixture(async (fixture, db) => {
    const input = await fixture.receipt({ candidates: [factCandidate()] });
    await assert.rejects(db.transaction(async (manager) => {
      const [{ catchId }] = await registerCandidates(manager, input);
      await manager.query('UPDATE catch_asset SET last_work_at = NULL WHERE catch_id = $1', [catchId]);
    }), checkViolation);
    for (const table of ['catch_asset', 'catch_evidence', 'candidate_registration', 'commit_assignment']) {
      assert.equal((await db.query(`SELECT count(*)::int AS n FROM ${table}`))[0].n, 0, table);
    }
  });
});

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { candidate, createCatchDbFixture, readCatchTestDatabase } = require('../support/catch-db-fixture.cjs');
const { registerCandidates } = require('../../dist/catches/registration-service');

test('근거 position은 기존 Catch별 UUID 조회 순서와 ID·본문을 보존하며 되돌리기·재적용할 수 있다', async () => {
  const fixture = await createCatchDbFixture(readCatchTestDatabase());
  const db = fixture.dataSource;
  const readRows = () => db.query('SELECT * FROM catch_evidence ORDER BY catch_id, catch_evidence_id');
  const hasPosition = async () => (await db.query(`SELECT count(*)::int AS count FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = 'catch_evidence' AND column_name = 'position'`, [fixture.schema]))[0].count === 1;
  try {
    const candidates = [candidate('synthetic-first', 'synthetic-work-first'), candidate('synthetic-second', 'synthetic-work-second')];
    for (const source of candidates) {
      source.evidence = [1, 2, 3].map(index => ({ ...source.evidence[0],
        evidenceId: 'synthetic-evidence-' + index, sourceRevision: 'synthetic-revision-' + index,
      }));
    }
    const input = await fixture.receipt({ candidates });
    await db.transaction(manager => registerCandidates(manager, input));
    // 기존 DB에서 마지막으로 보던 UUID 정렬을 기준으로 backfill한다. 과거 입력 순서를 추측하지 않는다.
    const original = await readRows();
    await db.undoLastMigration(); // U4 작성자 설명 칸(C-14)을 먼저 되돌린다.
    await db.undoLastMigration(); // #387 B 연쇄 삭제를 먼저 되돌린다.
    await db.undoLastMigration();
    assert.equal(await hasPosition(), false);
    const withoutPosition = original.map(({ position, ...row }) => {
      assert.equal(typeof position, 'number');
      return row;
    });
    assert.deepEqual(await readRows(), withoutPosition);
    await db.runMigrations();
    const counts = new Map();
    const expected = withoutPosition.map(row => {
      const position = (counts.get(row.catch_id) ?? 0) + 1;
      counts.set(row.catch_id, position);
      return { ...row, position };
    });
    assert.equal(counts.size, 2);
    assert.deepEqual([...counts.values()], [3, 3]);
    assert.deepEqual(await readRows(), expected);
    const evidenceId = expected[0].catch_evidence_id;
    for (const [value, code] of [[0, '23514'], [-1, '23514'], [null, '23502'], ['1.5', '22P02']]) {
      await assert.rejects(db.query('UPDATE catch_evidence SET position = $1 WHERE catch_evidence_id = $2',
        [value, evidenceId]), error => error.driverError?.code === code);
    }
    assert.deepEqual(await readRows(), expected);
    await db.undoLastMigration(); // U4 작성자 설명 칸(C-14)을 먼저 되돌린다.
    await db.undoLastMigration(); // #387 B 연쇄 삭제를 먼저 되돌린다.
    await db.undoLastMigration();
    assert.equal(await hasPosition(), false);
    assert.deepEqual(await readRows(), withoutPosition);
    await db.runMigrations();
    assert.deepEqual(await readRows(), expected);
    assert.deepEqual((await db.driver.createSchemaBuilder().log()).upQueries.map(query => query.query), []);
  } finally {
    await fixture.close();
  }
});

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createCatchDbFixture, readCatchTestDatabase } = require('../support/catch-db-fixture.cjs');
const { registerCandidates } = require('../../dist/catches/registration-service');

test('제목 nullable 마이그레이션은 기존 자료·빈 제목 제약을 보존하고 null 자료가 있으면 down을 거부한다', async () => {
  const fixture = await createCatchDbFixture(readCatchTestDatabase());
  const db = fixture.dataSource;
  const nullable = async () => (await db.query(`SELECT is_nullable FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = 'catch_asset' AND column_name = 'title'`, [fixture.schema]))[0].is_nullable;
  try {
    const input = await fixture.receipt();
    const [registration] = await db.transaction(manager => registerCandidates(manager, input));
    const [original] = await db.query('SELECT * FROM catch_asset WHERE catch_id = $1', [registration.catchId]);
    // 제목 migration만 남긴 뒤에는 그보다 나중인 작성자 설명 칸(C-14)이 없다.
    // NC3 다시 볼 곳 칸 셋(revisit_facts·first_work_at·last_work_at)도 그보다 나중이라 없다.
    const laterColumns = ['revisit_facts', 'first_work_at', 'last_work_at'];
    const withoutDescription = Object.fromEntries(Object.entries(original).filter(([column]) =>
      !column.startsWith('author_description') && !laterColumns.includes(column)));
    // 되돌렸다 다시 올리면 NC3 칸은 옛 행의 기본값(빈 배열·NULL)이 된다(BR6.2).
    const reapplied = { ...original, revisit_facts: [], first_work_at: null, last_work_at: null };
    await db.undoLastMigration(); // NC3 다시 볼 곳 칸 셋을 먼저 되돌린다.
    await db.undoLastMigration(); // CR2 소속 기록 표를 먼저 되돌린다.
    await db.undoLastMigration(); // U4 작성자 설명 칸(C-14)을 먼저 되돌린다.
    await db.undoLastMigration(); // #387 B 연쇄 삭제를 먼저 되돌린다.
    await db.undoLastMigration(); // 근거 position 추가를 먼저 되돌린다.
    await db.undoLastMigration();
    assert.equal(await nullable(), 'NO');
    await assert.rejects(db.query('UPDATE catch_asset SET title = NULL WHERE catch_id = $1', [registration.catchId]),
      error => error.driverError?.code === '23502');
    await db.runMigrations();
    assert.equal(await nullable(), 'YES');
    assert.deepEqual((await db.query('SELECT * FROM catch_asset WHERE catch_id = $1', [registration.catchId]))[0], reapplied);
    await assert.rejects(db.query('UPDATE catch_asset SET title = $1 WHERE catch_id = $2', ['', registration.catchId]),
      error => error.driverError?.code === '23514');
    await db.undoLastMigration(); // NC3 다시 볼 곳 칸 셋을 먼저 되돌린다.
    await db.undoLastMigration(); // CR2 소속 기록 표를 먼저 되돌린다.
    await db.undoLastMigration(); // U4 작성자 설명 칸(C-14)을 먼저 되돌린다.
    await db.undoLastMigration(); // #387 B 연쇄 삭제
    await db.undoLastMigration(); // 이후 실패 검사는 제목 migration만 대상으로 한다.
    await db.query('UPDATE catch_asset SET title = NULL WHERE catch_id = $1', [registration.catchId]);
    const history = await db.query('SELECT * FROM migrations ORDER BY id');
    await assert.rejects(db.undoLastMigration(), error => error.driverError?.code === '23502');
    assert.equal(await nullable(), 'YES');
    assert.deepEqual(await db.query('SELECT * FROM migrations ORDER BY id'), history);
    assert.deepEqual((await db.query('SELECT * FROM catch_asset WHERE catch_id = $1', [registration.catchId]))[0],
      { ...withoutDescription, title: null });
    // 폐기용 시험 자료를 비운 뒤에만 NOT NULL 복원과 재적용을 검증한다.
    await fixture.reset();
    await db.undoLastMigration();
    assert.equal(await nullable(), 'NO');
    await db.runMigrations();
    assert.equal(await nullable(), 'YES');
    assert.deepEqual((await db.driver.createSchemaBuilder().log()).upQueries.map(query => query.query), []);
  } finally {
    await fixture.close();
  }
});

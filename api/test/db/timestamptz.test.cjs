require('reflect-metadata');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Column, Entity, PrimaryColumn } = require('typeorm');
const { openTestDataSource } = require('../support/test-database.cjs');

// 검증용 엔티티는 제품 src/에 두지 않는다. 테이블은 이 테스트의 연결에만 있는 임시 테이블이다.
class TimeProbe {}
Entity('time_probe')(TimeProbe);
PrimaryColumn({ type: 'int' })(TimeProbe.prototype, 'id');
Column({ type: 'timestamptz' })(TimeProbe.prototype, 'occurredAt');

const timeZone = process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

test(`timestamptz 시각은 저장·조회 뒤 같은 시각이다(Node 시간대 ${timeZone})`, { timeout: 10000 }, async (t) => {
  const dataSource = await openTestDataSource({ entities: [TimeProbe] });
  const runner = dataSource.createQueryRunner();
  t.after(async () => {
    await runner.release();
    await dataSource.destroy();
  });
  await runner.connect();
  assert.equal((await runner.query('SHOW TimeZone'))[0].TimeZone, 'UTC', 'DB 세션 시간대는 UTC');
  await runner.query('CREATE TEMP TABLE time_probe (id int PRIMARY KEY, occurred_at timestamptz NOT NULL)');

  const instants = [
    new Date('2026-09-28T00:30:00.123Z'),
    new Date('2026-12-31T15:00:00.000Z'), // 한국 시각으로는 다음 해 1월 1일 0시
    new Date(2026, 2, 1, 9, 5, 7, 999), // 실행하는 Node의 현지 시각으로 만든 값
  ];
  for (const [index, occurredAt] of instants.entries()) {
    await runner.manager.save(TimeProbe, { id: index, occurredAt });
    const found = await runner.manager.findOneByOrFail(TimeProbe, { id: index });
    assert.ok(found.occurredAt instanceof Date);
    assert.equal(found.occurredAt.getTime(), occurredAt.getTime(), `${occurredAt.toISOString()} 왕복`);

    // DB에 저장된 절대 시각(epoch)도 같아야 한다. 시간대 없는 timestamp였다면 Node 시간대만큼 어긋난다.
    const [{ ms }] = await runner.query(
      'SELECT (extract(epoch FROM occurred_at) * 1000)::bigint AS ms FROM time_probe WHERE id = $1', [index]);
    assert.equal(Number(ms), occurredAt.getTime(), `${occurredAt.toISOString()} DB 저장값`);
  }
});

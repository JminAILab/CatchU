// U2 DailyRunLimit(계약 C-03, 기능 설계 W1·BR1.1~BR1.7, 시나리오 S1~S4, 비기능 NFR4.3·NFR4.7).
// 실제 테스트 DB를 쓴다. 기대 결과는 unit-test-instructions 「시나리오 표」의 daily-run-limit 행이다.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { before, after, beforeEach, test } = require('node:test');
const { Controller, Module, Param, Post } = require('@nestjs/common');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const { DailyRunLimit, DAILY_RUN_LIMIT, koreanUsageDate } = require('../../dist/daily-run-limit/daily-run-limit');
const { DailyRunLimitModule } = require('../../dist/daily-run-limit/daily-run-limit.module');
const { DatabaseModule } = require('../../dist/database/database.module');
const { ErrorsModule, ApiError } = require('../../dist/common/errors');
const { insertMember, startApp, setEnv } = require('./support.cjs');

let db;
let limit;
before(async () => { db = await openTestDataSource(); limit = new DailyRunLimit(db); });
after(async () => { await db?.destroy(); });
beforeEach(async () => { await resetTestDatabase(db); });

const NOW = new Date('2026-11-02T03:00:00Z'); // 한국 시간 2026-11-02 12:00
const countOf = async (memberId, usageDate = koreanUsageDate(NOW)) => {
  const rows = await db.query('SELECT count FROM daily_execution_count WHERE member_id = $1 AND usage_date = $2', [memberId, usageDate]);
  return rows.length === 0 ? null : rows[0].count;
};
const setCount = (memberId, count) => db.query(
  'INSERT INTO daily_execution_count (member_id, usage_date, count) VALUES ($1, $2, $3)', [memberId, koreanUsageDate(NOW), count]);

test('S1 29회 쓴 회원은 허용되어 30이 되고, 세 종류는 한 횟수에 합산하며 회원끼리는 따로 센다', async () => {
  assert.equal(DAILY_RUN_LIMIT, 30);
  const member = await insertMember(db);
  const other = await insertMember(db);
  assert.equal(await limit.consume(member, 'ANALYSIS', NOW), 'ALLOWED');
  assert.equal(await limit.consume(member, 'BASE_SUMMARY', NOW), 'ALLOWED');
  assert.equal(await limit.consume(member, 'JD_SUMMARY', NOW), 'ALLOWED');
  assert.equal(await countOf(member), 3, '분석·기본 요약·JD 요약을 한 행에 합산한다(BR1.1)');
  assert.equal(await countOf(other), null, '다른 회원 행은 생기지 않는다(BR1.6)');
  await db.query('UPDATE daily_execution_count SET count = 29 WHERE member_id = $1', [member]);
  assert.equal(await limit.consume(member, 'JD_SUMMARY', NOW), 'ALLOWED');
  assert.equal(await countOf(member), 30);
});

test('S2 30회 쓴 회원은 LIMIT_REACHED이고 횟수는 그대로다. 429 응답에는 code·문구만 있고 남은 횟수가 없다', async (t) => {
  const member = await insertMember(db);
  await setCount(member, DAILY_RUN_LIMIT);
  assert.equal(await limit.consume(member, 'ANALYSIS', NOW), 'LIMIT_REACHED');
  assert.equal(await countOf(member), DAILY_RUN_LIMIT, '31이 되지 않는다');

  // 호출 Unit의 접수 경로를 흉내 내는 시험용 경로(제품 src에 두지 않는다): consume → LIMIT_REACHED면 ApiError.
  class ProbeController {
    constructor(runLimit) { this.runLimit = runLimit; }
    async run(memberId) {
      if (await this.runLimit.consume(memberId, 'ANALYSIS', NOW) === 'LIMIT_REACHED') throw new ApiError('DAILY_LIMIT_REACHED');
      return { accepted: true };
    }
  }
  Controller('__u2')(ProbeController);
  Reflect.defineMetadata('design:paramtypes', [DailyRunLimit], ProbeController);
  Param('memberId')(ProbeController.prototype, 'run', 0);
  Post('run/:memberId')(ProbeController.prototype, 'run', Object.getOwnPropertyDescriptor(ProbeController.prototype, 'run'));
  class ProbeModule {}
  Module({ imports: [ErrorsModule, DatabaseModule, DailyRunLimitModule], controllers: [ProbeController] })(ProbeModule);
  const restore = setEnv({ NODE_ENV: 'test' });
  const probe = await startApp(ProbeModule);
  t.after(async () => { await probe.app.close(); restore(); });

  const response = await probe.call('POST', `/__u2/run/${member}`);
  assert.equal(response.status, 429);
  assert.deepEqual(response.body, { code: 'DAILY_LIMIT_REACHED', message: '오늘 한도에 도달했습니다' });
  assert.equal(response.headers.get('retry-after'), null);
  assert.ok(!/\d/.test(response.text), '응답 어디에도 횟수·한도 값이 없다(BR1.4)');
});

test('S3 남은 1회를 동시에 두 번 쓰면 하나만 허용된다', async () => {
  // 잠금으로 겹침을 확실히 만든다: A가 트랜잭션 안에서 30을 쓰고 커밋하기 전에 B가 같은 행을 쓴다.
  const member = await insertMember(db);
  await setCount(member, DAILY_RUN_LIMIT - 1);
  const runnerA = db.createQueryRunner();
  await runnerA.connect();
  await runnerA.startTransaction();
  try {
    assert.equal(await limit.consume(member, 'ANALYSIS', NOW, runnerA.manager), 'ALLOWED');
    let settled = false;
    const second = limit.consume(member, 'JD_SUMMARY', NOW).finally(() => { settled = true; });
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(settled, false, 'B는 A의 커밋을 기다린다');
    await runnerA.commitTransaction();
    assert.equal(await second, 'LIMIT_REACHED');
  } finally {
    if (runnerA.isTransactionActive) await runnerA.rollbackTransaction();
    await runnerA.release();
  }
  assert.equal(await countOf(member), DAILY_RUN_LIMIT);

  // 잠금 없이 동시에 부른 경우도 같다.
  const other = await insertMember(db);
  await db.query('INSERT INTO daily_execution_count (member_id, usage_date, count) VALUES ($1, $2, 29)', [other, koreanUsageDate(NOW)]);
  const results = await Promise.all([limit.consume(other, 'ANALYSIS', NOW), limit.consume(other, 'ANALYSIS', NOW)]);
  assert.deepEqual(results.sort(), ['ALLOWED', 'LIMIT_REACHED']);
  assert.equal(await countOf(other), DAILY_RUN_LIMIT);
});

test('S4 한국 시간 23:59와 00:00은 다른 날짜 행에 센다', async () => {
  const member = await insertMember(db);
  const beforeMidnight = new Date('2026-11-02T14:59:59.999Z'); // 한국 2026-11-02 23:59:59.999
  const atMidnight = new Date('2026-11-02T15:00:00.000Z'); // 한국 2026-11-03 00:00
  assert.equal(koreanUsageDate(beforeMidnight), '2026-11-02');
  assert.equal(koreanUsageDate(atMidnight), '2026-11-03');
  await db.query('INSERT INTO daily_execution_count (member_id, usage_date, count) VALUES ($1, $2, $3)', [member, '2026-11-02', DAILY_RUN_LIMIT]);
  assert.equal(await limit.consume(member, 'ANALYSIS', beforeMidnight), 'LIMIT_REACHED');
  assert.equal(await limit.consume(member, 'ANALYSIS', atMidnight), 'ALLOWED', '자정이 지나면 새 날짜로 센다');
  assert.equal(await countOf(member, '2026-11-02'), DAILY_RUN_LIMIT);
  assert.equal(await countOf(member, '2026-11-03'), 1);
});

test('manager로 넘긴 트랜잭션을 호출자가 되돌리면 횟수도 되돌아간다', async () => {
  const member = await insertMember(db);
  await assert.rejects(db.transaction(async (manager) => {
    assert.equal(await limit.consume(member, 'BASE_SUMMARY', NOW, manager), 'ALLOWED');
    throw new ApiError('DAILY_LIMIT_REACHED'); // 발행처럼 한도·다른 이유로 되돌리는 호출자
  }), ApiError);
  assert.equal(await countOf(member), null);
  // 같은 트랜잭션 밖에서는 바로 커밋된다.
  assert.equal(await limit.consume(member, 'BASE_SUMMARY', NOW), 'ALLOWED');
  assert.equal(await countOf(member), 1);
});

test('잘못된 호출은 예외로 끝나고 행을 만들지 않는다: 모르는 종류·잘못된 시각·없는 회원(DB 오류를 삼키지 않음)', async () => {
  const member = await insertMember(db);
  await assert.rejects(limit.consume(member, 'QNA', NOW), TypeError, '질의응답은 하루 횟수를 쓰지 않는다');
  await assert.rejects(limit.consume(member, 'ANALYSIS', new Date('invalid')), TypeError);
  await assert.rejects(limit.consume(randomUUID(), 'ANALYSIS', NOW), (error) => error.driverError?.code === '23503' || error.code === '23503');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM daily_execution_count'))[0].n, 0);
});

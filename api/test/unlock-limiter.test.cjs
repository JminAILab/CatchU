const assert = require('node:assert/strict');
const { test } = require('node:test');
const { UnlockLimiter, UnlockBusyError, DEFAULT_UNLOCK_LIMIT } = require('../dist/share-links/unlock-limiter.js');

const MIN = 60 * 1000;
const at = (ms) => new Date(Date.UTC(2026, 9, 1) + ms);
/** 서비스와 같은 순서: 검사 전 check(자리 예약) → 틀림 기록. check가 막으면 false. */
function fail(limiter, key, time) {
  if (limiter.check(key, time).blocked) return false;
  limiter.recordFailure(key, time);
  return true;
}

test('15분 안에 10번 틀리면 그때부터 15분 차단하고, 남은 초는 올림한다', () => {
  const limiter = new UnlockLimiter();
  for (let i = 0; i < 9; i++) fail(limiter, 'k', at(i * 1000));
  assert.equal(limiter.blockedFor('k', at(9000)), null);
  fail(limiter, 'k', at(10_000)); // 10번째
  assert.deepEqual(limiter.check('k', at(10_000)), { blocked: true, reason: 'limit', retryAfterSeconds: 900 });
  assert.equal(limiter.blockedFor('k', at(10_100)), 900, '899.9초 → 900');
  assert.equal(limiter.blockedFor('k', at(10_000 + 15 * MIN - 1)), 1);
  assert.equal(limiter.check('k', at(10_000 + 15 * MIN)).blocked, false);
});

test('차단 중 요청·실패는 세지 않아 차단 종료 시각이 처음 그대로다', () => {
  const limiter = new UnlockLimiter();
  for (let i = 0; i < 10; i++) fail(limiter, 'k', at(0));
  for (let s = 1; s <= 300; s++) {
    assert.equal(fail(limiter, 'k', at(s * 1000)), false, '차단 중에는 검사 자체를 하지 않는다');
    limiter.recordFailure('k', at(s * 1000)); // 기록을 억지로 보내도 무시된다
  }
  assert.equal(limiter.blockedFor('k', at(15 * MIN - 1)), 1, '종료 시각 = 처음 차단 + 15분');
  assert.equal(limiter.check('k', at(15 * MIN)).blocked, false);
  // 풀린 뒤에는 처음부터 다시 센다.
  limiter.recordFailure('k', at(15 * MIN));
  assert.equal(limiter.blockedFor('k', at(15 * MIN + 1)), null);
});

test('15분 창 밖의 실패는 세지 않고, 성공하면 실패 기록을 지운다', () => {
  const limiter = new UnlockLimiter();
  for (let i = 0; i < 9; i++) fail(limiter, 'k', at(i * 2 * MIN)); // 0~16분
  fail(limiter, 'k', at(17 * MIN)); // 17분 기준 창에는 4~16분의 7번 + 이번 = 8번
  assert.equal(limiter.blockedFor('k', at(17 * MIN)), null);
  limiter.check('k', at(17 * MIN));
  limiter.recordSuccess('k', at(17 * MIN));
  assert.equal(limiter.size, 0);
  for (let i = 0; i < 9; i++) fail(limiter, 'k', at(18 * MIN + i));
  assert.equal(limiter.blockedFor('k', at(18 * MIN + 10)), null, '성공 뒤 9번은 차단 전');
});

test('차단 중 성공 기록은 차단을 지우지 않는다', () => {
  const limiter = new UnlockLimiter();
  for (let i = 0; i < 10; i++) fail(limiter, 'k', at(0));
  limiter.recordSuccess('k', at(1000));
  assert.equal(limiter.blockedFor('k', at(1000)), 899);
});

test('링크·접속지 키마다 따로 센다', () => {
  const limiter = new UnlockLimiter();
  for (let i = 0; i < 10; i++) fail(limiter, 'link-a|1.1.1.1', at(0));
  assert.notEqual(limiter.blockedFor('link-a|1.1.1.1', at(1)), null);
  assert.equal(limiter.check('link-a|2.2.2.2', at(1)).blocked, false, '같은 링크의 다른 접속지는 막지 않는다');
  assert.equal(limiter.check('link-b|1.1.1.1', at(1)).blocked, false, '같은 접속지의 다른 링크는 막지 않는다');
});

test('기록 상한이 차면 만료된 기록 → 가장 오래 쓰지 않은 기록 순으로 밀어내고, 차단·검사 중 기록은 남긴다', () => {
  const limiter = new UnlockLimiter({ ...DEFAULT_UNLOCK_LIMIT, maxEntries: 3 });
  for (let i = 0; i < 10; i++) fail(limiter, 'blocked', at(0)); // 0분에 차단 → 15분에 풀림
  fail(limiter, 'old', at(MIN)); // 1번 실패, 가장 오래 쓰지 않음
  fail(limiter, 'recent', at(2 * MIN));
  assert.equal(limiter.size, 3);

  // 새 키: 만료된 기록이 없으니 차단 중이 아닌 가장 오래된 'old'를 밀어낸다.
  assert.equal(limiter.check('new', at(3 * MIN)).blocked, false);
  assert.equal(limiter.size, 3, '상한을 넘지 않는다');
  limiter.release('new');
  assert.notEqual(limiter.blockedFor('blocked', at(3 * MIN)), null, '차단 중 기록은 남는다');
  // 밀려난 'old'는 처음부터 센다(주소 누적 초기화. 링크 전체 누적은 link-limiter가 따로 지킨다).
  assert.equal(limiter.check('old', at(4 * MIN)).blocked, false);
  assert.equal(limiter.size, 3);
});

test('기록 상한이 차고 모두 차단·검사 중이면 새 키만 검사 없이 거절하고, 남은 초는 검사 중 자리가 있으면 1초다', () => {
  const limiter = new UnlockLimiter({ ...DEFAULT_UNLOCK_LIMIT, maxEntries: 2 });
  for (let i = 0; i < 10; i++) fail(limiter, 'blocked-a', at(0)); // 15분에 풀림
  for (let i = 0; i < 10; i++) fail(limiter, 'blocked-b', at(MIN)); // 16분에 풀림
  // 모두 차단 중: 가장 빨리 끝나는 차단(15분)까지.
  assert.deepEqual(limiter.check('new', at(3 * MIN)), { blocked: true, reason: 'capacity', retryAfterSeconds: 12 * 60 });
  assert.equal(limiter.size, 2);
  // 기존 키는 영향받지 않는다(차단 중이라 차단으로 판정).
  assert.equal(limiter.check('blocked-a', at(3 * MIN)).reason, 'limit');

  // 하나가 검사 중이면 곧 풀리므로 1초.
  const busy = new UnlockLimiter({ ...DEFAULT_UNLOCK_LIMIT, maxEntries: 2 });
  for (let i = 0; i < 10; i++) fail(busy, 'blocked', at(0));
  assert.equal(busy.check('checking', at(MIN)).blocked, false); // 예약된 자리
  assert.deepEqual(busy.check('new', at(MIN)), { blocked: true, reason: 'capacity', retryAfterSeconds: 1 });
  busy.recordFailure('checking', at(MIN));
  // 예약이 풀리면 'checking'(차단 아님)을 밀어내고 받는다.
  assert.equal(busy.check('new', at(MIN)).blocked, false);
});

test('같은 키의 작업은 하나씩 실행되고, 실행 중 포함 3개가 걸려 있으면 4번째부터 기다리지 않고 거절한다', async () => {
  const limiter = new UnlockLimiter({ ...DEFAULT_UNLOCK_LIMIT, maxPendingPerKey: 3 });
  let running = 0;
  let maxRunning = 0;
  const order = [];
  const job = (id) => limiter.runExclusive('k', async () => {
    running += 1; maxRunning = Math.max(maxRunning, running);
    await new Promise((resolve) => setTimeout(resolve, 20));
    order.push(id); running -= 1;
    return id;
  });
  const results = await Promise.allSettled([job(1), job(2), job(3), job(4), job(5)]);
  assert.equal(maxRunning, 1, '동시에 둘 이상 실행하지 않는다');
  assert.deepEqual(order, [1, 2, 3]);
  assert.deepEqual(results.slice(3).map(({ reason }) => reason instanceof UnlockBusyError), [true, true]);
  // 다른 키는 기다리지 않는다.
  assert.equal(await limiter.runExclusive('other', async () => 'ok'), 'ok');
  // 끝난 뒤에는 다시 받는다.
  assert.equal(await job(6), 6);
});

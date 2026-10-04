const assert = require('node:assert/strict');
const { test } = require('node:test');
const { LinkLimiter } = require('../dist/share-links/link-limiter.js');

// #150 10/4 보안 의견 2·3: 링크 전체 제한. 상한 N은 미정이라 후보 20·30·50을 주입해 같은 규칙을 검사한다(가짜 시계).

const MIN = 60 * 1000;
const at = (ms) => new Date(Date.UTC(2026, 9, 1) + ms);
const CANDIDATES = [20, 30, 50];
const options = (maxFailures, extra = {}) => ({ maxFailures, windowMs: 15 * MIN, blockMs: 15 * MIN, maxInFlight: 3, maxEntries: 10_000, ...extra });
/** 서비스와 같은 순서: 예약 → 틀림 기록. 예약이 막히면 그 결과를 돌려준다. */
function fail(limiter, link, time) {
  const reservation = limiter.reserve(link, time);
  if (reservation.ok) limiter.recordFailure(link, time);
  return reservation;
}

for (const N of CANDIDATES) {
  test(`[N=${N}] 누적 차단: 집계 기간 안에 N번 틀리면 N번째에 차단하고, 차단 중에는 예약을 받지 않는다`, () => {
    const limiter = new LinkLimiter(options(N));
    for (let i = 0; i < N - 1; i++) assert.equal(fail(limiter, 'L', at(i * 1000)).ok, true);
    assert.equal(limiter.blockedFor('L', at(N * 1000)), null, 'N-1번까지는 차단 전');
    assert.equal(fail(limiter, 'L', at(N * 1000)).ok, true, 'N번째도 검사한다');
    assert.equal(limiter.blockedFor('L', at(N * 1000)), 900);
    assert.deepEqual(limiter.reserve('L', at(N * 1000 + 100)), { ok: false, reason: 'limit', retryAfterSeconds: 900 });
    assert.equal(limiter.reserve('other', at(N * 1000)).ok, true, '다른 링크는 막지 않는다');
  });

  test(`[N=${N}] 누적 차단: 차단 중 요청·기록은 세지 않아 종료 시각이 그대로이고, 풀리면 처음부터 센다`, () => {
    const limiter = new LinkLimiter(options(N));
    for (let i = 0; i < N; i++) fail(limiter, 'L', at(0));
    for (let s = 1; s <= 120; s++) {
      assert.equal(fail(limiter, 'L', at(s * 1000)).ok, false);
      limiter.recordFailure('L', at(s * 1000)); // 예약 없이 보낸 기록은 무시된다
    }
    assert.equal(limiter.blockedFor('L', at(15 * MIN - 1)), 1, '종료 시각 = 처음 차단 + 15분');
    assert.equal(limiter.blockedFor('L', at(15 * MIN)), null, '종료 시각에 정확히 풀린다');
    for (let i = 0; i < N - 1; i++) fail(limiter, 'L', at(15 * MIN + i));
    assert.equal(limiter.blockedFor('L', at(15 * MIN + N)), null, '풀린 뒤 N-1번은 차단 전');
  });

  test(`[N=${N}] 집계 경계: 정확히 15분 지난 실패는 빠지고, 15분 미만은 남는다`, () => {
    const limiter = new LinkLimiter(options(N));
    fail(limiter, 'L', at(0)); // 0초의 실패 1번
    for (let i = 0; i < N - 2; i++) fail(limiter, 'L', at(MIN + i)); // 1분대에 N-2번 → 합계 N-1
    // 14분 59.999초: 0초 실패가 아직 창 안이라 이번이 N번째 → 차단
    const inside = new LinkLimiter(options(N));
    fail(inside, 'L', at(0));
    for (let i = 0; i < N - 2; i++) fail(inside, 'L', at(MIN + i));
    fail(inside, 'L', at(15 * MIN - 1));
    assert.notEqual(inside.blockedFor('L', at(15 * MIN - 1)), null, '15분 미만 실패는 센다');
    // 정확히 15분: 0초 실패가 빠져 이번까지 N-1번 → 차단 전
    fail(limiter, 'L', at(15 * MIN));
    assert.equal(limiter.blockedFor('L', at(15 * MIN)), null, '정확히 15분 지난 실패는 세지 않는다');
  });

  test(`[N=${N}] 성공은 링크 전체 실패 기록을 지우지 않는다`, () => {
    const limiter = new LinkLimiter(options(N));
    for (let i = 0; i < N - 1; i++) fail(limiter, 'L', at(i));
    assert.equal(limiter.reserve('L', at(N)).ok, true);
    limiter.recordSuccess('L');
    assert.equal(limiter.blockedFor('L', at(N)), null);
    fail(limiter, 'L', at(N + 1));
    assert.notEqual(limiter.blockedFor('L', at(N + 1)), null, '성공 뒤 1번 더 틀리면 N번째라 차단');
  });

  test(`[N=${N}] 예약 상한: 실패와 검사 중의 합이 N에 닿으면 검사 없이 1초로 거절하고, 모두 실패하면 차단 전 검사는 정확히 N번이다`, () => {
    const limiter = new LinkLimiter(options(N));
    let checked = 0;
    let busy = 0;
    // 한 번에 4개씩 동시에 예약한 뒤(검사 중 상한 3) 모두 틀린 것으로 기록한다.
    for (let wave = 0; wave < N && limiter.blockedFor('L', at(wave)) === null; wave++) {
      const admitted = [];
      for (let i = 0; i < 4; i++) {
        const reservation = limiter.reserve('L', at(wave));
        if (reservation.ok) admitted.push(i);
        else {
          busy += 1;
          assert.deepEqual(reservation, { ok: false, reason: 'busy', retryAfterSeconds: 1 });
        }
      }
      admitted.forEach(() => limiter.recordFailure('L', at(wave)));
      checked += admitted.length;
    }
    assert.equal(checked, N, '차단 전 검사는 정확히 N번');
    assert.ok(busy > 0);
    assert.notEqual(limiter.blockedFor('L', at(N)), null);
    assert.equal(limiter.inFlight, 0, '예약이 모두 풀렸다');
  });
}

test('동시 검사 상한: 한 링크의 검사 중은 3개까지이고, 넘치면 실패로 세지 않고 1초로 거절한다(N과 별개)', () => {
  for (const N of [...CANDIDATES, null]) {
    const limiter = new LinkLimiter(options(N));
    for (let i = 0; i < 3; i++) assert.equal(limiter.reserve('L', at(0)).ok, true);
    assert.deepEqual(limiter.reserve('L', at(0)), { ok: false, reason: 'busy', retryAfterSeconds: 1 });
    assert.equal(limiter.inFlight, 3);
    assert.equal(limiter.reserve('M', at(0)).ok, true, '다른 링크는 따로 센다');
    limiter.release('L');
    assert.equal(limiter.reserve('L', at(0)).ok, true, '자리가 풀리면 다시 받는다');
    for (let i = 0; i < 3; i++) limiter.release('L');
    limiter.release('M');
    assert.equal(limiter.inFlight, 0);
    assert.equal(limiter.size, 0, '실패가 없는 빈 기록은 지운다');
  }
});

test('N이 null이면 누적 차단을 하지 않지만 동시 검사 상한은 적용한다', () => {
  const limiter = new LinkLimiter(options(null));
  for (let i = 0; i < 500; i++) assert.equal(fail(limiter, 'L', at(i)).ok, true);
  assert.equal(limiter.blockedFor('L', at(500)), null);
  assert.equal(limiter.size, 0, '실패를 쌓지 않는다');
});

test('기록 상한: 실패 누적이 남은 링크 기록은 밀어내지 않고, 집계가 끝난 기록만 정리한다', () => {
  const limiter = new LinkLimiter(options(20, { maxEntries: 2 }));
  fail(limiter, 'A', at(0)); // 15분까지 누적 유지
  fail(limiter, 'B', at(MIN)); // 16분까지
  // 새 링크: 누적이 남은 A·B를 밀어내지 않고 거절. 남은 초는 가장 빨리 비는 A(15분)까지.
  assert.deepEqual(limiter.reserve('C', at(2 * MIN)), { ok: false, reason: 'capacity', retryAfterSeconds: 13 * 60 });
  assert.equal(limiter.size, 2);
  assert.equal(limiter.reserve('A', at(2 * MIN)).ok, true, '기존 링크는 영향받지 않는다');
  limiter.recordFailure('A', at(2 * MIN)); // A는 17분까지 누적
  // 16분: B의 실패가 빠져 정리되고 C를 받는다. A의 누적은 남는다.
  assert.equal(limiter.reserve('C', at(16 * MIN)).ok, true);
  limiter.release('C');
  // 16분에는 0분 실패가 집계 기간을 벗어나고 2분 실패 1번이 남는다. 밀려났다면 이 1번도 사라져 19번 더 틀려도 차단되지 않는다.
  for (let i = 0; i < 18; i++) fail(limiter, 'A', at(16 * MIN + i));
  assert.equal(limiter.blockedFor('A', at(16 * MIN + 18)), null, '1 + 18 = 19번은 차단 전');
  fail(limiter, 'A', at(16 * MIN + 18));
  assert.notEqual(limiter.blockedFor('A', at(16 * MIN + 18)), null, '2분 실패가 남아 있어 1 + 19 = 20번째에 차단(누적이 초기화되지 않았다)');
});

test('기록 상한: 남은 기록이 모두 검사 중이면 새 링크는 1초, 차단 중이면 차단 종료까지 거절한다', () => {
  const busy = new LinkLimiter(options(20, { maxEntries: 1 }));
  assert.equal(busy.reserve('A', at(0)).ok, true); // 검사 중
  assert.deepEqual(busy.reserve('B', at(0)), { ok: false, reason: 'capacity', retryAfterSeconds: 1 });
  busy.release('A');
  assert.equal(busy.reserve('B', at(0)).ok, true, '빈 기록이 지워져 자리가 생긴다');

  const blocked = new LinkLimiter(options(20, { maxEntries: 1 }));
  for (let i = 0; i < 20; i++) fail(blocked, 'A', at(0));
  assert.deepEqual(blocked.reserve('B', at(5 * MIN)), { ok: false, reason: 'capacity', retryAfterSeconds: 10 * 60 });
  assert.equal(blocked.reserve('B', at(15 * MIN)).ok, true, 'A의 차단이 끝나면 정리하고 받는다');
});

test('예약하지 않은 기록·중복 해제는 무시하고 검사 중 수가 음수가 되지 않는다', () => {
  const limiter = new LinkLimiter(options(20));
  limiter.recordFailure('L', at(0));
  limiter.release('L');
  limiter.recordSuccess('L');
  assert.equal(limiter.size, 0);
  assert.equal(limiter.reserve('L', at(0)).ok, true);
  limiter.release('L');
  limiter.release('L');
  assert.equal(limiter.inFlight, 0);
});

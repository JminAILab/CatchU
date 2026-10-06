const assert = require('node:assert/strict');
const { test } = require('node:test');
const { RequestRateLimiter } = require('../dist/share-links/request-rate-limiter.js');
const { PRODUCT_ISSUE_RATE_LIMIT } = require('../dist/share-links/issue-rate-limit.js');
const { createUnlockControls, PRODUCT_UNLOCK_POLICY } = require('../dist/share-links/unlock-policy.js');

// #219 요청 빈도 상한. 가짜 시각(밀리초)으로 창 경계를 확인한다.
const T0 = Date.UTC(2026, 9, 6, 0, 0, 0);
const at = (ms) => new Date(T0 + ms);
const limiter = (options = {}) => new RequestRateLimiter({ maxRequests: 3, windowMs: 60_000, maxKeys: 100, ...options });

test('창 안에서 상한까지 받고, 넘으면 가장 오래된 요청이 창을 벗어날 때까지 남은 초(올림)로 거부한다', () => {
  const rate = limiter();
  assert.deepEqual(rate.take('a', at(0)), { allowed: true });
  assert.deepEqual(rate.take('a', at(10_000)), { allowed: true });
  assert.deepEqual(rate.take('a', at(20_000)), { allowed: true });
  assert.deepEqual(rate.take('a', at(30_500)), { allowed: false, retryAfterSeconds: 30 }); // 60_000 - 30_500 = 29.5초 → 30
  assert.deepEqual(rate.take('a', at(59_999)), { allowed: false, retryAfterSeconds: 1 }); // 최소 1초
  assert.deepEqual(rate.take('a', at(60_000)), { allowed: true }, '첫 요청이 창을 벗어나면 한 자리가 빈다');
  assert.deepEqual(rate.take('a', at(60_001)), { allowed: false, retryAfterSeconds: 10 });
});

test('거부한 요청은 세지 않아 계속 보내도 다시 받는 시각이 늦어지지 않는다', () => {
  const rate = limiter({ maxRequests: 2 });
  rate.take('a', at(0));
  rate.take('a', at(1_000));
  for (let ms = 2_000; ms < 60_000; ms += 500) assert.equal(rate.take('a', at(ms)).allowed, false);
  assert.deepEqual(rate.take('a', at(60_000)), { allowed: true });
});

test('키마다 따로 센다', () => {
  const rate = limiter({ maxRequests: 1 });
  assert.equal(rate.take('member-a', at(0)).allowed, true);
  assert.equal(rate.take('member-a', at(1)).allowed, false);
  assert.equal(rate.take('member-b', at(2)).allowed, true);
});

test('기록 상한: 창이 지난 키부터 지우고, 그래도 차면 가장 오래 쓰지 않은 키를 밀어내며 새 요청은 거절하지 않는다', () => {
  const rate = limiter({ maxRequests: 1, maxKeys: 3 });
  rate.take('a', at(0));
  rate.take('b', at(1_000));
  rate.take('c', at(2_000));
  assert.equal(rate.take('a', at(3_000)).allowed, false); // 거부도 사용으로 친다: 순서 b, c, a
  // 모두 창 안이라 가장 오래 쓰지 않은 b를 밀어내고 새 키를 받는다.
  assert.equal(rate.take('d', at(4_000)).allowed, true);
  assert.equal(rate.size, 3);
  assert.equal(rate.take('a', at(5_000)).allowed, false, '최근에 쓴 a의 기록은 남는다');
  assert.equal(rate.take('b', at(6_000)).allowed, true, '밀려난 b는 처음부터 센다'); // c를 밀어낸다: 순서 a, d, b
  // 마지막 요청이 창을 벗어난 a를 먼저 지우므로, 창 안의 d는 밀려나지 않는다.
  assert.equal(rate.take('x', at(62_500)).allowed, true);
  assert.equal(rate.size, 3);
  assert.equal(rate.take('d', at(62_600)).allowed, false, '창 안 기록은 그대로 센다');
});

test('상한 값이 1 이상의 정수가 아니면 만들지 않는다', () => {
  for (const broken of [{ maxRequests: 0 }, { windowMs: 1.5 }, { maxKeys: null }, { maxRequests: Number.POSITIVE_INFINITY }]) {
    assert.throws(() => limiter(broken), /1 이상의 정수/);
  }
});

test('운영 정책: 회원 발급은 1분 10회, 같은 링크·주소의 비밀번호 확인은 1분 20회다', () => {
  assert.deepEqual({ ...PRODUCT_ISSUE_RATE_LIMIT }, { maxRequests: 10, windowMs: 60_000, maxKeys: 10_000 });
  assert.deepEqual({ ...PRODUCT_UNLOCK_POLICY.rate }, { maxRequests: 20, windowMs: 60_000, maxKeys: 10_000 });
  assert.throws(() => createUnlockControls({ ...PRODUCT_UNLOCK_POLICY, rate: { ...PRODUCT_UNLOCK_POLICY.rate, maxRequests: 0 } }), /정책값/);
});

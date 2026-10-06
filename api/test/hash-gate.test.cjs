const assert = require('node:assert/strict');
const { test } = require('node:test');
const { HashGate, UnlockSaturatedError } = require('../dist/share-links/hash-gate.js');
const { createUnlockControls, PRODUCT_UNLOCK_POLICY } = require('../dist/share-links/unlock-policy.js');

// unlock 경로 전체 해시 자원: 실행 중 해시와 대기를 따로 센다.

const tick = () => new Promise((resolve) => setImmediate(resolve));
function gate() {
  let open;
  const promise = new Promise((resolve) => { open = resolve; });
  return { promise, open };
}

test('실행 중 해시는 maxRunning개를 넘지 않고, 나머지는 차례를 기다린다', async () => {
  const hashes = new HashGate({ maxRunning: 2, maxWaiting: 5 });
  let running = 0;
  let peak = 0;
  const hold = gate();
  const jobs = Array.from({ length: 5 }, () => {
    const ticket = hashes.enter();
    return ticket.runHash(async () => {
      running += 1; peak = Math.max(peak, running);
      await hold.promise;
      running -= 1;
    }).finally(() => ticket.leave());
  });
  await tick();
  assert.deepEqual(hashes.stats, { active: 5, running: 2, waiting: 3 });
  hold.open();
  await Promise.all(jobs);
  assert.equal(peak, 2);
  assert.deepEqual(hashes.stats, { active: 0, running: 0, waiting: 0 });
});

test('진행 중 요청이 maxRunning + maxWaiting개면 다음 요청은 검사 없이 거절한다', () => {
  const hashes = new HashGate({ maxRunning: 2, maxWaiting: 3 });
  const tickets = Array.from({ length: 5 }, () => hashes.enter());
  assert.throws(() => hashes.enter(), UnlockSaturatedError);
  tickets[0].leave();
  tickets[0].leave(); // 두 번 불러도 한 번만 돌려준다
  assert.equal(hashes.stats.active, 4);
  assert.doesNotThrow(() => hashes.enter());
});

test('해시 작업이 예외로 끝나도 차례를 넘겨 다음 작업이 실행된다', async () => {
  const hashes = new HashGate({ maxRunning: 1, maxWaiting: 2 });
  const first = hashes.enter();
  const second = hashes.enter();
  const failing = first.runHash(async () => { throw new Error('verifier broken'); });
  const next = second.runHash(async () => 'ran');
  await assert.rejects(failing, /verifier broken/);
  assert.equal(await next, 'ran');
  first.leave();
  second.leave();
  assert.deepEqual(hashes.stats, { active: 0, running: 0, waiting: 0 });
});

test('운영 정책: 링크 전체 실패 상한은 30이고, 정책값이 1 이상의 정수가 아니면 만들지 않는다', () => {
  assert.equal(PRODUCT_UNLOCK_POLICY.link.maxFailures, 30);
  assert.deepEqual(PRODUCT_UNLOCK_POLICY.hash, { maxRunning: 2, maxWaiting: 20 });
  assert.doesNotThrow(() => createUnlockControls(PRODUCT_UNLOCK_POLICY));
  for (const maxFailures of [20, 50]) {
    assert.doesNotThrow(() => createUnlockControls({ ...PRODUCT_UNLOCK_POLICY, link: { ...PRODUCT_UNLOCK_POLICY.link, maxFailures } }));
  }
  for (const broken of [
    { link: { ...PRODUCT_UNLOCK_POLICY.link, maxFailures: null } },
    { link: { ...PRODUCT_UNLOCK_POLICY.link, maxFailures: 0 } },
    { link: { ...PRODUCT_UNLOCK_POLICY.link, maxFailures: 2.5 } },
    { link: { ...PRODUCT_UNLOCK_POLICY.link, maxInFlight: 0 } },
    { hash: { maxRunning: 0, maxWaiting: 20 } },
  ]) {
    assert.throws(() => createUnlockControls({ ...PRODUCT_UNLOCK_POLICY, ...broken }), /정책값/);
  }
});

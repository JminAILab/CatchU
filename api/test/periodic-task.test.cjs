const assert = require('node:assert/strict');
const { test } = require('node:test');
const { PeriodicTask } = require('../dist/common/periodic-task');

const sleep = ms => new Promise(done => setTimeout(done, ms));

test('한 번이 끝난 뒤 다음 주기를 예약해 실행이 겹치지 않는다', async () => {
  let running = 0;
  let overlap = 0;
  let runs = 0;
  const task = new PeriodicTask({ name: 'probe', intervalMs: 5, failed: () => assert.fail('실패하지 않아야 한다'), run: async () => {
    running += 1; overlap = Math.max(overlap, running); runs += 1;
    await sleep(20);
    running -= 1;
  } });
  task.start();
  task.start();
  await sleep(120);
  await task.stop();
  assert.ok(runs >= 2, `runs=${runs}`);
  assert.equal(overlap, 1);
});

test('실행이 실패해도 오류 이름만 알리고 다음 주기를 계속한다', async () => {
  const failures = [];
  let runs = 0;
  const task = new PeriodicTask({ name: 'probe', intervalMs: 5, failed: (name, error) => failures.push([name, error]), run: async () => {
    runs += 1;
    throw new TypeError('원문 메시지는 알리지 않는다');
  } });
  task.start();
  await sleep(60);
  await task.stop();
  assert.ok(runs >= 2, `runs=${runs}`);
  assert.deepEqual(failures[0], ['probe', 'TypeError']);
});

test('stop()은 진행 중인 실행을 기다리고, 그 뒤로는 실행하지 않는다', async () => {
  let finished = 0;
  let runs = 0;
  const task = new PeriodicTask({ name: 'probe', intervalMs: 5, failed: () => {}, run: async () => {
    runs += 1;
    await sleep(30);
    finished += 1;
  } });
  task.start();
  await sleep(15);
  assert.equal(runs, 1);
  await task.stop();
  assert.equal(finished, 1);
  await sleep(30);
  assert.equal(runs, 1);
});

test('시작하지 않은 작업의 stop()은 바로 끝나고, 주기는 양의 정수만 받는다', async () => {
  let runs = 0;
  const task = new PeriodicTask({ name: 'probe', intervalMs: 5, failed: () => {}, run: async () => { runs += 1; } });
  await task.stop();
  await sleep(20);
  assert.equal(runs, 0);
  for (const intervalMs of [0, -1, 1.5, Number.NaN]) {
    assert.throws(() => new PeriodicTask({ name: 'probe', intervalMs, failed: () => {}, run: async () => {} }));
  }
});

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

test('기록 함수까지 실패해도 처리되지 않은 거부 없이 다음 주기를 계속한다', async () => {
  const written = [];
  const write = process.stderr.write;
  process.stderr.write = chunk => { written.push(String(chunk)); return true; };
  let runs = 0;
  try {
    const task = new PeriodicTask({ name: 'probe', intervalMs: 5,
      failed: () => { throw new Error('기록 실패'); },
      run: async () => { runs += 1; throw new RangeError('실행 실패'); } });
    task.start();
    await sleep(60);
    await task.stop();
  } finally {
    process.stderr.write = write;
  }
  assert.ok(runs >= 2, `runs=${runs}`);
  assert.equal(written[0], '[PeriodicTask] probe failed: RangeError\n');
});

test('멈추는 중에 다시 시작해도 실행이 겹치지 않고 주기를 이어 간다', async () => {
  let running = 0;
  let overlap = 0;
  let runs = 0;
  const task = new PeriodicTask({ name: 'probe', intervalMs: 5, failed: () => assert.fail('실패하지 않아야 한다'), run: async () => {
    running += 1; overlap = Math.max(overlap, running); runs += 1;
    await sleep(30);
    running -= 1;
  } });
  task.start();
  await sleep(15);
  const stopping = task.stop();
  task.start();
  await stopping;
  await sleep(80);
  await task.stop();
  assert.equal(overlap, 1);
  assert.ok(runs >= 2, `runs=${runs}`);
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

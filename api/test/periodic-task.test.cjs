const assert = require('node:assert/strict');
const { test } = require('node:test');
const { PeriodicTask } = require('../dist/common/periodic-task');

const sleep = ms => new Promise(done => setTimeout(done, ms));
// 시간을 짐작하지 않고 조건이 될 때까지 기다린다. 부하가 큰 CI에서도 순서만 본다.
async function until(condition, label) {
  for (let i = 0; i < 400; i += 1) {
    if (condition()) return;
    await sleep(5);
  }
  assert.fail(`${label}: 2초 안에 조건이 되지 않았다`);
}
// 시험이 정할 때까지 끝나지 않는 실행. starts는 시작한 실행 수, release()는 진행 중인 실행을 끝낸다.
function gatedRun() {
  const state = { starts: 0, active: 0, overlap: 0, finished: 0, gates: [] };
  state.run = async () => {
    state.starts += 1;
    state.active += 1;
    state.overlap = Math.max(state.overlap, state.active);
    await new Promise(done => state.gates.push(done));
    state.active -= 1;
    state.finished += 1;
  };
  state.release = () => { for (const done of state.gates.splice(0)) done(); };
  return state;
}

test('한 번이 끝난 뒤 다음 주기를 예약해 실행이 겹치지 않는다', async () => {
  const probe = gatedRun();
  const task = new PeriodicTask({ name: 'probe', intervalMs: 5, failed: () => assert.fail('실패하지 않아야 한다'), run: probe.run });
  task.start();
  task.start();
  await until(() => probe.starts === 1, '첫 실행');
  // 첫 실행이 끝나지 않은 동안 여러 주기가 지나도 두 번째 실행은 시작하지 않는다.
  await sleep(30);
  assert.equal(probe.starts, 1);
  probe.release();
  await until(() => probe.starts === 2, '두 번째 실행');
  probe.release();
  const stopping = task.stop();
  probe.release();
  await stopping;
  assert.equal(probe.overlap, 1);
});

test('실행이 실패해도 오류 이름만 알리고 다음 주기를 계속한다', async () => {
  const failures = [];
  let runs = 0;
  const task = new PeriodicTask({ name: 'probe', intervalMs: 5, failed: (name, error) => failures.push([name, error]), run: async () => {
    runs += 1;
    throw new TypeError('원문 메시지는 알리지 않는다');
  } });
  task.start();
  await until(() => runs >= 2, '두 번째 실행');
  await task.stop();
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
    await until(() => runs >= 2, '두 번째 실행');
    await task.stop();
  } finally {
    process.stderr.write = write;
  }
  assert.equal(written[0], '[PeriodicTask] probe failed: RangeError\n');
});

test('멈추는 중에 다시 시작해도 실행이 겹치지 않고 주기를 이어 간다', async () => {
  const probe = gatedRun();
  const task = new PeriodicTask({ name: 'probe', intervalMs: 5, failed: () => assert.fail('실패하지 않아야 한다'), run: probe.run });
  task.start();
  await until(() => probe.starts === 1, '첫 실행');
  const stopping = task.stop();
  task.start();
  probe.release();
  await stopping;
  await until(() => probe.starts === 2, '다시 시작한 뒤의 실행');
  // 두 번째 실행이 끝나지 않은 동안 다른 실행이 끼어들지 않는다.
  await sleep(30);
  assert.equal(probe.starts, 2);
  const stopped = task.stop();
  probe.release();
  await stopped;
  assert.equal(probe.overlap, 1);
});

test('stop()은 진행 중인 실행을 기다리고, 그 뒤로는 실행하지 않는다', async () => {
  const probe = gatedRun();
  const task = new PeriodicTask({ name: 'probe', intervalMs: 5, failed: () => {}, run: probe.run });
  task.start();
  await until(() => probe.starts === 1, '첫 실행');
  let stopped = false;
  const stopping = task.stop().then(() => { stopped = true; });
  await sleep(20);
  assert.equal(stopped, false);
  probe.release();
  await stopping;
  assert.equal(probe.finished, 1);
  await sleep(30);
  assert.equal(probe.starts, 1);
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

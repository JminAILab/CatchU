// api가 큐에 쓰는 Node BullMQ·ioredis 판본이 큐 검증 키트(docs/queue-verification)에서 검증한 판본과 같은지 본다.
// worker는 자기 쪽 판본(Python bullmq·redis)을 키트와 대조한다(worker/docs/queue-consumer.md 「큐 규격」).
// 한쪽만 올리면 이 시험이 실패한다. 올릴 때는 키트를 세 엔진으로 다시 돌린 결과를 PR에 붙인다.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { dirname, join, resolve } = require('node:path');
const { test } = require('node:test');

const apiDir = resolve(__dirname, '../..');
const kitDir = resolve(apiDir, '../docs/queue-verification');
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const PACKAGES = ['bullmq', 'ioredis'];

test('api package.json의 큐 의존성은 키트와 같은 정확한 판본이다', () => {
  const api = read(join(apiDir, 'package.json'));
  const kit = read(join(kitDir, 'package.json'));
  for (const name of PACKAGES) {
    assert.match(api.dependencies[name], /^\d+\.\d+\.\d+$/, `${name}은 범위가 아닌 정확한 판본이어야 한다`);
    assert.equal(api.dependencies[name], kit.dependencies[name], name);
  }
  // typeorm 1.1.1이 선택 peer로 ioredis 5를 요구해 설치가 충돌하므로 같은 ioredis 하나를 쓰게 한다(api README 「초기화 기준과 도구」).
  // overrides의 다른 항목(고친 판본을 쓰게 한 multer 등)은 보지 않는다. 큐 의존성 판본이 달라지면 아래 잠금 파일·설치본 시험이 잡는다.
  assert.deepEqual(api.overrides.typeorm, { ioredis: '$ioredis' });
});

test('api·키트 잠금 파일과 설치본이 같은 판본이고 ioredis는 하나뿐이다', () => {
  const api = read(join(apiDir, 'package.json'));
  const apiLock = read(join(apiDir, 'package-lock.json'));
  const kitLock = read(join(kitDir, 'package-lock.json'));
  for (const name of PACKAGES) {
    const expected = api.dependencies[name];
    assert.equal(apiLock.packages[`node_modules/${name}`].version, expected, `api 잠금 파일 ${name}`);
    assert.equal(kitLock.packages[`node_modules/${name}`].version, expected, `키트 잠금 파일 ${name}`);
    assert.equal(read(require.resolve(`${name}/package.json`, { paths: [apiDir] })).version, expected, `api 설치본 ${name}`);
  }
  // 잠금 파일 안에 다른 판본의 ioredis 사본(중첩 설치)이 없다.
  const copies = Object.keys(apiLock.packages).filter(path => /(^|\/)node_modules\/ioredis$/.test(path));
  assert.deepEqual(copies, ['node_modules/ioredis']);
  // bullmq가 실제로 불러오는 ioredis도 같은 판본이다.
  const bullmqDir = dirname(require.resolve('bullmq/package.json', { paths: [apiDir] }));
  const resolved = require.resolve('ioredis/package.json', { paths: [bullmqDir] });
  assert.equal(read(resolved).version, api.dependencies.ioredis);
});

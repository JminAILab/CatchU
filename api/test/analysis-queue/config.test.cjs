// 큐 연결 설정(CATCHU_QUEUE_REDIS_URL·CATCHU_QUEUE_PREFIX) 검사. 큐 서버에 붙지 않는다.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const IORedis = require('ioredis');
const { readAnalysisQueueConfig } = require('../../dist/analysis-queue/analysis-queue.config');

const SECRET = 'synthetic-queue-secret-7f3a';
const dev = (url, extra = {}) => readAnalysisQueueConfig({ NODE_ENV: 'development', CATCHU_QUEUE_REDIS_URL: url, ...extra });
const prod = (url, extra = {}) => readAnalysisQueueConfig({ NODE_ENV: 'production', CATCHU_QUEUE_REDIS_URL: url, ...extra });

function rejects(read, name) {
  assert.throws(read, error => {
    assert.match(error.message, new RegExp(name));
    // 오류 문구에 주소·비밀번호 같은 입력 값을 싣지 않는다.
    assert.equal(error.message.includes(SECRET), false);
    assert.equal(error.message.includes('example.internal'), false);
    return true;
  });
}

test('큐 주소가 없거나 비어 있으면 어느 환경에서나 null(큐 모듈을 조립하지 않음)', () => {
  for (const NODE_ENV of ['development', 'test', 'production', undefined, 'staging']) {
    assert.equal(readAnalysisQueueConfig({ NODE_ENV }), null);
    assert.equal(readAnalysisQueueConfig({ NODE_ENV, CATCHU_QUEUE_REDIS_URL: '' }), null);
    // 주소가 없으면 접두사를 읽지 않는다(조립하지 않는 설정으로 기동을 막지 않는다).
    assert.equal(readAnalysisQueueConfig({ NODE_ENV, CATCHU_QUEUE_PREFIX: 'bad:prefix' }), null);
  }
});

test('개발·시험은 redis://·rediss://를 받고 접두사 기본값은 catchu', () => {
  for (const NODE_ENV of ['development', 'test']) {
    const config = readAnalysisQueueConfig({ NODE_ENV, CATCHU_QUEUE_REDIS_URL: 'redis://127.0.0.1:6379' });
    assert.deepEqual(config, { redisUrl: 'redis://127.0.0.1:6379', prefix: 'catchu' });
    assert.ok(Object.isFrozen(config));
  }
  assert.equal(dev('rediss://queue.example.internal:6380').redisUrl, 'rediss://queue.example.internal:6380');
  assert.equal(dev('redis://localhost').prefix, 'catchu');
  for (const path of ['', '/0', '/15', '/99']) assert.ok(dev(`redis://127.0.0.1:6379${path}`), path);
  assert.equal(dev('redis://127.0.0.1:6379', { CATCHU_QUEUE_PREFIX: 'catchu-test_1' }).prefix, 'catchu-test_1');
});

test('운영 판정(production·미지정·그 밖의 값)은 비밀번호가 든 rediss://만 받는다', () => {
  for (const NODE_ENV of ['production', undefined, 'staging', 'Development']) {
    const read = url => readAnalysisQueueConfig({ NODE_ENV, CATCHU_QUEUE_REDIS_URL: url });
    assert.equal(read(`rediss://:${SECRET}@queue.example.internal:6379`).redisUrl, `rediss://:${SECRET}@queue.example.internal:6379`);
    assert.ok(read(`rediss://default:${SECRET}@queue.example.internal:6379/0`));
    rejects(() => read(`redis://:${SECRET}@queue.example.internal:6379`), 'CATCHU_QUEUE_REDIS_URL');
    rejects(() => read('rediss://queue.example.internal:6379'), 'CATCHU_QUEUE_REDIS_URL');
    rejects(() => read('rediss://default@queue.example.internal:6379'), 'CATCHU_QUEUE_REDIS_URL');
  }
});

test('대문자 접두사·질의 문자열·#·깨진 퍼센트 인코딩·DB 번호 밖 경로·이상한 호스트는 어느 환경에서나 거부', () => {
  const bad = [
    `REDISS://:${SECRET}@queue.example.internal:6379`, `Rediss://:${SECRET}@queue.example.internal`,
    `REDIS://127.0.0.1:6379`, 'http://127.0.0.1:6379', '127.0.0.1:6379', '//127.0.0.1:6379', '/tmp/redis.sock',
    `rediss://:${SECRET}@queue.example.internal:6379?tls=false`, `rediss://:${SECRET}@queue.example.internal:6379/?rejectUnauthorized=false`,
    `rediss://:${SECRET}@queue.example.internal:6379#${SECRET}`, `rediss://:${SECRET}%zz@queue.example.internal:6379`,
    `rediss://:${SECRET}%E0%A4%A@queue.example.internal:6379`, `rediss://%zz:${SECRET}@queue.example.internal:6379`,
    `rediss://:${SECRET}@queue.example.internal:6379/100`, `rediss://:${SECRET}@queue.example.internal:6379/a`,
    // worker는 끝 슬래시만 있는 경로를 거부한다. 한쪽만 기동하지 않게 api도 거부한다.
    `rediss://:${SECRET}@queue.example.internal:6379/`, 'redis://127.0.0.1:6379/',
    `rediss://:${SECRET}@queue.example.internal:6379/0/x`, `rediss://:${SECRET}@:6379`, `rediss://:${SECRET}@queue.example.internal:0`,
    `rediss://:${SECRET}@queue.example.internal:65536`, `rediss://:${SECRET}@-queue.example.internal`, `rediss://:${SECRET}@[::1]:6379`,
    `rediss://:${SECRET}@queue.example.internal:6379 `, `rediss://:${SECRET}@queue.example.internal\n`, `rediss://:${SECRET}@큐.example.internal`,
  ];
  for (const url of bad) {
    rejects(() => dev(url), 'CATCHU_QUEUE_REDIS_URL');
    rejects(() => prod(url), 'CATCHU_QUEUE_REDIS_URL');
  }
});

test('접두사는 영문·숫자·_·- 64자 이하(첫 글자 영문·숫자)만 받고 오류에 값을 싣지 않는다', () => {
  assert.equal(dev('redis://127.0.0.1', { CATCHU_QUEUE_PREFIX: 'a'.repeat(64) }).prefix, 'a'.repeat(64));
  for (const prefix of ['a'.repeat(65), `-${SECRET}`, `_${SECRET}`, `${SECRET}:x`, `${SECRET} x`, `${SECRET}{x}`, '큐']) {
    rejects(() => dev('redis://127.0.0.1', { CATCHU_QUEUE_PREFIX: prefix }), 'CATCHU_QUEUE_PREFIX');
  }
});

test('받은 주소를 ioredis가 같은 뜻으로 읽는다: rediss://만 TLS, DB 번호·비밀번호', async () => {
  const cases = [
    [prod(`rediss://:${SECRET}@queue.example.internal:6380/3`), { tls: true, db: 3, port: 6380, password: SECRET }],
    [dev('redis://127.0.0.1:6379/0'), { tls: undefined, db: 0, port: 6379, password: null }],
    [dev('redis://127.0.0.1'), { tls: undefined, db: 0, port: 6379, password: null }],
  ];
  for (const [config, expected] of cases) {
    const client = new IORedis(config.redisUrl, { lazyConnect: true });
    try {
      assert.equal(client.options.tls, expected.tls, config.redisUrl);
      assert.equal(client.options.db, expected.db);
      assert.equal(client.options.port, expected.port);
      assert.equal(client.options.password ?? null, expected.password);
    } finally { client.disconnect(); }
  }
});

test('큐 모듈은 큐 설정·보호 관측 공급자·계약 경로가 모두 있을 때만 조립하고 수신·등록 조립은 한 번만 불러온다', () => {
  require('reflect-metadata');
  const { AnalysisQueueModule } = require('../../dist/analysis-queue/analysis-queue.module');
  const { AnalysisReceiverModule } = require('../../dist/analysis-receiver/analysis-receiver.module');
  const { CONTRACT_DIR } = require('../helpers/receiver-harness.cjs');
  const full = { queue: dev('redis://127.0.0.1:6379'), observations: { observe: async () => null }, contractDirectory: CONTRACT_DIR };
  // 가짜 공급자를 기본으로 채우지 않는다.
  for (const missing of ['queue', 'observations', 'contractDirectory']) {
    assert.throws(() => AnalysisQueueModule.register({ ...full, [missing]: undefined }), /큐 설정·보호 관측 공급자·계약 경로/);
  }
  assert.throws(() => AnalysisQueueModule.register(undefined), /큐 설정·보호 관측 공급자·계약 경로/);
  const assembled = AnalysisQueueModule.register(full);
  assert.equal(assembled.imports.filter(entry => entry.module === AnalysisReceiverModule).length, 1);
});

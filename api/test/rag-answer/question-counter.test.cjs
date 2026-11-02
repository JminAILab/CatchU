// U5 링크당 하루 질문 횟수(기능 설계 BR3.1~BR3.3, performance-design NFR4.4, scalability-design NFR4.7, observability NFR6.4).
// 메모리 계수기와 INCR·EXPIREAT·MULTI만 흉내 내는 가짜 Redis를 쓴다. 실제 Redis는 live-question-counter.test.cjs에서만.
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { test } = require('node:test');
const {
  InMemoryQuestionCounter, NoRedisQuestionCounter, RedisQuestionCounter, createQuestionCounter,
} = require('../../dist/rag-answer/question-counter');
const { QUESTION_DAILY_LIMIT } = require('../../dist/rag-answer/rag-answer-config');
const { recordingLogger } = require('../published-index/support.cjs');

const PUBLICATION = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-11-02T03:00:00.000Z'); // 2026-11-02 12:00 KST
const NEXT_MIDNIGHT = Date.parse('2026-11-02T15:00:00.000Z') / 1000;

/** 가짜 Redis: 명령을 기록하고, failOn(번호)에서 exec가 실패하거나 delayMs만큼 늦는다. */
function fakeRedis({ failOn = null, delayMs = 0, execResult = null, quitFails = false } = {}) {
  const emitter = new EventEmitter();
  const store = new Map();
  const state = { commands: [], execs: 0, quit: 0, disconnected: 0, expireAt: new Map() };
  const redis = {
    on: (event, listener) => { emitter.on(event, listener); return redis; },
    emit: (event, value) => emitter.emit(event, value),
    multi() {
      const queued = [];
      const pipeline = {
        incr(key) { queued.push(['incr', key]); return pipeline; },
        expireat(key, seconds) { queued.push(['expireat', key, seconds]); return pipeline; },
        async exec() {
          state.execs += 1;
          state.commands.push(...queued);
          if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
          if (failOn === state.execs) throw Object.assign(new Error("Stream isn't writeable"), { name: 'Error' });
          if (execResult) return execResult;
          return queued.map(([name, key, seconds]) => {
            if (name === 'incr') { store.set(key, (store.get(key) ?? 0) + 1); return [null, store.get(key)]; }
            state.expireAt.set(key, seconds);
            return [null, 1];
          });
        },
      };
      return pipeline;
    },
    async quit() { state.quit += 1; if (quitFails) throw new Error('Connection is closed.'); return 'OK'; },
    disconnect() { state.disconnected += 1; },
  };
  return { redis, state, store };
}

test('100번째 질문까지 허용, 101번째부터 LIMIT_REACHED이고 거부도 횟수를 되돌리지 않는다(BR3.1)', async () => {
  const { redis, state, store } = fakeRedis();
  const counter = new RedisQuestionCounter({ redis, prefix: 'u5test', logger: recordingLogger() });
  for (let i = 1; i <= QUESTION_DAILY_LIMIT; i += 1) assert.deepEqual(await counter.count(PUBLICATION, NOW), { decision: 'ALLOWED' });
  assert.deepEqual(await counter.count(PUBLICATION, NOW), { decision: 'LIMIT_REACHED' });
  assert.deepEqual(await counter.count(PUBLICATION, NOW), { decision: 'LIMIT_REACHED' });
  const key = `u5test:qna-question-count:${PUBLICATION}:2026-11-02`;
  assert.equal(store.get(key), 102);
  assert.deepEqual(state.commands.slice(0, 2), [['incr', key], ['expireat', key, NEXT_MIDNIGHT]], 'MULTI 안에서 INCR 뒤 EXPIREAT 다음 한국 자정');
  assert.equal(state.expireAt.get(key), NEXT_MIDNIGHT);
  // 다른 발행본·다음 날은 따로 센다(키 하나, BR3.3).
  assert.deepEqual(await counter.count('33333333-3333-4333-8333-333333333333', NOW), { decision: 'ALLOWED' });
  assert.deepEqual(await counter.count(PUBLICATION, new Date('2026-11-02T15:00:00.000Z')), { decision: 'ALLOWED' });
});

test('명령 실패면 세지 않고 BYPASSED(REDIS_ERROR)와 경고 한 줄을 남긴다(BR3.2, NFR6.4)', async () => {
  const logger = recordingLogger();
  const { redis } = fakeRedis({ failOn: 1 });
  const counter = new RedisQuestionCounter({ redis, prefix: 'u5test', logger });
  assert.deepEqual(await counter.count(PUBLICATION, NOW), { decision: 'BYPASSED', reason: 'REDIS_ERROR' });
  assert.deepEqual(logger.entries, [{ level: 'warn', entry: { event: 'qna.count-bypassed', publicationId: PUBLICATION, reason: 'REDIS_ERROR' } }]);
  // 결과 모양이 틀린 응답(EXEC 중단 null, 명령 오류)도 통과로 본다.
  for (const execResult of [[[new Error('WRONGTYPE'), null], [null, 1]], [[null, 'x'], [null, 1]]]) {
    const other = new RedisQuestionCounter({ redis: fakeRedis({ execResult }).redis, prefix: 'u5test', logger });
    assert.deepEqual(await other.count(PUBLICATION, NOW), { decision: 'BYPASSED', reason: 'REDIS_ERROR' });
  }
});

test('1초 상한을 넘으면 BYPASSED(REDIS_TIMEOUT)이고 늦게 끝난 명령은 무시한다(NFR4.4)', async () => {
  const logger = recordingLogger();
  const { redis } = fakeRedis({ delayMs: 80 });
  const counter = new RedisQuestionCounter({ redis, prefix: 'u5test', logger, timeoutMs: 20 });
  assert.deepEqual(await counter.count(PUBLICATION, NOW), { decision: 'BYPASSED', reason: 'REDIS_TIMEOUT' });
  assert.equal(logger.entries[0].entry.reason, 'REDIS_TIMEOUT');
  await new Promise((resolve) => setTimeout(resolve, 100));
});

test('연결 error 사건은 오류 이름만 한 번 남기고, ready 뒤 다시 남긴다. close는 quit 뒤 disconnect이고 한 번만 닫는다', async () => {
  const logger = recordingLogger();
  const { redis, state } = fakeRedis({ quitFails: true });
  const counter = new RedisQuestionCounter({ redis, prefix: 'u5test', logger });
  const secretUrl = 'redis://:SYNTHETIC-PASSWORD@cache.internal:6379';
  redis.emit('error', Object.assign(new Error(`connect ECONNREFUSED ${secretUrl}`), { name: 'Error' }));
  redis.emit('error', new Error('again'));
  redis.emit('ready');
  redis.emit('error', new Error('after ready'));
  assert.deepEqual(logger.entries.map((e) => e.entry), [
    { event: 'qna.count-connection-error', error: 'Error' }, { event: 'qna.count-connection-error', error: 'Error' }]);
  assert.ok(!logger.text().includes('SYNTHETIC-PASSWORD'));
  await Promise.all([counter.close(), counter.close()]);
  assert.equal(state.quit, 1);
  assert.equal(state.disconnected, 1, 'quit이 실패해도 연결을 끊는다');
});

test('큐 주소가 없으면 늘 BYPASSED(NO_REDIS)와 경고를 남기고, 주소가 있으면 Redis 계수기를 만든다', async (t) => {
  const logger = recordingLogger();
  const counter = createQuestionCounter(null, logger);
  assert.ok(counter instanceof NoRedisQuestionCounter);
  assert.deepEqual(await counter.count(PUBLICATION, NOW), { decision: 'BYPASSED', reason: 'NO_REDIS' });
  assert.deepEqual(logger.entries[0], { level: 'warn', entry: { event: 'qna.count-bypassed', publicationId: PUBLICATION, reason: 'NO_REDIS' } });
  await counter.close();
  // 닫힌 포트로 만든다. 기동을 막지 않고, 연결 전 명령은 바로 통과로 바뀐다(enableOfflineQueue: false).
  const real = createQuestionCounter({ redisUrl: 'redis://127.0.0.1:1', prefix: 'u5test' }, logger);
  t.after(() => real.close());
  assert.ok(real instanceof RedisQuestionCounter);
  assert.equal((await real.count(PUBLICATION, NOW)).decision, 'BYPASSED');
});

test('메모리 계수기는 같은 키 규칙·한도로 센다(시험 전용)', async () => {
  const counter = new InMemoryQuestionCounter('u5test');
  for (let i = 0; i < QUESTION_DAILY_LIMIT; i += 1) await counter.count(PUBLICATION, NOW);
  assert.deepEqual(await counter.count(PUBLICATION, NOW), { decision: 'LIMIT_REACHED' });
  assert.equal(counter.expiries.get(`u5test:qna-question-count:${PUBLICATION}:2026-11-02`), NEXT_MIDNIGHT);
  await counter.close();
});

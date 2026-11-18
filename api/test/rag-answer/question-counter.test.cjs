// U5 링크당 하루 질문 횟수(기능 설계 BR3.1~BR3.3, performance-design NFR4.4, scalability-design NFR4.7, observability NFR6.4)와
// 작성자 하루 합계(#585). 기대 결과는 #585 완료 기준이다.
// 메모리 계수기와 INCR·EXPIREAT·MULTI만 흉내 내는 가짜 Redis를 쓴다. 실제 Redis는 live-question-counter.test.cjs에서만.
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { test } = require('node:test');
const {
  InMemoryQuestionCounter, NoRedisQuestionCounter, RedisQuestionCounter, createQuestionCounter,
} = require('../../dist/rag-answer/question-counter');
const { OWNER_QUESTION_DAILY_LIMIT, QUESTION_DAILY_LIMIT } = require('../../dist/rag-answer/rag-answer-config');
const { recordingLogger } = require('../published-index/support.cjs');

const PUBLICATION = '22222222-2222-4222-8222-222222222222';
const OWNER = '44444444-4444-4444-8444-444444444444';
const OTHER_OWNER = '55555555-5555-4555-8555-555555555555';
const LINK_LIMIT_REACHED = { decision: 'LIMIT_REACHED', limit: 'LINK' };
const OWNER_LIMIT_REACHED = { decision: 'LIMIT_REACHED', limit: 'OWNER' };
const linkKey = (publicationId, date = '2026-11-02') => `u5test:qna-question-count:${publicationId}:${date}`;
const ownerKey = (ownerMemberId, date = '2026-11-02') => `u5test:qna-owner-question-count:${ownerMemberId}:${date}`;
/** 작성자 한 명의 링크 n개. */
const links = (n) => Array.from({ length: n }, (_, i) => `6666666${i}-6666-4666-8666-666666666666`);
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
  for (let i = 1; i <= QUESTION_DAILY_LIMIT; i += 1) assert.deepEqual(await counter.count(PUBLICATION, OWNER, NOW), { decision: 'ALLOWED' });
  assert.deepEqual(await counter.count(PUBLICATION, OWNER, NOW), LINK_LIMIT_REACHED);
  assert.deepEqual(await counter.count(PUBLICATION, OWNER, NOW), LINK_LIMIT_REACHED);
  const key = linkKey(PUBLICATION);
  assert.equal(store.get(key), 102);
  assert.deepEqual(state.commands.slice(0, 4), [['incr', key], ['expireat', key, NEXT_MIDNIGHT],
    ['incr', ownerKey(OWNER)], ['expireat', ownerKey(OWNER), NEXT_MIDNIGHT]], '키마다 MULTI 안에서 INCR 뒤 EXPIREAT 다음 한국 자정, 링크 다음 작성자');
  assert.equal(state.expireAt.get(key), NEXT_MIDNIGHT);
  assert.equal(state.expireAt.get(ownerKey(OWNER)), NEXT_MIDNIGHT);
  assert.equal(store.get(ownerKey(OWNER)), 100, '링크 한도에 걸린 질문은 작성자 합계를 늘리지 않는다(#585)');
  // 다른 발행본·다음 날은 따로 센다(BR3.3).
  assert.deepEqual(await counter.count('33333333-3333-4333-8333-333333333333', OWNER, NOW), { decision: 'ALLOWED' });
  assert.deepEqual(await counter.count(PUBLICATION, OWNER, new Date('2026-11-02T15:00:00.000Z')), { decision: 'ALLOWED' });
});

test('작성자 합계: 여러 링크를 합쳐 300번째까지 허용, 301번째부터 그 작성자의 모든 링크가 LIMIT_REACHED이고 자정 뒤 다시 받는다(#585)', async () => {
  const { redis, store } = fakeRedis();
  const counter = new RedisQuestionCounter({ redis, prefix: 'u5test', logger: recordingLogger() });
  const [a, b, c, d] = links(4);
  // 링크 넷에 75번씩: 어느 링크도 링크 한도(100)에 닿지 않고 합계만 300이 된다.
  for (const publicationId of [a, b, c, d]) {
    for (let i = 0; i < OWNER_QUESTION_DAILY_LIMIT / 4; i += 1) {
      assert.deepEqual(await counter.count(publicationId, OWNER, NOW), { decision: 'ALLOWED' });
    }
  }
  assert.equal(store.get(ownerKey(OWNER)), 300);
  assert.deepEqual(await counter.count(a, OWNER, NOW), OWNER_LIMIT_REACHED);
  assert.deepEqual(await counter.count(d, OWNER, NOW), OWNER_LIMIT_REACHED);
  assert.deepEqual(await counter.count('33333333-3333-4333-8333-333333333333', OWNER, NOW), OWNER_LIMIT_REACHED, '처음 쓰는 링크도 막힌다');
  assert.equal(store.get(ownerKey(OWNER)), 303, '거부된 질문도 늘린 값을 되돌리지 않는다');
  assert.equal(store.get(linkKey(a)), 76, '작성자 합계로 거부된 질문의 링크 횟수도 되돌리지 않는다');
  // 다른 작성자의 링크는 그대로 받는다.
  assert.deepEqual(await counter.count(PUBLICATION, OTHER_OWNER, NOW), { decision: 'ALLOWED' });
  assert.equal(store.get(ownerKey(OTHER_OWNER)), 1);
  // 한국 시간 자정이 지나면 날짜가 바뀐 새 키로 센다.
  const nextDay = new Date('2026-11-02T15:00:00.000Z');
  assert.deepEqual(await counter.count(a, OWNER, nextDay), { decision: 'ALLOWED' });
  assert.equal(store.get(ownerKey(OWNER, '2026-11-03')), 1);
});

test('링크 횟수는 셌는데 작성자 합계를 세지 못하면 그 질문은 BYPASSED다(BR3.2, #585)', async () => {
  const logger = recordingLogger();
  const { redis, store } = fakeRedis({ failOn: 2 });
  const counter = new RedisQuestionCounter({ redis, prefix: 'u5test', logger });
  assert.deepEqual(await counter.count(PUBLICATION, OWNER, NOW), { decision: 'BYPASSED', reason: 'REDIS_ERROR' });
  assert.equal(store.get(linkKey(PUBLICATION)), 1);
  assert.equal(store.get(ownerKey(OWNER)), undefined);
  assert.deepEqual(logger.entries.map((e) => e.entry), [{ event: 'qna.count-bypassed', publicationId: PUBLICATION, reason: 'REDIS_ERROR' }]);
});

test('명령 실패면 세지 않고 BYPASSED(REDIS_ERROR)와 경고 한 줄을 남긴다(BR3.2, NFR6.4)', async () => {
  const logger = recordingLogger();
  const { redis } = fakeRedis({ failOn: 1 });
  const counter = new RedisQuestionCounter({ redis, prefix: 'u5test', logger });
  assert.deepEqual(await counter.count(PUBLICATION, OWNER, NOW), { decision: 'BYPASSED', reason: 'REDIS_ERROR' });
  assert.deepEqual(logger.entries, [{ level: 'warn', entry: { event: 'qna.count-bypassed', publicationId: PUBLICATION, reason: 'REDIS_ERROR' } }]);
  // 결과 모양이 틀린 응답(EXEC 중단 null, 명령 오류)도 통과로 본다.
  for (const execResult of [[[new Error('WRONGTYPE'), null], [null, 1]], [[null, 'x'], [null, 1]]]) {
    const other = new RedisQuestionCounter({ redis: fakeRedis({ execResult }).redis, prefix: 'u5test', logger });
    assert.deepEqual(await other.count(PUBLICATION, OWNER, NOW), { decision: 'BYPASSED', reason: 'REDIS_ERROR' });
  }
});

test('1초 상한을 넘으면 BYPASSED(REDIS_TIMEOUT)이고 늦게 끝난 명령은 무시한다(NFR4.4)', async () => {
  const logger = recordingLogger();
  const { redis } = fakeRedis({ delayMs: 80 });
  const counter = new RedisQuestionCounter({ redis, prefix: 'u5test', logger, timeoutMs: 20 });
  assert.deepEqual(await counter.count(PUBLICATION, OWNER, NOW), { decision: 'BYPASSED', reason: 'REDIS_TIMEOUT' });
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
  assert.deepEqual(await counter.count(PUBLICATION, OWNER, NOW), { decision: 'BYPASSED', reason: 'NO_REDIS' });
  assert.deepEqual(logger.entries[0], { level: 'warn', entry: { event: 'qna.count-bypassed', publicationId: PUBLICATION, reason: 'NO_REDIS' } });
  await counter.close();
  // 닫힌 포트로 만든다. 기동을 막지 않고, 연결 전 명령은 바로 통과로 바뀐다(enableOfflineQueue: false).
  const real = createQuestionCounter({ redisUrl: 'redis://127.0.0.1:1', prefix: 'u5test' }, logger);
  t.after(() => real.close());
  assert.ok(real instanceof RedisQuestionCounter);
  assert.equal((await real.count(PUBLICATION, OWNER, NOW)).decision, 'BYPASSED');
});

test('메모리 계수기는 같은 키 규칙·순서·한도로 센다(시험 전용)', async () => {
  const counter = new InMemoryQuestionCounter('u5test');
  for (let i = 0; i < QUESTION_DAILY_LIMIT; i += 1) await counter.count(PUBLICATION, OWNER, NOW);
  assert.deepEqual(await counter.count(PUBLICATION, OWNER, NOW), LINK_LIMIT_REACHED);
  assert.equal(counter.counts.get(ownerKey(OWNER)), 100, '링크 한도에 걸린 질문은 작성자 합계를 늘리지 않는다');
  assert.equal(counter.expiries.get(linkKey(PUBLICATION)), NEXT_MIDNIGHT);
  assert.equal(counter.expiries.get(ownerKey(OWNER)), NEXT_MIDNIGHT);
  // 같은 작성자의 다른 링크 둘에 100번씩 더하면 합계 300이고, 그다음 링크의 첫 질문부터 작성자 합계로 막힌다.
  const [b, c, d] = links(3);
  for (const publicationId of [b, c]) for (let i = 0; i < QUESTION_DAILY_LIMIT; i += 1) await counter.count(publicationId, OWNER, NOW);
  assert.deepEqual(await counter.count(d, OWNER, NOW), OWNER_LIMIT_REACHED);
  await counter.close();
});

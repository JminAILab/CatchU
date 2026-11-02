// U5 질문 횟수 실제 Redis 시험(performance-design NFR4.4, 비기능 설계 수정 요청 R-02). CATCHU_TEST_REDIS_URL이 있을 때만 돈다.
// 연결 직후 첫 질문이 세어지는지, EXPIREAT이 다음 한국 자정인지, close() 뒤 연결이 끝나는지 본다. 키 접두사는 시험마다 새로 만든다.
// 실행: 저장소 맨 위에서 `CATCHU_TEST_REDIS_URL=redis://127.0.0.1:6379/15 npm --prefix api test -- test/rag-answer/live-question-counter.test.cjs`.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const IORedis = require('ioredis').default;
const { createQuestionCounter } = require('../../dist/rag-answer/question-counter');
const { nextKoreanMidnightSeconds, questionCountKey } = require('../../dist/rag-answer/korean-date');
const { recordingLogger } = require('../published-index/support.cjs');

const REDIS_URL = process.env.CATCHU_TEST_REDIS_URL;
const skip = REDIS_URL ? false : 'CATCHU_TEST_REDIS_URL이 없어 실제 Redis 시험을 건너뜀';

async function waitFor(check, timeoutMs) {
  const started = Date.now();
  for (;;) {
    const value = await check();
    if (value || Date.now() - started > timeoutMs) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

test('실제 Redis: 만든 직후 연결을 시작해 첫 질문을 세고, 만료는 다음 한국 자정이며 close 뒤 연결이 끝난다', { skip, timeout: 30000 }, async (t) => {
  const prefix = `u5-live-${randomUUID()}`;
  const publicationId = randomUUID();
  const inspect = new IORedis(REDIS_URL, { maxRetriesPerRequest: 1 });
  const logger = recordingLogger();
  const counter = createQuestionCounter({ redisUrl: REDIS_URL, prefix }, logger);
  t.after(async () => {
    await inspect.del(questionCountKey(prefix, publicationId, new Date()));
    await inspect.quit();
  });
  // lazyConnect 없이 만들었으므로 곧 ready가 된다. 연결된 뒤의 첫 질문은 센다(통과가 아니다).
  const now = new Date();
  const first = await waitFor(async () => {
    const decision = await counter.count(publicationId, now);
    return decision.decision === 'ALLOWED' ? decision : null;
  }, 5000);
  assert.deepEqual(first, { decision: 'ALLOWED' });
  const key = questionCountKey(prefix, publicationId, now);
  assert.ok(Number(await inspect.get(key)) >= 1);
  // EXPIRETIME은 Redis 7 이상이라 TTL로 본다(2초 여유).
  const ttl = await inspect.ttl(key);
  assert.ok(Math.abs(Math.floor(Date.now() / 1000) + ttl - nextKoreanMidnightSeconds(now)) <= 2, `ttl ${ttl}`);
  await counter.close();
  assert.deepEqual(await counter.count(publicationId, now), { decision: 'BYPASSED', reason: 'REDIS_ERROR' }, '닫은 뒤에는 세지 않고 통과');
  assert.ok(!logger.text().includes(REDIS_URL), '주소를 로그에 남기지 않는다');
});

// U3 앱 등록(#431) 실제 큐 시험: 기본 앱(AppModule)을 실제 Valkey 큐에 붙여 띄우고, 발행본 하나를 나눈 뒤 EMBED_PUBLICATION을
// 등록하면 앱이 등록한 처리기가 큐에서 받아 색인 상태가 DONE이 되는지 본다. CATCHU_TEST_REDIS_URL이 있을 때만 돈다.
// 제공자는 판정표대로다: 셸에 CATCHU_EMBEDDING_API_KEY가 있으면 실제 Voyage, 없으면 합성 제공자(NODE_ENV=test).
// 합성 제공자 결과는 큐·처리기 연결 확인일 뿐 실제 임베딩 성공이 아니다. 결과 기록에는 제공자·상태·개수만 남기고 글·키는 남기지 않는다.
// 실행: 저장소 맨 위에서 `CATCHU_TEST_REDIS_URL=redis://127.0.0.1:6380 npm --prefix api test -- test/published-index/queue-embedding.test.cjs`.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { after, before, test } = require('node:test');
const { Logger } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { Queue } = require('bullmq');
const IORedis = require('ioredis').default;
const { DataSource } = require('typeorm');
const { openTestDataSource } = require('../support/test-database.cjs');
const { AppModule } = require('../../dist/app.module');
const { AiRun } = require('../../dist/ai-run/ai-run');
const { AI_RUN_QUEUE } = require('../../dist/ai-run/ai-run-spec');
const { PUBLISHED_INDEX_WRITER, PUBLISHED_SEARCH } = require('../../dist/published-index/published-index.module');
const { chunkPublication, embeddedCount, insertMember, publicationA } = require('./support.cjs');

const REDIS_URL = process.env.CATCHU_TEST_REDIS_URL;
const skip = REDIS_URL ? false : 'CATCHU_TEST_REDIS_URL이 없어 실제 큐 시험을 건너뜀';
const LIVE = Boolean(process.env.CATCHU_EMBEDDING_API_KEY?.trim());

let db;
before(async () => { if (REDIS_URL) db = await openTestDataSource(); });
after(async () => { await db?.destroy(); });

async function waitFor(check, timeoutMs) {
  const started = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - started > timeoutMs) return value;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

test('기본 앱이 실제 큐에서 EMBED_PUBLICATION을 받아 처리하면 발행본 색인이 DONE이 된다', { skip, timeout: 120000 }, async (t) => {
  const prefix = `u3-app-${randomUUID()}`;
  const values = {
    NODE_ENV: 'test', AUTH_JWT_SECRET: randomBytes(32).toString('hex'), AUTH_ACCESS_TOKEN_TTL_SECONDS: '900',
    AUTH_WEB_ORIGIN: 'http://localhost:3000', DEV_LOGIN_ENABLED: undefined,
    CATCHU_QUEUE_REDIS_URL: REDIS_URL, CATCHU_QUEUE_PREFIX: prefix,
  };
  const saved = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  const assign = (entries) => {
    for (const [key, value] of Object.entries(entries)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  assign(values);
  const logs = [];
  const logger = Object.fromEntries(['log', 'error', 'warn', 'debug', 'verbose', 'fatal']
    .map((level) => [level, (...args) => logs.push({ level, entry: args[0] })]));
  const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
  const inspect = new Queue(AI_RUN_QUEUE, { connection, prefix });
  let app;
  t.after(async () => {
    try {
      await app?.close();
    } finally {
      Logger.overrideLogger(false);
      await inspect.obliterate({ force: true }).catch(() => undefined);
      await inspect.close();
      connection.disconnect();
      assign(saved);
    }
  });
  app = await NestFactory.create(AppModule, { logger, abortOnError: false });
  await app.init(); // 처리기 등록(모듈 초기화) 뒤 AiRun이 소비를 시작한다

  const { publicationId } = await publicationA(db, await insertMember(db));
  const appDb = app.get(DataSource);
  await chunkPublication(appDb, app.get(PUBLISHED_INDEX_WRITER), publicationId, new Date());
  const chunkCount = (await db.query('SELECT count(*)::int AS n FROM published_chunk WHERE publication_id = $1', [publicationId]))[0].n;
  const runKey = `EMBED_PUBLICATION-${publicationId}`;
  assert.equal(await app.get(AiRun).enqueueAfterCommit('EMBED_PUBLICATION', runKey, { publicationId }), 'ENQUEUED');

  const search = app.get(PUBLISHED_SEARCH);
  const status = await waitFor(async () => {
    const state = await search.getIndexState(publicationId, new Date());
    return state === 'PENDING' ? null : state;
  }, LIVE ? 90000 : 20000) ?? 'PENDING';
  const jobState = await (await inspect.getJob(runKey))?.getState();
  const completed = logs.filter((log) => log.entry?.event === 'EMBED_PUBLICATION_COMPLETED').map((log) => log.entry);
  const failed = logs.filter((log) => log.entry?.event === 'EMBED_PUBLICATION_FAILED').map((log) => log.entry);
  console.log(JSON.stringify({ test: 'U3 실제 큐', provider: LIVE ? 'VOYAGE' : 'SYNTHETIC', status, jobState, chunkCount,
    embedded: await embeddedCount(db, publicationId), totalTokens: completed[0]?.totalTokens ?? null,
    failure: failed[0]?.failure ?? null, httpStatus: failed[0]?.httpStatus ?? null }));

  assert.equal(status, 'DONE');
  assert.equal(jobState, 'completed');
  assert.ok(chunkCount > 0);
  assert.equal(await embeddedCount(db, publicationId), chunkCount);
  assert.equal(completed.length, 1);
  assert.equal(completed[0].chunkCount, chunkCount);
  if (LIVE) assert.ok(completed[0].totalTokens > 0, '실제 Voyage가 토큰 수를 돌려준다');
  else assert.equal(completed[0].totalTokens, 0, '합성 제공자는 토큰 수가 0이다');
});

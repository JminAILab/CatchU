// U3 앱 등록(#431): 기본 앱(AppModule) 기동 때 U3 모듈이 로드되어 EMBED_PUBLICATION 처리기를 한 번 등록하고,
// 다른 Unit 모듈이 C-08·C-09를 주입받으며, 임베딩 제공자 판정표(BR6.1)가 기동 때 돈다.
// 큐 주소는 비워 실제 큐에 붙지 않는다(실제 큐 처리는 queue-embedding.test.cjs). Voyage는 부르지 않는다(가로챈 fetch).
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { Inject, Injectable, Module } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../../dist/app.module');
const { AiRun } = require('../../dist/ai-run/ai-run');
const { VOYAGE_EMBEDDINGS_URL } = require('../../dist/published-index/embedding-config');
const { syntheticEmbedding } = require('../../dist/published-index/synthetic-embedding-provider');
const {
  EMBEDDING_PROVIDER, PUBLISHED_INDEX_WRITER, PUBLISHED_SEARCH, PublishedIndexModule,
} = require('../../dist/published-index/published-index.module');

const KEY_ERROR = 'CATCHU_EMBEDDING_API_KEY가 비어 있어 임베딩 제공자를 만들 수 없습니다.';
/** AppModule이 요구하는 설정. 운영 모드에서도 다른 설정이 기동을 막지 않게 https 주소와 서명 키를 준다. */
const APP_SETTINGS = {
  AUTH_JWT_SECRET: randomBytes(32).toString('hex'),
  AUTH_ACCESS_TOKEN_TTL_SECONDS: '900',
  AUTH_WEB_ORIGIN: 'https://catchu.example',
  SHARE_LINK_WEB_BASE_URL: 'https://catchu.example',
  LINK_GRANT_SECRET: randomBytes(32).toString('hex'),
  DEV_LOGIN_ENABLED: undefined,
  CATCHU_QUEUE_REDIS_URL: undefined,
  CATCHU_QUEUE_PREFIX: undefined,
  CATCHU_EMBEDDING_API_KEY: undefined,
};

/** 다른 Unit 모듈 자리: U3 모듈을 imports에 넣고 C-08·C-09를 주입받는다. */
function consumerModule() {
  class Consumer {
    constructor(writer, search) { this.writer = writer; this.search = search; }
  }
  Inject(PUBLISHED_INDEX_WRITER)(Consumer, undefined, 0);
  Inject(PUBLISHED_SEARCH)(Consumer, undefined, 1);
  Injectable()(Consumer);
  class ConsumerModule {}
  Module({ imports: [PublishedIndexModule], providers: [Consumer], exports: [Consumer] })(ConsumerModule);
  return { Consumer, ConsumerModule };
}

/** 환경을 바꿔 AppModule(+ 소비 모듈 둘)을 init까지 띄운다. 기동이 실패하면 그 오류를 돌려준다. */
async function boot(t, env) {
  const values = { ...APP_SETTINGS, ...env };
  const saved = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  const restore = (entries) => {
    for (const [key, value] of Object.entries(entries)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  restore(values);
  const logs = [];
  const logger = Object.fromEntries(['log', 'error', 'warn', 'debug', 'verbose', 'fatal']
    .map((level) => [level, (...args) => logs.push({ level, args })]));
  const registered = [];
  const original = AiRun.prototype.registerHandler;
  AiRun.prototype.registerHandler = function record(kind, handler) {
    registered.push(kind);
    return original.call(this, kind, handler);
  };
  const a = consumerModule();
  const b = consumerModule();
  class RootModule {}
  Module({ imports: [AppModule, a.ConsumerModule, b.ConsumerModule] })(RootModule);
  let app;
  t.after(async () => {
    try { await app?.close(); } finally { restore(saved); }
  });
  try {
    app = await NestFactory.create(RootModule, { logger, abortOnError: false });
    await app.init();
    return { app, logs, registered, consumers: [app.get(a.Consumer), app.get(b.Consumer)], error: null };
  } catch (error) {
    return { app, logs, registered, consumers: [], error };
  } finally {
    AiRun.prototype.registerHandler = original;
  }
}

const events = (logs, name) => logs.filter((log) => log.args[0]?.event === name);

test('기본 앱 기동 때 U3 모듈이 로드되고 EMBED_PUBLICATION 처리기가 한 번 등록된다(소비 모듈 둘이 가져와도 한 번)', async (t) => {
  const { app, registered, error } = await boot(t, { NODE_ENV: 'test' });
  assert.equal(error, null);
  assert.deepEqual(registered, ['EMBED_PUBLICATION']);
  assert.deepEqual(app.get(AiRun).registeredKinds(), ['EMBED_PUBLICATION']);
});

test('다른 Unit 모듈이 C-08 PublishedIndexWriter·C-09 PublishedSearch를 같은 모양 그대로 주입받는다', async (t) => {
  const { consumers, error } = await boot(t, { NODE_ENV: 'test' });
  assert.equal(error, null);
  const [first, second] = consumers;
  assert.deepEqual(Object.keys(first.writer).sort(), ['chunkInTransaction', 'requestReindex']);
  assert.deepEqual(Object.keys(first.search).sort(), ['getIndexState', 'search']);
  assert.equal(second.writer, first.writer, '같은 기록기 하나를 함께 쓴다');
  assert.equal(second.search, first.search, '같은 검색 하나를 함께 쓴다');
  // 실제 DB에 이어져 있다: 색인 행이 없는 발행본은 FAILED(C-09).
  assert.equal(await first.search.getIndexState(randomUUID(), new Date()), 'FAILED');
  assert.equal(await first.writer.requestReindex(randomUUID(), new Date()), 'NOT_FAILED');
});

for (const NODE_ENV of ['test', 'production']) {
  test(`키가 있으면 Voyage 제공자로 뜬다(NODE_ENV=${NODE_ENV})`, async (t) => {
    const key = `synthetic-embedding-key-${randomUUID()}`;
    // 제공자는 만들 때의 전역 fetch를 붙잡는다. 기동하는 동안만 바꿔 실제 Voyage에 나가지 않게 한다.
    const requests = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      requests.push({ url: String(url), authorization: init.headers.Authorization, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ data: [{ index: 0, embedding: new Array(1024).fill(0.5) }], usage: { total_tokens: 3 } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    let booted;
    try {
      booted = await boot(t, { NODE_ENV, CATCHU_EMBEDDING_API_KEY: key });
    } finally {
      globalThis.fetch = realFetch;
    }
    const { app, logs, error } = booted;
    assert.equal(error, null);
    const result = await app.get(EMBEDDING_PROVIDER).embedQuery('합성 질문');
    assert.equal(result.totalTokens, 3);
    assert.deepEqual(requests.map(({ url, authorization, body }) => [url, authorization, body.model, body.input_type]),
      [[VOYAGE_EMBEDDINGS_URL, `Bearer ${key}`, 'voyage-4-lite', 'query']]);
    assert.equal(events(logs, 'EMBEDDING_PROVIDER_SYNTHETIC').length, 0);
    assert.equal(JSON.stringify(logs).includes(key), false, '키는 로그에 남기지 않는다');
  });
}

for (const NODE_ENV of ['development', 'test']) {
  test(`키가 없고 NODE_ENV=${NODE_ENV}이면 합성 제공자로 뜨고 경고 한 줄을 남긴다`, async (t) => {
    const { app, logs, error } = await boot(t, { NODE_ENV });
    assert.equal(error, null);
    const warnings = events(logs, 'EMBEDDING_PROVIDER_SYNTHETIC');
    assert.deepEqual(warnings.map((log) => [log.level, log.args[0]]), [['warn', { event: 'EMBEDDING_PROVIDER_SYNTHETIC' }]]);
    const result = await app.get(EMBEDDING_PROVIDER).embedQuery('합성 질문');
    assert.deepEqual(result, { vector: syntheticEmbedding('합성 질문'), totalTokens: 0 });
  });
}

for (const [label, env] of [
  ['production', { NODE_ENV: 'production' }],
  ['미지정', { NODE_ENV: undefined }],
  ['staging', { NODE_ENV: 'staging' }],
  ['production에 공백뿐인 키', { NODE_ENV: 'production', CATCHU_EMBEDDING_API_KEY: '   ' }],
]) {
  test(`키가 없고 NODE_ENV가 ${label}이면 키 값 없는 오류로 기동이 멈춘다`, async (t) => {
    const { registered, error } = await boot(t, env);
    assert.ok(error instanceof Error, '기동이 실패해야 한다');
    assert.equal(error.message, KEY_ERROR);
    assert.deepEqual(registered, [], '처리기를 등록하기 전에 멈춘다');
  });
}

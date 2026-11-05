// U5 앱 등록(#441, 비기능 설계 Q1 「앱 등록 시점」): 기본 앱(AppModule)을 띄우면 RagAnswerModule이 U4의 C-10 DB 구현을 받아 로드되고,
// BASE_SUMMARY 처리기를 AiRun에 한 번 등록하며, 질의응답·요약 경로 넷이 열리고, 종료 때 질문 계수기를 닫는다.
// 운영 모드에서도 생성 키·큐 주소가 없을 때 기동이 막히지 않는다(키는 부를 때 NOT_CONFIGURED, 계수기는 늘 통과).
// 실제 AppModule·테스트 DB·실제 로컬 HTTP를 쓴다. 큐 주소·생성 키는 비워 외부(Redis·Claude)에 붙지 않는다.
// 임베딩 키는 운영 모드에서만 합성 값을 주고, 기동 때 Voyage를 부르지 않는다(published-index-module.test.cjs).
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { AiRun } = require('../../dist/ai-run/ai-run');
const { AI_GENERATION_GATE } = require('../../dist/ai-generation/ai-generation.module');
const { AppModule } = require('../../dist/app.module');
const { DbPublicationAccess } = require('../../dist/publications/db-publication-access');
const { InMemoryPublicationAccess } = require('../../dist/publications/in-memory-publication-access');
const { PUBLICATION_ACCESS: U4_PUBLICATION_ACCESS } = require('../../dist/publications/publications.module');
const { QUESTION_COUNTER } = require('../../dist/rag-answer/question-counter');
const { QUESTION_REWRITER } = require('../../dist/rag-answer/question-rewriter');
const { PUBLICATION_ACCESS: U5_PUBLICATION_ACCESS } = require('../../dist/rag-answer/rag-answer-tokens');
const { APP_SETTINGS, setEnv, startApp } = require('../u2/support.cjs');

/** 외부에 붙지 않게 비우는 값. 큐 주소·생성 키가 없을 때가 이 시험의 기동 조건이다. */
const NO_EXTERNAL = { CATCHU_QUEUE_REDIS_URL: undefined, CATCHU_QUEUE_PREFIX: undefined, CATCHU_GENERATION_API_KEY: undefined };
/** 운영 모드에서 다른 Unit 설정이 기동을 막지 않게 https 주소·서명 키·합성 임베딩 키를 준다(U3·U4 기동 시험과 같은 값 모양). */
const PRODUCTION = {
  NODE_ENV: 'production', DEV_LOGIN_ENABLED: undefined, AUTH_WEB_ORIGIN: 'https://catchu.example',
  SHARE_LINK_WEB_BASE_URL: 'https://catchu.example', LINK_GRANT_SECRET: randomBytes(32).toString('hex'),
  CATCHU_EMBEDDING_API_KEY: `synthetic-embedding-key-${randomUUID()}`,
};

/** 환경을 바꿔 실제 AppModule을 /v1 접두사로 띄운다. 기동하는 동안 AiRun 처리기 등록을 기록한다. */
async function bootApp(t, env) {
  const restore = setEnv({ ...APP_SETTINGS, CATCHU_EMBEDDING_API_KEY: undefined, ...NO_EXTERNAL, ...env });
  const registered = [];
  const original = AiRun.prototype.registerHandler;
  AiRun.prototype.registerHandler = function record(kind, handler) {
    registered.push(kind);
    return original.call(this, kind, handler);
  };
  let server;
  let closed = false;
  t.after(async () => {
    try { if (!closed) await server?.app.close(); } finally { restore(); }
  });
  try {
    server = await startApp(AppModule);
  } finally {
    AiRun.prototype.registerHandler = original;
  }
  return { ...server, registered, markClosed: () => { closed = true; } };
}

test('기본 앱 기동 때 BASE_SUMMARY 처리기가 한 번 등록되고, U5 C-10 자리에는 U4의 DB 구현이 들어간다(메모리 가짜 아님)', async (t) => {
  const { app, registered } = await bootApp(t, {});
  assert.deepEqual(registered.filter((kind) => kind === 'BASE_SUMMARY'), ['BASE_SUMMARY']);
  assert.deepEqual(app.get(AiRun).registeredKinds().sort(), ['BASE_SUMMARY', 'EMBED_PUBLICATION']);
  const access = app.get(U5_PUBLICATION_ACCESS, { strict: false });
  assert.ok(access instanceof DbPublicationAccess, 'C-10 DB 구현');
  assert.ok(!(access instanceof InMemoryPublicationAccess), '메모리 가짜는 앱에 넣지 않는다');
  assert.equal(access, app.get(U4_PUBLICATION_ACCESS, { strict: false }), 'U4 모듈이 내보낸 같은 인스턴스');
});

test('질의응답·요약 경로 넷이 열려 실제 판정(U4 DB 구현·회원 인증)에 닿는다', async (t) => {
  const { call, login } = await bootApp(t, {});
  const token = `no-such-token-${randomUUID()}`;
  const summary = await call('GET', `/public/links/${token}/summary`);
  assert.equal(summary.status, 404, summary.text);
  assert.equal(summary.body.code, 'LINK_UNAVAILABLE');
  const question = await call('POST', `/public/links/${token}/questions`, { body: { question: '어떤 일을 했나요?', history: [] } });
  assert.equal(question.status, 404, question.text);
  assert.equal(question.body.code, 'LINK_UNAVAILABLE');

  const publicationId = randomUUID();
  assert.equal((await call('GET', `/publications/${publicationId}/summary`)).status, 401, '작성자 요약은 회원 인증이 있어야 한다');
  const member = await login();
  const owner = await call('GET', `/publications/${publicationId}/summary`, { token: member.token });
  assert.equal(owner.status, 404, owner.text);
  assert.equal(owner.body.code, 'RESOURCE_UNAVAILABLE');
  const regenerate = await call('POST', `/publications/${publicationId}/summary/regenerate`, { token: member.token });
  assert.equal(regenerate.status, 404, regenerate.text);
  assert.equal(regenerate.body.code, 'RESOURCE_UNAVAILABLE');
});

test('큐 주소가 없으면 질문 계수기는 늘 통과하는 것이고, 앱 종료 때 한 번 닫힌다', async (t) => {
  const server = await bootApp(t, {});
  const counter = server.app.get(QUESTION_COUNTER, { strict: false });
  assert.equal(counter.constructor.name, 'NoRedisQuestionCounter');
  let closed = 0;
  const close = counter.close.bind(counter);
  counter.close = async () => { closed += 1; return close(); };
  await server.app.close();
  server.markClosed();
  assert.equal(closed, 1);
});

test('운영 모드(NODE_ENV=production)에서 생성 키·큐 주소가 없어도 기동하고, 다시 쓰기는 부를 때 NOT_CONFIGURED로 끝난다', async (t) => {
  const { app, registered } = await bootApp(t, PRODUCTION);
  assert.deepEqual(registered.filter((kind) => kind === 'BASE_SUMMARY'), ['BASE_SUMMARY']);
  assert.equal(app.get(QUESTION_COUNTER, { strict: false }).constructor.name, 'NoRedisQuestionCounter');
  await assert.rejects(app.get(QUESTION_REWRITER, { strict: false }).rewrite({ question: '합성 질문', history: [] }),
    { name: 'QuestionRewriteFailed', failure: 'NOT_CONFIGURED' });
  assert.ok(app.get(AI_GENERATION_GATE, { strict: false }), '게이트는 키 없이도 만들어진다(부를 때 NOT_CONFIGURED)');
});

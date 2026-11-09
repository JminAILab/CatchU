// U5 RAG 응답 시험 공용 도우미. 시험 파일이 아니다(이름이 .test.cjs로 끝나지 않는다).
// 합성 대역(C-01 게이트·C-09 검색·C-02 AiRun·C-03 하루 제한)과 SSE 읽기, 시험 앱 조립을 둔다. 실제 외부 호출은 없다.
// 시험 자료는 모두 공개 가능한 합성 글이다.
require('reflect-metadata');
const { randomUUID } = require('node:crypto');
const { Module } = require('@nestjs/common');
const { MODULE_METADATA } = require('@nestjs/common/constants');
const { AI_GENERATION_GATE } = require('../../dist/ai-generation/ai-generation.module');
const { AiProviderError } = require('../../dist/ai-generation/ai-generation.types');
const { AiRun } = require('../../dist/ai-run/ai-run');
const { AppModule } = require('../../dist/app.module');
const { DailyRunLimit } = require('../../dist/daily-run-limit/daily-run-limit');
const { InMemoryPublicationAccess } = require('../../dist/publications/in-memory-publication-access');
const { PUBLISHED_SEARCH } = require('../../dist/published-index/published-index.module');
const { QnaController } = require('../../dist/rag-answer/qna.controller');
const { QUESTION_COUNTER } = require('../../dist/rag-answer/question-counter');
const { QUESTION_REWRITER } = require('../../dist/rag-answer/question-rewriter');
const { RagAnswerModule } = require('../../dist/rag-answer/rag-answer.module');
const { PUBLICATION_ACCESS, RAG_ANSWER_OPTIONS } = require('../../dist/rag-answer/rag-answer-tokens');
const { SummaryController } = require('../../dist/rag-answer/summary.controller');
const { startApp } = require('../u2/support.cjs');
const { catchSnapshot, recordingLogger } = require('../published-index/support.cjs');

/** 항목 하나(C-01 GatedItem). */
function citedItem(text, sourceId = 'chunk-1') {
  return { kind: 'CITED', text, jdRole: null, citations: [{ sourceId, quote: '인용 원문',
    location: { publishedItemId: randomUUID(), fieldPath: 'body', charStart: 0, charEnd: 5, pdfPage: null }, sourceLabel: '작성자 자료 원문' }] };
}

/**
 * 기록용 합성 게이트. generate는 output을, generateStream은 items를 차례로 낸다.
 * failAt 번째 항목을 내기 전에 failWith를 던지고, beforeItem(번호)이 있으면 그 Promise를 기다린 뒤 낸다. return 호출을 기록한다.
 */
function fakeGate() {
  const gate = {
    requests: [], streamRequests: [], returned: 0, items: [], output: { items: [], droppedCount: 0 },
    failAt: null, failWith: null, beforeItem: null, onGenerate: null,
    reset() {
      Object.assign(gate, { requests: [], streamRequests: [], returned: 0, items: [], output: { items: [], droppedCount: 0 },
        failAt: null, failWith: null, beforeItem: null, onGenerate: null });
    },
    async generate(request) {
      gate.requests.push(request);
      if (gate.onGenerate) await gate.onGenerate(request);
      if (gate.failWith && gate.failAt === null) throw gate.failWith;
      return gate.output;
    },
    generateStream(request) {
      gate.streamRequests.push(request);
      let index = 0;
      return {
        [Symbol.asyncIterator]() { return this; },
        async next() {
          if (gate.beforeItem) await gate.beforeItem(index);
          if (gate.failAt === index) throw gate.failWith ?? new AiProviderError('CALL_FAILED', { failure: 'API_STATUS', status: 500 });
          if (index < gate.items.length) return { done: false, value: gate.items[index++] };
          return { done: true, value: undefined };
        },
        async return() {
          gate.returned += 1;
          return { done: true, value: undefined };
        },
      };
    },
  };
  return gate;
}

/** 조각 하나(C-09 ChunkHit). */
function chunkHit(text, overrides = {}) {
  return { chunkId: randomUUID(), publishedItemId: randomUUID(), fieldPath: 'body', charStart: 0, charEnd: text.length, pdfPage: null,
    sourceKind: 'AUTHOR_MATERIAL', text, score: 0.9, catchEvidenceUrls: [], ...overrides };
}

/** 기록용 합성 검색. state는 getIndexState 결과, hits·publicationText는 search 결과, failWith면 search가 던진다. */
function fakeSearch() {
  const search = {
    state: 'DONE', hits: [], publicationText: '', failWith: null, calls: [], stateCalls: 0,
    reset() { Object.assign(search, { state: 'DONE', hits: [], publicationText: '', failWith: null, calls: [], stateCalls: 0 }); },
    async getIndexState() { search.stateCalls += 1; return search.state; },
    async search(publicationId, query, limit) {
      search.calls.push({ publicationId, query, limit });
      if (search.failWith) throw search.failWith;
      return { hits: search.hits, publicationText: search.publicationText };
    },
  };
  return search;
}

/** 기록용 합성 다시 쓰기. failWith면 던지고, 아니면 고정 문장을 돌려준다. */
function fakeRewriter() {
  const rewriter = {
    calls: [], failWith: null, text: '다시 쓴 검색 질문',
    reset() { Object.assign(rewriter, { calls: [], failWith: null, text: '다시 쓴 검색 질문' }); },
    async rewrite(input) {
      rewriter.calls.push(structuredClone(input));
      if (rewriter.failWith) throw rewriter.failWith;
      return { text: rewriter.text, inputTokens: 11, outputTokens: 7 };
    },
  };
  return rewriter;
}

/** 바꿔 끼우는 계수기 자리. current를 시험마다 바꾼다. */
function counterSlot(initial) {
  const slot = { current: initial, count: (...args) => slot.current.count(...args), close: () => slot.current.close() };
  return slot;
}

/** C-02 모양의 기록용 AiRun(registerHandler·enqueueAfterCommit만). */
function fakeAiRun() {
  const aiRun = {
    result: 'ENQUEUED', calls: [], handlers: new Map(),
    reset() { aiRun.result = 'ENQUEUED'; aiRun.calls = []; },
    registerHandler(kind, handler) { aiRun.handlers.set(kind, handler); },
    async enqueueAfterCommit(kind, runKey, payload) { aiRun.calls.push({ kind, runKey, payload }); return aiRun.result; },
  };
  return aiRun;
}

/** C-03 모양의 하루 제한 대역. decision을 돌려주고 받은 manager를 기록한다. delegate가 있으면 그 함수(실제 DailyRunLimit 등)에 넘긴다. */
function fakeDailyRunLimit() {
  const limit = {
    decision: 'ALLOWED', calls: [], delegate: null,
    reset() { limit.decision = 'ALLOWED'; limit.calls = []; limit.delegate = null; },
    async consume(memberId, kind, now, manager) {
      limit.calls.push({ memberId, kind, now, hasManager: manager !== undefined });
      return limit.delegate ? limit.delegate(memberId, kind, now, manager) : limit.decision;
    },
  };
  return limit;
}

/** 발행본 하나를 메모리 PublicationAccess에 넣는다. items는 C-10 사본 항목이다. */
function putPublication(access, overrides = {}) {
  const publicationId = overrides.publicationId ?? randomUUID();
  const publishedAt = overrides.publishedAt ?? new Date('2026-11-02T03:00:00.000Z');
  const value = {
    publicationId, ownerMemberId: overrides.ownerMemberId ?? randomUUID(), token: overrides.token ?? `token-${randomUUID()}`,
    passwordProtected: false, title: '합성 발행본', publishedAt,
    expiresAt: new Date(publishedAt.getTime() + 2160 * 3600 * 1000), stoppedAt: null,
    items: [
      { publishedItemId: randomUUID(), position: 1, itemKind: 'CATCH', title: '합성 Catch', snapshot: catchSnapshot(), pdfPages: null },
      { publishedItemId: randomUUID(), position: 2, itemKind: 'TEXT_MATERIAL', title: '합성 자료', snapshot: { body: '합성 자료 본문이다.' },
        pdfPages: null },
    ],
    ...overrides,
  };
  access.put(value);
  return value;
}

/**
 * 실제 AppModule에서 U5 등록(RagAnswerModule.register)만 뺀 조립. 나머지 imports·컨트롤러·공급자는 AppModule 그대로다.
 * 대역을 넣은 U5 컨트롤러를 따로 붙이므로, 실제 등록이 함께 있으면 같은 경로가 둘이 되고 BASE_SUMMARY 처리기도 실제 것이 등록된다.
 * 앱 등록 자체는 rag-answer-app.test.cjs가 실제 AppModule로 본다.
 */
function appModuleWithoutRagAnswer() {
  const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule);
  const kept = imports.filter((entry) => entry?.module !== RagAnswerModule);
  if (kept.length !== imports.length - 1) throw new Error('AppModule imports에서 RagAnswerModule 등록을 정확히 하나 찾지 못했다');
  class AppModuleWithoutRagAnswer {}
  Module({
    imports: kept,
    controllers: Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AppModule),
    providers: Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AppModule),
  })(AppModuleWithoutRagAnswer);
  return AppModuleWithoutRagAnswer;
}

/**
 * U5 컨트롤러 둘을 실제 앱 조립(공통 Guard·오류 필터·DB·개발 로그인, U5 등록만 뺌)과 함께 실제 로컬 HTTP로 띄운다.
 * 다른 Unit 자리는 모두 대역이다.
 */
async function startRagAnswerApp({ clock, keepAliveMs = 15_000, counter, dailyRunLimit, aiRun, withRealDailyRunLimit = false }) {
  const fakes = {
    access: new InMemoryPublicationAccess(clock), search: fakeSearch(), gate: fakeGate(), rewriter: fakeRewriter(),
    counter, logger: recordingLogger(), aiRun: aiRun ?? fakeAiRun(), dailyRunLimit: dailyRunLimit ?? fakeDailyRunLimit(),
  };
  const providers = [
    { provide: PUBLICATION_ACCESS, useValue: fakes.access },
    { provide: PUBLISHED_SEARCH, useValue: fakes.search },
    { provide: AI_GENERATION_GATE, useValue: fakes.gate },
    { provide: QUESTION_REWRITER, useValue: fakes.rewriter },
    { provide: QUESTION_COUNTER, useValue: counter },
    { provide: RAG_ANSWER_OPTIONS, useValue: { clock, keepAliveMs, logger: fakes.logger } },
    { provide: AiRun, useValue: fakes.aiRun },
    ...(withRealDailyRunLimit ? [DailyRunLimit] : [{ provide: DailyRunLimit, useValue: fakes.dailyRunLimit }]),
  ];
  class RagAnswerTestModule {}
  Module({ imports: [appModuleWithoutRagAnswer()], controllers: [QnaController, SummaryController], providers })(RagAnswerTestModule);
  const logs = [];
  const server = await startApp(RagAnswerTestModule, logs);
  return { server, fakes, logs };
}

/** SSE 본문 → [{ event, data }]와 주석 줄 수. */
function parseSse(text) {
  const events = [];
  let comments = 0;
  for (const block of text.split('\n\n')) {
    if (block.trim() === '') continue;
    let event = 'message';
    const data = [];
    for (const line of block.split('\n')) {
      if (line.startsWith(':')) comments += 1;
      else if (line.startsWith('event: ')) event = line.slice(7);
      else if (line.startsWith('data: ')) data.push(line.slice(6));
    }
    if (data.length > 0) events.push({ event, data: JSON.parse(data.join('\n')) });
  }
  return { events, comments };
}

/** 질문 POST. 응답 본문을 끝까지 읽는다. */
async function ask(url, token, body, { grant, signal } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (grant) headers['X-Link-Grant'] = grant;
  const response = await fetch(`${url}/v1/public/links/${encodeURIComponent(token)}/questions`,
    { method: 'POST', headers, body: JSON.stringify(body), signal: signal ?? AbortSignal.timeout(10000) });
  const text = await response.text();
  return { status: response.status, headers: response.headers, text,
    body: response.headers.get('content-type')?.startsWith('application/json') ? JSON.parse(text) : null, ...parseSse(text) };
}

async function waitFor(check, timeoutMs = 3000) {
  const started = Date.now();
  for (;;) {
    const value = await check();
    if (value || Date.now() - started > timeoutMs) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

module.exports = {
  ask, chunkHit, citedItem, counterSlot, fakeAiRun, fakeDailyRunLimit, fakeGate, fakeRewriter, fakeSearch, parseSse, putPublication,
  startRagAnswerApp, waitFor,
};

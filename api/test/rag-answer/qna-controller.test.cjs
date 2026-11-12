// U5 질의응답 POST /v1/public/links/:token/questions(계약 C-12, 기능 설계 W1·W2·BR1~BR4, performance-design NFR4.1·NFR4.3,
// security-design NFR1.1·NFR1.4, observability-design NFR6.1·NFR6.3).
// 실제 AppModule(공통 Guard·오류 필터)과 실제 로컬 HTTP를 쓰고, 다른 Unit 자리(링크 판정·검색·게이트·다시 쓰기·계수기)는 합성 대역이다.
// 합성 대역으로 통과한 것은 실제 Claude·Voyage·U4 연결 성공이 아니다. 기대 결과는 기능 명세 「주요 시나리오와 확인」이다.
const assert = require('node:assert/strict');
const { after, before, beforeEach, test } = require('node:test');
const { IndexNotReady } = require('../../dist/published-index/published-search');
const { InMemoryQuestionCounter, RedisQuestionCounter } = require('../../dist/rag-answer/question-counter');
const { QuestionRewriteFailed } = require('../../dist/rag-answer/question-rewriter');
const { AUTHOR_MATERIAL_VOICE_INSTRUCTION, QNA_INSTRUCTION } = require('../../dist/rag-answer/rag-answer-config');
const { SOURCE_LABELS } = require('../../dist/ai-generation/ai-generation.types');
const { APP_SETTINGS, setEnv } = require('../u2/support.cjs');
const { ask, chunkHit, citedItem, counterSlot, putPublication, startRagAnswerApp, waitFor } = require('./support.cjs');

const NOW = new Date('2026-11-02T03:10:00.000Z');
const QUESTION = 'SYNTHETIC-QUESTION 배포 순서는 어떻게 되나요?';
const HISTORY_TEXT = 'SYNTHETIC-HISTORY 앞 대화';
const ANSWER = 'SYNTHETIC-ANSWER 개발 서버에 먼저 올린다.';

let app;
let restore;
let memory;
let publication;
before(async () => {
  restore = setEnv({ ...APP_SETTINGS, CATCHU_QUEUE_REDIS_URL: undefined });
  memory = new InMemoryQuestionCounter('u5test');
  app = await startRagAnswerApp({ clock: () => NOW, keepAliveMs: 20, counter: counterSlot(memory) });
});
after(async () => { await app?.server.app.close(); restore?.(); });
beforeEach(() => {
  const { fakes } = app;
  fakes.search.reset();
  fakes.gate.reset();
  fakes.rewriter.reset();
  fakes.logger.entries.length = 0;
  app.logs.length = 0;
  memory.counts.clear();
  fakes.counter.current = memory;
  publication = putPublication(fakes.access);
  fakes.search.hits = [chunkHit('개발 서버에 먼저 올린다.'), chunkHit('운영은 확인 뒤 올린다.', { sourceKind: 'GITHUB_RECORD',
    fieldPath: 'workFacts[0]', catchEvidenceUrls: ['https://github.com/o/r/pull/3'] })];
  fakes.search.publicationText = '개발 서버에 먼저 올린다.\n운영은 확인 뒤 올린다.';
  fakes.gate.items = [citedItem(ANSWER), { kind: 'AI_INTERPRETATION', text: 'SYNTHETIC-ANSWER 해석', citations: [], jdRole: null }];
});

const countOf = (publicationId) => [...memory.counts.entries()].filter(([key]) => key.includes(publicationId)).reduce((sum, [, n]) => sum + n, 0);
const completed = () => app.fakes.logger.entries.filter((e) => e.entry.event === 'qna.completed').map((e) => e.entry);
const rejected = () => app.fakes.logger.entries.filter((e) => e.entry.event === 'qna.rejected').map((e) => e.entry);

test('첫 질문: 다시 쓰기 없이 검색 8개로 QNA 생성, 통과 항목만 item으로 보내고 done. SSE 머리가 맞다(BR4.1~BR4.5, NFR4.3)', async () => {
  const response = await ask(app.server.url, publication.token, { question: `  ${QUESTION} `, history: [] });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/event-stream; charset=utf-8');
  assert.equal(response.headers.get('cache-control'), 'no-cache');
  assert.equal(response.headers.get('x-accel-buffering'), 'no');
  assert.deepEqual(response.events, [
    { event: 'item', data: app.fakes.gate.items[0] }, { event: 'item', data: app.fakes.gate.items[1] }, { event: 'done', data: {} }]);
  const { fakes } = app;
  assert.equal(fakes.rewriter.calls.length, 0);
  assert.deepEqual(fakes.search.calls, [{ publicationId: publication.publicationId, query: QUESTION, limit: 8 }]);
  assert.equal(fakes.gate.streamRequests.length, 1);
  const request = fakes.gate.streamRequests[0];
  assert.equal(request.feature, 'QNA');
  assert.equal(request.model, 'HAIKU');
  assert.equal(request.instruction, QNA_INSTRUCTION);
  assert.equal(request.userText, QUESTION);
  assert.equal(request.publicationText, fakes.search.publicationText);
  assert.deepEqual(request.sources[1], {
    sourceId: fakes.search.hits[1].chunkId, sourceKind: 'GITHUB_RECORD', text: '운영은 확인 뒤 올린다.',
    location: { publishedItemId: fakes.search.hits[1].publishedItemId, fieldPath: 'workFacts[0]', charStart: 0,
      charEnd: '운영은 확인 뒤 올린다.'.length, pdfPage: null },
    catchEvidenceUrls: ['https://github.com/o/r/pull/3'],
  });
  assert.equal(countOf(publication.publicationId), 1);
  assert.deepEqual(completed(), [{ event: 'qna.completed', publicationId: publication.publicationId, stage: 'GENERATE', outcome: 'OK',
    failure: null, rewritten: false, rewriteMs: null, rewriteInputTokens: null, rewriteOutputTokens: null, searchMs: completed()[0].searchMs,
    chunkCount: 2, generateMs: completed()[0].generateMs, itemCount: 2 }]);
});

test('앞 대화가 있는 질문: 최근 6개·2,000자로 다시 쓰기 1회, 다시 쓴 문장으로 검색·생성(BR1.2·BR1.3·BR4.1)', async () => {
  const history = Array.from({ length: 8 }, (_, i) => ({ role: i % 2 ? 'ASSISTANT' : 'USER', text: `${HISTORY_TEXT} ${i}` }));
  history[7].text = 'ㅎ'.repeat(2100);
  const response = await ask(app.server.url, publication.token, { question: QUESTION, history });
  assert.equal(response.status, 200);
  const { fakes } = app;
  assert.equal(fakes.rewriter.calls.length, 1);
  assert.equal(fakes.rewriter.calls[0].question, QUESTION);
  assert.equal(fakes.rewriter.calls[0].history.length, 6);
  assert.equal(fakes.rewriter.calls[0].history[0].text, `${HISTORY_TEXT} 2`);
  assert.equal(fakes.rewriter.calls[0].history[5].text.length, 2000);
  assert.equal(fakes.search.calls[0].query, '다시 쓴 검색 질문');
  assert.equal(fakes.gate.streamRequests[0].userText, '다시 쓴 검색 질문', '앞 대화는 생성에 넣지 않고 다시 쓴 질문만 쓴다');
  assert.ok(!JSON.stringify(fakes.gate.streamRequests[0]).includes(HISTORY_TEXT));
  const entry = completed()[0];
  assert.equal(entry.rewritten, true);
  assert.equal(entry.rewriteInputTokens, 11);
  assert.equal(entry.rewriteOutputTokens, 7);
});

test('스트림 전 거부는 HTTP 오류 본문이고, 검증·링크·색인 거부는 횟수를 세지 않는다(BR1.1·BR2.1·BR2.2·BR2.3)', async () => {
  const { fakes } = app;
  const tooLong = await ask(app.server.url, publication.token, { question: 'ㄱ'.repeat(501), history: [] });
  assert.equal(tooLong.status, 400);
  assert.equal(tooLong.body.code, 'VALIDATION_FAILED');
  const unknownField = await ask(app.server.url, publication.token, { question: '질문', history: [], excludedItemIds: [] });
  assert.equal(unknownField.status, 400);

  const stopped = putPublication(fakes.access, { stoppedAt: new Date('2026-11-02T03:05:00.000Z') });
  const expired = putPublication(fakes.access, { publishedAt: new Date('2026-07-01T00:00:00.000Z') });
  for (const token of [stopped.token, expired.token, 'no-such-token']) {
    const response = await ask(app.server.url, token, { question: '질문', history: [] });
    assert.equal(response.status, 404, token);
    assert.deepEqual(response.body, { code: 'LINK_UNAVAILABLE', message: '이 링크는 열람할 수 없습니다.' });
  }
  const locked = putPublication(fakes.access, { passwordProtected: true });
  const noGrant = await ask(app.server.url, locked.token, { question: '질문', history: [] });
  assert.equal(noGrant.status, 401);
  assert.equal(noGrant.body.code, 'LINK_PASSWORD_REQUIRED');
  const otherGrant = fakes.access.issueGrant(publication.publicationId, new Date('2026-11-02T05:00:00.000Z'));
  assert.equal((await ask(app.server.url, locked.token, { question: '질문', history: [] }, { grant: otherGrant })).status, 401);
  const grant = fakes.access.issueGrant(locked.publicationId, new Date('2026-11-02T05:00:00.000Z'));
  assert.equal((await ask(app.server.url, locked.token, { question: '질문', history: [] }, { grant })).status, 200);

  for (const state of ['PENDING', 'FAILED']) {
    fakes.search.state = state;
    const response = await ask(app.server.url, publication.token, { question: '질문', history: [] });
    assert.equal(response.status, 409);
    assert.deepEqual(response.body, { code: 'INDEX_NOT_READY', message: '아직 쓸 수 없습니다' });
  }
  assert.equal(countOf(publication.publicationId), 0);
  assert.equal(countOf(stopped.publicationId) + countOf(expired.publicationId), 0);
  assert.equal(countOf(locked.publicationId), 1, 'grant로 통과한 한 번만 센다');
  assert.equal(fakes.rewriter.calls.length + fakes.gate.streamRequests.length, 1);
  assert.deepEqual(rejected().map((e) => [e.outcome, e.publicationId]), [
    ['VALIDATION_FAILED', null], ['VALIDATION_FAILED', null], ['LINK_UNAVAILABLE', null], ['LINK_UNAVAILABLE', null],
    ['LINK_UNAVAILABLE', null], ['LINK_PASSWORD_REQUIRED', null], ['LINK_PASSWORD_REQUIRED', null],
    ['INDEX_NOT_READY', publication.publicationId], ['INDEX_NOT_READY', publication.publicationId]]);
});

test('하루 101번째 질문은 429 QUESTION_LIMIT_REACHED이고 남은 횟수는 응답에 없다(BR3.1·BR3.3)', async () => {
  for (let i = 0; i < 100; i += 1) await memory.count(publication.publicationId, NOW);
  const response = await ask(app.server.url, publication.token, { question: '질문', history: [] });
  assert.equal(response.status, 429);
  assert.deepEqual(response.body, { code: 'QUESTION_LIMIT_REACHED', message: '오늘 한도에 도달했습니다' });
  assert.equal(response.headers.get('retry-after'), null);
  assert.equal(app.fakes.search.calls.length, 0);
  assert.equal(countOf(publication.publicationId), 101, '거부된 질문도 늘린 값을 되돌리지 않는다');
});

test('Redis 장애면 세지 않고 질문을 통과시키며 경고를 남긴다(BR3.2)', async () => {
  const failing = { on() {}, multi() { const p = { incr: () => p, expireat: () => p, exec: async () => { throw new Error('down'); } }; return p; },
    async quit() {}, disconnect() {} };
  app.fakes.counter.current = new RedisQuestionCounter({ redis: failing, prefix: 'u5test', logger: app.fakes.logger });
  const response = await ask(app.server.url, publication.token, { question: '질문', history: [] });
  assert.equal(response.status, 200);
  assert.equal(response.events.at(-1).event, 'done');
  assert.ok(app.fakes.logger.entries.some((e) => e.level === 'warn' && e.entry.event === 'qna.count-bypassed' && e.entry.reason === 'REDIS_ERROR'));
});

test('검색 조각이 0개면 생성을 부르지 않고 done만 보낸다(BR4.4)', async () => {
  app.fakes.search.hits = [];
  const response = await ask(app.server.url, publication.token, { question: '질문', history: [] });
  assert.deepEqual(response.events, [{ event: 'done', data: {} }]);
  assert.equal(app.fakes.gate.streamRequests.length, 0);
  assert.equal(completed()[0].stage, 'SEARCH');
  assert.equal(completed()[0].chunkCount, 0);
});

test('생성 중 AiProviderError: 보낸 항목은 두고 error ANSWER_FAILED 뒤 닫는다. 제공자 메시지는 싣지 않는다(BR4.6)', async () => {
  app.fakes.gate.failAt = 1;
  const response = await ask(app.server.url, publication.token, { question: '질문', history: [] });
  assert.equal(response.status, 200);
  assert.deepEqual(response.events, [{ event: 'item', data: app.fakes.gate.items[0] }, { event: 'error', data: { code: 'ANSWER_FAILED' } }]);
  assert.equal(completed()[0].outcome, 'GENERATION_FAILED');
  assert.equal(completed()[0].failure, 'AiProviderError');
  assert.equal(completed()[0].itemCount, 1);
});

test('다시 쓰기 실패·검색 실패는 error 하나로 끝내고 다음 단계를 부르지 않는다. IndexNotReady는 INDEX_NOT_READY다', async () => {
  const { fakes } = app;
  fakes.rewriter.failWith = new QuestionRewriteFailed('TIMEOUT');
  let response = await ask(app.server.url, publication.token, { question: '질문', history: [{ role: 'USER', text: '앞' }] });
  assert.deepEqual(response.events, [{ event: 'error', data: { code: 'ANSWER_FAILED' } }]);
  assert.equal(fakes.search.calls.length, 0);
  assert.equal(completed().at(-1).outcome, 'REWRITE_FAILED');

  fakes.rewriter.failWith = null;
  fakes.search.failWith = new IndexNotReady();
  response = await ask(app.server.url, publication.token, { question: '질문', history: [] });
  assert.deepEqual(response.events, [{ event: 'error', data: { code: 'INDEX_NOT_READY' } }]);
  assert.equal(completed().at(-1).outcome, 'INDEX_NOT_READY');

  fakes.search.failWith = Object.assign(new Error('voyage'), { name: 'EmbeddingProviderError' });
  response = await ask(app.server.url, publication.token, { question: '질문', history: [] });
  assert.deepEqual(response.events, [{ event: 'error', data: { code: 'ANSWER_FAILED' } }]);
  assert.equal(completed().at(-1).outcome, 'SEARCH_FAILED');
  assert.equal(completed().at(-1).failure, 'EmbeddingProviderError');
  assert.equal(fakes.gate.streamRequests.length, 0);
});

test('SSE를 연 뒤 예상 밖 예외가 나면 error ANSWER_FAILED를 쓰고 오류 이름만 error로 남긴 뒤 닫는다(수정 요청 R-03)', async () => {
  const { fakes } = app;
  fakes.search.hits = null; // 검색 결과 모양이 깨져 처리기 안에서 TypeError가 난다(단계별 실패 처리 밖의 예외).
  const response = await ask(app.server.url, publication.token, { question: QUESTION, history: [] });
  assert.equal(response.status, 200);
  assert.deepEqual(response.events, [{ event: 'error', data: { code: 'ANSWER_FAILED' } }]);
  const failed = fakes.logger.entries.filter((e) => e.entry.event === 'qna.stream-failed');
  assert.deepEqual(failed, [{ level: 'error', entry: { event: 'qna.stream-failed', publicationId: publication.publicationId, error: 'TypeError' } }]);
  assert.equal(completed().length, 0, '결과가 없으면 qna.completed를 남기지 않는다');
  assert.equal(fakes.gate.streamRequests.length, 0);
  const text = JSON.stringify([fakes.logger.entries, app.logs.map((log) => log.text)]);
  assert.ok(!text.includes('SYNTHETIC-QUESTION'), '로그에 질문 글이 없다');
  assert.ok(!text.includes('Cannot read'), '로그에 오류 메시지가 없다');
});

test('연결이 끊기면 생성 반복을 멈춰 게이트 스트림 return을 부르고, 횟수는 돌려주지 않는다(BR4.8, NFR4.3)', async () => {
  const { fakes } = app;
  let releaseSecond;
  const secondWait = new Promise((resolve) => { releaseSecond = resolve; });
  fakes.gate.items = [citedItem('첫 항목'), citedItem('둘째 항목'), citedItem('셋째 항목')];
  fakes.gate.beforeItem = (index) => (index === 1 ? secondWait : undefined);
  const controller = new AbortController();
  const response = await fetch(`${app.server.url}/v1/public/links/${publication.token}/questions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: '질문', history: [] }), signal: controller.signal,
  });
  const reader = response.body.getReader();
  const first = new TextDecoder().decode((await reader.read()).value);
  assert.match(first, /event: item/);
  controller.abort();
  await reader.cancel().catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 50));
  releaseSecond();
  const entry = await waitFor(() => completed()[0]);
  assert.equal(entry.outcome, 'CLIENT_CLOSED');
  assert.equal(fakes.gate.returned, 1, 'for-await break가 게이트 스트림의 return을 부른다');
  assert.ok(entry.itemCount <= 1);
  assert.equal(countOf(publication.publicationId), 1);
});

test('항목을 기다리는 동안 keep-alive 주석을 보내고, 받는 쪽은 주석을 이벤트로 보지 않는다(NFR4.3)', async () => {
  app.fakes.gate.beforeItem = (index) => (index === 0 ? new Promise((resolve) => setTimeout(resolve, 90)) : undefined);
  const response = await ask(app.server.url, publication.token, { question: '질문', history: [] });
  assert.ok(response.comments >= 2, `keep-alive ${response.comments}번`);
  assert.match(response.text, /^: keep-alive\n\n/);
  assert.deepEqual(response.events.map((e) => e.event), ['item', 'item', 'done']);
});

test('로그에는 질문·앞 대화·답·링크 토큰·grant 글이 없다(BR1.4, NFR6.3)', async () => {
  const locked = putPublication(app.fakes.access, { passwordProtected: true, token: 'SYNTHETIC-TOKEN-SECRET' });
  const grant = app.fakes.access.issueGrant(locked.publicationId, new Date('2026-11-02T05:00:00.000Z'));
  await ask(app.server.url, locked.token, { question: QUESTION, history: [{ role: 'USER', text: HISTORY_TEXT }] }, { grant });
  await ask(app.server.url, locked.token, { question: QUESTION, history: [] });
  app.fakes.gate.failAt = 0;
  await ask(app.server.url, publication.token, { question: QUESTION, history: [] });
  const text = JSON.stringify([app.fakes.logger.entries, app.logs.map((log) => log.text)]);
  assert.ok(completed().length >= 2);
  for (const secret of ['SYNTHETIC-QUESTION', 'SYNTHETIC-HISTORY', 'SYNTHETIC-ANSWER', 'SYNTHETIC-TOKEN-SECRET', grant, '다시 쓴 검색 질문']) {
    assert.ok(!text.includes(secret), `로그에 ${secret}가 없다`);
  }
});

test('확인 단계 중에 연결이 끊기면 다시 쓰기·검색·생성을 부르지 않고 연결 끊김으로 남긴다(BR4.8, NFR4.3)', async () => {
  const { fakes } = app;
  // 질문 횟수를 세는 동안(확인 단계 마지막) 받는 쪽이 끊게 한다. close 이벤트는 SSE를 열기 전에 지나간다.
  let entered;
  const counting = new Promise((resolve) => { entered = resolve; });
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  fakes.counter.current = {
    async count(publicationId, now) { entered(); await held; return memory.count(publicationId, now); },
    async close() {},
  };
  const controller = new AbortController();
  const pending = fetch(`${app.server.url}/v1/public/links/${publication.token}/questions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: '질문', history: [{ role: 'USER', text: '앞 질문' }] }), signal: controller.signal,
  }).catch(() => undefined);
  await counting;
  controller.abort();
  await pending;
  await new Promise((resolve) => setTimeout(resolve, 50));
  release();
  const entry = await waitFor(() => completed()[0]);
  assert.equal(entry.outcome, 'CLIENT_CLOSED');
  assert.equal(fakes.rewriter.calls.length, 0, '다시 쓰기를 부르지 않는다');
  assert.equal(fakes.search.calls.length, 0, '검색을 부르지 않는다');
  assert.equal(fakes.gate.streamRequests.length, 0, '생성을 부르지 않는다');
  assert.equal(countOf(publication.publicationId), 1, '이미 센 횟수는 돌려주지 않는다');
});

// 새 Catch NC2 — 질의응답 지시 끝의 작성자 말 옮기기 문장(BR5.1, AC6.5.3·AC8.1.1).
// 먼저 정한 시나리오: 질의응답 생성 요청의 지시를 본다. 답의 말투(AC8.1.1·AC8.1.3)는 빌드와 시험의 질의응답 10개 다시 재기(FR11.2)가 판정하고,
// 이 시험은 지시 끝에 문장이 붙었는지와 근거 딱지가 둘뿐인지까지만 본다.
// - 기대: 지시는 지금 문장 뒤에 AUTHOR_MATERIAL_VOICE_INSTRUCTION으로 끝나고, 딱지 상수 SOURCE_LABELS는 'GitHub 기록 원문'·'작성자 자료 원문' 둘이다.
// - 실패 조건: 문장이 없거나 앞에 붙음, 딱지가 셋 이상이거나 바뀜.

test('NC2 AC8.1.1·AC6.5.3 질의응답 지시는 작성자 말 옮기기 문장으로 끝나고 근거 딱지는 둘뿐이다(BR5.1)', async () => {
  const response = await ask(app.server.url, publication.token, { question: QUESTION, history: [] });
  assert.equal(response.status, 200);
  const { instruction } = app.fakes.gate.streamRequests[0];
  assert.equal(AUTHOR_MATERIAL_VOICE_INSTRUCTION,
    "자료 종류가 작성자 자료 원문인 내용은 '작성자는 …라고 적었다'처럼 작성자의 말로 옮기고, 확인된 사실처럼 쓰지 않는다.");
  assert.ok(instruction.startsWith('발행본 자료만으로 질문에 답하고'), '지금 지시가 앞에 그대로 있다');
  assert.ok(instruction.endsWith(` ${AUTHOR_MATERIAL_VOICE_INSTRUCTION}`));
  assert.equal(instruction.split(AUTHOR_MATERIAL_VOICE_INSTRUCTION).length, 2, '한 번만 붙는다');
  assert.deepEqual(SOURCE_LABELS, { GITHUB_RECORD: 'GitHub 기록 원문', AUTHOR_MATERIAL: '작성자 자료 원문' });
});

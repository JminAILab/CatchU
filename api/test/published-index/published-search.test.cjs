// U3 색인 상태·의미 검색(계약 C-09, 기능 설계 W3·W5, BR3·BR5). S8~S10과 getIndexState를 테스트 DB에서 확인한다.
// 제공자는 시험이 정한 글→벡터 표를 쓴다(점수 순서를 미리 알 수 있게). 실제 Voyage 결과가 아니다.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { before, after, beforeEach, test } = require('node:test');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const { EmbeddingProviderError } = require('../../dist/published-index/embedding-provider');
const { createEmbedPublicationHandler } = require('../../dist/published-index/embed-publication-handler');
const { createPublishedIndexWriter } = require('../../dist/published-index/published-index-writer');
const { createPublishedSearch, IndexNotReady } = require('../../dist/published-index/published-search');
const {
  AI_DRAFT_MARKER, TITLE_MARKER, axisVector, chunkPublication, fakeAiRun, indexRow, insertMember, insertPublication, publicationA,
  publicationB, recordingLogger, recordingProvider, setIndex,
} = require('./support.cjs');

let db;
before(async () => { db = await openTestDataSource(); });
after(async () => { await db?.destroy(); });
beforeEach(async () => { await resetTestDatabase(db); });

const NOW = new Date('2026-11-02T03:00:00.000Z');
const LATER = new Date(NOW.getTime() + 60_000);
const QUERY = '배포 순서와 시험 방법을 알려 주세요';
// 질문 벡터: 텍스트 자료 첫 조각(seq 7) 쪽으로 2, 둘째 조각(seq 8) 쪽으로 1.
const QUERY_VECTOR = axisVector({ 7: 2, 8: 1 });
const HIT_KEYS = ['catchEvidenceUrls', 'charEnd', 'charStart', 'chunkId', 'fieldPath', 'pdfPage', 'publishedItemId', 'score', 'sourceKind', 'text'];

/** 발행본 A(조각 seq k → k번 축)와 B(질문과 같은 벡터)를 모두 DONE으로 만든다. B가 섞이면 점수 1로 맨 위에 나온다. */
async function doneAandB() {
  const a = await publicationA(db);
  const b = await publicationB(db, a.memberId);
  const writer = createPublishedIndexWriter({ dataSource: db, aiRun: fakeAiRun(), logger: recordingLogger() });
  await chunkPublication(db, writer, a.publicationId, NOW);
  await chunkPublication(db, writer, b.publicationId, NOW);
  const table = new Map([[QUERY, QUERY_VECTOR], [b.body, QUERY_VECTOR]]);
  for (const row of await db.query('SELECT seq, text FROM published_chunk WHERE publication_id = $1', [a.publicationId])) {
    table.set(row.text, axisVector({ [row.seq]: 1 }));
  }
  const provider = recordingProvider({ vectorFor: (text) => table.get(text) });
  const run = createEmbedPublicationHandler({ dataSource: db, provider, clock: () => LATER, logger: recordingLogger() });
  for (const publicationId of [a.publicationId, b.publicationId]) await run({ runKey: 'k', payload: { publicationId } });
  provider.calls.length = 0;
  return { a, b, provider };
}
function search(provider, logger = recordingLogger()) {
  return { search: createPublishedSearch({ dataSource: db, provider, logger, clock: () => LATER }), logger };
}

test('S8 발행본 A만 점수순 limit개, 같은 점수는 seq 순, ChunkHit 칸·근거 URL·위치가 C-09 모양이다', async () => {
  const { a, b, provider } = await doneAandB();
  const { search: s } = search(provider);
  const { hits, publicationText } = await s.search(a.publicationId, QUERY, 4);
  assert.deepEqual(provider.calls, [{ inputType: 'query', count: 1 }]);
  assert.deepEqual(hits.map((h) => h.fieldPath), ['body', 'body', 'workFacts[0]', 'workFacts[1]']);
  assert.ok(Math.abs(hits[0].score - 2 / Math.sqrt(5)) < 1e-5 && Math.abs(hits[1].score - 1 / Math.sqrt(5)) < 1e-5);
  assert.ok(Math.abs(hits[2].score) < 1e-6 && Math.abs(hits[3].score) < 1e-6);
  for (const hit of hits) {
    assert.deepEqual(Object.keys(hit).sort(), HIT_KEYS);
    assert.notEqual(hit.publishedItemId, b.textItemId, '다른 발행본의 조각이 섞이지 않는다');
    assert.equal(hit.pdfPage, null);
  }
  assert.deepEqual([hits[0].charStart, hits[0].charEnd, hits[0].sourceKind, hits[0].catchEvidenceUrls], [0, 902, 'AUTHOR_MATERIAL', []]);
  assert.equal(hits[0].text, a.body.slice(0, 902));
  assert.equal(hits[2].publishedItemId, a.catchItemId);
  assert.equal(hits[2].sourceKind, 'GITHUB_RECORD');
  assert.deepEqual(hits[2].catchEvidenceUrls, [a.catchSnapshot.evidence[0].sourceUrl]);
  assert.equal(hits[2].text, a.catchSnapshot.workFacts[0]);

  const texts = (await db.query('SELECT text FROM published_chunk WHERE publication_id = $1 ORDER BY seq', [a.publicationId])).map((r) => r.text);
  assert.equal(publicationText, texts.join('\n'));
  assert.ok(!publicationText.includes(AI_DRAFT_MARKER) && !publicationText.includes(TITLE_MARKER) && !publicationText.includes(b.body));
});

test('S8 조각이 limit보다 적으면 있는 만큼, B를 검색하면 B 조각만 나온다', async () => {
  const { a, b, provider } = await doneAandB();
  const { search: s } = search(provider);
  assert.equal((await s.search(a.publicationId, QUERY, 50)).hits.length, 9);
  const onlyB = await s.search(b.publicationId, QUERY, 5);
  assert.deepEqual(onlyB.hits.map((h) => h.publishedItemId), [b.textItemId]);
  assert.ok(Math.abs(onlyB.hits[0].score - 1) < 1e-6);
  assert.equal(onlyB.publicationText, b.body);
});

test('S9 색인이 PENDING·FAILED이거나 행이 없으면 IndexNotReady이고 제공자를 부르지 않는다', async () => {
  const a = await publicationA(db);
  const writer = createPublishedIndexWriter({ dataSource: db, aiRun: fakeAiRun(), logger: recordingLogger() });
  await chunkPublication(db, writer, a.publicationId, NOW);
  const provider = recordingProvider();
  const { search: s } = search(provider);
  await assert.rejects(s.search(a.publicationId, QUERY, 5), (error) => error instanceof IndexNotReady && error.name === 'IndexNotReady');
  await setIndex(db, a.publicationId, 'FAILED', NOW);
  await assert.rejects(s.search(a.publicationId, QUERY, 5), IndexNotReady);
  const missing = await insertPublication(db, await insertMember(db));
  await assert.rejects(s.search(missing, QUERY, 5), IndexNotReady);
  assert.equal(provider.calls.length, 0);
});

test('S10 질문 임베딩이 실패하면 제공자 오류를 그대로 던지고, 로그에는 질문 글 없이 종류만 남는다', async () => {
  const { a } = await doneAandB();
  const provider = recordingProvider({ failAt: 1, failure: 'API_STATUS', httpStatus: 400 });
  const { search: s, logger } = search(provider);
  await assert.rejects(s.search(a.publicationId, QUERY, 5), (error) =>
    error instanceof EmbeddingProviderError && error.failure === 'API_STATUS' && error.httpStatus === 400);
  assert.equal(provider.calls.length, 1, '다시 시도하지 않는다');
  assert.equal(logger.entries.length, 1);
  const { level, entry } = logger.entries[0];
  assert.equal(level, 'warn');
  assert.deepEqual({ ...entry, durationMs: 0 },
    { event: 'PUBLISHED_SEARCH_FAILED', publicationId: a.publicationId, failure: 'API_STATUS', httpStatus: 400, durationMs: 0 });
  assert.ok(!logger.text().includes(QUERY));

  const wrongShape = search(recordingProvider({ vectorFor: () => [1, 2, 3] }));
  await assert.rejects(wrongShape.search.search(a.publicationId, QUERY, 5), (error) => error.failure === 'INVALID_RESPONSE');
  assert.equal(wrongShape.logger.entries[0].entry.failure, 'INVALID_RESPONSE');
});

test('S10 limit가 1~50의 정수가 아니면 상태를 보기 전에 인자 오류, 공백 질문은 빈 hits와 publicationText(호출 없음)', async () => {
  const { a, provider } = await doneAandB();
  const { search: s } = search(provider);
  for (const limit of [0, 51, 1.5, Number.NaN, '5']) {
    await assert.rejects(s.search(a.publicationId, QUERY, limit), RangeError);
  }
  const notReady = await insertPublication(db, await insertMember(db));
  await assert.rejects(s.search(notReady, QUERY, 0), RangeError, 'limit 검사가 상태 판정보다 먼저다');
  for (const query of ['', '   ', '\n\t']) {
    const result = await s.search(a.publicationId, query, 5);
    assert.deepEqual(result.hits, []);
    assert.ok(result.publicationText.length > 0);
  }
  await assert.rejects(s.search(a.publicationId, null, 5), TypeError);
  assert.equal(provider.calls.length, 0);
});

test('getIndexState: 행 없음 → FAILED(행을 만들지 않음), 마감 지난 PENDING → FAILED 저장, 마감 전 PENDING·DONE·FAILED는 그대로', async () => {
  const memberId = await insertMember(db);
  const writer = createPublishedIndexWriter({ dataSource: db, aiRun: fakeAiRun(), logger: recordingLogger() });
  const { search: s } = search(recordingProvider());
  const missing = await insertPublication(db, memberId);
  assert.equal(await s.getIndexState(missing, NOW), 'FAILED');
  assert.equal(await indexRow(db, missing), null);

  const pending = await insertPublication(db, memberId);
  await chunkPublication(db, writer, pending, NOW);
  assert.equal(await s.getIndexState(pending, new Date(NOW.getTime() + 599_999)), 'PENDING');
  assert.equal(await s.getIndexState(pending, new Date(NOW.getTime() + 600_000)), 'FAILED');
  const stored = await indexRow(db, pending);
  assert.equal(stored.status, 'FAILED');

  const done = await insertPublication(db, memberId);
  await chunkPublication(db, writer, done, NOW);
  await setIndex(db, done, 'DONE', NOW);
  assert.equal(await s.getIndexState(done, new Date(NOW.getTime() + 3_600_000)), 'DONE');
  assert.equal((await indexRow(db, done)).status, 'DONE');
  await setIndex(db, done, 'FAILED', NOW);
  assert.equal(await s.getIndexState(done, NOW), 'FAILED');
});

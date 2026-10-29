// U3 EMBED_PUBLICATION 처리기(C-02, 기능 설계 W2, BR2.1~BR2.5). S3~S6과 저장 직전 다시 확인·로그 칸을 테스트 DB에서 확인한다.
// 제공자는 시험용(결정적 합성 벡터, 지정한 호출에서 실패)이다. 실제 Voyage 결과가 아니다.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { before, after, beforeEach, test } = require('node:test');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const { createEmbedPublicationHandler } = require('../../dist/published-index/embed-publication-handler');
const { createPublishedIndexWriter } = require('../../dist/published-index/published-index-writer');
const { createPublishedSearch } = require('../../dist/published-index/published-search');
const {
  chunkPublication, embeddedCount, fakeAiRun, filler, indexRow, publicationA, publicationB, recordingLogger, recordingProvider, setIndex,
} = require('./support.cjs');

let db;
before(async () => { db = await openTestDataSource(); });
after(async () => { await db?.destroy(); });
beforeEach(async () => { await resetTestDatabase(db); });

const NOW = new Date('2026-11-02T03:00:00.000Z');
const LATER = new Date(NOW.getTime() + 60_000);
const KEY_TEXT = 'synthetic-voyage-key-not-real';

const writer = () => createPublishedIndexWriter({ dataSource: db, aiRun: fakeAiRun(), logger: recordingLogger() });
function handler(provider, clock = () => LATER) {
  const logger = recordingLogger();
  return { run: createEmbedPublicationHandler({ dataSource: db, provider, clock, logger }), logger };
}
const job = (publicationId) => ({ runKey: `EMBED_PUBLICATION-${publicationId}`, payload: { publicationId } });

async function chunkedA() {
  const a = await publicationA(db);
  await chunkPublication(db, writer(), a.publicationId, NOW);
  return a;
}
/** 빈 줄로 나뉜 600자 문단 n개(두 문단을 이으면 1,000을 넘어 문단마다 조각 하나) */
async function chunkedParagraphs(count) {
  const body = Array.from({ length: count }, (_, i) => filler(`문단 ${i}번의 합성 글이다. `, 600)).join('\n\n');
  const b = await publicationB(db, undefined, body);
  await chunkPublication(db, writer(), b.publicationId, NOW);
  return b;
}
const chunkTexts = async (publicationId) =>
  (await db.query('SELECT text FROM published_chunk WHERE publication_id = $1', [publicationId])).map((r) => r.text);

test('S3 모든 조각에 1024차원 벡터를 한 번에 저장하고 DONE, 제공자는 문서용 입력 한 묶음', async () => {
  const a = await chunkedA();
  const provider = recordingProvider();
  const { run, logger } = handler(provider);
  await run(job(a.publicationId));
  assert.equal((await indexRow(db, a.publicationId)).status, 'DONE');
  assert.deepEqual(await db.query(`SELECT DISTINCT vector_dims(embedding) AS dims FROM published_chunk WHERE publication_id = $1`,
    [a.publicationId]), [{ dims: 1024 }]);
  assert.equal(await embeddedCount(db, a.publicationId), 9);
  assert.deepEqual(provider.calls, [{ inputType: 'document', count: 9 }]);
  assert.equal(logger.entries.length, 1);
  const { level, entry } = logger.entries[0];
  assert.equal(level, 'log');
  assert.deepEqual(Object.keys(entry).sort(), ['batchCount', 'chunkCount', 'durationMs', 'event', 'publicationId', 'result', 'totalTokens']);
  assert.deepEqual({ ...entry, durationMs: 0 }, { event: 'EMBED_PUBLICATION_COMPLETED', publicationId: a.publicationId,
    chunkCount: 9, batchCount: 1, result: 'DONE', totalTokens: 9, durationMs: 0 });
  // DONE 뒤 검색이 된다(조각 벡터가 실제로 저장됐다).
  const search = createPublishedSearch({ dataSource: db, provider, logger: recordingLogger(), clock: () => LATER });
  assert.equal((await search.search(a.publicationId, '배포 순서', 3)).hits.length, 3);
});

test('S3 조각 129개는 128개·1개 두 묶음으로 차례로 보낸다', async () => {
  const b = await chunkedParagraphs(129);
  const provider = recordingProvider();
  const { run, logger } = handler(provider);
  await run(job(b.publicationId));
  assert.deepEqual(provider.calls, [{ inputType: 'document', count: 128 }, { inputType: 'document', count: 1 }]);
  assert.equal(await embeddedCount(db, b.publicationId), 129);
  assert.equal(logger.entries[0].entry.batchCount, 2);
});

test('S4 두 번째 묶음에서 실패하면 FAILED이고 어떤 조각에도 벡터가 없으며 다시 부르지 않는다(처리기는 던지지 않음)', async () => {
  const b = await chunkedParagraphs(129);
  const provider = recordingProvider({ failAt: 2, failure: 'API_STATUS', httpStatus: 503 });
  const { run, logger } = handler(provider);
  await run(job(b.publicationId));
  assert.equal((await indexRow(db, b.publicationId)).status, 'FAILED');
  assert.equal(await embeddedCount(db, b.publicationId), 0);
  assert.equal(provider.calls.length, 2);
  assert.deepEqual(logger.entries.map((e) => e.level), ['warn']);
  const { entry } = logger.entries[0];
  assert.deepEqual(Object.keys(entry).sort(), ['batchCount', 'chunkCount', 'durationMs', 'event', 'failure', 'httpStatus',
    'publicationId', 'result', 'totalTokens']);
  assert.deepEqual({ ...entry, durationMs: 0 }, { event: 'EMBED_PUBLICATION_FAILED', publicationId: b.publicationId,
    chunkCount: 129, batchCount: 2, totalTokens: 128, durationMs: 0, result: 'FAILED', failure: 'API_STATUS', httpStatus: 503 });
});

test('제공자가 개수·차원이 틀린 벡터를 주면 INVALID_RESPONSE로 FAILED', async () => {
  const a = await chunkedA();
  const { run, logger } = handler(recordingProvider({ vectorFor: () => [0.1, 0.2] }));
  await run(job(a.publicationId));
  assert.equal((await indexRow(db, a.publicationId)).status, 'FAILED');
  assert.equal(logger.entries[0].entry.failure, 'INVALID_RESPONSE');
});

test('S5 마감 지난 PENDING은 읽을 때 FAILED가 되고, 그 뒤 작업은 아무것도 쓰지 않는다', async () => {
  const a = await chunkedA();
  const late = new Date(NOW.getTime() + 11 * 60_000);
  const search = createPublishedSearch({ dataSource: db, provider: recordingProvider(), logger: recordingLogger() });
  assert.equal(await search.getIndexState(a.publicationId, late), 'FAILED');
  assert.equal((await indexRow(db, a.publicationId)).status, 'FAILED');
  const provider = recordingProvider();
  const { run, logger } = handler(provider, () => late);
  await run(job(a.publicationId));
  assert.equal(provider.calls.length, 0);
  assert.equal(await embeddedCount(db, a.publicationId), 0);
  assert.equal((await indexRow(db, a.publicationId)).status, 'FAILED');
  assert.deepEqual(logger.entries.map((e) => [e.entry.event, e.entry.reason, e.entry.chunkCount]),
    [['EMBED_PUBLICATION_DISCARDED', 'NOT_PENDING', null]]);
});

test('S5 상태를 아무도 읽지 않았어도 처리기가 마감을 보고 FAILED로 저장한 뒤 버린다', async () => {
  const a = await chunkedA();
  const provider = recordingProvider();
  const { run, logger } = handler(provider, () => new Date(NOW.getTime() + 10 * 60_000));
  await run(job(a.publicationId));
  assert.equal(provider.calls.length, 0);
  assert.equal((await indexRow(db, a.publicationId)).status, 'FAILED');
  assert.equal(logger.entries[0].entry.reason, 'DEADLINE_PASSED');
  assert.deepEqual(Object.keys(logger.entries[0].entry).sort(), ['chunkCount', 'durationMs', 'event', 'publicationId', 'reason', 'result']);
});

test('S6 작업 전에 발행본이 지워졌으면 오류 없이 끝나고 아무것도 쓰지 않는다', async () => {
  const a = await chunkedA();
  await db.query('DELETE FROM publication WHERE publication_id = $1', [a.publicationId]);
  const provider = recordingProvider();
  const { run, logger } = handler(provider);
  await run(job(a.publicationId));
  assert.equal(provider.calls.length, 0);
  assert.equal(await indexRow(db, a.publicationId), null);
  assert.equal(logger.entries[0].entry.reason, 'NO_INDEX');
});

test('조각이 0개면 제공자를 부르지 않고 DONE', async () => {
  const b = await publicationB(db, undefined, '   ');
  await chunkPublication(db, writer(), b.publicationId, NOW);
  const provider = recordingProvider();
  const { run, logger } = handler(provider);
  await run(job(b.publicationId));
  assert.equal(provider.calls.length, 0);
  assert.equal((await indexRow(db, b.publicationId)).status, 'DONE');
  assert.deepEqual([logger.entries[0].entry.chunkCount, logger.entries[0].entry.batchCount, logger.entries[0].entry.totalTokens], [0, 0, 0]);
});

test('제공자 호출 중에 색인이 FAILED로 바뀌면 저장 때 다시 확인해 버리고 벡터를 쓰지 않는다', async () => {
  const a = await chunkedA();
  const provider = recordingProvider({ onCall: () => setIndex(db, a.publicationId, 'FAILED', new Date(NOW.getTime() + 600_000)) });
  const { run, logger } = handler(provider);
  await run(job(a.publicationId));
  assert.equal(await embeddedCount(db, a.publicationId), 0);
  assert.equal((await indexRow(db, a.publicationId)).status, 'FAILED');
  assert.equal(logger.entries[0].entry.reason, 'NOT_PENDING');
});

test('제공자 호출 중에 발행본이 지워지면 저장하지 않고 버린다(재시도 없음)', async () => {
  const a = await chunkedA();
  const provider = recordingProvider({ onCall: () => db.query('DELETE FROM publication WHERE publication_id = $1', [a.publicationId]) });
  const { run, logger } = handler(provider);
  await run(job(a.publicationId));
  assert.equal(provider.calls.length, 1);
  assert.equal(logger.entries[0].entry.reason, 'NO_INDEX');
});

test('제공자 실패 때 색인이 이미 PENDING이 아니면 FAILED로 덮지 않고 버림으로 남긴다', async () => {
  const a = await chunkedA();
  const provider = recordingProvider({ failAt: 1,
    onCall: () => setIndex(db, a.publicationId, 'DONE', new Date(NOW.getTime() + 600_000)) });
  const { run, logger } = handler(provider);
  await run(job(a.publicationId));
  assert.equal((await indexRow(db, a.publicationId)).status, 'DONE');
  assert.equal(logger.entries[0].entry.event, 'EMBED_PUBLICATION_DISCARDED');
});

test('예기치 못한 오류는 발행본 ID·오류 종류만 남기고 던지며 상태는 PENDING으로 둔다(마감 판정에 맡김)', async () => {
  const a = await chunkedA();
  const provider = { async embedDocuments() { throw new Error(`프로그램 오류 ${KEY_TEXT}`); }, async embedQuery() { throw new Error(); } };
  const { run, logger } = handler(provider);
  await assert.rejects(run(job(a.publicationId)), /프로그램 오류/);
  assert.equal((await indexRow(db, a.publicationId)).status, 'PENDING');
  assert.equal(logger.entries.length, 1);
  assert.equal(logger.entries[0].level, 'error');
  assert.deepEqual({ ...logger.entries[0].entry, durationMs: 0 },
    { event: 'EMBED_PUBLICATION_ERROR', publicationId: a.publicationId, failure: 'UNEXPECTED_ERROR', durationMs: 0 });
  assert.ok(!logger.text().includes(KEY_TEXT));
  await assert.rejects(run({ runKey: 'x', payload: {} }), TypeError);
});

test('어떤 사건에도 조각 글·키가 로그에 없다', async () => {
  const a = await chunkedA();
  const texts = await chunkTexts(a.publicationId);
  const logs = [];
  for (const provider of [recordingProvider(), recordingProvider({ failAt: 1 })]) {
    await setIndex(db, a.publicationId, 'PENDING', new Date(NOW.getTime() + 600_000));
    const { run, logger } = handler(provider);
    await run(job(a.publicationId));
    logs.push(logger.text());
  }
  for (const text of [...texts, KEY_TEXT]) assert.ok(logs.every((log) => !log.includes(text)));
});

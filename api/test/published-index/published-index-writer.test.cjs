// U3 색인 기록기(계약 C-08). 기능 설계 S1·S2·S7·S11을 테스트 DB에서 확인한다. AiRun은 기록용 가짜다.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { before, after, beforeEach, test } = require('node:test');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const { isValidRunKey } = require('../../dist/ai-run/ai-run-spec');
const { ChunkSourceError } = require('../../dist/published-index/chunker');
const { createPublishedIndexWriter } = require('../../dist/published-index/published-index-writer');
const {
  AI_DRAFT_MARKER, TITLE_MARKER, chunkPublication, fakeAiRun, indexRow, insertItem, insertMember, insertPublication,
  publicationA, publicationB, recordingLogger, setIndex,
} = require('./support.cjs');

let db;
before(async () => { db = await openTestDataSource(); });
after(async () => { await db?.destroy(); });
beforeEach(async () => { await resetTestDatabase(db); });

const NOW = new Date('2026-11-02T03:00:00.000Z');
const TEN_MINUTES = 10 * 60 * 1000;

function writer(options = {}) {
  const aiRun = fakeAiRun(options.enqueueResult);
  const logger = recordingLogger();
  return { writer: createPublishedIndexWriter({ dataSource: db, aiRun, logger }), aiRun, logger };
}
const chunks = (publicationId) => db.query(`SELECT seq, published_item_id, field_path, char_start, char_end, pdf_page, source_kind, text,
  catch_evidence_urls, embedding FROM published_chunk WHERE publication_id = $1 ORDER BY seq`, [publicationId]);

test('S1 발행 트랜잭션 안에서 발행본 A를 나누면 정한 조각·순서·위치·근거 URL과 PENDING 색인 행이 생긴다', async () => {
  const a = await publicationA(db);
  const { writer: w, aiRun, logger } = writer();
  await chunkPublication(db, w, a.publicationId, NOW);

  const rows = await chunks(a.publicationId);
  assert.deepEqual(rows.map((r) => [r.seq, r.field_path, r.source_kind]), [
    [1, 'workFacts[0]', 'GITHUB_RECORD'], [2, 'workFacts[1]', 'GITHUB_RECORD'], [3, 'subjectContribution', 'GITHUB_RECORD'],
    [4, 'evidence[0].representedFacts[0]', 'GITHUB_RECORD'], [5, 'evidence[0].representedFacts[1]', 'GITHUB_RECORD'],
    [6, 'authorDescription', 'AUTHOR_MATERIAL'],
    [7, 'body', 'AUTHOR_MATERIAL'], [8, 'body', 'AUTHOR_MATERIAL'], [9, 'body', 'AUTHOR_MATERIAL'],
  ]);
  assert.deepEqual(rows.slice(6).map((r) => [r.char_start, r.char_end]), [[0, 902], [904, 1804], [1806, 2506]]);
  for (const row of rows.slice(0, 6)) {
    assert.equal(row.published_item_id, a.catchItemId);
    assert.deepEqual(row.catch_evidence_urls, [a.catchSnapshot.evidence[0].sourceUrl]);
  }
  for (const row of rows.slice(6)) {
    assert.equal(row.published_item_id, a.textItemId);
    assert.deepEqual(row.catch_evidence_urls, []);
    assert.equal(row.text, a.body.slice(row.char_start, row.char_end));
  }
  assert.equal(rows[5].text, a.catchSnapshot.authorDescription);
  assert.ok(rows.every((r) => r.embedding === null && r.pdf_page === null && r.char_end - r.char_start <= 1000));
  const all = JSON.stringify(rows);
  assert.ok(!all.includes(AI_DRAFT_MARKER) && !all.includes(TITLE_MARKER), 'aiDraft·제목 글은 조각이 아니다');

  const index = await indexRow(db, a.publicationId);
  assert.equal(index.status, 'PENDING');
  assert.equal(index.deadline_at.getTime(), NOW.getTime() + TEN_MINUTES);
  assert.equal(index.updated_at.getTime(), NOW.getTime());
  assert.equal(aiRun.calls.length, 0, '발행 트랜잭션 안에서는 큐를 부르지 않는다');
  assert.deepEqual(logger.entries, []);
});

test('S1 조각이 0개인 발행본도 PENDING 색인 행을 만든다', async () => {
  const b = await publicationB(db, undefined, ' \n\n ');
  const { writer: w } = writer();
  await chunkPublication(db, w, b.publicationId, NOW);
  assert.deepEqual(await chunks(b.publicationId), []);
  assert.equal((await indexRow(db, b.publicationId)).status, 'PENDING');
});

test('S2 사본 모양이 C-07과 다른 항목이 있으면 예외가 나고, 되돌린 뒤 조각·색인 행이 하나도 남지 않는다', async () => {
  const a = await publicationA(db);
  await insertItem(db, a.publicationId, { position: 3, kind: 'CATCH', snapshot: { workFacts: '배열이 아님' } });
  const { writer: w } = writer();
  await assert.rejects(chunkPublication(db, w, a.publicationId, NOW), ChunkSourceError);
  assert.deepEqual(await chunks(a.publicationId), []);
  assert.equal(await indexRow(db, a.publicationId), null);
});

test('chunkInTransaction은 트랜잭션 밖 manager를 거부하고, 같은 발행본을 두 번 나누면 저장에서 실패한다', async () => {
  const a = await publicationA(db);
  const { writer: w } = writer();
  await assert.rejects(w.chunkInTransaction(db.manager, a.publicationId, NOW), /발행 트랜잭션/);
  assert.equal(await indexRow(db, a.publicationId), null);
  await chunkPublication(db, w, a.publicationId, NOW);
  await assert.rejects(chunkPublication(db, w, a.publicationId, NOW), { code: '23505' });
  assert.equal((await chunks(a.publicationId)).length, 9);
});

test('조각 표의 DB 제약: 다른 발행본의 항목을 가리키거나 1,000자를 넘는 범위는 거부한다(C-06 복합 외래 키)', async () => {
  const a = await publicationA(db);
  const b = await publicationB(db, a.memberId);
  const insert = (publicationId, publishedItemId, charEnd) => db.query(`INSERT INTO published_chunk
    (chunk_id, publication_id, published_item_id, seq, field_path, char_start, char_end, source_kind, text)
    VALUES ($1, $2, $3, 1, 'body', 0, $4, 'AUTHOR_MATERIAL', '합성')`, [randomUUID(), publicationId, publishedItemId, charEnd]);
  await assert.rejects(insert(a.publicationId, b.textItemId, 2), { code: '23503' });
  await assert.rejects(insert(a.publicationId, a.textItemId, 1001), { code: '23514' });
  await insert(a.publicationId, a.textItemId, 1000);
});

test('S7 FAILED와 마감 지난 PENDING만 REQUEUED(새 마감·새 runKey 등록 1회), PENDING·DONE·행 없음은 NOT_FAILED', async () => {
  const memberId = await insertMember(db);
  const { writer: w, aiRun, logger } = writer();
  const cases = {};
  for (const name of ['failed', 'pending', 'done', 'expired', 'missing']) {
    const publicationId = await insertPublication(db, memberId);
    if (name !== 'missing') await chunkPublication(db, w, publicationId, new Date(NOW.getTime() - TEN_MINUTES * 3));
    cases[name] = publicationId;
  }
  await setIndex(db, cases.failed, 'FAILED', new Date(NOW.getTime() - TEN_MINUTES));
  await setIndex(db, cases.pending, 'PENDING', new Date(NOW.getTime() + 60_000));
  await setIndex(db, cases.done, 'DONE', new Date(NOW.getTime() - TEN_MINUTES));
  await setIndex(db, cases.expired, 'PENDING', new Date(NOW.getTime() - 1));

  const results = {};
  for (const [name, publicationId] of Object.entries(cases)) results[name] = await w.requestReindex(publicationId, NOW);
  assert.deepEqual(results, { failed: 'REQUEUED', pending: 'NOT_FAILED', done: 'NOT_FAILED', expired: 'REQUEUED', missing: 'NOT_FAILED' });

  for (const name of ['failed', 'expired']) {
    const row = await indexRow(db, cases[name]);
    assert.equal(row.status, 'PENDING');
    assert.equal(row.deadline_at.getTime(), NOW.getTime() + TEN_MINUTES);
    assert.equal(row.updated_at.getTime(), NOW.getTime());
  }
  assert.equal((await indexRow(db, cases.done)).status, 'DONE');
  assert.equal((await indexRow(db, cases.pending)).status, 'PENDING');
  assert.equal(await indexRow(db, cases.missing), null, '행 없음은 행을 만들지 않는다');

  assert.deepEqual(aiRun.calls.map((c) => c.payload), [{ publicationId: cases.failed }, { publicationId: cases.expired }]);
  for (const call of aiRun.calls) {
    assert.equal(call.kind, 'EMBED_PUBLICATION');
    assert.match(call.runKey, new RegExp(`^EMBED_PUBLICATION-${call.payload.publicationId}-[0-9a-f-]{36}$`));
    assert.ok(isValidRunKey(call.runKey) && !call.runKey.includes(':'));
  }
  assert.notEqual(aiRun.calls[0].runKey, aiRun.calls[1].runKey);
  // 조각은 다시 나누지 않는다.
  assert.equal((await db.query('SELECT count(*)::int AS n FROM published_chunk WHERE publication_id = $1', [cases.failed]))[0].n, 0);
  assert.deepEqual(logger.entries.map((e) => [e.level, e.entry.result, e.entry.enqueueFailed]), [
    ['log', 'REQUEUED', false], ['log', 'NOT_FAILED', false], ['log', 'NOT_FAILED', false], ['log', 'REQUEUED', false], ['log', 'NOT_FAILED', false],
  ]);
  assert.deepEqual(Object.keys(logger.entries[0].entry).sort(), ['enqueueFailed', 'event', 'publicationId', 'result']);
});

test('S7 같은 FAILED 색인에 다시 준비를 두 번 부르면 두 번째는 NOT_FAILED이고 등록은 1회다', async () => {
  const a = await publicationA(db);
  const { writer: w, aiRun } = writer();
  await chunkPublication(db, w, a.publicationId, NOW);
  await setIndex(db, a.publicationId, 'FAILED', NOW);
  assert.equal(await w.requestReindex(a.publicationId, NOW), 'REQUEUED');
  assert.equal(await w.requestReindex(a.publicationId, NOW), 'NOT_FAILED');
  assert.equal(aiRun.calls.length, 1);
});

test('S7 작업 등록이 실패해도 REQUEUED를 돌려주고 경고 로그를 남긴다(상태는 시한으로 FAILED 확정)', async () => {
  const a = await publicationA(db);
  const { writer: w, aiRun, logger } = writer({ enqueueResult: 'ENQUEUE_FAILED' });
  await chunkPublication(db, w, a.publicationId, NOW);
  await setIndex(db, a.publicationId, 'FAILED', NOW);
  assert.equal(await w.requestReindex(a.publicationId, NOW), 'REQUEUED');
  assert.equal(aiRun.calls.length, 1);
  assert.equal((await indexRow(db, a.publicationId)).status, 'PENDING');
  assert.deepEqual(logger.entries, [{ level: 'warn',
    entry: { event: 'PUBLISHED_REINDEX', publicationId: a.publicationId, result: 'REQUEUED', enqueueFailed: true } }]);
});

test('S11 발행본을 지우면 그 발행본의 색인 행·조각이 함께 지워지고 다른 발행본은 남는다', async () => {
  const a = await publicationA(db);
  const b = await publicationB(db, a.memberId);
  const { writer: w } = writer();
  await chunkPublication(db, w, a.publicationId, NOW);
  await chunkPublication(db, w, b.publicationId, NOW);
  await db.query('DELETE FROM publication WHERE publication_id = $1', [a.publicationId]);
  assert.deepEqual(await chunks(a.publicationId), []);
  assert.equal(await indexRow(db, a.publicationId), null);
  assert.equal((await chunks(b.publicationId)).length, 1);
  assert.equal((await indexRow(db, b.publicationId)).status, 'PENDING');
  // 항목 하나를 지우면 그 항목의 조각만 지워진다.
  await db.query('DELETE FROM published_item WHERE published_item_id = $1', [b.textItemId]);
  assert.deepEqual(await chunks(b.publicationId), []);
});

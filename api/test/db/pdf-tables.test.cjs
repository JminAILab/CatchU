// U8 PDF 자료의 세 표(pdf_material·pdf_page_text·published_pdf_page, 계약 C-06·C-07, U8 기능 설계 entities.md).
// 실제 테스트 DB에서 연쇄 삭제·UNIQUE·CHECK(상태와 딸린 칸, readable = (text <> ''))가 지켜지는지 본다.
// 회원당 벌 수·파일 크기 상한·제목 길이 상한은 API 검증이라 보지 않는다. 파일 저장소·추출·발행 경로는 뒤 단계의 시험이다.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { before, after, beforeEach, test } = require('node:test');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');

let db;
before(async () => { db = await openTestDataSource(); });
after(async () => { await db?.destroy(); });
beforeEach(async () => { await resetTestDatabase(db); });

const CHECK_VIOLATION = { code: '23514' };
const UNIQUE_VIOLATION = { code: '23505' };
const TABLES = ['pdf_material', 'pdf_page_text', 'published_pdf_page'];

async function member() {
  const memberId = randomUUID();
  await db.query("INSERT INTO member_account VALUES ($1, $2, 'ACTIVE')", [memberId, 'fixture:' + memberId]);
  return memberId;
}
/** PDF 원본 행. 기본은 추출 대기(PENDING, 쪽 수·사유 없음). */
async function pdfMaterial(memberId, { title = '합성 PDF', fileSize = 1024, pageCount = null, state = 'PENDING', failureCode = null } = {}) {
  const pdfMaterialId = randomUUID();
  await db.query(`INSERT INTO pdf_material (pdf_material_id, member_id, title, storage_key, file_size_bytes, page_count, extraction_state,
    extraction_deadline_at, extraction_failure_code, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, now() + interval '10 minutes', $8, now(), now())`,
  [pdfMaterialId, memberId, title, `members/${memberId}/materials/${pdfMaterialId}.pdf`, fileSize, pageCount, state, failureCode]);
  return pdfMaterialId;
}
function pageText(pdfMaterialId, pageNumber, text, readable) {
  return db.query(`INSERT INTO pdf_page_text (pdf_page_text_id, pdf_material_id, page_number, text, readable) VALUES ($1, $2, $3, $4, $5)`,
    [randomUUID(), pdfMaterialId, pageNumber, text, readable]);
}
async function publication(memberId) {
  const publicationId = randomUUID();
  await db.query(`INSERT INTO publication (publication_id, member_id, title, link_token_reference, published_at, expires_at)
    VALUES ($1, $2, '합성 발행본', $3, now(), now() + interval '2160 hours')`, [publicationId, memberId, randomUUID()]);
  return publicationId;
}
/** 발행본에 고정한 PDF 항목(C-07 PDF_MATERIAL: snapshot { pageCount }, pdf_copy_key 필수). */
async function pdfItem(publicationId, sourceId, { position = 1, pageCount = 1 } = {}) {
  const publishedItemId = randomUUID();
  await db.query(`INSERT INTO published_item (published_item_id, publication_id, position, item_kind, source_id, title, snapshot, pdf_copy_key)
    VALUES ($1, $2, $3, 'PDF_MATERIAL', $4, '합성 PDF', $5, $6)`,
  [publishedItemId, publicationId, position, sourceId, JSON.stringify({ pageCount }), `members/m/publications/${publicationId}/${publishedItemId}.pdf`]);
  return publishedItemId;
}
function publishedPage(publishedItemId, pageNumber, text, readable) {
  return db.query(`INSERT INTO published_pdf_page (published_pdf_page_id, published_item_id, page_number, text, readable) VALUES ($1, $2, $3, $4, $5)`,
    [randomUUID(), publishedItemId, pageNumber, text, readable]);
}
async function count(table, where = 'true', params = []) {
  return (await db.query(`SELECT count(*)::int AS n FROM "${table}" WHERE ${where}`, params))[0].n;
}

test('PDF 자료는 제목 1자 이상·크기 양수·정한 추출 상태·정한 실패 사유만 받는다', async () => {
  const memberId = await member();
  await pdfMaterial(memberId);
  await assert.rejects(pdfMaterial(memberId, { title: '' }), CHECK_VIOLATION);
  await assert.rejects(pdfMaterial(memberId, { fileSize: 0 }), CHECK_VIOLATION);
  await assert.rejects(pdfMaterial(memberId, { state: 'RUNNING' }), CHECK_VIOLATION);
  await assert.rejects(pdfMaterial(memberId, { state: 'FAILED', failureCode: 'OTHER' }), CHECK_VIOLATION);
  // TEXT_LIMIT_EXCEEDED는 마이그레이션 1794289608328이 더한 사유다(팀장 결정 2026-11-10, #420 issuecomment-6759834176).
  await pdfMaterial(memberId, { state: 'FAILED', failureCode: 'TEXT_LIMIT_EXCEEDED' });
  assert.equal(await count('pdf_material'), 2);
});

test('추출 상태와 딸린 칸은 함께 있거나 함께 없다: DONE은 쪽 수, FAILED는 실패 사유', async () => {
  const memberId = await member();
  await pdfMaterial(memberId, { state: 'DONE', pageCount: 3 });
  await pdfMaterial(memberId, { state: 'FAILED', failureCode: 'DEADLINE_EXCEEDED' });
  await assert.rejects(pdfMaterial(memberId, { state: 'DONE' }), CHECK_VIOLATION, 'DONE인데 쪽 수 없음');
  await assert.rejects(pdfMaterial(memberId, { state: 'DONE', pageCount: 3, failureCode: 'ENCRYPTED' }), CHECK_VIOLATION, 'DONE인데 사유 있음');
  await assert.rejects(pdfMaterial(memberId, { state: 'FAILED' }), CHECK_VIOLATION, 'FAILED인데 사유 없음');
  await assert.rejects(pdfMaterial(memberId, { state: 'FAILED', failureCode: 'ENCRYPTED', pageCount: 1 }), CHECK_VIOLATION, 'FAILED인데 쪽 수 있음');
  await assert.rejects(pdfMaterial(memberId, { pageCount: 1 }), CHECK_VIOLATION, 'PENDING인데 쪽 수 있음');
  await assert.rejects(pdfMaterial(memberId, { failureCode: 'UNREADABLE_FILE' }), CHECK_VIOLATION, 'PENDING인데 사유 있음');
  assert.equal(await count('pdf_material'), 2);
});

test('추출이 끝난 PDF의 쪽 수는 1~50이다', async () => {
  const memberId = await member();
  await pdfMaterial(memberId, { state: 'DONE', pageCount: 1 });
  await pdfMaterial(memberId, { state: 'DONE', pageCount: 50 });
  await assert.rejects(pdfMaterial(memberId, { state: 'DONE', pageCount: 0 }), CHECK_VIOLATION);
  await assert.rejects(pdfMaterial(memberId, { state: 'DONE', pageCount: 51 }), CHECK_VIOLATION);
});

test('쪽별 글(pdf_page_text)은 readable과 글 유무가 맞아야 하고, 맞는 글은 가공 없이 저장된다', async () => {
  const pdfMaterialId = await pdfMaterial(await member(), { state: 'DONE', pageCount: 2 });
  const text = '  첫 줄\r\n\t둘째 줄  <b>마크업</b>  ';
  await pageText(pdfMaterialId, 1, text, true);
  await pageText(pdfMaterialId, 2, '', false);
  await assert.rejects(pageText(pdfMaterialId, 3, '글이 있는데 읽을 수 없음', false), CHECK_VIOLATION);
  await assert.rejects(pageText(pdfMaterialId, 4, '', true), CHECK_VIOLATION);
  assert.deepEqual(await db.query('SELECT page_number, text, readable FROM pdf_page_text WHERE pdf_material_id = $1 ORDER BY page_number', [pdfMaterialId]),
    [{ page_number: 1, text, readable: true }, { page_number: 2, text: '', readable: false }]);
});

test('쪽 사본(published_pdf_page)도 readable과 글 유무가 맞아야 한다(C-07에 더한 규칙, 원본 표와 같음)', async () => {
  const memberId = await member();
  const publishedItemId = await pdfItem(await publication(memberId), randomUUID(), { pageCount: 2 });
  const text = '사본 글 그대로\n둘째 줄';
  await publishedPage(publishedItemId, 1, text, true);
  await publishedPage(publishedItemId, 2, '', false);
  await assert.rejects(publishedPage(publishedItemId, 3, '글이 있는데 읽을 수 없음', false), CHECK_VIOLATION);
  await assert.rejects(publishedPage(publishedItemId, 4, '', true), CHECK_VIOLATION);
  assert.deepEqual(await db.query('SELECT page_number, text, readable FROM published_pdf_page WHERE published_item_id = $1 ORDER BY page_number', [publishedItemId]),
    [{ page_number: 1, text, readable: true }, { page_number: 2, text: '', readable: false }]);
});

test('같은 PDF 안의 쪽 번호는 유일하고 1 이상이다', async () => {
  const memberId = await member();
  const first = await pdfMaterial(memberId, { state: 'DONE', pageCount: 1 });
  const second = await pdfMaterial(memberId, { state: 'DONE', pageCount: 1 });
  await pageText(first, 1, '첫 PDF 1쪽', true);
  await pageText(second, 1, '둘째 PDF 1쪽', true); // 다른 PDF의 같은 쪽 번호는 된다
  await assert.rejects(pageText(first, 1, '중복 쪽', true), UNIQUE_VIOLATION);
  await assert.rejects(pageText(first, 0, '0쪽', true), CHECK_VIOLATION);
  assert.equal(await count('pdf_page_text'), 2);
});

test('같은 발행 항목 안의 쪽 사본 번호는 유일하고 1 이상이다', async () => {
  const publicationId = await publication(await member());
  const first = await pdfItem(publicationId, randomUUID(), { position: 1 });
  const second = await pdfItem(publicationId, randomUUID(), { position: 2 });
  await publishedPage(first, 1, '첫 항목 1쪽', true);
  await publishedPage(second, 1, '둘째 항목 1쪽', true);
  await assert.rejects(publishedPage(first, 1, '중복 쪽', true), UNIQUE_VIOLATION);
  await assert.rejects(publishedPage(first, 0, '0쪽', true), CHECK_VIOLATION);
  assert.equal(await count('published_pdf_page'), 2);
});

test('회원을 지우면 그 회원의 PDF 자료와 쪽별 글이 지워지고 다른 회원의 것은 남는다', async () => {
  const leaving = await member();
  const staying = await member();
  const leavingPdf = await pdfMaterial(leaving, { state: 'DONE', pageCount: 2 });
  const stayingPdf = await pdfMaterial(staying, { state: 'DONE', pageCount: 1 });
  await pageText(leavingPdf, 1, '떠나는 회원 1쪽', true);
  await pageText(leavingPdf, 2, '', false);
  await pageText(stayingPdf, 1, '남는 회원 1쪽', true);

  await db.query('DELETE FROM member_account WHERE member_id = $1', [leaving]);

  assert.deepEqual(await db.query('SELECT pdf_material_id FROM pdf_material'), [{ pdf_material_id: stayingPdf }]);
  assert.deepEqual(await db.query('SELECT pdf_material_id FROM pdf_page_text'), [{ pdf_material_id: stayingPdf }]);
});

test('PDF 자료를 지우면 그 쪽별 글만 지워지고, 그 자료를 원본으로 삼은 발행 사본은 남는다', async () => {
  const memberId = await member();
  const removed = await pdfMaterial(memberId, { state: 'DONE', pageCount: 1 });
  const kept = await pdfMaterial(memberId, { state: 'DONE', pageCount: 1 });
  await pageText(removed, 1, '지울 자료 1쪽', true);
  await pageText(kept, 1, '남을 자료 1쪽', true);
  // 발행 때 복사해 둔 사본. source_id는 외래 키가 없다(C-06 사본 칸 규칙).
  const publishedItemId = await pdfItem(await publication(memberId), removed);
  await publishedPage(publishedItemId, 1, '발행 당시 글', true);

  await db.query('DELETE FROM pdf_material WHERE pdf_material_id = $1', [removed]);

  assert.deepEqual(await db.query('SELECT pdf_material_id FROM pdf_page_text'), [{ pdf_material_id: kept }]);
  assert.deepEqual(await db.query('SELECT source_id, snapshot FROM published_item'), [{ source_id: removed, snapshot: { pageCount: 1 } }]);
  assert.deepEqual(await db.query('SELECT text, readable FROM published_pdf_page'), [{ text: '발행 당시 글', readable: true }]);
});

test('발행본을 지우면 그 PDF 항목의 쪽 사본이 지워지고, 원본과 다른 발행본의 사본은 남는다', async () => {
  const memberId = await member();
  const sourceId = await pdfMaterial(memberId, { state: 'DONE', pageCount: 1 });
  await pageText(sourceId, 1, '원본 1쪽', true);
  const removedPublication = await publication(memberId);
  const keptPublication = await publication(memberId);
  const removedItem = await pdfItem(removedPublication, sourceId);
  const keptItem = await pdfItem(keptPublication, sourceId);
  await publishedPage(removedItem, 1, '지울 발행본 사본', true);
  await publishedPage(keptItem, 1, '남을 발행본 사본', true);

  await db.query('DELETE FROM publication WHERE publication_id = $1', [removedPublication]);

  assert.deepEqual(await db.query('SELECT published_item_id FROM published_pdf_page'), [{ published_item_id: keptItem }]);
  assert.equal(await count('pdf_material', 'pdf_material_id = $1', [sourceId]), 1);
  assert.equal(await count('pdf_page_text', 'pdf_material_id = $1', [sourceId]), 1);
});

test('세 표의 외래 키는 모두 연쇄 삭제이고, 쪽 사본 표의 열은 계약 C-07 모양 그대로다', async () => {
  const foreignKeys = await db.query(`SELECT conrelid::regclass::text AS "table", confrelid::regclass::text AS parent, confdeltype AS action
    FROM pg_constraint WHERE contype = 'f' AND conrelid::regclass::text = ANY($1) ORDER BY 1`, [TABLES]);
  assert.deepEqual(foreignKeys, [
    { table: 'pdf_material', parent: 'member_account', action: 'c' },
    { table: 'pdf_page_text', parent: 'pdf_material', action: 'c' },
    { table: 'published_pdf_page', parent: 'published_item', action: 'c' },
  ]);
  const columns = await db.query(`SELECT column_name, data_type, is_nullable FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'published_pdf_page' ORDER BY ordinal_position`);
  assert.deepEqual(columns, [
    { column_name: 'published_pdf_page_id', data_type: 'uuid', is_nullable: 'NO' },
    { column_name: 'published_item_id', data_type: 'uuid', is_nullable: 'NO' },
    { column_name: 'page_number', data_type: 'integer', is_nullable: 'NO' },
    { column_name: 'text', data_type: 'text', is_nullable: 'NO' },
    { column_name: 'readable', data_type: 'boolean', is_nullable: 'NO' },
  ]);
});

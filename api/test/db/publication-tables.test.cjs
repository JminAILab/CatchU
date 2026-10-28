// U4 첫 경계 제출의 공유 표(계약 C-07 publication·published_item, C-13 text_material, C-14 catch_asset 작성자 설명).
// 소비 Unit(U3·U6)이 시험 자료를 넣을 때 계약의 DB 제약이 실제 테스트 DB에서 지켜지는지 본다. 길이·개수 상한은 API 검증이라 보지 않는다.
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

async function member() {
  const memberId = randomUUID();
  await db.query("INSERT INTO member_account VALUES ($1, $2, 'ACTIVE')", [memberId, 'fixture:' + memberId]);
  return memberId;
}
async function publication(memberId, { title = '합성 발행본', ttl = '2160 hours', stoppedAt = null } = {}) {
  const publicationId = randomUUID();
  await db.query(`INSERT INTO publication (publication_id, member_id, title, link_token_reference, published_at, expires_at, stopped_at)
    VALUES ($1, $2, $3, $4, now(), now() + $5::interval, $6)`, [publicationId, memberId, title, randomUUID(), ttl, stoppedAt]);
  return publicationId;
}
function item(publicationId, { position = 1, kind = 'TEXT_MATERIAL', pdfCopyKey = null } = {}) {
  return db.query(`INSERT INTO published_item (published_item_id, publication_id, position, item_kind, source_id, title, snapshot, pdf_copy_key)
    VALUES ($1, $2, $3, $4, $5, '합성 항목', '{"body":"합성"}', $6)`, [randomUUID(), publicationId, position, kind, randomUUID(), pdfCopyKey]);
}

test('발행본은 만료가 발행 + 90일이고, 중지는 발행 뒤이며, 제목이 비지 않아야 한다', async () => {
  const memberId = await member();
  await publication(memberId);
  await assert.rejects(publication(memberId, { ttl: '720 hours' }), CHECK_VIOLATION);
  await assert.rejects(publication(memberId, { stoppedAt: new Date('2000-01-01T00:00:00Z') }), CHECK_VIOLATION);
  await assert.rejects(publication(memberId, { title: '' }), CHECK_VIOLATION);
  const token = (await db.query('SELECT link_token_reference AS t FROM publication LIMIT 1'))[0].t;
  await assert.rejects(db.query(`INSERT INTO publication (publication_id, member_id, title, link_token_reference, published_at, expires_at)
    VALUES ($1, $2, '중복 토큰', $3, now(), now() + interval '2160 hours')`, [randomUUID(), memberId, token]), UNIQUE_VIOLATION);
});

test('발행 항목은 위치 1 이상·발행본 안 위치 유일·정한 종류만이고, PDF 사본 키는 PDF 항목에만 있다', async () => {
  const publicationId = await publication(await member());
  await item(publicationId, { position: 1, kind: 'CATCH' });
  await item(publicationId, { position: 2, kind: 'PDF_MATERIAL', pdfCopyKey: 'members/m/publications/p/i.pdf' });
  await assert.rejects(item(publicationId, { position: 1 }), UNIQUE_VIOLATION);
  await assert.rejects(item(publicationId, { position: 0 }), CHECK_VIOLATION);
  await assert.rejects(item(publicationId, { position: 3, kind: 'URL' }), CHECK_VIOLATION);
  await assert.rejects(item(publicationId, { position: 3, kind: 'PDF_MATERIAL' }), CHECK_VIOLATION);
  await assert.rejects(item(publicationId, { position: 3, kind: 'TEXT_MATERIAL', pdfCopyKey: 'x.pdf' }), CHECK_VIOLATION);
});

test('발행본을 지우면 그 항목만 지워지고 다른 발행본 항목은 남는다', async () => {
  const memberId = await member();
  const removed = await publication(memberId);
  const kept = await publication(memberId);
  await item(removed);
  await item(kept);
  await db.query('DELETE FROM publication WHERE publication_id = $1', [removed]);
  assert.deepEqual(await db.query('SELECT publication_id FROM published_item'), [{ publication_id: kept }]);
});

test('텍스트 자료는 제목이 비지 않아야 하고 본문은 그대로 저장된다', async () => {
  const memberId = await member();
  const body = '  첫 줄\r\n\r\n  https://example.com/portfolio  ';
  const [{ id }] = await db.query(`INSERT INTO text_material (text_material_id, member_id, title, body, created_at, updated_at)
    VALUES ($1, $2, '자료', $3, now(), now()) RETURNING text_material_id AS id`, [randomUUID(), memberId, body]);
  assert.equal((await db.query('SELECT body FROM text_material WHERE text_material_id = $1', [id]))[0].body, body);
  await assert.rejects(db.query(`INSERT INTO text_material (text_material_id, member_id, title, body, created_at, updated_at)
    VALUES ($1, $2, '', '본문', now(), now())`, [randomUUID(), memberId]), CHECK_VIOLATION);
});

test('Catch 작성자 설명과 저장 시각은 함께 있거나 함께 없다', async () => {
  const columns = await db.query(`SELECT column_name, data_type, is_nullable FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'catch_asset' AND column_name LIKE 'author_description%' ORDER BY column_name`);
  assert.deepEqual(columns, [
    { column_name: 'author_description', data_type: 'text', is_nullable: 'YES' },
    { column_name: 'author_description_updated_at', data_type: 'timestamp with time zone', is_nullable: 'YES' },
  ]);
  const [{ def }] = await db.query(`SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c
    WHERE c.conrelid = 'catch_asset'::regclass AND pg_get_constraintdef(c.oid) LIKE '%author_description%'`);
  assert.equal(def, 'CHECK (((author_description IS NULL) = (author_description_updated_at IS NULL)))');
});

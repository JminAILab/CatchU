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
function item(publicationId, { position = 1, kind = 'TEXT_MATERIAL', pdfCopyKey = null, presetOrdinal = 1, presetName = '합성 프리셋' } = {}) {
  return db.query(`INSERT INTO published_item (published_item_id, publication_id, position, item_kind, source_id, title, snapshot, pdf_copy_key,
      preset_ordinal, preset_name)
    VALUES ($1, $2, $3, $4, $5, '합성 항목', '{"body":"합성"}', $6, $7, $8)`,
  [randomUUID(), publicationId, position, kind, randomUUID(), pdfCopyKey, presetOrdinal, presetName]);
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

// 발행 프리셋 U1(계약 P-3·P-6, BR5.1, NFR2.14). 먼저 정한 시나리오·기대 결과·실패 조건(unit-test-instructions 「마이그레이션」·「삭제」):
// - 사본 항목의 프리셋 순번은 1~5이고 두 칸 모두 필수다. 실패 조건: 0·6·NULL이 저장됨.
// - 프리셋 항목은 원본 셋 가운데 정확히 하나, 자리 1~20, 프리셋 안 자리·같은 원본 유일이다. 실패 조건: 둘을 채운 항목·같은 Catch 두 번이 저장됨.
// - 마이그레이션 up은 변경 전 발행본을 모두 지우고(옛 링크는 열 수 없음) 칸 둘과 프리셋 표를 만들며, down은 칸 둘과 표 둘을 지운다.
//   실패 조건: 옛 발행본이 남음, down 뒤 칸·표가 남음, 엔티티와 마이그레이션 모양이 다름.
test('사본 항목의 프리셋 순번은 1~5이고 프리셋 칸 둘은 필수다', async () => {
  const publicationId = await publication(await member());
  await item(publicationId, { position: 1, presetOrdinal: 1 });
  await item(publicationId, { position: 2, presetOrdinal: 5 });
  await assert.rejects(item(publicationId, { position: 3, presetOrdinal: 0 }), CHECK_VIOLATION);
  await assert.rejects(item(publicationId, { position: 3, presetOrdinal: 6 }), CHECK_VIOLATION);
  await assert.rejects(item(publicationId, { position: 3, presetOrdinal: null }), { code: '23502' });
  await assert.rejects(item(publicationId, { position: 3, presetName: null }), { code: '23502' });
});

test('프리셋 항목은 원본 셋 가운데 하나만, 자리 1~20, 프리셋 안 자리·같은 원본이 유일이고, 다른 프리셋에는 같은 원본을 담을 수 있다', async () => {
  const memberId = await member();
  const material = randomUUID();
  const other = randomUUID();
  for (const id of [material, other]) {
    await db.query(`INSERT INTO text_material (text_material_id, member_id, title, body, created_at, updated_at) VALUES ($1, $2, '자료', '본문', now(), now())`,
      [id, memberId]);
  }
  const preset = async () => {
    const presetId = randomUUID();
    await db.query(`INSERT INTO preset (preset_id, member_id, name, created_at, updated_at) VALUES ($1, $2, '합성 프리셋', now(), now())`, [presetId, memberId]);
    return presetId;
  };
  const presetItem = (presetId, position, { textMaterialId = null, pdfMaterialId = null } = {}) => db.query(
    'INSERT INTO preset_item (preset_item_id, preset_id, position, text_material_id, pdf_material_id) VALUES ($1, $2, $3, $4, $5)',
    [randomUUID(), presetId, position, textMaterialId, pdfMaterialId]);
  const first = await preset();
  const second = await preset();
  await presetItem(first, 1, { textMaterialId: material });
  await presetItem(second, 1, { textMaterialId: material });
  await assert.rejects(presetItem(first, 2, { textMaterialId: material }), UNIQUE_VIOLATION);
  await assert.rejects(presetItem(first, 1, { textMaterialId: other }), UNIQUE_VIOLATION);
  await assert.rejects(presetItem(first, 2), CHECK_VIOLATION);
  await assert.rejects(presetItem(first, 0, { textMaterialId: other }), CHECK_VIOLATION);
  await assert.rejects(presetItem(first, 21, { textMaterialId: other }), CHECK_VIOLATION);
  await assert.rejects(db.query(`INSERT INTO preset (preset_id, member_id, name, created_at, updated_at) VALUES ($1, $2, '', now(), now())`,
    [randomUUID(), memberId]), CHECK_VIOLATION);
  // 원본을 지우면 담긴 프리셋에서 그 항목만 빠지고 프리셋은 남는다(BR6.1). 남은 자리는 다시 매기지 않는다.
  await presetItem(first, 3, { textMaterialId: other });
  await db.query('DELETE FROM text_material WHERE text_material_id = $1', [material]);
  assert.deepEqual(await db.query('SELECT preset_id, position FROM preset_item ORDER BY preset_id, position'), [{ preset_id: first, position: 3 }]);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM preset'))[0].n, 2);
});

test('마이그레이션 up은 변경 전 발행본을 모두 지우고 칸 둘·프리셋 표를 만들며, down은 칸 둘과 표 둘을 지운다(NFR2.14)', async () => {
  const { AddPublicationPresets1795140270696 } = require('../../dist/database/migrations/1795140270696-AddPublicationPresets');
  const { DbPublicationAccess } = require('../../dist/publications/db-publication-access');
  const { LinkUnavailable } = require('../../dist/publications/publication-access');
  const migration = new AddPublicationPresets1795140270696();
  const memberId = await member();
  // 공용 시험 DB를 바꾸지 않도록 한 트랜잭션 안에서 내리고 올린 뒤 되돌린다(PostgreSQL DDL은 트랜잭션 안에서 되돌려진다).
  const runner = db.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    const columns = async () => (await runner.query(`SELECT column_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'published_item' AND column_name LIKE 'preset_%' ORDER BY column_name`))
      .map((row) => row.column_name);
    const tables = async () => (await runner.query(`SELECT tablename FROM pg_tables
      WHERE schemaname = current_schema() AND tablename IN ('preset', 'preset_item') ORDER BY tablename`)).map((row) => row.tablename);
    assert.deepEqual(await columns(), ['preset_name', 'preset_ordinal']);
    assert.deepEqual(await tables(), ['preset', 'preset_item']);

    await migration.down(runner);
    assert.deepEqual(await columns(), []);
    assert.deepEqual(await tables(), []);
    // 변경 전 모양의 발행본(프리셋 칸 없음)과 그 항목.
    const publicationId = randomUUID();
    const token = 'x'.repeat(43);
    await runner.query(`INSERT INTO publication (publication_id, member_id, title, link_token_reference, published_at, expires_at)
      VALUES ($1, $2, '변경 전 발행본', $3, now(), now() + interval '2160 hours')`, [publicationId, memberId, token]);
    await runner.query(`INSERT INTO published_item (published_item_id, publication_id, position, item_kind, source_id, title, snapshot)
      VALUES ($1, $2, 1, 'TEXT_MATERIAL', $3, '자료', '{"body":"본문"}')`, [randomUUID(), publicationId, randomUUID()]);

    await migration.up(runner);
    assert.deepEqual(await runner.query('SELECT 1 FROM publication'), [], '변경 전 발행본은 지워진다');
    assert.deepEqual(await runner.query('SELECT 1 FROM published_item'), []);
    assert.deepEqual(await columns(), ['preset_name', 'preset_ordinal']);
    assert.deepEqual(await tables(), ['preset', 'preset_item']);
    // 옛 링크는 지금의 접근 불가(받은 사람 404 LINK_UNAVAILABLE)가 된다.
    const access = new DbPublicationAccess(db, Buffer.alloc(32), null, () => new Date());
    await assert.rejects(access.resolveForRecipientIn(runner.manager, token, null, new Date()), LinkUnavailable);
  } finally {
    await runner.rollbackTransaction();
    await runner.release();
  }
  // 엔티티와 적용된 마이그레이션이 같은 모양이다(생성할 차이가 없다).
  assert.deepEqual((await db.driver.createSchemaBuilder().log()).upQueries.map((query) => query.query), []);
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

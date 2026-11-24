// 발행 프리셋 U1 — 프리셋 ID로 발행(POST /v1/publications, 계약 P-2·P-3, 기능 명세 W4, 규칙 BR3.1~BR3.8, NFR2.4·NFR2.13·NFR6.4,
// 기능 설계 검토 R-05·R-06, NFR 설계 검토 R-03).
//
// 먼저 정한 시나리오·기대 결과·실패 조건(unit-test-instructions 「시나리오」의 발행 묶음, team.md Testing Posture). 세부 시험 코드는 구현 뒤 쓴다.
// - P1(2개)·P2(3개) 발행: position 1~5가 고른 프리셋 순서·프리셋 안 순서이고 preset_ordinal 1·1·2·2·2, preset_name은 읽은 이름의 복사다.
//   발행 뒤 프리셋을 고치거나 지워도 발행본은 그대로다(BR3.8). 실패 조건: 순서가 섞임, 프리셋 이름이 바뀌면 사본도 바뀜.
// - 남의 프리셋·없는 프리셋: 404이고 발행본·PDF 사본이 없다(NFR2.4). 동의가 없으면 펴기 전에 403이다(R-03).
// - 빈 프리셋: 400 presetIds[i] emptyPreset. 편 항목 20개는 발행, 21개는 400 presetIds maxItems.
// - 같은 Catch·같은 PDF가 두 프리셋: 사본 항목·PDF 사본 파일·쪽 사본이 프리셋마다 따로 생기고, 전체 글은 두 번 센다(PDF 포함, R-05).
//   실패 조건: 사본이 하나만 생김, PDF를 한 번만 셈.
// - 막힘 넷(미확인·보호·비공개·추출 미완료): 이유 하나와 details.blockedSources(그 자료가 든 프리셋마다 한 줄)만, catchIds 없음.
//   비공개 Catch는 공개로 바뀌지 않는다(BR3.6). 실패 조건: 한 프리셋만 알림, 공개 전환.
// - 프리셋을 읽은 뒤 발행 도중 프리셋이 바뀌어도 읽은 내용으로 발행한다(BR3.2, 기능 설계 Q3).
//
// 실제 AppModule·테스트 DB·개발 로그인 합성 회원을 쓴다. FileStorage·U2 AiRun·U3 PublishedIndexWriter는 계약 모양 가짜다(합성 연결).
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { after, before, beforeEach, test } = require('node:test');
const { AppModule } = require('../../dist/app.module');
const { materialKey } = require('../../dist/file-storage/file-storage');
const { PublishService } = require('../../dist/publications/publish.service');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const {
  PUBLISH_SETTINGS, setEnv, startApp, expectError, eligibleCatch, insertTextMaterial, consent, fakeAiRun, fakeIndexWriter, bindFakes, body,
  catchItem, textItem, insertPreset,
} = require('./support.cjs');

let server, db, restore, aiRun, writer, unbind, files, savedFiles;
before(async () => {
  restore = setEnv(PUBLISH_SETTINGS);
  server = await startApp(AppModule);
  db = await openTestDataSource();
  savedFiles = server.app.get(PublishService).files;
});
after(async () => {
  if (server) server.app.get(PublishService).files = savedFiles;
  await server?.app.close();
  await db?.destroy();
  restore?.();
});
beforeEach(async () => {
  await resetTestDatabase(db);
  server.logs.length = 0;
  unbind?.();
  aiRun = fakeAiRun(db);
  writer = fakeIndexWriter(db);
  unbind = bindFakes(server.app, { aiRun, indexWriter: writer });
  files = { calls: [], afterCopy: null,
    async copy(from, to) { this.calls.push(['copy', from, to]); if (this.afterCopy) await this.afterCopy(); },
    async deletePrefix(prefix) { this.calls.push(['deletePrefix', prefix]); } };
  server.app.get(PublishService).files = files;
});

const publish = (token, payload) => server.call('POST', '/publications', { token, body: payload });
const pdfItem = (sourceId) => ({ kind: 'PDF_MATERIAL', sourceId });
async function author() {
  const member = await server.login(`preset-author-${randomUUID()}`);
  await consent(server.app, member.memberId);
  return member;
}
const publications = () => db.query('SELECT publication_id FROM publication');
const items = (publicationId) => db.query(`SELECT published_item_id, position, item_kind, source_id, title, snapshot, pdf_copy_key, preset_ordinal,
  preset_name FROM published_item WHERE publication_id = $1 ORDER BY position`, [publicationId]);
const visibility = async (catchId) => (await db.query('SELECT visibility FROM catch_asset WHERE catch_id = $1', [catchId]))[0].visibility;

async function insertPdf(memberId, pages = ['[합성] 1쪽'], { state = 'DONE', title = '[합성] PDF' } = {}) {
  const id = randomUUID();
  const done = state === 'DONE';
  await db.query(`INSERT INTO pdf_material (pdf_material_id, member_id, title, storage_key, file_size_bytes, page_count, extraction_state,
    extraction_deadline_at, extraction_failure_code, created_at, updated_at)
    VALUES ($1, $2, $3, $4, 2048, $5, $6, now() + interval '10 minutes', NULL, now(), now())`,
  [id, memberId, title, materialKey(memberId, id), done ? pages.length : null, state]);
  if (done) {
    for (const [index, text] of pages.entries()) {
      await db.query('INSERT INTO pdf_page_text (pdf_page_text_id, pdf_material_id, page_number, text, readable) VALUES ($1, $2, $3, $4, $5)',
        [randomUUID(), id, index + 1, text, text !== '']);
    }
  }
  return id;
}

test('P1(2개)·P2(3개)는 고른 순서·프리셋 안 순서로 position 1~5와 프리셋 순번·이름을 복사하고, 발행 뒤 프리셋을 고쳐도 사본은 그대로다', async () => {
  const a = await author();
  const [c1, c2] = [await eligibleCatch(db, a.memberId, { title: '[합성] 하나' }), await eligibleCatch(db, a.memberId, { title: '[합성] 둘' },
    { repositoryId: 'presets-repo-2' })];
  const [t1, t2, t3] = await Promise.all([1, 2, 3].map((n) => insertTextMaterial(db, a.memberId, { title: `[합성] 자료 ${n}` })));
  const p1 = await insertPreset(db, a.memberId, [textItem(t1), catchItem(c1)], { name: '백엔드' });
  const p2 = await insertPreset(db, a.memberId, [catchItem(c2), textItem(t2), textItem(t3)], { name: '협업' });
  const response = await publish(a.token, body([p2.toUpperCase(), p1]));
  assert.equal(response.status, 201, response.text);
  const rows = await items(response.body.publicationId);
  assert.deepEqual(rows.map((row) => [row.position, row.source_id, row.preset_ordinal, row.preset_name]), [
    [1, c2, 1, '협업'], [2, t2, 1, '협업'], [3, t3, 1, '협업'], [4, t1, 2, '백엔드'], [5, c1, 2, '백엔드']]);

  await db.query("UPDATE preset SET name = '고친 이름' WHERE preset_id = $1", [p2]);
  await db.query('DELETE FROM preset WHERE preset_id = $1', [p1]);
  const detail = await server.call('GET', `/publications/${response.body.publicationId}`, { token: a.token });
  assert.deepEqual(detail.body.snapshot.items.map((item) => [item.position, item.presetOrdinal, item.presetName]),
    [[1, 1, '협업'], [2, 1, '협업'], [3, 1, '협업'], [4, 2, '백엔드'], [5, 2, '백엔드']], '사본은 프리셋을 가리키지 않는다(BR3.8)');
});

test('남의 프리셋·없는 프리셋은 404이고 발행본·PDF 사본이 생기지 않는다. 동의가 없으면 프리셋을 펴기 전에 403이다(NFR2.4, R-03)', async () => {
  const a = await author();
  const b = await author();
  const bPdf = await insertPdf(b.memberId);
  const bPreset = await insertPreset(db, b.memberId, [pdfItem(bPdf)]);
  const own = await insertPreset(db, a.memberId, [textItem(await insertTextMaterial(db, a.memberId))]);
  for (const presetIds of [[bPreset], [own, bPreset], [randomUUID()]]) {
    expectError(await publish(a.token, body(presetIds)), 404, 'RESOURCE_UNAVAILABLE');
  }
  assert.deepEqual(files.calls, [], 'PDF 복사 전에 끝난다');
  assert.deepEqual(await publications(), []);
  const noConsent = await server.login(`preset-noconsent-${randomUUID()}`);
  expectError(await publish(noConsent.token, body([randomUUID()])), 403, 'AI_CONSENT_REQUIRED');
});

test('항목이 0개인 프리셋은 400 presetIds[i] emptyPreset이고, 편 항목 20개는 발행하며 21개는 400 presetIds maxItems다(BR3.3·BR3.4)', async () => {
  const a = await author();
  const texts = [];
  for (let index = 0; index < 21; index += 1) texts.push(textItem(await insertTextMaterial(db, a.memberId, { body: 'x' })));
  const empty = await insertPreset(db, a.memberId, []);
  const twelve = await insertPreset(db, a.memberId, texts.slice(0, 12));
  const eight = await insertPreset(db, a.memberId, texts.slice(12, 20));
  const nine = await insertPreset(db, a.memberId, texts.slice(12, 21));
  const alsoEmpty = await insertPreset(db, a.memberId, []);
  const rejected = await publish(a.token, body([twelve, empty, eight, alsoEmpty]));
  expectError(rejected, 400, 'VALIDATION_FAILED');
  assert.deepEqual(rejected.body.details, { violations: [{ field: 'presetIds[1]', reason: 'emptyPreset' }, { field: 'presetIds[3]', reason: 'emptyPreset' }] });
  const over = await publish(a.token, body([twelve, nine]));
  expectError(over, 400, 'VALIDATION_FAILED');
  assert.deepEqual(over.body.details, { violations: [{ field: 'presetIds', reason: 'maxItems' }] });
  assert.deepEqual(await publications(), []);
  const exact = await publish(a.token, body([twelve, eight]));
  assert.equal(exact.status, 201, exact.text);
  assert.equal((await items(exact.body.publicationId)).length, 20);
});

test('같은 Catch·같은 PDF가 두 프리셋에 있으면 사본 항목·PDF 사본 파일·쪽 사본이 프리셋마다 따로 생긴다(BR3.7)', async () => {
  const a = await author();
  const catchId = await eligibleCatch(db, a.memberId, { title: '[합성] 겹친 Catch' });
  const pdf = await insertPdf(a.memberId, ['[합성] 가', '']);
  const first = await insertPreset(db, a.memberId, [catchItem(catchId), pdfItem(pdf)], { name: '첫째' });
  const second = await insertPreset(db, a.memberId, [pdfItem(pdf), catchItem(catchId)], { name: '둘째' });
  const response = await publish(a.token, body([first, second]));
  assert.equal(response.status, 201, response.text);
  const rows = await items(response.body.publicationId);
  assert.deepEqual(rows.map((row) => [row.position, row.item_kind, row.source_id, row.preset_name]), [
    [1, 'CATCH', catchId, '첫째'], [2, 'PDF_MATERIAL', pdf, '첫째'], [3, 'PDF_MATERIAL', pdf, '둘째'], [4, 'CATCH', catchId, '둘째']]);
  assert.deepEqual(rows[0].snapshot, rows[3].snapshot, '같은 원본의 사본은 같은 내용이다');
  assert.notEqual(rows[1].pdf_copy_key, rows[2].pdf_copy_key);
  assert.deepEqual(files.calls.map(([op, from, to]) => [op, from, to]), [
    ['copy', materialKey(a.memberId, pdf), rows[1].pdf_copy_key], ['copy', materialKey(a.memberId, pdf), rows[2].pdf_copy_key]], 'PDF 사본 두 벌');
  for (const row of [rows[1], rows[2]]) {
    assert.equal((await db.query('SELECT count(*)::int AS n FROM published_pdf_page WHERE published_item_id = $1', [row.published_item_id]))[0].n, 2);
  }
});

test('전체 글은 편 항목마다 더해 같은 PDF·텍스트가 두 프리셋에 있으면 두 번 센다: 60,000자는 발행, 60,001자는 400 presetIds maxTotalLength(R-05)', async () => {
  const a = await author();
  const pdf = await insertPdf(a.memberId, ['가'.repeat(29_999), '', '😀']);
  const exactPreset = await insertPreset(db, a.memberId, [pdfItem(pdf)]);
  const again = await insertPreset(db, a.memberId, [pdfItem(pdf)]);
  const ok = await publish(a.token, body([exactPreset, again]));
  assert.equal(ok.status, 201, ok.text);
  const one = await insertTextMaterial(db, a.memberId, { body: 'z' });
  const withText = await insertPreset(db, a.memberId, [pdfItem(pdf), textItem(one)]);
  files.calls.length = 0;
  const over = await publish(a.token, body([withText, again]));
  expectError(over, 400, 'VALIDATION_FAILED');
  assert.deepEqual(over.body.details, { violations: [{ field: 'presetIds', reason: 'maxTotalLength' }] });
  assert.deepEqual(files.calls.map(([op]) => op), ['copy', 'copy', 'deletePrefix'], '거부 때도 복사한 사본을 정리한다');
  assert.equal((await publications()).length, 1);
});

test('막힘 넷은 이유 하나와 그 자료가 든 프리셋마다 blockedSources 한 줄만 싣고 catchIds가 없으며, 비공개 Catch는 공개로 바뀌지 않는다(BR3.5·BR3.6)', async () => {
  const a = await author();
  const unconfirmed = await eligibleCatch(db, a.memberId, { confirmed: false }, { repositoryId: 'blocked-unconfirmed' });
  const restricted = await eligibleCatch(db, a.memberId, {}, { repositoryId: 'blocked-private', protection: 'SOURCE_PRIVATE' });
  const hidden = await eligibleCatch(db, a.memberId, { visibility: 'PRIVATE' }, { repositoryId: 'blocked-hidden' });
  const pending = await insertPdf(a.memberId, [], { state: 'PENDING' });
  const text = await insertTextMaterial(db, a.memberId);
  const line = (presetId, kind, sourceId) => ({ presetId, kind, sourceId });
  const cases = [
    [catchItem(unconfirmed), 409, 'CONFIRMATION_REQUIRED'],
    [catchItem(restricted), 409, 'SOURCE_RESTRICTED'],
    [catchItem(hidden), 409, 'CATCH_PRIVATE'],
    [pdfItem(pending), 400, 'VALIDATION_FAILED'],
  ];
  for (const [ref, status, code] of cases) {
    const first = await insertPreset(db, a.memberId, [textItem(text), ref]);
    const second = await insertPreset(db, a.memberId, [ref]);
    const response = await publish(a.token, body([first, second]));
    expectError(response, status, code);
    const blockedSources = [line(first, ref.kind, ref.sourceId), line(second, ref.kind, ref.sourceId)];
    const expected = code === 'VALIDATION_FAILED'
      ? { violations: [{ field: 'presetIds', reason: 'extractionIncomplete' }], blockedSources } : { blockedSources };
    assert.deepEqual(response.body.details, expected, code);
  }
  assert.deepEqual(await publications(), []);
  assert.equal(await visibility(hidden), 'PRIVATE', '공개 전환 쓰기가 없다');
  assert.deepEqual(files.calls, [], '추출 미완료는 복사 전에 막힌다');
});

test('프리셋을 읽은 뒤 발행 도중 프리셋 이름·항목이 바뀌어도 읽은 때의 내용으로 발행한다(BR3.2, 기능 설계 Q3)', async () => {
  const a = await author();
  const pdf = await insertPdf(a.memberId);
  const text = await insertTextMaterial(db, a.memberId);
  const presetId = await insertPreset(db, a.memberId, [pdfItem(pdf), textItem(text)], { name: '읽은 이름' });
  // PDF 복사는 프리셋을 편 뒤·발행 트랜잭션 전에 일어난다. 그 틈에 같은 회원이 프리셋을 고친 경우다.
  files.afterCopy = async () => {
    await db.query("UPDATE preset SET name = '바뀐 이름' WHERE preset_id = $1", [presetId]);
    await db.query('DELETE FROM preset_item WHERE preset_id = $1 AND text_material_id = $2', [presetId, text]);
  };
  const response = await publish(a.token, body([presetId]));
  assert.equal(response.status, 201, response.text);
  assert.deepEqual((await items(response.body.publicationId)).map((row) => [row.source_id, row.preset_name]), [[pdf, '읽은 이름'], [text, '읽은 이름']]);
});

// U8 Step 8 — 발행의 PDF 부분(POST /v1/publications, U8 기능 명세 W3, 계약 C-17, BR4.1~BR4.5·BR5.1~BR5.6) 시험.
//
// 먼저 정한 시나리오·기대 결과·실패 조건(U8 test-scenarios.md §6 P-a~P-g, 계획 8.3, team.md Testing Posture). 세부 시험 코드는 구현 뒤 쓴다.
// P-a PDF 없는 발행 — 기대: 201, FileStorage 호출 0회(BR5.6). 실패 조건: 저장소가 불림.
// P-b 복사 실패 — 기대: 500 INTERNAL_ERROR, DB 행 없음, deletePrefix 1회(BR5.3). 실패 조건: DB 행 생김.
// P-c 복사 뒤 하루 한도 429 — 기대: deletePrefix 1회, 429 그대로, DB 없음(BR5.4). 실패 조건: 오류 코드 변경.
// P-d chunk 예외 — 기대: 500, 정리 1회(BR5.4).
// P-e 정리 실패 — 기대: 응답 코드 유지, `PREFIX_CLEANUP_FAILED` 로그(단계 번호, 접두어·키 값 없음)(BR5.5).
// P-f PENDING/FAILED/시한 지난 PDF — 기대: 400 VALIDATION_FAILED extractionIncomplete(항목 위치), 복사 없음(BR4.1). 남의 것·없는 것은 404.
// P-g 정상 — 기대: published_pdf_page 행 = pdf_page_text 행(읽을 수 없는 쪽 포함), pdf_copy_key = publishedPdfKey, snapshot { pageCount },
//     이후 원본 쪽 변경·삭제에도 사본 불변(BR4.3·BR4.4).
// P-h 잠금·재확인 — 기대: 발행 도중(복사 뒤·트랜잭션 전) 원본이 지워지면 404, DONE이 아니게 되면 400 extractionIncomplete, 둘 다 정리 1회·DB 무변경.
//     트랜잭션 동안 PDF 행은 FOR SHARE로 잠겨 밖에서 지울 수 없다(BR4.2). 잠금 순서(Catch → 텍스트 자료 → PDF)는 코드 검토로 본다.
// 보완(2026-11-10 완료 점검): 쪽 사본 수 ≠ 쪽 수면 500·정리(BR4.3), 복사 실패 종류 둘(BR5.3), 동의 없음은 사전 확인·복사 전에 403,
//     Catch 자격 거부(409)도 PDF와 함께면 원래 오류 그대로·정리 1회(BR5.4), 조각 나누기 시점에 쪽 사본이 이미 들어 있다(W3 6).
// 전체 글(팀장 결정 2026-11-10, https://github.com/JminAILab/CatchU/issues/420#issuecomment-6759834176, OQ-U4-4 종결):
//   PDF 쪽 글(코드 포인트, 읽을 수 없는 쪽 0자)을 발행본 전체 60,000자 합계에 넣는다. 정확히 60,000자는 201, 60,001자는 400 maxTotalLength.
//   PDF 각각이 상한 안이어도 여러 PDF·Catch·텍스트와 합쳐 넘으면 거부하고, 거부 때도 복사한 사본은 정리한다(트랜잭션 실패 = 5단계).
//
// 실제 AppModule·테스트 DB·개발 로그인 합성 회원을 쓴다. FileStorage·U2 AiRun·U3 PublishedIndexWriter는 계약 모양 가짜로 바꿔 결과를 고른다
// (합성 연결이며 실제 S3 복사 성공이 아니다). PDF 행·쪽 글은 DB에 직접 넣는다(업로드·추출을 거치지 않음). 쪽 글은 모두 합성 문자열이다.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { after, before, beforeEach, test } = require('node:test');
const { AppModule } = require('../../dist/app.module');
const { DAILY_RUN_LIMIT, koreanUsageDate } = require('../../dist/daily-run-limit/daily-run-limit');
const { SNAPSHOT_TEXT_TOTAL_MAX } = require('../../dist/publications/publications-config');
const { PublishService } = require('../../dist/publications/publish.service');
const { PDF_TEXT_TOTAL_MAX } = require('../../dist/pdf-extraction/pdf-extraction-spec');
const { materialKey, publicationPrefix, publishedPdfKey } = require('../../dist/file-storage/file-storage');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const {
  PUBLISH_SETTINGS, setEnv, startApp, expectError, eligibleCatch, insertTextMaterial, consent, fakeAiRun, fakeIndexWriter, bindFakes, body,
  catchItem, textItem,
} = require('./support.cjs');

let server, db, restore, aiRun, writer, files, unbind, savedFiles;
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
  files = fakeFiles();
  server.app.get(PublishService).files = files;
});

/** C-05 모양의 기록용 FileStorage. copy·deletePrefix만 발행이 부른다. */
function fakeFiles() {
  return {
    calls: [],
    failCopyAt: null,
    failCopyName: 'StorageUnavailable',
    failDelete: false,
    /** 복사가 끝난 직후(트랜잭션 시작 전)에 끼워 넣을 동작. 발행 도중의 원본 변화를 흉내 낸다. */
    afterCopy: null,
    async copy(from, to) {
      this.calls.push(['copy', from, to]);
      if (this.failCopyAt !== null && this.calls.filter(([op]) => op === 'copy').length === this.failCopyAt) {
        throw Object.assign(new Error('synthetic storage failure'), { name: this.failCopyName });
      }
      if (this.afterCopy) await this.afterCopy();
    },
    async deletePrefix(prefix) {
      this.calls.push(['deletePrefix', prefix]);
      if (this.failDelete) throw Object.assign(new Error('synthetic cleanup failure'), { name: 'StorageUnavailable' });
    },
    async put() { throw new Error('발행은 put을 부르지 않는다'); },
    async get() { throw new Error('발행은 get을 부르지 않는다'); },
    async delete() { throw new Error('발행은 delete를 부르지 않는다'); },
  };
}
const ops = () => files.calls.map(([op]) => op);

const publish = (token, payload) => server.call('POST', '/publications', { token, body: payload });
const pdfItem = (sourceId) => ({ kind: 'PDF_MATERIAL', sourceId });
async function author() {
  const member = await server.login(`u8-author-${randomUUID()}`);
  await consent(server.app, member.memberId);
  return member;
}
const publications = () => db.query('SELECT publication_id FROM publication');
const items = (publicationId) => db.query(
  'SELECT published_item_id, position, item_kind, source_id, title, snapshot, pdf_copy_key FROM published_item WHERE publication_id = $1 ORDER BY position',
  [publicationId]);
const copiedPages = (publishedItemId) => db.query(
  'SELECT page_number, text, readable FROM published_pdf_page WHERE published_item_id = $1 ORDER BY page_number', [publishedItemId]);
const pdfLogs = () => server.logs.filter((log) => log.args.at(-1) === 'PdfPublish').map((log) => ({ level: log.level, entry: log.args[0] }));

/** PDF 자료 행과 쪽 글을 직접 넣는다. pages는 쪽 글 배열('' = 읽을 수 없는 쪽). state가 DONE이 아니면 쪽을 넣지 않는다. */
async function insertPdf(memberId, pages = ['[합성] 1쪽 글'], { state = 'DONE', deadlineSeconds = 600, title = '[합성] PDF' } = {}) {
  const id = randomUUID();
  const done = state === 'DONE';
  await db.query(`INSERT INTO pdf_material (pdf_material_id, member_id, title, storage_key, file_size_bytes, page_count, extraction_state,
    extraction_deadline_at, extraction_failure_code, created_at, updated_at)
    VALUES ($1, $2, $3, $4, 2048, $5, $6, clock_timestamp() + make_interval(secs => $7), $8, clock_timestamp(), clock_timestamp())`,
  [id, memberId, title, materialKey(memberId, id), done ? pages.length : null, state, deadlineSeconds, state === 'FAILED' ? 'UNREADABLE_FILE' : null]);
  if (done) {
    for (const [index, text] of pages.entries()) {
      await db.query('INSERT INTO pdf_page_text (pdf_page_text_id, pdf_material_id, page_number, text, readable) VALUES ($1, $2, $3, $4, $5)',
        [randomUUID(), id, index + 1, text, text !== '']);
    }
  }
  return id;
}

test('상수: api의 PDF 쪽 글 상한과 발행본 전체 글 상한은 같은 값(60,000)이다(의존 방향 때문에 따로 둔 값)', () => {
  assert.equal(PDF_TEXT_TOTAL_MAX, SNAPSHOT_TEXT_TOTAL_MAX);
  assert.equal(SNAPSHOT_TEXT_TOTAL_MAX, 60_000);
});

test('P-a: PDF 없는 발행은 201이고 FileStorage를 한 번도 부르지 않는다', async () => {
  const a = await author();
  const materialId = await insertTextMaterial(db, a.memberId);
  const response = await publish(a.token, body([textItem(materialId)]));
  assert.equal(response.status, 201, response.text);
  assert.deepEqual(files.calls, []);
});

test('P-g: PDF 발행은 position 순 복사 → 사본 항목(pdf_copy_key·pageCount)·쪽 사본(읽을 수 없는 쪽 포함)을 만들고 원본 변경·삭제에 영향받지 않는다', async () => {
  const a = await author();
  const materialId = await insertTextMaterial(db, a.memberId);
  const first = await insertPdf(a.memberId, ['[합성] 가 1쪽', '', '[합성] 가 3쪽'], { title: '[합성] 첫 PDF' });
  const second = await insertPdf(a.memberId, ['[합성] 나 1쪽'], { title: '[합성] 둘째 PDF' });

  const response = await publish(a.token, body([pdfItem(first), textItem(materialId), pdfItem(second)]));
  assert.equal(response.status, 201, response.text);
  const publicationId = response.body.publicationId;
  const rows = await items(publicationId);
  assert.deepEqual(rows.map((row) => [row.position, row.item_kind, row.source_id]),
    [[1, 'PDF_MATERIAL', first], [2, 'TEXT_MATERIAL', materialId], [3, 'PDF_MATERIAL', second]]);
  assert.equal(rows[0].title, '[합성] 첫 PDF');
  assert.deepEqual(rows[0].snapshot, { pageCount: 3 });
  assert.deepEqual(rows[2].snapshot, { pageCount: 1 });
  assert.equal(rows[0].pdf_copy_key, publishedPdfKey(a.memberId, publicationId, rows[0].published_item_id));
  assert.equal(rows[1].pdf_copy_key, null);
  // 복사는 트랜잭션 전 position 순, 사본 키는 미리 만든 ID 그대로, 정리는 없다.
  assert.deepEqual(files.calls, [
    ['copy', materialKey(a.memberId, first), rows[0].pdf_copy_key],
    ['copy', materialKey(a.memberId, second), rows[2].pdf_copy_key],
  ]);
  assert.deepEqual((await copiedPages(rows[0].published_item_id)).map((page) => [page.page_number, page.text, page.readable]),
    [[1, '[합성] 가 1쪽', true], [2, '', false], [3, '[합성] 가 3쪽', true]]);
  assert.equal((await copiedPages(rows[2].published_item_id)).length, 1);
  assert.equal(writer.calls.length, 1, '조각 나누기는 PDF 항목이 있어도 한 번');

  // 원본 쪽 글을 바꾸고 자료를 지워도 사본은 그대로다(BR4.4).
  await db.query("UPDATE pdf_page_text SET text = '[합성] 바뀐 글' WHERE pdf_material_id = $1 AND page_number = 1", [first]);
  await db.query('DELETE FROM pdf_material WHERE pdf_material_id = $1', [first]);
  assert.equal((await copiedPages(rows[0].published_item_id))[0].text, '[합성] 가 1쪽');
  assert.equal((await items(publicationId)).length, 3);
});

test('P-f: 추출이 끝나지 않은 PDF(PENDING·FAILED·시한 지난 PENDING)는 400 extractionIncomplete(항목 위치)이고 복사·저장하지 않는다', async () => {
  const a = await author();
  const done = await insertPdf(a.memberId);
  const pending = await insertPdf(a.memberId, [], { state: 'PENDING' });
  const failed = await insertPdf(a.memberId, [], { state: 'FAILED' });
  const expired = await insertPdf(a.memberId, [], { state: 'PENDING', deadlineSeconds: -1 });
  const response = await publish(a.token, body([pdfItem(done), pdfItem(pending), pdfItem(failed), pdfItem(expired)]));
  expectError(response, 400, 'VALIDATION_FAILED');
  assert.deepEqual(response.body.details, { violations: [1, 2, 3].map((i) => ({ field: `items[${i}].sourceId`, reason: 'extractionIncomplete' })) });
  assert.deepEqual(files.calls, []);
  assert.deepEqual(await publications(), []);
  // 시한 지난 PENDING은 사전 확인에서 FAILED(DEADLINE_EXCEEDED)로 확정된다(BR2.2).
  const [row] = await db.query('SELECT extraction_state, extraction_failure_code FROM pdf_material WHERE pdf_material_id = $1', [expired]);
  assert.deepEqual({ ...row }, { extraction_state: 'FAILED', extraction_failure_code: 'DEADLINE_EXCEEDED' });
});

test('P-f(404): 남의 PDF·없는 PDF는 U4와 같은 404이고 복사하지 않는다', async () => {
  const a = await author();
  const b = await author();
  const others = await insertPdf(b.memberId);
  for (const id of [others, randomUUID()]) {
    const response = await publish(a.token, body([pdfItem(id)]));
    expectError(response, 404, 'RESOURCE_UNAVAILABLE');
  }
  assert.deepEqual(files.calls, []);
  assert.deepEqual(await publications(), []);
});

test('P-b: 복사가 하나라도 실패하면 접두어를 한 번 정리하고 500이며 DB는 건드리지 않는다', async () => {
  const a = await author();
  const first = await insertPdf(a.memberId);
  const second = await insertPdf(a.memberId);
  // 저장소 장애와 "DONE인데 파일 없음" 둘 다 같은 500이다(BR5.3).
  for (const name of ['StorageUnavailable', 'FileNotFound']) {
    files.calls.length = 0;
    files.failCopyAt = 2;
    files.failCopyName = name;
    const response = await publish(a.token, body([pdfItem(first), pdfItem(second)]));
    expectError(response, 500, 'INTERNAL_ERROR');
    assert.deepEqual(response.body, { code: 'INTERNAL_ERROR', message: '처리 중 오류가 발생했습니다.' }, name);
    assert.deepEqual(ops(), ['copy', 'copy', 'deletePrefix'], name);
    assert.ok(files.calls[2][1].startsWith(`members/${a.memberId}/publications/`));
  }
  assert.deepEqual(await publications(), []);
  assert.equal(writer.calls.length, 0);
  assert.equal(aiRun.calls.length, 0);
  assert.deepEqual(pdfLogs().filter(({ entry }) => entry.event === 'PDF_COPY_FAILED').map(({ entry }) => entry.errorType), ['StorageUnavailable', 'FileNotFound']);
});

test('P-c·P-d: 복사 뒤 트랜잭션이 하루 한도 429·조각 예외 500으로 실패하면 접두어를 한 번 정리하고 원래 오류를 그대로 응답한다', async () => {
  const a = await author();
  const pdf = await insertPdf(a.memberId);
  await db.query('INSERT INTO daily_execution_count (member_id, usage_date, count) VALUES ($1, $2, $3)', [a.memberId, koreanUsageDate(new Date()), DAILY_RUN_LIMIT]);
  const limited = await publish(a.token, body([pdfItem(pdf)]));
  expectError(limited, 429, 'DAILY_LIMIT_REACHED');
  assert.deepEqual(ops(), ['copy', 'deletePrefix']);
  assert.equal(files.calls[1][1], publicationPrefix(a.memberId, files.calls[0][2].split('/')[3]));
  assert.deepEqual(await publications(), []);

  await db.query('DELETE FROM daily_execution_count WHERE member_id = $1', [a.memberId]);
  files.calls.length = 0;
  writer.fail = true;
  const failed = await publish(a.token, body([pdfItem(pdf)]));
  expectError(failed, 500, 'INTERNAL_ERROR');
  assert.deepEqual(ops(), ['copy', 'deletePrefix']);
  assert.deepEqual(await publications(), []);
  assert.deepEqual(await db.query('SELECT 1 FROM published_pdf_page'), []);
});

test('P-e: 정리(deletePrefix)가 실패해도 응답 코드는 그대로이고 PREFIX_CLEANUP_FAILED 로그(단계 번호)만 남으며 키·접두어 값은 없다', async () => {
  const a = await author();
  const pdf = await insertPdf(a.memberId);
  files.failCopyAt = 1;
  files.failDelete = true;
  const copyFailed = await publish(a.token, body([pdfItem(pdf)]));
  expectError(copyFailed, 500, 'INTERNAL_ERROR');
  files.failCopyAt = null;
  writer.fail = true;
  const txFailed = await publish(a.token, body([pdfItem(pdf)]));
  expectError(txFailed, 500, 'INTERNAL_ERROR');
  const cleanup = pdfLogs().filter(({ entry }) => entry.event === 'PREFIX_CLEANUP_FAILED');
  assert.deepEqual(cleanup.map(({ level, entry }) => [level, entry.stage, entry.errorType]), [['error', 3, 'StorageUnavailable'], ['error', 5, 'StorageUnavailable']]);
  for (const { entry } of cleanup) assert.match(entry.publicationId, /^[0-9a-f-]{36}$/);
  const text = server.logs.map((log) => log.text).join('\n');
  assert.ok(!text.includes('members/'), '로그에 키·접두어 값이 없다');
  assert.ok(!text.includes('[합성] 1쪽 글'), '로그에 쪽 글이 없다');
});

test('P-h: 발행 도중 원본이 지워지면 404, DONE이 아니게 되면 400 extractionIncomplete이고 둘 다 사본을 한 번 정리하며 아무것도 저장하지 않는다', async () => {
  const a = await author();
  const removed = await insertPdf(a.memberId);
  // 사전 확인·복사는 통과하고, 트랜잭션 재확인(FOR SHARE) 전에 원본이 사라진다.
  files.afterCopy = () => db.query('DELETE FROM pdf_material WHERE pdf_material_id = $1', [removed]);
  const gone = await publish(a.token, body([pdfItem(removed)]));
  expectError(gone, 404, 'RESOURCE_UNAVAILABLE');
  assert.deepEqual(ops(), ['copy', 'deletePrefix']);

  files.calls.length = 0;
  const changed = await insertPdf(a.memberId);
  const text = await insertTextMaterial(db, a.memberId);
  files.afterCopy = () => db.query(
    "UPDATE pdf_material SET extraction_state = 'FAILED', extraction_failure_code = 'UNREADABLE_FILE', page_count = NULL WHERE pdf_material_id = $1", [changed]);
  const notDone = await publish(a.token, body([textItem(text), pdfItem(changed)]));
  expectError(notDone, 400, 'VALIDATION_FAILED');
  assert.deepEqual(notDone.body.details, { violations: [{ field: 'items[1].sourceId', reason: 'extractionIncomplete' }] });
  assert.deepEqual(ops(), ['copy', 'deletePrefix']);
  assert.deepEqual(await publications(), []);
  assert.deepEqual(await db.query('SELECT 1 FROM published_pdf_page'), []);
  assert.equal(writer.calls.length, 0, '재확인에서 거부되면 조각 나누기에 닿지 않는다');
});

test('P-h: 발행 트랜잭션 동안 PDF 원본은 잠겨 있어 밖에서 지울 수 없고, 조각 나누기 시점에 쪽 사본이 이미 들어 있다', async () => {
  const a = await author();
  const pdf = await insertPdf(a.memberId, ['[합성] 1쪽', '', '[합성] 3쪽']);
  const seen = {};
  unbind();
  unbind = bindFakes(server.app, { aiRun, indexWriter: {
    async chunkInTransaction(manager, publicationId) {
      // 같은 트랜잭션 안: 쪽 사본이 조각 나누기 전에 들어 있어야 U3가 읽는다(W3 6).
      seen.pagesInside = (await manager.query(`SELECT count(*)::int AS n FROM published_pdf_page p JOIN published_item i ON i.published_item_id = p.published_item_id
        WHERE i.publication_id = $1`, [publicationId]))[0].n;
      // 다른 연결: FOR SHARE로 잠긴 원본은 지워지지 않고 잠금 대기 상한에 걸린다(BR4.2).
      const outside = db.createQueryRunner();
      await outside.connect();
      try {
        await outside.query("SET lock_timeout = '300ms'");
        seen.deleteError = await outside.query('DELETE FROM pdf_material WHERE pdf_material_id = $1', [pdf]).then(() => null, (error) => error.code ?? error.driverError?.code);
      } finally {
        await outside.query('RESET lock_timeout').catch(() => undefined);
        await outside.release();
      }
    },
    async requestReindex() { return 'NOT_FAILED'; },
  } });
  const response = await publish(a.token, body([pdfItem(pdf)]));
  assert.equal(response.status, 201, response.text);
  assert.equal(seen.pagesInside, 3);
  assert.equal(seen.deleteError, '55P03', '잠금 대기 초과(lock_not_available)');
  assert.equal((await db.query('SELECT 1 FROM pdf_material WHERE pdf_material_id = $1', [pdf])).length, 1);
});

test('쪽 사본 수가 쪽 수와 다르면(저장 불일치) 500이고 사본을 한 번 정리하며 발행본·항목·쪽 사본이 남지 않는다', async () => {
  const a = await author();
  const pdf = await insertPdf(a.memberId, ['[합성] 1쪽', '[합성] 2쪽', '[합성] 3쪽']);
  // DONE·쪽 수 3인데 쪽 행이 2개뿐인 깨진 원본(BR4.3 pageCount = 복사한 행 수).
  await db.query('DELETE FROM pdf_page_text WHERE pdf_material_id = $1 AND page_number = 3', [pdf]);
  const response = await publish(a.token, body([pdfItem(pdf)]));
  expectError(response, 500, 'INTERNAL_ERROR');
  assert.deepEqual(ops(), ['copy', 'deletePrefix']);
  assert.deepEqual(await publications(), []);
  assert.deepEqual(await db.query('SELECT 1 FROM published_item'), []);
  assert.deepEqual(await db.query('SELECT 1 FROM published_pdf_page'), []);
  assert.equal(aiRun.calls.length, 0);
});

test('동의가 없으면 PDF 사전 확인·복사 전에 403이고, Catch 자격 거부(409)는 복사 뒤라도 원래 오류 그대로이며 사본을 정리한다', async () => {
  const noConsent = await server.login(`u8-noconsent-${randomUUID()}`);
  const pendingPdf = await insertPdf(noConsent.memberId, [], { state: 'PENDING' });
  // 동의가 먼저다: 추출 전 PDF여도 400이 아니라 403이고 저장소를 부르지 않는다.
  expectError(await publish(noConsent.token, body([pdfItem(pendingPdf)])), 403, 'AI_CONSENT_REQUIRED');
  assert.deepEqual(files.calls, []);

  const a = await author();
  const pdf = await insertPdf(a.memberId);
  const unconfirmed = await eligibleCatch(db, a.memberId, { confirmed: false });
  const rejected = await publish(a.token, body([pdfItem(pdf), catchItem(unconfirmed)]));
  expectError(rejected, 409, 'CONFIRMATION_REQUIRED');
  assert.deepEqual(rejected.body.details, { catchIds: [unconfirmed] });
  assert.deepEqual(ops(), ['copy', 'deletePrefix']);
  assert.deepEqual(await publications(), []);
});

test('전체 글: PDF 쪽 글(코드 포인트)을 합계에 넣어 정확히 60,000자는 201, 60,001자는 400 maxTotalLength이고 거부 때도 사본을 정리한다', async () => {
  const a = await author();
  const exact = await insertPdf(a.memberId, ['가'.repeat(30_000), '', 'a'.repeat(30_000)]);
  const ok = await publish(a.token, body([pdfItem(exact)]));
  assert.equal(ok.status, 201, ok.text);

  files.calls.length = 0;
  const one = await insertTextMaterial(db, a.memberId, { body: 'x' });
  const over = await publish(a.token, body([pdfItem(exact), textItem(one)]));
  expectError(over, 400, 'VALIDATION_FAILED');
  assert.deepEqual(over.body.details, { violations: [{ field: 'items', reason: 'maxTotalLength' }] });
  assert.deepEqual(ops(), ['copy', 'deletePrefix'], '트랜잭션 거부(5단계)도 복사한 사본을 정리한다');
  assert.equal((await publications()).length, 1, '앞의 201 발행만 남는다');
});

test('전체 글: 각각 상한 안인 여러 PDF와 Catch·텍스트를 합쳐 60,000자를 넘으면 거부하고, 합이 정확히 60,000자면 발행한다', async () => {
  const a = await author();
  const catchId = await eligibleCatch(db, a.memberId, { workFacts: ['c'.repeat(10_000)], subjectContribution: 'd'.repeat(5_000) }, { evidence: 0 });
  const text = await insertTextMaterial(db, a.memberId, { body: 't'.repeat(5_000) });
  const pdfA = await insertPdf(a.memberId, ['p'.repeat(20_000)]);
  const pdfB = await insertPdf(a.memberId, ['q'.repeat(20_000)]);
  const pdfC = await insertPdf(a.memberId, ['r'.repeat(20_001)]);
  // 15,000(Catch) + 5,000(텍스트) + 20,000 + 20,000 = 60,000
  const exact = await publish(a.token, body([catchItem(catchId), textItem(text), pdfItem(pdfA), pdfItem(pdfB)]));
  assert.equal(exact.status, 201, exact.text);
  // 15,000 + 5,000 + 20,000 + 20,001 = 60,001
  const over = await publish(a.token, body([catchItem(catchId), textItem(text), pdfItem(pdfA), pdfItem(pdfC)]));
  expectError(over, 400, 'VALIDATION_FAILED');
  assert.deepEqual(over.body.details, { violations: [{ field: 'items', reason: 'maxTotalLength' }] });
});

test('전체 글: 이모지는 UTF-16 2단위여도 1자로 세고, 읽을 수 없는 쪽은 0자다', async () => {
  const a = await author();
  const emoji = await insertPdf(a.memberId, ['😀'.repeat(59_999), '', '', '😀']);
  assert.equal('😀'.repeat(60_000).length, 120_000);
  const ok = await publish(a.token, body([pdfItem(emoji)]));
  assert.equal(ok.status, 201, ok.text);
  const one = await insertTextMaterial(db, a.memberId, { body: '😀' });
  const over = await publish(a.token, body([pdfItem(emoji), textItem(one)]));
  expectError(over, 400, 'VALIDATION_FAILED');
});

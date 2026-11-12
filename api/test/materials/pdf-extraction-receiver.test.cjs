// U8 Step 6 — PDF 추출 결과 수신(worker-messages 큐의 `PdfExtractionResult` → WorkerMessageConsumer → PdfExtractionReceiver) 시험.
//
// 먼저 정한 시나리오·기대 결과·실패 조건(U8 test-scenarios.md §4 R-1~R-8, 기능 명세 W2 「api 수신」, team.md Testing Posture).
// 세부 시험 코드는 구현 뒤 쓴다.
//
// R-1 51쪽 / pageNumber 불연속·중복 / readable=false인데 text 있음 / readable=true인데 text 빔 / FAILED인데 pages 있음·failureCode 없음 /
//     정의 밖 필드 (BR3.3, NFR4.7) — 기대: REJECTED/SCHEMA_INVALID, 저장 없음. 실패 조건: 저장되거나 다른 코드.
// R-2 자료 없음(삭제·탈퇴)·회원 불일치 (BR3.3, NFR5.3) — 기대: REJECTED/CONTEXT_MISMATCH. 실패 조건: 저장됨.
// R-3 이미 DONE (BR2.1·BR3.3) — 기대: DUPLICATE/ALREADY_RECEIVED, 내용 비교 없음. 실패 조건: 덮어씀.
// R-4 FAILED 또는 시한 지남 (BR2.2·BR3.3, NFR5.3) — 기대: REJECTED/STALE_ATTEMPT; 시한 지남이면 FAILED(DEADLINE_EXCEEDED) 저장.
//     실패 조건: PENDING 유지·저장됨.
// R-5 PENDING·시한 전·SUCCEEDED 50쪽 (BR3.4, AC3.2.2, NFR4.7·NFR4.16) — 기대: 쪽 50행 INSERT + pageCount·DONE, 커밋 뒤 ACCEPTED/OK.
//     실패 조건: 부분 저장·커밋 전 OK.
// R-6 PENDING·FAILED 결과 (BR3.2·BR3.4) — 기대: FAILED + failureCode 저장, ACCEPTED/OK. 실패 조건: 사유 누락.
// R-7 쪽 행 하나가 제약 위반 (BR3.4, NFR4.16) — 기대: 0행·PENDING 그대로, 수신 확인 없이 작업 실패. 실패 조건: 일부 행 남음.
// R-8 로그 PDF_EXTRACTION_RECEIVED (BR3.5, NFR1.4·NFR6.1·NFR6.2) — 기대: 코드·pdfMaterialId만, 글·제목 없음. 실패 조건: 글이 로그에 남음.
//
// 테스트 DB(실제 마이그레이션)에 회원·PDF 행을 직접 넣고, 가짜 작업 객체 { name: 'PdfExtractionResult', id: messageId, data }로
// WorkerMessageConsumer.process를 부른다(소비자 연결까지 덮음). 실제 큐(Redis)·실제 S3는 쓰지 않는다. 10월 수신 경로(Result·ProcessingEvent)는
// test/integration/analysis-queue-consumer.test.cjs가 그대로 확인한다. 쪽 글·제목은 모두 합성 문자열이다.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { after, before, beforeEach, test } = require('node:test');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const { insertMember } = require('../u2/support.cjs');
const { CONTRACT_DIR } = require('../helpers/queue-harness.cjs');
const { WorkerMessageValidator } = require('../../dist/analysis-receiver/worker-message.validator');
const { AnalysisQueueError, WorkerMessageConsumer, loggableJobId, loggableJobName } = require('../../dist/analysis-queue/worker-message.consumer');
const { WORKER_JOB_NAMES } = require('../../dist/analysis-queue/queue-spec');
const { PdfExtractionReceiver, PdfExtractionStorageError } = require('../../dist/pdf-extraction/pdf-extraction.receiver');
const {
  PDF_EXTRACTION_RESULT_JOB_NAME, PDF_EXTRACT_SCHEMA_VERSION, PDF_TEXT_TOTAL_MAX, PDF_WORKER_FAILURE_CODES, isValidPdfExtractionResult,
  pdfExtractionResultMessageId,
} = require('../../dist/pdf-extraction/pdf-extraction-spec');
const { PDF_PAGE_LIMIT } = require('../../dist/materials/pdf-material.entity');
const { materialKey } = require('../../dist/file-storage/file-storage');

// 로그·오류 비노출 확인용 합성 문자열. 실제 사용자 자료가 아니다.
const SECRET_TEXT = '[합성-PDF-쪽글-노출확인-5c1e] 주민등록번호 000000-0000000';
const SECRET_TITLE = '[합성-PDF-제목-노출확인-5c1e]';
const SECRET_DB = 'synthetic-receiver-secret-5c1e';

let db;
before(async () => { db = await openTestDataSource(); });
after(async () => { await db?.destroy(); });
beforeEach(async () => { await resetTestDatabase(db); });

/** PDF 자료 행을 DB에 직접 넣는다(업로드 API를 거치지 않음). 시한은 지금 + deadlineSeconds. */
async function insertPdf(memberId, { state = 'PENDING', deadlineSeconds = 600, pageCount = null, failureCode = null, title = '[합성] PDF' } = {}) {
  const pdfMaterialId = randomUUID();
  await db.query(`INSERT INTO pdf_material (pdf_material_id, member_id, title, storage_key, file_size_bytes, page_count, extraction_state,
    extraction_deadline_at, extraction_failure_code, created_at, updated_at)
    VALUES ($1, $2, $3, $4, 2048, $5, $6, clock_timestamp() + make_interval(secs => $7), $8, clock_timestamp(), clock_timestamp())`,
  [pdfMaterialId, memberId, title, materialKey(memberId, pdfMaterialId), pageCount, state, deadlineSeconds, failureCode]);
  return pdfMaterialId;
}
async function insertPage(pdfMaterialId, pageNumber, text) {
  await db.query('INSERT INTO pdf_page_text (pdf_page_text_id, pdf_material_id, page_number, text, readable) VALUES ($1, $2, $3, $4, $5)',
    [randomUUID(), pdfMaterialId, pageNumber, text, text !== '']);
}
const materialRow = (id) => db.query(`SELECT member_id, extraction_state, extraction_failure_code, page_count, updated_at
  FROM pdf_material WHERE pdf_material_id = $1`, [id]).then((rows) => rows[0] ?? null);
const pageRows = (id) => db.query('SELECT page_number, text, readable FROM pdf_page_text WHERE pdf_material_id = $1 ORDER BY page_number', [id]);
const pageCountOf = (id) => db.query('SELECT count(*)::int AS n FROM pdf_page_text WHERE pdf_material_id = $1', [id]).then((rows) => rows[0].n);

/** 합성 쪽. 글이 비면 readable=false(worker 판정 BR3.1과 같은 규칙). 다섯째 쪽마다 읽을 수 없는 쪽을 둔다. */
const page = (pageNumber, text = pageNumber % 5 === 0 ? '' : `합성 ${pageNumber}쪽 글 {"quote":"\\\\back"}\n둘째 줄\t탭`) =>
  ({ pageNumber, readable: text !== '', text });
const pages = (count) => Array.from({ length: count }, (_, index) => page(index + 1));
function succeeded(pdfMaterialId, memberId, pageList = pages(3)) {
  return { schemaVersion: PDF_EXTRACT_SCHEMA_VERSION, messageId: pdfExtractionResultMessageId(pdfMaterialId), pdfMaterialId, memberId,
    outcome: 'SUCCEEDED', pages: pageList };
}
function failed(pdfMaterialId, memberId, failureCode = 'ENCRYPTED') {
  return { schemaVersion: PDF_EXTRACT_SCHEMA_VERSION, messageId: pdfExtractionResultMessageId(pdfMaterialId), pdfMaterialId, memberId,
    outcome: 'FAILED', failureCode };
}
const job = (data, id = data.messageId, name = PDF_EXTRACTION_RESULT_JOB_NAME) => ({ name, id, data });

/** 소비자 + 실제 수신기(테스트 DB). 10월 등록 경로는 불리면 안 되므로 던지는 대역이다. 수신기 로그는 logs에 모은다. */
function harness({ withReceiver = true } = {}) {
  const logs = [];
  const registration = {
    receiveResult: async () => { throw new Error('PDF 결과는 10월 등록 경로로 가면 안 된다'); },
    receiveProgress: async () => { throw new Error('PDF 결과는 10월 진행 경로로 가면 안 된다'); },
  };
  const consumerLog = {
    progress: (jobId, decision) => logs.push({ event: 'PROGRESS', jobId, decision }),
    result: (jobId, receipt) => logs.push({ event: 'RESULT', jobId, receipt }),
    applicationFailed: (jobId) => logs.push({ event: 'APPLICATION_FAILED', jobId }),
  };
  const receiver = withReceiver ? new PdfExtractionReceiver(db, { logger: { log: (entry) => logs.push(entry) } }) : null;
  return { consumer: new WorkerMessageConsumer(registration, consumerLog, receiver), logs, receiver };
}
const receivedLogs = (logs) => logs.filter((entry) => entry.event === 'PDF_EXTRACTION_RECEIVED');
function expectReceipt(receipt, data, disposition, code) {
  assert.deepEqual(receipt, { schemaVersion: '2', messageId: data.messageId, pdfMaterialId: data.pdfMaterialId, disposition, code });
}
async function expectFailure(promise, code) {
  const error = await promise.then(() => assert.fail('실패해야 한다'), (caught) => caught);
  assert.ok(error instanceof AnalysisQueueError, `${error}`);
  assert.equal(error.message, code);
  assert.equal(error.stack, `AnalysisQueueError: ${code}`);
  assert.equal(error.cause, undefined);
  return error;
}

test('R-1: 모양이 틀린 결과는 각각 REJECTED/SCHEMA_INVALID이고 어떤 쪽도 저장되지 않으며 자료는 PENDING 그대로다', async () => {
  const memberId = await insertMember(db);
  const pdfMaterialId = await insertPdf(memberId);
  const { consumer, logs } = harness();
  const base = () => succeeded(pdfMaterialId, memberId, pages(3));
  const withPages = (pageList) => ({ ...base(), pages: pageList });
  const cases = [
    ['51쪽', withPages(pages(PDF_PAGE_LIMIT + 1))],
    ['pages 빈 배열', withPages([])],
    ['pages 없음', (() => { const m = base(); delete m.pages; return m; })()],
    ['pages null', withPages(null)],
    ['pageNumber 불연속(1,3)', withPages([page(1), page(3)])],
    ['pageNumber 중복(1,1)', withPages([page(1), page(1)])],
    ['pageNumber 0부터', withPages([page(0, 'x'), page(1)])],
    ['pageNumber 2부터', withPages([page(2)])],
    ['pageNumber 역순', withPages([page(2), page(1)])],
    ['pageNumber 정수 아님', withPages([{ pageNumber: 1.5, readable: true, text: 'x' }])],
    ['readable=false인데 text 있음', withPages([{ pageNumber: 1, readable: false, text: '글이 있다' }])],
    ['readable=true인데 text 빔', withPages([{ pageNumber: 1, readable: true, text: '' }])],
    ['readable 문자열', withPages([{ pageNumber: 1, readable: 'true', text: 'x' }])],
    ['text 문자열 아님', withPages([{ pageNumber: 1, readable: true, text: ['x'] }])],
    ['text에 NUL', withPages([{ pageNumber: 1, readable: true, text: 'a\u0000b' }])],
    ['쪽에 정의 밖 필드', withPages([{ pageNumber: 1, readable: true, text: 'x', width: 1 }])],
    ['쪽에 필드 누락', withPages([{ pageNumber: 1, readable: true }])],
    ['쪽이 객체 아님', withPages(['x'])],
    ['SUCCEEDED인데 failureCode 있음', { ...base(), failureCode: 'ENCRYPTED' }],
    ['FAILED인데 pages 있음', { ...failed(pdfMaterialId, memberId), pages: pages(1) }],
    ['FAILED인데 pages 빈 배열', { ...failed(pdfMaterialId, memberId), pages: [] }],
    ['FAILED인데 failureCode 없음', (() => { const m = failed(pdfMaterialId, memberId); delete m.failureCode; return m; })()],
    ['FAILED인데 failureCode null', failed(pdfMaterialId, memberId, null)],
    ['FAILED인데 failureCode DEADLINE_EXCEEDED(시한 판정 전용)', failed(pdfMaterialId, memberId, 'DEADLINE_EXCEEDED')],
    ['FAILED인데 정의 밖 failureCode', failed(pdfMaterialId, memberId, 'VIRUS')],
    ['outcome 정의 밖 값', { ...base(), outcome: 'EMPTY' }],
    ['outcome 없음', (() => { const m = base(); delete m.outcome; return m; })()],
    ['정의 밖 최상위 필드', { ...base(), storageKey: materialKey(memberId, pdfMaterialId) }],
    ['schemaVersion 다름', { ...base(), schemaVersion: '1' }],
    ['schemaVersion 없음', (() => { const m = base(); delete m.schemaVersion; return m; })()],
    ['memberId UUID 아님', { ...base(), memberId: 'member-1' }],
    ['memberId 대문자 UUID', { ...base(), memberId: memberId.toUpperCase() }],
    ['memberId 없음', (() => { const m = base(); delete m.memberId; return m; })()],
    ['pdfMaterialId 대문자 UUID', { ...base(), pdfMaterialId: pdfMaterialId.toUpperCase(), messageId: pdfExtractionResultMessageId(pdfMaterialId.toUpperCase()) }],
    ['messageId 규칙 밖(10월 모양)', { ...base(), messageId: `message-live-${pdfMaterialId}-result` }],
    ['messageId가 다른 자료의 것', { ...base(), messageId: pdfExtractionResultMessageId(randomUUID()) }],
  ];
  for (const [label, data] of cases) {
    assert.equal(isValidPdfExtractionResult(data), false, `${label}: 검사기가 통과시킨다`);
    const receipt = await consumer.process(job(data));
    assert.equal(receipt?.disposition, 'REJECTED', `${label}: ${JSON.stringify(receipt)}`);
    assert.equal(receipt?.code, 'SCHEMA_INVALID', label);
    assert.equal(receipt.messageId, data.messageId, label);
    assert.equal(receipt.pdfMaterialId, data.pdfMaterialId, label);
    assert.equal(receipt.schemaVersion, '2', label);
  }
  assert.equal(await pageCountOf(pdfMaterialId), 0, '어떤 쪽도 저장되지 않는다');
  const row = await materialRow(pdfMaterialId);
  assert.equal(row.extraction_state, 'PENDING');
  assert.equal(row.page_count, null);
  assert.equal(receivedLogs(logs).length, cases.length, '판정마다 로그 한 줄');
  assert.ok(receivedLogs(logs).every((entry) => entry.disposition === 'REJECTED' && entry.code === 'SCHEMA_INVALID' && entry.pageCount === null));
  assert.equal(logs.some((entry) => entry.event === 'RESULT'), false, '10월 결과 기록 경로로 가지 않는다');

  // 같은 검사기 규칙이 WorkerMessageValidator에도 있고(코드 분기, 계약 YAML 무수정), 정상 결과는 통과한다.
  const validator = new WorkerMessageValidator(CONTRACT_DIR);
  assert.equal(validator.pdfExtractionResult(base()), true);
  assert.equal(validator.pdfExtractionResult({ ...base(), failureCode: null }), true, 'SUCCEEDED의 failureCode null은 없음과 같다');
  assert.equal(validator.pdfExtractionResult({ ...failed(pdfMaterialId, memberId), pages: null }), true, 'FAILED의 pages null은 없음과 같다');
  assert.equal(validator.pdfExtractionResult(withPages(pages(PDF_PAGE_LIMIT))), true, '꼭 50쪽은 통과');
  assert.equal(validator.pdfExtractionResult(cases[0][1]), false);
  assert.equal(validator.result(base()), false, '10월 Result 검사는 PDF 결과를 받지 않는다');
  // TEXT_LIMIT_EXCEEDED는 팀장 결정 2026-11-10(#420 issuecomment-6759834176)으로 더한 넷째 worker 사유다.
  assert.deepEqual([...PDF_WORKER_FAILURE_CODES].sort(), ['ENCRYPTED', 'PAGE_LIMIT_EXCEEDED', 'TEXT_LIMIT_EXCEEDED', 'UNREADABLE_FILE']);
});

test('R-1(식별 불가): pdfMaterialId가 UUID 모양이 아니거나 messageId가 없으면 수신 확인 없이(null) 작업을 완료하고 저장하지 않는다', async () => {
  const memberId = await insertMember(db);
  const pdfMaterialId = await insertPdf(memberId);
  const { consumer, logs } = harness();
  const cases = [
    ['pdfMaterialId UUID 아님', { ...succeeded(pdfMaterialId, memberId), pdfMaterialId: `not-a-uuid-${SECRET_TITLE}`, messageId: 'message-pdf-x-result' }],
    ['pdfMaterialId 없음', (() => { const m = succeeded(pdfMaterialId, memberId); delete m.pdfMaterialId; return m; })()],
    ['messageId 없음', (() => { const m = succeeded(pdfMaterialId, memberId); delete m.messageId; return m; })()],
    ['messageId 빈 문자열', { ...succeeded(pdfMaterialId, memberId), messageId: '' }],
    ['본문이 배열', [succeeded(pdfMaterialId, memberId)]],
    ['본문이 문자열', SECRET_TEXT],
    ['본문이 null', null],
  ];
  for (const [label, data] of cases) {
    const id = data !== null && typeof data === 'object' && !Array.isArray(data) && typeof data.messageId === 'string' ? data.messageId : pdfExtractionResultMessageId(pdfMaterialId);
    assert.equal(await consumer.process(job(data, id)), null, label);
  }
  assert.equal(await pageCountOf(pdfMaterialId), 0);
  assert.equal((await materialRow(pdfMaterialId)).extraction_state, 'PENDING');
  const entries = receivedLogs(logs);
  assert.equal(entries.length, cases.length);
  assert.ok(entries.every((entry) => entry.pdfMaterialId === null && entry.messageId === null && entry.disposition === null && entry.code === null));
  assert.equal(JSON.stringify(logs).includes('5c1e'), false, '밖에서 온 값(ID 자리의 문자열·본문)은 로그에 그대로 남기지 않는다');
});

test('R-2: 자료가 없거나(삭제·탈퇴) 회원이 다르면 REJECTED/CONTEXT_MISMATCH이고 아무것도 저장하지 않는다', async () => {
  const owner = await insertMember(db);
  const other = await insertMember(db);
  const pdfMaterialId = await insertPdf(owner);
  const { consumer, logs } = harness();

  const missing = succeeded(randomUUID(), owner);
  expectReceipt(await consumer.process(job(missing)), missing, 'REJECTED', 'CONTEXT_MISMATCH');

  const mismatch = succeeded(pdfMaterialId, other);
  expectReceipt(await consumer.process(job(mismatch)), mismatch, 'REJECTED', 'CONTEXT_MISMATCH');
  assert.equal(await pageCountOf(pdfMaterialId), 0);
  const row = await materialRow(pdfMaterialId);
  assert.equal(row.extraction_state, 'PENDING');
  assert.equal(row.member_id, owner);

  // 탈퇴(회원 행 삭제 → 연쇄)로 자료가 사라진 뒤 도착한 결과도 같다.
  await db.query('DELETE FROM member_account WHERE member_id = $1', [owner]);
  const late = succeeded(pdfMaterialId, owner);
  expectReceipt(await consumer.process(job(late)), late, 'REJECTED', 'CONTEXT_MISMATCH');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM pdf_page_text'))[0].n, 0);
  assert.deepEqual(receivedLogs(logs).map((entry) => entry.code), ['CONTEXT_MISMATCH', 'CONTEXT_MISMATCH', 'CONTEXT_MISMATCH']);
});

test('R-3: 이미 DONE인 자료의 결과는 내용과 관계없이 DUPLICATE/ALREADY_RECEIVED이고 저장된 쪽·쪽 수를 덮어쓰지 않는다', async () => {
  const memberId = await insertMember(db);
  const pdfMaterialId = await insertPdf(memberId, { state: 'DONE', pageCount: 2 });
  await insertPage(pdfMaterialId, 1, '처음 저장된 1쪽');
  await insertPage(pdfMaterialId, 2, '');
  const before = { row: await materialRow(pdfMaterialId), pages: await pageRows(pdfMaterialId) };
  const { consumer, logs } = harness();

  const different = succeeded(pdfMaterialId, memberId, pages(5));
  expectReceipt(await consumer.process(job(different)), different, 'DUPLICATE', 'ALREADY_RECEIVED');
  const asFailed = failed(pdfMaterialId, memberId, 'UNREADABLE_FILE');
  expectReceipt(await consumer.process(job(asFailed)), asFailed, 'DUPLICATE', 'ALREADY_RECEIVED');
  assert.deepEqual({ row: await materialRow(pdfMaterialId), pages: await pageRows(pdfMaterialId) }, before, 'DONE 뒤에는 어떤 쓰기도 없다');
  assert.deepEqual(receivedLogs(logs).map((entry) => [entry.disposition, entry.code]), [['DUPLICATE', 'ALREADY_RECEIVED'], ['DUPLICATE', 'ALREADY_RECEIVED']]);
});

test('R-4: FAILED인 자료의 결과는 REJECTED/STALE_ATTEMPT이고, 시한이 지난 PENDING은 FAILED(DEADLINE_EXCEEDED)로 저장한 뒤 STALE_ATTEMPT다', async () => {
  const memberId = await insertMember(db);
  const alreadyFailed = await insertPdf(memberId, { state: 'FAILED', failureCode: 'ENCRYPTED' });
  const expired = await insertPdf(memberId, { deadlineSeconds: -1 });
  const { consumer, logs } = harness();

  const forFailed = succeeded(alreadyFailed, memberId);
  expectReceipt(await consumer.process(job(forFailed)), forFailed, 'REJECTED', 'STALE_ATTEMPT');
  let row = await materialRow(alreadyFailed);
  assert.equal(row.extraction_state, 'FAILED');
  assert.equal(row.extraction_failure_code, 'ENCRYPTED', '사유 코드는 바뀌지 않는다');
  assert.equal(await pageCountOf(alreadyFailed), 0);

  const beforeExpired = await materialRow(expired);
  const forExpired = succeeded(expired, memberId, pages(PDF_PAGE_LIMIT));
  expectReceipt(await consumer.process(job(forExpired)), forExpired, 'REJECTED', 'STALE_ATTEMPT');
  row = await materialRow(expired);
  assert.equal(row.extraction_state, 'FAILED', '시한 지남은 BR2.2로 FAILED를 저장한다');
  assert.equal(row.extraction_failure_code, 'DEADLINE_EXCEEDED');
  assert.equal(row.page_count, null);
  assert.ok(row.updated_at > beforeExpired.updated_at);
  assert.equal(await pageCountOf(expired), 0, '늦게 온 쪽은 저장하지 않는다');

  // 그 뒤 같은 자료의 FAILED 결과도 STALE_ATTEMPT이고 DEADLINE_EXCEEDED를 덮어쓰지 않는다.
  const again = failed(expired, memberId, 'UNREADABLE_FILE');
  expectReceipt(await consumer.process(job(again)), again, 'REJECTED', 'STALE_ATTEMPT');
  assert.equal((await materialRow(expired)).extraction_failure_code, 'DEADLINE_EXCEEDED');
  assert.deepEqual(receivedLogs(logs).map((entry) => entry.code), ['STALE_ATTEMPT', 'STALE_ATTEMPT', 'STALE_ATTEMPT']);
});

test('R-5: PENDING·시한 전·SUCCEEDED 50쪽은 쪽 50행을 글·readable 그대로 저장하고 pageCount 50·DONE으로 바꾼 뒤 ACCEPTED/OK다', async () => {
  const memberId = await insertMember(db);
  const pdfMaterialId = await insertPdf(memberId);
  const before = await materialRow(pdfMaterialId);
  const { consumer, logs } = harness();
  const pageList = pages(PDF_PAGE_LIMIT);
  pageList[0] = page(1, '유니코드 😀 "따옴표" \\역슬래시\\ {중괄호} [대괄호] \'작은따옴표\' 끝');
  const data = succeeded(pdfMaterialId, memberId, pageList);

  const receipt = await consumer.process(job(data));
  expectReceipt(receipt, data, 'ACCEPTED', 'OK');
  const stored = await pageRows(pdfMaterialId);
  assert.equal(stored.length, PDF_PAGE_LIMIT);
  assert.deepEqual(stored.map((row) => ({ pageNumber: row.page_number, readable: row.readable, text: row.text })), pageList, '글은 가공 없이 그대로');
  assert.equal(stored.filter((row) => !row.readable).length, PDF_PAGE_LIMIT / 5, '읽을 수 없는 쪽도 readable=false·빈 글로 함께 저장');
  const row = await materialRow(pdfMaterialId);
  assert.equal(row.extraction_state, 'DONE');
  assert.equal(row.page_count, PDF_PAGE_LIMIT);
  assert.equal(row.extraction_failure_code, null);
  assert.ok(row.updated_at > before.updated_at);
  assert.deepEqual(receivedLogs(logs), [{ event: 'PDF_EXTRACTION_RECEIVED', pdfMaterialId, messageId: data.messageId, disposition: 'ACCEPTED', code: 'OK', pageCount: PDF_PAGE_LIMIT }]);

  // 한 쪽짜리도 같다(하한 1).
  const single = await insertPdf(memberId);
  const one = succeeded(single, memberId, [page(1, '한 쪽')]);
  assert.equal((await consumer.process(job(one))).code, 'OK');
  assert.equal((await materialRow(single)).page_count, 1);
});

test('R-5(동시): 같은 PENDING 자료의 결과 둘이 동시에 오면 행 잠금으로 하나만 ACCEPTED이고 다른 하나는 DUPLICATE이며 쪽은 한 벌만 남는다', async () => {
  const memberId = await insertMember(db);
  const pdfMaterialId = await insertPdf(memberId);
  const { consumer } = harness();
  const first = succeeded(pdfMaterialId, memberId, pages(4));
  const second = succeeded(pdfMaterialId, memberId, pages(7));
  const receipts = await Promise.all([consumer.process(job(first)), consumer.process(job(second))]);
  assert.deepEqual(receipts.map((receipt) => receipt.disposition).sort(), ['ACCEPTED', 'DUPLICATE']);
  const accepted = receipts.find((receipt) => receipt.disposition === 'ACCEPTED');
  const stored = await pageRows(pdfMaterialId);
  const row = await materialRow(pdfMaterialId);
  assert.equal(row.extraction_state, 'DONE');
  assert.ok(stored.length === 4 || stored.length === 7, `쪽 수 ${stored.length}`);
  assert.equal(row.page_count, stored.length);
  assert.equal(accepted.messageId, first.messageId, '두 결과의 messageId는 같은 자료라 같다');
});

test('R-6: PENDING·FAILED 결과는 FAILED와 사유 코드를 저장하고 ACCEPTED/OK이며, worker 사유 4종(TEXT_LIMIT_EXCEEDED 포함)이 모두 저장된다', async () => {
  const memberId = await insertMember(db);
  const { consumer, logs } = harness();
  for (const failureCode of PDF_WORKER_FAILURE_CODES) {
    const pdfMaterialId = await insertPdf(memberId);
    const before = await materialRow(pdfMaterialId);
    const data = failed(pdfMaterialId, memberId, failureCode);
    expectReceipt(await consumer.process(job(data)), data, 'ACCEPTED', 'OK');
    const row = await materialRow(pdfMaterialId);
    assert.equal(row.extraction_state, 'FAILED', failureCode);
    assert.equal(row.extraction_failure_code, failureCode, '사유 코드가 그대로 저장된다');
    assert.equal(row.page_count, null);
    assert.ok(row.updated_at > before.updated_at);
    assert.equal(await pageCountOf(pdfMaterialId), 0);
    // FAILED가 된 뒤 같은 자료의 SUCCEEDED 결과는 STALE_ATTEMPT다(BR2.1 한 번만 바뀜).
    assert.equal((await consumer.process(job(succeeded(pdfMaterialId, memberId)))).code, 'STALE_ATTEMPT');
  }
  assert.ok(receivedLogs(logs).filter((entry) => entry.code === 'OK').every((entry) => entry.pageCount === null));
});

test('쪽 글 합계 상한(코드 포인트 60,000자): 경계·여러 쪽 합산·이모지를 발행본과 같은 셈으로 판정하고, 넘으면 SCHEMA_INVALID·저장 없음', async () => {
  // 팀장 결정 2026-11-10(#420 issuecomment-6759834176)·BR4.5 「수신 검사(BR3.3)에 같은 상한」. worker는 넘기 전에 TEXT_LIMIT_EXCEEDED로 끝낸다.
  assert.equal(PDF_TEXT_TOTAL_MAX, 60_000);
  const memberId = await insertMember(db);
  const { consumer } = harness();
  const text = (n, ch = '가') => ch.repeat(n);
  const accepted = [
    ['한 쪽 60,000자', [{ pageNumber: 1, readable: true, text: text(60_000) }]],
    ['세 쪽 합 60,000자', [1, 2, 3].map((n) => ({ pageNumber: n, readable: true, text: text(20_000, 'a') }))],
    // 이모지 60,000자는 UTF-16으로 120,000단위지만 코드 포인트로는 60,000자라 받는다.
    ['이모지 60,000자', [{ pageNumber: 1, readable: true, text: text(60_000, '😀') }]],
    ['읽을 수 없는 쪽은 0자', [{ pageNumber: 1, readable: true, text: text(60_000) }, { pageNumber: 2, readable: false, text: '' }]],
  ];
  for (const [label, pageList] of accepted) {
    const pdfMaterialId = await insertPdf(memberId);
    const data = succeeded(pdfMaterialId, memberId, pageList);
    expectReceipt(await consumer.process(job(data)), data, 'ACCEPTED', 'OK');
    assert.equal((await materialRow(pdfMaterialId)).extraction_state, 'DONE', label);
    const stored = await pageRows(pdfMaterialId);
    assert.equal(stored.reduce((sum, row) => sum + [...row.text].length, 0), 60_000, label);
  }
  const rejected = [
    ['한 쪽 60,001자', [{ pageNumber: 1, readable: true, text: text(60_001) }]],
    ['세 쪽 합 60,001자', [20_000, 20_000, 20_001].map((n, i) => ({ pageNumber: i + 1, readable: true, text: text(n, 'a') }))],
    ['이모지 60,001자', [{ pageNumber: 1, readable: true, text: text(60_001, '😀') }]],
  ];
  for (const [label, pageList] of rejected) {
    const pdfMaterialId = await insertPdf(memberId);
    const data = succeeded(pdfMaterialId, memberId, pageList);
    assert.equal(isValidPdfExtractionResult(data), false, label);
    expectReceipt(await consumer.process(job(data)), data, 'REJECTED', 'SCHEMA_INVALID');
    assert.equal((await materialRow(pdfMaterialId)).extraction_state, 'PENDING', label);
    assert.equal(await pageCountOf(pdfMaterialId), 0, label);
  }
  // UTF-16 단위로 세면 60,000을 넘지만(이모지 30,001자 = 60,002단위) 코드 포인트로는 30,001자라 받는다.
  const surrogates = await insertPdf(memberId);
  const surrogateData = succeeded(surrogates, memberId, [{ pageNumber: 1, readable: true, text: text(30_001, '😀') }]);
  assert.ok(surrogateData.pages[0].text.length > 60_000);
  expectReceipt(await consumer.process(job(surrogateData)), surrogateData, 'ACCEPTED', 'OK');
});

test('R-7: 쪽 행 하나가 제약(UNIQUE)에 걸리면 수신 확인 없이 RECEIVER_STORAGE_UNAVAILABLE로 작업이 실패하고 쪽은 하나도 더해지지 않으며 PENDING 그대로다', async () => {
  const memberId = await insertMember(db);
  const pdfMaterialId = await insertPdf(memberId);
  // PENDING 자료에 쪽 행 하나가 미리 있으면 (pdf_material_id, page_number) UNIQUE 위반으로 다중 INSERT 전체가 실패한다.
  await insertPage(pdfMaterialId, 3, '미리 있던 3쪽');
  const before = { row: await materialRow(pdfMaterialId), pages: await pageRows(pdfMaterialId) };
  const { consumer, logs } = harness();

  const error = await expectFailure(consumer.process(job(succeeded(pdfMaterialId, memberId, pages(PDF_PAGE_LIMIT)))), 'RECEIVER_STORAGE_UNAVAILABLE');
  assert.equal(error.stack.includes(' at '), false, '호출 위치를 싣지 않는다');
  assert.deepEqual({ row: await materialRow(pdfMaterialId), pages: await pageRows(pdfMaterialId) }, before, '0행 추가·PENDING 유지');
  assert.equal(receivedLogs(logs).length, 0, '수신 확인이 없으므로 판정 로그도 없다');
  assert.equal(logs.some((entry) => entry.event === 'RESULT'), false);

  // 수신기 자체는 PdfExtractionStorageError를 던지고 원문 DB 오류를 싣지 않는다.
  const { receiver } = harness();
  const direct = await receiver.receive(succeeded(pdfMaterialId, memberId)).then(() => null, (caught) => caught);
  assert.ok(direct instanceof PdfExtractionStorageError);
  assert.equal(direct.cause, undefined);
  assert.equal(`${direct.message}\n${direct.stack}`.includes('pdf_page_text'), false, '제약·표 이름 같은 DB 원문이 섞이지 않는다');

  // 미리 있던 쪽을 지우면 같은 결과가 정상 저장된다(작업 실패 뒤 재처리는 worker 몫이 아니라 시한·재업로드 규칙이지만, 상태가 깨지지 않았음을 확인).
  await db.query('DELETE FROM pdf_page_text WHERE pdf_material_id = $1', [pdfMaterialId]);
  assert.equal((await consumer.process(job(succeeded(pdfMaterialId, memberId, pages(2))))).code, 'OK');
  assert.equal(await pageCountOf(pdfMaterialId), 2);
});

test('R-7(커밋 실패): 커밋 시점에 실패하면 ACCEPTED가 나가기 전이라 수신 확인 없이 실패하고 0행·PENDING이며 DB 오류 원문이 사유·stack·로그에 없다', async () => {
  const memberId = await insertMember(db);
  const pdfMaterialId = await insertPdf(memberId, { title: SECRET_TITLE });
  const { consumer, logs } = harness();
  await db.query(`CREATE FUNCTION test_pdf_receipt_commit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION '${SECRET_DB}'; END; $$`);
  await db.query(`CREATE CONSTRAINT TRIGGER test_pdf_receipt_commit AFTER INSERT ON pdf_page_text
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION test_pdf_receipt_commit()`);
  let failure;
  try {
    failure = await consumer.process(job(succeeded(pdfMaterialId, memberId, [page(1, SECRET_TEXT), page(2, '둘째')]))).then(() => null, (caught) => caught);
  } finally {
    await db.query('DROP TRIGGER test_pdf_receipt_commit ON pdf_page_text');
    await db.query('DROP FUNCTION test_pdf_receipt_commit()');
  }
  assert.ok(failure instanceof AnalysisQueueError, `${failure}`);
  assert.equal(failure.message, 'RECEIVER_STORAGE_UNAVAILABLE');
  assert.equal(failure.stack, 'AnalysisQueueError: RECEIVER_STORAGE_UNAVAILABLE');
  assert.equal(await pageCountOf(pdfMaterialId), 0, '커밋이 실패했으므로 쪽이 없다');
  const row = await materialRow(pdfMaterialId);
  assert.equal(row.extraction_state, 'PENDING');
  assert.equal(row.page_count, null);
  assert.equal(receivedLogs(logs).length, 0, 'ACCEPTED는 커밋 뒤에만 만들어지므로 수신 확인·판정 로그가 없다');
  const everything = JSON.stringify(logs) + failure.message + failure.stack;
  for (const secret of [SECRET_DB, SECRET_TEXT, SECRET_TITLE, memberId]) assert.equal(everything.includes(secret), false, `노출: ${secret.slice(0, 16)}`);
});

test('R-8: 로그 PDF_EXTRACTION_RECEIVED는 pdfMaterialId·messageId·disposition·code·pageCount만 싣고 글·제목·memberId를 싣지 않는다', async () => {
  const memberId = await insertMember(db);
  const pdfMaterialId = await insertPdf(memberId, { title: SECRET_TITLE });
  const { consumer, logs } = harness();
  const data = succeeded(pdfMaterialId, memberId, [page(1, SECRET_TEXT), page(2, ''), page(3, `${SECRET_TEXT} 3쪽`)]);
  expectReceipt(await consumer.process(job(data)), data, 'ACCEPTED', 'OK');

  const rejected = { ...succeeded(pdfMaterialId, memberId, [{ pageNumber: 1, readable: false, text: SECRET_TEXT }]) };
  assert.equal((await consumer.process(job(rejected))).code, 'SCHEMA_INVALID');
  assert.equal((await consumer.process(job(succeeded(pdfMaterialId, memberId, [page(1, SECRET_TEXT)])))).code, 'ALREADY_RECEIVED');

  const entries = receivedLogs(logs);
  assert.equal(entries.length, 3);
  for (const entry of entries) {
    assert.deepEqual(Object.keys(entry).sort(), ['code', 'disposition', 'event', 'messageId', 'pageCount', 'pdfMaterialId']);
    assert.equal(entry.pdfMaterialId, pdfMaterialId);
    assert.equal(entry.messageId, data.messageId);
  }
  assert.deepEqual(entries.map((entry) => [entry.disposition, entry.code, entry.pageCount]),
    [['ACCEPTED', 'OK', 3], ['REJECTED', 'SCHEMA_INVALID', null], ['DUPLICATE', 'ALREADY_RECEIVED', null]]);
  const text = JSON.stringify(logs);
  for (const secret of [SECRET_TEXT, SECRET_TITLE, memberId, '주민등록번호']) assert.equal(text.includes(secret), false, `로그에 ${secret.slice(0, 12)}…이 있다`);
  assert.equal((await pageRows(pdfMaterialId))[0].text, SECRET_TEXT, '글은 DB에만 저장된다');
});

test('소비자 연결: 작업 ID ≠ messageId는 JOB_ID_MISMATCH, 수신기 없는 조립·모르는 이름은 UNKNOWN_JOB_NAME으로 실패하고 아무것도 저장하지 않으며, PDF 결과 ID는 기록 가능한 작업 ID다', async () => {
  const memberId = await insertMember(db);
  const pdfMaterialId = await insertPdf(memberId);
  const data = succeeded(pdfMaterialId, memberId);
  const { consumer, logs } = harness();

  await expectFailure(consumer.process(job(data, pdfExtractionResultMessageId(randomUUID()))), 'JOB_ID_MISMATCH');
  await expectFailure(consumer.process(job(data, data.messageId, `PdfExtractionResult-${SECRET_TITLE}`)), 'UNKNOWN_JOB_NAME');
  const { consumer: withoutReceiver } = harness({ withReceiver: false });
  await expectFailure(withoutReceiver.process(job(data)), 'UNKNOWN_JOB_NAME');
  assert.equal(await pageCountOf(pdfMaterialId), 0);
  assert.equal((await materialRow(pdfMaterialId)).extraction_state, 'PENDING');
  assert.equal(receivedLogs(logs).length, 0);

  assert.ok(WORKER_JOB_NAMES.includes(PDF_EXTRACTION_RESULT_JOB_NAME));
  assert.equal(loggableJobName(PDF_EXTRACTION_RESULT_JOB_NAME), 'PdfExtractionResult');
  assert.equal(loggableJobId(data.messageId), data.messageId, 'message-pdf-<uuid>-result는 기록해도 되는 작업 ID다');
  assert.equal(loggableJobId(`message-live-${pdfMaterialId}-result`), `message-live-${pdfMaterialId}-result`, '10월 모양은 그대로 허용');
  assert.equal(loggableJobId(`message-pdf-${pdfMaterialId.toUpperCase()}-result`), null);
  assert.equal(loggableJobId(`pdf-extract-${pdfMaterialId}`), null, '요청 메시지 ID는 결과 작업 ID가 아니다');
  assert.equal(loggableJobId(`message-pdf-not-a-uuid-result`), null);

  // 연결이 정상이면 같은 자료가 저장된다(위 실패들이 상태를 바꾸지 않았음).
  assert.equal((await consumer.process(job(data))).code, 'OK');
  assert.equal((await materialRow(pdfMaterialId)).extraction_state, 'DONE');
});

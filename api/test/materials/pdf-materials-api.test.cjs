// U8 Step 5 — PDF 자료 API(POST/GET /v1/pdf-materials, GET /v1/pdf-materials/{id}, GET .../{id}/file, DELETE .../{id}) 시험.
//
// 먼저 정한 시나리오·기대 결과·실패 조건(U8 test-scenarios.md §3 U-1~U-12, 기능 명세 W1, team.md Testing Posture).
// 세부 시험 코드는 구현 뒤 쓴다.
//
// U-1  동의한 회원의 정상 업로드 (AC3.1.2, BR1.6·BR2.4, NFR4.2)
//   - 기대: 201 { pdfMaterialId, title, fileSizeBytes, extractionState: PENDING }, 행 PENDING·시한 = 등록 시각 + 10분, 파일 저장(put) 뒤 발송 1회.
//   - 실패 조건: 상태·시한·순서가 다름, 발송 봉투가 C-16(schemaVersion "2"·messageId·pdfMaterialId·memberId·storageKey)과 다름.
// U-2  동의 없는 회원 (BR1.3, NFR2.1)
//   - 기대: 403 AI_CONSENT_REQUIRED, 본문을 읽지 않음·저장소 미호출·행 없음. 실패 조건: 파일이 저장됨.
// U-3  PDF 아님(선언 종류·머리 바이트) / 누적 20 MB 초과 / 제목 101자 / 정의 밖 필드 / 파일 둘 / 파일 없음 / multipart 아님 (AC3.1.2, BR1.1·BR1.2, NFR1.6·NFR4.1)
//   - 기대: 각 400 VALIDATION_FAILED, 저장소 미호출. 20 MB 초과는 선언 크기와 무관하게 누적 바이트에서 거부. 꼭 20 MB·제목 100자는 저장.
//   - 실패 조건: 저장되거나 500.
// U-4  21벌째 업로드(동시 2건) (BR1.2, NFR4.1, NFR4.19)
//   - 기대: 회원 행 잠금 안에서 1건만 통과, 나머지 400 maxCount·보상 삭제 1회. 실패 조건: 두 건 다 통과.
// U-5  저장소 미설정·put 실패 (BR1.6, NFR4.19) — 기대: 500, 행 없음. 실패 조건: 행이 생김.
// U-6  put 뒤 DB 실패 (BR1.6, NFR6.1) — 기대: delete(materialKey) 1회 → 500, 삭제 실패는 PDF_UPLOAD_STORE_FAILED 로그만. 실패 조건: 파일이 남고 로그 없음.
// U-7  남의 것·없음·UUID 아님으로 상세·원본·삭제 (BR1.8, NFR1.1) — 기대: 모두 404 RESOURCE_UNAVAILABLE. 실패 조건: 구분되는 응답·500.
// U-8  시한 지난 PENDING을 목록·상세에서 읽음 (BR2.2, NFR4.2·NFR4.14) — 기대: FAILED(DEADLINE_EXCEEDED)로 저장되고 응답도 FAILED. 실패 조건: PENDING 그대로.
// U-9  작성자 원본 열람 (BR6.6, NFR1.10) — 기대: 200, 헤더 application/pdf·inline; filename="material.pdf"·no-store·nosniff, 제목은 헤더에 없음.
// U-10 삭제 때 저장소 실패 (BR1.7, NFR5.1) — 기대: 500, DB 유지. 실패 조건: 행이 지워짐.
// U-11 정상 삭제 (BR1.7·BR4.4, NFR5.1·NFR5.2) — 기대: 파일 먼저 삭제(없는 키 포함 성공) → 행 삭제·쪽 연쇄 → 204. 발행 사본은 그대로.
// U-12 추출 요청 발송 실패 (BR2.4, NFR4.14·NFR6.1) — 기대: 로그 PDF_EXTRACT_ENQUEUE_FAILED, 201 유지. 실패 조건: 500 또는 롤백.
//
// 업로드 상한(#574 완료 기준, 팀장 결정 2026-11-16: 회원당 10분 5건, 진행 중 전체 8건·회원당 2건, 본문을 받기 전 20벌 확인).
// L-1  한 회원이 5개를 차례로 올림 → 6번째 → 10분 뒤
//   - 기대: 5건 모두 201, 6번째는 429 RATE_LIMITED + Retry-After(1~600초)이고 저장소 미호출·행 5개 그대로, 다른 회원은 201, 창이 지나면 201.
//   - 실패 조건: 6번째가 저장됨, Retry-After 없음, 다른 회원까지 막힘.
// L-2  동의 없는 요청(403)·이미 20벌(400)은 횟수에 세지 않음
//   - 기대: 각 6번 거부된 뒤에도 동의·자리 확보 후 5건이 201. 20벌 거부는 저장소 미호출(본문을 받기 전).
//   - 실패 조건: 거부된 요청 때문에 429, 20벌 거부가 파일을 저장했다 지움.
// L-3  한 회원의 업로드 2건이 진행 중
//   - 기대: 그 회원의 3번째는 429 RATE_LIMITED(Retry-After 없음)·횟수 미소모, 다른 회원은 받음, 2건이 끝나면 다시 201.
//   - 실패 조건: 3번째가 받아들여짐, 끝난 뒤에도 429.
// L-4  진행 중 업로드가 전체 8건(회원 4명 × 2건)
//   - 기대: 다섯째 회원의 업로드는 429 RATE_LIMITED, 8건이 끝나면 201이고 진행 중 수는 0.
// L-5  자리 반환: 본문 검사 실패(400)·저장 실패(500)·전송 도중 연결 끊김
//   - 기대: 어느 경우든 진행 중 수가 0으로 돌아온다. 실패 조건: 자리가 남아 그 회원이 계속 429.
// L-6  S3가 응답하지 않음(#420, 팀장 결정 2026-11-17: 연결 5초·응답 유휴 15초·총 시도 2회)
//   - 기대: 업로드가 제한 시간 안에 500으로 끝나고 행이 없으며, S3 시도는 총 2회, 진행 중 수는 0, 다음 업로드는 201.
//   - 실패 조건: 업로드가 끝나지 않아 자리를 계속 잡음, 시도가 2회를 넘음, 실패 뒤 행이 남음.
//   - put만 실제 SDK 클라이언트의 S3 드라이버로 돌려 응답하지 않는 로컬 대역(test/file-storage/s3-stub-server.cjs)에 보낸다.
//     연결 제한 5초 → 1초, 유휴 제한 15초 → 300 ms로 줄이고 총 시도 2회는 그대로 둔다(SHORT_LIMITS).
//   - 시험 자체의 시간 제한: 업로드 응답이 SHORT_BOUND_MS 안에 오지 않으면 기다리지 않고 실패한다. 끝날 때 대역·클라이언트를 닫아
//     남은 저장 요청을 끊고, 업로드 요청이 끝났는지와 자리가 0인지 본다.
//
// 실제 AppModule(전역 인증 Guard·오류 형식·no-store)과 테스트 DB를 쓴다. 회원은 개발 로그인으로 만든 합성 회원이고, 파일 저장소는
// 시험 전용 임시 폴더의 로컬 드라이버다(실제 S3 없음). 큐 주소는 비워 발송 실패 경로가 기본이고, 발송 1회는 기록용 가짜 발송기로 본다.
// 저장소·DB·발송 실패 주입은 앱의 같은 인스턴스(app.get)의 메서드를 시험 동안 바꿔 넣는다(U4 발행 시험의 bindFakes와 같은 방식).
// PDF 바이트는 시험 안에서 만든 합성 PDF이며 실제 사용자 자료가 아니다.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const http = require('node:http');
const { existsSync } = require('node:fs');
const { mkdtemp, readdir, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { after, before, beforeEach, test } = require('node:test');
const { AppModule } = require('../../dist/app.module');
const { AI_NOTICE_VERSION, AiConsentGate } = require('../../dist/ai-consent/ai-consent.gate');
const { FILE_STORAGE, StorageUnavailable, materialKey } = require('../../dist/file-storage/file-storage');
const { PDF_MATERIAL_LIMITS } = require('../../dist/materials/pdf-material-input');
const { PdfMaterialStore } = require('../../dist/materials/pdf-material-store');
const { PDF_UPLOAD_RATE_LIMIT, PDF_UPLOAD_SLOTS, PdfUploadGate } = require('../../dist/materials/pdf-upload-gate');
const { PDF_EXTRACT_DISPATCHER } = require('../../dist/pdf-extraction/pdf-extract.dispatcher');
const { PDF_EXTRACT_SCHEMA_VERSION, PDF_EXTRACTION_DEADLINE_MINUTES, pdfExtractMessageId } = require('../../dist/pdf-extraction/pdf-extraction-spec');
const { S3_REQUEST_LIMITS, S3FileStorage } = require('../../dist/file-storage/s3-file-storage');
const { SHORT_BOUND_MS, SHORT_LIMITS, settleWithin, startSilentServer, stubClient } = require('../file-storage/s3-stub-server.cjs');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const { APP_SETTINGS, WEB_ORIGIN, setEnv, startApp, expectError } = require('../u2/support.cjs');

// 로그 비노출 확인용 합성 문자열. 실제 사용자 자료가 아니다.
const SECRET_TITLE = '[합성-PDF-제목-노출확인-7f3a]';
const SECRET_FILE_NAME = 'synthetic-secret-name-7f3a.pdf';
const MAX_BYTES = PDF_MATERIAL_LIMITS.fileSizeBytes;

let server, plain, db, restore, fileRoot, storage, store, dispatcher, uploadGate;
before(async () => {
  fileRoot = await mkdtemp(join(tmpdir(), 'catchu-u8-pdf-materials-'));
  const common = { ...APP_SETTINGS, CATCHU_QUEUE_REDIS_URL: undefined, CATCHU_QUEUE_PREFIX: undefined, FILE_STORAGE_S3_BUCKET: undefined };
  // 저장소 미설정 앱(U-5): 세 설정이 모두 비어 FileStorage의 모든 호출이 StorageUnavailable(NOT_CONFIGURED)이다.
  const restoreUnconfigured = setEnv({ ...common, FILE_STORAGE_DRIVER: undefined, FILE_STORAGE_LOCAL_ROOT: undefined });
  plain = await startApp(AppModule);
  restoreUnconfigured();
  restore = setEnv({ ...common, FILE_STORAGE_DRIVER: 'local', FILE_STORAGE_LOCAL_ROOT: fileRoot });
  server = await startApp(AppModule);
  db = await openTestDataSource();
  storage = server.app.get(FILE_STORAGE);
  store = server.app.get(PdfMaterialStore);
  dispatcher = server.app.get(PDF_EXTRACT_DISPATCHER);
  uploadGate = server.app.get(PdfUploadGate);
});
after(async () => {
  await server?.app.close();
  await plain?.app.close();
  await db?.destroy();
  restore?.();
  await rm(fileRoot, { recursive: true, force: true });
});
beforeEach(async () => {
  await resetTestDatabase(db);
  server.logs.length = 0;
  plain.logs.length = 0;
  await rm(join(fileRoot, 'members'), { recursive: true, force: true });
});

/** 최소 구조의 합성 PDF 바이트. api는 PDF를 파싱하지 않으므로 머리 `%PDF-`와 크기만 의미가 있다. */
function pdfBytes(totalBytes = 0) {
  const head = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n'
    + '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n', 'latin1');
  if (totalBytes <= head.length) return head;
  return Buffer.concat([head, Buffer.alloc(totalBytes - head.length, 0x20)]);
}

/** multipart 업로드. file: null이면 파일 없이, title: undefined면 제목 없이 보낸다. */
async function upload(target, token, { file = pdfBytes(), fileName = 'synthetic.pdf', type = 'application/pdf', title, extra = {}, secondFile } = {}) {
  const form = new FormData();
  if (file !== null) form.append('file', new Blob([file], { type }), fileName);
  if (title !== undefined) form.append('title', title);
  for (const [key, value] of Object.entries(extra)) form.append(key, value);
  if (secondFile) form.append('file', new Blob([secondFile], { type: 'application/pdf' }), 'second.pdf');
  return send(target, token, { method: 'POST', body: form });
}
async function send(target, token, { method = 'GET', path = '/pdf-materials', body, headers = {} } = {}) {
  const response = await fetch(`${target.url}/v1${path}`, { method, body,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, signal: AbortSignal.timeout(60000) });
  const text = await response.text();
  return { status: response.status, headers: response.headers, text, body: text === '' ? null : JSON.parse(text) };
}
const list = (token, query = '') => send(server, token, { path: `/pdf-materials${query}` });
const detail = (token, id) => send(server, token, { path: `/pdf-materials/${id}` });
const remove = (token, id) => send(server, token, { method: 'DELETE', path: `/pdf-materials/${id}` });
async function viewFile(token, id) {
  const response = await fetch(`${server.url}/v1/pdf-materials/${id}/file`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
  const bytes = Buffer.from(await response.arrayBuffer());
  return { status: response.status, headers: response.headers, bytes, text: bytes.toString('utf8') };
}

/** 동의한 회원. 동의는 C-04 AiConsentGate.record로 현재 판본 행을 만든다. */
async function consentedMember(target = server) {
  const member = await target.login(`u8-member-${randomUUID()}`);
  await target.app.get(AiConsentGate).record(member.memberId, AI_NOTICE_VERSION, new Date());
  return member;
}
/** 앱 인스턴스의 메서드를 시험 동안 바꾼다(U4 발행 시험 bindFakes와 같은 방식). 시험이 끝나면 되돌린다. */
function swap(t, target, method, replacement) {
  const original = target[method];
  target[method] = replacement;
  t.after(() => { target[method] = original; });
  return (...args) => original.apply(target, args);
}
/** 기록용 가짜 발송기. 등록 시점에 행이 커밋돼 보이는지 함께 적는다(커밋 뒤 발송 확인). */
function recordingDispatcher(t, events, result = { outcome: 'ENQUEUED' }) {
  const calls = [];
  swap(t, dispatcher, 'dispatchAfterCommit', async (message) => {
    const rows = await db.query('SELECT 1 FROM pdf_material WHERE pdf_material_id = $1', [message.pdfMaterialId]);
    calls.push({ message, committed: rows.length === 1 });
    events.push('dispatch');
    return result;
  });
  return calls;
}
const rows = () => db.query(`SELECT pdf_material_id, member_id, title, storage_key, file_size_bytes, page_count, extraction_state, extraction_failure_code,
  extraction_deadline_at, created_at FROM pdf_material ORDER BY created_at`);
const filePath = (memberId, pdfMaterialId) => join(fileRoot, 'members', memberId, 'materials', `${pdfMaterialId}.pdf`);
async function storedFiles() {
  if (!existsSync(join(fileRoot, 'members'))) return [];
  const entries = await readdir(join(fileRoot, 'members'), { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
}
/** 회원의 PDF 행을 DB에 직접 넣는다(벌 수 채우기). 파일은 두지 않는다. */
async function insertPdfRow(memberId, { title = '[합성] 채우기', state = 'PENDING' } = {}) {
  const pdfMaterialId = randomUUID();
  await db.query(`INSERT INTO pdf_material (pdf_material_id, member_id, title, storage_key, file_size_bytes, page_count, extraction_state,
    extraction_deadline_at, extraction_failure_code, created_at, updated_at)
    VALUES ($1, $2, $3, $4, 1024, NULL, $5, now() + interval '10 minutes', NULL, now(), now())`,
  [pdfMaterialId, memberId, title, materialKey(memberId, pdfMaterialId), state]);
  return pdfMaterialId;
}
function rejected(response, status, code) {
  expectError(response, status, code);
  if (status === 404) assert.deepEqual(response.body, { code: 'RESOURCE_UNAVAILABLE', message: '현재 열람할 수 없는 자료입니다.' });
}
/** Nest의 Logger 재정의는 프로세스 전역이라 두 앱의 인스턴스 로그가 마지막에 만든 앱의 수집기로 간다. 두 수집기를 함께 본다. */
const allLogs = () => [...server.logs, ...plain.logs];
function logsContain(text) {
  return allLogs().some((entry) => entry.text.includes(text));
}
function assertNoSecretsInLogs(secrets) {
  for (const secret of secrets) {
    assert.ok(allLogs().every((entry) => !entry.text.includes(secret)), `로그에 ${secret.slice(0, 12)}…이 있다:\n${allLogs().map((e) => e.text).join('\n')}`);
  }
}

test('U-1: 동의한 회원의 정상 업로드는 201 PENDING이고, 행의 시한은 등록 시각 + 10분이며, 파일 저장 뒤 커밋된 다음 발송이 한 번 간다', async (t) => {
  const member = await consentedMember();
  const events = [];
  const callPut = swap(t, storage, 'put', async (...args) => { events.push('put'); return callPut(...args); });
  const dispatched = recordingDispatcher(t, events);
  const bytes = pdfBytes(4096);

  const response = await upload(server, member.token, { file: bytes, title: '  포트폴리오 PDF  ' });
  assert.equal(response.status, 201, response.text);
  assert.deepEqual(Object.keys(response.body).sort(), ['extractionState', 'fileSizeBytes', 'pdfMaterialId', 'title']);
  assert.equal(response.body.title, '포트폴리오 PDF', '제목은 앞뒤 공백을 지워 저장한다');
  assert.equal(response.body.fileSizeBytes, bytes.length);
  assert.equal(response.body.extractionState, 'PENDING');
  const id = response.body.pdfMaterialId;
  assert.match(id, /^[0-9a-f-]{36}$/);

  const [row] = await rows();
  assert.equal(row.member_id, member.memberId);
  assert.equal(row.extraction_state, 'PENDING');
  assert.equal(row.page_count, null);
  assert.equal(row.extraction_failure_code, null);
  assert.equal(row.storage_key, materialKey(member.memberId, id));
  assert.equal(row.extraction_deadline_at.getTime() - row.created_at.getTime(), PDF_EXTRACTION_DEADLINE_MINUTES * 60_000);
  assert.ok(Math.abs(row.created_at.getTime() - Date.now()) < 30_000);
  assert.ok(existsSync(filePath(member.memberId, id)), '파일이 materialKey 자리에 있다');

  assert.deepEqual(events, ['put', 'dispatch'], '파일 저장 → (커밋) → 발송 순서');
  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0].committed, true, '발송 시점에 행이 커밋돼 밖에서 보인다');
  assert.deepEqual(dispatched[0].message, { schemaVersion: PDF_EXTRACT_SCHEMA_VERSION, messageId: pdfExtractMessageId(id),
    pdfMaterialId: id, memberId: member.memberId, storageKey: materialKey(member.memberId, id) });
  assert.equal(logsContain('PDF_EXTRACT_ENQUEUE_FAILED'), false);

  // 제목이 없으면 파일 이름에서 확장자를 뺀 값이다.
  const named = await upload(server, member.token, { fileName: '이력서 2026.PDF' });
  assert.equal(named.status, 201, named.text);
  assert.equal(named.body.title, '이력서 2026');
});

test('U-2: 동의 없는 회원의 업로드는 403 AI_CONSENT_REQUIRED이고 저장소를 부르지 않으며 행·파일이 없다', async (t) => {
  const member = await server.login(`u8-no-consent-${randomUUID()}`);
  let puts = 0;
  swap(t, storage, 'put', async () => { puts += 1; throw new Error('저장소가 불리면 안 된다'); });
  const response = await upload(server, member.token, { title: SECRET_TITLE, fileName: SECRET_FILE_NAME });
  expectError(response, 403, 'AI_CONSENT_REQUIRED');
  assert.equal(puts, 0);
  assert.deepEqual(await rows(), []);
  assert.deepEqual(await storedFiles(), []);
  rejected(await upload(server, undefined), 401, 'AUTH_REQUIRED');
});

test('U-3: 선언 종류·머리 바이트·누적 20 MB 초과·제목 101자·정의 밖 필드·파일 둘·파일 없음·multipart 아님은 각 400으로 저장소를 부르지 않고, 꼭 20 MB·제목 100자는 저장된다', async (t) => {
  const member = await consentedMember();
  let puts = 0;
  const callPut = swap(t, storage, 'put', async (...args) => { puts += 1; return callPut(...args); });
  // 이 시험은 입력 검사를 본다. 한 회원이 11번 보내므로 횟수 창(10분 5건)을 요청마다 넘긴다. 횟수 상한은 L-1이 본다.
  let calls = 0;
  swap(t, uploadGate, 'now', () => new Date(Date.UTC(2026, 10, 16) + (calls += 1) * PDF_UPLOAD_RATE_LIMIT.windowMs));
  const title100 = '가'.repeat(98) + '😀😀';
  const cases = [
    ['선언 종류가 PDF 아님', { type: 'text/plain' }, [{ field: 'file', reason: 'isPdf' }]],
    ['머리 바이트가 PDF 아님', { file: Buffer.from('hello, not a pdf', 'latin1') }, [{ field: 'file', reason: 'isPdf' }]],
    ['누적 20 MB + 1바이트', { file: pdfBytes(MAX_BYTES + 1) }, [{ field: 'file', reason: 'maxSize' }]],
    ['제목 101자', { title: title100 + '가' }, [{ field: 'title', reason: 'maxLength' }]],
    ['제목 공백만', { title: ' \t ' }, [{ field: 'title', reason: 'isNotEmpty' }]],
    ['정의 밖 필드', { extra: { note: 'x' } }, [{ field: 'body', reason: 'whitelistValidation' }]],
    ['제목과 정의 밖 필드', { title: 't', extra: { note: 'x' } }, [{ field: 'body', reason: 'whitelistValidation' }]],
    ['파일 둘', { secondFile: pdfBytes() }, [{ field: 'file', reason: 'singleFile' }]],
    ['파일 없음', { file: null, title: 't' }, [{ field: 'file', reason: 'isRequired' }]],
  ];
  for (const [label, options, violations] of cases) {
    const response = await upload(server, member.token, options);
    rejected(response, 400, 'VALIDATION_FAILED');
    assert.deepEqual(response.body.details, { violations }, label);
  }
  const json = await send(server, member.token, { method: 'POST', body: JSON.stringify({ title: 't' }), headers: { 'Content-Type': 'application/json' } });
  rejected(json, 400, 'VALIDATION_FAILED');
  assert.deepEqual(json.body.details, { violations: [{ field: 'body', reason: 'isMultipart' }] });
  assert.equal(puts, 0, '검증 실패는 저장소를 부르지 않는다');
  assert.deepEqual(await rows(), []);
  assert.deepEqual(await storedFiles(), []);

  const exact = await upload(server, member.token, { file: pdfBytes(MAX_BYTES), title: title100 });
  assert.equal(exact.status, 201, exact.text);
  assert.equal(exact.body.fileSizeBytes, MAX_BYTES);
  assert.equal(exact.body.title, title100);
  assert.equal(puts, 1);
  assert.equal(uploadGate.active, 0, '검사에서 떨어진 요청도 자리를 돌려준다');
});

test('U-4: 19벌이 있는 회원이 동시에 2건 올리면 회원 행 잠금 안에서 1건만 통과하고, 나머지는 400 maxCount에 파일을 한 번 지운다', async (t) => {
  const member = await consentedMember();
  for (let index = 0; index < PDF_MATERIAL_LIMITS.perMember - 1; index += 1) await insertPdfRow(member.memberId);
  const deletes = [];
  const callDelete = swap(t, storage, 'delete', async (key) => { deletes.push(key); return callDelete(key); });
  let puts = 0;
  const callPut = swap(t, storage, 'put', async (...args) => { puts += 1; return callPut(...args); });
  // 두 요청이 본문을 받기 전의 사전 확인(19벌)을 함께 지난 뒤에야 나아가게 해, 20벌 보장이 잠금 안 확인에서 나오는 것을 본다(#574).
  let arrived = 0;
  let open;
  const both = new Promise((resolve) => { open = resolve; });
  const callCheck = swap(t, store, 'assertBelowLimit', async (memberId) => {
    await callCheck(memberId);
    arrived += 1;
    if (arrived >= 2) open();
    await both;
  });

  const [first, second] = await Promise.all([upload(server, member.token, { title: '동시 1' }), upload(server, member.token, { title: '동시 2' })]);
  const statuses = [first.status, second.status].sort();
  assert.deepEqual(statuses, [201, 400], `${first.text} / ${second.text}`);
  const failed = first.status === 400 ? first : second;
  const passed = first.status === 201 ? first : second;
  assert.equal(failed.body.code, 'VALIDATION_FAILED');
  assert.deepEqual(failed.body.details, { violations: [{ field: 'materials', reason: 'maxCount' }] });
  const stored = await rows();
  assert.equal(stored.length, PDF_MATERIAL_LIMITS.perMember);
  assert.deepEqual(await storedFiles(), [`${passed.body.pdfMaterialId}.pdf`], '통과한 건의 파일만 남고 거부된 건의 파일은 보상 삭제됐다');
  assert.equal(deletes.length, 1);
  assert.notEqual(deletes[0], materialKey(member.memberId, passed.body.pdfMaterialId));

  assert.equal(puts, 2, '동시 2건은 둘 다 사전 확인을 지나 저장까지 갔다');

  // 20벌인 뒤 한 건 더는 본문을 받기 전에 400이다. 저장소를 부르지 않아 지울 파일도 없다(#574).
  const third = await upload(server, member.token, { title: '21벌째' });
  rejected(third, 400, 'VALIDATION_FAILED');
  assert.deepEqual(third.body.details, { violations: [{ field: 'materials', reason: 'maxCount' }] });
  assert.equal((await rows()).length, PDF_MATERIAL_LIMITS.perMember);
  assert.equal(puts, 2);
  assert.equal(deletes.length, 1);
  assert.deepEqual(await storedFiles(), [`${passed.body.pdfMaterialId}.pdf`]);
});

test('L-6: S3가 응답하지 않으면 업로드는 제한 시간 안에 500으로 끝나 행이 생기지 않고, 자리를 돌려줘 다음 업로드를 받는다(#420)', { timeout: 60_000 }, async (t) => {
  fixedClock(t);
  const member = await consentedMember();
  // 이 앱의 저장소는 로컬 드라이버다. put만 실제 SDK 클라이언트를 쓰는 S3 드라이버로 돌려, 응답하지 않는 로컬 대역에 보낸다.
  // 연결 제한 5초 → 1초, 유휴 제한 15초 → 300 ms로 줄이고 총 시도 2회는 그대로 둔다(SHORT_LIMITS). 실제 AWS에는 접속하지 않는다.
  const silent = await startSilentServer(t);
  const client = stubClient(t, silent.endpoint, SHORT_LIMITS);
  const s3 = new S3FileStorage('catchu-test-bucket', client);
  const callPut = swap(t, storage, 'put', (...args) => s3.put(...args));
  // 시험이 어떻게 끝나든 대역과 클라이언트를 닫아 남은 저장 요청을 끊고, 업로드 요청이 끝나 자리가 돌아왔는지 확인한다.
  let pending = Promise.resolve();
  t.after(async () => {
    await silent.close();
    client.destroy();
    await settleWithin(pending.catch(() => {}), SHORT_BOUND_MS, 'L-6 정리: 업로드 요청이 끝남');
    await until(() => uploadGate.active === 0, 'L-6 정리: 업로드 자리가 남지 않음');
    assert.equal(silent.openSockets(), 0, 'L-6 정리: 대역에 열린 소켓이 없다');
  });

  const startedAt = Date.now();
  pending = upload(server, member.token, { title: '응답 없는 저장소' });
  await until(() => uploadGate.active === 1, '저장을 기다리는 동안 업로드가 자리를 잡음');
  // 업로드가 끝나지 않아도 여기서 SHORT_BOUND_MS 뒤에 실패한다(끝없이 기다리지 않는다).
  expectError(await settleWithin(pending, SHORT_BOUND_MS, '응답하지 않는 저장소에서 업로드 응답이 옴'), 500, 'INTERNAL_ERROR');
  const elapsed = Date.now() - startedAt;
  assert.ok(elapsed < SHORT_BOUND_MS, `제한 시간 안에 끝난다(${elapsed}ms)`);
  assert.equal(silent.connections(), S3_REQUEST_LIMITS.maxAttempts, 'S3 시도는 총 2회');
  assert.equal(uploadGate.active, 0, '실패한 업로드가 자리를 돌려준다');
  assert.deepEqual(await rows(), []);

  storage.put = (...args) => callPut(...args);
  const afterwards = await upload(server, member.token, { title: '저장소가 돌아온 뒤' });
  assert.equal(afterwards.status, 201, afterwards.text);
  assert.equal(uploadGate.active, 0);
});

/** 횟수 창의 시계를 시험이 정한다. 돌려주는 함수로 시각을 옮긴다. */
function fixedClock(t) {
  let at = Date.UTC(2026, 10, 16, 0, 0, 0);
  swap(t, uploadGate, 'now', () => new Date(at));
  return (ms) => { at += ms; };
}
/**
 * 지정한 회원들의 put을 처음 `count`건까지 붙잡아 업로드를 진행 중으로 둔다. `held()`는 붙잡힌 수, `release()`는 모두 놓는다.
 * 그보다 많이 오면 붙잡지 않고 지나가게 해, 상한이 듣지 않을 때 시험이 멈추지 않고 201을 보고 실패하게 한다. 시험이 끝나면 놓는다.
 */
function holdPuts(t, memberIds, count) {
  let held = 0;
  let release;
  const gateOpen = new Promise((resolve) => { release = resolve; });
  const callPut = swap(t, storage, 'put', async (key, ...rest) => {
    if (held < count && memberIds.some((id) => key.includes(id))) {
      held += 1;
      await gateOpen;
    }
    return callPut(key, ...rest);
  });
  t.after(() => release());
  return { held: () => held, release };
}
async function until(condition, label) {
  const deadline = Date.now() + 10000;
  while (!condition()) {
    assert.ok(Date.now() < deadline, `${label}: 10초 안에 조건이 차지 않았다`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
function rateLimited(response, { retryAfter }) {
  expectError(response, 429, 'RATE_LIMITED');
  const header = response.headers.get('retry-after');
  if (!retryAfter) return assert.equal(header, null, '진행 중 수 초과에는 Retry-After가 없다');
  assert.match(header ?? '', /^[1-9]\d*$/, 'Retry-After는 1 이상의 정수 초다');
  assert.ok(Number(header) <= PDF_UPLOAD_RATE_LIMIT.windowMs / 1000);
}

test('L-1: 한 회원이 5개를 차례로 올리면 모두 201이고, 10분 안 6번째는 429 RATE_LIMITED(Retry-After)로 저장되지 않으며, 다른 회원은 그대로 올리고 창이 지나면 다시 받는다', async (t) => {
  const advance = fixedClock(t);
  const member = await consentedMember();
  const other = await consentedMember();
  let puts = 0;
  const callPut = swap(t, storage, 'put', async (...args) => { puts += 1; return callPut(...args); });

  assert.equal(PDF_UPLOAD_RATE_LIMIT.maxRequests, 5);
  assert.equal(PDF_UPLOAD_RATE_LIMIT.windowMs, 10 * 60 * 1000);
  for (let index = 0; index < PDF_UPLOAD_RATE_LIMIT.maxRequests; index += 1) {
    const response = await upload(server, member.token, { title: `차례 ${index + 1}` });
    assert.equal(response.status, 201, response.text);
    advance(1000);
  }
  const sixth = await upload(server, member.token, { title: SECRET_TITLE, fileName: SECRET_FILE_NAME });
  rateLimited(sixth, { retryAfter: true });
  assert.deepEqual(sixth.body, { code: 'RATE_LIMITED', message: sixth.body.message }, '429 본문에 값이 실리지 않는다');
  assert.equal(puts, 5, '거부된 요청은 저장소를 부르지 않는다');
  assert.equal((await rows()).length, 5);
  assert.equal((await storedFiles()).length, 5);

  const others = await upload(server, other.token, { title: '다른 회원' });
  assert.equal(others.status, 201, others.text);

  // 첫 요청이 창을 벗어나기 직전까지는 429, 벗어나면 한 건을 다시 받는다.
  advance(PDF_UPLOAD_RATE_LIMIT.windowMs - 5000 - 1);
  rateLimited(await upload(server, member.token, { title: '아직 창 안' }), { retryAfter: true });
  advance(1);
  const afterWindow = await upload(server, member.token, { title: '창이 지난 뒤' });
  assert.equal(afterWindow.status, 201, afterWindow.text);
  assert.equal(uploadGate.active, 0);
  assertNoSecretsInLogs([SECRET_TITLE, SECRET_FILE_NAME]);
});

test('L-2: 동의가 없어 거부된 요청(403)과 이미 20벌이라 거부된 요청(400)은 횟수에 세지 않고, 20벌 거부는 저장소를 부르지 않는다', async (t) => {
  fixedClock(t);
  let puts = 0;
  const callPut = swap(t, storage, 'put', async (...args) => { puts += 1; return callPut(...args); });

  const late = await server.login(`u8-late-consent-${randomUUID()}`);
  for (let index = 0; index <= PDF_UPLOAD_RATE_LIMIT.maxRequests; index += 1) {
    expectError(await upload(server, late.token, { title: '동의 전' }), 403, 'AI_CONSENT_REQUIRED');
  }
  await server.app.get(AiConsentGate).record(late.memberId, AI_NOTICE_VERSION, new Date());
  for (let index = 0; index < PDF_UPLOAD_RATE_LIMIT.maxRequests; index += 1) {
    const response = await upload(server, late.token, { title: `동의 뒤 ${index + 1}` });
    assert.equal(response.status, 201, response.text);
  }
  assert.equal(puts, 5);

  const full = await consentedMember();
  const filler = [];
  for (let index = 0; index < PDF_MATERIAL_LIMITS.perMember; index += 1) filler.push(await insertPdfRow(full.memberId));
  for (let index = 0; index <= PDF_UPLOAD_RATE_LIMIT.maxRequests; index += 1) {
    const response = await upload(server, full.token, { title: '21벌째' });
    rejected(response, 400, 'VALIDATION_FAILED');
    assert.deepEqual(response.body.details, { violations: [{ field: 'materials', reason: 'maxCount' }] });
  }
  assert.equal(puts, 5, '20벌 거부는 본문을 받기 전이라 저장소를 부르지 않는다');
  // 6벌을 비워 5건을 올린 뒤에도 19벌이게 한다. 그래야 마지막 요청이 20벌 확인이 아니라 횟수 제한에 닿는다.
  await db.query('DELETE FROM pdf_material WHERE pdf_material_id = ANY($1::uuid[])', [filler.slice(0, PDF_UPLOAD_RATE_LIMIT.maxRequests + 1)]);
  for (let index = 0; index < PDF_UPLOAD_RATE_LIMIT.maxRequests; index += 1) {
    const response = await upload(server, full.token, { title: `자리 난 뒤 ${index + 1}` });
    assert.equal(response.status, 201, response.text);
  }
  rateLimited(await upload(server, full.token, { title: '6번째' }), { retryAfter: true });
});

test('L-3: 한 회원의 업로드 2건이 진행 중이면 그 회원의 다음 업로드는 429 RATE_LIMITED이고 횟수를 쓰지 않으며, 다른 회원은 받고, 2건이 끝나면 다시 받는다', async (t) => {
  fixedClock(t);
  const member = await consentedMember();
  const other = await consentedMember();
  const hold = holdPuts(t, [member.memberId], PDF_UPLOAD_SLOTS.perMember);

  assert.equal(PDF_UPLOAD_SLOTS.perMember, 2);
  const running = [upload(server, member.token, { title: '진행 1' }), upload(server, member.token, { title: '진행 2' })];
  await until(() => hold.held() === 2, '업로드 2건이 저장 단계에 닿음');
  assert.equal(uploadGate.active, 2);

  for (let index = 0; index < 4; index += 1) rateLimited(await upload(server, member.token, { title: '세 번째' }), { retryAfter: false });
  assert.equal(hold.held(), 2, '거부된 요청은 저장 단계에 가지 않는다');
  const others = await upload(server, other.token, { title: '다른 회원' });
  assert.equal(others.status, 201, others.text);

  hold.release();
  for (const response of await Promise.all(running)) assert.equal(response.status, 201, response.text);
  assert.equal(uploadGate.active, 0);
  // 자리가 없어 거부된 4건이 횟수를 썼다면 여기서 429다(진행 2건 + 아래 3건 = 5건).
  for (let index = 0; index < 3; index += 1) {
    const response = await upload(server, member.token, { title: `끝난 뒤 ${index + 1}` });
    assert.equal(response.status, 201, response.text);
  }
  rateLimited(await upload(server, member.token, { title: '6번째' }), { retryAfter: true });
});

test('L-4: 진행 중 업로드가 전체 8건이면 다른 회원의 업로드도 429 RATE_LIMITED이고, 끝나면 다시 받는다', async (t) => {
  fixedClock(t);
  assert.equal(PDF_UPLOAD_SLOTS.total, 8);
  const members = [];
  for (let index = 0; index < PDF_UPLOAD_SLOTS.total / PDF_UPLOAD_SLOTS.perMember; index += 1) members.push(await consentedMember());
  const fifth = await consentedMember();
  const hold = holdPuts(t, members.map((member) => member.memberId), PDF_UPLOAD_SLOTS.total);

  const running = members.flatMap((member) => [upload(server, member.token, { title: '진행 1' }), upload(server, member.token, { title: '진행 2' })]);
  await until(() => hold.held() === PDF_UPLOAD_SLOTS.total, '업로드 8건이 저장 단계에 닿음');
  assert.equal(uploadGate.active, PDF_UPLOAD_SLOTS.total);

  rateLimited(await upload(server, fifth.token, { title: '아홉 번째' }), { retryAfter: false });
  assert.equal((await rows()).length, 0);

  hold.release();
  for (const response of await Promise.all(running)) assert.equal(response.status, 201, response.text);
  assert.equal(uploadGate.active, 0);
  const afterwards = await upload(server, fifth.token, { title: '끝난 뒤' });
  assert.equal(afterwards.status, 201, afterwards.text);
});

test('L-5: 본문 검사 실패·저장 실패·전송 도중 연결 끊김 뒤에도 업로드 자리가 남지 않는다', async (t) => {
  fixedClock(t);
  const member = await consentedMember();
  rejected(await upload(server, member.token, { type: 'text/plain' }), 400, 'VALIDATION_FAILED');
  assert.equal(uploadGate.active, 0);

  const callPut = swap(t, storage, 'put', async () => { throw new StorageUnavailable('IO_FAILED'); });
  expectError(await upload(server, member.token, { title: '저장 실패' }), 500, 'INTERNAL_ERROR');
  assert.equal(uploadGate.active, 0);
  storage.put = (...args) => callPut(...args);

  // 본문을 다 보내지 않고 연결을 끊는다. 서버는 본문을 기다리는 동안 자리를 잡고 있다가 끊기면 돌려준다.
  const boundary = `----catchu-${randomUUID()}`;
  const target = new URL(`${server.url}/v1/pdf-materials`);
  const request = http.request({ host: target.hostname, port: target.port, path: target.pathname, method: 'POST',
    headers: { Authorization: `Bearer ${member.token}`, 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Transfer-Encoding': 'chunked' } });
  request.on('error', () => {});
  t.after(() => request.destroy());
  request.write(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="synthetic.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.4\n`);
  await until(() => uploadGate.active === 1, '끊기 전 업로드가 자리를 잡음');
  request.destroy();
  await until(() => uploadGate.active === 0, '연결이 끊긴 뒤 자리를 돌려줌');
  assert.deepEqual(await rows(), []);

  const afterwards = await upload(server, member.token, { title: '끊긴 뒤' });
  assert.equal(afterwards.status, 201, afterwards.text);
});

test('U-5: 저장소가 설정되지 않았거나 put이 실패하면 500이고 행이 생기지 않는다', async (t) => {
  const unconfigured = await consentedMember(plain);
  const response = await upload(plain, unconfigured.token, { title: SECRET_TITLE, fileName: SECRET_FILE_NAME });
  expectError(response, 500, 'INTERNAL_ERROR');
  assert.deepEqual(await rows(), []);
  assert.ok(logsContain('PDF_UPLOAD_STORE_FAILED'));
  assert.ok(logsContain('"stage":"put"'));
  assertNoSecretsInLogs([SECRET_TITLE, SECRET_FILE_NAME, 'members/']);

  const member = await consentedMember();
  swap(t, storage, 'put', async () => { throw new StorageUnavailable('IO_FAILED'); });
  const failed = await upload(server, member.token, { title: SECRET_TITLE, fileName: SECRET_FILE_NAME });
  expectError(failed, 500, 'INTERNAL_ERROR');
  assert.deepEqual(await rows(), []);
  assert.deepEqual(await storedFiles(), []);
  assert.ok(logsContain('PDF_UPLOAD_STORE_FAILED'));
  assertNoSecretsInLogs([SECRET_TITLE, SECRET_FILE_NAME, 'members/']);

  // #521 리뷰: 저장 실패 로그는 저장소 사유와 원인 오류 이름으로 설정 누락·권한·파일 시스템 오류를 가린다.
  // 원인의 문구에는 버킷·키·경로가 들어갈 수 있어 이름(또는 Node 오류 코드)만 남긴다.
  const storeFailures = () => allLogs().filter((log) => log.args?.[0]?.event === 'PDF_UPLOAD_STORE_FAILED')
    .map((log) => [log.args[0].stage, log.args[0].error, log.args[0].storageReason, log.args[0].cause]);
  assert.deepEqual(storeFailures(), [['put', 'StorageUnavailable', 'NOT_CONFIGURED', null], ['put', 'StorageUnavailable', 'IO_FAILED', null]],
    '미설정은 NOT_CONFIGURED, 원인 없는 실패는 사유만');
  const BUCKET = 'synthetic-upload-bucket';
  const sdkError = Object.assign(new Error(`AccessDenied on s3://${BUCKET}/members/secret-upload-key.pdf`), { name: 'AccessDenied' });
  const fsError = Object.assign(new Error(`EACCES: permission denied, open 'C:\\secret-root\\members\\secret-upload-key.pdf'`), { code: 'EACCES' });
  const oddName = Object.assign(new Error('x'), { name: `bad name s3://${BUCKET}` });
  for (const [cause, expected] of [[sdkError, 'AccessDenied'], [fsError, 'EACCES'], [oddName, null]]) {
    server.logs.length = 0;
    plain.logs.length = 0;
    storage.put = async () => { throw new StorageUnavailable('IO_FAILED', { cause }); };
    expectError(await upload(server, member.token, { title: SECRET_TITLE, fileName: SECRET_FILE_NAME }), 500, 'INTERNAL_ERROR');
    assert.deepEqual(storeFailures(), [['put', 'StorageUnavailable', 'IO_FAILED', expected]]);
    assertNoSecretsInLogs([BUCKET, 'secret-upload-key', 'secret-root', 'permission denied', 'members/', SECRET_TITLE, SECRET_FILE_NAME]);
  }
});

test('U-6: put 뒤 DB 쓰기가 실패하면 파일을 한 번 지우고 500이며, 그 삭제가 실패하면 PDF_UPLOAD_STORE_FAILED 로그만 남는다(키·제목·파일 이름 없음)', async (t) => {
  const member = await consentedMember();
  swap(t, store, 'create', async () => { throw new Error('synthetic db failure'); });
  const deletes = [];
  const callDelete = swap(t, storage, 'delete', async (key) => { deletes.push(key); return callDelete(key); });

  const response = await upload(server, member.token, { title: SECRET_TITLE, fileName: SECRET_FILE_NAME });
  expectError(response, 500, 'INTERNAL_ERROR');
  assert.equal(deletes.length, 1, '보상 삭제 1회');
  assert.deepEqual(await rows(), []);
  assert.deepEqual(await storedFiles(), [], '보상 삭제로 파일이 남지 않는다');
  assert.ok(logsContain('PDF_UPLOAD_STORE_FAILED'));
  assert.ok(logsContain('"stage":"db"'));
  assertNoSecretsInLogs([SECRET_TITLE, SECRET_FILE_NAME, 'members/', deletes[0]]);

  // 보상 삭제도 실패하면 로그만 남기고 500은 그대로다.
  server.logs.length = 0;
  swap(t, storage, 'delete', async () => { throw new StorageUnavailable('IO_FAILED'); });
  const again = await upload(server, member.token, { title: SECRET_TITLE, fileName: SECRET_FILE_NAME });
  expectError(again, 500, 'INTERNAL_ERROR');
  assert.deepEqual(await rows(), []);
  assert.equal((await storedFiles()).length, 1, '지우지 못한 파일은 남는다(탈퇴 때 memberPrefix로 지워진다)');
  assert.ok(logsContain('"stage":"compensate-delete"'));
  assertNoSecretsInLogs([SECRET_TITLE, SECRET_FILE_NAME, 'members/']);
});

test('U-7: 남의 것·없는 것·UUID 형식이 아닌 ID로 상세·원본·삭제하면 모두 같은 404이고 남의 자료는 바뀌지 않는다', async () => {
  const a = await consentedMember();
  const b = await consentedMember();
  const own = (await upload(server, a.token, { title: 'A의 PDF' })).body;
  const before = await rows();
  const missing = randomUUID();
  server.logs.length = 0;
  for (const id of [own.pdfMaterialId, missing, 'not-a-uuid', '00000000-0000-0000-0000-00000000000g']) {
    rejected(await detail(b.token, id), 404, 'RESOURCE_UNAVAILABLE');
    const file = await viewFile(b.token, id);
    assert.equal(file.status, 404, file.text);
    assert.deepEqual(JSON.parse(file.text), { code: 'RESOURCE_UNAVAILABLE', message: '현재 열람할 수 없는 자료입니다.' });
    rejected(await remove(b.token, id), 404, 'RESOURCE_UNAVAILABLE');
  }
  // 원본 열람의 404는 요청마다 PDF_VIEW_FAILED 한 줄이다(관측 요구사항 NFR6.1). 상세·삭제의 404는 열람이 아니라 남기지 않는다.
  // 자료 ID는 UUID 모양일 때만 적고(소유가 확인된 값이 아님), 요청 원문·키·제목은 적지 않는다.
  const denied = (pdfMaterialId) => ['warn', { event: 'PDF_VIEW_FAILED', stage: 'before-headers', status: 404, reason: null,
    pdfMaterialId, memberId: b.memberId, error: null }];
  assert.deepEqual(server.logs.filter((log) => log.args.at(-1) === 'PdfMaterials').map((log) => [log.level, log.args[0]]),
    [denied(own.pdfMaterialId), denied(missing), denied(null), denied(null)]);
  assertNoSecretsInLogs(['not-a-uuid', '00000000-0000-0000-0000-00000000000g', 'A의 PDF', 'members/', b.token]);
  server.logs.length = 0;
  assert.deepEqual(await rows(), before);
  assert.ok(existsSync(filePath(a.memberId, own.pdfMaterialId)));
  assert.deepEqual((await list(b.token)).body.items, []);
  // 대문자 UUID는 같은 자료로 읽는다.
  assert.equal((await detail(a.token, own.pdfMaterialId.toUpperCase())).status, 200);
  // 본인의 정상 원본 열람은 기록을 남기지 않는다.
  assert.equal((await viewFile(a.token, own.pdfMaterialId)).status, 200);
  assert.ok(!logsContain('PDF_VIEW_FAILED'));
  rejected(await list(undefined), 401, 'AUTH_REQUIRED');
});

test('U-8: 시한이 지난 PENDING은 목록·상세에서 읽을 때 FAILED(DEADLINE_EXCEEDED)로 저장되고 응답도 FAILED이며, 목록은 cursor로 끝까지 읽는다', async () => {
  const member = await consentedMember();
  const expired = (await upload(server, member.token, { title: '시한 지남' })).body.pdfMaterialId;
  const fresh = (await upload(server, member.token, { title: '아직 대기' })).body.pdfMaterialId;
  await db.query("UPDATE pdf_material SET extraction_deadline_at = clock_timestamp() - interval '1 second' WHERE pdf_material_id = $1", [expired]);

  const page = await list(member.token);
  assert.equal(page.status, 200, page.text);
  const byId = Object.fromEntries(page.body.items.map((item) => [item.pdfMaterialId, item]));
  assert.deepEqual(Object.keys(byId[expired]).sort(), ['extractionState', 'failureCode', 'fileSizeBytes', 'pageCount', 'pdfMaterialId', 'title']);
  assert.equal(byId[expired].extractionState, 'FAILED');
  assert.equal(byId[expired].failureCode, 'DEADLINE_EXCEEDED');
  assert.equal(byId[fresh].extractionState, 'PENDING');
  assert.equal(byId[fresh].failureCode, null);
  const stored = Object.fromEntries((await rows()).map((row) => [row.pdf_material_id, row]));
  assert.equal(stored[expired].extraction_state, 'FAILED');
  assert.equal(stored[expired].extraction_failure_code, 'DEADLINE_EXCEEDED');
  assert.equal(stored[fresh].extraction_state, 'PENDING');

  // 상세도 같은 판정을 거치고, 이미 FAILED인 행은 다시 바뀌지 않는다(쪽 목록은 아직 없음).
  const shown = await detail(member.token, expired);
  assert.equal(shown.status, 200, shown.text);
  assert.equal(shown.body.extractionState, 'FAILED');
  assert.equal(shown.body.failureCode, 'DEADLINE_EXCEEDED');
  assert.deepEqual(shown.body.pages, []);
  await db.query("UPDATE pdf_material SET extraction_deadline_at = clock_timestamp() - interval '1 second' WHERE pdf_material_id = $1", [fresh]);
  assert.equal((await detail(member.token, fresh)).body.extractionState, 'FAILED');

  // 목록은 최신순으로 cursor를 따라 끝까지 읽고 잘못된 쿼리는 400이다.
  const seen = [];
  let cursor = null;
  do {
    const part = await list(member.token, `?limit=1${cursor ? `&cursor=${cursor}` : ''}`);
    assert.equal(part.status, 200, part.text);
    assert.equal(part.body.items.length, 1);
    seen.push(part.body.items[0].pdfMaterialId);
    cursor = part.body.page.nextCursor;
  } while (cursor);
  assert.deepEqual(seen, [fresh, expired]);
  const firstCursor = (await list(member.token, '?limit=1')).body.page.nextCursor;
  for (const query of ['?limit=0', '?limit=101', '?cursor=%%%', '?cursor=e30', '?unknown=1', `?cursor=${firstCursor}x`]) {
    rejected(await list(member.token, query), 400, 'VALIDATION_FAILED');
  }
  const other = await consentedMember();
  rejected(await list(other.token, `?cursor=${firstCursor}`), 400, 'VALIDATION_FAILED');
});

test('U-9: 작성자 원본 열람은 200에 헤더 4종(application/pdf·inline material.pdf·no-store·nosniff)이고 제목은 헤더에 없으며, 파일이 없으면 500과 PDF_VIEW_FAILED 로그다', async () => {
  const member = await consentedMember();
  const bytes = pdfBytes(8192);
  const created = (await upload(server, member.token, { file: bytes, title: SECRET_TITLE, fileName: SECRET_FILE_NAME })).body;

  const shown = await viewFile(member.token, created.pdfMaterialId);
  assert.equal(shown.status, 200);
  assert.equal(shown.headers.get('content-type'), 'application/pdf');
  assert.equal(shown.headers.get('content-disposition'), 'inline; filename="material.pdf"');
  assert.equal(shown.headers.get('cache-control'), 'no-store');
  assert.equal(shown.headers.get('x-content-type-options'), 'nosniff');
  for (const [, value] of shown.headers) {
    assert.ok(!value.includes(SECRET_TITLE) && !value.includes(SECRET_FILE_NAME) && !value.includes('members/'), `헤더에 제목·파일 이름·키가 없다: ${value}`);
  }
  assert.ok(shown.bytes.equals(bytes), '올린 바이트 그대로 내려준다');

  // 사본 열람과 달리 작성자 상세에는 제목과 쪽 목록이 있다(쪽 글은 없음).
  const summary = await detail(member.token, created.pdfMaterialId);
  assert.deepEqual(Object.keys(summary.body).sort(), ['extractionState', 'failureCode', 'fileSizeBytes', 'pageCount', 'pages', 'pdfMaterialId', 'title']);

  // 행은 있는데 파일이 없으면(저장소 불일치) 헤더 전에 500으로 끝나고 로그에 키·제목은 없다.
  await storage.delete(materialKey(member.memberId, created.pdfMaterialId));
  server.logs.length = 0;
  const missing = await viewFile(member.token, created.pdfMaterialId);
  assert.equal(missing.status, 500, missing.text);
  assert.equal(JSON.parse(missing.text).code, 'INTERNAL_ERROR');
  assert.ok(logsContain('PDF_VIEW_FAILED'));
  assert.ok(logsContain('"stage":"before-headers"'));
  assert.ok(logsContain('"reason":"file-missing"'));
  assertNoSecretsInLogs([SECRET_TITLE, SECRET_FILE_NAME, 'members/']);
});

test('U-10: 삭제 때 저장소가 실패하면 500이고 행과 파일이 그대로이며 로그에 키·제목이 없다', async (t) => {
  const member = await consentedMember();
  const created = (await upload(server, member.token, { title: SECRET_TITLE, fileName: SECRET_FILE_NAME })).body;
  server.logs.length = 0;
  swap(t, storage, 'delete', async () => { throw new StorageUnavailable('IO_FAILED'); });
  const response = await remove(member.token, created.pdfMaterialId);
  expectError(response, 500, 'INTERNAL_ERROR');
  assert.equal((await rows()).length, 1, 'DB 행은 그대로다');
  assert.ok(existsSync(filePath(member.memberId, created.pdfMaterialId)));
  assert.ok(logsContain('PDF_DELETE_STORAGE_FAILED'));
  assertNoSecretsInLogs([SECRET_TITLE, SECRET_FILE_NAME, 'members/']);
  assert.equal((await detail(member.token, created.pdfMaterialId)).status, 200, '삭제 실패 뒤에도 자료는 그대로 보인다');
});

test('U-11: 정상 삭제는 파일을 먼저 지우고(없는 키도 성공) 행과 쪽을 연쇄 삭제해 204이며, 발행 사본은 그대로다', async (t) => {
  const member = await consentedMember();
  const created = (await upload(server, member.token, { title: '삭제할 PDF' })).body;
  const id = created.pdfMaterialId;
  // 쪽별 글과 발행 사본(published_item PDF_MATERIAL + published_pdf_page)을 DB에 직접 만든다(U8 Step 6·8 전의 합성 행).
  await db.query(`INSERT INTO pdf_page_text (pdf_page_text_id, pdf_material_id, page_number, text, readable) VALUES ($1, $2, 1, '합성 쪽 글', true), ($3, $2, 2, '', false)`,
    [randomUUID(), id, randomUUID()]);
  const publicationId = randomUUID();
  await db.query(`INSERT INTO publication (publication_id, member_id, title, link_token_reference, published_at, expires_at)
    VALUES ($1, $2, '합성 발행본', $3, now(), now() + interval '2160 hours')`, [publicationId, member.memberId, randomUUID()]);
  const publishedItemId = randomUUID();
  await db.query(`INSERT INTO published_item (published_item_id, publication_id, position, item_kind, source_id, title, snapshot, pdf_copy_key)
    VALUES ($1, $2, 1, 'PDF_MATERIAL', $3, '합성 PDF', $4, $5)`,
  [publishedItemId, publicationId, id, JSON.stringify({ pageCount: 2 }), `members/${member.memberId}/publications/${publicationId}/${publishedItemId}.pdf`]);
  await db.query(`INSERT INTO published_pdf_page (published_pdf_page_id, published_item_id, page_number, text, readable) VALUES ($1, $2, 1, '합성 쪽 글', true)`,
    [randomUUID(), publishedItemId]);
  assert.deepEqual((await detail(member.token, id)).body.pages, [{ pageNumber: 1, readable: true }, { pageNumber: 2, readable: false }]);

  const order = [];
  const callDelete = swap(t, storage, 'delete', async (key) => {
    const present = await db.query('SELECT 1 FROM pdf_material WHERE pdf_material_id = $1', [id]);
    order.push({ key, rowStillPresent: present.length === 1 });
    return callDelete(key);
  });
  const response = await remove(member.token, id);
  assert.equal(response.status, 204, response.text);
  assert.equal(response.text, '');
  assert.deepEqual(order, [{ key: materialKey(member.memberId, id), rowStillPresent: true }], '파일 삭제가 행 삭제보다 먼저다');
  assert.equal(existsSync(filePath(member.memberId, id)), false);
  assert.deepEqual(await rows(), []);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM pdf_page_text WHERE pdf_material_id = $1', [id]))[0].n, 0, '쪽은 연쇄 삭제');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM published_item WHERE published_item_id = $1', [publishedItemId]))[0].n, 1, '발행 항목 사본은 남는다');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM published_pdf_page WHERE published_item_id = $1', [publishedItemId]))[0].n, 1, '쪽 사본은 남는다');
  rejected(await detail(member.token, id), 404, 'RESOURCE_UNAVAILABLE');
  rejected(await remove(member.token, id), 404, 'RESOURCE_UNAVAILABLE');

  // 파일이 이미 없는 자료도 삭제는 204다(없는 키 삭제는 성공).
  const orphan = (await upload(server, member.token, { title: '파일 없는 PDF' })).body;
  await rm(filePath(member.memberId, orphan.pdfMaterialId));
  assert.equal((await remove(member.token, orphan.pdfMaterialId)).status, 204);
  assert.deepEqual(await rows(), []);
});

test('U-12: 추출 요청 발송이 실패하거나 예외를 던져도 201 PENDING이 유지되고 PDF_EXTRACT_ENQUEUE_FAILED 로그만 남는다(키·제목·파일 이름 없음)', async (t) => {
  const member = await consentedMember();
  // 기본: 큐 주소가 없어 QUEUE_NOT_CONFIGURED로 실패한다(개발·시험 기본).
  const response = await upload(server, member.token, { title: SECRET_TITLE, fileName: SECRET_FILE_NAME });
  assert.equal(response.status, 201, response.text);
  assert.ok(logsContain('PDF_EXTRACT_ENQUEUE_FAILED'));
  assert.ok(logsContain('QUEUE_NOT_CONFIGURED'));
  assertNoSecretsInLogs([SECRET_TITLE, SECRET_FILE_NAME, 'members/']);
  assert.equal((await rows())[0].extraction_state, 'PENDING', '롤백 없음');

  // 발송기가 예외를 던져도 같다.
  server.logs.length = 0;
  swap(t, dispatcher, 'dispatchAfterCommit', async () => { throw Object.assign(new Error('synthetic enqueue failure'), { name: 'SyntheticQueueError' }); });
  const again = await upload(server, member.token, { title: SECRET_TITLE, fileName: SECRET_FILE_NAME });
  assert.equal(again.status, 201, again.text);
  assert.ok(logsContain('PDF_EXTRACT_ENQUEUE_FAILED'));
  assert.ok(logsContain('SyntheticQueueError'));
  assertNoSecretsInLogs([SECRET_TITLE, SECRET_FILE_NAME, 'members/']);
  assert.equal((await rows()).length, 2);
  assert.ok(existsSync(filePath(member.memberId, again.body.pdfMaterialId)));
});

// #521 리뷰(Codex 지적 → 2026-11-12 팀장 결정): 탈퇴는 차단 → 회원 파일 삭제 → 자격정보 삭제 → 회원 행 삭제 순서라, 파일 삭제(2단계)와
// 회원 행 삭제(4단계) 사이에 끝난 파일 쓰기는 행만 연쇄 삭제되고 원본이 남았다. 4단계가 한 트랜잭션에서 회원 행을 지운 뒤 회원 파일을
// 한 번 더 지우고 커밋하도록 고쳤다(src/withdrawal/withdrawal.service.ts, 계약 C-06).
// 아래 두 시험은 실제 시험 DB와 로컬 파일 저장소를 쓰고, 순서는 저장소 호출의 동기화 지점으로 고정한다(기다리는 시간으로 맞추지 않는다).
const gate = () => { let open; const reached = new Promise((resolve) => { open = resolve; }); return { reached, open }; };
const within = (promise, label) => Promise.race([promise,
  new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error(`동기화 지점에 닿지 못함: ${label}`)), 20000); timer.unref(); })]);
/** 탈퇴의 2단계(그 회원 접두어의 첫 deletePrefix)가 끝난 자리에서 탈퇴를 멈춘다. 4단계 안의 두 번째 호출은 그대로 지나간다. */
function pauseAfterFirstSweep(t, memberId) {
  const swept = gate();
  const release = gate();
  let calls = 0;
  const original = swap(t, storage, 'deletePrefix', async (...args) => {
    const result = await original(...args);
    if (String(args[0]) !== `members/${memberId}/`) return result;
    calls += 1;
    if (calls === 1) { swept.open(); await release.reached; }
    return result;
  });
  return { swept, release, calls: () => calls };
}
async function filesUnder(memberId) {
  const dir = join(fileRoot, 'members', memberId);
  return existsSync(dir) ? (await readdir(dir, { recursive: true, withFileTypes: true })).filter((entry) => entry.isFile()).length : 0;
}

// 순서: 탈퇴가 세션 폐기·회원 파일 삭제(2단계)를 마치고 멈춤 → 같은 회원이 실제 로그인 경로(POST /v1/auth/dev-login)로 다시 로그인
//   → 새 토큰으로 PDF를 올려 201(파일·행이 모두 생김) → 탈퇴가 이어져 4단계를 마침.
// 기대: 탈퇴 204. 탈퇴 회원의 회원 행·PDF 행·세션 행과 원본 파일이 모두 없고, 다른 회원의 PDF 행과 파일은 그대로다.
// 수정 전 결과: 업로드 201, 탈퇴 204, 원본 파일 1개가 남았다(U8 코드 요약 §20.2).
test('#521: 탈퇴의 2단계 직후 다시 로그인해 올린 PDF의 파일과 행이 탈퇴가 끝난 뒤 남지 않고, 다른 회원의 PDF는 그대로다', async (t) => {
  const other = await consentedMember();
  const kept = await upload(server, other.token, { title: '다른 회원의 PDF' });
  assert.equal(kept.status, 201);
  const identity = `u8-member-${randomUUID()}`;
  const leaving = await server.login(identity);
  await server.app.get(AiConsentGate).record(leaving.memberId, AI_NOTICE_VERSION, new Date());
  const before = await upload(server, leaving.token, { title: '탈퇴 전에 올린 PDF' });
  assert.equal(before.status, 201);

  const sweep = pauseAfterFirstSweep(t, leaving.memberId);
  const withdrawing = send(server, leaving.token, { method: 'DELETE', path: '/me', headers: { Origin: WEB_ORIGIN } });
  await within(sweep.swept.reached, '탈퇴가 2단계(회원 파일 삭제)를 마침');
  assert.equal(await filesUnder(leaving.memberId), 0, '2단계가 그때까지의 원본을 지웠다');
  expectError(await list(leaving.token), 401, 'AUTH_INVALID');

  // 회원 행이 아직 있는 동안 다시 로그인해 새 PDF를 올린다. 파일과 행이 모두 생긴다.
  const relogin = await within(send(server, null, { method: 'POST', path: '/auth/dev-login',
    body: JSON.stringify({ memberId: identity }), headers: { 'Content-Type': 'application/json' } }), '재로그인 응답');
  assert.equal(relogin.status, 200, relogin.text);
  const late = await within(upload(server, relogin.body.accessToken, { title: '탈퇴 도중 올린 PDF' }), '탈퇴 도중 업로드 응답');
  assert.equal(late.status, 201, late.text);
  assert.equal(existsSync(filePath(leaving.memberId, late.body.pdfMaterialId)), true, '2단계 뒤에 쓴 원본이 저장소에 있다');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM pdf_material WHERE member_id = $1', [leaving.memberId]))[0].n, 2);

  sweep.release.open();
  const withdrawn = await within(withdrawing, '탈퇴 응답');
  assert.equal(withdrawn.status, 204, `탈퇴는 끝까지 간다: ${withdrawn.text}`);
  assert.equal(sweep.calls(), 2, '회원 파일 삭제는 2단계와 4단계 안에서 한 번씩 불린다');

  assert.deepEqual(await db.query('SELECT 1 FROM member_account WHERE member_id = $1', [leaving.memberId]), [], '탈퇴 회원 행이 없다');
  assert.deepEqual(await db.query('SELECT 1 FROM pdf_material WHERE member_id = $1', [leaving.memberId]), [], '탈퇴 회원의 PDF 행이 없다');
  assert.deepEqual(await db.query('SELECT 1 FROM auth_session WHERE member_id = $1', [leaving.memberId]), [], '탈퇴 회원의 세션 행이 없다');
  assert.equal(await filesUnder(leaving.memberId), 0, '탈퇴 회원의 원본 파일이 저장소에 남지 않는다');
  assert.deepEqual((await db.query('SELECT pdf_material_id AS id FROM pdf_material WHERE member_id = $1', [other.memberId])).map((row) => row.id),
    [kept.body.pdfMaterialId], '다른 회원의 PDF 행은 그대로다');
  assert.equal(existsSync(filePath(other.memberId, kept.body.pdfMaterialId)), true, '다른 회원의 원본 파일은 그대로다');
  assertNoSecretsInLogs(['members/']);
});

// 순서: 업로드가 인증·검사를 지나 원본 저장 직전에 멈춤 → 탈퇴가 2단계를 마치고 멈춤 → 업로드가 원본을 저장하고 행까지 넣어 끝남
//   → 탈퇴가 이어져 4단계를 마침. 재로그인 없이, 탈퇴 전에 이미 인증된 요청이 늦게 끝나는 경우다.
// 기대: 업로드는 회원 행이 아직 있어 201로 끝나고, 탈퇴 204 뒤에는 그 파일과 행이 모두 없다. 다른 회원의 자료는 그대로다.
test('#521: 탈퇴 전에 시작해 2단계 뒤에 끝난 업로드의 파일과 행도 탈퇴가 끝난 뒤 남지 않는다', async (t) => {
  const other = await consentedMember();
  const kept = await upload(server, other.token, { title: '다른 회원의 PDF' });
  assert.equal(kept.status, 201);
  const leaving = await consentedMember();

  const uploadAtPut = gate();
  const releasePut = gate();
  const originalPut = swap(t, storage, 'put', async (...args) => {
    if (!String(args[0]).startsWith(`members/${leaving.memberId}/`)) return originalPut(...args);
    uploadAtPut.open();
    await releasePut.reached;
    return originalPut(...args);
  });
  const sweep = pauseAfterFirstSweep(t, leaving.memberId);

  const uploading = upload(server, leaving.token, { title: '탈퇴 직전에 올린 PDF' });
  await within(uploadAtPut.reached, '업로드가 저장 직전');
  const withdrawing = send(server, leaving.token, { method: 'DELETE', path: '/me', headers: { Origin: WEB_ORIGIN } });
  await within(sweep.swept.reached, '탈퇴가 2단계(회원 파일 삭제)를 마침');
  releasePut.open();
  const uploaded = await within(uploading, '업로드 응답');
  assert.equal(uploaded.status, 201, uploaded.text);
  assert.equal(await filesUnder(leaving.memberId), 1, '2단계 뒤에 쓴 원본이 저장소에 있다');
  sweep.release.open();
  const withdrawn = await within(withdrawing, '탈퇴 응답');
  assert.equal(withdrawn.status, 204, `탈퇴는 끝까지 간다: ${withdrawn.text}`);

  assert.deepEqual(await db.query('SELECT 1 FROM member_account WHERE member_id = $1', [leaving.memberId]), [], '탈퇴 회원 행이 없다');
  assert.deepEqual(await db.query('SELECT 1 FROM pdf_material WHERE member_id = $1', [leaving.memberId]), [], '탈퇴 회원의 PDF 행이 없다');
  assert.equal(await filesUnder(leaving.memberId), 0, '탈퇴 회원의 원본 파일이 저장소에 남지 않는다');
  assert.deepEqual((await db.query('SELECT pdf_material_id AS id FROM pdf_material WHERE member_id = $1', [other.memberId])).map((row) => row.id),
    [kept.body.pdfMaterialId], '다른 회원의 PDF 행은 그대로다');
  assert.equal(existsSync(filePath(other.memberId, kept.body.pdfMaterialId)), true, '다른 회원의 원본 파일은 그대로다');
});

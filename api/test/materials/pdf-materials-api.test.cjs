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
// 실제 AppModule(전역 인증 Guard·오류 형식·no-store)과 테스트 DB를 쓴다. 회원은 개발 로그인으로 만든 합성 회원이고, 파일 저장소는
// 시험 전용 임시 폴더의 로컬 드라이버다(실제 S3 없음). 큐 주소는 비워 발송 실패 경로가 기본이고, 발송 1회는 기록용 가짜 발송기로 본다.
// 저장소·DB·발송 실패 주입은 앱의 같은 인스턴스(app.get)의 메서드를 시험 동안 바꿔 넣는다(U4 발행 시험의 bindFakes와 같은 방식).
// PDF 바이트는 시험 안에서 만든 합성 PDF이며 실제 사용자 자료가 아니다.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
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
const { PDF_EXTRACT_DISPATCHER } = require('../../dist/pdf-extraction/pdf-extract.dispatcher');
const { PDF_EXTRACT_SCHEMA_VERSION, PDF_EXTRACTION_DEADLINE_MINUTES, pdfExtractMessageId } = require('../../dist/pdf-extraction/pdf-extraction-spec');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const { APP_SETTINGS, setEnv, startApp, expectError } = require('../u2/support.cjs');

// 로그 비노출 확인용 합성 문자열. 실제 사용자 자료가 아니다.
const SECRET_TITLE = '[합성-PDF-제목-노출확인-7f3a]';
const SECRET_FILE_NAME = 'synthetic-secret-name-7f3a.pdf';
const MAX_BYTES = PDF_MATERIAL_LIMITS.fileSizeBytes;

let server, plain, db, restore, fileRoot, storage, store, dispatcher;
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
});

test('U-4: 19벌이 있는 회원이 동시에 2건 올리면 회원 행 잠금 안에서 1건만 통과하고, 나머지는 400 maxCount에 파일을 한 번 지운다', async (t) => {
  const member = await consentedMember();
  for (let index = 0; index < PDF_MATERIAL_LIMITS.perMember - 1; index += 1) await insertPdfRow(member.memberId);
  const deletes = [];
  const callDelete = swap(t, storage, 'delete', async (key) => { deletes.push(key); return callDelete(key); });

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

  // 20벌인 뒤 한 건 더는 동시가 아니어도 400이고 파일을 지운다.
  const third = await upload(server, member.token, { title: '21벌째' });
  rejected(third, 400, 'VALIDATION_FAILED');
  assert.equal((await rows()).length, PDF_MATERIAL_LIMITS.perMember);
  assert.equal(deletes.length, 2);
  assert.deepEqual(await storedFiles(), [`${passed.body.pdfMaterialId}.pdf`]);
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

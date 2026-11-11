// U8 Step 9 — 받은 사람·작성자 PDF 사본 열람 시험(GET /v1/public/links/{token}/items/{publishedItemId}/pdf,
// GET /v1/publications/{id}/items/{itemId}/pdf)과 시나리오 X-1(PDF 사본이 있는 발행본 삭제).
//
// 먼저 정한 시나리오·기대 결과·실패 조건(U8 시나리오 표 V-1~V-7·X-1, 기능 명세 W4·W5, 규칙 BR6.1·BR6.2·BR6.5·BR6.6·BR6.7·BR7.1,
// 보안 설계 §6, 신뢰성 설계 「열람」, 관측 설계 PDF_VIEW_FAILED). 세부 시험 코드는 구현 뒤 썼다.
// V-1 비밀번호 링크에 grant 없음·틀림·다른 발행본 grant — 기대: 401 LINK_PASSWORD_REQUIRED, 항목이 있든 없든 같다. 실패 조건: 파일을 내려줌.
// 거부 기록(관측 요구사항 NFR6.1 「열람 실패 코드(401·404·500)」, V-1~V-3에서 함께 본다) — 기대: 받은 사람 401·404마다 PDF_VIEW_FAILED 한 줄
//   (before-headers, 상태 코드, 알 수 있으면 publicationId, UUID 모양일 때만 publishedItemId), 응답은 그대로. 실패 조건: 토큰·grant·키·요청 원문이 로그에 남음.
// V-2 중지·만료·삭제된 링크, 형식이 틀린 토큰 — 기대: 404 LINK_UNAVAILABLE. 실패 조건: 파일을 내려줌.
// V-3 다른 발행본의 항목·텍스트 항목·없는 항목·UUID 아님 — 기대: 구분 없는 404 LINK_UNAVAILABLE. 실패 조건: 구분되는 응답·500.
// V-4 사본 행은 있는데 파일 없음·저장소 장애 — 기대: 500 INTERNAL_ERROR, PDF_VIEW_FAILED(before-headers) 로그에 키 값 없음. 실패 조건: 키 노출.
// V-5 정상 열람 — 기대: 200, 헤더 4종, 본문은 발행 시점 사본(원본을 바꾸거나 지워도 그대로), Range는 무시하고 전체, 시도 제한 없음.
// V-6 작성자 — 기대: 중지·만료 뒤에도 200. 남의 발행본·그 발행본에 없는 항목·PDF 아닌 항목은 같은 404, 토큰 없으면 401.
//   작성자 404도 요청마다 PDF_VIEW_FAILED 한 줄(회원 ID, 소유가 확인된 뒤에만 발행본 ID). 정상 열람·401·400은 기록 없음.
// V-7 전송 도중 스트림 오류 — 기대: 연결 중단(본문 수신 실패), PDF_VIEW_FAILED(streaming, aborted) 로그. 실패 조건: 200 본문 일부로 정상 종료.
// X-1 PDF를 발행 API로 발행한 뒤 삭제 API로 삭제 — 기대: 그 발행본의 사본 파일·published_pdf_page 행이 없고, 원본 PDF와 다른 발행본의 사본은 남는다.
//
// 실제인 것: AppModule·테스트 DB·개발 로그인 회원·로컬 파일 저장소 드라이버(임시 폴더)·업로드 API·발행 API·삭제 API·열람 API.
// 합성인 것: PDF 바이트, 쪽 글(추출 worker를 거치지 않고 DB에 직접 넣어 DONE으로 만든다), U2 AiRun·U3 PublishedIndexWriter 가짜.
// 실제 S3는 쓰지 않는다(로컬 드라이버만). V-4의 저장소 장애와 V-7의 스트림 오류는 FileStorage.get을 시험 대역으로 바꿔 만든다.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { existsSync } = require('node:fs');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { Readable } = require('node:stream');
const { after, before, beforeEach, test } = require('node:test');
const { AppModule } = require('../../dist/app.module');
const { FILE_STORAGE, StorageUnavailable, materialKey, publicationPrefix, publishedPdfKey } = require('../../dist/file-storage/file-storage');
const { PUBLICATION_TTL_HOURS } = require('../../dist/publications/publication.entity');
const { PublicationManageService } = require('../../dist/publications/publication-manage.service');
const { PublishedPdfViewService } = require('../../dist/publications/published-pdf-view.service');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const {
  PUBLISH_SETTINGS, HOUR, setEnv, startApp, insertTextMaterial, consent, fakeAiRun, fakeIndexWriter, bindFakes, setClock, body,
  textItem, tokenOf, unlockRaw,
} = require('./support.cjs');

// 비노출 확인용 합성 문자열. 실제 사용자 자료가 아니다.
const PASSWORD = 'synthetic-pdf-view-password-1!';
const SECRET_TITLE = '[합성-PDF-제목-노출확인-9c41]';
const START = new Date('2026-11-10T00:00:00.000Z');
const HEADERS = {
  'content-type': 'application/pdf',
  'content-disposition': 'inline; filename="document.pdf"',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

let server, db, restore, fileRoot, storage, viewer, unbind, now, unsetClock;
const secrets = new Set([PASSWORD, SECRET_TITLE, 'members/']);

before(async () => {
  fileRoot = await mkdtemp(join(tmpdir(), 'catchu-u8-recipient-pdf-'));
  restore = setEnv({ ...PUBLISH_SETTINGS, TRUST_PROXY_CIDRS: undefined, FILE_STORAGE_S3_BUCKET: undefined,
    FILE_STORAGE_DRIVER: 'local', FILE_STORAGE_LOCAL_ROOT: fileRoot });
  server = await startApp(AppModule);
  db = await openTestDataSource();
  storage = server.app.get(FILE_STORAGE);
  viewer = server.app.get(PublishedPdfViewService);
});
after(async () => {
  unsetClock?.();
  await server?.app.close();
  await db?.destroy();
  restore?.();
  await rm(fileRoot, { recursive: true, force: true });
});
beforeEach(async () => {
  await resetTestDatabase(db);
  await rm(join(fileRoot, 'members'), { recursive: true, force: true });
  server.logs.length = 0;
  unbind?.();
  unbind = bindFakes(server.app, { aiRun: fakeAiRun(db), indexWriter: fakeIndexWriter(db) });
  unsetClock?.();
  now = START;
  unsetClock = setClock(server.app, () => now);
  server.app.get(PublicationManageService).files = storage;
  viewer.files = storage;
});

/** 최소 구조의 합성 PDF 바이트. marker로 파일마다 내용을 다르게 하고, 여러 조각으로 전송되도록 크기를 키운다. */
function pdfBytes(marker, totalBytes = 96 * 1024) {
  const head = Buffer.from(`%PDF-1.4\n% ${marker}\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n`
    + '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n', 'latin1');
  return Buffer.concat([head, Buffer.alloc(Math.max(0, totalBytes - head.length), 0x20)]);
}

async function author(identity = `u8-view-owner-${randomUUID()}`) {
  const member = await server.login(identity);
  await consent(server.app, member.memberId);
  secrets.add(member.token);
  return member;
}

/**
 * 업로드 API로 원본 PDF를 올리고(로컬 저장소에 실제 파일이 생긴다), 추출이 끝난 것처럼 DB에서 DONE·쪽 글을 채운다.
 * 추출 worker는 이 시험에 없다. 쪽 글은 합성 문자열이다.
 */
async function uploadPdf(member, bytes, pages = ['[합성] 1쪽 글', '']) {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'application/pdf' }), 'synthetic.pdf');
  form.append('title', SECRET_TITLE);
  const response = await fetch(`${server.url}/v1/pdf-materials`, { method: 'POST', body: form,
    headers: { Authorization: `Bearer ${member.token}` }, signal: AbortSignal.timeout(30000) });
  const text = await response.text();
  assert.equal(response.status, 201, text);
  const { pdfMaterialId } = JSON.parse(text);
  await db.query("UPDATE pdf_material SET extraction_state = 'DONE', page_count = $2 WHERE pdf_material_id = $1", [pdfMaterialId, pages.length]);
  for (const [index, pageText] of pages.entries()) {
    await db.query('INSERT INTO pdf_page_text (pdf_page_text_id, pdf_material_id, page_number, text, readable) VALUES ($1, $2, $3, $4, $5)',
      [randomUUID(), pdfMaterialId, index + 1, pageText, pageText !== '']);
  }
  return pdfMaterialId;
}
const pdfItem = (sourceId) => ({ kind: 'PDF_MATERIAL', sourceId });

/** 발행 API로 발행한다. 발행 빈도 제한(1분 10회)에 걸리지 않게 시계를 1분 넘게 옮긴다. 항목 ID는 작성자 상세에서 읽는다. */
async function publish(member, items, { password } = {}) {
  now = new Date(now.getTime() + 61_000);
  const response = await server.call('POST', '/publications', { token: member.token, body: body(items, password ? { password } : {}) });
  assert.equal(response.status, 201, response.text);
  const token = tokenOf(response.body.url);
  secrets.add(token);
  const detail = await server.call('GET', `/publications/${response.body.publicationId}`, { token: member.token });
  assert.equal(detail.status, 200, detail.text);
  const found = detail.body.snapshot.items;
  return {
    publicationId: response.body.publicationId, token,
    pdfItemIds: found.filter((item) => item.itemKind === 'PDF_MATERIAL').map((item) => item.publishedItemId),
    textItemIds: found.filter((item) => item.itemKind === 'TEXT_MATERIAL').map((item) => item.publishedItemId),
  };
}

/** 열람 요청. 본문을 바이트로 받는다. JSON 오류 응답이면 body에 해석한 값을 둔다. */
async function view(path, { grant, token, headers = {} } = {}) {
  const sent = { ...headers };
  if (grant !== undefined) sent['X-Link-Grant'] = grant;
  if (token) sent.Authorization = `Bearer ${token}`;
  const response = await fetch(`${server.url}/v1${path}`, { headers: sent, signal: AbortSignal.timeout(15000) });
  const bytes = Buffer.from(await response.arrayBuffer());
  const text = bytes.toString('utf8');
  const json = (response.headers.get('content-type') ?? '').includes('application/json');
  return { status: response.status, headers: response.headers, bytes, text, body: json ? JSON.parse(text) : null };
}
const recipientPath = (token, itemId, query = '') => `/public/links/${encodeURIComponent(token)}/items/${encodeURIComponent(itemId)}/pdf${query}`;
const ownerPath = (publicationId, itemId, query = '') => `/publications/${encodeURIComponent(publicationId)}/items/${encodeURIComponent(itemId)}/pdf${query}`;
const asRecipient = (token, itemId, options = {}) => view(recipientPath(token, itemId, options.query), options);
const asOwner = (member, publicationId, itemId, options = {}) => view(ownerPath(publicationId, itemId, options.query), { ...options, token: member.token });

async function grantFor(token) {
  const result = await unlockRaw(server, token, { password: PASSWORD });
  assert.equal(result.status, 200, result.text);
  secrets.add(result.body.grant);
  return result.body.grant;
}
function shows(response, bytes, label) {
  assert.equal(response.status, 200, `${label}: ${response.status} ${response.text.slice(0, 200)}`);
  for (const [name, value] of Object.entries(HEADERS)) assert.equal(response.headers.get(name), value, `${label}: ${name}`);
  assert.ok(response.bytes.equals(bytes), `${label}: 발행 시점 사본의 바이트 그대로`);
}
function refused(response, status, code, label) {
  assert.equal(response.status, status, `${label}: ${response.text.slice(0, 200)}`);
  assert.equal(response.body?.code, code, label);
  assert.ok(!response.text.includes('%PDF-'), `${label}: PDF 본문을 내려주지 않는다`);
  assert.notEqual(response.headers.get('content-type'), 'application/pdf', label);
}
const filePath = (key) => join(fileRoot, ...key.split('/'));
const viewLogs = () => server.logs.filter((log) => log.args.at(-1) === 'PdfView').map((log) => ({ level: log.level, entry: log.args[0] }));
function assertNoSecrets(texts) {
  const dump = JSON.stringify(texts);
  for (const secret of secrets) assert.ok(!dump.includes(secret), `비밀값·키·제목이 드러나지 않는다(${secret.slice(0, 12)}…)`);
}
/** 시험 동안 열람 서비스의 저장소를 바꾼다. beforeEach가 다시 실제 저장소로 돌린다. */
const swapStorage = (replacement) => { viewer.files = { ...replacement }; };
/** 받은 사람 거부 기록 한 줄의 기대 모양(관측 설계 §1). 이유·오류 이름 칸은 500에만 값이 있다. */
const deniedLog = (status, publicationId, publishedItemId) =>
  ['warn', { event: 'PDF_VIEW_FAILED', stage: 'before-headers', status, reason: null, publicationId, publishedItemId, error: null }];
const loggedViews = () => viewLogs().map((log) => [log.level, log.entry]);
/** 로그에 요청이 보낸 원문(틀린 grant·UUID가 아닌 ID·틀린 토큰)이 없어야 한다. */
function assertNoRawInput(values) {
  const dump = JSON.stringify(server.logs);
  for (const value of values) assert.ok(!dump.includes(value), `요청 원문이 로그에 없다(${value})`);
}

test('V-5: 받은 사람 정상 열람은 200에 헤더 4종이고 본문은 발행 시점 사본이며, 원본을 바꾸거나 지워도 그대로다. Range는 무시하고 정의 밖 쿼리는 400이다', async () => {
  const a = await author();
  const bytes = pdfBytes('V-5 original');
  const pdfId = await uploadPdf(a, bytes);
  const published = await publish(a, [pdfItem(pdfId), textItem(await insertTextMaterial(db, a.memberId))]);
  const [itemId] = published.pdfItemIds;

  const shown = await asRecipient(published.token, itemId);
  shows(shown, bytes, '첫 열람');
  for (const [name, value] of shown.headers) {
    assert.ok(!value.includes(SECRET_TITLE) && !value.includes('members/') && !value.includes(published.token), `헤더에 제목·키·토큰이 없다(${name})`);
  }

  // Range 요청은 지원하지 않는다: 부분 응답(206)이 아니라 전체를 200으로 준다.
  const ranged = await asRecipient(published.token, itemId, { headers: { Range: 'bytes=0-9' } });
  shows(ranged, bytes, 'Range 요청');
  assert.equal(ranged.headers.get('content-range'), null);
  assert.equal(ranged.headers.get('accept-ranges'), null);

  // 내려주는 것은 원본이 아니라 사본이다: 원본 파일 내용을 바꿔도, 원본 자료를 지워도 발행 시점 바이트 그대로다.
  await storage.put(materialKey(a.memberId, pdfId), pdfBytes('V-5 changed after publish'), 'application/pdf');
  shows(await asRecipient(published.token, itemId), bytes, '원본 내용이 바뀐 뒤');
  assert.equal((await server.call('DELETE', `/pdf-materials/${pdfId}`, { token: a.token })).status, 204);
  assert.ok(!existsSync(filePath(materialKey(a.memberId, pdfId))), '원본 파일은 지워졌다');
  shows(await asRecipient(published.token, itemId), bytes, '원본 자료를 지운 뒤');

  // 대문자 UUID도 같은 항목이다. 정의 밖 쿼리는 다른 받은 사람 경로와 같이 400이다.
  shows(await asRecipient(published.token, itemId.toUpperCase()), bytes, '대문자 항목 ID');
  refused(await asRecipient(published.token, itemId, { query: '?download=1' }), 400, 'VALIDATION_FAILED', '정의 밖 쿼리');
  assert.deepEqual(viewLogs(), [], '정상 열람과 400(입력 거부)은 PDF_VIEW_FAILED를 남기지 않는다');
});

test('V-1: 비밀번호 링크는 grant 없음·틀린 grant·다른 발행본의 grant가 모두 401 LINK_PASSWORD_REQUIRED이고(항목이 없어도 같다), 맞는 grant면 200이며 시도 제한이 없다', async () => {
  const a = await author();
  const bytes = pdfBytes('V-1 locked');
  const pdfId = await uploadPdf(a, bytes);
  const locked = await publish(a, [pdfItem(pdfId)], { password: PASSWORD });
  const other = await publish(a, [pdfItem(pdfId)], { password: PASSWORD });
  const [itemId] = locked.pdfItemIds;
  const otherGrant = await grantFor(other.token);
  const missingItem = randomUUID();

  server.logs.length = 0;
  refused(await asRecipient(locked.token, itemId), 401, 'LINK_PASSWORD_REQUIRED', 'grant 없음');
  refused(await asRecipient(locked.token, itemId, { grant: '' }), 401, 'LINK_PASSWORD_REQUIRED', '빈 grant');
  refused(await asRecipient(locked.token, itemId, { grant: 'not-a-grant' }), 401, 'LINK_PASSWORD_REQUIRED', '모양이 틀린 grant');
  refused(await asRecipient(locked.token, itemId, { grant: otherGrant }), 401, 'LINK_PASSWORD_REQUIRED', '다른 발행본의 grant');
  // 판정이 항목 조회보다 먼저다: grant가 없으면 항목이 있는지 알려 주지 않는다.
  refused(await asRecipient(locked.token, missingItem), 401, 'LINK_PASSWORD_REQUIRED', 'grant 없이 없는 항목');
  refused(await asRecipient(locked.token, 'not-a-uuid'), 401, 'LINK_PASSWORD_REQUIRED', 'grant 없이 UUID 아닌 항목');
  // 거부마다 한 줄: 발행본 ID는 적고, 항목 ID는 UUID 모양일 때만 적는다. 응답은 위에서 본 401 그대로다.
  assert.deepEqual(loggedViews(), [
    ...Array.from({ length: 4 }, () => deniedLog(401, locked.publicationId, itemId)),
    deniedLog(401, locked.publicationId, missingItem),
    deniedLog(401, locked.publicationId, null),
  ]);
  assertNoRawInput(['not-a-grant', 'not-a-uuid']);
  assertNoSecrets(server.logs);
  // grant를 URL에 실어도 받지 않는다(쿼리는 400, BR6.3).
  refused(await asRecipient(locked.token, itemId, { query: `?grant=${encodeURIComponent(otherGrant)}` }), 400, 'VALIDATION_FAILED', 'URL의 grant');

  // 시도 제한 없음(BR6.7): 거부가 이어져도 429가 되지 않고, 그 뒤 맞는 grant는 바로 통과한다.
  for (let attempt = 1; attempt <= 15; attempt += 1) {
    refused(await asRecipient(locked.token, itemId, { grant: `wrong-${attempt}` }), 401, 'LINK_PASSWORD_REQUIRED', `거부 ${attempt}회째`);
  }
  const grant = await grantFor(locked.token);
  for (let attempt = 1; attempt <= 15; attempt += 1) shows(await asRecipient(locked.token, itemId, { grant }), bytes, `통과 ${attempt}회째`);
  assertNoSecrets(server.logs);
});

test('V-2: 중지·만료·삭제된 링크와 형식이 틀린 토큰은 404 LINK_UNAVAILABLE이고 파일을 내려주지 않는다', async () => {
  const a = await author();
  const bytes = pdfBytes('V-2');
  const pdfId = await uploadPdf(a, bytes);
  const stopped = await publish(a, [pdfItem(pdfId)]);
  const expiring = await publish(a, [pdfItem(pdfId)]);
  const removed = await publish(a, [pdfItem(pdfId)]);
  shows(await asRecipient(stopped.token, stopped.pdfItemIds[0]), bytes, '중지 전');
  shows(await asRecipient(removed.token, removed.pdfItemIds[0]), bytes, '삭제 전');
  server.logs.length = 0;

  assert.equal((await server.call('PUT', `/publications/${stopped.publicationId}/stop`, { token: a.token })).status, 200);
  refused(await asRecipient(stopped.token, stopped.pdfItemIds[0]), 404, 'LINK_UNAVAILABLE', '중지');

  assert.equal((await server.call('DELETE', `/publications/${removed.publicationId}`, { token: a.token })).status, 204);
  refused(await asRecipient(removed.token, removed.pdfItemIds[0]), 404, 'LINK_UNAVAILABLE', '삭제');

  refused(await asRecipient('not-a-token', expiring.pdfItemIds[0]), 404, 'LINK_UNAVAILABLE', '형식이 틀린 토큰');
  refused(await asRecipient('B'.repeat(43), expiring.pdfItemIds[0]), 404, 'LINK_UNAVAILABLE', '없는 토큰');

  shows(await asRecipient(expiring.token, expiring.pdfItemIds[0]), bytes, '만료 전');
  now = new Date(now.getTime() + PUBLICATION_TTL_HOURS * HOUR + 1000);
  refused(await asRecipient(expiring.token, expiring.pdfItemIds[0]), 404, 'LINK_UNAVAILABLE', '만료');

  // 링크를 열 수 없는 404는 발행본을 특정하지 않고(토큰은 적지 않는다) 상태 코드와 항목 ID만 남긴다.
  assert.deepEqual(loggedViews(), [
    deniedLog(404, null, stopped.pdfItemIds[0]), deniedLog(404, null, removed.pdfItemIds[0]),
    deniedLog(404, null, expiring.pdfItemIds[0]), deniedLog(404, null, expiring.pdfItemIds[0]), deniedLog(404, null, expiring.pdfItemIds[0]),
  ]);
  assertNoRawInput(['not-a-token', 'B'.repeat(43)]);
  assertNoSecrets(server.logs);
});

test('V-3: 다른 발행본의 항목·텍스트 항목·없는 항목·UUID가 아닌 ID는 구분 없이 같은 404 LINK_UNAVAILABLE이다', async () => {
  const a = await author();
  const b = await author();
  const mine = await publish(a, [pdfItem(await uploadPdf(a, pdfBytes('V-3 mine'))), textItem(await insertTextMaterial(db, a.memberId))]);
  const sibling = await publish(a, [pdfItem(await uploadPdf(a, pdfBytes('V-3 sibling')))]);
  const theirsBytes = pdfBytes('V-3 theirs');
  const theirs = await publish(b, [pdfItem(await uploadPdf(b, theirsBytes))]);

  const cases = [
    ['남의 발행본의 PDF 항목', theirs.pdfItemIds[0]],
    ['같은 작성자의 다른 발행본 PDF 항목', sibling.pdfItemIds[0]],
    ['이 발행본의 텍스트 항목', mine.textItemIds[0]],
    ['없는 항목', randomUUID()],
    ['UUID가 아닌 ID', 'not-a-uuid'],
    ['발행본 ID를 항목 자리에', mine.publicationId],
  ];
  const bodies = [];
  server.logs.length = 0;
  for (const [label, itemId] of cases) {
    const response = await asRecipient(mine.token, itemId);
    refused(response, 404, 'LINK_UNAVAILABLE', label);
    bodies.push(response.text);
  }
  assert.equal(new Set(bodies).size, 1, '응답 본문으로 경우를 구분할 수 없다');
  // 없는 링크의 404와도 같은 본문이다.
  assert.equal((await asRecipient('B'.repeat(43), mine.pdfItemIds[0])).text, bodies[0]);
  // 응답은 구분되지 않지만 기록에는 판정을 통과한 발행본 ID가 남아 운영자가 구분할 수 있다. UUID가 아닌 ID는 적지 않는다.
  assert.deepEqual(loggedViews(), [
    ...cases.map(([, itemId]) => deniedLog(404, mine.publicationId, itemId === 'not-a-uuid' ? null : itemId)),
    deniedLog(404, null, mine.pdfItemIds[0]),
  ]);
  assertNoRawInput(['not-a-uuid', 'B'.repeat(43)]);
  assertNoSecrets(server.logs);
  // 그 항목은 자기 발행본의 링크로는 열린다(거부가 항목 자체의 문제가 아님).
  shows(await asRecipient(theirs.token, theirs.pdfItemIds[0]), theirsBytes, '자기 링크');
});

test('V-4: 사본 행은 있는데 파일이 없거나 저장소가 실패하면 500 INTERNAL_ERROR이고, PDF_VIEW_FAILED(before-headers) 로그에 키·토큰·제목이 없다', async () => {
  const a = await author();
  const bytes = pdfBytes('V-4');
  const published = await publish(a, [pdfItem(await uploadPdf(a, bytes))]);
  const [itemId] = published.pdfItemIds;
  const key = publishedPdfKey(a.memberId, published.publicationId, itemId);
  assert.ok(existsSync(filePath(key)), '발행이 사본 파일을 만들었다');

  // 파일 없음(저장소 불일치).
  await storage.delete(key);
  server.logs.length = 0;
  for (const [label, response] of [['받은 사람', await asRecipient(published.token, itemId)], ['작성자', await asOwner(a, published.publicationId, itemId)]]) {
    refused(response, 500, 'INTERNAL_ERROR', `${label} 파일 없음`);
    assert.deepEqual(response.body, { code: 'INTERNAL_ERROR', message: '처리 중 오류가 발생했습니다.' }, label);
  }
  assert.deepEqual(viewLogs().map((log) => [log.level, log.entry]), Array.from({ length: 2 }, () => ['error', {
    event: 'PDF_VIEW_FAILED', stage: 'before-headers', status: 500, reason: 'file-missing',
    publicationId: published.publicationId, publishedItemId: itemId, error: 'FileNotFound', storageReason: null, cause: null,
  }]));

  // 저장소 장애(대역): 이유가 storage로 나뉜다.
  server.logs.length = 0;
  swapStorage({ get: async () => { throw new StorageUnavailable('IO_FAILED'); } });
  refused(await asRecipient(published.token, itemId), 500, 'INTERNAL_ERROR', '저장소 장애');
  assert.deepEqual(viewLogs().map((log) => [log.entry.stage, log.entry.status, log.entry.reason, log.entry.error]),
    [['before-headers', 500, 'storage', 'StorageUnavailable']]);
  assert.deepEqual(viewLogs().map((log) => [log.entry.storageReason, log.entry.cause]), [['IO_FAILED', null]], '원인 오류가 없으면 사유만 남는다');
  assertNoSecrets(server.logs);

  // #521 리뷰: 원인 오류가 있으면 그 이름만 더 남긴다. 원인의 문구(버킷·키·경로가 들어갈 수 있다)는 싣지 않는다.
  const BUCKET = 'synthetic-view-bucket';
  const denied = Object.assign(new Error(`Access Denied: s3://${BUCKET}/members/${a.memberId}/secret-view-key.pdf`), { name: 'AccessDenied' });
  const unconfigured = new StorageUnavailable('NOT_CONFIGURED');
  for (const [failure, expected] of [
    [new StorageUnavailable('IO_FAILED', { cause: denied }), ['IO_FAILED', 'AccessDenied']],
    [unconfigured, ['NOT_CONFIGURED', null]],
  ]) {
    server.logs.length = 0;
    swapStorage({ get: async () => { throw failure; } });
    refused(await asOwner(a, published.publicationId, itemId), 500, 'INTERNAL_ERROR', `저장소 사유 ${expected[0]}`);
    assert.deepEqual(viewLogs().map((log) => [log.entry.error, log.entry.storageReason, log.entry.cause]), [['StorageUnavailable', ...expected]]);
    const text = JSON.stringify(server.logs);
    for (const secret of [BUCKET, 'secret-view-key', 'Access Denied', 'members/']) assert.ok(!text.includes(secret), `로그에 ${secret}이 없다`);
  }
});

test('V-6: 작성자는 자기 발행본의 PDF 사본을 중지·만료 뒤에도 열고, 남의 발행본·그 발행본에 없는 항목·PDF가 아닌 항목은 같은 404이며 토큰이 없으면 401이다', async () => {
  const a = await author();
  const b = await author();
  const bytes = pdfBytes('V-6 mine');
  const mine = await publish(a, [pdfItem(await uploadPdf(a, bytes)), textItem(await insertTextMaterial(db, a.memberId))], { password: PASSWORD });
  const sibling = await publish(a, [pdfItem(await uploadPdf(a, pdfBytes('V-6 sibling')))]);
  const theirs = await publish(b, [pdfItem(await uploadPdf(b, pdfBytes('V-6 theirs')))]);
  const [itemId] = mine.pdfItemIds;

  // 작성자는 비밀번호 링크여도 grant 없이 회원 토큰으로 연다.
  const shown = await asOwner(a, mine.publicationId, itemId);
  shows(shown, bytes, '작성자 열람');
  for (const [name, value] of shown.headers) assert.ok(!value.includes(SECRET_TITLE) && !value.includes('members/'), `헤더에 제목·키가 없다(${name})`);

  // 회원 두 명이 서로의 ID로 접근하면 없는 것과 같은 404다(보안 점검 A01).
  const cases = [
    ['남이 내 발행본·내 항목', b, mine.publicationId, itemId],
    ['내가 남의 발행본·남의 항목', a, theirs.publicationId, theirs.pdfItemIds[0]],
    ['내 발행본에 남의 항목', a, mine.publicationId, theirs.pdfItemIds[0]],
    ['내 발행본에 내 다른 발행본의 항목', a, mine.publicationId, sibling.pdfItemIds[0]],
    ['내 발행본의 텍스트 항목', a, mine.publicationId, mine.textItemIds[0]],
    ['없는 발행본', a, randomUUID(), itemId],
    ['없는 항목', a, mine.publicationId, randomUUID()],
    ['UUID가 아닌 발행본 ID', a, 'not-a-uuid', itemId],
    ['UUID가 아닌 항목 ID', a, mine.publicationId, 'not-a-uuid'],
  ];
  const bodies = [];
  assert.deepEqual(viewLogs(), [], '정상 열람은 기록을 남기지 않는다');
  server.logs.length = 0; // 발행 기록(발행본 ID가 들어 있다)을 비우고 열람 거부만 본다.
  for (const [label, member, publicationId, target] of cases) {
    const response = await asOwner(member, publicationId, target);
    refused(response, 404, 'RESOURCE_UNAVAILABLE', label);
    bodies.push(response.text);
  }
  assert.equal(new Set(bodies).size, 1, '응답 본문으로 경우를 구분할 수 없다');
  // 404마다 한 줄. 발행본을 찾지 못한 경우(소유 확인 전)는 발행본 ID 없이 회원 ID만, 본인 발행본에서 항목을 찾지 못한 경우(소유 확인 뒤)는
  // 확인된 발행본 ID를 적는다. 항목 ID는 UUID 모양일 때만 적는다.
  const ownerDenied = (member, publicationId, publishedItemId) => ['warn', { event: 'PDF_VIEW_FAILED', stage: 'before-headers', status: 404,
    reason: null, publicationId, publishedItemId, memberId: member.memberId, error: null }];
  assert.deepEqual(loggedViews(), [
    ownerDenied(b, null, itemId),
    ownerDenied(a, null, theirs.pdfItemIds[0]),
    ownerDenied(a, mine.publicationId, theirs.pdfItemIds[0]),
    ownerDenied(a, mine.publicationId, sibling.pdfItemIds[0]),
    ownerDenied(a, mine.publicationId, mine.textItemIds[0]),
    ownerDenied(a, null, itemId),
    ownerDenied(a, mine.publicationId, cases[6][3]),
    ownerDenied(a, null, itemId),
    ownerDenied(a, mine.publicationId, null),
  ]);
  assertNoRawInput(['not-a-uuid', theirs.publicationId]);
  assertNoSecrets(server.logs);
  server.logs.length = 0;
  refused(await view(ownerPath(mine.publicationId, itemId)), 401, 'AUTH_REQUIRED', '회원 토큰 없음');
  refused(await asOwner(a, mine.publicationId, itemId, { query: '?x=1' }), 400, 'VALIDATION_FAILED', '정의 밖 쿼리');
  assert.deepEqual(viewLogs(), [], '공통 인증의 401과 입력 거부 400은 PDF_VIEW_FAILED가 아니다');

  // 중지 뒤: 받은 사람은 404, 작성자는 200.
  assert.equal((await server.call('PUT', `/publications/${mine.publicationId}/stop`, { token: a.token })).status, 200);
  refused(await asRecipient(mine.token, itemId), 404, 'LINK_UNAVAILABLE', '중지 뒤 받은 사람');
  shows(await asOwner(a, mine.publicationId, itemId), bytes, '중지 뒤 작성자');

  // 만료 뒤(중지하지 않은 발행본): 받은 사람은 404, 작성자는 200.
  const siblingBytes = (await asOwner(a, sibling.publicationId, sibling.pdfItemIds[0])).bytes;
  now = new Date(now.getTime() + PUBLICATION_TTL_HOURS * HOUR + 1000);
  refused(await asRecipient(sibling.token, sibling.pdfItemIds[0]), 404, 'LINK_UNAVAILABLE', '만료 뒤 받은 사람');
  shows(await asOwner(a, sibling.publicationId, sibling.pdfItemIds[0]), siblingBytes, '만료 뒤 작성자');
  shows(await asOwner(a, mine.publicationId, itemId), bytes, '중지·만료 뒤 작성자');
  // 그사이 기록은 받은 사람 거부 두 줄뿐이다(작성자 정상 열람은 남기지 않고, 받은 사람 줄에는 회원 칸이 없다).
  assert.deepEqual(loggedViews(), [deniedLog(404, null, itemId), deniedLog(404, null, sibling.pdfItemIds[0])]);
});

test('V-7: 전송 도중 스트림이 실패하면 연결을 끊어 본문 수신이 실패하고(정상 종료 아님), PDF_VIEW_FAILED(streaming, aborted) 로그만 남는다', async () => {
  const a = await author();
  const bytes = pdfBytes('V-7');
  const published = await publish(a, [pdfItem(await uploadPdf(a, bytes))]);
  const [itemId] = published.pdfItemIds;

  // 앞부분을 보낸 뒤 실패하는 저장소 스트림(대역). 실패 문구에 키 모양을 넣어 로그로 새지 않는지 함께 본다.
  const failing = () => {
    let sent = false;
    return new Readable({
      read() {
        if (!sent) {
          sent = true;
          this.push(bytes.subarray(0, 32 * 1024));
        } else {
          setImmediate(() => this.destroy(Object.assign(new Error('synthetic read failure members/secret-key'), { name: 'StorageUnavailable' })));
        }
      },
    });
  };
  for (const [label, path, options] of [
    ['받은 사람', recipientPath(published.token, itemId), {}],
    ['작성자', ownerPath(published.publicationId, itemId), { headers: { Authorization: `Bearer ${a.token}` } }],
  ]) {
    server.logs.length = 0;
    swapStorage({ get: async () => failing() });
    const response = await fetch(`${server.url}/v1${path}`, { ...options, signal: AbortSignal.timeout(15000) });
    // 헤더는 이미 나갔으므로 상태는 200이다. 본문은 끝까지 오지 않고 수신이 실패해야 한다(web은 Blob을 만들지 않는다).
    assert.equal(response.status, 200, label);
    assert.equal(response.headers.get('content-type'), 'application/pdf', label);
    await assert.rejects(response.arrayBuffer(), `${label}: 본문 수신이 실패한다`);
    // 서버의 기록은 받는 쪽이 끊김을 본 직후에 남을 수 있어 잠깐 기다린다.
    for (let waited = 0; viewLogs().length === 0 && waited < 2000; waited += 20) await new Promise((done) => setTimeout(done, 20));
    assert.deepEqual(viewLogs().map((log) => [log.level, log.entry]), [['error', {
      event: 'PDF_VIEW_FAILED', stage: 'streaming', status: 'aborted', reason: 'storage',
      publicationId: published.publicationId, publishedItemId: itemId, error: 'StorageUnavailable', storageReason: null, cause: null,
    }]], label); // 이 대역 오류는 이름만 같은 일반 오류라 저장소 사유가 없다
    assertNoSecrets(server.logs);
  }

  // 대역을 걷으면 같은 항목이 다시 정상으로 열린다(서버가 살아 있고 실패가 그 요청에 한정됨).
  viewer.files = storage;
  shows(await asRecipient(published.token, itemId), bytes, '실패 뒤 다시 열람');
});

test('X-1: PDF를 발행 API로 발행한 뒤 삭제 API로 지우면 그 발행본의 사본 파일·쪽 사본 행이 없어지고, 원본 PDF와 다른 발행본의 사본은 남는다', async () => {
  const a = await author();
  const bytes = pdfBytes('X-1 original');
  const pages = ['[합성] X-1 1쪽', '', '[합성] X-1 3쪽'];
  const pdfId = await uploadPdf(a, bytes, pages);
  const removed = await publish(a, [pdfItem(pdfId), textItem(await insertTextMaterial(db, a.memberId))]);
  const kept = await publish(a, [pdfItem(pdfId)]);
  const removedKey = publishedPdfKey(a.memberId, removed.publicationId, removed.pdfItemIds[0]);
  const keptKey = publishedPdfKey(a.memberId, kept.publicationId, kept.pdfItemIds[0]);
  const prefixDir = (publicationId) => filePath(publicationPrefix(a.memberId, publicationId).slice(0, -1));
  const copiedPages = async (itemId) => (await db.query('SELECT count(*)::int AS n FROM published_pdf_page WHERE published_item_id = $1', [itemId]))[0].n;

  // 발행이 만든 것: 발행본마다 사본 파일 하나와 쪽 사본 3행(읽을 수 없는 쪽 포함).
  assert.ok(existsSync(filePath(removedKey)) && existsSync(filePath(keptKey)));
  assert.equal(await copiedPages(removed.pdfItemIds[0]), 3);
  assert.equal(await copiedPages(kept.pdfItemIds[0]), 3);
  shows(await asRecipient(removed.token, removed.pdfItemIds[0]), bytes, '삭제 전 받은 사람');

  const deleted = await server.call('DELETE', `/publications/${removed.publicationId}`, { token: a.token });
  assert.equal(deleted.status, 204, deleted.text);

  // 지운 발행본: 사본 파일·접두어 폴더·발행본 행·항목·쪽 사본이 모두 없고 열람은 404다.
  assert.ok(!existsSync(filePath(removedKey)), '지운 발행본의 사본 파일이 없다');
  assert.ok(!existsSync(prefixDir(removed.publicationId)), '지운 발행본의 접두어 폴더가 없다');
  assert.equal(await copiedPages(removed.pdfItemIds[0]), 0, '지운 발행본의 쪽 사본 행이 없다');
  assert.deepEqual(await db.query('SELECT 1 FROM published_item WHERE publication_id = $1', [removed.publicationId]), []);
  assert.deepEqual(await db.query('SELECT 1 FROM publication WHERE publication_id = $1', [removed.publicationId]), []);
  refused(await asRecipient(removed.token, removed.pdfItemIds[0]), 404, 'LINK_UNAVAILABLE', '삭제 뒤 받은 사람');
  refused(await asOwner(a, removed.publicationId, removed.pdfItemIds[0]), 404, 'RESOURCE_UNAVAILABLE', '삭제 뒤 작성자');

  // 다른 발행본의 사본: 파일·쪽 사본·열람이 그대로다.
  assert.ok(existsSync(filePath(keptKey)), '다른 발행본의 사본 파일은 남는다');
  assert.equal(await copiedPages(kept.pdfItemIds[0]), 3, '다른 발행본의 쪽 사본은 남는다');
  shows(await asRecipient(kept.token, kept.pdfItemIds[0]), bytes, '다른 발행본 받은 사람');
  shows(await asOwner(a, kept.publicationId, kept.pdfItemIds[0]), bytes, '다른 발행본 작성자');

  // 원본 PDF: 파일·자료 행·쪽 글이 그대로이고 원본 열람도 된다.
  assert.ok(existsSync(filePath(materialKey(a.memberId, pdfId))), '원본 파일은 남는다');
  assert.deepEqual(await db.query('SELECT extraction_state, page_count FROM pdf_material WHERE pdf_material_id = $1', [pdfId]),
    [{ extraction_state: 'DONE', page_count: 3 }]);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM pdf_page_text WHERE pdf_material_id = $1', [pdfId]))[0].n, 3);
  const original = await view(`/pdf-materials/${pdfId}/file`, { token: a.token });
  assert.equal(original.status, 200);
  assert.ok(original.bytes.equals(bytes), '원본 열람은 올린 바이트 그대로');
});

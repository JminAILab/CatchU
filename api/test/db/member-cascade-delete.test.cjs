// #387 회원 탈퇴의 DB 연쇄 삭제. 회원 행 하나를 지우면 그 회원의 자료가 함께 지워지고, 다른 회원 자료와
// 회원 자료가 아닌 선정 표는 남는다. 탈퇴 API·접근 차단·DB 밖 자격정보 파일 삭제는 이 시험의 범위가 아니다.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { before, after, beforeEach, test } = require('node:test');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const { readInitialSelection, restoreInitialSelection } = require('../support/repository-selection.cjs');
const { CONTRACT_DIR, event } = require('../helpers/receiver-harness.cjs');
const { AnalysisRequest, AnalysisConsent, AnalysisAttempt } = require('../../dist/member-analysis/member-analysis.entity');
const { DatabaseReceiverStore } = require('../../dist/analysis-receiver/database-receiver.store');
const { AnalysisReceiver } = require('../../dist/analysis-receiver/analysis-receiver.service');
const { WorkerMessageValidator } = require('../../dist/analysis-receiver/worker-message.validator');
const { AnalysisRegistrationService, AnalysisRegistrationError } = require('../../dist/analysis-receiver/analysis-registration.service');

let db;
let initialSelection;
before(async () => {
  db = await openTestDataSource();
  initialSelection = await readInitialSelection(db);
});
after(async () => { await db?.destroy(); });
beforeEach(async () => {
  await resetTestDatabase(db);
  await restoreInitialSelection(db, initialSelection);
});

// 회원 칸이 있는 표와, 부모를 따라 지워지는 표의 그 회원 행을 세는 조건. 부모를 거쳐 세는 표는 부모가 지워지면
// 남은 행이 있어도 0이 되므로, 삭제 뒤에는 표 전체 개수(tableRows)도 함께 본다.
const MEMBER_ROWS = {
  member_account: 'member_id = $1',
  member_profile: 'member_id = $1',
  github_connection: 'member_id = $1',
  auth_session: 'member_id = $1',
  session_refresh_token: 'session_id IN (SELECT session_id FROM auth_session WHERE member_id = $1)',
  analysis_request: 'member_id = $1',
  analysis_consent: 'member_id = $1',
  analysis_attempt: 'request_id IN (SELECT request_id FROM analysis_request WHERE member_id = $1)',
  result_application_record: 'request_id IN (SELECT request_id FROM analysis_request WHERE member_id = $1)',
  idempotency_record: 'member_id = $1',
  share_link: 'owner_id = $1',
  catch_asset: 'owner_id = $1',
  catch_evidence: 'catch_id IN (SELECT catch_id FROM catch_asset WHERE owner_id = $1)',
  candidate_registration: 'catch_id IN (SELECT catch_id FROM catch_asset WHERE owner_id = $1)',
  // 261103 intent CR2: 커밋 소속 기록. 실제 수신·반영 경로가 쓰고, Catch를 따라 지워진다.
  commit_assignment: 'member_id = $1',
  repository_protection: 'owner_id = $1',
  // 12월 intent U2(C-03·C-04): 하루 실행 횟수와 첫 이용 동의.
  daily_execution_count: 'member_id = $1',
  ai_consent: 'member_id = $1',
  // 12월 intent U4(C-07·C-13): 텍스트 자료·발행본·발행 항목.
  text_material: 'member_id = $1',
  publication: 'member_id = $1',
  published_item: 'publication_id IN (SELECT publication_id FROM publication WHERE member_id = $1)',
  // 12월 intent U3(C-06·C-08): 발행본 색인 상태와 조각(발행본·발행 항목을 따라 지워짐).
  publication_index: 'publication_id IN (SELECT publication_id FROM publication WHERE member_id = $1)',
  published_chunk: 'publication_id IN (SELECT publication_id FROM publication WHERE member_id = $1)',
  // 12월 intent U5(C-06, BR9.1): 발행본마다 AI 기본 요약 하나(발행본을 따라 지워짐).
  base_summary: 'publication_id IN (SELECT publication_id FROM publication WHERE member_id = $1)',
  // 12월 intent U6(C-06·C-15): Claude 연결·승인 코드·접근 토큰.
  mcp_connection: 'member_id = $1',
  mcp_authorization_code: 'member_id = $1',
  mcp_access_token: 'member_id = $1',
  // 12월 intent U8(C-06·C-07): PDF 원본(회원을 따라)·쪽별 글(PDF 자료를 따라)·발행 PDF 쪽 사본(발행 항목을 따라).
  pdf_material: 'member_id = $1',
  pdf_page_text: 'pdf_material_id IN (SELECT pdf_material_id FROM pdf_material WHERE member_id = $1)',
  published_pdf_page: `published_item_id IN (SELECT i.published_item_id FROM published_item i
    JOIN publication p ON p.publication_id = i.publication_id WHERE p.member_id = $1)`,
};
// mcp_client(U6)는 회원을 가리키지 않아 탈퇴 뒤에도 남는다. 승인에 쓰인 등록은 정리 대상도 아니다(U6 기능 설계 BR2.4·S19).
const SHARED_TABLES = ['allowed_scope_revision', 'repository_selection', 'mcp_client'];
const NONE = Object.fromEntries(Object.keys(MEMBER_ROWS).map(table => [table, 0]));

async function memberRows(memberId) {
  const rows = {};
  for (const [table, where] of Object.entries(MEMBER_ROWS)) {
    rows[table] = (await db.query(`SELECT count(*)::int AS n FROM "${table}" WHERE ${where}`, [memberId]))[0].n;
  }
  return rows;
}
async function tableRows(tables) {
  const rows = {};
  for (const table of tables) rows[table] = (await db.query(`SELECT count(*)::int AS n FROM "${table}"`))[0].n;
  return rows;
}

function template(file = 'succeeded-one-candidate') {
  return JSON.parse(readFileSync(resolve(__dirname, `../../../worker/fixtures/m1-synthetic/results/${file}.json`), 'utf8'));
}
function fill(value, context) {
  if (Array.isArray(value)) return value.map(v => fill(v, context));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fill(v, context)]));
  return typeof value === 'string' ? value.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    assert.ok(Object.hasOwn(context, k)); return context[k];
  }) : value;
}
// 접수 API(#138)를 대신해 회원·요청·동의·첫 시도만 만든다. 수신 기록·Catch는 실제 수신·반영 경로가 만든다.
async function prepareRequest(memberId) {
  const context = { requestId: randomUUID(), attemptId: randomUUID(), consentId: randomUUID(), memberId,
    repositoryId: 'synthetic-repository', scopeRevision: 'synthetic-scope', caseId: randomUUID() };
  const result = fill(template(), context);
  result.sourceMode = 'MOCK';
  await db.transaction(async manager => {
    await manager.query("INSERT INTO member_account VALUES ($1,$2,'ACTIVE') ON CONFLICT DO NOTHING", [memberId, 'fixture:' + memberId]);
    await manager.insert(AnalysisRequest, { ...context, registrationId: await require('../support/registered-analysis.cjs').ensureRegistration(manager, context), currentAttemptId: context.attemptId, submittedAt: new Date(), updatedAt: new Date() });
    await manager.insert(AnalysisConsent, { ...context, accepted: true, noticeRevision: 'fixture', consentedScope: { synthetic: true }, consentedAt: new Date() });
    await manager.insert(AnalysisAttempt, { attemptId: context.attemptId, requestId: context.requestId, sourceMode: result.sourceMode });
  });
  return result;
}
// 필수 공급 경계의 시험 대역. 실제 GitHub 관측은 아니다.
const observe = async context => ({ ownerId: context.memberId, repositoryId: context.repositoryId,
  githubRepository: { owner: 'synthetic-owner', name: 'synthetic-repo' },
  confirmedSourceState: { synthetic: true, visibility: 'PUBLIC' },
  observationProvenance: { synthetic: true, provider: 'test' }, observedAt: new Date(), appliedRestriction: 'NONE' });
function pipeline() {
  const logs = [];
  const receiver = new AnalysisReceiver(new DatabaseReceiverStore(db), new WorkerMessageValidator(CONTRACT_DIR), {
    record: (kind, code) => logs.push({ kind, code }),
  });
  return { service: new AnalysisRegistrationService(receiver, db, { observe }, { failed: code => logs.push({ code }) }), logs };
}

/** 지금 있는 회원 자료를 모두 가진 회원 하나를 만든다. 분석·Catch는 실제 수신·반영 경로로 만든다. */
async function memberWithAllData() {
  const memberId = randomUUID();
  const result = await prepareRequest(memberId);
  const output = await pipeline().service.receiveResult(result, async () => {});
  assert.equal(output.receipt.disposition, 'ACCEPTED');
  assert.equal(output.application.registeredCatchIds.length, 1);
  const sessionId = randomUUID();
  const linkId = randomUUID();
  await db.transaction(async m => {
    await m.query(`INSERT INTO member_profile (profile_id, member_id, display_name) VALUES ($1, $2, '합성 회원')`, [randomUUID(), memberId]);
    await m.query(`INSERT INTO github_connection (connection_id, member_id, external_account_reference, account_login, credential_reference, connection_state)
      VALUES ($1, $2, '42', 'synthetic-login', NULL, 'CONNECTED')`, [randomUUID(), memberId]);
    await m.query(`INSERT INTO auth_session (session_id, member_id, created_at, expires_at, last_refreshed_at)
      VALUES ($1, $2, now(), now() + interval '7 days', now())`, [sessionId, memberId]);
    await m.query(`INSERT INTO session_refresh_token (refresh_id, session_id, token_hash, created_at)
      VALUES ($1, $2, $3, now())`, [randomUUID(), sessionId, randomBytes(32).toString('hex')]);
    await m.query(`INSERT INTO share_link (link_id, owner_id, title, link_token_reference, issued_at, expires_at)
      VALUES ($1, $2, '합성 링크', $3, now(), now() + interval '720 hours')`, [linkId, memberId, randomUUID()]);
    await m.query(`INSERT INTO idempotency_record (idempotency_id, member_id, operation, key, request_fingerprint, link_id, response_reference)
      VALUES ($1, $2, 'createShareLink', 'link-key', repeat('a', 64), $3, $4)`, [randomUUID(), memberId, linkId, linkId]);
    await m.query(`INSERT INTO idempotency_record (idempotency_id, member_id, operation, key, request_fingerprint, request_id, response_reference)
      VALUES ($1, $2, 'createAnalysisRequest', 'analysis-key', repeat('b', 64), $3, $4)`, [randomUUID(), memberId, result.requestId, result.requestId]);
    await m.query(`INSERT INTO daily_execution_count (member_id, usage_date, count) VALUES ($1, '2026-11-02', 3), ($1, '2026-11-03', 1)`, [memberId]);
    await m.query(`INSERT INTO ai_consent (consent_id, member_id, notice_version, consented_at) VALUES ($1, $2, 'fixture-notice', now())`,
      [randomUUID(), memberId]);
    const textMaterialId = randomUUID();
    const publicationId = randomUUID();
    await m.query(`INSERT INTO text_material (text_material_id, member_id, title, body, created_at, updated_at)
      VALUES ($1, $2, '합성 자료', '합성 본문', now(), now())`, [textMaterialId, memberId]);
    await m.query(`INSERT INTO publication (publication_id, member_id, title, link_token_reference, published_at, expires_at)
      VALUES ($1, $2, '합성 발행본', $3, now(), now() + interval '2160 hours')`, [publicationId, memberId, randomUUID()]);
    const publishedItemId = randomUUID();
    await m.query(`INSERT INTO published_item (published_item_id, publication_id, position, item_kind, source_id, title, snapshot)
      VALUES ($1, $2, 1, 'TEXT_MATERIAL', $3, '합성 자료', '{"body":"합성 본문"}')`, [publishedItemId, publicationId, textMaterialId]);
    await m.query(`INSERT INTO publication_index (publication_id, status, deadline_at, updated_at)
      VALUES ($1, 'PENDING', now() + interval '10 minutes', now())`, [publicationId]);
    await m.query(`INSERT INTO published_chunk (chunk_id, publication_id, published_item_id, seq, field_path, char_start, char_end, source_kind, text)
      VALUES ($1, $2, $3, 1, 'body', 0, 5, 'AUTHOR_MATERIAL', '합성 본문')`, [randomUUID(), publicationId, publishedItemId]);
    await m.query(`INSERT INTO base_summary (base_summary_id, publication_id, status, deadline_at, items, generated_at, updated_at)
      VALUES ($1, $2, 'DONE', now() + interval '10 minutes', '[{"kind":"AI_INTERPRETATION","text":"합성 요약","citations":[],"jdRole":null}]', now(), now())`,
    [randomUUID(), publicationId]);
    // U8: 추출이 끝난 PDF 원본 하나와 그 쪽별 글, 같은 발행본에 고정한 PDF 항목과 쪽 사본.
    const pdfMaterialId = randomUUID();
    await m.query(`INSERT INTO pdf_material (pdf_material_id, member_id, title, storage_key, file_size_bytes, page_count, extraction_state,
      extraction_deadline_at, extraction_failure_code, created_at, updated_at)
      VALUES ($1, $2, '합성 PDF', $3, 1024, 1, 'DONE', now() + interval '10 minutes', NULL, now(), now())`,
    [pdfMaterialId, memberId, `members/${memberId}/materials/${pdfMaterialId}.pdf`]);
    await m.query(`INSERT INTO pdf_page_text (pdf_page_text_id, pdf_material_id, page_number, text, readable)
      VALUES ($1, $2, 1, '합성 쪽 글', true)`, [randomUUID(), pdfMaterialId]);
    const pdfItemId = randomUUID();
    await m.query(`INSERT INTO published_item (published_item_id, publication_id, position, item_kind, source_id, title, snapshot, pdf_copy_key)
      VALUES ($1, $2, 2, 'PDF_MATERIAL', $3, '합성 PDF', '{"pageCount":1}', $4)`,
    [pdfItemId, publicationId, pdfMaterialId, `members/${memberId}/publications/${publicationId}/${pdfItemId}.pdf`]);
    await m.query(`INSERT INTO published_pdf_page (published_pdf_page_id, published_item_id, page_number, text, readable)
      VALUES ($1, $2, 1, '합성 쪽 글', true)`, [randomUUID(), pdfItemId]);
    const mcpClientId = randomUUID();
    await m.query(`INSERT INTO mcp_client (mcp_client_id, client_name, redirect_uris, registered_at, approved_at)
      VALUES ($1, '합성 Claude', ARRAY['https://claude.ai/api/mcp/auth_callback'], now(), now())`, [mcpClientId]);
    await m.query(`INSERT INTO mcp_connection (connection_id, member_id, mcp_client_id, consented_at, expires_at)
      VALUES ($1, $2, $3, now(), now() + interval '7 days')`, [randomUUID(), memberId, mcpClientId]);
    await m.query(`INSERT INTO mcp_authorization_code (code_hash, member_id, mcp_client_id, code_challenge, redirect_uri, consented_at, expires_at)
      VALUES ($1, $2, $3, 'fixture-challenge', 'https://claude.ai/api/mcp/auth_callback', now(), now() + interval '5 minutes')`,
    [randomBytes(32).toString('hex'), memberId, mcpClientId]);
    await m.query(`INSERT INTO mcp_access_token (token_hash, member_id, mcp_client_id, expires_at)
      VALUES ($1, $2, $3, now() + interval '7 days')`, [randomBytes(32).toString('hex'), memberId, mcpClientId]);
  });
  const rows = await memberRows(memberId);
  for (const [table, n] of Object.entries(rows)) assert.ok(n > 0, `${table}에 시험 회원의 행이 있어야 한다`);
  return memberId;
}

test('회원 하나를 지우면 그 회원의 자료가 모두 지워지고 다른 회원 자료와 선정 표는 남는다', async () => {
  const leaving = await memberWithAllData();
  const staying = await memberWithAllData();
  const stayingBefore = await memberRows(staying);
  const sharedBefore = await tableRows(SHARED_TABLES);
  assert.ok(sharedBefore.repository_selection > 0, '선정 초기 자료가 있어야 남는지 확인할 수 있다');

  await db.query('DELETE FROM member_account WHERE member_id = $1', [leaving]);

  assert.deepEqual(await memberRows(leaving), NONE);
  assert.deepEqual(await memberRows(staying), stayingBefore);
  // 회원 행을 세는 조건 밖에 남은 행도 없다(남은 행은 모두 남은 회원의 것이다).
  assert.deepEqual(await tableRows(Object.keys(MEMBER_ROWS)), stayingBefore);
  assert.deepEqual(await tableRows(SHARED_TABLES), sharedBefore);
});

test('탈퇴 뒤 늦게 도착한 분석 결과·진행 알림은 저장하지 않고 거부한다', async () => {
  const memberId = randomUUID();
  const result = await prepareRequest(memberId);
  await db.query('DELETE FROM member_account WHERE member_id = $1', [memberId]);
  const { service, logs } = pipeline();
  const output = await service.receiveResult(result, async () => {});
  // 수신 처리가 거부 수신 확인을 돌려주면 큐 소비자는 작업을 완료로 끝낸다(큐·worker는 이 시험에서 돌리지 않는다).
  assert.equal(output.receipt.disposition, 'REJECTED');
  assert.equal(output.receipt.code, 'CONTEXT_MISMATCH');
  assert.equal(output.application, undefined);
  assert.equal(await service.receiveProgress(event({ requestId: result.requestId, attemptId: result.attemptId })), 'CONTEXT_MISMATCH');
  assert.deepEqual(logs, [{ kind: 'Result', code: 'CONTEXT_MISMATCH' }, { kind: 'ProcessingEvent', code: 'CONTEXT_MISMATCH' }]);
  assert.deepEqual(await tableRows(Object.keys(MEMBER_ROWS)), NONE);
});

test('수신 커밋과 Catch 반영 사이에 탈퇴하면 Catch를 만들지 않고 수신 기록도 함께 지워진다', async () => {
  const memberId = randomUUID();
  const result = await prepareRequest(memberId);
  const { service, logs } = pipeline();
  let acknowledged = null;
  await assert.rejects(service.receiveResult(result, async receipt => {
    acknowledged = receipt;
    await db.query('DELETE FROM member_account WHERE member_id = $1', [memberId]);
  }), AnalysisRegistrationError);
  // 큐 소비자는 받아 둔 수신 확인으로 작업을 완료로 끝내고 반영 실패만 기록한다(analysis-queue 소비자).
  assert.equal(acknowledged.disposition, 'ACCEPTED');
  assert.deepEqual(logs, [{ code: 'CONTEXT_MISMATCH' }]);
  assert.deepEqual(await tableRows(Object.keys(MEMBER_ROWS)), NONE);
});

test('회원을 참조하는 외래 키는 모두 연쇄 삭제이고, 연쇄 삭제가 아닌 외래 키는 정한 4개뿐이다', async () => {
  // 새 표의 외래 키가 연쇄 삭제가 아니면 여기서 잡힌다. 외래 키를 아예 빠뜨린 표는 잡지 못한다.
  const rows = await db.query(`
    SELECT c.conname AS name, c.confdeltype AS action, c.confrelid::regclass::text AS referenced
      FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
     WHERE c.contype = 'f' AND n.nspname = current_schema() ORDER BY c.conname`);
  // 새 표가 회원·발행본을 지우기 거부(NO ACTION)나 참조 비우기(SET NULL)로 참조하면 탈퇴가 막히거나 주인 없는 자료가 남는다.
  assert.deepEqual(rows.filter(r => r.referenced === 'member_account' && r.action !== 'c').map(r => r.name), []);
  assert.deepEqual(rows.filter(r => r.action !== 'c').map(r => r.name), [
    // 분석 요청의 순환 참조. 같은 탈퇴에서 함께 지워지는 행끼리라 커밋 때 확인한다.
    'fk_analysis_request_consent_id_request_id_member_id_re_803b38b8',
    'fk_analysis_request_current_attempt_id_request_id',
    'fk_analysis_request_retry_of_request_id_member_id_repository_id',
    // 모든 회원이 함께 쓰는 선정 목록. 회원 자료가 아니다.
    'fk_repository_selection_scope_revision',
  ]);
});

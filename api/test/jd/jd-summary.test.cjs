require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { before, after, beforeEach, test } = require('node:test');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const { createJdSummaryHandler } = require('../../dist/jd-summary/jd-summary-processor');
const { jdGenerationRequest, JdContractInvalid, JD_SUMMARY_INSTRUCTION } = require('../../dist/jd-summary/jd-generation-request');
const { AUTHOR_MATERIAL_VOICE_INSTRUCTION, BASE_SUMMARY_INSTRUCTION, QNA_INSTRUCTION } = require('../../dist/rag-answer/rag-answer-config');
const { AiInputTooLarge, AiProviderError } = require('../../dist/ai-generation/ai-generation.types');
const { inputLength, assertGenerationRequest } = require('../../dist/ai-generation/gate-policy');
const { LinkPasswordRequired, LinkUnavailable } = require('../../dist/publications/publication-access');
const { harness, hit, output, interpretation, codeIs, runCount } = require('./fixtures.cjs');
let db;
before(async () => { db = await openTestDataSource(); });
after(async () => { await db?.destroy(); });
beforeEach(async () => resetTestDatabase(db));
const processRun = (h, runId) => createJdSummaryHandler(h.deps)({ runKey: runId, payload: { runId } });
const detail = (h, runId) => h.service.detail(h.memberId, 'synthetic-token', 'synthetic-grant', runId);

test('접수는 링크→본인 입력→동의→색인 순서이며 모든 사전 거부는 실행·차감을 남기지 않는다', async () => {
  const h = await harness(db, 'x'.repeat(2001));
  await assert.rejects(h.accept(), codeIs('INPUT_TOO_LARGE'));
  assert.deepEqual(h.calls.map((call) => call[0]), ['access']);
  await h.jdService.update(h.memberId, h.jd.jdId, { title: '제목', body: '내용' });
  await db.query('DELETE FROM ai_consent WHERE member_id=$1', [h.memberId]);
  await assert.rejects(h.accept(), codeIs('AI_CONSENT_REQUIRED'));
  await h.consent.record(h.memberId, require('../../dist/ai-consent/ai-consent.gate').AI_NOTICE_VERSION, h.settings.clock());
  h.search.getIndexState = async () => 'PENDING';
  await assert.rejects(h.accept(), codeIs('INDEX_NOT_READY'));
  h.access.resolveForRecipient = async () => { throw new LinkPasswordRequired(); };
  await assert.rejects(h.accept(), codeIs('LINK_PASSWORD_REQUIRED'));
  h.access.resolveForRecipient = async () => { throw new LinkUnavailable(); };
  await assert.rejects(h.accept(), codeIs('LINK_UNAVAILABLE'));
  assert.equal(await runCount(db, h.memberId), 0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM jd_summary_run'))[0].n, 0);
});

test('잠금 뒤 최신 JD를 재검증하고 입력·결과·한도를 함께 커밋한 뒤 runId만 큐에 보낸다', async () => {
  const h = await harness(db);
  h.consent.require = async () => { await h.jdService.update(h.memberId, h.jd.jdId, { title: '최신 제목', body: '최신 줄' }); };
  const { runId } = await h.accept();
  assert.equal(await runCount(db, h.memberId), 1);
  assert.deepEqual(h.queued, [{ kind: 'JD_SUMMARY', runKey: runId, payload: { runId } }]);
  assert.equal(runId.includes(':'), false);
  const [run] = await db.query('SELECT * FROM jd_summary_run WHERE run_id=$1', [runId]);
  assert.equal(run.input_copy.title, '최신 제목'); assert.equal(run.input_copy.body, '최신 줄');
  assert.equal(run.deadline_at.getTime() - run.created_at.getTime(), 20 * 60000);
  assert.equal((await detail(h, runId)).requirements[0].jdLine, '최신 줄');
  assert.deepEqual(h.logs.slice(0, 2).map((log) => log.stage), ['accepted', 'enqueue']);
});

test('저장 실패면 하루 횟수와 실행도 롤백하고 ENQUEUE_FAILED는 접수와 1회 차감을 유지한다', async () => {
  const h = await harness(db);
  h.search.getIndexState = async () => { await db.query('DELETE FROM publication WHERE publication_id=$1', [h.pub.publicationId]); return 'DONE'; };
  await assert.rejects(h.accept());
  assert.equal(await runCount(db, h.memberId), 0);
  assert.equal(h.queued.length, 0); assert.deepEqual(h.logs.map((event) => event.stage), ['persistence-failed']);
  const other = await harness(db);
  other.aiRun.enqueueAfterCommit = async () => 'ENQUEUE_FAILED';
  const { runId } = await other.accept();
  assert.equal((await detail(other, runId)).status, 'PENDING');
  assert.equal(await runCount(db, other.memberId), 1);
  other.setNow(new Date('2026-11-04T04:20:00.000Z'));
  const failed = await detail(other, runId);
  assert.equal(failed.failureCode, 'DEADLINE_EXCEEDED');
  assert.ok(failed.requirements.every((row) => row.failureCode === 'DEADLINE_EXCEEDED'));
  await detail(other, runId);
  assert.equal(other.logs.filter((event) => event.stage === 'deadline-finalized').length, 1, '시한 확정 로그는 커밋 뒤 한 번');
});

test('순차 처리의 정상·빈 출력·서버 안내·검색 실패·NO_ITEMS·개별 timeout을 서로 구분한다', async () => {
  const h = await harness(db, 'content\nempty\nnotice\nsearch\nnoitems\ntimeout\nnohits');
  let active = 0, maximum = 0;
  h.search.search = async (publicationId, line, limit) => {
    assert.equal(publicationId, h.pub.publicationId); assert.equal(limit, 6);
    if (line === 'search') throw new Error('민감한 제공자 원문');
    return { hits: line === 'nohits' ? [] : [hit()], publicationText: 'Docker' };
  };
  const requests = [];
  h.gate.generate = async (request) => {
    requests.push(request); maximum = Math.max(maximum, ++active);
    await new Promise((resolve) => setImmediate(resolve)); active--;
    if (request.userText === 'noitems') throw new AiProviderError('NO_ITEMS');
    if (request.userText === 'timeout') throw new AiProviderError('CALL_FAILED', { failure: 'CONNECTION_TIMEOUT' });
    if (request.userText === 'empty' || request.userText === 'nohits') return output();
    if (request.userText === 'notice') return output([{ kind: 'SERVER_NOTICE', text: '찾지 못함', citations: [], jdRole: 'UNCONFIRMED' }]);
    return output([interpretation()]);
  };
  const { runId } = await h.accept(); await processRun(h, runId);
  const view = await detail(h, runId);
  assert.equal(view.status, 'DONE'); assert.equal(maximum, 1); assert.equal(requests.length, 6);
  assert.ok(requests.every((request) => request.feature === 'JD_SUMMARY' && request.model === 'HAIKU'));
  assert.deepEqual(view.requirements.map((row) => [row.status, row.resultKind, row.failureCode]), [
    ['DONE', 'CONTENT', null], ['DONE', 'EMPTY', null], ['DONE', 'EMPTY', null], ['FAILED', null, 'SEARCH_FAILED'],
    ['FAILED', null, 'GENERATION_FAILED'], ['FAILED', null, 'GENERATION_FAILED'], ['DONE', 'EMPTY', null] ]);
  assert.equal(view.requirements[6].unconfirmedPoints[0].text, '이번에 찾은 자료가 없어 이 요구사항의 표기를 찾지 못했습니다.');
  assert.deepEqual(await detail(h, runId), view, '재열람도 개별 timeout을 같은 코드로 반환');
  await processRun(h, runId); assert.equal(requests.length, 6, '완료 뒤 중복 전달은 생성하지 않음');
  const serialized = JSON.stringify(h.logs);
  for (const secret of ['민감한 제공자', 'synthetic-token', 'synthetic-grant', 'Docker', '합성 JD']) assert.equal(serialized.includes(secret), false);
});

test('실제 C01 입력 계산·UTF-16 위치를 그대로 쓰며 비정상 검색 결과는 잘라 생성하지 않는다', async () => {
  const source = hit({ text: '😀Docker', charStart: 7, charEnd: 15 });
  const request = jdGenerationRequest({ hits: [source], publicationText: '전체 사본'.repeat(20000) }, ' 요구사항 ');
  assert.equal(request.sources[0].sourceId, source.chunkId); assert.equal(request.sources[0].text, source.text);
  assert.deepEqual(request.sources[0].location, { publishedItemId: source.publishedItemId, fieldPath: 'body', charStart: 7, charEnd: 15, pdfPage: null });
  assert.equal(inputLength(request), source.text.length + request.userText.length);
  const boundary = { ...request, sources: [{ ...request.sources[0], text: 'x'.repeat(79999) }], userText: 'x' };
  assert.doesNotThrow(() => assertGenerationRequest(boundary));
  assert.throws(() => assertGenerationRequest({ ...boundary, userText: 'xx' }), AiInputTooLarge);
  assert.throws(() => jdGenerationRequest({ hits: Array.from({ length: 7 }, () => hit()), publicationText: '' }, 'x'), JdContractInvalid);
  const h = await harness(db, 'x'); let generated = 0;
  h.gate.generate = async () => { generated++; return output(); };
  for (const [length, code] of [[1001, 'CONTRACT_INVALID'], [80000, 'INPUT_TOO_LARGE']]) {
    h.search.search = async () => ({ hits: [hit({ text: 'x'.repeat(length), charEnd: length })], publicationText: '' });
    const { runId } = await h.accept(); await processRun(h, runId);
    const view = await detail(h, runId);
    assert.equal(view.requirements[0].failureCode, code); assert.equal(view.failureCode, 'ALL_REQUIREMENTS_FAILED');
  }
  assert.equal(generated, 0);
});

test('전체 시한은 저장된 DONE을 유지하고 미처리 행만 실패시키며 정상 EMPTY 전체 실행은 DONE이다', async () => {
  const h = await harness(db, 'first\nsecond\nthird');
  let calls = 0;
  h.gate.generate = async () => { if (++calls === 2) h.setNow(new Date('2026-11-04T04:20:00.000Z')); return output(); };
  const { runId } = await h.accept(); await processRun(h, runId);
  const view = await detail(h, runId);
  assert.equal(view.status, 'FAILED'); assert.equal(view.failureCode, 'DEADLINE_EXCEEDED');
  assert.deepEqual(view.requirements.map((row) => [row.status, row.failureCode]), [['DONE', null], ['FAILED', 'DEADLINE_EXCEEDED'], ['FAILED', 'DEADLINE_EXCEEDED']]);
  assert.equal(calls, 2);
  const allEmpty = await harness(db, 'one\ntwo'); allEmpty.gate.generate = async () => output();
  const accepted = await allEmpty.accept(); await processRun(allEmpty, accepted.runId);
  assert.equal((await detail(allEmpty, accepted.runId)).status, 'DONE');
});

test('재열람은 매번 C10·회원·발행본으로 제한하고 목록은 집계만 반환하며 잘못된 payload는 무시한다', async () => {
  const h = await harness(db, 'one'); const { runId } = await h.accept();
  await assert.rejects(h.service.detail(h.ownerId, 'token', undefined, runId), codeIs('RESOURCE_UNAVAILABLE'));
  await assert.rejects(h.service.detail(h.memberId, 'token', undefined, randomUUID()), codeIs('RESOURCE_UNAVAILABLE'));
  for (let i = 0; i < 20; i++) await h.accept();
  const list = await h.service.list(h.memberId, 'token', undefined);
  assert.equal(list.items.length, 20); assert.ok(list.nextCursor);
  const next = await h.service.list(h.memberId, 'token', undefined, list.nextCursor);
  assert.equal(next.items.length, 1); assert.equal(next.nextCursor, null);
  assert.equal(new Set([...list.items, ...next.items].map((item) => item.runId)).size, 21);
  assert.deepEqual((await h.service.list(h.ownerId, 'token', undefined)).items, []);
  assert.deepEqual(Object.keys(list.items[0]).sort(), ['createdAt', 'emptyCount', 'failedCount', 'requirementCount', 'runId', 'status', 'title']);
  assert.equal(JSON.stringify(list).includes('jdLine'), false);
  await createJdSummaryHandler(h.deps)({ runKey: 'wrong', payload: { runId } });
  assert.equal((await detail(h, runId)).status, 'PENDING');
  h.access.resolveForRecipient = async () => ({ publicationId: randomUUID() });
  await assert.rejects(detail(h, runId), codeIs('RESOURCE_UNAVAILABLE'));
  h.access.resolveForRecipient = async () => { throw new LinkUnavailable(); };
  await assert.rejects(detail(h, runId), codeIs('LINK_UNAVAILABLE'));
});

// 새 Catch NC2 — JD 요약 지시 끝의 작성자 말 옮기기 문장(BR5.1, 효과는 따로 재지 않음 BR5.2). U10 영역이라 NC2 PR에서 U10 담당 확인을 받는다.
// 먼저 정한 시나리오: JD 요약 생성 요청의 지시를 본다.
// - 기대: 지시는 지금 문장 뒤에 AUTHOR_MATERIAL_VOICE_INSTRUCTION으로 끝난다(질의응답·기본 요약과 같은 상수).
// - 실패 조건: 문장이 없음, 다른 글자의 문장.

test('NC2 BR5.1 JD 요약 지시는 질의응답·기본 요약과 같은 작성자 말 옮기기 문장으로 끝난다', () => {
  const request = jdGenerationRequest({ hits: [hit()], publicationText: '전체 사본' }, '요구사항 한 줄');
  assert.equal(request.instruction, JD_SUMMARY_INSTRUCTION);
  assert.ok(request.instruction.startsWith('JD 요구사항 한 줄에 대해 근거, 자료로 확인되지 않는 점, 면접 질문을'), '지금 지시가 앞에 그대로 있다');
  assert.ok(request.instruction.endsWith(` ${AUTHOR_MATERIAL_VOICE_INSTRUCTION}`));
  assert.ok(QNA_INSTRUCTION.endsWith(AUTHOR_MATERIAL_VOICE_INSTRUCTION) && BASE_SUMMARY_INSTRUCTION.endsWith(AUTHOR_MATERIAL_VOICE_INSTRUCTION), '세 지시가 같은 상수');
});

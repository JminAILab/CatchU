// U5 BASE_SUMMARY 처리기(계약 C-02 row-creation·late-result, 기능 설계 W3·BR5.1~BR5.5, reliability-design NFR5.2·NFR5.3·NFR5.5,
// observability-design NFR6.2). 실제 테스트 DB의 base_summary 표와 마이그레이션을 쓰고, 사본 읽기(C-10)·게이트(C-01)는 합성 대역이다.
// 기대 결과는 기능 명세 「주요 시나리오와 확인」의 처리기 행들이다. 합성 게이트 통과는 실제 Claude 생성 성공이 아니다.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { after, before, beforeEach, test } = require('node:test');
const { setTimeout: delay } = require('node:timers/promises');
const { AiInputTooLarge, AiProviderError } = require('../../dist/ai-generation/ai-generation.types');
const { InMemoryPublicationAccess } = require('../../dist/publications/in-memory-publication-access');
const { createBaseSummaryHandler } = require('../../dist/rag-answer/base-summary-handler');
const { AUTHOR_MATERIAL_VOICE_INSTRUCTION, BASE_SUMMARY_INSTRUCTION } = require('../../dist/rag-answer/rag-answer-config');
const { SOURCE_LABELS } = require('../../dist/ai-generation/ai-generation.types');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const { AI_DRAFT_MARKER, insertMember, recordingLogger } = require('../published-index/support.cjs');
const { citedItem, fakeGate, putPublication } = require('./support.cjs');

const PUBLISHED_AT = new Date('2026-11-02T03:00:00.000Z');
const DEADLINE = new Date('2026-11-02T03:10:00.000Z');
let db;
let now;
let access;
let gate;
let logger;
let handler;

before(async () => { db = await openTestDataSource(); });
after(async () => { await db?.destroy(); });
beforeEach(async () => {
  await resetTestDatabase(db);
  now = new Date('2026-11-02T03:01:00.000Z');
  access = new InMemoryPublicationAccess(() => now);
  gate = fakeGate();
  gate.output = { items: [citedItem('요약 하나'), citedItem('요약 둘'), citedItem('요약 셋')], droppedCount: 1 };
  logger = recordingLogger();
  handler = createBaseSummaryHandler({ dataSource: db, publicationAccess: access, gate, clock: () => now, logger });
});

/** DB(외래 키 부모)와 메모리 사본 둘 다에 같은 발행본을 넣는다(C-07 모양). */
async function publication(publishedAt = PUBLISHED_AT) {
  const memberId = await insertMember(db);
  const value = putPublication(access, { ownerMemberId: memberId, publishedAt });
  await db.query(`INSERT INTO publication (publication_id, member_id, title, link_token_reference, published_at, expires_at)
    VALUES ($1, $2, '합성 발행본', $3, $4, $4::timestamptz + interval '2160 hours')`, [value.publicationId, memberId, value.token, publishedAt]);
  return value;
}

const row = async (publicationId) => (await db.query(
  'SELECT status, deadline_at, items, generated_at, updated_at FROM base_summary WHERE publication_id = $1', [publicationId]))[0] ?? null;
const setRow = (publicationId, status, deadlineAt, items = []) => db.query(
  `INSERT INTO base_summary (base_summary_id, publication_id, status, deadline_at, items, generated_at, updated_at)
   VALUES ($1, $2, $3, $4, $5::jsonb, NULL, $4)`, [randomUUID(), publicationId, status, deadlineAt, JSON.stringify(items)]);
const handled = () => logger.entries.filter((e) => e.entry.event === 'base-summary.handled').map((e) => e.entry);
const run = (publicationId) => handler({ runKey: `BASE_SUMMARY-${publicationId}`, payload: { publicationId } });

test('행 없음·시한 전: PENDING(마감 = 발행 + 10분)을 만들고 사본 필드를 근거로 BASE_SUMMARY를 생성해 DONE으로 쓴다(BR5.1~BR5.4)', async () => {
  const value = await publication();
  await run(value.publicationId);
  const saved = await row(value.publicationId);
  assert.equal(saved.status, 'DONE');
  assert.equal(saved.deadline_at.toISOString(), DEADLINE.toISOString());
  assert.deepEqual(saved.items, gate.output.items);
  assert.equal(saved.generated_at.toISOString(), now.toISOString());
  assert.equal(gate.requests.length, 1);
  const request = gate.requests[0];
  assert.deepEqual({ feature: request.feature, model: request.model, userText: request.userText, publicationText: request.publicationText,
    instruction: request.instruction }, { feature: 'BASE_SUMMARY', model: 'HAIKU', userText: null, publicationText: null,
    instruction: BASE_SUMMARY_INSTRUCTION });
  assert.equal(request.sources[0].sourceId, `${value.items[0].publishedItemId}/workFacts[0]`);
  assert.equal(request.sources.at(-1).sourceId, `${value.items[1].publishedItemId}/body`);
  assert.ok(!JSON.stringify(request).includes(AI_DRAFT_MARKER), 'aiDraft는 근거가 아니다');
  const [entry] = handled();
  assert.deepEqual({ ...entry, durationMs: 0 }, { event: 'base-summary.handled', publicationId: value.publicationId, outcome: 'DONE',
    failure: null, itemCount: 3, droppedCount: 1, durationMs: 0 });
  assert.ok(!JSON.stringify(logger.entries).includes('요약 하나'), '로그에 항목 글이 없다');
});

test('남은 항목이 0개면 FAILED로 쓴다(BR5.4). 행이 PENDING이고 마감 전이면 생성만 한다', async () => {
  const value = await publication();
  await setRow(value.publicationId, 'PENDING', new Date('2026-11-02T03:20:00.000Z'));
  gate.output = { items: [], droppedCount: 4 };
  await run(value.publicationId);
  const saved = await row(value.publicationId);
  assert.equal(saved.status, 'FAILED');
  assert.deepEqual(saved.items, []);
  assert.equal(saved.generated_at, null);
  assert.equal(saved.deadline_at.toISOString(), '2026-11-02T03:20:00.000Z', '있는 행의 마감은 그대로다');
  assert.equal(handled()[0].outcome, 'FAILED');
  assert.equal(handled()[0].droppedCount, 4);
});

test('처리 중 발행본이 지워지면 결과를 버리고 행도 없다(BR5.4·BR9.1, FR14.10)', async () => {
  const value = await publication();
  gate.onGenerate = () => db.query('DELETE FROM publication WHERE publication_id = $1', [value.publicationId]);
  await run(value.publicationId);
  assert.equal(await row(value.publicationId), null);
  assert.equal(handled()[0].outcome, 'DISCARDED');
});

test('마감이 지난 PENDING·DONE·FAILED·시한 지난 행 없음·발행본 없음이면 생성하지 않고 끝낸다(BR5.3)', async () => {
  const cases = [];
  const expired = await publication();
  await setRow(expired.publicationId, 'PENDING', new Date('2026-11-02T03:00:30.000Z'));
  cases.push(expired);
  const done = await publication();
  await setRow(done.publicationId, 'DONE', DEADLINE, [citedItem('예전 요약')]);
  cases.push(done);
  const failed = await publication();
  await setRow(failed.publicationId, 'FAILED', DEADLINE);
  cases.push(failed);
  const late = await publication(new Date('2026-11-02T02:00:00.000Z'));
  cases.push(late);
  const gone = await publication();
  access.remove(gone.publicationId);
  cases.push(gone);
  for (const value of cases) await run(value.publicationId);
  assert.equal(gate.requests.length, 0);
  assert.deepEqual(handled().map((e) => e.outcome), ['SKIPPED', 'SKIPPED', 'SKIPPED', 'SKIPPED', 'SKIPPED']);
  assert.equal((await row(done.publicationId)).items[0].text, '예전 요약', 'DONE 행은 그대로다');
  assert.equal(await row(late.publicationId), null, '시한이 지났으면 행을 만들지 않는다');
  assert.equal(await row(gone.publicationId), null);
});

test('AiProviderError·AiInputTooLarge·사본 모양 오류는 FAILED로 쓰고 던지지 않는다(시도 1회, BR5.5)', async () => {
  const failures = [
    [new AiProviderError('CALL_FAILED', { failure: 'API_STATUS', status: 500 }), 'AiProviderError'],
    [new AiInputTooLarge(), 'AiInputTooLarge'],
  ];
  for (const [error, name] of failures) {
    const value = await publication();
    gate.failWith = error;
    await run(value.publicationId);
    assert.equal((await row(value.publicationId)).status, 'FAILED');
    assert.equal(handled().at(-1).outcome, 'FAILED');
    assert.equal(handled().at(-1).failure, name);
  }
  gate.failWith = null;
  const broken = await publication();
  access.put({ ...broken, items: [{ ...broken.items[0], snapshot: { workFacts: '한 줄' } }] });
  await run(broken.publicationId);
  assert.equal((await row(broken.publicationId)).status, 'FAILED');
  assert.equal(handled().at(-1).failure, 'SnapshotShapeError');
  const empty = await publication();
  access.put({ ...empty, items: [{ ...empty.items[1], snapshot: { body: '   ' } }] });
  await run(empty.publicationId);
  assert.equal(handled().at(-1).failure, 'NoSummarySources');
  assert.equal(gate.requests.length, 2, '근거가 없으면 게이트를 부르지 않는다');
});

test('겹친 두 실행은 둘 다 생성하고 늦은 DONE이 먼저 DONE을 덮는다(C-02 한계). FAILED가 된 뒤의 늦은 결과는 버린다', async () => {
  const value = await publication();
  let arrived = 0;
  let release;
  const both = new Promise((resolve) => { release = resolve; });
  gate.onGenerate = async () => {
    arrived += 1;
    if (arrived === 2) release();
    await both;
  };
  let call = 0;
  const outputs = [{ items: [citedItem('첫 실행')], droppedCount: 0 }, { items: [citedItem('둘째 실행')], droppedCount: 0 }];
  const original = gate.generate;
  gate.generate = async (request) => { const output = outputs[call++]; await original(request); return output; };
  await Promise.all([run(value.publicationId), run(value.publicationId)]);
  assert.equal(gate.requests.length, 2);
  const saved = await row(value.publicationId);
  assert.equal(saved.status, 'DONE');
  assert.equal(saved.items.length, 1);
  assert.deepEqual(handled().map((e) => e.outcome), ['DONE', 'DONE']);

  const failedLater = await publication();
  gate.generate = original;
  gate.onGenerate = () => db.query("UPDATE base_summary SET status = 'FAILED' WHERE publication_id = $1", [failedLater.publicationId]);
  await run(failedLater.publicationId);
  assert.equal((await row(failedLater.publicationId)).status, 'FAILED');
  assert.equal(handled().at(-1).outcome, 'DISCARDED');
});

test('마감이 생성 중에 지나면 결과를 버린다. DB 오류는 로그 뒤 다시 던진다(NFR5.5)', async () => {
  const value = await publication();
  gate.onGenerate = () => { now = new Date('2026-11-02T03:10:00.000Z'); };
  await run(value.publicationId);
  assert.equal((await row(value.publicationId)).status, 'PENDING', '마감이 지난 결과는 쓰지 않는다(읽을 때 FAILED로 판정)');
  assert.equal(handled().at(-1).outcome, 'DISCARDED');

  const brokenDb = { manager: { query: async () => { throw Object.assign(new Error('connection terminated'), { name: 'QueryFailedError' }); } } };
  const failing = createBaseSummaryHandler({ dataSource: brokenDb, publicationAccess: access, gate, clock: () => now, logger });
  await assert.rejects(failing({ runKey: 'BASE_SUMMARY-x', payload: { publicationId: value.publicationId } }), /connection terminated/);
  assert.deepEqual({ ...handled().at(-1), durationMs: 0 }, { event: 'base-summary.handled', publicationId: value.publicationId, outcome: 'ERROR',
    failure: 'QueryFailedError', itemCount: 0, droppedCount: 0, durationMs: 0 });
  await assert.rejects(handler({ runKey: 'BASE_SUMMARY-y', payload: {} }), TypeError);
});

test('저장 때 행 잠금을 기다리는 사이 마감이 지나면 DONE을 쓰지 않고 버린다(C-02 late-result, BR5.4)', { timeout: 10_000 }, async () => {
  const value = await publication();
  // 생성 중에 다른 연결이 요약 행을 잠가 두어, 처리기가 결과 저장에서 기다리게 한다.
  const blocker = db.createQueryRunner();
  gate.onGenerate = async () => {
    await blocker.connect();
    await blocker.startTransaction();
    await blocker.query('SELECT publication_id FROM base_summary WHERE publication_id = $1 FOR UPDATE', [value.publicationId]);
  };
  let running;
  try {
    running = run(value.publicationId);
    let waiting = false;
    for (let tries = 0; tries < 300 && !waiting; tries++) {
      waiting = (await db.query(`SELECT pid FROM pg_stat_activity
        WHERE datname = current_database() AND pid <> pg_backend_pid() AND wait_event_type = 'Lock' AND query LIKE '%base_summary%'`)).length > 0;
      if (!waiting) await delay(10);
    }
    assert.ok(waiting, '처리기가 결과 저장의 행 잠금에서 기다려야 한다');
    now = new Date(DEADLINE.getTime() + 1);
    await blocker.commitTransaction();
    await running;
  } finally {
    if (blocker.isTransactionActive) await blocker.rollbackTransaction();
    await running?.catch(() => undefined);
    await blocker.release();
  }
  const saved = await row(value.publicationId);
  assert.equal(saved.status, 'PENDING', '마감 뒤 결과는 쓰지 않는다(읽을 때 FAILED로 판정)');
  assert.deepEqual(saved.items, []);
  assert.equal(handled().at(-1).outcome, 'DISCARDED');
});

// 새 Catch NC2 — 기본 요약 지시 끝의 작성자 말 옮기기 문장(BR5.1, AC6.5.3·AC8.1.2).
// 먼저 정한 시나리오: 기본 요약 생성 요청의 지시를 본다. 요약 말투는 빌드와 시험의 다시 재기가 판정하고, 이 시험은 문장이 붙었는지까지만 본다.
// - 기대: 지시는 지금 문장 뒤에 AUTHOR_MATERIAL_VOICE_INSTRUCTION으로 끝나고, 근거 딱지는 둘뿐이다.
// - 실패 조건: 문장이 없음, 딱지가 바뀜.

test('NC2 AC8.1.2·AC6.5.3 기본 요약 지시는 작성자 말 옮기기 문장으로 끝나고 근거 딱지는 둘뿐이다(BR5.1)', async () => {
  const value = await publication();
  await run(value.publicationId);
  const { instruction } = gate.requests[0];
  assert.equal(instruction, BASE_SUMMARY_INSTRUCTION);
  assert.ok(instruction.startsWith('자료를 다 읽기 전에 발행본 전체를 파악하도록'), '지금 지시가 앞에 그대로 있다');
  assert.ok(instruction.endsWith(` ${AUTHOR_MATERIAL_VOICE_INSTRUCTION}`));
  assert.deepEqual(Object.values(SOURCE_LABELS), ['GitHub 기록 원문', '작성자 자료 원문']);
});

// U5 기본 요약 읽기·[다시 만들기](계약 C-12·C-11 owner-summary, 기능 설계 W4~W6·BR6·BR7, security-design NFR1.1·NFR1.2,
// reliability-design NFR5.4). 앱 등록(RagAnswerModule 조립)은 rag-answer-app.test.cjs가 본다.
// 실제 앱 조립(공통 Guard·오류 필터·개발 로그인, U5 등록만 뺌)·테스트 DB·실제 로컬 HTTP를 쓰고, 링크 판정·사본(C-10)·AiRun(C-02)·하루 제한(C-03)은 대역이다.
// 기대 결과는 기능 명세 「주요 시나리오와 확인」의 요약·다시 만들기 행들이다.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { after, before, beforeEach, test } = require('node:test');
const { isValidRunKey } = require('../../dist/ai-run/ai-run-spec');
const { DailyRunLimit } = require('../../dist/daily-run-limit/daily-run-limit');
const { InMemoryQuestionCounter } = require('../../dist/rag-answer/question-counter');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const { APP_SETTINGS, setEnv } = require('../u2/support.cjs');
const { citedItem, counterSlot, putPublication, startRagAnswerApp } = require('./support.cjs');

const PUBLISHED_AT = new Date('2026-11-02T03:00:00.000Z');
let now;
let app;
let db;
let restore;
before(async () => {
  restore = setEnv({ ...APP_SETTINGS, CATCHU_QUEUE_REDIS_URL: undefined });
  app = await startRagAnswerApp({ clock: () => now, counter: counterSlot(new InMemoryQuestionCounter()) });
  db = await openTestDataSource();
});
after(async () => { await app?.server.app.close(); await db?.destroy(); restore?.(); });
beforeEach(async () => {
  await resetTestDatabase(db);
  now = new Date('2026-11-02T03:05:00.000Z');
  app.fakes.aiRun.reset();
  app.fakes.dailyRunLimit.reset();
  app.fakes.logger.entries.length = 0;
});

/** 개발 로그인 회원의 발행본을 DB(외래 키 부모)와 메모리 사본 둘 다에 넣는다. */
async function ownedPublication(member, overrides = {}) {
  const memberId = member?.memberId ?? (await app.server.login()).memberId;
  const value = putPublication(app.fakes.access, { ownerMemberId: memberId, publishedAt: PUBLISHED_AT, ...overrides });
  await db.query(`INSERT INTO publication (publication_id, member_id, title, link_token_reference, published_at, expires_at, stopped_at)
    VALUES ($1, $2, '합성 발행본', $3, $4, $4::timestamptz + interval '2160 hours', $5)`,
  [value.publicationId, memberId, value.token, value.publishedAt, value.stoppedAt]);
  return value;
}
const setRow = (publicationId, status, deadlineAt, items = []) => db.query(
  `INSERT INTO base_summary (base_summary_id, publication_id, status, deadline_at, items, generated_at, updated_at)
   VALUES ($1, $2, $3, $4, $5::jsonb, $6, $4)`,
  [randomUUID(), publicationId, status, deadlineAt, JSON.stringify(items), status === 'DONE' ? deadlineAt : null]);
const row = async (publicationId) => (await db.query(
  'SELECT status, deadline_at, items, generated_at FROM base_summary WHERE publication_id = $1', [publicationId]))[0] ?? null;
const recipient = (token, grant) => {
  const headers = grant ? { 'X-Link-Grant': grant } : {};
  return fetch(`${app.server.url}/v1/public/links/${token}/summary`, { headers }).then(async (r) => ({ status: r.status, body: await r.json() }));
};
const owner = (token, publicationId) => app.server.call('GET', `/publications/${publicationId}/summary`, { token });
const regenerate = (token, publicationId) => app.server.call('POST', `/publications/${publicationId}/summary/regenerate`, { token });

test('받은 사람: DONE이면 항목, PENDING·FAILED면 빈 목록과 상태만 받는다(BR6.3)', async () => {
  const items = [citedItem('요약 항목')];
  const done = await ownedPublication();
  await setRow(done.publicationId, 'DONE', new Date('2026-11-02T03:10:00.000Z'), items);
  assert.deepEqual(await recipient(done.token), { status: 200, body: { status: 'DONE', items } });
  const pending = await ownedPublication();
  await setRow(pending.publicationId, 'PENDING', new Date('2026-11-02T03:10:00.000Z'));
  assert.deepEqual(await recipient(pending.token), { status: 200, body: { status: 'PENDING', items: [] } });
  const failed = await ownedPublication();
  await setRow(failed.publicationId, 'FAILED', new Date('2026-11-02T03:10:00.000Z'), items);
  assert.deepEqual(await recipient(failed.token), { status: 200, body: { status: 'FAILED', items: [] } });
});

test('받은 사람: 중지 링크는 404, 비밀번호 링크는 grant 없으면 401이고 요약을 읽지 않는다(BR6.1, AC4.2.5)', async () => {
  const stopped = await ownedPublication(null, { stoppedAt: new Date('2026-11-02T03:01:00.000Z') });
  await setRow(stopped.publicationId, 'DONE', new Date('2026-11-02T03:10:00.000Z'), [citedItem('요약')]);
  assert.deepEqual(await recipient(stopped.token), { status: 404, body: { code: 'LINK_UNAVAILABLE', message: '이 링크는 열람할 수 없습니다.' } });
  assert.equal((await recipient('no-such-token')).status, 404);
  const locked = await ownedPublication(null, { passwordProtected: true });
  assert.equal((await recipient(locked.token)).body.code, 'LINK_PASSWORD_REQUIRED');
  const grant = app.fakes.access.issueGrant(locked.publicationId, new Date('2026-11-02T05:00:00.000Z'));
  assert.deepEqual(await recipient(locked.token, grant), { status: 200, body: { status: 'PENDING', items: [] } });
});

test('행이 없으면 발행 + 10분 전에는 PENDING, 지나면 FAILED로 보고 행을 만들지 않는다. 지난 PENDING은 FAILED로 저장한다(BR6.2)', async () => {
  const value = await ownedPublication();
  now = new Date('2026-11-02T03:09:59.000Z');
  assert.equal((await recipient(value.token)).body.status, 'PENDING');
  now = new Date('2026-11-02T03:10:00.000Z');
  assert.equal((await recipient(value.token)).body.status, 'FAILED');
  assert.equal(await row(value.publicationId), null);

  const stale = await ownedPublication();
  await setRow(stale.publicationId, 'PENDING', new Date('2026-11-02T03:08:00.000Z'));
  assert.equal((await recipient(stale.token)).body.status, 'FAILED');
  assert.equal((await row(stale.publicationId)).status, 'FAILED', '조건부 UPDATE로 저장했다');
});

test('작성자: 중지 뒤에도 읽고 canRegenerate는 PENDING이 아닐 때 true. 남의 발행본·형식 틀린 ID는 404, 로그인 없음은 401(BR6.4)', async () => {
  const member = await app.server.login();
  const stopped = await ownedPublication(member, { stoppedAt: new Date('2026-11-02T03:01:00.000Z') });
  const items = [citedItem('요약')];
  await setRow(stopped.publicationId, 'DONE', new Date('2026-11-02T03:10:00.000Z'), items);
  assert.deepEqual((await owner(member.token, stopped.publicationId)).body, { status: 'DONE', items, canRegenerate: true });
  const pending = await ownedPublication(member);
  assert.deepEqual((await owner(member.token, pending.publicationId)).body, { status: 'PENDING', items: [], canRegenerate: false });
  now = new Date('2026-11-02T03:11:00.000Z');
  assert.deepEqual((await owner(member.token, pending.publicationId)).body, { status: 'FAILED', items: [], canRegenerate: true });

  const other = await app.server.login();
  for (const response of [await owner(other.token, stopped.publicationId), await regenerate(other.token, stopped.publicationId),
    await owner(member.token, 'not-a-uuid'), await owner(member.token, randomUUID())]) {
    assert.equal(response.status, 404);
    assert.deepEqual(response.body, { code: 'RESOURCE_UNAVAILABLE', message: '현재 열람할 수 없는 자료입니다.' });
  }
  assert.equal(app.fakes.dailyRunLimit.calls.length, 0, '남의 발행본은 횟수를 세지 않는다(BR7.1)');
  assert.equal((await owner(null, stopped.publicationId)).body.code, 'AUTH_REQUIRED');
});

test('다시 만들기: 한 트랜잭션에서 횟수를 쓰고 행을 PENDING(빈 항목·새 마감)으로 쓴 뒤 새 runKey로 한 번 등록하고 202(BR7.2·BR7.3)', async () => {
  const member = await app.server.login();
  const value = await ownedPublication(member);
  await setRow(value.publicationId, 'DONE', new Date('2026-11-02T03:10:00.000Z'), [citedItem('예전 요약')]);
  const response = await regenerate(member.token, value.publicationId);
  assert.equal(response.status, 202);
  assert.deepEqual(response.body, {});
  const saved = await row(value.publicationId);
  assert.deepEqual({ status: saved.status, items: saved.items, generatedAt: saved.generated_at, deadline: saved.deadline_at.toISOString() },
    { status: 'PENDING', items: [], generatedAt: null, deadline: '2026-11-02T03:15:00.000Z' });
  assert.deepEqual(app.fakes.dailyRunLimit.calls.map((c) => [c.memberId, c.kind, c.hasManager]), [[member.memberId, 'BASE_SUMMARY', true]]);
  assert.equal(app.fakes.aiRun.calls.length, 1);
  const [call] = app.fakes.aiRun.calls;
  assert.equal(call.kind, 'BASE_SUMMARY');
  assert.deepEqual(call.payload, { publicationId: value.publicationId });
  assert.ok(isValidRunKey(call.runKey));
  assert.match(call.runKey, new RegExp(`^BASE_SUMMARY-${value.publicationId}-[0-9a-f-]{36}$`));
  assert.deepEqual(app.fakes.logger.entries.map((e) => e.entry),
    [{ event: 'base-summary.regenerate-accepted', publicationId: value.publicationId, enqueue: 'ENQUEUED' }]);
  // PENDING이어도 거부하지 않고 마감만 새로 쓴다(BR7.4). 접수마다 새 runKey다.
  now = new Date('2026-11-02T03:07:00.000Z');
  assert.equal((await regenerate(member.token, value.publicationId)).status, 202);
  assert.equal((await row(value.publicationId)).deadline_at.toISOString(), '2026-11-02T03:17:00.000Z');
  assert.notEqual(app.fakes.aiRun.calls[1].runKey, call.runKey);
});

test('하루 한도면 429 DAILY_LIMIT_REACHED이고 행은 그대로이며 등록하지 않는다(BR7.2)', async () => {
  const member = await app.server.login();
  const value = await ownedPublication(member);
  await setRow(value.publicationId, 'FAILED', new Date('2026-11-02T03:10:00.000Z'));
  app.fakes.dailyRunLimit.decision = 'LIMIT_REACHED';
  const response = await regenerate(member.token, value.publicationId);
  assert.equal(response.status, 429);
  assert.deepEqual(response.body, { code: 'DAILY_LIMIT_REACHED', message: '오늘 한도에 도달했습니다' });
  assert.equal((await row(value.publicationId)).status, 'FAILED');
  assert.equal(app.fakes.aiRun.calls.length, 0);
});

test('등록이 실패해도 202이고 경고를 남긴다(상태는 시한으로 FAILED, BR7.3). 행이 없던 발행본도 받는다', async () => {
  const member = await app.server.login();
  const value = await ownedPublication(member);
  app.fakes.aiRun.result = 'ENQUEUE_FAILED';
  assert.equal((await regenerate(member.token, value.publicationId)).status, 202);
  assert.equal((await row(value.publicationId)).status, 'PENDING');
  assert.deepEqual(app.fakes.logger.entries, [{ level: 'warn',
    entry: { event: 'base-summary.regenerate-accepted', publicationId: value.publicationId, enqueue: 'ENQUEUE_FAILED' } }]);
  now = new Date('2026-11-02T03:15:00.000Z');
  assert.equal((await owner(member.token, value.publicationId)).body.status, 'FAILED', '10분 뒤 읽으면 FAILED');
});

test('횟수 쓰기와 행 쓰기는 같은 트랜잭션이라 행 쓰기가 실패하면 횟수도 되돌아간다(BR7.2, C-03 manager)', async () => {
  const member = await app.server.login();
  // 메모리 사본에만 있고 DB에는 없는 발행본: 행 쓰기가 외래 키로 실패한다.
  const ghost = putPublication(app.fakes.access, { ownerMemberId: member.memberId, publishedAt: PUBLISHED_AT });
  const real = new DailyRunLimit(db);
  app.fakes.dailyRunLimit.delegate = (memberId, kind, at, manager) => real.consume(memberId, kind, at, manager);
  const response = await regenerate(member.token, ghost.publicationId);
  assert.equal(response.status, 500);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM daily_execution_count WHERE member_id = $1', [member.memberId]))[0].n, 0);
  assert.equal(app.fakes.aiRun.calls.length, 0);
  // 같은 대역으로 정상 발행본은 횟수 1이 남는다.
  const value = await ownedPublication(member);
  assert.equal((await regenerate(member.token, value.publicationId)).status, 202);
  assert.equal((await db.query('SELECT count FROM daily_execution_count WHERE member_id = $1', [member.memberId]))[0].count, 1);
});

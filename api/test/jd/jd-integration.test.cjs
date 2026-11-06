// 합성 C10/모델 + 실제 Nest 인증·PostgreSQL·공용 게이트·로컬 큐의 연결 검사. #416 제품 연결 검사는 아니다.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { before, after, beforeEach, test } = require('node:test');
const { Queue } = require('bullmq');
const IORedis = require('ioredis').default;
const { AppModule } = require('../../dist/app.module');
const { AiRun } = require('../../dist/ai-run/ai-run');
const { AI_RUN_QUEUE } = require('../../dist/ai-run/ai-run-spec');
const { DailyRunLimit } = require('../../dist/daily-run-limit/daily-run-limit');
const { AiConsentGate, AI_NOTICE_VERSION } = require('../../dist/ai-consent/ai-consent.gate');
const { createCheckedAiGenerationGate } = require('../../dist/ai-generation/checked-gate');
const { JD_PUBLICATION_ACCESS } = require('../../dist/jd-summary/jd-summary-tokens');
const { JdSummaryRun } = require('../../dist/jd-summary/jd-summary-run.entity');
const { createJdSummaryHandler } = require('../../dist/jd-summary/jd-summary-processor');
const { LinkUnavailable, LinkPasswordRequired } = require('../../dist/publications/publication-access');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const { APP_SETTINGS, setEnv, startApp, expectError } = require('../u2/support.cjs');
const { FAKE_KEY, fragment, blockCitation, messageBody, jsonResponse, recordingFetch, captureLogs } = require('../u2/gate-fixtures.cjs');
const { harness, hit, output, codeIs } = require('./fixtures.cjs');
let db, server, restore, registeredAccess, originalResolve;
const links = new Map();
const access = { async resolveForRecipient(token, grant) {
  const link = links.get(token);
  if (!link || link.stopped) throw new LinkUnavailable();
  if (link.password && grant !== 'synthetic-grant') throw new LinkPasswordRequired();
  return link;
}, async resolveForOwner() { throw new Error('소유자 우회 금지'); }, async readSnapshot() { throw new Error('직접 원문 읽기 금지'); } };
before(async () => {
  restore = setEnv(APP_SETTINGS); db = await openTestDataSource(); server = await startApp(AppModule);
  // 제품 앱이 JD_SUMMARY를 한 번 등록한다. 이 시험의 기존 합성 C10 경계만 시험 프로세스에서 바꾼다.
  registeredAccess = server.app.get(JD_PUBLICATION_ACCESS);
  originalResolve = registeredAccess.resolveForRecipient;
  registeredAccess.resolveForRecipient = access.resolveForRecipient;
});
after(async () => {
  if (registeredAccess) registeredAccess.resolveForRecipient = originalResolve;
  await server?.app.close(); await db?.destroy(); restore?.();
});
beforeEach(async () => { links.clear(); await resetTestDatabase(db); });
const processRun = (h, runId) => createJdSummaryHandler(h.deps)({ runKey: runId, payload: { runId } });
const view = (h, runId) => h.service.detail(h.memberId, 'token', undefined, runId);
async function waitFor(check) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) { if (await check()) return; await new Promise((resolve) => setTimeout(resolve, 25)); }
  throw new Error('합성 큐 실행 완료 시한 초과');
}

test('주입형 실제 Nest 모듈은 Bearer와 grant를 함께 검사하고 C12 접수·목록·상세와 no-store를 제공한다', async () => {
  const h = await harness(db, 'Docker 경험');
  const member = await server.login();
  const created = await server.call('POST', '/jds', { token: member.token, body: { title: 'HTTP JD', body: 'Docker 경험' } });
  await new AiConsentGate(db).record(member.memberId, AI_NOTICE_VERSION, new Date());
  const token = randomUUID(); links.set(token, { publicationId: h.pub.publicationId, ownerMemberId: h.ownerId, expiresAt: h.pub.expiresAt, password: true });
  const path = `/public/links/${token}/jd-summaries`;
  expectError(await server.call('POST', path, { body: { jdId: created.body.jdId } }), 401, 'AUTH_REQUIRED');
  expectError(await server.call('POST', path, { token: member.token, body: { jdId: created.body.jdId } }), 401, 'LINK_PASSWORD_REQUIRED');
  const call = async (method, suffix = '', body) => {
    const response = await fetch(`${server.url}/v1${path}${suffix}`, { method,
      headers: { Authorization: `Bearer ${member.token}`, 'X-Link-Grant': 'synthetic-grant', 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, headers: response.headers, body: await response.json() };
  };
  const accepted = await call('POST', '', { jdId: created.body.jdId }); assert.equal(accepted.status, 202);
  const list = await call('GET'); assert.equal(list.body.items.length, 1); assert.equal(list.body.items[0].title, 'HTTP JD');
  const result = await call('GET', `/${accepted.body.runId}`); assert.equal(result.body.status, 'PENDING');
  assert.equal(result.headers.get('cache-control'), 'no-store');
  links.get(token).stopped = true;
  assert.equal((await call('GET', `/${accepted.body.runId}`)).body.code, 'LINK_UNAVAILABLE');
});

test('실행자·JD·발행본 FK와 실제 연쇄 삭제는 다른 회원 JD를 보존하고 부모 없는 실행을 거부한다', async () => {
  for (const deletion of ['jd', 'publication', 'owner', 'member']) {
    await resetTestDatabase(db);
    const h = await harness(db); const { runId } = await h.accept();
    const run = await db.manager.findOneByOrFail(JdSummaryRun, { runId });
    await assert.rejects(db.manager.insert(JdSummaryRun, { ...run, runId: randomUUID(), memberId: h.ownerId }), (error) => error.code === '23503');
    if (deletion === 'jd') await h.jdService.delete(h.memberId, h.jd.jdId);
    if (deletion === 'publication') await db.query('DELETE FROM publication WHERE publication_id=$1', [h.pub.publicationId]);
    if (deletion === 'owner' || deletion === 'member') await db.query('DELETE FROM member_account WHERE member_id=$1', [deletion === 'owner' ? h.ownerId : h.memberId]);
    assert.equal(await db.manager.count(JdSummaryRun), 0);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM jd_summary_result'))[0].n, 0);
    if (deletion === 'publication' || deletion === 'owner') assert.equal((await h.jdService.detail(h.memberId, h.jd.jdId)).body, h.jd.body);
    if (deletion === 'member' || deletion === 'jd') assert.equal((await db.query('SELECT count(*)::int AS n FROM jd WHERE jd_id=$1', [h.jd.jdId]))[0].n, 0);
  }
});

test('외부 생성 대기 중 삭제 또는 시한 확정과 경합한 늦은 결과는 복원·덮어쓰기를 하지 않는다', async () => {
  for (const scenario of ['delete', 'deadline']) {
    const h = await harness(db, 'one'); const { runId } = await h.accept();
    let release, entered;
    const ready = new Promise((resolve) => { entered = resolve; });
    h.gate.generate = async () => { entered(); return new Promise((resolve) => { release = () => resolve(output()); }); };
    const processing = processRun(h, runId); await ready;
    if (scenario === 'delete') await h.jdService.delete(h.memberId, h.jd.jdId);
    else { h.setNow(new Date('2026-11-04T04:20:00.000Z')); assert.equal((await view(h, runId)).failureCode, 'DEADLINE_EXCEEDED'); }
    release(); await processing;
    if (scenario === 'delete') assert.equal(await db.manager.countBy(JdSummaryRun, { runId }), 0);
    else assert.equal((await view(h, runId)).requirements[0].failureCode, 'DEADLINE_EXCEEDED');
  }
  const h = await harness(db, '잠금 대기'); const { runId } = await h.accept();
  const blocker = db.createQueryRunner(); await blocker.connect(); await blocker.startTransaction();
  try {
    await blocker.query('SELECT run_id FROM jd_summary_run WHERE run_id=$1 FOR UPDATE', [runId]);
    const saving = h.store.write(runId, 0, { status: 'DONE', resultKind: 'EMPTY', failureCode: null,
      evidenceItems: [], unconfirmedPoints: [], interviewQuestions: [] }, h.settings.clock());
    h.setNow(new Date('2026-11-04T04:20:00.000Z'));
    await blocker.commitTransaction();
    assert.equal(await saving, false, '요청 때 시한 전이어도 잠금 취득 뒤에는 다시 판정');
    assert.equal((await view(h, runId)).failureCode, 'DEADLINE_EXCEEDED');
  } finally {
    if (blocker.isTransactionActive) await blocker.rollbackTransaction();
    await blocker.release();
  }
});

test('동시 접수의 마지막 한도는 한 번만 쓰며 전체 처리기 오류는 남은 요구사항을 실패시킨다', async () => {
  const h = await harness(db, 'one\ntwo');
  const limit = new DailyRunLimit(db);
  for (let i = 0; i < 29; i++) await limit.consume(h.memberId, 'JD_SUMMARY', h.settings.clock());
  const attempts = await Promise.allSettled([h.accept(), h.accept()]);
  assert.equal(attempts.filter((result) => result.status === 'fulfilled').length, 1);
  assert.ok(attempts.some((result) => result.status === 'rejected' && codeIs('DAILY_LIMIT_REACHED')(result.reason)));
  const { runId } = attempts.find((result) => result.status === 'fulfilled').value;
  const write = h.store.write.bind(h.store); let calls = 0;
  h.store.write = (...args) => { if (++calls === 2) throw new Error('합성 저장 오류'); return write(...args); };
  await processRun(h, runId);
  const result = await view(h, runId);
  assert.equal(result.failureCode, 'PROCESSING_FAILED');
  assert.deepEqual(result.requirements.map((row) => row.status), ['DONE', 'FAILED']);
});

test('실제 U2 검사 게이트에 합성 Messages 응답을 주입하면 C09 원문 위치와 역할이 DB까지 보존된다', async (t) => {
  captureLogs(t);
  const h = await harness(db, 'Docker 경험');
  const text = 'Docker 이미지 빌드를 줄였다';
  const source = hit({ text, charStart: 11, charEnd: 11 + text.length });
  h.search.search = async () => ({ hits: [source], publicationText: text });
  const recorder = recordingFetch([jsonResponse(messageBody([fragment('근거:\n- '), fragment(text, [blockCitation(0, 0, 1)])]))]);
  const gate = createCheckedAiGenerationGate({ apiKey: FAKE_KEY, fetch: recorder.fetch });
  h.deps.gate = gate;
  const { runId } = await h.accept(); await processRun(h, runId);
  const row = (await view(h, runId)).requirements[0];
  assert.equal(row.resultKind, 'CONTENT'); assert.equal(row.evidenceItems[0].jdRole, 'EVIDENCE');
  const citation = row.evidenceItems[0].citations[0];
  assert.equal(citation.quote, text); assert.equal(citation.sourceId, source.chunkId);
  assert.deepEqual(citation.location, { publishedItemId: source.publishedItemId, fieldPath: 'body', charStart: 11, charEnd: 11 + text.length, pdfPage: null });
  assert.equal(recorder.requests.length, 1);
});

test('로컬 Valkey C02 큐는 커밋된 runId를 실제 등록 처리기로 한 번 전달한다',
  { skip: process.env.CATCHU_TEST_REDIS_URL ? false : 'U10 전용 로컬 큐 설정이 없음' }, async (t) => {
    captureLogs(t);
    const h = await harness(db, 'one');
    const prefix = `u10-jd-${randomUUID()}`;
    const aiRun = new AiRun({ redisUrl: process.env.CATCHU_TEST_REDIS_URL, prefix });
    const connection = new IORedis(process.env.CATCHU_TEST_REDIS_URL, { maxRetriesPerRequest: null });
    const queue = new Queue(AI_RUN_QUEUE, { connection, prefix });
    t.after(async () => { await aiRun.close(); await queue.obliterate({ force: true }); await queue.close(); connection.disconnect(); });
    aiRun.registerHandler('JD_SUMMARY', createJdSummaryHandler(h.deps)); aiRun.start();
    h.aiRun.enqueueAfterCommit = aiRun.enqueueAfterCommit.bind(aiRun);
    const { runId } = await h.accept();
    await waitFor(async () => (await view(h, runId)).status === 'DONE');
    assert.equal(await aiRun.enqueueAfterCommit('JD_SUMMARY', runId, { runId }), 'ENQUEUED');
    await waitFor(async () => (await queue.getJob(runId))?.getState().then((state) => state === 'completed'));
    assert.equal(h.calls.filter((call) => call[0] === 'generate').length, 1);
    assert.deepEqual((await queue.getJob(runId)).data, { runId });
  });

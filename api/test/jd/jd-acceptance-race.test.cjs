// #474 좁은 회귀: 실제 격리 PostgreSQL + 시험용 C10/검색/큐. 제품 제공자 등록·외부 AI 호출은 하지 않는다.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { before, after, beforeEach, test } = require('node:test');
const { QueryFailedError } = require('typeorm');
const { Logger } = require('@nestjs/common');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const { writeErrorResponse } = require('../../dist/common/errors/api-exception.filter');
const { LinkUnavailable } = require('../../dist/publications/publication-access');
const { Publication } = require('../../dist/publications/publication.entity');
const { JdSummaryResult } = require('../../dist/jd-summary/jd-summary-result.entity');
const { harness, codeIs, runCount } = require('./fixtures.cjs');

const PUBLICATION_FK = 'fk_jd_summary_run_publication_id';
let db;
before(async () => { Logger.overrideLogger(false); db = await openTestDataSource(); });
after(async () => { await db?.destroy(); });
beforeEach(async () => resetTestDatabase(db));

/** 실제 공용 오류 응답 함수에 응답 어댑터만 주입한다. HTTP 서버 연결 검사는 아니다. */
function responseOf(error) {
  const response = {};
  writeErrorResponse({ setHeader() {}, reply(_response, body, status) { Object.assign(response, { body, status }); } },
    { method: 'POST', route: { path: '/v1/public/links/:token/jd-summaries' } }, {}, error);
  return response;
}

async function rejectedResponse(request) {
  let failure;
  await assert.rejects(request, (error) => { failure = error; return true; });
  return { ...responseOf(failure), error: failure };
}

async function assertRolledBack(h) {
  const [rows] = await db.query(`SELECT
    (SELECT count(*)::int FROM jd_summary_run) AS runs,
    (SELECT count(input_copy)::int FROM jd_summary_run) AS copies,
    (SELECT count(*)::int FROM jd_summary_result) AS results`);
  assert.deepEqual(rows, { runs: 0, copies: 0, results: 0 });
  assert.equal(await runCount(db, h.memberId), 0);
  assert.equal(h.queued.length, 0);
  assert.equal(h.logs.some((event) => event.stage === 'accepted'), false);
}

/** 실제 driverError를 관찰한다. afterInsert는 정상 run/결과를 쓴 뒤 DB 오류를 일으키는 시험 지점이다. */
function observeTransaction(t, afterInsert) {
  const originalTransaction = db.transaction.bind(db);
  const errors = [];
  t.mock.method(db, 'transaction', async (work) => {
    try {
      return await originalTransaction(async (manager) => {
        const originalInsert = manager.insert.bind(manager);
        manager.insert = async (entity, rows) => {
          const result = await originalInsert(entity, rows);
          if (afterInsert) await afterInsert(manager, entity, rows);
          return result;
        };
        return work(manager);
      });
    } catch (error) { errors.push(error); throw error; }
  });
  return errors;
}

test('C10 통과 뒤 실제 발행본 삭제의 정확한 FK 오류만 404이고 접수와 하루 차감은 모두 롤백한다', async (t) => {
  const h = await harness(db);
  const errors = observeTransaction(t);
  h.search.getIndexState = async () => {
    await db.query('DELETE FROM publication WHERE publication_id=$1', [h.pub.publicationId]);
    return 'DONE';
  };
  const response = await rejectedResponse(h.accept);
  assert.equal(response.status, 404); assert.equal(response.body.code, 'LINK_UNAVAILABLE');
  assert.equal(errors.length, 1); assert.ok(errors[0] instanceof QueryFailedError);
  assert.equal(errors[0].driverError.code, '23503');
  assert.equal(errors[0].driverError.constraint, PUBLICATION_FK);
  await assertRolledBack(h);
  assert.deepEqual(h.logs.map((event) => event.stage), ['persistence-failed']);
});

test('실제 다른 FK 23503은 500을 유지하고 이미 쓴 run/inputCopy/결과와 하루 차감도 롤백한다', async (t) => {
  const h = await harness(db);
  let storedBeforeFailure = false;
  const errors = observeTransaction(t, async (manager, entity) => {
    if (entity !== JdSummaryResult) return;
    const [rows] = await manager.query(`SELECT
      (SELECT count(input_copy)::int FROM jd_summary_run) AS copies,
      (SELECT count(*)::int FROM jd_summary_result) AS results`);
    storedBeforeFailure = rows.copies === 1 && rows.results === 2;
    await manager.query(`INSERT INTO jd_summary_result (result_id,run_id,requirement_index,source_line_number,jd_line)
      VALUES ($1,$2,0,1,$3)`, [randomUUID(), randomUUID(), '합성 고아 결과']);
  });
  const response = await rejectedResponse(h.accept);
  assert.equal(response.status, 500); assert.equal(response.body.code, 'INTERNAL_ERROR');
  assert.equal(storedBeforeFailure, true);
  assert.ok(errors[0] instanceof QueryFailedError);
  assert.equal(errors[0].driverError.code, '23503');
  assert.equal(errors[0].driverError.constraint, 'fk_jd_summary_result_run_id');
  assert.equal(response.error, errors[0], '다른 FK 오류 객체를 변환하지 않는다');
  await assertRolledBack(h);
});

test('FK가 아닌 실제 DB 오류도 500을 유지하며 부분 저장과 차감을 남기지 않는다', async (t) => {
  const h = await harness(db);
  const errors = observeTransaction(t, async (manager, entity) => {
    if (entity === JdSummaryResult) await manager.query('SELECT 1 / 0');
  });
  const response = await rejectedResponse(h.accept);
  assert.equal(response.status, 500); assert.equal(response.body.code, 'INTERNAL_ERROR');
  assert.ok(errors[0] instanceof QueryFailedError);
  assert.equal(errors[0].driverError.code, '22012');
  assert.equal(response.error, errors[0]);
  await assertRolledBack(h);
});

test('SQL·메시지·상위 속성·부분 일치나 다른 SQLSTATE로 발행본 삭제를 추측하지 않는다', async (t) => {
  const h = await harness(db);
  const driver = (fields) => Object.assign(new Error(`23503 ${PUBLICATION_FK}`), fields);
  const misleadingSql = `SELECT '23503 ${PUBLICATION_FK}'`;
  const cases = [
    new QueryFailedError(misleadingSql, [], driver({ code: '23505', constraint: PUBLICATION_FK })),
    new QueryFailedError(misleadingSql, [], driver({ code: '23503', constraint: `${PUBLICATION_FK}_other` })),
    new QueryFailedError(misleadingSql, [], driver({ code: 23503, constraint: PUBLICATION_FK })),
    new QueryFailedError(misleadingSql, [], driver({})),
    Object.assign(new QueryFailedError(misleadingSql, [], driver({ code: '23505' })), { code: '23503', constraint: PUBLICATION_FK }),
    Object.assign(new Error('합성 일반 오류'), { driverError: { code: '23503', constraint: PUBLICATION_FK } }),
  ];
  let failure;
  t.mock.method(db, 'transaction', async () => { throw failure; });
  for (failure of cases) {
    const response = await rejectedResponse(h.accept);
    assert.equal(response.status, 500); assert.equal(response.body.code, 'INTERNAL_ERROR');
    assert.equal(response.error, failure);
    assert.equal(JSON.stringify(response.body).includes(PUBLICATION_FK), false);
  }
  await assertRolledBack(h);
});

/** 시험용 C10만 DB 상태를 읽는다. 제품 PublicationAccess를 조립하지 않고 readSnapshot은 호출 금지다. */
function useSyntheticAccess(h) {
  h.access.resolveForRecipient = async (_token, _grant, now) => {
    const publication = await db.manager.findOneBy(Publication, { publicationId: h.pub.publicationId });
    if (!publication || publication.stoppedAt !== null || publication.expiresAt <= now) throw new LinkUnavailable();
    return { publicationId: publication.publicationId, ownerMemberId: publication.memberId,
      passwordProtected: false, expiresAt: publication.expiresAt };
  };
}

async function assertCurrentAcceptedThenBlocked(h) {
  const { runId } = await h.accept();
  assert.equal(await runCount(db, h.memberId), 1); assert.equal(h.queued.length, 1);
  const [row] = await db.query('SELECT input_copy, status FROM jd_summary_run WHERE run_id=$1', [runId]);
  assert.equal(row.status, 'PENDING'); assert.equal(row.input_copy.body, h.jd.body);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM jd_summary_result WHERE run_id=$1', [runId]))[0].n, 2);
  await assert.rejects(h.accept(), codeIs('LINK_UNAVAILABLE'));
  await assert.rejects(h.service.detail(h.memberId, 'synthetic-token', undefined, runId), codeIs('LINK_UNAVAILABLE'));
  assert.equal(await runCount(db, h.memberId), 1); assert.equal(h.queued.length, 1);
}

test('C10 판정 후 중지돼도 현재 접수·차감은 허용하고 다음 접수·상세 요청부터 차단한다', async () => {
  const h = await harness(db);
  useSyntheticAccess(h);
  h.search.getIndexState = async () => {
    await db.manager.update(Publication, { publicationId: h.pub.publicationId }, { stoppedAt: h.settings.clock() });
    return 'DONE';
  };
  await assertCurrentAcceptedThenBlocked(h);
});

test('C10 판정 후 만료돼도 현재 접수·차감은 허용하고 다음 접수·상세 요청부터 차단한다', async () => {
  const h = await harness(db);
  useSyntheticAccess(h);
  h.search.getIndexState = async () => { h.setNow(h.pub.expiresAt); return 'DONE'; };
  await assertCurrentAcceptedThenBlocked(h);
});

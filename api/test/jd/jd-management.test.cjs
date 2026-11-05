require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { before, after, beforeEach, test } = require('node:test');
const { AppModule } = require('../../dist/app.module');
const { JdService } = require('../../dist/jd/jd.service');
const { splitRequirements } = require('../../dist/jd/jd-input');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const { APP_SETTINGS, setEnv, startApp, insertMember, expectError } = require('../u2/support.cjs');
const { codeIs, harness, runCount } = require('./fixtures.cjs');
let db, server, restore;
before(async () => { restore = setEnv(APP_SETTINGS); db = await openTestDataSource(); server = await startApp(AppModule); });
after(async () => { await server?.app.close(); await db?.destroy(); restore?.(); });
beforeEach(async () => resetTestDatabase(db));

test('JD 본인 HTTP CRUD는 원문을 보존하고 동의·검색·하루 횟수 없이 동작한다', async () => {
  const member = await server.login();
  const body = { title: '  제목 😀 ', body: '  - Docker\r\n\r\n협업  ' };
  const created = await server.call('POST', '/jds', { token: member.token, body });
  assert.equal(created.status, 201, created.text);
  assert.equal(created.body.body, body.body);
  assert.equal(created.body.title, body.title);
  const id = created.body.jdId;
  const updated = await server.call('PATCH', `/jds/${id}`, { token: member.token, body: { ...body, title: '수정' } });
  assert.equal(updated.status, 200, updated.text);
  assert.equal((await server.call('GET', `/jds/${id}`, { token: member.token })).body.title, '수정');
  assert.equal(await runCount(db, member.memberId), 0);
  assert.equal((await server.call('DELETE', `/jds/${id}`, { token: member.token })).status, 204);
  expectError(await server.call('GET', `/jds/${id}`, { token: member.token }), 404, 'RESOURCE_UNAVAILABLE');
});

test('다른 회원·없는 UUID·잘못된 UUID는 같은 404이고 소유자를 본문으로 바꿀 수 없다', async () => {
  const own = await server.login(), other = await server.login();
  const created = await server.call('POST', '/jds', { token: own.token, body: { title: '비공개', body: '본문' } });
  for (const id of [created.body.jdId, randomUUID(), 'not-a-uuid']) {
    for (const method of ['GET', 'PATCH', 'DELETE']) {
      expectError(await server.call(method, `/jds/${id}`, { token: other.token,
        ...(method === 'PATCH' ? { body: { title: '탈취', body: '내용' } } : {}) }), 404, 'RESOURCE_UNAVAILABLE');
    }
  }
  expectError(await server.call('POST', '/jds', { token: own.token, body: { title: '제목', body: '내용', memberId: other.memberId } }), 422, 'INVALID_INPUT');
});

test('저장 상한은 UTF-16이며 빈값·잘못된 자료형은 422이고 초과 입력은 잘라 저장하지 않는다', async () => {
  const memberId = await insertMember(db), service = new JdService(db);
  await service.create(memberId, { title: '😀'.repeat(100), body: '😀'.repeat(10000) });
  for (const input of [{ title: 'x'.repeat(201), body: 'x' }, { title: 'x', body: 'x'.repeat(20001) }]) {
    await assert.rejects(service.create(memberId, input), codeIs('INPUT_TOO_LARGE'));
  }
  for (const input of [null, [], {}, { title: 3, body: 'x' }, { title: ' ', body: 'x' }, { title: 'x', body: '\r\n ' }]) {
    await assert.rejects(service.create(memberId, input), codeIs('INVALID_INPUT'));
  }
  assert.equal((await service.list(memberId)).items.length, 1);
});

test('목록은 본인 최신순 20개 cursor이며 본문·회원 ID를 노출하지 않는다', async () => {
  const memberId = await insertMember(db), otherId = await insertMember(db), service = new JdService(db);
  for (let i = 0; i < 23; i++) await service.create(memberId, { title: `JD ${i}`, body: '민감한 본문' });
  await service.create(otherId, { title: '타인', body: '타인 본문' });
  const first = await service.list(memberId);
  assert.equal(first.items.length, 20); assert.ok(first.nextCursor);
  assert.deepEqual(Object.keys(first.items[0]).sort(), ['jdId', 'title', 'updatedAt']);
  const second = await service.list(memberId, first.nextCursor);
  assert.equal(second.items.length, 3); assert.equal(second.nextCursor, null);
  assert.equal(new Set([...first.items, ...second.items].map((row) => row.jdId)).size, 23);
  assert.equal((await service.list(otherId, first.nextCursor)).items.length, 0);
  for (const cursor of ['?', Buffer.from('{}').toString('base64url'), 'a'.repeat(257), ['x']]) {
    await assert.rejects(service.list(memberId, cursor), codeIs('INVALID_INPUT'));
  }
});

test('마지막 저장이 남고 기존 실행의 입력 사본은 변경되지 않으며 JD 삭제는 결과를 연쇄 삭제한다', async () => {
  const h = await harness(db);
  const { runId } = await h.accept();
  await h.jdService.update(h.memberId, h.jd.jdId, { title: '새제목', body: '새본문' });
  const rows = await db.query('SELECT input_copy FROM jd_summary_run WHERE run_id=$1', [runId]);
  assert.equal(rows[0].input_copy.body, h.jd.body);
  await h.jdService.delete(h.memberId, h.jd.jdId);
  for (const table of ['jd_summary_run', 'jd_summary_result']) assert.equal((await db.query(`SELECT count(*)::int AS n FROM ${table}`))[0].n, 0);
});

test('요구사항 분리는 CRLF/LF·원문 줄 번호·공백을 보존하고 20줄/2000자 경계를 검사한다', () => {
  assert.deepEqual(splitRequirements({ title: '제목', body: ' 제목처럼 보임\r\n \r\n- 요구사항  \n끝' }), [
    { requirementIndex: 0, sourceLineNumber: 1, jdLine: ' 제목처럼 보임' },
    { requirementIndex: 1, sourceLineNumber: 3, jdLine: '- 요구사항  ' }, { requirementIndex: 2, sourceLineNumber: 4, jdLine: '끝' }]);
  assert.equal(splitRequirements({ title: 'x', body: Array(20).fill('x').join('\n') }).length, 20);
  assert.equal(splitRequirements({ title: 'x', body: '😀'.repeat(1000) })[0].jdLine.length, 2000);
  assert.throws(() => splitRequirements({ title: 'x', body: Array(21).fill('x').join('\n') }), codeIs('INPUT_TOO_LARGE'));
  assert.throws(() => splitRequirements({ title: 'x', body: 'x'.repeat(2001) }), codeIs('INPUT_TOO_LARGE'));
});

test('인증이 없으면 401이며 성공·실패 HTTP 응답은 no-store다', async () => {
  const rejected = await server.call('GET', '/jds');
  expectError(rejected, 401, 'AUTH_REQUIRED'); assert.equal(rejected.headers.get('cache-control'), 'no-store');
  const member = await server.login();
  const response = await server.call('GET', '/jds', { token: member.token });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(response.body, { items: [], nextCursor: null });
});

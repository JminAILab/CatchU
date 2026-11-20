// 발행 프리셋 U1 — 프리셋 저장부터 받은 쪽 읽기·탈퇴까지 끝까지 잇는 시험(이야기 US1·US2·US3.1·US3.3·US3.6·US4.1·US4.2, 계약 P-1~P-6).
//
// 먼저 정한 시나리오·기대 결과·실패 조건(unit-test-instructions 「앞선 사본」·「삭제」 묶음, Bolt 계획 B1). 세부 시험 코드는 구현 뒤 쓴다.
// - 같은 Catch를 담은 프리셋 둘을 API로 만들어 발행하면 받은 링크 사본에 프리셋 칸이 있고, 검색 조각(실제 PublishedIndexWriter)과 받은 링크 읽기(MCP)에는
//   겹친 사본이 한 번만 나온다. 실패 조건: 조각·읽기에 같은 원본이 두 번.
// - 담긴 텍스트 자료를 지우면 그 항목만 프리셋에서 빠지고 발행본 사본은 그대로다(BR6.1).
// - 프리셋이 있는 회원의 탈퇴는 성공하고 프리셋이 남지 않는다(BR6.2). 실패 조건: 탈퇴가 막힘, 프리셋 행이 남음.
//
// 실제 AppModule·테스트 DB·개발 로그인 합성 회원을 쓴다. 조각 나누기는 실제 구현이고, 작업 등록(AiRun)과 파일 저장소는 계약 모양 가짜다
// (임베딩·요약은 돌리지 않는다. 합성 연결이며 실제 처리 성공이 아니다).
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { after, before, beforeEach, test } = require('node:test');
const { AppModule } = require('../../dist/app.module');
const { McpSharedPublicationReader } = require('../../dist/claude-mcp/mcp-shared-publication-reader');
const { WithdrawalService } = require('../../dist/withdrawal/withdrawal.service');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const { WEB_ORIGIN } = require('../u2/support.cjs');
const {
  PUBLISH_SETTINGS, setEnv, startApp, eligibleCatch, insertTextMaterial, consent, fakeAiRun, bindFakes, body, catchItem, textItem, tokenOf,
  recipientGet,
} = require('../publications/support.cjs');

let server, db, restore, unbind, withdrawalFiles;
before(async () => {
  restore = setEnv(PUBLISH_SETTINGS);
  server = await startApp(AppModule);
  db = await openTestDataSource();
  const withdrawal = server.app.get(WithdrawalService);
  withdrawalFiles = withdrawal.files;
  withdrawal.files = { async deletePrefix() {} };
});
after(async () => {
  if (server) server.app.get(WithdrawalService).files = withdrawalFiles;
  await server?.app.close();
  await db?.destroy();
  restore?.();
});
beforeEach(async () => {
  await resetTestDatabase(db);
  unbind?.();
  unbind = bindFakes(server.app, { aiRun: fakeAiRun(db) });
});

async function member() {
  const value = await server.login(`preset-chain-${randomUUID()}`);
  await consent(server.app, value.memberId);
  return value;
}
const createPreset = async (token, name, items) => {
  const response = await server.call('POST', '/presets', { token, body: { name, items } });
  assert.equal(response.status, 201, response.text);
  return response.body.presetId;
};

test('같은 Catch가 든 프리셋 둘로 발행하면 사본에 프리셋 칸이 있고, 조각과 받은 링크 읽기에는 겹친 사본이 한 번만 나온다', async () => {
  const a = await member();
  const shared = await eligibleCatch(db, a.memberId, { title: '[합성] 겹친 작업', workFacts: ['[합성] 겹친 사실'] });
  const backend = await insertTextMaterial(db, a.memberId, { title: '[합성] 백엔드 자료', body: '[합성] 백엔드 본문' });
  const team = await insertTextMaterial(db, a.memberId, { title: '[합성] 협업 자료', body: '[합성] 협업 본문' });
  const first = await createPreset(a.token, '백엔드', [catchItem(shared), textItem(backend)]);
  const second = await createPreset(a.token, '협업', [textItem(team), catchItem(shared)]);
  const response = await server.call('POST', '/publications', { token: a.token, body: body([first, second]) });
  assert.equal(response.status, 201, response.text);
  const { publicationId } = response.body;

  const opened = await recipientGet(server, tokenOf(response.body.url));
  assert.equal(opened.status, 200, opened.text);
  assert.deepEqual(opened.body.items.map((item) => [item.position, item.title, item.presetOrdinal, item.presetName]), [
    [1, '[합성] 겹친 작업', 1, '백엔드'], [2, '[합성] 백엔드 자료', 1, '백엔드'], [3, '[합성] 협업 자료', 2, '협업'], [4, '[합성] 겹친 작업', 2, '협업']]);

  // 실제 조각 나누기: 겹친 사본(4번)의 조각은 없고 seq는 1부터 빈틈없다(BR4.2).
  const chunks = await db.query(`SELECT c.seq, i.position FROM published_chunk c JOIN published_item i ON i.published_item_id = c.published_item_id
    WHERE c.publication_id = $1 ORDER BY c.seq`, [publicationId]);
  assert.ok(chunks.length > 0);
  assert.deepEqual([...new Set(chunks.map((chunk) => chunk.position))], [1, 2, 3]);
  assert.deepEqual(chunks.map((chunk) => chunk.seq), chunks.map((_, index) => index + 1));
  const overlap = await db.query("SELECT count(*)::int AS n FROM published_chunk WHERE publication_id = $1 AND text = '[합성] 겹친 사실'", [publicationId]);
  assert.equal(overlap[0].n, 1, '같은 원본의 조각은 한 벌');

  // 받은 링크 읽기(MCP): 앞선 사본만, 프리셋 이름 없이(BR4.4).
  const page = await server.app.get(McpSharedPublicationReader).readPage(response.body.url);
  assert.deepEqual(page.items.map((item) => item.position), [1, 2, 3]);
  for (const item of page.items) assert.deepEqual(Object.keys(item).sort(), ['content', 'itemKind', 'position', 'title'], '프리셋 구분 칸이 없다');
});

test('담긴 텍스트 자료를 지우면 그 항목만 프리셋에서 빠지고, 이미 만든 발행본 사본은 그대로다(BR6.1, US4.1)', async () => {
  const a = await member();
  const kept = await insertTextMaterial(db, a.memberId, { title: '[합성] 남는 자료' });
  const removed = await insertTextMaterial(db, a.memberId, { title: '[합성] 지울 자료', body: '[합성] 지울 본문' });
  const presetId = await createPreset(a.token, '자료', [textItem(removed), textItem(kept)]);
  const published = await server.call('POST', '/publications', { token: a.token, body: body([presetId]) });
  assert.equal(published.status, 201, published.text);
  assert.equal((await server.call('DELETE', `/text-materials/${removed}`, { token: a.token })).status, 204);
  const preset = await server.call('GET', `/presets/${presetId}`, { token: a.token });
  assert.deepEqual(preset.body.items.map((item) => item.sourceId), [kept]);
  const detail = await server.call('GET', `/publications/${published.body.publicationId}`, { token: a.token });
  assert.deepEqual(detail.body.snapshot.items.map((item) => [item.title, item.snapshot.body]),
    [['[합성] 지울 자료', '[합성] 지울 본문'], ['[합성] 남는 자료', '[합성] 본문']]);
});

test('프리셋이 있는 회원의 탈퇴는 성공하고 그 회원의 프리셋·항목이 남지 않으며, 다른 회원의 프리셋은 그대로다(BR6.2, US4.2)', async () => {
  const leaving = await member();
  const staying = await member();
  const leavingText = await insertTextMaterial(db, leaving.memberId);
  const stayingText = await insertTextMaterial(db, staying.memberId);
  await createPreset(leaving.token, '떠나는 회원', [textItem(leavingText)]);
  const kept = await createPreset(staying.token, '남는 회원', [textItem(stayingText)]);
  const response = await server.call('DELETE', '/me', { token: leaving.token, origin: WEB_ORIGIN });
  assert.equal(response.status, 204, response.text);
  assert.deepEqual(await db.query('SELECT preset_id FROM preset'), [{ preset_id: kept }]);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM preset_item'))[0].n, 1);
});

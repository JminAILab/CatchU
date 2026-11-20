// 발행 프리셋 U1 — 「앞선 사본인가」(계약 P-3·P-4, 규칙 BR4.1·BR4.5, NFR4.3, 기능 설계 검토 R-03·R-04).
//
// 먼저 정한 시나리오·기대 결과·실패 조건(unit-test-instructions 「앞선 사본」 묶음, team.md Testing Posture). 세부 시험 코드는 구현 뒤 쓴다.
// - 판정 함수: 같은 (종류, 원본 ID) 가운데 position이 가장 작은 항목만 참. 입력 순서와 상관없다.
// - api 안 사본 읽기(C-10 readSnapshot): 겹친 사본은 isFirstCopy false로 싣고, 원본 ID(source_id)는 싣지 않는다.
// - 받은 사람 열람(GET /v1/public/links/{token})과 작성자 상세(GET /v1/publications/{id}): 프리셋 칸 둘은 싣고 isFirstCopy·sourceId는 없다.
//   실패 조건: 응답에 isFirstCopy·sourceId가 나옴.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { after, before, beforeEach, test } = require('node:test');
const { AppModule } = require('../../dist/app.module');
const { PUBLICATION_ACCESS } = require('../../dist/publications/publications.module');
const { markFirstCopies, snapshotResponse } = require('../../dist/publications/published-snapshot');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const {
  PUBLISH_SETTINGS, setEnv, startApp, eligibleCatch, insertTextMaterial, consent, fakeAiRun, fakeIndexWriter, bindFakes, body, catchItem, textItem,
  insertPreset, tokenOf, recipientGet,
} = require('./support.cjs');

let server, db, restore, unbind;
before(async () => {
  restore = setEnv(PUBLISH_SETTINGS);
  server = await startApp(AppModule);
  db = await openTestDataSource();
});
after(async () => {
  await server?.app.close();
  await db?.destroy();
  restore?.();
});
beforeEach(async () => {
  await resetTestDatabase(db);
  unbind?.();
  unbind = bindFakes(server.app, { aiRun: fakeAiRun(db), indexWriter: fakeIndexWriter(db) });
});

/** 같은 Catch·텍스트 자료를 두 프리셋에 담아 발행한다. 사본은 position 1~4이고 3·4번이 겹친 사본이다. */
async function publishOverlap() {
  const member = await server.login(`first-copy-${randomUUID()}`);
  await consent(server.app, member.memberId);
  const catchId = await eligibleCatch(db, member.memberId);
  const material = await insertTextMaterial(db, member.memberId);
  const p1 = await insertPreset(db, member.memberId, [catchItem(catchId), textItem(material)], { name: '첫째' });
  const p2 = await insertPreset(db, member.memberId, [textItem(material), catchItem(catchId)], { name: '둘째' });
  const response = await server.call('POST', '/publications', { token: member.token, body: body([p1, p2]) });
  assert.equal(response.status, 201, response.text);
  return { member, catchId, material, publicationId: response.body.publicationId, token: tokenOf(response.body.url) };
}

test('판정 함수는 입력 순서와 상관없이 같은 (종류, 원본 ID)의 가장 앞선 position만 참이다(BR4.1)', () => {
  const a = randomUUID();
  const b = randomUUID();
  assert.deepEqual(markFirstCopies([
    { itemKind: 'TEXT_MATERIAL', sourceId: a, position: 3 }, { itemKind: 'CATCH', sourceId: b, position: 2 },
    { itemKind: 'TEXT_MATERIAL', sourceId: a, position: 1 }, { itemKind: 'CATCH', sourceId: b, position: 4 },
  ]), [false, true, true, false]);
});

test('응답 변환은 isFirstCopy만 빼고 프리셋 칸 둘과 나머지 칸은 그대로 둔다(BR4.5, R-03)', () => {
  const item = { publishedItemId: randomUUID(), position: 1, itemKind: 'TEXT_MATERIAL', title: '자료', snapshot: { body: '본문' }, pdfPages: null,
    presetOrdinal: 2, presetName: '둘째', isFirstCopy: false };
  const at = new Date('2026-11-20T00:00:00Z');
  assert.deepEqual(snapshotResponse({ title: '발행본', publishedAt: at, expiresAt: at, items: [{ ...item, extra: 'x' }] }), {
    title: '발행본', publishedAt: at, expiresAt: at,
    items: [{ publishedItemId: item.publishedItemId, position: 1, itemKind: 'TEXT_MATERIAL', title: '자료', snapshot: { body: '본문' }, pdfPages: null,
      presetOrdinal: 2, presetName: '둘째' }],
  }, '정한 칸만 옮긴다');
});

test('api 안 사본 읽기는 겹친 사본을 isFirstCopy false로 싣고 원본 ID를 싣지 않는다(P-4, NFR2.12)', async () => {
  const { publicationId, catchId, material } = await publishOverlap();
  const snapshot = await server.app.get(PUBLICATION_ACCESS).readSnapshot(publicationId);
  assert.deepEqual(snapshot.items.map((item) => [item.position, item.itemKind, item.presetOrdinal, item.presetName, item.isFirstCopy]), [
    [1, 'CATCH', 1, '첫째', true], [2, 'TEXT_MATERIAL', 1, '첫째', true], [3, 'TEXT_MATERIAL', 2, '둘째', false], [4, 'CATCH', 2, '둘째', false]]);
  const text = JSON.stringify(snapshot);
  for (const id of [catchId, material]) assert.equal(text.includes(id), false, '원본 ID가 사본에 없다');
});

test('받은 사람 열람 응답은 프리셋 칸 둘을 싣고 isFirstCopy·sourceId·원본 ID가 없다(BR4.5, NFR4.3)', async () => {
  const { token, catchId, material } = await publishOverlap();
  const response = await recipientGet(server, token);
  assert.equal(response.status, 200, response.text);
  assert.deepEqual(response.body.items.map((item) => [item.position, item.presetOrdinal, item.presetName]),
    [[1, 1, '첫째'], [2, 1, '첫째'], [3, 2, '둘째'], [4, 2, '둘째']]);
  for (const item of response.body.items) {
    assert.deepEqual(Object.keys(item).sort(), ['itemKind', 'pdfPages', 'position', 'presetName', 'presetOrdinal', 'publishedItemId', 'snapshot', 'title']);
  }
  for (const id of [catchId, material]) assert.equal(response.text.includes(id), false);
  assert.equal(response.text.includes('isFirstCopy'), false);
});

test('작성자 발행본 상세 응답도 프리셋 칸 둘을 싣고 isFirstCopy·sourceId가 없다(기능 설계 검토 R-03, NFR4.3)', async () => {
  const { member, publicationId, catchId, material } = await publishOverlap();
  const response = await server.call('GET', `/publications/${publicationId}`, { token: member.token });
  assert.equal(response.status, 200, response.text);
  assert.deepEqual(response.body.snapshot.items.map((item) => [item.presetOrdinal, item.presetName]), [[1, '첫째'], [1, '첫째'], [2, '둘째'], [2, '둘째']]);
  assert.equal(response.text.includes('isFirstCopy'), false);
  assert.equal(response.text.includes('sourceId'), false);
  for (const id of [catchId, material]) assert.equal(response.text.includes(id), false);
});

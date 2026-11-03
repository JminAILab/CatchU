// U4 제출 2 — 작성자 발행본 관리 API(GET /v1/publications, GET/DELETE /v1/publications/{id}, PUT /v1/publications/{id}/stop) 시험.
//
// 먼저 정한 시나리오·기대 결과·실패 조건(U4 기능 명세 「주요 시나리오와 확인」 S9(작성자 쪽)·S10~S13, 신뢰성 설계 「삭제」·「링크 중지」,
// team.md Testing Posture). 세부 시험 코드는 구현 뒤 쓴다. C-09 합의 전이라 indexState 칸·reindex 경로는 없다(OQ-U4-5).
//
// 목록·상세 (US5.1, BR8.1, NFR4.11)
//   - 기대: 목록은 본인 발행본만 발행 시각 최신순(같은 시각은 ID 역순)으로 cursor·limit(1~100, 기본 20)으로 끝까지 읽는다. 항목은
//           { publicationId, title, url, state, publishedAt, expiresAt, passwordProtected }뿐이고 indexState·토큰 칸이 없다(url 안에만 토큰).
//           상세는 { publicationId, url, state, passwordProtected, snapshot } (snapshot은 C-10 readSnapshot 결과, position 순).
//   - 실패 조건: 남의 발행본 노출, 잘못된·남의 cursor 통과(400이어야 함), indexState 칸이 있음.
// S9 중지·만료 발행본을 작성자가 봄 (US5.1, BR6.5·BR8.1)
//   - 기대: 중지·만료 뒤에도 목록·상세 200, state가 STOPPED·EXPIRED(중지가 만료보다 우선).
//   - 실패 조건: 중지·만료 발행본이 작성자에게 404.
// S10 발행 뒤 원본 변경·삭제 (US3.1·US4.1, BR3.5·BR1.6)
//   - 기대: 원본 Catch 설명·텍스트 자료 본문·공개 상태를 바꾸거나 텍스트 자료를 지워도 상세의 사본은 발행 당시 그대로다.
//   - 실패 조건: 사본 변경.
// S11 삭제: 접두어 삭제 성공·실패 (US5.2, BR8.4, NFR5.3·NFR5.4)
//   - 기대: 성공이면 FileStorage.deletePrefix(publicationPrefix(memberId, publicationId))로 발행본 접두어 파일이 지워지고 publication 행과
//           published_item이 연쇄 삭제돼 204(다시 읽으면 404). 실패(StorageUnavailable)면 500 INTERNAL_ERROR이고 DB 행이 그대로다.
//           접두어가 없어도 성공. 다른 발행본·원본 자료는 건드리지 않는다.
//   - 실패 조건: 접두어 삭제 실패인데 행 삭제, 다른 발행본의 파일·행이 지워짐.
// S12 남의 발행본 상세·중지·삭제 (US5.1·US5.2, BR6.5·BR10.1)
//   - 기대: 회원 두 명 사이에서 남의 것·없는 것·UUID 형식이 아닌 ID 모두 같은 404 RESOURCE_UNAVAILABLE이고 남의 발행본은 바뀌지 않는다.
//   - 실패 조건: 남의 발행본 변경.
// S13 만료된 링크 중지, 같은 링크 두 번 중지 (US5.1, BR8.2, NFR5.7)
//   - 기대: 유효 링크는 200 { state: STOPPED, stoppedAt }. 두 번째 중지는 처음 stoppedAt 유지. 만료 링크는 쓰지 않고 200 { state: EXPIRED,
//           stoppedAt: null }.
//   - 실패 조건: 만료 링크에 stopped_at 기록, 두 번째 중지로 시각 변경.
//
// 작성자 실패 안내 표(신뢰성 설계 NFR7.5): 삭제 실패 500 INTERNAL_ERROR → "삭제되지 않았습니다"(목록에 그대로 둠, 접수만으로 성공 표시 없음).
//
// 실제 AppModule·테스트 DB·개발 로그인 합성 회원을 쓴다. 발행본은 실제 발행 API로 만든다(U2·U3은 가짜). 파일 저장소는 S11을 위해
// 시험 전용 임시 폴더의 로컬 드라이버이고, 접두어 삭제 실패는 StorageUnavailable을 던지는 가짜 FileStorage로 만든다.
// 시계는 서비스의 PUBLICATIONS_CLOCK 자리를 시험 시계로 바꿔 만료를 기다리지 않는다.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { existsSync } = require('node:fs');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { after, before, beforeEach, test } = require('node:test');
const { AppModule } = require('../../dist/app.module');
const { FILE_STORAGE, StorageUnavailable, publicationPrefix, publishedPdfKey } = require('../../dist/file-storage/file-storage');
const { PUBLICATION_TTL_HOURS } = require('../../dist/publications/publication.entity');
const { PublicationManageService } = require('../../dist/publications/publication-manage.service');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const {
  PUBLISH_SETTINGS, WEB_BASE_URL, HOUR, setEnv, startApp, expectError, eligibleCatch, insertTextMaterial, consent,
  fakeAiRun, fakeIndexWriter, bindFakes, setClock, body, catchItem, textItem, tokenOf,
} = require('./support.cjs');

let server, db, restore, fileRoot, unbind, manage, storage, now, unsetClock;
before(async () => {
  fileRoot = await mkdtemp(join(tmpdir(), 'catchu-u4-publications-'));
  restore = setEnv({ ...PUBLISH_SETTINGS, FILE_STORAGE_DRIVER: 'local', FILE_STORAGE_LOCAL_ROOT: fileRoot });
  server = await startApp(AppModule);
  db = await openTestDataSource();
  manage = server.app.get(PublicationManageService);
  storage = server.app.get(FILE_STORAGE);
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
  unbind?.();
  unbind = bindFakes(server.app, { aiRun: fakeAiRun(db), indexWriter: fakeIndexWriter(db) });
  unsetClock?.();
  now = new Date('2026-11-10T00:00:00.000Z');
  unsetClock = setClock(server.app, () => now);
  manage.files = storage;
});

const list = (token, query = '') => server.call('GET', `/publications${query}`, { token });
const detail = (token, id) => server.call('GET', `/publications/${id}`, { token });
const stop = (token, id) => server.call('PUT', `/publications/${id}/stop`, { token });
const remove = (token, id) => server.call('DELETE', `/publications/${id}`, { token });
async function author(identity = `u4-owner-${randomUUID()}`) {
  const member = await server.login(identity);
  await consent(server.app, member.memberId);
  return member;
}
/** 실제 발행 API로 발행본을 만든다. 시계를 1분씩 옮겨 발행 시각을 서로 다르게 한다. */
async function publishOne(member, items, overrides = {}) {
  now = new Date(now.getTime() + 60_000);
  const response = await server.call('POST', '/publications', { token: member.token, body: body(items, overrides) });
  assert.equal(response.status, 201, response.text);
  return response.body;
}
const rows = () => db.query('SELECT publication_id, stopped_at FROM publication ORDER BY published_at');
const itemCount = async (publicationId) => (await db.query('SELECT count(*)::int AS n FROM published_item WHERE publication_id = $1', [publicationId]))[0].n;

test('목록: 본인 발행본만 최신순으로 cursor를 따라 끝까지 읽고, 항목에는 indexState·토큰 칸이 없으며 잘못된·남의 cursor는 400이다', async () => {
  const a = await author();
  const b = await author();
  const material = await insertTextMaterial(db, a.memberId);
  const published = [];
  for (let index = 0; index < 5; index += 1) published.push(await publishOne(a, [textItem(material)], { title: `[합성] ${index}`, ...(index === 2 ? { password: 'synthetic-pw-12' } : {}) }));
  await publishOne(b, [textItem(await insertTextMaterial(db, b.memberId))]);

  const seen = [];
  let cursor = null;
  do {
    const page = await list(a.token, `?limit=2${cursor ? `&cursor=${cursor}` : ''}`);
    assert.equal(page.status, 200, page.text);
    assert.equal(page.headers.get('cache-control'), 'no-store');
    for (const item of page.body.items) {
      assert.deepEqual(Object.keys(item).sort(), ['expiresAt', 'passwordProtected', 'publicationId', 'publishedAt', 'state', 'title', 'url']);
      assert.equal(item.state, 'ACTIVE');
      assert.equal(Date.parse(item.expiresAt) - Date.parse(item.publishedAt), PUBLICATION_TTL_HOURS * HOUR);
      seen.push(item);
    }
    cursor = page.body.page.nextCursor;
  } while (cursor);
  assert.deepEqual(seen.map((item) => item.publicationId), published.map((p) => p.publicationId).reverse());
  assert.deepEqual(seen.map((item) => item.title), ['[합성] 4', '[합성] 3', '[합성] 2', '[합성] 1', '[합성] 0']);
  assert.deepEqual(seen.map((item) => item.passwordProtected), [false, false, true, false, false]);
  for (const item of seen) {
    const original = published.find((p) => p.publicationId === item.publicationId);
    assert.equal(item.url, original.url, '목록의 링크 주소는 발행 응답과 같다');
    assert.ok(item.url.startsWith(`${WEB_BASE_URL}/s/`));
    const { url, ...rest } = item;
    assert.ok(!JSON.stringify(rest).includes(tokenOf(url)));
  }
  assert.deepEqual((await list(b.token)).body.items.length, 1);
  assert.deepEqual((await list((await author()).token)).body, { items: [], page: { nextCursor: null } }, '0개는 정상 빈 목록');

  const aCursor = (await list(a.token, '?limit=1')).body.page.nextCursor;
  for (const query of ['?limit=0', '?limit=101', '?limit=abc', '?cursor=%%%', '?cursor=e30', '?unknown=1', `?cursor=${aCursor}x`]) {
    expectError(await list(a.token, query), 400, 'VALIDATION_FAILED');
  }
  expectError(await list(b.token, `?cursor=${aCursor}`), 400, 'VALIDATION_FAILED', '남의 cursor');
  expectError(await list(undefined), 401, 'AUTH_REQUIRED');
});

test('상세: 작성자 API 표의 다섯 칸과 position 순 사본을 돌려주고, 발행 응답의 url과 같다', async () => {
  const a = await author();
  const catchId = await eligibleCatch(db, a.memberId, { title: '[합성] Catch', authorDescription: '[합성] 설명', draftContent: '[합성] 초안' });
  const material = await insertTextMaterial(db, a.memberId, { title: '[합성] 자료', body: '[합성] 본문' });
  const published = await publishOne(a, [textItem(material), catchItem(catchId)], { title: '[합성] 상세', password: 'synthetic-pw-12' });
  const response = await detail(a.token, published.publicationId);
  assert.equal(response.status, 200, response.text);
  assert.deepEqual(Object.keys(response.body).sort(), ['passwordProtected', 'publicationId', 'snapshot', 'state', 'url']);
  assert.equal(response.body.url, published.url);
  assert.equal(response.body.state, 'ACTIVE');
  assert.equal(response.body.passwordProtected, true);
  assert.deepEqual(Object.keys(response.body.snapshot).sort(), ['expiresAt', 'items', 'publishedAt', 'title']);
  assert.equal(response.body.snapshot.title, '[합성] 상세');
  assert.equal(response.body.snapshot.publishedAt, published.publishedAt);
  assert.equal(response.body.snapshot.expiresAt, published.expiresAt);
  assert.deepEqual(response.body.snapshot.items.map((item) => [item.position, item.itemKind, item.title, item.pdfPages]),
    [[1, 'TEXT_MATERIAL', '[합성] 자료', null], [2, 'CATCH', '[합성] Catch', null]]);
  assert.deepEqual(response.body.snapshot.items[0].snapshot, { body: '[합성] 본문' });
  assert.equal(response.body.snapshot.items[1].snapshot.authorDescription, '[합성] 설명');
  assert.equal(response.body.snapshot.items[1].snapshot.aiDraft, '[합성] 초안');
  assert.equal((await detail(a.token, published.publicationId.toUpperCase())).status, 200, '대문자 UUID도 같은 발행본');
  expectError(await server.call('GET', `/publications/${published.publicationId}?x=1`, { token: a.token }), 400, 'VALIDATION_FAILED');
});

test('S9·S13: 중지는 처음 시각을 유지하고 만료 링크는 { EXPIRED, null }이며, 작성자는 중지·만료 뒤에도 목록·상세를 본다(중지 우선)', async () => {
  const a = await author();
  const material = await insertTextMaterial(db, a.memberId);
  const active = await publishOne(a, [textItem(material)]);
  const expiring = await publishOne(a, [textItem(material)]);
  const later = await publishOne(a, [textItem(material)]); // 1분 뒤 발행이라 expiring이 만료되는 순간에는 아직 ACTIVE

  now = new Date(now.getTime() + HOUR);
  const first = await stop(a.token, active.publicationId);
  assert.equal(first.status, 200, first.text);
  assert.deepEqual(first.body, { state: 'STOPPED', stoppedAt: now.toISOString() });
  now = new Date(now.getTime() + HOUR);
  assert.deepEqual((await stop(a.token, active.publicationId)).body, first.body, '두 번째 중지는 처음 시각 유지');
  assert.equal(new Date((await rows()).find((row) => row.publication_id === active.publicationId).stopped_at).toISOString(), first.body.stoppedAt);
  assert.equal((await detail(a.token, active.publicationId)).body.state, 'STOPPED');

  // 만료: 시계를 발행 + 90일로 옮긴다(expiresAt과 같은 순간부터 만료).
  now = new Date(Date.parse(expiring.expiresAt));
  const expired = await stop(a.token, expiring.publicationId);
  assert.deepEqual(expired, { ...expired, status: 200, body: { state: 'EXPIRED', stoppedAt: null } });
  assert.equal((await rows()).find((row) => row.publication_id === expiring.publicationId).stopped_at, null, '만료 링크에 stopped_at을 쓰지 않는다');
  assert.equal((await detail(a.token, expiring.publicationId)).status, 200);
  const states = Object.fromEntries((await list(a.token)).body.items.map((item) => [item.publicationId, item.state]));
  assert.deepEqual(states, { [active.publicationId]: 'STOPPED', [expiring.publicationId]: 'EXPIRED', [later.publicationId]: 'ACTIVE' });
  // 중지된 뒤 만료 시각이 지나도 STOPPED가 우선하고, 나머지는 EXPIRED가 된다.
  now = new Date(Date.parse(later.expiresAt) + HOUR);
  assert.equal((await detail(a.token, active.publicationId)).body.state, 'STOPPED');
  assert.deepEqual((await stop(a.token, active.publicationId)).body, first.body);
  assert.deepEqual((await list(a.token)).body.items.map((item) => item.state).sort(), ['EXPIRED', 'EXPIRED', 'STOPPED']);
});

test('S10: 발행 뒤 원본 설명·본문·공개 상태를 바꾸거나 자료를 지워도 사본은 발행 당시 그대로다', async () => {
  const a = await author();
  const catchId = await eligibleCatch(db, a.memberId, { visibility: 'PRIVATE', authorDescription: '[합성] 발행 당시 설명', draftContent: '[합성] 초안' });
  const material = await insertTextMaterial(db, a.memberId, { title: '[합성] 자료', body: '[합성] 발행 당시 본문' });
  const published = await publishOne(a, [catchItem(catchId), textItem(material)]);
  const before = (await detail(a.token, published.publicationId)).body;

  const saved = await server.call('PUT', `/catches/${catchId}/description`, { token: a.token, body: { description: '[합성] 바뀐 설명' } });
  assert.equal(saved.status, 200, saved.text);
  await db.query("UPDATE catch_asset SET visibility = 'PRIVATE', draft_content = '[합성] 바뀐 초안', mismatch = true WHERE catch_id = $1", [catchId]);
  const updated = await server.call('PUT', `/text-materials/${material}`, { token: a.token, body: { title: '[합성] 바뀐 자료', body: '[합성] 바뀐 본문' } });
  assert.equal(updated.status, 200, updated.text);
  assert.equal((await server.call('DELETE', `/text-materials/${material}`, { token: a.token })).status, 204);

  const after = (await detail(a.token, published.publicationId)).body;
  assert.deepEqual(after, before);
  assert.equal(after.snapshot.items[0].snapshot.authorDescription, '[합성] 발행 당시 설명');
  assert.equal(after.snapshot.items[1].snapshot.body, '[합성] 발행 당시 본문');
  assert.equal(await itemCount(published.publicationId), 2);
});

test('S11: 삭제는 접두어 파일을 먼저 지우고 성공하면 행을 연쇄 삭제해 204, 접두어 삭제가 실패하면 500이고 DB·파일이 그대로다', async () => {
  const a = await author();
  const material = await insertTextMaterial(db, a.memberId);
  const removed = await publishOne(a, [textItem(material)]);
  const kept = await publishOne(a, [textItem(material)]);
  // U8 전이라 발행본 파일은 없지만, 접두어 아래에 합성 파일을 두어 접두어 삭제를 본다.
  await storage.put(publishedPdfKey(a.memberId, removed.publicationId, randomUUID()), Buffer.from('합성 PDF'), 'application/pdf');
  await storage.put(publishedPdfKey(a.memberId, kept.publicationId, randomUUID()), Buffer.from('합성 PDF'), 'application/pdf');
  const dirOf = (publicationId) => join(fileRoot, ...publicationPrefix(a.memberId, publicationId).slice(0, -1).split('/'));
  assert.ok(existsSync(dirOf(removed.publicationId)) && existsSync(dirOf(kept.publicationId)));

  // 실패: 접두어 삭제가 StorageUnavailable이면 500이고 행·파일이 남는다.
  manage.files = { deletePrefix: async () => { throw new StorageUnavailable('IO_FAILED'); } };
  const failed = await remove(a.token, removed.publicationId);
  expectError(failed, 500, 'INTERNAL_ERROR');
  assert.deepEqual(failed.body, { code: 'INTERNAL_ERROR', message: '처리 중 오류가 발생했습니다.' });
  assert.equal((await rows()).length, 2);
  assert.equal(await itemCount(removed.publicationId), 1);
  assert.ok(existsSync(dirOf(removed.publicationId)));
  assert.equal((await detail(a.token, removed.publicationId)).status, 200, '목록·상세에 그대로 남는다');

  // 성공: 그 발행본의 접두어·행·항목만 지워진다.
  manage.files = storage;
  const deleted = await remove(a.token, removed.publicationId);
  assert.equal(deleted.status, 204, deleted.text);
  assert.equal(deleted.body, null);
  assert.ok(!existsSync(dirOf(removed.publicationId)));
  assert.ok(existsSync(dirOf(kept.publicationId)), '다른 발행본의 파일은 그대로');
  assert.deepEqual((await rows()).map((row) => row.publication_id), [kept.publicationId]);
  assert.equal(await itemCount(removed.publicationId), 0, '항목은 연쇄 삭제');
  assert.equal(await itemCount(kept.publicationId), 1);
  expectError(await detail(a.token, removed.publicationId), 404, 'RESOURCE_UNAVAILABLE');
  expectError(await remove(a.token, removed.publicationId), 404, 'RESOURCE_UNAVAILABLE');
  assert.equal((await db.query('SELECT 1 FROM text_material WHERE text_material_id = $1', [material])).length, 1, '원본 자료는 건드리지 않는다');

  // 접두어가 없어도 성공이다(C-05).
  assert.equal((await remove(a.token, kept.publicationId)).status, 204);
  assert.equal((await rows()).length, 0);
});

test('S12: 남의 발행본·없는 발행본·형식 오류 ID의 상세·중지·삭제는 같은 404이고 남의 발행본은 바뀌지 않는다', async () => {
  const a = await author();
  const b = await author();
  const own = await publishOne(a, [textItem(await insertTextMaterial(db, a.memberId))]);
  await publishOne(b, [textItem(await insertTextMaterial(db, b.memberId))]);
  const before = await rows();
  for (const id of [own.publicationId, randomUUID(), 'not-a-uuid', '00000000-0000-0000-0000-00000000000g']) {
    for (const response of [await detail(b.token, id), await stop(b.token, id), await remove(b.token, id)]) {
      expectError(response, 404, 'RESOURCE_UNAVAILABLE');
      assert.deepEqual(response.body, { code: 'RESOURCE_UNAVAILABLE', message: '현재 열람할 수 없는 자료입니다.' });
    }
  }
  assert.deepEqual(await rows(), before);
  assert.deepEqual((await list(b.token)).body.items.map((item) => item.publicationId).includes(own.publicationId), false);
  expectError(await detail(undefined, own.publicationId), 401, 'AUTH_REQUIRED');
  expectError(await stop(undefined, own.publicationId), 401, 'AUTH_REQUIRED');
  expectError(await remove(undefined, own.publicationId), 401, 'AUTH_REQUIRED');
});

test('회원 행이 없으면 목록·상세·중지·삭제가 모두 같은 401 AUTH_INVALID다(삭제만 404로 끝나지 않는다)', async () => {
  const a = await author();
  const own = await publishOne(a, [textItem(await insertTextMaterial(db, a.memberId))]);
  // 정상 흐름에서는 생기지 않는 상태라 회원 행을 직접 지운다(발행본은 외래 키 연쇄로 함께 사라진다).
  await db.query('DELETE FROM member_account WHERE member_id = $1', [a.memberId]);
  for (const response of [await list(a.token), await detail(a.token, own.publicationId), await stop(a.token, own.publicationId), await remove(a.token, own.publicationId)]) {
    expectError(response, 401, 'AUTH_INVALID');
  }
});

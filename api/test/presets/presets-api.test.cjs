// 발행 프리셋 U1 — 프리셋 경로(/v1/presets) 시험(계약 P-1, 기능 명세 W1·W2·W3, 규칙 BR1.1~BR1.9·BR2.1~BR2.4·BR6.1·BR7.1,
// NFR2.1~NFR2.3·NFR2.7·NFR2.10·NFR4.1·NFR4.5·NFR6.1~NFR6.3, NFR 설계 검토 R-01·R-02).
//
// 먼저 정한 시나리오·기대 결과·실패 조건(unit-test-instructions 「시나리오」의 저장·권한·목록·세기 묶음, team.md Testing Posture).
// 세부 시험 코드는 구현 뒤 쓴다.
// - 저장: 이름 다듬기, 50개째 201·51개째 409 PRESET_LIMIT_REACHED, 60,000자 저장·60,001자 400 maxTotalLength, 남의 자료 404.
//   걸리면 아무것도 바뀌지 않는다(고치기 중 실패도 이름·항목 그대로). 실패 조건: 일부만 저장, 남의 자료가 담김.
// - 권한: 남의 프리셋·없는 프리셋·UUID 아닌 ID는 GET·PUT·DELETE 모두 같은 404이고 그 프리셋은 그대로다. 인증 없으면 401.
// - 목록: 50개를 한 응답에, 만든 순서로. 조회 수는 프리셋 1개와 50개(항목 20개씩)에서 같다. 이유(PRIVATE·SOURCE_RESTRICTED·
//   CONFIRMATION_REQUIRED·EXTRACTION_INCOMPLETE)와 길어진 원본의 overLimit을 읽을 때 센다. 기록 문제 Catch가 하나라도 있으면 요청 전체 500.
//   같은 스냅샷에서 항목의 원본 행이 없으면 500.
// - 세기: 1·50개는 요청 순서의 ItemMeasure, 제목 없는 Catch는 「제목 없는 Catch」, 51개 400, 남의 자료 404.
// - 지우기: 204, 다시 읽으면 404. 원본(텍스트 자료)을 지우면 그 항목만 빠지고 남은 자리는 다시 매기지 않는다(BR6.1).
// - 로그: 저장·지우기 성공·실패 한 줄씩, 회원 ID·프리셋 ID·오류 코드만(이름 없음).
//
// 실제 AppModule·테스트 DB·개발 로그인 합성 회원을 쓴다. Catch·자료·PDF 행은 표에 직접 넣는다(합성 값).
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { after, before, beforeEach, test } = require('node:test');
const { AppModule } = require('../../dist/app.module');
const { PresetStore } = require('../../dist/presets/preset-store');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const {
  PUBLISH_SETTINGS, setEnv, startApp, expectError, eligibleCatch, insertTextMaterial, insertPreset, catchItem, textItem,
} = require('../publications/support.cjs');

let server, db, restore;
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
  server.logs.length = 0;
});

const pdfItem = (sourceId) => ({ kind: 'PDF_MATERIAL', sourceId });
const call = (method, path, token, body) => server.call(method, path, { token, body });
const create = (token, body) => call('POST', '/presets', token, body);
const measure = (token, items) => call('POST', '/presets/measure', token, { items });
const list = (token) => call('GET', '/presets', token);
const detail = (token, id) => call('GET', `/presets/${id}`, token);
const presetLogs = () => server.logs.filter((log) => log.args.at(-1) === 'Presets').map((log) => ({ level: log.level, entry: log.args[0] }));
const presetRows = () => db.query('SELECT preset_id, member_id, name, created_at, updated_at FROM preset ORDER BY created_at, preset_id');
const itemRows = (presetId) => db.query(`SELECT position, catch_id, text_material_id, pdf_material_id FROM preset_item WHERE preset_id = $1
  ORDER BY position`, [presetId]);

/** PDF 자료 행과 쪽 글을 직접 넣는다(publish-pdf 시험과 같은 꼴). pages의 ''는 읽을 수 없는 쪽이다. */
async function insertPdf(memberId, pages = ['[합성] 1쪽'], { state = 'DONE', title = '[합성] PDF' } = {}) {
  const id = randomUUID();
  const done = state === 'DONE';
  await db.query(`INSERT INTO pdf_material (pdf_material_id, member_id, title, storage_key, file_size_bytes, page_count, extraction_state,
    extraction_deadline_at, extraction_failure_code, created_at, updated_at)
    VALUES ($1, $2, $3, $4, 2048, $5, $6, now() + interval '10 minutes', $7, now(), now())`,
  [id, memberId, title, `members/${memberId}/materials/${id}.pdf`, done ? pages.length : null, state, state === 'FAILED' ? 'UNREADABLE_FILE' : null]);
  if (done) {
    for (const [index, text] of pages.entries()) {
      await db.query('INSERT INTO pdf_page_text (pdf_page_text_id, pdf_material_id, page_number, text, readable) VALUES ($1, $2, $3, $4, $5)',
        [randomUUID(), id, index + 1, text, text !== '']);
    }
  }
  return id;
}

/** PresetStore가 부르는 질의를 센다(manager.query). 되돌리는 함수와 세기 함수를 돌려준다(NFR6.2 시험). */
function countQueries(app) {
  const store = app.get(PresetStore);
  const real = store.dataSource;
  let count = 0;
  const pass = (target, key) => { const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value; };
  const wrap = (manager) => new Proxy(manager, {
    get(target, key) {
      if (key !== 'query') return pass(target, key);
      return (sql, params) => { count += 1; return target.query(sql, params); };
    },
  });
  store.dataSource = new Proxy(real, {
    get(target, key) {
      if (key !== 'transaction') return pass(target, key);
      return (level, work) => target.transaction(level, (manager) => work(wrap(manager)));
    },
  });
  return { restore: () => { store.dataSource = real; }, reset: () => { count = 0; }, count: () => count };
}

test('만들기는 이름을 다듬어 저장하고 항목을 배열 순서로 position 1부터 쓰며, 상세는 그 순서의 ItemMeasure를 싣는다', async () => {
  const a = await server.login();
  const catchId = await eligibleCatch(db, a.memberId, { title: null, workFacts: ['가나다'], subjectContribution: '라마' }, { evidence: 0 });
  const material = await insertTextMaterial(db, a.memberId, { title: '[합성] 자료', body: '😀😀😀' });
  const pdf = await insertPdf(a.memberId, ['가'.repeat(5), '', 'a'.repeat(3)], { title: '[합성] PDF' });
  const response = await create(a.token, { name: '  <b>면접용</b>  ', items: [textItem(material), catchItem(catchId), pdfItem(pdf)] });
  assert.equal(response.status, 201, response.text);
  assert.deepEqual(Object.keys(response.body), ['presetId']);
  const { presetId } = response.body;
  const [row] = await presetRows();
  assert.equal(row.name, '<b>면접용</b>', '앞뒤 공백만 빼고 HTML로 바꾸지 않는다(NFR3.1)');
  assert.equal(row.created_at.getTime(), row.updated_at.getTime());
  assert.deepEqual((await itemRows(presetId)).map((item) => [item.position, item.catch_id, item.text_material_id, item.pdf_material_id]), [
    [1, null, material, null], [2, catchId, null, null], [3, null, null, pdf]]);

  const shown = await detail(a.token, presetId);
  assert.equal(shown.status, 200, shown.text);
  assert.deepEqual(shown.body, { presetId, name: '<b>면접용</b>', items: [
    { kind: 'TEXT_MATERIAL', sourceId: material, textLength: 3, title: '[합성] 자료', unpublishableReason: null },
    { kind: 'CATCH', sourceId: catchId, textLength: 5, title: '제목 없는 Catch', unpublishableReason: null },
    { kind: 'PDF_MATERIAL', sourceId: pdf, textLength: 8, title: '[합성] PDF', unpublishableReason: null },
  ] });
  assert.deepEqual(presetLogs(), [{ level: 'log', entry: { event: 'PRESET_SAVED', memberId: a.memberId, presetId, errorCode: null } }]);
  assert.equal(server.logs.map((log) => log.text).join('\n').includes('면접용'), false, '로그에 프리셋 이름이 없다(BR7.1)');
});

test('50개째는 만들고 51개째는 409 PRESET_LIMIT_REACHED이며 아무것도 쓰지 않는다. 항목 0개·같은 이름은 받는다(BR1.3·BR1.4)', async () => {
  const a = await server.login();
  for (let index = 0; index < 49; index += 1) await insertPreset(db, a.memberId, [], { name: '같은 이름' });
  const fiftieth = await create(a.token, { name: '같은 이름', items: [] });
  assert.equal(fiftieth.status, 201, fiftieth.text);
  const over = await create(a.token, { name: '하나 더', items: [] });
  expectError(over, 409, 'PRESET_LIMIT_REACHED');
  assert.equal(over.body.message, '프리셋은 50개까지 만들 수 있습니다.');
  assert.equal((await presetRows()).length, 50);
  assert.deepEqual(presetLogs().at(-1), { level: 'warn', entry: { event: 'PRESET_SAVE_FAILED', memberId: a.memberId, presetId: null,
    errorCode: 'PRESET_LIMIT_REACHED' } });
  const other = await server.login();
  assert.equal((await create(other.token, { name: '다른 회원', items: [] })).status, 201, '상한은 회원마다다');
});

test('전체 글 60,000자는 저장하고 60,001자는 400 items maxTotalLength이며, 남의 자료는 404이고 둘 다 아무것도 쓰지 않는다(BR1.4·BR1.5)', async () => {
  const a = await server.login();
  const b = await server.login();
  const full = await insertTextMaterial(db, a.memberId, { body: '가'.repeat(59_999) });
  const one = await insertTextMaterial(db, a.memberId, { body: '😀' });
  const two = await insertTextMaterial(db, a.memberId, { body: 'ab' });
  assert.equal((await create(a.token, { name: '경계', items: [textItem(full), textItem(one)] })).status, 201);
  const over = await create(a.token, { name: '넘침', items: [textItem(full), textItem(two)] });
  expectError(over, 400, 'VALIDATION_FAILED');
  assert.deepEqual(over.body.details, { violations: [{ field: 'items', reason: 'maxTotalLength' }] });
  const bCatch = await eligibleCatch(db, b.memberId);
  const bText = await insertTextMaterial(db, b.memberId);
  const bPdf = await insertPdf(b.memberId);
  for (const ref of [catchItem(bCatch), textItem(bText), pdfItem(bPdf)]) {
    const response = await create(a.token, { name: '남의 것', items: [textItem(one), ref] });
    expectError(response, 404, 'RESOURCE_UNAVAILABLE');
    expectError(await measure(a.token, [ref]), 404, 'RESOURCE_UNAVAILABLE');
  }
  assert.equal((await presetRows()).length, 1);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM preset_item'))[0].n, 2);
});

test('고치기는 이름·항목을 통째로 바꾸고 updatedAt을 쓰며, 검사에 걸리면 이름·항목 모두 그대로다(BR1.7, NFR2.7)', async () => {
  const a = await server.login();
  const b = await server.login();
  const [first, second, third] = await Promise.all([1, 2, 3].map((n) => insertTextMaterial(db, a.memberId, { title: `[합성] 자료 ${n}` })));
  const { presetId } = (await create(a.token, { name: '처음', items: [textItem(first), textItem(second)] })).body;
  const [before] = await presetRows();
  const updated = await call('PUT', `/presets/${presetId}`, a.token, { name: ' 고친 이름 ', items: [textItem(third), textItem(first)] });
  assert.equal(updated.status, 200, updated.text);
  assert.deepEqual(updated.body, { presetId });
  const [after] = await presetRows();
  assert.equal(after.name, '고친 이름');
  assert.ok(after.updated_at.getTime() > before.updated_at.getTime());
  assert.equal(after.created_at.getTime(), before.created_at.getTime());
  assert.deepEqual((await itemRows(presetId)).map((item) => [item.position, item.text_material_id]), [[1, third], [2, first]]);

  const big = await insertTextMaterial(db, a.memberId, { body: 'x'.repeat(60_001) });
  const bText = await insertTextMaterial(db, b.memberId);
  for (const [body, status, code] of [
    [{ name: '실패', items: [textItem(big)] }, 400, 'VALIDATION_FAILED'],
    [{ name: '실패', items: [textItem(first), textItem(bText)] }, 404, 'RESOURCE_UNAVAILABLE'],
    [{ name: '', items: [] }, 400, 'VALIDATION_FAILED'],
  ]) {
    expectError(await call('PUT', `/presets/${presetId}`, a.token, body), status, code);
    const [kept] = await presetRows();
    assert.equal(kept.name, '고친 이름', '이름 그대로');
    assert.deepEqual((await itemRows(presetId)).map((item) => item.text_material_id), [third, first], '항목 그대로');
  }
});

test('남의 프리셋·없는 프리셋·UUID 아닌 ID는 GET·PUT·DELETE 모두 같은 404이고 그 프리셋은 그대로다. 인증 없으면 401(BR1.1, NFR2.1·NFR2.2)', async () => {
  const a = await server.login();
  const b = await server.login();
  const material = await insertTextMaterial(db, b.memberId);
  const bPreset = await insertPreset(db, b.memberId, [textItem(material)], { name: 'B의 프리셋' });
  for (const id of [bPreset, randomUUID(), 'not-a-uuid']) {
    for (const response of [await detail(a.token, id), await call('PUT', `/presets/${id}`, a.token, { name: '가로채기', items: [] }),
      await call('DELETE', `/presets/${id}`, a.token)]) {
      expectError(response, 404, 'RESOURCE_UNAVAILABLE');
      assert.deepEqual(response.body, { code: 'RESOURCE_UNAVAILABLE', message: '현재 열람할 수 없는 자료입니다.' });
    }
  }
  assert.deepEqual((await presetRows()).map((row) => row.name), ['B의 프리셋']);
  assert.equal((await itemRows(bPreset)).length, 1);
  for (const response of [await list(undefined), await create(undefined, { name: 'n', items: [] }), await measure(undefined, [textItem(material)])]) {
    expectError(response, 401, 'AUTH_REQUIRED');
  }
  expectError(await server.call('GET', '/presets?x=1', { token: a.token }), 400, 'VALIDATION_FAILED');
});

test('지우기는 204이고 다시 읽으면 404이며, 담긴 텍스트 자료를 지우면 그 항목만 빠지고 남은 자리는 다시 매기지 않는다(BR1.8·BR6.1)', async () => {
  const a = await server.login();
  const [first, second, third] = await Promise.all([1, 2, 3].map((n) => insertTextMaterial(db, a.memberId, { title: `[합성] 자료 ${n}` })));
  const kept = (await create(a.token, { name: '남는 것', items: [textItem(first), textItem(second), textItem(third)] })).body.presetId;
  const removed = (await create(a.token, { name: '지울 것', items: [textItem(first)] })).body.presetId;
  server.logs.length = 0;
  const response = await call('DELETE', `/presets/${removed}`, a.token);
  assert.equal(response.status, 204, response.text);
  expectError(await detail(a.token, removed), 404, 'RESOURCE_UNAVAILABLE');
  assert.deepEqual(await db.query('SELECT 1 FROM preset_item WHERE preset_id = $1', [removed]), [], '항목은 연쇄로 지워진다');
  assert.deepEqual(presetLogs(), [{ level: 'log', entry: { event: 'PRESET_DELETED', memberId: a.memberId, presetId: removed, errorCode: null } }]);

  assert.equal((await server.call('DELETE', `/text-materials/${second}`, { token: a.token })).status, 204);
  assert.deepEqual((await itemRows(kept)).map((item) => [item.position, item.text_material_id]), [[1, first], [3, third]]);
  assert.deepEqual((await detail(a.token, kept)).body.items.map((item) => item.sourceId), [first, third], '읽을 때 position 순');
  const [summary] = (await list(a.token)).body.presets;
  assert.equal(summary.itemCount, 2);
});

test('목록은 프리셋 50개를 한 응답에 만든 순서(같으면 presetId 순)로 싣고, 줄마다 요약 칸만 있다(BR1.9·BR2.3, NFR6.1)', async () => {
  const a = await server.login();
  const material = await insertTextMaterial(db, a.memberId, { body: '12345' });
  const base = Date.parse('2026-11-01T00:00:00Z');
  const ids = [];
  for (let index = 0; index < 50; index += 1) {
    ids.push(await insertPreset(db, a.memberId, index % 2 === 0 ? [textItem(material)] : [], { name: `프리셋 ${index}`,
      createdAt: new Date(base + Math.floor(index / 2) * 1000) }));
  }
  const expected = ids.map((id, index) => ({ id, at: Math.floor(index / 2) })).sort((x, y) => x.at - y.at || (x.id < y.id ? -1 : 1)).map((x) => x.id);
  const response = await list(a.token);
  assert.equal(response.status, 200, response.text);
  assert.deepEqual(Object.keys(response.body), ['presets']);
  assert.deepEqual(response.body.presets.map((preset) => preset.presetId), expected);
  const first = response.body.presets.find((preset) => preset.presetId === ids[0]);
  assert.deepEqual(first, { presetId: ids[0], name: '프리셋 0', itemCount: 1, textLength: 5, overLimit: false, unpublishableCount: 0,
    unpublishableItems: [] });
  assert.equal(response.body.presets.find((preset) => preset.presetId === ids[1]).itemCount, 0);
  assert.deepEqual((await list((await server.login()).token)).body, { presets: [] }, '다른 회원에게는 빈 목록');
});

test('목록·상세·세기의 조회 수는 프리셋 1개와 50개(항목 20개씩)에서 같다(NFR6.2·NFR6.3)', async (t) => {
  const a = await server.login();
  const refs = [];
  for (let index = 0; index < 7; index += 1) refs.push(catchItem(await eligibleCatch(db, a.memberId, {}, { repositoryId: `count-repo-${index}` })));
  for (let index = 0; index < 7; index += 1) refs.push(textItem(await insertTextMaterial(db, a.memberId)));
  for (let index = 0; index < 6; index += 1) refs.push(pdfItem(await insertPdf(a.memberId)));
  const counter = countQueries(server.app);
  t.after(counter.restore);
  const measured = async (run) => { counter.reset(); const response = await run(); assert.equal(response.status, 200, response.text); return counter.count(); };

  const only = await insertPreset(db, a.memberId, refs);
  const listOne = await measured(() => list(a.token));
  const detailOne = await measured(() => detail(a.token, only));
  // 종류마다 하나씩 3개와 20개를 견준다(없는 종류는 조회를 건너뛰므로 종류 구성을 같게 둔다).
  const measureOne = await measured(() => measure(a.token, [refs[0], refs[7], refs[14]]));
  for (let index = 1; index < 50; index += 1) await insertPreset(db, a.memberId, refs);
  const listMany = await measured(() => list(a.token));
  assert.equal((await list(a.token)).body.presets.length, 50);
  assert.ok(listOne > 0);
  assert.equal(listMany, listOne, `목록 조회 수(1개 ${listOne}, 50개 ${listMany})`);
  assert.equal(await measured(() => detail(a.token, only)), detailOne);
  assert.equal(await measured(() => measure(a.token, refs)), measureOne, '세기 3개와 20개의 조회 수가 같다');
});

test('담은 뒤 숨긴 Catch·보호·미확인·추출 미완료는 이유로, 길어진 원본은 overLimit으로 읽을 때 보인다(BR2.2·BR2.3, AC1.6.1·AC1.6.3)', async () => {
  const a = await server.login();
  const hidden = await eligibleCatch(db, a.memberId, { title: '[합성] 숨김' }, { repositoryId: 'reason-hidden' });
  const restricted = await eligibleCatch(db, a.memberId, { title: '[합성] 보호' }, { repositoryId: 'reason-private', protection: 'SOURCE_PRIVATE' });
  const unconfirmed = await eligibleCatch(db, a.memberId, { title: '[합성] 미확인', confirmed: false }, { repositoryId: 'reason-unconfirmed' });
  const pending = await insertPdf(a.memberId, [], { state: 'PENDING', title: '[합성] 대기 PDF' });
  const failed = await insertPdf(a.memberId, [], { state: 'FAILED', title: '[합성] 실패 PDF' });
  const material = await insertTextMaterial(db, a.memberId, { body: 'a'.repeat(10) });
  const { presetId } = (await create(a.token, { name: '이유', items: [catchItem(hidden), catchItem(restricted), catchItem(unconfirmed),
    pdfItem(pending), pdfItem(failed), textItem(material)] })).body;
  assert.ok(presetId, '자격이 없어도 저장은 막지 않는다(BR1.5)');
  await db.query("UPDATE catch_asset SET visibility = 'PRIVATE' WHERE catch_id = $1", [hidden]);
  await db.query('UPDATE text_material SET body = $2 WHERE text_material_id = $1', [material, 'b'.repeat(60_001)]);

  const [summary] = (await list(a.token)).body.presets;
  assert.equal(summary.overLimit, true);
  assert.equal(summary.textLength, 60_001 + 3 * '[합성] 사실'.length + 3 * '[합성] 기여'.length + 3 * '[합성] 근거 사실 1'.length);
  assert.equal(summary.unpublishableCount, 5);
  assert.deepEqual(summary.unpublishableItems, [
    { kind: 'CATCH', sourceId: hidden, title: '[합성] 숨김', reason: 'PRIVATE' },
    { kind: 'CATCH', sourceId: restricted, title: '[합성] 보호', reason: 'SOURCE_RESTRICTED' },
    { kind: 'CATCH', sourceId: unconfirmed, title: '[합성] 미확인', reason: 'CONFIRMATION_REQUIRED' },
    { kind: 'PDF_MATERIAL', sourceId: pending, title: '[합성] 대기 PDF', reason: 'EXTRACTION_INCOMPLETE' },
    { kind: 'PDF_MATERIAL', sourceId: failed, title: '[합성] 실패 PDF', reason: 'EXTRACTION_INCOMPLETE' },
  ]);
  const items = (await detail(a.token, presetId)).body.items;
  assert.deepEqual(items.map((item) => [item.unpublishableReason, item.textLength]).slice(3),
    [['EXTRACTION_INCOMPLETE', 0], ['EXTRACTION_INCOMPLETE', 0], [null, 60_001]]);
});

test('보호 관측 없는 Catch가 담긴 프리셋이 하나라도 있으면 목록·상세·세기 요청 전체가 500이다(NFR2.10, NFR4.7)', async () => {
  const a = await server.login();
  const good = await insertTextMaterial(db, a.memberId);
  await insertPreset(db, a.memberId, [textItem(good)], { name: '정상' });
  const broken = await eligibleCatch(db, a.memberId, {}, { repositoryId: 'no-protection', protection: null });
  const presetId = await insertPreset(db, a.memberId, [catchItem(broken)], { name: '기록 문제' });
  for (const response of [await list(a.token), await detail(a.token, presetId), await measure(a.token, [textItem(good), catchItem(broken)])]) {
    expectError(response, 500, 'INTERNAL_ERROR');
    assert.deepEqual(response.body, { code: 'INTERNAL_ERROR', message: '처리 중 오류가 발생했습니다.' });
  }
  // 저장은 자격을 보지 않으므로 기록 문제 Catch도 담을 수 있다(BR1.5). 막히는 것은 읽기와 발행이다.
  assert.equal((await create(a.token, { name: '담기', items: [catchItem(broken)] })).status, 201);
});

test('같은 스냅샷에서 항목이 가리키는 원본 행을 읽지 못하면 이유를 비우지 않고 500이다(NFR 설계 검토 R-01)', async (t) => {
  const a = await server.login();
  const material = await insertTextMaterial(db, a.memberId);
  const presetId = await insertPreset(db, a.memberId, [textItem(material)]);
  // 외래 키 연쇄 삭제 때문에 실제 DB로는 만들 수 없어, 프리셋 저장소의 원본 조회 결과만 비운다.
  const store = server.app.get(PresetStore);
  const real = store.dataSource;
  const pass = (target, key) => { const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value; };
  store.dataSource = new Proxy(real, { get(target, key) {
    if (key !== 'transaction') return pass(target, key);
    return (level, work) => target.transaction(level, (manager) => work(new Proxy(manager, { get(inner, name) {
      if (name !== 'query') return pass(inner, name);
      return async (sql, params) => (/FROM text_material/.test(sql) ? [] : inner.query(sql, params));
    } })));
  } });
  t.after(() => { store.dataSource = real; });
  expectError(await list(a.token), 500, 'INTERNAL_ERROR');
  expectError(await detail(a.token, presetId), 500, 'INTERNAL_ERROR');
});

test('세기는 1·50개를 요청 순서의 ItemMeasure로 돌려주고 51개·중복은 400이다. 제목 없는 Catch는 「제목 없는 Catch」다(BR2.4, R-07)', async () => {
  const a = await server.login();
  const untitled = await eligibleCatch(db, a.memberId, { title: null, workFacts: ['abc'], subjectContribution: 'd' }, { evidence: 0 });
  const material = await insertTextMaterial(db, a.memberId, { title: '[합성] 자료', body: '가나' });
  const pdf = await insertPdf(a.memberId, ['12', '', '345']);
  const one = await measure(a.token, [catchItem(untitled)]);
  assert.equal(one.status, 200, one.text);
  assert.deepEqual(one.body, { items: [{ kind: 'CATCH', sourceId: untitled, textLength: 4, title: '제목 없는 Catch', unpublishableReason: null }] });
  const mixed = await measure(a.token, [pdfItem(pdf), textItem(material), catchItem(untitled)]);
  assert.deepEqual(mixed.body.items.map((item) => [item.kind, item.textLength]), [['PDF_MATERIAL', 5], ['TEXT_MATERIAL', 2], ['CATCH', 4]]);
  const fifty = [];
  for (let index = 0; index < 50; index += 1) fifty.push(textItem(await insertTextMaterial(db, a.memberId)));
  assert.equal((await measure(a.token, fifty)).body.items.length, 50);
  const over = await measure(a.token, [...fifty, textItem(material)]);
  expectError(over, 400, 'VALIDATION_FAILED');
  assert.deepEqual(over.body.details, { violations: [{ field: 'items', reason: 'maxItems' }] });
  expectError(await measure(a.token, [textItem(material), textItem(material)]), 400, 'VALIDATION_FAILED');
  assert.deepEqual(await presetRows(), [], '세기는 아무것도 저장하지 않는다');
});

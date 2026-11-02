// 쪽 만들기와 cursor(기능 설계 BR5.5·BR6.5, 비기능 설계 performance-design, 시나리오 S14·S15). DB 없는 순수 함수만 본다.
// HTTP로 끝까지 읽는 경우는 mcp-tools.test.cjs가 본다.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { buildCatchPage, buildTextMaterialPage, InvalidCursorError, parseCatchCursor, parseTextMaterialCursor } = require('../../dist/claude-mcp/mcp-page');
const { MCP_CURSOR_MAX_LENGTH, MCP_PAGE_CHARS, MCP_PAGE_RESERVE, MCP_PAGE_ROWS } = require('../../dist/claude-mcp/mcp-limits');

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const sortedIds = (count) => Array.from({ length: count }, () => randomUUID()).sort();

function material(id, body = '합성 본문', title = '합성 자료') {
  return { textMaterialId: id, title, body, updatedAt: new Date('2026-11-01T00:00:00.000Z'), createdAtText: '2026-11-01T00:00:00.123456Z' };
}

function catchRow(id, overrides = {}) {
  return { catchId: id, title: '합성 Catch', visibility: 'PRIVATE', workFacts: ['합성 사실'], subjectContribution: '합성 기여', authorDescription: null, mismatch: false,
    evidenceUrls: ['https://example.invalid/pull/1'], ...overrides };
}

/** 저장된 행을 읽개처럼 잘라 끝까지 쪽을 만든다. 쪽마다 크기를 재고, 나온 항목을 돌려준다. */
function readAllCatches(rows) {
  const seen = [];
  let after = null;
  for (let calls = 0; calls <= rows.length + 2; calls += 1) {
    const window = rows.filter((row) => after === null || row.catchId > after).slice(0, MCP_PAGE_ROWS);
    const page = buildCatchPage(window);
    assert.ok(JSON.stringify(page).length <= MCP_PAGE_CHARS, '쪽이 상한 안이다');
    assert.ok(page.catches.length <= MCP_PAGE_ROWS);
    seen.push(...page.catches);
    if (page.nextCursor === null) return { seen, lastEmpty: page.catches.length === 0 };
    after = parseCatchCursor(page.nextCursor);
  }
  throw new Error('같은 항목에서 멈췄다');
}

test('S14 작은 항목은 50개씩 나뉘고 모든 항목이 정확히 한 번 나오며 마지막 nextCursor는 null이다', () => {
  for (const total of [0, 1, 49, 51, 120]) {
    const ids = sortedIds(total);
    const { seen, lastEmpty } = readAllCatches(ids.map((id) => catchRow(id)));
    assert.deepEqual(seen.map((item) => item.catchId), ids, `${total}개`);
    assert.equal(lastEmpty, total === 0, '다음이 있는지 아는 경우는 마지막 쪽에 항목이 있다');
  }
});

test('S14 자료 수가 50의 배수면 마지막 호출이 빈 목록과 null을 돌려준다', () => {
  for (const total of [50, 100]) {
    const ids = sortedIds(total);
    const { seen, lastEmpty } = readAllCatches(ids.map((id) => catchRow(id)));
    assert.deepEqual(seen.map((item) => item.catchId), ids);
    assert.equal(lastEmpty, true);
  }
});

test('S14 글자 상한에 걸리면 다음 쪽으로 넘기고 빠짐·중복이 없다', () => {
  // 한 항목이 약 1만 자라 50개에 못 미쳐 글자 상한이 먼저 걸린다.
  const ids = sortedIds(23);
  const pages = [];
  const rows = ids.map((id) => catchRow(id, { subjectContribution: '가'.repeat(10_000) }));
  let window = rows;
  for (;;) {
    const page = buildCatchPage(window);
    pages.push(page);
    assert.ok(JSON.stringify(page).length <= MCP_PAGE_CHARS);
    if (page.nextCursor === null) break;
    const after = parseCatchCursor(page.nextCursor);
    window = rows.filter((row) => row.catchId > after);
  }
  assert.ok(pages.length >= 2 && pages[0].catches.length < 23, '여러 쪽으로 나뉜다');
  assert.deepEqual(pages.flatMap((page) => page.catches.map((item) => item.catchId)), ids);
  assert.ok(pages.flatMap((page) => page.catches).every((item) => item.omitted === undefined), '상한 안의 항목은 글을 빼지 않는다');
});

test('S15 상한을 넘는 텍스트 자료는 body를 비우고 bodyOmitted를 표시하며 다음 항목으로 넘어간다', () => {
  const [big, small] = sortedIds(2);
  const page = buildTextMaterialPage([material(big, '가'.repeat(MCP_PAGE_CHARS + 1)), material(small)]);
  assert.deepEqual(page.materials[0], { textMaterialId: big, title: '합성 자료', body: '', updatedAt: '2026-11-01T00:00:00.000Z', bodyOmitted: true });
  assert.deepEqual(page.materials[1], { textMaterialId: small, title: '합성 자료', body: '합성 본문', updatedAt: '2026-11-01T00:00:00.000Z' });
  assert.equal(page.nextCursor, null);
  assert.ok(JSON.stringify(page).length <= MCP_PAGE_CHARS);
});

test('S15 상한을 넘는 Catch는 글 칸을 비우고 omitted를 표시하며 근거 주소는 남는다', () => {
  const [big, small] = sortedIds(2);
  const page = buildCatchPage([
    catchRow(big, { visibility: 'PUBLIC', mismatch: true, workFacts: ['가'.repeat(MCP_PAGE_CHARS)], subjectContribution: '합성 기여', authorDescription: '합성 설명' }),
    catchRow(small),
  ]);
  assert.deepEqual(page.catches[0], { catchId: big, title: '합성 Catch', visibility: 'PUBLIC', workFacts: [], subjectContribution: '', authorDescription: null,
    evidenceUrls: ['https://example.invalid/pull/1'], mismatch: true, omitted: true });
  assert.equal(page.catches[1].catchId, small);
  assert.equal(page.catches[1].omitted, undefined);
  assert.equal(page.nextCursor, null);
});

test('S15 경계: 예약분을 더해 딱 맞는 항목은 글을 유지하고 한 글자 넘으면 뺀다. 이스케이프로 늘어나는 글도 직렬화 길이로 잰다', () => {
  const id = randomUUID();
  const emptySize = JSON.stringify({ textMaterialId: id, title: '합성 자료', body: '', updatedAt: '2026-11-01T00:00:00.000Z' }).length + 1;
  const room = MCP_PAGE_CHARS - MCP_PAGE_RESERVE - emptySize;
  const fits = buildTextMaterialPage([material(id, '가'.repeat(room))]);
  assert.equal(fits.materials[0].body.length, room);
  assert.equal(fits.materials[0].bodyOmitted, undefined);
  assert.ok(JSON.stringify(fits).length <= MCP_PAGE_CHARS);
  const over = buildTextMaterialPage([material(id, '가'.repeat(room + 1))]);
  assert.equal(over.materials[0].body, '');
  assert.equal(over.materials[0].bodyOmitted, true);
  // 글자 수는 상한 안이지만 따옴표·줄바꿈 이스케이프로 직렬화 길이가 두 배가 된다.
  const escaped = buildTextMaterialPage([material(id, '"\n'.repeat(MCP_PAGE_CHARS / 3))]);
  assert.equal(escaped.materials[0].bodyOmitted, true);
  assert.ok(JSON.stringify(escaped).length <= MCP_PAGE_CHARS);
});

test('S15 경계 근처 항목 뒤의 항목이 함께 들어가지 못하면 다음 쪽으로 넘어가고 cursor가 앞 항목을 가리킨다', () => {
  // 앞 항목이 39,000자라 둘째 항목(약 1,500자)이 들어가지 못하고 다음 쪽 cursor가 앞 항목을 가리킨다.
  const [first, second] = sortedIds(2);
  const page = buildTextMaterialPage([material(first, '가'.repeat(39_000)), material(second, '나'.repeat(1_500))]);
  assert.deepEqual(page.materials.map((item) => item.textMaterialId), [first]);
  assert.deepEqual(parseTextMaterialCursor(page.nextCursor), { createdAt: '2026-11-01T00:00:00.123456Z', id: first });
  assert.ok(JSON.stringify(page).length <= MCP_PAGE_CHARS);
});

test('빈 목록은 빈 쪽과 null이다', () => {
  assert.deepEqual(buildCatchPage([]), { catches: [], nextCursor: null });
  assert.deepEqual(buildTextMaterialPage([]), { materials: [], nextCursor: null });
});

test('cursor는 서버가 준 모양만 받는다: Catch 왕복과 틀린 형식 모두 InvalidCursorError', () => {
  const id = randomUUID();
  const valid = encode({ v: 1, after: id });
  assert.equal(parseCatchCursor(valid), id);
  const rejected = {
    '빈 글': '',
    '길이 1,025': 'A'.repeat(MCP_CURSOR_MAX_LENGTH + 1),
    'base64url 밖의 글자': `${valid}!`,
    '패딩이 붙은 글': `${valid}=`,
    '왕복이 어긋나는 글': 'QR', // 푼 뒤 다시 만들면 QQ다
    'JSON이 아님': Buffer.from('합성 글').toString('base64url'),
    '배열': encode([1]),
    'null': encode(null),
    '칸 더함': encode({ v: 1, after: id, extra: 1 }),
    '칸 없음': encode({ v: 1 }),
    '다른 판': encode({ v: 2, after: id }),
    'UUID 아님': encode({ v: 1, after: 'not-a-uuid' }),
    '문자열 아님': encode({ v: 1, after: 1 }),
    '텍스트 자료 cursor': encode({ v: 1, createdAt: '2026-11-01T00:00:00.000000Z', id }),
  };
  for (const [name, cursor] of Object.entries(rejected)) {
    assert.throws(() => parseCatchCursor(cursor), InvalidCursorError, name);
  }
});

test('cursor 텍스트 자료: 마이크로초까지 왕복하고 없는 날짜·형식이 다른 시각은 InvalidCursorError', () => {
  const id = randomUUID();
  const row = material(id);
  // 둘째 항목은 혼자서는 상한 안이지만 첫 항목과 함께 들어가지 못해 다음 쪽으로 간다.
  const { nextCursor } = buildTextMaterialPage([row, material(randomUUID(), '가'.repeat(39_600))]);
  assert.deepEqual(parseTextMaterialCursor(nextCursor), { createdAt: row.createdAtText, id });
  for (const createdAt of ['2026-02-30T00:00:00.000000Z', '2026-13-01T00:00:00.000000Z', '2026-11-01T24:00:00.000000Z', '0000-01-01T00:00:00.000000Z',
    '2026-11-01T00:00:00.000Z', '2026-11-01 00:00:00.000000Z', '2026-11-01T00:00:00.000000+09:00', 1]) {
    assert.throws(() => parseTextMaterialCursor(encode({ v: 1, createdAt, id })), InvalidCursorError, String(createdAt));
  }
  assert.throws(() => parseTextMaterialCursor(encode({ v: 1, createdAt: row.createdAtText, id: 'not-a-uuid' })), InvalidCursorError);
  assert.throws(() => parseTextMaterialCursor(encode({ v: 1, after: id })), InvalidCursorError);
});

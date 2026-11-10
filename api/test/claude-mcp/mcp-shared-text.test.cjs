// U9 받은 링크 읽기의 순수 함수 시험(기능 설계 BR1.3·BR3.1~BR3.5·BR4.1~BR4.5, 비기능 설계 performance-design 「쪽 만들기」·「입력 상한」,
// NFR1.3·NFR1.4·NFR4.1·NFR4.2·NFR7.1, 계약 C-15). DB와 앱 없이 dist의 extractLinkToken·flattenPublishedItem·parseSharedCursor·buildSharedPage를 바로 부른다.
//
// 먼저 정한 시나리오·기대 결과·실패 조건(기능 명세 「주요 시나리오와 확인」, 단위 시험 안내 「시나리오 표」, team.md Testing Posture). 계획 Step 3(2026-11-10)에서 옮겼다.
//
// S2 link 모양 열 가지(extractLinkToken, BR1.3)
//   - 기대: 토큰 그대로, 이 출처의 전체 주소(출처 + /s/{토큰}), 다른 호스트의 /s/{토큰}, 끝의 / 하나, 쿼리·조각 붙음, 앞뒤 공백의 여섯은 같은 토큰을 꺼낸다.
//           42자, 44자, /s/ 없는 주소(쿼리 안에만 토큰이 있는 주소 포함), 앞뒤 공백을 뗀 길이 2,049자의 넷은 null이다. 2,048자는 경계라 꺼낸다.
//   - 실패 조건: 쿼리 안의 토큰을 씀, 모양이 틀린데 토큰이 나옴.
// S5 Catch 펴기(flattenPublishedItem, BR3.1): 불일치, 작업 사실 없음, 기여 없음, 근거 있음·없음, 작성자 설명 null·빈 글
//   - 기대: 줄 순서는 '불일치 표시됨'(mismatch일 때) → '기록에서 확인한 내용'과 '- ' 목록 → '본인 기여: ' 줄 → 근거가 있으면 '근거' 머리말과 근거마다
//           '- {sourceUrl} · 판본 {sourceRevision}' 줄, 그 아래 들여쓴 '- ' 나타낸 사실 → '작성자 설명' 머리말과 설명이다. 빈 값 문구는 '기록에서 확인된 작업 사실이
//           없습니다.'·'제공된 기여 설명이 없습니다.'·'작성자 설명이 없습니다.'다. 머리말 넷과 빈 값 문구 셋이 web/src/features/publications/snapshot-view.tsx 원문에
//           그대로 있다(그 파일을 읽어 대조한다). 근거가 없으면 '근거' 머리말이 없다. aiDraft 글이 없다.
//   - 실패 조건: 다른 문구, 마크다운 기호(#, **), aiDraft 글.
// S6 PDF 펴기(BR3.3)와 텍스트 자료(BR3.2): 쪽 순서가 뒤섞인 입력, readable=false 쪽, pdfPages null·빈 목록, 텍스트 자료 본문
//   - 기대: pageNumber 오름차순이다. 읽을 수 있는 쪽은 '[n쪽]' 한 줄 아래 그 쪽 글, 읽을 수 없는 쪽은 '[n쪽] 읽을 수 없음' 한 줄이고 글이 없다. 쪽 사이는 빈 줄
//           하나다. null·빈 목록은 빈 글이다. 텍스트 자료는 body 그대로다.
//   - 실패 조건: 읽을 수 없는 쪽에 글, 쪽 빠짐·순서 틀림, 텍스트 본문이 바뀜.
// S12 쪽 경계 셋(buildSharedPage를 nextCursor로 끝까지 부름, BR4.1~BR4.4·BR3.4): 상한 바로 앞에서 이모지가 시작함, 앞 항목으로 쪽이 거의 차서 다음 항목의
//     코드 포인트 하나도 들지 않음, 긴 Catch 제목 둘(상한 가까이 긴 제목, 제목만으로 남은 자리를 넘는 제목)
//   - 기대: 각 쪽의 JSON.stringify 길이가 40,000(MCP_PAGE_CHARS) 이하다. 예외는 제목만으로 남은 자리를 넘는 쪽뿐이고, 그 쪽에는 코드 포인트 하나만 든다(최소 진행).
//           같은 position 조각을 이으면 원문이다. 이어지는 조각은 position·itemKind·title을 되풀이하고 continued: true이며, 처음부터 담는 조각에는 continued 칸이 없다.
//           이모지(서로게이트 쌍)는 갈리지 않고 통째로 다음 쪽으로 간다. 다음 항목은 앞 쪽에 빈 조각으로 나오지 않고 다음 쪽 offset 0부터 나온다. 긴 제목에서도 쪽마다
//           앞으로 나아가 끝난다. 마지막 nextCursor는 null이다. 칸 순서는 notice·title·publishedAt·expiresAt·items·nextCursor이고, notice는 BR3.4 고정 문구,
//           시각은 ISO 글자다.
//   - 실패 조건: 글 빠짐·중복, 깨진 글자, 최소 진행 쪽 밖의 상한 초과, 빈 조각이 겹침, 같은 cursor가 되풀이됨.
// S13 빈 항목과 작은 항목 여럿(BR4.4)
//   - 기대: 모든 항목이 정확히 한 번 나온다. 빈 항목은 content: "" 조각 하나다.
//   - 실패 조건: 빈 항목이 사라짐·겹침.
// S14 cursor 모양(parseSharedCursor, BR4.5): base64url 아님, 칸 추가, v: 2, position 0·음수·소수, offset 음수·소수, 1,025자
//   - 기대: 모두 U6 InvalidCursorError다. 서버가 만든 cursor는 그 자리로 읽힌다.
//   - 실패 조건: 통과, 다른 오류.
// S15 cursor 범위(BR4.5): 없는 position, 글 길이 이상 offset, 서로게이트 쌍 가운데 offset
//   - 기대: InvalidCursorError다.
//   - 실패 조건: 빈 쪽, 깨진 글자.
// S19 같은 사본을 두 번 펴기(BR3.5)
//   - 기대: 글이 같다.
//   - 실패 조건: 글이 달라짐.
//
// 비기능 설계에서 더한 것
// - 쪽 만들기의 남은 자리 상한(performance-design 「쪽 만들기」, 비기능 설계 리뷰 R-01): 남은 자리는 MCP_PAGE_CHARS에서 이 조각의 content를 빈 글로 둔 후보 쪽의
//   직렬화 길이를 뺀 값이고, 탐색의 위 끝은 남은 글 길이와 남은 자리 중 작은 값이다. 그래서 남은 글이 아무리 길어도 그 전체를 직렬화하지 않는다.
//   - 기대: 쪽 상한의 여러 배인 글 하나로 쪽을 만드는 동안 JSON.stringify가 만든 글이 모두, 이스케이프가 없는 글이면 쪽 상한 이하, 따옴표만 있는 글(한 글자가
//           두 자로 늘어남)이면 쪽 상한의 두 배 이하다. JSON.stringify는 이 시험 안에서만 감싸 잰다.
//   - 실패 조건: 남은 글 전체를 직렬화함.
//
// 합성 글만 쓴다. 토큰·cursor는 시험 안에서 만들고 출력에 찍지 않는다.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { MCP_CURSOR_MAX_LENGTH, MCP_PAGE_CHARS } = require('../../dist/claude-mcp/mcp-limits');
const { InvalidCursorError, encodeCursor } = require('../../dist/claude-mcp/mcp-page');
const { extractLinkToken } = require('../../dist/claude-mcp/mcp-shared-link');
const { SHARED_PUBLICATION_NOTICE, buildSharedPage, parseSharedCursor } = require('../../dist/claude-mcp/mcp-shared-page');
const { CATCH_TEXT_LABELS, flattenPublishedItem } = require('../../dist/claude-mcp/mcp-shared-text');
const { generateLinkToken } = require('../../dist/share-links/link-token');

const WEB_SNAPSHOT_VIEW = join(__dirname, '..', '..', '..', 'web', 'src', 'features', 'publications', 'snapshot-view.tsx');
const PUBLISHED_AT = new Date('2026-11-01T09:00:00.000Z');
const EXPIRES_AT = new Date(PUBLISHED_AT.getTime() + 2160 * 60 * 60 * 1000);
const PAGE_KEYS = ['notice', 'title', 'publishedAt', 'expiresAt', 'items', 'nextCursor'];
const DRAFT_MARKER = 'SYNTHETIC-DRAFT-MUST-NOT-LEAVE';
const EMOJI = '\u{1F600}';
const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const codePoints = (text) => [...text].length;
/** 주소 뒤 쿼리를 채워 길이를 정확히 맞춘다. */
const padTo = (prefix, length) => prefix + 'a'.repeat(length - prefix.length);

const catchSnapshot = (overrides = {}) => ({
  workFacts: [], subjectContribution: '', evidence: [], authorDescription: null, aiDraft: null, mismatch: false, ...overrides,
});
const item = (itemKind, snapshot, { title = '[합성] 항목', position = 1, pdfPages = null } = {}) => (
  { publishedItemId: randomUUID(), position, itemKind, title, snapshot, pdfPages }
);

/** 쪽 만들기 입력. position은 1부터이고 종류는 기본 TEXT_MATERIAL이다. */
function source(items, title = '[합성] 발행본') {
  return {
    title, publishedAt: PUBLISHED_AT, expiresAt: EXPIRES_AT,
    items: items.map((entry, index) => ({ position: index + 1, itemKind: 'TEXT_MATERIAL', title: `[합성] 항목 ${index + 1}`, ...entry })),
  };
}

/** 조각 content를 빈 글로 둔 쪽의 직렬화 길이(nextCursor 칸은 최대 길이로 잡는다, BR4.2). 경계 시험의 남은 자리를 계산한다. */
function headLength(src, chunks) {
  return JSON.stringify({
    notice: SHARED_PUBLICATION_NOTICE, title: src.title, publishedAt: src.publishedAt.toISOString(), expiresAt: src.expiresAt.toISOString(),
    items: chunks.map(({ position, itemKind, title }) => ({ position, itemKind, title, content: '' })), nextCursor: 'x'.repeat(MCP_CURSOR_MAX_LENGTH),
  }).length;
}

/** nextCursor를 따라 끝까지 쪽을 만든다. 같은 cursor가 되풀이되면 실패한다. */
function readAll(src, limit = 5_000) {
  const pages = [];
  const seen = new Set();
  let cursor = null;
  while (pages.length < limit) {
    const page = buildSharedPage(src, cursor === null ? null : parseSharedCursor(cursor));
    pages.push(page);
    if (page.nextCursor === null) return pages;
    assert.equal(seen.has(page.nextCursor), false, '같은 cursor가 되풀이되지 않는다');
    seen.add(page.nextCursor);
    cursor = page.nextCursor;
  }
  return assert.fail('쪽이 끝나지 않았다');
}

/**
 * S12·S13의 기대: 칸 순서와 고지, 쪽 길이 상한(최소 진행 쪽만 예외이고 그 쪽은 코드 포인트 하나), 이어지는 조각의 continued와 머리 칸 되풀이,
 * 서로게이트 쌍이 갈리지 않음, 글이 있는 항목에 빈 조각 없음, 빈 항목은 빈 조각 하나, 조각을 이으면 원문, 끝의 null.
 */
function assertPaged(src, pages, { minimumProgressOnly = false } = {}) {
  const parts = new Map(src.items.map((entry) => [entry.position, []]));
  for (const page of pages) {
    assert.deepEqual(Object.keys(page), PAGE_KEYS);
    assert.equal(page.notice, SHARED_PUBLICATION_NOTICE);
    assert.equal(page.title, src.title);
    assert.equal(page.publishedAt, src.publishedAt.toISOString());
    assert.equal(page.expiresAt, src.expiresAt.toISOString());
    assert.ok(page.items.length > 0, '빈 쪽이 없다');
    const length = JSON.stringify(page).length;
    if (length > MCP_PAGE_CHARS) {
      assert.ok(minimumProgressOnly, `쪽 길이 ${length}자가 상한을 넘는다`);
      assert.equal(page.items.length, 1, '상한을 넘는 쪽에는 조각이 하나다');
      assert.equal(codePoints(page.items[0].content), 1, '상한을 넘는 쪽에는 코드 포인트 하나만 든다');
    }
    for (const chunk of page.items) {
      const original = src.items.find((entry) => entry.position === chunk.position);
      assert.ok(original !== undefined, '사본에 있는 항목이다');
      const seen = parts.get(chunk.position);
      const keys = ['position', 'itemKind', 'title', 'content'];
      assert.deepEqual(Object.keys(chunk), seen.length === 0 ? keys : [...keys, 'continued'], '처음 조각에만 continued가 없다');
      if (seen.length > 0) assert.equal(chunk.continued, true);
      assert.equal(chunk.itemKind, original.itemKind);
      assert.ok(chunk.title === original.title, '이어지는 조각도 제목을 되풀이한다');
      assert.equal(/[\uD800-\uDBFF]$/.test(chunk.content) || /^[\uDC00-\uDFFF]/.test(chunk.content), false, '서로게이트 쌍이 갈리지 않는다');
      if (original.content.length > 0) assert.ok(chunk.content.length > 0, '글이 있는 항목에 빈 조각이 없다');
      seen.push(chunk.content);
    }
  }
  for (const entry of src.items) {
    const seen = parts.get(entry.position);
    if (entry.content.length === 0) assert.deepEqual(seen, [''], `position ${entry.position}: 빈 항목은 빈 조각 하나다`);
    assert.ok(seen.length > 0 && seen.join('') === entry.content, `position ${entry.position}: 조각을 이으면 원문이다`);
  }
  assert.equal(pages.at(-1).nextCursor, null);
}

test('S2 link 모양: 토큰·이 출처의 전체 주소·다른 호스트·끝 /·쿼리와 조각·앞뒤 공백은 같은 토큰을 꺼낸다', () => {
  const token = generateLinkToken();
  const accepted = {
    '토큰': token,
    '이 출처의 전체 주소': `http://127.0.0.1:3000/s/${token}`,
    '다른 호스트': `https://other.example/s/${token}`,
    '끝의 /': `https://catchu.example/s/${token}/`,
    '쿼리·조각': `https://catchu.example/s/${token}?from=mail#top`,
    '앞뒤 공백': ` \n\t${token}  `,
    '경로 앞쪽이 더 있는 주소': `https://catchu.example/app/s/${token}`,
    '2,048자(경계)': padTo(`https://catchu.example/s/${token}?pad=`, 2_048),
    '앞뒤 공백을 떼면 2,048자': `  ${padTo(`https://catchu.example/s/${token}?pad=`, 2_048)}  `,
  };
  for (const [name, link] of Object.entries(accepted)) assert.ok(extractLinkToken(link) === token, name);
});

test('S2 link 모양: 42자·44자·/s/ 없는 주소·2,049자는 토큰을 꺼내지 못하고 쿼리 안의 토큰도 쓰지 않는다', () => {
  const token = generateLinkToken();
  const rejected = {
    '42자': token.slice(0, 42),
    '44자': `${token}A`,
    '/s/ 없는 주소': `https://catchu.example/p/${token}`,
    '쿼리 안에만 토큰': `https://catchu.example/share?s=${token}`,
    '조각 안에만 토큰': `https://catchu.example/#/s/${token}`,
    '모양이 틀린 토큰 뒤의 쿼리 토큰': `https://catchu.example/s/${token.slice(0, 42)}?s=${token}`,
    '경로 끝이 아닌 /s/': `https://catchu.example/s/${token}/more`,
    '2,049자': padTo(`https://catchu.example/s/${token}?pad=`, 2_049),
    '출처 없는 경로': `/s/${token}`,
    '빈 글': '',
  };
  for (const [name, link] of Object.entries(rejected)) assert.equal(extractLinkToken(link), null, name);
});

test('S5 Catch 펴기: 불일치·작업 사실·본인 기여·근거·작성자 설명을 BR3.1 순서와 문구로 펴고 aiDraft는 넣지 않는다', () => {
  const text = flattenPublishedItem(item('CATCH', catchSnapshot({
    mismatch: true,
    workFacts: ['[합성] 재시도 조건을 고쳤다', '[합성] 시험을 더했다'],
    subjectContribution: '[합성] 재시도 조건을 정했다',
    evidence: [
      { sourceUrl: 'https://github.com/example/repo/pull/12', sourceRevision: 'abc1234', representedFacts: ['[합성] 재시도 조건 변경', '[합성] 시험 추가'] },
      { sourceUrl: 'https://github.com/example/repo/pull/13', sourceRevision: 'def5678', representedFacts: [] },
    ],
    authorDescription: '[합성] 내가 쓴 설명',
    aiDraft: DRAFT_MARKER,
  })));
  assert.equal(text, [
    '불일치 표시됨',
    '기록에서 확인한 내용',
    '- [합성] 재시도 조건을 고쳤다',
    '- [합성] 시험을 더했다',
    '본인 기여: [합성] 재시도 조건을 정했다',
    '근거',
    '- https://github.com/example/repo/pull/12 · 판본 abc1234',
    '  - [합성] 재시도 조건 변경',
    '  - [합성] 시험 추가',
    '- https://github.com/example/repo/pull/13 · 판본 def5678',
    '작성자 설명',
    '[합성] 내가 쓴 설명',
  ].join('\n'));
  assert.equal(text.includes(DRAFT_MARKER), false, 'aiDraft 글이 없다');
  assert.equal(/\*\*|^#/m.test(text), false, '마크다운 기호가 없다');
});

test('S5 Catch 펴기: 작업 사실·기여·근거가 없고 작성자 설명이 null이거나 빈 글이면 빈 값 문구를 쓰고 불일치·근거 줄을 두지 않는다', () => {
  for (const authorDescription of [null, '']) {
    const text = flattenPublishedItem(item('CATCH', catchSnapshot({ authorDescription, aiDraft: DRAFT_MARKER })));
    assert.equal(text, [
      '기록에서 확인한 내용',
      '기록에서 확인된 작업 사실이 없습니다.',
      '본인 기여: 제공된 기여 설명이 없습니다.',
      '작성자 설명',
      '작성자 설명이 없습니다.',
    ].join('\n'), `작성자 설명 ${authorDescription === null ? 'null' : '빈 글'}`);
    assert.equal(text.includes(DRAFT_MARKER), false);
  }
});

test('S5 머리말 넷과 빈 값 문구 셋은 web snapshot-view.tsx 원문에 그대로 있다', () => {
  const web = readFileSync(WEB_SNAPSHOT_VIEW, 'utf8');
  assert.deepEqual(Object.keys(CATCH_TEXT_LABELS).sort(),
    ['contribution', 'description', 'emptyContribution', 'emptyDescription', 'emptyFacts', 'facts', 'mismatch']);
  for (const [name, label] of Object.entries(CATCH_TEXT_LABELS)) assert.ok(web.includes(label), `${name} 문구가 web 원문에 있다`);
  // 웹 표지의 자리까지 본다: 불일치 표지, 두 머리말(h4), 본인 기여 강조, 세 빈 값 문구.
  for (const markup of ['>불일치 표시됨<', '<h4>기록에서 확인한 내용</h4>', '<strong>본인 기여:</strong>', '<h4>작성자 설명</h4>',
    '"기록에서 확인된 작업 사실이 없습니다."', '"제공된 기여 설명이 없습니다."', '>작성자 설명이 없습니다.<']) {
    assert.ok(web.includes(markup), `${markup} 자리가 web 원문에 있다`);
  }
});

test('S6 PDF 펴기: 쪽 번호 순서로 [n쪽]과 글, 읽을 수 없는 쪽은 [n쪽] 읽을 수 없음 한 줄이고 쪽 사이는 빈 줄 하나다', () => {
  const pdfPages = [
    { pageNumber: 3, text: '[합성] 셋째 쪽의 글', readable: true },
    { pageNumber: 1, text: '[합성] 첫 쪽의 글\n[합성] 둘째 줄', readable: true },
    { pageNumber: 2, text: '[합성] 읽은 척한 글', readable: false },
  ];
  const text = flattenPublishedItem(item('PDF_MATERIAL', { pageCount: 3 }, { pdfPages }));
  assert.equal(text, '[1쪽]\n[합성] 첫 쪽의 글\n[합성] 둘째 줄\n\n[2쪽] 읽을 수 없음\n\n[3쪽]\n[합성] 셋째 쪽의 글');
  assert.equal(text.includes('읽은 척한 글'), false, '읽을 수 없는 쪽에 글을 붙이지 않는다');
  assert.deepEqual(pdfPages.map((page) => page.pageNumber), [3, 1, 2], '입력 순서를 바꾸지 않는다');
});

test('S6 PDF 펴기: 쪽 목록이 null이거나 비면 빈 글이다', () => {
  assert.equal(flattenPublishedItem(item('PDF_MATERIAL', { pageCount: 0 }, { pdfPages: null })), '');
  assert.equal(flattenPublishedItem(item('PDF_MATERIAL', { pageCount: 0 }, { pdfPages: [] })), '');
  assert.equal(flattenPublishedItem(item('PDF_MATERIAL', { pageCount: 1 }, { pdfPages: [{ pageNumber: 1, text: '', readable: false }] })), '[1쪽] 읽을 수 없음');
});

test('S6 텍스트 자료는 본문을 그대로 쓰고, 알 수 없는 종류는 빈 글 대신 처리 실패다', () => {
  const body = `[합성] "따옴표"와 \\ 역슬래시\n${EMOJI} # 머리말처럼 보이는 줄\n\n**굵게처럼 보이는 글**`;
  assert.equal(flattenPublishedItem(item('TEXT_MATERIAL', { body })), body);
  assert.throws(() => flattenPublishedItem(item('VIDEO_MATERIAL', { body })), TypeError);
});

test('S12 P7 모양의 긴 발행본을 끝까지 넘기면 쪽마다 상한 안이고 조각을 이으면 원문이다', () => {
  const pdf = flattenPublishedItem(item('PDF_MATERIAL', { pageCount: 4 }, {
    pdfPages: [1, 2, 3, 4].map((pageNumber) => (pageNumber === 3
      ? { pageNumber, text: '', readable: false }
      : { pageNumber, text: `[합성] ${pageNumber}쪽 문장 ${EMOJI}\n`.repeat(1_200), readable: true })),
  }));
  const src = source([
    { content: '[합성] 작은 글' },
    { content: '' },
    { itemKind: 'PDF_MATERIAL', title: '[합성] 긴 PDF', content: pdf },
    { content: '"\n'.repeat(10_000) },
    { content: EMOJI.repeat(15_000) },
    { content: '' },
    { content: 'b' },
    { itemKind: 'CATCH', title: '[합성] Catch', content: flattenPublishedItem(item('CATCH', catchSnapshot({ workFacts: ['[합성] 사실'] }))) },
  ]);
  assert.ok(JSON.stringify(src.items[3].content).length > MCP_PAGE_CHARS, '따옴표·줄바꿈 글은 혼자서 40,000자를 넘게 직렬화된다');
  const pages = readAll(src);
  assert.ok(pages.length >= 4, `쪽 수 ${pages.length}`);
  assertPaged(src, pages);
});

test('S12 경계: 상한 바로 앞에서 이모지가 시작하면 그 앞에서 자르고 이모지를 통째로 다음 쪽 처음에 둔다', () => {
  const probe = source([{ content: '' }]);
  const room = MCP_PAGE_CHARS - headLength(probe, probe.items);
  const src = source([{ content: `${'a'.repeat(room - 1)}${EMOJI}${'b'.repeat(10)}` }]);
  const pages = readAll(src);
  assert.equal(pages.length, 2);
  assert.equal(pages[0].items[0].content.length, room - 1, '이모지 앞에서 자른다');
  assert.deepEqual(parseSharedCursor(pages[0].nextCursor), { position: 1, offset: room - 1 }, '실제 자른 자리의 cursor다');
  assert.ok(pages[1].items[0].content.startsWith(EMOJI), '이모지는 다음 쪽 처음에 통째로 있다');
  assertPaged(src, pages);
});

test('S12 경계: 앞 항목으로 쪽이 거의 차서 다음 항목의 코드 포인트 하나도 들지 않으면 빈 조각 없이 쪽을 닫는다', () => {
  for (const [name, spare, second] of [['남은 자리 0', 0, 'zzz'], ['남은 자리 1과 이모지', 1, `${EMOJI}zz`], ['남은 자리 1과 따옴표', 1, '"zz']]) {
    const probe = source([{ content: '' }, { content: second }]);
    const src = source([{ content: 'a'.repeat(MCP_PAGE_CHARS - headLength(probe, probe.items) - spare) }, { content: second }]);
    const pages = readAll(src);
    assert.equal(pages.length, 2, name);
    assert.deepEqual(pages[0].items.map((chunk) => chunk.position), [1], `${name}: 첫 쪽에는 앞 항목만 있다`);
    assert.deepEqual(parseSharedCursor(pages[0].nextCursor), { position: 2, offset: 0 }, `${name}: 다음 쪽은 다음 항목의 처음이다`);
    assert.equal('continued' in pages[1].items[0], false, `${name}: 다음 항목은 처음부터 나온다`);
    assertPaged(src, pages);
  }
});

test('S12 경계: Catch 제목이 상한 가까이 길어도 쪽마다 앞으로 나아가 상한 안에서 끝난다', () => {
  const content = flattenPublishedItem(item('CATCH', catchSnapshot({ workFacts: ['[합성] 짧은 사실'] })));
  const probe = source([{ itemKind: 'CATCH', title: '', content }]);
  const src = source([{ itemKind: 'CATCH', title: '가'.repeat(MCP_PAGE_CHARS - headLength(probe, probe.items) - 40), content }]);
  const pages = readAll(src);
  assert.ok(pages.length > 1, '제목이 길어 여러 쪽으로 나뉜다');
  assertPaged(src, pages);
});

test('S12 경계: 제목만으로 남은 자리를 넘으면 쪽마다 코드 포인트 하나씩 나아가 끝난다(최소 진행)', () => {
  const content = flattenPublishedItem(item('CATCH', catchSnapshot({ workFacts: [`[합성] ${EMOJI} 사실`] })));
  const src = source([{ itemKind: 'CATCH', title: '가'.repeat(MCP_PAGE_CHARS), content }, { content: '' }]);
  const pages = readAll(src);
  assert.equal(pages.length, codePoints(content) + 1, '코드 포인트마다 한 쪽, 빈 항목 한 쪽');
  assertPaged(src, pages, { minimumProgressOnly: true });
});

test('S13 빈 항목과 작은 항목 여럿은 모두 정확히 한 번 나오고 빈 항목은 content: "" 조각 하나다', () => {
  const small = source([{ content: '' }, { content: 'a' }, { content: '' }, { content: 'bc' }, { content: '' }]);
  const smallPages = readAll(small);
  assert.equal(smallPages.length, 1);
  assertPaged(small, smallPages);
  // 앞 항목이 쪽을 채워 빈 항목의 머리 칸조차 들지 않으면, 빈 항목은 다음 쪽의 빈 조각 하나로 나온다.
  const probe = source([{ content: '' }, { content: '' }, { content: 'z' }]);
  const boundary = source([{ content: 'a'.repeat(MCP_PAGE_CHARS - headLength(probe, probe.items.slice(0, 2)) + 1) }, { content: '' }, { content: 'z' }]);
  const pages = readAll(boundary);
  assert.equal(pages.length, 2);
  assert.deepEqual(pages[1].items.map((chunk) => [chunk.position, chunk.content]), [[2, ''], [3, 'z']]);
  assertPaged(boundary, pages);
});

test('S14 cursor 모양: base64url 아님·칸 추가·v 2·position 0·음수·소수·offset 음수·소수·1,025자는 InvalidCursorError다', () => {
  const invalid = {
    'base64url 아님': 'not+base64/url=',
    '빈 글': '',
    'JSON 아님': Buffer.from('position').toString('base64url'),
    '칸 추가': encode({ v: 1, position: 1, offset: 0, extra: true }),
    '칸 빠짐': encode({ v: 1, position: 1 }),
    'v 2': encode({ v: 2, position: 1, offset: 0 }),
    'position 0': encode({ v: 1, position: 0, offset: 0 }),
    'position 음수': encode({ v: 1, position: -1, offset: 0 }),
    'position 소수': encode({ v: 1, position: 1.5, offset: 0 }),
    'position 글자': encode({ v: 1, position: '1', offset: 0 }),
    'offset 음수': encode({ v: 1, position: 1, offset: -1 }),
    'offset 소수': encode({ v: 1, position: 1, offset: 0.5 }),
    'offset null': encode({ v: 1, position: 1, offset: null }),
    '1,025자': 'A'.repeat(MCP_CURSOR_MAX_LENGTH + 1),
  };
  for (const [name, cursor] of Object.entries(invalid)) assert.throws(() => parseSharedCursor(cursor), InvalidCursorError, name);
});

test('S14 서버가 만든 cursor는 그 자리로 읽힌다', () => {
  assert.deepEqual(parseSharedCursor(encodeCursor({ position: 3, offset: 17 })), { position: 3, offset: 17 });
  assert.deepEqual(parseSharedCursor(encodeCursor({ position: 1, offset: 0 })), { position: 1, offset: 0 });
});

test('S15 cursor 범위: 없는 position·글 길이 이상 offset·서로게이트 쌍 가운데 offset은 InvalidCursorError다', () => {
  const src = source([{ content: `ab${EMOJI}c` }, { content: '' }]);
  const outOfRange = {
    '없는 position': { position: 9, offset: 0 },
    '글 길이와 같은 offset': { position: 1, offset: 5 },
    '글 길이보다 큰 offset': { position: 1, offset: 6 },
    '서로게이트 쌍 가운데': { position: 1, offset: 3 },
    '빈 항목의 offset 1': { position: 2, offset: 1 },
  };
  for (const [name, cursor] of Object.entries(outOfRange)) assert.throws(() => buildSharedPage(src, cursor), InvalidCursorError, name);
  const fromEmoji = buildSharedPage(src, { position: 1, offset: 2 });
  assert.deepEqual(fromEmoji.items.map((chunk) => [chunk.position, chunk.content, chunk.continued]), [[1, `${EMOJI}c`, true], [2, '', undefined]]);
  const fromEmpty = buildSharedPage(src, { position: 2, offset: 0 });
  assert.deepEqual(fromEmpty.items, [{ position: 2, itemKind: 'TEXT_MATERIAL', title: '[합성] 항목 2', content: '' }]);
  assert.equal(fromEmpty.nextCursor, null);
});

test('S19 같은 사본은 두 번 펴도 같은 글이고 같은 쪽이 된다', () => {
  const catchEntry = item('CATCH', catchSnapshot({
    mismatch: true, workFacts: ['[합성] 사실'], subjectContribution: '[합성] 기여', authorDescription: '[합성] 설명',
    evidence: [{ sourceUrl: 'https://github.com/example/repo/pull/1', sourceRevision: 'abc1234', representedFacts: ['[합성] 사실'] }],
  }));
  const pdfEntry = item('PDF_MATERIAL', { pageCount: 2 }, { pdfPages: [{ pageNumber: 2, text: '[합성] 둘째', readable: true }, { pageNumber: 1, text: '', readable: false }] });
  for (const entry of [catchEntry, pdfEntry]) assert.equal(flattenPublishedItem(entry), flattenPublishedItem(structuredClone(entry)));
  const src = source([{ itemKind: 'CATCH', content: flattenPublishedItem(catchEntry) }, { content: '"\n'.repeat(30_000) }]);
  assert.ok(JSON.stringify(readAll(src)) === JSON.stringify(readAll(structuredClone(src))), '두 번 만든 쪽이 같다');
});

test('R-01 남은 자리 상한: 쪽 상한의 여러 배인 글도 남은 자리만큼만 직렬화해 쪽을 만든다', (t) => {
  const cases = [
    ['이스케이프 없는 글', 'a'.repeat(MCP_PAGE_CHARS * 25), MCP_PAGE_CHARS],
    ['따옴표만 있는 글', '"'.repeat(MCP_PAGE_CHARS * 25), MCP_PAGE_CHARS * 2],
  ];
  for (const [name, text, bound] of cases) {
    const src = source([{ content: text }]);
    const stringify = t.mock.method(JSON, 'stringify');
    const first = buildSharedPage(src, null);
    const second = buildSharedPage(src, parseSharedCursor(first.nextCursor));
    const lengths = stringify.mock.calls.map((call) => (typeof call.result === 'string' ? call.result.length : 0));
    stringify.mock.restore();
    const longest = Math.max(...lengths);
    assert.ok(lengths.length > 2 && longest > MCP_PAGE_CHARS / 2, `${name}: 쪽을 만드는 동안의 직렬화를 잡았다`);
    assert.ok(longest <= bound, `${name}: 가장 긴 직렬화가 ${longest}자다`);
    for (const page of [first, second]) assert.ok(JSON.stringify(page).length <= MCP_PAGE_CHARS, `${name}: 쪽 길이가 상한 안이다`);
    assert.equal(second.items[0].continued, true);
  }
});

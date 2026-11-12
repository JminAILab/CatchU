// #528 따옴표 인용 붙이기: Claude 인용이 없는 항목이 따옴표로 옮긴 글을 작성자 자료 원문에서 찾아 그 줄을 인용으로 붙인다
// (새 Catch FR11.1·AC8.1.1·AC8.1.2). 기대 결과는 #528 완료 기준이다. 작성자 자료에 글자 그대로 있으면 '작성자 자료 원문' 딱지가 붙은
// 인용 항목이 되고, 없으면 지금처럼 AI 해석 항목으로 둔다. 시험 안에서 만든 합성 글과 응답 모양 JSON만 쓴다.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { buildCitationRequest } = require('../../dist/ai-generation/citation-request');
const { toProviderResponse } = require('../../dist/ai-generation/claude-citation-client');
const { QUOTE_MIN_LENGTH, quotedTexts } = require('../../dist/ai-generation/quote-citations');
const { collectResponseItems } = require('../../dist/ai-generation/response-items');
const { source, request, blockCitation, fragment, messageBody } = require('./fixtures.cjs');

const AUTHOR_ITEM = '00000000-0000-4000-8000-000000000002';
// 작성자 설명: 둘째 줄 안에 공백 두 칸, 둘째 줄과 셋째 줄 사이에 빈 줄.
const AUTHOR_TEXT = '로그인 화면을 다시 만들었다.\n서버 쪽 일정이 빠듯해  화면에서 했다.\n\n오류 문구는 한 파일로 모았다.';
const GITHUB_TEXT = '커밋: 로그인 화면 오류 문구 정리\nPR #7 병합';

const github = (text = GITHUB_TEXT) => source({ sourceId: 'gh-1', text });
const author = (text = AUTHOR_TEXT, sourceId = 'mat-1') => source({ sourceId, sourceKind: 'AUTHOR_MATERIAL', text,
  location: { publishedItemId: AUTHOR_ITEM, fieldPath: 'authorDescription', charStart: 0, charEnd: text.length, pdfPage: null } });

/** 응답 줄들을 묶는다. 근거 기본값은 문서 0 = GitHub 기록, 문서 1 = 작성자 설명이다. */
function collect(content, { feature = 'QNA', sources = [github(), author()] } = {}) {
  const req = request({ feature, sources });
  const plan = buildCitationRequest(req);
  const fragments = typeof content === 'string' ? [fragment(content)] : content;
  return collectResponseItems(toProviderResponse(messageBody(fragments)), req, plan.documents);
}
const kinds = (result) => result.items.map((item) => [item.kind, item.citations.map((citation) => citation.sourceId)]);
const authorRange = (start, end) => ({ sourceId: 'mat-1', quote: AUTHOR_TEXT.slice(start, end), sourceLabel: '작성자 자료 원문',
  location: { publishedItemId: AUTHOR_ITEM, fieldPath: 'authorDescription', charStart: start, charEnd: end, pdfPage: null } });
const LINE_1 = [AUTHOR_TEXT.indexOf('서버'), AUTHOR_TEXT.indexOf('\n\n')];

test('따옴표 여섯 종류에서 여는 글자 뒤 첫 닫는 글자까지의 글을 뽑고, 닫지 않은 따옴표는 건너뛴다', () => {
  assert.deepEqual(quotedTexts("가 'A' 나 \"B\" 다 ‘C’ 라 “D” 마 「E」 바 『F』"), ['A', 'B', 'C', 'D', 'E', 'F']);
  assert.deepEqual(quotedTexts("「작성자는 '가나'라고」 적었다"), ["작성자는 '가나'라고"], '따옴표 안의 따옴표는 따로 보지 않는다');
  assert.deepEqual(quotedTexts('닫지 않은 「따옴표와 \'하나'), []);
  assert.deepEqual(quotedTexts('「다른 짝』'), []);
});

test('따옴표 글이 작성자 자료 원문 한 곳에 있으면 그 줄을 인용으로 붙여 CITED이고 딱지는 작성자 자료 원문이다(공백 수 차이는 같은 글)', () => {
  const result = collect("- 작성자는 '서버 쪽 일정이 빠듯해 화면에서 했다.'라고 적었다");
  assert.deepEqual(result.items, [{ kind: 'CITED', text: "작성자는 '서버 쪽 일정이 빠듯해 화면에서 했다.'라고 적었다", citations: [authorRange(...LINE_1)] }]);
  assert.equal(result.items[0].citations[0].quote, '서버 쪽 일정이 빠듯해  화면에서 했다.', '인용문은 원문 그대로');
  assert.equal(result.quoteCitedCount, 1);
  assert.equal(result.droppedCount, 0);
});

test('줄을 넘는 따옴표 글은 걸친 줄 전체를 가운데 빈 줄까지 원문대로 인용한다', () => {
  const [item] = collect('- 작성자는 「화면에서 했다. 오류 문구는 한 파일로 모았다.」라고 적었다').items;
  assert.deepEqual(item.citations, [authorRange(LINE_1[0], AUTHOR_TEXT.length)]);
  assert.ok(item.citations[0].quote.includes('\n\n'));
});

test('따옴표 글이 작성자 자료에 글자 그대로 없으면(바꿔 쓴 글) 붙이지 않고 AI 해석 항목으로 둔다', () => {
  const result = collect("- 작성자는 '서버 일정이 빠듯해서 화면에서 처리했다'라고 적었다\n- 따옴표 없는 항목");
  assert.deepEqual(kinds(result), [['AI_INTERPRETATION', []], ['AI_INTERPRETATION', []]]);
  assert.equal(result.quoteCitedCount, 0);
});

test(`공백을 줄인 따옴표 글이 ${QUOTE_MIN_LENGTH}자보다 짧으면 찾지 않는다(10자는 찾는다)`, () => {
  assert.equal(QUOTE_MIN_LENGTH, 10);
  const result = collect("- 작성자는 '화면에서 했다.'라고 적었다\n- 작성자는 '한 파일로 모았다'라고 적었다\n- 작성자는 '한 파일로 모았다.'라고 적었다");
  assert.deepEqual(kinds(result), [['AI_INTERPRETATION', []], ['AI_INTERPRETATION', []], ['CITED', ['mat-1']]]);
});

test('따옴표 글이 여러 곳에 있으면(다른 작성자 자료, 같은 글 안 두 번) 붙이지 않는다', () => {
  const twoMaterials = collect("- 작성자는 '오류 문구는 한 파일로 모았다.'라고 적었다",
    { sources: [github(), author(), author('회고: 오류 문구는 한 파일로 모았다.', 'mat-2')] });
  assert.deepEqual(kinds(twoMaterials), [['AI_INTERPRETATION', []]]);
  const twice = collect("- 작성자는 '로그인 화면을 다시 만들었다.'라고 적었다",
    { sources: [github(), author('로그인 화면을 다시 만들었다.\n그 뒤 로그인 화면을 다시 만들었다.')] });
  assert.deepEqual(kinds(twice), [['AI_INTERPRETATION', []]]);
});

test('GitHub 기록 원문에 있는 따옴표 글은 그대로 둔다(GitHub 기록에만 있음, GitHub 기록과 작성자 자료 둘 다에 있음)', () => {
  const githubOnly = collect("- 커밋 메시지는 '로그인 화면 오류 문구 정리'이다");
  assert.deepEqual(kinds(githubOnly), [['AI_INTERPRETATION', []]]);
  const both = collect("- 작성자는 '로그인 화면을 다시 만들었다.'라고 적었다", { sources: [github('커밋: 로그인 화면을 다시 만들었다.'), author()] });
  assert.deepEqual(kinds(both), [['AI_INTERPRETATION', []]]);
});

test('항목 안 따옴표 글이 모두 작성자 자료 한 곳씩에 있을 때만 나온 순서대로 붙이고, 같은 줄은 한 번만 붙인다', () => {
  const result = collect([
    "- 작성자는 '로그인 화면을 다시 만들었다.'라고 적었고 '오류 문구는 한 파일로 모았다.'라고도 적었다",
    "\n- 작성자는 '로그인 화면을 다시 만들었다.'라고 적었고 커밋은 '로그인 화면 오류 문구 정리'다",
    "\n- 작성자는 '로그인 화면을 다시 만들었다.'와 '로그인 화면을 다시 만들었다.'를 두 번 적었다",
  ].map((text) => fragment(text)));
  assert.deepEqual(result.items[0].citations, [authorRange(0, AUTHOR_TEXT.indexOf('\n')), authorRange(AUTHOR_TEXT.indexOf('오류'), AUTHOR_TEXT.length)]);
  assert.deepEqual(kinds(result).slice(1), [['AI_INTERPRETATION', []], ['CITED', ['mat-1']]], '하나가 GitHub 기록이면 붙이지 않는다');
  assert.equal(result.quoteCitedCount, 2);
});

test('붙인 항목이 인용 항목 대조(U2 BR3.4)를 통과할 때만 붙인다: 인용 줄의 숫자는 남고, 인용 줄에 없는 영어 표기를 더하면 붙이지 않는다', () => {
  const sources = [github(), author('로그인 시험 12개를 새로 더했다.\n서버 쪽 일정이 빠듯해 화면에서 했다.')];
  const result = collect("- 작성자는 '로그인 시험 12개를 새로 더했다.'라고 적었다\n- 작성자는 '서버 쪽 일정이 빠듯해 화면에서 했다.'라고 적었고 React를 썼다",
    { sources });
  assert.deepEqual(kinds(result), [['CITED', ['mat-1']], ['AI_INTERPRETATION', []]]);
});

test('JD 요약은 붙이지 않고, Claude 인용이 있는 항목은 그 인용만 그대로 둔다', () => {
  const line = "- 작성자는 '서버 쪽 일정이 빠듯해 화면에서 했다.'라고 적었다";
  assert.deepEqual(kinds(collect(line, { feature: 'JD_SUMMARY' })), [['AI_INTERPRETATION', []]]);
  assert.deepEqual(kinds(collect(line, { feature: 'BASE_SUMMARY' })), [['CITED', ['mat-1']]]);
  const claudeCited = collect([fragment(line, [blockCitation(0, 0, 1)])]);
  assert.deepEqual(kinds(claudeCited), [['CITED', ['gh-1']]]);
  assert.equal(claudeCited.quoteCitedCount, 0);
});

// S3~S6과 응답 묶기: 항목 고르기·인용 붙이기·원문 위치·버림 셈(U1 기능 설계 W2, BR3·BR4·BR5.1~BR5.4).
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { AiProviderError } = require('../../dist/ai-generation/ai-generation.types');
const { buildCitationRequest } = require('../../dist/ai-generation/citation-request');
const { toProviderResponse } = require('../../dist/ai-generation/claude-citation-client');
const { collectResponseItems, ensureItems, joinResponseLines } = require('../../dist/ai-generation/response-items');
const { source, request, blockCitation, fragment, messageBody } = require('./fixtures.cjs');

// 근거 0(GitHub 기록): 블록 0 = 'PR #12 병합'[0,9), 블록 1 = '배포 스크립트 수정'[11,21), 블록 2 = '테스트 추가'[23,29).
const GITHUB_TEXT = 'PR #12 병합\r\n배포 스크립트 수정\n\n테스트 추가';
const MATERIAL_TEXT = '회고: 장애 대응 문서를 썼다';

function setup(content, stopReason = 'end_turn') {
  const req = request({ sources: [
    source({ sourceId: 'gh-1', text: GITHUB_TEXT }),
    source({ sourceId: 'mat-1', sourceKind: 'AUTHOR_MATERIAL', text: MATERIAL_TEXT,
      location: { publishedItemId: '00000000-0000-4000-8000-000000000002', fieldPath: 'materials[0].text', charStart: 40, charEnd: 55, pdfPage: 3 } }),
  ] });
  const plan = buildCitationRequest(req);
  const response = toProviderResponse(messageBody(content, stopReason));
  return { req, plan, response, collect: () => collectResponseItems(response, req, plan.documents) };
}

test('S3 인용 있는 줄은 CITED, 없는 줄은 AI_INTERPRETATION, 머리말은 빠지고 버림 수에 세지 않는다', () => {
  const { collect } = setup([
    fragment('정리한 내용입니다.\n- '),
    fragment('PR #12를 병합했다', [blockCitation(0, 0, 1)]),
    fragment('\n- 꾸준히 협업했다\n'),
  ]);
  const result = collect();
  assert.deepEqual(result.items.map((item) => [item.kind, item.text]), [['CITED', 'PR #12를 병합했다'], ['AI_INTERPRETATION', '꾸준히 협업했다']]);
  assert.deepEqual(result.items[1].citations, []);
  assert.equal(result.droppedCount, 0);
  assert.equal(result.nonItemLineCount, 1, '머리말 한 줄');
});

test('S3 한 줄 안 여러 조각의 인용을 모으고 다른 항목에 붙이지 않는다', () => {
  const { collect } = setup([
    fragment('- 병합하고 '), fragment('배포를 고쳤다', [blockCitation(0, 0, 1)]), fragment(' 그리고 문서도 썼다', [blockCitation(1, 0, 1)]),
    fragment('\n'), fragment('- 테스트를 더했다', [blockCitation(0, 2, 3)]),
  ]);
  const [first, second] = collect().items;
  assert.deepEqual(first.citations.map((c) => c.sourceId), ['gh-1', 'mat-1'], '응답에 나온 순서');
  assert.deepEqual(second.citations.map((c) => c.quote), ['테스트 추가']);
});

test('줄바꿈 뒤에서 시작하는 조각의 인용은 그 조각의 첫 글자가 놓인 다음 줄에 붙는다', () => {
  const lines = joinResponseLines(toProviderResponse(messageBody([
    fragment('- 앞 항목'), fragment('\n- 뒤 항목', [blockCitation(0, 1, 2)]),
  ])));
  assert.deepEqual(lines.map((line) => [line.text, line.citations.length]), [['- 앞 항목', 0], ['- 뒤 항목', 1]]);
});

test('S4 여러 줄 블록 범위는 첫 줄 시작~마지막 줄 끝의 원문 위치·원문 인용문·출처 이름으로 바꾼다', () => {
  const { collect } = setup([fragment('- 배포와 테스트를 손봤다', [blockCitation(0, 1, 3, '배포 스크립트 수정테스트 추가')])]);
  const [citation] = collect().items[0].citations;
  assert.deepEqual(citation, {
    sourceId: 'gh-1',
    quote: '배포 스크립트 수정\n\n테스트 추가',
    location: { publishedItemId: '00000000-0000-4000-8000-000000000001', fieldPath: 'body', charStart: 111, charEnd: 129, pdfPage: null },
    sourceLabel: 'GitHub 기록 원문',
  });
  assert.equal(GITHUB_TEXT.slice(11, 29), citation.quote);
});

test('S4 작성자 자료는 출처 이름이 다르고 pdfPage 등 위치 칸을 그대로 옮긴다', () => {
  const { collect } = setup([fragment('- 장애 문서를 썼다', [blockCitation(1, 0, 1)])]);
  assert.deepEqual(collect().items[0].citations[0], {
    sourceId: 'mat-1', quote: MATERIAL_TEXT,
    location: { publishedItemId: '00000000-0000-4000-8000-000000000002', fieldPath: 'materials[0].text', charStart: 40, charEnd: 40 + MATERIAL_TEXT.length, pdfPage: 3 },
    sourceLabel: '작성자 자료 원문',
  });
});

test('S5 문서 번호·블록 범위가 넘긴 범위 밖이거나 블록 범위 모양이 아니면 그 항목만 빠지고 버림 1', () => {
  const badCitations = [
    blockCitation(2, 0, 1), blockCitation(0, 2, 4), blockCitation(0, 1, 1), blockCitation(0, -1, 1),
    { type: 'char_location', cited_text: 'x', document_index: 0, document_title: null, start_char_index: 0, end_char_index: 1, file_id: null },
  ];
  for (const bad of badCitations) {
    const { collect } = setup([fragment('- 맞는 항목', [blockCitation(0, 0, 1)]), fragment('\n- 틀린 항목', [blockCitation(0, 1, 2), bad])]);
    const result = collect();
    assert.deepEqual(result.items.map((item) => item.text), ['맞는 항목'], JSON.stringify(bad));
    assert.equal(result.droppedCount, 1);
  }
});

test('S6 출력 상한에서 잘리면 끝나지 않은 마지막 항목만 빠지고 버림 1', () => {
  const { collect } = setup([fragment('- 첫 항목', [blockCitation(0, 0, 1)]), fragment('\n- 두 번째 항목\n- 끝나지 않은 항', [blockCitation(0, 1, 2)])], 'max_tokens');
  const result = collect();
  assert.deepEqual(result.items.map((item) => item.text), ['첫 항목', '두 번째 항목']);
  assert.equal(result.droppedCount, 1);
});

test('S6 상한에서 줄바꿈 직후 끝났거나 마지막 줄이 항목이 아니면 버리지 않는다', () => {
  for (const tail of ['\n', '\n그리고']) {
    const result = setup([fragment(`- 첫 항목${tail}`)], 'max_tokens').collect();
    assert.deepEqual(result.items.map((item) => item.text), ['첫 항목']);
    assert.equal(result.droppedCount, 0);
  }
});

test('S6 잘린 응답에서 남은 항목이 없으면 NO_ITEMS', () => {
  const result = setup([fragment('머리말\n- 끝나지 않은')], 'max_tokens').collect();
  assert.equal(result.droppedCount, 1);
  assert.equal(result.nonItemLineCount, 1);
  assert.throws(() => ensureItems(result, 'req_1'), (error) => error instanceof AiProviderError && error.reason === 'NO_ITEMS');
});

test("'- ' 뒤가 비었거나 '- '로 시작하지 않는 줄은 항목이 아니고 그 줄의 인용도 버린다", () => {
  const result = setup([fragment('-  \n-붙여 쓴 줄', [blockCitation(0, 0, 1)]), fragment('\n* 다른 기호\n- 진짜 항목')]).collect();
  assert.deepEqual(result.items.map((item) => [item.kind, item.text]), [['AI_INTERPRETATION', '진짜 항목']]);
  assert.equal(result.nonItemLineCount, 3);
  assert.equal(result.droppedCount, 0);
});

test('거절은 REFUSED, 정상 끝·출력 상한 밖의 중단 이유는 UNEXPECTED_STOP', () => {
  const cases = [['refusal', 'REFUSED'], ['pause_turn', 'UNEXPECTED_STOP'], ['stop_sequence', 'UNEXPECTED_STOP'], [null, 'UNEXPECTED_STOP']];
  for (const [stopReason, reason] of cases) {
    const { collect } = setup([fragment('- 이미 나온 항목', [blockCitation(0, 0, 1)])], stopReason);
    assert.throws(collect, (error) => error instanceof AiProviderError && error.reason === reason, String(stopReason));
  }
});

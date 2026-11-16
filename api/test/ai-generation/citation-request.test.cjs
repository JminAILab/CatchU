// S2·S9와 요청 구성: 인용 문서·문서 번호 → 근거 대응표·지시와 자료 분리(U1 기능 설계 BR1.4·BR2.1·BR2.3, 비기능 NFR2.3).
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { buildCitationRequest, ITEM_FORMAT_INSTRUCTION, SOURCE_KIND_CONTEXT } = require('../../dist/ai-generation/citation-request');
const { AI_INPUT_MAX_CHARS, assertGenerationRequest, inputLength } = require('../../dist/ai-generation/gate-policy');
const { AiInputTooLarge } = require('../../dist/ai-generation/ai-generation.types');
const { source, request } = require('./fixtures.cjs');

test('S2 근거가 없으면 호출하지 않는다는 표시를 돌려준다', () => {
  assert.deepEqual(buildCitationRequest(request({ sources: [] })), { kind: 'SKIP' });
});

test('S2 모든 근거가 빈 줄뿐이면 문서가 없어 호출하지 않는다', () => {
  const sources = [source({ text: '\r\n  \n' }), source({ sourceId: 'chunk-2', text: '' })];
  assert.deepEqual(buildCitationRequest(request({ sources })), { kind: 'SKIP' });
});

test('S9 앞 근거가 빈 줄뿐이면 문서가 되지 않고 대응표는 문서 번호 0 → 근거 위치 1을 가리킨다', () => {
  const sources = [source({ sourceId: 'empty', text: ' \n\n' }), source({ sourceId: 'kept', text: '하나\n둘' })];
  const plan = buildCitationRequest(request({ sources }));
  assert.equal(plan.kind, 'CALL');
  assert.equal(plan.documents.length, 1);
  assert.deepEqual(plan.documents[0].documentIndex, 0);
  assert.deepEqual(plan.documents[0].sourceIndex, 1);
  const documentBlocks = plan.userContent.filter((block) => block.type === 'document');
  assert.equal(documentBlocks.length, 1, '빈 근거는 자리 문서로도 넘기지 않는다');
  assert.deepEqual(documentBlocks[0].source.content, [{ type: 'text', text: '하나' }, { type: 'text', text: '둘' }]);
});

test('문서는 인용이 켜진 사용자 정의 내용이고 줄마다 글 블록 하나, context는 출처 종류 설명', () => {
  const sources = [source({ text: '가\n\n나' }), source({ sourceId: 'material', sourceKind: 'AUTHOR_MATERIAL', text: '다' })];
  const plan = buildCitationRequest(request({ sources }));
  const [github, material] = plan.userContent;
  assert.deepEqual(github, {
    type: 'document',
    source: { type: 'content', content: [{ type: 'text', text: '가' }, { type: 'text', text: '나' }] },
    citations: { enabled: true },
    context: '자료 종류: GitHub 기록 원문',
  });
  assert.equal(material.context, '자료 종류: 작성자 자료 원문');
  assert.deepEqual(plan.documents.map((entry) => [entry.documentIndex, entry.sourceIndex]), [[0, 0], [1, 1]]);
});

test('시스템 지시 = 항목 형식 지시 + instruction, userText는 문서 뒤 사용자 메시지, publicationText는 보내지 않는다', () => {
  const plan = buildCitationRequest(request({
    instruction: '기능 지시문', userText: '질문: 배포는 언제 했나요?', publicationText: 'PUBLICATION_ONLY_TEXT',
  }));
  assert.equal(plan.system, `${ITEM_FORMAT_INSTRUCTION}\n\n기능 지시문`);
  assert.ok(!plan.system.includes('질문:'), 'userText를 지시에 섞지 않는다');
  assert.ok(!plan.system.includes('첫 줄'), '근거 글을 지시에 섞지 않는다');
  assert.deepEqual(plan.userContent.map((block) => block.type), ['document', 'text']);
  assert.deepEqual(plan.userContent[1], { type: 'text', text: '질문: 배포는 언제 했나요?' });
  assert.ok(!JSON.stringify(plan).includes('PUBLICATION_ONLY_TEXT'));
});

// #559 S8(FR2.1·FR3.2): 머리글(itemContext)이 있는 근거만 context가 「자료 종류: … · 머리글」이고, 없는 근거(기본 요약·JD)는 지금 글자 그대로다.
// 실패 조건: 머리글이 없는 요청의 context가 바뀜, 머리글이 인용할 수 있는 줄(문서 내용)로 들어감, 입력 길이 검사가 머리글을 세지 않음.
test('S8 itemContext가 있는 근거만 context 끝에 「 · 머리글」을 붙이고, 없거나 빈 글이면 지금 글자 그대로다. 머리글은 문서 줄이 아니다', () => {
  const header = '이 줄이 속한 작업: 「가」 작업(기록 제목 없음)';
  const sources = [
    source({ sourceId: 'with', text: '가\n나', itemContext: header }),
    source({ sourceId: 'without', sourceKind: 'AUTHOR_MATERIAL', text: '다' }),
    source({ sourceId: 'empty', text: '라', itemContext: '' }),
    source({ sourceId: 'material', sourceKind: 'AUTHOR_MATERIAL', text: '마', itemContext: '이 줄이 속한 자료: 「나」 텍스트 자료' }),
  ];
  const plan = buildCitationRequest(request({ feature: 'QNA', sources }));
  assert.deepEqual(plan.userContent.map((block) => block.context), [
    `자료 종류: GitHub 기록 원문 · ${header}`,
    SOURCE_KIND_CONTEXT.AUTHOR_MATERIAL,
    SOURCE_KIND_CONTEXT.GITHUB_RECORD,
    '자료 종류: 작성자 자료 원문 · 이 줄이 속한 자료: 「나」 텍스트 자료',
  ]);
  assert.deepEqual(plan.userContent[0].source.content, [{ type: 'text', text: '가' }, { type: 'text', text: '나' }], '머리글은 인용할 줄에 들어가지 않는다');
  assert.equal(plan.documents[0].lines.length, 2);
  assert.deepEqual(SOURCE_KIND_CONTEXT, { GITHUB_RECORD: '자료 종류: GitHub 기록 원문', AUTHOR_MATERIAL: '자료 종류: 작성자 자료 원문' });
  const plain = buildCitationRequest(request({ sources: [source({ text: '가' })] }));
  assert.equal(plain.userContent[0].context, '자료 종류: GitHub 기록 원문', '머리글이 없는 기본 요약 요청은 그대로다');
});

test('S8 입력 길이 검사는 근거 글·질문과 함께 머리글 길이도 센다(상한 80,000자는 그대로)', () => {
  const withHeader = request({ sources: [source({ text: '가'.repeat(10), itemContext: '나'.repeat(5) })], userText: '다'.repeat(3) });
  assert.equal(inputLength(withHeader), 18);
  assert.equal(inputLength(request({ sources: [source({ text: '가'.repeat(10) })], userText: null })), 10);
  assert.equal(AI_INPUT_MAX_CHARS, 80_000);
  assert.throws(() => assertGenerationRequest(request({ sources: [source({ text: '가'.repeat(79_999), itemContext: '나나' })] })), AiInputTooLarge);
  assert.doesNotThrow(() => assertGenerationRequest(request({ sources: [source({ text: '가'.repeat(79_998), itemContext: '나나' })] })));
});

test('userText가 없거나 빈 글이면 문서만 보낸다', () => {
  for (const userText of [null, '']) {
    const plan = buildCitationRequest(request({ userText }));
    assert.deepEqual(plan.userContent.map((block) => block.type), ['document']);
  }
});

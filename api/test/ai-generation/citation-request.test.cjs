// S2·S9와 요청 구성: 인용 문서·문서 번호 → 근거 대응표·지시와 자료 분리(U1 기능 설계 BR1.4·BR2.1·BR2.3, 비기능 NFR2.3).
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { buildCitationRequest, ITEM_FORMAT_INSTRUCTION } = require('../../dist/ai-generation/citation-request');
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

test('userText가 없거나 빈 글이면 문서만 보낸다', () => {
  for (const userText of [null, '']) {
    const plan = buildCitationRequest(request({ userText }));
    assert.deepEqual(plan.userContent.map((block) => block.type), ['document']);
  }
});

// U5 기본 요약 근거 만들기(기능 설계 BR5.1, entities SummarySource, 계약 C-01 caller-rule·C-07 sourceKind-rule, security-design NFR1.3).
// 순수 함수 시험. 사본은 공개 가능한 합성 글이며 C-10 PublishedSnapshot 모양이다.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { buildSummarySources } = require('../../dist/rag-answer/summary-sources');
const { AI_DRAFT_MARKER, TITLE_MARKER, catchSnapshot } = require('../published-index/support.cjs');

const CATCH_ID = '44444444-4444-4444-8444-444444444444';
const TEXT_ID = '55555555-5555-4555-8555-555555555555';
const PDF_ID = '66666666-6666-4666-8666-666666666666';

function snapshot(items) {
  return { title: `${TITLE_MARKER} 발행본`, publishedAt: new Date(), expiresAt: new Date(), items };
}
// 발행 프리셋 U1의 사본 칸 셋(NFR2.12). 겹친 사본이 없는 사본은 모든 항목이 앞선 사본이다.
const PRESET_MARKER = '[합성-프리셋-이름-c3]';
const FIRST = { presetOrdinal: 1, presetName: PRESET_MARKER, isFirstCopy: true };
const catchItem = (overrides = {}, position = 1) => ({ publishedItemId: CATCH_ID, position, itemKind: 'CATCH', title: `${TITLE_MARKER} 항목`,
  snapshot: { ...catchSnapshot(), ...overrides }, pdfPages: null, ...FIRST });
const textItem = (body, position = 2) => ({ publishedItemId: TEXT_ID, position, itemKind: 'TEXT_MATERIAL', title: `${TITLE_MARKER} 자료`,
  snapshot: { body }, pdfPages: null, ...FIRST });

test('Catch는 workFacts → subjectContribution → evidence.representedFacts → authorDescription 순서, 텍스트는 body, 항목은 position 순서다', () => {
  const value = catchSnapshot();
  const sources = buildSummarySources(snapshot([textItem('자료 본문', 2), catchItem({}, 1)]));
  assert.deepEqual(sources.map((s) => s.location.fieldPath), [
    'workFacts[0]', 'workFacts[1]', 'subjectContribution', 'evidence[0].representedFacts[0]', 'evidence[0].representedFacts[1]',
    'authorDescription', 'body']);
  assert.deepEqual(sources.map((s) => s.sourceKind), [
    'GITHUB_RECORD', 'GITHUB_RECORD', 'GITHUB_RECORD', 'GITHUB_RECORD', 'GITHUB_RECORD', 'AUTHOR_MATERIAL', 'AUTHOR_MATERIAL']);
  assert.deepEqual(sources[0], {
    sourceId: `${CATCH_ID}/workFacts[0]`, sourceKind: 'GITHUB_RECORD', text: value.workFacts[0],
    location: { publishedItemId: CATCH_ID, fieldPath: 'workFacts[0]', charStart: 0, charEnd: value.workFacts[0].length, pdfPage: null },
    catchEvidenceUrls: [value.evidence[0].sourceUrl],
  });
  assert.equal(sources[5].text, value.authorDescription);
  assert.deepEqual(sources[5].catchEvidenceUrls, [value.evidence[0].sourceUrl], 'Catch 항목의 근거는 모두 근거 URL을 붙인다');
  assert.deepEqual(sources[6], {
    sourceId: `${TEXT_ID}/body`, sourceKind: 'AUTHOR_MATERIAL', text: '자료 본문',
    location: { publishedItemId: TEXT_ID, fieldPath: 'body', charStart: 0, charEnd: 5, pdfPage: null }, catchEvidenceUrls: [],
  });
});

test('aiDraft·mismatch·제목은 근거에 넣지 않는다(FR6.4, NFR1.3)', () => {
  const text = JSON.stringify(buildSummarySources(snapshot([catchItem(), textItem('본문')])));
  assert.ok(!text.includes(AI_DRAFT_MARKER));
  assert.ok(!text.includes(TITLE_MARKER));
  assert.ok(!text.includes('mismatch'));
});

test('빈 필드·공백만인 필드·null 작성자 설명은 빼고, UTF-16 길이로 위치를 잰다', () => {
  const sources = buildSummarySources(snapshot([
    catchItem({ workFacts: ['', '😀 이모지'], subjectContribution: '  ', authorDescription: null,
      evidence: [{ sourceUrl: 'https://github.com/o/r/pull/7', sourceRevision: 'a', representedFacts: [] }] }),
    textItem(''),
  ]));
  assert.deepEqual(sources.map((s) => s.location.fieldPath), ['workFacts[1]']);
  assert.equal(sources[0].location.charEnd, '😀 이모지'.length);
  assert.equal(sources[0].location.charEnd, 6);
  assert.deepEqual(buildSummarySources(snapshot([])), []);
});

test('PDF는 읽을 수 있는 쪽만 pages[n](n 오름차순)으로, 위치에 pdfPage를 둔다', () => {
  const pdf = { publishedItemId: PDF_ID, position: 1, itemKind: 'PDF_MATERIAL', title: '자료', snapshot: { pageCount: 3 }, pdfPages: [
    { pageNumber: 3, text: '셋째 쪽', readable: true }, { pageNumber: 1, text: '첫 쪽', readable: true }, { pageNumber: 2, text: '', readable: false }],
    ...FIRST };
  const sources = buildSummarySources(snapshot([pdf]));
  assert.deepEqual(sources.map((s) => [s.location.fieldPath, s.location.pdfPage, s.sourceKind, s.text]), [
    ['pages[1]', 1, 'AUTHOR_MATERIAL', '첫 쪽'], ['pages[3]', 3, 'AUTHOR_MATERIAL', '셋째 쪽']]);
  assert.deepEqual(buildSummarySources(snapshot([{ ...pdf, pdfPages: null }])), []);
});

test('사본 모양이 틀리면 TypeError로 멈춘다(처리기가 FAILED로 쓴다)', () => {
  for (const broken of [
    catchItem({ workFacts: '한 줄' }),
    catchItem({ evidence: [{ representedFacts: ['a'] }] }),
    catchItem({ subjectContribution: 3 }),
    { ...textItem('a'), snapshot: null },
    { ...textItem('a'), itemKind: 'VIDEO' },
    { ...textItem('a'), publishedItemId: 7 },
    // 발행 프리셋 U1: isFirstCopy는 필수 칸이다(NFR2.12). 없는 사본을 앞선 사본으로 짐작하지 않는다.
    { ...textItem('a'), isFirstCopy: undefined },
  ]) {
    assert.throws(() => buildSummarySources(snapshot([broken])), TypeError);
  }
  assert.throws(() => buildSummarySources({ items: null }), TypeError);
});

// 새 Catch NC2 — 사본 선택 칸 넷은 요약 근거가 아니다(BR1.5, AC6.5.1·AC6.5.2).
// 먼저 정한 시나리오: 세 칸과 ownCommit이 든 사본으로 요약 근거를 만든다.
// - 기대: 근거는 지금과 같은 필드에서만 오고, 근거 글에 새 칸 값과 「이 작업의 본인 커밋」이 0건이다.
// - 실패 조건: 새 칸 값이 근거에 나옴, 근거 수·순서가 바뀜.

test('NC2 AC6.5.1·AC6.5.2 새 칸 넷과 표지 글자는 요약 근거에 0건이고 근거 필드·순서는 지금과 같다(BR1.5)', () => {
  const value = catchSnapshot();
  const fresh = {
    evidence: value.evidence.map((item) => ({ ...item, ownCommit: true })),
    authorDescription: '본인 커밋 https://github.com/o/r/commit/ba6bba8c0123456789abcdef0123456789abcdef 를 보라.',
    repositoryName: 'REPOMARKER-owner/repo', authorDescriptionEditedMonth: '2026-11', workLimits: ['LIMITMARKER 한계'],
  };
  const sources = buildSummarySources(snapshot([catchItem(fresh)]));
  const legacy = buildSummarySources(snapshot([catchItem({ authorDescription: fresh.authorDescription })]));
  assert.deepEqual(sources, legacy, '새 칸이 있든 없든 근거는 같다');
  assert.deepEqual(sources.map((s) => s.location.fieldPath), [
    'workFacts[0]', 'workFacts[1]', 'subjectContribution', 'evidence[0].representedFacts[0]', 'evidence[0].representedFacts[1]', 'authorDescription']);
  const text = JSON.stringify(sources);
  for (const marker of ['REPOMARKER', 'LIMITMARKER', '2026-11', '이 작업의 본인 커밋', 'ownCommit']) assert.equal(text.includes(marker), false, marker);
});

// 발행 프리셋 U1 — 겹친 사본(BR4.3, ADR-006 팀장 결정). 먼저 정한 시나리오(unit-test-instructions 「앞선 사본」):
// - 같은 Catch가 두 프리셋에 들어 사본 항목이 둘(앞선 사본 position 1, 겹친 사본 position 3)이다.
// - 기대: 그 Catch의 근거는 앞선 사본의 것으로 한 번만 쓰이고, 겹친 사본 항목 ID의 근거는 0건이다. 프리셋 이름은 근거에 없다.
// - 실패 조건: 같은 근거가 두 번 쓰임, 프리셋 이름이 근거에 나옴.
test('발행 프리셋 BR4.3: 같은 Catch가 두 프리셋에 든 사본에서 그 근거는 요약 근거에 한 번만 쓰이고 프리셋 이름은 넣지 않는다', () => {
  const COPY_ID = '77777777-7777-4777-8777-777777777777';
  const first = catchItem({}, 1);
  const copy = { ...catchItem({}, 3), publishedItemId: COPY_ID, presetOrdinal: 2, presetName: `${PRESET_MARKER} 둘째`, isFirstCopy: false };
  const sources = buildSummarySources(snapshot([first, textItem('자료 본문', 2), copy]));
  const single = buildSummarySources(snapshot([first, textItem('자료 본문', 2)]));
  assert.deepEqual(sources, single, '겹친 사본이 없을 때와 근거가 같다');
  assert.equal(sources.filter((s) => s.location.publishedItemId === COPY_ID).length, 0);
  assert.equal(sources.filter((s) => s.location.fieldPath === 'workFacts[0]').length, 1, '같은 근거가 한 번만');
  assert.equal(JSON.stringify(sources).includes(PRESET_MARKER), false, '프리셋 이름은 외부 AI에 보내지 않는다(NFR4.4)');
});

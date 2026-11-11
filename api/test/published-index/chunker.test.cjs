// U3 조각 나누개(순수 함수). 기능 설계 「조각 나누기 예」와 S1·S2의 DB 밖 부분, BR1.1~BR1.6·BR1.9·BR1.10.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { buildChunkDrafts, ChunkSourceError, splitFieldRanges } = require('../../dist/published-index/chunker');
const { AI_DRAFT_MARKER, catchSnapshot, filler, textBody } = require('./support.cjs');

const CATCH_ID = '00000000-0000-4000-8000-000000000001';
const TEXT_ID = '00000000-0000-4000-8000-000000000002';
const PDF_ID = '00000000-0000-4000-8000-000000000003';

const catchItem = (snapshot = catchSnapshot(), position = 1) =>
  ({ publishedItemId: CATCH_ID, position, itemKind: 'CATCH', snapshot, pdfPages: null });
const textItem = (body, position = 2) =>
  ({ publishedItemId: TEXT_ID, position, itemKind: 'TEXT_MATERIAL', snapshot: { body }, pdfPages: null });

/** 조각마다 원문 필드를 찾아 "필드 [charStart, charEnd) = text"와 길이 상한을 확인한다(BR1.2·BR1.3). */
function fieldText(item, fieldPath) {
  if (fieldPath === 'body') return item.snapshot.body;
  if (fieldPath === 'subjectContribution' || fieldPath === 'authorDescription') return item.snapshot[fieldPath];
  let match = /^workFacts\[(\d+)\]$/.exec(fieldPath);
  if (match) return item.snapshot.workFacts[Number(match[1])];
  match = /^evidence\[(\d+)\]\.representedFacts\[(\d+)\]$/.exec(fieldPath);
  if (match) return item.snapshot.evidence[Number(match[1])].representedFacts[Number(match[2])];
  match = /^pages\[(\d+)\]$/.exec(fieldPath);
  return item.pdfPages.find((page) => page.pageNumber === Number(match[1])).text;
}
function assertExactSlices(items, drafts) {
  for (const draft of drafts) {
    const item = items.find((candidate) => candidate.publishedItemId === draft.publishedItemId);
    assert.equal(fieldText(item, draft.fieldPath).slice(draft.charStart, draft.charEnd), draft.text);
    assert.ok(draft.charEnd - draft.charStart <= 1000 && draft.charEnd > draft.charStart);
    assert.notEqual(draft.text.trim(), '');
    assert.equal(draft.text, draft.text.trim(), '조각 앞뒤에 공백이 없다(BR1.4)');
  }
}

test('Catch 항목은 조각 6개: 필드 순서·출처 종류·근거 URL이 정해진 대로이고 aiDraft는 조각이 없다(BR1.1·BR1.6·BR1.10)', () => {
  const item = catchItem();
  const drafts = buildChunkDrafts([item]);
  assert.deepEqual(drafts.map((d) => [d.fieldPath, d.sourceKind]), [
    ['workFacts[0]', 'GITHUB_RECORD'],
    ['workFacts[1]', 'GITHUB_RECORD'],
    ['subjectContribution', 'GITHUB_RECORD'],
    ['evidence[0].representedFacts[0]', 'GITHUB_RECORD'],
    ['evidence[0].representedFacts[1]', 'GITHUB_RECORD'],
    ['authorDescription', 'AUTHOR_MATERIAL'],
  ]);
  for (const draft of drafts) {
    assert.deepEqual(draft.catchEvidenceUrls, ['https://github.com/synthetic-owner/synthetic-repo/pull/41']);
    assert.equal(draft.pdfPage, null);
    assert.equal(draft.publishedItemId, CATCH_ID);
  }
  assert.ok(!drafts.some((d) => d.text.includes(AI_DRAFT_MARKER)));
  assert.equal(drafts[5].charEnd - drafts[5].charStart, 300);
  assertExactSlices([item], drafts);
  // 조각마다 근거 URL 배열을 따로 갖는다(한 조각을 고쳐도 다른 조각이 바뀌지 않음).
  assert.notEqual(drafts[0].catchEvidenceUrls, drafts[1].catchEvidenceUrls);
});

test('authorDescription이 null이면 그 조각이 없고, 근거가 없는 Catch는 근거 URL이 빈 배열이다', () => {
  const drafts = buildChunkDrafts([catchItem({ ...catchSnapshot(), authorDescription: null, evidence: [] })]);
  assert.deepEqual(drafts.map((d) => d.fieldPath), ['workFacts[0]', 'workFacts[1]', 'subjectContribution']);
  assert.ok(drafts.every((d) => d.catchEvidenceUrls.length === 0));
});

test('텍스트 자료 600·300·900·700자 문단은 조각 3개이고 경계의 빈 줄은 어느 조각에도 없다(BR1.3·BR1.4)', () => {
  const body = textBody();
  assert.equal(body.length, 2506);
  const item = textItem(body);
  const drafts = buildChunkDrafts([item]);
  assert.deepEqual(drafts.map((d) => [d.charStart, d.charEnd]), [[0, 902], [904, 1804], [1806, 2506]]);
  assert.ok(drafts.every((d) => d.sourceKind === 'AUTHOR_MATERIAL' && d.fieldPath === 'body' && d.catchEvidenceUrls.length === 0));
  assert.ok(drafts[0].text.includes('\n\n'), '같은 조각 안 두 문단 사이 빈 줄은 원문 그대로 남는다');
  assert.ok(!drafts[1].text.startsWith('\n') && !drafts[2].text.startsWith('\n'));
  assertExactSlices([item], drafts);
});

test('줄바꿈 없는 1,500자 필드는 1,000자 자리에서 두 조각, 대리쌍 가운데면 한 칸 앞에서 자른다(BR1.3)', () => {
  assert.deepEqual(splitFieldRanges('가'.repeat(1500)), [{ start: 0, end: 1000 }, { start: 1000, end: 1500 }]);
  // 999·1000 자리가 대리쌍(이모지 하나)이면 999에서 자른다.
  const text = 'a'.repeat(999) + '😀' + 'b'.repeat(500);
  assert.equal(text.length, 1501);
  const ranges = splitFieldRanges(text);
  assert.deepEqual(ranges, [{ start: 0, end: 999 }, { start: 999, end: 1501 }]);
  assert.equal(text.slice(999, 1001), '😀');
});

test('1,000자를 넘는 문단 하나는 줄 경계로 모으고, 1,000자 이하 필드는 공백만 빼고 범위 하나다', () => {
  const lines = [filler('첫 줄이다. ', 600), filler('둘째 줄이다. ', 600), filler('셋째 줄이다. ', 300)];
  const text = lines.join('\n');
  assert.deepEqual(splitFieldRanges(text), [{ start: 0, end: 600 }, { start: 601, end: 1502 }]);
  assert.deepEqual(splitFieldRanges('  안녕하세요\n  '), [{ start: 2, end: 7 }]);
});

test('공백·줄바꿈만 있는 필드는 조각이 없고, 빈 줄만 이어진 1,000자 넘는 글도 조각이 없다', () => {
  assert.deepEqual(buildChunkDrafts([textItem(' \n\t ')]), []);
  assert.deepEqual(buildChunkDrafts([textItem('')]), []);
  assert.deepEqual(splitFieldRanges(' \n'.repeat(800)), []);
});

test('PDF는 읽을 수 있는 쪽만 쪽 번호 순서로 pages[n]·pdfPage n 조각이 된다(BR1.5)', () => {
  const item = {
    publishedItemId: PDF_ID, position: 3, itemKind: 'PDF_MATERIAL', snapshot: { pageCount: 3 },
    pdfPages: [
      { pageNumber: 3, text: '셋째 쪽 글이다.', readable: true },
      { pageNumber: 1, text: '첫째 쪽 글이다.', readable: true },
      { pageNumber: 2, text: '', readable: false },
    ],
  };
  const drafts = buildChunkDrafts([item]);
  assert.deepEqual(drafts.map((d) => [d.fieldPath, d.pdfPage, d.sourceKind]),
    [['pages[1]', 1, 'AUTHOR_MATERIAL'], ['pages[3]', 3, 'AUTHOR_MATERIAL']]);
  assertExactSlices([item], drafts);
});

test('조각 순서는 항목 position → 필드 순서 → 필드 안 위치다(BR1.9)', () => {
  const items = [textItem(textBody(), 1), catchItem(catchSnapshot(), 2)];
  const drafts = buildChunkDrafts([items[1], items[0]]);
  assert.deepEqual(drafts.map((d) => d.publishedItemId), [TEXT_ID, TEXT_ID, TEXT_ID, CATCH_ID, CATCH_ID, CATCH_ID, CATCH_ID, CATCH_ID, CATCH_ID]);
  assert.deepEqual(buildChunkDrafts(items), drafts, '같은 입력은 같은 결과(다시 나누어도 같은 순서)');
  assertExactSlices(items, drafts);
});

test('사본 모양이 C-07과 다르면 ChunkSourceError를 던지고 메시지에 사본 글이 없다(BR1.7)', () => {
  const broken = [
    catchItem({ ...catchSnapshot(), workFacts: '배열이 아닌 작업 사실' }),
    catchItem({ ...catchSnapshot(), workFacts: ['ok', 3] }),
    catchItem({ ...catchSnapshot(), subjectContribution: null }),
    catchItem({ ...catchSnapshot(), evidence: [{ sourceRevision: 'r', representedFacts: [] }] }),
    catchItem({ ...catchSnapshot(), aiDraft: 7 }),
    catchItem({ ...catchSnapshot(), mismatch: 'no' }),
    catchItem(null),
    textItem(42),
    { publishedItemId: TEXT_ID, position: 1, itemKind: 'URL', snapshot: { body: '알 수 없는 종류' }, pdfPages: null },
    { publishedItemId: PDF_ID, position: 1, itemKind: 'PDF_MATERIAL', snapshot: { pageCount: 1 }, pdfPages: null },
    { publishedItemId: PDF_ID, position: 1, itemKind: 'PDF_MATERIAL', snapshot: { pageCount: 1 },
      pdfPages: [{ pageNumber: 0, text: '쪽', readable: true }] },
  ];
  for (const item of broken) {
    assert.throws(() => buildChunkDrafts([textItem('정상 항목 비밀글', 9), item]), (error) =>
      error instanceof ChunkSourceError && !error.message.includes('비밀글') && !error.message.includes('작업 사실'));
  }
});

// 새 Catch NC2 — 사본 선택 칸 넷은 조각 재료가 아니다(BR1.5, 보안 설계 4절, AC6.5.1·AC6.5.2).
// 먼저 정한 시나리오: 세 칸과 ownCommit, 표지가 붙을 본인 커밋 링크가 든 사본으로 조각을 만든다.
// - 기대: 조각은 지금과 같은 필드에서만 오고, 조각 글에 저장소 이름·작성 달·한계 문장·「이 작업의 본인 커밋」이 0건이다. 링크는 원래 주소 글자 그대로다.
// - 실패 조건: 새 칸 값이나 표지 글자가 조각에 나옴, 조각 수·필드가 바뀜.

const OWN_COMMIT = 'ba6bba8c0123456789abcdef0123456789abcdef';
/** 새 칸 넷이 든 사본. 작성자 설명에는 표지가 붙을 본인 커밋 링크가 있다. 새 칸 값은 찾기 쉬운 표식이다. */
const nc2Snapshot = () => {
  const base = catchSnapshot();
  return {
    ...base,
    evidence: [{ ...base.evidence[0], ownCommit: false }, {
      sourceUrl: `https://github.com/synthetic-owner/synthetic-repo/commit/${OWN_COMMIT}`, sourceRevision: OWN_COMMIT,
      representedFacts: ['본인 커밋에서 문구 파일을 고쳤다.'], ownCommit: true,
    }],
    authorDescription: `맡은 부분 https://github.com/synthetic-owner/synthetic-repo/blob/ba6bba8/a.ts#L3 를 고쳤다.`,
    repositoryName: 'REPOMARKER-owner/REPOMARKER-repo', authorDescriptionEditedMonth: '2026-11',
    workLimits: ['LIMITMARKER 커밋 목록을 다 받지 못한 기본 브랜치 대상 PR이 있어, 그 PR에도 담긴 커밋일 수 있다'],
  };
};

test('NC2 AC6.5.1·AC6.5.2 새 칸 넷과 본인 커밋 표지 글자는 조각에 0건이고 조각 필드는 지금과 같다(BR1.5)', () => {
  const value = nc2Snapshot();
  const drafts = buildChunkDrafts([catchItem(value)]);
  const legacy = {
    workFacts: value.workFacts, subjectContribution: value.subjectContribution, authorDescription: value.authorDescription,
    aiDraft: value.aiDraft, mismatch: value.mismatch,
    evidence: value.evidence.map(({ sourceUrl, sourceRevision, representedFacts }) => ({ sourceUrl, sourceRevision, representedFacts })),
  };
  const withoutNewFields = buildChunkDrafts([catchItem(legacy)]);
  assert.deepEqual(drafts.map((d) => d.text), withoutNewFields.map((d) => d.text), '새 칸이 있든 없든 조각 글은 같다');
  assert.deepEqual(drafts.map((d) => d.fieldPath), ['workFacts[0]', 'workFacts[1]', 'subjectContribution', 'evidence[0].representedFacts[0]',
    'evidence[0].representedFacts[1]', 'evidence[1].representedFacts[0]', 'authorDescription']);
  const text = JSON.stringify(drafts);
  for (const marker of ['REPOMARKER', 'LIMITMARKER', '2026-11', '이 작업의 본인 커밋', 'ownCommit', '판본 ba6bba8']) {
    assert.equal(text.includes(marker), false, marker);
  }
  assert.ok(drafts.at(-1).text.includes('https://github.com/synthetic-owner/synthetic-repo/blob/ba6bba8/a.ts#L3'), '링크는 원래 주소 글자 그대로');
  assertExactSlices([catchItem(value)], drafts);
});

// 새 Catch NC3 — 다시 볼 곳 사실과 작업 시각은 사본·조각 재료가 아니다(BR6.3, S8·AC9.4.1·AC11.1.4).
// 먼저 정한 실패 조건: 원본 행에 사실·시각이 있을 때 사본이나 조각 글에 사실 경로·커밋 식별값·시각 글자가 나옴.
test('NC3 S8 원본 행에 다시 볼 곳 사실·작업 시각이 있어도 사본과 조각에 그 글자가 0건이다', () => {
  const { buildCatchSnapshot } = require('../../dist/publications/snapshot-builder');
  const commit = (letter) => letter.repeat(40);
  const row = {
    catchId: CATCH_ID, title: 't', workFacts: ['[합성] 사실'], subjectContribution: '[합성] 기여', draftStatus: 'NOT_GENERATED',
    draftContent: null, authorDescription: '[합성] 설명', authorDescriptionUpdatedAt: new Date('2026-11-10T00:00:00Z'), mismatch: false,
    visibility: 'PRIVATE', workFactsConfirmed: true, contributionConfirmed: true, requestMemberId: CATCH_ID, repositoryId: 'r',
    repositoryOwner: 'o', repositoryName: 'n',
    // 발행 질의가 이 칸을 읽지 않지만, 잘못 읽혀 넘어와도 사본에 옮기지 않는지 본다.
    revisitFacts: [{ kind: 'REWORKED_LINES', paths: ['src/REVISITMARKER/a.ts'], commits: [commit('7'), commit('8')] }],
    firstWorkAt: new Date('2025-03-02T10:00:00Z'), lastWorkAt: new Date('2025-04-10T09:30:00Z'),
  };
  const evidence = [{ catchId: CATCH_ID, sourceUrl: 'https://github.com/o/n/pull/1', sourceRevision: 'v', representedFacts: ['[합성] 근거'],
    coverageLimits: [], ownCommit: false }];
  const snapshot = buildCatchSnapshot(row, evidence);
  const drafts = buildChunkDrafts([catchItem(snapshot)]);
  const text = JSON.stringify([snapshot, drafts]);
  for (const marker of ['REVISITMARKER', commit('7'), commit('8'), '2025-03-02', '2025-04-10', 'revisitFacts', 'WorkAt', 'REWORKED_LINES']) {
    assert.equal(text.includes(marker), false, marker);
  }
  assert.ok(drafts.length > 0);
});

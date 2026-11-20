// 발행 프리셋 U1 — 발행 판정 규칙 PublishableSource(규칙 BR2.1·BR2.2·BR3.5, NFR 설계 검토 R-02, NFR2.10, 기능 설계 검토 R-07).
// DB 없는 순수 함수 시험. 행은 모두 합성 값이다.
//
// 먼저 정한 시나리오·기대 결과·실패 조건(unit-test-instructions 「시나리오」의 세기·목록·발행 묶음, team.md Testing Posture). 세부 시험 코드는 구현 뒤 쓴다.
// - 자료 하나의 이유: 확인 필요 → 보호 → 비공개 순으로 처음 맞는 것, PDF는 추출 미완료, 텍스트 자료는 없음. 실패 조건: 순서가 바뀜, 이유가 둘.
// - 기록 문제(원 요청 불일치·보호 관측 없음·불완전)는 이유로 바꾸지 않고 PublishIntegrityError. 실패 조건: null이나 SOURCE_RESTRICTED로 조용히 바뀜.
// - 발행 묶음 판정: 미확인이 하나라도 있으면 그것만, 그다음 기록 문제 → 보호 → 비공개. 실패 조건: 뒤 이유가 앞 이유를 가림.
// - 글자 수: Catch는 작업 사실·기여·근거 사실·작성자 설명의 코드 포인트 합(제목·초안·주소 제외), 텍스트는 본문, PDF는 SQL 집계(발행과 같은 셈).
// - 제목이 없는 Catch는 발행과 같은 「제목 없는 Catch」.
// - 앞선 사본 판정: 같은 (종류, 원본 ID)에서 position이 가장 작은 것만 참(BR4.1).
const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  PublishIntegrityError, blockingCatches, catchUnpublishableReason, pdfUnpublishableReason, protectionRepositoryIds,
} = require('../../dist/publishable-source/eligibility');
const {
  UNTITLED_CATCH_TITLE, buildCatchSnapshot, catchTextLength, catchTitle, codePointLength, snapshotTextLength,
} = require('../../dist/publishable-source/source-content');
const { idsOf } = require('../../dist/publishable-source/source-reader');
const { markFirstCopies } = require('../../dist/publications/published-snapshot');

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

function row(catchId, overrides = {}) {
  return {
    catchId, title: '[합성] Catch', workFacts: ['[합성] 사실'], subjectContribution: '[합성] 기여', draftStatus: 'NOT_GENERATED', draftContent: null,
    authorDescription: null, authorDescriptionUpdatedAt: null, mismatch: false, visibility: 'PUBLIC', workFactsConfirmed: true,
    contributionConfirmed: true, requestMemberId: OWNER, repositoryId: 'repo-none', repositoryOwner: null, repositoryName: null, ...overrides,
  };
}
const protection = (repositoryId, restriction = 'NONE', overrides = {}) => ({
  repositoryId, restriction, confirmedSourceState: { synthetic: true }, observationProvenance: { synthetic: true }, observedAt: new Date(), ...overrides,
});
const protections = new Map([
  ['repo-none', protection('repo-none')],
  ['repo-private', protection('repo-private', 'SOURCE_PRIVATE')],
  ['repo-partial', protection('repo-partial', 'NONE', { observedAt: null })],
  ['repo-unknown', protection('repo-unknown', 'SOMETHING_ELSE')],
]);

test('Catch 하나의 이유는 확인 필요 → 보호 → 비공개 순으로 처음 맞는 것 하나이고, 맞는 것이 없으면 null이다(BR2.2)', () => {
  const reason = (overrides) => catchUnpublishableReason(OWNER, row('c', overrides), protections);
  assert.equal(reason({}), null);
  assert.equal(reason({ visibility: 'PRIVATE' }), 'PRIVATE');
  assert.equal(reason({ repositoryId: 'repo-private' }), 'SOURCE_RESTRICTED');
  assert.equal(reason({ repositoryId: 'repo-private', visibility: 'PRIVATE' }), 'SOURCE_RESTRICTED', '보호가 비공개보다 먼저');
  assert.equal(reason({ workFactsConfirmed: false, repositoryId: 'repo-private', visibility: 'PRIVATE' }), 'CONFIRMATION_REQUIRED', '확인 필요가 맨 앞');
  assert.equal(reason({ contributionConfirmed: false }), 'CONFIRMATION_REQUIRED');
});

test('기록 문제(원 요청 불일치·원 요청 없음·보호 관측 없음·불완전·모르는 값)는 이유가 아니라 PublishIntegrityError다(NFR2.10)', () => {
  for (const overrides of [
    { requestMemberId: OTHER }, { requestMemberId: null }, { repositoryId: null }, { repositoryId: 'repo-missing' },
    { repositoryId: 'repo-partial' }, { repositoryId: 'repo-unknown' },
  ]) {
    assert.throws(() => catchUnpublishableReason(OWNER, row('c', overrides), protections), PublishIntegrityError, JSON.stringify(overrides));
    assert.throws(() => catchUnpublishableReason(OWNER, row('c', { ...overrides, visibility: 'PRIVATE' }), protections), PublishIntegrityError,
      '비공개보다 먼저 끝난다');
  }
  const error = (() => { try { catchUnpublishableReason(OWNER, row('c', { repositoryId: null }), protections); } catch (e) { return e; } })();
  assert.equal(error.message, '발행 원본 자료가 올바르지 않습니다.', '자료 값을 담지 않는다');
});

test('발행 묶음 판정은 미확인 전부 → 기록 문제 → 보호 → 비공개 순으로 처음 이유 하나와 그 이유의 Catch만 돌려준다(BR3.5)', () => {
  const rows = [row('a', { visibility: 'PRIVATE' }), row('b', { repositoryId: 'repo-private' }), row('c', { workFactsConfirmed: false }),
    row('d', { contributionConfirmed: false, repositoryId: null })];
  assert.deepEqual(blockingCatches(OWNER, rows, protections), { reason: 'CONFIRMATION_REQUIRED', catchIds: ['c', 'd'] },
    '미확인이 있으면 기록 문제가 있어도 확인 필요');
  assert.throws(() => blockingCatches(OWNER, [row('a', { visibility: 'PRIVATE' }), row('b', { repositoryId: 'repo-partial' })], protections),
    PublishIntegrityError, '기록 문제는 보호·비공개보다 먼저');
  assert.deepEqual(blockingCatches(OWNER, rows.slice(0, 2), protections), { reason: 'SOURCE_RESTRICTED', catchIds: ['b'] });
  assert.deepEqual(blockingCatches(OWNER, [row('a', { visibility: 'PRIVATE' }), row('e')], protections), { reason: 'PRIVATE', catchIds: ['a'] });
  assert.equal(blockingCatches(OWNER, [row('e'), row('f')], protections), null);
  assert.equal(blockingCatches(OWNER, [], protections), null);
});

test('보호 관측은 원 요청이 있는 저장소 ID만 중복 없이 한 번에 읽는다', () => {
  assert.deepEqual(protectionRepositoryIds([row('a'), row('b'), row('c', { repositoryId: null }), row('d', { repositoryId: 'repo-private' })]),
    ['repo-none', 'repo-private']);
  assert.deepEqual(idsOf([{ kind: 'CATCH', sourceId: 'x' }, { kind: 'TEXT_MATERIAL', sourceId: 'x' }, { kind: 'CATCH', sourceId: 'x' }], 'CATCH'), ['x'],
    '같은 자료가 여러 프리셋에 있어도 한 번(BR3.7)');
});

test('PDF는 추출이 끝나지 않았으면(대기·실패) EXTRACTION_INCOMPLETE이고, 끝났으면 이유가 없다', () => {
  assert.equal(pdfUnpublishableReason('DONE'), null);
  assert.equal(pdfUnpublishableReason('PENDING'), 'EXTRACTION_INCOMPLETE');
  assert.equal(pdfUnpublishableReason('FAILED'), 'EXTRACTION_INCOMPLETE');
});

test('Catch 글자 수는 작업 사실·기여·근거 사실·작성자 설명의 코드 포인트 합이고, 사본으로 센 값과 같다(BR2.1)', () => {
  const source = row('c', { title: '세지 않는 제목', workFacts: ['가나', '😀'], subjectContribution: 'abc', authorDescription: '설명',
    draftStatus: 'GENERATED', draftContent: '세지 않는 초안' });
  const evidence = [{ catchId: 'c', sourceUrl: 'https://github.com/o/r/pull/1', sourceRevision: 'r', representedFacts: ['근거', '😀😀'],
    coverageLimits: [], ownCommit: false }];
  const expected = 2 + 1 + 3 + 2 + 2 + 2;
  assert.equal(catchTextLength(source, evidence), expected);
  assert.equal(snapshotTextLength(buildCatchSnapshot(source, evidence)), expected, '발행 사본과 같은 셈');
  assert.equal(catchTextLength({ ...source, authorDescription: null }, []), 2 + 1 + 3);
  assert.equal(snapshotTextLength({ body: '😀a' }), 2, '텍스트 자료는 본문의 코드 포인트');
  assert.equal(snapshotTextLength({ pageCount: 3 }), 0, 'PDF 사본은 0이고 쪽 글은 SQL 집계로 따로 더한다');
  assert.equal(codePointLength('😀'), 1);
});

test('제목이 없는 Catch는 발행과 같은 「제목 없는 Catch」로 보인다(기능 설계 검토 R-07)', () => {
  assert.equal(UNTITLED_CATCH_TITLE, '제목 없는 Catch');
  assert.equal(catchTitle({ title: null }), '제목 없는 Catch');
  assert.equal(catchTitle({ title: '[합성] 있는 제목' }), '[합성] 있는 제목');
});

test('앞선 사본은 같은 (종류, 원본 ID) 가운데 position이 가장 작은 것 하나이고, 종류가 다르면 같은 ID라도 따로 본다(BR4.1)', () => {
  const id = '33333333-3333-4333-8333-333333333333';
  const items = [
    { itemKind: 'CATCH', sourceId: id, position: 4 },
    { itemKind: 'TEXT_MATERIAL', sourceId: id, position: 2 },
    { itemKind: 'CATCH', sourceId: id.toUpperCase(), position: 1 },
    { itemKind: 'PDF_MATERIAL', sourceId: '44444444-4444-4444-8444-444444444444', position: 3 },
    { itemKind: 'PDF_MATERIAL', sourceId: '44444444-4444-4444-8444-444444444444', position: 5 },
  ];
  assert.deepEqual(markFirstCopies(items), [false, true, true, true, false]);
  assert.deepEqual(markFirstCopies([]), []);
});

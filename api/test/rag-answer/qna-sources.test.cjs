// #559 질의응답 근거 목록(buildQnaSources) 시험. 코드 계획 시나리오 S1~S7·S13·S15(api 쪽)·S16.
// 순수 함수 시험이고 DB·외부 호출이 없다. 사본·검색 결과는 시험 안에서 만든 합성 글이다(실제 발행본·질문·답 원문을 쓰지 않는다).
// S16만 실제 게이트(CheckedAiGenerationGate)에 기록한 응답을 시험용 fetch로 넘긴다(실제 Claude를 부르지 않는다).
require('reflect-metadata');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { buildQnaSources, buildItemContexts, itemTag, QNA_ITEM_TAGS, sanitizeItemContextLine } = require('../../dist/rag-answer/qna-sources');
const {
  AUTHOR_MATERIAL_VOICE_INSTRUCTION, BASE_SUMMARY_INSTRUCTION, QNA_ATTACH_PER_CATCH_LIMIT, QNA_INSTRUCTION, QNA_ITEM_CONTEXT_MAX_LENGTH,
  QNA_SEARCH_LIMIT, QNA_SOURCE_TOTAL_LIMIT,
} = require('../../dist/rag-answer/rag-answer-config');
const { buildCitationRequest } = require('../../dist/ai-generation/citation-request');
const { createCheckedAiGenerationGate } = require('../../dist/ai-generation/checked-gate');
const { FAKE_KEY, blockCitation, captureLogs, fragment, jsonResponse, messageBody, recordingFetch } = require('../u2/gate-fixtures.cjs');

const ASCII_LETTER_OR_DIGIT = /[0-9A-Za-z]/;
const SECRET_TITLE = 'TITLE-SECRET 항목 제목';
const SECRET_DRAFT = 'AIDRAFT-SECRET 초안';
const SECRET_REPO = 'secret-owner/secret-repo';

const itemId = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/**
 * 합성 Catch 항목. evidence는 근거마다 줄 수 목록이다(기본: 두 줄짜리 근거 셋).
 * workFacts는 글 목록(기본: 첫 줄과 둘째 줄), authorDescription은 null이 아니면 작성자 설명이다.
 */
function catchItem(n, position, { label = `작업${n}`, workFacts, evidence = [2, 2, 2], authorDescription = null } = {}) {
  return {
    publishedItemId: itemId(n), position, itemKind: 'CATCH', title: SECRET_TITLE, pdfPages: null,
    snapshot: {
      workFacts: workFacts ?? [`${label} 첫 작업 사실`, `${label} 둘째 줄 제목`],
      subjectContribution: `${label} 나의 기여`,
      evidence: evidence.map((lines, i) => ({
        sourceUrl: `https://github.com/synthetic-owner/synthetic-repo/pull/${n * 100 + i}`, sourceRevision: 'abc1234',
        representedFacts: Array.from({ length: lines }, (_, j) => `${label} 근거 ${i} 줄 ${j}`), ownCommit: false,
      })),
      authorDescription, aiDraft: SECRET_DRAFT, mismatch: false, repositoryName: SECRET_REPO,
    },
  };
}
const textItem = (n, position, body = '합성 텍스트 자료 본문이다.') => ({ publishedItemId: itemId(n), position, itemKind: 'TEXT_MATERIAL',
  title: SECRET_TITLE, snapshot: { body }, pdfPages: null });
const pdfItem = (n, position) => ({ publishedItemId: itemId(n), position, itemKind: 'PDF_MATERIAL', title: SECRET_TITLE,
  snapshot: { pageCount: 1 }, pdfPages: [{ pageNumber: 1, text: '합성 올린 문서 쪽 글이다.', readable: true }] });
const snapshotOf = (items) => ({ title: '합성 발행본', publishedAt: new Date('2026-11-16T00:00:00Z'), expiresAt: new Date('2027-02-14T00:00:00Z'), items });

/** 사본 칸 하나의 글. fieldPath는 C-07 칸 이름(workFacts[i]·subjectContribution·evidence[i].representedFacts[j]·authorDescription·body·pages[n]). */
function fieldText(item, fieldPath) {
  if (fieldPath === 'body') return item.snapshot.body;
  if (fieldPath === 'subjectContribution') return item.snapshot.subjectContribution;
  if (fieldPath === 'authorDescription') return item.snapshot.authorDescription;
  let match = /^workFacts\[(\d+)\]$/.exec(fieldPath);
  if (match) return item.snapshot.workFacts[Number(match[1])];
  match = /^evidence\[(\d+)\]\.representedFacts\[(\d+)\]$/.exec(fieldPath);
  if (match) return item.snapshot.evidence[Number(match[1])].representedFacts[Number(match[2])];
  match = /^pages\[(\d+)\]$/.exec(fieldPath);
  if (match) return item.pdfPages.find((page) => page.pageNumber === Number(match[1])).text;
  throw new Error(`시험 칸 이름이 틀림: ${fieldPath}`);
}

let chunkSeq = 0;
/** 검색 결과 한 칸(C-09 ChunkHit). 기본은 그 칸 전체이고, range로 칸 안 일부를 줄 수 있다. */
function hitOf(item, fieldPath, { score = 0.5, range } = {}) {
  const text = fieldText(item, fieldPath);
  const [charStart, charEnd] = range ?? [0, text.length];
  const kind = fieldPath === 'authorDescription' || item.itemKind !== 'CATCH' ? 'AUTHOR_MATERIAL' : 'GITHUB_RECORD';
  chunkSeq += 1;
  return {
    chunkId: `chunk-${chunkSeq}`, publishedItemId: item.publishedItemId, fieldPath, charStart, charEnd,
    pdfPage: fieldPath.startsWith('pages[') ? Number(/\d+/.exec(fieldPath)[0]) : null, sourceKind: kind, text: text.slice(charStart, charEnd),
    score, catchEvidenceUrls: item.itemKind === 'CATCH' ? item.snapshot.evidence.map((entry) => entry.sourceUrl) : [],
  };
}

const paths = (sources) => sources.map((source) => `${source.location.publishedItemId.slice(-2)}:${source.location.fieldPath}`);
const fieldKeys = (sources) => sources.map((source) => `${source.location.publishedItemId}/${source.location.fieldPath}`);
const githubLineCount = (item) => item.snapshot.workFacts.length + 1 + item.snapshot.evidence.reduce((sum, entry) => sum + entry.representedFacts.length, 0);

// ---- S1·S15 붙이는 순서와 위치 --------------------------------------------------------------------------------------------

test('S1 맞은 근거의 다른 줄 → 작업 사실·나의 기여 → 남은 근거(사본 순서)로 붙이고, 같은 칸은 두 번 넣지 않는다(FR1.2·FR1.4)', () => {
  const a = catchItem(1, 1);
  const b = catchItem(2, 2);
  assert.equal(githubLineCount(a), 9);
  const hit = hitOf(a, 'evidence[1].representedFacts[0]');
  const { sources, unattachedLineCount } = buildQnaSources([hit], snapshotOf([a, b]));
  assert.deepEqual(paths(sources), [
    '01:evidence[1].representedFacts[0]', '01:evidence[1].representedFacts[1]', '01:workFacts[0]', '01:workFacts[1]', '01:subjectContribution',
    '01:evidence[0].representedFacts[0]', '01:evidence[0].representedFacts[1]', '01:evidence[2].representedFacts[0]',
    '01:evidence[2].representedFacts[1]']);
  assert.equal(new Set(fieldKeys(sources)).size, sources.length, '같은 칸이 두 번 들어가지 않는다');
  assert.equal(sources[0].sourceId, hit.chunkId, '검색으로 맞은 줄은 조각 그대로다');
  assert.equal(sources[1].sourceId, `${a.publishedItemId}/evidence[1].representedFacts[1]`);
  assert.ok(!paths(sources).some((path) => path.startsWith('02:')), '맞지 않은 Catch의 줄은 붙이지 않는다');
  assert.equal(unattachedLineCount, 0);
});

test('S15(api) 붙인 줄의 위치는 그 칸 하나 전체 범위이고, 맞은 줄은 조각 범위 그대로다(FR1.5, C-01)', () => {
  const a = catchItem(1, 1);
  const hit = hitOf(a, 'workFacts[0]', { range: [2, 6] });
  const { sources } = buildQnaSources([hit], snapshotOf([a]));
  assert.deepEqual(sources[0].location, { publishedItemId: a.publishedItemId, fieldPath: 'workFacts[0]', charStart: 2, charEnd: 6, pdfPage: null });
  assert.equal(sources[0].text, a.snapshot.workFacts[0].slice(2, 6));
  for (const source of sources.slice(1)) {
    const text = fieldText(a, source.location.fieldPath);
    assert.deepEqual(source.location, { publishedItemId: a.publishedItemId, fieldPath: source.location.fieldPath, charStart: 0,
      charEnd: text.length, pdfPage: null });
    assert.equal(source.text, text, '근거 글은 그 칸 원문 그대로다');
    assert.equal(source.sourceKind, 'GITHUB_RECORD');
    assert.deepEqual(source.catchEvidenceUrls, a.snapshot.evidence.map((entry) => entry.sourceUrl));
  }
  assert.ok(!paths(sources).slice(1).includes('01:workFacts[0]'), '맞은 칸은 범위가 일부여도 다시 붙이지 않는다');
});

// ---- S2~S5 상한과 건너뛰기 ------------------------------------------------------------------------------------------------

test('S2 줄이 31개인 큰 Catch는 12줄까지만 붙이고 나머지를 붙이지 못한 줄 수로 센다(FR1.3·FR1.6)', () => {
  const big = catchItem(3, 1, { evidence: Array(14).fill(2) });
  assert.equal(githubLineCount(big), 31);
  assert.equal(QNA_ATTACH_PER_CATCH_LIMIT, 12);
  const { sources, unattachedLineCount } = buildQnaSources([hitOf(big, 'workFacts[0]')], snapshotOf([big]));
  assert.equal(sources.length, 1 + 12);
  assert.deepEqual(paths(sources).slice(1, 5), ['03:workFacts[1]', '03:subjectContribution', '03:evidence[0].representedFacts[0]',
    '03:evidence[0].representedFacts[1]']);
  assert.equal(paths(sources).at(-1), '03:evidence[4].representedFacts[1]');
  assert.equal(unattachedLineCount, 31 - 1 - 12);
});

test('S3 세 Catch가 맞아 붙일 줄이 많으면 보내는 줄은 40줄 이하이고 검색 8개는 늘 들어간다. Catch는 가장 높은 순위 순이다(FR1.1·FR1.3·NFR4)', () => {
  const c1 = catchItem(11, 1, { evidence: Array(14).fill(2) });
  const c2 = catchItem(12, 2, { evidence: Array(14).fill(2) });
  const c3 = catchItem(13, 3, { evidence: Array(14).fill(2) });
  // 점수 순서를 사본 순서와 다르게 둔다: 1위가 c2라서 c2를 먼저 붙인다.
  const hits = [hitOf(c2, 'workFacts[0]'), hitOf(c1, 'workFacts[0]'), hitOf(c3, 'workFacts[0]'), hitOf(c1, 'workFacts[1]'),
    hitOf(c2, 'workFacts[1]'), hitOf(c3, 'workFacts[1]'), hitOf(c1, 'subjectContribution'), hitOf(c2, 'subjectContribution')];
  assert.equal(hits.length, QNA_SEARCH_LIMIT);
  const { sources, unattachedLineCount } = buildQnaSources(hits, snapshotOf([c1, c2, c3]));
  assert.equal(QNA_SOURCE_TOTAL_LIMIT, 40);
  assert.ok(sources.length <= QNA_SOURCE_TOTAL_LIMIT);
  for (const hit of hits) assert.ok(sources.some((source) => source.sourceId === hit.chunkId), '검색으로 맞은 줄은 모두 들어간다');
  const owners = sources.map((source) => source.location.publishedItemId.slice(-2));
  // c2(맞은 줄 3 + 붙인 줄 12) → c1(3 + 12) → c3(2 + 남은 전체 상한 8 안에서 근거 단위로 7)
  assert.deepEqual([...new Set(owners)], ['12', '11', '13']);
  assert.deepEqual(owners.filter((owner) => owner === '12').length, 15);
  assert.deepEqual(owners.filter((owner) => owner === '11').length, 15);
  assert.deepEqual(owners.filter((owner) => owner === '13').length, 9);
  assert.deepEqual(paths(sources).slice(0, 3), ['12:workFacts[0]', '12:workFacts[1]', '12:subjectContribution'], 'Catch 안에서는 맞은 줄이 순위 순으로 먼저다');
  assert.equal(sources.length, 39, '두 줄짜리 근거가 남은 1줄에 들어가지 않아 건너뛴다');
  assert.equal(unattachedLineCount, 93 - 39);
});

test('S4 두 줄짜리 근거가 남은 상한 1줄에 다 들어가지 않으면 자르지 않고 건너뛰어 2를 세고, 다음 한 줄짜리 근거는 붙인다(FR1.4)', () => {
  // 맞은 줄 evidence[0].rf[0] → ① 같은 근거 1줄 → ② 작업 사실 9줄 + 나의 기여 1줄 → 남은 상한 1줄
  const x = catchItem(4, 1, { workFacts: Array.from({ length: 9 }, (_, i) => `작업 사실 ${i}`), evidence: [2, 2, 1, 2] });
  const { sources, unattachedLineCount } = buildQnaSources([hitOf(x, 'evidence[0].representedFacts[0]')], snapshotOf([x]));
  const attached = paths(sources).slice(1);
  assert.equal(attached.length, 12);
  assert.ok(!attached.some((path) => path.startsWith('04:evidence[1]')), '두 줄짜리 근거를 한 줄만 붙이지 않는다');
  assert.equal(attached.at(-1), '04:evidence[2].representedFacts[0]', '건너뛴 뒤 다음 근거를 이어서 본다');
  assert.equal(unattachedLineCount, 2 + 2, 'evidence[1] 두 줄과 evidence[3] 두 줄');
});

test('S5 작업 사실·나의 기여 줄이 남은 상한보다 많으면 줄 단위로 상한까지 붙이고 나머지를 센다(FR1.4)', () => {
  // ① 맞은 근거의 다른 줄 11줄 → 남은 상한 1줄 → ② workFacts[0]만 붙고 workFacts[1]·나의 기여는 센다
  const x = catchItem(5, 1, { evidence: [12, 2] });
  const { sources, unattachedLineCount } = buildQnaSources([hitOf(x, 'evidence[0].representedFacts[0]')], snapshotOf([x]));
  const attached = paths(sources).slice(1);
  assert.equal(attached.length, 12);
  assert.deepEqual(attached.slice(-1), ['05:workFacts[0]']);
  assert.ok(attached.slice(0, 11).every((path) => path.startsWith('05:evidence[0]')));
  assert.equal(unattachedLineCount, 2 + 2, 'workFacts[1]·나의 기여 2줄과 evidence[1] 2줄');
});

// ---- S6 붙이지 않는 것과 순위 자리 ----------------------------------------------------------------------------------------

test('S6 작성자 설명·텍스트 자료는 맞은 것만 보내고 붙이지 않는다. Catch가 아닌 맞은 줄은 자기 순위 자리다(FR1.2)', () => {
  const a = catchItem(6, 1, { authorDescription: '작성자 설명 원문이다.' });
  const text = textItem(7, 2);
  const onlyWork = buildQnaSources([hitOf(a, 'workFacts[0]')], snapshotOf([a, text]));
  assert.ok(!paths(onlyWork.sources).includes('06:authorDescription'), '맞지 않은 작성자 설명은 붙이지 않는다');
  assert.ok(!paths(onlyWork.sources).includes('07:body'), '맞지 않은 텍스트 자료는 붙이지 않는다');
  assert.ok(onlyWork.sources.every((source) => source.sourceKind === 'GITHUB_RECORD'));

  const ranked = buildQnaSources([hitOf(text, 'body'), hitOf(a, 'workFacts[0]'), hitOf(a, 'authorDescription')], snapshotOf([a, text]));
  assert.deepEqual(paths(ranked.sources).slice(0, 3), ['07:body', '06:workFacts[0]', '06:authorDescription']);
  assert.equal(ranked.sources.filter((source) => source.location.fieldPath === 'body').length, 1, '텍스트 자료 칸은 맞은 조각 하나뿐');
  assert.equal(ranked.sources.length, 3 + 8, '맞은 Catch의 남은 GitHub 기록 8줄을 붙인다');
});

test('사본에 없는 항목의 맞은 줄은 머리글 없이 그대로 보내고 붙이지 않는다', () => {
  const a = catchItem(8, 1);
  const stray = { ...hitOf(a, 'workFacts[0]'), publishedItemId: itemId(99) };
  const { sources, unattachedLineCount } = buildQnaSources([stray], snapshotOf([a]));
  assert.equal(sources.length, 1);
  assert.equal(sources[0].itemContext, undefined);
  assert.equal(unattachedLineCount, 0);
});

// ---- S7 머리글 -----------------------------------------------------------------------------------------------------------

const LS = String.fromCodePoint(0x2028);
const RLO = String.fromCodePoint(0x202e);
const LRI = String.fromCodePoint(0x2066);
const BELL = String.fromCodePoint(0x07);
const TAB = String.fromCodePoint(0x09);

test('S7 머리글은 항목 종류마다 정한 꼴이고, 고정 글자에 숫자·영문자가 없으며, 제목·AI 초안·저장소 이름을 넣지 않는다(FR2.1·FR2.2·FR2.4)', () => {
  const long = '긴'.repeat(250);
  const items = [
    catchItem(21, 1, { workFacts: ['첫 줄', 'PR 제목 하나'] }),
    catchItem(22, 2, { workFacts: ['둘째 줄이 없는 작업'] }),
    catchItem(23, 3, { workFacts: ['첫 줄', '같은 둘째 줄'] }),
    catchItem(24, 4, { workFacts: ['첫 줄', '같은 둘째 줄'] }),
    catchItem(25, 5, { workFacts: ['첫 줄', long] }),
    catchItem(26, 6, { workFacts: ['첫 줄', `줄바꿈\r\n있는${LS}제목${TAB}끝${RLO}뒤집기${LRI}${BELL}  `] }),
    catchItem(27, 7, { workFacts: ['첫 줄', ` ${RLO}${TAB}\n ${BELL}`] }),
    textItem(28, 8),
    pdfItem(29, 9),
  ];
  const contexts = buildItemContexts(snapshotOf(items));
  assert.equal(contexts.get(itemId(21)), '이 줄이 속한 작업: PR 제목 하나');
  assert.equal(contexts.get(itemId(22)), '이 줄이 속한 작업: 「나」 작업(기록 제목 없음)');
  assert.equal(contexts.get(itemId(23)), '이 줄이 속한 작업: 「다」 같은 둘째 줄', '둘째 줄이 같은 Catch는 표 글자로 가른다');
  assert.equal(contexts.get(itemId(24)), '이 줄이 속한 작업: 「라」 같은 둘째 줄');
  assert.equal(contexts.get(itemId(25)), `이 줄이 속한 작업: ${'긴'.repeat(QNA_ITEM_CONTEXT_MAX_LENGTH)}`, '둘째 줄은 앞 200자까지');
  assert.equal(contexts.get(itemId(26)), '이 줄이 속한 작업: 줄바꿈 있는 제목끝뒤집기', '줄바꿈은 빈칸, 제어·글 방향 문자는 지운다');
  assert.equal(contexts.get(itemId(27)), '이 줄이 속한 작업: 「사」 작업(기록 제목 없음)', '다듬어 빈 둘째 줄은 없는 것으로 본다');
  assert.equal(contexts.get(itemId(28)), '이 줄이 속한 자료: 「아」 텍스트 자료');
  assert.equal(contexts.get(itemId(29)), '이 줄이 속한 자료: 「자」 올린 문서');

  const seconds = new Map([[21, 'PR 제목 하나'], [23, '같은 둘째 줄'], [24, '같은 둘째 줄'], [25, '긴'.repeat(200)], [26, '줄바꿈 있는 제목끝뒤집기']]);
  for (const [n, context] of [...contexts.entries()].map(([id, value]) => [Number(id.slice(-2)), value])) {
    const fixed = seconds.has(n) ? context.replace(seconds.get(n), '') : context;
    assert.ok(!ASCII_LETTER_OR_DIGIT.test(fixed), `${n}번 머리글의 고정 글자에 숫자·영문자가 없다`);
    for (const secret of ['TITLE-SECRET', 'AIDRAFT-SECRET', SECRET_REPO]) assert.ok(!context.includes(secret), `${n}번 머리글에 ${secret}가 없다`);
    assert.ok(!/[\p{Cc}\u{2028}\u{2029}\u{200E}\u{200F}\u{202A}-\u{202E}\u{2066}-\u{2069}]/u.test(context), `${n}번 머리글에 제어 문자가 없다`);
  }
  assert.equal(QNA_ITEM_TAGS.length, 20);
  assert.ok(QNA_ITEM_TAGS.every((tag) => !ASCII_LETTER_OR_DIGIT.test(tag)));
  assert.equal(itemTag(19), '버');
  assert.ok(!ASCII_LETTER_OR_DIGIT.test(itemTag(25)), '20개를 넘어도 숫자·영문자를 쓰지 않는다');
});

test('S7 둘째 줄 다듬기는 200자(UTF-16)까지 자르되 서로게이트 쌍을 가운데서 자르지 않는다', () => {
  const emoji = String.fromCodePoint(0x1f600);
  const atBoundary = `${'가'.repeat(199)}${emoji}${'나'.repeat(10)}`;
  const cut = sanitizeItemContextLine(atBoundary);
  assert.equal(cut, '가'.repeat(199), '쌍의 앞 반쪽에서 자르게 되면 그 앞에서 멈춘다');
  const fits = sanitizeItemContextLine(`${'가'.repeat(198)}${emoji}${'나'.repeat(10)}`);
  assert.equal(fits.length, 200);
  assert.ok(fits.endsWith(emoji));
  assert.equal(sanitizeItemContextLine('  여러   칸  '), '여러 칸');
  assert.equal(sanitizeItemContextLine(` \r\n${RLO} `), null);
});

test('S7 근거마다 그 항목의 머리글을 단다. 같은 Catch의 작성자 설명 줄에도 같은 머리글이다(FR2.1·FR2.2)', () => {
  const a = catchItem(31, 1, { workFacts: ['첫 줄', '알림 화면 고치기'], authorDescription: '작성자 설명이다.' });
  const text = textItem(32, 2);
  const { sources } = buildQnaSources([hitOf(a, 'authorDescription'), hitOf(text, 'body')], snapshotOf([a, text]));
  const catchSources = sources.filter((source) => source.location.publishedItemId === a.publishedItemId);
  assert.ok(catchSources.length > 1);
  assert.ok(catchSources.every((source) => source.itemContext === '이 줄이 속한 작업: 알림 화면 고치기'));
  assert.equal(sources.find((source) => source.location.fieldPath === 'body').itemContext, '이 줄이 속한 자료: 「나」 텍스트 자료');
});

// ---- S13 지시문 ----------------------------------------------------------------------------------------------------------

test('S13 질의응답 지시는 두 지시(첫 항목에 답, 찾은 자료에서 확인되지 않음)를 담고 공용 문장으로 끝난다. 기본 요약 지시는 그대로다(FR3.1·FR3.2)', () => {
  assert.equal(QNA_INSTRUCTION, '발행본 자료만으로 질문에 답하고 근거가 되는 줄을 인용한다. 첫 항목에는 질문에 대한 답을 쓴다. '
    + '찾은 자료로 답할 수 없으면 첫 항목에 「찾은 자료에서는 확인되지 않는다」고 쓰고, 발행본에 없다고 단정하지 않는다. '
    + AUTHOR_MATERIAL_VOICE_INSTRUCTION);
  assert.ok(!QNA_INSTRUCTION.includes('자료에 없는 일은 없다고 말한다'), '옛 문장은 없다');
  assert.equal(QNA_INSTRUCTION.split(AUTHOR_MATERIAL_VOICE_INSTRUCTION).length, 2);
  assert.equal(AUTHOR_MATERIAL_VOICE_INSTRUCTION,
    "자료 종류가 작성자 자료 원문인 내용은 '작성자는 …라고 적었다'처럼 작성자의 말로 옮기고, 확인된 사실처럼 쓰지 않는다.");
  assert.equal(BASE_SUMMARY_INSTRUCTION, '자료를 다 읽기 전에 발행본 전체를 파악하도록 핵심을 7개 이하 항목으로 요약하고 근거 줄을 인용한다. '
    + '작성자 자료 원문에서 온 내용은 다른 자료와 한 항목에 섞지 않고, 작성자의 글에서 핵심 문장을 바꿔 쓰지 않은 채 따옴표 안에 옮기고 그 줄을 인용한다. '
    + "작성자 자료 원문이 아닌 자료(커밋 메시지·PR 제목 등)는 '작성자는 …라고 적었다'로 옮기지 않는다. "
    + AUTHOR_MATERIAL_VOICE_INSTRUCTION);
});

// ---- S16 머리글 글자를 답에 옮겨도 대조를 통과 ----------------------------------------------------------------------------

test('S16 모델이 머리글의 고정 글자를 인용 항목·AI 해석 항목에 옮겨 써도 두 항목 모두 대조를 통과한다(설계 결정 6)', async (t) => {
  const logs = captureLogs(t);
  const noSecond = catchItem(41, 1, { workFacts: ['알림 목록을 고쳤다'] });
  const text = textItem(42, 2, '배포 순서를 적은 자료다.');
  const pdf = pdfItem(43, 3);
  const { sources } = buildQnaSources([hitOf(noSecond, 'workFacts[0]'), hitOf(text, 'body'), hitOf(pdf, 'pages[1]')],
    snapshotOf([noSecond, text, pdf]));
  const request = { feature: 'QNA', instruction: QNA_INSTRUCTION, sources, userText: '무엇을 했나요?', publicationText: null, model: 'HAIKU' };
  const plan = buildCitationRequest(request);
  assert.equal(plan.userContent[0].context, '자료 종류: GitHub 기록 원문 · 이 줄이 속한 작업: 「가」 작업(기록 제목 없음)');
  const { fetch, requests } = recordingFetch([jsonResponse(messageBody([
    fragment('- 이 줄이 속한 작업 「가」 작업(기록 제목 없음)에서 알림 목록을 고쳤다', [blockCitation(0, 0, 1)]),
    fragment('\n- 「나」 텍스트 자료와 「다」 올린 문서는 이 줄이 속한 자료로 보인다'),
  ]))]);
  const gate = createCheckedAiGenerationGate({ apiKey: FAKE_KEY, fetch });
  const output = await gate.generate(request);
  assert.equal(requests.length, 1);
  assert.deepEqual(output.items.map((item) => item.kind), ['CITED', 'AI_INTERPRETATION']);
  assert.equal(output.droppedCount, 0);
  const result = logs.find((log) => log.args[0]?.event === 'ai_gate_result')?.args[0];
  assert.equal(result.dropReasons.fact, 0, '머리글 글자 때문에 버린 항목이 없다');
  assert.ok(!ASCII_LETTER_OR_DIGIT.test(output.items.map((item) => item.text).join('')), '옮겨 쓴 글에 숫자·영문자가 없다');
});

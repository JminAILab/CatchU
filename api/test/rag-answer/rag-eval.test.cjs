// U5 RAG 평가 스크립트(기능 설계 W7·BR10.1~BR10.7, 비기능 설계 NFR3.1~NFR3.3, 계획 1차 수정 요청 (4)).
// synthetic 모드만 실제로 끝까지 돌린다(합성 게이트·합성 검색·메모리 사본, 외부 호출 없음). 이 결과는 NFR3 측정이 아니다.
// 출력은 시험마다 만든 임시 폴더에만 쓰고 끝나면 지운다. 저장소 기록 폴더(api/docs/rag-evaluation/)는 만들지 않는다.
const assert = require('node:assert/strict');
const { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { test } = require('node:test');
const {
  RagEvalInputError, captureGateLogs, createMeasureDeps, createSyntheticDeps, dbPublicationAccess, ownedSnapshotReader, parseArgs, parseInput, runRagEval, sampleInput, splitJdRequirements,
} = require('../../scripts/rag-eval/rag-eval.cjs');
const { GoldQuoteNotFound, evidencePassRate, findGoldLocations, hitRate, isHitAt } = require('../../scripts/rag-eval/gold-locations.cjs');
const { buildRepositoryRecord, writeEvaluation } = require('../../scripts/rag-eval/rag-eval-report.cjs');
const { Logger } = require('@nestjs/common');
const { AiProviderError } = require('../../dist/ai-generation/ai-generation.types');
const { createCheckedAiGenerationGate } = require('../../dist/ai-generation/checked-gate');
const { buildQnaSources } = require('../../dist/rag-answer/qna-sources');
const { QNA_INSTRUCTION } = require('../../dist/rag-answer/rag-answer-config');
const { FAKE_KEY, blockCitation, fragment, jsonResponse, messageBody, recordingFetch } = require('../u2/gate-fixtures.cjs');

const INPUT = JSON.parse(readFileSync(resolve(__dirname, 'rag-eval-input.json'), 'utf8'));
const REPOSITORY_DOCS = resolve(__dirname, '..', '..', 'docs', 'rag-evaluation');
const CLOCK = () => new Date('2026-11-02T03:00:00.000Z');

function tempDirs(t) {
  const root = mkdtempSync(join(tmpdir(), 'u5-rag-eval-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { outDir: join(root, 'out'), docsDir: join(root, 'docs') };
}
const synthetic = (raw = INPUT) => {
  const input = parseInput(structuredClone(raw), 'synthetic');
  return { input, deps: createSyntheticDeps(input) };
};

test('synthetic 모드는 합성 자료로 끝까지 돌고 SYNTHETIC_CHECK를 적으며, 결과·기록을 지정한 로컬 폴더에만 쓴다(BR10.1, 수정 요청 (4))', async (t) => {
  const { outDir, docsDir } = tempDirs(t);
  const docsBefore = existsSync(REPOSITORY_DOCS);
  const { input, deps } = synthetic();
  const result = await runRagEval({ mode: 'synthetic', input, deps, outDir, docsDir, clock: CLOCK });
  assert.deepEqual(readdirSync(outDir).sort(), ['2026-11-02-synthetic-record.md', '2026-11-02-synthetic.json']);
  assert.equal(existsSync(docsDir), false, 'synthetic은 저장소 기록 폴더에 쓰지 않는다');
  assert.equal(existsSync(REPOSITORY_DOCS), docsBefore, '저장소의 api/docs/rag-evaluation/도 만들지 않는다');
  const record = readFileSync(result.recordPath, 'utf8');
  assert.match(record, /모드: SYNTHETIC_CHECK/);
  assert.match(record, /대상 버전: test-fixture/);
  const raw = JSON.parse(readFileSync(result.rawPath, 'utf8'));
  assert.equal(raw.mode, 'SYNTHETIC_CHECK');
  assert.equal(raw.questions.length, 3);
  assert.equal(raw.questions[0].question, INPUT.questions[0].question, '원문은 로컬 결과 파일에만 있다');
  assert.equal(result.summary.questionCount, 3);
  assert.equal(result.summary.jd.splitter, 'SCRIPT');
  assert.equal(result.summary.jd.rows.length, 2);
  for (const secret of ['SYNTHETIC-QUESTION', 'SYNTHETIC-GOLD', 'SYNTHETIC-JD', '합성 답 항목', 'SYNTHETIC-AIDRAFT']) {
    assert.ok(!record.includes(secret), `기록에 ${secret} 원문이 없다`);
  }
});

test('정답 글귀가 발행본에 없으면 질문 번호를 알리고 멈추며 파일을 쓰지 않는다(BR10.2). aiDraft는 정답 범위가 아니다', async (t) => {
  const { outDir, docsDir } = tempDirs(t);
  const raw = structuredClone(INPUT);
  raw.questions[1].goldQuotes = ['발행본에 없는 글귀'];
  const { input, deps } = synthetic(raw);
  await assert.rejects(runRagEval({ mode: 'synthetic', input, deps, outDir, docsDir, clock: CLOCK }),
    (error) => error instanceof GoldQuoteNotFound && error.questionNo === 2 && !error.message.includes('없는 글귀'));
  assert.equal(existsSync(outDir), false);
  raw.questions[1].goldQuotes = ['SYNTHETIC-AIDRAFT'];
  assert.throws(() => findGoldLocations(raw.snapshot, raw.questions), (error) => error.questionNo === 2);
  raw.questions[1].goldQuotes = [];
  assert.throws(() => findGoldLocations(raw.snapshot, raw.questions), GoldQuoteNotFound);
});

test('답 0개(NO_ITEMS) 질문은 그 질문 번호로 「답 실패」를 남기고 다음 질문으로 가며, 다른 생성 실패는 질문 번호를 알리고 멈춘다(새 Catch NC3 Build and Test)', async (t) => {
  const { outDir, docsDir } = tempDirs(t);
  const logs = t.mock.method(console, 'error', () => {});
  const { input, deps } = synthetic();
  const generate = deps.gate.generate.bind(deps.gate);
  let qnaCalls = 0;
  deps.gate.generate = async (request) => {
    if (request.feature === 'QNA' && ++qnaCalls === 2) throw new AiProviderError('NO_ITEMS');
    return generate(request);
  };
  const result = await runRagEval({ mode: 'synthetic', input, deps, outDir, docsDir, clock: CLOCK });
  assert.deepEqual(result.summary.answerFailedQuestions, [2]);
  const raw = JSON.parse(readFileSync(result.rawPath, 'utf8'));
  assert.deepEqual(raw.questions.map((question) => question.answerFailed), [null, 'NO_ITEMS', null], '3번 질문까지 돌았다');
  assert.deepEqual(raw.questions[1].items, []);
  assert.match(readFileSync(result.recordPath, 'utf8'), /- 답 실패 질문\(답 0개, NO_ITEMS\): 2번\n/);
  assert.deepEqual(logs.mock.calls.map((call) => call.arguments[0]), ['2번 질문: 답 실패(NO_ITEMS)']);

  qnaCalls = 0;
  deps.gate.generate = async (request) => {
    if (request.feature === 'QNA' && ++qnaCalls === 3) throw new AiProviderError('CALL_FAILED');
    return generate(request);
  };
  await assert.rejects(runRagEval({ mode: 'synthetic', input, deps, outDir: join(outDir, 'second'), docsDir, clock: CLOCK }),
    (error) => error instanceof AiProviderError && error.reason === 'CALL_FAILED');
  assert.equal(logs.mock.calls.at(-1).arguments[0], '3번 질문에서 멈춤: AiProviderError');
  assert.equal(existsSync(join(outDir, 'second')), false, '멈추면 파일을 쓰지 않는다');
});

// #559 설계 결정 9·FR5.4(계획 S17) — 평가 스크립트가 질문마다 게이트 로그의 수 칸을 받는다. 실제 게이트(CheckedAiGenerationGate)에 기록한 응답을
// 시험용 fetch로 넘기고(실제 Claude를 부르지 않는다), JD 쪽은 합성 게이트 그대로다.
// 기대: 원문 결과와 기록에 질문별 dropReasons·nonItemLineCount·stopReason·failure가 수와 이름으로 남고 글은 없다. 실패: 칸이 빠지거나 다른 질문의 값이 묶임.
test('S17 질문마다 게이트 로그의 수 칸을 원문 결과와 기록에 남기고(항목 0개 실패 질문 포함), 글은 없으며 다른 질문의 값이 섞이지 않는다', async (t) => {
  const { outDir, docsDir } = tempDirs(t);
  t.mock.method(console, 'error', () => {});
  const original = [];
  const originalLogger = Object.fromEntries(['log', 'warn', 'error', 'debug', 'verbose', 'fatal'].map((level) => [level, (...args) => original.push(args)]));
  Logger.overrideLogger(originalLogger);
  t.after(() => Logger.overrideLogger(false));
  const recorder = recordingFetch([
    jsonResponse(messageBody([fragment('합성비밀 앞말 줄\n- 합성비밀 해석 항목\n- 합성비밀 3개를 고쳤다')])),
    jsonResponse(messageBody([fragment('- 합성비밀 위치 없는 항목', [blockCitation(0, 0, 99)])])),
    jsonResponse(messageBody([fragment('- 합성비밀 해석 항목\n- 합성비밀 끝나지 않')], 'max_tokens')),
  ]);
  const gate = createCheckedAiGenerationGate({ apiKey: FAKE_KEY, fetch: recorder.fetch });
  const { input, deps } = synthetic();
  const syntheticGate = deps.gate;
  deps.gate = { generate: (request) => (request.feature === 'QNA' ? gate.generate(request) : syntheticGate.generate(request)) };

  const result = await runRagEval({ mode: 'synthetic', input, deps, outDir, docsDir, clock: CLOCK });
  assert.equal(recorder.requests.length, 3);
  const expected = [
    { event: 'ai_gate_result', itemCount: 1, droppedCount: 1, dropReasons: { fact: 1, location: 0, truncated: 0 }, nonItemLineCount: 1,
      stopReason: 'end_turn', failure: null },
    { event: 'ai_gate_failed', itemCount: 0, droppedCount: 1, dropReasons: { fact: 0, location: 1, truncated: 0 }, nonItemLineCount: 0,
      stopReason: 'end_turn', failure: 'NO_ITEMS' },
    { event: 'ai_gate_result', itemCount: 1, droppedCount: 1, dropReasons: { fact: 0, location: 0, truncated: 1 }, nonItemLineCount: 0,
      stopReason: 'max_tokens', failure: null },
  ];
  const raw = JSON.parse(readFileSync(result.rawPath, 'utf8'));
  assert.deepEqual(raw.questions.map((question) => question.gateLog), expected);
  assert.deepEqual(raw.questions.map((question) => question.answerFailed), [null, 'NO_ITEMS', null]);
  assert.deepEqual(result.summary.gateLogs, expected.map((gateLog, index) => ({ questionNo: index + 1, gateLog })));
  const record = readFileSync(result.recordPath, 'utf8');
  assert.match(record, /- 게이트 로그를 받은 질문: 3\/3\n/);
  assert.match(record, /\| 1 \| ai_gate_result \| 1 \| 1 \| 1 \| 0 \| 0 \| 1 \| end_turn \| - \|\n/);
  assert.match(record, /\| 2 \| ai_gate_failed \| 0 \| 1 \| 0 \| 1 \| 0 \| 0 \| end_turn \| NO_ITEMS \|\n/);
  assert.match(record, /\| 3 \| ai_gate_result \| 1 \| 1 \| 0 \| 0 \| 1 \| 0 \| max_tokens \| - \|\n/);
  assert.ok(!record.includes('합성비밀'), '기록에 답 글이 없다');
  assert.ok(!JSON.stringify(raw.questions.map((question) => question.gateLog)).includes('합성비밀'), '원문 결과의 로그 칸에도 글이 없다');
  // 받은 로그는 원래 로거로 그대로 넘기고(콘솔 출력은 지금과 같다), 실행이 끝나면 원래 로거로 되돌린다.
  assert.equal(original.filter(([entry]) => entry?.event === 'ai_gate_result' || entry?.event === 'ai_gate_failed').length, 3);
  assert.equal(Logger.staticInstanceRef, originalLogger);

  // 로그를 내지 않는 합성 게이트만 쓰면 질문마다 「로그 없음」이다.
  const plain = synthetic();
  const plainResult = await runRagEval({ mode: 'synthetic', input: plain.input, deps: plain.deps, outDir: join(outDir, 'plain'), docsDir, clock: CLOCK });
  assert.deepEqual(plainResult.summary.gateLogs.map((entry) => entry.gateLog), [null, null, null]);
  const plainRecord = readFileSync(plainResult.recordPath, 'utf8');
  assert.match(plainRecord, /- 게이트 로그를 받은 질문: 0\/3\n/);
  assert.match(plainRecord, /\| 1 \| 로그 없음 \| - \| - \| - \| - \| - \| - \| - \| - \|\n/);
});

test('S17 게이트 로그 받기는 수와 이름 칸만 꺼내고 글이 든 칸·모양이 다른 값은 버리며, 질문 사이 로그는 take()로 비운다', (t) => {
  t.after(() => Logger.overrideLogger(false));
  Logger.overrideLogger(false);
  const capture = captureGateLogs();
  const gateLogger = new Logger('AiGenerationGate');
  gateLogger.log({ event: 'ai_gate_result', itemCount: 2, droppedCount: 0, dropReasons: { fact: 0, location: 0, truncated: 0 },
    nonItemLineCount: 0, stopReason: 'end_turn' });
  assert.equal(capture.take().itemCount, 2);
  assert.equal(capture.take(), null, '한 번 꺼낸 로그는 다음 질문에 묶이지 않는다');
  gateLogger.log({ event: 'other_event', itemCount: 9 });
  assert.equal(capture.take(), null, '게이트 로그가 아닌 줄은 받지 않는다');
  gateLogger.warn({ event: 'ai_gate_failed', failure: '비밀 글이 든 실패', stopReason: 'Free Text 비밀', itemCount: -1, droppedCount: 1.5,
    dropReasons: { fact: '비밀' }, nonItemLineCount: 3, question: '비밀 질문', text: '비밀 답' });
  const counts = capture.take();
  assert.deepEqual(counts, { event: 'ai_gate_failed', itemCount: null, droppedCount: null, dropReasons: { fact: null, location: null, truncated: null },
    nonItemLineCount: 3, stopReason: null, failure: null });
  assert.ok(!JSON.stringify(counts).includes('비밀'));
  gateLogger.warn({ event: 'ai_gate_failed', failure: 'CALL_FAILED/API_STATUS:529', stopReason: null, itemCount: 0, droppedCount: 0,
    dropReasons: { fact: 0, location: 0, truncated: 0 }, nonItemLineCount: 0 });
  assert.equal(capture.take().failure, 'CALL_FAILED/API_STATUS:529');
  capture.restore();
  assert.equal(Logger.staticInstanceRef, undefined, '받기 전 로거(여기서는 꺼 둔 상태)로 되돌린다');
});

// #559 FR7.1~FR7.3(계획 S12) — 평가 스크립트의 질의응답 요청은 앱과 같은 buildQnaSources로 만든다.
// 기대: synthetic 모드에서 모델 요청의 근거 목록이 같은 검색 상위 8개·사본의 buildQnaSources 결과와 같고, 질문별 붙이지 못한 줄 수가
// 원문 결과·기록에 숫자로 있다. 검색 적중률은 12개로 그대로 잰다. 실패: 스크립트가 따로 요청을 만듦, 수가 빠짐.
test('S12 평가 스크립트는 앱과 같은 buildQnaSources로 질의응답 근거를 만들고, 질문별 붙이지 못한 줄 수를 숫자로 남긴다(FR7.1~FR7.3)', async (t) => {
  const { outDir, docsDir } = tempDirs(t);
  const { input, deps } = synthetic();
  const qnaRequests = [];
  const searches = [];
  const search = deps.search.search.bind(deps.search);
  deps.search.search = async (publicationId, query, limit) => {
    const result = await search(publicationId, query, limit);
    searches.push({ query, limit, hits: result.hits });
    return result;
  };
  const generate = deps.gate.generate.bind(deps.gate);
  deps.gate.generate = async (request) => {
    if (request.feature === 'QNA') qnaRequests.push(request);
    return generate(request);
  };
  const result = await runRagEval({ mode: 'synthetic', input, deps, outDir, docsDir, clock: CLOCK });
  const questionSearches = searches.filter((entry) => input.questions.some((question) => question.question === entry.query));
  assert.deepEqual(questionSearches.map((entry) => entry.limit), [12, 12, 12], '적중률용 검색은 12개 그대로다');
  assert.equal(qnaRequests.length, 3);
  const expected = questionSearches.map((entry) => buildQnaSources(entry.hits.slice(0, 8), input.snapshot));
  qnaRequests.forEach((request, index) => {
    assert.deepEqual(request.sources, expected[index].sources, `${index + 1}번 질문의 근거가 앱 함수 결과와 같다`);
    assert.equal(request.instruction, QNA_INSTRUCTION);
  });
  assert.ok(qnaRequests[0].sources.some((source) => source.itemContext !== undefined), '머리글이 붙은 요청을 잰다');
  assert.ok(qnaRequests[0].sources.length > 0);
  const counts = expected.map((entry) => entry.unattachedLineCount);
  const raw = JSON.parse(readFileSync(result.rawPath, 'utf8'));
  assert.deepEqual(raw.questions.map((question) => question.unattachedLineCount), counts);
  assert.deepEqual(result.summary.unattachedLines, counts.map((unattachedLineCount, index) => ({ questionNo: index + 1, unattachedLineCount })));
  const record = readFileSync(result.recordPath, 'utf8');
  assert.match(record, /## 질문별 붙이지 못한 같은 Catch 기록 줄 수\n\n\| 질문 \| 붙이지 못한 줄 \|\n\|---\|---\|\n\| 1 \| \d+ \|\n\| 2 \| \d+ \|\n\| 3 \| \d+ \|\n/);
});

// #653: 평가 스크립트도 앱처럼 게이트를 지난 질의응답 항목 글의 보낸 표 글자를 화면의 종류 표시로 바꿔 원문 결과에 남긴다.
// 실패 조건: 원문 결과에 「X」가 남음(받은 사람이 보는 글과 다름), 통과·버린 수가 바뀜.
test('#653 평가 스크립트는 질의응답 답 항목의 보낸 표 글자를 앱과 같은 replaceItemTags로 바꿔 원문 결과에 남기고, 항목 수·버린 수는 그대로다', async (t) => {
  const { outDir, docsDir } = tempDirs(t);
  const { input, deps } = synthetic();
  const generate = deps.gate.generate.bind(deps.gate);
  const sent = []; // 질문마다 { tag, items, dropped }: 게이트가 돌려준(바꾸기 전) 항목 수와 버린 수
  deps.gate.generate = async (request) => {
    const output = await generate(request);
    if (request.feature !== 'QNA') return output;
    const header = request.sources.map((source) => source.itemContext ?? '').find((context) => /「.」/.test(context));
    const tag = header === undefined ? null : /「(.)」/.exec(header)[1];
    const items = tag === null ? output.items
      : [{ kind: 'AI_INTERPRETATION', text: `「${tag}」 자료를 보면 알 수 있다`, citations: [], jdRole: null }, ...output.items];
    sent.push({ tag, items: items.length, dropped: output.droppedCount });
    return { ...output, items };
  };
  const result = await runRagEval({ mode: 'synthetic', input, deps, outDir, docsDir, clock: CLOCK });
  // 내장 합성 발행본은 Catch 다음에 텍스트 자료 하나라, 세 질문 모두 보낸 표 글자가 텍스트 자료의 「나」 하나다.
  assert.deepEqual(sent.map((entry) => entry.tag), ['나', '나', '나']);
  const raw = JSON.parse(readFileSync(result.rawPath, 'utf8'));
  raw.questions.forEach((question, index) => {
    assert.equal(question.items[0].text, '텍스트 자료를 보면 알 수 있다', `${index + 1}번 질문의 표 글자가 화면의 종류 표시로 바뀐다`);
    assert.ok(!question.items.some((item) => item.text.includes('「나」')), `${index + 1}번 질문의 원문 결과에 표 글자가 없다`);
    assert.equal(question.items.length, sent[index].items, `${index + 1}번 질문의 항목을 버리거나 더하지 않는다`);
  });
  assert.equal(result.summary.passedItems, sent.reduce((sum, entry) => sum + entry.items, 0), '통과 수는 게이트가 돌려준 항목 수 그대로다');
  assert.equal(result.summary.droppedItems, sent.reduce((sum, entry) => sum + entry.dropped, 0), '버린 수는 게이트 값 그대로다');
});

test('S12 붙이지 못한 줄 수 표는 숫자만 쓰고, 모델을 부르지 않은 질문(null)·모양이 다른 값은 「-」다', () => {
  const summary = { date: '2026-12-01', targetVersion: 'x', mode: 'measure', questionCount: 3, hitRateAt5: null, hitRateAt8: null, hitRateAt12: null,
    passedItems: 0, droppedItems: 0, evidencePassRate: null, answerFailedQuestions: [], missedHitLocations: [], jd: null,
    unattachedLines: [{ questionNo: 1, unattachedLineCount: 7 }, { questionNo: 2, unattachedLineCount: null }, { questionNo: 3, unattachedLineCount: '비밀' }] };
  const record = buildRepositoryRecord(summary);
  assert.match(record, /\| 1 \| 7 \|\n\| 2 \| - \|\n\| 3 \| - \|\n/);
  assert.ok(!record.includes('비밀'));
});

test('정답 위치는 글귀가 나오는 모든 곳이고, 적중은 같은 항목·fieldPath에서 범위가 겹칠 때다. 적중률 5·8·12를 따로 센다(BR10.3)', () => {
  const [, , third] = findGoldLocations(INPUT.snapshot, INPUT.questions);
  assert.deepEqual(third.map((l) => [l.fieldPath, l.charStart, l.charEnd]), [['body', 24, 31], ['body', 40, 47]]);
  const gold = [{ publishedItemId: 'a', fieldPath: 'body', charStart: 10, charEnd: 20 }];
  const miss = { publishedItemId: 'a', fieldPath: 'body', charStart: 20, charEnd: 30 };
  const otherField = { publishedItemId: 'a', fieldPath: 'workFacts[0]', charStart: 10, charEnd: 20 };
  const hit = { publishedItemId: 'a', fieldPath: 'body', charStart: 19, charEnd: 25 };
  const hitsAt = (position) => Array.from({ length: 12 }, (_, i) => (i === position ? hit : miss));
  assert.equal(isHitAt([otherField, miss], gold, 12), false);
  const perQuestion = [
    { hits: hitsAt(0), goldLocations: gold }, { hits: hitsAt(6), goldLocations: gold },
    { hits: hitsAt(10), goldLocations: gold }, { hits: hitsAt(99), goldLocations: gold },
  ];
  assert.deepEqual([hitRate(perQuestion, 5), hitRate(perQuestion, 8), hitRate(perQuestion, 12)], [0.25, 0.5, 0.75]);
  assert.equal(hitRate([], 8), null);
  assert.equal(evidencePassRate(9, 1), 0.9);
  assert.equal(evidencePassRate(0, 0), null);
});

test('JD 두 방식: 빈 줄을 뺀 줄마다 검색 기반과 전체 넣기를 부르고, 전체 넣기가 80,000자를 넘으면 INPUT_TOO_LARGE로 적는다(BR10.7)', async (t) => {
  const { outDir, docsDir } = tempDirs(t);
  assert.deepEqual(splitJdRequirements(' 첫 줄 \r\n\r\n둘째 줄\n'), ['첫 줄', '둘째 줄']);
  const raw = structuredClone(INPUT);
  raw.snapshot.items[1].snapshot.body += `\n\n${'긴 자료 문단이다. '.repeat(9000)}`;
  const { input, deps } = synthetic(raw);
  const result = await runRagEval({ mode: 'synthetic', input, deps, outDir, docsDir, clock: CLOCK });
  assert.deepEqual(result.summary.jd.rows.map((row) => row.fullInput), ['INPUT_TOO_LARGE', 'INPUT_TOO_LARGE']);
  assert.deepEqual(result.summary.jd.rows[0].searchBased, { items: 3, dropped: 0 });
  assert.match(readFileSync(result.recordPath, 'utf8'), /\| 1 \| 3 \| 0 \| INPUT_TOO_LARGE \| - \|/);
  const noJd = parseInput({ ...structuredClone(INPUT), jd: '  ' }, 'synthetic');
  assert.equal(noJd.jd, null);
});

test('measure 기록 쓰기는 docs 폴더에 날짜 이름으로 건수·위치·빈 판정 칸만 쓰고, 원문은 로컬 결과에만 쓴다(BR10.5)', (t) => {
  const { outDir, docsDir } = tempDirs(t);
  const summary = { date: '2026-12-01', targetVersion: 'abc1234', mode: 'measure', questionCount: 10, hitRateAt5: 0.6, hitRateAt8: 0.8,
    hitRateAt12: 0.9, passedItems: 18, droppedItems: 2, evidencePassRate: 0.9, answerFailedQuestions: [],
    missedHitLocations: [{ questionNo: 4, locations: [{ publishedItemId: 'item-1', fieldPath: 'body', charStart: 0, charEnd: 120 }] }],
    jd: { splitter: 'U10', rows: [{ requirementNo: 1, searchBased: { items: 3, dropped: 1 }, fullInput: { items: 4, dropped: 0 } }] } };
  const raw = { questions: [{ question: 'SYNTHETIC-QUESTION 원문', items: [{ text: 'SYNTHETIC-ANSWER 원문' }] }] };
  const { rawPath, recordPath } = writeEvaluation({ mode: 'measure', outDir, docsDir, summary, raw });
  assert.equal(recordPath, join(docsDir, '2026-12-01.md'));
  assert.equal(rawPath, join(outDir, '2026-12-01-measure.json'));
  const record = readFileSync(recordPath, 'utf8');
  assert.match(record, /모드: MEASUREMENT\n/);
  assert.match(record, /\| 60\.0% \| 80\.0% \| 90\.0% \|/);
  assert.match(record, /4번 질문\n {2}- item-1 body \[0, 120\)/);
  assert.match(record, /- 요구사항 나누기: U10 \/ 지시문: U10 운영 상수\n/);
  assert.match(buildRepositoryRecord({ ...summary, jd: { ...summary.jd, splitter: 'SCRIPT' } }), /- 요구사항 나누기: 스크립트 \/ 지시문: U10 운영 상수\n/);
  assert.match(record, /- 남의 기여 오귀속 건수: \n/);
  assert.ok(!record.includes('SYNTHETIC-'), '저장소 기록에 질문·답 원문이 없다');
  assert.match(readFileSync(rawPath, 'utf8'), /SYNTHETIC-ANSWER/);
  assert.match(buildRepositoryRecord({ ...summary, jd: null, missedHitLocations: [], evidencePassRate: null }), /JD 없음[\s\S]*- 없음|- 없음[\s\S]*JD 없음/);
});

test('입력·인자 검사: measure는 질문 10개·--input·두 키·테스트가 아닌 DB·U4 PublicationAccess가 있어야 돈다(NFR3.1)', async () => {
  assert.throws(() => parseArgs(['other']), RagEvalInputError);
  assert.throws(() => parseArgs(['measure']), /--input/);
  assert.throws(() => parseArgs(['synthetic', '--unknown', 'x']), RagEvalInputError);
  assert.deepEqual(parseArgs(['synthetic', '--out', 'x']), { mode: 'synthetic', out: 'x' });
  const MEMBER = '33333333-3333-4333-8333-333333333333';
  assert.throws(() => parseInput(structuredClone(INPUT), 'measure'), /memberId/);
  assert.throws(() => parseInput({ ...structuredClone(INPUT), memberId: 'x' }, 'measure'), /memberId/);
  assert.throws(() => parseInput({ ...structuredClone(INPUT), memberId: MEMBER }, 'measure'), /10개/);
  assert.equal(parseInput(sampleInput(), 'synthetic').memberId, null);
  assert.throws(() => parseInput({ ...structuredClone(INPUT), publicationId: 'x' }, 'synthetic'), /uuid/);
  assert.throws(() => parseInput({ ...structuredClone(INPUT), questions: [{ question: ' ' }] }, 'synthetic'), /1번 질문/);
  assert.throws(() => parseInput([], 'synthetic'), RagEvalInputError);
  assert.equal(parseInput(sampleInput(), 'synthetic').questions.length, 3);
  const env = { CATCHU_GENERATION_API_KEY: 'k', CATCHU_EMBEDDING_API_KEY: 'k', DB_HOST: 'h', DB_PORT: '5432', DB_USER: 'u', DB_PASSWORD: 'p' };
  await assert.rejects(createMeasureDeps({ env: { ...env, CATCHU_GENERATION_API_KEY: ' ' }, publicationAccess: () => ({}) }), /GENERATION/);
  await assert.rejects(createMeasureDeps({ env: { ...env, CATCHU_EMBEDDING_API_KEY: '' }, publicationAccess: () => ({}) }), /EMBEDDING/);
  await assert.rejects(createMeasureDeps({ env: { ...env, DB_NAME: 'catchu_test' }, publicationAccess: () => ({}) }), /테스트 DB/);
  await assert.rejects(createMeasureDeps({ env: { ...env, DB_NAME: 'catchu' }, publicationAccess: null, memberId: MEMBER }), /PublicationAccess/);
  await assert.rejects(createMeasureDeps({ env: { ...env, DB_NAME: 'catchu' }, publicationAccess: () => ({}) }), /memberId/);
});

test('measure의 사본 읽기는 U4 DB 구현으로 읽기 전용 트랜잭션에서 published_item을 순서대로 읽고, 없는 발행본은 빈 사본 없이 실패한다(BR10.1, C-10)', async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const calls = [];
  // 발행 프리셋 U1: 사본 읽기는 source_id·프리셋 칸 둘도 읽고, source_id는 사본에 싣지 않으며 isFirstCopy를 정해 싣는다.
  const row = { publishedItemId: '22222222-2222-4222-8222-222222222222', position: 1, itemKind: 'TEXT_MATERIAL', title: '머리글', snapshot: { body: '본문' },
    presetOrdinal: 1, presetName: '합성 프리셋' };
  const item = { ...row, sourceId: '55555555-5555-4555-8555-555555555555' };
  const dataSource = (publicationRows) => ({
    async transaction(isolation, run) {
      calls.push(isolation);
      return run({
        async query(sql, params) {
          calls.push(sql.replace(/\s+/g, ' ').trim().slice(0, 40));
          if (/^SET TRANSACTION READ ONLY/.test(sql)) return [];
          assert.deepEqual(params, [id]);
          if (/FROM publication WHERE/.test(sql)) return publicationRows;
          if (/FROM published_item WHERE/.test(sql)) return [item];
          throw new Error(`예상 밖 질의: ${sql}`);
        },
      });
    },
  });
  const snapshot = await dbPublicationAccess(dataSource([{ title: '시연', publishedAt: '2026-11-09T00:00:00Z', expiresAt: '2027-02-07T00:00:00Z' }]))
    .readSnapshot(id);
  assert.equal(snapshot.title, '시연');
  assert.deepEqual(snapshot.items, [{ ...row, pdfPages: null, isFirstCopy: true }]);
  assert.equal(calls[0], 'REPEATABLE READ');
  assert.equal(calls[1], 'SET TRANSACTION READ ONLY');
  await assert.rejects(dbPublicationAccess(dataSource([])).readSnapshot(id), (error) => error.name === 'NotFound');
});

test('measure는 실행자 본인의 발행본일 때만 사본을 읽고, 남의 것·없는 것이면 외부 호출 전에 멈춘다(#493 리뷰)', async () => {
  const MEMBER = '33333333-3333-4333-8333-333333333333';
  const OWN = '11111111-1111-4111-8111-111111111111';
  const OTHER = '44444444-4444-4444-8444-444444444444';
  const calls = [];
  class NotFound extends Error { constructor() { super('publication not found'); this.name = 'NotFound'; } }
  const access = {
    async resolveForOwner(memberId, publicationId) {
      calls.push(['owner', memberId, publicationId]);
      if (memberId !== MEMBER || publicationId !== OWN) throw new NotFound();
      return { publicationId, state: 'ACTIVE' };
    },
    async readSnapshot(publicationId) { calls.push(['snapshot', publicationId]); return { title: '시연', items: [] }; },
  };
  const read = ownedSnapshotReader(access, MEMBER);
  assert.deepEqual(await read(OWN), { title: '시연', items: [] });
  assert.deepEqual(calls, [['owner', MEMBER, OWN], ['snapshot', OWN]]);

  calls.length = 0;
  await assert.rejects(read(OTHER), (error) => error instanceof RagEvalInputError && /외부 호출 없이 멈춥니다/.test(error.message));
  assert.deepEqual(calls, [['owner', MEMBER, OTHER]], '주인이 아니면 사본을 읽지 않는다');

  // 실행 전체에서도 사본 읽기에서 멈추면 검색·생성(외부 호출)을 부르지 않는다.
  let external = 0;
  const deps = { readSnapshot: read, search: { async search() { external += 1; return { hits: [], publicationText: '' }; } },
    gate: { async generate() { external += 1; return { items: [], droppedCount: 0 }; } }, async readAllChunks() { external += 1; return []; } };
  const input = { ...parseInput({ ...structuredClone(INPUT), publicationId: OTHER }, 'synthetic'), memberId: MEMBER };
  await assert.rejects(runRagEval({ mode: 'measure', input, deps, outDir: tmpdir(), docsDir: tmpdir(), clock: CLOCK }), RagEvalInputError);
  assert.equal(external, 0);

  // 주인 판정이 다른 이유로 실패하면 그 오류를 그대로 낸다(삼키지 않는다).
  const broken = ownedSnapshotReader({ async resolveForOwner() { throw new Error('connection lost'); }, async readSnapshot() { throw new Error('not reached'); } }, MEMBER);
  await assert.rejects(broken(OWN), /connection lost/);
});

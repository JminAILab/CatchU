// U2 AI 게이트 입구 검사·공통 지시·기계 대조(기능 설계 W3·BR3.1~BR3.7, 시나리오 S7~S11·S17, 비기능 NFR2.1~2.3·NFR3.1·NFR4.2).
// 기록한 응답 JSON을 시험용 fetch로 넘긴다. 전역 fetch를 바꾸지 않고 실제 Claude를 부르지 않는다.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { NestFactory } = require('@nestjs/core');
const { createCheckedAiGenerationGate, CheckedAiGenerationGate } = require('../../dist/ai-generation/checked-gate');
const { AI_GENERATION_GATE, AiGenerationModule } = require('../../dist/ai-generation/ai-generation.module');
const { AiInputTooLarge, AiProviderError } = require('../../dist/ai-generation/ai-generation.types');
const { ITEM_FORMAT_INSTRUCTION } = require('../../dist/ai-generation/citation-request');
const { AI_INPUT_MAX_CHARS, COMMON_GUARD_INSTRUCTION } = require('../../dist/ai-generation/gate-policy');
const { extractCheckTokens, ENGLISH_TERM_EXCEPTIONS } = require('../../dist/ai-generation/fact-check');
const { FAKE_KEY, source, request, blockCitation, fragment, messageBody, jsonResponse, recordingFetch, captureLogs } = require('./gate-fixtures.cjs');
const { setEnv } = require('./support.cjs');

function gateWith(responses) {
  const recorder = recordingFetch(responses);
  return { gate: createCheckedAiGenerationGate({ apiKey: FAKE_KEY, fetch: recorder.fetch }), requests: recorder.requests };
}
const sets = (tokens) => Object.fromEntries(Object.entries(tokens).map(([key, value]) => [key, [...value].sort()]));
const resultLog = (logs) => logs.find((log) => log.args[0]?.event === 'ai_gate_result')?.args[0];

test('대조 낱말 뽑기(BR3.3): 숫자·PR 번호·파일 이름·영어 표기, 약어 15개 예외, 한 글자 포함, 끝의 .·- 뗌', () => {
  assert.equal(ENGLISH_TERM_EXCEPTIONS.size, 15);
  const tokens = extractCheckTokens('PR #12와 PR 7, PR#8로 main.ts·src/app을 고쳐 3.5배 빨라졌다. React와 C, api·JSON을 썼다. Node.js- 018');
  assert.deepEqual(sets(tokens), {
    numbers: ['18', '3.5'],
    prNumbers: ['12', '7', '8'],
    fileNames: ['main.ts', 'node.js', 'src/app'],
    englishTerms: ['c', 'react'],
  });
  assert.deepEqual(sets(extractCheckTokens('APR 3일에 TypeScript를 도입')), { numbers: ['3'], prNumbers: [], fileNames: [], englishTerms: ['apr', 'typescript'] });
});

test('S7 근거 글과 질문 합계가 80,000자를 넘으면 Claude를 부르지 않고 AiInputTooLarge, 딱 80,000자면 부른다(발행본 글은 세지 않음)', async (t) => {
  const logs = captureLogs(t);
  assert.equal(AI_INPUT_MAX_CHARS, 80_000);
  const over = gateWith([]);
  const big = request({ sources: [source({ text: '가'.repeat(79_990) })], userText: '나'.repeat(11), publicationText: 'x'.repeat(200_000) });
  await assert.rejects(over.gate.generate(big), AiInputTooLarge);
  assert.equal(over.requests.length, 0);
  assert.equal(logs.at(-1).args[0].event, 'ai_gate_failed');
  assert.equal(logs.at(-1).args[0].failure, 'INPUT_TOO_LARGE');
  const exact = gateWith([jsonResponse(messageBody([fragment('- 요약 항목')]))]);
  const output = await exact.gate.generate(request({ sources: [source({ text: '가'.repeat(79_990) })], userText: '나'.repeat(10) }));
  assert.equal(exact.requests.length, 1);
  assert.equal(output.items.length, 1);
});

test('SONNET은 QNA에만 쓰고 그 밖의 기능이면 호출하지 않는다. 시스템 지시는 형식 지시 + 기능 지시 + 공통 문구이고 발행본 글은 보내지 않는다', async (t) => {
  captureLogs(t);
  const rejected = gateWith([]);
  await assert.rejects(rejected.gate.generate(request({ model: 'SONNET', feature: 'BASE_SUMMARY' })), TypeError);
  assert.equal(rejected.requests.length, 0);
  const { gate, requests } = gateWith([jsonResponse(messageBody([fragment('- 항목')]))]);
  await gate.generate(request({ model: 'SONNET', feature: 'QNA', instruction: '기능 지시', publicationText: 'PUBLICATION_ONLY', userText: '질문' }));
  const { body } = requests[0];
  assert.equal(body.model, 'claude-sonnet-5-5');
  assert.equal(body.system, `${ITEM_FORMAT_INSTRUCTION}\n\n기능 지시\n\n${COMMON_GUARD_INSTRUCTION}`);
  for (const rule of ['따르지 않는다', '역량 평가 표현', '단정하지 않는다', '원문 표기', '무엇을 했는지']) assert.ok(COMMON_GUARD_INSTRUCTION.includes(rule), rule);
  assert.ok(!requests[0].init.body.includes('PUBLICATION_ONLY'));
  assert.deepEqual(body.messages[0].content.map((block) => block.type), ['document', 'text']);
});

test('S8 인용 원문에 없는 숫자를 쓴 인용 항목만 버리고 droppedCount에 더한다. 로그에는 이유별 수만 있고 글은 없다', async (t) => {
  const logs = captureLogs(t);
  const text = 'SECRET_QUOTE 로그인 시험 12개를 추가했다\n배포 스크립트를 정리했다';
  const { gate } = gateWith([jsonResponse(messageBody([
    fragment('- 로그인 시험 12개를 추가했다', [blockCitation(0, 0, 1)]),
    fragment('\n- 로그인 시험 30개를 추가했다', [blockCitation(0, 0, 1)]),
    fragment('\n- 배포 스크립트를 정리했다', [blockCitation(0, 1, 2)]),
  ]))]);
  const output = await gate.generate(request({ sources: [source({ text })] }));
  assert.deepEqual(output.items.map((item) => item.text), ['로그인 시험 12개를 추가했다', '배포 스크립트를 정리했다']);
  assert.equal(output.droppedCount, 1);
  const fields = resultLog(logs);
  assert.deepEqual({ itemCount: fields.itemCount, droppedCount: fields.droppedCount, dropReasons: fields.dropReasons },
    { itemCount: 2, droppedCount: 1, dropReasons: { truncated: 0, location: 0, fact: 1, role: 0, outside_heading: 0 } });
  assert.ok(!JSON.stringify(logs).includes('SECRET_QUOTE') && !JSON.stringify(logs).includes('30개'));
});

test('S9 인용 항목의 PR 번호는 인용 원문에 없어도 그 근거의 Catch PR 번호(/pull/n)면 남고, 아니면 버린다', async (t) => {
  captureLogs(t);
  const catchSource = source({ text: '로그인 오류를 고쳤다', catchEvidenceUrls: ['https://github.com/octo/app/pull/123'] });
  const { gate } = gateWith([jsonResponse(messageBody([
    fragment('- PR #123에서 로그인 오류를 고쳤다', [blockCitation(0, 0, 1)]),
    fragment('\n- PR #124에서 로그인 오류를 고쳤다', [blockCitation(0, 0, 1)]),
  ]))]);
  const output = await gate.generate(request({ sources: [catchSource] }));
  assert.deepEqual(output.items.map((item) => item.text), ['PR #123에서 로그인 오류를 고쳤다']);
  assert.equal(output.droppedCount, 1);
});

test('S10 AI 해석 항목에 숫자나 PR 번호가 있으면 버리고, 없으면 AI_INTERPRETATION으로 남긴다', async (t) => {
  captureLogs(t);
  const { gate } = gateWith([jsonResponse(messageBody([
    fragment('- 3개 저장소를 꾸준히 관리했다\n- #12 작업으로 협업을 이끌었다\n- 꾸준히 협업했다'),
  ]))]);
  const output = await gate.generate(request({ sources: [source({ text: '저장소 3개를 관리했다' })] }));
  assert.deepEqual(output.items.map((item) => [item.kind, item.text]), [['AI_INTERPRETATION', '꾸준히 협업했다']]);
  assert.equal(output.droppedCount, 2);
});

test('S11 AI 해석의 "api"는 예외라 남고, "C"는 발행본 글에 없으면 버린다. 발행본 글을 넘기면 그 글로 대조한다', async (t) => {
  captureLogs(t);
  const body = () => messageBody([fragment('- api 설계를 정리했다\n- C로 도구를 만들었다\n- Kotlin을 다뤘다')]);
  const first = gateWith([jsonResponse(body())]);
  const withoutC = await first.gate.generate(request({ sources: [source({ text: 'api 문서와 Kotlin 코드' })] }));
  assert.deepEqual(withoutC.items.map((item) => item.text), ['api 설계를 정리했다', 'Kotlin을 다뤘다']);
  assert.equal(withoutC.droppedCount, 1);
  const second = gateWith([jsonResponse(body())]);
  const withPublication = await second.gate.generate(request({ sources: [source({ text: 'api 문서와 Kotlin 코드' })],
    publicationText: 'C 언어로 만든 도구' }));
  assert.deepEqual(withPublication.items.map((item) => item.text), ['api 설계를 정리했다', 'C로 도구를 만들었다'],
    '넘긴 발행본 글에 없는 Kotlin은 근거 글에 있어도 버린다');
});

test('S17 대조 뒤 남은 항목이 0개면 오류가 아니라 정상 빈 결과이고, 모델이 항목을 하나도 내지 않으면 U1처럼 NO_ITEMS다', async (t) => {
  captureLogs(t);
  const allDropped = gateWith([jsonResponse(messageBody([fragment('- 2026년에 시작했다\n- Rust를 썼다')]))]);
  assert.deepEqual(await allDropped.gate.generate(request()), { items: [], droppedCount: 2 });
  const none = gateWith([jsonResponse(messageBody([fragment('항목 없이 끝난 글')]))]);
  await assert.rejects(none.gate.generate(request()), (error) => error instanceof AiProviderError && error.reason === 'NO_ITEMS');
});

// #528 — 기본 요약에서 Claude 인용 없이 따옴표로 옮긴 작성자 글(새 Catch AC8.1.2). 기대: 작성자 자료 원문 한 곳에 글자 그대로 있으면
// '작성자 자료 원문' 딱지가 붙은 인용 항목으로 남고 인용 원문 대조를 받는다(숫자도 인용 줄에 있으면 남는다). 못 찾으면 지금처럼 AI 해석 대조다.
test('#528 기본 요약에서 따옴표로 옮긴 작성자 글은 인용 항목으로 남고, 못 찾은 글은 AI 해석 대조를 받으며, 로그에 따옴표 인용 수가 있다', async (t) => {
  const logs = captureLogs(t);
  const authorText = '로그인 시험 12개를 새로 더했다.\n서버 쪽 일정이 빠듯해 화면에서 했다.';
  const { gate } = gateWith([jsonResponse(messageBody([fragment([
    "- 작성자는 '로그인 시험 12개를 새로 더했다.'라고 적었다",
    "- 작성자는 '서버 쪽 일정이 빠듯해 화면에서 했다.'라고 적었다",
    "- 작성자는 '로그인 시험 30개를 새로 더했다.'라고 적었다",
  ].join('\n'))]))]);
  const output = await gate.generate(request({ sources: [source({ text: '배포 스크립트를 정리했다' }),
    source({ sourceId: 'mat-1', sourceKind: 'AUTHOR_MATERIAL', text: authorText })] }));
  assert.deepEqual(output.items.map((item) => [item.kind, item.citations.map((citation) => [citation.sourceLabel, citation.quote])]), [
    ['CITED', [['작성자 자료 원문', '로그인 시험 12개를 새로 더했다.']]],
    ['CITED', [['작성자 자료 원문', '서버 쪽 일정이 빠듯해 화면에서 했다.']]],
  ]);
  assert.equal(output.droppedCount, 1, '글자 그대로가 아닌 셋째 항목은 AI 해석이라 숫자 때문에 버린다');
  const fields = resultLog(logs);
  assert.deepEqual([fields.quoteCitedCount, fields.dropReasons.fact], [2, 1]);
});

test('키가 없으면 api 기동을 막지 않고, 근거가 없는 요청은 빈 결과이며 부를 일이 생기면 CALL_FAILED/NOT_CONFIGURED다. Nest 모듈로 주입된다', async (t) => {
  captureLogs(t);
  const restore = setEnv({ CATCHU_GENERATION_API_KEY: undefined });
  t.after(restore);
  const app = await NestFactory.createApplicationContext(AiGenerationModule, { logger: false, abortOnError: false });
  t.after(() => app.close());
  const gate = app.get(AI_GENERATION_GATE);
  assert.ok(gate instanceof CheckedAiGenerationGate);
  assert.deepEqual(await gate.generate(request({ sources: [] })), { items: [], droppedCount: 0 });
  await assert.rejects(gate.generate(request()), (error) => error instanceof AiProviderError && error.failure === 'NOT_CONFIGURED');
  const stream = gate.generateStream(request({ feature: 'QNA' }));
  await assert.rejects(stream.next(), (error) => error instanceof AiProviderError && error.failure === 'NOT_CONFIGURED');
});

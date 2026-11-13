// U2 generateStream(기능 설계 W4·BR3.8, 시나리오 S18, 비기능 NFR4.5). 기록한 SSE 응답을 시험용 fetch로 넘긴다.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createCheckedAiGenerationGate } = require('../../dist/ai-generation/checked-gate');
const { AiInputTooLarge, AiProviderError } = require('../../dist/ai-generation/ai-generation.types');
const {
  FAKE_KEY, source, request, blockCitation, jsonResponse, recordingFetch, captureLogs, messageEvents, sseResponse, controlledSseResponse,
} = require('./gate-fixtures.cjs');

const SOURCE_TEXT = '로그인 시험 12개를 추가했다\n배포 스크립트를 정리했다';
const qna = (overrides = {}) => request({ feature: 'QNA', userText: '무엇을 했나요?', sources: [source({ text: SOURCE_TEXT })], ...overrides });

function gateWith(responses) {
  const recorder = recordingFetch(responses);
  return { gate: createCheckedAiGenerationGate({ apiKey: FAKE_KEY, fetch: recorder.fetch }), requests: recorder.requests };
}
async function collect(iterable) {
  const items = [];
  for await (const item of iterable) items.push(item);
  return items;
}

test('스트림은 항목마다 대조를 통과한 것만 순서대로 내보내고, 인용은 원문 위치로 연결된다', async (t) => {
  const logs = captureLogs(t);
  const { gate, requests } = gateWith([sseResponse(messageEvents([
    ['- 로그인 시험 12개를 추가했다', [blockCitation(0, 0, 1)]],
    ['\n- 로그인 시험 40개를 추가했다', [blockCitation(0, 0, 1)]],
    ['\n- 배포 스크립트를 정리했다', [blockCitation(0, 1, 2)]],
    ['\n- 꾸준히 협업했다\n', []],
  ]))]);
  const items = await collect(gate.generateStream(qna()));
  assert.equal(requests[0].body.stream, true);
  assert.deepEqual(items.map((item) => [item.kind, item.text]), [
    ['CITED', '로그인 시험 12개를 추가했다'], ['CITED', '배포 스크립트를 정리했다'], ['AI_INTERPRETATION', '꾸준히 협업했다']]);
  assert.equal(items[1].citations[0].quote, '배포 스크립트를 정리했다');
  assert.equal(items[1].citations[0].location.charStart, 100 + SOURCE_TEXT.indexOf('배포'));
  const result = logs.find((log) => log.args[0]?.event === 'ai_gate_result').args[0];
  assert.deepEqual([result.mode, result.itemCount, result.droppedCount, result.dropReasons.fact, result.stopReason, result.requestId],
    ['STREAM', 3, 1, 1, 'end_turn', 'req_stream_0001']);
});

test('항목 줄이 끝나면 응답이 끝나기 전에 그 항목을 내보낸다', async (t) => {
  captureLogs(t);
  const controlled = controlledSseResponse();
  const { gate } = gateWith([controlled.response]);
  const events = messageEvents([['- 배포 스크립트를 정리했다', [blockCitation(0, 1, 2)]], ['\n- 꾸준히 협업했다', []]]);
  const iterator = gate.generateStream(qna())[Symbol.asyncIterator]();
  // 첫 블록과 둘째 블록 시작(줄바꿈)까지만 보낸다. 둘째 블록이 끝나야 첫 줄이 끝난 것이 확정된다.
  const secondBlockStop = events.findIndex((event, index) => event.type === 'content_block_stop' && index > 5);
  for (const event of events.slice(0, secondBlockStop + 1)) controlled.push(event);
  const first = await iterator.next();
  assert.deepEqual([first.done, first.value.text], [false, '배포 스크립트를 정리했다']);
  for (const event of events.slice(secondBlockStop + 1)) controlled.push(event);
  controlled.close();
  const second = await iterator.next();
  assert.equal(second.value.text, '꾸준히 협업했다');
  assert.equal((await iterator.next()).done, true);
});

test('S18 출력 상한에서 잘리면 끝난 항목만 나가고 끝나지 않은 마지막 항목은 나가지 않는다', async (t) => {
  const logs = captureLogs(t);
  const { gate } = gateWith([sseResponse(messageEvents([
    ['- 배포 스크립트를 정리했다', [blockCitation(0, 1, 2)]],
    ['\n- 로그인 시험을 추', [blockCitation(0, 0, 1)]],
  ], 'max_tokens'))]);
  const items = await collect(gate.generateStream(qna()));
  assert.deepEqual(items.map((item) => item.text), ['배포 스크립트를 정리했다']);
  const result = logs.find((log) => log.args[0]?.event === 'ai_gate_result').args[0];
  assert.deepEqual([result.droppedCount, result.dropReasons.truncated], [1, 1]);
});

test('거절은 이미 낸 항목 뒤에 REFUSED, 항목이 하나도 없으면 NO_ITEMS, 오류 상태·스트림 중 오류 사건은 CALL_FAILED로 끝나고 다시 부르지 않는다', async (t) => {
  captureLogs(t);
  const refused = gateWith([sseResponse(messageEvents([['- 꾸준히 협업했다\n', []]], 'refusal'))]);
  const seen = [];
  await assert.rejects((async () => { for await (const item of refused.gate.generateStream(qna())) seen.push(item.text); })(),
    (error) => error instanceof AiProviderError && error.reason === 'REFUSED');
  assert.deepEqual(seen, ['꾸준히 협업했다']);
  const empty = gateWith([sseResponse(messageEvents([['항목 없는 글', []]]))]);
  await assert.rejects(collect(empty.gate.generateStream(qna())), (error) => error instanceof AiProviderError && error.reason === 'NO_ITEMS');
  const status = gateWith([jsonResponse({ type: 'error', error: { type: 'api_error', message: 'PROVIDER_ECHO' } }, { status: 529 })]);
  await assert.rejects(collect(status.gate.generateStream(qna())),
    (error) => error instanceof AiProviderError && error.failure === 'API_STATUS' && error.status === 529 && !error.message.includes('PROVIDER_ECHO'));
  assert.equal(status.requests.length, 1);
  const midError = messageEvents([['- 꾸준히 협업했다', []]]).slice(0, 3);
  midError.push({ type: 'error', error: { type: 'overloaded_error', message: 'PROVIDER_ECHO' } });
  const broken = gateWith([sseResponse(midError)]);
  await assert.rejects(collect(broken.gate.generateStream(qna())), (error) => error instanceof AiProviderError && error.reason === 'CALL_FAILED');
  assert.equal(broken.requests.length, 1);
});

// #528 — 질의응답 스트림에서 Claude 인용 없이 따옴표로 옮긴 작성자 글(새 Catch AC8.1.1, 11/12 재측정 3·8번).
// 기대: 그 항목을 '작성자 자료 원문' 딱지가 붙은 인용 항목으로 내보내고, 따옴표 없는 항목은 지금처럼 AI 해석이다.
test('#528 스트림도 따옴표로 옮긴 작성자 글에 인용을 붙여 CITED로 내보낸다', async (t) => {
  const logs = captureLogs(t);
  const authorText = '화면은 다시 만들지 않았다.\n서버 쪽 일정이 빠듯해 화면에서 했다.';
  const { gate } = gateWith([sseResponse(messageEvents([
    ["- 작성자는 '서버 쪽 일정이 빠듯해 화면에서 했다.'라고 적었다", []],
    ['\n- 꾸준히 협업했다\n', []],
  ]))]);
  const items = await collect(gate.generateStream(qna({ sources: [source({ text: SOURCE_TEXT }),
    source({ sourceId: 'mat-1', sourceKind: 'AUTHOR_MATERIAL', text: authorText })] })));
  assert.deepEqual(items.map((item) => [item.kind, item.jdRole, item.citations.map((citation) => citation.sourceLabel)]),
    [['CITED', null, ['작성자 자료 원문']], ['AI_INTERPRETATION', null, []]]);
  assert.equal(items[0].citations[0].location.charStart, 100 + authorText.indexOf('서버'));
  const result = logs.find((log) => log.args[0]?.event === 'ai_gate_result').args[0];
  assert.deepEqual([result.itemCount, result.quoteCitedCount, result.droppedCount], [2, 1, 0]);
});

test('JD_SUMMARY는 스트림으로 부르지 않고, 입력 상한을 넘으면 부르기 전에 AiInputTooLarge, 근거가 없으면 아무것도 내보내지 않는다', async (t) => {
  captureLogs(t);
  const { gate, requests } = gateWith([]);
  await assert.rejects(collect(gate.generateStream(qna({ feature: 'JD_SUMMARY' }))), TypeError);
  await assert.rejects(collect(gate.generateStream(qna({ userText: '가'.repeat(80_001) }))), AiInputTooLarge);
  assert.deepEqual(await collect(gate.generateStream(qna({ sources: [] }))), []);
  assert.equal(requests.length, 0);
});

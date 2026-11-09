// 게이트 전체: 만들기 함수에 시험용 fetch를 넘겨 기록한 HTTP 응답으로 W1을 끝까지 돌린다
// (U1 기능 설계 S2·S3·S6·S7·S9, 비기능 설계 보안·성능·신뢰성·관측 시험). 전역 fetch는 바꾸지 않는다.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createAiGenerationGate, DEFAULT_MAX_OUTPUT_TOKENS } = require('../../dist/ai-generation/ai-generation.gate');
const { AiProviderError } = require('../../dist/ai-generation/ai-generation.types');
const { ITEM_FORMAT_INSTRUCTION } = require('../../dist/ai-generation/citation-request');
const { MAX_RESPONSE_BODY_BYTES } = require('../../dist/ai-generation/guarded-fetch');
const {
  FAKE_KEY, source, request, blockCitation, fragment, messageBody, jsonResponse, recordingFetch, captureLogs,
} = require('./fixtures.cjs');

const SOURCE_TEXT = 'SECRET_SOURCE_첫 줄\r\n\r\nSECRET_SOURCE_셋째 줄';
const USER_TEXT = 'SECRET_USER_TEXT 질문';
const sensitive = [FAKE_KEY, 'SECRET_SOURCE', 'SECRET_USER_TEXT', 'PROVIDER_ECHO'];

const baseRequest = (overrides = {}) => request({ sources: [source({ text: SOURCE_TEXT })], userText: USER_TEXT, ...overrides });
const okBody = (stopReason = 'end_turn') => messageBody([
  fragment('요약입니다.\n- '), fragment('첫 줄을 확인했다', [blockCitation(0, 0, 1, 'SECRET_SOURCE_첫 줄')]),
  fragment('\n- 해석 항목\n'),
], stopReason);

function gateWith(responses, config = {}) {
  const recorder = recordingFetch(responses);
  return { gate: createAiGenerationGate({ apiKey: FAKE_KEY, fetch: recorder.fetch, ...config }), requests: recorder.requests };
}

/** 로그와 오류에 근거 글·userText·키·제공자 원문이 없는지 본다. */
function assertNoSensitive(...values) {
  const text = JSON.stringify(values, (key, value) => (value instanceof Error ? { message: value.message, ...value } : value));
  for (const word of sensitive) assert.ok(!text.includes(word), `${word}가 남음`);
}

test('정상: GatedOutput을 돌려주고 요청은 한 번, 로그 한 줄은 정해진 칸만 담는다', async (t) => {
  const logs = captureLogs(t);
  const { gate, requests } = gateWith([jsonResponse(okBody())]);
  const output = await gate.generate(baseRequest());
  assert.deepEqual(output.items.map((item) => [item.kind, item.text]), [['CITED', '첫 줄을 확인했다'], ['AI_INTERPRETATION', '해석 항목']]);
  assert.equal(output.items[0].citations[0].quote, 'SECRET_SOURCE_첫 줄');
  assert.equal(output.droppedCount, 0);
  assert.equal(requests.length, 1);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].level, 'log');
  const [fields] = logs[0].args;
  assert.deepEqual(Object.keys(fields).sort(), ['droppedCount', 'durationMs', 'event', 'failure', 'feature', 'inputTokens',
    'itemCount', 'nonItemLineCount', 'outputTokens', 'requestId', 'stopReason'].sort());
  assert.deepEqual({ ...fields, durationMs: 0 }, { event: 'AI_GENERATION_COMPLETED', feature: 'BASE_SUMMARY', stopReason: 'end_turn',
    failure: null, itemCount: 2, droppedCount: 0, nonItemLineCount: 1, inputTokens: 321, outputTokens: 45, durationMs: 0, requestId: 'req_test_0001' });
  assertNoSensitive(logs);
});

test('요청: 고정 주소·모델·생각 끔·처리 위치 미국·기본 출력 상한·키 머리글 하나·지시와 문서 분리', async (t) => {
  // SDK가 스스로 읽는 환경변수가 있어도 주소·키·인증 머리글이 바뀌지 않는다.
  const injected = { ANTHROPIC_BASE_URL: 'https://evil.example', ANTHROPIC_AUTH_TOKEN: 'ENV_AUTH_TOKEN', ANTHROPIC_API_KEY: 'ENV_API_KEY' };
  const saved = Object.fromEntries(Object.keys(injected).map((key) => [key, process.env[key]]));
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  Object.assign(process.env, injected);
  captureLogs(t);
  const { gate, requests } = gateWith([jsonResponse(okBody())]);
  await gate.generate(baseRequest({ instruction: '기능 지시', publicationText: 'PUBLICATION_ONLY' }));
  const [{ url, init, body }] = requests;
  assert.equal(url, 'https://api.anthropic.com/v1/messages');
  assert.equal(init.redirect, 'manual', '지키는 fetch를 거쳐 보낸다');
  const headers = new Headers(init.headers);
  assert.equal(headers.get('x-api-key'), FAKE_KEY);
  assert.equal(headers.get('authorization'), null);
  assert.equal(body.model, 'claude-haiku-5-5');
  assert.deepEqual(body.thinking, { type: 'disabled' });
  assert.equal(body.inference_geo, 'us');
  assert.equal(body.max_tokens, DEFAULT_MAX_OUTPUT_TOKENS);
  assert.equal(body.system, `${ITEM_FORMAT_INSTRUCTION}\n\n기능 지시`);
  assert.deepEqual(body.messages.map((message) => message.role), ['user']);
  assert.deepEqual(body.messages[0].content.map((block) => block.type), ['document', 'text']);
  assert.equal(body.messages[0].content[1].text, USER_TEXT);
  assert.ok(!init.body.includes('PUBLICATION_ONLY'));
  assert.ok(!('temperature' in body) && !('stream' in body));
});

test('SONNET은 Sonnet 5.5와 생각을 끄는 between_tools로, 출력 상한은 만들 때 준 값으로 부른다', async (t) => {
  captureLogs(t);
  const { gate, requests } = gateWith([jsonResponse(okBody())], { maxOutputTokens: 321 });
  await gate.generate(baseRequest({ model: 'SONNET', feature: 'QNA' }));
  assert.equal(requests[0].body.model, 'claude-sonnet-5-5');
  assert.deepEqual(requests[0].body.thinking, { type: 'between_tools' });
  assert.equal(requests[0].body.max_tokens, 321);
});

test('키가 비었으면 게이트를 만들지 않고 오류에 키가 없다. 잘못된 상한·시간 제한도 거부', () => {
  for (const apiKey of [undefined, null, '', '   ']) {
    assert.throws(() => createAiGenerationGate({ apiKey }), (error) => error.message.includes('CATCHU_GENERATION_API_KEY'));
  }
  for (const config of [{ maxOutputTokens: 0 }, { maxOutputTokens: 1.5 }, { timeoutMs: -1 }]) {
    assert.throws(() => createAiGenerationGate({ apiKey: FAKE_KEY, ...config }), (error) => !error.message.includes(FAKE_KEY));
  }
});

test('S2 근거가 없거나 모두 빈 줄이면 호출하지 않고 빈 결과', async (t) => {
  captureLogs(t);
  for (const sources of [[], [source({ text: ' \n' })]]) {
    const { gate, requests } = gateWith([]);
    assert.deepEqual(await gate.generate(baseRequest({ sources })), { items: [], droppedCount: 0 });
    assert.equal(requests.length, 0);
  }
});

test('S9 첫 근거가 빈 줄뿐이면 문서 번호 0의 인용이 둘째 근거의 sourceId·원문 위치로 연결된다', async (t) => {
  captureLogs(t);
  const second = source({ sourceId: 'second', sourceKind: 'AUTHOR_MATERIAL', text: '둘째 근거 첫 줄\n둘째 줄',
    location: { publishedItemId: '00000000-0000-4000-8000-000000000009', fieldPath: 'text', charStart: 7, charEnd: 20, pdfPage: null } });
  const { gate, requests } = gateWith([jsonResponse(messageBody([fragment('- 둘째 줄을 봤다', [blockCitation(0, 1, 2)])]))]);
  const output = await gate.generate(baseRequest({ sources: [source({ sourceId: 'first', text: '\r\n \n' }), second] }));
  assert.equal(requests[0].body.messages[0].content.filter((block) => block.type === 'document').length, 1);
  assert.deepEqual(output.items[0].citations, [{ sourceId: 'second', quote: '둘째 줄',
    location: { publishedItemId: '00000000-0000-4000-8000-000000000009', fieldPath: 'text', charStart: 17, charEnd: 21, pdfPage: null },
    sourceLabel: '작성자 자료 원문' }]);
});

test('S6 잘린 응답은 끝나지 않은 항목만 빠지고 버림이 있으면 경고 로그', async (t) => {
  const logs = captureLogs(t);
  const body = messageBody([fragment('- 완성 항목', [blockCitation(0, 0, 1)]), fragment('\n- 잘린 항')], 'max_tokens');
  const { gate } = gateWith([jsonResponse(body)]);
  const output = await gate.generate(baseRequest());
  assert.deepEqual(output.items.map((item) => item.text), ['완성 항목']);
  assert.equal(output.droppedCount, 1);
  assert.equal(logs[0].level, 'warn');
  assert.equal(logs[0].args[0].event, 'AI_GENERATION_DROPPED');
  assert.equal(logs[0].args[0].stopReason, 'max_tokens');
  assertNoSensitive(logs);
});

/** 실패 사례: 원인별 AiProviderError, 요청 한 번, 실패 로그 한 줄에 원문 없음. */
async function assertFailure(t, responses, expected, config = {}) {
  const logs = captureLogs(t);
  const { gate, requests } = gateWith(responses, config);
  let thrown;
  await assert.rejects(gate.generate(baseRequest()), (error) => {
    thrown = error;
    return error instanceof AiProviderError && error.reason === expected.reason && error.failure === (expected.failure ?? null)
      && error.status === (expected.status ?? null);
  });
  assert.equal(requests.length, 1, '다시 보내지 않는다');
  assert.equal(logs.length, 1);
  assert.equal(logs[0].level, 'warn');
  assert.equal(logs[0].args[0].event, 'AI_GENERATION_FAILED');
  assert.ok(logs[0].args[0].failure.startsWith(expected.reason));
  assertNoSensitive(logs, thrown, thrown.message);
  return logs[0].args[0];
}

test('S7 거절 응답은 이미 나온 항목이 있어도 REFUSED', async (t) => {
  const fields = await assertFailure(t, [jsonResponse(okBody('refusal'))], { reason: 'REFUSED' });
  assert.equal(fields.stopReason, 'refusal');
});

test('S7 항목 없는 정상 끝 응답은 NO_ITEMS', async (t) => {
  const fields = await assertFailure(t, [jsonResponse(messageBody([fragment('PROVIDER_ECHO 항목 없이 끝난 글')]))], { reason: 'NO_ITEMS' });
  assert.equal(fields.nonItemLineCount, 1);
});

test('S7 예상 밖 중단 이유는 UNEXPECTED_STOP', async (t) => {
  await assertFailure(t, [jsonResponse(okBody('pause_turn'))], { reason: 'UNEXPECTED_STOP' });
});

test('S7 연결 실패는 CALL_FAILED/CONNECTION_FAILED', async (t) => {
  await assertFailure(t, [new TypeError('fetch failed PROVIDER_ECHO')], { reason: 'CALL_FAILED', failure: 'CONNECTION_FAILED' });
});

test('S7 오류 상태(재시도 대상인 429·500 포함)는 상태 코드만 옮긴 CALL_FAILED이고 다시 보내지 않는다', async (t) => {
  for (const status of [400, 429, 500, 529]) {
    await t.test(String(status), async (st) => {
      const errorBody = { type: 'error', error: { type: 'api_error', message: `PROVIDER_ECHO ${SOURCE_TEXT}` } };
      const fields = await assertFailure(st, [jsonResponse(errorBody, { status, requestId: 'req_err_1' })],
        { reason: 'CALL_FAILED', failure: 'API_STATUS', status });
      assert.equal(fields.failure, `CALL_FAILED/API_STATUS:${status}`);
      assert.equal(fields.requestId, 'req_err_1');
    });
  }
});

test('시간 초과는 짧은 시간 제한으로 CALL_FAILED/CONNECTION_TIMEOUT', async (t) => {
  const slow = (input, init) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(jsonResponse(okBody())), 5000);
    init.signal.addEventListener('abort', () => { clearTimeout(timer); reject(init.signal.reason ?? new DOMException('aborted', 'AbortError')); });
  });
  const started = Date.now();
  await assertFailure(t, [slow], { reason: 'CALL_FAILED', failure: 'CONNECTION_TIMEOUT' }, { timeoutMs: 30 });
  assert.ok(Date.now() - started < 2000, '실제로 오래 기다리지 않는다');
});

test('redirect 응답은 따라가지 않고 CALL_FAILED/REDIRECT_REJECTED', async (t) => {
  await assertFailure(t, [new Response(null, { status: 302, headers: { location: 'https://evil.example/' } })],
    { reason: 'CALL_FAILED', failure: 'REDIRECT_REJECTED' });
});

test('응답 본문이 256 KiB를 넘으면 CALL_FAILED/RESPONSE_TOO_LARGE, 딱 맞으면 읽는다', async (t) => {
  await t.test('넘음', async (st) => {
    const body = messageBody([fragment(`- ${'가'.repeat(MAX_RESPONSE_BODY_BYTES / 3)}`)]);
    await assertFailure(st, [jsonResponse(body)], { reason: 'CALL_FAILED', failure: 'RESPONSE_TOO_LARGE' });
  });
  await t.test('딱 맞음', async (st) => {
    captureLogs(st);
    const base = JSON.stringify(messageBody([fragment('- ')]));
    const text = `- ${'a'.repeat(MAX_RESPONSE_BODY_BYTES - Buffer.byteLength(base))}`;
    const json = JSON.stringify(messageBody([fragment(text)]));
    assert.equal(Buffer.byteLength(json), MAX_RESPONSE_BODY_BYTES);
    const { gate } = gateWith([new Response(json, { headers: { 'content-type': 'application/json' } })]);
    const output = await gate.generate(baseRequest());
    assert.equal(output.items.length, 1);
  });
});

test('응답 모양이 맞지 않으면 CALL_FAILED/INVALID_RESPONSE', async (t) => {
  for (const response of [
    () => new Response('PROVIDER_ECHO not json', { headers: { 'content-type': 'application/json' } }),
    () => jsonResponse({ PROVIDER_ECHO: true }),
    () => jsonResponse(messageBody([{ type: 'text', text: 1 }])),
    () => jsonResponse(messageBody([fragment('- x', 'PROVIDER_ECHO')])),
  ]) {
    await t.test('모양', (st) => assertFailure(st, [response()], { reason: 'CALL_FAILED', failure: 'INVALID_RESPONSE' }));
  }
});

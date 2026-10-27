// U1 AI 생성 관문 시험 자료. 실제 사용자 자료·실제 응답을 쓰지 않고 시험 안에서 만든 합성 글과
// Claude Messages API 응답 모양의 JSON만 둔다. 키는 가짜 값만 쓴다.

const FAKE_KEY = 'FAKE_GENERATION_KEY_U1';

/** C-01 AiSource 모양. location.charStart로 사본 필드 안 위치를 준다. */
function source(overrides = {}) {
  const text = overrides.text ?? '첫 줄\r\n\r\n셋째 줄';
  return {
    sourceId: 'chunk-1',
    sourceKind: 'GITHUB_RECORD',
    text,
    location: { publishedItemId: '00000000-0000-4000-8000-000000000001', fieldPath: 'body', charStart: 100, charEnd: 100 + text.length, pdfPage: null },
    catchEvidenceUrls: [],
    ...overrides,
  };
}

/** C-01 AiGenerationRequest 모양. */
function request(overrides = {}) {
  return {
    feature: 'BASE_SUMMARY',
    instruction: '근거에서 확인되는 사실을 정리한다.',
    sources: [source()],
    userText: null,
    publicationText: null,
    model: 'HAIKU',
    ...overrides,
  };
}

/** content_block_location 인용 하나. */
function blockCitation(documentIndex, start, end, citedText = 'cited') {
  return { type: 'content_block_location', cited_text: citedText, document_index: documentIndex, document_title: null,
    start_block_index: start, end_block_index: end, file_id: null };
}

/** 글 조각. citations가 없으면 null(인용 없는 조각). */
function fragment(text, citations = null) {
  return { type: 'text', text, citations };
}

/** Messages API 응답 본문(JSON 객체). */
function messageBody(content, stopReason = 'end_turn', usage = { input_tokens: 321, output_tokens: 45 }) {
  return { id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', content,
    stop_reason: stopReason, stop_sequence: null, stop_details: null, usage };
}

/** 기록한 HTTP 응답 하나. */
function jsonResponse(body, { status = 200, requestId = 'req_test_0001' } = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'request-id': requestId } });
}

/**
 * 시험용 fetch. 기록한 응답(또는 응답을 만드는 함수, 던질 Error)을 차례로 돌려주고 요청을 모은다.
 * 전역 fetch는 바꾸지 않는다.
 */
function recordingFetch(responses) {
  const requests = [];
  const fetch = async (input, init) => {
    requests.push({ url: String(input), init, body: typeof init?.body === 'string' ? JSON.parse(init.body) : null });
    const next = responses.shift();
    if (next === undefined) throw new Error('예상보다 많은 요청');
    if (next instanceof Error) throw next;
    return typeof next === 'function' ? next(input, init) : next;
  };
  return { fetch, requests };
}

/** 주어진 크기의 조각들로 본문을 흘려보내는 응답. pulled는 실제로 읽어 간 조각 수다. */
function chunkedResponse(chunkBytes, chunkCount, init = {}) {
  const state = { pulled: 0, cancelled: false };
  const body = new ReadableStream({
    pull(controller) {
      if (state.pulled >= chunkCount) { controller.close(); return; }
      state.pulled += 1;
      controller.enqueue(new Uint8Array(chunkBytes).fill(0x61));
    },
    cancel() { state.cancelled = true; },
  });
  return { response: new Response(body, init), state };
}

/** 시험 안에서 Nest Logger 출력을 모은다. */
function captureLogs(t) {
  const { Logger } = require('@nestjs/common');
  const logs = [];
  Logger.overrideLogger(Object.fromEntries(['log', 'warn', 'error', 'debug', 'verbose', 'fatal']
    .map((level) => [level, (...args) => logs.push({ level, args })])));
  t.after(() => Logger.overrideLogger(false));
  return logs;
}

module.exports = { FAKE_KEY, source, request, blockCitation, fragment, messageBody, jsonResponse, recordingFetch, chunkedResponse, captureLogs };

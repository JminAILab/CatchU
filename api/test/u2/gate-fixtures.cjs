// U2 게이트 시험 자료. U1 자료(test/ai-generation/fixtures.cjs)에 스트림(SSE) 응답 만들기를 더한다.
// 실제 응답·사용자 자료를 쓰지 않고, Claude Messages API 스트림 사건 모양의 JSON을 시험 안에서 만든다. 키는 가짜 값만 쓴다.
const u1 = require('../ai-generation/fixtures.cjs');

/** 글 블록 하나의 스트림 사건들. citations는 content_block_location 인용 목록. */
function textBlockEvents(index, text, citations = []) {
  const events = [{ type: 'content_block_start', index, content_block: { type: 'text', text: '', citations: citations.length ? [] : null } }];
  for (const citation of citations) events.push({ type: 'content_block_delta', index, delta: { type: 'citations_delta', citation } });
  // 글은 두 조각으로 나눠 보낸다(조각 경계가 줄 경계와 다르다).
  const half = Math.ceil(text.length / 2);
  for (const part of [text.slice(0, half), text.slice(half)]) {
    if (part !== '') events.push({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: part } });
  }
  events.push({ type: 'content_block_stop', index });
  return events;
}

/** 블록 목록([text, citations][])으로 메시지 전체 사건을 만든다. */
function messageEvents(blocks, stopReason = 'end_turn') {
  const events = [{ type: 'message_start', message: { id: 'msg_stream', type: 'message', role: 'assistant', model: 'claude-haiku-5-5',
    content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 111, output_tokens: 1 } } }];
  blocks.forEach(([text, citations], index) => events.push(...textBlockEvents(index, text, citations)));
  events.push({ type: 'message_delta', delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 42 } });
  events.push({ type: 'message_stop' });
  return events;
}

const sseChunk = (event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;

/** 사건 전부를 한 번에 담은 SSE 응답. */
function sseResponse(events, { requestId = 'req_stream_0001' } = {}) {
  return new Response(events.map(sseChunk).join(''), { status: 200, headers: { 'content-type': 'text/event-stream', 'request-id': requestId } });
}

/** 시험이 사건을 하나씩 흘려보내는 SSE 응답. push(event)로 보내고 close()로 끝낸다. */
function controlledSseResponse() {
  let controller;
  const body = new ReadableStream({ start(c) { controller = c; } });
  const encoder = new TextEncoder();
  return {
    response: new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream', 'request-id': 'req_stream_ctl' } }),
    push: (event) => controller.enqueue(encoder.encode(sseChunk(event))),
    close: () => controller.close(),
  };
}

module.exports = { ...u1, textBlockEvents, messageEvents, sseResponse, controlledSseResponse };

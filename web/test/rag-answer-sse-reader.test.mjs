import assert from "node:assert/strict";
import { test } from "node:test";
import { createSseParser, readSseStream } from "../src/features/rag-answer/sse-reader.ts";

// 12월 intent U5 질의응답 SSE 해석(계약 C-12 `text/event-stream`, 기능 설계 BR4.5·BR4.6, performance-design NFR4.3).

const bytes = (text) => new TextEncoder().encode(text);
function streamOf(chunks) {
  const state = { cancelled: false };
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
    cancel() { state.cancelled = true; },
  });
  return { stream, state };
}

test("덩어리를 빈 줄로 나누고 event·data를 읽으며, keep-alive 주석은 무시한다", () => {
  const parser = createSseParser();
  const events = parser.push(': keep-alive\n\nevent: item\ndata: {"kind":"CITED"}\n\nevent: done\ndata: {}\n\n');
  assert.deepEqual(events, [{ event: "item", data: '{"kind":"CITED"}' }, { event: "done", data: "{}" }]);
  assert.deepEqual(parser.push(": keep-alive\n\n"), []);
});

test("조각이 덩어리·줄 가운데에서 끊겨 와도 이어 붙이고, CRLF·CR 줄 끝도 받는다", () => {
  const parser = createSseParser();
  assert.deepEqual(parser.push("event: it"), []);
  assert.deepEqual(parser.push("em\r"), []);
  assert.deepEqual(parser.push('\ndata: {"a"'), []);
  // 끝의 \r은 다음 조각의 \n과 짝일 수 있어 다음 조각이 올 때 빈 줄로 판정한다.
  assert.deepEqual(parser.push(':1}\r\n\r'), []);
  assert.deepEqual(parser.push("\ndata: one\rdata: two\r\n\n"), [{ event: "item", data: '{"a":1}' }, { event: "message", data: "one\ntwo" }]);
  assert.deepEqual(parser.push("data: three\r\r"), [], "끝이 \\r이면 아직 기다린다");
  assert.deepEqual(parser.push("\n"), [{ event: "message", data: "three" }]);
  assert.deepEqual(parser.push("data:no-space\nunknown: x\nevent\n\n"), [{ event: "message", data: "no-space" }]);
});

test("빈 줄 없이 끝난 마지막 덩어리는 버린다(끊긴 스트림)", () => {
  const parser = createSseParser();
  assert.deepEqual(parser.push("event: item\ndata: {}"), []);
  assert.deepEqual(parser.end(), []);
  assert.deepEqual(parser.push("\n\n"), [], "end 뒤에는 남은 조각이 없다");
});

test("스트림 읽기: 바이트 조각(한글 중간 끊김 포함)을 이어 덩어리마다 알린다", async () => {
  const encoded = bytes('event: item\ndata: {"text":"한글 항목"}\n\nevent: done\ndata: {}\n\n');
  const { stream } = streamOf([encoded.slice(0, 30), encoded.slice(30, 31), encoded.slice(31)]);
  const seen = [];
  await readSseStream(stream, (event) => { seen.push(event); });
  assert.deepEqual(seen, [{ event: "item", data: '{"text":"한글 항목"}' }, { event: "done", data: "{}" }]);
});

test("받는 쪽이 false를 돌려주면 읽기를 멈추고 본문을 닫는다", async () => {
  const { stream, state } = streamOf([bytes("event: error\ndata: {}\n\n"), bytes("event: item\ndata: {}\n\n")]);
  const seen = [];
  await readSseStream(stream, (event) => { seen.push(event.event); return false; });
  assert.deepEqual(seen, ["error"]);
  assert.equal(state.cancelled, true);
});

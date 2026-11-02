/**
 * 질의응답 SSE 해석(계약 C-12 `text/event-stream`, 기능 설계 BR4.5·BR4.6). 순수 해석기와 스트림 읽기 둘이다.
 *
 * - 빈 줄에서 덩어리 하나를 낸다. `event:`는 이름, `data:`는 여러 줄이면 줄바꿈으로 잇는다. `:`로 시작하는 줄(keep-alive)은 무시한다.
 * - 바이트 조각이 덩어리 중간에서 끊겨 와도 이어 붙인다. 줄 끝은 `\n`·`\r\n`·`\r`을 모두 받는다.
 */
export type SseEvent = { readonly event: string; readonly data: string };

export type SseParser = {
  /** 받은 글 조각을 넣고, 끝난 덩어리를 돌려준다. */
  push(chunk: string): SseEvent[];
  /** 스트림 끝. 빈 줄 없이 끝난 마지막 덩어리는 버린다(SSE 규칙). */
  end(): SseEvent[];
};

export function createSseParser(): SseParser {
  let buffer = "";
  let event = "";
  let data: string[] = [];

  function line(text: string, out: SseEvent[]): void {
    if (text === "") {
      if (data.length > 0) out.push({ event: event || "message", data: data.join("\n") });
      event = "";
      data = [];
      return;
    }
    if (text.startsWith(":")) return;
    const colon = text.indexOf(":");
    const field = colon === -1 ? text : text.slice(0, colon);
    let value = colon === -1 ? "" : text.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
  }

  return {
    push(chunk) {
      buffer += chunk;
      const out: SseEvent[] = [];
      for (;;) {
        const match = /\r\n|\r|\n/.exec(buffer);
        // 끝의 \r은 다음 조각의 \n과 짝일 수 있어 기다린다.
        if (match === null || (match[0] === "\r" && match.index === buffer.length - 1)) break;
        line(buffer.slice(0, match.index), out);
        buffer = buffer.slice(match.index + match[0].length);
      }
      return out;
    },
    end() {
      buffer = "";
      event = "";
      data = [];
      return [];
    },
  };
}

/** 응답 본문을 끝까지 읽으며 덩어리마다 onEvent를 부른다. onEvent가 false를 돌려주면 읽기를 멈추고 본문을 닫는다. */
export async function readSseStream(body: ReadableStream<Uint8Array>, onEvent: (event: SseEvent) => boolean | void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const event of parser.push(decoder.decode(value, { stream: true }))) {
        if (onEvent(event) === false) {
          await reader.cancel();
          return;
        }
      }
    }
    for (const event of parser.push(decoder.decode())) {
      if (onEvent(event) === false) return;
    }
    parser.end();
  } finally {
    reader.releaseLock();
  }
}

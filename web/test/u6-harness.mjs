// 12월 intent U6 화면 시험 도우미. 시험 파일이 아니다(이름이 .test.mjs로 끝나지 않는다).
// src는 u2-render.mjs로 불러오고, Claude 연결 화면의 hook만 u7-hooks.mjs로 돌려 DOM 없이 상태·효과를 직접 돌린다.
// 실제 api를 부르지 않는다. fetch 자리에 기록용 함수를 넣어 공통 호출 함수(api.member)와 응답 해석까지 거친다.
import { registerHooks } from "node:module";
import { load } from "./u2-render.mjs";

// api.ts가 불러올 때 읽는 값이다. 이 주소로 나가는 요청은 없다(기록용 fetch가 받는다).
process.env.NEXT_PUBLIC_API_BASE_URL = "http://127.0.0.1:3001";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "react" && context.parentURL?.includes("/features/claude-connection/")) {
      return { url: new URL("./u7-hooks.mjs", import.meta.url).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

export { load };

/** 조건이 맞을 때까지 기다린다. */
export async function until(check, timeoutMs = 2000) {
  const started = Date.now();
  for (;;) {
    if (check()) return;
    if (Date.now() - started > timeoutMs) throw new Error("기다리던 상태가 되지 않았다");
    await new Promise((resolve) => setImmediate(resolve));
  }
}

/** fetch를 기록용으로 바꾼다. handler는 { status, body }나 그것을 주는 Promise를 돌려준다. 시험 끝에 되돌린다. */
export function recordFetch(t, handler) {
  const sent = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const request = { path: new URL(url).pathname, method: init.method, body: init.body === undefined ? undefined : JSON.parse(init.body) };
    sent.push(request);
    const { status = 200, body } = await handler(request, sent.length);
    if (status === 204) return new Response(null, { status });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  };
  t.after(() => { globalThis.fetch = original; });
  return sent;
}

/** 시험용 회원 토큰을 메모리에 넣는다(합성 값). 조회 효과는 토큰이 있어야 돈다. */
export async function signIn(t) {
  const { accessTokenStore } = await load("lib/access-token.ts");
  accessTokenStore.set(`u6-synthetic-${Math.random()}`);
  t.after(() => accessTokenStore.clear("logout"));
}

export const CONNECTION_PATH = "/v1/me/mcp-connection";
export const API_ERROR = (status, code) => ({ status, body: { code, message: "서버가 보낸 안내" } });

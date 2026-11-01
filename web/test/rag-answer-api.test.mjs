import assert from "node:assert/strict";
import { test } from "node:test";
import { createAccessTokenStore } from "../src/lib/access-token.ts";
import { createApiClient } from "../src/lib/api-client.ts";
import { createRagAnswerApi, linkAccessCode, parseGatedItem, parseSummaryView } from "../src/features/rag-answer/rag-answer-api.ts";

// 12월 intent U5 web API 경계(계약 C-11·C-12, 기능 설계 W1·W4~W6·BR8.6, 계획 1차 수정 요청 (3)).
// 요약 GET·[다시 만들기] POST는 createApiClient(recipient()·member())로, 질문 SSE만 같은 기준 주소 규칙의 직접 fetch로 가는지 본다.
// 시험용 fetch만 쓴다(실제 api를 부르지 않는다).

const BASE = "http://127.0.0.1:3001";
const TOKEN = "tok/en+1";
const PUBLICATION = "77777777-7777-4777-8777-777777777777";
const ITEM = {
  kind: "CITED", text: "요약 항목", jdRole: null,
  citations: [{ sourceId: "s1", quote: "원문", sourceLabel: "GitHub 기록 원문",
    location: { publishedItemId: "i1", fieldPath: "workFacts[0]", charStart: 0, charEnd: 2, pdfPage: null } }],
};

function setup({ responses = [], memberToken = "member-token" } = {}) {
  const calls = [];
  const queue = [...responses];
  const fakeFetch = async (url, init) => {
    calls.push({ url, init, headers: { ...init.headers } });
    const next = queue.shift() ?? Response.json({ ok: true });
    if (next instanceof Error) throw next;
    return next;
  };
  const tokens = createAccessTokenStore();
  if (memberToken) tokens.set(memberToken);
  const client = createApiClient({ baseUrl: BASE, nodeEnv: "test", tokens, fetch: fakeFetch });
  return { calls, rag: createRagAnswerApi({ client, baseUrl: BASE, nodeEnv: "test", fetch: fakeFetch }) };
}

function recipientContext(grant = null) {
  const lost = [];
  return { lost, context: { token: TOKEN, getGrant: () => grant, onAccessLost: (code) => lost.push(code) } };
}

const apiError = (status, code) => Response.json({ code, message: "안내" }, { status });

function sseResponse(text, { chunks } = {}) {
  const encoded = new TextEncoder().encode(text);
  const parts = chunks ?? [encoded];
  return new Response(new ReadableStream({
    start(controller) { for (const part of parts) controller.enqueue(part); controller.close(); },
  }), { status: 200, headers: { "Content-Type": "text/event-stream; charset=utf-8" } });
}

test("받은 사람 요약 GET은 recipient()로 링크 경로·X-Link-Grant를 싣고 회원 토큰은 싣지 않는다", async () => {
  const { calls, rag } = setup({ responses: [Response.json({ status: "DONE", items: [ITEM] })] });
  const { context } = recipientContext("grant-1");
  const load = await rag.recipientSummary(context);
  assert.deepEqual(load, { kind: "success", view: { status: "DONE", items: [{ kind: "CITED", text: "요약 항목", citations: ITEM.citations }] } });
  assert.equal(calls[0].url, `${BASE}/v1/public/links/${encodeURIComponent(TOKEN)}/summary`);
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].headers["X-Link-Grant"], "grant-1");
  assert.equal(calls[0].headers.Authorization, undefined);
  assert.equal(calls[0].init.credentials, "omit");
  const noGrant = setup({ responses: [Response.json({ status: "PENDING", items: [] })] });
  await noGrant.rag.recipientSummary(recipientContext("").context);
  assert.equal(noGrant.calls[0].headers["X-Link-Grant"], undefined, "빈 grant는 싣지 않는다");
});

test("받은 사람 401 LINK_PASSWORD_REQUIRED·404 LINK_UNAVAILABLE은 onAccessLost를 부르고, 다른 오류는 실패로 돌려준다(C-11 rule)", async () => {
  const { rag } = setup({ responses: [apiError(401, "LINK_PASSWORD_REQUIRED"), apiError(404, "LINK_UNAVAILABLE"), apiError(500, "INTERNAL_ERROR"),
    Response.json({ status: "DONE", items: [{ kind: "CITED" }] })] });
  const { lost, context } = recipientContext();
  assert.deepEqual(await rag.recipientSummary(context), { kind: "access-lost", code: "LINK_PASSWORD_REQUIRED" });
  assert.deepEqual(await rag.recipientSummary(context), { kind: "access-lost", code: "LINK_UNAVAILABLE" });
  assert.deepEqual(await rag.recipientSummary(context), { kind: "failed", status: 500, code: "INTERNAL_ERROR" });
  assert.deepEqual(await rag.recipientSummary(context), { kind: "failed", status: 200, code: "LOOKUP_FAILED" }, "모양이 틀린 응답은 실패");
  assert.deepEqual(lost, ["LINK_PASSWORD_REQUIRED", "LINK_UNAVAILABLE"]);
  assert.equal(linkAccessCode(404, "LINK_PASSWORD_REQUIRED"), null, "코드와 상태가 둘 다 맞아야 한다");
});

test("작성자 요약 GET·[다시 만들기] POST는 member()의 회원 토큰으로 가고 202·429를 나눈다(BR8.2)", async () => {
  const { calls, rag } = setup({ responses: [
    Response.json({ status: "FAILED", items: [], canRegenerate: true }),
    new Response(JSON.stringify({}), { status: 202, headers: { "Content-Type": "application/json" } }),
    apiError(429, "DAILY_LIMIT_REACHED"), apiError(404, "RESOURCE_UNAVAILABLE"),
    Response.json({ status: "DONE", items: [] }), Response.json({ ok: true }),
  ] });
  assert.deepEqual(await rag.ownerSummary(PUBLICATION), { kind: "success", view: { status: "FAILED", items: [], canRegenerate: true } });
  assert.equal(calls[0].url, `${BASE}/v1/publications/${PUBLICATION}/summary`);
  assert.equal(calls[0].headers.Authorization, "Bearer member-token");
  assert.deepEqual(await rag.regenerate(PUBLICATION), { kind: "accepted" });
  assert.equal(calls[1].url, `${BASE}/v1/publications/${PUBLICATION}/summary/regenerate`);
  assert.equal(calls[1].init.method, "POST");
  assert.equal(calls[1].headers.Authorization, "Bearer member-token");
  assert.deepEqual(await rag.regenerate(PUBLICATION), { kind: "limit-reached" });
  assert.deepEqual(await rag.regenerate(PUBLICATION), { kind: "failed", status: 404, code: "RESOURCE_UNAVAILABLE" });
  assert.deepEqual(await rag.ownerSummary(PUBLICATION), { kind: "failed", status: 200, code: "LOOKUP_FAILED" }, "작성자 응답은 canRegenerate가 있어야 한다");
  assert.deepEqual(await rag.regenerate(PUBLICATION), { kind: "failed", status: 200, code: "LOOKUP_FAILED" }, "202가 아닌 성공은 접수로 보지 않는다");
});

test("질문 SSE는 같은 기준 주소 규칙(/v1)·credentials omit·X-Link-Grant로 직접 fetch하고 최근 대화만 보낸다", async () => {
  const sse = `: keep-alive\n\nevent: item\ndata: ${JSON.stringify(ITEM)}\n\nevent: item\ndata: ${JSON.stringify({ ...ITEM, kind: "AI_INTERPRETATION", citations: [] })}\n\nevent: done\ndata: {}\n\n`;
  const { calls, rag } = setup({ responses: [sseResponse(sse)] });
  const { context } = recipientContext("grant-2");
  const items = [];
  const history = [{ role: "USER", text: "앞 질문", extra: "버림" }, { role: "ASSISTANT", text: "앞 답" }];
  const outcome = await rag.ask(context, { question: "질문", history }, (item) => items.push(item));
  assert.deepEqual(outcome, { kind: "done", itemCount: 2 });
  assert.deepEqual(items.map((i) => i.kind), ["CITED", "AI_INTERPRETATION"]);
  assert.equal(calls[0].url, `${BASE}/v1/public/links/${encodeURIComponent(TOKEN)}/questions`);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.credentials, "omit");
  assert.equal(calls[0].init.cache, "no-store");
  assert.equal(calls[0].headers["X-Link-Grant"], "grant-2");
  assert.equal(calls[0].headers.Accept, "text/event-stream");
  assert.equal(calls[0].headers.Authorization, undefined, "질의응답에는 회원 토큰을 싣지 않는다");
  assert.deepEqual(JSON.parse(calls[0].init.body), { question: "질문", history: [{ role: "USER", text: "앞 질문" }, { role: "ASSISTANT", text: "앞 답" }] });
});

test("질문 전역 fetch: fetch를 넘기지 않으면 부를 때의 전역 fetch로 보낸다", async (t) => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return sseResponse("event: done\ndata: {}\n\n"); };
  t.after(() => { globalThis.fetch = original; });
  const rag = createRagAnswerApi({ client: { member: async () => null, recipient: async () => null }, baseUrl: `${BASE}/`, nodeEnv: "test" });
  const outcome = await rag.ask(recipientContext().context, { question: "질문", history: [] }, () => {});
  assert.deepEqual(outcome, { kind: "done", itemCount: 0 }, "항목 0개 done(화면은 근거 없음 안내, BR8.5)");
  assert.equal(calls[0].url, `${BASE}/v1/public/links/${encodeURIComponent(TOKEN)}/questions`);
});

test("질문 스트림 전 거부: 401·404 링크 오류는 onAccessLost, 409·429·400은 http-error(BR8.6)", async () => {
  const { rag } = setup({ responses: [apiError(404, "LINK_UNAVAILABLE"), apiError(401, "LINK_PASSWORD_REQUIRED"),
    apiError(409, "INDEX_NOT_READY"), apiError(429, "QUESTION_LIMIT_REACHED"), apiError(400, "VALIDATION_FAILED"),
    new Response("not json", { status: 502 })] });
  const { lost, context } = recipientContext();
  const body = { question: "질문", history: [] };
  assert.deepEqual(await rag.ask(context, body, () => {}), { kind: "access-lost", code: "LINK_UNAVAILABLE" });
  assert.deepEqual(await rag.ask(context, body, () => {}), { kind: "access-lost", code: "LINK_PASSWORD_REQUIRED" });
  assert.deepEqual(await rag.ask(context, body, () => {}), { kind: "http-error", status: 409, code: "INDEX_NOT_READY" });
  assert.deepEqual(await rag.ask(context, body, () => {}), { kind: "http-error", status: 429, code: "QUESTION_LIMIT_REACHED" });
  assert.deepEqual(await rag.ask(context, body, () => {}), { kind: "http-error", status: 400, code: "VALIDATION_FAILED" });
  assert.deepEqual(await rag.ask(context, body, () => {}), { kind: "http-error", status: 502, code: "LOOKUP_FAILED" });
  assert.deepEqual(lost, ["LINK_UNAVAILABLE", "LINK_PASSWORD_REQUIRED"]);
});

test("질문 스트림 뒤 실패: error 이벤트·모양 틀린 항목·done 없이 끝남·SSE 아님은 받은 항목을 두고 stream-error다(BR4.6)", async () => {
  const errorAfterItem = `event: item\ndata: ${JSON.stringify(ITEM)}\n\nevent: error\ndata: {"code":"ANSWER_FAILED"}\n\n`;
  const { rag } = setup({ responses: [
    sseResponse(errorAfterItem), sseResponse("event: item\ndata: {\"kind\":\"BAD\"}\n\n"), sseResponse(`event: item\ndata: ${JSON.stringify(ITEM)}\n\n`),
    new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }), sseResponse("event: error\ndata: not-json\n\n"),
  ] });
  const { context } = recipientContext();
  const items = [];
  const body = { question: "질문", history: [] };
  assert.deepEqual(await rag.ask(context, body, (item) => items.push(item)), { kind: "stream-error", itemCount: 1, code: "ANSWER_FAILED" });
  assert.equal(items.length, 1);
  assert.deepEqual(await rag.ask(context, body, () => {}), { kind: "stream-error", itemCount: 0, code: null });
  assert.deepEqual(await rag.ask(context, body, () => {}), { kind: "stream-error", itemCount: 1, code: null });
  assert.deepEqual(await rag.ask(context, body, () => {}), { kind: "stream-error", itemCount: 0, code: null });
  assert.deepEqual(await rag.ask(context, body, () => {}), { kind: "stream-error", itemCount: 0, code: null });
});

test("통신 실패·주소 설정 오류는 http-error LOOKUP_FAILED, 화면 해제(signal)는 aborted다", async () => {
  const failing = setup({ responses: [new TypeError("network down")] });
  assert.deepEqual(await failing.rag.ask(recipientContext().context, { question: "질문", history: [] }, () => {}),
    { kind: "http-error", status: null, code: "LOOKUP_FAILED" });
  const badBase = createRagAnswerApi({ client: { member: async () => null, recipient: async () => null }, baseUrl: `${BASE}/v1`, nodeEnv: "test",
    fetch: async () => assert.fail("주소가 틀리면 부르지 않는다") });
  assert.deepEqual(await badBase.ask(recipientContext().context, { question: "질문", history: [] }, () => {}),
    { kind: "http-error", status: null, code: "LOOKUP_FAILED" });

  const controller = new AbortController();
  const aborting = createRagAnswerApi({ client: { member: async () => null, recipient: async () => null }, baseUrl: BASE, nodeEnv: "test",
    fetch: async (_url, init) => {
      let pull = 0;
      return new Response(new ReadableStream({
        pull(stream) {
          pull += 1;
          if (pull === 1) { stream.enqueue(new TextEncoder().encode(`event: item\ndata: ${JSON.stringify(ITEM)}\n\n`)); return undefined; }
          return new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
        },
      }), { status: 200, headers: { "Content-Type": "text/event-stream" } });
    } });
  const outcome = await aborting.ask(recipientContext().context, { question: "질문", history: [] }, () => controller.abort(), controller.signal);
  assert.deepEqual(outcome, { kind: "aborted", itemCount: 1 });
  const rejectingFetch = createRagAnswerApi({ client: { member: async () => null, recipient: async () => null }, baseUrl: BASE, nodeEnv: "test",
    fetch: async () => { throw new DOMException("aborted", "AbortError"); } });
  const aborted = new AbortController();
  aborted.abort();
  assert.deepEqual(await rejectingFetch.ask(recipientContext().context, { question: "질문", history: [] }, () => {}, aborted.signal),
    { kind: "aborted", itemCount: 0 });
});

test("응답 모양 검사: 계약 칸만 넘기고 틀린 위치·인용은 거부한다", () => {
  assert.equal(parseGatedItem({ ...ITEM, citations: [{ ...ITEM.citations[0], location: { ...ITEM.citations[0].location, charStart: 1.5 } }] }), null);
  assert.equal(parseGatedItem({ ...ITEM, citations: [{ ...ITEM.citations[0], quote: 3 }] }), null);
  assert.equal(parseGatedItem({ ...ITEM, citations: "x" }), null);
  assert.equal(parseGatedItem(null), null);
  assert.deepEqual(parseGatedItem({ ...ITEM, extra: "버림" }), { kind: "CITED", text: "요약 항목", citations: ITEM.citations });
  assert.equal(parseSummaryView({ status: "UNKNOWN", items: [] }, false), null);
  assert.equal(parseSummaryView({ status: "DONE", items: [null] }, false), null);
  assert.deepEqual(parseSummaryView({ status: "DONE", items: [], canRegenerate: true }, false), { status: "DONE", items: [] });
});

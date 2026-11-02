import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { API_ERROR, CONNECTION_PATH, load, recordFetch, signIn, until } from "./u6-harness.mjs";
import { createHookHarness } from "./u7-hooks.mjs";

// 12월 intent U6 연결 관리 화면(기능 설계 W6·BR7.1·BR7.2·BR7.5, 시나리오 S21).
// 실제 api·브라우저 없이 본다. 기록용 fetch·기록용 copy로 경로와 결과 처리를 확인한다.
const {
  CONNECTION_TEXT, classifyDisconnect, confirmDisconnect, copyConnectionUrl, formatExpiresAt,
} = await load("features/claude-connection/claude-connection.ts");
const { ClaudeConnectionView } = await load("features/claude-connection/claude-connection-view.tsx");
const { ClaudeConnectionPanel } = await load("features/claude-connection/claude-connection-panel.tsx");
const { copyText } = await load("features/share-links/copy-text.ts");

const MCP_URL = "https://catchu.example/v1/mcp";
const EXPIRES_AT = "2026-11-09T03:04:05.000Z";
const statusOf = (state) => ({ state, expiresAt: state === "NONE" ? null : EXPIRES_AT, mcpUrl: MCP_URL });
const loaded = (state) => ({ kind: "loaded", status: statusOf(state) });
const noContent = { kind: "success", status: 204, data: null };

function view(props) {
  return renderToStaticMarkup(createElement(ClaudeConnectionView, {
    lookup: loaded("ACTIVE"), phase: "idle", notice: null, copyResult: null, onCopy() {}, onOpen() {}, onConfirm() {}, onCancel() {}, onRetry() {}, ...props,
  }));
}

test("S21 상태 셋: 문구와 만료 시각을 보이고 복사 주소는 api의 mcpUrl 그대로다", () => {
  const none = view({ lookup: loaded("NONE") });
  assert.ok(none.includes(CONNECTION_TEXT.state.NONE));
  assert.ok(!none.includes("claude-connection-expires"), "NONE에는 만료 시각이 없다");
  const active = view({ lookup: loaded("ACTIVE") });
  assert.ok(active.includes(CONNECTION_TEXT.state.ACTIVE));
  assert.ok(active.includes(formatExpiresAt(EXPIRES_AT)));
  assert.ok(!active.includes(EXPIRES_AT), "원문 시각을 그대로 보이지 않는다");
  const expired = view({ lookup: loaded("EXPIRED") });
  assert.ok(expired.includes(CONNECTION_TEXT.state.EXPIRED));
  for (const html of [none, active, expired]) {
    assert.ok(html.includes(`data-testid="claude-connection-url">${MCP_URL}<`));
    assert.ok(html.includes('data-testid="claude-connection-copy-button"'));
    assert.ok(html.includes('data-testid="claude-connection-disconnect-button"'), "상태와 상관없이 해제할 수 있다");
  }
});

test("S21 조회 중과 조회 실패를 NONE으로 보이지 않는다", () => {
  const loading = view({ lookup: null });
  assert.ok(loading.includes(CONNECTION_TEXT.loading) && loading.includes('role="status"'));
  const failed = view({ lookup: { kind: "failed" } });
  assert.ok(failed.includes(CONNECTION_TEXT.lookupFailed) && failed.includes('role="alert"') && failed.includes("다시 불러오기"));
  for (const html of [loading, failed]) {
    assert.ok(!html.includes(CONNECTION_TEXT.state.NONE));
    assert.ok(!html.includes("claude-connection-disconnect-button") && !html.includes("claude-connection-copy-button"));
  }
});

test("S21 복사: mcpUrl을 그대로 넘기고 성공·실패를 각각 표시한다", async () => {
  const copied = [];
  const results = [];
  await copyConnectionUrl(async (text) => { copied.push(text); return true; }, MCP_URL, (result) => results.push(result));
  await copyConnectionUrl(async () => false, MCP_URL, (result) => results.push(result));
  assert.deepEqual(copied, [MCP_URL]);
  assert.deepEqual(results, ["copied", "failed"]);
  const ok = view({ copyResult: "copied" });
  assert.ok(ok.includes(CONNECTION_TEXT.copied) && ok.includes('role="status"'));
  const failed = view({ copyResult: "failed" });
  assert.ok(failed.includes(CONNECTION_TEXT.copyFailed) && failed.includes('role="alert"'));
  assert.ok(!view().includes(CONNECTION_TEXT.copied) && !view().includes(CONNECTION_TEXT.copyFailed));
  // 공통 복사 함수의 실패 경로와 이어지는지 본다.
  assert.equal(await copyText(undefined, MCP_URL), false);
  assert.equal(await copyText({ writeText: async () => { throw new Error("synthetic denied"); } }, MCP_URL), false);
});

test("S21 해제 확인: [전체 연결 해제] → 확인창 → 보내는 중에는 버튼을 막고 성공으로 보이지 않는다", () => {
  const idle = view();
  assert.ok(idle.includes('data-testid="claude-connection-disconnect-button"') && !idle.includes("claude-connection-confirm-button"));
  const confirming = view({ phase: "confirming" });
  assert.ok(confirming.includes(CONNECTION_TEXT.confirm) && confirming.includes('role="alertdialog"'));
  assert.ok(confirming.includes('data-testid="claude-connection-confirm-button"') && confirming.includes('data-testid="claude-connection-cancel-button"'));
  assert.ok(!confirming.includes("disabled") && !confirming.includes("claude-connection-disconnect-button"));
  const sending = view({ phase: "sending" });
  assert.equal((sending.match(/disabled=""/g) ?? []).length, 2);
  assert.ok(sending.includes(CONNECTION_TEXT.sending));
  assert.ok(!sending.includes(CONNECTION_TEXT.disconnected), "요청 중을 성공으로 보이지 않는다");
});

test("S21 해제 결과 판정: 204만 성공이고 실패·결과 불명은 각각 다른 안내다", () => {
  assert.deepEqual(classifyDisconnect(noContent), { tone: "done", text: CONNECTION_TEXT.disconnected });
  assert.deepEqual(classifyDisconnect({ kind: "success", status: 200, data: {} }), { tone: "error", text: CONNECTION_TEXT.disconnectUnknown });
  assert.deepEqual(classifyDisconnect({ kind: "lookup-failed", status: null, code: "LOOKUP_FAILED" }), { tone: "error", text: CONNECTION_TEXT.disconnectUnknown });
  for (const code of ["INTERNAL_ERROR", "AUTH_ORIGIN_FORBIDDEN", "AUTH_INVALID"]) {
    assert.deepEqual(classifyDisconnect({ kind: "api-error", status: 500, code, message: "서버가 보낸 안내" }), { tone: "error", text: CONNECTION_TEXT.disconnectFailed });
  }
  const done = view({ notice: { tone: "done", text: CONNECTION_TEXT.disconnected } });
  assert.ok(done.includes(CONNECTION_TEXT.disconnected) && done.includes('role="status"'));
  const failed = view({ notice: { tone: "error", text: CONNECTION_TEXT.disconnectFailed } });
  assert.ok(failed.includes(CONNECTION_TEXT.disconnectFailed) && failed.includes('role="alert"'));
});

test("S21 해제 요청: DELETE를 본문 없이 보내고 성공하면 상태를 다시 읽으며, 실패하면 다시 보내지 않고 다시 읽지 않는다", async () => {
  async function run(result) {
    const record = { sent: [], phases: [], notices: [], reloads: 0 };
    await confirmDisconnect({
      member: async (path, request) => { record.sent.push({ path, request }); if (result instanceof Error) throw result; return result; },
      setPhase: (phase) => record.phases.push(phase),
      setNotice: (notice) => record.notices.push(notice),
      reload: () => { record.reloads += 1; },
    });
    return record;
  }
  const done = await run(noContent);
  assert.deepEqual(done.sent, [{ path: "/me/mcp-connection", request: { method: "DELETE" } }]);
  assert.deepEqual(done.phases, ["sending", "idle"]);
  assert.deepEqual(done.notices, [null, { tone: "done", text: CONNECTION_TEXT.disconnected }]);
  assert.equal(done.reloads, 1);
  for (const [result, text] of [
    [{ kind: "api-error", status: 500, code: "INTERNAL_ERROR", message: "서버가 보낸 안내" }, CONNECTION_TEXT.disconnectFailed],
    [{ kind: "lookup-failed", status: null, code: "LOOKUP_FAILED" }, CONNECTION_TEXT.disconnectUnknown],
    [new Error("synthetic failure"), CONNECTION_TEXT.disconnectUnknown],
  ]) {
    const failed = await run(result);
    assert.equal(failed.sent.length, 1);
    assert.deepEqual(failed.notices, [null, { tone: "error", text }]);
    assert.deepEqual(failed.phases, ["sending", "idle"]);
    assert.equal(failed.reloads, 0);
  }
});

test("서버 렌더링은 불러오는 중을 보이고 토큰이 없으면 요청을 보내지 않는다", async (t) => {
  const sent = recordFetch(t, () => ({ body: statusOf("NONE") }));
  const html = renderToStaticMarkup(createElement(ClaudeConnectionPanel));
  assert.ok(html.includes(CONNECTION_TEXT.loading));
  const harness = createHookHarness(ClaudeConnectionPanel, {});
  t.after(() => harness.dispose());
  harness.render();
  harness.effects();
  assert.equal(harness.render().props.lookup, null);
  assert.deepEqual(sent, []);
});

/** 연결 관리 화면을 hook 도우미로 돌린다. */
function mountPanel(t) {
  const harness = createHookHarness(ClaudeConnectionPanel, {});
  t.after(() => harness.dispose());
  const element = () => harness.render();
  element();
  harness.effects();
  return { harness, element };
}

test("S21 화면: 상태를 읽어 보이고 복사하면 클립보드에 mcpUrl을 쓰며 복사 실패도 표시한다", async (t) => {
  await signIn(t);
  recordFetch(t, () => ({ body: statusOf("ACTIVE") }));
  const written = [];
  let denied = false;
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard: { writeText: async (text) => {
    if (denied) throw new Error("synthetic denied");
    written.push(text);
  } } } });
  t.after(() => Object.defineProperty(globalThis, "navigator", original));
  const { element } = mountPanel(t);
  assert.equal(element().props.lookup, null);
  await until(() => element().props.lookup !== null);
  assert.deepEqual(element().props.lookup, loaded("ACTIVE"));
  element().props.onCopy();
  await until(() => element().props.copyResult === "copied");
  assert.deepEqual(written, [MCP_URL]);
  denied = true;
  element().props.onCopy();
  await until(() => element().props.copyResult === "failed");
});

test("S21 화면: 해제 확인 뒤 DELETE를 보내고 204면 상태를 다시 읽어 NONE을 보인다", async (t) => {
  await signIn(t);
  let connected = true;
  const sent = recordFetch(t, (request) => {
    if (request.method === "DELETE") {
      connected = false;
      return { status: 204 };
    }
    return { body: statusOf(connected ? "ACTIVE" : "NONE") };
  });
  const { harness, element } = mountPanel(t);
  await until(() => element().props.lookup !== null);
  element().props.onOpen();
  assert.equal(element().props.phase, "confirming");
  element().props.onCancel();
  assert.equal(element().props.phase, "idle");
  assert.equal(sent.length, 1, "취소하면 보내지 않는다");
  element().props.onOpen();
  element().props.onConfirm();
  assert.equal(element().props.phase, "sending");
  await until(() => element().props.notice !== null);
  assert.deepEqual(element().props.notice, { tone: "done", text: CONNECTION_TEXT.disconnected });
  assert.equal(element().props.lookup, null, "다시 읽는 동안 불러오는 중이다");
  harness.effects();
  await until(() => element().props.lookup !== null);
  assert.deepEqual(element().props.lookup, loaded("NONE"));
  assert.deepEqual(sent.map((request) => [request.method, request.path, request.body]), [
    ["GET", CONNECTION_PATH, undefined], ["DELETE", CONNECTION_PATH, undefined], ["GET", CONNECTION_PATH, undefined],
  ]);
});

test("S21 화면: 해제가 실패하면 오류를 보이고 상태를 그대로 두며, 조회 실패는 다시 불러오기로 같은 조회만 한다", async (t) => {
  await signIn(t);
  const sent = recordFetch(t, (request, order) => {
    if (order === 1) return API_ERROR(500, "INTERNAL_ERROR");
    return request.method === "DELETE" ? API_ERROR(500, "INTERNAL_ERROR") : { body: statusOf("ACTIVE") };
  });
  const { harness, element } = mountPanel(t);
  await until(() => element().props.lookup !== null);
  assert.deepEqual(element().props.lookup, { kind: "failed" });
  element().props.onCopy();
  element().props.onRetry();
  element();
  harness.effects();
  await until(() => element().props.lookup?.kind === "loaded");
  assert.equal(element().props.copyResult, null, "조회 실패 때는 복사할 주소가 없다");
  element().props.onOpen();
  element().props.onConfirm();
  await until(() => element().props.notice !== null);
  assert.deepEqual(element().props.notice, { tone: "error", text: CONNECTION_TEXT.disconnectFailed });
  assert.equal(element().props.phase, "idle");
  assert.deepEqual(element().props.lookup, loaded("ACTIVE"), "실패를 해제로 보이지 않는다");
  assert.deepEqual(sent.map((request) => request.method), ["GET", "GET", "DELETE"]);
  element().props.onOpen();
  assert.equal(element().props.notice, null, "다시 열면 지난 안내를 지운다");
});

test("BR7.5 상세 프로필에서 연결 관리 화면으로 잇는다", () => {
  const source = readFileSync(new URL("../src/features/profile/profile-detail.tsx", import.meta.url), "utf8");
  assert.ok(source.includes("href={routes.profileClaude}"));
});

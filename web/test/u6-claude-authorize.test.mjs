import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { API_ERROR, CONNECTION_PATH, load, recordFetch, signIn, until } from "./u6-harness.mjs";
import { createHookHarness } from "./u7-hooks.mjs";

// 12월 intent U6 승인 화면(기능 설계 W2·BR3.2~BR3.6, 비기능 NFR1.8, 시나리오 S21).
// 실제 api·브라우저 없이 본다. 기록용 fetch로 공통 호출 함수까지 거치고, 이동은 기록용 함수가 받는다. 실제 Claude 연결 확인(S22~S24)이 아니다.
const {
  AUTHORIZE_TEXT, authorizeView, classifyDecision, parseAuthorizeQuery, readConnectionStatus, submitDecision,
} = await load("features/claude-connection/claude-connection.ts");
const { ClaudeAuthorizeView } = await load("features/claude-connection/claude-authorize-view.tsx");
const { ClaudeAuthorizeScreen } = await load("features/claude-connection/claude-authorize-screen.tsx");
const { routes } = await load("lib/routes.ts");

const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const RETURN_TO = `${REDIRECT}?code=synthetic-code&state=synthetic-state`;
const QUERY = {
  client_id: "synthetic-client",
  redirect_uri: REDIRECT,
  state: "synthetic-state",
  code_challenge: "synthetic-challenge",
  resource: "https://catchu.example/v1/mcp",
};
const search = (values = QUERY) => `?${new URLSearchParams(values)}`;
const parsed = () => parseAuthorizeQuery(search());
const status = (state) => ({ state, expiresAt: state === "NONE" ? null : "2026-11-09T00:00:00.000Z", mcpUrl: "https://catchu.example/v1/mcp" });
const loaded = (state) => ({ kind: "loaded", status: status(state) });
const lookupFailed = { kind: "lookup-failed", status: null, code: "LOOKUP_FAILED" };
const redirected = { kind: "success", status: 200, data: { redirectTo: RETURN_TO } };

function view(props) {
  return renderToStaticMarkup(createElement(ClaudeAuthorizeView, { sending: false, message: null, onApprove() {}, onDeny() {}, onRetry() {}, ...props }));
}
const ready = (state, consentRequired = false) => authorizeView(search(), loaded(state), consentRequired);

/** submitDecision에 넘길 기록용 묶음. */
function decisionDeps(result) {
  const record = { sent: [], navigated: [], sending: [], messages: [], consent: [] };
  const deps = {
    member: async (path, request) => { record.sent.push({ path, request }); if (result instanceof Error) throw result; return result; },
    navigate: (url) => record.navigated.push(url),
    setSending: (value) => record.sending.push(value),
    setMessage: (value) => record.messages.push(value),
    setConsentRequired: (value) => record.consent.push(value),
  };
  return { record, deps };
}

test("쿼리: 다섯 값과 돌아갈 주소의 호스트를 읽고 state·resource는 없어도 된다", () => {
  assert.deepEqual(parsed(), { clientId: "synthetic-client", redirectUri: REDIRECT, state: "synthetic-state", codeChallenge: "synthetic-challenge",
    resource: "https://catchu.example/v1/mcp", host: "claude.ai" });
  const minimal = parseAuthorizeQuery(search({ client_id: "c", redirect_uri: "http://127.0.0.1:6274/cb", code_challenge: "x" }));
  assert.equal(minimal.state, undefined);
  assert.equal(minimal.resource, undefined);
  assert.equal(minimal.host, "127.0.0.1:6274", "포트까지 보인다");
  assert.equal(parseAuthorizeQuery(search({ ...QUERY, redirect_uri: "https://user@evil.example/cb" })).host, "evil.example", "주소의 실제 호스트를 보인다");
});

test("잘못된 쿼리: 필수 값이 없거나 돌아갈 주소가 http(s)가 아니면 오류를 보이고 버튼이 없다", () => {
  const wrong = [
    {},
    { ...QUERY, client_id: "" },
    { ...QUERY, code_challenge: "" },
    { client_id: "c", code_challenge: "x" },
    { ...QUERY, redirect_uri: "javascript:alert(1)" },
    { ...QUERY, redirect_uri: "data:text/html,x" },
    { ...QUERY, redirect_uri: "not-a-url" },
  ];
  for (const values of wrong) {
    const params = new URLSearchParams(values);
    assert.equal(parseAuthorizeQuery(`?${params}`), null, String(params));
    const html = view({ view: authorizeView(`?${params}`, loaded("NONE"), false) });
    assert.ok(html.includes('role="alert"') && html.includes(AUTHORIZE_TEXT.invalid));
    assert.ok(!html.includes("<button"), "승인할 수 없다");
  }
});

test("S21 동의 화면: 연결 행이 없으면(NONE) 동의 안내·호스트·직접 시작 안내를 보이고 clientName과 쿼리 값은 그리지 않는다", () => {
  const html = renderToStaticMarkup(createElement(ClaudeAuthorizeView, {
    view: authorizeView(search({ ...QUERY, client_name: "SYNTHETIC-CLIENT-NAME", state: "<script>alert(1)</script>" }), loaded("NONE"), false),
    sending: false, message: null, onApprove() {}, onDeny() {}, onRetry() {},
  }));
  assert.ok(html.includes(AUTHORIZE_TEXT.consent));
  assert.ok(html.includes("공개·비공개 Catch") && html.includes("앞으로 저장할 텍스트 자료"));
  assert.ok(html.includes('data-testid="claude-authorize-host">claude.ai<'));
  assert.ok(html.includes("직접 시작한 연결이 아니면 취소하세요"));
  assert.ok(html.includes(AUTHORIZE_TEXT.approveWithConsent));
  assert.ok(html.includes('data-testid="claude-authorize-approve-button"') && html.includes('data-testid="claude-authorize-cancel-button"'));
  for (const hidden of ["SYNTHETIC-CLIENT-NAME", "<script>", "script", "synthetic-challenge", "synthetic-client"]) assert.ok(!html.includes(hidden), hidden);
});

test("S21 재승인 화면: ACTIVE·EXPIRED는 재승인 안내와 직접 시작 안내를 보이고 동의 안내는 없으며 버튼을 눌러야 한다", () => {
  for (const state of ["ACTIVE", "EXPIRED"]) {
    const html = view({ view: ready(state) });
    assert.ok(html.includes(AUTHORIZE_TEXT.reapprove), state);
    assert.ok(html.includes("직접 시작한 연결이 아니면 취소하세요"));
    assert.ok(!html.includes(AUTHORIZE_TEXT.consent));
    assert.ok(html.includes('data-testid="claude-authorize-host">claude.ai<'));
    assert.ok(html.includes(`>${AUTHORIZE_TEXT.approve}<`));
  }
});

test("S21 불러오는 중과 조회 실패를 동의·재승인으로 바꾸지 않는다", () => {
  assert.deepEqual(authorizeView(null, null, false), { kind: "loading" });
  assert.deepEqual(authorizeView(search(), null, false), { kind: "loading" });
  assert.deepEqual(authorizeView(search(), { kind: "failed" }, false), { kind: "lookup-failed" });
  const loading = view({ view: { kind: "loading" } });
  assert.ok(loading.includes('role="status"') && !loading.includes("<button"));
  const failed = view({ view: { kind: "lookup-failed" } });
  assert.ok(failed.includes('role="alert"') && failed.includes(AUTHORIZE_TEXT.lookupFailed) && failed.includes("다시 불러오기"));
  assert.ok(!failed.includes(AUTHORIZE_TEXT.consent) && !failed.includes("claude-authorize-approve-button"));
});

test("S21 요청 중에는 버튼을 막고 요청 중임을 보이며, 실패 안내는 alert다", () => {
  const sending = view({ view: ready("NONE"), sending: true });
  assert.equal((sending.match(/disabled=""/g) ?? []).length, 2);
  assert.ok(sending.includes(AUTHORIZE_TEXT.sending) && sending.includes('role="status"'));
  const failed = view({ view: ready("ACTIVE"), message: AUTHORIZE_TEXT.failed });
  assert.ok(failed.includes('role="alert"') && failed.includes(AUTHORIZE_TEXT.failed));
  assert.ok(!failed.includes("disabled"));
});

test("결과 판정: redirectTo가 http(s) 주소일 때만 이동하고 그 밖은 실패다", () => {
  assert.deepEqual(classifyDecision(redirected), { kind: "redirect", url: RETURN_TO });
  assert.deepEqual(classifyDecision({ kind: "success", status: 200, data: { redirectTo: "http://127.0.0.1:6274/cb?code=x" } }), { kind: "redirect", url: "http://127.0.0.1:6274/cb?code=x" });
  for (const data of [{ redirectTo: "javascript:alert(1)" }, { redirectTo: "data:text/html,x" }, { redirectTo: "/relative" }, { redirectTo: 1 }, {}, null, [RETURN_TO]]) {
    assert.deepEqual(classifyDecision({ kind: "success", status: 200, data }), { kind: "failed", message: AUTHORIZE_TEXT.unknown }, JSON.stringify(data));
  }
  assert.deepEqual(classifyDecision(API_RESULT(409, "MCP_CONSENT_REQUIRED")), { kind: "consent-required" });
  assert.deepEqual(classifyDecision(API_RESULT(400, "MCP_AUTHORIZATION_INVALID")), { kind: "failed", message: AUTHORIZE_TEXT.invalid });
  for (const code of ["VALIDATION_FAILED", "AUTH_ORIGIN_FORBIDDEN", "INTERNAL_ERROR", "AUTH_INVALID"]) {
    assert.deepEqual(classifyDecision(API_RESULT(500, code)), { kind: "failed", message: AUTHORIZE_TEXT.failed }, code);
  }
  assert.deepEqual(classifyDecision(lookupFailed), { kind: "failed", message: AUTHORIZE_TEXT.unknown });
});

test("S21 승인: 쿼리 값을 본문으로 되돌려 보내고 동의를 보였으면 consent를 싣고 응답의 redirectTo로만 이동한다", async () => {
  const { record, deps } = decisionDeps(redirected);
  await submitDecision(deps, parsed(), "APPROVE", true);
  assert.deepEqual(record.sent, [{ path: "/me/mcp-connection/authorizations", request: { method: "POST", body: {
    clientId: "synthetic-client", redirectUri: REDIRECT, state: "synthetic-state", codeChallenge: "synthetic-challenge",
    resource: "https://catchu.example/v1/mcp", decision: "APPROVE", consent: true,
  } } }]);
  assert.deepEqual(record.navigated, [RETURN_TO]);
  assert.notEqual(record.navigated[0], REDIRECT, "쿼리의 주소로 직접 이동하지 않는다");
  assert.deepEqual(record.sending, [true], "이동하는 동안 버튼을 막아 둔다");
  assert.deepEqual(record.messages, [null]);
});

test("S21 재승인은 consent를 보내지 않고, 취소는 DENY와 응답의 redirectTo로 이동한다", async () => {
  const again = decisionDeps(redirected);
  await submitDecision(again.deps, parsed(), "APPROVE", false);
  assert.equal(again.record.sent[0].request.body.consent, undefined);
  const denied = decisionDeps({ kind: "success", status: 200, data: { redirectTo: `${REDIRECT}?error=access_denied&state=synthetic-state` } });
  await submitDecision(denied.deps, parsed(), "DENY", true);
  assert.equal(denied.record.sent[0].request.body.decision, "DENY");
  assert.equal(denied.record.sent[0].request.body.consent, undefined, "취소에는 동의를 싣지 않는다");
  assert.deepEqual(denied.record.navigated, [`${REDIRECT}?error=access_denied&state=synthetic-state`]);
});

test("S21 MCP_CONSENT_REQUIRED면 동의 안내로 바꾸고 이동·자동 재전송 없이 버튼을 푼다", async () => {
  const { record, deps } = decisionDeps(API_RESULT(409, "MCP_CONSENT_REQUIRED"));
  await submitDecision(deps, parsed(), "APPROVE", false);
  assert.equal(record.sent.length, 1);
  assert.deepEqual(record.navigated, []);
  assert.deepEqual(record.consent, [true]);
  assert.deepEqual(record.messages, [null, AUTHORIZE_TEXT.consentRequired]);
  assert.deepEqual(record.sending, [true, false]);
  assert.equal(ready("ACTIVE", true).showConsent, true);
});

test("S21 그 밖의 실패는 안내만 보이고 어디로도 이동하지 않으며 다시 보내지 않는다. 호출 함수가 던져도 같다", async () => {
  const cases = [
    [API_RESULT(400, "MCP_AUTHORIZATION_INVALID"), AUTHORIZE_TEXT.invalid],
    [API_RESULT(500, "INTERNAL_ERROR"), AUTHORIZE_TEXT.failed],
    [lookupFailed, AUTHORIZE_TEXT.unknown],
    [{ kind: "success", status: 200, data: { redirectTo: "javascript:alert(1)" } }, AUTHORIZE_TEXT.unknown],
    [new Error("synthetic failure"), AUTHORIZE_TEXT.unknown],
  ];
  for (const [result, message] of cases) {
    const { record, deps } = decisionDeps(result);
    await submitDecision(deps, parsed(), "APPROVE", true);
    assert.equal(record.sent.length, 1);
    assert.deepEqual(record.navigated, []);
    assert.deepEqual(record.messages, [null, message]);
    assert.deepEqual(record.sending, [true, false]);
    assert.deepEqual(record.consent, []);
  }
});

test("서버 렌더링은 쿼리를 읽지 않고 불러오는 중을 보인다", () => {
  const html = renderToStaticMarkup(createElement(ClaudeAuthorizeScreen));
  assert.ok(html.includes(AUTHORIZE_TEXT.loading) && !html.includes("<button"));
});

/** 승인 화면을 hook 도우미로 돌린다. */
function mountScreen(t, query = search()) {
  const navigated = [];
  globalThis.window = { location: { search: query, assign: (url) => navigated.push(url) } };
  const harness = createHookHarness(ClaudeAuthorizeScreen, {});
  t.after(() => {
    harness.dispose();
    delete globalThis.window;
  });
  const element = () => harness.render();
  element();
  harness.effects();
  return { harness, element, navigated };
}

test("S21 화면: 상태를 읽어 동의 안내를 보이고 승인하면 POST 뒤 redirectTo로 이동한다", async (t) => {
  await signIn(t);
  const sent = recordFetch(t, (request) => (request.method === "GET" ? { body: status("NONE") } : { body: { redirectTo: RETURN_TO } }));
  const { element, navigated } = mountScreen(t);
  assert.equal(element().props.view.kind, "loading");
  await until(() => element().props.view.kind === "ready");
  assert.deepEqual(sent, [{ path: CONNECTION_PATH, method: "GET", body: undefined }]);
  assert.equal(element().props.view.showConsent, true);
  element().props.onApprove();
  assert.equal(element().props.sending, true, "요청 중에는 버튼을 막는다");
  await until(() => navigated.length === 1);
  assert.deepEqual(navigated, [RETURN_TO]);
  assert.deepEqual(sent[1], { path: `${CONNECTION_PATH}/authorizations`, method: "POST", body: {
    clientId: "synthetic-client", redirectUri: REDIRECT, state: "synthetic-state", codeChallenge: "synthetic-challenge",
    resource: "https://catchu.example/v1/mcp", decision: "APPROVE", consent: true,
  } });
});

test("S21 화면: 재승인 안내에서 서버가 동의를 요구하면 동의 안내로 바뀌고, 다시 누르면 consent를 싣는다", async (t) => {
  await signIn(t);
  const sent = recordFetch(t, (request, order) => {
    if (request.method === "GET") return { body: status("EXPIRED") };
    return order === 2 ? API_ERROR(409, "MCP_CONSENT_REQUIRED") : { body: { redirectTo: RETURN_TO } };
  });
  const { element, navigated } = mountScreen(t);
  await until(() => element().props.view.kind === "ready");
  assert.equal(element().props.view.showConsent, false);
  element().props.onApprove();
  await until(() => element().props.message === AUTHORIZE_TEXT.consentRequired);
  assert.equal(element().props.view.showConsent, true);
  assert.equal(element().props.sending, false);
  assert.deepEqual(navigated, []);
  assert.equal(sent[1].body.consent, undefined);
  element().props.onApprove();
  await until(() => navigated.length === 1);
  assert.equal(sent[2].body.consent, true);
});

test("S21 화면: 취소는 DENY를 보내고, 실패하면 오류를 보이며 이동하지 않는다", async (t) => {
  await signIn(t);
  const sent = recordFetch(t, (request) => (request.method === "GET" ? { body: status("ACTIVE") } : API_ERROR(500, "INTERNAL_ERROR")));
  const { element, navigated } = mountScreen(t);
  await until(() => element().props.view.kind === "ready");
  element().props.onDeny();
  await until(() => element().props.message !== null);
  assert.equal(element().props.message, AUTHORIZE_TEXT.failed);
  assert.equal(sent[1].body.decision, "DENY");
  assert.equal(sent.length, 2, "자동으로 다시 보내지 않는다");
  assert.deepEqual(navigated, []);
});

test("S21 화면: 조회 실패는 다시 불러오기로 같은 조회만 다시 하고, 그 상태에서는 눌러도 승인을 보내지 않는다", async (t) => {
  await signIn(t);
  const sent = recordFetch(t, (_request, order) => (order === 1 ? API_ERROR(500, "INTERNAL_ERROR") : { body: status("NONE") }));
  const { harness, element } = mountScreen(t);
  await until(() => element().props.view.kind === "lookup-failed");
  element().props.onApprove();
  assert.equal(sent.length, 1, "조회 실패 상태에서는 승인을 보내지 않는다");
  element().props.onRetry();
  element();
  harness.effects();
  await until(() => element().props.view.kind === "ready");
  assert.deepEqual(sent.map((request) => request.method), ["GET", "GET"]);
});

test("읽어 온 상태의 모양이 다르면 조회 실패로 본다", async () => {
  const read = (result) => readConnectionStatus(async () => result);
  assert.deepEqual(await read({ kind: "success", status: 200, data: status("NONE") }), { kind: "loaded", status: status("NONE") });
  for (const data of [null, [], { state: "UNKNOWN", expiresAt: null, mcpUrl: "x" }, { state: "NONE", expiresAt: null, mcpUrl: "" }, { state: "NONE", expiresAt: null },
    { state: "ACTIVE", expiresAt: "not-a-date", mcpUrl: "x" }, { state: "ACTIVE", expiresAt: 1, mcpUrl: "x" }]) {
    assert.deepEqual(await read({ kind: "success", status: 200, data }), { kind: "failed" }, JSON.stringify(data));
  }
  assert.deepEqual(await read(lookupFailed), { kind: "failed" });
  assert.deepEqual(await read(API_RESULT(500, "INTERNAL_ERROR")), { kind: "failed" });
  assert.deepEqual(await readConnectionStatus(async () => { throw new Error("synthetic failure"); }), { kind: "failed" });
});

test("NFR1.8 승인 화면 주소에 기존 web 보안 헤더 둘이 그대로 붙고 페이지가 정한 주소에 있다", async () => {
  const { default: nextConfig } = await import("../next.config.ts");
  assert.equal(routes.profileClaudeAuthorize, "/profile/claude/authorize");
  assert.equal(routes.profileClaude, "/profile/claude");
  // 헤더 규칙은 모든 경로(/:path*)에 하나뿐이고 승인 화면만의 예외가 없다. 실제 응답은 빌드 뒤 서버로 따로 확인한다(code-summary).
  const rules = await nextConfig.headers();
  assert.deepEqual(rules.map((rule) => rule.source), ["/:path*"]);
  const value = (name) => rules[0].headers.find((header) => header.key === name)?.value;
  assert.ok(value("Content-Security-Policy").split("; ").includes("frame-ancestors 'none'"));
  assert.equal(value("Referrer-Policy"), "strict-origin-when-cross-origin");
  for (const path of ["profile/claude/page.tsx", "profile/claude/authorize/page.tsx"]) {
    assert.ok(existsSync(new URL(`../src/app/(member)/${path}`, import.meta.url)), path);
  }
});

function API_RESULT(status, code) {
  return { kind: "api-error", status, code, message: "서버가 보낸 안내" };
}

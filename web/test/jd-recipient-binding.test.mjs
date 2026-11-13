/** #482 실제 U4 화면/상태/grant와 U10 연결 영향. HTTP 응답은 합성이며 실제 브라우저·외부 AI 검사가 아니다. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createApiClient } from "../src/lib/api-client.ts";
import { createAccessTokenStore } from "../src/lib/access-token.ts";
import { createMemberJdApi } from "../src/features/jd/jd-api.ts";
import { createJdSummaryModel } from "../src/features/jd/jd-summary-model.ts";
import { createJdRecipientCallbacks } from "../src/features/jd/jd-recipient-binding.ts";
import { createRecipientApi } from "../src/features/recipient/recipient-api.ts";
import { createGrantStore } from "../src/features/recipient/recipient-grants.ts";
import { createRecipientPublicationStore } from "../src/features/recipient/recipient-store.ts";
import { resolveEvidenceTarget } from "../src/features/recipient/recipient-slots.ts";
import { load } from "./u2-render.mjs";

process.env.NEXT_PUBLIC_API_BASE_URL ??= "http://127.0.0.1:3001";
const { RecipientPublicationView } = await load("features/recipient/recipient-view.tsx");
const { JdRecipientPanel } = await load("features/jd/jd-recipient-panel.tsx");
const { JdItemView } = await load("features/jd/jd-result-view.tsx");
const ID = "00000000-0000-4000-8000-000000000031";
const RUN = "00000000-0000-4000-8000-000000000032";
const ITEM = "00000000-0000-4000-8000-000000000033";
const TOKEN = "u10-c11-synthetic-link";
const BASE = `/public/links/${TOKEN}`;
const now = "2026-11-06T08:00:00.000Z";
const publication = { title: "C11 합성 발행본", publishedAt: now, expiresAt: "2027-02-04T08:00:00.000Z",
  items: [{ publishedItemId: ITEM, position: 0, itemKind: "TEXT_MATERIAL", title: "합성 자료", snapshot: { body: "앞말 합성 근거 뒷말" } }] };
const location = { publishedItemId: ITEM, fieldPath: "body", charStart: 3, charEnd: 8, pdfPage: null };
const cited = { kind: "CITED", text: "자료에 표시된 합성 내용", jdRole: "EVIDENCE",
  citations: [{ sourceId: ITEM, sourceLabel: "합성 자료", quote: "합성 근거", location }] };
const run = { status: "DONE", failureCode: null, requirements: [{ requirementIndex: 0, sourceLineNumber: 1, jdLine: "합성 요구사항",
  status: "DONE", resultKind: "CONTENT", failureCode: null, evidenceItems: [cited], unconfirmedPoints: [], interviewQuestions: [] }] };
const jd = { jdId: ID, title: "C11 합성 JD", updatedAt: now };
const runItem = { runId: RUN, title: jd.title, createdAt: now, status: "DONE", requirementCount: 1, emptyCount: 0, failedCount: 0 };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const rejected = (code, status) => json({ code, message: "합성 서버 오류" }, status);
const page = (items) => json({ items, nextCursor: null });
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

function findElement(node, predicate) {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) return node.map((child) => findElement(child, predicate)).find(Boolean);
  return predicate(node) ? node : findElement(node.props?.children, predicate);
}
function viewProps(snapshot, slotProps, highlight = null) {
  return { snapshot, slotProps, highlight, headingRef: { current: null }, onRetry() {}, onUnlock: async () => "ignored", waitSeconds: () => 0 };
}
const ready = () => ({ view: "ready", snapshot: publication, refreshing: false, refreshFailed: false });

function setup({ loggedIn = true } = {}) {
  const tokens = createAccessTokenStore();
  if (loggedIn) tokens.set("synthetic-member-a");
  const grants = createGrantStore(() => null);
  const calls = [];
  const responses = { member: null, publication: null };
  const common = createApiClient({ baseUrl: "http://127.0.0.1:3001", tokens, fetch: async (url, request) => {
    const path = new URL(url).pathname.slice(3);
    calls.push({ path, ...request });
    if (path === `${BASE}/unlock`) return json({ grant: "synthetic-c11-grant" });
    if (path === BASE) return responses.publication ? responses.publication(request)
      : request.headers["X-Link-Grant"] ? json(publication) : rejected("LINK_PASSWORD_REQUIRED", 401);
    if (responses.member) return responses.member(path, request);
    if (path === "/jds") return page([jd]);
    if (request.method === "POST") return json({ runId: RUN }, 202);
    if (path.endsWith(RUN)) return json(run);
    return page([runItem]);
  } });
  const store = createRecipientPublicationStore({ api: createRecipientApi(common.recipient), grants, token: TOKEN });
  const callbacks = createJdRecipientCallbacks({ getGrant: () => grants.get(TOKEN), onAccessLost: (code) => store.accessLost(code) });
  const context = { token: TOKEN, isLoggedIn: loggedIn, getGrant: callbacks.getGrant, onAccessLost: callbacks.onAccessLost };
  const client = createMemberJdApi(common.member);
  const deps = { session: () => tokens.get(), isLoggedIn: () => tokens.get().token !== null };
  const model = createJdSummaryModel(client, context, deps);
  return { tokens, grants, calls, responses, store, callbacks, context, client, deps, model };
}
async function unlock(s) { await s.store.load(); assert.equal(s.store.getSnapshot().view, "password");
  assert.equal(await s.store.unlock("synthetic-password"), "granted"); assert.equal(s.store.getSnapshot().view, "ready"); }

test("C11 4번 자리는 실제 U10 wrapper에 다섯 props를 전달하고 비로그인은 안내만 보인다", async () => {
  const s = setup({ loggedIn: false });
  const props = { ...s.context, showEvidence() {} };
  const tree = RecipientPublicationView(viewProps(ready(), props));
  const slots = findElement(tree, (node) => typeof node.type === "function" && node.type.name === "RecipientSlots");
  const panel = findElement(slots.type(slots.props), (node) => node.type === JdRecipientPanel);
  for (const key of ["token", "getGrant", "onAccessLost", "isLoggedIn", "showEvidence"]) assert.equal(panel.props[key], props[key]);
  assert.equal(panel.key, TOKEN);
  const html = renderToStaticMarkup(createElement(RecipientPublicationView, viewProps(ready(), props)));
  assert.ok(html.indexOf('data-testid="jd-summary-login"') > html.indexOf('data-testid="recipient-slot-4"'));
  assert.doesNotMatch(html, /jd-summary-start|jd-picker/);
  await s.model.loadJds(); await s.model.loadRuns(); assert.equal(s.calls.length, 0);
  for (const snapshot of [{ view: "password", unlock: { phase: "idle", retryAt: null, reentry: false } }, { view: "unavailable" }]) {
    assert.doesNotMatch(renderToStaticMarkup(createElement(RecipientPublicationView, viewProps(snapshot, props))), /recipient-slot-4|jd-summary-login/);
  }
});

test("U4 실제 unlock·grant 보관에서 U10 선택·접수·목록·재열람까지 공용 회원 호출로 이어진다", async () => {
  const s = setup(); await unlock(s);
  await s.model.loadJds(); s.model.selectJd(ID);
  await s.model.accept(async (request) => ({ kind: "result", result: await request(), retried: false }));
  assert.equal(s.model.store.get().selectedRun, RUN); assert.equal(s.model.store.get().result.status, "DONE");
  const posts = s.calls.filter((call) => call.path === `${BASE}/jd-summaries` && call.method === "POST");
  assert.equal(posts.length, 1); assert.deepEqual(JSON.parse(posts[0].body), { jdId: ID });
  for (const call of s.calls.filter((call) => call.path.includes("jd-summaries"))) {
    assert.equal(call.headers.Authorization, "Bearer synthetic-member-a");
    assert.equal(call.headers["X-Link-Grant"], "synthetic-c11-grant");
  }
  assert.equal(s.calls.find((call) => call.path === BASE).headers.Authorization, undefined);
  const reopened = createJdSummaryModel(s.client, s.context, s.deps);
  await reopened.loadRuns(); await reopened.selectRun(RUN);
  assert.equal(reopened.store.get().result.requirements[0].evidenceItems[0].citations[0].quote, "합성 근거");
  assert.equal(s.calls.filter((call) => call.path === `${BASE}/jd-summaries` && call.method === "POST").length, 1);
});

test("U4의 콜백 교체·강조 재렌더에서도 선택·결과를 유지하고 최신 grant와 접근 콜백을 쓴다", async () => {
  const s = setup(); await unlock(s); await s.model.loadJds(); s.model.selectJd(ID); await s.model.selectRun(RUN);
  const before = s.model.store.get(), viewId = s.model.viewId, getGrant = s.callbacks.getGrant, onLost = s.callbacks.onAccessLost;
  let latestLost = 0;
  s.grants.set(TOKEN, "synthetic-grant-updated");
  s.callbacks.update({ getGrant: () => s.grants.get(TOKEN), onAccessLost: (code) => { latestLost++; s.store.accessLost(code); } });
  assert.equal(s.callbacks.getGrant, getGrant); assert.equal(s.callbacks.onAccessLost, onLost);
  assert.equal(s.model.viewId, viewId); assert.equal(s.model.store.get(), before);
  await s.model.selectRun(RUN);
  assert.equal(s.calls.at(-1).headers["X-Link-Grant"], "synthetic-grant-updated");
  assert.equal(s.model.store.get().selectedJd, ID);
  s.responses.member = () => rejected("LINK_PASSWORD_REQUIRED", 401);
  await s.model.selectRun(RUN);
  assert.equal(latestLost, 1); assert.equal(s.store.getSnapshot().view, "password");
});

test("JD 링크 401·404는 U4 화면과 해당 grant를 정리하고 늦은 사본 응답도 복원하지 못한다", async () => {
  for (const [code, status, view] of [["LINK_PASSWORD_REQUIRED", 401, "password"], ["LINK_UNAVAILABLE", 404, "unavailable"]]) {
    const s = setup(); await unlock(s); s.grants.set("other-link", "other-grant"); await s.model.selectRun(RUN);
    const late = deferred(); s.responses.publication = () => late.promise;
    const refreshing = s.store.load();
    s.responses.member = () => rejected(code, status); await s.model.selectRun(RUN);
    assert.equal(s.model.store.get().result, null); assert.equal(s.store.getSnapshot().view, view);
    assert.equal(s.grants.get(TOKEN), null); assert.equal(s.grants.get("other-link"), "other-grant");
    late.resolve(json(publication)); await refreshing;
    assert.equal(s.store.getSnapshot().view, view); assert.equal(s.tokens.get().token, "synthetic-member-a");
  }
});

test("JD 회원 인증 상실은 U4 자료·grant를 유지하고 계정 교체의 늦은 결과는 패널에 남지 않는다", async () => {
  const s = setup(); await unlock(s); await s.model.selectRun(RUN);
  s.responses.member = () => rejected("AUTH_INVALID", 401); await s.model.selectRun(RUN);
  assert.equal(s.model.store.get().result, null); assert.equal(s.store.getSnapshot().view, "ready");
  assert.equal(s.grants.get(TOKEN), "synthetic-c11-grant");
  const changed = setup(); await unlock(changed);
  const late = deferred(); changed.responses.member = () => late.promise;
  const reading = changed.model.selectRun(RUN); changed.tokens.set("synthetic-member-b");
  late.resolve(json(run)); await reading;
  assert.equal(changed.model.store.get().result, null); assert.equal(changed.model.store.get().selectedRun, null);
  assert.equal(changed.store.getSnapshot().view, "ready"); assert.equal(changed.grants.get(TOKEN), "synthetic-c11-grant");
});

test("링크 교체로 해제한 JD 패널의 늦은 오류는 이전 U4 callback이나 새 링크 grant를 건드리지 않는다", async () => {
  const s = setup(); await unlock(s); s.grants.set("next-link", "next-grant");
  const late = deferred(); s.responses.member = () => late.promise;
  const reading = s.model.selectRun(RUN); s.model.dispose();
  late.resolve(rejected("LINK_UNAVAILABLE", 404)); await reading;
  assert.equal(s.store.getSnapshot().view, "ready"); assert.equal(s.grants.get("next-link"), "next-grant");
  assert.equal(s.grants.get(TOKEN), "synthetic-c11-grant"); assert.equal(s.model.store.get().result, null);
});

test("JD 근거 위치를 실제 U4 대조·사본 강조에 전달하고 같은 위치 재선택도 원문 범위를 유지한다", () => {
  const received = [];
  const item = JdItemView({ item: cited, showEvidence: (value) => received.push(value) });
  const button = findElement(item, (node) => node.type === "button");
  button.props.onClick(); button.props.onClick();
  assert.deepEqual(received, [location, location]); assert.equal(received[0], location);
  const target = resolveEvidenceTarget(publication, received[0]);
  assert.deepEqual(target.highlight, { publishedItemId: ITEM, fieldPath: "body", charStart: 3, charEnd: 8 });
  const props = { token: TOKEN, getGrant: () => null, onAccessLost() {}, isLoggedIn: false, showEvidence() {} };
  const html = renderToStaticMarkup(createElement(RecipientPublicationView, viewProps(ready(), props, target.highlight)));
  assert.match(html, /data-testid="snapshot-highlight">합성 근거<\/mark>/);
  assert.ok(html.includes(`id="published-item-${ITEM}"`));
});

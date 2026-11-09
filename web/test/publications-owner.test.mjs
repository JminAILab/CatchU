// U4 제출 2 — 발행본 목록·상세·중지·삭제 화면(W5) 시험.
//
// 먼저 정한 시나리오·기대 결과·실패 조건(U4 기능 명세 S9 작성자 쪽·S11~S13, BR7.2·BR7.3·BR8.1~BR8.4, 신뢰성 설계 「작성자 실패 안내」,
// 보안 설계 「web 화면 출력」, #416 2026-10-29 Q1 B·2026-11-02·11-03 [링크 열기] 결정). 세부 시험 코드는 구현 뒤 쓴다.
//
// - 기대: 목록은 본인 발행본을 서버가 준 최신순 그대로 보이고 [더 보기]로 이어 읽는다. 제목·상태·만료·링크 주소와 [URL 복사]는 상태와 관계없이,
//         [링크 열기]는 서버가 돌려준 상태가 `ACTIVE`일 때만 보이며 [URL 복사]와 같은 `url`을 `target="_blank"`·`rel="noopener noreferrer"`로 연다.
//         상세는 사본을 항목 순서대로 보이고 Catch는 기록 확인 내용·작성자 설명·AI 설명 초안·불일치 표지를 나눈다. 텍스트 자료 본문과 작성자 설명 안의
//         `https://github.com/…`만 새 탭 링크이고 그 밖의 주소·`aiDraft`·제목은 글자다. 고정 안내(BR7.2)와 비공개 전환 안내(BR7.3)가 보인다.
//         중지는 확인 뒤 `PUT .../stop` 응답의 state·stoppedAt을 반영하고(만료면 `{EXPIRED, null}`), 삭제는 확인 뒤 204일 때만 목록으로 간다.
// - 실패 조건: 중지·삭제 확인을 취소하면 요청하지 않는다. 삭제 실패는 "삭제되지 않았습니다"와 다시 시도이고 발행본은 화면에 그대로다.
//         조회 실패를 0건으로 보이지 않는다. 남의 것·없는 것(404)은 열 수 없다고 안내한다. 로그인이 바뀐 뒤 도착한 응답은 반영하지 않는다.
// - 실패로 보는 것: 접수만으로 중지·삭제 표시, `aiDraft`·GitHub가 아닌 주소가 링크로 그려짐, [링크 열기]가 `ACTIVE`가 아닌데 보임, 색인 상태·[검색 다시 준비]가 보임,
//         조작 요소에 data-testid 없음.
//
// 원본 tsx를 변환해 불러온다. 서버는 계약 모양 대역이며 실제 브라우저·api·DB 검증이 아니다. 받은 사람 판정(비밀번호·중지·만료·삭제)의 브라우저 확인은 제출 3이다.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { isGithubSourceUrl, splitGithubLinks } from "../src/lib/github-source-url.ts";
import { isGithubSourceUrl as recipientIsGithubSourceUrl } from "../src/features/recipient/recipient-format.ts";
import { createPublicationsApi, deleteErrorText, publicationListErrorText, publicationOpenErrorText, stopErrorText } from "../src/features/publications/publications-api.ts";
import { FIXED_COPY_NOTICE, SOURCE_PRIVATE_NOTICE, formatKst } from "../src/features/publications/publication-format.ts";

const srcUrl = new URL("../src/", import.meta.url);
const listScreenUrl = new URL("../src/features/publications/publications-list-screen.tsx", import.meta.url);
const listViewUrl = new URL("../src/features/publications/publications-list-view.tsx", import.meta.url);
const detailScreenUrl = new URL("../src/features/publications/publication-detail-screen.tsx", import.meta.url);
const detailViewUrl = new URL("../src/features/publications/publication-detail-view.tsx", import.meta.url);
const snapshotViewUrl = new URL("../src/features/publications/snapshot-view.tsx", import.meta.url);
const API_STUB = new URL("./__publications-stubs__/api.mjs", import.meta.url).href;
const NAVIGATION_STUB = new URL("./__publications-stubs__/navigation.mjs", import.meta.url).href;
const LINK_STUB = new URL("./u2-next-link-stub.mjs", import.meta.url).href;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/api") return { url: API_STUB, shortCircuit: true };
    if (specifier === "next/navigation") return { url: NAVIGATION_STUB, shortCircuit: true };
    if (specifier === "next/link") return { url: LINK_STUB, shortCircuit: true };
    const candidates = (base) => [".tsx", ".ts"].map((ext) => new URL(base.href + ext)).find((candidate) => existsSync(candidate));
    if (specifier.startsWith("@/")) return { url: candidates(new URL(specifier.slice(2), srcUrl)).href, shortCircuit: true };
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.endsWith(".tsx")) {
      const base = new URL(specifier, context.parentURL);
      if (!/\.(tsx?|css|mjs|js)$/.test(base.pathname)) {
        const url = candidates(base);
        if (url) return { url: url.href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === API_STUB) return { format: "module", shortCircuit: true, source: "export const api = { member: async () => ({ kind: 'lookup-failed', status: null, code: 'LOOKUP_FAILED' }) };" };
    if (url === NAVIGATION_STUB) return { format: "module", shortCircuit: true, source: "export const useRouter = () => ({ replace() {}, push() {} });" };
    if (url.endsWith(".module.css")) return { format: "module", shortCircuit: true, source: "export default {};" };
    if (url.endsWith(".tsx")) {
      return {
        format: "module", shortCircuit: true,
        source: ts.transpileModule(readFileSync(new URL(url), "utf8"), {
          compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext },
        }).outputText,
      };
    }
    return nextLoad(url, context);
  },
});
const { PublicationsListScreen, createPublicationsListModel } = await import(listScreenUrl.href);
const { PublicationsListView } = await import(listViewUrl.href);
const { DELETE_CONFIRM_MESSAGE, PublicationDetailScreen, STOP_CONFIRM_MESSAGE, createPublicationDetailModel } = await import(detailScreenUrl.href);
const { PublicationDetailView } = await import(detailViewUrl.href);
const { LinkedText, PublishedSnapshotView } = await import(snapshotViewUrl.href);
const { copyUrl } = await import(new URL("../src/features/publications/publication-link-actions.tsx", import.meta.url).href);
hooks.deregister();

const AT = "2026-11-03T01:02:03.456Z";
const EXPIRES = "2027-02-01T01:02:03.456Z";
const STOPPED_AT = "2026-11-04T00:00:00.000Z";
const P1 = "99999999-9999-4999-8999-999999999991";
const P2 = "99999999-9999-4999-8999-999999999992";
const P3 = "99999999-9999-4999-8999-999999999993";
const url = (n) => `https://web.example/s/synthetic-token-${n}000000000000000000000000000`;
const link = (publicationId, state = "ACTIVE", title = "발행본") => ({ publicationId, title, url: url(publicationId.at(-1)), state, publishedAt: AT, expiresAt: EXPIRES, passwordProtected: false });
const catchItem = (overrides = {}) => ({
  publishedItemId: "i1", position: 2, itemKind: "CATCH", title: "Catch https://github.com/o/r",
  snapshot: {
    workFacts: ["사실 1"], subjectContribution: "기여",
    evidence: [{ sourceUrl: "https://github.com/o/r/pull/1", sourceRevision: "abc", representedFacts: ["사실 1"] }, { sourceUrl: "http://evil.example/x", sourceRevision: "def", representedFacts: [] }],
    authorDescription: "설명 https://github.com/o/r/issues/2. 그리고 https://example.com/x",
    aiDraft: "초안 https://github.com/o/r/pull/3",
    mismatch: true,
    ...overrides,
  },
});
const textItem = (body = "본문 https://github.com/o/r/blob/main/README.md 와 http://github.com/o/r") =>
  ({ publishedItemId: "i2", position: 1, itemKind: "TEXT_MATERIAL", title: "자기소개 https://github.com/o/r", snapshot: { body } });
const snapshot = (items = [catchItem(), textItem()]) => ({ title: "발행본 제목", publishedAt: AT, expiresAt: EXPIRES, items });
const detail = (overrides = {}) => ({ publicationId: P1, url: url(1), state: "ACTIVE", passwordProtected: true, snapshot: snapshot(), ...overrides });
const page = (items, nextCursor = null) => ({ items, page: { nextCursor } });
const success = (data, status = 200) => ({ kind: "success", status, data });
const apiError = (status, code) => ({ kind: "api-error", status, code, message: "합성 메시지" });
const ok = (value) => ({ kind: "ok", value });
const failed = (failure) => ({ kind: "failed", failure });
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; }

function fakeMember(...responses) {
  const calls = [];
  return {
    calls,
    member: async (path, request) => {
      calls.push({ path, method: request?.method, body: request?.body });
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return next;
    },
  };
}

function fakeApi(responses = {}) {
  const calls = [];
  const queue = Object.fromEntries(Object.entries(responses).map(([k, v]) => [k, [...v]]));
  const next = (name) => {
    const value = queue[name]?.shift();
    if (value === undefined) throw new Error(`no response for ${name}`);
    return value && typeof value.promise === "object" ? value.promise : Promise.resolve(value);
  };
  return {
    calls,
    list: (cursor, signal) => { calls.push({ name: "list", cursor, signal }); return next("list"); },
    get: (id, signal) => { calls.push({ name: "get", id, signal }); return next("get"); },
    stop: (id) => { calls.push({ name: "stop", id }); return next("stop"); },
    remove: (id) => { calls.push({ name: "remove", id }); return next("remove"); },
  };
}

function deps({ confirm = () => true } = {}) {
  const d = { token: "session-a", confirms: [], session: () => d.token, confirm: (message) => { d.confirms.push(message); return confirm(message); } };
  return d;
}

test("API: 목록·상세·중지·삭제를 정한 경로·메서드로 부르고 성공 상태·모양이 맞을 때만 성공이다. indexState가 없어도 되고 있어도 무시한다", async () => {
  const fake = fakeMember(success(page([link(P1)], "next")), success({ ...detail(), indexState: "PENDING" }), success({ state: "STOPPED", stoppedAt: STOPPED_AT }), success(null, 204));
  const api = createPublicationsApi(fake.member);
  assert.deepEqual(await api.list("c u"), ok(page([link(P1)], "next")));
  const got = await api.get(P1);
  assert.equal(got.kind, "ok");
  assert.equal(got.value.snapshot.items.length, 2);
  assert.deepEqual(await api.stop(P1), ok({ state: "STOPPED", stoppedAt: STOPPED_AT }));
  assert.deepEqual(await api.remove(P1), ok(null));
  assert.deepEqual(fake.calls, [
    { path: "/publications?limit=20&cursor=c+u", method: "GET", body: undefined },
    { path: `/publications/${P1}`, method: "GET", body: undefined },
    { path: `/publications/${P1}/stop`, method: "PUT", body: undefined },
    { path: `/publications/${P1}`, method: "DELETE", body: undefined },
  ]);
  // 다른 ID 상세·모르는 상태·삭제 200·만료 중지 `{EXPIRED, null}`은 각각 실패·실패·실패·성공이다.
  const wrong = createPublicationsApi(fakeMember(success(detail({ publicationId: P2 })), success(page([{ ...link(P1), state: "PENDING" }])), success(null, 200), success({ state: "EXPIRED", stoppedAt: null })).member);
  assert.deepEqual(await wrong.get(P1), failed("unknown"));
  assert.deepEqual(await wrong.list(null), failed("unknown"));
  assert.deepEqual(await wrong.remove(P1), failed("unknown"));
  assert.deepEqual(await wrong.stop(P1), ok({ state: "EXPIRED", stoppedAt: null }));
  // 실패 구분과 안내.
  const cases = [[apiError(401, "AUTH_REQUIRED"), "login-expired"], [apiError(404, "RESOURCE_UNAVAILABLE"), "not-found"], [apiError(500, "INTERNAL_ERROR"), "server"], [new Error("network"), "unknown"]];
  for (const [response, failure] of cases) assert.deepEqual(await createPublicationsApi(fakeMember(response).member).remove(P1), failed(failure));
  assert.match(publicationListErrorText("server"), /발행본이 없다는 뜻은 아닙니다/);
  assert.match(publicationOpenErrorText("not-found"), /열 수 없습니다/);
  assert.match(stopErrorText("server"), /^링크가 중지되지 않았습니다/);
  assert.match(deleteErrorText("server"), /^삭제되지 않았습니다\. 다시 시도해 주세요/);
  assert.match(deleteErrorText("login-expired"), /로그인이 만료되었습니다/);
});

test("목록 모델: 조회 실패를 0건으로 보이지 않고, [더 보기]는 서버 순서대로 이어 붙이며, 다시 읽은 뒤의 늦은 다음 쪽과 로그인이 바뀐 뒤 응답은 버린다", async () => {
  const api = fakeApi({ list: [failed("server"), ok(page([link(P1), link(P2, "STOPPED")], "cursor-1")), failed("server"), ok(page([link(P3, "EXPIRED")]))] });
  const model = createPublicationsListModel(api, deps());
  await model.load();
  assert.equal(model.store.get().list.state, "error");
  assert.equal(model.store.get().list.errorText, publicationListErrorText("server"));
  await model.load();
  assert.deepEqual(model.store.get().list.items.map((i) => i.publicationId), [P1, P2]);
  await model.loadMore();
  assert.equal(model.store.get().moreState, "error");
  await model.loadMore();
  assert.deepEqual(model.store.get().list.items.map((i) => i.publicationId), [P1, P2, P3]);
  assert.equal(model.store.get().list.nextCursor, null);
  await model.loadMore();
  assert.equal(api.calls.filter((c) => c.name === "list").length, 4);

  const more = deferred();
  const api2 = fakeApi({ list: [ok(page([link(P1)], "cursor-1")), more, ok(page([link(P2)]))] });
  const model2 = createPublicationsListModel(api2, deps());
  await model2.load();
  const loadingMore = model2.loadMore();
  await model2.load();
  more.resolve(ok(page([link(P3)])));
  await loadingMore;
  assert.deepEqual(model2.store.get().list.items.map((i) => i.publicationId), [P2]);

  const d = deps();
  const pending = deferred();
  const model3 = createPublicationsListModel(fakeApi({ list: [pending] }), d);
  const loading = model3.load();
  d.token = "session-b";
  pending.resolve(ok(page([link(P1)])));
  await loading;
  assert.equal(model3.store.get().list.state, "loading");
  model3.dispose();
});

test("목록 화면: 제목·상태·만료·주소와 [URL 복사]는 늘 보이고 [링크 열기]는 ACTIVE 행에만 있으며, 조회 실패·0건·더 보기를 구분한다", () => {
  const view = (props) => renderToStaticMarkup(createElement(PublicationsListView, {
    state: "ready", items: [], hasMore: false, moreState: "idle", onRetry() {}, onLoadMore() {}, ...props,
  }));
  const list = view({ items: [link(P1, "ACTIVE", "유효한 것"), link(P2, "STOPPED", "중지한 것"), link(P3, "EXPIRED", "만료된 것")], hasMore: true });
  const rows = list.split('data-testid="publication-row"').slice(1);
  assert.equal(rows.length, 3);
  assert.match(rows[0], new RegExp(`<a[^>]*href="${url(1)}"[^>]*target="_blank"[^>]*rel="noopener noreferrer"[^>]*data-testid="publication-open-link"`));
  assert.ok(rows[0].includes(`data-testid="publication-item-url">${url(1)}<`));
  assert.doesNotMatch(rows[1], /publication-open-link/);
  assert.doesNotMatch(rows[2], /publication-open-link/);
  for (const row of rows) assert.ok(row.includes('data-testid="publication-copy-url"'));
  assert.ok(rows[1].includes("중지됨") && rows[1].includes("되살릴 수 없습니다"));
  assert.ok(rows[2].includes("만료됨"));
  assert.ok(list.includes(`href="/publications/${P1}"`));
  assert.ok(list.includes(formatKst(EXPIRES)));
  assert.ok(list.includes('data-testid="publications-load-more"'));
  assert.ok(list.includes('data-testid="publications-new-link"'));
  assert.doesNotMatch(list, /indexState|검색 다시 준비/);

  const failedView = view({ state: "error", errorText: publicationListErrorText("server") });
  assert.ok(failedView.includes('data-testid="publications-list-retry"'));
  assert.doesNotMatch(failedView, /publications-empty/);
  assert.ok(view({}).includes('data-testid="publications-empty"'));
  assert.doesNotMatch(view({ state: "loading" }), /publications-empty/);

  const screen = renderToStaticMarkup(createElement(PublicationsListScreen, { api: fakeApi(), deps: deps() }));
  assert.match(screen, /<h1>발행본<\/h1>/);
  assert.match(screen, /발행본 목록을 불러오고 있습니다/);
});

test("상세 모델: 불러와 보이고, 중지는 확인을 거쳐 응답의 state·stoppedAt을 반영한다. 취소하면 요청하지 않고, 실패면 상태를 바꾸지 않으며, 만료는 {EXPIRED, null}이다", async () => {
  const cancelled = deps({ confirm: () => false });
  const api1 = fakeApi({ get: [ok(detail())] });
  const m1 = createPublicationDetailModel(api1, P1, cancelled);
  await m1.load();
  assert.equal(m1.store.get().load, "ready");
  assert.equal(m1.store.get().detail.state, "ACTIVE");
  await m1.stop();
  assert.deepEqual(cancelled.confirms, [STOP_CONFIRM_MESSAGE]);
  assert.match(STOP_CONFIRM_MESSAGE, /되살릴 수 없습니다/);
  assert.equal(api1.calls.some((c) => c.name === "stop"), false);

  const api2 = fakeApi({ get: [ok(detail())], stop: [failed("server"), ok({ state: "STOPPED", stoppedAt: STOPPED_AT })] });
  const m2 = createPublicationDetailModel(api2, P1, deps());
  await m2.load();
  await m2.stop();
  assert.equal(m2.store.get().stopState.error, stopErrorText("server"));
  assert.equal(m2.store.get().detail.state, "ACTIVE"); // 접수만으로 중지를 표시하지 않는다
  await m2.stop();
  assert.equal(m2.store.get().stopState, "idle");
  assert.equal(m2.store.get().detail.state, "STOPPED");
  assert.equal(m2.store.get().stoppedAt, STOPPED_AT);
  await m2.stop(); // 이미 중지된 발행본은 다시 보내지 않는다
  assert.equal(api2.calls.filter((c) => c.name === "stop").length, 2);

  const api3 = fakeApi({ get: [ok(detail())], stop: [ok({ state: "EXPIRED", stoppedAt: null })] });
  const m3 = createPublicationDetailModel(api3, P1, deps());
  await m3.load();
  await m3.stop();
  assert.equal(m3.store.get().detail.state, "EXPIRED");
  assert.equal(m3.store.get().stoppedAt, null);

  // 열기 실패(남의 것·없는 것 404)와 다시 불러오기, 늦은 응답·로그인 변경.
  const api4 = fakeApi({ get: [failed("not-found"), ok(detail())] });
  const m4 = createPublicationDetailModel(api4, P1, deps());
  await m4.load();
  assert.equal(m4.store.get().load.error, publicationOpenErrorText("not-found"));
  m4.retry();
  await tick();
  assert.equal(m4.store.get().load, "ready");
  const late = deferred();
  const d = deps();
  const m5 = createPublicationDetailModel(fakeApi({ get: [late] }), P1, d);
  const loading = m5.load();
  d.token = "session-b";
  late.resolve(ok(detail()));
  await loading;
  assert.equal(m5.store.get().load, "loading");
  m5.dispose();
});

test("상세 모델: 삭제는 확인을 거치고, 취소하면 요청하지 않으며, 실패하면 삭제되지 않았다고 알리고 발행본을 그대로 두고, 204일 때만 삭제됨이다", async () => {
  const cancelled = deps({ confirm: () => false });
  const api1 = fakeApi({ get: [ok(detail())] });
  const m1 = createPublicationDetailModel(api1, P1, cancelled);
  await m1.load();
  await m1.remove();
  assert.deepEqual(cancelled.confirms, [DELETE_CONFIRM_MESSAGE]);
  assert.equal(api1.calls.some((c) => c.name === "remove"), false);
  assert.equal(m1.store.get().deleteState, "idle");

  const api2 = fakeApi({ get: [ok(detail({ state: "STOPPED" }))], remove: [failed("server"), failed("login-expired"), ok(null)] });
  const m2 = createPublicationDetailModel(api2, P1, deps());
  await m2.load();
  await m2.remove();
  assert.equal(m2.store.get().deleteState.error, "삭제되지 않았습니다. 다시 시도해 주세요.");
  assert.equal(m2.store.get().detail.publicationId, P1); // 발행본은 그대로
  await m2.remove();
  assert.match(m2.store.get().deleteState.error, /로그인이 만료되었습니다/);
  await m2.remove();
  assert.equal(m2.store.get().deleteState, "deleted");
  await m2.remove();
  await m2.stop();
  assert.equal(api2.calls.filter((c) => c.name === "remove").length, 3);
  assert.equal(api2.calls.some((c) => c.name === "stop"), false);

  // 삭제 중에는 중지를 보내지 않고, 로그인이 바뀐 뒤 도착한 삭제 성공은 반영하지 않는다.
  const pending = deferred();
  const d = deps();
  const api3 = fakeApi({ get: [ok(detail())], remove: [pending] });
  const m3 = createPublicationDetailModel(api3, P1, d);
  await m3.load();
  const deleting = m3.remove();
  assert.equal(m3.store.get().deleteState, "deleting");
  await m3.stop();
  assert.equal(api3.calls.some((c) => c.name === "stop"), false);
  d.token = "session-b";
  pending.resolve(ok(null));
  await deleting;
  assert.equal(m3.store.get().deleteState, "deleting");
});

test("사본 화면: 항목 순서대로 보이고 Catch는 기록·작성자 설명·AI 초안·불일치 표지를 나누며, 본문·작성자 설명의 GitHub 주소만 링크이고 그 밖의 주소·AI 초안·제목·근거의 비GitHub 주소는 글자다", () => {
  const html = renderToStaticMarkup(createElement(PublishedSnapshotView, { snapshot: snapshot() }));
  const items = html.split('data-testid="snapshot-item"').slice(1);
  assert.equal(items.length, 2);
  assert.ok(items[0].includes('data-kind="TEXT_MATERIAL"')); // position 1이 먼저
  assert.ok(items[1].includes('data-kind="CATCH"'));
  for (const id of ["snapshot-catch-facts", "snapshot-catch-description", "snapshot-catch-ai-draft", "snapshot-catch-mismatch", "snapshot-text-body"]) {
    assert.ok(html.includes(`data-testid="${id}"`), id);
  }
  assert.ok(html.includes("기록에서 확인한 내용") && html.includes("작성자 설명") && html.includes("AI 설명 초안") && html.includes("불일치 표시됨"));
  const links = [...html.matchAll(/<a [^>]*>/g)].map((m) => m[0]);
  for (const anchor of links) assert.match(anchor, /target="_blank"[^>]*rel="noopener noreferrer"/);
  const hrefs = links.map((anchor) => anchor.match(/href="([^"]+)"/)[1]);
  assert.deepEqual(hrefs, [
    "https://github.com/o/r/blob/main/README.md", // 텍스트 자료 본문(position 1)
    "https://github.com/o/r/pull/1", // 근거
    "https://github.com/o/r/issues/2", // 작성자 설명(끝의 마침표 제외)
  ]); // aiDraft의 pull/3은 링크가 없다
  assert.ok(html.includes("초안 https://github.com/o/r/pull/3"));
  assert.ok(html.includes("http://github.com/o/r") && !hrefs.includes("http://github.com/o/r"));
  assert.ok(html.includes("https://example.com/x") && !hrefs.includes("https://example.com/x"));
  assert.ok(html.includes("http://evil.example/x") && !hrefs.includes("http://evil.example/x"));
  assert.doesNotMatch(html, /<h3[^>]*>[^<]*<a /); // 제목에는 링크가 없다
  assert.ok(html.includes("Catch https://github.com/o/r"));

  // 빈 설명·초안은 다른 값으로 채우지 않고, 본문은 React 텍스트로만 그린다.
  const empty = renderToStaticMarkup(createElement(PublishedSnapshotView, { snapshot: snapshot([catchItem({ authorDescription: null, aiDraft: null, mismatch: false, evidence: [] }), textItem("<script>alert(1)</script>")]) }));
  assert.ok(empty.includes("작성자 설명이 없습니다.") && empty.includes("AI 설명 초안이 없습니다."));
  assert.doesNotMatch(empty, /snapshot-catch-mismatch/);
  assert.ok(empty.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  const pdf = renderToStaticMarkup(createElement(PublishedSnapshotView, { snapshot: snapshot([{ publishedItemId: "p", position: 1, itemKind: "PDF_MATERIAL", title: "PDF", snapshot: {} }]) }));
  assert.ok(pdf.includes("PDF 자료 표시는 준비 중입니다"));
});

test("GitHub 주소 판정: 받은 사람 화면의 isGithubSourceUrl과 같은 함수이고, 본문 나누기는 https://github.com/… 만 링크로, 끝 문장 부호·비GitHub·http·계정 정보가 든 주소는 글자로 둔다", () => {
  assert.equal(recipientIsGithubSourceUrl, isGithubSourceUrl);
  assert.equal(isGithubSourceUrl("https://github.com/o/r/pull/1"), true);
  for (const value of ["http://github.com/o/r", "https://github.com.evil/o", "https://user:pw@github.com/o", "github.com/o/r", "https://gist.github.com/x", ""]) {
    assert.equal(isGithubSourceUrl(value), false, value);
  }
  assert.deepEqual(splitGithubLinks("앞 https://github.com/o/r/pull/1. 뒤"), [
    { kind: "text", text: "앞 " }, { kind: "link", url: "https://github.com/o/r/pull/1" }, { kind: "text", text: ". 뒤" },
  ]);
  assert.deepEqual(splitGithubLinks("(https://github.com/o/r)와 https://github.com.evil/x 그리고 http://github.com/o"), [
    { kind: "text", text: "(" }, { kind: "link", url: "https://github.com/o/r" }, { kind: "text", text: ")와 https://github.com.evil/x 그리고 http://github.com/o" },
  ]);
  assert.deepEqual(splitGithubLinks("https://github.com:443/o/r?x=1#f\nhttps://github.com"), [
    { kind: "link", url: "https://github.com:443/o/r?x=1#f" }, { kind: "text", text: "\n" }, { kind: "link", url: "https://github.com" },
  ]);
  assert.deepEqual(splitGithubLinks("주소 없음"), [{ kind: "text", text: "주소 없음" }]);
  assert.deepEqual(splitGithubLinks("https://github.com/o/r의 코드와 https://github.coma/x"), [
    { kind: "link", url: "https://github.com/o/r" }, { kind: "text", text: "의 코드와 https://github.coma/x" },
  ]);
  assert.deepEqual(splitGithubLinks("https://user:pw@github.com/o/r 끝"), [{ kind: "text", text: "https://user:pw@github.com/o/r 끝" }]);
  const html = renderToStaticMarkup(createElement(LinkedText, { text: "a https://github.com/o/r b", testId: "t" }));
  assert.match(html, /<a href="https:\/\/github\.com\/o\/r" target="_blank" rel="noopener noreferrer" data-testid="snapshot-github-link">https:\/\/github\.com\/o\/r<span class="visually-hidden"> \(새 탭\)<\/span><\/a>/);
});

test("상세 화면: 주소·상태·만료·[URL 복사]와 고정 안내·비공개 전환 안내를 보이고, [링크 열기]·[링크 중지]는 ACTIVE에만 있으며, 요약 패널 자리는 비어 있고 실패 안내가 보인다", () => {
  const view = (props) => renderToStaticMarkup(createElement(PublicationDetailView, {
    detail: detail(), stoppedAt: null, stopState: "idle", deleteState: "idle", onStop() {}, onDelete() {}, ...props,
  }));
  const active = view({});
  assert.match(active, new RegExp(`<a[^>]*href="${url(1)}"[^>]*target="_blank"[^>]*rel="noopener noreferrer"[^>]*data-testid="publication-open-link"`));
  assert.ok(active.includes(`data-testid="publication-detail-url">${url(1)}<`));
  assert.ok(active.includes('data-testid="publication-copy-url"'));
  assert.ok(active.includes(formatKst(EXPIRES)));
  assert.ok(active.includes("설정됨"));
  assert.ok(active.includes(FIXED_COPY_NOTICE) && active.includes('data-testid="publication-fixed-notice"'));
  assert.ok(active.includes(SOURCE_PRIVATE_NOTICE) && active.includes('data-testid="publication-private-notice"'));
  assert.ok(active.includes('data-testid="publication-stop-button"') && active.includes('data-testid="publication-delete-button"'));
  assert.match(active, /<div data-testid="publication-summary-slot"><\/div>/);
  assert.ok(active.includes('data-testid="publication-snapshot"'));
  assert.doesNotMatch(active, /indexState|검색 다시 준비/);

  const stopped = view({ detail: detail({ state: "STOPPED" }), stoppedAt: STOPPED_AT });
  assert.doesNotMatch(stopped, /publication-open-link|publication-stop-button/);
  assert.ok(stopped.includes('data-testid="publication-copy-url"'));
  assert.ok(stopped.includes(`중지됨 (${formatKst(STOPPED_AT)})`));
  assert.ok(stopped.includes('data-testid="publication-delete-button"'));
  const expired = view({ detail: detail({ state: "EXPIRED" }) });
  assert.doesNotMatch(expired, /publication-open-link|publication-stop-button/);
  assert.ok(expired.includes("만료됨"));
  // 텍스트 자료만 있는 발행본에는 저장소 비공개 전환 안내를 두지 않는다.
  assert.doesNotMatch(view({ detail: detail({ snapshot: snapshot([textItem()]) }) }), /publication-private-notice/);

  const failing = view({ stopState: { error: stopErrorText("server") }, deleteState: { error: deleteErrorText("server") } });
  assert.ok(failing.includes('data-testid="publication-stop-error"') && failing.includes('data-testid="publication-delete-error"'));
  assert.ok(failing.includes("삭제되지 않았습니다. 다시 시도해 주세요."));
  assert.match(view({ deleteState: "deleting" }), /data-testid="publication-delete-button"[^>]*disabled=""/);

  const screen = renderToStaticMarkup(createElement(PublicationDetailScreen, { api: fakeApi(), publicationId: P1, deps: deps() }));
  assert.match(screen, /발행본을 불러오고 있습니다/);
});

test("[URL 복사]: 클립보드 쓰기가 실제로 성공했을 때만 완료이고, 클립보드가 없거나 쓰기가 거부되면 실패로 돌려 수동 복사를 안내한다", async () => {
  const written = [];
  assert.equal(await copyUrl({ writeText: async (text) => { written.push(text); } }, url(1)), true);
  assert.deepEqual(written, [url(1)]);
  assert.equal(await copyUrl(undefined, url(1)), false);
  assert.equal(await copyUrl({}, url(1)), false);
  assert.equal(await copyUrl({ writeText: async () => { throw new Error("denied"); } }, url(1)), false);
});

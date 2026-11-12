// U8 Step 10.2 — 공용 PDF 뷰어(web/src/features/recipient/pdf-viewer-launcher.tsx) 시험.
//
// 먼저 정한 시나리오·기대 결과·실패 조건(U8 시나리오 표 F-5~F-8, 규칙 BR6.3, 보안 설계 §2 「Blob URL의 생성·해제 규칙」, 관측 설계 §3). 세부 시험 코드는 구현 뒤 썼다.
// F-5 본문 수신 실패(전송 도중 끊김)·500·네트워크 오류 — 기대: Blob URL을 만들지 않고 일반 열람 실패 안내, onAccessLost를 부르지 않는다(grant 유지).
//     실패 조건: Blob이 생김, 접근 상실로 처리됨.
// F-6 401 LINK_PASSWORD_REQUIRED·404 LINK_UNAVAILABLE — 기대: onAccessLost(code), 이 화면이 만든 URL을 모두 해제. 실패 조건: 일반 실패로 안내.
//     작성자 경로의 404(RESOURCE_UNAVAILABLE)·401(AUTH_*)은 링크 접근 상실이 아니다.
// F-7 팝업 차단 — 기대: 요청은 한 번, 같은 요청의 Blob을 화면 안 뷰어에 보이고 안내. 실패 조건: 요청 2회.
//     팝업이 열리면 그 창에 넣고(#page=n), 실패하면 열어 둔 빈 창을 닫는다.
// F-8 같은 뷰어의 쪽 이동은 Blob URL 재사용(요청 없음), 닫았다가 다시 열기·새 탭은 재요청. 해제 시점: 뷰어 닫기·화면 떠남·접근 상실.
//     실패 조건: 쪽 이동에 요청이 나감, 해제 누락, 해제 뒤 도착한 응답으로 URL을 만듦.
//
// 합성 응답과 대역(Blob URL 생성·해제, 창 열기)만 쓴다. 실제 브라우저의 Blob URL·내장 PDF 뷰어·팝업 차단 검증이 아니다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "./u2-render.mjs";

const {
  PDF_LOGIN_EXPIRED_TEXT, PDF_NOT_FOUND_TEXT, PDF_POPUP_BLOCKED_TEXT, PDF_VIEW_FAILED_TEXT, PdfViewerPanel, createPdfViewerModel, loadPdf,
} = await load("features/recipient/pdf-viewer-launcher.tsx");

const PDF_BYTES = new TextEncoder().encode("%PDF-1.4 synthetic");
const pdfResponse = () => new Response(PDF_BYTES, { status: 200, headers: { "content-type": "application/pdf" } });
const jsonResponse = (status, code) => new Response(JSON.stringify({ code, message: "합성 메시지" }),
  { status, headers: { "content-type": "application/json" } });
/** 헤더와 앞부분은 왔지만 본문을 받다가 끊기는 응답. */
const cutResponse = () => new Response(new ReadableStream({
  start(controller) { controller.enqueue(PDF_BYTES.subarray(0, 4)); },
  pull(controller) { controller.error(new Error("synthetic cut")); },
}), { status: 200, headers: { "content-type": "application/pdf" } });
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

/** 응답을 차례로 돌려주는 fetchPdf 대역. 함수면 불러서, Error면 던진다. */
function fakeFetch(...responses) {
  const calls = [];
  const fetchPdf = async (signal) => {
    calls.push({ signal });
    const next = responses.shift();
    if (next === undefined) throw new Error("응답이 준비되지 않은 요청");
    const value = typeof next === "function" ? await next() : next;
    if (value instanceof Error) throw value;
    return value;
  };
  return { calls, fetchPdf };
}

/** Blob URL 생성·해제와 창 열기 대역. `popup`이 false면 팝업이 막힌 것이다. */
function fakeDeps({ popup = true } = {}) {
  const created = [];
  const revoked = [];
  const windows = [];
  return {
    created, revoked, windows,
    live: () => created.filter((url) => !revoked.includes(url)),
    deps: {
      createObjectURL: (blob) => { const url = `blob:test/${created.length + 1}`; created.push(url); assert.equal(blob.type, "application/pdf"); return url; },
      revokeObjectURL: (url) => { revoked.push(url); },
      openWindow: () => {
        if (!popup) return null;
        const opened = { closed: false, opener: {}, replaced: [], location: { replace(url) { opened.replaced.push(url); } }, close() { opened.closed = true; } };
        windows.push(opened);
        return opened;
      },
    },
  };
}

function setup(responses, { popup = true, accessLost = true } = {}) {
  const fetched = fakeFetch(...responses);
  const browser = fakeDeps({ popup });
  const lost = [];
  const model = createPdfViewerModel(fetched.fetchPdf, { deps: browser.deps, ...(accessLost ? { onAccessLost: (code) => lost.push(code) } : {}) });
  return { model, calls: fetched.calls, browser, lost, state: () => model.store.get() };
}

test("F-5: 본문을 받다가 끊기면 Blob URL을 만들지 않고 일반 열람 실패로 안내하며 접근 상실로 처리하지 않는다(500·네트워크 오류·PDF가 아닌 응답도 같다)", async () => {
  const cases = [
    ["본문 수신 중 끊김", cutResponse()],
    ["500", jsonResponse(500, "INTERNAL_ERROR")],
    ["네트워크 오류", new Error("synthetic network")],
    ["PDF가 아닌 200", new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } })],
    ["종류 없는 200", new Response(PDF_BYTES, { status: 200 })],
  ];
  for (const [label, response] of cases) {
    const { model, browser, lost, state, calls } = setup([response]);
    await model.openInline();
    assert.deepEqual(browser.created, [], `${label}: Blob URL을 만들지 않는다`);
    assert.equal(state().inline, null, label);
    assert.equal(state().error, PDF_VIEW_FAILED_TEXT, label);
    assert.equal(state().loading, null, label);
    assert.deepEqual(lost, [], `${label}: onAccessLost를 부르지 않는다(grant 유지)`);
    assert.equal(calls.length, 1, label);
  }

  // 새 탭 열기 중 실패하면 열어 둔 빈 창을 닫고 같은 안내를 보인다.
  const tab = setup([cutResponse()]);
  await tab.model.openNewTab();
  assert.equal(tab.browser.windows.length, 1);
  assert.equal(tab.browser.windows[0].closed, true, "빈 창을 닫는다");
  assert.deepEqual(tab.browser.windows[0].replaced, []);
  assert.deepEqual(tab.browser.created, []);
  assert.equal(tab.state().error, PDF_VIEW_FAILED_TEXT);
  assert.deepEqual(tab.lost, []);

  // 실패 뒤 다시 누르면 다시 요청하고, 성공하면 안내가 사라진다.
  const retry = setup([jsonResponse(500, "INTERNAL_ERROR"), pdfResponse()]);
  await retry.model.openInline();
  await retry.model.openInline();
  assert.equal(retry.calls.length, 2);
  assert.equal(retry.state().error, null);
  assert.deepEqual(retry.state().inline, { url: "blob:test/1", page: 1 });
});

test("F-6: 401 LINK_PASSWORD_REQUIRED·404 LINK_UNAVAILABLE은 onAccessLost(code)로 넘기고 이 화면이 만든 URL을 모두 해제한다. 작성자 경로의 404·401은 접근 상실이 아니다", async () => {
  for (const [status, code] of [[401, "LINK_PASSWORD_REQUIRED"], [404, "LINK_UNAVAILABLE"]]) {
    // 화면 안 뷰어와 새 탭을 하나씩 연 뒤, 다시 열기(재요청)에서 접근이 끊긴다.
    const { model, browser, lost, state } = setup([pdfResponse(), pdfResponse(), jsonResponse(status, code)]);
    await model.openInline();
    await model.openNewTab();
    assert.deepEqual(browser.live(), ["blob:test/1", "blob:test/2"]);
    model.close();
    await model.openInline();
    assert.deepEqual(lost, [code], `${status} ${code}`);
    assert.deepEqual(browser.live(), [], "화면 안·새 탭용 URL을 모두 해제한다");
    assert.deepEqual(state(), { inline: null, loading: null, error: null, notice: null }, "일반 실패 안내를 남기지 않는다");
  }

  // 새 탭 열기 중 접근이 끊기면 빈 창도 닫는다.
  const tab = setup([jsonResponse(404, "LINK_UNAVAILABLE")]);
  await tab.model.openNewTab();
  assert.deepEqual(tab.lost, ["LINK_UNAVAILABLE"]);
  assert.equal(tab.browser.windows[0].closed, true);

  // 작성자 경로(onAccessLost 없음): 404는 열 수 없는 자료, 401은 로그인 만료 안내다. 링크 코드가 아닌 401·404는 접근 상실로 보지 않는다.
  const owner = setup([jsonResponse(404, "RESOURCE_UNAVAILABLE"), jsonResponse(401, "AUTH_REQUIRED")], { accessLost: false });
  await owner.model.openInline();
  assert.equal(owner.state().error, PDF_NOT_FOUND_TEXT);
  await owner.model.openInline();
  assert.equal(owner.state().error, PDF_LOGIN_EXPIRED_TEXT);
  assert.deepEqual(owner.browser.created, []);
  const mixed = setup([jsonResponse(404, "RESOURCE_UNAVAILABLE"), jsonResponse(401, "LINK_PASSWORD_INVALID"), new Response("x", { status: 404 })]);
  await mixed.model.openInline();
  await mixed.model.openInline();
  await mixed.model.openInline();
  assert.deepEqual(mixed.lost, [], "링크 접근 코드가 아니면 onAccessLost를 부르지 않는다");
  assert.equal(mixed.state().error, PDF_NOT_FOUND_TEXT);

  // loadPdf 단독: 판정 결과 모양.
  assert.deepEqual(await loadPdf(async () => jsonResponse(401, "LINK_PASSWORD_REQUIRED")), { kind: "access-lost", code: "LINK_PASSWORD_REQUIRED" });
  assert.deepEqual(await loadPdf(async () => jsonResponse(500, "INTERNAL_ERROR")), { kind: "failed", message: PDF_VIEW_FAILED_TEXT });
  const loaded = await loadPdf(async () => pdfResponse());
  assert.equal(loaded.kind, "ok");
  assert.equal(loaded.blob.type, "application/pdf");
  assert.equal(loaded.blob.size, PDF_BYTES.length);
});

test("F-7: 새 탭은 빈 창을 먼저 열고 요청을 한 번만 보낸 뒤 그 창에 넣는다. 팝업이 막히면 같은 요청의 Blob을 화면 안 뷰어에 보이고 안내한다(요청 1회)", async () => {
  // 팝업 허용: 요청 전에 창이 열려 있고, 성공하면 그 창의 주소를 Blob URL(#page=n)로 바꾼다. 화면 안 뷰어는 열지 않는다.
  const pending = deferred();
  const allowed = setup([() => pending.promise]);
  const opening = allowed.model.openNewTab(3);
  assert.equal(allowed.browser.windows.length, 1, "응답을 기다리기 전에 빈 창을 먼저 연다");
  assert.equal(allowed.state().loading, "new-tab");
  pending.resolve(pdfResponse());
  await opening;
  assert.equal(allowed.calls.length, 1);
  assert.deepEqual(allowed.browser.windows[0].replaced, ["blob:test/1#page=3"]);
  assert.equal(allowed.browser.windows[0].opener, null, "새 탭이 원래 화면을 되짚지 못하게 끊는다");
  assert.equal(allowed.browser.windows[0].closed, false);
  assert.equal(allowed.state().inline, null);
  assert.equal(allowed.state().notice, null);
  assert.equal(allowed.state().loading, null);

  // 팝업 차단: 두 번째 요청 없이 방금 받은 Blob을 화면 안 뷰어에 보이고 안내한다.
  const blocked = setup([pdfResponse()], { popup: false });
  await blocked.model.openNewTab(2);
  assert.equal(blocked.calls.length, 1, "요청은 한 번뿐이다");
  assert.deepEqual(blocked.browser.created, ["blob:test/1"]);
  assert.deepEqual(blocked.state().inline, { url: "blob:test/1", page: 2 });
  assert.equal(blocked.state().notice, PDF_POPUP_BLOCKED_TEXT);
  assert.equal(blocked.model.inlineSrc(blocked.state()), "blob:test/1#page=2");
  // 그 뷰어를 닫으면 URL을 해제하고 안내도 지운다.
  blocked.model.close();
  assert.deepEqual(blocked.browser.revoked, ["blob:test/1"]);
  assert.equal(blocked.state().notice, null);

  // 화면 안 뷰어가 이미 열려 있을 때 팝업이 막히면, 열려 있던 URL을 해제하고 새로 받은 것으로 바꾼다(누수 없음).
  const replaced = setup([pdfResponse(), pdfResponse()], { popup: false });
  await replaced.model.openInline();
  await replaced.model.openNewTab();
  assert.equal(replaced.calls.length, 2);
  assert.deepEqual(replaced.browser.revoked, ["blob:test/1"]);
  assert.deepEqual(replaced.state().inline, { url: "blob:test/2", page: 1 });

  // 사용자가 응답 전에 빈 창을 닫았으면 화면 안 뷰어로 보인다(요청은 여전히 한 번).
  const closedEarly = setup([() => { closedEarly.browser.windows[0].closed = true; return pdfResponse(); }]);
  await closedEarly.model.openNewTab();
  assert.equal(closedEarly.calls.length, 1);
  assert.deepEqual(closedEarly.state().inline, { url: "blob:test/1", page: 1 });
});

test("F-8: 같은 뷰어의 쪽 이동은 Blob URL을 다시 쓰고(요청 없음), 닫았다가 다시 열기·새 탭은 다시 요청한다. 뷰어 닫기·화면 떠남 때 URL을 해제한다", async () => {
  const { model, calls, browser, state } = setup([pdfResponse(), pdfResponse(), pdfResponse()]);
  await model.openInline();
  assert.equal(calls.length, 1);
  assert.equal(model.inlineSrc(state()), "blob:test/1#page=1");

  // [원본 n쪽 열기]: 뷰어가 열려 있으면 요청 없이 쪽만 바꾼다.
  await model.openInline(5);
  await model.openInline(2);
  assert.equal(calls.length, 1, "쪽 이동에는 요청이 나가지 않는다");
  assert.deepEqual(browser.created, ["blob:test/1"], "같은 Blob URL을 다시 쓴다");
  assert.equal(model.inlineSrc(state()), "blob:test/1#page=2");
  // 쪽 번호가 이상하면 1쪽으로 본다.
  await model.openInline(0);
  assert.equal(state().inline.page, 1);

  // 닫으면 해제하고, 다시 열면 다시 요청한다(서버 판정을 다시 받는다).
  model.close();
  assert.deepEqual(browser.revoked, ["blob:test/1"]);
  assert.equal(state().inline, null);
  await model.openInline(4);
  assert.equal(calls.length, 2);
  assert.deepEqual(state().inline, { url: "blob:test/2", page: 4 });

  // 화면 안 뷰어가 열려 있어도 새 탭은 다시 요청하고, 그 URL은 따로 들고 있는다.
  await model.openNewTab(4);
  assert.equal(calls.length, 3);
  assert.deepEqual(browser.windows[0].replaced, ["blob:test/3#page=4"]);
  assert.deepEqual(browser.live(), ["blob:test/2", "blob:test/3"]);

  // 화면을 떠나면 화면 안·새 탭용 URL을 모두 해제한다(새 탭을 닫았는지와 무관하다).
  model.dispose();
  assert.deepEqual(browser.live(), []);
  assert.deepEqual(browser.revoked.slice().sort(), ["blob:test/1", "blob:test/2", "blob:test/3"]);

  // 해제 뒤 도착한 응답으로는 URL을 만들지 않고, 진행 중이던 요청은 끊는다. 새 탭 요청이었다면 빈 창도 닫는다.
  const late = deferred();
  const leaving = setup([() => late.promise]);
  const opening = leaving.model.openNewTab();
  leaving.model.dispose();
  assert.equal(leaving.calls[0].signal.aborted, true);
  late.resolve(pdfResponse());
  await opening;
  assert.deepEqual(leaving.browser.created, []);
  assert.equal(leaving.browser.windows[0].closed, true);

  // 정리했다가 같은 모델로 다시 붙으면(React 개발 모드의 효과 재실행) 다시 열 수 있다. 브라우저 확인에서 찾은 결함의 회귀 시험이다:
  // 한 번 정리된 모델이 그 뒤의 응답을 모두 버려 "불러오는 중"에 멈췄다.
  const remount = setup([pdfResponse()]);
  remount.model.dispose();
  remount.model.activate();
  await remount.model.openInline(2);
  assert.deepEqual(remount.state(), { inline: { url: "blob:test/1", page: 2 }, loading: null, error: null, notice: null });
  // 정리는 진행 표시도 남기지 않는다.
  const stuck = deferred();
  const hanging = setup([() => stuck.promise]);
  const pendingOpen = hanging.model.openInline();
  hanging.model.dispose();
  assert.equal(hanging.state().loading, null);
  stuck.resolve(pdfResponse());
  await pendingOpen;
  assert.deepEqual(hanging.browser.created, []);

  // 요청이 진행 중이면 새 요청을 시작하지 않는다(겹친 클릭).
  const slow = deferred();
  const busy = setup([() => slow.promise]);
  const first = busy.model.openInline();
  await busy.model.openInline(3);
  await busy.model.openNewTab();
  assert.equal(busy.calls.length, 1);
  assert.equal(busy.browser.windows.length, 0);
  slow.resolve(pdfResponse());
  await first;
  assert.deepEqual(busy.state().inline, { url: "blob:test/1", page: 1 });
});

test("화면: 단추·안내·화면 안 뷰어에 data-testid가 있고, iframe에는 sandbox가 없으며 src는 Blob URL에 #page만 붙인다", () => {
  const model = { openInline: async () => {}, openNewTab: async () => {}, close: () => {},
    inlineSrc: (state) => state.inline === null ? null : `${state.inline.url}#page=${state.inline.page}` };
  const render = (state) => renderToStaticMarkup(createElement(PdfViewerPanel, { model, state, title: "<b>합성 제목</b>", testId: "pdf-viewer" }));

  const closed = render({ inline: null, loading: null, error: null, notice: null });
  assert.match(closed, /data-testid="pdf-viewer-open"[^>]*>PDF 보기</);
  assert.match(closed, /data-testid="pdf-viewer-new-tab"/);
  assert.doesNotMatch(closed, /<iframe|pdf-viewer-close|pdf-viewer-error/);

  const loading = render({ inline: null, loading: "inline", error: null, notice: null });
  assert.match(loading, /data-testid="pdf-viewer-open"[^>]*disabled=""/);
  assert.match(loading, /data-testid="pdf-viewer-new-tab"[^>]*disabled=""/);
  assert.match(loading, /role="status"[^>]*>PDF를 불러오고 있습니다/);

  const failed = render({ inline: null, loading: null, error: PDF_VIEW_FAILED_TEXT, notice: null });
  assert.match(failed, new RegExp(`role="alert"[^>]*data-testid="pdf-viewer-error"[^>]*>${PDF_VIEW_FAILED_TEXT}`));

  const open = render({ inline: { url: "blob:test/9", page: 7 }, loading: null, error: null, notice: PDF_POPUP_BLOCKED_TEXT });
  const frame = /<iframe[^>]*>/.exec(open)[0];
  assert.match(frame, /src="blob:test\/9#page=7"/);
  assert.match(frame, /data-testid="pdf-viewer-frame"/);
  assert.match(frame, /data-page="7"/);
  assert.doesNotMatch(frame, /sandbox/, "iframe에 sandbox를 두지 않는다(보안 설계 §6)");
  assert.match(frame, /title="&lt;b&gt;합성 제목&lt;\/b&gt; 7쪽"/, "제목은 글자로만 쓴다");
  assert.match(open, /data-testid="pdf-viewer-close"/);
  assert.match(open, new RegExp(`data-testid="pdf-viewer-notice"[^>]*>${PDF_POPUP_BLOCKED_TEXT}`));
  assert.doesNotMatch(open, /data-testid="pdf-viewer-open"/, "열려 있는 동안에는 [PDF 보기] 대신 [뷰어 닫기]를 보인다");
});

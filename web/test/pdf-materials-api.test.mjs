// U8 Step 10.1 — PDF 자료 탭(web/src/features/materials의 pdf-*)의 API 경계·올리기·목록 시험.
//
// 먼저 정한 시나리오·기대 결과·실패 조건(U8 시나리오 표 F-1~F-4, 기능 명세 W1, 규칙 BR1.1~BR1.3·BR1.5·BR2.3, 화면 컴포넌트 「폼 검증 규칙」,
// #420 팀장 결정 2026-11-10의 실패 사유 문구). 세부 시험 코드는 구현 뒤 썼다.
// F-1 제출 전 검사(파일 1개·PDF·20 MB·제목 100자) — 기대: 요청 없이 안내. 실패 조건: 요청이 나감.
// F-2 403 AI_CONSENT_REQUIRED — 기대: U2 동의 흐름 뒤 같은 요청을 한 번만 다시 보냄. 실패 조건: 재전송 없음·무한 반복.
// F-3 목록 매핑·배지 — 기대: 글 추출 중 / 완료 n쪽 / 실패 사유별 문구. 조회 실패는 0건이 아니다. 실패 조건: 문구 불일치.
// F-4 민감 정보 안내·외부 AI 고지 — 기대: 텍스트 자료와 같은 문구와 AI 한 줄 고지가 올리는 자리에 보인다. 실패 조건: 문구 없음.
// 그 밖: 업로드·PDF 본문 요청의 주소·머리(회원 토큰, grant는 머리로만), 회원 인증 401의 토큰 처리, 삭제 확인.
//
// 합성 응답과 서버 렌더링만 쓴다. 실제 브라우저·api·파일 저장소 검증이 아니다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createAccessTokenStore } from "../src/lib/access-token.ts";
import { AI_NOTICE_LINE } from "../src/components/ai-consent/ai-consent-notice.ts";
import { CONSENT_RECORD_FAILED, runWithConsent } from "../src/components/ai-consent/ai-consent-flow.ts";
import { SENSITIVE_INFO_NOTICE } from "../src/features/materials/materials-api.ts";
import {
  PDF_COUNT_LIMIT_TEXT, PDF_DELETE_CONFIRM, PDF_FAILURE_TEXT, PDF_LIMITS, PDF_SENSITIVE_INFO_NOTICE, PDF_UPLOAD_FAILED_TEXT, createPdfHttp,
  createPdfMaterialsApi, extractionBadge, fileSizeText, isPdfMaterialPage, pdfListErrorText, pdfUploadErrors, pdfUploadOutcome, uploadTitle,
} from "../src/features/materials/pdf-materials-api.ts";
import { load } from "./u2-render.mjs";

const { createPdfTabModel, passthroughPdfConsent, pdfLimitReached } = await load("features/materials/pdf-materials-tab.tsx");
const { PdfUploadForm } = await load("features/materials/pdf-upload-form.tsx");
const { PdfMaterialList } = await load("features/materials/pdf-material-list.tsx");

const ID = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";
const MB = 1024 * 1024;
const item = (id = ID, patch = {}) =>
  ({ pdfMaterialId: id, title: "합성 PDF", fileSizeBytes: 2048, pageCount: null, extractionState: "PENDING", failureCode: null, ...patch });
const created = (id = ID, title = "합성 PDF") => ({ pdfMaterialId: id, title, fileSizeBytes: 2048, extractionState: "PENDING" });
const success = (data, status = 200) => ({ kind: "success", status, data });
const apiError = (status, code, details) => ({ kind: "api-error", status, code, message: "합성 메시지", ...(details ? { details } : {}) });
const consentRequired = apiError(403, "AI_CONSENT_REQUIRED");
const ok = (value) => ({ kind: "ok", value });
const failed = (failure) => ({ kind: "failed", failure });
/** 고른 파일 대역. 브라우저 File처럼 Blob이면서 name이 있다. */
const file = (name = "이력서.pdf", { type = "application/pdf", size = 2048 } = {}) => {
  const blob = new Blob([new Uint8Array(Math.min(size, 16))], { type });
  return Object.defineProperties(blob, { name: { value: name }, size: { value: size } });
};

/** 호출을 기록하고 정해 둔 결과를 차례로 돌려주는 PDF 자료 API 대역. */
function fakeApi(responses = {}) {
  const calls = [];
  const queue = Object.fromEntries(Object.entries(responses).map(([name, list]) => [name, [...list]]));
  const take = (name, fallback) => async (...args) => {
    calls.push({ name, args });
    const next = queue[name]?.shift();
    return next === undefined ? fallback : (typeof next === "function" ? next() : next);
  };
  return {
    calls,
    count: (name) => calls.filter((call) => call.name === name).length,
    list: take("list", ok({ items: [], page: { nextCursor: null } })),
    get: take("get", failed("unknown")),
    uploadRaw: take("uploadRaw", success(created(), 201)),
    remove: take("remove", ok(true)),
  };
}
const deps = ({ confirm = true } = {}) => {
  const state = { session: "s1", confirms: [] };
  return { state, session: () => state.session, confirm: (message) => { state.confirms.push(message); return confirm; } };
};

test("F-1: 파일이 없거나 둘 이상·PDF가 아님·20 MB 초과·제목 100자 초과면 요청을 보내지 않고 이유를 안내한다", async () => {
  // 검사 함수: 문제가 없으면 빈 배열.
  assert.deepEqual(pdfUploadErrors([file()], ""), []);
  assert.deepEqual(pdfUploadErrors([file("이름.PDF", { type: "" })], "제목"), [], "브라우저가 종류를 비워 준 .pdf는 받는다");
  assert.deepEqual(pdfUploadErrors([file("a.pdf", { size: PDF_LIMITS.fileSizeBytes })], "가".repeat(98) + "😀😀"), [], "정확히 20 MB·코드 포인트 100자");
  assert.deepEqual(pdfUploadErrors([], "제목"), ["올릴 PDF 파일을 골라 주세요."]);
  assert.deepEqual(pdfUploadErrors([file(), file("둘째.pdf")], "제목"), ["PDF 파일은 한 번에 하나만 올릴 수 있습니다."]);
  assert.deepEqual(pdfUploadErrors([file("그림.png", { type: "image/png" })], "제목"), ["PDF 파일만 올릴 수 있습니다."]);
  assert.deepEqual(pdfUploadErrors([file("가짜.pdf", { type: "text/html" })], "제목"), ["PDF 파일만 올릴 수 있습니다."], "선언 종류가 다르면 이름이 .pdf여도 거부");
  assert.deepEqual(pdfUploadErrors([file("이름없음", { type: "" })], "제목"), ["PDF 파일만 올릴 수 있습니다."]);
  assert.deepEqual(pdfUploadErrors([file("a.pdf", { size: PDF_LIMITS.fileSizeBytes + 1 })], "제목"), ["20 MB 이하의 PDF만 올릴 수 있습니다."]);
  assert.deepEqual(pdfUploadErrors([file("a.pdf", { size: 0 })], "제목"), ["빈 파일은 올릴 수 없습니다."]);
  assert.deepEqual(pdfUploadErrors([file()], "가".repeat(101)), ["제목은 100자까지 쓸 수 있습니다."]);
  assert.deepEqual(pdfUploadErrors([file(".pdf")], "   "), ["제목을 입력해 주세요."], "제목도 파일 이름도 비면 거부");
  assert.equal(uploadTitle("  직접 쓴 제목  ", "a.pdf"), "직접 쓴 제목");
  assert.equal(uploadTitle("", "이력서 2026.PDF"), "이력서 2026", "제목을 비우면 확장자를 뺀 파일 이름");

  // 화면 모델: 검사에 걸리면 요청이 나가지 않고, 고른 값은 화면에 남는다(false).
  const api = fakeApi();
  const model = createPdfTabModel(api, passthroughPdfConsent, deps());
  for (const [files, title] of [[[], "제목"], [[file(), file("b.pdf")], "제목"], [[file("x.png", { type: "image/png" })], "제목"],
    [[file("big.pdf", { size: 21 * MB })], "제목"], [[file()], "가".repeat(101)]]) {
    assert.equal(await model.upload(files, title), false);
    assert.equal(model.store.get().upload.kind, "failed");
    assert.equal(model.store.get().upload.lines[0], PDF_UPLOAD_FAILED_TEXT);
  }
  assert.equal(api.count("uploadRaw"), 0, "보내기 전 검사에 걸린 요청은 나가지 않는다");

  // 검사를 지나면 한 번 보낸다. 제목을 비우면 파일 이름을 제목으로 보낸다.
  assert.equal(await model.upload([file("포트폴리오.pdf")], "  "), true);
  assert.equal(api.count("uploadRaw"), 1);
  const sent = api.calls.find((call) => call.name === "uploadRaw").args;
  assert.equal(sent[1], "포트폴리오.pdf");
  assert.equal(sent[2], "포트폴리오");
  assert.deepEqual(model.store.get().upload, { kind: "done" });
});

test("F-2: 403 AI_CONSENT_REQUIRED면 동의를 받아 기록한 뒤 같은 요청을 한 번만 다시 보내고, 닫으면 보내지 않으며 다시 403이어도 반복하지 않는다", async () => {
  /** U2 동의 흐름(runWithConsent)에 동의 창 대답과 기록 결과를 꽂은 실행기. */
  const consentRunner = ({ agree, recorded = success(null, 204) }) => {
    const log = { asked: 0, recorded: 0 };
    const run = (request) => runWithConsent({
      request,
      askConsent: async () => { log.asked += 1; return agree; },
      recordConsent: async () => { log.recorded += 1; return recorded; },
    });
    return { log, run };
  };

  // 동의: 창 1번, 기록 1번, 같은 요청(같은 파일·이름·제목) 2번째에 201 → 목록 맨 위에 "글 추출 중"으로 더한다.
  const agreed = consentRunner({ agree: true });
  const api = fakeApi({ list: [ok({ items: [item(ID2, { extractionState: "DONE", pageCount: 3 })], page: { nextCursor: null } })],
    uploadRaw: [consentRequired, success(created(ID, "이력서"), 201)] });
  const model = createPdfTabModel(api, agreed.run, deps());
  await model.load();
  const chosen = file("이력서.pdf");
  assert.equal(await model.upload([chosen], ""), true);
  assert.deepEqual(agreed.log, { asked: 1, recorded: 1 });
  const uploads = api.calls.filter((call) => call.name === "uploadRaw").map((call) => call.args);
  assert.equal(uploads.length, 2, "같은 요청을 한 번 다시 보낸다");
  assert.deepEqual(uploads[0], uploads[1]);
  assert.equal(uploads[0][0], chosen);
  assert.deepEqual(model.store.get().list.items.map((entry) => [entry.pdfMaterialId, entry.extractionState, entry.pageCount]),
    [[ID, "PENDING", null], [ID2, "DONE", 3]]);
  assert.deepEqual(model.store.get().upload, { kind: "done" });

  // 다시 보낸 요청이 또 403이면 창을 다시 열지 않고 실패로 끝낸다(반복 없음).
  const again = consentRunner({ agree: true });
  const loop = fakeApi({ uploadRaw: [consentRequired, consentRequired, success(created(), 201)] });
  const looping = createPdfTabModel(loop, again.run, deps());
  assert.equal(await looping.upload([file()], "제목"), false);
  assert.equal(loop.count("uploadRaw"), 2);
  assert.deepEqual(again.log, { asked: 1, recorded: 1 });
  assert.equal(looping.store.get().upload.lines[0], PDF_UPLOAD_FAILED_TEXT);

  // [닫기]: 다시 보내지 않고 올리지 않았다고 안내한다.
  const declined = consentRunner({ agree: false });
  const closed = fakeApi({ uploadRaw: [consentRequired] });
  const closing = createPdfTabModel(closed, declined.run, deps());
  assert.equal(await closing.upload([file()], "제목"), false);
  assert.equal(closed.count("uploadRaw"), 1);
  assert.deepEqual(declined.log, { asked: 1, recorded: 0 });
  assert.equal(closing.store.get().upload.lines[0], "올리지 않았습니다");

  // 동의 기록 실패: 다시 보내지 않는다.
  const unrecorded = consentRunner({ agree: true, recorded: apiError(500, "INTERNAL_ERROR") });
  const broken = fakeApi({ uploadRaw: [consentRequired] });
  const breaking = createPdfTabModel(broken, unrecorded.run, deps());
  assert.equal(await breaking.upload([file()], "제목"), false);
  assert.equal(broken.count("uploadRaw"), 1);
  assert.deepEqual(breaking.store.get().upload.lines, [PDF_UPLOAD_FAILED_TEXT, CONSENT_RECORD_FAILED]);

  // 동의가 이미 있으면(첫 응답 201) 창을 열지 않는다.
  const quiet = consentRunner({ agree: true });
  const direct = createPdfTabModel(fakeApi(), quiet.run, deps());
  assert.equal(await direct.upload([file()], "제목"), true);
  assert.deepEqual(quiet.log, { asked: 0, recorded: 0 });
});

test("F-3: 목록 응답을 계약 칸만 골라 담고, 배지는 글 추출 중 / 완료 n쪽 / 실패 사유별 문구이며, 조회 실패를 0건으로 보이지 않는다", async () => {
  // 배지와 사유 문구(BR2.3, #420 팀장 결정 2026-11-10).
  assert.deepEqual(extractionBadge(item()), { tone: "pending", label: "글 추출 중", detail: "새로고침하면 상태가 바뀝니다." });
  assert.deepEqual(extractionBadge(item(ID, { extractionState: "DONE", pageCount: 12 })), { tone: "done", label: "완료 12쪽", detail: null });
  assert.deepEqual(PDF_FAILURE_TEXT, {
    ENCRYPTED: "비밀번호가 걸린 PDF는 풀어서 올려 주세요",
    PAGE_LIMIT_EXCEEDED: "50쪽까지 올릴 수 있습니다",
    TEXT_LIMIT_EXCEEDED: "글이 너무 많은 PDF입니다. 필요한 쪽만 남긴 PDF로 다시 올려 주세요.",
    UNREADABLE_FILE: "이 PDF를 처리하지 못했습니다. 다시 저장하거나 필요한 쪽만 남긴 PDF로 올려 주세요.",
    DEADLINE_EXCEEDED: "시간 안에 처리하지 못했습니다. 다시 올려 주세요.",
  });
  for (const [code, text] of Object.entries(PDF_FAILURE_TEXT)) {
    assert.deepEqual(extractionBadge(item(ID, { extractionState: "FAILED", failureCode: code })), { tone: "failed", label: "실패", detail: text });
  }

  // 응답 모양: 모르는 상태·사유·빠진 칸은 받지 않고, 계약 밖 칸은 화면으로 넘기지 않는다.
  assert.equal(isPdfMaterialPage({ items: [item()], page: { nextCursor: null } }), true);
  for (const bad of [{ extractionState: "RUNNING" }, { failureCode: "SOMETHING_ELSE" }, { pageCount: "3" }, { title: "" }, { fileSizeBytes: 1.5 }]) {
    assert.equal(isPdfMaterialPage({ items: [item(ID, bad)], page: { nextCursor: null } }), false, JSON.stringify(bad));
  }
  const withoutPageCount = item();
  delete withoutPageCount.pageCount;
  assert.equal(isPdfMaterialPage({ items: [withoutPageCount], page: { nextCursor: null } }), false);

  const calls = [];
  const member = async (path, request) => {
    calls.push({ path, method: request?.method });
    if (path.startsWith("/pdf-materials?")) return success({ items: [{ ...item(ID, { extractionState: "DONE", pageCount: 2 }), storageKey: "members/secret", extra: 1 }], page: { nextCursor: "c2" } });
    if (path === `/pdf-materials/${ID}` && request.method === "GET") return success({ ...item(ID, { extractionState: "DONE", pageCount: 2 }), pages: [{ pageNumber: 1, readable: true, text: "글" }, { pageNumber: 2, readable: false }] });
    if (request.method === "DELETE") return success(null, 204);
    return apiError(500, "INTERNAL_ERROR");
  };
  const api = createPdfMaterialsApi(member, { upload: async () => success(created(), 201) });
  const page = await api.list("c1");
  assert.equal(calls[0].path, "/pdf-materials?limit=20&cursor=c1");
  assert.deepEqual(page, ok({ items: [item(ID, { extractionState: "DONE", pageCount: 2 })], page: { nextCursor: "c2" } }), "계약 밖 칸(저장 키 등)은 싣지 않는다");
  assert.deepEqual(await api.get(ID), ok({ ...item(ID, { extractionState: "DONE", pageCount: 2 }), pages: [{ pageNumber: 1, readable: true }, { pageNumber: 2, readable: false }] }),
    "상세는 쪽 번호와 읽을 수 있음만 담는다(글 없음)");
  assert.deepEqual(await api.remove(ID), ok(true));
  assert.deepEqual(calls.slice(1).map((call) => `${call.method} ${call.path}`), [`GET /pdf-materials/${ID}`, `DELETE /pdf-materials/${ID}`]);
  // 손상된 성공·다른 2xx는 성공으로 바꾸지 않는다.
  const odd = createPdfMaterialsApi(async () => success({ items: "none" }), { upload: async () => success(created(), 201) });
  assert.deepEqual(await odd.list(null), failed("unknown"));

  // 화면 모델: 조회 실패는 0건이 아니라 실패이고, 다시 읽으면 목록이 보인다. [더 보기]는 이어 붙인다.
  const fake = fakeApi({ list: [failed("server"), ok({ items: [item(ID)], page: { nextCursor: "next" } }), ok({ items: [item(ID2)], page: { nextCursor: null } })] });
  const model = createPdfTabModel(fake, passthroughPdfConsent, deps());
  await model.load();
  assert.equal(model.store.get().list.state, "error");
  assert.equal(model.store.get().list.errorText, pdfListErrorText("server"));
  assert.match(pdfListErrorText("server"), /자료가 없다는 뜻은 아닙니다/);
  await model.load();
  await model.loadMore();
  assert.deepEqual(model.store.get().list.items.map((entry) => entry.pdfMaterialId), [ID, ID2]);
  assert.equal(model.store.get().list.nextCursor, null);

  // 목록 그리기: 상태별 배지·사유 문구·원본 보기·삭제 단추와 data-testid. 제목은 글자로만 그린다.
  const rows = [item(ID, { title: "<img src=x onerror=alert(1)>" }), item(ID2, { extractionState: "DONE", pageCount: 3 }),
    item("33333333-3333-4333-8333-333333333333", { extractionState: "FAILED", failureCode: "TEXT_LIMIT_EXCEEDED" })];
  const html = renderToStaticMarkup(createElement(PdfMaterialList, {
    state: "ready", items: rows, hasMore: true, moreState: "idle", deletingId: null,
    deleteError: { pdfMaterialId: ID2, text: "삭제되지 않았습니다. 다시 시도해 주세요." },
    onRefresh() {}, onLoadMore() {}, onDelete() {}, originalOf: () => async () => new Response(null, { status: 500 }),
  }));
  assert.equal((html.match(/data-testid="pdf-row"/g) ?? []).length, 3);
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;") && !html.includes("<img"), "제목은 마크업으로 해석하지 않는다");
  assert.match(html, /data-testid="pdf-row-badge">글 추출 중</);
  assert.match(html, /data-testid="pdf-row-badge">완료 3쪽</);
  assert.match(html, /data-testid="pdf-row-badge">실패</);
  assert.ok(html.includes(PDF_FAILURE_TEXT.TEXT_LIMIT_EXCEEDED));
  assert.equal((html.match(/data-testid="pdf-original-open"[^>]*>원본 보기</g) ?? []).length, 3, "추출 상태와 무관하게 원본을 볼 수 있다");
  assert.equal((html.match(/data-testid="pdf-row-delete"/g) ?? []).length, 3);
  assert.match(html, /data-testid="pdf-row-delete-error"[^>]*>삭제되지 않았습니다/);
  assert.match(html, /data-testid="pdf-list-refresh"/);
  assert.match(html, /data-testid="pdf-list-more"/);
  const failedList = renderToStaticMarkup(createElement(PdfMaterialList, {
    state: "error", items: [], errorText: pdfListErrorText("server"), hasMore: false, moreState: "idle", deletingId: null, deleteError: null,
    onRefresh() {}, onLoadMore() {}, onDelete() {}, originalOf: () => async () => new Response(null, { status: 500 }),
  }));
  assert.match(failedList, /role="alert"/);
  assert.doesNotMatch(failedList, /pdf-list-empty/, "실패를 0건으로 보이지 않는다");
  assert.equal(fileSizeText(2048), "2 KB");
  assert.equal(fileSizeText(5 * MB + MB / 2), "5.5 MB");
});

test("F-4: 올리는 자리에 텍스트 자료와 같은 민감 정보 안내와 외부 AI 한 줄 고지가 늘 보이고, 20벌이면 올릴 수 없다고 안내한다", () => {
  assert.equal(PDF_SENSITIVE_INFO_NOTICE, SENSITIVE_INFO_NOTICE, "텍스트 자료와 같은 문구다(BR1.5)");
  assert.equal(PDF_SENSITIVE_INFO_NOTICE, "주민등록번호 같은 민감한 정보는 지우고 올려 주세요");
  const render = (props) => renderToStaticMarkup(createElement(PdfUploadForm, { status: { kind: "idle" }, limitReached: false, onSubmit: async () => false, ...props }));

  const idle = render({});
  assert.match(idle, new RegExp(`data-testid="pdf-sensitive-notice"[^>]*>${PDF_SENSITIVE_INFO_NOTICE}<`));
  assert.match(idle, /data-testid="ai-notice-line"/);
  assert.ok(idle.includes(AI_NOTICE_LINE), "외부 AI 한 줄 고지(U2 공용 문구)");
  assert.match(idle, /<input[^>]*type="file"[^>]*accept="application\/pdf,\.pdf"[^>]*data-testid="pdf-file-input"/);
  assert.doesNotMatch(/<input[^>]*type="file"[^>]*>/.exec(idle)[0], /multiple/, "파일은 하나만 고른다");
  assert.match(idle, /data-testid="pdf-title-input"/);
  assert.match(idle, /data-testid="pdf-upload-button"[^>]*>올리기</);

  // 실패·진행·완료 안내와 잠금.
  const failedHtml = render({ status: { kind: "failed", lines: [PDF_UPLOAD_FAILED_TEXT, "PDF 파일만 올릴 수 있습니다."] } });
  assert.match(failedHtml, /role="alert"[^>]*data-testid="pdf-upload-status"/);
  assert.ok(failedHtml.includes(PDF_UPLOAD_FAILED_TEXT) && failedHtml.includes("PDF 파일만 올릴 수 있습니다."));
  const uploading = render({ status: { kind: "uploading" } });
  assert.match(uploading, /data-testid="pdf-upload-button"[^>]*disabled=""[^>]*>올리는 중…</);
  assert.match(uploading, /data-testid="pdf-file-input"[^>]*disabled=""/);
  assert.match(render({ status: { kind: "done" } }), /올렸습니다\. 글을 추출하고 있습니다/);

  // 회원당 20벌(BR1.2): 목록이 20이면 단추를 막고 안내한다. 서버의 같은 거부(400 maxCount)도 같은 문구다.
  const limited = render({ limitReached: true });
  assert.match(limited, new RegExp(`data-testid="pdf-count-limit"[^>]*>${PDF_COUNT_LIMIT_TEXT}`));
  assert.match(limited, /data-testid="pdf-upload-button"[^>]*disabled=""/);
  const twenty = { state: "ready", items: Array.from({ length: 20 }, (_, index) => item(`${index}`)), nextCursor: null };
  assert.equal(pdfLimitReached(twenty), true);
  assert.equal(pdfLimitReached({ ...twenty, items: twenty.items.slice(1) }), false);
  assert.equal(pdfLimitReached({ state: "error", items: [], nextCursor: null }), false, "목록을 읽지 못했으면 서버 판정에 맡긴다");
  assert.deepEqual(pdfUploadOutcome(apiError(400, "VALIDATION_FAILED", { violations: [{ field: "materials", reason: "maxCount" }] })),
    { kind: "failed", lines: [PDF_UPLOAD_FAILED_TEXT, PDF_COUNT_LIMIT_TEXT] });
});

test("올리기 결과 해석: 201이고 모양이 맞을 때만 성공이며, 서버 400의 첫 위반·401·500·손상된 응답은 이유와 함께 실패다", () => {
  assert.deepEqual(pdfUploadOutcome(success(created(ID, "제목"), 201)), { kind: "ok", value: item(ID, { title: "제목" }) });
  const reasons = (result) => pdfUploadOutcome(result).lines;
  assert.equal(pdfUploadOutcome(success(created(), 200)).kind, "failed", "200은 계약의 성공이 아니다");
  assert.equal(pdfUploadOutcome(success({ pdfMaterialId: ID }, 201)).kind, "failed", "모양이 틀린 201");
  const violation = (field, reason) => reasons(apiError(400, "VALIDATION_FAILED", { violations: [{ field, reason }, { field: "title", reason: "isString" }] }))[1];
  assert.equal(violation("file", "isPdf"), "PDF 파일만 올릴 수 있습니다.");
  assert.equal(violation("file", "maxSize"), "20 MB 이하의 PDF만 올릴 수 있습니다.");
  assert.equal(violation("file", "singleFile"), "PDF 파일은 한 번에 하나만 올릴 수 있습니다.");
  assert.equal(violation("title", "maxLength"), "제목은 100자까지 쓸 수 있습니다.");
  assert.equal(violation("body", "whitelistValidation"), "파일이나 제목을 확인해 주세요.");
  assert.match(reasons(apiError(401, "AUTH_INVALID"))[1], /로그인이 만료/);
  assert.match(reasons(apiError(500, "INTERNAL_ERROR"))[1], /서버에서 처리하지 못했습니다/);
  assert.match(reasons({ kind: "lookup-failed", status: null, code: "LOOKUP_FAILED" })[1], /결과를 확인하지 못했습니다/);
  for (const result of [apiError(400, "VALIDATION_FAILED"), apiError(500, "INTERNAL_ERROR"), consentRequired]) {
    const lines = reasons(result);
    assert.equal(lines[0], PDF_UPLOAD_FAILED_TEXT);
    assert.ok(!lines.join(" ").includes("합성 메시지"), "서버 문구를 그대로 싣지 않는다");
  }
});

test("삭제: 확인 창에서 머무르면 요청하지 않고, 204일 때만 목록에서 빼며, 실패하면 그 줄에 이유를 보이고 남긴다. 로그인이 바뀐 뒤 응답은 반영하지 않는다", async () => {
  const rows = ok({ items: [item(ID), item(ID2)], page: { nextCursor: null } });
  const staying = fakeApi({ list: [rows] });
  const cancel = deps({ confirm: false });
  const kept = createPdfTabModel(staying, passthroughPdfConsent, cancel);
  await kept.load();
  await kept.remove(ID);
  assert.deepEqual(cancel.state.confirms, [PDF_DELETE_CONFIRM]);
  assert.match(PDF_DELETE_CONFIRM, /이미 발행한 사본은 그대로 남고/);
  assert.equal(staying.count("remove"), 0);

  const api = fakeApi({ list: [rows], remove: [failed("server"), ok(true)] });
  const model = createPdfTabModel(api, passthroughPdfConsent, deps());
  await model.load();
  await model.remove(ID);
  assert.deepEqual(model.store.get().deleteError, { pdfMaterialId: ID, text: "삭제되지 않았습니다. 다시 시도해 주세요." });
  assert.equal(model.store.get().list.items.length, 2, "실패하면 목록에 남긴다");
  assert.equal(model.store.get().deletingId, null);
  await model.remove(ID);
  assert.deepEqual(model.store.get().list.items.map((entry) => entry.pdfMaterialId), [ID2]);
  assert.equal(model.store.get().deleteError, null);

  // 로그인이 바뀐 뒤 도착한 삭제·목록 응답은 반영하지 않는다.
  const changing = deps();
  const late = fakeApi({ list: [rows, () => { changing.state.session = "s2"; return ok({ items: [], page: { nextCursor: null } }); }],
    remove: [() => { changing.state.session = "s3"; return ok(true); }] });
  const other = createPdfTabModel(late, passthroughPdfConsent, changing);
  await other.load();
  await other.load();
  assert.equal(other.store.get().list.state, "loading", "다른 로그인의 목록 응답으로 화면을 채우지 않는다");
});

// #521 리뷰(2026-11-11): 삭제를 기다리는 동안에도 [새로고침]은 눌린다. 삭제 전에 읽기 시작한 목록 응답이 삭제 성공보다 늦게 오면
// 지운 PDF가 목록에 되살아나고, 20벌을 채웠던 회원은 올리기까지 계속 막힌다.
// 먼저 정한 순서: PDF 20개 → 삭제 요청 → 새로고침 요청 → 삭제 성공 → 삭제 전 목록 응답 도착.
// 기대: 지운 PDF가 없는 19개 목록이 남고 다시 올릴 수 있다. 실패 조건: 지운 PDF가 다시 보임, 20개로 남아 올리기가 막힘.
test("삭제 뒤 늦은 목록 응답(#521): 삭제 전에 읽은 새로고침 응답이 삭제 성공 뒤에 와도 지운 PDF가 되살아나지 않고 19개로 남아 다시 올릴 수 있다", async () => {
  const pending = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
  const ids = Array.from({ length: PDF_LIMITS.perMember }, (_, index) => `33333333-3333-4333-8333-${String(index).padStart(12, "0")}`);
  const twenty = ok({ items: ids.map((id) => item(id, { extractionState: "DONE", pageCount: 1 })), page: { nextCursor: null } });
  const nineteen = ok({ items: twenty.value.items.slice(1), page: { nextCursor: null } });
  const removal = pending();
  const staleRefresh = pending();
  const api = fakeApi({ list: [twenty, () => staleRefresh.promise, nineteen], remove: [() => removal.promise] });
  const model = createPdfTabModel(api, passthroughPdfConsent, deps());
  await model.load();
  assert.equal(model.store.get().list.items.length, 20);
  assert.equal(pdfLimitReached(model.store.get().list), true, "20벌이면 올리기가 막힌 상태에서 시작한다");

  const removing = model.remove(ids[0]);          // 1. 삭제 요청
  assert.equal(model.store.get().deletingId, ids[0]);
  const refreshing = model.load();                // 2. 새로고침 요청(삭제 전 목록을 읽는다)
  assert.deepEqual(api.calls.map((call) => call.name), ["list", "remove", "list"]);
  removal.resolve(ok(true));                      // 3. 삭제 성공
  await removing;
  staleRefresh.resolve(twenty);                   // 4. 삭제 전 목록 응답이 늦게 도착
  await refreshing;
  await new Promise((resolve) => setImmediate(resolve));

  const { list, deletingId } = model.store.get();
  assert.equal(deletingId, null);
  assert.equal(list.state, "ready");
  assert.ok(!list.items.some((entry) => entry.pdfMaterialId === ids[0]), "지운 PDF가 목록에 다시 나타나지 않는다");
  assert.deepEqual(list.items.map((entry) => entry.pdfMaterialId), ids.slice(1));
  assert.equal(list.items.length, 19);
  assert.equal(pdfLimitReached(list), false, "19벌이라 다시 올릴 수 있다");
  assert.equal(api.count("list"), 3, "삭제 전 응답을 버리고 목록을 한 번 다시 읽는다");
  assert.equal(api.calls[2].args[1].aborted, true, "삭제 전에 보낸 목록 요청은 취소한다");

  // 목록을 읽는 중이 아닐 때의 삭제는 다시 읽지 않고 그 줄만 뺀다(기존 동작).
  const quiet = fakeApi({ list: [twenty] });
  const settled = createPdfTabModel(quiet, passthroughPdfConsent, deps());
  await settled.load();
  await settled.remove(ids[0]);
  assert.equal(quiet.count("list"), 1);
  assert.equal(settled.store.get().list.items.length, 19);
});

test("요청: 업로드는 회원 토큰과 multipart(파일 종류 application/pdf·제목)로 보내고, 받은 사람 사본은 회원 토큰 없이 grant를 머리로만 싣는다", async () => {
  const requests = [];
  const responses = [];
  const fetchImpl = async (url, init) => { requests.push({ url, init }); return responses.shift() ?? new Response(null, { status: 500 }); };
  const tokens = createAccessTokenStore();
  tokens.set("member-token-1");
  const http = createPdfHttp({ baseUrl: "http://127.0.0.1:3001", nodeEnv: "test", tokens, fetch: fetchImpl });
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  // 업로드: POST /v1/pdf-materials, Authorization, multipart 본문. Content-Type은 직접 쓰지 않는다(경계는 런타임이 붙인다).
  responses.push(json(201, created(ID, "제목")));
  const uploaded = await http.upload(new Blob(["%PDF-1.4"], { type: "" }), "이력서.pdf", "제목");
  assert.deepEqual(uploaded, success(created(ID, "제목"), 201));
  const upload = requests[0];
  assert.equal(upload.url, "http://127.0.0.1:3001/v1/pdf-materials");
  assert.equal(upload.init.method, "POST");
  assert.equal(upload.init.headers.Authorization, "Bearer member-token-1");
  assert.equal(upload.init.headers["Content-Type"], undefined);
  assert.equal(upload.init.credentials, "omit");
  assert.equal(upload.init.cache, "no-store");
  assert.ok(upload.init.body instanceof FormData);
  assert.deepEqual([...upload.init.body.keys()], ["file", "title"]);
  assert.equal(upload.init.body.get("title"), "제목");
  assert.equal(upload.init.body.get("file").type, "application/pdf", "브라우저가 종류를 비워 줘도 PDF로 선언해 보낸다");
  assert.equal(upload.init.body.get("file").name, "이력서.pdf");

  // 서버 거부는 공통 오류 모양으로 돌아온다(동의 창이 403을 알아본다).
  responses.push(json(403, { code: "AI_CONSENT_REQUIRED", message: "동의가 필요합니다." }));
  assert.deepEqual(await http.upload(new Blob(["x"]), "a.pdf", "t"), { kind: "api-error", status: 403, code: "AI_CONSENT_REQUIRED", message: "동의가 필요합니다." });
  assert.equal(tokens.get().token, "member-token-1", "403은 토큰을 지우지 않는다");

  // 작성자 원본·작성자 사본: 회원 토큰, PDF로 받는다. ID는 경로에만 넣는다.
  responses.push(new Response("pdf", { status: 200 }), new Response("pdf", { status: 200 }));
  await http.originalFile(ID);
  await http.ownerCopy(ID, ID2);
  assert.equal(requests[2].url, `http://127.0.0.1:3001/v1/pdf-materials/${ID}/file`);
  assert.equal(requests[3].url, `http://127.0.0.1:3001/v1/publications/${ID}/items/${ID2}/pdf`);
  for (const request of requests.slice(2, 4)) {
    assert.equal(request.init.method, "GET");
    assert.equal(request.init.headers.Authorization, "Bearer member-token-1");
    assert.equal(request.init.headers.Accept, "application/pdf");
    assert.equal(request.init.headers["X-Link-Grant"], undefined);
  }

  // 받은 사람 사본: 회원 토큰을 붙이지 않고 grant는 X-Link-Grant 머리로만 싣는다. URL에는 토큰(경로)만 있고 grant·쿼리가 없다.
  responses.push(new Response("pdf", { status: 200 }), new Response("pdf", { status: 200 }));
  await http.recipientCopy("link-token-A", ID2, "grant-value-1");
  await http.recipientCopy("link-token-A", ID2, null);
  assert.equal(requests[4].url, `http://127.0.0.1:3001/v1/public/links/link-token-A/items/${ID2}/pdf`);
  assert.ok(!requests[4].url.includes("grant-value-1") && !requests[4].url.includes("?"));
  assert.equal(requests[4].init.headers["X-Link-Grant"], "grant-value-1");
  assert.equal(requests[4].init.headers.Authorization, undefined, "받은 사람 요청에 회원 토큰을 붙이지 않는다");
  assert.equal(requests[5].init.headers["X-Link-Grant"], undefined, "grant가 없으면 머리를 싣지 않는다");

  // 회원 인증 401이면 api.member와 같이 그 토큰을 지운다. 링크 401·다른 401은 지우지 않는다.
  responses.push(json(401, { code: "LINK_PASSWORD_REQUIRED", message: "비밀번호" }));
  await http.originalFile(ID);
  assert.equal(tokens.get().token, "member-token-1");
  responses.push(json(401, { code: "AUTH_INVALID", message: "만료" }));
  const expired = await http.originalFile(ID);
  assert.equal(expired.status, 401);
  assert.deepEqual(tokens.get(), { token: null, ended: "auth-failed" });
  assert.deepEqual(await expired.json(), { code: "AUTH_INVALID", message: "만료" }, "응답 본문은 부르는 쪽이 그대로 읽을 수 있다");

  // 주소 설정이 없으면 요청하지 않는다.
  const before = requests.length;
  const unset = createPdfHttp({ baseUrl: undefined, nodeEnv: "test", tokens, fetch: fetchImpl });
  assert.equal((await unset.originalFile(ID)).status, 503);
  assert.equal((await unset.recipientCopy("t", ID, null)).status, 503);
  assert.deepEqual(await unset.upload(new Blob(["x"]), "a.pdf", "t"), { kind: "lookup-failed", status: 503, code: "LOOKUP_FAILED" });
  assert.equal(requests.length, before);
});

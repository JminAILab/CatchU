// U4 제출 1 — 텍스트 자료 목록·편집 화면(W2) 시험.
//
// 먼저 정한 시나리오·기대 결과·실패 조건(U4 기능 명세 S3, BR2.1~BR2.3·BR3.2·BR3.3, NFR7). 세부 시험 코드는 구현 뒤 쓴다.
//
// - 기대: 편집 화면에 "주민등록번호 같은 민감한 정보는 지우고 올려 주세요" 안내가 항상 보인다.
//         목록은 본인 자료를 cursor로 이어 읽고, 조회 실패를 0건으로 보이지 않는다.
//         새 자료 저장(201)·수정 저장(200) 응답이 맞을 때만 "저장됨"을 보인다. 제목 1~100자·본문 1~20,000자를 넘으면 보내지 않고 안내한다.
//         삭제는 확인 뒤 204일 때만 목록에서 뺀다. 저장하지 않은 입력이 있으면 이탈 경고 대상(dirty)이다.
// - 실패 조건(입력 유지): 5xx·연결 끊김·400·성공 형식 오류는 "저장되지 않았습니다"와 이유를 보이고 입력을 남긴다.
//         401은 로그인 만료 안내를 함께 보인다. 404는 자료를 열 수 없다고 안내한다. 삭제 실패는 "삭제되지 않았습니다"이고 목록에 남긴다.
// - 실패로 보는 것: 접수만으로 "저장됨"·삭제 완료 표시, 실패 때 입력 소실, 민감 정보 안내 누락, 조작 요소에 data-testid 없음.
//
// 합성 응답과 서버 렌더링만 쓴다. 실제 브라우저·서버 연결 검증이 아니다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import {
  SENSITIVE_INFO_NOTICE, applyMaterialSave, createMaterialsApi, isMaterialDirty, loadedMaterialState, materialDeleteErrorText,
  materialDraftErrors, materialListErrorText, materialOpenErrorText, newMaterialState,
} from "../src/features/materials/materials-api.ts";
import { LOGIN_EXPIRED_TEXT, SAVE_FAILED_TEXT, SAVED_TEXT, editStatusLines } from "../src/lib/save-outcome.ts";

const viewUrl = new URL("../src/features/materials/materials-view.tsx", import.meta.url);
const cssUrl = new URL("../src/features/materials/materials.module.css", import.meta.url);
const hooks = registerHooks({
  load(url, context, nextLoad) {
    if (url === cssUrl.href) return { format: "module", shortCircuit: true, source: "export default {};" };
    if (url !== viewUrl.href) return nextLoad(url, context);
    return {
      format: "module", shortCircuit: true,
      source: ts.transpileModule(readFileSync(viewUrl, "utf8"), {
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext },
      }).outputText,
    };
  },
});
const { MaterialEditorView, MaterialsListView } = await import(viewUrl.href);
hooks.deregister();

const AT = "2026-10-29T01:02:03.456Z";
const material = (id = "11111111-1111-4111-8111-111111111111", title = "자료 제목", body = "자료 본문") =>
  ({ textMaterialId: id, title, body, createdAt: AT, updatedAt: AT });
const success = (data, status = 200) => ({ kind: "success", status, data });
const apiError = (status, code) => ({ kind: "api-error", status, code, message: "합성 메시지" });

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

function editor(props) {
  return renderToStaticMarkup(createElement(MaterialEditorView, {
    isNew: false, draft: { title: "", body: "" }, status: { kind: "idle" }, dirty: false, deleteState: "idle",
    onChange() {}, onSave() {}, onDelete() {}, onClose() {}, ...props,
  }));
}
function listView(props) {
  return renderToStaticMarkup(createElement(MaterialsListView, {
    state: "ready", items: [], hasMore: false, moreState: "idle", selectedId: null,
    onRetry() {}, onLoadMore() {}, onOpen() {}, onNew() {}, ...props,
  }));
}

test("API: 목록·상세·등록·수정·삭제를 정한 경로·메서드로 부르고 성공 상태·모양이 맞을 때만 성공이다", async () => {
  const page = { items: [{ textMaterialId: "a", title: "t", updatedAt: AT }], page: { nextCursor: "next" } };
  const fake = fakeMember(success(page), success(material()), success(material(), 201), success(material()), success(null, 204));
  const api = createMaterialsApi(fake.member);
  const id = material().textMaterialId;
  assert.deepEqual(await api.list("c u"), { kind: "ok", value: page });
  assert.deepEqual(await api.get(id), { kind: "ok", value: material() });
  assert.equal((await api.create({ title: " 제목 ", body: "본문" })).kind, "ok");
  assert.equal((await api.update(id, { title: "제목", body: "본문" })).kind, "ok");
  assert.deepEqual(await api.remove(id), { kind: "ok", value: null });
  assert.deepEqual(fake.calls, [
    { path: "/text-materials?limit=20&cursor=c+u", method: "GET", body: undefined },
    { path: `/text-materials/${id}`, method: "GET", body: undefined },
    { path: "/text-materials", method: "POST", body: { title: " 제목 ", body: "본문" } },
    { path: `/text-materials/${id}`, method: "PUT", body: { title: "제목", body: "본문" } },
    { path: `/text-materials/${id}`, method: "DELETE", body: undefined },
  ]);

  // 등록 200(201 아님)·목록 항목에 본문·다른 ID 응답·삭제 200은 성공으로 보지 않는다.
  const wrong = createMaterialsApi(fakeMember(
    success(material(), 200), success({ items: [{ ...page.items[0], body: "x" }], page: { nextCursor: null } }),
    success(material("22222222-2222-4222-8222-222222222222")), success(null, 200),
  ).member);
  assert.deepEqual(await wrong.create({ title: "t", body: "b" }), { kind: "failed", failure: "unknown" });
  assert.deepEqual(await wrong.list(null), { kind: "failed", failure: "unknown" });
  assert.deepEqual(await wrong.update(id, { title: "t", body: "b" }), { kind: "failed", failure: "unknown" });
  assert.deepEqual(await wrong.remove(id), { kind: "failed", failure: "unknown" });
});

test("API 실패 구분: 401은 로그인 만료, 404는 없음, 5xx·연결 끊김·예외는 저장 실패다", async () => {
  const cases = [
    [apiError(401, "AUTH_INVALID"), "login-expired"], [apiError(400, "VALIDATION_FAILED"), "validation"],
    [apiError(404, "RESOURCE_UNAVAILABLE"), "not-found"], [apiError(503, "INTERNAL_ERROR"), "server"],
    [{ kind: "lookup-failed", status: null, code: "LOOKUP_FAILED" }, "unknown"], [new Error("network"), "unknown"],
  ];
  for (const [response, failure] of cases) {
    assert.deepEqual(await createMaterialsApi(fakeMember(response).member).create({ title: "t", body: "b" }), { kind: "failed", failure });
  }
  assert.match(materialListErrorText("server"), /자료가 없다는 뜻은 아닙니다/);
  assert.match(materialOpenErrorText("not-found"), /열 수 없습니다/);
  assert.match(materialDeleteErrorText("server"), /^삭제되지 않았습니다/);
  assert.match(materialDeleteErrorText("login-expired"), /로그인이 만료되었습니다/);
});

test("입력 검사: 제목 1~100자(앞뒤 공백 제외)·본문 1~20,000자(코드 포인트)", () => {
  assert.deepEqual(materialDraftErrors({ title: ` ${"가".repeat(98)}😀😀 `, body: "b".repeat(19998) + "😀😀" }), []);
  assert.deepEqual(materialDraftErrors({ title: "  ", body: " \n" }), ["제목을 입력해 주세요.", "본문을 입력해 주세요."]);
  assert.deepEqual(materialDraftErrors({ title: "가".repeat(101), body: "b".repeat(20001) }),
    ["제목은 100자까지 쓸 수 있습니다.", "본문은 20,000자까지 쓸 수 있습니다."]);
});

test("화면 값: 실패하면 입력을 남기고 dirty이며, 성공 응답 뒤에만 저장됨이고 새 자료는 ID를 갖는다", () => {
  const start = newMaterialState();
  assert.equal(isMaterialDirty(start), false);
  const typed = { ...start, draft: { title: "새 제목", body: "새 본문" }, status: { kind: "saving" } };
  assert.equal(isMaterialDirty(typed), true);

  const failed = applyMaterialSave(typed, { kind: "failed", failure: "login-expired" });
  assert.deepEqual(failed.draft, { title: "새 제목", body: "새 본문" });
  assert.equal(failed.textMaterialId, null);
  assert.equal(isMaterialDirty(failed), true);
  assert.deepEqual(editStatusLines(failed.status).lines, [SAVE_FAILED_TEXT, LOGIN_EXPIRED_TEXT]);

  const saved = applyMaterialSave(typed, { kind: "ok", value: material(undefined, "새 제목", "새 본문") });
  assert.equal(saved.textMaterialId, material().textMaterialId);
  assert.equal(isMaterialDirty(saved), false);
  assert.deepEqual(editStatusLines(saved.status).lines, [SAVED_TEXT]);

  const loaded = loadedMaterialState(material());
  assert.equal(isMaterialDirty({ ...loaded, draft: { ...loaded.draft, body: "고침" } }), true);
});

test("편집 화면: 민감 정보 안내가 늘 보이고, 조작 요소에 data-testid가 있으며 실패 안내와 입력이 함께 남는다", () => {
  const fresh = editor({ isNew: true });
  assert.ok(fresh.includes(SENSITIVE_INFO_NOTICE));
  assert.ok(fresh.includes('data-testid="material-sensitive-notice"'));
  assert.doesNotMatch(fresh, /material-delete-button/);
  for (const id of ["material-editor", "material-title-input", "material-body-input", "material-save-button", "material-editor-close"]) {
    assert.ok(fresh.includes(`data-testid="${id}"`), id);
  }

  const failed = editor({ draft: { title: "쓰던 제목", body: "쓰던 본문" }, dirty: true,
    status: { kind: "failed", failure: "server" } });
  assert.ok(failed.includes(SENSITIVE_INFO_NOTICE));
  assert.ok(failed.includes('value="쓰던 제목"'));
  assert.ok(failed.includes(">쓰던 본문</textarea>"));
  assert.ok(failed.includes(`<p>${SAVE_FAILED_TEXT}</p>`));
  assert.ok(failed.includes("저장하지 않은 변경이 있습니다."));
  assert.ok(failed.includes('data-testid="material-delete-button"'));

  const saving = editor({ draft: { title: "t", body: "b" }, status: { kind: "saving" } });
  assert.match(saving, /data-testid="material-save-button"[^>]*disabled=""/);
  assert.doesNotMatch(saving, new RegExp(`<p>${SAVED_TEXT}</p>`));

  const deleteFailed = editor({ draft: { title: "t", body: "b" }, deleteState: { error: materialDeleteErrorText("server") } });
  assert.ok(deleteFailed.includes('data-testid="material-delete-error"'));
  assert.ok(deleteFailed.includes("삭제되지 않았습니다. 다시 시도해 주세요."));

  const script = editor({ draft: { title: "<b>x</b>", body: "<script>alert(1)</script>" } });
  assert.ok(script.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
});

test("목록 화면: 조회 실패를 0건으로 보이지 않고, 정상 0건·항목·더 보기를 구분해 보인다", () => {
  const failed = listView({ state: "error", errorText: materialListErrorText("server") });
  assert.ok(failed.includes('data-testid="materials-list-retry"'));
  assert.doesNotMatch(failed, /materials-empty/);
  assert.match(failed, /role="alert"/);

  assert.ok(listView({}).includes('data-testid="materials-empty"'));
  assert.doesNotMatch(listView({ state: "loading" }), /materials-empty/);

  const items = listView({ items: [{ textMaterialId: "a", title: "첫 자료", updatedAt: AT }], hasMore: true, selectedId: "a" });
  assert.ok(items.includes("첫 자료"));
  assert.ok(items.includes('data-testid="materials-item-open"'));
  assert.ok(items.includes('aria-current="true"'));
  assert.ok(items.includes('data-testid="materials-load-more"'));
  assert.ok(items.includes('data-testid="materials-new-button"'));
});

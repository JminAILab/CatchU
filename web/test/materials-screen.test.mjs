/**
 * U4 W2 텍스트 자료 화면(`materials-screen.tsx`)의 상태 전이 시험.
 *
 * 시나리오(코드 생성 계획 Step 2·S3, 2026-10-29 보완):
 * - 새 자료를 처음 저장하면 "저장됨"이 남고, ID가 생겨도 자료를 다시 불러오지 않는다(재조회가 "저장됨"·저장 뒤 입력을 덮던 결함).
 * - 늦게 도착한 불러오기·저장 응답은 저장 뒤 더 쓴 입력을 덮지 않는다.
 * - 저장 실패(서버·연결·로그인 만료)는 입력을 남긴다. 검사 거부는 요청하지 않는다.
 * - 저장하지 않은 입력이 있을 때 다른 자료·목록으로 가려 하면 묻고, 머무르기를 고르면 그대로 남는다.
 * - 로그인이 바뀐 뒤 도착한 응답은 반영하지 않는다.
 * - 목록 조회 중 끝난 저장·삭제는 목록을 다시 읽어, 변경 전에 읽은 늦은 응답이 새 자료·제목·삭제를 덮지 않는다(#461 리뷰 지적).
 * - 목록을 다시 읽은 뒤 도착한 [더 보기] 응답은 붙이지 않는다. 자동으로 다시 읽은 목록이 실패해도 저장 결과·입력은 편집기에 남는다.
 * 원본 tsx를 변환해 불러온다. 서버는 계약 모양 대역이며 실제 브라우저·api·DB 검증이 아니다.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { SAVED_TEXT, editStatusLines } from "../src/lib/save-outcome.ts";
import { materialListErrorText } from "../src/features/materials/materials-api.ts";

const srcUrl = new URL("../src/", import.meta.url);
const screenUrl = new URL("../src/features/materials/materials-screen.tsx", import.meta.url);
const STUB = new URL("./__materials-screen-stubs__/api.mjs", import.meta.url).href;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/api") return { url: STUB, shortCircuit: true };
    if (specifier.startsWith("@/")) {
      const base = new URL(specifier.slice(2), srcUrl);
      const url = [".tsx", ".ts"].map((ext) => new URL(base.href + ext)).find((candidate) => existsSync(candidate));
      return { url: url.href, shortCircuit: true };
    }
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.endsWith(".tsx")) {
      const base = new URL(specifier, context.parentURL);
      if (!/\.(tsx?|css|mjs|js)$/.test(base.pathname)) {
        const url = [".tsx", ".ts"].map((ext) => new URL(base.href + ext)).find((candidate) => existsSync(candidate));
        if (url) return { url: url.href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === STUB) return { format: "module", shortCircuit: true, source: "export const api = { member: async () => ({ kind: 'network-error' }) };" };
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
const { MaterialsScreen, createMaterialsScreenModel, createMaterialEditorModel } = await import(screenUrl.href);
hooks.deregister();

const AT = "2026-10-29T01:02:03.456Z";
const LATER = "2026-10-29T01:05:00.000Z";
const ID = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";
const ID3 = "33333333-3333-4333-8333-333333333333";
const ID4 = "44444444-4444-4444-8444-444444444444";
const material = (id = ID, title = "자료 제목", body = "자료 본문", updatedAt = AT) =>
  ({ textMaterialId: id, title, body, createdAt: AT, updatedAt });
const ok = (value) => ({ kind: "ok", value });
const failed = (failure) => ({ kind: "failed", failure });
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; }

/** 호출을 기록하고, 정해 둔 응답(값 또는 deferred)을 차례로 돌려주는 API 대역. */
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
    create: (draft, signal) => { calls.push({ name: "create", draft: { ...draft }, signal }); return next("create"); },
    update: (id, draft, signal) => { calls.push({ name: "update", id, draft: { ...draft }, signal }); return next("update"); },
    remove: (id) => { calls.push({ name: "remove", id }); return next("remove"); },
  };
}

function deps({ confirm = () => true } = {}) {
  const d = { token: "session-a", confirms: [], session: () => d.token, confirm: (message) => { d.confirms.push(message); return confirm(message); } };
  return d;
}

const page = (items, nextCursor = null) => ok({ items, page: { nextCursor } });
const item = (m) => ({ textMaterialId: m.textMaterialId, title: m.title, updatedAt: m.updatedAt });

test("편집기: 새 자료를 처음 저장하면 저장됨이 남고 ID가 생기며, 자료를 다시 불러오지 않는다(재조회 결함 회귀)", async () => {
  const api = fakeApi({ create: [ok(material(ID, "새 제목", "새 본문"))] });
  const saved = [];
  const editor = createMaterialEditorModel(api, null, { onSaved: (i, created) => saved.push({ i, created }), onDeleted() {} }, deps());
  await editor.load();
  assert.equal(editor.store.get().load, "ready");
  editor.change({ title: "새 제목", body: "새 본문" });
  assert.equal(editor.isDirty(), true);
  await editor.save();
  const state = editor.store.get();
  assert.equal(state.edit.status.kind, "saved");
  assert.deepEqual(editStatusLines(state.edit.status).lines, [SAVED_TEXT]);
  assert.equal(state.edit.textMaterialId, ID);
  assert.equal(editor.isDirty(), false);
  assert.deepEqual(saved, [{ i: { textMaterialId: ID, title: "새 제목", updatedAt: AT }, created: true }]);
  // 화면 모델은 선택만 옮기고 편집기 key를 바꾸지 않는다 → 편집기를 다시 만들지 않으므로 get이 없다.
  const screen = createMaterialsScreenModel(fakeApi(), deps());
  screen.select({ kind: "new" });
  const session = screen.store.get().editorSession;
  screen.saved(saved[0].i, true);
  assert.deepEqual(screen.store.get().selection, { kind: "existing", textMaterialId: ID });
  assert.equal(screen.store.get().editorSession, session);
  assert.equal(screen.store.get().list.items[0].textMaterialId, ID);
  assert.equal(api.calls.filter((c) => c.name === "get").length, 0);
});

test("편집기: 저장 응답이 오기 전에 더 쓴 입력은 저장 성공 응답이 덮지 않고 dirty로 남는다", async () => {
  const pending = deferred();
  const api = fakeApi({ get: [ok(material())], update: [pending] });
  const editor = createMaterialEditorModel(api, ID, { onSaved() {}, onDeleted() {} }, deps());
  await editor.load();
  editor.change({ title: "자료 제목", body: "첫 수정" });
  const saving = editor.save();
  assert.equal(editor.store.get().edit.status.kind, "saving");
  editor.change({ title: "자료 제목", body: "첫 수정 그리고 더" });
  pending.resolve(ok(material(ID, "자료 제목", "첫 수정", LATER)));
  await saving;
  const { edit } = editor.store.get();
  assert.equal(edit.draft.body, "첫 수정 그리고 더");
  assert.equal(edit.saved.body, "첫 수정");
  assert.equal(edit.status.kind, "saved");
  assert.equal(editor.isDirty(), true);
});

test("편집기: 늦게 도착한 불러오기 응답은 다시 불러온 뒤의 상태나 쓰던 입력을 덮지 않는다", async () => {
  const first = deferred();
  const api = fakeApi({ get: [first, ok(material(ID, "새로 읽은 제목", "새로 읽은 본문"))] });
  const editor = createMaterialEditorModel(api, ID, { onSaved() {}, onDeleted() {} }, deps());
  const firstLoad = editor.load();
  await editor.load(); // 다시 불러오기(첫 요청은 취소된 것으로 본다)
  editor.change({ title: "새로 읽은 제목", body: "쓰던 입력" });
  first.resolve(ok(material(ID, "옛 제목", "옛 본문")));
  await firstLoad;
  assert.equal(api.calls[0].signal.aborted, true);
  assert.equal(editor.store.get().edit.draft.body, "쓰던 입력");
  assert.equal(editor.store.get().edit.saved.title, "새로 읽은 제목");
});

test("편집기: 저장 실패(서버·연결·로그인 만료)는 입력을 남기고 이유를 보이며, 검사 거부는 요청하지 않는다", async () => {
  for (const failure of ["server", "unknown", "login-expired"]) {
    const api = fakeApi({ get: [ok(material())], update: [failed(failure)] });
    const editor = createMaterialEditorModel(api, ID, { onSaved() { throw new Error("저장 실패에서 onSaved"); }, onDeleted() {} }, deps());
    await editor.load();
    editor.change({ title: "자료 제목", body: "남아야 할 입력" });
    await editor.save();
    const { edit } = editor.store.get();
    assert.equal(edit.draft.body, "남아야 할 입력", failure);
    assert.deepEqual(edit.status, { kind: "failed", failure });
    assert.equal(editor.isDirty(), true);
  }
  const api = fakeApi({ get: [ok(material())] });
  const editor = createMaterialEditorModel(api, ID, { onSaved() {}, onDeleted() {} }, deps());
  await editor.load();
  editor.change({ title: "   ", body: "" });
  await editor.save();
  assert.equal(editor.store.get().edit.status.kind, "invalid");
  assert.equal(api.calls.some((c) => c.name === "update"), false);
});

test("편집기: 저장·불러오기 중 로그인이 바뀌면 늦은 응답을 반영하지 않는다", async () => {
  const d = deps();
  const pending = deferred();
  const api = fakeApi({ get: [ok(material())], update: [pending] });
  const editor = createMaterialEditorModel(api, ID, { onSaved() { throw new Error("다른 로그인에 반영"); }, onDeleted() {} }, d);
  await editor.load();
  editor.change({ title: "자료 제목", body: "수정" });
  const saving = editor.save();
  d.token = "session-b";
  pending.resolve(ok(material(ID, "자료 제목", "수정")));
  await saving;
  assert.equal(editor.store.get().edit.status.kind, "saving");

  const loadPending = deferred();
  const d2 = deps();
  const editor2 = createMaterialEditorModel(fakeApi({ get: [loadPending] }), ID, { onSaved() {}, onDeleted() {} }, d2);
  const loading = editor2.load();
  d2.token = "session-b";
  loadPending.resolve(ok(material()));
  await loading;
  assert.equal(editor2.store.get().load, "loading");
});

test("편집기: 열기 실패는 이유와 다시 불러오기를 주고, 다시 불러오면 열린다", async () => {
  const api = fakeApi({ get: [failed("not-found"), ok(material())] });
  const editor = createMaterialEditorModel(api, ID, { onSaved() {}, onDeleted() {} }, deps());
  await editor.load();
  assert.match(editor.store.get().load.error, /열 수 없습니다/);
  editor.retry();
  await tick();
  assert.equal(editor.store.get().load, "ready");
  assert.equal(editor.store.get().edit.draft.title, "자료 제목");
});

test("편집기: 삭제는 확인을 거친다. 취소하면 요청하지 않고, 실패하면 이유를 남기며, 성공하면 알린다", async () => {
  const cancelled = deps({ confirm: () => false });
  const api1 = fakeApi({ get: [ok(material())] });
  const e1 = createMaterialEditorModel(api1, ID, { onSaved() {}, onDeleted() { throw new Error("취소인데 삭제"); } }, cancelled);
  await e1.load();
  await e1.remove();
  assert.equal(api1.calls.some((c) => c.name === "remove"), false);
  assert.equal(cancelled.confirms.length, 1);

  const api2 = fakeApi({ get: [ok(material())], remove: [failed("server"), ok(null)] });
  const deletedIds = [];
  const e2 = createMaterialEditorModel(api2, ID, { onSaved() {}, onDeleted: (id) => deletedIds.push(id) }, deps());
  await e2.load();
  await e2.remove();
  assert.match(e2.store.get().deleteState.error, /삭제되지 않았습니다/);
  await e2.remove();
  assert.deepEqual(deletedIds, [ID]);

  const e3 = createMaterialEditorModel(fakeApi(), null, { onSaved() {}, onDeleted() {} }, deps());
  await e3.remove(); // 새 자료(ID 없음)는 삭제하지 않는다
  e3.dispose();
});

test("화면: 목록 조회 성공·실패를 구분하고, 더 보기는 이어 붙이며 실패를 따로 알린다", async () => {
  const m1 = material(ID), m2 = material(ID2, "둘째");
  const api = fakeApi({ list: [failed("server"), page([item(m1)], "cursor-1"), failed("server"), page([item(m2)])] });
  const screen = createMaterialsScreenModel(api, deps());
  await screen.load();
  assert.equal(screen.store.get().list.state, "error");
  assert.match(screen.store.get().list.errorText, /자료가 없다는 뜻은 아닙니다/);
  await screen.load();
  assert.equal(screen.store.get().list.state, "ready");
  await screen.loadMore();
  assert.equal(screen.store.get().moreState, "error");
  await screen.loadMore();
  assert.deepEqual(screen.store.get().list.items.map((i) => i.textMaterialId), [ID, ID2]);
  assert.equal(screen.store.get().list.nextCursor, null);
  await screen.loadMore(); // 다음이 없으면 요청하지 않는다
  assert.equal(api.calls.filter((c) => c.name === "list").length, 4);
  screen.dispose();
});

test("화면: 저장하지 않은 입력이 있으면 다른 자료·목록으로 가기 전에 묻고, 머무르면 선택과 편집기가 그대로다", () => {
  let answer = false;
  const d = deps({ confirm: () => answer });
  const screen = createMaterialsScreenModel(fakeApi(), d);
  assert.equal(screen.select({ kind: "existing", textMaterialId: ID }), true);
  const before = screen.store.get();
  screen.setDirty(true);
  assert.equal(screen.select({ kind: "new" }), false);
  assert.equal(d.confirms[0], "저장하지 않은 입력이 있습니다. 이동하시겠습니까?");
  assert.deepEqual(screen.store.get().selection, before.selection);
  assert.equal(screen.store.get().editorSession, before.editorSession);
  assert.equal(screen.store.get().dirty, true);
  answer = true;
  assert.equal(screen.select(null), true);
  assert.equal(screen.store.get().selection, null);
  assert.equal(screen.store.get().dirty, false);
});

test("화면: 수정 저장은 목록 항목을 바꾸고, 삭제는 목록에서 빼며 선택을 닫는다. 로그인이 바뀐 뒤 목록 응답은 버린다", async () => {
  const d = deps();
  const pending = deferred();
  const screen = createMaterialsScreenModel(fakeApi({ list: [page([item(material(ID)), item(material(ID2, "둘째"))]), pending] }), d);
  await screen.load();
  screen.select({ kind: "existing", textMaterialId: ID });
  screen.saved({ textMaterialId: ID, title: "바뀐 제목", updatedAt: LATER }, false);
  assert.equal(screen.store.get().list.items[0].title, "바뀐 제목");
  assert.deepEqual(screen.store.get().selection, { kind: "existing", textMaterialId: ID });
  screen.deleted(ID);
  assert.deepEqual(screen.store.get().list.items.map((i) => i.textMaterialId), [ID2]);
  assert.equal(screen.store.get().selection, null);
  const reloading = screen.load();
  d.token = "session-b";
  pending.resolve(page([]));
  await reloading;
  assert.equal(screen.store.get().list.state, "loading");
});

test("경합: 자료 A 삭제 중 자료 B를 열어 입력하면, A의 늦은 삭제 성공은 목록에서 A만 빼고 B의 선택·입력·미저장 상태를 남긴다", async () => {
  const d = deps();
  const pendingDelete = deferred();
  const screen = createMaterialsScreenModel(fakeApi({ list: [page([item(material(ID)), item(material(ID2, "둘째"))])] }), d);
  await screen.load();
  screen.select({ kind: "existing", textMaterialId: ID });
  const editorA = createMaterialEditorModel(fakeApi({ get: [ok(material(ID))], remove: [pendingDelete] }), ID,
    { onSaved: screen.saved, onDeleted: screen.deleted }, d);
  await editorA.load();
  const deleting = editorA.remove();
  assert.equal(editorA.store.get().deleteState, "deleting");
  // 삭제 응답을 기다리는 동안 B를 연다(A 편집기는 해제된다).
  assert.equal(screen.select({ kind: "existing", textMaterialId: ID2 }), true);
  editorA.dispose();
  const sessionB = screen.store.get().editorSession;
  const editorB = createMaterialEditorModel(fakeApi({ get: [ok(material(ID2, "둘째", "B 본문"))] }), ID2,
    { onSaved: screen.saved, onDeleted: screen.deleted }, d);
  await editorB.load();
  editorB.change({ title: "둘째", body: "B 본문 쓰는 중" });
  screen.setDirty(editorB.isDirty());
  pendingDelete.resolve(ok(null));
  await deleting;
  const state = screen.store.get();
  assert.deepEqual(state.list.items.map((i) => i.textMaterialId), [ID2]);
  assert.deepEqual(state.selection, { kind: "existing", textMaterialId: ID2 });
  assert.equal(state.dirty, true);
  assert.equal(state.editorSession, sessionB);
  assert.equal(editorB.store.get().edit.draft.body, "B 본문 쓰는 중");
});

test("경합: A 삭제 중 새 자료를 열어도 늦은 삭제 성공이 새 자료 편집을 닫지 않고, A를 연 채면 삭제 성공이 A를 닫는다", async () => {
  const d = deps();
  const late = deferred();
  const screen = createMaterialsScreenModel(fakeApi({ list: [page([item(material(ID))])] }), d);
  await screen.load();
  screen.select({ kind: "existing", textMaterialId: ID });
  const editorA = createMaterialEditorModel(fakeApi({ get: [ok(material(ID))], remove: [late] }), ID,
    { onSaved: screen.saved, onDeleted: screen.deleted }, d);
  await editorA.load();
  const deleting = editorA.remove();
  screen.select({ kind: "new" });
  editorA.dispose();
  screen.setDirty(true);
  late.resolve(ok(null));
  await deleting;
  assert.deepEqual(screen.store.get().selection, { kind: "new" });
  assert.equal(screen.store.get().dirty, true);
  assert.deepEqual(screen.store.get().list.items, []);

  // 삭제한 자료를 연 채면 닫는다(기존 동작).
  const screen2 = createMaterialsScreenModel(fakeApi({ list: [page([item(material(ID))])] }), d);
  await screen2.load();
  screen2.select({ kind: "existing", textMaterialId: ID });
  const e2 = createMaterialEditorModel(fakeApi({ get: [ok(material(ID))], remove: [ok(null)] }), ID,
    { onSaved: screen2.saved, onDeleted: screen2.deleted }, d);
  await e2.load();
  await e2.remove();
  assert.equal(screen2.store.get().selection, null);
  assert.deepEqual(screen2.store.get().list.items, []);
});

test("경합: 편집기 해제 뒤 도착한 삭제 실패는 화면 선택을 바꾸지 않는다", async () => {
  const d = deps();
  const late = deferred();
  const screen = createMaterialsScreenModel(fakeApi({ list: [page([item(material(ID)), item(material(ID2))])] }), d);
  await screen.load();
  screen.select({ kind: "existing", textMaterialId: ID });
  const editorA = createMaterialEditorModel(fakeApi({ get: [ok(material(ID))], remove: [late] }), ID,
    { onSaved: screen.saved, onDeleted: screen.deleted }, d);
  await editorA.load();
  const deleting = editorA.remove();
  screen.select({ kind: "existing", textMaterialId: ID2 });
  editorA.dispose();
  late.resolve(failed("server"));
  await deleting;
  assert.deepEqual(screen.store.get().selection, { kind: "existing", textMaterialId: ID2 });
  assert.equal(screen.store.get().list.items.length, 2);
});

test("경합: 새 자료 저장 중 이탈 확인 뒤 다른 자료를 열면, 늦은 저장 성공은 목록에 그 자료를 더하고 지금 선택·입력은 그대로 둔다", async () => {
  const d = deps();
  const lateCreate = deferred();
  const screen = createMaterialsScreenModel(fakeApi({ list: [page([item(material(ID2, "둘째"))])] }), d);
  await screen.load();
  screen.select({ kind: "new" });
  const sessionNew = screen.store.get().editorSession;
  const editorNew = createMaterialEditorModel(fakeApi({ create: [lateCreate] }), null,
    { onSaved: (saved, created) => screen.saved(saved, created, sessionNew), onDeleted: screen.deleted }, d);
  editorNew.change({ title: "새 자료", body: "새 본문" });
  screen.setDirty(editorNew.isDirty());
  const saving = editorNew.save();
  // 저장 응답 전에 B로 옮긴다(미저장 확인을 거친다). 편집기는 해제된다.
  assert.equal(screen.select({ kind: "existing", textMaterialId: ID2 }), true);
  editorNew.dispose();
  const sessionB = screen.store.get().editorSession;
  screen.setDirty(true);
  lateCreate.resolve(ok(material(ID, "새 자료", "새 본문", LATER)));
  await saving;
  const state = screen.store.get();
  // 서버에는 만들어졌으므로 목록에 보여야 같은 자료를 다시 만들지 않는다.
  assert.deepEqual(state.list.items.map((i) => i.textMaterialId), [ID, ID2]);
  assert.deepEqual(state.selection, { kind: "existing", textMaterialId: ID2 });
  assert.equal(state.dirty, true);
  assert.equal(state.editorSession, sessionB);
});

test("경합: 기존 자료 A 저장 중 B로 옮기면, A의 늦은 저장 성공은 목록의 A 제목만 바꾸고 B 선택을 그대로 둔다", async () => {
  const d = deps();
  const lateUpdate = deferred();
  const screen = createMaterialsScreenModel(fakeApi({ list: [page([item(material(ID)), item(material(ID2, "둘째"))])] }), d);
  await screen.load();
  screen.select({ kind: "existing", textMaterialId: ID });
  const sessionA = screen.store.get().editorSession;
  const editorA = createMaterialEditorModel(fakeApi({ get: [ok(material(ID))], update: [lateUpdate] }), ID,
    { onSaved: (saved, created) => screen.saved(saved, created, sessionA), onDeleted: screen.deleted }, d);
  await editorA.load();
  editorA.change({ title: "바뀐 제목", body: "자료 본문" });
  const saving = editorA.save();
  screen.select({ kind: "existing", textMaterialId: ID2 });
  editorA.dispose();
  lateUpdate.resolve(ok(material(ID, "바뀐 제목", "자료 본문", LATER)));
  await saving;
  const state = screen.store.get();
  assert.deepEqual(state.list.items.map((i) => i.title), ["바뀐 제목", "둘째"]);
  assert.deepEqual(state.selection, { kind: "existing", textMaterialId: ID2 });
});

test("경합: 첫 목록 조회가 늦는 동안 새 자료 저장이 성공하면 목록을 다시 읽어, 늦은 이전 응답이 새 자료를 지우지 않고 선택·입력·미저장 상태가 남는다", async () => {
  const late = deferred();
  const fresh = deferred();
  const api = fakeApi({ list: [late, fresh] });
  const screen = createMaterialsScreenModel(api, deps());
  const loading = screen.load();
  screen.select({ kind: "new" });
  const session = screen.store.get().editorSession;
  screen.setDirty(true); // 저장 뒤 더 쓴 입력
  screen.saved(item(material(ID, "새 자료")), true, session);
  const lists = api.calls.filter((c) => c.name === "list");
  assert.equal(lists.length, 2);
  assert.equal(lists[0].signal.aborted, true);
  late.resolve(page([item(material(ID2, "기존"))])); // 생성 전에 읽은 응답
  await loading;
  assert.equal(screen.store.get().list.state, "loading");
  fresh.resolve(page([item(material(ID, "새 자료")), item(material(ID2, "기존"))]));
  await tick();
  const state = screen.store.get();
  assert.deepEqual(state.list.items.map((i) => i.textMaterialId), [ID, ID2]);
  assert.deepEqual(state.selection, { kind: "existing", textMaterialId: ID });
  assert.equal(state.editorSession, session);
  assert.equal(state.dirty, true);
});

test("경합: 목록 조회 중 끝난 수정 저장·삭제는 늦은 이전 응답의 옛 제목·지운 자료로 돌아가지 않는다", async () => {
  const late = deferred();
  const api = fakeApi({ list: [late, page([item(material(ID, "새 제목", "b", LATER))])] });
  const screen = createMaterialsScreenModel(api, deps());
  const loading = screen.load();
  screen.saved(item(material(ID, "새 제목", "b", LATER)), false);
  late.resolve(page([item(material(ID, "옛 제목"))]));
  await loading;
  await tick();
  assert.deepEqual(screen.store.get().list.items.map((i) => i.title), ["새 제목"]);

  // 첫 조회 실패 → 새 자료 저장 → 다시 시도 중 그 자료를 삭제하면, 삭제 전에 읽은 응답이 자료를 되살리지 않는다.
  const before = deferred();
  const api2 = fakeApi({ list: [failed("server"), before, page([])] });
  const screen2 = createMaterialsScreenModel(api2, deps());
  await screen2.load();
  screen2.select({ kind: "new" });
  screen2.saved(item(material(ID)), true, screen2.store.get().editorSession);
  const retrying = screen2.load();
  screen2.deleted(ID);
  before.resolve(page([item(material(ID))]));
  await retrying;
  await tick();
  assert.equal(api2.calls.filter((c) => c.name === "list").length, 3);
  assert.deepEqual(screen2.store.get().list, { state: "ready", items: [], nextCursor: null });
  assert.equal(screen2.store.get().selection, null);
});

test("경합: 목록 조회 중 새 자료 저장을 기다리며 다른 새 자료를 열면, 늦은 성공은 목록에만 남고 지금 선택·입력은 그대로다. 화면을 닫은 뒤에는 다시 읽지 않는다", async () => {
  const late = deferred();
  const api = fakeApi({ list: [late, page([item(material(ID, "먼저 저장한 자료"))])] });
  const screen = createMaterialsScreenModel(api, deps());
  const loading = screen.load();
  screen.select({ kind: "new" });
  const first = screen.store.get().editorSession;
  screen.select({ kind: "new" }); // 미저장 입력이 없어 묻지 않고 옮긴다
  screen.setDirty(true);
  screen.saved(item(material(ID, "먼저 저장한 자료")), true, first);
  late.resolve(page([]));
  await loading;
  await tick();
  const state = screen.store.get();
  assert.deepEqual(state.list.items.map((i) => i.textMaterialId), [ID]);
  assert.deepEqual(state.selection, { kind: "new" });
  assert.equal(state.editorSession, first + 1);
  assert.equal(state.dirty, true);

  const pending = deferred();
  const api2 = fakeApi({ list: [pending] });
  const screen2 = createMaterialsScreenModel(api2, deps());
  void screen2.load();
  screen2.dispose();
  screen2.saved(item(material(ID)), true);
  screen2.deleted(ID2);
  assert.equal(api2.calls.filter((c) => c.name === "list").length, 1);
});

test("경합: [더 보기]를 기다리는 동안 끝난 새 자료·수정·삭제는 늦은 다음 쪽 응답과 겹쳐도 중복·옛 제목·삭제 자료를 만들지 않는다", async () => {
  // 서버 목록은 만든 시각 역순 커서다. 다음 쪽은 첫 쪽 마지막 자료보다 먼저 만든 자료만 담는다.
  const more = deferred();
  const api = fakeApi({ list: [page([item(material(ID, "첫째")), item(material(ID2, "둘째"))], "cursor-1"), more] });
  const screen = createMaterialsScreenModel(api, deps());
  await screen.load();
  const loadingMore = screen.loadMore();
  screen.saved(item(material(ID3, "새 자료")), true);
  screen.saved(item(material(ID, "첫째-새제목", "b", LATER)), false);
  screen.deleted(ID2);
  assert.equal(api.calls.filter((c) => c.name === "list").length, 2); // 첫 쪽 조회가 끝났으므로 다시 읽지 않는다
  more.resolve(page([item(material(ID4, "셋째"))]));
  await loadingMore;
  assert.deepEqual(screen.store.get().list.items.map((i) => i.title), ["새 자료", "첫째-새제목", "셋째"]);
  assert.equal(screen.store.get().moreState, "idle");
});

test("경합: [더 보기]를 기다리는 동안 목록을 다시 읽으면, 늦은 다음 쪽 응답을 새 목록에 붙이지 않는다", async () => {
  const more = deferred();
  const api = fakeApi({ list: [
    page([item(material(ID, "첫째")), item(material(ID2, "둘째"))], "cursor-1"), more,
    page([item(material(ID2, "둘째")), item(material(ID4, "셋째"))], "cursor-2"),
  ] });
  const screen = createMaterialsScreenModel(api, deps());
  await screen.load();
  const loadingMore = screen.loadMore();
  await screen.load(); // 예: 첫째가 지워진 뒤 다시 읽음
  more.resolve(page([item(material(ID4, "셋째"))], null));
  await loadingMore;
  assert.deepEqual(screen.store.get().list, {
    state: "ready", items: [item(material(ID2, "둘째")), item(material(ID4, "셋째"))], nextCursor: "cursor-2",
  });
  assert.equal(screen.store.get().moreState, "idle");
});

test("경합: 새 자료 저장 뒤 자동으로 다시 읽은 목록이 실패하면, 저장됨·입력은 편집기에 남고 목록만 실패를 알리며 다시 불러오면 저장한 자료가 나타난다", async () => {
  const late = deferred();
  const api = fakeApi({
    list: [late, failed("server"), page([item(material(ID, "새 제목"))])],
    create: [ok(material(ID, "새 제목", "새 본문"))],
  });
  const d = deps();
  const screen = createMaterialsScreenModel(api, d);
  const loading = screen.load();
  screen.select({ kind: "new" });
  const session = screen.store.get().editorSession;
  const editor = createMaterialEditorModel(api, null, {
    onSaved: (saved, created) => screen.saved(saved, created, session), onDeleted: screen.deleted,
  }, d);
  await editor.load();
  editor.change({ title: "새 제목", body: "새 본문" });
  await editor.save();
  late.resolve(page([]));
  await loading;
  await tick();
  const failedState = screen.store.get();
  assert.equal(failedState.list.state, "error");
  assert.equal(failedState.list.errorText, materialListErrorText("server"));
  assert.deepEqual(failedState.selection, { kind: "existing", textMaterialId: ID });
  assert.equal(failedState.editorSession, session);
  const { edit } = editor.store.get();
  assert.deepEqual(editStatusLines(edit.status).lines, [SAVED_TEXT]);
  assert.equal(edit.textMaterialId, ID);
  assert.deepEqual(edit.draft, { title: "새 제목", body: "새 본문" });
  // 목록 실패 중에도 이어 쓴 입력은 편집기와 미저장 상태에 남는다.
  editor.change({ title: "새 제목", body: "새 본문 더 씀" });
  screen.setDirty(editor.isDirty());
  await screen.load(); // [다시 불러오기]
  assert.deepEqual(screen.store.get().list.items.map((i) => i.textMaterialId), [ID]);
  assert.deepEqual(screen.store.get().selection, { kind: "existing", textMaterialId: ID });
  assert.equal(screen.store.get().dirty, true);
  assert.equal(editor.store.get().edit.draft.body, "새 본문 더 씀");
  assert.equal(api.calls.filter((c) => c.name === "create").length, 1);
});

test("화면 렌더: 첫 화면은 제목과 목록 불러오기 상태를 보이고 편집기는 열지 않는다(효과는 돌지 않음)", () => {
  const html = renderToStaticMarkup(createElement(MaterialsScreen, { api: fakeApi(), deps: deps() }));
  assert.match(html, /<h1>텍스트 자료<\/h1>/);
  assert.match(html, /자료 목록을 불러오고 있습니다/);
  assert.doesNotMatch(html, /새 텍스트 자료/);
});

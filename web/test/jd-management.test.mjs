/** U10 관리의 승인 7개 시나리오. 계약 모양 transport와 정적 렌더이며 실제 브라우저/API 연결 검사가 아니다. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { createJdApi } from "../src/features/jd/jd-api.ts";
import { createJdManagementModel } from "../src/features/jd/jd-management-model.ts";
import { jdDraftErrors } from "../src/features/jd/jd-types.ts";
import { toClientResult } from "../src/lib/auth-api.ts";
import { load } from "./u2-render.mjs";

const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.endsWith(".tsx") && specifier.startsWith(".") && !/\.(ts|tsx|css)$/.test(specifier)) {
      return next(`${specifier}.ts`, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith(".module.css")) return { format: "module", shortCircuit: true, source: "export default {};" };
    if (url.endsWith(".tsx")) return { format: "module", shortCircuit: true, source: ts.transpileModule(readFileSync(new URL(url), "utf8"),
      { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext } }).outputText };
    return next(url, context);
  },
});
const { JdEditor, JdList, DeleteJdConfirm } = await import("../src/features/jd/jd-management-view.tsx");
hooks.deregister();
const { JdManagementPage } = await load("features/jd/jd-management-page.tsx");

const ID = "00000000-0000-4000-8000-000000000001", ID2 = "00000000-0000-4000-8000-000000000002";
const now = "2026-11-04T03:00:00.000Z";
const jd = (id = ID, title = "개발자", body = "  - React 경험\r\n\r\n질문  ") => ({ jdId: id, title, body, createdAt: now, updatedAt: now });
const item = ({ jdId, title, updatedAt }) => ({ jdId, title, updatedAt });
const success = (data, status = 200) => ({ kind: "success", status, data });
const error = (code = "SERVER_ERROR", status = 500) => ({ kind: "api-error", status, code, message: "원문을 화면에 노출하면 안 됨" });
const page = (items = [], nextCursor = null) => success({ items, nextCursor });
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
function setup(responses = []) {
  const calls = [], auth = { key: 1, logged: true };
  const api = createJdApi(async (path, request) => { calls.push({ path, ...request }); return await responses.shift(); });
  const model = createJdManagementModel(api, { session: () => auth.key, isLoggedIn: () => auth.logged });
  return { calls, auth, model, api };
}

test("1. 로그인 없이는 조회하지 않고, 정상 빈 목록과 조회 실패를 나눈다", async () => {
  const blocked = setup(); blocked.auth.logged = false;
  await blocked.model.load(); assert.equal(blocked.calls.length, 0); assert.equal(blocked.model.store.get().loginRequired, true);
  const html = renderToStaticMarkup(createElement(JdManagementPage, { client: blocked.api }));
  assert.match(html, /로그인 후 JD/); assert.doesNotMatch(html, /jd-editor-form/); assert.equal(blocked.calls.length, 0);
  const { model } = setup([page(), error()]);
  await model.load(); assert.equal(model.store.get().listState, "ready");
  assert.match(renderToStaticMarkup(createElement(JdList, { state: model.store.get(), model })), /저장한 JD가 없습니다/);
  await model.load(); assert.equal(model.store.get().listState, "error");
  assert.doesNotMatch(renderToStaticMarkup(createElement(JdList, { state: model.store.get(), model })), /저장한 JD가 없습니다|원문을 화면/);
});

test("2. 선택 상세·다음 페이지를 읽으며 목록에 본문이 섞이거나 늦은 다른 선택 응답이면 반영하지 않는다", async () => {
  const late = deferred();
  const { model, calls } = setup([page([item(jd())], "next"), page([item(jd(ID2))]), late.promise, success(jd(ID2))]);
  await model.load(); await model.load(true);
  assert.equal(calls[1].path, "/jds?cursor=next"); assert.equal(model.store.get().list.length, 2);
  const first = model.select(ID); await model.select(ID2); late.resolve(success(jd())); await first;
  assert.equal(model.store.get().selectedId, ID2);
  const malformed = setup([page([jd()])]); await malformed.model.load(); assert.equal(malformed.model.store.get().listState, "error");
});

test("3. 생성·수정은 원문을 그대로 보내고 성공 뒤 서버 목록을 갱신한다", async () => {
  const original = jd();
  const { model, calls } = setup([success(original, 201), page([item(original)]), success(jd(ID, "수정")), page([item(jd(ID, "수정"))])]);
  await model.select(null); model.change({ title: original.title, body: original.body }); await model.save();
  assert.equal(calls[0].method, "POST"); assert.equal(calls[0].body.body, original.body);
  assert.equal(model.store.get().editState, "saved"); assert.equal(model.store.get().selectedId, ID);
  model.change({ title: "수정", body: original.body }); await model.save();
  assert.equal(calls[2].method, "PATCH"); assert.equal(model.store.get().list[0].title, "수정");
  assert.equal(model.store.get().draft.body, original.body);
});

test("4. 서버·입력·미전송·인증 갱신 거부는 성공으로 보이지 않고 입력을 유지한다", async () => {
  for (const response of [error(), error("INVALID_INPUT", 422), toClientResult({ kind: "not-sent", reason: "logout-hold" }),
    { ...error("AUTH_INVALID", 401), authRenewal: "renewed" }]) {
    const { model } = setup([response]); await model.select(null); model.change({ title: "남길 제목", body: "<script>남길 입력</script>" });
    await model.save();
    assert.equal(model.store.get().editState, "error"); assert.equal(model.store.get().draft.title, "남길 제목");
    const html = renderToStaticMarkup(createElement(JdEditor, { state: model.store.get(), model, canUpdate: true }));
    assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /저장되었습니다|원문을 화면/);
  }
  // #471 이후 실제 공용 PATCH 연결은 jd-member-binding.test.mjs에서 검사한다.
  const expired = setup([error("AUTH_INVALID", 401)]); await expired.model.select(null);
  expired.model.change({ title: "이전 회원", body: "이전 입력" }); await expired.model.save();
  assert.equal(expired.model.store.get().loginRequired, true); assert.equal(expired.model.store.get().draft.body, "");
});

test("5. 삭제는 확인 후만 보내며 취소·실패·성공을 구분한다", async () => {
  const { model, calls } = setup([success(jd()), error(), success(null, 204), page()]);
  await model.select(ID); await model.remove(); assert.equal(calls.length, 1);
  model.confirmDelete(true);
  assert.match(renderToStaticMarkup(createElement(DeleteJdConfirm, { state: model.store.get(), model })), /관련 요약 기록이 함께 삭제/);
  model.confirmDelete(false); await model.remove(); assert.equal(calls.length, 1);
  model.confirmDelete(true); await model.remove(); assert.equal(model.store.get().selectedId, ID); assert.equal(model.store.get().deleting, false);
  await model.remove(); assert.equal(model.store.get().editorOpen, false); assert.equal(model.store.get().list.length, 0);
});

test("6. UTF-16 제목·본문 상한은 정확히 허용하며 초과·공백 입력을 자르거나 보내지 않는다", async () => {
  assert.deepEqual(jdDraftErrors({ title: "😀".repeat(100), body: "가".repeat(20000) }), []);
  assert.equal(jdDraftErrors({ title: "😀".repeat(100) + "x", body: "가".repeat(20001) }).length, 2);
  assert.equal(jdDraftErrors({ title: "  ", body: "\r\n " }).length, 2);
  const { model, calls } = setup(); await model.select(null);
  const body = "x".repeat(20001); model.change({ title: "a", body }); await model.save();
  assert.equal(calls.length, 0); assert.equal(model.store.get().draft.body, body);
  const html = renderToStaticMarkup(createElement(JdEditor, { state: model.store.get(), model, canUpdate: true }));
  assert.match(html, /일부 문자는 여러 자로 계산됩니다/); assert.doesNotMatch(html, /UTF-16/);
});

test("7. 계정이 바뀌거나 화면이 닫힌 뒤 늦은 응답은 목록·입력·삭제 결과를 복원하지 않는다", async () => {
  const late = deferred(); const { model, auth } = setup([late.promise]);
  const loading = model.load(); auth.key = 2; late.resolve(page([item(jd())])); await loading;
  assert.equal(model.store.get().list.length, 0); assert.equal(model.store.get().loginRequired, true);
  const waiting = deferred(); const closed = setup([waiting.promise]);
  const select = closed.model.select(ID); closed.model.dispose(); waiting.resolve(success(jd())); await select;
  assert.equal(closed.model.store.get().draft.body, "");
});

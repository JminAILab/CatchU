/**
 * U4 W1 Catch 작성자 설명 편집기(`author-description-editor.tsx`)의 상태 전이 시험.
 *
 * 시나리오(코드 생성 계획 Step 2·S1, 2026-10-29 보완):
 * - 열 때 현재 설명을 읽고, 읽지 못하면 빈 설명으로 추정하지 않는다(로그인 만료는 이유를 보인다). 다시 불러오기로 열린다.
 * - 성공 응답 뒤에만 "저장됨"이고, 저장 중에 더 쓴 입력은 덮지 않는다. 실패하면 입력을 남긴다. 4,001자는 보내지 않는다.
 * - 늦게 온 불러오기 응답·로그인이 바뀐 뒤의 응답은 반영하지 않는다.
 * 원본 tsx를 변환해 불러온다. 서버는 계약 모양 대역이며 실제 브라우저·api·DB 검증이 아니다.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { LOGIN_EXPIRED_TEXT, SAVED_TEXT, editStatusLines } from "../src/lib/save-outcome.ts";

const srcUrl = new URL("../src/", import.meta.url);
const editorUrl = new URL("../src/features/assets/author-description-editor.tsx", import.meta.url);
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
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
const { AuthorDescriptionEditor, createDescriptionEditorModel } = await import(editorUrl.href);
hooks.deregister();

const CATCH = "44444444-4444-4444-8444-444444444444";
const AT = "2026-10-29T01:02:03.456Z";
const described = (text) => ({ authorDescription: text, authorDescriptionUpdatedAt: text === null ? null : AT });
function deferred() { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; }
const tick = () => new Promise((resolve) => setImmediate(resolve));

function fakeApi({ read = [], save = [] } = {}) {
  const calls = [];
  const pull = (queue) => { const v = queue.shift(); return v && typeof v.promise === "object" ? v.promise : Promise.resolve(v); };
  return {
    calls,
    read: (catchId, signal) => { calls.push({ name: "read", catchId, signal }); return pull(read); },
    save: (catchId, value, signal) => { calls.push({ name: "save", catchId, value, signal }); return pull(save); },
  };
}
const deps = () => { const d = { token: "a", session: () => d.token }; return d; };

test("설명 편집기: 현재 설명을 읽어 열고, 저장 성공 응답 뒤에만 저장됨이며 공백 저장은 빈칸이 된다", async () => {
  const api = fakeApi({ read: [{ kind: "loaded", value: described("기존 설명") }], save: [{ kind: "saved", value: described(null) }] });
  const model = createDescriptionEditorModel(CATCH, api, deps());
  await model.load();
  assert.deepEqual(model.store.get().edit, { value: "기존 설명", saved: "기존 설명", status: { kind: "idle" } });
  model.change("   ");
  const saving = model.save();
  assert.equal(model.store.get().edit.status.kind, "saving");
  await saving;
  assert.deepEqual(editStatusLines(model.store.get().edit.status).lines, [SAVED_TEXT]);
  assert.equal(model.store.get().edit.value, "");
  assert.deepEqual(api.calls.map((c) => [c.name, c.catchId]), [["read", CATCH], ["save", CATCH]]);
  model.change("다시 씀");
  assert.equal(model.store.get().edit.status.kind, "idle");
  model.dispose();
});

test("설명 편집기: 저장 중에 더 쓴 입력은 성공 응답이 덮지 않는다", async () => {
  const pending = deferred();
  const api = fakeApi({ read: [{ kind: "loaded", value: described(null) }], save: [pending] });
  const model = createDescriptionEditorModel(CATCH, api, deps());
  await model.load();
  model.change("첫 설명");
  const saving = model.save();
  await model.save(); // 저장 중에는 다시 보내지 않는다
  model.change("첫 설명 그리고 더");
  pending.resolve({ kind: "saved", value: described("첫 설명") });
  await saving;
  const { edit } = model.store.get();
  assert.equal(edit.value, "첫 설명 그리고 더");
  assert.equal(edit.saved, "첫 설명");
  assert.equal(api.calls.filter((c) => c.name === "save").length, 1);
});

test("설명 편집기: 저장 실패는 입력을 남기고, 4,001자는 보내지 않는다", async () => {
  const api = fakeApi({ read: [{ kind: "loaded", value: described("a") }], save: [{ kind: "failed", failure: "server" }] });
  const model = createDescriptionEditorModel(CATCH, api, deps());
  await model.load();
  model.change("남을 입력");
  await model.save();
  assert.deepEqual(model.store.get().edit.status, { kind: "failed", failure: "server" });
  assert.equal(model.store.get().edit.value, "남을 입력");
  model.change("가".repeat(4001));
  await model.save();
  assert.equal(model.store.get().edit.status.kind, "invalid");
  assert.equal(api.calls.filter((c) => c.name === "save").length, 1);
});

test("설명 편집기: 불러오기 실패는 빈 설명으로 추정하지 않고, 로그인 만료는 이유를 보이며 다시 불러오면 열린다", async () => {
  const api = fakeApi({ read: [{ kind: "failed", failure: "login-expired" }, { kind: "failed", failure: "server" }, { kind: "loaded", value: described("열림") }] });
  const model = createDescriptionEditorModel(CATCH, api, deps());
  await model.load();
  assert.equal(model.store.get().load, "error");
  assert.equal(model.store.get().loadFailureText, LOGIN_EXPIRED_TEXT);
  await model.save(); // 열리지 않은 상태에서는 저장하지 않는다
  assert.equal(api.calls.some((c) => c.name === "save"), false);
  await model.load();
  assert.equal(model.store.get().loadFailureText, undefined);
  model.retry();
  await tick();
  assert.equal(model.store.get().load, "ready");
  assert.equal(model.store.get().edit.value, "열림");
});

test("설명 편집기: 늦게 온 불러오기 응답과 로그인이 바뀐 뒤의 응답은 반영하지 않는다", async () => {
  const first = deferred();
  const api = fakeApi({ read: [first, { kind: "loaded", value: described("새 값") }] });
  const model = createDescriptionEditorModel(CATCH, api, deps());
  const late = model.load();
  await model.load();
  model.change("쓰던 입력");
  first.resolve({ kind: "loaded", value: described("옛 값") });
  await late;
  assert.equal(model.store.get().edit.value, "쓰던 입력");

  const d = deps();
  const pending = deferred();
  const m2 = createDescriptionEditorModel(CATCH, fakeApi({ read: [{ kind: "loaded", value: described(null) }], save: [pending] }), d);
  await m2.load();
  m2.change("설명");
  const saving = m2.save();
  d.token = "b";
  pending.resolve({ kind: "saved", value: described("설명") });
  await saving;
  assert.equal(m2.store.get().edit.status.kind, "saving");
});

test("설명 편집기 렌더: 첫 화면은 불러오는 중을 보이고 입력칸을 열지 않는다(효과는 돌지 않음)", () => {
  const html = renderToStaticMarkup(createElement(AuthorDescriptionEditor, { catchId: CATCH, api: fakeApi(), deps: deps() }));
  assert.match(html, /작성자 설명/);
  assert.doesNotMatch(html, /<textarea/);
});

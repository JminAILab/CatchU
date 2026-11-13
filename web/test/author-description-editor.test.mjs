/**
 * U4 W1 Catch 작성자 설명 편집기(`author-description-editor.tsx`)의 상태 전이 시험. 새 Catch NC1에서 8칸 편집으로 바꿨다.
 *
 * 시나리오(코드 생성 계획 Step 2·S1, 2026-10-29 보완, 새 Catch US1.1~US1.3·US2.1·US2.3, BR1.4~BR1.6):
 * - 열 때 현재 설명을 읽어 8칸으로 나누고, 읽지 못하면 빈 설명으로 추정하지 않는다(로그인 만료는 이유를 보인다). 다시 불러오기로 열린다.
 * - 저장은 8칸을 합친 글 하나를 보낸다. 빈 칸은 칸 제목째 빠지고 「더 쓰기」만이면 칸 제목이 없다. 합친 글 4,001자는 보내지 않는다.
 * - 성공 응답 뒤에만 "저장됨"이고, 저장 중에 더 쓴 입력은 덮지 않는다. 실패하면 입력을 남긴다.
 * - 칸 제목 줄이 없는 옛 글·이은 칸이 있는 글을 열자마자 「저장하지 않은 변경」이 되지 않는다. 칸을 고치는 동안 API를 부르지 않는다.
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
import { isDescriptionDirty } from "../src/features/assets/author-description-api.ts";
import { sectionTexts } from "../src/lib/author-description-sections.ts";

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
const texts = (patch = {}) => ({ ...sectionTexts(null), ...patch });
const FREE = "더 쓰기";

test("설명 편집기: 현재 설명을 읽어 8칸으로 열고, 저장 성공 응답 뒤에만 저장됨이며 공백 저장은 빈칸이 된다", async () => {
  const api = fakeApi({ read: [{ kind: "loaded", value: described("기존 설명") }], save: [{ kind: "saved", value: described(null) }] });
  const model = createDescriptionEditorModel(CATCH, api, deps());
  await model.load();
  assert.deepEqual(model.store.get().edit, { texts: texts({ [FREE]: "기존 설명" }), savedTexts: texts({ [FREE]: "기존 설명" }), status: { kind: "idle" } });
  model.change(FREE, "   ");
  const saving = model.save();
  assert.equal(model.store.get().edit.status.kind, "saving");
  await saving;
  assert.deepEqual(editStatusLines(model.store.get().edit.status).lines, [SAVED_TEXT]);
  assert.deepEqual(model.store.get().edit.texts, texts());
  assert.deepEqual(api.calls.map((c) => [c.name, c.catchId]), [["read", CATCH], ["save", CATCH]]);
  model.change(FREE, "다시 씀");
  assert.equal(model.store.get().edit.status.kind, "idle");
  model.dispose();
});

test("설명 편집기: 저장 중에 더 쓴 입력은 성공 응답이 덮지 않는다", async () => {
  const pending = deferred();
  const api = fakeApi({ read: [{ kind: "loaded", value: described(null) }], save: [pending] });
  const model = createDescriptionEditorModel(CATCH, api, deps());
  await model.load();
  model.change(FREE, "첫 설명");
  const saving = model.save();
  await model.save(); // 저장 중에는 다시 보내지 않는다
  model.change(FREE, "첫 설명 그리고 더");
  pending.resolve({ kind: "saved", value: described("첫 설명") });
  await saving;
  const { edit } = model.store.get();
  assert.equal(edit.texts[FREE], "첫 설명 그리고 더");
  assert.equal(edit.savedTexts[FREE], "첫 설명");
  assert.equal(isDescriptionDirty(edit), true);
  assert.equal(api.calls.filter((c) => c.name === "save").length, 1);
});

test("설명 편집기: 저장 실패는 입력을 남기고, 4,001자는 보내지 않는다", async () => {
  const api = fakeApi({ read: [{ kind: "loaded", value: described("a") }], save: [{ kind: "failed", failure: "server" }] });
  const model = createDescriptionEditorModel(CATCH, api, deps());
  await model.load();
  model.change(FREE, "남을 입력");
  await model.save();
  assert.deepEqual(model.store.get().edit.status, { kind: "failed", failure: "server" });
  assert.equal(model.store.get().edit.texts[FREE], "남을 입력");
  model.change(FREE, "가".repeat(4001));
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
  assert.equal(model.store.get().edit.texts[FREE], "열림");
});

test("설명 편집기: 늦게 온 불러오기 응답과 로그인이 바뀐 뒤의 응답은 반영하지 않는다", async () => {
  const first = deferred();
  const api = fakeApi({ read: [first, { kind: "loaded", value: described("새 값") }] });
  const model = createDescriptionEditorModel(CATCH, api, deps());
  const late = model.load();
  await model.load();
  model.change(FREE, "쓰던 입력");
  first.resolve({ kind: "loaded", value: described("옛 값") });
  await late;
  assert.equal(model.store.get().edit.texts[FREE], "쓰던 입력");

  const d = deps();
  const pending = deferred();
  const m2 = createDescriptionEditorModel(CATCH, fakeApi({ read: [{ kind: "loaded", value: described(null) }], save: [pending] }), d);
  await m2.load();
  m2.change(FREE, "설명");
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

/** 열고 칸을 채운 뒤 저장해 보낸 글을 돌려준다. 서버는 받은 글을 그대로 돌려주는 대역이다(빈 글이면 지운다). */
async function saveSections(stored, patch) {
  const api = fakeApi({ read: [{ kind: "loaded", value: described(stored) }] });
  api.save = (catchId, value) => { api.calls.push({ name: "save", catchId, value }); return Promise.resolve({ kind: "saved", value: described(value.trim() ? value : null) }); };
  const model = createDescriptionEditorModel(CATCH, api, deps());
  await model.load();
  for (const [title, value] of Object.entries(patch)) model.change(title, value);
  await model.save();
  return { model, sent: api.calls.filter((c) => c.name === "save").map((c) => c.value) };
}

test("AC1.1.1 두 칸만 쓰고 저장하면 저장 경로로 보내는 글에 그 두 칸만 칸 제목과 함께 들어간다", async () => {
  const { sent } = await saveSections(null, { "이 작업에서 정한 것": "줄여 올리기로 했다.", "짚어 볼 곳": "https://github.com/o/r/blob/ba6bba8/a.ts#L3 메모" });
  assert.deepEqual(sent, ["【이 작업에서 정한 것】\n줄여 올리기로 했다.\n\n【짚어 볼 곳】\nhttps://github.com/o/r/blob/ba6bba8/a.ts#L3 메모"]);
});

test("AC1.1.2 두 칸을 저장했다 다시 열면 칸 안 줄바꿈까지 그대로이고 나머지 여섯 칸은 비어 있으며 저장하지 않은 변경이 없다", async () => {
  const written = { "맡은 부분": "화면 두 곳\n프로필 창", "짚어 볼 곳": "https://github.com/o/r/pull/1 첫째\nhttps://github.com/o/r/pull/2 둘째" };
  const { sent } = await saveSections(null, written);
  const reopened = createDescriptionEditorModel(CATCH, fakeApi({ read: [{ kind: "loaded", value: described(sent[0]) }] }), deps());
  await reopened.load();
  assert.deepEqual(reopened.store.get().edit.texts, texts(written));
  assert.equal(isDescriptionDirty(reopened.store.get().edit), false);
});

test("AC1.1.3 이전 설명이 있는 Catch에서 8칸을 모두 비우고 저장하면 빈 글을 보내 설명이 지워진다", async () => {
  const { model, sent } = await saveSections("【맡은 부분】\n있던 설명\n\n【더 쓰기】\n덧붙임", { "맡은 부분": "", [FREE]: "  " });
  assert.deepEqual(sent, [""]);
  assert.deepEqual(model.store.get().edit.texts, texts());
  assert.equal(model.store.get().edit.status.kind, "saved");
});

test("AC1.1.5 「고른 것과 버린 것」 칸 안에 칸 제목 줄과 같은 줄을 써도 저장은 막히지 않는다", async () => {
  const { sent, model } = await saveSections(null, { "고른 것과 버린 것": "버린 안\n【짚어 볼 곳】\n메모" });
  assert.equal(sent.length, 1);
  assert.equal(model.store.get().edit.status.kind, "saved");
});

test("AC1.2.1 칸 제목을 포함한 합계가 4,001자면 저장 요청을 보내지 않고 상한 안내를 보이며 쓴 글은 그대로다", async () => {
  const api = fakeApi({ read: [{ kind: "loaded", value: described(null) }] });
  const model = createDescriptionEditorModel(CATCH, api, deps());
  await model.load();
  const heading = "【맡은 부분】\n".length;
  model.change("맡은 부분", "가".repeat(4001 - heading));
  await model.save();
  assert.equal(model.store.get().edit.status.kind, "invalid");
  assert.match(model.store.get().edit.status.message, /4,000자까지 쓸 수 있습니다\. 지금 4,001자입니다/);
  assert.equal(model.store.get().edit.texts["맡은 부분"].length, 4001 - heading);
  assert.equal(api.calls.some((c) => c.name === "save"), false);
});

test("AC1.3.1 칸 제목 줄이 없는 3,990자 옛 글은 「더 쓰기」 칸에 열리고 저장하지 않은 변경이 없으며 그대로 저장하면 원래 글을 보낸다", async () => {
  const old = "옛 자유 글 ".repeat(800).slice(0, 3990);
  const api = fakeApi({ read: [{ kind: "loaded", value: described(old) }], save: [{ kind: "saved", value: described(old) }] });
  const model = createDescriptionEditorModel(CATCH, api, deps());
  await model.load();
  assert.deepEqual(model.store.get().edit.texts, texts({ [FREE]: old }));
  assert.equal(isDescriptionDirty(model.store.get().edit), false);
  await model.save();
  assert.deepEqual(api.calls.filter((c) => c.name === "save").map((c) => c.value), [old]);
  assert.equal(model.store.get().edit.status.kind, "saved");
});

test("BR1.6 이은 칸이 있는 글을 열어도 「저장하지 않은 변경」이 아니다(합친 글과 저장된 글을 견주지 않음)", async () => {
  const stored = "앞 글\n\n【맡은 부분】\n첫 조각\n\n【맡은 부분】\n둘째 조각";
  const model = createDescriptionEditorModel(CATCH, fakeApi({ read: [{ kind: "loaded", value: described(stored) }] }), deps());
  await model.load();
  assert.equal(model.store.get().edit.texts["맡은 부분"], "첫 조각\n\n둘째 조각");
  assert.equal(model.store.get().edit.texts[FREE], "앞 글");
  assert.equal(isDescriptionDirty(model.store.get().edit), false);
});

test("AC1.3.2 「더 쓰기」 칸에만 쓰고 저장하면 보내는 글에 칸 제목 글자가 붙지 않는다", async () => {
  const { sent } = await saveSections(null, { [FREE]: "덧붙이는 말" });
  assert.deepEqual(sent, ["덧붙이는 말"]);
});

test("AC2.1.2 이 Catch 근거에 없는 커밋 주소도 짚어 볼 곳에 붙여 저장된다", async () => {
  const outside = "https://github.com/someone/else/commit/0123456789abcdef0123456789abcdef01234567";
  const { sent, model } = await saveSections(null, { "짚어 볼 곳": `${outside} 관련 커밋` });
  assert.deepEqual(sent, [`【짚어 볼 곳】\n${outside} 관련 커밋`]);
  assert.equal(model.store.get().edit.status.kind, "saved");
});

test("AC2.3.7 링크를 쓰는 동안(칸을 고치는 동안) API 요청은 일어나지 않는다", async () => {
  const api = fakeApi({ read: [{ kind: "loaded", value: described(null) }] });
  const model = createDescriptionEditorModel(CATCH, api, deps());
  await model.load();
  const before = api.calls.length;
  for (const value of ["https://github.com/o/r/pull/1", "https://github.com/o/r/pull/12", "https://github.com/o/r/blob/ba6bba8/a.ts#L3"]) {
    model.change("짚어 볼 곳", value);
  }
  await tick();
  assert.equal(api.calls.length, before);
});

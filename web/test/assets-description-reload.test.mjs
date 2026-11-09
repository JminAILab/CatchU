/**
 * U4 W1 Catch 상세의 [현재 상태 다시 불러오기]와 작성자 설명 미저장 확인(`assets-connected.tsx`의 `reloadDetail`, BR2.2).
 *
 * 확인·불일치·공개 변경이 실패하면 상세에 [현재 상태 다시 불러오기]가 보인다. 다시 읽는 동안 B 상태(`assets-store.ts`)가
 * 상세를 비우므로 설명 편집기가 해제되고, 조회가 끝나면 서버 설명으로 새로 열린다(#461 리뷰 지적).
 * - 저장하지 않은 설명이 있으면 다시 읽기 전에 묻는다. 머무르면 다시 읽지 않아 입력·미저장 상태가 남는다.
 * - 계속하면 다시 읽는다. 저장하지 않은 설명이 없으면 묻지 않고 다시 읽는다.
 * 원본 tsx를 변환해 불러온다. Catch·설명 서버는 계약 모양 대역이며 실제 브라우저·api·DB 검증이 아니다.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { test } from "node:test";
import ts from "typescript";
import { previewCatches } from "../src/features/assets/fixtures.ts";
import { createUnsavedRegistry } from "../src/lib/unsaved-changes.ts";

const srcUrl = new URL("../src/", import.meta.url);
const NAVIGATION_STUB = new URL("./__assets-connected-stubs__/navigation.mjs", import.meta.url).href;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/navigation") return { url: NAVIGATION_STUB, shortCircuit: true };
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
    if (url === NAVIGATION_STUB) return { format: "module", shortCircuit: true, source: "export const usePathname = () => '/'; export const useSearchParams = () => new URLSearchParams();" };
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
const { reloadDetail } = await import(new URL("../src/features/assets/assets-connected.tsx", import.meta.url).href);
const { createAssetsStore } = await import(new URL("../src/features/assets/assets-store.ts", import.meta.url).href);
const { createDescriptionEditorModel } = await import(new URL("../src/features/assets/author-description-editor.tsx", import.meta.url).href);
const { UNSAVED_MESSAGE } = await import(new URL("../src/features/profile/use-unsaved-guard.ts", import.meta.url).href);
hooks.deregister();

const item = previewCatches[0];
const tick = () => new Promise((resolve) => setImmediate(resolve));

/** 상세 조회는 성공하고 상태 변경은 실패하는 Catch 대역. 상세 조회 횟수를 센다. */
function catchApi() {
  const calls = { detail: 0 };
  return {
    calls,
    list: async () => ({ kind: "success", data: { items: [item], page: { nextCursor: null } } }),
    detail: async () => { calls.detail += 1; return { kind: "success", data: item }; },
    update: async () => ({ kind: "lookup-failed", status: 500, code: "INTERNAL_ERROR" }),
  };
}

/** 변경 실패로 [현재 상태 다시 불러오기]가 보이는 상세와, 화면처럼 미저장 판정을 등록한 설명 편집기. */
async function failedDetailWithEditor(typed) {
  const api = catchApi();
  const store = createAssetsStore(api);
  await store.openDetail(item.catchId);
  const descriptions = {
    read: async () => ({ kind: "loaded", value: { authorDescription: "서버 설명", authorDescriptionUpdatedAt: null } }),
    save: async () => ({ kind: "failed", failure: "server" }),
  };
  const editor = createDescriptionEditorModel(item.catchId, descriptions, { session: () => "session-a" });
  await editor.load();
  if (typed !== undefined) editor.change(typed);
  const registry = createUnsavedRegistry();
  registry.register(() => { const { edit } = editor.store.get(); return edit.value !== edit.saved; });
  await store.update({ kind: "mismatch", mismatch: true });
  assert.equal(store.getSnapshot().mutation.status, "error");
  return { api, store, editor, registry };
}
const confirmer = (answer) => { const asked = []; return { asked, confirm: (message) => { asked.push(message); return answer; } }; };

test("다시 불러오기: 저장하지 않은 설명이 있을 때 머무르면 다시 읽지 않고 상세·입력·미저장 상태가 그대로다", async () => {
  const { api, store, editor, registry } = await failedDetailWithEditor("미저장 입력");
  const dialog = confirmer(false);
  reloadDetail(store, item.catchId, dialog.confirm, registry);
  await tick();
  assert.deepEqual(dialog.asked, [UNSAVED_MESSAGE]);
  assert.equal(api.calls.detail, 1);
  const snapshot = store.getSnapshot();
  assert.equal(snapshot.detail?.catchId, item.catchId);
  assert.equal(snapshot.mutation.status, "error"); // [현재 상태 다시 불러오기]가 남는다
  assert.equal(editor.store.get().edit.value, "미저장 입력");
  assert.equal(registry.hasUnsaved(), true);
});

test("다시 불러오기: 계속하면 다시 읽는다(읽는 동안 상세가 비어 편집기가 해제된다)", async () => {
  const { api, store, registry } = await failedDetailWithEditor("미저장 입력");
  const dialog = confirmer(true);
  reloadDetail(store, item.catchId, dialog.confirm, registry);
  assert.deepEqual(dialog.asked, [UNSAVED_MESSAGE]);
  assert.equal(store.getSnapshot().detail, undefined);
  await tick();
  assert.equal(api.calls.detail, 2);
  assert.equal(store.getSnapshot().detailState, "ready");
  assert.equal(store.getSnapshot().mutation, null);
});

test("다시 불러오기: 저장하지 않은 설명이 없으면 묻지 않고 다시 읽는다", async () => {
  const { api, store, registry } = await failedDetailWithEditor();
  const dialog = confirmer(false);
  reloadDetail(store, item.catchId, dialog.confirm, registry);
  await tick();
  assert.deepEqual(dialog.asked, []);
  assert.equal(api.calls.detail, 2);
  assert.equal(store.getSnapshot().mutation, null);
});

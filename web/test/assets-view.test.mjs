import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { previewCatches } from "../src/features/assets/fixtures.ts";

const viewUrl = new URL("../src/features/assets/assets-view.tsx", import.meta.url);
const cssUrl = new URL("../src/features/assets/assets.module.css", import.meta.url);
// 기존 TypeScript로 화면을 렌더링한다. 이 검사는 문구를 보며 CSS 배치는 브라우저에서 확인한다.
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
const { AssetsView } = await import(viewUrl.href);
hooks.deregister();

function detailMarkup(item) {
  const html = renderToStaticMarkup(createElement(AssetsView, {
    dataMode: "api", items: [item], detailItem: item, selectedId: item.catchId,
    repositories: [], repositoryId: "", tab: "catch", listState: "ready", detailState: "ready",
    repositoryManagement: null,
  }));
  return html.match(/<dialog\b[\s\S]*?<\/dialog>/)?.[0] ?? assert.fail("Catch 상세가 렌더링되어야 한다");
}

for (const [status, content, draftText] of [
  ["GENERATED", "[합성] 생성된 설명", "[합성] 생성된 설명"],
  ["FAILED", null, "설명 초안을 생성하지 못했습니다."],
  ["NOT_GENERATED", null, "생성된 설명 초안이 없습니다."],
]) {
  for (const title of ["[합성] 제목", null]) {
    test(`${status} · 제목 ${title === null ? "없음" : "있음"}: 존재하는 생성물만 완료로 안내한다`, () => {
      const html = detailMarkup({ ...previewCatches[0], title, draft: { status, content } });
      const expected = status === "GENERATED" ? (title === null ? "설명" : "제목과 설명") : title === null ? null : "제목";
      if (expected) assert.ok(html.includes(`<p>${expected}은 CatchU가 GitHub 기록에서 자동으로 만들었습니다`));
      else assert.doesNotMatch(html, /자동으로 만들었습니다/);
      if (status !== "GENERATED") assert.doesNotMatch(html, /설명은 CatchU가/);
      assert.ok(html.includes(draftText));
      assert.ok(html.includes("사실과 다르면 불일치를 표시하거나 공개하지 마세요."));
    });
  }
}

for (const [name, content] of [["null", null], ["빈 문자열", ""], ["공백", " \n\t "]]) {
  for (const title of ["[합성] 제목", null]) {
    test(`설명 본문 ${name} · 제목 ${title === null ? "없음" : "있음"}: GENERATED여도 설명 완료·빈 본문으로 표시하지 않는다`, () => {
      const html = detailMarkup({ ...previewCatches[0], title, draft: { status: "GENERATED", content } });
      if (title === null) assert.doesNotMatch(html, /자동으로 만들었습니다/);
      else assert.ok(html.includes("<p>제목은 CatchU가 GitHub 기록에서 자동으로 만들었습니다"));
      assert.doesNotMatch(html, /설명은 CatchU가/);
      assert.ok(html.includes("<h3>Catch 설명 초안</h3><p>생성된 설명 초안이 없습니다.</p>"));
      assert.ok(html.includes("사실과 다르면 불일치를 표시하거나 공개하지 마세요."));
    });
  }
}

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { previewCatches, previewRepositories } from "../src/features/assets/fixtures.ts";

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
    repositories: [], repositoryId: "", listState: "ready", detailState: "ready",
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

// #454 완료 기준: 공개 상태 걸러 보기, 저장소와 함께 쓰기, 맞는 Catch가 없을 때 안내.
function listMarkup({ repositoryId = "", visibility = "", items = previewCatches, hasMore = false } = {}) {
  return renderToStaticMarkup(createElement(AssetsView, {
    items, repositories: previewRepositories, repositoryId, visibility, hasMore,
    listState: "ready", detailState: "ready", selectedId: null, repositoryManagement: null,
  }));
}
const shownCatchIds = (html) => previewCatches.filter((item) => item.title
  ? html.includes(`>${item.title}</button>`) : html.includes("상세 보기 ↗</button>")).map((item) => item.catchId);

for (const [visibility, repositoryId] of [["", ""], ["PUBLIC", ""], ["PRIVATE", ""], ["PUBLIC", "demo-web"], ["PRIVATE", "demo-api"]]) {
  test(`공개 상태 ${visibility || "전체"} · 저장소 ${repositoryId || "전체"}: 두 조건에 맞는 Catch만 보인다`, () => {
    const html = listMarkup({ visibility, repositoryId });
    const expected = previewCatches.filter((item) => (!visibility || item.visibility === visibility)
      && (!repositoryId || item.repositoryId === repositoryId)).map((item) => item.catchId);
    assert.ok(expected.length > 0);
    assert.deepEqual(shownCatchIds(html), expected);
    assert.ok(html.includes(`${expected.length}개의 Catch`));
  });
}

test("공개 상태 선택지는 전체·공개 설정·미공개 세 가지다", () => {
  const select = listMarkup({ visibility: "PRIVATE" }).match(/공개 상태<select[\s\S]*?<\/select>/)?.[0] ?? assert.fail("공개 상태 선택이 있어야 한다");
  assert.deepEqual([...select.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)</g)].map((match) => [match[1], match[2]]),
    [["", "전체"], ["PUBLIC", "공개 설정"], ["PRIVATE", "미공개"]]);
  assert.match(select, /<option value="PRIVATE" selected="">/);
});

test("고른 공개 상태에 맞는 Catch가 없으면 조건 안내를 보이고 저장소 없음 안내와 구분한다", () => {
  const privateOnly = previewCatches.filter((item) => item.visibility === "PRIVATE");
  const html = listMarkup({ visibility: "PUBLIC", items: privateOnly });
  assert.ok(html.includes("<h3>공개 설정한 Catch가 없습니다</h3>"));
  assert.ok(html.includes("공개 상태를 전체로 바꾸면 다른 Catch를 볼 수 있습니다."));
  assert.doesNotMatch(html, /개의 Catch</);

  const inRepository = listMarkup({ visibility: "PUBLIC", repositoryId: "demo-api", items: privateOnly });
  assert.ok(inRepository.includes("<h3>이 저장소에 공개 설정한 Catch가 없습니다</h3>"));

  const more = listMarkup({ visibility: "PUBLIC", items: privateOnly, hasMore: true });
  assert.ok(more.includes("불러온 Catch 중에는 없습니다. 더 보기로 이어서 불러오거나 공개 상태를 전체로 바꿔 보세요."));
  assert.ok(more.includes(">더 보기</button>"));

  const emptyRepository = listMarkup({ visibility: "PRIVATE", repositoryId: "empty-repo" });
  assert.ok(emptyRepository.includes("<h3>이 저장소에서 표시할 Catch가 없습니다</h3>"));
  assert.doesNotMatch(emptyRepository, /미공개 Catch가 없습니다/);
});

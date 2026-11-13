import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { previewCatches } from "../src/features/assets/fixtures.ts";

// 새 Catch NC3 「다시 볼 곳」 칸(BR9.1~BR9.3, NFR5.1·NFR5.2·NFR6.1, S4). 원본 tsx를 변환해 서버 렌더링으로 본다.
// 저장소 이름·경로·식별값은 합성 값이다. 먼저 정한 실패 조건: MOCK·예시·이름 없음·이름 꼴 틀림에서 링크가 생김, github.com 밖 주소,
// rel·숨은 「(새 탭)」 없음, 식별값 바로 뒤 이/가·을/를, 태그 꼴 경로가 HTML로 해석됨.
const componentUrl = new URL("../src/features/assets/revisit-facts.tsx", import.meta.url);
const cssUrl = new URL("../src/features/assets/assets.module.css", import.meta.url);
const hooks = registerHooks({
  load(url, context, nextLoad) {
    if (url === cssUrl.href) return { format: "module", shortCircuit: true, source: 'export default { detailSection: "detailSection", small: "small" };' };
    if (url !== componentUrl.href) return nextLoad(url, context);
    return {
      format: "module", shortCircuit: true,
      source: ts.transpileModule(readFileSync(componentUrl, "utf8"), {
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext },
      }).outputText,
    };
  },
});
const { RevisitFacts, revisitCommitHref } = await import(componentUrl.href);
hooks.deregister();

const A = "1a2b3c4".padEnd(40, "0");
const B = "5d6e7f8".padEnd(40, "1");
const C = "ba6bba8".padEnd(40, "2");
const REPOSITORY = "synthetic-owner/synthetic-repo";
const live = (revisitFacts) => ({ ...previewCatches[0], sourceMode: "LIVE", revisitFacts });
// 저장소 이름을 불러오지 못한 상세는 이름이 undefined다(목록에서 찾지 못함). 그 경우도 그대로 넘기도록 기본값을 칸이 있을 때만 쓴다.
const render = (item, options = {}) => renderToStaticMarkup(createElement(RevisitFacts, {
  item, dataMode: options.dataMode ?? "api", repositoryName: "repositoryName" in options ? options.repositoryName : REPOSITORY,
}));
/** 태그를 지운 화면 글자(보이는 글자와 숨은 글자 모두). */
const textOf = (html) => html.replace(/<[^>]+>/g, "").replaceAll("&gt;", ">").replaceAll("&lt;", "<").replaceAll("&amp;", "&");
/** 숨은 「 (새 탭)」을 뺀 보이는 글자. */
const visibleText = (html) => textOf(html.replace(/<span class="visually-hidden"> \(새 탭\)<\/span>/g, ""));

test("NC3 BR9.2 다섯 종류의 문장은 정한 꼴이고 식별값 바로 뒤에는 「에서」「의」만 붙는다", () => {
  const cases = [
    [{ kind: "REWORKED_LINES", paths: ["Front/theme/src/store/firebase/firebase.ts"], commits: [C, A] },
      "커밋 ba6bba8에서 넣은 줄을 커밋 1a2b3c4에서 다시 고침: Front/theme/src/store/firebase/firebase.ts"],
    [{ kind: "MOVED_FILE", paths: ["src/a.js", "lib/a.js"], commits: [A] }, "새 파일로 옮김: src/a.js → lib/a.js (커밋 1a2b3c4)"],
    [{ kind: "EXTENSION_CHANGED", paths: ["util.js", "util.ts"], commits: [A, B] }, "확장자 바꿈: util.js → util.ts (커밋 1a2b3c4, 5d6e7f8)"],
    // commits는 [되돌린 커밋, 되돌려진 커밋]이다.
    [{ kind: "REVERTED", paths: [], commits: [B, A] }, "커밋 1a2b3c4의 변경을 커밋 5d6e7f8에서 되돌림"],
    [{ kind: "TEST_FILES_PRESENT", paths: ["src/__tests__/a.test.ts", "tests/b.test.ts"], commits: [A] },
      "시험 파일 있음: src/__tests__/a.test.ts, tests/b.test.ts (커밋 1a2b3c4)"],
  ];
  for (const [fact, sentence] of cases) {
    const html = render(live([fact]), { dataMode: "preview" });
    assert.equal(visibleText(html).replace("다시 볼 곳 본인만 확인", ""), sentence);
    assert.doesNotMatch(visibleText(html), /[0-9a-f]{7}(이|가|을|를)/, fact.kind);
  }
});

test("NC3 S4 AC9.1.4 LIVE·api·GitHub 꼴 저장소 이름이면 github.com 커밋 링크(새 탭, rel, 숨은 「(새 탭)」)다", () => {
  const html = render(live([{ kind: "REWORKED_LINES", paths: ["src/a.ts"], commits: [A, B] }]));
  const links = [...html.matchAll(/<a [^>]*>[\s\S]*?<\/a>/g)].map((match) => match[0]);
  assert.equal(links.length, 2);
  for (const [link, sha] of [[links[0], A], [links[1], B]]) {
    assert.ok(link.includes(`href="https://github.com/${REPOSITORY}/commit/${sha}"`));
    assert.ok(link.includes('target="_blank"') && link.includes('rel="noopener noreferrer"'));
    assert.ok(link.includes(`>${sha.slice(0, 7)}<span class="visually-hidden"> (새 탭)</span></a>`), "링크 글자는 7자, 숨은 글자는 뒤에");
    assert.ok(link.includes('data-testid="revisit-facts-commit-link"'));
  }
  // 경로는 링크가 아니다(Tab 순서에는 커밋 링크만 든다).
  assert.equal((html.match(/<a /g) ?? []).length, 2);
});

test("NC3 S4 BR9.3 MOCK·예시 자료·이름 없음·이름 꼴 틀림이면 링크 없이 7자 글자다", () => {
  const fact = { kind: "MOVED_FILE", paths: ["src/a.js", "lib/a.js"], commits: [A] };
  const cases = [
    [{ ...live([fact]), sourceMode: "MOCK" }, {}],
    [live([fact]), { dataMode: "preview" }],
    [live([fact]), { repositoryName: undefined }],
    [live([fact]), { repositoryName: "" }],
    [live([fact]), { repositoryName: "synthetic-owner" }],
    [live([fact]), { repositoryName: "synthetic-owner/.." }],
    [live([fact]), { repositoryName: "synthetic-owner/." }],
    [live([fact]), { repositoryName: "evil.example/owner/repo" }],
    [live([fact]), { repositoryName: "owner/repo\"onmouseover=\"x" }],
    [live([fact]), { repositoryName: `${"o".repeat(40)}/repo` }],
  ];
  for (const [item, options] of cases) {
    const html = render(item, options);
    assert.doesNotMatch(html, /<a |href=/, JSON.stringify(options));
    assert.ok(visibleText(html).includes("(커밋 1a2b3c4)"));
  }
});

test("NC3 NFR5.2 revisitCommitHref는 고정 호스트·이름 꼴·40자 식별값일 때만 주소를 만든다", () => {
  assert.equal(revisitCommitHref("ljm-synthetic/The.Me_repo-1", A), `https://github.com/ljm-synthetic/The.Me_repo-1/commit/${A}`);
  for (const [name, sha] of [
    [REPOSITORY, A.slice(0, 7)], [REPOSITORY, A.toUpperCase()], [REPOSITORY, `${A}0`], [null, A], [undefined, A],
    ["https://github.com/owner", A], ["owner/repo/extra", A], ["owner/re po", A], ["owner/..", A], ["/repo", A],
  ]) assert.equal(revisitCommitHref(name, sha), null, `${name} ${sha}`);
});

test("NC3 NFR5.1 태그 꼴 경로는 HTML로 해석되지 않고 글자 그대로 보인다", () => {
  const path = '<img src=x onerror="alert(1)">/<script>a</script>.test.ts';
  const html = render(live([{ kind: "TEST_FILES_PRESENT", paths: [path], commits: [A] }]));
  assert.doesNotMatch(html, /<img|<script/);
  assert.ok(html.includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"));
  assert.ok(textOf(html).includes("<script>a</script>.test.ts"));
});

test("NC3 BR9.1 NFR6.1 사실이 없으면 아무것도 그리지 않고, 있으면 h3 「다시 볼 곳」+「본인만 확인」과 ul의 li가 응답 순서대로다", () => {
  assert.equal(render(live([])), "");
  const facts = [
    { kind: "REVERTED", paths: [], commits: [B, A] },
    { kind: "REWORKED_LINES", paths: ["z.ts"], commits: [A, B] },
  ];
  const html = render(live(facts), { dataMode: "preview" });
  assert.ok(html.startsWith('<section class="detailSection" data-testid="revisit-facts"><h3>다시 볼 곳 <span class="small">본인만 확인</span></h3><ul>'));
  const items = [...html.matchAll(/<li data-testid="revisit-facts-item">([\s\S]*?)<\/li>/g)].map((match) => textOf(match[1]));
  assert.deepEqual(items, ["커밋 1a2b3c4의 변경을 커밋 5d6e7f8에서 되돌림", "커밋 1a2b3c4에서 넣은 줄을 커밋 5d6e7f8에서 다시 고침: z.ts"]);
});

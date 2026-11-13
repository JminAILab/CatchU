import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { previewCatches, previewRepositories } from "../src/features/assets/fixtures.ts";

const viewUrl = new URL("../src/features/assets/assets-view.tsx", import.meta.url);
const revisitUrl = new URL("../src/features/assets/revisit-facts.tsx", import.meta.url);
const cssUrl = new URL("../src/features/assets/assets.module.css", import.meta.url);
// 기존 TypeScript로 화면을 렌더링한다. 이 검사는 문구를 보며 CSS 배치는 브라우저에서 확인한다.
// 목록 카드 제목의 2줄 말줄임 클래스(CR1 BR6.1)만 이름을 돌려줘 붙었는지 본다. 다른 클래스는 비워 둔다.
// 상세가 부르는 「다시 볼 곳」 칸(NC3 revisit-facts.tsx)도 같은 방식으로 변환한다.
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "./revisit-facts" && context.parentURL === viewUrl.href) return { url: revisitUrl.href, shortCircuit: true };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === cssUrl.href) return { format: "module", shortCircuit: true, source: 'export default { titleClamp: "titleClamp" };' };
    if (url !== viewUrl.href && url !== revisitUrl.href) return nextLoad(url, context);
    return {
      format: "module", shortCircuit: true,
      source: ts.transpileModule(readFileSync(new URL(url), "utf8"), {
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
  // CR3 BR7.1(S10): NOT_GENERATED면 설명 칸을 그리지 않는다(아래 S10 시험).
  ["NOT_GENERATED", null, null],
]) {
  for (const title of ["[합성] 제목", null]) {
    test(`${status} · 제목 ${title === null ? "없음" : "있음"}: 존재하는 생성물만 완료로 안내한다`, () => {
      const html = detailMarkup({ ...previewCatches[0], title, draft: { status, content } });
      // CR1 BR6.3(S15): 상세 안내의 「설명」은 「설명 초안」이다. 「제목」만인 경우와 나머지 글은 그대로다.
      const expected = status === "GENERATED" ? (title === null ? "설명 초안" : "제목과 설명 초안") : title === null ? null : "제목";
      if (expected) assert.ok(html.includes(`<p>${expected}은 CatchU가 GitHub 기록에서 자동으로 만들었습니다`));
      else assert.doesNotMatch(html, /자동으로 만들었습니다/);
      if (status !== "GENERATED") assert.doesNotMatch(html, /설명 초안은 CatchU가|설명은 CatchU가/);
      if (draftText === null) assert.doesNotMatch(html, /Catch 설명 초안/);
      else assert.ok(html.includes(draftText));
      assert.ok(html.includes("사실과 다르면 불일치를 표시하거나 공개하지 마세요."));
    });
  }
}

test("S10: 설명 초안이 NOT_GENERATED면 상세에 「Catch 설명 초안」 칸(제목·안내 글)이 없어 화면 낭독기에도 읽히지 않는다", () => {
  const html = detailMarkup({ ...previewCatches[0], draft: { status: "NOT_GENERATED", content: null } });
  assert.doesNotMatch(html, /Catch 설명 초안/);
  assert.doesNotMatch(html, /생성된 설명 초안이 없습니다/);
  // 칸만 빠지고 다른 상세 칸(질문 등)은 그대로다.
  assert.ok(html.includes("생각해 볼 질문"));
});

test("S11: 설명 초안이 FAILED면 칸과 지금 안내를 그대로 보인다", () => {
  const html = detailMarkup({ ...previewCatches[0], draft: { status: "FAILED", content: null } });
  assert.ok(html.includes("<h3>Catch 설명 초안</h3><p>설명 초안을 생성하지 못했습니다. 위의 사실과 근거는 확인할 수 있습니다.</p>"));
});

for (const [name, content] of [["null", null], ["빈 문자열", ""], ["공백", " \n\t "]]) {
  for (const title of ["[합성] 제목", null]) {
    test(`설명 본문 ${name} · 제목 ${title === null ? "없음" : "있음"}: GENERATED여도 설명 완료·빈 본문으로 표시하지 않는다`, () => {
      const html = detailMarkup({ ...previewCatches[0], title, draft: { status: "GENERATED", content } });
      if (title === null) assert.doesNotMatch(html, /자동으로 만들었습니다/);
      else assert.ok(html.includes("<p>제목은 CatchU가 GitHub 기록에서 자동으로 만들었습니다"));
      assert.doesNotMatch(html, /설명 초안은 CatchU가|설명은 CatchU가/);
      assert.ok(html.includes("<h3>Catch 설명 초안</h3><p>생성된 설명 초안이 없습니다.</p>"));
      assert.ok(html.includes("사실과 다르면 불일치를 표시하거나 공개하지 마세요."));
    });
  }
}

// #454 완료 기준: 공개 상태 걸러 보기, 저장소와 함께 쓰기, 맞는 Catch가 없을 때 안내.
function listMarkup({ repositoryId = "", visibility = "", items = previewCatches, hasMore = false, authorDescription, dataMode } = {}) {
  return renderToStaticMarkup(createElement(AssetsView, {
    items, repositories: previewRepositories, repositoryId, visibility, hasMore, authorDescription, dataMode,
    listState: "ready", detailState: "ready", selectedId: null, repositoryManagement: null,
  }));
}
const shownCatchIds = (html) => previewCatches.filter((item) => item.title
  ? html.includes(`>${item.title}</span></button>`) : html.includes("상세 보기 ↗</button>")).map((item) => item.catchId);

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

// CR1 화면(BR6.1·BR6.3, S13·S15). 2줄 말줄임 모양 자체는 브라우저에서 확인한다.
const longTitle = "로그인 오류 메시지를 사용자에게 보여 주는 방식과 재시도 안내를 정리하고 실패한 요청을 다시 보내는 흐름을 바꿨다 ".repeat(2).trim();

test("S13: 목록 카드 제목에 2줄 말줄임 클래스가 붙고 버튼 글은 전체 제목이다. 상세 제목은 줄이지 않는다", () => {
  assert.ok(longTitle.length >= 100);
  const item = { ...previewCatches[0], title: longTitle };
  const html = listMarkup({ items: [item] });
  assert.ok(html.includes(`<span class="titleClamp">${longTitle}</span></button>`));
  const detail = detailMarkup(item);
  assert.ok(detail.includes(`>${longTitle}</h3>`));
  assert.doesNotMatch(detail, /titleClamp/);
  const css = readFileSync(cssUrl, "utf8");
  assert.match(css, /\.titleClamp\s*\{[^}]*-webkit-line-clamp:\s*2/);
});

test("S15: 구직자 목록 안내도 상세와 같이 「제목과 설명 초안」이고 나머지 글은 그대로다", () => {
  const html = listMarkup();
  assert.ok(html.includes("<p>제목과 설명 초안은 CatchU가 GitHub 기록에서 자동으로 만들었습니다<br/>사실과 다르면 불일치를 표시하거나 공개하지 마세요.</p>"));
  assert.doesNotMatch(html, /제목과 설명은/);
});

test("옛 꼴 작업 사실(SHA가 든 첫 줄, 다른 계정 문장)을 가진 Catch도 목록·상세에 그대로 그린다", () => {
  const oldFacts = [
    "PR 없이 병합한 병합 커밋 0123456789ab",
    "이 병합이 들인 커밋에 연동 계정이 작성자로 기록되지 않은 커밋이 없다",
  ];
  const item = { ...previewCatches[0], workFacts: oldFacts };
  assert.ok(listMarkup({ items: [item] }).includes(`>${oldFacts[0]}</p>`));
  const detail = detailMarkup(item);
  for (const fact of oldFacts) assert.ok(detail.includes(fact), fact);
});

test("태그 꼴 제목·작업 사실 둘째 줄은 HTML로 해석하지 않고 글자로 그린다", () => {
  const tag = "<script>alert(1)</script><b>굵게</b>";
  const item = { ...previewCatches[0], title: tag, workFacts: ["PR #3, 상태 병합됨", `PR 제목: "${tag}"`] };
  for (const html of [listMarkup({ items: [item] }), detailMarkup(item)]) {
    assert.doesNotMatch(html, /<script>|<b>굵게/);
    assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;&lt;b&gt;굵게&lt;/b&gt;"));
  }
});

// 새 Catch NC1 — 내 Catch 목록 「작성자 설명」 선택 칸과 빈 결과(US4.1·US4.2, BR5.4~BR5.6), 상세 순서와 질문 아래 문구(US3.1, BR4.1·BR4.2).
// 먼저 정한 실패 조건: 선택 칸에 보이는 label이 없음, 「씀」 빈 결과가 「아직 표시할 Catch가 없습니다」로 보임, 카드에 설명 여부가 보임,
// API 방식에서 저장 뒤 바뀐 항목을 화면이 다시 걸러 지금 쪽이 바뀜, 설명 초안·질문이 작성자 설명 편집보다 아래에 있음.
const writtenIds = previewCatches.filter((item) => item.hasAuthorDescription).map((item) => item.catchId);

test("AC4.1.4 선택 칸은 저장소·공개 상태 다음에 보이는 label 「작성자 설명」과 전체·씀·안 씀이고, 걸러 본 개수는 aria-live=polite다", () => {
  assert.ok(writtenIds.length > 0 && writtenIds.length < previewCatches.length, "고정 자료에 쓴 것과 안 쓴 것이 섞여 있다");
  const html = listMarkup({ authorDescription: "written" });
  const labels = [...html.matchAll(/<label[^>]*>([^<]+)<select/g)].map((match) => match[1]);
  assert.deepEqual(labels, ["저장소", "공개 상태", "작성자 설명"]);
  const select = html.match(/작성자 설명<select[\s\S]*?<\/select>/)?.[0] ?? assert.fail("작성자 설명 선택이 있어야 한다");
  assert.deepEqual([...select.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)</g)].map((match) => [match[1], match[2]]),
    [["all", "전체"], ["written", "씀"], ["unwritten", "안 씀"]]);
  assert.match(select, /<option value="written" selected="">/);
  assert.match(html, new RegExp(`<p[^>]*aria-live="polite"[^>]*>${writtenIds.length}개의 Catch</p>`));
});

test("미리보기 방식은 hasAuthorDescription으로 화면 안에서 거르고, 주소 매개변수의 모르는 값은 전체다", async () => {
  assert.deepEqual(shownCatchIds(listMarkup({ authorDescription: "written" })), writtenIds);
  assert.deepEqual(shownCatchIds(listMarkup({ authorDescription: "unwritten" })), previewCatches.filter((item) => !item.hasAuthorDescription).map((item) => item.catchId));
  assert.equal(shownCatchIds(listMarkup({})).length, previewCatches.length);
  const { parseAuthorDescriptionFilter } = await import(viewUrl.href);
  assert.deepEqual(["written", "unwritten", "all", "WRITTEN", "", null].map(parseAuthorDescriptionFilter),
    ["written", "unwritten", "all", "all", "all", "all"]);
});

test("AC4.1.3 「씀」인데 서버가 빈 목록을 주면 그 조건의 안내가 먼저 보이고 저장소를 골랐으면 「이 저장소에 」가 붙으며 저장소 연결 문구는 없다", () => {
  const empty = listMarkup({ dataMode: "api", items: [], authorDescription: "written" });
  assert.ok(empty.includes("<h3>작성자 설명을 쓴 Catch가 없습니다</h3>"));
  assert.ok(empty.includes("작성자 설명을 전체로 바꾸면 다른 Catch를 볼 수 있습니다."));
  assert.doesNotMatch(empty, /아직 표시할 Catch가 없습니다|저장소 연결과 분석 상태|개의 Catch</);
  const inRepository = listMarkup({ dataMode: "api", items: [], authorDescription: "written", repositoryId: "demo-api" });
  assert.ok(inRepository.includes("<h3>이 저장소에 작성자 설명을 쓴 Catch가 없습니다</h3>"));
  // 공개 상태 칸이 함께 켜져 있어도 서버 빈 목록이면 작성자 설명 안내가 먼저다.
  assert.ok(listMarkup({ dataMode: "api", items: [], authorDescription: "written", visibility: "PUBLIC" }).includes("<h3>작성자 설명을 쓴 Catch가 없습니다</h3>"));
});

test("「안 씀」 빈 결과는 같은 꼴의 안내이고, 걸러 보기가 모두 전체인 빈 목록과 공개 상태 빈 결과는 지금 분기 그대로다", () => {
  const unwritten = listMarkup({ dataMode: "api", items: [], authorDescription: "unwritten" });
  assert.ok(unwritten.includes("<h3>작성자 설명을 쓰지 않은 Catch가 없습니다</h3>"));
  assert.ok(unwritten.includes("작성자 설명을 전체로 바꾸면 다른 Catch를 볼 수 있습니다."));
  const allEmpty = listMarkup({ dataMode: "api", items: [], authorDescription: "all" });
  assert.ok(allEmpty.includes("<h3>아직 표시할 Catch가 없습니다</h3>"));
  const privateOnly = previewCatches.filter((item) => item.visibility === "PRIVATE");
  assert.ok(listMarkup({ dataMode: "api", items: privateOnly, authorDescription: "unwritten", visibility: "PUBLIC" }).includes("<h3>공개 설정한 Catch가 없습니다</h3>"));
});

test("AC4.1.5 걸러 본 목록의 카드에는 설명 여부 표시·추천·순위가 없다", () => {
  for (const authorDescription of ["all", "written", "unwritten"]) {
    const html = listMarkup({ authorDescription });
    const cards = html.slice(html.indexOf("<ul"), html.lastIndexOf("</ul>"));
    assert.ok(cards.length > 0, authorDescription);
    assert.doesNotMatch(cards, /작성자 설명|설명 안 씀|씀|추천|순위/, authorDescription);
  }
});

test("AC4.2.1 API 방식에서 저장 뒤 설명이 생긴 항목도 지금 쪽에서 빠지지 않는다(화면이 다시 거르지 않음)", () => {
  const [a, b] = previewCatches.filter((item) => !item.hasAuthorDescription);
  const html = listMarkup({ dataMode: "api", items: [{ ...a, hasAuthorDescription: true }, b], authorDescription: "unwritten" });
  assert.ok(html.includes(">불러온 2개의 Catch</p>"));
});

test("AC3.1.1·AC3.1.2 NC3 S3 상세 순서는 작업 사실·나의 기여 → 근거 → Catch 설명 초안 → 생각해 볼 질문 → 작성자 설명 → 현재 확인 상태이고 사실이 없으면 다시 볼 곳 제목·칸이 없다", () => {
  const item = previewCatches[0];
  assert.deepEqual(item.revisitFacts, []);
  const html = renderToStaticMarkup(createElement(AssetsView, {
    dataMode: "api", items: [item], detailItem: item, selectedId: item.catchId, repositories: [], repositoryId: "",
    listState: "ready", detailState: "ready", repositoryManagement: null,
    descriptionEditor: createElement("section", { "data-testid": "catch-author-description" }, "편집 자리"),
  }));
  const dialog = html.match(/<dialog\b[\s\S]*?<\/dialog>/)[0];
  const order = ["<h3>작업에서 확인된 사실</h3>", "<h3>나의 기여</h3>", "<h3>근거</h3>", "<h3>Catch 설명 초안</h3>", "<h3>생각해 볼 질문",
    'data-testid="catch-author-description"', "<h3>현재 확인 상태</h3>"].map((needle) => dialog.indexOf(needle));
  assert.ok(order.every((position) => position >= 0), String(order));
  assert.deepEqual([...order].sort((x, y) => x - y), order);
  assert.doesNotMatch(dialog, /다시 볼 곳|revisit-facts/);
});

// 새 Catch NC3 BR9.1(S3): 「다시 볼 곳」은 근거 바로 아래, Catch 설명 초안 위다. 사실이 없으면 그리지 않는다.
const sha40 = (letter) => letter.repeat(40);
const withFacts = { ...previewCatches[0], sourceMode: "LIVE",
  revisitFacts: [{ kind: "REWORKED_LINES", paths: ["src/a.ts"], commits: [sha40("a"), sha40("b")] }] };

test("NC3 BR9.1 다시 볼 곳 칸은 근거 아래·Catch 설명 초안 위에 h3와 「본인만 확인」으로 있고 목록 카드에는 없다", () => {
  const dialog = detailMarkup(withFacts);
  const order = ["<h3>근거</h3>", 'data-testid="revisit-facts"', "<h3>다시 볼 곳 <span", "<h3>Catch 설명 초안</h3>"]
    .map((needle) => dialog.indexOf(needle));
  assert.ok(order.every((position) => position >= 0), String(order));
  assert.deepEqual([...order].sort((x, y) => x - y), order);
  assert.ok(dialog.includes("<h3>다시 볼 곳 <span>본인만 확인</span></h3>"));
  assert.equal((dialog.match(/data-testid="revisit-facts-item"/g) ?? []).length, 1);
  const html = renderToStaticMarkup(createElement(AssetsView, {
    dataMode: "api", items: [withFacts], selectedId: null, repositories: [], repositoryId: "",
    listState: "ready", detailState: "ready", repositoryManagement: null,
  }));
  assert.doesNotMatch(html, /다시 볼 곳|src\/a\.ts|aaaaaaa/, "목록 카드에는 사실이 보이지 않는다");
});

test("NC3 BR9.3 상세의 저장소 이름이 불러와졌을 때만 커밋 링크이고, 예시 자료(preview)는 글자다", () => {
  const props = (dataMode, repositories) => ({
    dataMode, items: [withFacts], detailItem: withFacts, selectedId: withFacts.catchId, repositoryId: "",
    repositories, listState: "ready", detailState: "ready", repositoryManagement: null,
  });
  const repository = [{ repositoryId: withFacts.repositoryId, name: "synthetic-owner/synthetic-repo" }];
  const linked = renderToStaticMarkup(createElement(AssetsView, props("api", repository)));
  assert.ok(linked.includes(`href="https://github.com/synthetic-owner/synthetic-repo/commit/${sha40("a")}"`));
  for (const html of [renderToStaticMarkup(createElement(AssetsView, props("api", []))),
    renderToStaticMarkup(createElement(AssetsView, props("preview", repository)))]) {
    assert.doesNotMatch(html, /revisit-facts-commit-link|synthetic-repo\/commit\//);
    assert.ok(html.includes("커밋 aaaaaaa에서 넣은 줄을 커밋 bbbbbbb에서 다시 고침: src/a.ts"));
  }
});

test("AC3.1.3 질문 아래 문구는 「질문을 보고 아래 칸에 자기 말로 적어 보세요.」이고 답 저장 안내와 질문별 답 칸은 없다", () => {
  const html = detailMarkup(previewCatches[0]);
  const questions = html.slice(html.indexOf("<h3>생각해 볼 질문"), html.indexOf("<h3>현재 확인 상태</h3>"));
  assert.ok(questions.includes("질문을 보고 아래 칸에 자기 말로 적어 보세요."));
  assert.doesNotMatch(html, /질문에 대한 답변을 저장하는 기능은 제공하지 않습니다/);
  assert.doesNotMatch(questions, /<textarea|<input/);
});

test("Catch 상세 머리말 안에 detailNotice(모달 안 재인증 안내 자리)를 닫기 다음 줄로 그리고, 없으면 자리도 만들지 않는다 (#467)", () => {
  const item = previewCatches[0];
  const render = (detailNotice) => renderToStaticMarkup(createElement(AssetsView, {
    dataMode: "api", items: [item], detailItem: item, selectedId: item.catchId,
    repositories: [], repositoryId: "", listState: "ready", detailState: "ready",
    repositoryManagement: null, detailNotice,
  })).match(/<dialog\b[\s\S]*?<\/dialog>/)?.[0] ?? assert.fail("Catch 상세가 렌더링되어야 한다");
  const heading = (html) => html.match(/<div[^>]*data-reauth-sticky-container=""[^>]*>[\s\S]*?<h2 id="catch-detail-title">/)?.[0] ?? assert.fail("머리말에 표시가 있어야 한다");

  const withNotice = render(createElement("aside", { "data-test": "modal-reauth" }, "다시 로그인해 주세요."));
  heading(withNotice);
  const closeAt = withNotice.indexOf(">닫기</button>");
  const noticeAt = withNotice.indexOf('data-test="modal-reauth"');
  const contentAt = withNotice.indexOf("작성자 설명") === -1 ? withNotice.indexOf("</dialog>") : withNotice.indexOf("작성자 설명");
  assert.ok(closeAt > 0 && noticeAt > closeAt, "안내는 닫기 다음에 온다");
  assert.ok(noticeAt < contentAt, "안내는 상세 본문보다 앞(머리말 안)에 온다");
  assert.equal((withNotice.match(/data-test="modal-reauth"/g) ?? []).length, 1);

  const without = render(undefined);
  heading(without);
  assert.doesNotMatch(without, /modal-reauth/);
  assert.match(without, />닫기<\/button><\/div>/, "안내가 없으면 닫기 뒤에 빈 자리를 두지 않는다");
});

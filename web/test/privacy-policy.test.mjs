import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "./u2-render.mjs";

// #496 개인정보 처리방침(`/privacy`)과 첫 화면 바닥글 링크.
// 원문: 팀장 확정 문구(https://github.com/JminAILab/CatchU/issues/496#issuecomment-6788199337, 댓글 updated_at 2026-11-11T05:47:52Z)의
//   접힌 칸. src/features/privacy/privacy-policy.md가 그 칸을 글자 그대로(줄 끝 LF) 옮긴 사본이고, SHA-256이 아래 값이다.
// 기대: 화면이 사본과 같은 순서·글자로 제목 단계(# → h1, ## → h2)·문단·목록 항목·표(첫 줄은 th, 나머지는 td)·코드 표시를 그리고,
//   표 칸 안의 <br>은 줄바꿈으로 그린다. 원문에 없는 글·링크·강조를 더하지 않는다. 첫 화면 바닥글은 /privacy로 링크한다.
// 실패 조건: 글자·순서·제목 단계가 하나라도 다름, 표 칸이 빠지거나 줄이 합쳐짐, <br>이 글자로 보임, a·strong·em 같은 태그가 끼어듦,
//   사본이 원문과 다름, 바닥글 링크가 없거나 다른 주소로 감.
// 글을 바꿀 때(예: 시행일)는 팀장이 확정한 글로 사본과 privacy-policy.tsx를 함께 고치고, 위 출처와 아래 SHA-256도 고친다.
const SOURCE_SHA256 = "83775d32edf33b4638671998155775f7ca6644f5f621c3785740a390a42669a1";

// next/image는 Next 앱 밖에서 불러올 수 없다. 이 시험은 바닥글의 글·링크만 보므로 아무것도 그리지 않는 대역으로 바꾼다.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/image") return { url: new URL("./next-image-stub.mjs", import.meta.url).href, shortCircuit: true, format: "module" };
    return nextResolve(specifier, context);
  },
});

// 다른 컴퓨터에서 줄 끝이 CRLF로 풀려도 같은 글로 본다.
const source = readFileSync(new URL("../src/features/privacy/privacy-policy.md", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const { default: PrivacyPage, metadata } = await load("app/(guest)/privacy/page.tsx");
const { LandingPage } = await load("features/landing/landing-page.tsx");
const { routes } = await load("lib/routes.ts");

const ESCAPED = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" };
const escapeText = (text) => text.replace(/[&<>"']/g, (character) => ESCAPED[character]);
const plainText = (html) => html.replace(/<[^>]+>/g, "");

/** 원문 한 줄·한 칸의 글을 React가 그리는 모양으로 바꾼다. `코드`는 <code>, 표 칸 안의 <br>은 <br/>이다. */
function inlineHtml(text) {
  return text
    .split("<br>")
    .map((part) => part.split("`").map((piece, index) => (index % 2 ? `<code>${escapeText(piece)}</code>` : escapeText(piece))).join(""))
    .join("<br/>");
}

/** 사본을 위에서부터 읽어 화면에 나와야 할 차례를 만든다. 표·목록은 시작 표시(table·ul)와 줄(tr)도 넣어 칸과 항목의 묶음까지 본다. */
function expectedTokens(markdown) {
  const tokens = [];
  let previous = "blank";
  for (const line of markdown.split("\n")) {
    if (line === "") {
      previous = "blank";
      continue;
    }
    if (line.startsWith("|")) {
      const cells = line.slice(1, -1).split("|").map((cell) => cell.trim());
      if (cells.every((cell) => /^-+$/.test(cell))) continue; // 머리 줄 아래 구분 줄
      const head = previous !== "table";
      if (head) tokens.push(["table"]);
      tokens.push(["tr"]);
      for (const cell of cells) tokens.push([head ? "th" : "td", inlineHtml(cell)]);
      previous = "table";
      continue;
    }
    if (line.startsWith("- ")) {
      if (previous !== "list") tokens.push(["ul"]);
      tokens.push(["li", inlineHtml(line.slice(2))]);
      previous = "list";
      continue;
    }
    const heading = /^(#{1,2}) (.+)$/.exec(line);
    tokens.push(heading ? [`h${heading[1].length}`, inlineHtml(heading[2])] : ["p", inlineHtml(line)]);
    previous = "paragraph";
  }
  return tokens;
}

/** 그린 HTML에서 같은 차례를 뽑는다. 글을 담는 요소는 안쪽 HTML까지 가져온다. */
function renderedTokens(html) {
  const pattern = /<(table|tr|ul)(?:\s[^>]*)?>|<(h1|h2|p|li|th|td)(?:\s[^>]*)?>(.*?)<\/\2>/g;
  return [...html.matchAll(pattern)].map((match) => (match[1] ? [match[1]] : [match[2], match[3]]));
}

test("원문 사본은 팀장 확정 문구의 접힌 칸 그대로다(SHA-256)", () => {
  assert.equal(createHash("sha256").update(source).digest("hex"), SOURCE_SHA256);
});

test("방침 화면은 원문과 같은 차례·글자로 제목 단계·문단·목록·표·코드 표시를 그리고 표 칸의 <br>은 줄바꿈이다", () => {
  const html = renderToStaticMarkup(createElement(PrivacyPage));
  const expected = expectedTokens(source);
  assert.deepEqual(renderedTokens(html), expected);
  // 원문에서 뽑은 차례가 제목 1개·절 9개·표 2개(머리 3·4칸, 본문 8·4줄)·목록 8묶음 33항목·<br> 3곳·코드 1곳인지도 본다(뽑는 함수가 잘못돼 둘 다 비는 일을 막는다).
  const count = (tag) => expected.filter(([name]) => name === tag).length;
  assert.deepEqual([count("h1"), count("h2"), count("table"), count("tr"), count("th"), count("ul"), count("li")], [1, 9, 2, 14, 7, 8, 33]);
  assert.equal(html.split("<br/>").length - 1, 3);
  assert.equal(html.split("<code>openid profile</code>").length - 1, 1);
});

test("원문에 없는 글·링크·강조를 더하지 않는다", () => {
  const html = renderToStaticMarkup(createElement(PrivacyPage));
  const tags = new Set([...html.matchAll(/<([a-z0-9]+)[\s>/]/g)].map((match) => match[1]));
  assert.deepEqual([...tags].sort(), ["article", "br", "code", "h1", "h2", "li", "main", "p", "table", "tbody", "td", "th", "thead", "tr", "ul"]);
  const sourceText = expectedTokens(source).map(([, inner = ""]) => plainText(inner)).join("");
  assert.equal(plainText(html), sourceText);
});

test("주소는 /privacy이고 문서 제목은 원문 제목이다", () => {
  assert.equal(routes.privacy, "/privacy");
  assert.equal(metadata.title, source.split("\n")[0].replace(/^# /, ""));
});

test("첫 화면 바닥글에 /privacy로 가는 [개인정보 처리방침] 링크가 한 줄 있고 가상 예시 안내는 그대로다", () => {
  const html = renderToStaticMarkup(createElement(LandingPage));
  const footer = /<footer[^>]*>(.*?)<\/footer>/.exec(html)?.[1] ?? "";
  assert.match(footer, /<p><a href="\/privacy">개인정보 처리방침<\/a><\/p>/);
  assert.ok(footer.includes("<p>화면의 작업·계정은 설명을 위한 가상 예시이며 실제 분석 결과가 아닙니다.</p>"));
  assert.equal(html.split('href="/privacy"').length - 1, 1);
});

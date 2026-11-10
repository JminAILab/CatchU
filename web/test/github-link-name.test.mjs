// 새 Catch NC1 — GitHub 링크 이름(`src/lib/github-link-name.ts`, GithubLinkName)과 링크 요소(`github-link.tsx`, GithubLink) 시험.
//
// 먼저 정한 시나리오·기대 결과·실패 조건(US2.2·US2.3 수락 기준, BR2.1~BR2.8·BR3.1, 보안 설계 1.2·1.3, NFR5.2~NFR5.4, Unit 시험 안내 「실패 조건」 링크 이름).
// 세부 시험 코드는 구현 뒤 쓴다.
//
// - 기대: 표의 꼴과 정확히 맞는 주소만 「파일 · 줄 · 판본」·「경로 끝 · 판본」·「커밋 xxxxxxx」·「PR #n」 이름이고, 다른 저장소면 앞에 그 저장소가 붙는다.
//         질의는 이름에서 무시하고 링크 대상에는 남는다. 경로는 마디마다 풀어 이름에만 쓰고, 풀리지 않는 마디는 원문이며, 제어·서식 문자는 이름에서 지운다.
//         링크 요소의 href·title은 원래 주소이고 새 탭 속성과 숨은 「(새 탭)」이 있다. 링크 모으기는 글 순서대로이고 같은 주소는 한 번이다.
// - 실패 조건: 이름이 원래 주소와 다른 곳을 가리킴(다른 저장소인데 앞붙임 없음), 이름에 제어·방향 바꿈 문자가 보임, 포트·표 밖 꼴 주소가 이름으로 바뀜,
//         링크 대상에서 질의가 빠짐, 이름 계산이 입력 글을 바꿈.
//
// GitHub 주소는 모두 합성(`o/r`, `other/lib`)이고 네트워크를 쓰지 않는다. 링크 요소는 서버 렌더링으로만 본다.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { collectLinks, evidenceRepositoryOf, githubLinkName } from "../src/lib/github-link-name.ts";

const srcUrl = new URL("../src/", import.meta.url);
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    const candidates = (base) => [".tsx", ".ts"].map((ext) => new URL(base.href + ext)).find((candidate) => existsSync(candidate));
    if (specifier.startsWith("@/")) return { url: candidates(new URL(specifier.slice(2), srcUrl)).href, shortCircuit: true };
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
const { GithubLink } = await import(new URL("../src/features/publications/github-link.tsx", import.meta.url).href);
hooks.deregister();

const FULL = "ba6bba8c" + "0123456789abcdef0123456789abcdef";
const name = (url, repository = "o/r") => githubLinkName(url, repository);

test("AC2.2.1 파일 줄 범위 링크는 「파일 이름 · L시작–끝 · 판본 앞 7자」다", () => {
  assert.equal(FULL.length, 40);
  assert.equal(name(`https://github.com/o/r/blob/${FULL}/src/CreateArticlePage.vue#L40-L58`), "CreateArticlePage.vue · L40–58 · 판본 ba6bba8");
});

test("한 줄 링크는 「L줄」이고 줄 없는 파일 링크는 「경로 끝 이름 · 판본」이며 PR 링크는 「PR #번호」다", () => {
  assert.equal(name("https://github.com/o/r/blob/ba6bba8/a.ts#L3"), "a.ts · L3 · 판본 ba6bba8");
  assert.equal(name("https://github.com/o/r/blob/BA6BBA8/a.ts"), "a.ts · 판본 ba6bba8");
  assert.equal(name("https://github.com/o/r/pull/12"), "PR #12");
  assert.equal(name(`https://github.com/o/r/commit/${FULL.toUpperCase()}`), "커밋 ba6bba8");
});

test("AC2.2.2 판본 자리가 16진수 7~40자가 아니면 브랜치 이름이다(폴더 링크 포함)", () => {
  assert.equal(name("https://github.com/o/r/blob/main/src"), "src · 브랜치 main");
  assert.equal(name("https://github.com/o/r/tree/main/src/lib"), "lib · 브랜치 main");
  assert.equal(name("https://github.com/o/r/blob/abc/a.ts"), "a.ts · 브랜치 abc", "16진수지만 7자 미만");
  assert.equal(name(`https://github.com/o/r/blob/${FULL}0/a.ts`), `a.ts · 브랜치 ${FULL}0`, "41자");
  // 브랜치 이름에 `/`가 들면 첫 마디만 브랜치로 보인다(BR2.2 한계). 링크 대상은 원래 주소다.
  assert.equal(name("https://github.com/o/r/blob/feature/x/a.ts"), "a.ts · 브랜치 feature");
});

test("AC2.2.3 근거 저장소와 다른 저장소의 링크는 앞에 「소유자/저장소 · 」를 붙이고, 대소문자만 다르면 붙이지 않는다", () => {
  assert.equal(name("https://github.com/other/lib/commit/1a2b3c4d5e6f"), "other/lib · 커밋 1a2b3c4");
  assert.equal(name("https://github.com/O/R/pull/1", "o/r"), "PR #1");
  assert.equal(name("https://github.com/o/r/pull/1", "O/R"), "PR #1");
  // 근거 저장소를 모르면(근거에 GitHub 주소가 없음) 붙이지 않는다.
  assert.equal(name("https://github.com/other/lib/pull/1", null), "PR #1");
});

test("AC2.2.4 질의는 이름에서 무시하고, 링크 요소의 대상에는 ?plain=1이 그대로 남는다", () => {
  const url = "https://github.com/o/r/blob/ba6bba8/a.ts?plain=1#L3";
  assert.equal(name(url), "a.ts · L3 · 판본 ba6bba8");
  const html = renderToStaticMarkup(createElement(GithubLink, { url, evidenceRepository: "o/r" }));
  assert.ok(html.includes(`href="${url}"`));
  assert.ok(html.includes(`title="${url}"`));
});

test("AC2.2.5 풀리지 않는 퍼센트 인코딩 마디는 원문 그대로 이름에 보인다", () => {
  assert.equal(name("https://github.com/o/r/blob/ba6bba8/src/%E0%A4.ts#L3"), "%E0%A4.ts · L3 · 판본 ba6bba8");
});

test("AC2.2.6 퍼센트 인코딩된 한글 경로는 이름에 한글로 풀리고 링크 대상은 인코딩된 그대로다", () => {
  const url = "https://github.com/o/r/blob/ba6bba8/src/%ED%95%9C%EA%B8%80.ts#L3";
  assert.equal(name(url), "한글.ts · L3 · 판본 ba6bba8");
  assert.ok(renderToStaticMarkup(createElement(GithubLink, { url, evidenceRepository: "o/r" })).includes(`href="${url}"`));
});

test("AC2.2.8 풀면 제어·영폭·방향 바꿈 문자가 나오는 경로와 저장소 이름에서 그 글자를 지운다", () => {
  const leaf = name("https://github.com/o/r/blob/ba6bba8/a%0Ab%09c%E2%80%AEd%E2%80%8Be%EF%BB%BF%E2%81%A6.ts");
  assert.equal(leaf, "abcde.ts · 판본 ba6bba8");
  assert.doesNotMatch(leaf, /[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩﻿]/);
  assert.equal(name("https://github.com/ev%E2%80%AEil/lib%0A/pull/1"), "evil/lib · PR #1");
  // 풀어서 지운 뒤 이름이 비면 주소 전체다.
  assert.equal(name("https://github.com/o/r/blob/ba6bba8/%E2%80%AE"), "https://github.com/o/r/blob/ba6bba8/%E2%80%AE");
});

test("표의 꼴과 맞지 않는 주소(다른 조각·뒤 경로·경로 없는 tree·다른 종류)는 주소 전체다", () => {
  for (const url of [
    "https://github.com/o/r/blob/ba6bba8/a.ts#L10C2", "https://github.com/o/r/blob/ba6bba8/README.md#readme",
    "https://github.com/o/r/pull/12/files", "https://github.com/o/r/pull/12#issuecomment-1", "https://github.com/o/r/pull/abc",
    "https://github.com/o/r/commit/ba6bba8/x", "https://github.com/o/r/commit/ba6bba8#diff-1", "https://github.com/o/r/tree/main",
    "https://github.com/o/r/tree/main/src#L3", "https://github.com/o/r/blob/ba6bba8", "https://github.com/o/r/issues/2",
    "https://github.com/o/r", "https://github.com", "https://github.com/o//blob/x/a.ts",
  ]) assert.equal(name(url), url, url);
});

// Step 15 확인 중 팀장 발견(2026-11-10): 커밋 화면에서 줄 번호를 눌러 얻는 바뀐 줄 주소도 이름으로 읽는다. 파일 이름은 주소에 없다.
const DIFF = "#diff-" + "a".repeat(64);
const COMMIT = "https://github.com/o/r/commit/087400133eaaacea31ff8d687f4d7a7a9c5fc359";

test("커밋 화면 바뀐 줄 주소는 「커밋 앞 7자 · 바뀐 줄 시작–끝」, 한 줄이면 「바뀐 줄 줄」, L 쪽은 「이전 줄」이다", () => {
  assert.equal(name(`${COMMIT}${DIFF}R16-R23`), "커밋 0874001 · 바뀐 줄 16–23");
  assert.equal(name(`${COMMIT}${DIFF}R16`), "커밋 0874001 · 바뀐 줄 16");
  assert.equal(name(`${COMMIT}${DIFF}L16-L23`), "커밋 0874001 · 이전 줄 16–23");
  assert.equal(name(`${COMMIT}${DIFF}L7`), "커밋 0874001 · 이전 줄 7");
  assert.equal(name(`${COMMIT}?w=1${DIFF}R16-R23`), "커밋 0874001 · 바뀐 줄 16–23", "질의는 이름에서 무시한다");
  assert.deepEqual(collectLinks([`${COMMIT}${DIFF}R16-R23 SET_TOKEN.ts 토큰 저장 순서`]), [`${COMMIT}${DIFF}R16-R23`], "글 속 주소는 조각까지 한 링크다");
});

test("커밋 화면 주소라도 L·R이 섞인 범위, 줄 번호 없는 #diff-…, 64자가 아닌 파일 자리는 주소 전체다", () => {
  for (const url of [
    `${COMMIT}${DIFF}L16-R23`, `${COMMIT}${DIFF}`, `${COMMIT}#diff-${"a".repeat(63)}R16`,
    `${COMMIT}${DIFF}R16-R`, `${COMMIT}${DIFF}R16C2`, `${COMMIT}/x${DIFF}R16`,
  ]) assert.equal(name(url), url, url);
});

test("커밋 화면 바뀐 줄 주소도 다른 저장소면 앞에 「소유자/저장소 · 」를 붙이고 포트가 들면 주소 전체다", () => {
  assert.equal(name(`https://github.com/other/lib/commit/1a2b3c4d${DIFF}R5`), "other/lib · 커밋 1a2b3c4 · 바뀐 줄 5");
  const withPort = `https://github.com:8443/o/r/commit/1a2b3c4d${DIFF}R5`;
  assert.equal(name(withPort), withPort);
});

test("포트가 든 주소는 판별 규칙을 통과해도 이름으로 바꾸지 않고 주소 전체다", () => {
  for (const url of ["https://github.com:8443/o/r/blob/ba6bba8/a.ts#L3", "https://github.com:443/o/r/pull/1"]) {
    assert.equal(name(url), url, url);
  }
  // 판별 규칙을 통과하지 못한 값(http·계정 정보)은 이름을 만들지 않는다.
  for (const url of ["http://github.com/o/r/pull/1", "https://user@github.com/o/r/pull/1", "not a url"]) assert.equal(name(url), url, url);
});

test("근거 저장소는 GitHub 주소인 첫 근거 주소의 소유자/저장소이고, 없거나 읽을 수 없으면 null이다", () => {
  assert.equal(evidenceRepositoryOf(["https://example.invalid/x/y/pull/1", "https://github.com/O/R/commit/1", "https://github.com/a/b/pull/2"]), "O/R");
  assert.equal(evidenceRepositoryOf([]), null);
  assert.equal(evidenceRepositoryOf(["http://github.com/o/r/pull/1", "https://example.invalid/o/r"]), null);
  assert.equal(evidenceRepositoryOf(["https://github.com/o"]), null);
});

test("AC2.3.3 링크 모으기는 칸 순서대로이고 같은 주소는 한 번만 둔다", () => {
  const commit = "https://github.com/o/r/commit/ba6bba8";
  const file = "https://github.com/o/r/blob/ba6bba8/a.ts#L3";
  assert.deepEqual(collectLinks([`맡은 부분 ${commit}`, "", `${file} 메모\n${commit} 관련 커밋.`]), [commit, file]);
  assert.deepEqual(collectLinks(["링크 없음", "http://github.com/o/r"]), []);
});

test("AC2.3.2 한글 파일 이름을 인코딩하지 않은 주소는 한글 앞에서 끊겨 폴더까지의 이름으로 보인다", () => {
  const [cut] = collectLinks(["https://github.com/o/r/blob/ba6bba8/src/한글.ts#L3"]);
  assert.equal(cut, "https://github.com/o/r/blob/ba6bba8/src/");
  assert.equal(name(cut), "src · 판본 ba6bba8");
});

test("AC2.2.10(앞부분) 이름 계산과 링크 모으기는 입력 글을 바꾸지 않는다", () => {
  const texts = Object.freeze(["https://github.com/o/r/blob/ba6bba8/a.ts?plain=1#L3 와 https://github.com/other/lib/pull/1"]);
  const before = texts[0];
  for (const url of collectLinks(texts)) githubLinkName(url, "o/r");
  assert.equal(texts[0], before);
});

test("링크 요소: 이름 글자 뒤에 숨은 「(새 탭)」이 붙고 새 탭 속성·data-testid가 있으며 children을 주면 그것을 그린다", () => {
  const url = "https://github.com/o/r/pull/7";
  const html = renderToStaticMarkup(createElement(GithubLink, { url, evidenceRepository: "o/r" }));
  assert.equal(html, `<a href="${url}" target="_blank" rel="noopener noreferrer" title="${url}" data-testid="github-link">PR #7<span class="visually-hidden"> (새 탭)</span></a>`);
  const custom = renderToStaticMarkup(createElement(GithubLink, { url, evidenceRepository: null }, "다른 글"));
  assert.ok(custom.includes(">다른 글<span"));
});

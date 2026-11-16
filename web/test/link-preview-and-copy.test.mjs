import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "./u2-render.mjs";

// #565 지금 발행 방식과 어긋난 문구 바로잡기, 보낸 링크(`/s/...`)의 미리보기 문구와 검색 제외 표시.
// 기대(이슈 #565 「범위」의 문구 표와 「완료 기준」):
//   - 발행본은 발행할 때 고정한 사본이다(12월 요구사항 FR4.3). 소개 화면과 Catch 상세는 "숨기면 보낸 링크에서 빠진다"고 말하지 않는다.
//   - `/s/` 아래 주소는 모두 같은 고정 제목·설명을 쓰고(og 포함) 검색 엔진에 싣지 않는다. 토큰·발행본 내용으로 문구를 만들지 않는다.
//   - 소개 화면은 검색 제외 표시가 없다. 회원 머리글에 채용공고·알림 메뉴가 없다(12월 요구사항에서 뺀 기능).
// 실패 조건: 옛 문장이 남음, 새 문장이 표와 다름, `/s/` 문구가 요청마다 만들어짐(generateMetadata), 소개 화면에 검색 제외 표시가 붙음.

// next/image와 next/navigation은 Next 앱 밖에서 불러올 수 없다. 글과 메뉴만 보므로 대역으로 바꾼다.
const navigationStub = "data:text/javascript,export const usePathname = () => '/assets'; export const useRouter = () => ({});";
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/image") return { url: new URL("./next-image-stub.mjs", import.meta.url).href, shortCircuit: true, format: "module" };
    if (specifier === "next/navigation") return { url: navigationStub, shortCircuit: true, format: "module" };
    return nextResolve(specifier, context);
  },
});

const linkLayout = await load("app/s/layout.tsx");
const landingRoute = await load("app/(guest)/page.tsx");
const { LandingPage } = await load("features/landing/landing-page.tsx");
const { CatchActions } = await load("features/assets/catch-actions.tsx");
const { MemberHeader } = await load("components/header/member-header.tsx");

const LINK_TITLE = "지원자가 보낸 작업 자료 | CatchU";
const LINK_DESCRIPTION = "지원자가 CatchU에서 골라 보낸 자료입니다. 발행할 때의 내용 그대로 보입니다.";
const plainText = (html) => html.replace(/<[^>]+>/g, "");

test("보낸 링크: 모든 /s/ 주소가 같은 고정 제목·설명을 쓰고 og 값도 같다", () => {
  const { metadata } = linkLayout;
  assert.equal(metadata.title, LINK_TITLE);
  assert.equal(metadata.description, LINK_DESCRIPTION);
  assert.equal(metadata.openGraph.title, LINK_TITLE);
  assert.equal(metadata.openGraph.description, LINK_DESCRIPTION);
  assert.equal(metadata.openGraph.images, undefined, "미리보기 그림은 두지 않는다");
  assert.equal(linkLayout.generateMetadata, undefined, "토큰·발행본으로 문구를 만들지 않는다");
});

test("보낸 링크: 검색 엔진에 싣지 않게 표시하고 소개 화면에는 그 표시가 없다", () => {
  assert.deepEqual(linkLayout.metadata.robots, { index: false, follow: false });
  assert.equal(landingRoute.metadata.robots, undefined);
});

test("소개 화면: 탭 제목·설명이 지금 정의와 같다", () => {
  assert.equal(landingRoute.metadata.title, "CatchU — GitHub 작업을 Catch로 골라 면접관에게");
  assert.equal(landingRoute.metadata.description, "GitHub 작업을 분석해 Catch를 만들고, 고른 Catch를 링크로 면접관에게 보냅니다.");
});

test("소개 화면: 숨기면 보낸 링크에서 빠진다는 문장이 없고 발행본 고정 안내가 있다", () => {
  const text = plainText(renderToStaticMarkup(createElement(LandingPage)));
  assert.ok(!text.includes("이미 보낸 링크에서도 보이지 않습니다"));
  assert.ok(!text.includes("숨긴 Catch는 보이지 않습니다"));
  assert.ok(text.includes("보낼 Catch를 골라 발행하면 링크가 만들어집니다. 링크에는 발행할 때의 내용이 그대로 남고, 그만 보이려면 링크를 중지합니다."));
  assert.ok(text.includes("발행 시점 고정") && text.includes("발행할 때의 내용 그대로 보입니다."));
});

test("Catch 상세: 공개한 Catch의 [숨기기] 안내가 이미 발행한 발행본은 그대로라고 알린다", () => {
  const item = {
    catchId: "c1", visibility: "PUBLIC", restriction: "NONE", mismatch: false,
    confirmation: { workFactsConfirmed: true, contributionConfirmed: true },
  };
  const text = plainText(renderToStaticMarkup(createElement(CatchActions, { item, mutation: null, onChange() {}, onReload() {} })));
  assert.ok(!text.includes("기존 공유 링크에서도"));
  assert.ok(text.includes("숨겨도 이미 발행한 발행본에는 그대로 남습니다. 제공을 끝내려면 발행본에서 링크를 중지하세요."));
});

test("회원 머리글: 채용공고·알림 메뉴와 '개발 중' 표시가 없고 나머지 메뉴는 그대로다", () => {
  const text = plainText(renderToStaticMarkup(createElement(MemberHeader)));
  for (const gone of ["채용공고", "알림", "개발 중"]) assert.ok(!text.includes(gone), `${gone}이 남아 있다`);
  for (const kept of ["내 자산", "텍스트 자료", "발행본", "JD 관리"]) assert.ok(text.includes(kept), `${kept}이 없다`);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "./u2-render.mjs";

// 12월 intent U2 회원 홈 시작 안내(기능 설계 BR8.1, AC16.2.1). 기대 결과: 시나리오 표 web 행 「시작 안내 — 링크 여섯」.
const { MEMBER_START_STEPS, START_GUIDE_TITLE } = await load("features/start-guide/member-start-steps.ts");
const { MemberStartGuide } = await load("features/start-guide/member-start-guide.tsx");
const { routes } = await load("lib/routes.ts");

test("시작 안내는 고정 여섯 단계를 정한 순서로 두고, 단계마다 지금 있는 회원 메뉴로 가는 링크가 있다", () => {
  assert.deepEqual(MEMBER_START_STEPS.map((step) => step.title), [
    "Google 로그인 완료", "GitHub 연결·분석 동의", "저장소 등록·분석", "Catch 설명 쓰기", "자료 올리기", "발행·본인 Claude 연결",
  ]);
  const memberRoutes = new Set([routes.profile, routes.assets, routes.materials, routes.links, routes.profileClaude]);
  for (const step of MEMBER_START_STEPS) assert.ok(memberRoutes.has(step.link.href), `${step.id} → ${step.link.href}`);
  assert.equal(new Set(MEMBER_START_STEPS.map((step) => step.id)).size, 6);
  // U6: 발행·본인 Claude 연결 단계는 Claude 연결 화면으로 잇는다(U6 기능 설계 BR7.5, 시나리오 S21).
  assert.equal(MEMBER_START_STEPS.find((step) => step.id === "publish-claude").link.href, routes.profileClaude);
  // U4: 자료 올리기 단계는 텍스트 자료 화면으로 잇는다(#416 2026-11-03 팀장 요청). 내 자산으로 보내지 않는다.
  assert.equal(MEMBER_START_STEPS.find((step) => step.id === "materials").link.href, routes.materials);
});

test("화면에는 제목과 여섯 링크가 순서대로 그려지고, 완료 표시·닫기 버튼은 없다(상태를 저장하지 않음)", () => {
  const html = renderToStaticMarkup(createElement(MemberStartGuide));
  assert.ok(html.includes(START_GUIDE_TITLE));
  const links = [...html.matchAll(/<a href="([^"]+)"[^>]*data-testid="start-guide-link-([a-z-]+)"/g)].map((match) => [match[2], match[1]]);
  assert.deepEqual(links, MEMBER_START_STEPS.map((step) => [step.id, step.link.href]));
  assert.ok(!html.includes("<button"), "닫기·완료 버튼이 없다");
  assert.equal((html.match(/<li/g) ?? []).length, 6);
});

test("회원 홈은 시작 안내를 조회 상태와 관계없이 제목 바로 아래에 둔다", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("../src/features/home/home-member-page.tsx", import.meta.url), "utf8");
  const heading = source.indexOf("<h1");
  const guide = source.indexOf("<MemberStartGuide />");
  const loading = source.indexOf('view.kind === "loading"');
  assert.ok(heading >= 0 && guide > heading && guide < loading, "h1 다음, 조회 상태 분기 앞");
});

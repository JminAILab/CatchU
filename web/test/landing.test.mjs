import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "./u2-render.mjs";

// 비로그인 서비스 소개(`/`). 2026-11-24에 확정한 디자인(60번 검토본)을 옮긴 화면의 연결과 재생 계산을 본다.
// 기대(src/features/landing/README.md 「지키는 것」「재생 규칙」):
//   - 다른 화면으로 가는 버튼은 [Google로 시작하기] 두 곳뿐이고 /login으로만 간다. 개인정보 처리방침은 /privacy 한 곳.
//   - 시연 속 버튼·입력은 그림이다. 시연 안에 링크·버튼·입력 요소가 없다. 「가상 예시」「합성 시연」 안내가 남아 있다.
//   - 검토용 요소(판본 번호, 검토 띠, 검증 패널, 푸터의 검토용 메모)가 없다. 없는 메뉴는 링크가 아니다.
//   - 대표 시연은 3회 뒤 요약, 화면 밖·비활성 탭·등장 전에는 시계가 서고, 동작 줄이기는 처음부터 요약이다.
//   - 스크롤 단계의 진행 시간은 원래 시간표의 정해진 구간으로만 옮겨진다.
// 실패 조건: 로그인·개인정보 링크가 없거나 다른 주소로 감, 시연 안에 누를 수 있는 요소가 생김, 검토용 문구가 남음,
//   3회 전에 요약으로 바뀌거나 3회 뒤에도 계속 돎, 안 보이는 동안 시간이 흐름.
// 화면 배치·실제 재생·다른 탭 정지는 브라우저에서 확인한다(README 「검사」).
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/image") return { url: new URL("./next-image-stub.mjs", import.meta.url).href, shortCircuit: true, format: "module" };
    return nextResolve(specifier, context);
  },
});

const { LandingPage } = await load("features/landing/landing-page.tsx");
const { DemoClock } = await load("features/landing/playback/demo-clock.ts");
const { demoConfig, HERO_REPEATS } = await load("features/landing/playback/demo-config.ts");
const { flattenActions, samplePointer } = await load("features/landing/playback/pointer-path.ts");
const { mapStep, mobileBands } = await load("features/landing/playback/story-controller.ts");
const { recipientBands, readableRect } = await load("features/landing/playback/recipient-controller.ts");
const { planFit, viewportGutter } = await load("features/landing/playback/viewport-fit.ts");
const { endingHolds } = await load("features/landing/playback/ending-pin.ts");
const { routes } = await load("lib/routes.ts");

const html = renderToStaticMarkup(createElement(LandingPage));
const plainText = (markup) => markup.replace(/<[^>]+>/g, "");
const hrefs = [...html.matchAll(/<a [^>]*href="([^"]*)"/g)].map((match) => match[1]);
/** data-player 시연 구간들의 마크업 */
const demos = [...html.matchAll(/<section[^>]*data-player="[^"]*"[^>]*>.*?<\/section>/gs)].map((match) => match[0]);

test("첫 화면 표식과 구간 순서가 있다", () => {
  assert.equal(html.split('id="landing-title"').length - 1, 1, "실행 확인과 이미지 검사가 찾는 표식");
  assert.match(html, /<h1 id="landing-title">/);
  const order = ["site-header", 'id="top"', 'id="hero-demo"', 'id="catch-examples"', 'id="story"', 'id="recipient"', 'id="ending"', "<footer"].map((mark) => html.indexOf(mark));
  assert.ok(order.every((at) => at >= 0), "구간이 빠졌다");
  assert.deepEqual(order, [...order].sort((a, b) => a - b), "구간 순서가 바뀌었다");
  assert.equal(demos.length, 6, "대표·기능 1~4·면접관 시연");
});

test("다른 화면으로 가는 링크는 로그인 두 곳과 개인정보 처리방침 한 곳뿐이다", () => {
  assert.equal(routes.login, "/login");
  assert.deepEqual(hrefs.filter((href) => href === routes.login).length, 2);
  const startLinks = [...html.matchAll(/<a ([^>]*)>(.*?)<\/a>/gs)].filter((match) => plainText(match[2]).includes("Google로 시작하기"));
  assert.equal(startLinks.length, 2, "[Google로 시작하기] 두 곳");
  for (const [, attributes] of startLinks) assert.ok(attributes.includes(`href="${routes.login}"`) && attributes.includes('class="cta"'));
  assert.deepEqual(hrefs.filter((href) => href === routes.privacy).length, 1);
  const allowed = new Set([routes.login, routes.privacy, "#top", "#hero-demo", "#catch-examples", "#evidence", "mailto:catchu@googlegroups.com"]);
  assert.deepEqual(hrefs.filter((href) => !allowed.has(href)), [], "정하지 않은 곳으로 가는 링크");
  assert.ok(!hrefs.some((href) => /^https?:/.test(href)), "바깥 주소로 가는 링크가 없다");
});

test("페이지 안 이동 링크의 목적지가 모두 있다", () => {
  for (const href of hrefs.filter((value) => value.startsWith("#"))) {
    assert.equal(html.split(`id="${href.slice(1)}"`).length - 1, 1, `${href}의 목적지`);
  }
});

test("시연 속 버튼·입력은 그림이다: 시연 안에 링크·버튼·입력·폼이 없다", () => {
  for (const demo of demos) {
    assert.ok(!/<(a|button|input|textarea|select|form)[\s>]/.test(demo), "시연 안에 누를 수 있는 요소가 있다");
    assert.ok(!/\son[a-z]+=/.test(demo), "시연 안에 이벤트 속성이 있다");
  }
  // 화면 전체에서 버튼은 카드 줄 일시정지 1개와 기능 바로가기 4개뿐이다.
  assert.equal(html.split("<button").length - 1, 5);
  assert.equal(html.split('class="feature-jump42"').length - 1, 4);
});

test("가상 예시·합성 시연 안내가 남아 있다", () => {
  const text = plainText(html);
  for (const kept of [
    "자동 시연 · 가상 예시",
    "이용 흐름을 간략히 표현한 시연입니다.",
    "합성 시연 · 실제 동의나 분석 요청을 보내지 않습니다.",
    "가상 예시 · 실제 분석 시간을 나타내지 않습니다.",
    "아래는 이해를 돕기 위해 내용을 간추린 가상 예시입니다.",
    "화면의 작업·계정은 설명을 위한 가상 예시이며 실제 분석 결과가 아닙니다.",
  ]) assert.ok(text.includes(kept), `${kept} 없음`);
  assert.equal(text.split("https://catchu.dev/s/[예시 토큰]").length - 1, 3, "예시 주소는 토큰 자리가 글자로 적힌 가짜 주소다");
});

test("검토용 요소가 없고, 아직 없는 메뉴는 링크가 아니다", () => {
  const text = plainText(html);
  for (const gone of ["로컬 시연 검토", "로컬 검토", "검토용", "검증 전용", "모션 감소 미리보기", "로컬 시안에서는 연결하지 않음"]) assert.ok(!text.includes(gone) && !html.includes(gone), `${gone}이 남아 있다`);
  for (const gone of ["review-ribbon", "inspection14", "status-note", "local-cta", "reduce14"]) assert.ok(!html.includes(gone), `${gone}이 남아 있다`);
  for (const planned of ["팀 소개", "이용 가이드", "자주 묻는 질문", "이용약관"]) assert.ok(html.includes(`<span class="planned">${planned}</span>`), `${planned}은 누를 수 없는 글자여야 한다`);
});

test("확정 문구: 제목·기능 제목·면접관·마지막 안내", () => {
  const text = plainText(html);
  for (const kept of [
    "GitHub의 작업 기록을,",
    "내 경험을 설명하는 근거근거로.", // 「근거」는 칠해지는 글자를 한 번 더 겹쳐 둔다(뒤의 것은 보조기기에서 숨김).
    "직접 확인한 것만 선택해 면접관에게 링크로 공유합니다.",
    "경험의 시작은,내 작업 기록.",
    "Catch의 내용을,근거와 함께 확인.",
    "확인한 Catch만,내가 선택해 공개.",
    "공개한 Catch를,링크로.",
    "면접관에게 이렇게 보입니다.",
    "나를 설명할 차례.",
    "Google 계정으로 시작한 뒤, 분석할 GitHub 계정을 연결합니다.",
  ]) assert.ok(text.includes(kept), `${kept} 없음`);
  assert.match(html, /<span class="title-white33" aria-hidden="true">근거<\/span>/);
});

// 푸터의 「Catch란?」은 기능 2(근거 확인)를 가리킨다. 고정 배치에서는 제어 코드가 이 링크를 바로가기처럼 옮기고
// (story-controller.ts는 목적지가 기능 article의 id인 페이지 안 링크만 맡는다), 스크립트가 꺼지면 브라우저가 그대로 옮긴다.
// 실패 조건: 링크가 기능 article이 아닌 곳을 가리켜 고정 배치에서 다시 움직이지 않게 됨. 실제 이동은 브라우저에서 확인한다.
test("푸터의 「Catch란?」 링크는 기능 article의 id를 가리킨다", () => {
  const footer = html.match(/<footer.*<\/footer>/s)?.[0] ?? "";
  assert.match(footer, /<a href="#evidence">Catch란\?<\/a>/);
  assert.match(html, /<article class="feature" id="evidence">/);
});

// 스크립트가 꺼진 화면: 기능 1~4는 설명과 결과 화면(.summary14)을 차례로 보인다(README 「재생 규칙」 마지막 항목).
// 실패 조건: 결과 화면이 없는 기능이 생김, 정적 배치 규칙이 사라짐, 그 규칙이 스크립트가 켜진 화면(고정 배치)에도 걸림.
// 실제로 보이는지는 브라우저에서 스크립트를 끄고 확인한다.
test("스크립트가 꺼진 화면: 기능 네 개에 설명과 결과 화면이 있고, 정적 배치 규칙은 그 경우에만 걸린다", () => {
  const story = html.match(/<section[^>]*id="story".*?<\/section>\s*<section[^>]*id="recipient"/s)?.[0] ?? "";
  const features = story.split(/<article /).slice(1);
  assert.equal(features.length, 4);
  for (const feature of features) {
    assert.match(feature, /<h2>/);
    assert.match(feature, /class="copy-paragraph21 desktop-copy39"/);
    assert.match(feature, /class="copy-paragraph21 mobile-copy39"/);
    const summary = feature.split('class="summary14"')[1] ?? "";
    assert.match(summary, /class="app-window[ "]/, "결과 화면이 없다");
    assert.match(plainText(summary), /가상 예시/, "결과 화면에 가상 예시 표시가 없다");
  }

  const css = readFileSync(new URL("../src/features/landing/landing.module.css", import.meta.url), "utf8");
  const block = css.match(/@media \(scripting: none\) \{\n(.*?)\n\}\n/s)?.[1] ?? "";
  assert.match(block, /#story:not\(\[data-layout\]\) \.story-stack36>\.feature\) \{\s*display: grid !important;/);
  assert.match(block, /#story:not\(\[data-layout\]\) \.scroll-demo36 \.summary14\) \{\s*display: grid !important;/);
  const selectors = [...block.matchAll(/^\s*(\.page[^{]*)\{/gm)].map((match) => match[1]);
  assert.ok(selectors.length > 0);
  for (const selector of selectors) assert.match(selector, /#story:not\(\[data-layout\]\)/, `고정 배치에도 걸리는 선택자: ${selector}`);
  assert.match(css, /#story\[data-layout="static"\] \.story-stack36>\.feature\) \{\s*display: grid !important;/);
});

test("대표 시연 시계: 보일 때만 흐르고 3회 뒤 요약으로 바뀌어 멈춘다", () => {
  const { durations } = demoConfig.hero;
  const total = durations.reduce((a, b) => a + b, 0);
  assert.equal(total, 51600);
  assert.equal(HERO_REPEATS, 3);
  const clock = new DemoClock(durations);
  clock.advance(5000);
  assert.equal(clock.elapsed, 0, "화면에 들어오기 전에는 흐르지 않는다");
  clock.inView = true;
  clock.advance(5000);
  assert.equal(clock.elapsed, 0, "등장이 끝나기 전에는 흐르지 않는다");
  assert.equal(clock.snapshot().state, "entering");
  clock.ready = true;
  clock.advance(7000);
  assert.deepEqual([clock.snapshot().state, clock.snapshot().scene, clock.snapshot().local, clock.snapshot().summary], ["playing", 1, 1000, false]);
  clock.visible = false;
  clock.advance(60000);
  assert.equal(clock.elapsed, 7000, "다른 탭에서는 흐르지 않는다");
  assert.equal(clock.snapshot().state, "tab-hidden");
  clock.visible = true;
  clock.inView = false;
  clock.advance(60000);
  assert.equal(clock.elapsed, 7000, "화면 밖에서는 흐르지 않는다");
  assert.equal(clock.snapshot().state, "offscreen");
  clock.inView = true;
  clock.advance(total * 2 - 7000 + 1);
  assert.deepEqual([clock.snapshot().completed, clock.snapshot().summary], [2, false], "2회를 돌아도 아직 요약이 아니다");
  clock.advance(total * 5);
  assert.equal(clock.elapsed, total * 3, "3회에서 멈춘다");
  assert.deepEqual([clock.done, clock.running, clock.snapshot().state, clock.snapshot().summary, clock.snapshot().completed], [true, false, "complete", true, 3]);
  clock.inView = false;
  clock.visible = false;
  assert.equal(clock.snapshot().summary, true, "화면 밖·다른 탭에 다녀와도 완료 상태가 남는다");
});

test("대표 시연 시계: 동작 줄이기와 재생 불가는 처음부터 요약이다", () => {
  const reduced = new DemoClock(demoConfig.hero.durations);
  Object.assign(reduced, { inView: true, ready: true, reduced: true });
  reduced.advance(1000);
  assert.deepEqual([reduced.elapsed, reduced.snapshot().state, reduced.snapshot().summary], [0, "reduced", true]);
  const failed = new DemoClock(demoConfig.hero.durations);
  Object.assign(failed, { inView: true, ready: true, failed: true });
  assert.deepEqual([failed.running, failed.snapshot().state, failed.snapshot().summary], [false, "fallback", true]);
});

test("시간표: 모든 포인터 동작이 자기 장면 길이 안에 있고 순서가 맞다", () => {
  for (const [key, config] of Object.entries(demoConfig)) {
    assert.equal(config.durations.length, config.captions.length, `${key} 자막 수`);
    assert.equal(config.durations.length, config.actions.length, `${key} 동작 수`);
    config.actions.forEach((actions, scene) => {
      let previousEnd = 0;
      for (const action of actions) {
        assert.ok(action.start < action.arrive && action.arrive <= action.end && action.end <= config.durations[scene], `${key} ${scene} ${action.target}`);
        if (action.click !== null) assert.ok(action.arrive <= action.click && action.click <= action.end, `${key} ${scene} ${action.target} 클릭`);
        assert.ok(action.start >= previousEnd, `${key} ${scene} ${action.target} 겹침`);
        previousEnd = action.end;
      }
    });
  }
});

test("포인터 경로: 도착 전에는 움직이고, 클릭 뒤 사라지며, 다른 장면에서는 없다", () => {
  const actions = flattenActions(demoConfig.hero);
  const offset = demoConfig.hero.durations[0];
  const points = { "1:0": { x: 100, y: 50 }, "1:1": { x: 300, y: 200 } };
  const initial = { x: 0, y: 0 };
  assert.equal(samplePointer(actions, 500, 0, points, initial), null, "첫 장면에는 동작이 없다");
  const moving = samplePointer(actions, offset + 1550, 1, points, initial);
  assert.equal(moving.phase, "moving");
  assert.ok(moving.x > 0 && moving.x < 100);
  const arrived = samplePointer(actions, offset + 2000, 1, points, initial);
  assert.deepEqual([arrived.x, arrived.y, arrived.phase, arrived.clicked, arrived.aim], [100, 50, "dwell", false, true]);
  const clicked = samplePointer(actions, offset + 2450, 1, points, initial);
  assert.deepEqual([clicked.phase, clicked.clicked, clicked.pressed], ["click", true, true]);
  const second = samplePointer(actions, offset + 5350, 1, points, initial);
  assert.equal(second.action.target, "analyze-repository");
  assert.ok(second.x > 100 && second.x < 300, "같은 장면의 앞 동작 자리에서 이어 움직인다");
  assert.equal(samplePointer(actions, offset + 6900, 1, points, initial), null, "마지막 동작이 끝나면 사라진다");
  assert.equal(samplePointer(actions, offset + 2000, 2, points, initial), null, "다른 장면에서는 그리지 않는다");
});

test("스크롤 단계: 흐른 시간은 원래 시간표의 정해진 구간으로 옮겨진다", () => {
  const start = (scene) => scene * 100000;
  const step = { duration: 2800, segments: [[0, 0, 2600, 2600], [0, 5000, 5000, 200]], elapsed: 0 };
  assert.deepEqual(mapStep(step, start), { scene: 0, local: 0, elapsed: 0 });
  assert.deepEqual(mapStep({ ...step, elapsed: 1300 }, start), { scene: 0, local: 1300, elapsed: 1300 });
  assert.deepEqual(mapStep({ ...step, elapsed: 2700 }, start), { scene: 0, local: 5000, elapsed: 5000 }, "둘째 구간은 한 시각에 머문다");
  assert.deepEqual(mapStep({ ...step, elapsed: 99999 }, start), { scene: 0, local: 5000, elapsed: 5000 }, "끝난 단계는 마지막 화면을 유지한다");
  const compressed = { duration: 3000, segments: [[0, 10500, 14000, 3000]], elapsed: 1500 };
  assert.equal(mapStep(compressed, start).local, 12250, "길이를 줄인 구간은 비율로 옮긴다");
  assert.deepEqual(mapStep({ duration: 250, segments: [[3, 0, 0, 250]], elapsed: 100 }, start), { scene: 3, local: 0, elapsed: 300000 });
});

test("스크롤 길이: 단계별 시작 위치가 늘어나는 순서이고 화면 높이에 따라 정해진다", () => {
  for (const height of [500, 700, 800]) {
    const story = mobileBands(height);
    assert.equal(story.offsets.length, 13);
    assert.deepEqual(story.offsets, [...story.offsets].sort((a, b) => a - b));
    assert.ok(story.unit >= 400 && story.unit <= 520);
    assert.ok(story.travel > story.offsets[12]);
    for (const width of [390, 1366]) {
      const recipient = recipientBands(width, height);
      assert.equal(recipient.offsets.length, 6);
      assert.ok(recipient.total > recipient.offsets[5]);
    }
  }
  assert.equal(mobileBands(700).unit, 455);
  assert.equal(recipientBands(1366, 650).unit, 260);
  assert.equal(recipientBands(390, 700).unit, 455);
});

test("화면 맞춤: 들어가면 가운데, 안 들어가면 여백 아래에서 시작하고 넘친 만큼을 알린다", () => {
  assert.equal(viewportGutter(1366, 650), 8);
  assert.equal(viewportGutter(1440, 790), 16);
  assert.equal(viewportGutter(390, 800), 8);
  assert.deepEqual(planFit(790, 0, 600, 16), { top: 95, available: 758, deficit: 0, fit: true });
  assert.deepEqual(planFit(500, 0, 620, 8), { top: 8, available: 484, deficit: 136, fit: false });
  assert.equal(endingHolds(600, 650, 0), true);
  assert.equal(endingHolds(652, 650, 0), false, "버튼이 화면 아래로 밀리는 높이에서는 고정하지 않는다");
  assert.equal(endingHolds(0, 650, 0), false);
});

test("가림 대기: 대상이 보이는 범위 안에 있어야 읽힌 것으로 본다", () => {
  const clip = { top: 100, bottom: 500, left: 0, right: 390 };
  const rect = (top, bottom) => ({ top, bottom, left: 20, right: 370, width: 350, height: bottom - top });
  assert.equal(readableRect(rect(120, 160), clip), true);
  assert.equal(readableRect(rect(480, 520), clip), false, "아래로 잘린 대상");
  assert.equal(readableRect(rect(80, 120), clip), false, "위로 잘린 대상");
  assert.equal(readableRect(rect(60, 560), clip), true, "범위보다 큰 대상은 범위의 60% 이상을 채우면 된다");
  assert.equal(readableRect(rect(380, 900), clip), false);
  assert.equal(readableRect({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }, clip), false, "그려지지 않은 대상");
});

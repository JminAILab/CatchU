// #615 받은 사람 화면의 넓은 화면 좌우 배치와 좁은 화면의 「보던 곳으로 돌아가기」 시험.
//
// 먼저 정한 시나리오·기대 결과·실패 조건(이슈 #615 완료 기준, 2026-11-23 팀장 댓글 「넓은 화면 결정」, 2026-11-25 팀장 댓글 「좁은 화면 복귀 결정」):
//   배치
//   - 기대: 판정 통과 화면은 안내 묶음(제목·안내·Claude 연결·발행 시각) 다음에 작업 칸이 오고, 작업 칸 안의 마크업 순서는 폭과 상관없이
//           AI 요약(2번) → 발행본 자료(1번) → 발행본에 질문하기(3번) → JD 요약(4번)이다. 좌우 자리는 CSS가 1200px 이상에서만 정한다.
//           비밀번호 입력·접근 불가·조회 실패 화면에는 안내 묶음·작업 칸이 없다(지금과 같다).
//   - 실패 조건: 작업 칸 안 순서가 다름, 발행본 자료가 자료 칸 밖에 있음, 비밀번호·불가 화면에 작업 칸이 생김, 스크립트와 CSS의 기준 폭이 다름.
//   넓은 화면의 스크롤(휠 순서·자료 칸만 옮기기)
//   - 기대: 칸 위에서 휠을 내리면 위쪽 안내가 지나갈 때까지 페이지가 먼저 내려가고, 그 뒤에는 칸 안쪽이 굴러간다. 올릴 때는 칸 안쪽이 맨 위에 닿은 뒤 페이지가 올라간다.
//           출처로 옮길 때 자료 칸 안쪽만 움직일 거리를 낸다(강조 글은 칸의 보이는 부분 가운데쯤, 강조가 없으면 항목 시작이 칸 위쪽).
//   - 실패 조건: 안내가 남아 있는데 칸 안쪽부터 굴림, 칸 안쪽이 남았는데 페이지를 올림, 화면 밖으로 잘린 칸의 가운데를 기준으로 삼음.
//   돌아가기 줄
//   - 기대: 사본 표시에 돌아가기 줄 값을 넘기면 가리킨 항목의 첫 자식으로 「보던 곳으로 돌아가기」 단추 줄이 하나만 있고(이름은 하나), 넘기지 않으면 없다.
//           작성자 발행본 상세는 그 값을 넘기지 않는다. 받은 사람 화면도 값이 없으면(넓은 화면·옮겨 간 적 없음) 그리지 않는다.
//   - 실패 조건: 다른 항목에도 줄이 있음, 줄이 항목 제목 뒤에 있음, 작성자 화면이 값을 넘김, 닫는 단추가 있음.
// 실제 배치(CSS)·스크롤·초점 이동·폭 바뀜은 DOM이 필요해 브라우저에서 확인한다. 화면 낭독기 낭독은 여기서 보지 않는다.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readPublishedSnapshot } from "../src/features/recipient/recipient-api.ts";
import { load } from "./u2-render.mjs";

process.env.NEXT_PUBLIC_API_BASE_URL ??= "http://127.0.0.1:3001";

const { RecipientPublicationView } = await load("features/recipient/recipient-view.tsx");
const { PublishedSnapshotView, RETURN_BUTTON_TEXT } = await load("features/publications/snapshot-view.tsx");
const { EDGE_GAP, WIDE_QUERY, pageWheelDistance, paneScrollDistance, wheelPixels, workspaceTop } = await load("features/recipient/recipient-workspace.ts");

const PRESET = { presetOrdinal: 1, presetName: "기본 프리셋" };
const textItem = (id, position, patch = {}) => ({ publishedItemId: id, position, ...PRESET, itemKind: "TEXT_MATERIAL", title: `자료 ${id}`, snapshot: { body: "본문 글" }, ...patch });
const snapshotOf = (items) => readPublishedSnapshot({ title: "발행본 제목", publishedAt: "2026-11-05T03:04:05.000Z", expiresAt: "2027-02-03T03:04:05.000Z", items });
const ready = (items = [textItem("m1", 1), textItem("m2", 2)]) => ({ view: "ready", snapshot: snapshotOf(items), refreshing: false, refreshFailed: false, readWithoutGrant: true });
const slotProps = { token: "tok_A", getGrant: () => null, onAccessLost() {}, isLoggedIn: false, showEvidence() {} };
const render = (snapshot, extra = {}) => renderToStaticMarkup(createElement(RecipientPublicationView, {
  snapshot, headingRef: { current: null }, onRetry() {}, onUnlock: async () => "ignored", waitSeconds: () => 0, highlight: null, slotProps, ...extra,
}));
const count = (html, needle) => html.split(needle).length - 1;
const src = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

test("#615 배치: 판정 통과 화면은 안내 묶음 다음에 작업 칸이 오고, 작업 칸 안은 AI 요약 → 발행본 자료 → 발행본에 질문하기 → JD 요약 순서다", () => {
  const html = render(ready());
  const order = ['data-testid="recipient-intro"', "<h1", 'data-testid="recipient-guide"', 'data-testid="recipient-published-at"',
    'data-testid="recipient-workspace"', 'data-testid="recipient-slot-2"', 'data-testid="recipient-materials"', 'data-testid="publication-snapshot"',
    'data-testid="recipient-slot-3"', 'data-testid="recipient-slot-4"'];
  const positions = order.map((needle) => html.indexOf(needle));
  assert.ok(positions.every((position) => position >= 0), String(positions));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, "마크업 순서");
  assert.equal(count(html, 'data-testid="recipient-workspace"'), 1);
  // 자리마다 CSS가 좌우 자리를 정할 클래스가 있다(시험의 CSS 모듈 대역은 클래스 이름을 그대로 돌려준다).
  assert.match(html, /<div class="summary" data-testid="recipient-slot-2" data-slot="base-summary">/);
  assert.match(html, /<div class="materials" data-testid="recipient-materials">/);
  assert.match(html, /<div class="qna" data-testid="recipient-slot-3" data-slot="qna">/);
  assert.match(html, /<div class="jd" data-testid="recipient-slot-4" data-slot="jd-summary"/);
  // 발행본 자료는 자료 칸의 하나뿐인 자식이다(자료 칸이 그 구역만 스크롤한다).
  assert.match(html, /data-testid="recipient-materials"><section[^>]*data-testid="publication-snapshot"/);
});

test("#615 배치: 비밀번호 입력·접근 불가·조회 실패·불러오는 중 화면에는 안내 묶음과 작업 칸이 없다", () => {
  const idle = { phase: "idle", retryAt: null, reentry: false };
  for (const snapshot of [{ view: "password", unlock: idle }, { view: "unavailable" }, { view: "failed" }, { view: "loading" }]) {
    const html = render(snapshot);
    assert.equal(count(html, 'data-testid="recipient-workspace"'), 0, snapshot.view);
    assert.equal(count(html, 'data-testid="recipient-intro"'), 0, snapshot.view);
    assert.equal(count(html, 'data-testid="recipient-materials"'), 0, snapshot.view);
  }
});

test("#615 기준 폭: 스크립트의 WIDE_QUERY와 CSS의 좌우 배치 기준이 같은 1200px이고, 화면 끝 간격도 같은 12px이다", () => {
  assert.equal(WIDE_QUERY, "(min-width: 1200px)");
  const css = src("features/recipient/recipient.module.css");
  assert.equal(count(css, "@media (min-width: 1200px)"), 1, "좌우 배치 규칙은 이 기준 하나에만 있다");
  assert.equal(count(css, "@media (min-width:"), 1, "다른 폭 기준이 섞이지 않는다");
  assert.equal(EDGE_GAP, 12);
  assert.ok(css.includes("height: max(160px, calc(100dvh - var(--ws-top, 12px) - 12px));"), "작업 칸 높이는 --ws-top과 끝 간격으로 정한다");
  assert.ok(css.includes("margin-bottom: calc(var(--ws-top, 12px) - 12px);"), "줄어든 높이만큼 아래 여백으로 문서 높이를 채운다");
  // 돌아가기 줄은 CSS 폭 기준으로 숨기지 않는다(숨기면 폭 바뀜을 알기 전에 단추가 초점을 잃는다, 2026-11-25 팀장 댓글).
  assert.equal(count(src("features/publications/publications.module.css"), "@media (min-width:"), 0);
});

test("#615 휠 순서: 내릴 때는 안내가 지나갈 때까지 페이지 먼저, 올릴 때는 칸 안쪽이 맨 위에 닿은 뒤 페이지다", () => {
  const base = { workspaceTop: EDGE_GAP, pageScrolled: true, paneTop: 100, paneMax: 900 };
  // 안내가 아직 보임(작업 칸 윗변이 화면 위 끝보다 아래): 남은 거리만큼만 페이지를 내린다.
  assert.equal(pageWheelDistance({ ...base, delta: 100, workspaceTop: 400, pageScrolled: false, paneTop: 0 }), 100);
  assert.equal(pageWheelDistance({ ...base, delta: 100, workspaceTop: 52 }), 40, "남은 거리 40px만");
  // 작업 칸이 화면 위 끝에 닿은 뒤: 칸 안쪽을 굴리게 둔다.
  assert.equal(pageWheelDistance({ ...base, delta: 100 }), 0);
  assert.equal(pageWheelDistance({ ...base, delta: 100, workspaceTop: EDGE_GAP + 1 }), 0, "1px 어긋남은 닿은 것으로 본다");
  // 올릴 때: 칸 안쪽이 남아 있으면 칸 안쪽, 맨 위면 페이지.
  assert.equal(pageWheelDistance({ ...base, delta: -100 }), 0);
  assert.equal(pageWheelDistance({ ...base, delta: -100, paneTop: 0 }), -100);
  assert.equal(pageWheelDistance({ ...base, delta: -100, paneTop: 0, pageScrolled: false }), 0, "페이지도 맨 위면 아무것도 하지 않는다");
  // 칸 안쪽이 끝에 닿은 뒤 더 내리면 페이지에 넘긴다(페이지가 더 내려갈 수 있을 때만 움직인다).
  assert.equal(pageWheelDistance({ ...base, delta: 100, paneTop: 900 }), 100);
  // 휠 값 단위: px 그대로, 줄 단위는 40px, 쪽 단위는 화면 높이.
  assert.equal(wheelPixels(120, 0, 800), 120);
  assert.equal(wheelPixels(3, 1, 800), 120);
  assert.equal(wheelPixels(-1, 2, 800), -800);
  // 작업 칸 윗변: 안내가 지나간 뒤에도 화면 위 끝에서 12px은 띄운다.
  assert.equal(workspaceTop(539.4), 539);
  assert.equal(workspaceTop(-200), EDGE_GAP);
});

test("#615 넓은 화면 출처 이동: 자료 칸 안쪽만 옮길 거리를 내고, 화면 밖으로 잘린 칸은 보이는 부분을 기준으로 삼는다", () => {
  // 칸이 화면 16~764에 다 보이고 강조 글(높이 20)이 칸 아래쪽 화면 밖 1200에 있다: 보이는 부분의 가운데(390)에 강조 글 가운데가 오게 내린다.
  const down = paneScrollDistance({ top: 16, bottom: 764 }, { top: 1200, height: 20 }, 800, true);
  assert.equal(down, 1200 - 16 - (764 - 16 - 20) / 2);
  assert.equal(1200 - down + 10, (16 + 764) / 2, "옮긴 뒤 강조 글 가운데가 칸 가운데");
  // 강조 글이 칸 위쪽에 있으면 음수(올린다).
  assert.ok(paneScrollDistance({ top: 16, bottom: 764 }, { top: -500, height: 20 }, 800, true) < 0);
  // 칸 아래쪽이 화면 밖(안내가 아직 보이는 동안): 화면 안에 보이는 544~800을 기준으로 삼는다.
  const clipped = paneScrollDistance({ top: 544, bottom: 1200 }, { top: 900, height: 20 }, 800, true);
  assert.equal(900 - clipped + 10, (544 + 800) / 2);
  // 보이는 부분이 아주 낮아도 강조 글 위에 24px은 둔다.
  assert.equal(paneScrollDistance({ top: 700, bottom: 1400 }, { top: 900, height: 20 }, 720, true), 900 - 700 - 24);
  // 강조가 없으면 항목 시작이 칸 위쪽 22px 아래에 온다.
  assert.equal(paneScrollDistance({ top: 16, bottom: 764 }, { top: 640, height: 0 }, 800, false), 640 - 16 - 22);
});

test("#615 돌아가기 줄: 값을 넘기면 가리킨 항목의 첫 자식으로 「보던 곳으로 돌아가기」 줄이 하나만 있고, 넘기지 않으면 없다", () => {
  const snapshot = snapshotOf([textItem("m1", 1), textItem("m2", 2), textItem("m3", 3, { presetOrdinal: 2, presetName: "포트폴리오" })]);
  const view = (props = {}) => renderToStaticMarkup(createElement(PublishedSnapshotView, { snapshot, ...props }));
  assert.equal(RETURN_BUTTON_TEXT, "보던 곳으로 돌아가기");
  const none = view();
  assert.equal(count(none, 'data-testid="snapshot-return-bar"'), 0);
  assert.ok(!none.includes("돌아가기"));
  const html = view({ returnBar: { publishedItemId: "m2", onReturn() {} } });
  assert.equal(count(html, 'data-testid="snapshot-return-bar"'), 1);
  // 항목 요소가 열린 바로 뒤(제목 h3 앞)에 줄이 있고, 줄 안에는 이름이 하나인 단추 하나뿐이다(닫는 단추 없음).
  assert.match(html, /<li id="published-item-m2"[^>]*><div class="returnBar" data-testid="snapshot-return-bar"><button type="button" class="returnButton">보던 곳으로 돌아가기<\/button><\/div><h3/);
  assert.match(html, /<li id="published-item-m1"[^>]*><h3/, "다른 항목에는 없다");
  // 열리지 않은 탭의 항목을 가리켜도 그 항목 안에 그려 둔다(탭과 함께 숨고, 그 탭으로 돌아오면 다시 보인다).
  const other = view({ activePreset: 1, returnBar: { publishedItemId: "m3", onReturn() {} } });
  assert.match(other, /<li id="published-item-m3"[^>]*><div class="returnBar"/);
  // 사본에 없는 항목이면 그리지 않는다.
  assert.equal(count(view({ returnBar: { publishedItemId: "none", onReturn() {} } }), 'data-testid="snapshot-return-bar"'), 0);
});

test("#615 돌아가기 줄: 받은 사람 화면은 화면이 넘긴 값이 있을 때만 그리고, 작성자 발행본 상세는 값을 넘기지 않는다", () => {
  assert.equal(count(render(ready()), 'data-testid="snapshot-return-bar"'), 0, "옮겨 간 적이 없거나 넓은 화면이면 값이 없다");
  const html = render(ready(), { returnBar: { publishedItemId: "m2", onReturn() {} } });
  assert.equal(count(html, 'data-testid="snapshot-return-bar"'), 1);
  assert.ok(html.indexOf('data-testid="recipient-materials"') < html.indexOf('data-testid="snapshot-return-bar"'));
  assert.ok(html.indexOf('data-testid="snapshot-return-bar"') < html.indexOf('data-testid="recipient-slot-3"'), "줄은 자료 칸 안에 있다");
  // 작성자 발행본 화면(범위 밖)은 돌아가기와 좌우 배치를 쓰지 않는다: 그 화면의 코드가 이 값·이 파일을 참조하지 않는다.
  for (const path of ["features/publications/publication-detail-view.tsx", "features/publications/publication-detail-screen.tsx"]) {
    const code = src(path);
    assert.ok(!code.includes("returnBar") && !code.includes("recipient-workspace"), path);
  }
});

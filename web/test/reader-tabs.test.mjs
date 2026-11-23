// 발행 프리셋 U3(u3-reader-views) — 공용 탭 줄(TabStrip), 발행본 자료의 프리셋 탭 묶기, 출처 이동 상태, 사본 응답의 프리셋 칸 시험.
//
// 먼저 정한 시나리오·기대 결과·실패 조건(코드 생성 계획 Step 1, unit-test-instructions 「시나리오」, 기능 설계 rules BR1.1~BR2.5·BR4.1~BR4.3,
// NFR 설계 performance 4 「확인 수단」·security 1~3, team.md Testing Posture). 세부 시험 코드는 구현 뒤 썼다.
//
// - 탭 줄: tablist(이름)·tab(aria-selected·aria-controls)·tabpanel(aria-labelledby). 열린 탭만 tabindex 0, 패널은 늘 tabindex 0, 열리지 않은 패널은 hidden이고
//   패널에 display를 정하는 클래스가 없다. 키: 오른쪽·왼쪽(끝에서 돎)·Home·End는 바꾸기 요청 뒤 거절(false)이 아니면 새 탭에 초점, 거절이면 초점 그대로.
//   실패 조건: 모든 탭이 tabindex 0, 패널이 없음, 패널에 클래스, 거절했는데 초점이 옮겨 감.
// - 탭 묶음: presetOrdinal 오름차순, 묶음 안 position 순, 이름은 묶음 첫 항목. 프리셋 하나여도 탭 줄, 같은 자료가 두 프리셋이면 두 탭에 각각.
//   실패 조건: 섞임, 탭 줄 없음, 한 탭에만, 다른 이름.
// - 탭 이름: 50자 이름은 글자 그대로(말줄임은 CSS 클래스), 탭 아래 이름 전체, 개수 없음. 태그 꼴 이름은 글자로만, id에 이름 없음.
//   실패 조건: 글자 잘림·개수, 태그가 그려짐.
// - 처음: 첫 탭이 열리고 다른 패널은 hidden, 처음 그릴 때 PDF 사본 요청 0.
// - 출처 이동: 다른 탭 대상이면 탭·대상·알림이 한 번에, 같은 탭이면 알림 그대로. 갱신 뒤 같은 순번이 있으면 그대로, 없으면 첫 탭.
// - 응답: presetOrdinal 없음·0·6·1.5·글자, presetName 없음·빈 글자·공백만은 응답 모양 어긋남(조회 실패). 받은 사람 응답 해석은 두 칸을 옮기고
//   isFirstCopy·원본 ID 같은 그 밖의 칸은 버린다.
//
// 원본 tsx는 u2-render.mjs로 변환해 불러온다. 초점·스크롤 효과와 실제 숨김(CSS)은 서버 렌더링에서 돌지 않아 Build and Test의 브라우저 확인에서 본다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createPublicationsApi, isPublishedSnapshot } from "../src/features/publications/publications-api.ts";
import { createRecipientApi, readPublishedSnapshot } from "../src/features/recipient/recipient-api.ts";
import { load } from "./u2-render.mjs";

const { TabStrip, isTabAccepted, tabForKey, tabKeyAction } = await load("components/tab-strip/tab-strip.tsx");
const { PublishedSnapshotView, groupByPreset } = await load("features/publications/snapshot-view.tsx");
const { INITIAL_JUMP_STATE, choosePreset, jumpToEvidence, presetAfterRefresh } = await load("features/publications/snapshot-jump.ts");

const AT = "2026-11-20T03:04:05.000Z";
const EXPIRES = "2027-02-18T03:04:05.000Z";
const text = (id, position, presetOrdinal, presetName, body = `본문 ${id}`) =>
  ({ publishedItemId: id, position, presetOrdinal, presetName, itemKind: "TEXT_MATERIAL", title: `자료 ${id}`, snapshot: { body } });
const pdf = (id, position, presetOrdinal, presetName) => ({
  publishedItemId: id, position, presetOrdinal, presetName, itemKind: "PDF_MATERIAL", title: `PDF ${id}`, snapshot: { pageCount: 1 },
  pdfPages: [{ pageNumber: 1, text: "쪽 글", readable: true }],
});
const snapshot = (items) => ({ title: "발행본", publishedAt: AT, expiresAt: EXPIRES, items });
/** P1(자기소개서) 2개, P2(포트폴리오) 3개. 응답 순서는 섞어 둔다. */
const twoPresets = () => snapshot([
  text("p2c", 5, 2, "포트폴리오"), text("p1b", 2, 1, "자기소개서"), pdf("p2a", 3, 2, "포트폴리오"), text("p1a", 1, 1, "자기소개서"), text("p2b", 4, 2, "포트폴리오"),
]);
const view = (props) => renderToStaticMarkup(createElement(PublishedSnapshotView, props));
const strip = (props) => renderToStaticMarkup(createElement(TabStrip, {
  tabs: [{ id: "a", label: "가" }, { id: "b", label: "나" }, { id: "c", label: "다" }], active: "b", onChange() {}, label: "시험 탭",
  idPrefix: "t", panels: { a: "패널 가", b: "패널 나", c: "패널 다" }, ...props,
}));
const panelTags = (html) => [...html.matchAll(/<div role="tabpanel"[^>]*>/g)].map((match) => match[0]);
const count = (html, needle) => html.split(needle).length - 1;
const location = (publishedItemId, patch = {}) => ({ publishedItemId, fieldPath: "body", charStart: 0, charEnd: 2, pdfPage: null, ...patch });

// ── 탭 줄(TabStrip) ───────────────────────────────────────────────

test("BR1.1·BR1.3 탭 줄은 tablist(이름)·tab·tabpanel 역할이고, 열린 탭만 tabindex 0, 패널은 모두 tabindex 0이며 열리지 않은 패널만 hidden이다", () => {
  const html = strip({});
  assert.match(html, /^<div role="tablist" aria-label="시험 탭" class="tabs">/);
  for (const [id, selected] of [["a", false], ["b", true], ["c", false]]) {
    assert.match(html, new RegExp(`<button type="button" role="tab" id="t-tab-${id}" aria-selected="${selected}" aria-controls="t-panel-${id}" tabindex="${selected ? 0 : -1}" class="${selected ? "tabActive" : "tab"}">`));
  }
  assert.deepEqual(panelTags(html), [
    '<div role="tabpanel" id="t-panel-a" aria-labelledby="t-tab-a" tabindex="0" hidden="">',
    '<div role="tabpanel" id="t-panel-b" aria-labelledby="t-tab-b" tabindex="0">',
    '<div role="tabpanel" id="t-panel-c" aria-labelledby="t-tab-c" tabindex="0" hidden="">',
  ], "패널에 display를 정하는 클래스가 없다(hidden이 덮이지 않게, NFR 설계 Minor 2)");
  assert.ok(html.indexOf('role="tablist"') < html.indexOf('role="tabpanel"'));
});

test("BR1.4 keepInactive가 false면 열리지 않은 패널은 비어 있고, true면 내용을 그린 채 hidden이다", () => {
  const empty = strip({});
  assert.ok(empty.includes('hidden=""></div>') && empty.includes(">패널 나</div>") && !empty.includes("패널 가") && !empty.includes("패널 다"));
  const kept = strip({ keepInactive: true });
  assert.ok(kept.includes('id="t-panel-a" aria-labelledby="t-tab-a" tabindex="0" hidden="">패널 가</div>'));
  assert.ok(kept.includes('id="t-panel-c" aria-labelledby="t-tab-c" tabindex="0" hidden="">패널 다</div>'));
});

test("BR1.5 탭 이름 말줄임은 선택이고 글자를 자르지 않으며, tabTestId를 주면 탭마다 data-testid가 붙는다", () => {
  const long = "아주".repeat(25);
  const truncated = strip({ tabs: [{ id: "a", label: long }], active: "a", panels: { a: "x" }, truncateLabels: true, tabTestId: "shot-tab" });
  assert.ok(truncated.includes(`data-testid="shot-tab-a"><span class="truncated">${long}</span></button>`));
  const plain = strip({});
  assert.doesNotMatch(plain, /truncated|data-testid/);
});

test("BR1.2 키: 오른쪽·왼쪽은 옆 탭이고 끝에서 돈다. Home·End는 처음·끝이고 다루지 않는 키와 빈 탭 줄은 null이다", () => {
  const ids = ["a", "b", "c"];
  assert.equal(tabForKey(ids, "a", "ArrowRight"), "b");
  assert.equal(tabForKey(ids, "b", "ArrowLeft"), "a");
  assert.equal(tabForKey(ids, "c", "ArrowRight"), "a", "끝에서 오른쪽은 처음");
  assert.equal(tabForKey(ids, "a", "ArrowLeft"), "c", "처음에서 왼쪽은 끝");
  assert.equal(tabForKey(ids, "b", "Home"), "a");
  assert.equal(tabForKey(ids, "a", "End"), "c");
  for (const key of ["Enter", " ", "Tab", "ArrowDown"]) assert.equal(tabForKey(ids, "a", key), null, key);
  assert.equal(tabForKey([], "a", "ArrowRight"), null);
});

test("NFR 설계 Q1 A 바꾸기 거절: onChange가 false면 초점을 옮기지 않고, 돌려준 값이 없거나 true면 새 탭에 초점을 둔다. 열린 탭으로 가면 요청하지 않는다", () => {
  const asked = [];
  const run = (result, key = "ArrowRight") => tabKeyAction({ ids: ["a", "b"], from: "a", active: "a", key, onChange: (id) => { asked.push(id); return result; } });
  assert.deepEqual(run(false), { handled: true, focus: null }, "거절이면 초점 그대로");
  assert.deepEqual(run(undefined), { handled: true, focus: "b" }, "void는 바뀐 것");
  assert.deepEqual(run(true), { handled: true, focus: "b" });
  assert.deepEqual(asked, ["b", "b", "b"]);
  assert.deepEqual(run(false, "Home"), { handled: true, focus: "a" }, "이미 열린 탭은 요청 없이 초점만");
  assert.deepEqual(run(true, "Escape"), { handled: false, focus: null });
  assert.equal(asked.length, 3);
  assert.equal(isTabAccepted(false), false);
  assert.equal(isTabAccepted(undefined), true);
  assert.equal(isTabAccepted(true), true);
});

// ── 발행본 자료 탭 묶음 ──────────────────────────────────────────

test("BR2.1 P1(2)·P2(3) 사본은 순번 오름차순 탭 둘이고, P1에 1·2, P2에 3·4·5가 position 순으로 들고 이름은 묶음 이름이다", () => {
  const groups = groupByPreset(twoPresets());
  assert.deepEqual(groups.map((group) => [group.ordinal, group.name, group.items.map((item) => item.position)]),
    [[1, "자기소개서", [1, 2]], [2, "포트폴리오", [3, 4, 5]]]);
  const html = view({ snapshot: twoPresets() });
  assert.equal(count(html, 'role="tab"'), 2);
  const panel = (n) => {
    const start = html.indexOf(`id="publication-snapshot-panel-${n}"`);
    return html.slice(start, n === 1 ? html.indexOf('id="publication-snapshot-panel-2"') : undefined);
  };
  assert.deepEqual([...panel(1).matchAll(/id="published-item-([^"]+)"/g)].map((match) => match[1]), ["p1a", "p1b"]);
  assert.deepEqual([...panel(2).matchAll(/id="published-item-([^"]+)"/g)].map((match) => match[1]), ["p2a", "p2b", "p2c"]);
});

test("BR2.2 프리셋이 하나여도 탭 줄(이름 「발행본 자료」)과 탭 하나가 있고, 항목이 없으면 탭 줄 없이 지금 안내다", () => {
  const html = view({ snapshot: snapshot([text("a", 1, 1, "하나")]) });
  assert.match(html, /<div role="tablist" aria-label="발행본 자료" class="tabs">/);
  assert.equal(count(html, 'role="tab"'), 1);
  assert.equal(count(html, 'role="tabpanel"'), 1);
  const empty = view({ snapshot: snapshot([]) });
  assert.deepEqual(groupByPreset(snapshot([])), []);
  assert.ok(empty.includes("사본에 항목이 없습니다.") && !empty.includes("tablist"));
});

test("BR2.3 같은 Catch가 P1·P2에 들면 두 탭에 각각 그린다(publishedItemId가 다르다)", () => {
  const same = (id, position, ordinal, name) => ({ ...text(id, position, ordinal, name), itemKind: "CATCH", title: "같은 Catch",
    snapshot: { workFacts: ["사실"], subjectContribution: "기여", evidence: [], authorDescription: null, aiDraft: null, mismatch: false } });
  const value = snapshot([same("c-p1", 1, 1, "자기소개서"), same("c-p2", 2, 2, "포트폴리오")]);
  assert.equal(isPublishedSnapshot(value), true);
  assert.deepEqual(groupByPreset(value).map((group) => group.items.map((item) => item.publishedItemId)), [["c-p1"], ["c-p2"]]);
  const html = view({ snapshot: value });
  assert.equal(count(html, "같은 Catch"), 2);
  assert.ok(html.indexOf('id="published-item-c-p1"') < html.indexOf('id="publication-snapshot-panel-2"'));
  assert.ok(html.indexOf('id="published-item-c-p2"') > html.indexOf('id="publication-snapshot-panel-2"'));
});

test("NFR 요구 검토 Minor 1 같은 순번에 이름이 섞여 와도 응답을 거부하지 않고 묶음 첫 항목(가장 작은 position) 이름을 쓴다", () => {
  const value = snapshot([text("b", 2, 1, "나중 이름"), text("a", 1, 1, "처음 이름")]);
  assert.equal(isPublishedSnapshot(value), true);
  assert.equal(groupByPreset(value)[0].name, "처음 이름");
  assert.match(view({ snapshot: value }), /<span class="truncated">처음 이름<\/span>/);
});

test("BR1.5·BR2.2 50자 이름은 탭에 글자 그대로(말줄임 클래스), 탭 아래에 이름 전체이고, 탭에 자료 개수가 없다", () => {
  const name = "가".repeat(50);
  const html = view({ snapshot: snapshot([text("a", 1, 1, name), text("b", 2, 1, name)]) });
  assert.match(html, new RegExp(`data-testid="snapshot-preset-tab-1"><span class="truncated">${name}</span></button>`), "개수 없이 이름 글자만");
  assert.ok(html.includes(`<p class="presetName" data-testid="snapshot-preset-name">${name}</p>`));
  assert.doesNotMatch(html, /\(2\)|2개/);
});

test("BR2.5·NFR3.1·NFR3.2 태그 꼴 이름은 탭·탭 아래 이름·알림에서 글자로만 그리고, 탭·패널 id에 이름이 없다", () => {
  for (const name of ["<b>x</b>", "<img src=x onerror=alert(1)>"]) {
    const html = view({ snapshot: snapshot([text("a", 1, 1, "첫"), text("b", 2, 2, name)]), activePreset: 2, tabNotice: { ordinal: 2, presetName: name, seq: 1 } });
    const escaped = name.replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    assert.equal(count(html, escaped), 3, `${name}: 탭·이름 줄·알림`);
    assert.doesNotMatch(html, /<b>|<img/);
    for (const [, id] of html.matchAll(/ id="([^"]+)"/g)) assert.doesNotMatch(id, /[<>]|img|onerror/, id);
  }
});

test("처음 화면: 첫 탭이 열리고 다른 패널은 hidden(패널에 클래스 없음)이며, 처음 그릴 때 PDF 사본 요청은 0이다. 사본에 없는 순번을 넘기면 첫 탭이다", () => {
  let fetched = 0;
  const pdfSource = () => ({ fetchPdf: async () => { fetched += 1; return new Response(null, { status: 500 }); } });
  for (const activePreset of [undefined, null, 9]) {
    const html = view({ snapshot: twoPresets(), pdfSource, activePreset });
    assert.match(html, /id="publication-snapshot-tab-1" aria-selected="true"/, String(activePreset));
    assert.deepEqual(panelTags(html), [
      '<div role="tabpanel" id="publication-snapshot-panel-1" aria-labelledby="publication-snapshot-tab-1" tabindex="0">',
      '<div role="tabpanel" id="publication-snapshot-panel-2" aria-labelledby="publication-snapshot-tab-2" tabindex="0" hidden="">',
    ]);
    assert.match(html, /data-testid="snapshot-pdf-viewer-open"/, "열리지 않은 탭의 PDF 항목도 그려 둔다(BR1.4)");
  }
  assert.equal(fetched, 0, "처음 그릴 때 PDF 요청 0(NFR5.3)");
});

// ── 열린 탭과 출처 이동(snapshot-jump) ───────────────────────────

test("NFR5.5 갱신 뒤 탭: 같은 순번이 있으면 그대로, 없어졌거나 정한 적이 없으면 첫 탭, 묶음이 없으면 null이다", () => {
  const groups = groupByPreset(twoPresets());
  assert.equal(presetAfterRefresh(groups, 2), 2);
  assert.equal(presetAfterRefresh(groups, 4), 1);
  assert.equal(presetAfterRefresh(groups, null), 1);
  assert.equal(presetAfterRefresh([], 2), null);
  const refreshed = groupByPreset(snapshot([text("x", 1, 3, "셋째"), text("y", 2, 4, "넷째")]));
  assert.equal(presetAfterRefresh(refreshed, 2), 3, "그 순번이 없어지면 새 사본의 첫 탭");
});

test("BR4.1·BR4.2·NFR1.2 출처가 다른 탭 항목이면 열린 탭·대상·알림이 한 번에 바뀌고, 같은 위치를 다시 누르면 seq가 늘어 다시 옮긴다", () => {
  const value = twoPresets();
  const jumped = jumpToEvidence(INITIAL_JUMP_STATE, value, location("p2b"));
  assert.deepEqual(jumped, {
    preset: 2,
    target: { publishedItemId: "p2b", highlight: { publishedItemId: "p2b", fieldPath: "body", charStart: 0, charEnd: 2 }, seq: 1 },
    notice: { ordinal: 2, presetName: "포트폴리오", seq: 1 },
  });
  const again = jumpToEvidence(jumped, value, location("p2b"));
  assert.equal(again.target.seq, 2);
  assert.equal(again.notice, jumped.notice, "같은 탭이면 알림을 바꾸지 않는다");
  // PDF 항목: 쪽 경로가 맞지 않아도 항목만 가리키고 탭은 바뀐다(강조 없음).
  const toPdf = jumpToEvidence(INITIAL_JUMP_STATE, value, location("p2a", { fieldPath: "pages[1]", charStart: 0, charEnd: 1, pdfPage: 1 }));
  assert.equal(toPdf.preset, 2);
  assert.deepEqual(toPdf.target.highlight, { publishedItemId: "p2a", fieldPath: "pages[1]", charStart: 0, charEnd: 1 });
});

test("BR4.2 출처가 열린 탭 항목이면 탭 그대로이고 알림이 없다. 사본에 없는 항목이면 상태가 그대로다", () => {
  const value = twoPresets();
  const same = jumpToEvidence(INITIAL_JUMP_STATE, value, location("p1b"));
  assert.equal(same.preset, 1);
  assert.equal(same.notice, null);
  assert.equal(same.target.publishedItemId, "p1b");
  const opened = choosePreset(INITIAL_JUMP_STATE, 2);
  const inOpen = jumpToEvidence(opened, value, location("p2c"));
  assert.equal(inOpen.preset, 2);
  assert.equal(inOpen.notice, null);
  assert.equal(jumpToEvidence(same, value, location("없는 항목")), same);
});

test("탭을 누르거나 화살표로 옮기면 열린 탭만 바뀌고 출처 이동 알림은 지우며 강조 대상은 남긴다. 같은 탭이면 상태가 그대로다", () => {
  const jumped = jumpToEvidence(INITIAL_JUMP_STATE, twoPresets(), location("p2b"));
  const back = choosePreset(jumped, 1);
  assert.deepEqual(back, { preset: 1, target: jumped.target, notice: null });
  assert.equal(choosePreset(back, 1), back);
});

// ── 사본 응답의 프리셋 칸(BR2.4, NFR4.1·NFR4.2) ───────────────────

test("BR2.4 프리셋 칸이 없거나 순번이 1~5 정수가 아니거나 이름이 빈 글자·공백만이면 사본 전체가 응답 모양 어긋남이다", () => {
  const good = () => text("a", 1, 1, "자기소개서");
  assert.equal(isPublishedSnapshot(snapshot([good()])), true);
  assert.equal(isPublishedSnapshot(snapshot([{ ...good(), presetOrdinal: 5 }])), true, "5까지");
  const without = (key) => { const item = good(); delete item[key]; return item; };
  const bad = [without("presetOrdinal"), without("presetName"),
    ...[0, 6, 1.5, "1", null, -1].map((presetOrdinal) => ({ ...good(), presetOrdinal })),
    ...["", "   ", 3, null].map((presetName) => ({ ...good(), presetName }))];
  for (const item of bad) {
    assert.equal(isPublishedSnapshot(snapshot([good(), item])), false, JSON.stringify(item));
    assert.equal(readPublishedSnapshot(snapshot([good(), item])), null, JSON.stringify(item));
  }
});

test("BR2.4 받은 사람 열람과 작성자 상세 모두 프리셋 칸이 틀린 응답을 조회 실패로 보고 그대로 그리지 않는다", async () => {
  const broken = snapshot([{ ...text("a", 1, 1, "자기소개서"), presetOrdinal: 0 }]);
  const recipient = createRecipientApi(async () => ({ kind: "success", status: 200, data: broken }));
  assert.deepEqual(await recipient.publication("tok", null), { kind: "lookup-failed", status: 200, code: "LOOKUP_FAILED" });
  const detail = { publicationId: "p1", url: "https://catchu.example/s/x", state: "ACTIVE", passwordProtected: false, snapshot: broken };
  const owner = createPublicationsApi(async () => ({ kind: "success", status: 200, data: detail }));
  assert.deepEqual(await owner.get("p1"), { kind: "failed", failure: "unknown" });
  const fixed = createPublicationsApi(async () => ({ kind: "success", status: 200, data: { ...detail, snapshot: twoPresets() } }));
  assert.equal((await fixed.get("p1")).kind, "ok");
});

test("NFR4.1·NFR4.2 받은 사람 응답 해석은 프리셋 칸 둘을 옮기고 isFirstCopy·원본 ID 같은 그 밖의 칸은 버린다(이름은 다듬지 않는다)", () => {
  const raw = snapshot([{ ...text("a", 1, 2, "  포트폴리오 "), isFirstCopy: true, sourceId: "원본", sourceTextMaterialId: "원본-2" }]);
  const [item] = readPublishedSnapshot(raw).items;
  assert.deepEqual(Object.keys(item).sort(), ["itemKind", "position", "presetName", "presetOrdinal", "publishedItemId", "snapshot", "title"]);
  assert.equal(item.presetOrdinal, 2);
  assert.equal(item.presetName, "  포트폴리오 ");
  assert.ok(!JSON.stringify(item).includes("원본"));
});

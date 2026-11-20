import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "./u2-render.mjs";

// 12월 intent U2 받은 사람 안내 묶음(기능 설계 BR8.2, AC16.2.2). 모양은 합쳐진 계약 C-11(#421, slots 0번 RecipientGuide,
// props showClaudeConnect 하나)을 따르고, 문구 두 줄(link-conditions·base-summary)은 #416 팀장 답에 맞췄다.
const { RECIPIENT_GUIDE_ITEMS, RECIPIENT_GUIDE_TITLE, CLAUDE_CONNECT_ITEM, recipientGuideItems } = await load("components/recipient-guide/recipient-guide-items.ts");
const { RecipientGuide } = await load("components/recipient-guide/recipient-guide.tsx");

test("안내 항목은 링크 조건·고정 자료·기본 요약·질의응답·JD 요약(로그인 필요) 다섯이다", () => {
  assert.deepEqual(RECIPIENT_GUIDE_ITEMS.map((item) => item.id), ["link-conditions", "fixed-copy", "base-summary", "questions", "jd-summary"]);
  assert.ok(RECIPIENT_GUIDE_ITEMS.find((item) => item.id === "link-conditions").text.includes("작성자가 중지하면"));
  assert.ok(!RECIPIENT_GUIDE_ITEMS.find((item) => item.id === "link-conditions").text.includes("비밀번호"), "판정 통과 화면에만 보이므로 비밀번호 안내는 없다");
  assert.ok(RECIPIENT_GUIDE_ITEMS.find((item) => item.id === "jd-summary").text.includes("로그인"));
});

test("Claude 연결 줄은 showClaudeConnect가 true일 때만 붙고, 기본은 꺼짐이다", () => {
  assert.deepEqual(recipientGuideItems(false), RECIPIENT_GUIDE_ITEMS);
  assert.deepEqual(recipientGuideItems(true).at(-1), CLAUDE_CONNECT_ITEM);
  const off = renderToStaticMarkup(createElement(RecipientGuide));
  const on = renderToStaticMarkup(createElement(RecipientGuide, { showClaudeConnect: true }));
  assert.ok(!off.includes('data-testid="recipient-guide-claude-connect"'));
  assert.ok(on.includes('data-testid="recipient-guide-claude-connect"') && on.includes(CLAUDE_CONNECT_ITEM.text));
});

test("묶음은 항목을 순서대로 글로만 그리고, 링크는 없으며 단추는 제목의 접기 단추 하나뿐이다", () => {
  const html = renderToStaticMarkup(createElement(RecipientGuide, { showClaudeConnect: false }));
  const ids = [...html.matchAll(/data-testid="recipient-guide-([a-z-]+)"/g)].map((match) => match[1]);
  assert.deepEqual(ids, ["toggle", ...RECIPIENT_GUIDE_ITEMS.map((item) => item.id)]);
  assert.ok(!html.includes("<a "));
  assert.equal(html.split("<button").length - 1, 1);
  for (const item of RECIPIENT_GUIDE_ITEMS) assert.ok(html.includes(`>${item.text}</li>`), `${item.id} 문구는 그대로다`);
});

// #606: 처음에는 제목만 보이고 항목은 접혀 있다. 누른 뒤의 펼침·다시 접힘과 키보드 조작은 브라우저에서 확인한다(이 시험은 처음 그린 모양만 본다).
test("처음 그리면 접혀 있다: 제목 단추는 aria-expanded=false로 항목 목록을 가리키고, 목록은 hidden이다", () => {
  const html = renderToStaticMarkup(createElement(RecipientGuide, { showClaudeConnect: true }));
  const button = html.match(/<button[^>]*>/)[0];
  const list = html.match(/<ul[^>]*>/)[0];
  assert.ok(button.includes('type="button"') && button.includes('aria-expanded="false"'));
  const controls = button.match(/aria-controls="([^"]+)"/)[1];
  assert.ok(list.includes(`id="${controls}"`), "단추가 가리키는 대상이 항목 목록이다");
  assert.ok(/\shidden=""/.test(list), "접힌 목록은 hidden이다");
  assert.ok(new RegExp(`<h2 id="recipient-guide-title"[^>]*><button[^>]*>.*${RECIPIENT_GUIDE_TITLE}</button></h2>`).test(html), "제목(h2) 안에 단추가 있고 제목 문구는 그대로다");
  assert.ok(html.includes('aria-labelledby="recipient-guide-title"'));
  assert.ok(!html.includes("<h1") && !html.includes("autofocus") && !html.includes("tabindex"), "h1·첫 초점을 갖지 않는다(C-11 guide-rule)");
});

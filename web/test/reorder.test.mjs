// #632 순서 목록(ReorderList)의 계산 시험: 「순서 직접 지정」 입력 읽기, 옮기기, 드래그의 받아 주는 여유와 자동 스크롤 속도.
//
// 먼저 정한 시나리오·기대 결과·실패 조건(#632 완료 기준 「순서 바꾸기」와 2026-11-24 팀장 결정 5번).
// - 기대: 번호 칸은 1~항목 수의 정수만 받고, 빈 값·글자·소수·범위 밖 값은 고쳐 넣지 않고 이유를 돌려준다.
//         옮기기는 from 자리의 항목을 to 자리에 넣는다. 목록 테두리에서 줄 하나 높이까지 벗어나 놓은 것은 받고 그보다 멀면 받지 않는다.
//         자동 스크롤은 띠에 들어오면 초당 약 2줄에서 시작해 깊이 들어갈수록 빨라지고 최대 초당 약 6줄이며, 값은 줄 높이를 기준으로 한다.
// - 실패로 보는 것: 0·21·2.5·「abc」가 받아짐, 「 3 」이 받아지지 않음, 범위 밖 자리에서 배열이 바뀜, 원래 배열이 바뀜,
//         줄 하나 높이 안쪽에서 놓은 것이 취소됨, 그보다 먼 곳이 받아짐, 띠 밖에서 스크롤됨, 속도가 초당 6줄을 넘음, 줄 높이와 상관없는 px 값.
//
// 순수 함수와, 끝의 「순서 직접 지정」 켠 모습(서버 렌더링)만 본다. 실제 포인터·터치·초점·브라우저 동작은 이 시험의 범위가 아니다(브라우저에서 따로 확인한다).
import assert from "node:assert/strict";
import { test } from "node:test";
import { load } from "./u2-render.mjs";

const {
  moveItem, parseOrderInput, movedText, orderHintText, leavesOrderZone, ORDER_DISCARDED_TEXT, ORDER_UNCHANGED_TEXT,
  isDropAccepted, dropSlot, autoScrollSpeed, pageScrollStep, clamp, revealScrollTop, DROP_SLACK_ROWS, SCROLL_ROWS_PER_SECOND,
} = await load("features/publications/reorder.ts");

test("moveItem: from 자리의 항목을 to 자리에 넣고 사이를 민다. 범위 밖·같은 자리·정수 아님은 null이고 원래 배열은 바뀌지 않는다", () => {
  const items = ["a", "b", "c", "d"];
  assert.deepEqual(moveItem(items, 0, 2), ["b", "c", "a", "d"]);
  assert.deepEqual(moveItem(items, 3, 0), ["d", "a", "b", "c"]);
  for (const [from, to] of [[0, 0], [-1, 1], [0, 4], [4, 0], [1.5, 0]]) assert.equal(moveItem(items, from, to), null, `${from}→${to}`);
  assert.deepEqual(items, ["a", "b", "c", "d"]);
});

test("parseOrderInput: 1~항목 수의 정수만 받고(앞뒤 공백은 뺀다), 그 밖은 고쳐 넣지 않고 이유를 돌려준다", () => {
  assert.deepEqual(parseOrderInput("3", 4), { ok: true, index: 2 });
  assert.deepEqual(parseOrderInput(" 1 ", 4), { ok: true, index: 0 });
  assert.deepEqual(parseOrderInput("", 4), { ok: false, message: "순서를 입력해 주세요. 1~4 사이의 숫자입니다." });
  for (const raw of ["abc", "2.5", "-1", "1e1", "３"]) assert.deepEqual(parseOrderInput(raw, 4), { ok: false, message: "순서는 1~4 사이의 정수로 입력해 주세요." }, raw);
  for (const raw of ["0", "5", "21"]) assert.deepEqual(parseOrderInput(raw, 4), { ok: false, message: "순서는 1~4 사이여야 합니다." }, raw);
});

test("알림 글: 옮긴 결과는 받침과 상관없는 꼴이고, 취소·버림·안내 글은 정한 그대로다", () => {
  assert.equal(movedText("결제 재시도 구현", 2), "‘결제 재시도 구현’ 자리: 3번째로 옮겼습니다.");
  assert.equal(ORDER_UNCHANGED_TEXT, "순서를 바꾸지 않았습니다.");
  // 2026-11-26 팀장 결정: [적용] 단추가 생겨 안내와 취소 알림이 바뀌었다. N은 실제 상한(지금 항목 수)이다.
  assert.equal(ORDER_DISCARDED_TEXT, "Enter나 [적용]을 누르지 않아 순서를 바꾸지 않았습니다.");
  assert.equal(orderHintText(5), "1~5 사이의 숫자를 넣고 Enter나 [적용]을 누르세요. 누르지 않고 번호 칸과 [적용] 밖으로 나가면 넣은 값은 버리고 순서는 그대로 둡니다.");
  assert.ok(orderHintText(20).startsWith("1~20 사이의 숫자를"));
});

// 2026-11-26 팀장 결정: 번호 칸과 같은 줄의 [적용]이 하나의 입력 구역이다.
// - 기대: 구역 안에서 오가면 벗어남이 아니다. [적용]을 누르는 중의 초점 풀림(Safari는 단추를 눌러도 초점이 단추로 가지 않는다)도 벗어남이 아니다.
//         그 밖의 초점 나감은 벗어남이다(넣은 값을 버린다).
// - 실패로 보는 것: [적용]으로 가는 순간 벗어남으로 읽음(누르기 전에 값이 버려진다), 다른 줄·다른 곳으로 나갔는데 벗어남이 아님.
test("leavesOrderZone: 같은 줄의 번호 칸과 [적용] 사이를 오가거나 [적용]을 누르는 중이면 벗어남이 아니고, 그 밖에는 벗어남이다", () => {
  assert.equal(leavesOrderZone({ staysInZone: true, applying: false }), false);
  assert.equal(leavesOrderZone({ staysInZone: false, applying: true }), false);
  assert.equal(leavesOrderZone({ staysInZone: true, applying: true }), false);
  assert.equal(leavesOrderZone({ staysInZone: false, applying: false }), true);
});

test("isDropAccepted: 목록 안과 테두리에서 줄 하나 높이까지는 받고, 그보다 멀면 받지 않는다(네 방향, 줄 높이 기준)", () => {
  const list = { left: 100, top: 200, right: 500, bottom: 600 };
  assert.equal(DROP_SLACK_ROWS, 1);
  for (const rowHeight of [48, 72]) {
    const near = rowHeight - 1, far = rowHeight + 1;
    assert.equal(isDropAccepted({ x: 300, y: 400 }, list, rowHeight), true, "안쪽");
    assert.equal(isDropAccepted({ x: 300, y: list.bottom + near }, list, rowHeight), true, `${rowHeight}: 아래로 줄 하나 안`);
    assert.equal(isDropAccepted({ x: 300, y: list.top - near }, list, rowHeight), true, `${rowHeight}: 위로 줄 하나 안`);
    assert.equal(isDropAccepted({ x: list.left - near, y: 400 }, list, rowHeight), true, `${rowHeight}: 왼쪽 줄 하나 안`);
    assert.equal(isDropAccepted({ x: list.right + near, y: 400 }, list, rowHeight), true, `${rowHeight}: 오른쪽 줄 하나 안`);
    assert.equal(isDropAccepted({ x: 300, y: list.bottom + far }, list, rowHeight), false, `${rowHeight}: 아래로 더 멀리`);
    assert.equal(isDropAccepted({ x: 300, y: list.top - far }, list, rowHeight), false, `${rowHeight}: 위로 더 멀리`);
    assert.equal(isDropAccepted({ x: list.left - far, y: 400 }, list, rowHeight), false, `${rowHeight}: 왼쪽 더 멀리`);
    assert.equal(isDropAccepted({ x: list.right + far, y: 400 }, list, rowHeight), false, `${rowHeight}: 오른쪽 더 멀리`);
  }
});

test("dropSlot: 포인터가 줄 가운데보다 위면 그 줄 앞이고, 모든 줄보다 아래면 끝이다", () => {
  const rows = [{ top: 0, height: 40 }, { top: 40, height: 40 }, { top: 80, height: 40 }];
  assert.equal(dropSlot(-10, rows), 0);
  assert.equal(dropSlot(19, rows), 0);
  assert.equal(dropSlot(21, rows), 1);
  assert.equal(dropSlot(101, rows), 3);
  assert.equal(dropSlot(10, []), 0);
});

test("autoScrollSpeed: 띠 밖은 0, 띠에 들어오면 초당 약 2줄에서 시작해 깊어질수록 빨라지며 최대 초당 약 6줄이고, 받아 주는 여유 밖은 멈춘다", () => {
  assert.deepEqual(SCROLL_ROWS_PER_SECOND, { start: 2, max: 6 });
  for (const row of [40, 64]) {
    const list = { top: 100, bottom: 100 + row * 8 };
    assert.equal(autoScrollSpeed(list.top + row * 4, list, row), 0, "가운데는 0");
    assert.equal(autoScrollSpeed(list.bottom - row - 1, list, row), 0, "띠 바로 바깥은 0");
    // 띠에 막 들어옴 → 초당 약 2줄(줄 높이 × 2).
    assert.ok(Math.abs(autoScrollSpeed(list.bottom - row + 0.001, list, row) - 2 * row) < 0.01);
    assert.ok(Math.abs(autoScrollSpeed(list.top + row - 0.001, list, row) + 2 * row) < 0.01, "위쪽은 음수");
    // 깊어질수록 빨라진다.
    const mid = autoScrollSpeed(list.bottom - row / 2, list, row);
    assert.ok(mid > 2 * row && mid < 6 * row);
    // 테두리와 그 밖(받아 주는 여유 안)은 최대 초당 6줄.
    assert.equal(autoScrollSpeed(list.bottom, list, row), 6 * row);
    assert.equal(autoScrollSpeed(list.bottom + row * 0.9, list, row), 6 * row);
    assert.equal(autoScrollSpeed(list.top - row * 0.9, list, row), -6 * row);
    // 여유 밖이면 멈춘다(놓아도 취소되는 곳이라 스크롤하지 않는다).
    assert.equal(autoScrollSpeed(list.bottom + row * 1.1, list, row), 0);
    assert.equal(autoScrollSpeed(list.top - row * 1.1, list, row), 0);
  }
  assert.equal(autoScrollSpeed(500, { top: 100, bottom: 600 }, 0), 0, "줄 높이를 모르면 움직이지 않는다");
});

test("autoScrollSpeed: 줄이 목록 절반보다 높아도 위·아래 띠가 겹치지 않아, 아래쪽에서는 아래로 위쪽에서는 위로 스크롤한다", () => {
  const list = { top: 0, bottom: 220 };
  const row = 240;
  assert.ok(autoScrollSpeed(210, list, row) > 0, "아래쪽은 아래로");
  assert.ok(autoScrollSpeed(10, list, row) < 0, "위쪽은 위로");
  assert.equal(autoScrollSpeed(110, list, row), 0, "한가운데는 멈춘다");
  assert.equal(autoScrollSpeed(220, list, row), 6 * row, "테두리에서는 최대 속도");
  assert.equal(autoScrollSpeed(0, list, row), -6 * row);
  assert.equal(autoScrollSpeed(100, { top: 50, bottom: 50 }, row), 0, "높이가 없는 목록은 움직이지 않는다");
});

// #632 리뷰(2026-11-24): 스크롤되는 목록에서 테두리 밖에 놓아도 끄는 줄·선·놓은 줄이 보이게 한다.
test("clamp: 값을 범위 안으로 맞추고, 범위가 뒤집히면 낮은 끝을 쓴다", () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-3, 0, 10), 0);
  assert.equal(clamp(30, 0, 10), 10);
  assert.equal(clamp(5, 8, 2), 8);
});

test("테두리 밖 포인터는 상자의 보이는 끝 자리로 센다: 끝에 일부만 보이는 줄은 가운데가 밖이면 그 줄 앞이다", () => {
  // 상자는 0~95만 보이고 줄은 40px씩이다. 셋째 줄(80~120)은 일부만 보이고 가운데(100)는 밖이다.
  const rows = [{ top: 0, height: 40 }, { top: 40, height: 40 }, { top: 80, height: 40 }, { top: 120, height: 40 }];
  assert.equal(dropSlot(130, rows), 3, "포인터 자리 그대로면 가려진 줄 뒤다");
  assert.equal(dropSlot(clamp(130, 0, 95), rows), 2, "보이는 끝으로 세면 일부만 보이는 줄 앞이다");
  assert.equal(dropSlot(clamp(-25, 0, 95), rows), 0);
});

test("revealScrollTop: 가려진 줄은 다 보이는 자리로 스크롤하고, 보이는 줄은 그대로 둔다", () => {
  const view = { scrollTop: 100, height: 200 };
  assert.equal(revealScrollTop(view, 150, 40), 100, "이미 보임");
  assert.equal(revealScrollTop(view, 280, 40), 120, "아래에 가려짐");
  assert.equal(revealScrollTop(view, 60, 40), 60, "위에 가려짐");
});

// #632 리뷰: 낮은 창(높이 640px 이하)에서는 목록이 페이지와 함께 길어지므로 화면 끝에서 페이지를 스크롤한다.
test("pageScrollStep: 화면 위·아래 끝 띠에서 목록이 화면 밖에 남은 만큼만 페이지를 움직이고, 가운데·목록이 다 보일 때·여유 밖은 0이다", () => {
  const row = 50, view = 600, seconds = 0.1;
  const long = { top: -300, bottom: 900 };
  assert.equal(pageScrollStep(600, long, view, row, seconds), 6 * row * seconds, "아래 끝은 최대 속도로 아래로");
  assert.equal(pageScrollStep(0, long, view, row, seconds), -6 * row * seconds, "위 끝은 최대 속도로 위로");
  assert.equal(pageScrollStep(300, long, view, row, seconds), 0, "가운데는 멈춘다");
  assert.ok(pageScrollStep(560, long, view, row, seconds) > 0 && pageScrollStep(560, long, view, row, seconds) < 6 * row * seconds, "띠 안은 느리게");
  assert.equal(pageScrollStep(600, { top: -300, bottom: 610 }, view, row, seconds), 10, "남은 만큼만 내려간다");
  assert.equal(pageScrollStep(0, { top: -4, bottom: 900 }, view, row, seconds), -4, "남은 만큼만 올라간다");
  assert.equal(pageScrollStep(600, { top: 100, bottom: 500 }, view, row, seconds), 0, "목록이 다 보이면 움직이지 않는다");
  assert.equal(pageScrollStep(0, { top: 100, bottom: 900 }, view, row, seconds), 0, "위쪽이 다 보이면 위로 가지 않는다");
  assert.equal(pageScrollStep(600 + row * 1.1, long, view, row, seconds), 0, "받아 주는 여유 밖은 멈춘다");
  assert.equal(pageScrollStep(600, long, 0, row, seconds), 0);
  assert.equal(pageScrollStep(600, long, view, row, 0), 0);
});

// 2026-11-26 팀장 결정(#632): 「순서 직접 지정」을 켠 동안에는 [빼기]를 숨기고 그 자리에 [적용]을 둔다. 평소에는 [빼기]만 있다.
// - 기대: 켠 모습에는 줄마다 번호 칸 하나와 [적용] 하나가 있고(읽히는 이름에 항목 이름), [빼기]가 없다. Tab이 서는 곳은 줄마다 둘로
//         [적용]이 생기기 전의 켠 모습(번호 칸 + [빼기])과 같다. 안내의 N은 지금 항목 수다. 평소 모습에는 [빼기]만 있고 [적용]·번호 칸이 없다.
//         저장·발행 중에는 [적용]도 막힌다. 프리셋 편집(`preset`)과 발행(`publish`) 두 화면의 앞붙임 모두에서 같다.
// - 실패로 보는 것: 켠 모습에 [빼기]가 남음, [적용]의 이름에 항목 이름이 없음, 줄마다 Tab이 서는 곳이 늘거나 줆, 안내의 N이 항목 수와 다름.
// 서버 렌더링으로 구조와 글만 본다. 실제 초점·Enter·[적용] 누르기는 브라우저에서 따로 확인한다.
const { createElement } = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { ReorderList } = await load("features/publications/pick-parts.tsx");
const noop = () => {};
const entries = ["결제 재시도 구현", "<b>자기소개서</b>", "포트폴리오"].map((title, index) => ({ key: `k${index}`, sourceId: `s${index}`, title, body: title }));
const listHtml = (prefix, extra = {}) => renderToStaticMarkup(createElement(ReorderList, {
  entries, testIdPrefix: prefix, label: "순서", disabled: false, onMove: noop, onRemove: noop, ...extra,
}));
const countOf = (html, text) => html.split(text).length - 1;
/** 줄마다 Tab이 서는 조작 요소의 수(손잡이는 tabindex=-1이라 뺀다). */
const tabStops = (html) => [...html.matchAll(/<li[^>]*>.*?<\/li>/gs)].map(([row]) =>
  [...row.matchAll(/<(?:button|input)\b[^>]*>/g)].filter(([tag]) => !tag.includes('tabindex="-1"')).length);

for (const prefix of ["preset", "publish"]) {
  test(`순서 직접 지정(${prefix}): 켠 동안에는 [빼기] 대신 항목 이름이 붙은 [적용]이 있고, 줄마다 Tab이 서는 곳은 둘 그대로다`, () => {
    const normal = listHtml(prefix);
    assert.equal(countOf(normal, `data-testid="${prefix}-remove"`), 3);
    assert.ok(!normal.includes(`${prefix}-order-apply`) && !normal.includes(`${prefix}-order-input`), "평소에는 [적용]·번호 칸이 없다");
    assert.ok(normal.includes('aria-label="결제 재시도 구현 빼기"'));
    assert.deepEqual(tabStops(normal), [1, 1, 1], "평소에는 번호가 글자라 [빼기] 하나");

    const direct = listHtml(prefix, { defaultDirect: true });
    assert.ok(!direct.includes(`${prefix}-remove`) && !direct.includes("빼기"), "켠 동안에는 [빼기]를 숨긴다");
    assert.equal(countOf(direct, `data-testid="${prefix}-order-input"`), 3);
    assert.equal(countOf(direct, `data-testid="${prefix}-order-apply"`), 3);
    assert.equal(countOf(direct, ">적용</button>"), 3);
    assert.ok(direct.includes('aria-label="결제 재시도 구현 적용"'));
    assert.ok(direct.includes('aria-label="&lt;b&gt;자기소개서&lt;/b&gt; 적용"'), "이름은 글자로만 들어간다");
    assert.deepEqual(tabStops(direct), [2, 2, 2], "번호 칸과 [적용], 줄마다 둘");
    assert.ok(direct.includes(`data-testid="${prefix}-order-hint">${orderHintText(3)}</p>`), "안내의 N은 지금 항목 수다");
    assert.ok(direct.includes('aria-pressed="true">순서 지정 마치기</button>'));

    const saving = listHtml(prefix, { defaultDirect: true, disabled: true });
    assert.equal(countOf(saving, `data-reorder-apply="" disabled=""`), 3, "저장·발행 중에는 [적용]도 막는다");
  });
}

test("순서 직접 지정: 항목이 하나면 켤 수 없어 [빼기]가 그대로 있다", () => {
  const one = renderToStaticMarkup(createElement(ReorderList, {
    entries: entries.slice(0, 1), testIdPrefix: "preset", label: "순서", disabled: false, onMove: noop, onRemove: noop, defaultDirect: true,
  }));
  assert.ok(one.includes('data-testid="preset-remove"'));
  assert.ok(!one.includes("preset-order-apply") && !one.includes("preset-order-direct"));
});

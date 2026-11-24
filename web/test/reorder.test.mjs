// #632 순서 목록(ReorderList)의 계산 시험: 「순서 직접 지정」 입력 읽기, 옮기기, 드래그의 받아 주는 여유와 자동 스크롤 속도.
//
// 먼저 정한 시나리오·기대 결과·실패 조건(#632 완료 기준 「순서 바꾸기」와 2026-11-24 팀장 결정 5번).
// - 기대: 번호 칸은 1~항목 수의 정수만 받고, 빈 값·글자·소수·범위 밖 값은 고쳐 넣지 않고 이유를 돌려준다.
//         옮기기는 from 자리의 항목을 to 자리에 넣는다. 목록 테두리에서 줄 하나 높이까지 벗어나 놓은 것은 받고 그보다 멀면 받지 않는다.
//         자동 스크롤은 띠에 들어오면 초당 약 2줄에서 시작해 깊이 들어갈수록 빨라지고 최대 초당 약 6줄이며, 값은 줄 높이를 기준으로 한다.
// - 실패로 보는 것: 0·21·2.5·「abc」가 받아짐, 「 3 」이 받아지지 않음, 범위 밖 자리에서 배열이 바뀜, 원래 배열이 바뀜,
//         줄 하나 높이 안쪽에서 놓은 것이 취소됨, 그보다 먼 곳이 받아짐, 띠 밖에서 스크롤됨, 속도가 초당 6줄을 넘음, 줄 높이와 상관없는 px 값.
//
// 순수 함수만 본다. 실제 포인터·터치·브라우저 동작은 이 시험의 범위가 아니다(브라우저에서 따로 확인한다).
import assert from "node:assert/strict";
import { test } from "node:test";
import { load } from "./u2-render.mjs";

const {
  moveItem, parseOrderInput, movedText, orderHintText, ORDER_DISCARDED_TEXT, ORDER_UNCHANGED_TEXT,
  isDropAccepted, dropSlot, autoScrollSpeed, clamp, revealScrollTop, DROP_SLACK_ROWS, SCROLL_ROWS_PER_SECOND,
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
  assert.equal(ORDER_DISCARDED_TEXT, "Enter를 누르지 않아 순서를 바꾸지 않았습니다.");
  assert.equal(orderHintText(5), "1~5 사이의 숫자를 넣고 Enter를 누르세요. Enter를 누르지 않고 칸을 벗어나면 넣은 값은 버리고 순서는 그대로 둡니다.");
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

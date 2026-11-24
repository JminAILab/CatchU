/**
 * 순서 목록(`ReorderList`)의 계산(#632). 화면과 나눠 시험한다. DOM을 읽지 않고 숫자만 받는다.
 *
 * - 「순서 직접 지정」: 1부터 항목 수까지의 정수만 받는다. 빈 값·글자·소수·범위 밖 값은 고쳐 넣지 않고 이유를 돌려준다.
 * - 드래그: 놓을 자리, 목록을 조금 벗어나 놓아도 받아 주는 여유, 자동 스크롤 속도. 여유와 속도는 px로 고정하지 않고 줄 높이를 기준으로 잡는다
 *   (2026-11-24 팀장 결정: 줄 하나 높이쯤까지 받아 주고, 자동 스크롤은 초당 약 2줄에서 시작해 최대 초당 약 6줄).
 */

/** `from` 자리의 항목을 빼서 `to` 자리에 넣은 새 배열. 자리가 범위를 벗어나거나 같으면 null이다. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] | null {
  if (!Number.isInteger(from) || !Number.isInteger(to)) return null;
  if (from < 0 || from >= items.length || to < 0 || to >= items.length || from === to) return null;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export type OrderInput = { readonly ok: true; readonly index: number } | { readonly ok: false; readonly message: string };

/** 번호 칸에 넣은 글을 자리(0부터)로 읽는다. 받을 수 없으면 알릴 글을 돌려준다. */
export function parseOrderInput(raw: string, count: number): OrderInput {
  const text = raw.trim();
  if (text === "") return { ok: false, message: `순서를 입력해 주세요. 1~${count} 사이의 숫자입니다.` };
  if (!/^\d+$/.test(text)) return { ok: false, message: `순서는 1~${count} 사이의 정수로 입력해 주세요.` };
  const value = Number(text);
  if (value < 1 || value > count) return { ok: false, message: `순서는 1~${count} 사이여야 합니다.` };
  return { ok: true, index: value - 1 };
}

/** 옮긴 뒤 알림. 이름 끝 글자에 따라 조사가 달라지지 않게 쓴다. */
export const movedText = (title: string, index: number): string => `‘${title}’ 자리: ${index + 1}번째로 옮겼습니다.`;
export const ORDER_UNCHANGED_TEXT = "순서를 바꾸지 않았습니다.";
export const ORDER_DISCARDED_TEXT = "Enter를 누르지 않아 순서를 바꾸지 않았습니다.";
export const orderHintText = (count: number): string =>
  `1~${count} 사이의 숫자를 넣고 Enter를 누르세요. Enter를 누르지 않고 칸을 벗어나면 넣은 값은 버리고 순서는 그대로 둡니다.`;

export type Box = { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number };

/** 목록 테두리 밖으로 받아 주는 여유: 줄 높이의 몇 배인가. 1이면 줄 하나 높이다. */
export const DROP_SLACK_ROWS = 1;

/**
 * 포인터가 놓을 수 있는 곳에 있는가. 끄는 줄은 목록 끝에서 멈춰 보이므로, 테두리에서 줄 하나 높이쯤 벗어난 것까지는 받아 준다.
 * 그보다 멀면 취소다. 가로·세로 모두 같은 여유를 쓴다.
 */
export function isDropAccepted(pointer: { readonly x: number; readonly y: number }, list: Box, rowHeight: number): boolean {
  const slack = Math.max(0, rowHeight) * DROP_SLACK_ROWS;
  return pointer.x >= list.left - slack && pointer.x <= list.right + slack && pointer.y >= list.top - slack && pointer.y <= list.bottom + slack;
}

/**
 * 놓을 자리(끄는 줄을 뺀 나머지 줄 가운데 몇 번째 앞인가, 0~others.length). 포인터가 줄의 가운데보다 위면 그 줄 앞이다.
 * 끄는 줄을 뺀 배열에서의 자리라 그대로 `moveItem`의 `to`로 쓴다.
 */
export function dropSlot(pointerY: number, others: readonly { readonly top: number; readonly height: number }[]): number {
  const slot = others.findIndex((row) => pointerY < row.top + row.height / 2);
  return slot < 0 ? others.length : slot;
}

/** 값을 범위 안으로 맞춘다. 범위가 뒤집혀 있으면(낮은 끝 > 높은 끝) 낮은 끝을 쓴다. */
export const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(Math.max(low, high), value));

/**
 * 스크롤되는 상자에서 줄 하나가 다 보이게 하는 스크롤 위치. 이미 다 보이면 지금 값을 그대로 돌려준다.
 * `rowTop`은 상자 내용 기준의 줄 위쪽 자리다.
 */
export function revealScrollTop(view: { readonly scrollTop: number; readonly height: number }, rowTop: number, rowHeight: number): number {
  if (rowTop < view.scrollTop) return Math.max(0, rowTop);
  if (rowTop + rowHeight > view.scrollTop + view.height) return Math.max(0, rowTop + rowHeight - view.height);
  return view.scrollTop;
}

/** 자동 스크롤 띠의 높이: 목록 위·아래 끝에서 줄 높이의 몇 배 안쪽인가. */
export const SCROLL_BAND_ROWS = 1;
/** 자동 스크롤 속도(초당 줄 수). 띠에 막 들어오면 시작 속도, 테두리에 닿거나 넘으면 최대 속도다. */
export const SCROLL_ROWS_PER_SECOND = { start: 2, max: 6 } as const;

/**
 * 자동 스크롤 속도(초당 px, 위쪽이면 음수). 띠 밖이면 0이다. 띠에 들어오면 초당 약 2줄에서 시작해 깊이 들어갈수록 빨라지고,
 * 테두리에 닿으면 초당 약 6줄이다. 테두리를 넘어 받아 주는 여유(`DROP_SLACK_ROWS`) 안에서는 최대 속도를 유지하고, 그 밖이면 멈춘다.
 */
export function autoScrollSpeed(pointerY: number, list: { readonly top: number; readonly bottom: number }, rowHeight: number): number {
  if (!(rowHeight > 0)) return 0;
  const band = rowHeight * SCROLL_BAND_ROWS;
  const slack = rowHeight * DROP_SLACK_ROWS;
  const speed = (depth: number) => {
    const ratio = Math.min(1, Math.max(0, depth / band));
    return (SCROLL_ROWS_PER_SECOND.start + (SCROLL_ROWS_PER_SECOND.max - SCROLL_ROWS_PER_SECOND.start) * ratio) * rowHeight;
  };
  if (pointerY < list.top + band && pointerY >= list.top - slack) return -speed(list.top + band - pointerY);
  if (pointerY > list.bottom - band && pointerY <= list.bottom + slack) return speed(pointerY - (list.bottom - band));
  return 0;
}

/**
 * 순서 목록(`ReorderList`)의 계산(#632). 화면과 나눠 시험한다. DOM을 읽지 않고 숫자만 받는다.
 *
 * - 「순서 직접 지정」: 1부터 항목 수까지의 정수만 받는다. 빈 값·글자·소수·범위 밖 값은 고쳐 넣지 않고 이유를 돌려준다.
 *   번호 칸과 같은 줄의 [적용]이 하나의 입력 구역이고, 확정 없이 구역 밖으로 나가면 값을 버린다(2026-11-26 팀장 결정).
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
export const ORDER_DISCARDED_TEXT = "Enter나 [적용]을 누르지 않아 순서를 바꾸지 않았습니다.";
export const orderHintText = (count: number): string =>
  `1~${count} 사이의 숫자를 넣고 Enter나 [적용]을 누르세요. 누르지 않고 번호 칸과 [적용] 밖으로 나가면 넣은 값은 버리고 순서는 그대로 둡니다.`;

/**
 * 번호 칸이나 [적용]에서 초점이 나갔을 때 입력 구역을 벗어난 것인가.
 * - `staysInZone`: 초점이 같은 줄의 번호 칸이나 [적용]으로 옮겨 갔다.
 * - `applying`: 그 줄의 [적용]을 누르는 중이다. Safari는 단추를 눌러도 초점이 단추로 가지 않아 초점이 갈 곳 없이 풀리는데, 이것은 벗어남이 아니다.
 */
export const leavesOrderZone = (blur: { readonly staysInZone: boolean; readonly applying: boolean }): boolean => !blur.staysInZone && !blur.applying;

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
 * 띠는 목록 높이의 절반을 넘지 않는다. 줄이 목록 절반보다 높으면 위·아래 띠가 겹쳐 아래쪽에서도 위로 스크롤되기 때문이다.
 */
export function autoScrollSpeed(pointerY: number, list: { readonly top: number; readonly bottom: number }, rowHeight: number): number {
  if (!(rowHeight > 0)) return 0;
  const band = Math.min(rowHeight * SCROLL_BAND_ROWS, Math.max(0, list.bottom - list.top) / 2);
  if (!(band > 0)) return 0;
  const slack = rowHeight * DROP_SLACK_ROWS;
  const speed = (depth: number) => {
    const ratio = Math.min(1, Math.max(0, depth / band));
    return (SCROLL_ROWS_PER_SECOND.start + (SCROLL_ROWS_PER_SECOND.max - SCROLL_ROWS_PER_SECOND.start) * ratio) * rowHeight;
  };
  if (pointerY < list.top + band && pointerY >= list.top - slack) return -speed(list.top + band - pointerY);
  if (pointerY > list.bottom - band && pointerY <= list.bottom + slack) return speed(pointerY - (list.bottom - band));
  return 0;
}

/**
 * 목록이 상자 안에서 스크롤되지 않고 페이지와 함께 길어질 때(창 높이 640px 이하) 페이지를 얼마나 스크롤할지(px, 위쪽이면 음수).
 * 화면 위·아래 끝을 띠로 삼아 `autoScrollSpeed`와 같은 속도로 움직이고, 목록이 그 방향으로 화면 밖에 남아 있는 만큼만 간다.
 * `list`는 화면 기준의 목록 위·아래 자리다.
 */
export function pageScrollStep(
  pointerY: number, list: { readonly top: number; readonly bottom: number }, viewHeight: number, rowHeight: number, seconds: number,
): number {
  if (!(viewHeight > 0) || !(seconds > 0)) return 0;
  const step = autoScrollSpeed(pointerY, { top: 0, bottom: viewHeight }, rowHeight) * seconds;
  if (step < 0) return Math.max(step, Math.min(0, list.top));
  if (step > 0) return Math.min(step, Math.max(0, list.bottom - viewHeight));
  return 0;
}

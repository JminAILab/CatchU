"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { SourceList } from "./publish-sources";
import {
  autoScrollSpeed, clamp, dropSlot, isDropAccepted, movedText, revealScrollTop, orderHintText, parseOrderInput, ORDER_DISCARDED_TEXT, ORDER_UNCHANGED_TEXT,
} from "./reorder";
import styles from "./publications.module.css";

/**
 * 발행 화면과 프리셋 편집 화면이 함께 쓰는 고르기·순서 부품(발행 프리셋 U2 frontend-components 「옮기는 부품」).
 * [더 보기]와 순서 목록(`ReorderList`)이다. 순서 목록은 #632(2026-11-24 팀장 결정)부터 [위로][아래로] 대신 손잡이 드래그와
 * 「순서 직접 지정」(번호 칸)으로 순서를 바꾸고 [빼기]는 그대로다. 순서 계산은 `reorder.ts`에 있다.
 */

/** 목록 아래 [더 보기]. 다음 쪽을 부르는 동안에는 다시 누를 수 없어 같은 목록의 다음 쪽 요청은 한 번에 하나다. */
export function MoreButton({ list, testId, onMore, disabled }: { list: SourceList<unknown>; testId: string; onMore: () => void; disabled: boolean }) {
  if (list.state !== "ready" || list.nextCursor === null) return null;
  return (
    <div className={styles.more}>
      {list.moreState === "error" && <p role="alert">다음 목록을 불러오지 못했습니다.</p>}
      <button type="button" className={styles.secondaryButton} data-testid={testId} disabled={disabled || list.moreState === "loading"} onClick={onMore}>
        {list.moreState === "loading" ? "불러오는 중…" : list.moreState === "error" ? "다음 목록 다시 불러오기" : "더 보기"}
      </button>
    </div>
  );
}

/** 순서 목록의 한 줄. `title`은 번호 칸·[빼기]의 읽히는 이름과 옮긴 뒤 알림에 쓰고, `body`는 줄 안에 그릴 글이다. */
export type ReorderEntry = { key: string; sourceId: string; title: string; body: ReactNode };

export type ReorderListProps = {
  entries: readonly ReorderEntry[];
  /** data-testid 앞붙임(`publish` → `publish-order-input`). 화면마다 시험 이름이 섞이지 않게 한다. */
  testIdPrefix: string;
  /** 목록의 읽히는 이름(「담긴 자료와 순서」, 「고른 프리셋과 순서」). */
  label: string;
  /** 저장·발행하는 중. 손잡이·번호 칸·[빼기]·「순서 직접 지정」을 모두 막고, 끌던 것도 놓을 때 반영하지 않는다. */
  disabled: boolean;
  /** `from` 자리의 줄을 빼서 `to` 자리에 넣는다(0부터). */
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
  /** 마지막 줄을 빼 목록이 비었을 때 초점을 둘 곳(그 자료의 고르기 체크박스). 없으면 초점을 옮기지 않는다. */
  emptyFocus?: (sourceId: string) => HTMLElement | null;
};

type PendingFocus = { kind: "input" | "remove"; key: string } | { kind: "empty"; sourceId: string };

const GRIP_ICON = (
  <svg width="14" height="20" viewBox="0 0 14 20" fill="currentColor" aria-hidden="true">
    <circle cx="4" cy="4" r="1.7" /><circle cx="10" cy="4" r="1.7" /><circle cx="4" cy="10" r="1.7" />
    <circle cx="10" cy="10" r="1.7" /><circle cx="4" cy="16" r="1.7" /><circle cx="10" cy="16" r="1.7" />
  </svg>
);

/**
 * 순서 목록(#632). 손잡이를 끌거나 「순서 직접 지정」의 번호 칸에 자리를 넣어 순서를 바꾸고, [빼기]로 뺀다.
 *
 * - **손잡이 드래그:** 손잡이에서만 끌기가 시작된다(터치도 같다. 손잡이 밖은 평소처럼 스크롤된다). 손잡이는 Tab 순서 밖이고 화면 낭독기에 숨긴다.
 *   끄는 줄이 따라오고 놓을 자리에 선이 보인다. 목록 테두리에서 줄 하나 높이쯤 벗어나 놓은 것까지는 받고, 그보다 멀리서 놓거나 Esc를 누르면
 *   순서를 그대로 두고 알린다. 목록이 넘쳐 스크롤될 때는 위·아래 끝에서 스스로 스크롤한다(속도는 `reorder.ts`).
 * - **순서 직접 지정:** 번호 칸은 Enter로만 확정한다. 틀린 값은 고쳐 넣지 않고 이유를 알린다. Enter 없이 칸을 벗어나면 값을 버리고 알린다
 *   (칸을 지나가기만 해도 순서가 바뀌는 일이 없다).
 * - **초점:** 번호로 옮긴 뒤에는 옮긴 항목의 번호 칸, [빼기] 뒤에는 다음 줄(없으면 앞 줄)의 [빼기], 목록이 비면 `emptyFocus`가 준 곳이다.
 * - 알림 칸(`role="status"`)과 오류 칸(`role="alert"`)은 늘 그려 두어 화면 낭독기가 바뀐 글을 놓치지 않는다.
 */
export function ReorderList(props: ReorderListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const pending = useRef<PendingFocus | null>(null);
  /** 번호로 옮기는 동안 다시 그려지며 나는 blur를 「벗어남」으로 읽지 않게 한다. */
  const committing = useRef(false);
  const latest = useRef(props);
  const stopDrag = useRef<(() => void) | null>(null);
  /** 옮긴 뒤 스크롤 상자 안에 보이게 할 줄. */
  const reveal = useRef<string | null>(null);
  /** 마우스로 눌러 번호 칸에 들어오는 중인가. 눌렀다 떼며 전체 선택이 풀리지 않게 한다. */
  const focusByMouse = useRef(false);
  const [directOn, setDirectOn] = useState(false);
  const [invalidKey, setInvalidKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const hintId = useId();
  const errorId = useId();

  const count = props.entries.length;
  const direct = directOn && count >= 2;
  const prefix = props.testIdPrefix;

  useEffect(() => { latest.current = props; });
  // 끄는 중에 화면을 떠나면 창에 걸어 둔 듣기를 푼다.
  useEffect(() => () => { stopDrag.current?.(); }, []);
  useEffect(() => {
    committing.current = false;
    // 옮긴 줄이 스크롤 상자에 가려 있으면 보이는 곳으로 스크롤한다(끌어서 테두리 밖에 놓았을 때).
    const shown = reveal.current;
    reveal.current = null;
    const scroller = scrollRef.current;
    const moved = shown === null ? undefined : [...(listRef.current?.querySelectorAll<HTMLElement>("[data-reorder-key]") ?? [])].find((element) => element.dataset.reorderKey === shown);
    if (scroller && moved) scroller.scrollTop = revealScrollTop({ scrollTop: scroller.scrollTop, height: scroller.clientHeight }, moved.offsetTop, moved.offsetHeight);
    const target = pending.current;
    pending.current = null;
    if (!target) return;
    if (target.kind === "empty") { latest.current.emptyFocus?.(target.sourceId)?.focus(); return; }
    const row = [...(listRef.current?.querySelectorAll<HTMLElement>("[data-reorder-key]") ?? [])].find((element) => element.dataset.reorderKey === target.key);
    const element = row?.querySelector<HTMLElement>(target.kind === "input" ? "[data-reorder-input]" : "[data-reorder-remove]");
    element?.focus();
  });

  function clearNotes() { setInvalidKey(null); setError(""); }

  function commitNumber(entry: ReorderEntry, index: number, input: HTMLInputElement) {
    if (props.disabled) return;
    const parsed = parseOrderInput(input.value, count);
    if (!parsed.ok) { setInvalidKey(entry.key); setError(parsed.message); setStatus(""); input.select(); return; }
    clearNotes();
    if (parsed.index === index) { setStatus(""); input.value = String(index + 1); return; }
    committing.current = true;
    pending.current = { kind: "input", key: entry.key };
    setStatus(movedText(entry.title, parsed.index));
    props.onMove(index, parsed.index);
  }

  function inputKeyDown(entry: ReorderEntry, index: number, event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    commitNumber(entry, index, event.currentTarget);
  }

  /** Enter 없이 칸을 벗어남: 넣은 값과 오류 표시를 버리고 지금 번호로 되돌린 뒤 알린다. */
  function inputBlur(entry: ReorderEntry, index: number, input: HTMLInputElement) {
    if (committing.current || !input.isConnected) return;
    const current = String(index + 1);
    if (input.value === current && invalidKey !== entry.key) return;
    input.value = current;
    clearNotes();
    setStatus(ORDER_DISCARDED_TEXT);
  }

  function remove(entry: ReorderEntry, index: number) {
    if (props.disabled) return;
    const next = props.entries[index + 1] ?? props.entries[index - 1];
    pending.current = next ? { kind: "remove", key: next.key } : { kind: "empty", sourceId: entry.sourceId };
    clearNotes(); setStatus("");
    props.onRemove(index);
  }

  function toggleDirect() {
    if (props.disabled) return;
    clearNotes();
    if (!direct && props.entries[0]) pending.current = { kind: "input", key: props.entries[0].key };
    setDirectOn(!direct);
  }

  function startDrag(event: ReactPointerEvent<HTMLButtonElement>, from: number) {
    const scroller = scrollRef.current, list = listRef.current, line = lineRef.current;
    const row = event.currentTarget.closest<HTMLElement>("li");
    if (event.button > 0 || props.disabled || !scroller || !list || !line || !row || stopDrag.current) return;
    event.preventDefault();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* 잡을 포인터가 없으면 창의 듣기만으로 따라간다 */ }
    const entry = props.entries[from];
    const rowHeight = row.offsetHeight;
    const startY = event.clientY, startScroll = scroller.scrollTop, startWindowScroll = window.scrollY;
    const minShift = list.offsetTop - row.offsetTop, maxShift = list.offsetTop + list.offsetHeight - rowHeight - row.offsetTop;
    let x = event.clientX, y = event.clientY, slot = from, accepted = true, ended = false, lastTick = event.timeStamp;
    row.dataset.dragging = "true";
    // 끄는 동안에만 글자 선택을 막는다. iOS Safari는 손잡이를 길게 눌러 끌 때 둘레 글자를 선택하고 돋보기·복사 메뉴를 띄운다.
    // 끝나면 원래 값으로 되돌리므로 평소의 본문 선택과 스크롤은 그대로다.
    const root = document.documentElement;
    const rootSelect = { plain: root.style.getPropertyValue("user-select"), webkit: root.style.getPropertyValue("-webkit-user-select") };
    root.style.setProperty("user-select", "none"); root.style.setProperty("-webkit-user-select", "none");
    window.getSelection()?.removeAllRanges();
    const onSelectStart = (e: Event) => e.preventDefault();
    document.addEventListener("selectstart", onSelectStart);
    const others = () => [...list.children].filter((node): node is HTMLElement => node instanceof HTMLElement && node !== row);

    const place = () => {
      const box = scroller.getBoundingClientRect();
      accepted = isDropAccepted({ x, y }, box, rowHeight);
      if (accepted) delete scroller.dataset.outside; else scroller.dataset.outside = "true";
      // 포인터가 상자 테두리를 넘어도(받아 주는 거리 안) 끄는 줄과 놓을 자리 선이 상자에 가려지지 않게, 상자의 보이는 범위 안 자리로 센다.
      // 놓으면 그 선이 가리키던 자리에 들어간다. 끝에 일부만 보이는 줄은 가운데가 보이는 범위 밖이면 그 줄 앞이다.
      const inside = clamp(y, box.top, box.bottom);
      const rects = others().map((node) => node.getBoundingClientRect());
      slot = dropSlot(inside, rects);
      const edge = rects.length === 0 ? null : slot < rects.length ? rects[slot].top - 2 : rects[rects.length - 1].bottom + 1;
      line.style.display = accepted && slot !== from && edge !== null ? "block" : "none";
      const viewTop = scroller.scrollTop, viewBottom = scroller.scrollTop + scroller.clientHeight;
      if (edge !== null) line.style.top = `${clamp(edge - box.top + scroller.scrollTop, viewTop + 1, viewBottom - 4)}px`;
      const shift = inside - startY + (scroller.scrollTop - startScroll) + (window.scrollY - startWindowScroll);
      const low = Math.max(minShift, viewTop - row.offsetTop), high = Math.min(maxShift, viewBottom - rowHeight - row.offsetTop);
      row.style.transform = `translateY(${clamp(shift, low, high)}px)`;
    };
    const tick = () => {
      if (ended) return;
      const now = performance.now();
      const seconds = Math.min(0.25, (now - lastTick) / 1000);
      lastTick = now;
      const box = scroller.getBoundingClientRect();
      if (scroller.scrollHeight > scroller.clientHeight + 1 && isDropAccepted({ x, y }, box, rowHeight)) {
        const max = scroller.scrollHeight - scroller.clientHeight;
        scroller.scrollTop = Math.max(0, Math.min(max, scroller.scrollTop + autoScrollSpeed(y, box, rowHeight) * seconds));
      }
      place();
    };
    const timer = window.setInterval(tick, 16);
    const cleanup = () => {
      ended = true;
      window.clearInterval(timer);
      window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); window.removeEventListener("pointercancel", onCancel);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("selectstart", onSelectStart);
      if (rootSelect.plain) root.style.setProperty("user-select", rootSelect.plain); else root.style.removeProperty("user-select");
      if (rootSelect.webkit) root.style.setProperty("-webkit-user-select", rootSelect.webkit); else root.style.removeProperty("-webkit-user-select");
      delete row.dataset.dragging; delete scroller.dataset.outside;
      row.style.transform = ""; line.style.display = "none";
      stopDrag.current = null;
    };
    const finish = (commit: boolean, at?: PointerEvent) => {
      if (ended) return;
      if (at) { x = at.clientX; y = at.clientY; place(); }
      cleanup();
      setInvalidKey(null); setError("");
      // 끄는 동안 저장·발행이 시작됐으면 순서를 바꾸지 않는다.
      const now = latest.current;
      if (commit && accepted && !now.disabled && slot !== from && now.entries[from]?.key === entry.key) {
        setStatus(movedText(entry.title, slot));
        reveal.current = entry.key;
        now.onMove(from, slot);
        return;
      }
      // 목록에서 멀리 벗어나 놓았거나 Esc로 그만두면 순서를 그대로 두고 그 사실을 알린다. 제자리에 놓은 것은 알리지 않는다.
      setStatus(!commit || !accepted ? ORDER_UNCHANGED_TEXT : "");
    };
    const onMove = (e: PointerEvent) => { x = e.clientX; y = e.clientY; place(); };
    const onUp = (e: PointerEvent) => finish(true, e);
    const onCancel = () => finish(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(false); } };
    window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp); window.addEventListener("pointercancel", onCancel);
    document.addEventListener("keydown", onKey, true);
    stopDrag.current = cleanup;
  }

  return (
    <div className={styles.order}>
      <div ref={scrollRef} className={styles.orderScroll}>
        <ol ref={listRef} className={styles.orderList} aria-label={props.label}>
          {props.entries.map((entry, index) => (
            <li key={entry.key} className={styles.orderRow} data-testid={`${prefix}-selected-item`} data-source-id={entry.sourceId} data-reorder-key={entry.key}>
              <button type="button" className={styles.grip} tabIndex={-1} aria-hidden="true" title="끌어서 순서 바꾸기" data-testid={`${prefix}-order-grip`}
                disabled={props.disabled} onPointerDown={(event) => startDrag(event, index)}>{GRIP_ICON}</button>
              {direct ? (
                // 글자·소수·빈 값도 그대로 받아 알릴 수 있게 숫자 전용 칸(type=number)을 쓰지 않는다. 자리가 바뀌면 칸을 새로 만들어 번호를 맞춘다.
                <input key={`${entry.key}:${index}`} className={styles.orderInput} type="text" inputMode="numeric" autoComplete="off" defaultValue={String(index + 1)}
                  data-testid={`${prefix}-order-input`} data-reorder-input="" disabled={props.disabled}
                  aria-label={`${entry.title} 순서, 1에서 ${count}까지`} aria-describedby={`${hintId} ${errorId}`} aria-invalid={invalidKey === entry.key || undefined}
                  // 어떤 경로로든 새로 초점이 오면 안의 숫자를 전체 선택해, 친 숫자가 원래 숫자 뒤에 붙지 않고 대신하게 한다.
                  onMouseDown={(event) => { focusByMouse.current = document.activeElement !== event.currentTarget; }}
                  onFocus={(event) => event.currentTarget.select()}
                  onMouseUp={(event) => { if (focusByMouse.current) { focusByMouse.current = false; event.preventDefault(); event.currentTarget.select(); } }}
                  onKeyDown={(event) => inputKeyDown(entry, index, event)} onBlur={(event) => inputBlur(entry, index, event.currentTarget)} />
              ) : <span className={styles.orderNumber} aria-hidden="true">{index + 1}</span>}
              <div className={styles.orderBody}>{entry.body}</div>
              <button type="button" className={styles.smallButton} data-testid={`${prefix}-remove`} data-reorder-remove="" disabled={props.disabled}
                aria-label={`${entry.title} 빼기`} onClick={() => remove(entry, index)}>빼기</button>
            </li>
          ))}
        </ol>
        <div ref={lineRef} className={styles.dropLine} aria-hidden="true" />
      </div>
      {count >= 2 && (
        <p className={styles.orderToggle}>
          <button type="button" className={styles.linkButton} data-testid={`${prefix}-order-direct`} aria-pressed={direct} disabled={props.disabled} onClick={toggleDirect}>
            {direct ? "순서 지정 마치기" : "순서 직접 지정"}
          </button>
        </p>
      )}
      <p id={hintId} className={styles.small} hidden={!direct} data-testid={`${prefix}-order-hint`}>{orderHintText(count)}</p>
      <p id={errorId} role="alert" className={styles.flagged} data-testid={`${prefix}-order-error`}>{error}</p>
      <p role="status" className={styles.orderStatus} data-testid={`${prefix}-order-status`}>{status}</p>
    </div>
  );
}

export type PickCheckboxProps = {
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
  /** 이름(굵은 글). */
  title: ReactNode;
  /** 이름 아래 보조 줄(저장소 이름·항목 수 등). 없으면 그리지 않는다. */
  subline?: ReactNode;
  /** 고를 수 없는 이유. 없으면 그리지 않는다. */
  reason?: string | null;
  /** 체크박스에 붙일 속성(`data-testid`·`data-source-id` 등). */
  inputProps: Readonly<Record<`data-${string}`, string>>;
  reasonTestId?: string;
};

/**
 * 고르기 한 줄(#632, 2026-11-24 팀장 결정). 프리셋 편집의 자료 고르기와 발행의 프리셋 고르기가 함께 쓴다.
 * 진짜 체크박스이고 줄 전체를 이름표(`label`)로 감싸 이름·보조 줄·막힌 이유가 함께 읽힌다. Space로만 고르고 Enter로는 고르지 않는다
 * (체크박스의 기본 동작이며, 승인된 조작 기준의 「Enter·Space」는 이 결정으로 바뀌었다).
 */
export function PickCheckbox(props: PickCheckboxProps) {
  const className = props.checked ? styles.pickOn : props.disabled ? styles.pickOff : styles.pick;
  return (
    <label className={className}>
      <input type="checkbox" className={styles.pickBox} checked={props.checked} disabled={props.disabled} onChange={props.onToggle} {...props.inputProps} />
      <span className={styles.pickText}>
        <span className={styles.itemTitle}>{props.title}</span>
        {/* 이름·보조 줄·이유가 붙어 읽히지 않게 화면에 보이지 않는 쉼표로 나눈다. */}
        {props.subline ? <span className={styles.subline}><span className="visually-hidden">, </span>{props.subline}</span> : null}
        {props.reason ? <span className={styles.pickReason}><span className="visually-hidden">, </span><span data-testid={props.reasonTestId}>{props.reason}</span></span> : null}
      </span>
    </label>
  );
}

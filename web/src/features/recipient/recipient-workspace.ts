import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type MouseEvent, type RefObject } from "react";
import { flushSync } from "react-dom";
import type { PublishedSnapshot } from "../publications/publications-api.ts";
import type { JumpPlace, SnapshotJump } from "../publications/snapshot-jump.ts";
import { publishedItemDomId, type SnapshotReturnBar } from "../publications/snapshot-view.tsx";
import { resolveEvidenceTarget, type EvidenceLocation } from "./recipient-slots.ts";

/**
 * 받은 사람 화면의 넓은 화면 좌우 배치와 좁은 화면의 「보던 곳으로 돌아가기」(#615, 2026-11-23·2026-11-25 팀장 결정).
 * 작성자 발행본 상세는 이 파일을 쓰지 않는다. 사본 표시(`snapshot-view.tsx`)와 출처 이동(`snapshot-jump.ts`)에는 선택 값만 더했다.
 *
 * - 1200px 이상: 왼쪽 「발행본 자료」, 오른쪽 위에서부터 AI 요약 → 발행본에 질문하기 → JD 요약. 마크업 순서는 폭과 상관없이
 *   AI 요약 → 발행본 자료 → 발행본에 질문하기 → JD 요약이다(배치는 `recipient.module.css`의 grid가 한다).
 * - 두 칸을 감싼 작업 칸은 화면에 보이는 높이만큼만 차지하고 안쪽에서 스크롤한다(오른쪽 세 구역). 자료 칸은 그 안에서 따로 스크롤한다.
 *   그래서 자료를 끝까지 읽어도 오른쪽의 답이 그대로 보이고, 출처를 누르면 자료 칸만 움직인다.
 * - 1200px 미만: 출처로 옮겨 가면 그 자료 항목 맨 앞에 「보던 곳으로 돌아가기」 줄이 생기고, 누르면 눌렀던 출처 단추가 화면 가운데에 오며 초점도 그 단추로 간다.
 */

/** 좌우로 나누는 기준 폭. `recipient.module.css`의 `@media (min-width: 1200px)`와 같은 값이어야 한다. */
export const WIDE_QUERY = "(min-width: 1200px)";
/** 작업 칸과 화면 위·아래 끝 사이 간격(px). CSS의 12px과 같은 값이다. */
export const EDGE_GAP = 12;

/** 작업 칸 윗변의 화면 좌표. 위쪽 안내가 다 지나가도 화면 위 끝에서 `EDGE_GAP`만큼은 띄운다. */
export const workspaceTop = (rectTop: number): number => Math.round(Math.max(rectTop, EDGE_GAP));

/** 줄·쪽 단위 휠 값을 px로 바꾼다(브라우저마다 단위가 다르다). */
export const wheelPixels = (deltaY: number, deltaMode: number, pageHeight: number): number =>
  deltaMode === 1 ? deltaY * 40 : deltaMode === 2 ? deltaY * pageHeight : deltaY;

export type WheelInput = {
  /** px로 바꾼 휠 값. 양수가 아래다. */
  readonly delta: number;
  /** 작업 칸 윗변의 화면 좌표. */
  readonly workspaceTop: number;
  /** 페이지가 위로 더 올라갈 수 있는지(`scrollY > 0`). */
  readonly pageScrolled: boolean;
  /** 휠을 굴린 칸(자료 칸 또는 작업 칸)의 안쪽 위치. */
  readonly paneTop: number;
  readonly paneMax: number;
};

/**
 * 칸 위에서 휠을 굴릴 때 페이지를 옮길 거리(px). 0이면 브라우저가 칸 안쪽을 굴리게 둔다.
 * 내릴 때는 위쪽 안내가 지나갈 때까지 페이지를 먼저 내리고 그다음 칸 안쪽을 굴린다. 올릴 때는 칸 안쪽이 맨 위에 닿은 뒤 페이지를 올린다.
 * 칸 안쪽 스크롤이 페이지로 이어지지 않게 막아 둔 것(`overscroll-behavior: contain`)을 보완한다. 터치에는 적용되지 않는다.
 */
export function pageWheelDistance({ delta, workspaceTop: top, pageScrolled, paneTop, paneMax }: WheelInput): number {
  if (delta > 0 && top > EDGE_GAP + 1) return Math.min(delta, top - EDGE_GAP);
  if (delta < 0 && pageScrolled) return paneTop <= 0 ? delta : 0;
  if (delta > 0 && paneTop >= paneMax - 1) return delta;
  return 0;
}

export type PaneBox = { readonly top: number; readonly bottom: number };

/**
 * 넓은 화면에서 출처로 옮길 때 자료 칸 안쪽을 더 내릴 거리(px, 음수면 올린다). 페이지와 오른쪽 칸은 움직이지 않는다.
 * 강조 글이 있으면(`centered`) 자료 칸 가운데 화면에 실제로 보이는 부분의 가운데쯤에, 없으면 항목 시작이 칸 위쪽에 오게 한다.
 */
export function paneScrollDistance(pane: PaneBox, anchor: { readonly top: number; readonly height: number }, viewportHeight: number, centered: boolean): number {
  const visibleTop = Math.max(pane.top, 0);
  const visibleBottom = Math.min(pane.bottom, viewportHeight);
  const lead = centered ? Math.max(24, (visibleBottom - visibleTop - anchor.height) / 2) : 22;
  return Math.round(anchor.top - visibleTop - lead);
}

/** `from`에서 `pane`까지 올라가며, 그 방향으로 더 굴릴 수 있는 안쪽 스크롤 상자(질문 입력 칸 등)가 있는지 본다. 있으면 휠을 건드리지 않는다. */
function hasInnerScroller(from: EventTarget | null, pane: HTMLElement, delta: number): boolean {
  for (let node = from instanceof Element ? from : null; node !== null && node !== pane; node = node.parentElement) {
    if (!(node instanceof HTMLElement) || node.scrollHeight <= node.clientHeight + 1) continue;
    const overflow = getComputedStyle(node).overflowY;
    if (overflow !== "auto" && overflow !== "scroll") continue;
    if (delta < 0 ? node.scrollTop > 0 : node.scrollTop < node.scrollHeight - node.clientHeight - 1) return true;
  }
  return false;
}

const isWide = (): boolean => typeof window !== "undefined" && window.matchMedia(WIDE_QUERY).matches;

export type WorkspaceLayout = {
  /** 두 칸 위의 안내 묶음(제목·안내·Claude 연결·발행 시각). 높이가 바뀌면 작업 칸 높이를 다시 맞춘다. */
  readonly introRef: RefObject<HTMLDivElement | null>;
  /** 두 칸을 감싼 작업 칸. 넓은 화면에서 오른쪽 세 구역이 이 안에서 스크롤한다. */
  readonly workspaceRef: RefObject<HTMLDivElement | null>;
  /** 왼쪽 자료 칸. */
  readonly materialsRef: RefObject<HTMLDivElement | null>;
  /** 넓은 화면에서 출처 이동을 자료 칸 안쪽 스크롤로만 한다(`useSnapshotJump`의 `place`). 좁은 화면이면 false를 돌려주어 기본 동작을 쓴다. */
  readonly place: JumpPlace;
};

/**
 * 넓은 화면의 작업 칸 높이 맞추기와 휠 순서(#615 화면 초안 v9.4, 2026-11-23 팀장 결정 2번).
 * 작업 칸 윗변의 화면 좌표를 CSS 변수 `--ws-top`으로 넘기면 CSS가 칸 높이를 「지금 화면에 보이는 높이」로 정한다.
 * 위쪽 안내가 보이는 동안에도 칸의 아래 끝(JD 요약, 마지막 자료, 붙은 「접기」 줄)이 화면 안에 있다.
 * `ready`는 판정 통과 화면이 그려졌는지다. 그 화면이 아니면 아무것도 하지 않는다.
 */
export function useWorkspaceLayout(ready: boolean): WorkspaceLayout {
  const introRef = useRef<HTMLDivElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const materialsRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const workspace = workspaceRef.current;
    if (!ready || !workspace) return;
    const sync = () => {
      if (!isWide()) { workspace.style.removeProperty("--ws-top"); return; }
      workspace.style.setProperty("--ws-top", `${workspaceTop(workspace.getBoundingClientRect().top)}px`);
    };
    const onWheel = (event: WheelEvent) => {
      if (!isWide() || event.ctrlKey || event.deltaY === 0) return;
      const delta = wheelPixels(event.deltaY, event.deltaMode, window.innerHeight);
      const materials = materialsRef.current;
      const pane = materials !== null && event.target instanceof Node && materials.contains(event.target) ? materials : workspace;
      if (hasInnerScroller(event.target, pane, delta)) return;
      const distance = pageWheelDistance({
        delta, workspaceTop: workspace.getBoundingClientRect().top, pageScrolled: window.scrollY > 0,
        paneTop: pane.scrollTop, paneMax: pane.scrollHeight - pane.clientHeight,
      });
      if (distance === 0) return;
      const before = window.scrollY;
      window.scrollBy(0, distance);
      // 페이지가 실제로 움직였을 때만 칸 안쪽 스크롤을 막는다. 페이지 끝이라 움직이지 않았으면 브라우저 기본 동작에 맡긴다.
      if (window.scrollY !== before) event.preventDefault();
    };
    sync();
    window.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    workspace.addEventListener("wheel", onWheel, { passive: false });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(sync);
    if (introRef.current) observer?.observe(introRef.current);
    return () => {
      window.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      workspace.removeEventListener("wheel", onWheel);
      observer?.disconnect();
      workspace.style.removeProperty("--ws-top");
    };
  }, [ready]);

  const place = useCallback<JumpPlace>((anchor, centered) => {
    const pane = materialsRef.current;
    if (!isWide() || pane === null) return false;
    const box = pane.getBoundingClientRect();
    const rect = anchor.getBoundingClientRect();
    pane.scrollTop += paneScrollDistance({ top: box.top, bottom: box.bottom }, { top: rect.top, height: centered ? rect.height : 0 }, window.innerHeight, centered);
    return true;
  }, []);

  return { introRef, workspaceRef, materialsRef, place };
}

/** 돌아갈 자리. `button`은 눌렀던 출처 단추, `slot`은 그 단추가 든 구역(AI 요약·발행본에 질문하기·JD 요약)이다. */
type Origin = { readonly button: HTMLElement; readonly slot: HTMLElement };

/** 출처 단추가 든 구역 표시(`recipient-view.tsx`의 2·3·4번 자리). 자료 칸 안의 단추는 출처 단추가 아니다. */
const SLOT_SELECTOR = "[data-slot]";
const RETURN_BAR_SELECTOR = '[data-testid="snapshot-return-bar"]';
/** 사람이 다시 입력하면 폭 바뀜 뒤의 자리 맞추기를 그만둔다. */
const USER_INPUTS = ["keydown", "pointerdown", "wheel", "touchstart"] as const;

export type EvidenceReturn = {
  /** 작업 칸에 다는 클릭 지켜보기. 패널을 고치지 않고 누른 출처 단추를 기억한다(키보드 Enter·Space도 click으로 온다). */
  readonly onClickCapture: (event: MouseEvent<HTMLElement>) => void;
  /** 패널에 넘기는 `showEvidence`. 누른 단추를 돌아갈 자리로 적은 뒤 원래 출처 이동을 부른다. */
  readonly showEvidence: (location: EvidenceLocation) => void;
  /** 사본 표시에 넘기는 돌아가기 줄. 좁은 화면에서 돌아갈 자리가 있을 때만 값이 있다. */
  readonly returnBar: SnapshotReturnBar | null;
};

/**
 * 좁은 화면에서 출처로 옮겨 간 뒤 돌아오기(#615, 2026-11-25 팀장 결정 1~5번).
 * - 마지막 출처 이동 한 번만 기억한다. 돌아가지 않고 다른 출처를 누르면 돌아가기 줄은 새 항목으로 옮겨 가고 그 출처 단추로 돌아간다.
 * - 돌아가면: 초점을 눌렀던 출처 단추에 두고, 돌아가기 줄을 없앤 뒤(자료가 그만큼 짧아진 자리로) 그 단추를 화면 가운데에 둔다. 열린 탭·펼친 글·강조는 그대로다.
 *   그 단추가 다시 그려져 없으면 그 구역 맨 위로 가고 초점은 그 구역에 둔다.
 * - 돌아가지 않으면 줄은 그 항목에 남는다(닫는 단추 없음).
 * - 폭이 1200px 이상으로 넓어지면 줄을 그리지 않는다. 줄은 CSS로 숨기지 않고 여기서 그리지 않게 한다: CSS로 숨기면 폭 바뀜을 알기 전에
 *   단추가 초점을 잃어 초점이 페이지 본문으로 빠진다(2026-11-25 팀장 댓글). 폭이 바뀐 것을 안 그 자리에서 초점을 자료 항목으로 넘긴 뒤 줄을 지운다.
 *   초점이 그 항목이나 돌아가기 단추에 있었을 때만 새 배치에서 강조 글이 다시 보이게 자리를 맞추고, 다시 좁아지면 줄이 다시 보인다.
 */
export function useEvidenceReturn(snapshot: PublishedSnapshot | null, jump: SnapshotJump): EvidenceReturn {
  const pressed = useRef<Origin | null>(null);
  const origin = useRef<Origin | null>(null);
  const [returnable, setReturnable] = useState(false);
  const itemId = snapshot !== null && returnable && jump.target !== null ? jump.target.publishedItemId : null;
  const { showEvidence: jumpTo, again } = jump;

  const onClickCapture = useCallback((event: MouseEvent<HTMLElement>) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLElement>("button") : null;
    const slot = button?.closest<HTMLElement>(SLOT_SELECTOR) ?? null;
    pressed.current = button !== null && slot !== null ? { button, slot } : null;
  }, []);

  const showEvidence = useCallback((location: EvidenceLocation) => {
    const from = pressed.current;
    pressed.current = null;
    // 가리킨 항목이 사본에 없으면 옮겨 가지 않으므로 돌아갈 자리도 바꾸지 않는다.
    if (from !== null && snapshot !== null && resolveEvidenceTarget(snapshot, location) !== null) {
      origin.current = from;
      setReturnable(true);
    }
    jumpTo(location);
  }, [snapshot, jumpTo]);

  // 폭이 기준을 넘나들 때 할 일. 그리기 값(`wide`)이 바뀌기 전에 불려, 돌아가기 줄이 지워지기 전에 초점을 넘길 수 있다.
  const settling = useRef<() => void>(() => {});
  const onWidth = useRef<(nowWide: boolean) => void>(() => {});
  useLayoutEffect(() => {
    onWidth.current = (nowWide) => {
      const item = itemId === null ? null : document.getElementById(publishedItemDomId(itemId));
      const active = document.activeElement;
      const onBar = item !== null && active instanceof Element && item.contains(active) && active.closest(RETURN_BAR_SELECTOR) !== null;
      // 줄이 지워지기 전에, 초점이 아직 돌아가기 단추에 있을 때 항목으로 넘긴다.
      if (onBar && nowWide) item.focus({ preventScroll: true });
      if (item === null || !(onBar || active === item)) return;
      // 폭이 바뀐 뒤 접는 글의 줄 수가 다시 세어져 자리가 한 번 더 달라진다. 다음 그리기와 0.6초 뒤에 맞추고, 사람이 그 전에 입력하면 그만둔다.
      const settle = () => {
        if (document.activeElement !== item) return;
        const from = origin.current?.button;
        if (nowWide && from?.isConnected) from.scrollIntoView({ block: "nearest" });
        again();
      };
      settling.current();
      const frame = requestAnimationFrame(settle);
      const timer = setTimeout(settle, 600);
      settling.current = () => { cancelAnimationFrame(frame); clearTimeout(timer); };
    };
  }, [itemId, again]);
  useEffect(() => {
    const cancel = () => settling.current();
    for (const type of USER_INPUTS) window.addEventListener(type, cancel, { capture: true, passive: true });
    return () => {
      cancel();
      for (const type of USER_INPUTS) window.removeEventListener(type, cancel, { capture: true });
    };
  }, []);
  const subscribeWide = useCallback((notify: () => void) => {
    const query = window.matchMedia(WIDE_QUERY);
    const onChange = () => { onWidth.current(query.matches); notify(); };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  const wide = useSyncExternalStore(subscribeWide, isWide, () => false);

  const onReturn = useCallback(() => {
    const from = origin.current;
    const there = from !== null && from.button.isConnected;
    const to = from === null ? null : there ? from.button : from.slot.isConnected ? from.slot : null;
    // 구역은 평소 초점을 받지 않는다. 단추가 없어진 드문 경우에만 받을 수 있게 한다.
    if (to !== null && !there && !to.hasAttribute("tabindex")) to.setAttribute("tabindex", "-1");
    to?.focus({ preventScroll: true });
    flushSync(() => setReturnable(false));
    to?.scrollIntoView({ block: there ? "center" : "start" });
  }, []);

  useEffect(() => {
    if (snapshot === null) origin.current = null;
  }, [snapshot]);

  return { onClickCapture, showEvidence, returnBar: itemId !== null && !wide ? { publishedItemId: itemId, onReturn } : null };
}

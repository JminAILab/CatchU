"use client";

import { createContext, useContext, useId, useLayoutEffect, useRef, useState, type ReactNode, type Ref, type UIEventHandler } from "react";
import styles from "./publications.module.css";

/**
 * 발행본 자료의 긴 글 접기(#607). 글자를 자르지 않고 보이는 높이만 줄인다.
 * 근거 강조는 저장된 글의 글자 위치로 세므로, 글을 잘라 그리면 강조가 어긋난다(2026-11-19 팀장 댓글).
 * 받은 사람 화면과 작성자 발행본 상세가 같은 사본 표시(`snapshot-view.tsx`·`published-pdf-item.tsx`)로 이 부품을 쓴다.
 */

/** `over`줄을 넘으면 `show`줄만 보인다. 기준 이하면 접지 않고 단추도 없다. */
export type FoldLimit = { readonly over: number; readonly show: number };
/** AI 설명 초안·기록에서 확인한 내용·PDF 쪽 글(#607 2026-11-19 팀장 결정). */
export const FOLD_GENERATED: FoldLimit = { over: 12, show: 6 };
/** 지원자가 쓴 글: 작성자 설명·텍스트 자료 본문(같은 결정). */
export const FOLD_AUTHORED: FoldLimit = { over: 18, show: 12 };

/**
 * 글 덩어리 하나의 그려진 높이를 줄 높이로 나눈 줄 수. 실제 폭에서 줄이 바뀐 결과를 센다.
 * 브라우저가 높이를 소수나 정수로 주므로 반올림한다. 줄 높이를 알 수 없으면 0(접지 않는다).
 */
export const countLines = (contentHeight: number, lineHeight: number): number =>
  Number.isFinite(lineHeight) && lineHeight > 0 && Number.isFinite(contentHeight) ? Math.round(contentHeight / lineHeight) : 0;

export const foldNeeded = (lines: number, limit: FoldLimit): boolean => lines > limit.over;

/** 줄 수에 드는 글 덩어리: 문단과 목록 항목. 칸 제목(h5)과 덩어리 사이 여백은 들지 않는다. */
export const FOLD_TEXT_SELECTOR = "p, li";

/** 글 덩어리 하나의 자리. `top`은 접는 상자 맨 위에서 덩어리 맨 위까지의 거리(px)다. */
export type TextBlock = { readonly top: number; readonly height: number; readonly lineHeight: number };
export type FoldMeasure = { readonly lines: number; readonly needed: boolean; readonly height: number };

/**
 * 본문 글줄만 세어 접을지 정하고, 접을 때의 높이를 낸다(#607 보완: 칸 제목·여백을 줄 수에 넣지 않는다).
 * 줄 수는 덩어리마다 센 글줄의 합이다. 접힌 높이는 `show`번째 글줄의 아래 끝까지라서, 그 위에 있는 칸 제목과 여백은 높이에 그대로 들어가고
 * 보이는 글줄은 정확히 `show`줄이다. 접지 않으면 높이는 0이다.
 */
export function measureFold(blocks: readonly TextBlock[], limit: FoldLimit): FoldMeasure {
  let lines = 0;
  let height = 0;
  for (const block of blocks) {
    const count = countLines(block.height, block.lineHeight);
    if (lines < limit.show && lines + count >= limit.show) height = block.top + (limit.show - lines) * block.lineHeight;
    lines += count;
  }
  const needed = foldNeeded(lines, limit);
  return { lines, needed, height: needed ? height : 0 };
}

/**
 * 접는 글이 든 영역이 지금 화면에 보이는지(#629 프리셋 탭). 열리지 않은 탭의 패널은 `hidden`이라 그 안의 글은 높이가 0이고 줄 수를 셀 수 없다.
 * 탭을 그리는 쪽(`snapshot-view.tsx`)이 패널마다 열림 여부를 넘기면, 값이 참으로 바뀌는 그리기 차례에 `FoldText`가 줄 수를 다시 센다.
 * 넘기지 않으면 늘 보이는 것으로 본다.
 */
export const FoldVisibleContext = createContext(true);

/**
 * 다시 잰 결과 단추가 없어질 때 초점을 글 상자로 넘길지(#615 화면 초안의 초점 인계, 2026-11-23 팀장 결정으로 이 부품에 넣음).
 * 단추가 있었고(`hadButton`) 이제 접을 만큼 길지 않으며 초점이 그 단추에 있을 때만이다. 단추가 다시 생겨도 초점을 되돌리지 않는다.
 * 넘기지 않으면 단추가 화면에서 빠지면서 초점이 문서 맨 위로 떨어져, 다음 Tab이 머리글부터 다시 시작한다.
 */
export const foldFocusHandoff = (hadButton: boolean, needed: boolean, buttonFocused: boolean): boolean => hadButton && !needed && buttonFocused;

/** 사람이 마지막으로 접고 편 상태와 그때 이 글을 가리키던 강조. 처음에는 접혀 있다. */
export type FoldToggle = { readonly open: boolean; readonly at: object | null };
export const INITIAL_FOLD_TOGGLE: FoldToggle = { open: false, at: null };

/**
 * 글이 펼쳐져 있는지. 「근거 자세히 보기」(#488 `evidenceDetailsOpen`)와 같은 규칙이다.
 * 사람이 접고 편 뒤로 새 강조가 이 글을 가리키면 펼치고, 아니면 사람이 고른 상태를 따른다.
 * 강조 객체는 출처 단추를 누를 때마다 새로 만들어지므로 다시 접은 뒤 같은 출처를 눌러도 다시 펼친다.
 * 사람이 펼쳐 둔 글은 강조가 다른 곳으로 가도 접지 않는다. 그리는 그 차례에 정해지므로 화면이 `<mark>`로 옮길 때 이미 펼쳐져 있다.
 */
export const foldOpen = (toggle: FoldToggle, reveal: object | null): boolean =>
  reveal !== null && toggle.at !== reveal ? true : toggle.open;

/**
 * 접는 틀의 모양. 단추는 접을 만큼 길 때만 있고, `aria-expanded`와 글자(전체 보기 / 접기)로 상태를 알린다.
 * `label`은 화면에 보이지 않고 화면 낭독기가 어느 글의 단추인지 읽는 데만 쓴다.
 * 펼친 글의 단추에 키보드 초점이 있는 동안에는 단추 줄이 화면 아래쪽에 붙는다(CSS). 긴 글을 펼치면 단추가 글 끝으로 내려가 화면 밖에 놓이는데,
 * 화면을 옮기지 않고(읽던 자리 그대로) 초점을 받은 단추가 보이게 하려는 것이다. 초점이 떠나거나 글 끝이 화면에 들어오면 제자리에 놓인다.
 * 글 상자는 `tabIndex={-1}`이라 Tab 순서에는 들지 않고, 단추가 없어질 때 초점을 넘겨받는 자리로만 쓴다.
 */
export function FoldFrame({ id, needed, open, maxHeight, label, onToggle, bodyRef, buttonRef, onBodyScroll, children }: {
  id: string;
  needed: boolean;
  open: boolean;
  /** 접힌 높이(px). 접을 때만 쓴다. */
  maxHeight: number;
  label: string;
  onToggle?: () => void;
  bodyRef?: Ref<HTMLDivElement>;
  buttonRef?: Ref<HTMLButtonElement>;
  onBodyScroll?: UIEventHandler<HTMLDivElement>;
  children: ReactNode;
}) {
  const folded = needed && !open;
  return (
    <div className={styles.fold} data-testid="snapshot-fold" data-folded={folded || undefined}>
      <div id={id} ref={bodyRef} className={styles.foldBody} tabIndex={-1} style={folded ? { maxHeight } : undefined} onScroll={onBodyScroll}>
        {children}
      </div>
      {needed && (
        <div className={styles.foldBar} data-open={open || undefined}>
          <button ref={buttonRef} type="button" className={styles.foldButton} aria-expanded={open} aria-controls={id} data-testid="snapshot-fold-toggle"
            onClick={onToggle}>
            {open ? "접기" : "전체 보기"}<span className="visually-hidden"> ({label})</span>
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * 긴 글을 접는다. 줄 수는 그려진 뒤 화면에 칠하기 전에 본문 글줄(문단·목록 항목)만 재고, 폭이 바뀌어 줄바꿈이 달라지면(`ResizeObserver`) 다시 잰다.
 * 재기 전(서버에서 그린 글 포함)에는 접지 않는다. `reveal`은 이 글을 가리키는 강조이고, 가리키지 않으면 null이다.
 * 열리지 않은 탭 안(`FoldVisibleContext`가 거짓)에서는 높이가 0이라 재지 않고 앞서 잰 판정을 그대로 두며, 탭이 열리는 그리기 차례에 화면에 칠하기 전에 다시 잰다(#629).
 * 폭이 넓어져 접을 만큼 길지 않게 되면 단추가 없어진다. 그때 초점이 그 단추에 있었으면 단추가 빠지기 전에 글 상자로 넘긴다(`foldFocusHandoff`).
 * `id`는 단추가 가리키는 글 상자의 id다. 사본의 항목 id로 만들어 넘기면 그리는 자리와 상관없이 같은 값이고, 넘기지 않으면 React가 만든다.
 */
export function FoldText({ id, limit, reveal = null, label, children }: {
  id?: string;
  limit: FoldLimit;
  reveal?: object | null;
  label: string;
  children: ReactNode;
}) {
  const generatedId = useId();
  const visible = useContext(FoldVisibleContext);
  const body = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [measured, setMeasured] = useState({ needed: false, height: 0 });
  const [toggle, setToggle] = useState<FoldToggle>(INITIAL_FOLD_TOGGLE);
  const open = foldOpen(toggle, reveal);
  // 접고 편 결과가 그려진 바로 뒤(화면에 칠하기 전)에 할 화면 옮기기. 다음 그리기 차례를 기다리는 방식은 가려진 탭에서 돌지 않는다.
  const afterToggle = useRef<(() => void) | null>(null);
  // 접힐 때마다 글 상자 안쪽을 맨 위로 되돌린다. 넘치는 글은 접힌 동안에만 가리므로(PR #633 리뷰) 펼친 동안에는 상자가 안쪽으로 밀리지 않는데,
  // 접힌 채 밀렸던 위치를 브라우저가 기억했다가 다시 접힐 때 되살리면 첫 줄들이 아니라 뒷부분이 보인다. 아래 화면 옮기기보다 먼저 한다.
  const folded = measured.needed && !open;
  useLayoutEffect(() => {
    if (folded && body.current) body.current.scrollTop = 0;
  }, [folded]);
  useLayoutEffect(() => {
    const run = afterToggle.current;
    afterToggle.current = null;
    run?.();
  }, [open]);

  useLayoutEffect(() => {
    const element = body.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      // 숨긴 탭 안에서는 상자가 그려지지 않아 높이가 모두 0이다. 0줄로 세어 판정을 지우지 않고, 탭이 열릴 때 다시 잰다.
      if (element.getClientRects().length === 0) return;
      // 접힌 동안에도 가려진 덩어리의 자리와 높이는 그대로 잡힌다. 상자 안쪽이 밀려 있어도 맨 위 기준이 되게 scrollTop을 더한다.
      const origin = element.getBoundingClientRect().top - element.scrollTop;
      const found = element.querySelectorAll<HTMLElement>(FOLD_TEXT_SELECTOR);
      const blocks = (found.length > 0 ? [...found] : [element]).map((block) => {
        const rect = block.getBoundingClientRect();
        return { top: rect.top - origin, height: rect.height, lineHeight: Number.parseFloat(getComputedStyle(block).lineHeight) };
      });
      const { needed, height } = measureFold(blocks, limit);
      // 단추가 없어질 참이고 초점이 그 단추에 있으면, 단추가 화면에서 빠지기 전에 글 상자로 넘긴다. 화면은 옮기지 않는다.
      if (foldFocusHandoff(button.current !== null, needed, document.activeElement === button.current)) element.focus({ preventScroll: true });
      setMeasured((previous) => (previous.needed === needed && previous.height === height ? previous : { needed, height }));
    };
    // 처음 한 번과 탭이 열릴 때(`visible`)는 화면에 칠하기 전에 바로 잰다. ResizeObserver의 알림은 그린 뒤에 오므로,
    // 그것만 기다리면 접히지 않은 채 한 번 보이고 출처로 옮긴 자리도 접힌 뒤 어긋난다. 브라우저 창이 가려져 있으면 알림이 더 늦다.
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [limit, visible]);

  return (
    <FoldFrame id={id ?? generatedId} needed={measured.needed} open={open} maxHeight={measured.height} label={label} bodyRef={body} buttonRef={button}
      onToggle={() => {
        // 긴 글 아래쪽에서 접으면 글이 화면 위로 사라지므로, 접은 글이 보이는 자리로 필요한 만큼만 옮긴다.
        if (open) afterToggle.current = () => body.current?.parentElement?.scrollIntoView({ block: "nearest" });
        setToggle({ open: !open, at: reveal });
      }}
      onBodyScroll={(event) => {
        // 접힌 글 안의 링크로 초점이 가거나 브라우저 찾기가 가려진 줄을 가리키면 상자 안쪽이 밀린다. 가려진 채 두지 않고 펼친다.
        if (measured.needed && !open && event.currentTarget.scrollTop > 0) {
          const box = event.currentTarget;
          box.scrollTop = 0;
          // 펼치면 초점을 받은 링크가 화면 아래로 밀려날 수 있다. 펼친 뒤 그 링크가 보이는 자리로 필요한 만큼만 옮긴다.
          afterToggle.current = () => {
            const focused = document.activeElement;
            if (focused instanceof HTMLElement && box.contains(focused)) focused.scrollIntoView({ block: "nearest" });
          };
          setToggle({ open: true, at: reveal });
        }
      }}>
      {children}
    </FoldFrame>
  );
}

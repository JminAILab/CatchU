"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { SourceList } from "./publish-sources";
import styles from "./publications.module.css";

/**
 * 발행 화면과 프리셋 편집 화면이 함께 쓰는 고르기·순서 부품(발행 프리셋 U2 frontend-components 「옮기는 부품」).
 * 지금 발행 화면의 [더 보기]와 「고른 항목과 순서」의 [위로][아래로][빼기]를 옮겨 왔다(interaction-spec ReorderList).
 * 모양은 `publications.module.css` 그대로다.
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

/** 순서 목록의 한 줄. `title`은 순서 단추의 읽히는 이름(「(이름) 위로」)에 쓰고, `body`는 줄 안에 그릴 글이다. */
export type ReorderEntry = { key: string; sourceId: string; title: string; body: ReactNode };

export type ReorderListProps = {
  entries: readonly ReorderEntry[];
  /** data-testid 앞붙임(`publish` → `publish-move-up`). 화면마다 시험 이름이 섞이지 않게 한다. */
  testIdPrefix: string;
  disabled: boolean;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onRemove: (index: number) => void;
};

type Pending = { key: string; action: "up" | "down" };

/**
 * [위로][아래로][빼기] 순서 목록(interaction-spec ReorderList). 첫 줄 [위로]와 끝 줄 [아래로]는 막힌다.
 * 옮긴 뒤 초점은 옮긴 항목의 같은 단추에 남는다. 끝에 닿아 그 단추가 막히면 같은 항목의 다른 순서 단추로 둔다.
 */
export function ReorderList(props: ReorderListProps) {
  const listRef = useRef<HTMLOListElement>(null);
  const pending = useRef<Pending | null>(null);
  useEffect(() => {
    const target = pending.current;
    pending.current = null;
    if (!target || !listRef.current) return;
    const row = [...listRef.current.querySelectorAll<HTMLElement>("[data-reorder-key]")].find((element) => element.dataset.reorderKey === target.key);
    const same = row?.querySelector<HTMLButtonElement>(`[data-reorder-action="${target.action}"]`);
    const other = row?.querySelector<HTMLButtonElement>(`[data-reorder-action="${target.action === "up" ? "down" : "up"}"]`);
    (same && !same.disabled ? same : other && !other.disabled ? other : null)?.focus();
  });
  const prefix = props.testIdPrefix;
  const last = props.entries.length - 1;
  return (
    <ol ref={listRef} className={styles.selectedItems}>
      {props.entries.map((entry, index) => (
        <li key={entry.key} className={styles.selectedItem} data-testid={`${prefix}-selected-item`} data-source-id={entry.sourceId} data-reorder-key={entry.key}>
          <div>{entry.body}</div>
          <div className={styles.rowActions}>
            <button type="button" className={styles.secondaryButton} data-testid={`${prefix}-move-up`} data-reorder-action="up"
              disabled={props.disabled || index === 0} aria-label={`${entry.title} 위로`}
              onClick={() => { pending.current = { key: entry.key, action: "up" }; props.onMoveUp(index); }}>위로</button>
            <button type="button" className={styles.secondaryButton} data-testid={`${prefix}-move-down`} data-reorder-action="down"
              disabled={props.disabled || index === last} aria-label={`${entry.title} 아래로`}
              onClick={() => { pending.current = { key: entry.key, action: "down" }; props.onMoveDown(index); }}>아래로</button>
            <button type="button" className={styles.secondaryButton} data-testid={`${prefix}-remove`} disabled={props.disabled}
              aria-label={`${entry.title} 빼기`} onClick={() => props.onRemove(index)}>빼기</button>
          </div>
        </li>
      ))}
    </ol>
  );
}

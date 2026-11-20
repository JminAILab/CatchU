"use client";

import { useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import styles from "./tab-strip.module.css";

/**
 * 탭 줄과 탭마다의 영역(발행 프리셋 U3 BR1.1~BR1.5, 다듬은 화면 interaction-spec TabStrip). 받은 사람 화면·작성자 발행본 상세의
 * 「발행본 자료」와 텍스트 자료 화면의 「자료 종류」가 함께 쓴다.
 *
 * - 탭 줄 `tablist`(이름 `label`), 탭 `tab`(`aria-selected`·`aria-controls`), 탭마다 `tabpanel`(`aria-labelledby`). id는
 *   `${idPrefix}-tab-${id}`·`${idPrefix}-panel-${id}`이고 탭 이름을 넣지 않는다(NFR3.2).
 * - 열린 탭만 `tabIndex=0`이고 나머지는 -1이다. 패널은 늘 `tabIndex=0`이라 안에 초점 요소가 없어도 다시 Tab이면 열린 패널로 들어간다.
 * - 왼쪽·오른쪽 화살표(끝에서 돈다)·Home·End는 그 탭으로 바꾸기를 요청하고 바뀌었을 때만 초점을 옮긴다. Enter·Space·누름은 바꾸기를 요청한다.
 * - `onChange`는 interaction-spec의 `(id) => void`에서 `boolean | void`로 넓혔다(U3 NFR 설계 Q1 A). `false`만 거절이고,
 *   돌려주는 값이 없거나(`undefined`) `true`면 바뀐 것으로 본다. 거절하면 탭·초점이 그대로다.
 * - `keepInactive`가 true면 열리지 않은 패널도 내용을 그린 채 `hidden`으로 숨겨, 탭을 오가도 패널 안 상태(PDF 뷰어 등)가 남는다.
 *   false면 열리지 않은 패널은 빈 채로 `hidden`이다. 패널에는 `display`를 정하는 클래스를 붙이지 않는다(`hidden`이 덮이지 않게).
 * - 탭 이름은 글자로만 그린다. `truncateLabels`면 한 탭이 최대 폭(16em)을 넘을 때 CSS로 뒤를 「…」로 줄이고 글자는 자르지 않는다.
 */

export type TabItem = { readonly id: string; readonly label: string };
/** 바꾸기 요청. `false`만 거절이다. */
export type TabChange = (id: string) => boolean | void;

export type TabStripProps = {
  tabs: readonly TabItem[];
  active: string;
  onChange: TabChange;
  /** 탭 줄 이름(예: 「발행본 자료」, 「자료 종류」). */
  label: string;
  /** 같은 화면의 다른 탭 줄과 화면 id가 겹치지 않게 하는 머리 글. */
  idPrefix: string;
  /** 탭 id마다의 패널 내용. */
  panels: Readonly<Record<string, ReactNode>>;
  /** 열리지 않은 패널도 내용을 그려 둘지. 기본 false. */
  keepInactive?: boolean;
  /** 탭 단추의 `data-testid` 머리 글. 주면 `${tabTestId}-${id}`다. */
  tabTestId?: string;
  /** 탭 이름을 최대 폭에서 말줄임할지. 기본 false. */
  truncateLabels?: boolean;
};

/** `onChange`의 결과를 바뀜으로 읽는다. `false`만 거절이다. */
export const isTabAccepted = (result: boolean | void): boolean => result !== false;

/** 키에 따라 갈 탭. 화살표는 끝에서 돌고, 다루지 않는 키면 null이다. */
export function tabForKey(ids: readonly string[], from: string, key: string): string | null {
  if (ids.length === 0) return null;
  const at = Math.max(ids.indexOf(from), 0);
  switch (key) {
    case "ArrowRight": return ids[(at + 1) % ids.length];
    case "ArrowLeft": return ids[(at - 1 + ids.length) % ids.length];
    case "Home": return ids[0];
    case "End": return ids[ids.length - 1];
    default: return null;
  }
}

/** 키 하나를 처리한 결과. `handled`면 기본 동작(스크롤)을 막고, `focus`가 있으면 그 탭으로 초점을 옮긴다. */
export type TabKeyResult = { readonly handled: boolean; readonly focus: string | null };

/**
 * 탭에서 누른 키(BR1.2, NFR 설계 Q1 A). 가려는 탭이 이미 열린 탭이면 바꾸기를 요청하지 않고 그 탭에 초점을 둔다.
 * 다른 탭이면 `onChange`로 요청하고, 거절(`false`)이면 초점을 옮기지 않는다(`focus` null).
 */
export function tabKeyAction(input: { ids: readonly string[]; from: string; active: string; key: string; onChange: TabChange }): TabKeyResult {
  const next = tabForKey(input.ids, input.from, input.key);
  if (next === null) return { handled: false, focus: null };
  if (next === input.active) return { handled: true, focus: next };
  return { handled: true, focus: isTabAccepted(input.onChange(next)) ? next : null };
}

export function TabStrip({ tabs, active, onChange, label, idPrefix, panels, keepInactive = false, tabTestId, truncateLabels = false }: TabStripProps) {
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const ids = tabs.map((tab) => tab.id);
  const tabId = (id: string) => `${idPrefix}-tab-${id}`;
  const panelId = (id: string) => `${idPrefix}-panel-${id}`;

  function keyDown(id: string, event: KeyboardEvent<HTMLButtonElement>) {
    const result = tabKeyAction({ ids, from: id, active, key: event.key, onChange });
    if (!result.handled) return;
    event.preventDefault();
    if (result.focus !== null) buttons.current.get(result.focus)?.focus();
  }

  function click(id: string, event: MouseEvent<HTMLButtonElement>) {
    if (id === active) return;
    // 거절이면 누르면서 옮겨 간 초점을 열린 탭으로 되돌린다(열리지 않은 탭은 Tab 순서 밖이다).
    if (!isTabAccepted(onChange(id)) && document.activeElement === event.currentTarget) buttons.current.get(active)?.focus();
  }

  return (
    <>
      <div role="tablist" aria-label={label} className={styles.tabs}>
        {tabs.map((tab) => {
          const selected = tab.id === active;
          return (
            <button key={tab.id} type="button" role="tab" id={tabId(tab.id)} aria-selected={selected} aria-controls={panelId(tab.id)}
              tabIndex={selected ? 0 : -1} className={selected ? styles.tabActive : styles.tab}
              data-testid={tabTestId === undefined ? undefined : `${tabTestId}-${tab.id}`}
              ref={(element) => { if (element) buttons.current.set(tab.id, element); else buttons.current.delete(tab.id); }}
              onClick={(event) => click(tab.id, event)} onKeyDown={(event) => keyDown(tab.id, event)}>
              {truncateLabels ? <span className={styles.truncated}>{tab.label}</span> : tab.label}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <div key={tab.id} role="tabpanel" id={panelId(tab.id)} aria-labelledby={tabId(tab.id)} tabIndex={0} hidden={!selected}>
            {selected || keepInactive ? panels[tab.id] : null}
          </div>
        );
      })}
    </>
  );
}

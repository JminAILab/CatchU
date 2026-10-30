"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ReauthNoticeProps } from "@/lib/auth-gate";
import { authScreenMessages } from "@/lib/auth-screen-messages";
import { confirmReauthLeave, createReauthLeaveControl } from "@/lib/member-session-screen";
import { loginPath } from "@/lib/member-navigation";
import { unsavedChanges } from "@/lib/unsaved-changes";
import styles from "./auth.module.css";

/**
 * 재인증 안내(#287). 가드가 `renderReauthNotice`로 그린다. 화면·입력의 유지·정리는 가드가 맡는다.
 * [다시 로그인]은 로그아웃·갱신 요청 없이 `loginPath(returnTo)`로 간다(#251 A 답변 3, 팀장 결정 2). 판단은 `confirmReauthLeave()`를 따른다.
 * 이동은 한 번만 시작한다(`createReauthLeaveControl()`). 계속한 뒤의 더블클릭·Enter 반복은 묻지도 이동하지도 않는다.
 * - `variant` 생략·`reauth`: 회원 화면 위의 안내다. 로그아웃과 같은 이동 전 확인(누른 시점의 미저장 입력·미확정 분석 요청)을 거치고, 머무르면 아무것도 하지 않는다.
 * - `login-changed`: 다른 탭의 새 로그인 감지로 가드가 화면·입력을 이미 정리한 탭이다. 같은 문구에 [다시 로그인]만 두고 묻지 않는다.
 * 안내는 스크롤 영역 위쪽에 붙는다(`.reauthNotice`, #286 10/29 확인 필요 2). 자동 스크롤·초점 이동은 하지 않는다.
 */
export function ReauthNotice({ returnTo, variant }: ReauthNoticeProps) {
  const router = useRouter();
  const [leave] = useState(() => createReauthLeaveControl({
    confirmLeave: (current) => confirmReauthLeave(current, unsavedChanges, (message) => window.confirm(message)),
    navigate: (to) => router.push(loginPath(to ?? undefined)),
  }));
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => keepFocusBelowNotice(box.current), []);
  return (
    <div ref={box} className={`${styles.notice} ${styles.reauthNotice}`} role="alert">
      <p className={styles.noticeText}>{authScreenMessages.reauthRequired}</p>
      <button
        type="button"
        className={styles.noticeAction}
        onClick={() => {
          leave.request({ returnTo, variant });
        }}
      >
        다시 로그인
      </button>
    </div>
  );
}

/**
 * 붙어 있는 안내 밑으로 키보드 초점이 숨지 않게, 안내가 붙는 스크롤 영역(모달 안이면 그 dialog, 아니면 문서)에
 * 안내 높이와 아래 여백만큼 scroll-padding-top을 둔다. 안내 높이가 바뀌면(줄바꿈·확대) 다시 맞추고, 안내가 사라지면 원래 값으로 돌린다.
 */
function keepFocusBelowNotice(notice: HTMLElement | null): (() => void) | undefined {
  if (!notice || typeof ResizeObserver === "undefined") return undefined;
  const scroller = notice.closest("dialog") ?? document.documentElement;
  const previous = scroller.style.scrollPaddingTop;
  const apply = () => { scroller.style.scrollPaddingTop = `${notice.offsetHeight + 16}px`; };
  apply();
  const observer = new ResizeObserver(apply);
  observer.observe(notice);
  return () => {
    observer.disconnect();
    scroller.style.scrollPaddingTop = previous;
  };
}

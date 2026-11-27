"use client";

import { useState, useSyncExternalStore } from "react";
import type { LogoutOutcome } from "@/lib/auth-logout";
import { confirmLogout, createMemberLogoutControl, logoutView, type LogoutRequestResult, type LogoutSnapshot, type LogoutView } from "@/lib/member-session-screen";
import { unsavedChanges } from "@/lib/unsaved-changes";
import styles from "./auth.module.css";

/**
 * 회원 셸의 로그아웃(#287). 셸이 공통 인증(#286) 상태와 `logout()`을 넘긴다.
 * 이동 전 확인(누른 시점의 미저장 입력·미확정 분석 요청) → `logout()`. 진행 중에는 다시 보내지 않고, 실패·불명은 안내한다. `done` 뒤 정리·이동은 가드가 한다.
 * `onLogout`은 요청 결과를 돌려준다. 받은 링크 헤더는 이 결과로 이 탭의 로그아웃이 완료됐는지 가린다(#649 리뷰). 회원 셸은 결과를 쓰지 않는다.
 */
export function useMemberLogout({ snapshot, logout }: {
  snapshot: LogoutSnapshot;
  logout: () => Promise<LogoutOutcome>;
}): LogoutView & { onLogout: () => Promise<LogoutRequestResult> } {
  const [control] = useState(() => createMemberLogoutControl({
    logout,
    confirmLeave: () => confirmLogout(unsavedChanges, (message) => window.confirm(message)),
  }));
  const local = useSyncExternalStore(control.subscribe, control.getLocal, control.getLocal);
  return { ...logoutView(snapshot, local), onLogout: () => control.request(snapshot) };
}

/** 로그아웃 실패·불명 안내. 다시 시도할 수 있을 때만 [다시 시도]를 보인다. */
export function LogoutStatus({ notice, onRetry }: { notice: LogoutView["notice"]; onRetry: () => void }) {
  if (!notice) return null;
  return (
    <div className={styles.notice} role="alert">
      <p className={styles.noticeText}>{notice.message}</p>
      {notice.retry && <button type="button" className={styles.noticeAction} onClick={onRetry}>다시 시도</button>}
    </div>
  );
}

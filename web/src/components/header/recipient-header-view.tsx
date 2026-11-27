"use client";

import { useEffect, useRef } from "react";
import { ProfileMenu } from "./profile-menu";
import styles from "./header.module.css";

export type RecipientHeaderStatus = "checking" | "signed-out" | "signed-in";

/**
 * 로그아웃이 끝나 「로그인」이 보일 때 그 단추로 초점을 옮길지(#649 리뷰).
 * 이 탭에서 누른 로그아웃일 때만 옮기며, [프로필]이 사라져 초점이 문서 본문으로 떨어졌거나 아직 상단 바 안에 있을 때로 한정한다.
 * 다른 탭의 로그아웃이나, 기다리는 동안 사용자가 다른 곳으로 옮긴 초점은 건드리지 않는다.
 */
export function shouldFocusLoginAfterLogout(requested: boolean, active: Element | null, body: Element | null, header: Element | null): boolean {
  if (!requested) return false;
  return active === null || active === body || (header?.contains(active) ?? false);
}

/** 받은 사람 헤더의 표시를 맡는다. 공통 미리보기에서도 실제 인증을 시작하지 않고 쓴다. */
export function RecipientHeaderView({ status, onLogin, onLogout, logoutPending = false, logoutDisabled = false }: {
  status: RecipientHeaderStatus;
  onLogin: () => void;
  onLogout?: () => void;
  logoutPending?: boolean;
  logoutDisabled?: boolean;
}) {
  const headerRef = useRef<HTMLElement>(null);
  const loginRef = useRef<HTMLButtonElement>(null);
  const logoutRequested = useRef(false);
  // 회원 화면은 로그아웃 뒤 다른 화면으로 가지만, 받은 링크는 같은 화면에 머물러 [프로필]이 사라지면 초점을 잃는다.
  useEffect(() => {
    if (status !== "signed-out") return;
    const requested = logoutRequested.current;
    logoutRequested.current = false;
    if (shouldFocusLoginAfterLogout(requested, document.activeElement, document.body, headerRef.current)) loginRef.current?.focus();
  }, [status]);
  const requestLogout = onLogout && (() => {
    logoutRequested.current = true;
    onLogout();
  });

  return (
    <header ref={headerRef} className={styles.header}>
      <div className={styles.inner}>
        <span className={styles.brandStatic}>CatchU</span>
        <div className={styles.group}>
          {status === "signed-out" && <button ref={loginRef} type="button" className={styles.menuItem} onClick={onLogin}>로그인</button>}
          {status === "signed-in" && <ProfileMenu onLogout={requestLogout} logoutPending={logoutPending} logoutDisabled={logoutDisabled} />}
        </div>
      </div>
    </header>
  );
}

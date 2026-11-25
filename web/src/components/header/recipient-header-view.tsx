"use client";

import { ProfileMenu } from "./profile-menu";
import styles from "./header.module.css";

export type RecipientHeaderStatus = "checking" | "signed-out" | "signed-in";

/** 받은 사람 헤더의 표시만 맡는다. 공통 미리보기에서도 실제 인증을 시작하지 않고 쓴다. */
export function RecipientHeaderView({ status, onLogin, onLogout, logoutPending = false, logoutDisabled = false }: {
  status: RecipientHeaderStatus;
  onLogin: () => void;
  onLogout?: () => void;
  logoutPending?: boolean;
  logoutDisabled?: boolean;
}) {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <span className={styles.brandStatic}>CatchU</span>
        <div className={styles.group}>
          {status === "signed-out" && <button type="button" className={styles.menuItem} onClick={onLogin}>로그인</button>}
          {status === "signed-in" && <ProfileMenu onLogout={onLogout} logoutPending={logoutPending} logoutDisabled={logoutDisabled} />}
        </div>
      </div>
    </header>
  );
}

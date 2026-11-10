"use client";

import { createContext, useContext } from "react";
import { usePathname } from "next/navigation";
import { decideAuthGate } from "@/lib/auth-gate";
import { safeNextPath } from "@/lib/member-navigation";
import { LogoutStatus, useMemberLogout } from "./member-logout";
import { ReauthNotice } from "./reauth-notice";
import { useAuth, useLastScopeGeneration } from "./use-auth";
import styles from "./auth.module.css";

// 헤더와 모달이 같은 로그아웃 진행·결과를 사용한다. 기존 인증 모드에서는 제공하지 않는다.
export const ModalSessionContext = createContext<ReturnType<typeof useMemberLogout> | null>(null);

export function ModalSessionActions() {
  const logout = useContext(ModalSessionContext);
  return logout ? <SessionActions logout={logout} /> : null;
}

function SessionActions({ logout }: { logout: ReturnType<typeof useMemberLogout> }) {
  const auth = useAuth();
  const generation = useLastScopeGeneration();
  const pathname = usePathname();
  const gate = decideAuthGate(auth, generation);
  if (gate.action !== "show") return null;
  return <>
    {gate.reauth && <ReauthNotice returnTo={safeNextPath(pathname)} />}
    <button type="button" className={styles.noticeAction} disabled={logout.pending} onClick={logout.onLogout}>
      {logout.pending ? "로그아웃하는 중" : "로그아웃"}
    </button>
    <LogoutStatus notice={logout.notice} onRetry={logout.onLogout} />
  </>;
}

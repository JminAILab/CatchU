"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoutStatus, useMemberLogout } from "../auth/member-logout";
import { useAuth, useEnsureRestored } from "../auth/use-auth";
import { useJdSession } from "../../features/jd/jd-session";
import { accessTokenStore } from "../../lib/access-token";
import { authSessionIntegrationEnabled } from "../../lib/auth-integration";
import { authRuntime } from "../../lib/auth-runtime";
import { beginRecipientLogin, clearRecipientReturnOnArrival } from "../../lib/recipient-login-return";
import { routes } from "../../lib/routes";
import { createLogoutFocusRequest, RecipientHeaderView } from "./recipient-header-view";

/**
 * 받은 링크의 모든 상태에서 회원 세션을 확인하는 헤더(#638).
 * 이동 없는 CatchU 브랜드는 유지하고 오른쪽 로그인·프로필만 바꾼다.
 * 로그인 복귀 정보는 이 탭에만 두며, 로그아웃 뒤에는 현재 링크에 머문다.
 */
export function RecipientHeader() {
  const params = useParams<{ token: string }>();
  const token = typeof params.token === "string" ? params.token : "";
  const router = useRouter();
  useEffect(() => {
    if (authSessionIntegrationEnabled) clearRecipientReturnOnArrival(token);
  }, [token]);
  if (authSessionIntegrationEnabled) {
    return <SessionRecipientHeader onLogin={() => router.push(beginRecipientLogin(token))} />;
  }
  return <LegacyRecipientHeader onLogin={() => router.push(routes.login)} />;
}

function SessionRecipientHeader({ onLogin }: { onLogin: () => void }) {
  useEnsureRestored();
  const auth = useAuth();
  const session = useJdSession();
  const logout = useMemberLogout({ snapshot: auth, logout: () => authRuntime().session.logout() });
  const [focusRequest] = useState(createLogoutFocusRequest);
  const holdProfile = auth.sessionHold !== null || logout.pending;
  const status = holdProfile || session.loggedIn ? "signed-in" : session.checking ? "checking" : "signed-out";
  // 메뉴의 [로그아웃]과 안내의 [다시 시도]를 같은 기억으로 보낸다(#649 리뷰 2차).
  const requestLogout = () => {
    const request = logout.onLogout();
    focusRequest.track(request);
    return request;
  };
  return <>
    <RecipientHeaderView status={status} onLogin={onLogin} onLogout={requestLogout}
      logoutPending={logout.pending} logoutDisabled={auth.sessionHold === "logout-unknown"} focusRequest={focusRequest} />
    <LogoutStatus notice={logout.notice} onRetry={requestLogout} />
  </>;
}

function LegacyRecipientHeader({ onLogin }: { onLogin: () => void }) {
  const session = useJdSession();
  const [focusRequest] = useState(createLogoutFocusRequest);
  return <RecipientHeaderView status={session.loggedIn ? "signed-in" : "signed-out"} onLogin={onLogin}
    onLogout={() => { focusRequest.track(undefined); accessTokenStore.clear("logout"); }} focusRequest={focusRequest} />;
}

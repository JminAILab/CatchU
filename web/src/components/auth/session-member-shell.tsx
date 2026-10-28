"use client";

import type { ReactNode } from "react";
import { MemberHeader } from "@/components/header/member-header";
import { authRuntime } from "@/lib/auth-runtime";
import { LogoutStatus, useMemberLogout } from "./member-logout";
import { ReauthNotice } from "./reauth-notice";
import { SessionMemberGuard } from "./session-member-guard";
import { useAuth } from "./use-auth";

/**
 * 공통 인증으로 움직이는 회원 화면 묶음의 틀(통합 시험 전환이 켜졌을 때만 쓴다): 가드 → 로그인 헤더 → 로그아웃 안내 → 화면.
 * - 로그아웃(#287): 미저장 확인 뒤 공통 인증의 `logout()`을 부르고, 진행 중에는 [로그아웃]을 막으며, 이 탭의 실패·불명을 헤더 아래에 안내한다.
 *   `done`이어도 셸은 이동하지 않는다. 입력 정리·비로그인 홈 이동은 가드가 현재 유효한 완료일 때만 한다(#251 접점 4·9).
 * - 재인증 안내(#287): 가드의 `renderReauthNotice` 자리에 `ReauthNotice`를 넘긴다. 가드가 정한 `returnTo`·`variant`를 그대로 쓴다(#251 접점 6).
 */
export function SessionMemberShell({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const logout = useMemberLogout({ snapshot: auth, logout: () => authRuntime().session.logout() });
  return (
    <SessionMemberGuard renderReauthNotice={(props) => <ReauthNotice {...props} />}>
      <MemberHeader onLogout={logout.onLogout} logoutPending={logout.pending} />
      <LogoutStatus notice={logout.notice} onRetry={logout.onLogout} />
      {children}
    </SessionMemberGuard>
  );
}

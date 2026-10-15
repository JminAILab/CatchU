"use client";

import type { ReactNode } from "react";
import { MemberHeader } from "@/components/header/member-header";
import { accessTokenStore } from "@/lib/access-token";
import { authSessionIntegrationEnabled } from "@/lib/auth-integration";
import { MemberGuard } from "./member-guard";
import { SessionMemberShell } from "./session-member-shell";

/**
 * 회원 화면 묶음의 틀: 가드 → 로그인 헤더 → 화면.
 * 로그아웃은 서버 세션이 없으므로(OQ-A1) 메모리 토큰을 지우고 비로그인 홈으로 간다.
 */
export function MemberShell({ children }: { children: ReactNode }) {
  // 공통 인증(#286) 연결은 통합 시험 전환이 켜졌을 때만 쓴다(미결 정책 결정 전 제품 경로 보류).
  if (authSessionIntegrationEnabled) return <SessionMemberShell>{children}</SessionMemberShell>;
  return (
    <MemberGuard>
      <MemberHeader onLogout={() => accessTokenStore.clear("logout")} />
      {children}
    </MemberGuard>
  );
}

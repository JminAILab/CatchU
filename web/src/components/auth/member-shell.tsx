"use client";

import type { ReactNode } from "react";
import { MemberHeader } from "@/components/header/member-header";
import { accessTokenStore } from "@/lib/access-token";
import { MemberGuard } from "./member-guard";

/**
 * 회원 화면 묶음의 틀: 가드 → 로그인 헤더 → 화면.
 * 로그아웃은 서버 세션이 없으므로(OQ-A1) 메모리 토큰을 지우고 비로그인 홈으로 간다.
 */
export function MemberShell({ children }: { children: ReactNode }) {
  return (
    <MemberGuard>
      <MemberHeader onLogout={() => accessTokenStore.clear("logout")} />
      {children}
    </MemberGuard>
  );
}

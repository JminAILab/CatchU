"use client";

import type { ReactNode } from "react";
import { MemberHeader } from "@/components/header/member-header";
import { authRuntime } from "@/lib/auth-runtime";
import { SessionMemberGuard } from "./session-member-guard";

/**
 * 공통 인증으로 움직이는 회원 화면 묶음의 틀(통합 시험 전환이 켜졌을 때만 쓴다): 가드 → 로그인 헤더 → 화면.
 * 로그아웃은 공통 인증의 `logout()`을 부른다(#286). `done`이면 가드가 비로그인 홈으로 보낸다.
 * 미저장 확인·진행·실패·불명 표시와 재인증 안내는 #287이 연결한다(#251 접점 6·9). 그 전까지는 호출만 연결했다.
 */
export function SessionMemberShell({ children }: { children: ReactNode }) {
  return (
    <SessionMemberGuard>
      <MemberHeader onLogout={() => { void authRuntime().session.logout(); }} />
      {children}
    </SessionMemberGuard>
  );
}

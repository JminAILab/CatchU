"use client";

import { usePathname } from "next/navigation";
import { decideAuthGate } from "@/lib/auth-gate";
import { authSessionIntegrationEnabled } from "@/lib/auth-integration";
import { safeNextPath } from "@/lib/member-navigation";
import { ReauthNotice } from "./reauth-notice";
import { useAuth } from "./use-auth";

/**
 * 모달 안 재인증 안내(O-4). 모달(`showModal()`)이 열리면 바깥 내용은 조작할 수 없어, 가드가 그린 바깥 [다시 로그인]에 닿지 못한다.
 * CatchU 회원 세션의 재인증 필요(#286 `decideAuthGate`)일 때만 #287 `ReauthNotice`를 그대로 그린다(GitHub 재연동과 다른 판정).
 * 확인은 같은 `confirmReauthLeave`, 이동은 같은 `loginPath`를 지나며 로그아웃·갱신 요청을 보내지 않는다. 모달 차단은 풀지 않는다.
 * 공통 인증 상태는 통합 시험 전환이 켜졌을 때만 쓰므로 전환을 끄면 그리지 않는다. 다른 탭 새 로그인(`relogin-only`)은 가드가 화면을 정리한다.
 * 쓰는 곳: 내 자산의 분석 요청 모달(PR #417), Catch 상세(#467).
 */
export function ModalReauthNotice() {
  return authSessionIntegrationEnabled ? <IntegratedModalReauthNotice /> : null;
}

function IntegratedModalReauthNotice() {
  const auth = useAuth();
  const pathname = usePathname();
  const gate = decideAuthGate(auth, null);
  if (gate.action !== "show" || !gate.reauth) return null;
  return <ReauthNotice returnTo={safeNextPath(pathname)} />;
}

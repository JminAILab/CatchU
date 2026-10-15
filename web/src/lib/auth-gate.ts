/**
 * 회원 경로 가드의 인증 판정(#286 6단계). 화면·라우터와 분리해 시험한다. 회원 조회 결과에 따른 이동은 #261의
 * `decideMemberEntry()`가 그대로 맡는다.
 *
 * 합의(#286 본문 「useMemberLookup·MemberGuard 연결」, #251 접점 4, 1단계 검토본 §2)
 * - 복원 확인 중에는 이동을 보류한다. 비로그인이 확정된 경우에만 로그인 화면으로 보낸다.
 * - 재인증이 필요하면 화면·입력을 유지한다. 안내 컴포넌트는 #287이 제공하고, 가드는 위치만 마련한다.
 * - 로그아웃 `done`(이 탭 또는 같은 로그인의 다른 탭)이고 그 로그아웃이 이 화면의 세션에서 시작됐으며 그사이 새 로그인이 시작되지 않았으면
 *   입력을 정리하고 비로그인 홈으로 간다. 그 밖의 비로그인은 로그인 화면으로 보낸다.
 *
 * 임시 처리(결정 전)
 * - 로그인 표식 불일치 감지 뒤에는 상태를 바꾸지 않으므로(4-2) 가드도 화면을 그대로 둔다. 감지 뒤 화면 표시는 미결이다.
 * - 복원 결과 불명(`canRetryRestore` false)은 [다시 확인] 없이 [다시 로그인]만 보인다. 같은 페이지 [다시 확인] 허용은 미결이다.
 */
import type { AuthSnapshot } from "./auth-state.ts";

export type AuthGateDecision =
  /** 복원 확인 중: 이동하지 않고 확인 중 표시. */
  | { action: "restoring" }
  /** 복원을 확인하지 못함. `retry`면 [다시 확인]을 보이고, 아니면 [다시 로그인]만 보인다(자동 이동 없음). */
  | { action: "restore-unconfirmed"; retry: boolean }
  /** 비로그인 확정: 로그인 화면으로(현재 경로를 `next`로). */
  | { action: "to-login" }
  /** 이 화면 세션의 유효한 로그아웃 완료: 입력을 정리하고 비로그인 홈으로. */
  | { action: "to-landing" }
  /** 회원 화면을 보인다. `reauth`면 화면·입력을 유지한 채 재인증 안내 자리를 연다. */
  | { action: "show"; reauth: boolean };

/**
 * @param snapshot 공통 인증 상태
 * @param shownGeneration 이 가드가 회원 화면을 마지막으로 보인 인증 세대. 아직 보인 적이 없으면 null.
 */
export function decideAuthGate(snapshot: AuthSnapshot, shownGeneration: number | null): AuthGateDecision {
  switch (snapshot.status) {
    case "restoring":
      return snapshot.restoreUnconfirmed ? { action: "restore-unconfirmed", retry: snapshot.canRetryRestore } : { action: "restoring" };
    case "signed-in":
      return { action: "show", reauth: false };
    case "reauth-required":
      return { action: "show", reauth: true };
    case "signed-out": {
      const { logout } = snapshot;
      const cleanUp = snapshot.canCleanUpAfterLogout && logout.phase === "settled" && shownGeneration !== null
        && logout.fromGeneration === shownGeneration;
      return cleanUp ? { action: "to-landing" } : { action: "to-login" };
    }
  }
}

/** 재인증 안내 컴포넌트(#287)에 넘기는 값. `returnTo`는 `safeNextPath()`를 통과한 현재 회원 경로다(#251 타입 초안). */
export type ReauthNoticeProps = { returnTo: string | null };

"use client";
import { useEffect, useSyncExternalStore } from "react";
import { authRuntime } from "@/lib/auth-runtime";
import { SERVER_AUTH_SNAPSHOT, type AuthSnapshot } from "@/lib/auth-state";

/** 공통 인증 상태(#286). 토큰은 담지 않는다. 서버 렌더링에서는 복원 확인 중으로 본다. */
export function useAuth(): AuthSnapshot {
  const { store } = authRuntime();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => SERVER_AUTH_SNAPSHOT);
}

/** 회원 화면 범위 번호(`auth-scope.ts`). 같은 세션의 Access 갱신·재인증 필요에는 바뀌지 않는다. */
export function useSessionScope(): number | null {
  const { scope } = authRuntime();
  return useSyncExternalStore(scope.subscribe, scope.getSnapshot, () => null);
}

/** 가장 최근에 회원 화면 범위를 연 인증 세대. 로그아웃 완료 뒤 정리 여부를 정할 때 쓴다. */
export function useLastScopeGeneration(): number | null {
  const { scope } = authRuntime();
  return useSyncExternalStore(scope.subscribe, scope.lastGeneration, () => null);
}

/** 로그인 표식 불일치를 감지해 감지 뒤 정책을 기다리는 중인지(4-2). 화면 표시는 미결이며, 이 탭의 새 로그인만 받는다. */
export function useLoginChangeDetected(): boolean {
  const { store } = authRuntime();
  return useSyncExternalStore(store.subscribe, store.loginChangeDetected, () => false);
}

/** 이 화면이 열릴 때 세션 복원을 한 번 시작한다(7단계). Google 콜백 화면에서는 쓰지 않는다. */
export function useEnsureRestored() {
  useEffect(() => {
    authRuntime().ensureRestored();
  }, []);
}

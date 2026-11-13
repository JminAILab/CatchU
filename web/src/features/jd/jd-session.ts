"use client";

import { useSyncExternalStore } from "react";
import { useAuth, useLoginChangeDetected } from "../../components/auth/use-auth";
import { accessTokenStore, EMPTY_ACCESS_TOKEN_STATE } from "../../lib/access-token";
import { authSessionIntegrationEnabled } from "../../lib/auth-integration";
import { authRuntime } from "../../lib/auth-runtime";

/** 원문 토큰을 UI 상태에 복사하지 않고 공용 인증의 세대만 비교한다. */
export function currentJdSession(): { identity: unknown; loggedIn: boolean } {
  if (authSessionIntegrationEnabled) {
    const state = authRuntime().store.getSnapshot();
    return { identity: state.generation, loggedIn: state.status === "signed-in" && state.sessionHold === null
      && !authRuntime().store.loginChangeDetected() };
  }
  const state = accessTokenStore.get();
  return { identity: state, loggedIn: state.token !== null };
}
export const jdSessionDeps = { session: () => currentJdSession().identity, isLoggedIn: () => currentJdSession().loggedIn };

function useIntegratedJdSession() {
  const auth = useAuth();
  const changed = useLoginChangeDetected();
  return { identity: auth.generation, loggedIn: auth.status === "signed-in" && auth.sessionHold === null && !changed };
}
function useLegacyJdSession() {
  const legacy = useSyncExternalStore(accessTokenStore.subscribe, accessTokenStore.get, () => EMPTY_ACCESS_TOKEN_STATE);
  return { identity: legacy, loggedIn: legacy.token !== null };
}
// 빌드 때 고정되는 공용 전환을 따른다. 꺼져 있을 때 공용 인증 런타임을 새로 기동하지 않는다.
export const useJdSession = authSessionIntegrationEnabled ? useIntegratedJdSession : useLegacyJdSession;

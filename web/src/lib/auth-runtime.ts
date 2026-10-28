/**
 * 탭마다 하나인 공통 인증 묶음(#286 6·7·8단계). 화면은 이 모듈의 인스턴스만 쓴다.
 * 제품 화면은 통합 시험 전환(`auth-integration.ts`)이 켜졌을 때만 이 모듈을 쓴다. 꺼져 있으면 인스턴스를 만들지 않는다.
 *
 * - 저장소·로그인 표식·세션 잠금·세션(갱신·로그아웃)·보호 API·개발 로그인·Google 공통 함수를 같은 저장소와 같은 잠금으로 묶는다.
 * - 서버 렌더링에서는 브라우저 기능(Web Locks·localStorage·sessionStorage·BroadcastChannel·document)을 쓰지 않는다.
 *   화면 훅은 서버 스냅샷(`SERVER_AUTH_SNAPSHOT`)을 쓰므로 서버 쪽 인스턴스는 상태가 바뀌지 않는다.
 * - 세션 복원(7단계)은 회원 가드·로그인 화면이 `ensureRestored()`로 한 번 시작한다. Google 콜백 화면은 부르지 않는다
 *   (복원 결과로 이번 로그인 성공을 판정하지 않기 위해, #251 접점 1).
 * - 새로고침 뒤 복원은 저장 표식 없이 브라우저 쿠키로 보낸다([팀장 결정 1](https://github.com/JminAILab/CatchU/issues/251#issuecomment-6206414443), A안).
 *   갱신·복원 응답을 기다리는 중의 새로고침·탭 종료(페이지를 열 때의 복원 중 새로고침, 빠른 연속 새로고침 포함)로 서버가 이미 교체를
 *   마쳤다면 그 세션은 다시 쓸 수 없어 재인증이 필요하다. 이는 "갱신 응답 유실 뒤 재인증" 한계에 든다.
 * - 다른 탭의 새 로그인 감지 뒤 한 번 복원은 `auth-session.ts`가 직접 보낸다(`ensureRestored`의 한 번 제한과 별개).
 */
import { accessTokenStore } from "./access-token.ts";
import { createAuthApi, type AuthApi } from "./auth-api.ts";
import { createGoogleAuth, type GoogleAuth } from "./auth-google.ts";
import { createLoginMarker } from "./auth-login-marker.ts";
import { createFetchLogoutTransport } from "./auth-logout.ts";
import { createFetchRefreshTransport } from "./auth-refresh.ts";
import { bindLegacyTokenSignal, createSessionScope, type SessionScope } from "./auth-scope.ts";
import { createAuthSession, createSessionLock, type AuthBroadcast, type AuthSession } from "./auth-session.ts";
import { createAuthStore, type AuthStore } from "./auth-state.ts";

export type AuthRuntime = {
  store: AuthStore;
  session: AuthSession;
  api: AuthApi;
  google: GoogleAuth;
  scope: SessionScope;
  /** 복원 중이고 아직 시작하지 않았으면 세션 복원을 한 번 시작한다(브라우저에서만). */
  ensureRestored(): void;
};

/** 같은 출처 탭 사이 알림 채널 이름. 토큰·회원 정보는 보내지 않는다. */
export const AUTH_BROADCAST_NAME = "catchu-auth";

let current: AuthRuntime | null = null;

function openBroadcast(): AuthBroadcast | null {
  try {
    return typeof BroadcastChannel === "function" ? new BroadcastChannel(AUTH_BROADCAST_NAME) : null;
  } catch {
    return null;
  }
}

export function authRuntime(): AuthRuntime {
  if (current) return current;
  const browser = typeof window !== "undefined" && typeof document !== "undefined";
  // NEXT_PUBLIC_ 값은 빌드할 때 들어간다(web README 「환경 변수」).
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  const nodeEnv = process.env.NODE_ENV;
  const store = createAuthStore();
  const marker = createLoginMarker(browser ? {} : { storage: null });
  const lock = createSessionLock(browser ? {} : { locks: null });
  const session = createAuthSession({
    store, marker, lock, broadcast: browser ? openBroadcast() : null,
    refreshTransport: createFetchRefreshTransport({ baseUrl, nodeEnv }),
    logoutTransport: createFetchLogoutTransport({ baseUrl, nodeEnv }),
  });
  const api = createAuthApi({ baseUrl, nodeEnv, store, session });
  const google = createGoogleAuth({ baseUrl, nodeEnv, store, session, storage: browser ? undefined : null });
  const scope = createSessionScope(store);
  if (browser) {
    bindLegacyTokenSignal(store, scope, accessTokenStore);
    session.watchVisibility(document);
  }
  let restoreStarted = false;
  current = {
    store, session, api, google, scope,
    ensureRestored() {
      if (!browser || restoreStarted) return;
      const snapshot = store.getSnapshot();
      if (snapshot.status !== "restoring" || snapshot.restoreUnconfirmed) return;
      restoreStarted = true;
      void session.refresh();
    },
  };
  return current;
}

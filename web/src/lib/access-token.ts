/**
 * Access Token 메모리 보관(#106). 브라우저 탭의 메모리에만 두며 localStorage·sessionStorage·쿠키·URL·로그에 쓰지 않는다.
 * 새로고침하면 사라져 다시 로그인한다(실제 유지 방식은 OQ-A1).
 *
 * `ended`는 토큰이 사라진 이유다. 회원 경로 가드가 로그아웃이면 비로그인 홈으로, 인증 실패면 로그인 진입으로 보낸다.
 */
export type TokenEndReason = "logout" | "auth-failed";

export type AccessTokenState = {
  token: string | null;
  ended: TokenEndReason | null;
};

export type AccessTokenStore = {
  /** useSyncExternalStore용 스냅샷. 값이 바뀔 때만 새 객체다. */
  get(): AccessTokenState;
  set(token: string): void;
  clear(reason: TokenEndReason): void;
  subscribe(listener: () => void): () => void;
};

const EMPTY: AccessTokenState = { token: null, ended: null };

export function createAccessTokenStore(): AccessTokenStore {
  let state = EMPTY;
  const listeners = new Set<() => void>();
  const update = (next: AccessTokenState) => {
    if (next.token === state.token && next.ended === state.ended) return;
    state = next;
    for (const listener of listeners) listener();
  };

  return {
    get: () => state,
    set(token) {
      if (typeof token !== "string" || token.length === 0) throw new TypeError("token must be a non-empty string");
      update({ token, ended: null });
    },
    clear(reason) {
      update({ token: null, ended: reason });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** 서버 렌더링 스냅샷. 서버에는 토큰이 없다. */
export const EMPTY_ACCESS_TOKEN_STATE = EMPTY;

/** 이 탭의 토큰 저장소. 화면·API 호출 함수가 함께 쓴다. */
export const accessTokenStore = createAccessTokenStore();

import { useEffect, useState, useSyncExternalStore } from "react";
import { accessTokenStore, EMPTY_ACCESS_TOKEN_STATE, type AccessTokenState } from "@/lib/access-token";
import { api } from "@/lib/api";
import { readConnectionStatus, type ConnectionLookup } from "./claude-connection";

/**
 * 연결 상태를 세션·재조회별로 읽는다(GitHub 연동 화면과 같은 방식). 이전 세션의 응답은 쓰지 않는다.
 * 읽는 중이면 lookup이 null이다. 조회 실패는 NONE으로 바꾸지 않는다.
 */
export function useConnectionLookup(): { lookup: ConnectionLookup | null; reload: () => void } {
  const session = useSyncExternalStore(accessTokenStore.subscribe, accessTokenStore.get, () => EMPTY_ACCESS_TOKEN_STATE);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ session: AccessTokenState; attempt: number; lookup: ConnectionLookup } | null>(null);

  useEffect(() => {
    if (!session.token) return;
    const abort = new AbortController();
    void readConnectionStatus((path, request) => api.member(path, request), abort.signal).then((lookup) => {
      if (!abort.signal.aborted && accessTokenStore.get() === session) setResult({ session, attempt, lookup });
    });
    return () => abort.abort();
  }, [session, attempt]);

  return {
    lookup: result?.session === session && result.attempt === attempt ? result.lookup : null,
    reload: () => setAttempt((value) => value + 1),
  };
}

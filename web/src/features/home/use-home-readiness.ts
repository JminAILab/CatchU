"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createRepositoryApi } from "@/features/repository-management/repository-api";
import { accessTokenStore, EMPTY_ACCESS_TOKEN_STATE } from "@/lib/access-token";
import { api } from "@/lib/api";
import { homeView, type HomeLookup, type HomeView } from "./home-readiness";

// 인증·기준 주소·/v1·공통 오류 해석은 #106의 api.member가 맡는다. 렌더마다 호출 객체를 새로 만들지 않는다.
const repositories = createRepositoryApi(api.member);

/**
 * 홈의 GitHub 연동 상태를 읽어 표시 상태로 바꾼다(#155).
 * - 세션·재조회별로 결과를 나눠, 이전 회원이나 이전 조회의 응답으로 홈을 그리지 않는다.
 * - [다시 불러오기]는 같은 조회만 다시 보낸다. GitHub 연결·저장소 연결·분석 요청을 실행하지 않는다.
 */
export function useHomeReadiness(): { view: HomeView; retry: () => void } {
  const session = useSyncExternalStore(accessTokenStore.subscribe, accessTokenStore.get, () => EMPTY_ACCESS_TOKEN_STATE);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ session: typeof session; attempt: number; lookup: HomeLookup } | null>(null);
  useEffect(() => {
    if (!session.token) return;
    const abort = new AbortController();
    void repositories.githubState(abort.signal).then((lookup) => {
      if (!abort.signal.aborted && accessTokenStore.get() === session) setResult({ session, attempt, lookup });
    });
    return () => abort.abort();
  }, [session, attempt]);
  const lookup: HomeLookup = result?.session === session && result.attempt === attempt ? result.lookup : { state: "loading" };
  return { view: homeView(lookup), retry: () => setAttempt((value) => value + 1) };
}

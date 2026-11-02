"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { githubStartBlockedReason } from "@/features/github-connection/github-connection-screen";
import { accessTokenStore, EMPTY_ACCESS_TOKEN_STATE } from "@/lib/access-token";
import { api } from "@/lib/api";
import { authSessionIntegrationEnabled } from "@/lib/auth-integration";
import { createHomeApi, currentHomeLookup, startHomeLookup, type HomeResult } from "./home-api";
import { homeView, type HomeView } from "./home-readiness";

// 인증·기준 주소·/v1·공통 오류 해석은 #106의 api.member가 맡는다. 렌더마다 호출 객체를 새로 만들지 않는다.
const home = createHomeApi(api.member);
// GitHub 연결 시작을 막는 기준·문구는 연동 화면(#253)과 같다. 통합 시험 전환은 빌드할 때 정해진다.
const startBlockedReason = githubStartBlockedReason(authSessionIntegrationEnabled);

/**
 * 홈의 GitHub 연동 상태와(연결됨이면) 접수 이력 유무를 읽어 표시 상태로 바꾼다(#155).
 * - 세션·재조회별로 결과를 나눠, 이전 회원이나 이전 조회의 응답으로 홈을 그리지 않는다(`startHomeLookup`·`currentHomeLookup`).
 * - [다시 불러오기]는 같은 조회만 다시 보낸다. GitHub 연결·저장소 연결·분석 요청을 실행하지 않는다.
 */
export function useHomeReadiness(): { view: HomeView; retry: () => void } {
  const session = useSyncExternalStore(accessTokenStore.subscribe, accessTokenStore.get, () => EMPTY_ACCESS_TOKEN_STATE);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<HomeResult<typeof session> | null>(null);
  useEffect(() => {
    if (!session.token) return;
    return startHomeLookup(home.status, { session, attempt }, (current) => accessTokenStore.get() === current, setResult);
  }, [session, attempt]);
  return { view: homeView(currentHomeLookup(result, session, attempt), startBlockedReason), retry: () => setAttempt((value) => value + 1) };
}

"use client";
import { useEffect, useState } from "react";
import { authRuntime } from "@/lib/auth-runtime";
import {
  initialSessionLookup, lookupMemberWithAuth, recordSessionLookup, viewSessionLookup, type SessionLookupView,
} from "@/lib/member-lookup";
import { useAuth, useSessionScope } from "./use-auth";

/**
 * 공통 인증으로 회원을 조회한다(#261 흐름 재사용, #286 6단계. 통합 시험 전환이 켜졌을 때만 쓴다).
 * - 회원 화면 범위·경로·재조회별로 결과를 나눠 이전 응답으로 회원 화면을 열지 않는다. 다른 경로의 이전 결과는 쓰지 않는다(#251 접점 3).
 * - 같은 세션의 Access 갱신만으로 다시 조회하지 않는다(범위 번호가 그대로).
 * - 같은 화면을 다시 조회하는 동안에는 이전에 불러온 결과로 화면을 유지한다(#251 접점 3·15번). 조회가 실패하면 이전 결과로 넘어가지 않고 실패를 보인다.
 * - 보내지 않았거나(재인증 필요·로그아웃 보류·로그인 변경 감지) 이전 세션 응답이면 조회 실패로도 성공으로도 보이지 않고,
 *   그 조회의 진행 표시만 지운다([A 동의](https://github.com/JminAILab/CatchU/issues/251#issuecomment-6187946262)). 표시 규칙은 `viewSessionLookup`.
 */
export function useSessionMemberLookup(scope: string) {
  const auth = useAuth();
  const sessionScope = useSessionScope();
  const callable = auth.status === "signed-in" && auth.sessionHold === null;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState(initialSessionLookup);
  useEffect(() => {
    if (sessionScope === null || !callable) return;
    const key = { sessionScope, scope, attempt };
    const abort = new AbortController();
    void lookupMemberWithAuth(authRuntime().api.member, abort.signal).then((me) => {
      // 화면을 떠났거나 다음 조회로 넘어갔으면 이 응답은 버린다. 더 최신 조회의 진행 표시·결과를 덮지 않는다.
      if (abort.signal.aborted) return;
      setState((current) => recordSessionLookup(current, key, me));
    });
    return () => abort.abort();
  }, [sessionScope, scope, attempt, callable]);
  const me: SessionLookupView = sessionScope === null
    ? { state: "loading" }
    : viewSessionLookup(state, { sessionScope, scope, attempt, callable });
  return { sessionScope, me, retry: () => setAttempt((value) => value + 1) };
}

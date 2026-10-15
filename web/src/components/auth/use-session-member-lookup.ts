"use client";
import { useEffect, useState } from "react";
import { authRuntime } from "@/lib/auth-runtime";
import { lookupMemberWithAuth } from "@/lib/member-lookup";
import type { MeLookup } from "@/lib/member-navigation";
import { useAuth, useSessionScope } from "./use-auth";

type Result = { sessionScope: number; scope: string; attempt: number; me: MeLookup };

/**
 * 공통 인증으로 회원을 조회한다(#261 흐름 재사용, #286 6단계. 통합 시험 전환이 켜졌을 때만 쓴다).
 * - 회원 화면 범위·경로·재조회별로 결과를 나눠 이전 응답으로 회원 화면을 열지 않는다. 다른 경로의 이전 결과는 쓰지 않는다(#251 접점 3).
 * - 같은 세션의 Access 갱신만으로 다시 조회하지 않는다(범위 번호가 그대로).
 * - 같은 화면을 다시 조회하는 동안에는 이전에 불러온 결과로 화면을 유지한다(#251 접점 3·15번). 조회가 실패하면 이전 결과로 넘어가지 않고 실패를 보인다.
 * - 보내지 않았거나(재인증 필요·로그아웃 보류·로그인 변경 감지) 이전 세션 응답이면 결과를 바꾸지 않는다. 조회 실패로 보이지 않는다.
 */
export function useSessionMemberLookup(scope: string) {
  const auth = useAuth();
  const sessionScope = useSessionScope();
  const callable = auth.status === "signed-in" && auth.sessionHold === null;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  useEffect(() => {
    if (sessionScope === null || !callable) return;
    const abort = new AbortController();
    void lookupMemberWithAuth(authRuntime().api.member, abort.signal).then((me) => {
      if (abort.signal.aborted || me.state === "skipped") return;
      setResult({ sessionScope, scope, attempt, me });
    });
    return () => abort.abort();
  }, [sessionScope, scope, attempt, callable]);
  let me: MeLookup = { state: "loading" };
  if (result && result.sessionScope === sessionScope && result.scope === scope) {
    if (result.attempt === attempt || result.me.state === "loaded") me = result.me;
  }
  return { sessionScope, me, retry: () => setAttempt((value) => value + 1) };
}

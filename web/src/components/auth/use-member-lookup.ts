"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { accessTokenStore, EMPTY_ACCESS_TOKEN_STATE } from "@/lib/access-token";
import { api } from "@/lib/api";
import { lookupMember } from "@/lib/member-lookup";
import type { MeLookup } from "@/lib/member-navigation";

/** 세션·경로·재조회별 결과를 분리해 이전 응답으로 회원 화면을 열지 않는다. */
export function useMemberLookup(scope: string) {
  const session = useSyncExternalStore(accessTokenStore.subscribe, accessTokenStore.get, () => EMPTY_ACCESS_TOKEN_STATE);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ session: typeof session; scope: string; attempt: number; me: MeLookup } | null>(null);
  useEffect(() => {
    if (!session.token) return;
    const abort = new AbortController();
    void lookupMember(api, abort.signal).then(me => {
      if (!abort.signal.aborted && accessTokenStore.get() === session) setResult({ session, scope, attempt, me });
    });
    return () => abort.abort();
  }, [session, scope, attempt]);
  const me: MeLookup = result?.session === session && result.scope === scope && result.attempt === attempt
    ? result.me : { state: "loading" };
  return { session, me, retry: () => setAttempt(value => value + 1) };
}

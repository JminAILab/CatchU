"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { LoadingState, LookupFailedState } from "@/components/status/status";
import type { CallbackParse, GoogleCompletionInput, GoogleCompletionResult } from "@/lib/auth-google";
import { authScreenMessages } from "@/lib/auth-screen-messages";
import { createGoogleCallbackControl, type MemberLookupOutcome } from "@/lib/google-login-screen";
import styles from "./auth.module.css";

/**
 * Google 콜백 화면(`/google/callback`, #287). 공통 인증(#286)의 콜백 해석·완료 함수와 #261 회원 조회를 넘겨받는다.
 * - query는 브라우저에서 한 번만 해석하고, 결과를 보존한 뒤 주소에서 `code`·`state`·`error`를 지운다.
 * - 효과가 다시 실행돼도 다시 해석하거나 완료 요청을 다시 보내지 않는다. 화면을 떠나면 결과만 무시하고 요청은 중단하지 않는다.
 * - 세션 복원을 시작하지 않는다(`useEnsureRestored()`를 쓰지 않는다).
 */
export function GoogleCallbackScreen({ readGoogleCallback, completeGoogleLogin, lookupMember }: {
  readGoogleCallback: (query: URLSearchParams) => CallbackParse;
  completeGoogleLogin: (input: GoogleCompletionInput) => Promise<GoogleCompletionResult>;
  lookupMember: () => Promise<MemberLookupOutcome>;
}) {
  const router = useRouter();
  const [control] = useState(() => createGoogleCallbackControl({
    readCallback: readGoogleCallback,
    completeGoogleLogin,
    lookupMember,
  }));
  const view = useSyncExternalStore(control.subscribe, control.getView, control.getView);

  useEffect(() => {
    // 예상 밖 예외는 거부로 남겨 브라우저 오류로 드러낸다(같은 Promise라 효과가 다시 실행돼도 한 번).
    void control.begin(
      () => new URLSearchParams(window.location.search),
      () => window.history.replaceState(null, "", window.location.pathname),
    );
  }, [control]);

  useEffect(() => {
    if (view.phase === "redirect") router.replace(view.to);
  }, [view, router]);

  return (
    <main className={styles.page}>
      <div className={styles.panel}>
        <h1 className={styles.title}>Google 로그인</h1>
        {view.phase === "checking" && <LoadingState>{authScreenMessages.callbackChecking}</LoadingState>}
        {(view.phase === "member-check" || view.phase === "redirect") && <LoadingState>회원 정보를 확인하고 있습니다.</LoadingState>}
        {view.phase === "member-check-failed" && (
          <LookupFailedState title="회원 정보를 불러오지 못했습니다" onRetry={() => { void control.retryMemberCheck(); }} />
        )}
        {view.phase === "notice" && <p className={styles.error} role="alert">{view.notice}</p>}
        {(view.phase === "notice" || view.phase === "ignored") && (
          <Link href={view.loginHref} className={styles.submitLink}>다시 로그인</Link>
        )}
      </div>
    </main>
  );
}

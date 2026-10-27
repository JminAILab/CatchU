"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { ApiResult } from "@/lib/api-response";
import { devLoginEnabled } from "@/lib/api";
import { authRuntime } from "@/lib/auth-runtime";
import { afterLoginPath } from "@/lib/member-navigation";
import { useAuth, useEnsureRestored, useLoginChangeDetected } from "./use-auth";
import { useSessionMemberLookup } from "./use-session-member-lookup";
import { LookupFailedState } from "@/components/status/status";
import styles from "./auth.module.css";

function devLoginErrorMessage(result: Exclude<ApiResult, { kind: "success" }>): string {
  if (result.kind === "lookup-failed") {
    return "서버에 연결하지 못했습니다. api 실행 상태와 주소(NEXT_PUBLIC_API_BASE_URL), api의 CORS_ALLOWED_ORIGINS에 이 화면 주소가 있는지 확인해 주세요.";
  }
  if (result.code === "VALIDATION_FAILED") return "식별 문자열을 확인해 주세요. 비어 있거나 앞뒤에 공백이 있으면 안 됩니다.";
  if (result.status === 403) return "api에서 개발용 로그인이 꺼져 있습니다. api의 DEV_LOGIN_ENABLED·NODE_ENV를 확인해 주세요.";
  return "로그인하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

/**
 * 공통 인증으로 움직이는 로그인 진입(`/login`, 통합 시험 전환이 켜졌을 때만 쓴다). 화면 틀은 D가 맡고, Google 버튼·이동은 #287이 연결하므로(#251 접점 7) '연결 전'으로 둔다.
 * 개발용 로그인(#87)은 NEXT_PUBLIC_DEV_LOGIN_ENABLED=true일 때만 보이며, Google 로그인처럼 보이지 않게 따로 둔다.
 * 인증 상태는 공통 인증(#286)을 따른다. 들어오면 세션 복원을 한 번 시작하고, 로그인 상태가 확인되면 #261 흐름대로 이동한다.
 */
export function SessionLoginPanel() {
  useEnsureRestored();
  const router = useRouter();
  const auth = useAuth();
  const detected = useLoginChangeDetected();
  const { sessionScope, me, retry } = useSessionMemberLookup("login");
  const signedIn = auth.status === "signed-in" && sessionScope !== null && !detected;
  // 복원 확인 중(확인 실패 표시 전)에는 로그인 입력을 보이지 않는다. 그 밖의 비로그인·재인증 필요·확인 실패와
  // 로그인 변경 감지 뒤 [다시 로그인]만 받는 탭(팀장 결정 2)에는 새 로그인을 받는다.
  const canLogin = !signedIn && !(auth.status === "restoring" && !auth.restoreUnconfirmed);
  useEffect(() => {
    if (signedIn && me.state === "loaded") {
      router.replace(afterLoginPath(me.displayName, new URLSearchParams(window.location.search).get("next")));
    }
  }, [signedIn, me, router]);
  const inputId = useId();
  const [memberId, setMemberId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loginAbort = useRef<AbortController | null>(null);

  // 응답 전에 화면을 떠나면 로그인을 취소한다. 늦게 온 응답이 토큰을 바꾸거나 다른 화면에서 이동시키지 않게 한다.
  useEffect(() => () => loginAbort.current?.abort(), []);

  async function handleDevLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const abort = new AbortController();
    loginAbort.current = abort;
    const result = await authRuntime().api.devLogin(memberId, { signal: abort.signal });
    if (abort.signal.aborted) return;
    if (result.kind === "success" || result.kind === "discarded") {
      setSubmitting(false);
      return;
    }
    setError(devLoginErrorMessage(result));
    setSubmitting(false);
  }

  return (
    <main className={styles.page}>
      <div className={styles.panel}>
        <h1 className={styles.title}>CatchU 시작하기</h1>
        <p className={styles.lead}>로그인하면 내 GitHub 기록으로 Catch를 만들 수 있습니다.</p>
        <button type="button" className={styles.googleButton} aria-disabled="true">
          Google로 로그인 <span className={styles.pendingTag}>연결 전</span>
        </button>

        {signedIn && me.state === "failed" && <LookupFailedState title="회원 정보를 불러오지 못했습니다" onRetry={retry} />}
        {signedIn && me.state === "loading" && <p role="status">회원 정보를 확인하고 있습니다.</p>}
        {!signedIn && !canLogin && <p role="status">로그인 상태를 확인하고 있습니다.</p>}
        {devLoginEnabled && canLogin && (
          <section className={styles.devSection} aria-labelledby={`${inputId}-title`}>
            <h2 id={`${inputId}-title`} className={styles.devTitle}>개발용 로그인</h2>
            <p className={styles.devNotice}>개발 환경에서만 보입니다. 개발용 식별 문자열을 입력하면 해당 회원을 찾거나 만들어 로그인합니다.</p>
            <form onSubmit={handleDevLogin} noValidate>
              <label className={styles.field} htmlFor={inputId}>
                개발용 식별 문자열
                <input
                  id={inputId}
                  className={styles.input}
                  value={memberId}
                  onChange={(event) => setMemberId(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              <button type="submit" className={styles.submit} disabled={submitting}>
                {submitting ? "로그인하는 중" : "개발용 로그인"}
              </button>
              {error && (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              )}
            </form>
          </section>
        )}
      </div>
    </main>
  );
}

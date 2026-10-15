"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { ApiResult } from "@/lib/api-response";
import { api, devLoginEnabled } from "@/lib/api";
import { authSessionIntegrationEnabled } from "@/lib/auth-integration";
import { afterLoginPath } from "@/lib/member-navigation";
import { useMemberLookup } from "./use-member-lookup";
import { LookupFailedState } from "@/components/status/status";
import { SessionLoginPanel } from "./session-login-panel";
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
 * 로그인 진입(`/login`). 화면 틀은 D, 실제 Google 로그인은 A 담당(OQ-A1)이라 '연결 전'으로 둔다.
 * 개발용 로그인(#87)은 NEXT_PUBLIC_DEV_LOGIN_ENABLED=true일 때만 보이며, Google 로그인처럼 보이지 않게 따로 둔다.
 */
export function LoginPanel() {
  // 공통 인증(#286) 연결은 통합 시험 전환이 켜졌을 때만 쓴다(미결 정책 결정 전 제품 경로 보류).
  return authSessionIntegrationEnabled ? <SessionLoginPanel /> : <LegacyLoginPanel />;
}

function LegacyLoginPanel() {
  const router = useRouter();
  const { session, me, retry } = useMemberLookup("login");
  useEffect(() => {
    if (session.token && me.state === "loaded") {
      router.replace(afterLoginPath(me.displayName, new URLSearchParams(window.location.search).get("next")));
    }
  }, [session, me, router]);
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
    const result = await api.devLogin(memberId, { signal: abort.signal });
    if (abort.signal.aborted) return;
    if (result.kind === "success") {
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

        {session.token && (me.state === "failed" ? <LookupFailedState title="회원 정보를 불러오지 못했습니다" onRetry={retry} /> : <p role="status">회원 정보를 확인하고 있습니다.</p>)}
        {devLoginEnabled && !session.token && (
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

"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { LoadingState, LookupFailedState } from "@/components/status/status";
import { accessTokenStore, EMPTY_ACCESS_TOKEN_STATE } from "@/lib/access-token";
import { api } from "@/lib/api";
import { authSessionIntegrationEnabled } from "@/lib/auth-integration";
import { routes } from "@/lib/routes";
import { readConnection, startConnection, type ConnectionLookup } from "./github-connection-api";
import {
  connectionStatusView, createStartControl, githubConnectionMessages, githubStartBlockedReason, noticeNextStep, type GitHubNotice,
} from "./github-connection-screen";
import authStyles from "@/components/auth/auth.module.css";
import styles from "./github-connection.module.css";

// 통합 시험 전환은 빌드할 때 정해지므로 화면마다 다시 판정하지 않는다.
const startBlockedReason = githubStartBlockedReason(authSessionIntegrationEnabled);

/**
 * GitHub 연동 화면(W02-G, #253). `/profile/github`와 콜백 화면(`/github/callback`)이 함께 쓴다.
 * - 연결 상태는 GET /v1/me를 세션·재조회별로 읽는다. 이전 세션(다른 회원)의 응답은 쓰지 않는다. 조회 실패는 미연결로 바꾸지 않는다.
 * - [GitHub 연결]·[다시 연결]은 시작 API 뒤 GitHub로 전체 이동한다. 통합 시험 전환을 끈 제품 기본값에서는 누를 수 없게 두고 이유를 보인다.
 *   연결 해제·다른 계정 교체는 10월 화면에 없다.
 * - [돌아가기]는 진입 출처를 보존하지 않으므로 홈으로 간다(W02-G 「출처 불명은 홈」).
 */
export function GitHubConnectionPanel({ notice = null }: { notice?: GitHubNotice | null }) {
  const reasonId = useId();
  const session = useSyncExternalStore(accessTokenStore.subscribe, accessTokenStore.get, () => EMPTY_ACCESS_TOKEN_STATE);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ session: typeof session; attempt: number; lookup: ConnectionLookup } | null>(null);
  const [resultNotice, setResultNotice] = useState(notice);
  const statusRef = useRef<HTMLDivElement>(null);
  const focusAfterRetry = useRef(false);
  const [control] = useState(() => createStartControl({
    start: () => startConnection(api),
    redirect: (url) => window.location.assign(url),
  }));
  const start = useSyncExternalStore(control.subscribe, control.getView, control.getView);
  useEffect(() => control.attach(), [control]);

  useEffect(() => {
    if (!session.token) return;
    const abort = new AbortController();
    // 조회 함수는 결과로 실패를 돌려준다. 예상 밖 예외도 조회 실패로 보이고 미연결로 바꾸지 않는다.
    void readConnection(api, abort.signal).catch((): ConnectionLookup => ({ kind: "failed" })).then((lookup) => {
      if (!abort.signal.aborted && accessTokenStore.get() === session) setResult({ session, attempt, lookup });
    });
    return () => abort.abort();
  }, [session, attempt]);

  useEffect(() => {
    // GitHub에서 뒤로 가기로 이 화면이 그대로 복원되면 막아 둔 버튼을 열고 상태를 다시 읽는다.
    const onShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      control.reset();
      setAttempt((value) => value + 1);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, [control]);

  const lookup = result?.session === session && result.attempt === attempt ? result.lookup : null;
  useEffect(() => {
    // [다시 불러오기]로 다시 읽은 뒤에는 상태 영역으로 초점을 옮긴다(W02-G 접근성 제안). 처음 조회는 초점을 옮기지 않는다.
    if (lookup?.kind === "loaded" && focusAfterRetry.current) statusRef.current?.focus();
    if (lookup) focusAfterRetry.current = false;
  }, [lookup]);

  const shownNotice = start.notice ?? (start.busy ? null : resultNotice);
  const status = lookup?.kind === "loaded"
    ? connectionStatusView(lookup.connection, { retried: shownNotice !== null, startBlockedReason })
    : null;
  const nextStep = shownNotice ? noticeNextStep(shownNotice, status) : null;

  return (
    <main className={authStyles.page}>
      <div className={authStyles.panel}>
        <h1 className={authStyles.title}>GitHub 연결</h1>
        <p className={authStyles.lead}>{githubConnectionMessages.lead} {githubConnectionMessages.leadNote}</p>
        {shownNotice && (
          <p className={`${styles.notice} ${shownNotice.tone === "error" ? styles.noticeError : ""}`}>
            {/* 결과만 알림 영역에 둔다. 다음 행동은 상태를 읽은 뒤 덧붙으므로 밖에 두어 같은 안내를 다시 읽히지 않는다. */}
            <span role={shownNotice.tone === "error" ? "alert" : "status"}>{shownNotice.text}</span>
            {nextStep && ` ${nextStep}`}
          </p>
        )}
        {lookup === null && <LoadingState>{githubConnectionMessages.loading}</LoadingState>}
        {lookup?.kind === "failed" && (
          <LookupFailedState
            title={githubConnectionMessages.lookupFailed}
            onRetry={() => { focusAfterRetry.current = true; setAttempt((value) => value + 1); }}
          />
        )}
        {status && (
          <>
            <div ref={statusRef} className={styles.status} tabIndex={-1}>
              <p className={styles.statusLabel}>상태: {status.label}</p>
              {status.account && <p className={styles.account}>GitHub 계정: {status.account}</p>}
              {status.description && <p className={styles.description}>{status.description}</p>}
            </div>
            <div className={styles.actions}>
              {status.action.kind === "start" && (
                <button
                  type="button"
                  className={styles.startButton}
                  disabled={start.busy}
                  aria-busy={start.busy}
                  onClick={() => { setResultNotice(null); void control.press(); }}
                >
                  {start.busy ? githubConnectionMessages.starting : status.action.label}
                </button>
              )}
              {status.action.kind === "unavailable" && (
                <>
                  <button type="button" className={styles.unavailableButton} disabled aria-describedby={reasonId}>
                    {status.action.label}
                  </button>
                  <p id={reasonId} className={styles.unavailableReason}>{status.action.reason}</p>
                </>
              )}
              {status.action.kind === "link" && (
                <Link href={status.action.href} className={styles.primaryLink}>{status.action.label}</Link>
              )}
              <Link href={routes.home} className={styles.backLink}>돌아가기</Link>
            </div>
          </>
        )}
        {lookup?.kind === "failed" && (
          <div className={styles.actions}>
            <Link href={routes.home} className={styles.backLink}>돌아가기</Link>
          </div>
        )}
      </div>
    </main>
  );
}

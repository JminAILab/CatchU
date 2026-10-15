"use client";

import { usePathname, useRouter } from "next/navigation";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { LoadingState, LookupFailedState } from "@/components/status/status";
import { decideAuthGate, type ReauthNoticeProps } from "@/lib/auth-gate";
import { authRuntime } from "@/lib/auth-runtime";
import { loginPath, decideMemberEntry, safeNextPath } from "@/lib/member-navigation";
import { routes } from "@/lib/routes";
import { useAuth, useEnsureRestored, useLastScopeGeneration } from "./use-auth";
import { useSessionMemberLookup } from "./use-session-member-lookup";
import styles from "./auth.module.css";

/**
 * 공통 인증으로 움직이는 회원 경로 가드(#286 6단계, 통합 시험 전환이 켜졌을 때만 쓴다: `auth-integration.ts`). 인증 판정은 `decideAuthGate()`, 회원 조회에 따른 이동은 #261 `decideMemberEntry()`를 따른다.
 * - 복원 확인 중에는 이동하지 않는다. 비로그인이 확정된 경우에만 로그인 화면으로 보낸다(현재 경로를 `next`로).
 * - 재인증이 필요하면 화면·입력을 유지하고 안내 자리를 연다. 안내 컴포넌트는 #287이 `renderReauthNotice`로 넘긴다.
 * - 이 화면의 세션에서 시작한 로그아웃(다른 탭의 유효한 완료 포함)이 `done`이면 비로그인 홈으로 보낸다(#55·#251 접점 4).
 *   로그아웃 뒤 회원 경로로 새로 들어오면(비로그인으로 열림) 로그인 진입이다.
 * - 회원 화면은 회원 화면 범위 번호를 key로 둔다. 같은 세션의 Access 갱신에는 다시 만들지 않고, 새 로그인·회원 전환 때만 새로 만든다.
 */
export function SessionMemberGuard({ children, renderReauthNotice }: {
  children: ReactNode;
  renderReauthNotice?: (props: ReauthNoticeProps) => ReactNode;
}) {
  useEnsureRestored();
  const auth = useAuth();
  const lastGeneration = useLastScopeGeneration();
  const router = useRouter();
  const pathname = usePathname();
  const { sessionScope, me, retry } = useSessionMemberLookup(pathname);
  // 비로그인으로 열린 가드는 이전 로그아웃 결과로 비로그인 홈에 보내지 않는다(처음 렌더 때 한 번만 정한다).
  const [openedSignedOut] = useState(() => authRuntime().store.getSnapshot().status === "signed-out");
  const gate = decideAuthGate(auth, openedSignedOut ? null : lastGeneration);
  const entry = gate.action === "show" && me.state !== "idle" ? decideMemberEntry(me, pathname) : null;
  const redirectTo = entry?.action === "redirect" ? entry.to : null;

  useEffect(() => {
    if (gate.action === "to-login") router.replace(loginPath(`${pathname}${window.location.search}`));
    else if (gate.action === "to-landing") router.replace(routes.landing);
    else if (redirectTo) router.replace(redirectTo);
  }, [gate.action, redirectTo, pathname, router]);

  if (gate.action === "restoring") return <main className={styles.page}><LoadingState>로그인 상태를 확인하고 있습니다.</LoadingState></main>;
  if (gate.action === "restore-unconfirmed") {
    return (
      <main className={styles.page}>
        <div className={styles.panel} role="alert">
          <p>로그인 상태를 확인하지 못했습니다.</p>
          {gate.retry
            ? <button type="button" className={styles.submit} onClick={() => { void authRuntime().session.refresh(); }}>다시 확인</button>
            : <button type="button" className={styles.submit} onClick={() => router.push(loginPath(`${pathname}${window.location.search}`))}>다시 로그인</button>}
        </div>
      </main>
    );
  }
  if (gate.action !== "show") {
    return (
      <main className={styles.page}>
        <LoadingState>{gate.action === "to-landing" ? "로그아웃했습니다. 처음 화면으로 이동합니다." : "로그인이 필요합니다. 로그인 화면으로 이동합니다."}</LoadingState>
      </main>
    );
  }
  // 진행 중인 조회도 보일 결과도 없다(보내지 않은 조회·보낼 수 없는 상태). 실패 안내·진행 표시 없이 인증 상태 표시만 둔다.
  if (me.state === "idle") return <main className={styles.page}>{gate.reauth && renderReauthNotice?.({ returnTo: safeNextPath(pathname) })}</main>;
  if (entry?.action === "retry") return <main className={styles.page}><LookupFailedState title="회원 정보를 불러오지 못했습니다" onRetry={retry} /></main>;
  if (entry?.action !== "allow") return <main className={styles.page}><LoadingState>회원 정보를 확인하고 있습니다.</LoadingState></main>;
  return (
    <Fragment key={sessionScope ?? "none"}>
      {gate.reauth && renderReauthNotice?.({ returnTo: safeNextPath(pathname) })}
      {children}
    </Fragment>
  );
}

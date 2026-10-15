"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { LoadingState, LookupFailedState } from "@/components/status/status";
import { accessTokenStore, EMPTY_ACCESS_TOKEN_STATE } from "@/lib/access-token";
import { loginPath, decideMemberEntry } from "@/lib/member-navigation";
import { routes } from "@/lib/routes";
import { useMemberLookup } from "./use-member-lookup";
import styles from "./auth.module.css";

/**
 * 회원 경로 가드(#106). 토큰이 없으면 헤더와 화면을 그리지 않고 로그인 진입으로 보낸다(현재 경로를 `next`로).
 * - 회원 API가 AUTH_REQUIRED·AUTH_INVALID를 돌려주면 API 호출 함수가 토큰을 지우고, 이 가드가 같은 방식으로 보낸다.
 * - 이 화면 묶음에서 로그아웃했으면 비로그인 홈으로 보낸다(#55).
 * - GET /v1/me 성공 시 빈 이름만 최초 입력으로 보내며 조회 실패는 재조회로 처리한다.
 */
export function MemberGuard({ children }: { children: ReactNode }) {
  const { token, ended } = useSyncExternalStore(accessTokenStore.subscribe, accessTokenStore.get, () => EMPTY_ACCESS_TOKEN_STATE);
  const router = useRouter();
  const pathname = usePathname();
  const { me, retry } = useMemberLookup(pathname);
  const decision = decideMemberEntry(me, pathname);
  const redirectTo = decision.action === "redirect" ? decision.to : null;
  // 토큰을 가진 채 열린 이 화면 묶음에서 로그아웃한 경우만 비로그인 홈으로 보낸다.
  // 로그아웃 뒤 회원 경로로 새로 들어오면(토큰 없이 열림) 로그인 진입이다. 처음 렌더 때 한 번만 정한다.
  const [openedWithToken] = useState(() => accessTokenStore.get().token !== null);
  const loggedOut = !token && ended === "logout" && openedWithToken;

  useEffect(() => {
    if (token) {
      if (redirectTo) router.replace(redirectTo);
      return;
    }
    router.replace(loggedOut ? routes.landing : loginPath(`${pathname}${window.location.search}`));
  }, [token, loggedOut, pathname, router, redirectTo]);

  if (!token) {
    return (
      <main className={styles.page}>
        <LoadingState>{loggedOut ? "로그아웃했습니다. 처음 화면으로 이동합니다." : "로그인이 필요합니다. 로그인 화면으로 이동합니다."}</LoadingState>
      </main>
    );
  }
  if (decision.action === "retry") return <main className={styles.page}><LookupFailedState title="회원 정보를 불러오지 못했습니다" onRetry={retry} /></main>;
  if (decision.action !== "allow") return <main className={styles.page}><LoadingState>회원 정보를 확인하고 있습니다.</LoadingState></main>;
  return <>{children}</>;
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { LoadingState } from "@/components/status/status";
import { accessTokenStore } from "@/lib/access-token";
import { api } from "@/lib/api";
import { completeConnection, readCallbackParams } from "./github-connection-api";
import { GitHubConnectionPanel } from "./github-connection-panel";
import { createCallbackControl, githubConnectionMessages } from "./github-connection-screen";
import authStyles from "@/components/auth/auth.module.css";

/**
 * GitHub 콜백 화면(`/github/callback`, #253). GitHub가 승인·취소 뒤 이 주소로 돌려보낸다.
 * - 회원 화면 묶음 안에 있어 회원 경로 가드를 거친다. 토큰이 없으면 완료 요청 없이 로그인으로 가고(`next`에 이 주소를 싣지 않는다),
 *   그때 받은 code는 버린다. 같은 탭 왕복 뒤의 로그인 유지는 공통 인증(#308)의 세션 복원을 쓴다.
 * - query는 한 번만 해석하고, 결과를 보존한 뒤 주소에서 `code`·`state`·`error`를 지운다.
 * - 효과가 다시 실행돼도 다시 해석하거나 완료 요청을 다시 보내지 않는다. 화면을 떠나면 결과만 무시하고 요청은 중단하지 않는다.
 */
export function GitHubCallbackScreen() {
  const router = useRouter();
  const [control] = useState(() => createCallbackControl({
    readCallback: readCallbackParams,
    complete: (input) => completeConnection(api, input),
    session: () => accessTokenStore.get(),
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

  if (view.phase === "panel") return <GitHubConnectionPanel notice={view.notice} />;
  return (
    <main className={authStyles.page}>
      <div className={authStyles.panel}>
        <h1 className={authStyles.title}>GitHub 연결</h1>
        <LoadingState>{view.phase === "checking" ? githubConnectionMessages.checking : githubConnectionMessages.connected}</LoadingState>
      </div>
    </main>
  );
}

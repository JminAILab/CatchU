"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { GoogleStartResult } from "@/lib/auth-screen-contract";
import { authScreenMessages } from "@/lib/auth-screen-messages";
import { createGoogleStartControl } from "@/lib/google-login-screen";
import styles from "./auth.module.css";

/**
 * Google 로그인 버튼(#287). 로그인 화면이 공통 인증(#286)의 `startGoogleLogin`을 넘긴다.
 * 동작은 `createGoogleStartControl()`을 따른다: 누르면 막고 한 번만 시작, `ready`면 Google로 이동, 실패는 이유별 안내 뒤 다시 열기.
 * `next`는 누른 시점의 `/login?next=` 값이다. 검사는 공통 인증이 한다.
 */
export function GoogleLoginButton({ startGoogleLogin }: {
  startGoogleLogin: (next: string | null) => Promise<GoogleStartResult>;
}) {
  const [control] = useState(() => createGoogleStartControl({
    start: startGoogleLogin,
    redirect: (url) => window.location.assign(url),
  }));
  const view = useSyncExternalStore(control.subscribe, control.getView, control.getView);
  useEffect(() => control.attach(), [control]);

  return (
    <>
      <button
        type="button"
        className={styles.googleButtonReady}
        disabled={view.busy}
        aria-busy={view.busy}
        onClick={() => { void control.press(new URLSearchParams(window.location.search).get("next")); }}
      >
        {view.busy ? authScreenMessages.googleStarting : "Google로 로그인"}
      </button>
      {view.notice && <p className={styles.error} role="alert">{view.notice}</p>}
    </>
  );
}

"use client";

import { useLayoutEffect, useRef } from "react";
import type { LogoutRequestResult } from "@/lib/member-session-screen";
import { ProfileMenu } from "./profile-menu";
import styles from "./header.module.css";

export type RecipientHeaderStatus = "checking" | "signed-out" | "signed-in";

/**
 * 로그아웃이 끝나 「로그인」이 보일 때 그 단추로 초점을 옮길지(#649 리뷰).
 * 이 탭에서 누른 로그아웃일 때만 옮기며, [프로필]이 사라져 초점이 문서 본문으로 떨어졌거나 아직 상단 바 안에 있을 때로 한정한다.
 * 다른 탭의 로그아웃이나, 기다리는 동안 사용자가 다른 곳으로 옮긴 초점은 건드리지 않는다.
 */
export function shouldFocusLoginAfterLogout(requested: boolean, active: Element | null, body: Element | null, header: Element | null): boolean {
  if (!requested) return false;
  return active === null || active === body || (header?.contains(active) ?? false);
}

/** 이 탭의 로그아웃 요청 결과. 결과를 돌려주지 않는 연결(통합 시험 전환을 끈 빌드의 즉시 정리)은 `undefined`다. */
type LogoutAttempt = LogoutRequestResult | undefined;

/**
 * 이 탭에서 누른 [로그아웃]·안내의 [다시 시도]를 기억해, 로그아웃이 끝나 「로그인」이 보일 때 한 번만 초점을 옮기게 한다(#649 리뷰 2차).
 * 요청이 완료 없이 끝나면(실패·결과 불명·이동 전 확인에서 머무름·보내지 않음·낡은 결과) 기억을 지운다.
 * 그래야 그 뒤 다른 탭의 로그아웃이 이 탭의 초점·스크롤을 옮기지 않는다. 앞선 요청이 아직 진행 중이라 거절된 요청(`busy`)은 앞선 요청의 결과를 따른다.
 * 예외는 기억만 지우고 그대로 다시 던진다.
 */
export type LogoutFocusRequest = {
  track(result: LogoutAttempt | Promise<LogoutAttempt>): void;
  /** 「로그인」이 보일 때 한 번 읽고 지운다. */
  take(): boolean;
};

export function createLogoutFocusRequest(): LogoutFocusRequest {
  let requested = false;
  return {
    track(result) {
      requested = true;
      void Promise.resolve(result).then((value) => {
        if (endedWithoutLogout(value)) requested = false;
      }, (error: unknown) => {
        requested = false;
        throw error;
      });
    },
    take() {
      const value = requested;
      requested = false;
      return value;
    },
  };
}

function endedWithoutLogout(result: LogoutAttempt): boolean {
  if (result === undefined || result === "busy") return false;
  if (result === "stayed") return true;
  return !(result.kind === "settled" && result.result === "done");
}

/** 받은 사람 헤더의 표시를 맡는다. 공통 미리보기에서도 실제 인증을 시작하지 않고 쓴다. */
export function RecipientHeaderView({ status, onLogin, onLogout, logoutPending = false, logoutDisabled = false, focusRequest }: {
  status: RecipientHeaderStatus;
  onLogin: () => void;
  onLogout?: () => void;
  logoutPending?: boolean;
  logoutDisabled?: boolean;
  /** 이 탭의 로그아웃 요청 기억. 주지 않으면(공통 미리보기) 초점을 옮기지 않는다. */
  focusRequest?: Pick<LogoutFocusRequest, "take">;
}) {
  const headerRef = useRef<HTMLElement>(null);
  const loginRef = useRef<HTMLButtonElement>(null);
  // 회원 화면은 로그아웃 뒤 다른 화면으로 가지만, 받은 링크는 같은 화면에 머물러 [프로필]이 사라지면 초점을 잃는다.
  // 그리기 전에 옮겨 초점이 문서 본문에 머무는 틈을 줄인다(#649 리뷰 2차: 「로그인」이 두 번 낭독됨).
  useLayoutEffect(() => {
    if (status !== "signed-out") return;
    const requested = focusRequest?.take() ?? false;
    if (shouldFocusLoginAfterLogout(requested, document.activeElement, document.body, headerRef.current)) loginRef.current?.focus();
  }, [status, focusRequest]);

  return (
    <header ref={headerRef} className={styles.header}>
      <div className={styles.inner}>
        <span className={styles.brandStatic}>CatchU</span>
        <div className={styles.group}>
          {status === "signed-out" && <button ref={loginRef} type="button" className={styles.menuItem} onClick={onLogin}>로그인</button>}
          {status === "signed-in" && <ProfileMenu onLogout={onLogout} logoutPending={logoutPending} logoutDisabled={logoutDisabled} />}
        </div>
      </div>
    </header>
  );
}

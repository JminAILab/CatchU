"use client";

import { useRouter } from "next/navigation";
import type { ReauthNoticeProps } from "@/lib/auth-gate";
import { authScreenMessages } from "@/lib/auth-screen-messages";
import { confirmReauthLeave } from "@/lib/member-session-screen";
import { loginPath } from "@/lib/member-navigation";
import { unsavedChanges } from "@/lib/unsaved-changes";
import styles from "./auth.module.css";

/**
 * 재인증 안내(#287). 가드가 `renderReauthNotice`로 그린다. 화면·입력의 유지·정리는 가드가 맡는다.
 * [다시 로그인]은 로그아웃·갱신 요청 없이 `loginPath(returnTo)`로 간다(#251 A 답변 3, 팀장 결정 2). 판단은 `confirmReauthLeave()`를 따른다.
 * - `variant` 생략·`reauth`: 회원 화면 위의 안내다. 로그아웃과 같은 이동 전 확인(누른 시점의 미저장 입력·미확정 분석 요청)을 거치고, 머무르면 아무것도 하지 않는다.
 * - `login-changed`: 다른 탭의 새 로그인 감지로 가드가 화면·입력을 이미 정리한 탭이다. 같은 문구에 [다시 로그인]만 두고 묻지 않는다.
 */
export function ReauthNotice({ returnTo, variant }: ReauthNoticeProps) {
  const router = useRouter();
  return (
    <div className={styles.notice} role="alert">
      <p className={styles.noticeText}>{authScreenMessages.reauthRequired}</p>
      <button
        type="button"
        className={styles.noticeAction}
        onClick={() => {
          if (confirmReauthLeave(variant, unsavedChanges, (message) => window.confirm(message))) {
            router.push(loginPath(returnTo ?? undefined));
          }
        }}
      >
        다시 로그인
      </button>
    </div>
  );
}

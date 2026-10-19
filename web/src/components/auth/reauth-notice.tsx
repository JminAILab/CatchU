"use client";

import { useRouter } from "next/navigation";
import type { ReauthNoticeProps } from "@/lib/auth-gate";
import { authScreenMessages } from "@/lib/auth-screen-messages";
import { confirmReauthLeave } from "@/lib/member-session-screen";
import { loginPath } from "@/lib/member-navigation";
import { unsavedChanges } from "@/lib/unsaved-changes";
import styles from "./auth.module.css";

/**
 * 재인증 안내(#287). 가드가 `renderReauthNotice`로 회원 화면 위에 그린다. 아래 화면·입력은 가드가 유지한다.
 * [다시 로그인]은 로그아웃·갱신 요청 없이 `loginPath(returnTo)`로 간다(#251 A 답변 3).
 * - 일반 재인증: 로그아웃과 같은 미저장 확인을 거친다. 머무르면 아무것도 하지 않는다.
 * - `inputCleared`: 로그인 표식 변경 뒤 공통 인증이 화면·입력을 이미 정리한 탭(팀장 답변 2). 같은 문구에 [다시 로그인]만 두고 묻지 않는다.
 *   이 값은 #286이 정해 넘긴다.
 */
export function ReauthNotice({ returnTo, inputCleared = false }: ReauthNoticeProps & { inputCleared?: boolean }) {
  const router = useRouter();
  return (
    <div className={styles.notice} role="alert">
      <p className={styles.noticeText}>{authScreenMessages.reauthRequired}</p>
      <button
        type="button"
        className={styles.noticeAction}
        onClick={() => {
          if (confirmReauthLeave(inputCleared, unsavedChanges, (message) => window.confirm(message))) {
            router.push(loginPath(returnTo ?? undefined));
          }
        }}
      >
        다시 로그인
      </button>
    </div>
  );
}

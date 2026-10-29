import type { CallbackParse, GoogleCompletionResult, GoogleFailureReason } from "./auth-google.ts";
import type { LogoutResult } from "./auth-state.ts";
import type { UnsavedReason } from "./unsaved-changes.ts";

/**
 * 인증 화면(#287)의 안내 문구. 화면은 이 파일의 문구만 쓰고, code·state·`loginAttemptToken`·토큰이나 서버 응답 원문을 섞지 않는다.
 *
 * 출처 표시: 모든 문구가 [합의]다. 출처는 #251 기록(https://github.com/JminAILab/CatchU/issues/251#issuecomment-6487881554)이다.
 * - D 검토안(https://github.com/JminAILab/CatchU/issues/287#issuecomment-6485961477)의 「수정 제안」을 따르고, 「유지」는 그 전 문구를 그대로 둔다.
 *   그 전에 합의된 문구는 로그아웃 결과 불명(#251 5번 합의, https://github.com/JminAILab/CatchU/issues/251#issuecomment-6139957700)과
 *   Google 사용 불가(`unavailable`, 시도 보관 실패 포함: A 답변 2, https://github.com/JminAILab/CatchU/issues/251#issuecomment-6187946262)다.
 * - 일반 로그인 실패·네트워크 오류는 화면마다 다음 행동이 다르다. 시작 화면(Google 버튼)은 같은 버튼을 다시 누르므로 "다시 시도",
 *   콜백 화면은 [다시 로그인]에 맞춰 "다시 로그인"이다.
 * - 이동 전 확인은 "사라지는 것 → 이미 보낸 분석 요청은 취소되지 않음(해당할 때) → 확인 질문" 순서로 줄을 나누고(`\n`), 확인 질문 앞은 빈 줄이다.
 *   사유 조합(없음·입력만·분석 요청만·둘 다)의 처리는 A 답변 1(https://github.com/JminAILab/CatchU/issues/287#issuecomment-6310239160)을 따른다.
 */
export const authScreenMessages = {
  /** [합의] #251 5번 */
  logoutUnknownRetry: "로그아웃이 완료됐는지 확인하지 못했습니다. 다시 시도해 주세요.",
  /** [합의] #251 5번: 다시 시도할 수 없으면 다시 시도를 안내하지 않는다. */
  logoutUnknown: "로그아웃이 완료됐는지 확인하지 못했습니다.",
  /** [합의] A 답변 2 */
  googleUnavailable: "지금은 Google 로그인을 사용할 수 없습니다.",

  /** [합의] */
  googleCancelled: "Google 로그인을 취소했습니다.",
  /** [합의] 시작 화면. 원인(시도 만료·이미 사용·검증 실패·비활성 회원)을 단정하지 않는다(#251 1번). 회원 인증 만료 문구와 다르다. */
  startLoginFailed: "로그인하지 못했습니다. 다시 시도해 주세요.",
  /** [합의] 콜백 화면. 완료 요청의 일반 실패와 콜백 해석 오류(`provider-error`·`malformed`)가 함께 쓴다. 회원 인증 만료 문구와 다르다. */
  callbackLoginFailed: "로그인하지 못했습니다. 다시 로그인해 주세요.",
  /** [합의] 시작 화면 */
  startNetworkFailed: "네트워크 연결을 확인한 뒤 다시 시도해 주세요.",
  /** [합의] 콜백 화면 */
  callbackNetworkFailed: "네트워크 연결을 확인한 뒤 다시 로그인해 주세요.",
  /** [합의] 재인증 안내의 `reauth`와 `login-changed`(표식 변경 뒤 입력을 정리한 탭)가 같은 문구를 쓴다(팀장 결정 2). 원인을 만료로 단정하지 않는다. */
  reauthRequired: "로그인 상태를 확인할 수 없습니다. 다시 로그인해 주세요.",
  /** [합의] */
  logoutFailedRetry: "로그아웃하지 못했습니다. 다시 시도해 주세요.",
  /** [합의] 다시 시도할 수 없을 때. 다시 시도를 안내하지 않는다. */
  logoutFailed: "로그아웃하지 못했습니다.",

  /** [합의] 다시 열린 콜백(이미 보낸 완료). 보낸 완료의 성공·실패를 단정하지 않고 새 로그인을 안내한다. */
  callbackAlreadySent: "로그인 결과를 확인하지 못했습니다. 다시 로그인해 주세요.",
  /** [합의] 보관한 시도가 없음(`no-attempt`)·시한이 지남(`expired`)·다른 시도의 콜백(`state-mismatch`). 문구만 같고 해석 결과의 구분은 그대로다. */
  callbackAttemptUnverified: "로그인 정보를 확인할 수 없습니다. 다시 로그인해 주세요.",
  /** [합의] 완료 요청 응답 대기 */
  callbackChecking: "Google 로그인을 확인하고 있습니다.",
  /** [합의] Google 버튼을 누른 뒤 이동 전 */
  googleStarting: "Google로 이동하는 중",
  /** [합의] */
  logoutPending: "로그아웃하는 중",
  /** [합의] 로그아웃 전 미저장 확인(#51 이탈 확인). 확인=로그아웃, 취소=머무르기. */
  logoutUnsavedConfirm: "저장하지 않은 입력이 사라집니다.\n\n로그아웃하시겠습니까?",
  /** [합의] 접수 결과를 확인하지 못한 분석 요청만 있을 때. 사라지는 것은 이 화면의 요청 확인 정보이고, 이미 보낸 요청은 취소되지 않는다. */
  logoutRequestConfirm: "이 화면의 분석 요청 확인 정보가 사라집니다.\n이미 보낸 분석 요청은 취소되지 않습니다.\n\n로그아웃하시겠습니까?",
  /** [합의] 미저장 입력과 분석 요청이 함께 있을 때 두 내용을 한 창에서 묻는다. */
  logoutUnsavedRequestConfirm: "저장하지 않은 입력과 이 화면의 분석 요청 확인 정보가 사라집니다.\n이미 보낸 분석 요청은 취소되지 않습니다.\n\n로그아웃하시겠습니까?",
  /** [합의] 재인증 [다시 로그인] 전 미저장 확인. 입력은 메모리에만 있어 이동하면 남지 않으므로 "사라집니다"다. */
  reauthUnsavedConfirm: "저장하지 않은 입력이 사라집니다.\n\n로그인 화면으로 이동하시겠습니까?",
  /** [합의] [다시 로그인] 전, 분석 요청만 있을 때. */
  reauthRequestConfirm: "이 화면의 분석 요청 확인 정보가 사라집니다.\n이미 보낸 분석 요청은 취소되지 않습니다.\n\n로그인 화면으로 이동하시겠습니까?",
  /** [합의] [다시 로그인] 전, 미저장 입력과 분석 요청이 함께 있을 때. */
  reauthUnsavedRequestConfirm: "저장하지 않은 입력과 이 화면의 분석 요청 확인 정보가 사라집니다.\n이미 보낸 분석 요청은 취소되지 않습니다.\n\n로그인 화면으로 이동하시겠습니까?",
} as const;

/** 실패 안내를 띄우는 화면. 시작 화면은 Google 버튼, 콜백 화면은 `/google/callback`이다. */
type LoginScreen = "start" | "callback";

/** 실패 이유별 안내. `superseded`는 안내하지 않는다(null). */
function failureNotice(reason: GoogleFailureReason, screen: LoginScreen): string | null {
  switch (reason) {
    case "superseded": return null;
    case "unavailable": return authScreenMessages.googleUnavailable;
    case "network": return screen === "start" ? authScreenMessages.startNetworkFailed : authScreenMessages.callbackNetworkFailed;
    case "attempt-invalid":
    case "invalid-request":
    case "server":
    case "invalid-response":
      return screen === "start" ? authScreenMessages.startLoginFailed : authScreenMessages.callbackLoginFailed;
  }
}

/** Google 버튼의 시작 실패 안내. */
export function googleStartNotice(reason: GoogleFailureReason): string | null {
  return failureNotice(reason, "start");
}

/** 완료 결과 안내. 성공과 `superseded`는 안내하지 않는다(null). */
export function googleCompletionNotice(result: GoogleCompletionResult): string | null {
  if (result.kind === "signed-in") return null;
  if (result.kind === "cancelled") return authScreenMessages.googleCancelled;
  return failureNotice(result.reason, "callback");
}

/** 완료 요청을 보내지 않는 콜백 해석 결과의 안내. */
export function googleCallbackNotice(kind: Exclude<CallbackParse["kind"], "complete">): string {
  switch (kind) {
    case "already-sent": return authScreenMessages.callbackAlreadySent;
    case "no-attempt":
    case "expired":
    case "state-mismatch":
      return authScreenMessages.callbackAttemptUnverified;
    // 완료 요청의 일반 실패와 같은 안내다.
    case "provider-error":
    case "malformed":
      return authScreenMessages.callbackLoginFailed;
  }
}

/** 로그아웃 실패·불명 안내. 다시 시도할 수 없으면 다시 시도를 안내하지 않는다. `done`은 안내하지 않는다(가드가 이동). */
export function logoutNotice(result: LogoutResult, canRetry: boolean): string | null {
  if (result === "failed") return canRetry ? authScreenMessages.logoutFailedRetry : authScreenMessages.logoutFailed;
  if (result === "unknown") return canRetry ? authScreenMessages.logoutUnknownRetry : authScreenMessages.logoutUnknown;
  return null;
}

/** 이동 전 확인을 거치는 동작: 로그아웃과 재인증 안내의 [다시 로그인]. */
export type LeaveAction = "logout" | "reauth";

/** 동작별·사유별 확인 문구. 사유는 지금 두 가지라 둘이 함께 있으면 `both` 문구 하나로 묻는다. */
const leaveConfirmMessages: Record<LeaveAction, Record<UnsavedReason | "both", string>> = {
  logout: {
    "unsaved-input": authScreenMessages.logoutUnsavedConfirm,
    "unconfirmed-analysis-request": authScreenMessages.logoutRequestConfirm,
    both: authScreenMessages.logoutUnsavedRequestConfirm,
  },
  reauth: {
    "unsaved-input": authScreenMessages.reauthUnsavedConfirm,
    "unconfirmed-analysis-request": authScreenMessages.reauthRequestConfirm,
    both: authScreenMessages.reauthUnsavedRequestConfirm,
  },
};

/**
 * 이동 전 확인 문구. `reasons`는 누른 시점의 `activeReasons()`(사유마다 한 번)다.
 * 사유가 없으면 묻지 않는다(null). 하나면 그 사유의 문구이고, 둘이면 두 내용을 담은 문구 하나다.
 */
export function leaveConfirmMessage(action: LeaveAction, reasons: readonly UnsavedReason[]): string | null {
  if (reasons.length === 0) return null;
  const messages = leaveConfirmMessages[action];
  return reasons.length === 1 ? messages[reasons[0]] : messages.both;
}

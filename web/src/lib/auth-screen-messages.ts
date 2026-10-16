import type { GoogleCompletionResult, GoogleFailureReason, CallbackParse, LogoutResult } from "./auth-screen-contract.ts";

/**
 * 인증 화면(#287)의 안내 문구. 화면은 이 파일의 문구만 쓰고, code·state·`loginAttemptToken`·토큰이나 서버 응답 원문을 섞지 않는다.
 *
 * 출처 표시
 * - [합의]: #251에서 양쪽이 확인한 문구. 그대로 쓴다.
 *   - 로그아웃 결과 불명: #251 5번 합의(https://github.com/JminAILab/CatchU/issues/251#issuecomment-6139957700).
 *     다시 시도할 수 없는 상태에서는 다시 시도를 안내하지 않는다(같은 합의).
 *   - Google 사용 불가(`unavailable`, 시도 보관 실패 포함): A 답변 2(https://github.com/JminAILab/CatchU/issues/251#issuecomment-6187946262).
 * - [제안]: 아직 확정되지 않은 문구. 연결 전에 #251에서 정한다. #251 12번 초안(https://github.com/JminAILab/CatchU/issues/251#issuecomment-6162564432)과
 *   이번에 새로 쓴 문구가 여기에 든다. 안내의 종류(취소·실패·네트워크·새 로그인 안내)는 #251 1번·접점 답변으로 합의됐다.
 */
export const authScreenMessages = {
  /** [합의] #251 5번 */
  logoutUnknownRetry: "로그아웃이 완료됐는지 확인하지 못했습니다. 다시 시도해 주세요.",
  /** [합의] #251 5번: 다시 시도할 수 없으면 다시 시도를 안내하지 않는다. */
  logoutUnknown: "로그아웃이 완료됐는지 확인하지 못했습니다.",
  /** [합의] A 답변 2 */
  googleUnavailable: "지금은 Google 로그인을 사용할 수 없습니다.",

  /** [제안] 12번 초안 */
  googleCancelled: "Google 로그인을 취소했습니다.",
  /** [제안] 12번 초안. 원인(시도 만료·이미 사용·검증 실패·비활성 회원)을 단정하지 않는다(#251 1번). 회원 인증 만료 문구와 다르다. */
  loginFailed: "로그인하지 못했습니다. 다시 시도해 주세요.",
  /** [제안] 12번 초안 */
  networkFailed: "네트워크 연결을 확인한 뒤 다시 로그인해 주세요.",
  /** [제안] 12번 초안. 재인증 안내와 표식 변경 뒤 입력을 정리한 탭이 같은 문구를 쓴다(팀장 답변 2). */
  reauthRequired: "로그인 상태를 확인할 수 없습니다. 다시 로그인해 주세요.",
  /** [제안] 12번 초안 */
  logoutFailedRetry: "로그아웃하지 못했습니다. 다시 시도해 주세요.",
  /** [제안] 12번 초안에서 다시 시도 안내를 뺀 문구(다시 시도할 수 없을 때). */
  logoutFailed: "로그아웃하지 못했습니다.",

  /** [제안] 새 문구: 다시 열린 콜백(이미 보낸 완료). 결과를 단정하지 않고 새 로그인을 안내한다. */
  callbackAlreadySent: "이 로그인의 결과를 확인할 수 없습니다. 다시 로그인해 주세요.",
  /** [제안] 새 문구: 보관한 시도가 없거나 시한이 지남. */
  callbackAttemptMissing: "로그인 시간이 지났거나 로그인 정보를 찾을 수 없습니다. 다시 로그인해 주세요.",
  /** [제안] 새 문구: 다른 로그인 시도의 콜백. */
  callbackStateMismatch: "다른 로그인 요청의 결과입니다. 다시 로그인해 주세요.",
  /** [제안] 새 문구: 완료 요청 응답 대기. */
  callbackChecking: "Google 로그인을 확인하고 있습니다.",
  /** [제안] 새 문구: Google 버튼을 누른 뒤 이동 전. */
  googleStarting: "Google로 이동하는 중",
  /** [제안] 새 문구 */
  logoutPending: "로그아웃하는 중",
  /** [제안] 새 문구: 로그아웃 전 미저장 확인(#51 이탈 확인). 확인=로그아웃, 취소=머무르기. */
  logoutUnsavedConfirm: "저장하지 않은 입력이 있습니다. 로그아웃하면 입력한 내용이 사라집니다. 로그아웃하시겠습니까?",
  /** [제안] 11번 초안에 확인 질문을 더한 문구: 재인증 [다시 로그인] 전 미저장 확인. */
  reauthUnsavedConfirm: "다시 로그인하면 입력하던 내용이 사라질 수 있습니다. 로그인 화면으로 이동하시겠습니까?",
} as const;

/** 실패 이유별 안내. `superseded`는 안내하지 않는다(null). */
function failureNotice(reason: GoogleFailureReason): string | null {
  switch (reason) {
    case "superseded": return null;
    case "unavailable": return authScreenMessages.googleUnavailable;
    case "network": return authScreenMessages.networkFailed;
    case "attempt-invalid":
    case "invalid-request":
    case "server":
    case "invalid-response":
      return authScreenMessages.loginFailed;
  }
}

/** Google 버튼의 시작 실패 안내. */
export function googleStartNotice(reason: GoogleFailureReason): string | null {
  return failureNotice(reason);
}

/** 완료 결과 안내. 성공과 `superseded`는 안내하지 않는다(null). */
export function googleCompletionNotice(result: GoogleCompletionResult): string | null {
  if (result.kind === "signed-in") return null;
  if (result.kind === "cancelled") return authScreenMessages.googleCancelled;
  return failureNotice(result.reason);
}

/** 완료 요청을 보내지 않는 콜백 해석 결과의 안내. */
export function googleCallbackNotice(kind: Exclude<CallbackParse["kind"], "complete">): string {
  switch (kind) {
    case "already-sent": return authScreenMessages.callbackAlreadySent;
    case "no-attempt":
    case "expired":
      return authScreenMessages.callbackAttemptMissing;
    case "state-mismatch": return authScreenMessages.callbackStateMismatch;
    case "provider-error":
    case "malformed":
      return authScreenMessages.loginFailed;
  }
}

/** 로그아웃 실패·불명 안내. 다시 시도할 수 없으면 다시 시도를 안내하지 않는다. `done`은 안내하지 않는다(가드가 이동). */
export function logoutNotice(result: LogoutResult, canRetry: boolean): string | null {
  if (result === "failed") return canRetry ? authScreenMessages.logoutFailedRetry : authScreenMessages.logoutFailed;
  if (result === "unknown") return canRetry ? authScreenMessages.logoutUnknownRetry : authScreenMessages.logoutUnknown;
  return null;
}

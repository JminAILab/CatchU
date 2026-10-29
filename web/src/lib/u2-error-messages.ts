/**
 * 12월 intent U2 오류 코드 셋의 화면 안내(비기능 NFR7.1, 기능 설계 BR1.4·BR2.2·BR7.4).
 * 화면은 문구가 아니라 code로 분기한다. 한도 안내에는 남은 횟수·한도 값을 넣지 않는다(BR1.4).
 * `AI_CONSENT_REQUIRED`는 문구 대신 동의 창(`components/ai-consent`)을 연다. 이 문구는 동의 창을 열 수 없는 자리의 안내다.
 */
import type { ClientResult } from "./api-client.ts";

export const U2_ERROR_MESSAGES = {
  DAILY_LIMIT_REACHED: "오늘 한도에 도달했습니다",
  AI_CONSENT_REQUIRED: "외부 AI 전송에 먼저 동의해 주세요.",
  WITHDRAWAL_FAILED: "탈퇴를 끝내지 못했습니다. 팀에 알려 주세요",
} as const;

export type U2ErrorCode = keyof typeof U2_ERROR_MESSAGES;

/** 결과가 U2 오류 코드 셋 중 하나면 그 안내, 아니면 null(각 화면의 일반 오류 안내를 쓴다). */
export function u2ErrorMessage(result: ClientResult): string | null {
  if (result.kind !== "api-error") return null;
  return Object.hasOwn(U2_ERROR_MESSAGES, result.code) ? U2_ERROR_MESSAGES[result.code as U2ErrorCode] : null;
}

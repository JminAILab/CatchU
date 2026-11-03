import type { ClientResult } from "./api-client.ts";
import { memberMutationOutcome } from "./auth-api.ts";

/**
 * 작성자 편집 화면(Catch 설명·텍스트 자료, U4)의 저장 실패 구분과 안내 문구(BR2.3, NFR6.1·NFR7.5).
 * 응답이 성공하고 모양이 맞을 때만 저장 성공이다. 그 밖은 모두 저장되지 않은 것으로 안내하고 입력은 화면이 그대로 둔다.
 * 문구에 입력값·토큰·서버 메시지를 넣지 않는다.
 */
export type SaveFailure =
  | "login-expired"
  | "renewed-rejected"
  | "not-sent"
  | "validation"
  | "not-found"
  | "rate-limited"
  | "server"
  | "unknown";

export const SAVE_FAILED_TEXT = "저장되지 않았습니다";
export const SAVED_TEXT = "저장됨";
export const LOGIN_EXPIRED_TEXT = "로그인이 만료되었습니다. 다시 로그인한 뒤 저장해 주세요. 쓰던 내용은 화면에 남아 있습니다.";

const MEMBER_AUTH_FAILURES = new Set(["AUTH_REQUIRED", "AUTH_INVALID"]);

/** 성공이 아닌 결과(또는 성공이지만 모양이 틀린 응답)를 실패 구분으로 바꾼다. */
export function saveFailureOf(result: ClientResult): SaveFailure {
  const outcome = memberMutationOutcome(result);
  if (outcome === "renewed-rejected" || outcome === "not-sent") return outcome;
  if (result.kind === "api-error") {
    if (result.status === 401 && MEMBER_AUTH_FAILURES.has(result.code)) return "login-expired";
    if (result.status === 400) return "validation";
    if (result.status === 404) return "not-found";
    if (result.status === 429) return "rate-limited";
    if (result.status >= 500) return "server";
  }
  return "unknown";
}

/** 실패 이유 한 줄. 화면은 `SAVE_FAILED_TEXT` 아래에 이 문장을 보인다. */
export function saveFailureReason(failure: SaveFailure): string {
  switch (failure) {
    case "login-expired": return LOGIN_EXPIRED_TEXT;
    case "renewed-rejected": return "로그인이 연장되었습니다. 다시 눌러 주세요.";
    case "not-sent": return "지금은 요청을 보내지 않았습니다. 입력은 그대로 두었습니다.";
    case "validation": return "입력 길이나 형식을 확인해 주세요.";
    case "not-found": return "이 자료를 찾을 수 없습니다. 목록으로 돌아가 다시 열어 주세요.";
    case "rate-limited": return "요청이 많아 잠시 뒤에 다시 저장해 주세요.";
    case "server": return "서버에서 처리하지 못했습니다. 잠시 뒤 다시 저장해 주세요.";
    case "unknown": return "저장 결과를 확인하지 못했습니다. 다시 저장해 주세요.";
  }
}

/** 편집 화면의 저장 상태. `saved`는 성공 응답을 받은 뒤에만 쓴다. */
export type EditStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "invalid"; message: string }
  | { kind: "failed"; failure: SaveFailure };

/** 상태 줄. 실패·검사 거부는 alert, 저장 중·저장됨은 status로 읽힌다. 표시할 것이 없으면 null. */
export function editStatusLines(status: EditStatus): { tone: "status" | "alert"; lines: string[] } | null {
  switch (status.kind) {
    case "idle": return null;
    case "saving": return { tone: "status", lines: ["저장하고 있습니다."] };
    case "saved": return { tone: "status", lines: [SAVED_TEXT] };
    case "invalid": return { tone: "alert", lines: [SAVE_FAILED_TEXT, status.message] };
    case "failed": return { tone: "alert", lines: [SAVE_FAILED_TEXT, saveFailureReason(status.failure)] };
  }
}

/** 유니코드 코드 포인트 수. api 검증(NFR4.2)과 같은 기준으로 센다. */
export function codePointLength(value: string): number {
  return Array.from(value).length;
}

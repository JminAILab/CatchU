/**
 * 인증 화면(#287)이 공통 인증(#286)에서 받는 값의 최소 타입. 판정·저장·요청 로직은 두지 않는다.
 *
 * 정본은 #286의 `auth-google.ts`·`auth-state.ts`·`auth-logout.ts`·`auth-gate.ts`([PR #308](https://github.com/JminAILab/CatchU/pull/308) `5aa72e0`)이며,
 * 화면이 읽는 필드만 같은 이름·모양으로 옮겼다. #286이 dev에 들어오면 연결 단계에서 화면이 #286의 타입을 직접 쓰도록 바꾸고 이 파일을 지운다.
 */
import type { MeLookup } from "./member-navigation.ts";

/** 시작·완료 실패 이유 7종(#251 1번 합의). `superseded`는 화면이 안내·이동 없이 무시한다. */
export type GoogleFailureReason =
  | "attempt-invalid" | "unavailable" | "invalid-request" | "server" | "network" | "invalid-response" | "superseded";

export type GoogleStartResult = { kind: "ready"; authorizationUrl: string } | { kind: "failed"; reason: GoogleFailureReason };

export type GoogleCompletionInput =
  | { state: string; loginAttemptToken: string; code: string }
  | { state: string; loginAttemptToken: string; error: "access_denied" };

export type GoogleCompletionResult =
  | { kind: "signed-in"; suggestedDisplayName: string | null }
  | { kind: "cancelled" }
  | { kind: "failed"; reason: GoogleFailureReason };

/** 콜백 query 해석 결과. `complete`의 `next`는 #286이 보관값을 다시 검사한 이동 경로다(#251 A 답변 2). */
export type CallbackParse =
  | { kind: "complete"; input: GoogleCompletionInput; next: string | null }
  | { kind: "already-sent" }
  | { kind: "no-attempt" }
  | { kind: "expired" }
  | { kind: "state-mismatch" }
  | { kind: "provider-error" }
  | { kind: "malformed" };

export type LogoutResult = "done" | "failed" | "unknown";

/** `logout()`의 결과. `not-started`·`discarded`는 안내 없이 넘어간다(#251 A 답변 1). */
export type LogoutOutcome =
  | { kind: "settled"; result: LogoutResult }
  | { kind: "not-started" }
  | { kind: "discarded"; sent: boolean };

export type LogoutState =
  | { phase: "idle" }
  | { phase: "pending"; fromGeneration: number; loginStartedAfter: boolean }
  | { phase: "settled"; result: LogoutResult; fromGeneration: number; loginStartedAfter: boolean };

/** 로그아웃 표시에 쓰는 공통 인증 상태의 일부(#286 `AuthSnapshot`). */
export type LogoutSnapshot = { generation: number; logout: LogoutState; canRetryLogout: boolean };

/**
 * 공통 인증판 회원 조회(#286 `lookupMemberWithAuth`)의 결과. `skipped`는 보내지 않았거나 이전 세션 응답이라 결과가 없는 조회다.
 * 조회 실패로도 성공으로도 보이지 않는다(#251 A 답변 1).
 */
export type MemberLookupOutcome = MeLookup | { state: "skipped" };

/** 가드가 재인증 안내에 넘기는 값. `returnTo`는 `safeNextPath()`를 통과한 현재 회원 경로다. */
export type ReauthNoticeProps = { returnTo: string | null };

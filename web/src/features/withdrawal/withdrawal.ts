/**
 * 회원 탈퇴 화면 판정(12월 intent U2 기능 설계 W7·BR7.1·BR7.4·BR7.5, 비기능 NFR7.1).
 * - 확인창을 한 번 거친 뒤 `DELETE /v1/me`를 보낸다. 본문은 없다.
 * - 204만 성공이다. 성공하면 페이지 전체를 비로그인 홈으로 다시 열어(메모리 토큰을 버림) "탈퇴했습니다"를 보인다.
 * - 500 `WITHDRAWAL_FAILED`는 그 안내를, 응답을 받지 못했으면 결과를 모른다고 안내한다. 실패를 성공으로 보이지 않는다.
 */
import type { ClientResult, MemberRequest } from "../../lib/api-client.ts";
import { routes } from "../../lib/routes.ts";
import { U2_ERROR_MESSAGES } from "../../lib/u2-error-messages.ts";

export const WITHDRAWAL_TEXT = {
  button: "탈퇴",
  confirm: "탈퇴하면 계정과 자료, 발행 링크, Claude 연결이 바로 지워지고 되돌릴 수 없습니다",
  confirmAction: "탈퇴하기",
  cancel: "취소",
  pending: "탈퇴를 처리하고 있습니다.",
  failed: U2_ERROR_MESSAGES.WITHDRAWAL_FAILED,
  rejected: "탈퇴를 요청하지 못했습니다. 다시 로그인한 뒤 시도해 주세요.",
  unknown: "탈퇴 결과를 확인하지 못했습니다. 다시 로그인해 확인해 주세요.",
  done: "탈퇴했습니다",
} as const;

export type WithdrawalOutcome =
  | { kind: "done" }
  | { kind: "failed"; message: string };

/** 결과를 화면 판정으로 나눈다. 204(성공)만 done이다. */
export function classifyWithdrawal(result: ClientResult): WithdrawalOutcome {
  if (result.kind === "success") return { kind: "done" };
  if (result.kind === "lookup-failed") return { kind: "failed", message: WITHDRAWAL_TEXT.unknown };
  if (result.code === "WITHDRAWAL_FAILED") return { kind: "failed", message: WITHDRAWAL_TEXT.failed };
  return { kind: "failed", message: WITHDRAWAL_TEXT.rejected };
}

/** 회원 API 호출 함수로 탈퇴를 요청한다. */
export async function requestWithdrawal(member: (path: string, request: MemberRequest) => Promise<ClientResult>): Promise<WithdrawalOutcome> {
  return classifyWithdrawal(await member("/me", { method: "DELETE" }));
}

/** 탈퇴 뒤 비로그인 홈 주소. 쿼리에는 표시 여부만 두고 회원 정보는 넣지 않는다. */
export const WITHDRAWN_QUERY = "withdrawn";
export const withdrawnLandingPath = (): string => `${routes.landing}?${WITHDRAWN_QUERY}=1`;

/** 비로그인 홈이 "탈퇴했습니다"를 보일지. */
export function isWithdrawnNotice(value: string | string[] | undefined): boolean {
  return value === "1";
}

export type WithdrawalPhase = "idle" | "confirming" | "sending";

export type WithdrawalDeps = {
  member: (path: string, request: MemberRequest) => Promise<ClientResult>;
  /** 페이지 전체를 그 주소로 다시 연다(브라우저에서는 window.location.replace). */
  navigate: (path: string) => void;
  setPhase: (phase: WithdrawalPhase) => void;
  setMessage: (message: string | null) => void;
};

/**
 * [탈퇴하기]를 눌렀을 때의 처리(BR7.5). 204면 비로그인 홈으로 페이지 전체를 다시 열고(메모리 토큰을 버림),
 * 실패·결과 불명이면 확인창을 닫고 안내만 보인다. 자동으로 다시 보내지 않는다.
 */
export async function confirmWithdrawal({ member, navigate, setPhase, setMessage }: WithdrawalDeps): Promise<void> {
  setPhase("sending");
  setMessage(null);
  const outcome = await requestWithdrawal(member);
  if (outcome.kind === "done") {
    navigate(withdrawnLandingPath());
    return;
  }
  setMessage(outcome.message);
  setPhase("idle");
}

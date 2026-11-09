"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { confirmWithdrawal, type WithdrawalPhase } from "./withdrawal";
import { WithdrawalView } from "./withdrawal-view";

/**
 * 탈퇴 요청과 그 뒤 처리(12월 intent U2 BR7.5). 흐름은 `withdrawal.ts`의 `confirmWithdrawal`이 맡는다.
 * 204면 페이지 전체를 비로그인 홈으로 다시 연다. 다시 열면 이 탭의 메모리 토큰이 사라지고, 서버 세션은 이미 폐기·삭제됐으므로
 * 세션 복원도 비로그인으로 끝난다.
 */
export function WithdrawalSection() {
  const [phase, setPhase] = useState<WithdrawalPhase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const confirm = () => confirmWithdrawal({
    member: (path, request) => api.member(path, request),
    navigate: (path) => window.location.replace(path),
    setPhase,
    setMessage,
  });
  return (
    <WithdrawalView phase={phase} message={message} onOpen={() => { setMessage(null); setPhase("confirming"); }}
      onConfirm={() => { void confirm(); }} onCancel={() => setPhase("idle")} />
  );
}

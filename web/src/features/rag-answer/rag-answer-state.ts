import type { AskOutcome, GatedItem, HistoryMessage, RegenerateOutcome, SummaryLoad, SummaryView } from "./rag-answer-api.ts";
import { RAG_ANSWER_MESSAGES } from "./rag-answer-messages.ts";

/**
 * 12월 intent U5 화면 판단(기능 설계 BR8.2·BR8.4·BR8.5·BR8.6, 비기능 설계 NFR7.2). 순수 함수만 두고 패널(.tsx)은 이 결과를 그린다.
 */

export type SummaryMode = "recipient" | "owner";

/** 요약 패널 한 번의 표시. message가 있으면 안내 한 줄, showItems면 항목, showRegenerate면 [다시 만들기]. */
export type SummaryDisplay = {
  readonly message: string | null;
  readonly showItems: boolean;
  readonly showRegenerate: boolean;
};

/**
 * BR8.2: PENDING이면 둘 다 만드는 중(작성자 [다시 만들기] 감춤), FAILED면 받은 사람은 "요약 없음", 작성자는 "만들지 못함"과 [다시 만들기],
 * DONE이면 항목과 작성자 [다시 만들기]. 작성자는 서버의 canRegenerate가 false면 버튼을 감춘다.
 */
export function summaryDisplay(view: SummaryView, mode: SummaryMode): SummaryDisplay {
  const canRegenerate = mode === "owner" && view.status !== "PENDING" && view.canRegenerate !== false;
  if (view.status === "PENDING") return { message: RAG_ANSWER_MESSAGES.summaryPending, showItems: false, showRegenerate: false };
  if (view.status === "FAILED") {
    return mode === "owner"
      ? { message: RAG_ANSWER_MESSAGES.summaryFailedOwner, showItems: false, showRegenerate: canRegenerate }
      : { message: RAG_ANSWER_MESSAGES.summaryMissing, showItems: false, showRegenerate: false };
  }
  return { message: null, showItems: view.items.length > 0, showRegenerate: canRegenerate };
}

/** 요약 읽기 결과 → 패널 상태. 링크 접근 오류는 화면 전환을 U4에 넘겼으므로 패널은 아무것도 보이지 않는다. */
export type SummaryPanelState =
  | { kind: "loading" }
  | { kind: "ready"; view: SummaryView }
  | { kind: "hidden" }
  | { kind: "error"; message: string };

export function summaryPanelState(load: SummaryLoad): SummaryPanelState {
  if (load.kind === "success") return { kind: "ready", view: load.view };
  if (load.kind === "access-lost") return { kind: "hidden" };
  return { kind: "error", message: RAG_ANSWER_MESSAGES.loadFailed };
}

/** [다시 만들기] 결과(BR8.2): 202면 PENDING 안내로 바꾸고, 429면 한도 안내. 바꾼 view와 안내 한 줄을 돌려준다. */
export function afterRegenerate(view: SummaryView, outcome: RegenerateOutcome): { view: SummaryView; notice: string | null } {
  if (outcome.kind === "accepted") return { view: { status: "PENDING", items: [], canRegenerate: false }, notice: null };
  if (outcome.kind === "limit-reached") return { view, notice: RAG_ANSWER_MESSAGES.dailyLimit };
  return { view, notice: RAG_ANSWER_MESSAGES.regenerateFailed };
}

/** 화면 메모리의 대화 한 턴. ASSISTANT는 받은 항목과 끝 안내를 가진다. */
export type ConversationTurn =
  | { readonly role: "USER"; readonly text: string }
  | { readonly role: "ASSISTANT"; readonly items: readonly GatedItem[]; readonly notice: string | null };

/** 질문 때 보내는 앞 대화. BR8.4: 최근 6개, ASSISTANT는 그 답 항목 글을 이어 붙인 것. */
export const HISTORY_SEND_LIMIT = 6;

export function historyForRequest(turns: readonly ConversationTurn[]): HistoryMessage[] {
  return turns.slice(-HISTORY_SEND_LIMIT).map((turn) => (turn.role === "USER"
    ? { role: "USER", text: turn.text }
    : { role: "ASSISTANT", text: turn.items.map((item) => item.text).join("\n") }));
}

/** 질문 하나의 끝(BR8.5·BR8.6). answerNotice는 답 자리 안내, formNotice는 입력란 아래 안내. */
export type AskDisplay = {
  readonly answerNotice: string | null;
  readonly formNotice: string | null;
  /** 이 질문을 대화에 남기는가. 스트림 전 거부·화면 전환이면 남기지 않는다. */
  readonly keepTurn: boolean;
};

export function askDisplay(outcome: AskOutcome): AskDisplay {
  switch (outcome.kind) {
    case "done":
      return { answerNotice: outcome.itemCount === 0 ? RAG_ANSWER_MESSAGES.noEvidence : null, formNotice: null, keepTurn: true };
    case "stream-error":
      // 이미 보인 항목은 두고 실패 안내를 더한다(BR8.6).
      return { answerNotice: RAG_ANSWER_MESSAGES.answerFailed, formNotice: null, keepTurn: true };
    case "aborted":
      return { answerNotice: null, formNotice: null, keepTurn: outcome.itemCount > 0 };
    case "access-lost":
      return { answerNotice: null, formNotice: null, keepTurn: false };
    case "http-error":
      return { answerNotice: null, formNotice: httpErrorMessage(outcome.status), keepTurn: false };
  }
}

/** 스트림 전 거부의 안내(BR8.6). 409·429·400 밖(통신 실패·500)은 답 실패 안내로 둔다. */
export function httpErrorMessage(status: number | null): string {
  if (status === 409) return RAG_ANSWER_MESSAGES.qnaNotReady;
  if (status === 429) return RAG_ANSWER_MESSAGES.dailyLimit;
  if (status === 400) return RAG_ANSWER_MESSAGES.questionTooLong;
  return RAG_ANSWER_MESSAGES.answerFailed;
}

/** 입력란 값을 보낼 수 있는가: 공백만이 아니고 500자 이하, 보내는 중이 아님(BR1.1·화면 「보내는 동안 막음」). */
export const QUESTION_MAX_LENGTH = 500;

export function canSendQuestion(text: string, sending: boolean): boolean {
  return !sending && text.trim().length > 0 && text.length <= QUESTION_MAX_LENGTH;
}

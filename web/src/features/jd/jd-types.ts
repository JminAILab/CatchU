import type { SourceLocation, ItemCitation, LinkAccessCode } from "../rag-answer/rag-answer-api.ts";

export type { SourceLocation, ItemCitation, LinkAccessCode };
export type JdDraft = { title: string; body: string };
export type JdItem = { jdId: string; title: string; updatedAt: string };
export type Jd = JdItem & { body: string; createdAt: string };
export type Page<T> = { items: T[]; nextCursor: string | null };
export type RunStatus = "PENDING" | "DONE" | "FAILED";
export type JdRole = "EVIDENCE" | "UNCONFIRMED" | "INTERVIEW_QUESTION";
export type JdGatedItem = {
  kind: "CITED" | "AI_INTERPRETATION" | "SERVER_NOTICE";
  text: string; citations: ItemCitation[]; jdRole: JdRole;
};
export type RequirementFailure = "SEARCH_FAILED" | "GENERATION_FAILED" | "INPUT_TOO_LARGE" | "CONTRACT_INVALID" | "DEADLINE_EXCEEDED" | "PROCESSING_FAILED";
export type RunFailure = "DEADLINE_EXCEEDED" | "ALL_REQUIREMENTS_FAILED" | "PROCESSING_FAILED";
export type JdRequirement = {
  requirementIndex: number; sourceLineNumber: number; jdLine: string; status: RunStatus;
  resultKind: "CONTENT" | "EMPTY" | null; failureCode: RequirementFailure | null;
  evidenceItems: JdGatedItem[]; unconfirmedPoints: JdGatedItem[]; interviewQuestions: JdGatedItem[];
};
export type JdRun = { status: RunStatus; failureCode: RunFailure | null; requirements: JdRequirement[] };
export type JdRunItem = {
  runId: string; title: string; createdAt: string; status: RunStatus;
  requirementCount: number; emptyCount: number; failedCount: number;
};
/** C-11 값은 공유 화면이 소유한다. grant는 요청할 때만 읽는다. */
export type JdRecipientContext = {
  token: string; getGrant: () => string | null; isLoggedIn: boolean;
  onAccessLost: (code: LinkAccessCode) => void;
};

export const JD_LIMITS = Object.freeze({ title: 200, body: 20000, requirements: 20, line: 2000 });
export const REQUIREMENT_FAILED_TEXT = "이 요구사항을 처리하지 못했습니다.";
export const DEADLINE_TEXT = "전체 처리 시한이 지나 완료하지 못했습니다.";
export const EMPTY_TEXT = "이번 자료에서 표시할 요약 내용이 없습니다.";
export const NO_SOURCES_TEXT = "이번에 찾은 자료가 없어 이 요구사항의 표기를 찾지 못했습니다.";

/** UTF-16 상한을 검사할 뿐 원문·공백·줄 경계를 바꾸지 않는다. */
export function jdDraftErrors(draft: JdDraft): string[] {
  const errors: string[] = [];
  if (!draft.title.trim()) errors.push("제목을 입력해 주세요.");
  if (draft.title.length > JD_LIMITS.title) errors.push("제목은 200자까지 쓸 수 있습니다.");
  if (!draft.body.trim()) errors.push("본문을 입력해 주세요.");
  if (draft.body.length > JD_LIMITS.body) errors.push("본문은 20,000자까지 쓸 수 있습니다.");
  return errors;
}

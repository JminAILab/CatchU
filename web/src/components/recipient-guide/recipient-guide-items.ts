/**
 * 받은 사람 시작 안내 묶음의 항목(12월 intent U2 기능 설계 BR8.2, AC16.2.2).
 * U4가 받은 사람 화면 위쪽(계약 C-11 수정 PR #421의 slots 0번 `RecipientGuide`)에 단다.
 * Claude 연결 안내는 받은 사람 Claude 연결(U9)이 켜졌을 때만 보이고, U9를 빼면 함께 빠진다(기본 꺼짐).
 */
export type RecipientGuideItem = {
  id: "link-conditions" | "fixed-copy" | "base-summary" | "questions" | "jd-summary" | "claude-connect";
  text: string;
};

export const RECIPIENT_GUIDE_TITLE = "이 링크에서 할 수 있는 것";

export const RECIPIENT_GUIDE_ITEMS: readonly RecipientGuideItem[] = [
  { id: "link-conditions", text: "링크는 정해진 기간 동안만 열리고, 비밀번호가 걸린 링크는 비밀번호를 넣어야 볼 수 있습니다." },
  { id: "fixed-copy", text: "보이는 자료는 발행할 때 고정한 내용입니다. 그 뒤 작성자가 고친 내용은 반영되지 않습니다." },
  { id: "base-summary", text: "기본 요약은 이 자료로 AI가 만든 요약입니다. 근거를 누르면 원문 위치를 보여 줍니다." },
  { id: "questions", text: "질의응답은 로그인 없이 쓸 수 있고, 답은 이 자료 안에서만 찾습니다." },
  { id: "jd-summary", text: "JD 요약은 로그인한 뒤 내 채용공고와 이 자료를 견주어 볼 수 있습니다." },
];

export const CLAUDE_CONNECT_ITEM: RecipientGuideItem = {
  id: "claude-connect",
  text: "본인 Claude에 이 링크를 연결하면 Claude가 이 자료를 읽을 수 있습니다.",
};

/** 화면에 보일 항목. showClaudeConnect가 true일 때만 Claude 연결 줄을 더한다. */
export function recipientGuideItems(showClaudeConnect: boolean): readonly RecipientGuideItem[] {
  return showClaudeConnect ? [...RECIPIENT_GUIDE_ITEMS, CLAUDE_CONNECT_ITEM] : RECIPIENT_GUIDE_ITEMS;
}

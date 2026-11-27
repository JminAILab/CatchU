/**
 * 12월 intent U5 기본 요약·질의응답 화면 문구 표(기능 설계 BR8.1·BR8.2·BR8.5·BR8.6, 비기능 설계 NFR7.2).
 * 화면은 문구가 아니라 상태·오류 코드로 이 표에서 고른다. 한도 안내에는 남은 횟수·한도 값을 넣지 않는다(BR3.3).
 * 질의응답 입력란 옆 외부 AI 고지는 여기에 두지 않고 U2의 `<AiNoticeLine />`를 그대로 붙인다(U2 README 결정).
 */
export const RAG_ANSWER_MESSAGES = {
  summaryHeading: "AI 요약",
  summaryPending: "AI 요약을 만드는 중입니다. 새로고침하면 다시 확인합니다",
  summaryMissing: "AI 요약이 없습니다",
  summaryFailedOwner: "AI 요약을 만들지 못했습니다",
  regenerate: "다시 만들기",
  dailyLimit: "오늘 한도에 도달했습니다",
  qnaHeading: "발행본에 질문하기",
  qnaDescription: "공유된 자료를 바탕으로 AI가 답합니다.",
  qnaNotReady: "질의응답을 아직 쓸 수 없습니다",
  questionTooLong: "질문은 500자까지 쓸 수 있습니다",
  noEvidence: "발행본에서 이 질문의 근거를 찾지 못했습니다",
  answerFailed: "답을 만들지 못했습니다. 다시 질문해 주세요",
  /** 낭독 전용 알림 자리에만 넣는다. 화면에는 보이지 않는다(#543, 2026-11-16 팀장 결정). */
  answerPending: "답변을 만들고 있습니다",
  answerReady: "답변이 준비됐습니다",
  ask: "질문하기",
  /** 보내는 동안 [질문하기] 버튼에 보이는 글자. 낭독 전용 알림(answerPending)과 따로 둔다. */
  asking: "답변 만드는 중…",
  questionLabel: "질문",
  aiInterpretation: "AI 해석",
  /** 통신 실패·예상 밖 응답. 실패를 빈 요약으로 바꾸지 않고 알린다(계약 「에러 대응 최소선」 1). */
  loadFailed: "AI 요약을 불러오지 못했습니다. 새로고침해 주세요",
  regenerateFailed: "다시 만들기를 접수하지 못했습니다. 다시 시도해 주세요",
} as const;

export type RagAnswerMessage = (typeof RAG_ANSWER_MESSAGES)[keyof typeof RAG_ANSWER_MESSAGES];

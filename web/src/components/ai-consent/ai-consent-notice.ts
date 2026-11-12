/**
 * 외부 AI 전송 첫 이용 동의의 고지 문구와 판본(12월 intent U2 기능 설계 BR2.1·BR2.4·BR2.5, 계약 C-04, 비기능 NFR2.5).
 *
 * - `AI_NOTICE_VERSION`은 api `src/ai-consent/ai-consent.gate.ts`의 같은 이름 상수와 같아야 한다.
 *   고지 문구를 바꾸면 두 값을 함께 올린다. 다르면 api가 동의 기록을 400으로 거부한다(옛 판본 화면의 동의를 받지 않음).
 * - 문의 경로는 개인정보 처리방침과 같은 팀 연락 이메일 한 줄이다. 접수·회신 약속은 쓰지 않는다(FR20.2).
 */
export const AI_NOTICE_VERSION = "2026-11-v2";

/**
 * 자료를 받는 곳 셋(BR2.4). 빠지면 동의로 보지 않는다.
 * OpenAI는 저장소 분석에서 AI가 쓴 글과 기록을 확인할 때 받는다(Catch 개편 CR3 BR8.3, 판본 2026-11-v2).
 */
export const AI_RECIPIENTS = ["Claude API(Anthropic)", "Voyage AI(운영사 MongoDB)", "OpenAI API(OpenAI)"] as const;

/** 자료를 보내는 기능(BR2.4). */
export const AI_FEATURES = ["저장소 분석", "기본 요약", "질의응답", "JD 요약", "PDF 처리"] as const;

export const AI_CONTACT = "catchu@googlegroups.com";

export const AI_CONSENT_TEXT = {
  title: "외부 AI로 자료를 보내기 전에 확인해 주세요",
  recipients: `받는 곳: ${AI_RECIPIENTS.join(", ")}`,
  features: `보내는 기능: ${AI_FEATURES.join(", ")}`,
  rawData: "올린 자료는 이름·연락처를 가리지 않고 그대로 보냅니다. 보내기 전에 민감한 정보를 지워 주세요.",
  contact: `문의: ${AI_CONTACT}`,
  agree: "동의",
  close: "닫기",
} as const;

/** 동의 뒤 AI 화면마다 두는 한 줄 안내, 비로그인 질의응답 입력란 옆 고지(BR2.5). */
export const AI_NOTICE_LINE = `이 기능은 입력과 자료를 ${AI_RECIPIENTS.join("·")}로 보냅니다.`;

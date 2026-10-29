/**
 * 없는 주소·처리하지 못한 화면 오류의 기본 화면 문구(12월 intent U2 기능 설계 BR8.3, AC16.2.3).
 * 오류 내용·스택·내부 ID는 보이지 않는다(보안 점검 「로그·오류 응답」).
 */
export const NOT_FOUND_TEXT = {
  title: "페이지를 찾을 수 없습니다",
  description: "주소가 바뀌었거나 없는 페이지입니다.",
  home: "홈으로",
} as const;

export const ERROR_TEXT = {
  title: "문제가 생겼습니다",
  description: "잠시 뒤 다시 시도해 주세요.",
  retry: "다시 시도",
  home: "홈으로",
} as const;

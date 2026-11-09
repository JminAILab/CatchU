/**
 * 회원 홈 위의 작성 회원 시작 단계 안내(12월 intent U2 기능 설계 BR8.1, AC16.2.1).
 * 여섯 단계는 고정이며 완료 여부·닫기 상태를 저장하지 않는다. 단계마다 지금 있는 메뉴 중 해당 메뉴로 가는 링크를 둔다.
 * 자료 올리기는 U4의 텍스트 자료 화면(`/materials`)으로 보낸다(#416 2026-11-03 팀장 요청). U8 PDF 화면이 생기면 그때 주소를 다시 본다(README 「페이지 주소」와 함께).
 * 마지막 단계는 U6의 Claude 연결 화면으로 보낸다(U6 BR7.5).
 */
import { routes } from "../../lib/routes.ts";

export type StartStep = {
  /** 고정 식별자(data-testid에 쓴다). */
  id: "google-login" | "github-consent" | "repository-analysis" | "catch-description" | "materials" | "publish-claude";
  title: string;
  link: { label: string; href: string };
};

export const MEMBER_START_STEPS: readonly StartStep[] = [
  { id: "google-login", title: "Google 로그인 완료", link: { label: "프로필", href: routes.profile } },
  { id: "github-consent", title: "GitHub 연결·분석 동의", link: { label: "내 자산의 저장소 연결 관리", href: routes.assets } },
  { id: "repository-analysis", title: "저장소 등록·분석", link: { label: "내 자산의 저장소 연결 관리", href: routes.assets } },
  { id: "catch-description", title: "Catch 설명 쓰기", link: { label: "내 자산", href: routes.assets } },
  { id: "materials", title: "자료 올리기", link: { label: "텍스트 자료", href: routes.materials } },
  { id: "publish-claude", title: "발행·본인 Claude 연결", link: { label: "Claude 연결", href: routes.profileClaude } },
];

export const START_GUIDE_TITLE = "CatchU 시작하기";

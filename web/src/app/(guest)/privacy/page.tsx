import type { Metadata } from "next";
import { PrivacyPolicy } from "@/features/privacy/privacy-policy";

export const metadata: Metadata = {
  title: "CatchU 개인정보 처리방침",
};

/**
 * `/privacy` 개인정보 처리방침(#496). 비로그인 헤더 묶음 `(guest)`에 두어 회원 경로 가드 없이 로그인하지 않고 연다.
 * 첫 화면 바닥글 링크가 이 주소로 오고, Google 로그인 앱 Branding에 적는 방침 주소다. 글과 지키는 것은 features/privacy/README.md.
 */
export default function PrivacyPage() {
  return <PrivacyPolicy />;
}

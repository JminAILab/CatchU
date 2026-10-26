import type { Metadata } from "next";
import { LandingPage } from "@/features/landing/landing-page";

export const metadata: Metadata = {
  title: "CatchU — GitHub 기록을 경험의 근거로",
  description: "GitHub 작업 기록을 Catch로 정리하고, 확인한 Catch를 골라 공개하고 링크로 공유합니다.",
};

/** `/` 비로그인 서비스 소개. 구성·지키는 것은 features/landing/README.md. */
export default function Home() {
  return <LandingPage />;
}

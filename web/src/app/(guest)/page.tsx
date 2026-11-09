import type { Metadata } from "next";
import { LandingPage } from "@/features/landing/landing-page";
import { isWithdrawnNotice, WITHDRAWN_QUERY } from "@/features/withdrawal/withdrawal";
import { WithdrawnNotice } from "@/features/withdrawal/withdrawal-view";

export const metadata: Metadata = {
  title: "CatchU — GitHub 기록을 경험의 근거로",
  description: "GitHub 작업 기록을 Catch로 정리하고, 확인한 Catch를 골라 공개하고 링크로 공유합니다.",
};

/**
 * `/` 비로그인 서비스 소개. 구성·지키는 것은 features/landing/README.md.
 * 탈퇴 직후(`?withdrawn=1`)에는 위에 "탈퇴했습니다"를 보인다(12월 intent U2 BR7.5).
 */
export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  return (
    <>
      {isWithdrawnNotice(query[WITHDRAWN_QUERY]) && <WithdrawnNotice />}
      <LandingPage />
    </>
  );
}

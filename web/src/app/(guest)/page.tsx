import type { Metadata } from "next";
import { LandingPage } from "@/features/landing/landing-page";
import { isWithdrawnNotice, WITHDRAWN_QUERY } from "@/features/withdrawal/withdrawal";
import { WithdrawnNotice } from "@/features/withdrawal/withdrawal-view";

export const metadata: Metadata = {
  title: "CatchU — GitHub 작업을 Catch로 골라 면접관에게",
  description: "GitHub 작업을 분석해 Catch를 만들고, 고른 Catch를 링크로 면접관에게 보냅니다.",
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

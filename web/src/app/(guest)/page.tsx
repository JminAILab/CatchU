import type { Metadata } from "next";
import { LandingPage } from "@/features/landing/landing-page";
import { isWithdrawnNotice, WITHDRAWN_QUERY } from "@/features/withdrawal/withdrawal";
import { WithdrawnNotice } from "@/features/withdrawal/withdrawal-view";

export const metadata: Metadata = {
  title: "CatchU — GitHub의 작업 기록을, 내 경험을 설명하는 근거로",
  description: "GitHub 저장소를 분석해 Catch를 만들고, 직접 확인한 것만 선택해 면접관에게 링크로 공유합니다.",
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

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { RecipientHeader } from "@/components/header/recipient-header";

const LINK_TITLE = "지원자가 보낸 작업 자료 | CatchU";
const LINK_DESCRIPTION = "지원자가 CatchU에서 골라 보낸 자료입니다. 발행할 때의 내용 그대로 보입니다.";

/**
 * 보낸 링크(`/s/...`)의 탭 제목과 메신저 미리보기, 검색 제외 표시(#565).
 * - 모든 링크가 같은 고정 문구다. web 서버는 링크 토큰으로 API를 부르지 않으므로 발행본 제목·작성자·내용을 넣지 않는다.
 * - openGraph는 위쪽 레이아웃 값과 합쳐지지 않고 통째로 바뀌므로 제목·설명을 여기에 다시 적는다. 미리보기 그림은 두지 않는다.
 * - 링크를 받은 사람만 열도록 검색 엔진에 싣지 않는다(noindex). robots.txt로 막으면 검색 엔진이 이 표시를 읽지 못해
 *   주소만 실릴 수 있으므로 robots.txt는 두지 않는다.
 */
export const metadata: Metadata = {
  title: LINK_TITLE,
  description: LINK_DESCRIPTION,
  openGraph: { type: "website", siteName: "CatchU", locale: "ko_KR", title: LINK_TITLE, description: LINK_DESCRIPTION },
  robots: { index: false, follow: false },
};

/** 공유 링크 수신자 화면(`/s/...`). 열람 상태와 관계없이 로그인·프로필을 확인하는 수신자 헤더를 쓴다(#638). */
export default function RecipientLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <RecipientHeader />
      {children}
    </>
  );
}

import type { ReactNode } from "react";
import { MemberHeader } from "@/components/header/member-header";

/**
 * 로그인 일반 서비스·발행자 화면 묶음. 주소에는 영향을 주지 않는다.
 * 회원 경로 가드·로그아웃 연결은 #106 PR②에서 추가한다.
 */
export default function MemberLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <MemberHeader />
      {children}
    </>
  );
}

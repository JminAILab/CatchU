import type { ReactNode } from "react";
import { RecipientHeader } from "@/components/header/recipient-header";

/** 공유 링크 수신자 화면(`/s/...`). 로그인 여부와 관계없이 수신자 전용 헤더를 쓴다. */
export default function RecipientLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <RecipientHeader />
      {children}
    </>
  );
}

import type { ReactNode } from "react";
import { GuestHeader } from "@/components/header/guest-header";

/** 비로그인 일반 화면 묶음. 주소에는 영향을 주지 않는다. */
export default function GuestLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <GuestHeader />
      {children}
    </>
  );
}

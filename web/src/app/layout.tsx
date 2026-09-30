import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "CatchU",
  description: "CatchU 사용자 화면",
};

/**
 * 루트 레이아웃. 헤더는 화면 묶음별 레이아웃에서 붙인다.
 * - (guest): 비로그인 일반 헤더
 * - (member): 로그인 일반 헤더
 * - s/: 공유 링크 수신자 전용 헤더
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}

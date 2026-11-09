"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { routes } from "@/lib/routes";
import styles from "./header.module.css";

/**
 * 비로그인 일반 서비스 홈 헤더(#55 10월 합의).
 * 왼쪽: 로고(→ 비로그인 홈) / 오른쪽: Google로 시작하기(→ 로그인 흐름).
 * 내 자산·공유 링크·프로필은 노출하지 않는다.
 */
export function GuestHeader() {
  const pathname = usePathname();
  // 소개는 시안 전용 헤더를 본문과 함께 그린다. 로그인·콜백은 기존 헤더를 유지한다.
  if (pathname === routes.landing) return null;
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href={routes.landing} className={styles.brand}>
          CatchU
        </Link>
        {/* 로그인 진입(/login). 실제 Google 로그인 연결은 A 담당(OQ-A1)이다. */}
        <Link href={routes.login} className={styles.startButton}>
          Google로 시작하기
        </Link>
      </div>
    </header>
  );
}

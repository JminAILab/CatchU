import Link from "next/link";
import { routes } from "@/lib/routes";
import styles from "./header.module.css";

/**
 * 비로그인 일반 서비스 홈 헤더(#55 10월 합의).
 * 왼쪽: 로고(→ 비로그인 홈) / 오른쪽: Google로 시작하기(→ 로그인 흐름).
 * 내 자산·공유 링크·프로필은 노출하지 않는다.
 */
export function GuestHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href={routes.landing} className={styles.brand}>
          CatchU
        </Link>
        {/* 실제 로그인 화면은 A 담당, 진입 주소는 #106 PR②에서 연결한다. */}
        <Link href={routes.login} className={styles.startButton}>
          Google로 시작하기
        </Link>
      </div>
    </header>
  );
}

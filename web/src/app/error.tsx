"use client"; // 오류 경계는 Client Component여야 한다(Next.js 16 error.js).

import Link from "next/link";
import { ERROR_TEXT } from "@/components/error-pages/error-page-text";
import { routes } from "@/lib/routes";
import styles from "@/components/error-pages/error-pages.module.css";

/**
 * 처리하지 못한 화면 오류의 기본 화면(12월 intent U2 BR8.3). [다시 시도]와 홈 링크만 둔다.
 * 오류 객체의 내용·digest·스택은 화면과 브라우저 로그에 내보내지 않는다.
 */
export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className={styles.page} data-testid="error-page">
      <h1 className={styles.title}>{ERROR_TEXT.title}</h1>
      <p className={styles.description}>{ERROR_TEXT.description}</p>
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={() => retry()} data-testid="error-page-retry">{ERROR_TEXT.retry}</button>
        <Link className={styles.link} href={routes.landing} data-testid="error-page-home-link">{ERROR_TEXT.home}</Link>
      </div>
    </main>
  );
}

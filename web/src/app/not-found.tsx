import Link from "next/link";
import { NOT_FOUND_TEXT } from "@/components/error-pages/error-page-text";
import { routes } from "@/lib/routes";
import styles from "@/components/error-pages/error-pages.module.css";

/** 없는 주소의 404 화면(12월 intent U2 BR8.3). 홈 링크만 두고 내부 정보는 보이지 않는다. */
export default function NotFound() {
  return (
    <main className={styles.page} data-testid="not-found-page">
      <h1 className={styles.title}>{NOT_FOUND_TEXT.title}</h1>
      <p className={styles.description}>{NOT_FOUND_TEXT.description}</p>
      <div className={styles.actions}>
        <Link className={styles.link} href={routes.landing} data-testid="not-found-home-link">{NOT_FOUND_TEXT.home}</Link>
      </div>
    </main>
  );
}

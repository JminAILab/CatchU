import { HomeMemberPage } from "@/features/home/home-member-page";
import styles from "./page.module.css";

/** 로그인 후 홈. 연결 상태 안내와 저장소 연결 관리 CTA는 `features/home`(#155). */
export default function MemberHomePage() {
  return (
    <main className={styles.page}>
      <HomeMemberPage />
    </main>
  );
}

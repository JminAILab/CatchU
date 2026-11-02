import type { ReactNode } from "react";
import { MemberShell } from "@/components/auth/member-shell";
import styles from "./layout.module.css";

/**
 * 로그인 일반 서비스·발행자 화면 묶음. 주소에는 영향을 주지 않는다.
 * 회원 경로 가드가 토큰 없는 접근을 로그인 진입으로 보내며, 그동안 헤더와 화면을 그리지 않는다.
 */
export default function MemberLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.memberLayout}>
      <MemberShell>{children}</MemberShell>
    </div>
  );
}

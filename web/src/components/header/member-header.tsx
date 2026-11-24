"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { routes } from "@/lib/routes";
import { ProfileMenu } from "./profile-menu";
import styles from "./header.module.css";

type MemberHeaderProps = {
  onLogout?: () => void;
  /** 로그아웃 진행 중 표시(#287). 프로필 메뉴의 [로그아웃]을 막는다. */
  logoutPending?: boolean;
};

const navItems = [
  { href: routes.assets, label: "내 자산" },
  { href: routes.materials, label: "텍스트 자료" },
  { href: routes.presets, label: "프리셋" },
  { href: routes.publications, label: "발행본" },
  { href: routes.jds, label: "JD 관리" },
] as const;

/**
 * 로그인 일반 서비스·발행자 헤더(#55 10월 합의).
 * 왼쪽: 로고(→ 로그인 홈) · 내 자산 · 텍스트 자료 · 프리셋 · 발행본 · JD 관리. 10월 [공유 링크]는 U4 제출 3(W6)에서 [발행본]으로 대체했다.
 * 「프리셋」은 발행 프리셋 U2(BR1.1)가 더했다. 현재 자리는 주소가 같거나 그 아래일 때만 켠다.
 * 오른쪽: 프로필
 * 10월의 채용공고·알림 비활성 표시는 뺐다(#565). 두 기능을 12월 요구사항에서 뺐기 때문이다. 대표 구성 진입점은 두지 않는다.
 */
export function MemberHeader({ onLogout, logoutPending }: MemberHeaderProps) {
  const pathname = usePathname();

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className={styles.header}>
      <div className={`${styles.inner} ${styles.memberInner}`}>
        <nav className={styles.group} aria-label="주요 메뉴">
          <Link href={routes.home} className={styles.brand}>
            CatchU
          </Link>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              data-testid={item.href === routes.jds ? "member-jds-link" : undefined}
              className={isActive(item.href) ? styles.menuItemActive : styles.menuItem}
              aria-current={isActive(item.href) ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className={styles.group}>
          <ProfileMenu onLogout={onLogout} logoutPending={logoutPending} />
        </div>
      </div>
    </header>
  );
}

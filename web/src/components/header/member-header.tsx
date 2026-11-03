"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NoticeDialog } from "@/components/notice-dialog/notice-dialog";
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
  { href: routes.links, label: "공유 링크" },
] as const;

/**
 * 로그인 일반 서비스·발행자 헤더(#55 10월 합의).
 * 왼쪽: 로고(→ 로그인 홈) · 내 자산 · 공유 링크 · 채용공고(비활성, 클릭 시 안내창)
 * 오른쪽: 알림(비활성, 클릭 시 안내창) · 프로필
 * 대표 구성 진입점은 10월에 두지 않는다.
 */
export function MemberHeader({ onLogout, logoutPending }: MemberHeaderProps) {
  const pathname = usePathname();
  const [noticeOpen, setNoticeOpen] = useState(false);

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
              className={isActive(item.href) ? styles.menuItemActive : styles.menuItem}
              aria-current={isActive(item.href) ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
          <button type="button" className={styles.inactiveItem} aria-haspopup="dialog" onClick={() => setNoticeOpen(true)}>
            채용공고<span className="visually-hidden"> (개발 중)</span>
          </button>
        </nav>
        <div className={styles.group}>
          <button type="button" className={styles.inactiveItem} aria-haspopup="dialog" onClick={() => setNoticeOpen(true)}>
            알림<span className="visually-hidden"> (개발 중)</span>
          </button>
          <ProfileMenu onLogout={onLogout} logoutPending={logoutPending} />
        </div>
      </div>
      <NoticeDialog open={noticeOpen} onClose={() => setNoticeOpen(false)} />
    </header>
  );
}

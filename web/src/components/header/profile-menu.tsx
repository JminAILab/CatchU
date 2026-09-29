"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { routes } from "@/lib/routes";
import styles from "./header.module.css";

type ProfileMenuProps = {
  /**
   * 로그아웃 요청. 세션 연결은 #106 PR②에서 넘긴다.
   * 없으면 '연결 전'으로 표시하고 아무 동작도 하지 않는다(초점은 받아 보조기기가 읽을 수 있다).
   */
  onLogout?: () => void;
};

/**
 * 프로필 버튼과 그 근처 메뉴(#51 합의): [프로필 보기] → 상세 프로필, [로그아웃].
 * 메뉴의 추가 닫기 조작(Esc·바깥 클릭)은 미결이라 프로필 버튼으로만 열고 닫는다.
 */
export function ProfileMenu({ onLogout }: ProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();

  return (
    <div className={styles.profileWrap}>
      <button
        type="button"
        className={styles.menuItem}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        프로필
      </button>
      {open && (
        <div id={menuId} className={styles.profileMenu} role="group" aria-label="프로필 메뉴">
          <Link href={routes.profile} className={styles.profileMenuItem} onClick={() => setOpen(false)}>
            프로필 보기
          </Link>
          {onLogout ? (
            <button type="button" className={styles.profileMenuItem} onClick={onLogout}>
              로그아웃
            </button>
          ) : (
            <button type="button" className={styles.profileMenuItemPending} aria-disabled="true">
              로그아웃 <span className={styles.pendingTag}>연결 전</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

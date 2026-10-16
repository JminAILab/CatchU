"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { authScreenMessages } from "@/lib/auth-screen-messages";
import { routes } from "@/lib/routes";
import styles from "./header.module.css";

type ProfileMenuProps = {
  /**
   * 로그아웃 요청. 세션 연결은 #106 PR②에서 넘긴다.
   * 없으면 '연결 전'으로 표시하고 아무 동작도 하지 않는다(초점은 받아 보조기기가 읽을 수 있다).
   */
  onLogout?: () => void;
  /** 로그아웃 진행 중이면 [로그아웃]을 막고 진행을 표시한다(#287). 주지 않으면 기존과 같다. */
  logoutPending?: boolean;
};

/**
 * 프로필 버튼과 그 근처 메뉴(#51 합의): [프로필 보기] → 상세 프로필, [로그아웃].
 *
 * 닫기: [프로필] 버튼·Esc·바깥 클릭(#171 A 담당 검토 9/29로 미결을 정함). 메뉴 안을 누르면 닫히지 않는다.
 * - Esc로 닫으면 [프로필] 버튼으로 초점을 돌린다.
 * - 바깥 클릭은 메뉴만 닫는다. 누른 요소의 동작과 초점은 막거나 옮기지 않는다.
 */
export function ProfileMenu({ onLogout, logoutPending = false }: ProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && wrapRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // 메뉴가 열린 채 안내창을 연 경우 Esc는 안내창만 닫는다.
      if (event.target instanceof Element && event.target.closest("dialog")) return;
      setOpen(false);
      buttonRef.current?.focus();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className={styles.profileWrap}>
      <button
        ref={buttonRef}
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
            <button type="button" className={styles.profileMenuItem} onClick={onLogout} disabled={logoutPending} aria-busy={logoutPending}>
              {logoutPending ? authScreenMessages.logoutPending : "로그아웃"}
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

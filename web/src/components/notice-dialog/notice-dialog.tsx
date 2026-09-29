"use client";

import { useEffect, useId, useRef } from "react";
import styles from "./notice-dialog.module.css";

type NoticeDialogProps = {
  open: boolean;
  onClose: () => void;
};

/**
 * 10월 미제공 메뉴(채용공고·알림)의 안내창. #55 9/23 합의:
 * 현재 화면 위 작은 안내창, '개발 중인 기능입니다' + [확인], [확인]은 창만 닫고 화면 유지.
 *
 * 키보드: 열리면 [확인]에 초점, 모달이라 Tab이 배경으로 나가지 않고, 닫으면 연 버튼으로 초점이 돌아간다.
 * X·Esc·바깥 클릭 같은 추가 닫기 조작은 #55 미결이라 두지 않는다. 합의되면 동작과 키보드 검증을 함께 바꾼다.
 */
export function NoticeDialog({ open, onClose }: NoticeDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const messageId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
    }
    if (!open && dialog.open) {
      dialog.close();
      returnFocusRef.current?.focus();
      returnFocusRef.current = null;
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={messageId}
      // 브라우저 기본 Esc 닫기를 막는다(추가 닫기 조작 미결).
      onCancel={(event) => event.preventDefault()}
    >
      <p id={messageId} className={styles.message}>
        개발 중인 기능입니다
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.confirm} onClick={onClose} autoFocus>
          확인
        </button>
      </div>
    </dialog>
  );
}

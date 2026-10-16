"use client";

import { useEffect, useId, useRef } from "react";
import styles from "./notice-dialog.module.css";

type NoticeDialogProps = {
  open: boolean;
  onClose: () => void;
};

/**
 * 10월 미제공 메뉴(채용공고·알림)의 안내창. #55 9/23 합의:
 * 현재 화면 위 작은 안내창, '개발 중인 기능입니다' + [확인], 닫기는 창만 닫고 화면 유지.
 *
 * 닫기: [확인]·X·Esc·바깥 클릭(#171 A 담당 검토 9/29로 #55 미결을 정함). 창 안을 누르면 닫히지 않는다.
 * 키보드: 열리면 [확인]에 초점, 모달이라 Tab이 배경으로 나가지 않고, 어느 방법으로 닫아도 연 버튼으로 초점이 돌아간다.
 */
export function NoticeDialog({ open, onClose }: NoticeDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  // 창 안에서 누르기 시작해 바깥에서 뗀 경우(끌기)는 바깥 클릭으로 보지 않는다.
  const pressStartedOnBackdropRef = useRef(false);
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
      // Esc: 브라우저가 직접 닫으면 열림 상태와 초점 복귀가 어긋나므로 기본 동작을 막고 같은 닫기 경로를 쓴다.
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      // 내용은 안쪽 패널에 있으므로 dialog 자체가 눌렸다면 배경(::backdrop)을 누른 것이다.
      onPointerDown={(event) => {
        pressStartedOnBackdropRef.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        const onBackdrop = event.target === event.currentTarget && pressStartedOnBackdropRef.current;
        pressStartedOnBackdropRef.current = false;
        if (onBackdrop) onClose();
      }}
    >
      <div className={styles.panel}>
        <button type="button" className={styles.close} aria-label="닫기" onClick={onClose}>
          ×
        </button>
        <p id={messageId} className={styles.message}>
          개발 중인 기능입니다
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.confirm} onClick={onClose} autoFocus>
            확인
          </button>
        </div>
      </div>
    </dialog>
  );
}

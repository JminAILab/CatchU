"use client";

import { useEffect, useId, useRef } from "react";
import { AI_CONSENT_TEXT } from "./ai-consent-notice";
import styles from "./ai-consent.module.css";

type AiConsentDialogProps = {
  open: boolean;
  /** 동의 기록 요청 중. 버튼을 다시 누르지 못하게 한다. */
  busy: boolean;
  /** 동의 기록이 실패했을 때의 안내. */
  error: string | null;
  onAgree: () => void;
  onClose: () => void;
};

/**
 * 외부 AI 전송 첫 이용 동의 창(12월 intent U2 기능 설계 W2·BR2.4, 계약 C-04 web 공용 동의 창).
 * 받는 곳 둘, 보내는 기능, 올린 자료를 그대로 보낸다는 사실, 문의 경로 한 줄을 보인다. [닫기]·Esc는 실행하지 않는다.
 * 문구는 React 텍스트로만 그린다(보안 점검 「화면 출력」).
 */
export function AiConsentDialog({ open, busy, error, onAgree, onClose }: AiConsentDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

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
    <dialog ref={dialogRef} className={styles.dialog} aria-labelledby={titleId} data-testid="ai-consent-dialog"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}>
      <div className={styles.panel}>
        <h2 id={titleId} className={styles.title}>{AI_CONSENT_TEXT.title}</h2>
        <ul className={styles.facts}>
          <li>{AI_CONSENT_TEXT.recipients}</li>
          <li>{AI_CONSENT_TEXT.features}</li>
          <li>{AI_CONSENT_TEXT.rawData}</li>
        </ul>
        <p className={styles.contact}>{AI_CONSENT_TEXT.contact}</p>
        {error && <p className={styles.error} role="alert" data-testid="ai-consent-dialog-error">{error}</p>}
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={onClose} disabled={busy} data-testid="ai-consent-dialog-close">
            {AI_CONSENT_TEXT.close}
          </button>
          <button type="button" className={styles.primary} onClick={onAgree} disabled={busy} data-testid="ai-consent-dialog-agree" autoFocus>
            {AI_CONSENT_TEXT.agree}
          </button>
        </div>
      </div>
    </dialog>
  );
}

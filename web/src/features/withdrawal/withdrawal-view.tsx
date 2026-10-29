import { WITHDRAWAL_TEXT, type WithdrawalPhase } from "./withdrawal";
import styles from "./withdrawal.module.css";

type WithdrawalViewProps = {
  phase: WithdrawalPhase;
  /** 실패 안내. 성공은 페이지를 다시 열므로 여기 오지 않는다. */
  message: string | null;
  onOpen: () => void;
  onConfirm: () => void;
  onCancel: () => void;
};

/** 회원 정보 화면의 [탈퇴] → 확인창 → [탈퇴하기](12월 intent U2 BR7.1). 상태를 갖지 않는 표시 부분이다. */
export function WithdrawalView({ phase, message, onOpen, onConfirm, onCancel }: WithdrawalViewProps) {
  return (
    <section className={styles.section} data-testid="withdrawal-section">
      {phase === "idle" && (
        <button type="button" className={styles.danger} onClick={onOpen} data-testid="withdrawal-open-button">{WITHDRAWAL_TEXT.button}</button>
      )}
      {phase !== "idle" && (
        <div className={styles.confirm} role="alertdialog" aria-labelledby="withdrawal-confirm-text" data-testid="withdrawal-confirm">
          <p id="withdrawal-confirm-text" className={styles.confirmText}>{WITHDRAWAL_TEXT.confirm}</p>
          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={onCancel} disabled={phase === "sending"}
              data-testid="withdrawal-cancel-button">{WITHDRAWAL_TEXT.cancel}</button>
            <button type="button" className={styles.danger} onClick={onConfirm} disabled={phase === "sending"}
              data-testid="withdrawal-confirm-button">{WITHDRAWAL_TEXT.confirmAction}</button>
          </div>
          {phase === "sending" && <p className={styles.pending} role="status">{WITHDRAWAL_TEXT.pending}</p>}
        </div>
      )}
      {message && <p className={styles.error} role="alert" data-testid="withdrawal-error">{message}</p>}
    </section>
  );
}

/** 비로그인 홈의 탈퇴 완료 안내(BR7.5). */
export function WithdrawnNotice() {
  return <p className={styles.done} role="status" data-testid="withdrawn-notice">{WITHDRAWAL_TEXT.done}</p>;
}

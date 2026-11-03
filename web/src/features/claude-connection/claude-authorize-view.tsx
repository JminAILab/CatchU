import authStyles from "@/components/auth/auth.module.css";
import { LoadingState, LookupFailedState } from "@/components/status/status";
import { AUTHORIZE_TEXT, type AuthorizeView } from "./claude-connection";
import styles from "./claude-connection.module.css";

type ClaudeAuthorizeViewProps = {
  view: AuthorizeView;
  sending: boolean;
  /** 실패 안내. 성공하면 페이지를 떠나므로 여기 오지 않는다. */
  message: string | null;
  onApprove: () => void;
  onDeny: () => void;
  onRetry: () => void;
};

/** 승인 화면(BR3.2~BR3.5, NFR1.8). 상태를 갖지 않는 표시 부분이다. 서버·쿼리 값은 React 텍스트로만 그리고 clientName은 없다. */
export function ClaudeAuthorizeView({ view, sending, message, onApprove, onDeny, onRetry }: ClaudeAuthorizeViewProps) {
  return (
    <main className={authStyles.page}>
      <div className={authStyles.panel} data-testid="claude-authorize">
        <h1 className={authStyles.title}>{AUTHORIZE_TEXT.title}</h1>
        {view.kind === "loading" && <LoadingState>{AUTHORIZE_TEXT.loading}</LoadingState>}
        {view.kind === "invalid" && <p className={styles.error} role="alert" data-testid="claude-authorize-invalid">{AUTHORIZE_TEXT.invalid}</p>}
        {view.kind === "lookup-failed" && <LookupFailedState title={AUTHORIZE_TEXT.lookupFailed} onRetry={onRetry} />}
        {view.kind === "ready" && (
          <>
            <p className={styles.notice} data-testid={view.showConsent ? "claude-authorize-consent" : "claude-authorize-reapprove"}>
              {view.showConsent ? AUTHORIZE_TEXT.consent : AUTHORIZE_TEXT.reapprove}
            </p>
            <p className={styles.notice}>{AUTHORIZE_TEXT.host}: <strong data-testid="claude-authorize-host">{view.query.host}</strong></p>
            <p className={styles.warning} data-testid="claude-authorize-warning">{AUTHORIZE_TEXT.warning}</p>
            <div className={styles.actions}>
              <button type="button" className={styles.secondary} onClick={onDeny} disabled={sending}
                data-testid="claude-authorize-cancel-button">{AUTHORIZE_TEXT.cancel}</button>
              <button type="button" className={styles.primary} onClick={onApprove} disabled={sending}
                data-testid="claude-authorize-approve-button">{view.showConsent ? AUTHORIZE_TEXT.approveWithConsent : AUTHORIZE_TEXT.approve}</button>
            </div>
            {sending && <p className={styles.pending} role="status">{AUTHORIZE_TEXT.sending}</p>}
            {message && <p className={styles.error} role="alert" data-testid="claude-authorize-error">{message}</p>}
          </>
        )}
      </div>
    </main>
  );
}

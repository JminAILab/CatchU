import authStyles from "@/components/auth/auth.module.css";
import { LoadingState, LookupFailedState } from "@/components/status/status";
import { CONNECTION_TEXT, formatExpiresAt, type ConnectionLookup, type ConnectionNotice, type CopyResult, type DisconnectPhase } from "./claude-connection";
import styles from "./claude-connection.module.css";

type ClaudeConnectionViewProps = {
  lookup: ConnectionLookup | null;
  phase: DisconnectPhase;
  notice: ConnectionNotice | null;
  copyResult: CopyResult | null;
  onCopy: () => void;
  onOpen: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  onRetry: () => void;
};

/** 연결 관리 화면(BR7.1·BR7.2·BR7.5). 상태를 갖지 않는 표시 부분이다. 서버 값은 React 텍스트로만 그린다. */
export function ClaudeConnectionView({ lookup, phase, notice, copyResult, onCopy, onOpen, onConfirm, onCancel, onRetry }: ClaudeConnectionViewProps) {
  return (
    <main className={authStyles.page}>
      <div className={authStyles.panel} data-testid="claude-connection">
        <h1 className={authStyles.title}>{CONNECTION_TEXT.title}</h1>
        <p className={authStyles.lead}>{CONNECTION_TEXT.lead}</p>
        {lookup === null && <LoadingState>{CONNECTION_TEXT.loading}</LoadingState>}
        {lookup?.kind === "failed" && <LookupFailedState title={CONNECTION_TEXT.lookupFailed} onRetry={onRetry} />}
        {lookup?.kind === "loaded" && (
          <>
            <p className={styles.notice} data-testid="claude-connection-state">{CONNECTION_TEXT.state[lookup.status.state]}</p>
            {lookup.status.expiresAt && (
              <p className={styles.notice} data-testid="claude-connection-expires">{CONNECTION_TEXT.expiresAt}: {formatExpiresAt(lookup.status.expiresAt)}</p>
            )}
            <p className={styles.notice}>{CONNECTION_TEXT.url}: <code className={styles.url} data-testid="claude-connection-url">{lookup.status.mcpUrl}</code></p>
            <div className={styles.actions}>
              <button type="button" className={styles.secondary} onClick={onCopy} data-testid="claude-connection-copy-button">{CONNECTION_TEXT.copy}</button>
            </div>
            {copyResult === "copied" && <p className={styles.pending} role="status" data-testid="claude-connection-copied">{CONNECTION_TEXT.copied}</p>}
            {copyResult === "failed" && <p className={styles.error} role="alert" data-testid="claude-connection-copy-failed">{CONNECTION_TEXT.copyFailed}</p>}
            <section className={styles.section}>
              {phase === "idle" && (
                <button type="button" className={styles.danger} onClick={onOpen} data-testid="claude-connection-disconnect-button">{CONNECTION_TEXT.disconnect}</button>
              )}
              {phase !== "idle" && (
                <div className={styles.confirm} role="alertdialog" aria-labelledby="claude-disconnect-confirm-text" data-testid="claude-connection-confirm">
                  <p id="claude-disconnect-confirm-text" className={styles.confirmText}>{CONNECTION_TEXT.confirm}</p>
                  <div className={styles.actions}>
                    <button type="button" className={styles.secondary} onClick={onCancel} disabled={phase === "sending"}
                      data-testid="claude-connection-cancel-button">{CONNECTION_TEXT.cancel}</button>
                    <button type="button" className={styles.danger} onClick={onConfirm} disabled={phase === "sending"}
                      data-testid="claude-connection-confirm-button">{CONNECTION_TEXT.confirmAction}</button>
                  </div>
                  {phase === "sending" && <p className={styles.pending} role="status">{CONNECTION_TEXT.sending}</p>}
                </div>
              )}
            </section>
          </>
        )}
        {notice && (
          <p className={notice.tone === "error" ? styles.error : styles.pending} role={notice.tone === "error" ? "alert" : "status"}
            data-testid="claude-connection-notice">{notice.text}</p>
        )}
      </div>
    </main>
  );
}

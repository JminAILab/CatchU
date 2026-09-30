import type { ReactNode } from "react";
import styles from "./status.module.css";

/**
 * 조회 상태 공통 표시. 세 상태를 서로 바꿔 쓰지 않는다.
 * - 불러오는 중: LoadingState (요청 중을 성공이나 0건으로 보이지 않게 한다)
 * - 불러오지 못함: LookupFailedState (readApiResponse의 lookup-failed 등. 0건으로 바꾸지 않는다)
 * - 정상 0건: EmptyState (성공 응답의 빈 목록일 때만)
 */

export function LoadingState({ children = "불러오고 있습니다." }: { children?: ReactNode }) {
  return (
    <div className={styles.box} role="status" aria-live="polite">
      <p className={styles.text}>{children}</p>
    </div>
  );
}

type LookupFailedStateProps = {
  title?: ReactNode;
  children?: ReactNode;
  /** 같은 조회만 다시 실행한다. 새 분석·생성 요청을 대신하지 않는다. */
  onRetry?: () => void;
};

export function LookupFailedState({
  title = "불러오지 못했습니다",
  children = "잠시 후 다시 시도해 주세요.",
  onRetry,
}: LookupFailedStateProps) {
  return (
    <div className={styles.failed} role="alert">
      <p className={styles.title}>{title}</p>
      <p className={styles.text}>{children}</p>
      {onRetry && (
        <button type="button" className={styles.retry} onClick={onRetry}>
          다시 불러오기
        </button>
      )}
    </div>
  );
}

type EmptyStateProps = {
  title: ReactNode;
  children?: ReactNode;
  /** 다음 행동 버튼·링크 */
  action?: ReactNode;
};

export function EmptyState({ title, children, action }: EmptyStateProps) {
  return (
    <div className={styles.box}>
      <p className={styles.title}>{title}</p>
      {children && <p className={styles.text}>{children}</p>}
      {action}
    </div>
  );
}

import { RECIPIENT_GUIDE_TITLE, recipientGuideItems } from "./recipient-guide-items";
import styles from "./recipient-guide.module.css";

/**
 * 받은 사람 시작 안내 묶음(12월 intent U2 BR8.2). 계약 C-11 수정 PR #421의 slots 0번 자리에 U4가 단다.
 * props는 하나: `showClaudeConnect`(U9 받은 사람 Claude 연결이 켜졌을 때만 true, 기본 false).
 */
export function RecipientGuide({ showClaudeConnect = false }: { showClaudeConnect?: boolean }) {
  return (
    <section className={styles.guide} aria-labelledby="recipient-guide-title" data-testid="recipient-guide">
      <h2 id="recipient-guide-title" className={styles.title}>{RECIPIENT_GUIDE_TITLE}</h2>
      <ul className={styles.items}>
        {recipientGuideItems(showClaudeConnect).map((item) => (
          <li key={item.id} data-testid={`recipient-guide-${item.id}`}>{item.text}</li>
        ))}
      </ul>
    </section>
  );
}

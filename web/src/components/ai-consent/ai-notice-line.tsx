import { AI_NOTICE_LINE } from "./ai-consent-notice";
import styles from "./ai-consent.module.css";

/** AI 기능 화면마다 두는 한 줄 안내. 비로그인 질의응답은 입력란 옆에 이 한 줄을 둔다(12월 intent U2 BR2.5). */
export function AiNoticeLine() {
  return <p className={styles.noticeLine} data-testid="ai-notice-line">{AI_NOTICE_LINE}</p>;
}

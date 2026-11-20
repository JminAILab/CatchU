"use client";

import { useState } from "react";
import { RECIPIENT_GUIDE_TITLE, recipientGuideItems } from "./recipient-guide-items";
import styles from "./recipient-guide.module.css";

const ITEMS_ID = "recipient-guide-items";

/**
 * 받은 사람 시작 안내 묶음(12월 intent U2 BR8.2). 계약 C-11 수정 PR #421의 slots 0번 자리에 U4가 단다.
 * props는 하나: `showClaudeConnect`(U9 받은 사람 Claude 연결이 켜졌을 때만 true, 기본 false).
 *
 * 처음에는 제목만 보이고 항목은 접혀 있다(#606). 제목 단추가 `aria-expanded`로 접힘·펼침을 알리고,
 * 접힌 항목은 `hidden`으로 화면과 낭독 대상에서 함께 빠진다(DOM에는 남는다). 펼친 상태는 저장하지 않는다.
 */
export function RecipientGuide({ showClaudeConnect = false }: { showClaudeConnect?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <section className={styles.guide} aria-labelledby="recipient-guide-title" data-testid="recipient-guide">
      <h2 id="recipient-guide-title" className={styles.title}>
        <button type="button" className={styles.toggle} aria-expanded={expanded} aria-controls={ITEMS_ID}
          onClick={() => setExpanded((previous) => !previous)} data-testid="recipient-guide-toggle">
          <span className={styles.marker} aria-hidden="true" />
          {RECIPIENT_GUIDE_TITLE}
        </button>
      </h2>
      <ul id={ITEMS_ID} className={styles.items} hidden={!expanded}>
        {recipientGuideItems(showClaudeConnect).map((item) => (
          <li key={item.id} data-testid={`recipient-guide-${item.id}`}>{item.text}</li>
        ))}
      </ul>
    </section>
  );
}

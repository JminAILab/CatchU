import type { GatedItem, SourceLocation } from "./rag-answer-api";
import { RAG_ANSWER_MESSAGES } from "./rag-answer-messages";
import styles from "./rag-answer.module.css";

/**
 * 요약·답 항목 표시(기능 설계 BR8.1, 비기능 설계 NFR7.1). 두 패널이 같이 쓴다.
 * CITED는 항목 글 아래 인용 원문과 출처 이름 단추(누르면 showEvidence(location)), AI_INTERPRETATION은 'AI 해석' 꼬리표.
 * 확인된 사실 표시는 붙이지 않는다. 글은 React 텍스트로만 그린다(보안 점검 「화면 출력」).
 */
export function GatedItemView({ items, showEvidence, testId }: {
  items: readonly GatedItem[];
  showEvidence: (location: SourceLocation) => void;
  testId: string;
}) {
  return (
    <ul className={styles.items} data-testid={testId}>
      {items.map((item, index) => (
        <li key={index} data-testid={`${testId}-item`}>
          <span>{item.text}</span>
          {item.kind === "AI_INTERPRETATION" && (
            <span className={styles.label} data-testid={`${testId}-ai-interpretation`}>{RAG_ANSWER_MESSAGES.aiInterpretation}</span>
          )}
          {item.kind === "CITED" && item.citations.map((citation, citationIndex) => (
            <blockquote key={citationIndex} className={styles.quote}>
              {citation.quote}
              <button type="button" className={styles.source} data-testid={`${testId}-evidence-button`}
                onClick={() => showEvidence(citation.location)}>
                {citation.sourceLabel}
              </button>
            </blockquote>
          ))}
        </li>
      ))}
    </ul>
  );
}

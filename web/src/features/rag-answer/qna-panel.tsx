"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { AiNoticeLine } from "@/components/ai-consent/ai-notice-line";
import { api } from "@/lib/api";
import { GatedItemView } from "./gated-item-view";
import { createRagAnswerApi, type GatedItem, type LinkAccessCode, type SourceLocation } from "./rag-answer-api";
import { RAG_ANSWER_MESSAGES } from "./rag-answer-messages";
import { askDisplay, canSendQuestion, type ConversationTurn, historyForRequest, QUESTION_MAX_LENGTH } from "./rag-answer-state";
import styles from "./rag-answer.module.css";

/** C-11 자리 3. U4가 RecipientSlotProps와 showEvidence를 넘긴다. */
export type QnaPanelProps = {
  token: string;
  getGrant: () => string | null;
  onAccessLost: (code: LinkAccessCode) => void;
  isLoggedIn: boolean;
  showEvidence: (location: SourceLocation) => void;
};

const ragAnswerApi = createRagAnswerApi({ client: api, baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL, nodeEnv: process.env.NODE_ENV });

/**
 * 비로그인 질의응답 패널(기능 설계 「화면」, BR8.3~BR8.7). 입력란 500자 옆에 U2 `<AiNoticeLine />` 한 줄을 둔다.
 * 대화는 이 화면 메모리에만 두고(새로고침하면 사라짐) 질문 때 최근 6개를 보낸다. 앞 질문의 스트림이 끝나야 다음 질문을 보낸다.
 * 자료 제외 선택은 없다(BR8.7).
 */
export function QnaPanel(props: QnaPanelProps) {
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [formNotice, setFormNotice] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  // 화면을 떠나면 진행 중인 스트림을 끊는다(서버가 생성을 멈춘다, BR4.8).
  useEffect(() => () => controller.current?.abort(), []);

  async function ask(event: FormEvent) {
    event.preventDefault();
    if (!canSendQuestion(text, sending)) return;
    const question = text.trim();
    const history = historyForRequest(turns);
    const base = [...turns, { role: "USER", text: question } as const];
    const received: GatedItem[] = [];
    const showAnswer = (notice: string | null) => setTurns([...base, { role: "ASSISTANT", items: [...received], notice }]);
    controller.current = new AbortController();
    setSending(true);
    setFormNotice(null);
    showAnswer(null);
    try {
      const outcome = await ragAnswerApi.ask(props, { question, history }, (item) => {
        received.push(item);
        showAnswer(null);
      }, controller.current.signal);
      const display = askDisplay(outcome);
      if (display.keepTurn) {
        showAnswer(display.answerNotice);
        setText("");
      } else {
        setTurns(turns);
      }
      setFormNotice(display.formNotice);
    } catch {
      showAnswer(RAG_ANSWER_MESSAGES.answerFailed);
    } finally {
      setSending(false);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="qna-heading" data-testid="qna-panel">
      <h2 id="qna-heading" className={styles.heading}>{RAG_ANSWER_MESSAGES.qnaHeading}</h2>
      <div data-testid="qna-conversation">
        {turns.map((turn, index) => (turn.role === "USER"
          ? <p key={index} className={styles.question} data-testid="qna-question">{turn.text}</p>
          : (
            <div key={index} data-testid="qna-answer">
              {turn.items.length > 0 && <GatedItemView items={turn.items} showEvidence={props.showEvidence} testId="qna-answer-items" />}
              {turn.notice && <p className={styles.notice} data-testid="qna-answer-notice">{turn.notice}</p>}
            </div>
          )))}
      </div>
      <form className={styles.form} onSubmit={ask} data-testid="qna-form">
        <label htmlFor="qna-question-input">{RAG_ANSWER_MESSAGES.questionLabel}</label>
        <textarea id="qna-question-input" className={styles.input} maxLength={QUESTION_MAX_LENGTH} value={text}
          onChange={(event) => setText(event.target.value)} disabled={sending} data-testid="qna-question-input" />
        <AiNoticeLine />
        {formNotice && <p className={styles.error} role="alert" data-testid="qna-form-notice">{formNotice}</p>}
        <button type="submit" disabled={!canSendQuestion(text, sending)} data-testid="qna-submit-button">
          {RAG_ANSWER_MESSAGES.ask}
        </button>
      </form>
    </section>
  );
}

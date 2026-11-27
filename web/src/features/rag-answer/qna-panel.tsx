"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { AiNoticeLine } from "@/components/ai-consent/ai-notice-line";
import { api } from "@/lib/api";
import { GatedItemView } from "./gated-item-view";
import type { ItemTitleOf } from "./item-title";
import { createRagAnswerApi, type GatedItem, type LinkAccessCode, type SourceLocation } from "./rag-answer-api";
import { RAG_ANSWER_MESSAGES } from "./rag-answer-messages";
import { askAnnouncement, askDisplay, canSendQuestion, type ConversationTurn, historyForRequest, QUESTION_MAX_LENGTH } from "./rag-answer-state";
import styles from "./rag-answer.module.css";

/**
 * C-11 자리 3. U4가 RecipientSlotProps와 showEvidence를 넘긴다.
 * 선택 itemTitleOf(#559 FR4.2)를 넘기면 출처 딱지 옆에 항목 제목을 보인다. 넘기지 않으면 지금처럼 딱지만 보인다.
 */
export type QnaPanelProps = {
  token: string;
  getGrant: () => string | null;
  onAccessLost: (code: LinkAccessCode) => void;
  isLoggedIn: boolean;
  showEvidence: (location: SourceLocation) => void;
  itemTitleOf?: ItemTitleOf;
};

const ragAnswerApi = createRagAnswerApi({ client: api, baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL, nodeEnv: process.env.NODE_ENV });

/**
 * 비로그인 질의응답 패널(기능 설계 「화면」, BR8.3~BR8.7). 입력란 500자 옆에 U2 `<AiNoticeLine />` 한 줄을 둔다.
 * 대화는 이 화면 메모리에만 두고(새로고침하면 사라짐) 질문 때 최근 6개를 보낸다. 앞 질문의 스트림이 끝나야 다음 질문을 보낸다.
 * 자료 제외 선택은 없다(BR8.7).
 *
 * 화면 낭독기 사용(#543, 2026-11-16 팀장 결정):
 * - 초점: 보내는 동안에도 [질문하기] 버튼과 입력란을 `disabled`로 끄지 않는다. 끄면 초점이 풀려 답이 끝나도 돌아오지 않는다.
 *   버튼은 `aria-disabled`, 입력란은 `readOnly`로 막고, 빈 질문·중복 전송은 `ask`의 `canSendQuestion` 검사가 막는다.
 * - 알림: 패널 끝의 보이지 않는 `role="status"` 자리 하나에 처리 중·끝 안내를 넣는다. 답 목록과 답 자리 안내에는 알림 표시를
 *   붙이지 않아, 답 조각이 여러 번 와도 조각마다 읽히지 않고 같은 문장이 두 번 읽히지 않는다.
 * - 버튼 글자: 보내는 동안 버튼에 「답변 만드는 중…」을 보인다. 알림 자리의 안내는 그대로 둔다.
 * - 답 찾기: 초점은 옮기지 않는다. 질문 글이 3단계 제목이라 버튼에서 "이전 제목"으로 가면 가장 최근 질문이고 그 아래가 답이다.
 */
export function QnaPanel(props: QnaPanelProps) {
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [formNotice, setFormNotice] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
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
    setAnnouncement(RAG_ANSWER_MESSAGES.answerPending);
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
      setAnnouncement(askAnnouncement(outcome) ?? "");
    } catch {
      showAnswer(RAG_ANSWER_MESSAGES.answerFailed);
      setAnnouncement(RAG_ANSWER_MESSAGES.answerFailed);
    } finally {
      setSending(false);
    }
  }

  return (
    <section className={styles.qnaPanel} aria-labelledby="qna-heading" data-testid="qna-panel">
      <header className={styles.qnaHeader}>
        <h2 id="qna-heading" className={styles.qnaHeading}>{RAG_ANSWER_MESSAGES.qnaHeading}</h2>
        <p className={styles.qnaDescription} data-testid="qna-description">{RAG_ANSWER_MESSAGES.qnaDescription}</p>
      </header>
      <div className={styles.qnaConversation} data-testid="qna-conversation">
        {turns.map((turn, index) => (turn.role === "USER"
          ? <h3 key={index} className={styles.question} data-testid="qna-question">{turn.text}</h3>
          : (
            <div key={index} data-testid="qna-answer">
              {turn.items.length > 0 && (
                <GatedItemView items={turn.items} showEvidence={props.showEvidence} itemTitleOf={props.itemTitleOf} testId="qna-answer-items" />
              )}
              {turn.notice && <p className={styles.notice} data-testid="qna-answer-notice">{turn.notice}</p>}
            </div>
          )))}
      </div>
      <form className={styles.qnaForm} onSubmit={ask} data-testid="qna-form">
        <label htmlFor="qna-question-input" className={styles.qnaLabel}>{RAG_ANSWER_MESSAGES.questionLabel}</label>
        <textarea id="qna-question-input" className={styles.qnaInput} maxLength={QUESTION_MAX_LENGTH} value={text}
          onChange={(event) => setText(event.target.value)} readOnly={sending} data-testid="qna-question-input" />
        <AiNoticeLine />
        {formNotice && <p className={styles.error} role="alert" data-testid="qna-form-notice">{formNotice}</p>}
        <button type="submit" className={styles.qnaSubmit} aria-disabled={!canSendQuestion(text, sending)} data-testid="qna-submit-button">
          {sending ? RAG_ANSWER_MESSAGES.asking : RAG_ANSWER_MESSAGES.ask}
        </button>
      </form>
      <p role="status" className="visually-hidden" data-testid="qna-status">{announcement}</p>
    </section>
  );
}

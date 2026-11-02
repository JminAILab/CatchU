"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { api } from "@/lib/api";
import { GatedItemView } from "./gated-item-view";
import { createRagAnswerApi, type LinkAccessCode, type SourceLocation, type SummaryView } from "./rag-answer-api";
import { RAG_ANSWER_MESSAGES } from "./rag-answer-messages";
import { afterRegenerate, summaryDisplay, summaryPanelState, type SummaryPanelState } from "./rag-answer-state";
import styles from "./rag-answer.module.css";

/** 받은 사람 모드(C-11 자리 2). U4가 RecipientSlotProps와 showEvidence를 넘긴다. */
export type RecipientSummaryProps = {
  token: string;
  getGrant: () => string | null;
  onAccessLost: (code: LinkAccessCode) => void;
  isLoggedIn: boolean;
  showEvidence: (location: SourceLocation) => void;
};

/** 작성자 모드(C-11 owner-summary). U4의 작성자 발행본 화면이 publicationId와 showEvidence를 넘긴다. */
export type OwnerSummaryProps = {
  publicationId: string;
  showEvidence: (location: SourceLocation) => void;
};

export type BaseSummaryPanelProps = RecipientSummaryProps | OwnerSummaryProps;

/** 읽은 대상(링크·발행본)과 그 결과. 대상이 바뀌면 이전 결과를 쓰지 않는다. */
type Loaded = { key: string; state: SummaryPanelState; notice: string | null };

const ragAnswerApi = createRagAnswerApi({ client: api, baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL, nodeEnv: process.env.NODE_ENV });

/**
 * AI 기본 요약 패널(기능 설계 「화면」, BR8.1·BR8.2). 화면을 열 때(링크·발행본마다) 한 번만 읽고 자동으로 다시 확인하지 않는다(Q3).
 * 받은 사람의 401·404 링크 오류는 onAccessLost로 넘기고 패널은 숨는다(C-11 rule).
 */
export function BaseSummaryPanel(props: BaseSummaryPanelProps) {
  const owner = "publicationId" in props;
  const key = "publicationId" in props ? `owner:${props.publicationId}` : `recipient:${props.token}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const current = loaded?.key === key ? loaded : null;
  const state: SummaryPanelState = current?.state ?? { kind: "loading" };

  const loadSummary = useEffectEvent((signal: AbortSignal) => ("publicationId" in props
    ? ragAnswerApi.ownerSummary(props.publicationId, signal)
    : ragAnswerApi.recipientSummary(props, signal)));

  useEffect(() => {
    const controller = new AbortController();
    const settle = (next: SummaryPanelState) => {
      if (!controller.signal.aborted) setLoaded({ key, state: next, notice: null });
    };
    loadSummary(controller.signal).then(
      (result) => settle(summaryPanelState(result)),
      () => settle({ kind: "error", message: RAG_ANSWER_MESSAGES.loadFailed }),
    );
    return () => controller.abort();
  }, [key]);

  async function regenerate(view: SummaryView) {
    if (!("publicationId" in props) || regenerating) return;
    setRegenerating(true);
    try {
      const next = afterRegenerate(view, await ragAnswerApi.regenerate(props.publicationId));
      setLoaded({ key, state: { kind: "ready", view: next.view }, notice: next.notice });
    } catch {
      setLoaded({ key, state: { kind: "ready", view }, notice: RAG_ANSWER_MESSAGES.regenerateFailed });
    } finally {
      setRegenerating(false);
    }
  }

  if (state.kind === "hidden") return null;
  const display = state.kind === "ready" ? summaryDisplay(state.view, owner ? "owner" : "recipient") : null;
  return (
    <section className={styles.panel} aria-labelledby="base-summary-heading" data-testid="base-summary-panel">
      <h2 id="base-summary-heading" className={styles.heading}>{RAG_ANSWER_MESSAGES.summaryHeading}</h2>
      {state.kind === "loading" && <p className={styles.notice} role="status" data-testid="base-summary-loading">…</p>}
      {state.kind === "error" && <p className={styles.error} role="alert" data-testid="base-summary-error">{state.message}</p>}
      {state.kind === "ready" && display && (
        <>
          {display.message && <p className={styles.notice} data-testid="base-summary-message">{display.message}</p>}
          {display.showItems && <GatedItemView items={state.view.items} showEvidence={props.showEvidence} testId="base-summary-items" />}
          {display.showRegenerate && (
            <button type="button" disabled={regenerating} data-testid="base-summary-regenerate-button"
              onClick={() => regenerate(state.view)}>
              {RAG_ANSWER_MESSAGES.regenerate}
            </button>
          )}
        </>
      )}
      {current?.notice && <p className={styles.error} role="alert" data-testid="base-summary-notice">{current.notice}</p>}
    </section>
  );
}

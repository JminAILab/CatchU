"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type RefObject } from "react";
import { RecipientGuide } from "@/components/recipient-guide/recipient-guide";
import { LoadingState, LookupFailedState } from "@/components/status/status";
import { BaseSummaryPanel } from "@/features/rag-answer/base-summary-panel";
import { QnaPanel } from "@/features/rag-answer/qna-panel";
import type { PdfCopySource } from "@/features/publications/published-pdf-item";
import { JdRecipientPanel } from "@/features/jd/jd-recipient-panel";
import { PublishedSnapshotView, type SnapshotHighlight } from "@/features/publications/snapshot-view";
import { ClaudeAnalyzePanel } from "@/features/recipient-claude/claude-analyze-panel";
import { LINK_UNAVAILABLE_TEXT, LOOKUP_FAILED_TITLE, PASSWORD_REQUIRED_TITLE, publishedAtText, unlockMessage } from "./recipient-format";
import type { RecipientSlotProps } from "./recipient-slots";
import { claudeConnectable, type PublicationSnapshot, type UnlockResult, type UnlockSnapshot } from "./recipient-store";
import styles from "./recipient.module.css";

export type HeadingRef = RefObject<HTMLHeadingElement | null>;

export type RecipientPublicationViewProps = {
  snapshot: PublicationSnapshot;
  /** 상태마다 하나뿐인 U4 h1(`tabIndex={-1}`). 상태가 바뀌면 화면 쪽이 이 제목으로 초점을 옮긴다(G3·G4). */
  headingRef: HeadingRef;
  onRetry: () => void;
  onUnlock: (password: string) => Promise<UnlockResult>;
  waitSeconds: () => number;
  /** `showEvidence`로 대조한 강조 범위. 판정 통과 화면에서만 쓴다. */
  highlight: SnapshotHighlight | null;
  /** 2·3·4번 자리에 넘길 props(C-11). */
  slotProps: RecipientSlotProps;
  /** 1번 자리 PDF 항목의 사본을 받는 방법(U8). 받은 사람 사본 경로에 grant를 머리로 싣고, 401·404는 `onAccessLost`로 넘긴다. */
  pdfSource?: (publishedItemId: string) => PdfCopySource;
};

/**
 * 받은 사람 발행본 화면 그리기(U4 제출 3 W4, 보안 설계 「받은 사람 화면 자리 (C-11)」). 상태와 동작은 `recipient-screen.tsx`가 넘긴다.
 *
 * | 상태 | 위에서부터 |
 * |---|---|
 * | 판정 통과 | U4 h1(발행본 제목) → 0 `RecipientGuide`(U2, `showClaudeConnect={claudeConnectable(snapshot)}`) → 0.5 `ClaudeAnalyzePanel`(U9, 같은 값이 참일 때만) → U4 고정 안내(발행 시각) → 1 발행본 자료 → 2 `BaseSummaryPanel`(U5) → 3 `QnaPanel`(U5) → 4 자리(U10) |
 * | 비밀번호 입력 | U4 h1 → 비밀번호 안내·입력. `RecipientGuide` 없음 |
 * | 접근 불가 | U4 h1 「이 링크는 열람할 수 없습니다」. `RecipientGuide` 없음 |
 *
 * 판정 통과 분기는 `claudeConnectable(snapshot)`을 한 번 읽어 0번의 Claude 줄과 0.5번 패널에 함께 쓴다(C-11 claude-connect-rule, U9 BR6.1).
 * 0.5번 패널에는 `slotProps.token`만 넘기고 grant·비밀번호·`getGrant`·`onAccessLost`는 넘기지 않는다.
 * 사본·설명·본문은 React 텍스트로만 그리고(NFR1.10) GitHub 근거 주소만 링크다(NFR1.11, `snapshot-view.tsx`).
 */
export function RecipientPublicationView({ snapshot, headingRef, onRetry, onUnlock, waitSeconds, highlight, slotProps, pdfSource }: RecipientPublicationViewProps) {
  switch (snapshot.view) {
    case "loading":
      return <LoadingState>발행본을 확인하고 있습니다.</LoadingState>;
    case "unavailable":
      return (
        <section className={`${styles.panel} ${styles.narrow}`} aria-labelledby="recipient-unavailable" data-testid="recipient-unavailable">
          <h1 id="recipient-unavailable" ref={headingRef} tabIndex={-1} className={styles.title}>{LINK_UNAVAILABLE_TEXT}</h1>
        </section>
      );
    case "password":
      return <PasswordStep unlock={snapshot.unlock} onUnlock={onUnlock} waitSeconds={waitSeconds} headingRef={headingRef} />;
    case "failed":
      return (
        <section aria-labelledby="recipient-failed" data-testid="recipient-failed">
          <h1 id="recipient-failed" ref={headingRef} tabIndex={-1} className="visually-hidden">{LOOKUP_FAILED_TITLE}</h1>
          <LookupFailedState title="발행본을 불러오지 못했습니다" onRetry={onRetry}>
            링크 상태를 확인하지 못했습니다. 열람할 수 없는 링크라고 판단한 것은 아니며, 잠시 후 다시 불러와 주세요.
          </LookupFailedState>
        </section>
      );
    case "ready": {
      const connectable = claudeConnectable(snapshot);
      return (
        <>
          {snapshot.refreshFailed && (
            <div role="alert" className={styles.panel}>
              <p className={styles.alert}>최신 자료를 불러오지 못해 이전에 불러온 내용을 보여 주고 있습니다.</p>
              <button type="button" className={styles.secondary} onClick={onRetry}>다시 불러오기</button>
            </div>
          )}
          <section className={styles.panel} aria-labelledby="recipient-title" aria-busy={snapshot.refreshing || undefined} data-testid="recipient-ready">
            <h1 id="recipient-title" ref={headingRef} tabIndex={-1} className={styles.title}>{snapshot.snapshot.title}</h1>
          </section>
          <RecipientGuide showClaudeConnect={connectable} />
          {connectable && <ClaudeAnalyzePanel token={slotProps.token} />}
          <p className={styles.notice} data-testid="recipient-published-at">{publishedAtText(snapshot.snapshot.publishedAt)}</p>
          <PublishedSnapshotView snapshot={snapshot.snapshot} highlight={highlight} pdfSource={pdfSource} />
          <RecipientSlots {...slotProps} />
        </>
      );
    }
  }
}

/**
 * 2·3·4번 자리(C-11 slots). 2·3번은 U5 `BaseSummaryPanel`·`QnaPanel`(`features/rag-answer` README 「붙이는 방법」대로 `RecipientSlotProps`를
 * 그대로 넘기고 `key={token}`). 두 패널은 401·404를 스스로 처리하지 않고 `onAccessLost`를 부르며(C-11 rule), 근거 단추는 `showEvidence`를 부른다.
 * 4번은 U10 `JdRecipientPanel`이 회원 호출을 연결하고 JD 로그인 안내·요약을 소유한다. U4 영역에 안내 문장을 두지 않는다(G6).
 */
function RecipientSlots(props: RecipientSlotProps) {
  return (
    <>
      <div data-testid="recipient-slot-2" data-slot="base-summary">
        <BaseSummaryPanel key={props.token} token={props.token} getGrant={props.getGrant} onAccessLost={props.onAccessLost}
          isLoggedIn={props.isLoggedIn} showEvidence={props.showEvidence} />
      </div>
      <div data-testid="recipient-slot-3" data-slot="qna">
        <QnaPanel key={props.token} token={props.token} getGrant={props.getGrant} onAccessLost={props.onAccessLost}
          isLoggedIn={props.isLoggedIn} showEvidence={props.showEvidence} />
      </div>
      <div data-testid="recipient-slot-4" data-slot="jd-summary" data-logged-in={props.isLoggedIn}>
        <JdRecipientPanel key={props.token} {...props} />
      </div>
    </>
  );
}

/**
 * 비밀번호 입력(10월 V01). 비밀번호는 이 화면의 입력값에만 두고, 본문으로만 보낸다(주소·로그·상태 객체에 남기지 않음).
 * 확인 중·시도 제한 대기 중에는 다시 보내지 않으며, 대기가 끝나도 자동으로 보내지 않는다.
 * 입력칸에 `autoFocus`를 두지 않는다: 첫 초점은 이 화면의 h1이고(G4), 입력으로는 Tab 한 번으로 간다. 틀린 값·빈 값 뒤에는 입력으로 초점을 돌린다.
 */
function PasswordStep({ unlock, onUnlock, waitSeconds, headingRef }: {
  unlock: UnlockSnapshot;
  onUnlock: (password: string) => Promise<UnlockResult>;
  waitSeconds: () => number;
  headingRef: HeadingRef;
}) {
  const inputId = useId();
  const messageId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState("");
  const [, setTick] = useState(0);
  const seconds = waitSeconds();
  const waiting = seconds > 0;
  const submitting = unlock.phase === "submitting";

  // 남은 시간은 화면에만 반영한다. 0이 돼도 자동으로 보내지 않는다.
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => setTick((tick) => tick + 1), 1000);
    return () => clearInterval(timer);
  }, [waiting, unlock.retryAt]);

  const message = unlockMessage(unlock, seconds);
  const invalid = unlock.phase === "invalid" || unlock.phase === "empty";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || waiting) return;
    const result = await onUnlock(password);
    // 서버가 불일치를 확인하면 입력을 비우고 다시 입력하게 한다. 그 밖의 실패는 입력을 그대로 둔다.
    if (result === "invalid") setPassword("");
    if (result === "invalid" || result === "empty") inputRef.current?.focus();
  }

  return (
    <section className={`${styles.panel} ${styles.narrow}`} aria-labelledby="recipient-password" data-testid="recipient-password">
      <h1 id="recipient-password" ref={headingRef} tabIndex={-1} className={styles.title}>{PASSWORD_REQUIRED_TITLE}</h1>
      <p className={styles.muted}>전달받은 비밀번호를 입력하세요.</p>
      <form method="post" onSubmit={(event) => { void submit(event); }} noValidate>
        <div className={styles.field}>
          <label htmlFor={inputId} className={styles.label}>비밀번호</label>
          <input id={inputId} ref={inputRef} className={styles.input} type="password" autoComplete="off"
            value={password} onChange={(event) => setPassword(event.target.value)} disabled={submitting}
            aria-invalid={invalid || undefined} aria-describedby={message ? messageId : undefined} />
        </div>
        <p id={messageId} className={message?.tone === "alert" ? styles.alert : styles.status}
          role={message?.tone === "alert" ? "alert" : "status"} aria-live="polite">
          {message?.text ?? ""}
        </p>
        <div className={styles.actions}>
          <button type="submit" className={styles.primary} disabled={submitting || waiting} aria-busy={submitting || undefined}>
            {submitting ? "확인 중…" : "열람하기"}
          </button>
        </div>
      </form>
    </section>
  );
}

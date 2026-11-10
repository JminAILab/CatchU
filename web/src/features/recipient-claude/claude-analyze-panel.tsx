"use client";

import Link from "next/link";
import { useState } from "react";
import styles from "@/features/recipient/recipient.module.css";
import { copyText } from "@/lib/copy-text";
import { routes } from "@/lib/routes";
import { CLAUDE_ANALYZE_TEXT, requestSentence } from "./recipient-claude-text";

/**
 * 받은 사람 화면의 Claude 패널(12월 intent U9 기능 설계 BR5.4·BR6.1~BR6.5, 비기능 NFR1.7·NFR2.2·NFR7.2).
 * U4 받은 사람 화면이 판정 통과 분기에서 `claudeConnectable(snapshot)`이 참일 때만 시작 안내 바로 아래(0.5번 자리)에 단다.
 * 패널은 토큰 하나만 받고 grant·비밀번호를 모른다. API를 부르지 않고, 초점을 옮기지 않으며, 제목(h1)을 두지 않는다(BR6.5).
 * 모양은 새 CSS 파일 없이 U4 `recipient.module.css`의 클래스를 쓴다.
 */

export type ClaudeAnalyzeCopyResult = "copied" | "failed";

export type ClaudeAnalyzeSetters = {
  setExpanded: (expanded: boolean) => void;
  setSentence: (sentence: string) => void;
  setCopyResult: (result: ClaudeAnalyzeCopyResult) => void;
};

/**
 * [Claude에서 분석하기]를 눌렀을 때(BR6.3). U6 `copyConnectionUrl`처럼 복사 함수와 출처를 받는다.
 * 문장은 누를 때의 출처로 만들고, 안내를 펼친 뒤(이미 펼쳤으면 그대로) 복사한다. 누를 때마다 다시 복사하고 결과를 새로 둔다.
 * '복사했습니다'는 복사 함수가 true일 때만이다. 실패해도 펼친 안내에 문장이 남아 직접 복사할 수 있다(NFR7.2).
 */
export async function pressClaudeAnalyze(
  copy: (text: string) => Promise<boolean>, origin: string, token: string, setters: ClaudeAnalyzeSetters,
): Promise<void> {
  const sentence = requestSentence(origin, token);
  setters.setSentence(sentence);
  setters.setExpanded(true);
  setters.setCopyResult(await copy(sentence) ? "copied" : "failed");
}

export type ClaudeAnalyzePanelViewProps = {
  expanded: boolean;
  /** 마지막으로 누를 때 만든 요청 문장. 누르기 전에는 빈 글이다. 펼친 안내에서만 그린다. */
  sentence: string;
  copyResult: ClaudeAnalyzeCopyResult | null;
  onPress: () => void;
};

const HINT_ID = "claude-analyze-hint";

/**
 * 패널 그리기. 상태를 갖지 않는다.
 * - 누르기 전에는 필수 단계처럼 보이지 않는 작은 보조 영역이다(보조 문구 둘, 버튼, 버튼 설명).
 * - 복사 결과는 처음부터 있는 `role="status"`·`aria-live="polite"` 영역에 쓴다(BR6.5).
 * - 펼친 안내는 세 단계, 그 바로 아래 주의 한 줄, `/profile/claude` 링크, 요청 문장 순서다(BR6.4). 펼치기 전에는 그리지 않는다.
 */
export function ClaudeAnalyzePanelView({ expanded, sentence, copyResult, onPress }: ClaudeAnalyzePanelViewProps) {
  const status = copyResult === "copied" ? CLAUDE_ANALYZE_TEXT.copied : copyResult === "failed" ? CLAUDE_ANALYZE_TEXT.copyFailed : "";
  return (
    <section className={styles.notice} data-testid="claude-analyze-panel">
      <p className={styles.muted}>{CLAUDE_ANALYZE_TEXT.optional}</p>
      <p className={styles.muted}>{CLAUDE_ANALYZE_TEXT.withoutConnection}</p>
      <div className={styles.actions}>
        <button type="button" className={styles.secondary} aria-expanded={expanded} aria-describedby={HINT_ID} onClick={onPress}
          data-testid="claude-analyze-button">{CLAUDE_ANALYZE_TEXT.button}</button>
      </div>
      <p id={HINT_ID} className={styles.muted}>{CLAUDE_ANALYZE_TEXT.buttonHint}</p>
      <p className={copyResult === "failed" ? styles.alert : styles.status} role="status" aria-live="polite"
        data-testid="claude-analyze-status">{status}</p>
      {expanded && (
        <>
          <ol>
            {CLAUDE_ANALYZE_TEXT.steps.map((step) => <li key={step}>{step}</li>)}
          </ol>
          <p data-testid="claude-analyze-caution"><strong>{CLAUDE_ANALYZE_TEXT.caution}</strong></p>
          <p><Link href={routes.profileClaude} data-testid="claude-analyze-profile-link">{CLAUDE_ANALYZE_TEXT.profileLink}</Link></p>
          <p data-testid="claude-analyze-sentence">{sentence}</p>
        </>
      )}
    </section>
  );
}

/**
 * 펼침·문장·복사 결과 상태를 가진 패널. 새로고침하면 처음으로 돌아간다.
 * 출처와 클립보드는 버튼을 누를 때만 읽고, 그리는 동안에는 `window`를 읽지 않는다.
 */
export function ClaudeAnalyzePanel({ token }: { token: string }) {
  const [expanded, setExpanded] = useState(false);
  const [sentence, setSentence] = useState("");
  const [copyResult, setCopyResult] = useState<ClaudeAnalyzeCopyResult | null>(null);

  const press = () => {
    void pressClaudeAnalyze((text) => copyText(navigator.clipboard, text), window.location.origin, token,
      { setExpanded, setSentence, setCopyResult });
  };

  return <ClaudeAnalyzePanelView expanded={expanded} sentence={sentence} copyResult={copyResult} onPress={press} />;
}

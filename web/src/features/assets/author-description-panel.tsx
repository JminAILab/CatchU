"use client";

import { editStatusLines, type EditStatus } from "../../lib/save-outcome.ts";
import styles from "./assets.module.css";

const MAX_LENGTH = 4000;

export type AuthorDescriptionPanelProps = {
  loadState: "loading" | "ready" | "error";
  value: string;
  status: EditStatus;
  dirty: boolean;
  /** 불러오기 실패 이유(로그인 만료 등). */
  loadFailureText?: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onRetry: () => void;
};

/**
 * Catch 상세의 작성자 설명 영역(U4 W1). 기록에서 확인한 내용(위쪽)·작성자 설명(이 영역)·AI 설명 초안(아래 「Catch 설명 초안」)을
 * 다른 제목으로 나눈다(BR1.3). AI 초안은 입력칸에 넣지 않는다. 입력은 React 텍스트로만 그린다(NFR1.10).
 * 상태와 저장은 `AuthorDescriptionEditor`가 맡고, 이 컴포넌트는 그리기만 한다.
 */
export function AuthorDescriptionPanel(props: AuthorDescriptionPanelProps) {
  const { loadState, value, status, dirty } = props;
  const saving = status.kind === "saving";
  const lines = editStatusLines(status);
  const length = Array.from(value).length;
  return (
    <section className={styles.detailSection} aria-labelledby="catch-author-description-title" data-testid="catch-author-description">
      <h3 id="catch-author-description-title">작성자 설명 <span className={styles.small}>내가 직접 쓴 설명</span></h3>
      <p className={styles.small}>
        경험의 맥락·판단·배운 점을 자유롭게 적어 주세요. AI가 만든 「Catch 설명 초안」은 이 설명을 바꾸지 않습니다.
        비워 두고 저장하면 설명이 지워집니다.
      </p>
      {loadState === "loading" ? <p role="status">작성자 설명을 불러오고 있습니다.</p>
        : loadState === "error" ? <div role="alert" className={styles.actionError}>
          <p>작성자 설명을 불러오지 못했습니다.</p>
          {props.loadFailureText && <p>{props.loadFailureText}</p>}
          <button type="button" className={styles.secondaryButton} data-testid="catch-author-description-retry"
            onClick={props.onRetry}>다시 불러오기</button>
        </div>
        : <form onSubmit={(event) => { event.preventDefault(); props.onSave(); }} noValidate>
          <label htmlFor="catch-author-description-input" className="visually-hidden">작성자 설명</label>
          <textarea id="catch-author-description-input" data-testid="catch-author-description-input"
            className={styles.descriptionInput} value={value} rows={6} disabled={saving}
            aria-describedby="catch-author-description-count" onChange={(event) => props.onChange(event.target.value)} />
          <p id="catch-author-description-count" className={styles.small}>
            {length.toLocaleString("ko-KR")} / {MAX_LENGTH.toLocaleString("ko-KR")}자
            {dirty && !saving ? " · 저장하지 않은 변경이 있습니다." : ""}
          </p>
          {lines && <div role={lines.tone} className={lines.tone === "alert" ? styles.actionError : undefined}
            data-testid="catch-author-description-status">
            {lines.lines.map((line) => <p key={line}>{line}</p>)}
          </div>}
          <button type="submit" className={styles.primaryButton} data-testid="catch-author-description-save" disabled={saving}>
            {saving ? "저장 중…" : "설명 저장"}
          </button>
        </form>}
    </section>
  );
}

"use client";

import { useId } from "react";
import {
  MAX_DESCRIPTION_LENGTH, SECTION_TITLES, countCodePoints, joinSections, type SectionTexts, type SectionTitle,
} from "../../lib/author-description-sections.ts";
import { collectLinks, evidenceRepositoryOf, githubLinkName } from "../../lib/github-link-name.ts";
import { editStatusLines, type EditStatus } from "../../lib/save-outcome.ts";
import styles from "./assets.module.css";

/**
 * 「짚어 볼 곳」 칸 아래 안내(새 Catch BR4.4). 관련 커밋을 넣는 단추나 목록은 두지 않는다.
 * 줄 고정 주소(Copy permalink)는 얻기 어려워 커밋 화면 한 가지 방법으로 줄였다(Step 15 확인 중 팀장 발견, 2026-11-10).
 * 커밋 화면 주소에는 파일 이름이 없어 메모에 적게 하고, 파일 경로가 기호로 들어가 한글 앞에서 끊기지 않으므로 한글 파일 이름 안내는 뺐다.
 */
export const POINT_HINTS = [
  "면접관이 설명을 청할 만한 줄(정한 것·고친 것이 드러나는 곳)을 고르세요.",
  "위 근거의 본인 커밋을 열고, 바뀐 줄의 줄 번호를 누르세요(여러 줄이면 Shift를 누른 채 끝 줄 번호도 누르세요). 주소창의 주소를 그대로 붙이세요.",
  "메모에 파일 이름과 짚을 까닭을 적으세요.",
  "관련 커밋은 위 근거의 본인 커밋 주소를 붙이세요.",
] as const;

const POINT_TITLE: SectionTitle = "짚어 볼 곳";

export type AuthorDescriptionPanelProps = {
  loadState: "loading" | "ready" | "error";
  /** 지금 8칸 글. 저장 전 글도 링크 목록과 합계 글자 수에 쓴다. */
  texts: Readonly<SectionTexts>;
  status: EditStatus;
  dirty: boolean;
  /** 이 Catch 근거 주소. 링크 목록의 다른 저장소 앞붙임을 정한다(BR2.4). */
  evidenceUrls: readonly string[];
  /** 불러오기 실패 이유(로그인 만료 등). */
  loadFailureText?: string;
  onChange: (title: SectionTitle, value: string) => void;
  onSave: () => void;
  onRetry: () => void;
};

/**
 * 「발행하면 면접관에게 열릴 링크」(BR3.1~BR3.3). 칸을 고칠 때마다 화면 안에서만 다시 계산하고 API를 부르지 않는다. 알림 영역이 아니다.
 * 항목은 면접관 화면과 같은 이름의 글자이고 누를 수 없어 Tab 순서에 들지 않는다(다듬은 화면 interaction-spec 2절).
 */
function LinkPreview({ texts, evidenceUrls, headingId }: { texts: Readonly<SectionTexts>; evidenceUrls: readonly string[]; headingId: string }) {
  const links = collectLinks(SECTION_TITLES.map((title) => texts[title]));
  const evidenceRepository = evidenceRepositoryOf(evidenceUrls);
  return (
    <section className={styles.linkPreview} aria-labelledby={headingId} data-testid="catch-author-description-links">
      <h4 id={headingId}>발행하면 면접관에게 열릴 링크</h4>
      {links.length > 0 ? <>
        <ul className={styles.linkList}>
          {links.map((url) => <li key={url} data-testid="catch-author-description-link-name">{githubLinkName(url, evidenceRepository)}</li>)}
        </ul>
        <p className={styles.small}>이미 보낸 발행본에는 반영되지 않습니다. 고쳤다면 새로 발행하세요.</p>
      </> : <p className={styles.small}>발행하면 면접관에게 열릴 링크가 없습니다.</p>}
    </section>
  );
}

/**
 * Catch 상세의 작성자 설명 영역(U4 W1, 새 Catch W1·BR4.3~BR4.5). 칸 제목 8개를 각 글칸의 보이는 `label`로 펼쳐 두고 [설명 저장] 하나로 합친 글을 저장한다.
 * 기록에서 확인한 내용(위쪽)·Catch 설명 초안(위쪽)과 다른 제목으로 나눈다. AI 초안은 입력칸에 넣지 않는다. 입력은 React 텍스트로만 그린다(NFR1.10).
 * 상태와 저장은 `AuthorDescriptionEditor`가 맡고, 이 컴포넌트는 그리기만 한다.
 */
export function AuthorDescriptionPanel(props: AuthorDescriptionPanelProps) {
  const { loadState, texts, status, dirty } = props;
  const baseId = useId();
  const noticeId = `${baseId}-notice`;
  const hintsId = `${baseId}-hints`;
  const countId = `${baseId}-count`;
  const saving = status.kind === "saving";
  const lines = editStatusLines(status);
  const length = countCodePoints(joinSections(texts));
  return (
    <section className={styles.detailSection} aria-labelledby="catch-author-description-title" data-testid="catch-author-description">
      <h3 id="catch-author-description-title">작성자 설명 <span className={styles.small}>내가 직접 쓴 설명</span></h3>
      <p className={styles.small}>
        쓰고 싶은 칸만 한두 문장씩 쓰면 됩니다. 빈 칸은 면접관에게 보이지 않습니다. AI가 만든 「Catch 설명 초안」은 이 설명을 바꾸지 않습니다.
        비워 두고 저장하면 설명이 지워집니다.
      </p>
      <p id={noticeId} className={styles.small}>이 글은 링크를 가진 누구나 보고 외부 AI로도 보냅니다. 다른 사람의 이름·평가와 비밀값은 쓰지 마세요.</p>
      {loadState === "loading" ? <p role="status">작성자 설명을 불러오고 있습니다.</p>
        : loadState === "error" ? <div role="alert" className={styles.actionError}>
          <p>작성자 설명을 불러오지 못했습니다.</p>
          {props.loadFailureText && <p>{props.loadFailureText}</p>}
          <button type="button" className={styles.secondaryButton} data-testid="catch-author-description-retry"
            onClick={props.onRetry}>다시 불러오기</button>
        </div>
        : <form onSubmit={(event) => { event.preventDefault(); props.onSave(); }} noValidate>
          {SECTION_TITLES.map((title, index) => {
            const fieldId = `${baseId}-field-${index}`;
            return (
              <div key={title} className={styles.descriptionField}>
                <label htmlFor={fieldId} className={styles.descriptionLabel}>{title}</label>
                <textarea id={fieldId} data-testid="catch-author-description-input" data-section={title}
                  className={styles.descriptionInput} value={texts[title]} rows={3} disabled={saving}
                  aria-describedby={index === 0 ? noticeId : title === POINT_TITLE ? hintsId : undefined}
                  onChange={(event) => props.onChange(title, event.target.value)} />
                {title === POINT_TITLE && (
                  <ul id={hintsId} className={styles.descriptionHints} data-testid="catch-author-description-hints">
                    {POINT_HINTS.map((hint) => <li key={hint}>{hint}</li>)}
                  </ul>
                )}
              </div>
            );
          })}
          <LinkPreview texts={texts} evidenceUrls={props.evidenceUrls} headingId={`${baseId}-links`} />
          <p id={countId} className={styles.small} data-testid="catch-author-description-count">
            {length.toLocaleString("ko-KR")} / {MAX_DESCRIPTION_LENGTH.toLocaleString("ko-KR")}자 (칸 제목 포함)
            {dirty && !saving ? " · 저장하지 않은 변경이 있습니다." : ""}
          </p>
          {lines && <div role={lines.tone} className={lines.tone === "alert" ? styles.actionError : undefined}
            data-testid="catch-author-description-status">
            {lines.lines.map((line) => <p key={line}>{line}</p>)}
          </div>}
          <button type="submit" className={styles.primaryButton} data-testid="catch-author-description-save" disabled={saving}
            aria-describedby={countId}>
            {saving ? "저장 중…" : "설명 저장"}
          </button>
        </form>}
    </section>
  );
}

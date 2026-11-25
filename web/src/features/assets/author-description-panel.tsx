"use client";

import { useId } from "react";
import {
  MAX_DESCRIPTION_LENGTH, SECTION_TITLES, countCodePoints, editSectionTitles, joinSections, type SectionTexts, type SectionTitle,
} from "../../lib/author-description-sections.ts";
import { editStatusLines, type EditStatus } from "../../lib/save-outcome.ts";
import styles from "./assets.module.css";

/**
 * 「짚어 볼 곳」 칸 아래 안내(새 Catch BR4.4). 관련 커밋을 넣는 단추나 목록은 두지 않는다.
 * 줄 고정 주소(Copy permalink)는 얻기 어려워 커밋 화면 한 가지 방법으로 줄였다(Step 15 확인 중 팀장 발견, 2026-11-10).
 * 커밋 화면 주소에는 파일 이름이 없어 메모에 적게 하고, 파일 경로가 기호로 들어가 한글 앞에서 끊기지 않으므로 한글 파일 이름 안내는 뺐다.
 * 근거가 이 칸 위에만 있지 않게 될 배치(#635)에 맞춰 「위 근거」를 「근거」로 썼다(#634).
 */
export const POINT_HINTS = [
  "면접관이 설명을 청할 만한 줄(정한 것·고친 것이 드러나는 곳)을 고르세요.",
  "근거의 본인 커밋을 열고, 바뀐 줄의 줄 번호를 누르세요(여러 줄이면 Shift를 누른 채 끝 줄 번호도 누르세요). 주소창의 주소를 그대로 붙이세요.",
  "메모에 파일 이름과 짚을 까닭을 적으세요.",
  "관련 커밋은 근거의 본인 커밋 주소를 붙이세요.",
] as const;

/** 늘 보이는 앞 두 칸 아래 안내 한 줄(#634). 옛 칸에는 안내가 없다. */
export const FIELD_GUIDES: Partial<Record<SectionTitle, string>> = {
  "이 작업에서 정한 것": "무엇이 문제였고 왜 이렇게 정했는지 적으세요. 버린 방법이나 팀에서 맡은 부분도 여기에 쓰면 됩니다.",
  "어떻게 확인했고 무엇을 고쳤나": "무엇으로 확인했고 결과는 어땠는지, AI가 낸 것 가운데 버리거나 고친 것이 있으면 함께 적으세요.",
};

const FIRST_TITLE: SectionTitle = "이 작업에서 정한 것";
const POINT_TITLE: SectionTitle = "짚어 볼 곳";

export type AuthorDescriptionPanelProps = {
  loadState: "loading" | "ready" | "error";
  /** 지금 칸 글. 저장 전 글도 합계 글자 수에 쓴다. */
  texts: Readonly<SectionTexts>;
  /** 마지막으로 저장에 성공한 칸 글. 글이 있는 옛 칸을 보일지 정한다(#634). */
  savedTexts: Readonly<SectionTexts>;
  status: EditStatus;
  dirty: boolean;
  /** 불러오기 실패 이유(로그인 만료 등). */
  loadFailureText?: string;
  onChange: (title: SectionTitle, value: string) => void;
  onSave: () => void;
  onRetry: () => void;
};

/**
 * Catch 상세의 작성자 설명 영역(U4 W1, 새 Catch W1·BR4.3~BR4.5, #634). 늘 보이는 칸 셋(「이 작업에서 정한 것」·「어떻게 확인했고 무엇을 고쳤나」·「짚어 볼 곳」)과
 * 글이 저장된 옛 칸을 칸 제목이 보이는 `label`인 글칸으로 펼쳐 두고 [설명 저장] 하나로 합친 글을 저장한다.
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
          {editSectionTitles(props.savedTexts, texts).map((title) => {
            // 글칸 id는 읽기 목록 순번이라, 옛 칸이 나타나거나 사라져도 다른 칸의 id가 바뀌지 않는다.
            const index = SECTION_TITLES.indexOf(title);
            const fieldId = `${baseId}-field-${index}`;
            const guide = FIELD_GUIDES[title];
            const guideId = `${baseId}-guide-${index}`;
            const describedBy = [title === FIRST_TITLE ? noticeId : null, guide ? guideId : null, title === POINT_TITLE ? hintsId : null]
              .filter(Boolean).join(" ");
            return (
              <div key={title} className={styles.descriptionField}>
                <label htmlFor={fieldId} className={styles.descriptionLabel}>{title}</label>
                {guide && <p id={guideId} className={styles.descriptionGuide} data-testid="catch-author-description-guide">{guide}</p>}
                <textarea id={fieldId} data-testid="catch-author-description-input" data-section={title}
                  className={styles.descriptionInput} value={texts[title]} rows={3} disabled={saving}
                  aria-describedby={describedBy || undefined}
                  onChange={(event) => props.onChange(title, event.target.value)} />
                {title === POINT_TITLE && (
                  <ul id={hintsId} className={styles.descriptionHints} data-testid="catch-author-description-hints">
                    {POINT_HINTS.map((hint) => <li key={hint}>{hint}</li>)}
                  </ul>
                )}
              </div>
            );
          })}
          <p id={countId} className={styles.small} data-testid="catch-author-description-count">
            {length.toLocaleString("ko-KR")} / {MAX_DESCRIPTION_LENGTH.toLocaleString("ko-KR")}자 (칸 제목 포함)
            {dirty && !saving ? " · 저장하지 않은 변경이 있습니다." : ""}
          </p>
          {lines && <div role={lines.tone} className={lines.tone === "alert" ? styles.actionError : undefined}
            data-testid="catch-author-description-status">
            {lines.lines.map((line) => <p key={line}>{line}</p>)}
          </div>}
          {/* 저장 중에는 `disabled` 대신 `aria-disabled`로 막는다. 초점이 있던 단추가 `disabled`가 되면 브라우저가 초점을 body로 빼서
              저장 뒤 Tab이 상세 창 맨 앞부터 다시 시작했다(#636 리뷰). 저장 중에 다시 눌러도 `AuthorDescriptionEditor`가 보내지 않는다. */}
          <button type="submit" className={styles.primaryButton} data-testid="catch-author-description-save" aria-disabled={saving || undefined}
            aria-describedby={countId}>
            {saving ? "저장 중…" : "설명 저장"}
          </button>
        </form>}
    </section>
  );
}

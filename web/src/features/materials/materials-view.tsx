"use client";

import { editStatusLines, type EditStatus } from "../../lib/save-outcome.ts";
import { MATERIAL_LIMITS, SENSITIVE_INFO_NOTICE, type MaterialDraft, type TextMaterialItem } from "./materials-api.ts";
import styles from "./materials.module.css";

export type MaterialsListViewProps = {
  state: "loading" | "ready" | "error";
  items: readonly TextMaterialItem[];
  errorText?: string;
  hasMore: boolean;
  moreState: "idle" | "loading" | "error";
  selectedId: string | null;
  onRetry: () => void;
  onLoadMore: () => void;
  onOpen: (textMaterialId: string) => void;
  onNew: () => void;
};

const dateText = (value: string) => new Date(value).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });

/** 텍스트 자료 목록(U4 W2). 조회 실패를 0건으로 보이지 않는다. 제목은 React 텍스트로만 그린다(NFR1.10). */
export function MaterialsListView(props: MaterialsListViewProps) {
  return (
    <section className={styles.list} aria-labelledby="materials-list-title" data-testid="materials-list">
      <div className={styles.listHeading}>
        <h2 id="materials-list-title">내 텍스트 자료</h2>
        <button type="button" className={styles.primaryButton} data-testid="materials-new-button" onClick={props.onNew}>새 자료</button>
      </div>
      {props.state === "loading" ? <p role="status">자료 목록을 불러오고 있습니다.</p>
        : props.state === "error" ? <div role="alert" className={styles.error}>
          <p>{props.errorText ?? "자료 목록을 불러오지 못했습니다."}</p>
          <button type="button" className={styles.secondaryButton} data-testid="materials-list-retry" onClick={props.onRetry}>다시 불러오기</button>
        </div>
        : props.items.length === 0 ? <p data-testid="materials-empty">아직 등록한 텍스트 자료가 없습니다. [새 자료]로 만들어 보세요.</p>
        : <ul className={styles.items}>
          {props.items.map((item) => (
            <li key={item.textMaterialId}>
              <button type="button" className={item.textMaterialId === props.selectedId ? styles.itemActive : styles.item}
                data-testid="materials-item-open" aria-current={item.textMaterialId === props.selectedId ? "true" : undefined}
                onClick={() => props.onOpen(item.textMaterialId)}>
                <span className={styles.itemTitle}>{item.title}</span>
                <span className={styles.small}>마지막 저장 {dateText(item.updatedAt)}</span>
              </button>
            </li>
          ))}
        </ul>}
      {props.state === "ready" && props.hasMore && <div className={styles.more}>
        {props.moreState === "error" && <p role="alert">다음 목록을 불러오지 못했습니다.</p>}
        <button type="button" className={styles.secondaryButton} data-testid="materials-load-more"
          disabled={props.moreState === "loading"} onClick={props.onLoadMore}>
          {props.moreState === "loading" ? "불러오는 중…" : props.moreState === "error" ? "다음 목록 다시 불러오기" : "더 보기"}
        </button>
      </div>}
    </section>
  );
}

export type MaterialEditorViewProps = {
  isNew: boolean;
  draft: MaterialDraft;
  status: EditStatus;
  dirty: boolean;
  deleteState: "idle" | "deleting" | { error: string };
  onChange: (draft: MaterialDraft) => void;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
};

/**
 * 텍스트 자료 편집(U4 W2). 민감 정보 안내를 항상 보인다(BR3.3). 저장 결과는 성공 응답 뒤에만 "저장됨"이고
 * 실패하면 입력을 남긴 채 "저장되지 않았습니다"와 이유를 보인다(BR2.3). 삭제는 확인을 거친 뒤 화면이 요청한다.
 */
export function MaterialEditorView(props: MaterialEditorViewProps) {
  const { draft, status, dirty } = props;
  const busy = status.kind === "saving" || props.deleteState === "deleting";
  const lines = editStatusLines(status);
  const titleLength = Array.from(draft.title.trim()).length;
  const bodyLength = Array.from(draft.body).length;
  return (
    <section className={styles.editor} aria-labelledby="material-editor-title" data-testid="material-editor">
      <div className={styles.listHeading}>
        <h2 id="material-editor-title">{props.isNew ? "새 텍스트 자료" : "텍스트 자료 편집"}</h2>
        <button type="button" className={styles.secondaryButton} data-testid="material-editor-close" disabled={busy}
          onClick={props.onClose}>목록으로</button>
      </div>
      <p className={styles.notice} data-testid="material-sensitive-notice">{SENSITIVE_INFO_NOTICE}</p>
      <form onSubmit={(event) => { event.preventDefault(); props.onSave(); }} noValidate>
        <label className={styles.field} htmlFor="material-title-input">제목
          <input id="material-title-input" data-testid="material-title-input" value={draft.title} disabled={busy}
            aria-describedby="material-title-count" onChange={(event) => props.onChange({ ...draft, title: event.target.value })} />
        </label>
        <p id="material-title-count" className={styles.small}>{titleLength} / {MATERIAL_LIMITS.title}자</p>
        <label className={styles.field} htmlFor="material-body-input">본문
          <textarea id="material-body-input" data-testid="material-body-input" value={draft.body} rows={14} disabled={busy}
            aria-describedby="material-body-count" onChange={(event) => props.onChange({ ...draft, body: event.target.value })} />
        </label>
        <p id="material-body-count" className={styles.small}>
          {bodyLength.toLocaleString("ko-KR")} / {MATERIAL_LIMITS.body.toLocaleString("ko-KR")}자
          {dirty && !busy ? " · 저장하지 않은 변경이 있습니다." : ""}
        </p>
        {lines && <div role={lines.tone} className={lines.tone === "alert" ? styles.error : undefined} data-testid="material-save-status">
          {lines.lines.map((line) => <p key={line}>{line}</p>)}
        </div>}
        {typeof props.deleteState === "object" && <p role="alert" className={styles.error} data-testid="material-delete-error">
          {props.deleteState.error}</p>}
        <div className={styles.actions}>
          {!props.isNew && <button type="button" className={styles.dangerButton} data-testid="material-delete-button" disabled={busy}
            onClick={props.onDelete}>{props.deleteState === "deleting" ? "삭제 중…" : "삭제"}</button>}
          <button type="submit" className={styles.primaryButton} data-testid="material-save-button" disabled={busy}>
            {status.kind === "saving" ? "저장 중…" : "저장"}
          </button>
        </div>
      </form>
    </section>
  );
}

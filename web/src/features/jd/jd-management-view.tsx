import type { JdManagementModel, JdManagementState } from "./jd-management-model";
import styles from "./jd.module.css";

export function JdList({ state, model }: { state: JdManagementState; model: JdManagementModel }) {
  const busy = state.editState === "saving" || state.deleting;
  return <section aria-label="저장한 JD" className={styles.card}>
    <h2>저장한 JD</h2>
    <div className={styles.actions}>
      <button data-testid="jd-new" type="button" disabled={busy} onClick={() => void model.select(null)}>새 JD 작성</button>
      <button data-testid="jd-list-refresh" type="button" disabled={state.listState === "loading"} onClick={() => void model.load()}>목록 새로고침</button>
    </div>
    {state.listState === "loading" && <p role="status">JD 목록을 불러오고 있습니다.</p>}
    {state.listState === "ready" && state.list.length === 0 && <p>저장한 JD가 없습니다. 새 JD를 작성해 주세요.</p>}
    {state.listError && <p role="alert">{state.listError}</p>}
    <ul className={styles.list}>{state.list.map((jd) => <li key={jd.jdId}>
      <button data-testid="jd-list-select" type="button" disabled={busy} aria-pressed={state.selectedId === jd.jdId} onClick={() => void model.select(jd.jdId)}>{jd.title}</button>
      <small>수정: <time dateTime={jd.updatedAt}>{jd.updatedAt}</time></small>
    </li>)}</ul>
    {state.nextCursor && <button data-testid="jd-list-more" type="button" disabled={state.moreBusy || state.listState === "loading"} onClick={() => void model.load(true)}>다음 JD 보기</button>}
  </section>;
}

export function DeleteJdConfirm({ state, model }: { state: JdManagementState; model: JdManagementModel }) {
  if (!state.deleteOpen) return null;
  return <section role="group" data-testid="jd-delete-confirmation" aria-label="JD 삭제 확인" className={styles.warning}>
    <p>이 JD와 관련 요약 기록이 함께 삭제됩니다. 삭제하시겠습니까?</p>
    <div className={styles.actions}>
      <button data-testid="jd-delete-confirm" type="button" disabled={state.deleting} onClick={() => void model.remove()}>{state.deleting ? "삭제 중…" : "삭제 확인"}</button>
      <button data-testid="jd-delete-cancel" type="button" disabled={state.deleting} onClick={() => model.confirmDelete(false)}>취소</button>
    </div>
  </section>;
}

export function JdEditor({ state, model, canUpdate }: { state: JdManagementState; model: JdManagementModel; canUpdate: boolean }) {
  if (!state.editorOpen) return <section className={styles.card}><p>JD를 선택하거나 새로 작성해 주세요.</p></section>;
  const busy = state.editState === "saving" || state.deleting || state.editState === "loading";
  return <section className={styles.card} aria-label="JD 편집">
    <h2>{state.selectedId ? "JD 편집" : "새 JD 작성"}</h2>
    <p>제목 200자·본문 20,000자까지 입력할 수 있습니다. 입력을 자동으로 잘라내지 않습니다.</p>
    {state.editState === "loading" && <p role="status">JD를 불러오고 있습니다.</p>}
    <form data-testid="jd-editor-form" onSubmit={(event) => { event.preventDefault(); void model.save(); }}>
      <label className={styles.field}>제목
        <input data-testid="jd-title" value={state.draft.title} disabled={busy} onChange={(e) => model.change({ ...state.draft, title: e.target.value })} />
      </label>
      <label className={styles.field}>본문
        <textarea data-testid="jd-body" rows={14} value={state.draft.body} disabled={busy} onChange={(e) => model.change({ ...state.draft, body: e.target.value })} />
      </label>
      <p className={styles.help}>제목 {state.draft.title.length}/200 · 본문 {state.draft.body.length}/20,000 (일부 문자는 여러 자로 계산됩니다)</p>
      {state.editError && <p role="alert">{state.editError}</p>}
      {state.editState === "saved" && <p role="status">저장되었습니다.</p>}
      {state.selectedId && !canUpdate && <p>기존 JD 수정 기능을 준비하고 있습니다.</p>}
      <div className={styles.actions}>
        <button data-testid="jd-save" type="submit" disabled={busy || (!!state.selectedId && !canUpdate)}>{state.editState === "saving" ? "저장 중…" : "저장"}</button>
        {state.selectedId && <button data-testid="jd-delete-open" type="button" disabled={busy} onClick={() => model.confirmDelete(true)}>JD 삭제</button>}
      </div>
    </form>
    <DeleteJdConfirm state={state} model={model} />
  </section>;
}

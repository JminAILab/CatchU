"use client";

import Link from "next/link";
import { routes } from "@/lib/routes";
import type { RepositoryOption } from "@/features/assets/types";
import { ReorderList } from "@/features/publications/pick-parts";
import { ITEM_KIND_LABELS, selectionKey } from "@/features/publications/publish-sources";
import styles from "@/features/publications/publications.module.css";
import {
  addBlockReason, formatCount, itemsTotal, knownTotal, presetSaveFailureText, PRESET_LIMITS, PRESET_NAME_ERROR, UNPUBLISHABLE_REASON_TEXT,
  type EditorItem, type PresetItemKind,
} from "./presets-api";
import type { PresetEditorState, PresetEditorStatus } from "./preset-editor-screen";
import { SourcePickerView } from "./source-picker-view";

export const NAME_HELP_TEXT = `이 이름이 받은 사람 화면의 탭 이름으로 보입니다. (1~${PRESET_LIMITS.name}자)`;
export const LINK_NOTICE_TEXT = "프리셋을 고쳐도 이미 보낸 링크는 바뀌지 않습니다.";
export const OVER_LIMIT_TEXT = `전체 글이 ${formatCount(PRESET_LIMITS.totalText)}자를 넘어 발행할 수 없습니다.`;
export const LENGTH_UNKNOWN_TEXT = "글자 수를 세지 못했습니다";
/** 저장 실패 뒤 초점을 되돌릴 [저장]의 id(interaction-spec PresetEditorForm). */
export const SAVE_BUTTON_ID = "preset-save-button";

/** 늘 그려 두는 `role="status"` 칸의 글(NFR1.1). 칸을 새로 만들었다 지우지 않아 화면 낭독기가 바뀐 글을 놓치지 않는다. */
export function editorStatusText(status: PresetEditorStatus): string {
  switch (status.kind) {
    case "saving": return "저장하고 있습니다.";
    case "saved": return "저장했습니다.";
    case "saved-reload-failed": return "저장했습니다. 내용을 다시 불러오지 못했습니다.";
    case "deleting": return "지우고 있습니다.";
    default: return "";
  }
}

/** `role="alert"` 안내. 이름 실패는 이름 칸 아래에 따로 보이므로 여기서는 그리지 않는다. */
export function editorAlertText(status: PresetEditorStatus): string | null {
  if (status.kind === "delete-failed") return "지우지 못했습니다. 다시 시도해 주세요.";
  if (status.kind === "save-failed" && status.failure !== "name") return presetSaveFailureText(status.failure);
  return null;
}

/** 「담긴 자료와 순서 (항목 N개 · M자)」. 글자 수를 모르는 자료가 하나라도 있으면 M 대신 「글자 수를 세지 못했습니다」다. */
export function itemsHeading(items: readonly EditorItem[]): string {
  const total = itemsTotal(items);
  return `담긴 자료와 순서 (항목 ${items.length}개 · ${total === null ? LENGTH_UNKNOWN_TEXT : `${formatCount(total)}자`})`;
}

export type PresetEditorViewProps = {
  state: PresetEditorState;
  repositories: readonly RepositoryOption[];
  onRetryDetail: () => void;
  onName: (name: string) => void;
  onWrittenOnly: (writtenOnly: boolean) => void;
  onRetrySources: () => void;
  onMoreCatches: () => void;
  onMoreMaterials: () => void;
  onMorePdfs: () => void;
  onToggle: (kind: PresetItemKind, sourceId: string) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onRemove: (index: number) => void;
  onSave: () => void;
  onDelete: () => void;
  onReloadAfterSave: () => void;
};

function NameField({ state, disabled, onName }: { state: PresetEditorState; disabled: boolean; onName: (name: string) => void }) {
  return (
    <section className={styles.panel} aria-labelledby="preset-name-title">
      {/* 보이는 이름표 「이름」(interaction-spec PresetEditorForm). 도움말·오류는 aria-describedby로 칸에 잇는다. */}
      <h2 id="preset-name-title"><label htmlFor="preset-name-input">이름</label></h2>
      <div className={styles.field}>
        <input id="preset-name-input" data-testid="preset-name-input" value={state.name} disabled={disabled}
          aria-invalid={state.nameError} aria-describedby={state.nameError ? "preset-name-help preset-name-error" : "preset-name-help"}
          onChange={(event) => onName(event.target.value)} />
      </div>
      <p id="preset-name-help" className={styles.small}>{NAME_HELP_TEXT}</p>
      {state.nameError && <p id="preset-name-error" role="alert" className={styles.flagged} data-testid="preset-name-error">{PRESET_NAME_ERROR}</p>}
    </section>
  );
}

function ItemsPanel({ props, disabled }: { props: PresetEditorViewProps; disabled: boolean }) {
  const { items } = props.state;
  return (
    <section className={styles.panel} aria-labelledby="preset-items-title" data-testid="preset-items">
      <h2 id="preset-items-title">{itemsHeading(items)}</h2>
      {knownTotal(items) > PRESET_LIMITS.totalText && <p className={styles.notice} data-testid="preset-over-limit">{OVER_LIMIT_TEXT}</p>}
      {items.length === 0 ? <p data-testid="preset-items-empty">아직 담은 자료가 없습니다.</p> : (
        <ReorderList testIdPrefix="preset" disabled={disabled} onMoveUp={props.onMoveUp} onMoveDown={props.onMoveDown} onRemove={props.onRemove}
          entries={items.map((item) => ({
            key: selectionKey(item.kind, item.sourceId), sourceId: item.sourceId, title: item.title,
            body: <>
              <span className={styles.kindBadge}>{ITEM_KIND_LABELS[item.kind]}</span> <span className={styles.itemTitle}>{item.title}</span>
              {item.reason && <p className={styles.flagged} data-testid="preset-item-reason">{UNPUBLISHABLE_REASON_TEXT[item.reason]}</p>}
            </>,
          }))} />
      )}
      <p className={styles.small} data-testid="preset-link-notice">{LINK_NOTICE_TEXT}</p>
    </section>
  );
}

/**
 * 프리셋 편집(M3). 이름 칸, 「담을 자료 고르기」, 「담긴 자료와 순서」, [저장]·[프리셋 지우기].
 * 이름·제목은 React 글자로만 그린다(BR3.11, NFR3.1). 저장 중에는 입력·단추를 모두 막는다.
 */
export function PresetEditorView(props: PresetEditorViewProps) {
  const { state } = props;
  const busy = state.status.kind === "saving" || state.status.kind === "deleting";
  const disabled = busy || state.left;
  const alert = editorAlertText(state.status);
  const picked = new Set(state.items.map((item) => selectionKey(item.kind, item.sourceId)));
  return (
    <main className={styles.page}>
      <h1>{state.presetId === null ? "새 프리셋" : "프리셋 고치기"}</h1>
      <p><Link href={routes.presets} data-testid="preset-editor-back-link">프리셋 목록으로</Link></p>
      {state.load === "loading" ? <p role="status">프리셋을 불러오고 있습니다.</p>
        : state.load === "not-found" ? <p role="alert" data-testid="preset-editor-not-found">프리셋을 찾을 수 없습니다.</p>
        : state.load === "error" ? (
          <div role="alert" className={styles.error}>
            <p>프리셋을 불러오지 못했습니다.</p>
            <button type="button" className={styles.secondaryButton} data-testid="preset-editor-retry" onClick={props.onRetryDetail}>다시 불러오기</button>
          </div>
        ) : <>
          <NameField state={state} disabled={disabled} onName={props.onName} />
          <div className={styles.layout}>
            <SourcePickerView catches={state.catches} materials={state.materials} pdfs={state.pdfs} picked={picked}
              blockReason={(kind, sourceId) => addBlockReason(state.items, state.lengths, { kind, sourceId })} disabled={disabled}
              writtenOnly={state.writtenOnly} repositories={props.repositories} onWrittenOnly={props.onWrittenOnly}
              onRetry={props.onRetrySources} onMoreCatches={props.onMoreCatches} onMoreMaterials={props.onMoreMaterials}
              onMorePdfs={props.onMorePdfs} onToggle={props.onToggle} />
            <ItemsPanel props={props} disabled={disabled} />
          </div>
          <p role="status" className={styles.small} data-testid="preset-editor-status">{editorStatusText(state.status)}</p>
          {state.status.kind === "saved-reload-failed" && (
            <button type="button" className={styles.secondaryButton} data-testid="preset-editor-reload" onClick={props.onReloadAfterSave}>다시 불러오기</button>
          )}
          {alert !== null && (
            <div role="alert" className={styles.error} data-testid="preset-editor-alert">
              <p>{alert}</p>
              {state.status.kind === "save-failed" && state.status.failure === "not-found" && <Link href={routes.presets}>프리셋 목록으로</Link>}
            </div>
          )}
          <div className={styles.actions}>
            <button id={SAVE_BUTTON_ID} type="button" className={styles.primaryButton} data-testid="preset-save" disabled={disabled} onClick={props.onSave}>저장</button>
            {state.presetId !== null && (
              <button type="button" className={styles.dangerButton} data-testid="preset-delete" disabled={disabled} onClick={props.onDelete}>프리셋 지우기</button>
            )}
          </div>
        </>}
    </main>
  );
}

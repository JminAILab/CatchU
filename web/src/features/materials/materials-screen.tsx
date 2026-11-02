"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useUnsavedChanges } from "@/components/auth/use-unsaved-changes";
import { LoadingState, LookupFailedState } from "@/components/status/status";
import { UNSAVED_MESSAGE, useUnsavedGuard } from "@/features/profile/use-unsaved-guard";
import { accessTokenStore } from "@/lib/access-token";
import { api } from "@/lib/api";
import { createViewStore } from "@/lib/view-store";
import {
  applyMaterialSave, createMaterialsApi, isMaterialDirty, loadedMaterialState, materialDeleteErrorText, materialDraftErrors,
  materialListErrorText, materialOpenErrorText, newMaterialState,
  type MaterialDraft, type MaterialEditState, type MaterialsApi, type TextMaterialItem,
} from "./materials-api";
import { MaterialEditorView, MaterialsListView } from "./materials-view";
import styles from "./materials.module.css";

// api.member가 기준 주소·Bearer·401을 맡는다. 렌더마다 호출 객체를 새로 만들지 않는다.
const materials = createMaterialsApi(api.member);

/** 화면 밖 의존. 시험은 로그인 식별과 확인 창을 바꿔 끼운다. */
export type ScreenDeps = { session: () => unknown; confirm: (message: string) => boolean };
const browserDeps: ScreenDeps = {
  session: () => accessTokenStore.get(),
  confirm: (message) => window.confirm(message),
};

export type Selection = null | { kind: "new" } | { kind: "existing"; textMaterialId: string };
export type ListState = { state: "loading" | "ready" | "error"; items: TextMaterialItem[]; nextCursor: string | null; errorText?: string };
export type MaterialsScreenState = {
  list: ListState;
  moreState: "idle" | "loading" | "error";
  selection: Selection;
  dirty: boolean;
  /** 편집기를 새로 여는 횟수(편집기 key). 새 자료를 처음 저장해 ID가 생겨도 바꾸지 않아 편집기를 다시 만들지 않는다. */
  editorSession: number;
};

/**
 * 목록·선택 상태 전이(U4 W2). 저장하지 않은 입력이 있으면 다른 자료를 열거나 목록으로 돌아가기 전에 묻고(BR2.2),
 * 로그인이 바뀐 뒤 도착한 응답은 반영하지 않는다.
 */
export function createMaterialsScreenModel(client: MaterialsApi, deps: ScreenDeps = browserDeps) {
  const store = createViewStore<MaterialsScreenState>({
    list: { state: "loading", items: [], nextCursor: null }, moreState: "idle", selection: null, dirty: false, editorSession: 0,
  });
  /** 진행 중인 목록 조회. 응답을 받으면 비운다. */
  let listRequest: AbortController | null = null;
  /** 첫 쪽 조회를 시작할 때마다 바뀐다. 그 전에 보낸 [더 보기] 응답은 새 목록에 붙이지 않는다. */
  let listGeneration = 0;

  /**
   * 목록 조회 중에 끝난 저장·삭제는 조회를 다시 시작한다. 진행 중인 조회는 변경 전에 읽었을 수 있어,
   * 그 응답이 방금 반영한 새 자료·제목·삭제를 덮지 않게 버리고 변경 뒤의 목록을 다시 읽는다. 화면을 닫은 뒤에는 다시 읽지 않는다.
   */
  function reloadIfLoading() {
    if (listRequest && !listRequest.signal.aborted) void load();
  }

  async function load() {
    listRequest?.abort();
    const abort = new AbortController();
    listRequest = abort;
    ++listGeneration;
    const session = deps.session();
    store.set((prev) => ({ ...prev, list: { state: "loading", items: [], nextCursor: null }, moreState: "idle" }));
    const result = await client.list(null, abort.signal);
    if (listRequest === abort) listRequest = null;
    if (abort.signal.aborted || deps.session() !== session) return;
    store.set((prev) => ({
      ...prev,
      list: result.kind === "failed"
        ? { state: "error", items: [], nextCursor: null, errorText: materialListErrorText(result.failure) }
        : { state: "ready", items: result.value.items, nextCursor: result.value.page.nextCursor },
    }));
  }

  async function loadMore() {
    const { list, moreState } = store.get();
    if (list.state !== "ready" || list.nextCursor === null || moreState === "loading") return;
    store.set((prev) => ({ ...prev, moreState: "loading" }));
    const session = deps.session();
    const generation = listGeneration;
    const result = await client.list(list.nextCursor);
    if (generation !== listGeneration || deps.session() !== session) return;
    if (result.kind === "failed") { store.set((prev) => ({ ...prev, moreState: "error" })); return; }
    store.set((prev) => ({
      ...prev, moreState: "idle",
      list: { ...prev.list, items: [...prev.list.items, ...result.value.items], nextCursor: result.value.page.nextCursor },
    }));
  }

  /** 다른 자료·새 자료·목록으로 이동. 저장하지 않은 입력이 있는데 머무르기를 고르면 아무것도 바꾸지 않는다. */
  function select(next: Selection): boolean {
    if (store.get().dirty && !deps.confirm(UNSAVED_MESSAGE)) return false;
    store.set((prev) => ({ ...prev, dirty: false, selection: next, editorSession: prev.editorSession + 1 }));
    return true;
  }

  /**
   * 저장 성공 반영. 목록에는 언제나 반영한다(새 자료는 맨 위에 더하고, 이미 있으면 바꾼다).
   * 선택은 저장한 편집기(`editorSession`)가 아직 열려 있을 때만 옮긴다. 저장을 기다리는 동안 다른 자료·새 자료를 열었다면
   * 서버에는 저장됐으므로 목록에만 보이고, 지금 선택·입력·미저장 상태는 건드리지 않는다. 생략하면 지금 편집기로 본다.
   */
  function saved(item: TextMaterialItem, created: boolean, editorSession?: number) {
    store.set((prev) => {
      const current = editorSession === undefined || editorSession === prev.editorSession;
      const listed = prev.list.items.some((entry) => entry.textMaterialId === item.textMaterialId);
      return {
        ...prev,
        list: {
          ...prev.list,
          items: created && !listed ? [item, ...prev.list.items]
            : prev.list.items.map((entry) => entry.textMaterialId === item.textMaterialId ? item : entry),
        },
        // 목록 강조만 옮긴다. editorSession은 그대로라 편집기를 다시 만들거나 다시 불러오지 않는다.
        selection: created && current ? { kind: "existing", textMaterialId: item.textMaterialId } : prev.selection,
      };
    });
    reloadIfLoading();
  }

  /**
   * 삭제 성공 반영. 목록에서는 언제나 뺀다. 편집기는 지금 그 자료를 열고 있을 때만 닫는다.
   * 삭제를 기다리는 동안 다른 자료·새 자료를 열었다면 그 선택·입력·미저장 상태를 건드리지 않는다.
   */
  function deleted(textMaterialId: string) {
    store.set((prev) => {
      const items = prev.list.items.filter((item) => item.textMaterialId !== textMaterialId);
      const openNow = prev.selection?.kind === "existing" && prev.selection.textMaterialId === textMaterialId;
      return openNow
        ? { ...prev, dirty: false, selection: null, list: { ...prev.list, items } }
        : { ...prev, list: { ...prev.list, items } };
    });
    reloadIfLoading();
  }

  return {
    store, load, loadMore, select, saved, deleted,
    setDirty: (dirty: boolean) => store.set((prev) => prev.dirty === dirty ? prev : { ...prev, dirty }),
    dispose: () => listRequest?.abort(),
  };
}

export type EditorLoad = "loading" | "ready" | { error: string };
export type MaterialEditorState = { load: EditorLoad; edit: MaterialEditState; deleteState: "idle" | "deleting" | { error: string } };

/**
 * 편집기 상태 전이(U4 W2, BR2.1~BR2.3·BR3.2).
 *
 * - 연 자료 ID는 만들 때 한 번만 받는다. 새 자료를 처음 저장해 ID가 생겨도 다시 불러오지 않아 "저장됨"과 저장 뒤 입력을 덮지 않는다.
 * - 불러오기 응답은 아직 불러오는 중일 때만 반영한다. 늦게 온 응답은 버린다.
 * - 저장 성공 응답 뒤에만 "저장됨"이고, 저장 중에 더 쓴 입력은 서버 값으로 덮지 않는다. 실패하면 입력을 남긴다.
 */
export function createMaterialEditorModel(client: MaterialsApi, openId: string | null, callbacks: {
  onSaved: (item: TextMaterialItem, created: boolean) => void;
  onDeleted: (textMaterialId: string) => void;
}, deps: ScreenDeps = browserDeps) {
  const store = createViewStore<MaterialEditorState>({
    load: openId === null ? "ready" : "loading", edit: newMaterialState(), deleteState: "idle",
  });
  let loadRequest: AbortController | null = null;
  let loadGeneration = 0;

  async function load() {
    if (openId === null) return;
    loadRequest?.abort();
    const abort = new AbortController();
    loadRequest = abort;
    const generation = ++loadGeneration;
    const session = deps.session();
    store.set((prev) => ({ ...prev, load: "loading" }));
    const result = await client.get(openId, abort.signal);
    if (abort.signal.aborted || generation !== loadGeneration || deps.session() !== session) return;
    if (store.get().load !== "loading") return;
    if (result.kind === "failed") { store.set((prev) => ({ ...prev, load: { error: materialOpenErrorText(result.failure) } })); return; }
    store.set((prev) => ({ ...prev, load: "ready", edit: loadedMaterialState(result.value) }));
  }

  function change(draft: MaterialDraft) {
    store.set((prev) => ({
      ...prev,
      edit: {
        ...prev.edit, draft,
        status: prev.edit.status.kind === "saved" || prev.edit.status.kind === "invalid" ? { kind: "idle" } : prev.edit.status,
      },
    }));
  }

  async function save() {
    const { edit, deleteState, load: loadState } = store.get();
    if (loadState !== "ready" || edit.status.kind === "saving" || deleteState === "deleting") return;
    const errors = materialDraftErrors(edit.draft);
    if (errors.length > 0) {
      store.set((prev) => ({ ...prev, edit: { ...prev.edit, status: { kind: "invalid", message: errors.join(" ") } } }));
      return;
    }
    // 편집기를 닫아도 보낸 저장은 취소하지 않는다. 서버에서 저장됐을 수 있어 응답을 받아 목록에 반영한다.
    const session = deps.session();
    const { draft: sent, textMaterialId: id } = edit;
    store.set((prev) => ({ ...prev, edit: { ...prev.edit, status: { kind: "saving" } } }));
    const result = id === null ? await client.create(sent) : await client.update(id, sent);
    if (deps.session() !== session) return;
    store.set((prev) => {
      const next = applyMaterialSave(prev.edit, result);
      // 저장 중에 더 쓴 입력이 있으면 그 입력을 남긴다(저장된 값은 saved에 반영되어 dirty로 보인다).
      const typedAfterSend = prev.edit.draft.title !== sent.title || prev.edit.draft.body !== sent.body;
      return { ...prev, edit: result.kind === "ok" && typedAfterSend ? { ...next, draft: prev.edit.draft } : next };
    });
    if (result.kind === "ok") {
      const { textMaterialId: savedId, title, updatedAt } = result.value;
      callbacks.onSaved({ textMaterialId: savedId, title, updatedAt }, id === null);
    }
  }

  async function remove() {
    const { edit, deleteState } = store.get();
    const id = edit.textMaterialId;
    if (id === null || deleteState === "deleting" || edit.status.kind === "saving") return;
    if (!deps.confirm("이 자료를 삭제할까요? 이미 발행한 사본은 그대로 남고, 삭제한 자료는 되살릴 수 없습니다.")) return;
    store.set((prev) => ({ ...prev, deleteState: "deleting" }));
    const session = deps.session();
    const result = await client.remove(id);
    if (deps.session() !== session) return;
    if (result.kind === "failed") { store.set((prev) => ({ ...prev, deleteState: { error: materialDeleteErrorText(result.failure) } })); return; }
    // 편집기가 해제된 뒤에 온 성공도 알린다. 서버에서는 지워졌으므로 목록에서 빼야 하고, 화면 닫기 여부는 화면 모델이 현재 선택으로 정한다.
    callbacks.onDeleted(id);
  }

  return {
    store, load, change, save, remove,
    retry: () => { void load(); },
    isDirty: () => store.get().load === "ready" && isMaterialDirty(store.get().edit),
    // 불러오기만 취소한다. 저장·삭제 응답은 해제 뒤에도 받아 목록에 반영한다(선택 변경은 화면 모델이 정한다).
    dispose: () => { loadRequest?.abort(); },
  };
}

/** 회원 가드((member) 레이아웃) 안의 텍스트 자료 화면(U4 W2). */
export function MaterialsPage() {
  return <MaterialsScreen api={materials} />;
}

/** 목록과 편집을 한 화면에 둔다. 상태 전이는 `createMaterialsScreenModel`이 맡는다. */
export function MaterialsScreen({ api: client, deps }: { api: MaterialsApi; deps?: ScreenDeps }) {
  const [model] = useState(() => createMaterialsScreenModel(client, deps));
  const view = useSyncExternalStore(model.store.subscribe, model.store.get, model.store.get);
  useEffect(() => { void model.load(); return () => model.dispose(); }, [model]);

  const { list, selection } = view;
  const selectedId = selection?.kind === "existing" ? selection.textMaterialId : null;
  return (
    <main className={styles.page}>
      <h1>텍스트 자료</h1>
      <p className={styles.lead}>포트폴리오·자기소개·이력 같은 글을 자료로 저장해 두고, 발행할 때 고를 수 있습니다.</p>
      <div className={styles.layout}>
        <MaterialsListView state={list.state} items={list.items} errorText={list.errorText}
          hasMore={list.nextCursor !== null} moreState={view.moreState} selectedId={selectedId}
          onRetry={() => { void model.load(); }}
          onLoadMore={() => { void model.loadMore(); }}
          onOpen={(id) => model.select({ kind: "existing", textMaterialId: id })}
          onNew={() => model.select({ kind: "new" })} />
        {selection && <MaterialEditor key={view.editorSession} api={client} deps={deps}
          openId={selection.kind === "existing" ? selection.textMaterialId : null}
          onDirtyChange={model.setDirty} onDeleted={model.deleted}
          onSaved={(item, created) => model.saved(item, created, view.editorSession)} onClose={() => model.select(null)} />}
      </div>
    </main>
  );
}

function MaterialEditor({ api: client, deps, openId, onDirtyChange, onSaved, onDeleted, onClose }: {
  api: MaterialsApi;
  deps?: ScreenDeps;
  /** 열 때의 자료 ID. 새 자료면 null. 편집기를 만들 때 한 번만 쓴다. */
  openId: string | null;
  onDirtyChange: (dirty: boolean) => void;
  onSaved: (item: TextMaterialItem, created: boolean) => void;
  onDeleted: (textMaterialId: string) => void;
  onClose: () => void;
}) {
  const [model] = useState(() => createMaterialEditorModel(client, openId, { onSaved, onDeleted }, deps));
  const view = useSyncExternalStore(model.store.subscribe, model.store.get, model.store.get);
  const dirty = view.load === "ready" && isMaterialDirty(view.edit);
  useEffect(() => { void model.load(); return () => model.dispose(); }, [model]);
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useUnsavedGuard(dirty);
  useUnsavedChanges(dirty);

  if (view.load === "loading") return <LoadingState>자료를 불러오고 있습니다.</LoadingState>;
  if (typeof view.load === "object") {
    return <div>
      <LookupFailedState title="자료를 열지 못했습니다" onRetry={model.retry}>{view.load.error}</LookupFailedState>
      <button type="button" className={styles.secondaryButton} data-testid="material-editor-close" onClick={onClose}>목록으로</button>
    </div>;
  }
  return <MaterialEditorView isNew={view.edit.textMaterialId === null} draft={view.edit.draft} status={view.edit.status} dirty={dirty}
    deleteState={view.deleteState}
    onChange={model.change}
    onSave={() => { void model.save(); }}
    onDelete={() => { void model.remove(); }}
    onClose={onClose} />;
}

"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useUnsavedChanges } from "@/components/auth/use-unsaved-changes";
import { UNSAVED_MESSAGE, useUnsavedGuard } from "@/features/profile/use-unsaved-guard";
import { accessTokenStore } from "@/lib/access-token";
import { api } from "@/lib/api";
import { presetEditPath, routes } from "@/lib/routes";
import { useUnsavedTraverseGuard } from "@/lib/unsaved-traverse-guard";
import { createViewStore } from "@/lib/view-store";
import { createCatchApi, type CatchApi } from "@/features/assets/catch-api";
import { createRepositoryOptionsStore } from "@/features/assets/repository-options-store";
import { createMaterialsApi, type MaterialsApi } from "@/features/materials/materials-api";
import { pdfMaterialsApi } from "@/features/materials/pdf-clients";
import type { PdfMaterialsApi } from "@/features/materials/pdf-materials-api";
import { createRepositoryApi, type RepositoryApi } from "@/features/repository-management/repository-api";
import {
  catchSourceOf, emptySourceList, pdfSourceOf, selectionKey, type CatchSource, type MaterialSource, type PdfSource, type SourceList,
} from "@/features/publications/publish-sources";
import {
  addBlockReason, createPresetsApi, isValidPresetName,
  type EditorItem, type ItemMeasure, type PresetItemKind, type PresetItemRef, type PresetSaveFailure, type PresetsApi,
} from "./presets-api";
import { PresetEditorView, SAVE_BUTTON_ID } from "./preset-editor-view";

/** 편집 화면이 부르는 것. 저장소 목록은 Catch 작은 줄의 저장소 이름에만 쓴다(NFR 설계 performance 1). */
export type PresetEditorClients = {
  presets: PresetsApi; catches: CatchApi; materials: MaterialsApi;
  pdfs: Pick<PdfMaterialsApi, "list">; repositories: Pick<RepositoryApi, "repositories">;
};
// api.member가 기준 주소·Bearer·401을 맡는다. 렌더마다 호출 객체를 새로 만들지 않는다.
const clients: PresetEditorClients = {
  presets: createPresetsApi(api.member), catches: createCatchApi(api.member), materials: createMaterialsApi(api.member),
  pdfs: pdfMaterialsApi, repositories: createRepositoryApi(api.member),
};

/** 첫 저장 뒤 옮겨 간 편집 화면에 한 번만 넘기는 「저장했습니다.」(NFR 설계 Q1 B, 2026-11-21 변경). */
export type SavedNoticeHandOff = {
  /** 옮기기 전에 그 프리셋 ID와 함께 남긴다. */
  leave: (presetId: string) => void;
  /** 편집 화면을 열 때 한 번 꺼낸다. 꺼내면 늘 지우고, 남긴 ID와 같을 때만 참이다. */
  take: (presetId: string | null) => boolean;
};

/**
 * 이 모듈 안 메모리에만 둔다. 주소·브라우저 저장소에 두지 않아 새로 고침·다시 열기·다른 프리셋에서는 보이지 않는다.
 * 어느 편집 화면이든 열 때 꺼내 지우므로, 남긴 표시가 나중에 연 화면에 늦게 보이지 않는다.
 */
export function createSavedNoticeHandOff(): SavedNoticeHandOff {
  let pending: string | null = null;
  return {
    leave: (presetId) => { pending = presetId; },
    take: (presetId) => { const matched = pending !== null && pending === presetId; pending = null; return matched; },
  };
}

/**
 * 화면 밖 의존. 시험은 로그인 식별·확인 창·이동·「저장했습니다.」 넘기기를 바꿔 끼운다.
 * `replace`는 첫 저장(201) 뒤 고치기 주소로 옮긴다(뒤로 가기 기록을 더하지 않음, NFR 설계 Q1 B). 화면이 라우터의 `replace`를 넘긴다.
 * 주소만 바꾸는 `history.replaceState`(Q1 A)는 회원 가드가 주소마다 회원을 다시 확인하며 화면을 새로 만들어 쓰지 않는다(Build and Test 되돌아가기 1).
 */
export type PresetEditorDeps = {
  session: () => unknown;
  confirm: (message: string) => boolean;
  replace: (path: string) => void;
  savedNotice: SavedNoticeHandOff;
};
const browserDeps: Omit<PresetEditorDeps, "replace"> = {
  session: () => accessTokenStore.get(),
  confirm: (message) => window.confirm(message),
  savedNotice: createSavedNoticeHandOff(),
};

export type PresetEditorStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  /** 저장은 됐고 그 뒤 상세를 다시 불러오지 못했다(기능 설계 「저장」 4). */
  | { kind: "saved-reload-failed" }
  | { kind: "save-failed"; failure: PresetSaveFailure }
  | { kind: "deleting" }
  | { kind: "delete-failed" };

export type PresetEditorState = {
  /** 화면 상태의 프리셋 ID. 주소가 아니라 이 값으로 새 프리셋/고치기를 정한다(NFR 설계 검토 R-04). null이면 새 프리셋. */
  presetId: string | null;
  load: "loading" | "ready" | "not-found" | "error";
  name: string;
  /** 마지막으로 불러오거나 저장한 이름. 지우기 확인 문장에 쓴다. */
  savedName: string;
  items: EditorItem[];
  /** 「저장하지 않은 변경 있음」(BR3.10). 이름·담기·순서를 바꾸면 켜지고 저장 성공에 꺼진다. */
  dirty: boolean;
  nameError: boolean;
  status: PresetEditorStatus;
  catches: SourceList<CatchSource>;
  materials: SourceList<MaterialSource>;
  pdfs: SourceList<PdfSource>;
  writtenOnly: boolean;
  /** 세기 결과(`selectionKey` → 글자 수). 세지 못한 자료는 없다. */
  lengths: Readonly<Record<string, number>>;
  /** 지운 뒤 목록으로 간다. */
  left: boolean;
};

const CATCH_LIST_ERROR = "Catch 목록을 불러오지 못했습니다. Catch가 없다는 뜻은 아닙니다. 다시 불러와 주세요.";
const MATERIAL_LIST_ERROR = "텍스트 자료 목록을 불러오지 못했습니다. 자료가 없다는 뜻은 아닙니다. 다시 불러와 주세요.";
const PDF_LIST_ERROR = "PDF 자료 목록을 불러오지 못했습니다. 자료가 없다는 뜻은 아닙니다. 다시 불러와 주세요.";

const keyOf = (ref: PresetItemRef) => selectionKey(ref.kind, ref.sourceId);
const busy = (status: PresetEditorStatus) => status.kind === "saving" || status.kind === "deleting";

const editorItemOf = (item: ItemMeasure): EditorItem => ({
  kind: item.kind, sourceId: item.sourceId, title: item.title, textLength: item.textLength, reason: item.unpublishableReason,
});

type PageResult<T> = { kind: "ok"; items: T[]; nextCursor: string | null } | { kind: "failed" };
type LoaderOptions<T> = {
  fetchPage: (cursor: string | null, signal?: AbortSignal) => Promise<PageResult<T>>;
  read: () => SourceList<T>;
  write: (list: SourceList<T>) => void;
  errorText: string;
  /** 쪽 하나를 받은 뒤 그 쪽의 고를 수 있는 자료를 센다. `isCurrent`가 거짓이면 그 응답은 버린다. */
  measure: (items: T[], signal: AbortSignal, isCurrent: () => boolean) => Promise<void>;
  session: () => unknown;
};

/**
 * 고르기 목록 하나의 첫 쪽·다음 쪽과 쪽마다 세기(NFR 설계 performance 2). 첫 쪽을 새로 부르면 앞 요청을 끊고 세대를 올린다.
 * 응답이 왔을 때 세대가 다르거나 로그인이 바뀌었으면 버리고, 세기 응답도 그 쪽을 부른 세대가 아니면 버린다.
 */
function createPickerLoader<T>(options: LoaderOptions<T>) {
  let request: AbortController | null = null;
  let generation = 0;
  return {
    async load() {
      request?.abort();
      const abort = new AbortController();
      request = abort;
      const mine = ++generation;
      const session = options.session();
      options.write(emptySourceList<T>());
      const result = await options.fetchPage(null, abort.signal);
      const current = () => !abort.signal.aborted && mine === generation && options.session() === session;
      if (!current()) return;
      if (result.kind === "failed") {
        options.write({ state: "error", items: [], nextCursor: null, moreState: "idle", errorText: options.errorText });
        return;
      }
      // 단추를 먼저 그리고(NFR5.1) 글자 이유는 세기 응답이 온 뒤 붙는다.
      options.write({ state: "ready", items: result.items, nextCursor: result.nextCursor, moreState: "idle" });
      await options.measure(result.items, abort.signal, current);
    },
    async loadMore() {
      const list = options.read();
      if (list.state !== "ready" || list.nextCursor === null || list.moreState === "loading" || !request) return;
      const abort = request;
      const mine = generation;
      const session = options.session();
      options.write({ ...list, moreState: "loading" });
      const result = await options.fetchPage(list.nextCursor, abort.signal);
      const current = () => !abort.signal.aborted && mine === generation && options.session() === session;
      if (!current()) return;
      const latest = options.read();
      if (result.kind === "failed") { options.write({ ...latest, moreState: "error" }); return; }
      options.write({ ...latest, moreState: "idle", items: [...latest.items, ...result.items], nextCursor: result.nextCursor });
      await options.measure(result.items, abort.signal, current);
    },
    dispose() { request?.abort(); ++generation; },
  };
}

/**
 * 프리셋 편집 화면 상태 전이(M3, 기능 설계 흐름 2, BR3.1~BR3.11).
 *
 * - 열 때: 상세 1(고치기만) + 저장소 목록 1 + 고르기 목록 3 + 쪽마다 세기(최대 3)(NFR6.2, NFR 설계 performance 1).
 * - 담기·빼기·순서는 화면 안에서만 바뀌고 요청하지 않는다(NFR6.5).
 * - 저장 중에는 입력·단추를 모두 막는다. 실패하면 이름·담은 자료·순서를 그대로 둔다.
 * - 첫 저장(201) 뒤에는 「저장했습니다.」를 그 프리셋 ID와 함께 남기고 `replace`로 고치기 주소에 옮긴다(NFR 설계 Q1 B).
 *   옮긴 화면의 모델은 열 때 같은 ID면 그 표시를 한 번 꺼내 쓰고, 상세를 불러 고치기(PUT) 상태로 그린다.
 * - 다시 열면(`open`) 정리 표시를 되살린다. React Strict Mode가 효과를 마운트→정리→마운트로 두 번 돌려도 결과를 버리지 않는다.
 * - 저장 뒤 상세를 다시 불러도 담긴 목록은 바꾸지 않고 같은 자료의 글자 수·이유만 맞춘다(NFR 설계 검토 R-04).
 * - 이름·제목·자료 ID를 로그에 남기지 않는다(NFR4.1).
 */
export function createPresetEditorModel(client: PresetEditorClients, initialPresetId: string | null, deps: PresetEditorDeps) {
  const store = createViewStore<PresetEditorState>({
    presetId: initialPresetId, load: initialPresetId === null ? "ready" : "loading", name: "", savedName: "", items: [], dirty: false,
    nameError: false, status: { kind: "idle" }, catches: emptySourceList(), materials: emptySourceList(), pdfs: emptySourceList(),
    writtenOnly: false, lengths: {}, left: false,
  });
  const patch = (next: Partial<PresetEditorState>) => store.set((prev) => ({ ...prev, ...next }));
  const repositoryOptions = createRepositoryOptionsStore(client.repositories);
  let detailRequest: AbortController | null = null;
  let detailGeneration = 0;
  let disposed = false;

  /** 쪽 하나의 고를 수 있는 자료를 한 번에 센다. 고를 수 있는 자료가 없는 쪽은 부르지 않는다(NFR6.2). 실패하면 그 쪽은 글자 수를 모르는 채로 둔다. */
  async function measure(refs: PresetItemRef[], signal: AbortSignal, isCurrent: () => boolean) {
    if (refs.length === 0) return;
    const result = await client.presets.measure(refs, signal);
    if (!isCurrent() || result.kind !== "ok") return;
    const measured = new Map(result.value.items.map((item) => [keyOf(item), item.textLength]));
    store.set((prev) => ({
      ...prev,
      lengths: { ...prev.lengths, ...Object.fromEntries(measured) },
      // 세기 전에 담은 자료는 이제 글자 수를 안다.
      items: prev.items.map((item) => item.textLength === null && measured.has(keyOf(item)) ? { ...item, textLength: measured.get(keyOf(item))! } : item),
    }));
  }

  const catches = createPickerLoader<CatchSource>({
    async fetchPage(cursor, signal) {
      // 담을 수 있는 Catch만(BR3.2, BR5.1). 걸러 보기를 켜면 작성자 설명 조건도 함께 붙는다.
      const result = await client.catches.list({ repositoryId: "", authorDescription: store.get().writtenOnly ? "written" : "all", publishable: true }, cursor, signal);
      return result.kind === "success" ? { kind: "ok", items: result.data.items.map(catchSourceOf), nextCursor: result.data.page.nextCursor } : { kind: "failed" };
    },
    read: () => store.get().catches, write: (list) => patch({ catches: list }), errorText: CATCH_LIST_ERROR,
    measure: (items, signal, isCurrent) => measure(items.filter((item) => item.eligible).map((item) => ({ kind: "CATCH", sourceId: item.catchId })), signal, isCurrent),
    session: deps.session,
  });

  const materials = createPickerLoader<MaterialSource>({
    async fetchPage(cursor, signal) {
      const result = await client.materials.list(cursor, signal);
      return result.kind === "ok" ? { kind: "ok", items: result.value.items, nextCursor: result.value.page.nextCursor } : { kind: "failed" };
    },
    read: () => store.get().materials, write: (list) => patch({ materials: list }), errorText: MATERIAL_LIST_ERROR,
    measure: (items, signal, isCurrent) => measure(items.map((item) => ({ kind: "TEXT_MATERIAL", sourceId: item.textMaterialId })), signal, isCurrent),
    session: deps.session,
  });

  const pdfs = createPickerLoader<PdfSource>({
    async fetchPage(cursor, signal) {
      const result = await client.pdfs.list(cursor, signal);
      return result.kind === "ok" ? { kind: "ok", items: result.value.items.map(pdfSourceOf), nextCursor: result.value.page.nextCursor } : { kind: "failed" };
    },
    read: () => store.get().pdfs, write: (list) => patch({ pdfs: list }), errorText: PDF_LIST_ERROR,
    // 글 추출이 끝난 PDF만 센다.
    measure: (items, signal, isCurrent) => measure(items.filter((item) => item.eligible).map((item) => ({ kind: "PDF_MATERIAL", sourceId: item.pdfMaterialId })), signal, isCurrent),
    session: deps.session,
  });

  /** 상세를 부른다. 늦게 온 응답·로그인이 바뀐 뒤의 응답은 버린다. */
  async function fetchDetail(presetId: string) {
    detailRequest?.abort();
    const abort = new AbortController();
    detailRequest = abort;
    const mine = ++detailGeneration;
    const session = deps.session();
    const result = await client.presets.get(presetId, abort.signal);
    const current = !abort.signal.aborted && mine === detailGeneration && deps.session() === session && !disposed;
    return current ? result : null;
  }

  async function loadDetail() {
    const { presetId } = store.get();
    if (presetId === null) return;
    patch({ load: "loading" });
    const result = await fetchDetail(presetId);
    if (result === null) return;
    if (result.kind === "failed") { patch({ load: result.failure === "not-found" ? "not-found" : "error" }); return; }
    patch({ load: "ready", name: result.value.name, savedName: result.value.name, items: result.value.items.map(editorItemOf), dirty: false, nameError: false });
  }

  /** 저장 뒤 상세: 담긴 목록은 그대로 두고 같은 (종류, 자료 ID)의 글자 수·이유만 서버 값으로 맞춘다. */
  async function reconcileAfterSave(presetId: string) {
    const result = await fetchDetail(presetId);
    if (result === null) return;
    if (result.kind === "failed") {
      store.set((prev) => prev.status.kind === "saved" ? { ...prev, status: { kind: "saved-reload-failed" } } : prev);
      return;
    }
    const byKey = new Map(result.value.items.map((item) => [keyOf(item), item]));
    store.set((prev) => ({
      ...prev,
      status: prev.status.kind === "saved-reload-failed" ? { kind: "saved" } : prev.status,
      items: prev.items.map((item) => {
        const fresh = byKey.get(keyOf(item));
        return fresh ? { ...item, textLength: fresh.textLength, reason: fresh.unpublishableReason } : item;
      }),
    }));
  }

  const editable = () => { const s = store.get(); return s.load === "ready" && !busy(s.status) && !s.left; };
  /** 바꾸면 「저장하지 않은 변경 있음」이 되고 「저장했습니다.」는 사라진다. 지우기 실패 안내도 지운다. */
  const changed = (status: PresetEditorStatus): PresetEditorStatus =>
    status.kind === "saved" || status.kind === "saved-reload-failed" || status.kind === "delete-failed" ? { kind: "idle" } : status;

  function setName(name: string) {
    if (!editable()) return;
    store.set((prev) => ({ ...prev, name, dirty: true, status: changed(prev.status) }));
  }

  function removeItem(index: number) {
    if (!editable()) return;
    store.set((prev) => index < 0 || index >= prev.items.length ? prev
      : { ...prev, items: prev.items.filter((_, i) => i !== index), dirty: true, status: changed(prev.status) });
  }

  function move(index: number, delta: -1 | 1) {
    if (!editable()) return;
    store.set((prev) => {
      const target = index + delta;
      if (index < 0 || index >= prev.items.length || target < 0 || target >= prev.items.length) return prev;
      const items = [...prev.items];
      [items[index], items[target]] = [items[target], items[index]];
      return { ...prev, items, dirty: true, status: changed(prev.status) };
    });
  }

  /** 지금 불러온 고르기 목록에서 자료를 찾는다. 고를 수 없는 자료(추출 안 끝난 PDF 등)는 null이다. */
  function sourceTitle(s: PresetEditorState, ref: PresetItemRef): string | null {
    if (ref.kind === "CATCH") { const item = s.catches.items.find((c) => c.catchId === ref.sourceId); return item?.eligible ? item.title : null; }
    if (ref.kind === "TEXT_MATERIAL") return s.materials.items.find((m) => m.textMaterialId === ref.sourceId)?.title ?? null;
    const pdf = s.pdfs.items.find((p) => p.pdfMaterialId === ref.sourceId);
    return pdf?.eligible ? pdf.title : null;
  }

  /** 고르기 단추(BR3.3): 안 담긴 자료면 끝에 담고, 담긴 자료면 뺀다. 같은 자료는 한 번만 담긴다. */
  function toggle(kind: PresetItemKind, sourceId: string) {
    if (!editable()) return;
    const s = store.get();
    const ref = { kind, sourceId };
    const index = s.items.findIndex((item) => keyOf(item) === keyOf(ref));
    if (index >= 0) { removeItem(index); return; }
    const title = sourceTitle(s, ref);
    if (title === null || addBlockReason(s.items, s.lengths, ref) !== null) return;
    const item: EditorItem = { kind, sourceId, title, textLength: s.lengths[keyOf(ref)] ?? null, reason: null };
    store.set((prev) => ({ ...prev, items: [...prev.items, item], dirty: true, status: changed(prev.status) }));
  }

  /** 걸러 보기를 바꾸면 Catch 목록만 첫 쪽부터 다시 부른다. 담긴 자료는 그대로다. */
  function setWrittenOnly(writtenOnly: boolean) {
    if (!editable() || store.get().writtenOnly === writtenOnly) return Promise.resolve();
    patch({ writtenOnly });
    return catches.load();
  }

  /** [저장](BR3.1·BR3.8). 이름 검사를 먼저 하고 통과할 때만 요청한다. 새 프리셋은 POST, 고치기는 PUT이다. */
  async function save() {
    const s = store.get();
    if (s.load !== "ready" || busy(s.status) || s.left) return;
    if (!isValidPresetName(s.name)) { patch({ nameError: true, status: { kind: "idle" } }); return; }
    const presetId = s.presetId;
    const draft = { name: s.name.trim(), items: s.items.map(({ kind, sourceId }) => ({ kind, sourceId })) };
    const session = deps.session();
    patch({ nameError: false, status: { kind: "saving" } });
    const result = presetId === null ? await client.presets.create(draft) : await client.presets.update(presetId, draft);
    if (deps.session() !== session || disposed) return;
    if (result.kind === "failed") {
      patch({ status: { kind: "save-failed", failure: result.failure }, nameError: result.failure === "name" });
      return;
    }
    const savedId = result.value.presetId;
    patch({ presetId: savedId, savedName: draft.name, dirty: false, status: { kind: "saved" } });
    if (presetId === null) {
      // 첫 저장: 「저장하지 않은 변경」을 끈 뒤에 옮긴다. 상세는 옮긴 화면이 열 때 불러오므로 여기서 다시 부르지 않는다.
      deps.savedNotice.leave(savedId);
      deps.replace(presetEditPath(savedId));
      return;
    }
    await reconcileAfterSave(savedId);
  }

  /** [프리셋 지우기](BR3.9). 이름을 밝힌 확인을 거친다. 204·404면 목록으로, 그 밖은 화면에 남는다. */
  async function deletePreset() {
    const s = store.get();
    if (s.presetId === null || !editable()) return;
    if (!deps.confirm(`‘${s.savedName}’ 프리셋을 지울까요? 이미 보낸 발행본은 그대로 남습니다.`)) return;
    const session = deps.session();
    patch({ status: { kind: "deleting" } });
    const result = await client.presets.remove(s.presetId);
    if (deps.session() !== session || disposed) return;
    if (result.kind === "ok" || result.failure === "not-found") { patch({ status: { kind: "idle" }, dirty: false, left: true }); return; }
    // 지우기 전 상태로 돌아간다. 바뀐 입력이 있었으면 그대로 바뀜이다.
    patch({ status: { kind: "delete-failed" } });
  }

  const loadSources = () => Promise.all([catches.load(), materials.load(), pdfs.load()]).then(() => undefined);

  return {
    store,
    repositoryOptions,
    /**
     * 열 때 한 번: 상세(고치기만)·고르기 목록 셋·저장소 목록을 함께 부른다.
     * 정리 뒤 다시 열면 정리 표시를 되살린다(`jd-management-model`의 `activate()`와 같은 방식). 첫 저장 뒤 옮겨 온 화면이면 「저장했습니다.」를 한 번 보인다.
     */
    open: () => {
      disposed = false;
      if (deps.savedNotice.take(store.get().presetId)) patch({ status: { kind: "saved" } });
      return Promise.all([loadDetail(), loadSources(), repositoryOptions.refresh()]).then(() => undefined);
    },
    loadDetail,
    loadSources,
    loadMoreCatches: catches.loadMore,
    loadMoreMaterials: materials.loadMore,
    loadMorePdfs: pdfs.loadMore,
    reloadAfterSave: async () => { const { presetId } = store.get(); if (presetId !== null) await reconcileAfterSave(presetId); },
    setWrittenOnly, setName, toggle, remove: removeItem,
    moveUp: (index: number) => move(index, -1),
    moveDown: (index: number) => move(index, 1),
    save, deletePreset,
    isDirty: () => { const s = store.get(); return s.dirty && !s.left; },
    dispose: () => {
      disposed = true;
      detailRequest?.abort();
      catches.dispose(); materials.dispose(); pdfs.dispose(); repositoryOptions.dispose();
    },
  };
}

export type PresetEditorModel = ReturnType<typeof createPresetEditorModel>;

/** 회원 가드((member) 레이아웃) 안의 프리셋 편집 화면(M3). 새 프리셋은 `presetId`가 null이다. */
export function PresetEditorPage({ presetId }: { presetId: string | null }) {
  return <PresetEditorScreen api={clients} presetId={presetId} />;
}

export function PresetEditorScreen({ api: client, presetId, deps }: { api: PresetEditorClients; presetId: string | null; deps?: PresetEditorDeps }) {
  const router = useRouter();
  // 첫 저장 뒤 이동은 라우터의 replace다(NFR 설계 Q1 B). 지운 뒤 목록으로 가는 것과 같은 라우터를 쓴다.
  const [model] = useState(() => createPresetEditorModel(client, presetId, deps ?? { ...browserDeps, replace: (path) => router.replace(path) }));
  const view = useSyncExternalStore(model.store.subscribe, model.store.get, model.store.get);
  const options = useSyncExternalStore(model.repositoryOptions.subscribe, model.repositoryOptions.getSnapshot, model.repositoryOptions.getSnapshot);
  useEffect(() => { void model.open(); return () => model.dispose(); }, [model]);
  useEffect(() => { if (view.left) router.replace(routes.presets); }, [view.left, router]);

  // 저장 실패·이름 오류 때 초점은 [저장]에 남는다(interaction-spec PresetEditorForm). 저장 중 막혔던 단추로 되돌린다.
  useEffect(() => {
    if (view.status.kind === "save-failed" || view.nameError) document.getElementById(SAVE_BUTTON_ID)?.focus();
  }, [view.status, view.nameError]);

  const dirty = model.isDirty();
  useUnsavedGuard(dirty);
  useUnsavedTraverseGuard(dirty, UNSAVED_MESSAGE);
  useUnsavedChanges(dirty);

  return (
    <PresetEditorView state={view} repositories={options.repositories}
      onRetryDetail={() => { void model.loadDetail(); }} onName={model.setName}
      onWrittenOnly={(writtenOnly) => { void model.setWrittenOnly(writtenOnly); }}
      onRetrySources={() => { void model.loadSources(); }}
      onMoreCatches={() => { void model.loadMoreCatches(); }}
      onMoreMaterials={() => { void model.loadMoreMaterials(); }}
      onMorePdfs={() => { void model.loadMorePdfs(); }}
      onToggle={model.toggle} onMoveUp={model.moveUp} onMoveDown={model.moveDown} onRemove={model.remove}
      onSave={() => { void model.save(); }} onDelete={() => { void model.deletePreset(); }}
      onReloadAfterSave={() => { void model.reloadAfterSave(); }} />
  );
}

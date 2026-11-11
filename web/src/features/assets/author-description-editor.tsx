"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useUnsavedChanges } from "@/components/auth/use-unsaved-changes";
import { UNSAVED_MESSAGE, useUnsavedGuard } from "@/features/profile/use-unsaved-guard";
import { accessTokenStore } from "@/lib/access-token";
import { saveFailureReason } from "@/lib/save-outcome";
import { useUnsavedTraverseGuard } from "@/lib/unsaved-traverse-guard";
import { createViewStore } from "@/lib/view-store";
import { joinSections, sectionTexts, type SectionTitle } from "@/lib/author-description-sections";
import {
  applyDescriptionSave, authorDescriptionInputError, isDescriptionDirty, sameSectionTexts,
  type AuthorDescriptionApi, type DescriptionEditState,
} from "./author-description-api";
import { AuthorDescriptionPanel } from "./author-description-panel";

/** 화면 밖 의존. 시험은 로그인 식별을 바꿔 끼운다. */
export type DescriptionEditorDeps = { session: () => unknown };
const browserDeps: DescriptionEditorDeps = { session: () => accessTokenStore.get() };

export type DescriptionEditorState = {
  load: "loading" | "ready" | "error";
  loadFailureText?: string;
  edit: DescriptionEditState;
};

/**
 * 작성자 설명 편집 상태 전이(U4 W1, BR1.1·BR1.2·BR2.1~BR2.3, 새 Catch W1·BR1.4~BR1.6).
 *
 * - 열 때 현재 설명을 읽어 8칸으로 나눈다. 읽지 못하면 빈 설명으로 추정하지 않고 다시 불러오기를 보인다. 늦게 온 응답은 버린다.
 * - 저장은 8칸을 합친 글 하나를 지금 경로로 보낸다. 합친 글이 4,000자를 넘으면 보내지 않는다.
 * - 성공 응답 뒤에만 "저장됨"을 보인다. 실패하면 입력을 남기고 "저장되지 않았습니다"와 이유를 보인다.
 * - 저장 중에 더 쓴 입력은 서버 값으로 덮지 않는다. 로그인이 바뀐 뒤 도착한 응답은 반영하지 않는다.
 */
export function createDescriptionEditorModel(catchId: string, api: AuthorDescriptionApi, deps: DescriptionEditorDeps = browserDeps) {
  const empty = sectionTexts(null);
  const store = createViewStore<DescriptionEditorState>({ load: "loading", edit: { texts: empty, savedTexts: empty, status: { kind: "idle" } } });
  let loadRequest: AbortController | null = null;
  let saveRequest: AbortController | null = null;
  let generation = 0;

  async function load() {
    loadRequest?.abort();
    const abort = new AbortController();
    loadRequest = abort;
    const mine = ++generation;
    const session = deps.session();
    store.set((prev) => ({ ...prev, load: "loading" }));
    const result = await api.read(catchId, abort.signal);
    if (abort.signal.aborted || mine !== generation || deps.session() !== session || store.get().load !== "loading") return;
    if (result.kind === "failed") {
      store.set((prev) => ({
        ...prev, load: "error",
        loadFailureText: result.failure === "login-expired" ? saveFailureReason("login-expired") : undefined,
      }));
      return;
    }
    const saved = sectionTexts(result.value.authorDescription);
    store.set({ load: "ready", edit: { texts: saved, savedTexts: saved, status: { kind: "idle" } } });
  }

  /** 칸 하나를 바꾼다. 저장 중에는 화면이 8칸을 모두 막는다(BR4.5). */
  function change(title: SectionTitle, value: string) {
    store.set((prev) => ({
      ...prev,
      edit: {
        ...prev.edit, texts: { ...prev.edit.texts, [title]: value },
        // 저장됨·검사 거부 안내는 입력을 바꾸면 지운다. 서버 실패 안내는 다시 저장할 때까지 남긴다.
        status: prev.edit.status.kind === "saved" || prev.edit.status.kind === "invalid" ? { kind: "idle" } : prev.edit.status,
      },
    }));
  }

  async function save() {
    const { load: loadState, edit } = store.get();
    if (loadState !== "ready" || edit.status.kind === "saving") return;
    const joined = joinSections(edit.texts);
    const invalid = authorDescriptionInputError(joined);
    if (invalid) { store.set((prev) => ({ ...prev, edit: { ...prev.edit, status: { kind: "invalid", message: invalid } } })); return; }
    const abort = new AbortController();
    saveRequest = abort;
    const session = deps.session();
    const sent = edit.texts;
    store.set((prev) => ({ ...prev, edit: { ...prev.edit, status: { kind: "saving" } } }));
    const result = await api.save(catchId, joined, abort.signal);
    if (abort.signal.aborted || deps.session() !== session) return;
    store.set((prev) => {
      const next = applyDescriptionSave(prev.edit, result);
      return { ...prev, edit: result.kind === "saved" && !sameSectionTexts(prev.edit.texts, sent) ? { ...next, texts: prev.edit.texts } : next };
    });
  }

  return {
    store, load, change, save,
    retry: () => { void load(); },
    dispose: () => { loadRequest?.abort(); saveRequest?.abort(); },
  };
}

/**
 * Catch 상세의 작성자 설명 편집(U4 W1). 상세 모달 안에서 Catch마다 새로 마운트한다(key=catchId).
 * `evidenceUrls`는 이 Catch 근거 주소이고, 「발행하면 면접관에게 열릴 링크」의 다른 저장소 앞붙임을 정할 때만 쓴다(BR2.4).
 */
export function AuthorDescriptionEditor({ catchId, api, deps, evidenceUrls = [] }: {
  catchId: string; api: AuthorDescriptionApi; deps?: DescriptionEditorDeps; evidenceUrls?: readonly string[];
}) {
  const [model] = useState(() => createDescriptionEditorModel(catchId, api, deps));
  const view = useSyncExternalStore(model.store.subscribe, model.store.get, model.store.get);
  const dirty = view.load === "ready" && isDescriptionDirty(view.edit);
  useEffect(() => { void model.load(); return () => model.dispose(); }, [model]);
  useUnsavedGuard(dirty);
  // 상세를 연 채 뒤로·앞으로 가기로 catchId가 바뀌면 이 편집기가 해제된다.
  useUnsavedTraverseGuard(dirty, UNSAVED_MESSAGE);
  useUnsavedChanges(dirty);

  return <AuthorDescriptionPanel loadState={view.load} texts={view.edit.texts} status={view.edit.status} dirty={dirty}
    evidenceUrls={evidenceUrls} loadFailureText={view.loadFailureText}
    onChange={model.change}
    onSave={() => { void model.save(); }}
    onRetry={model.retry} />;
}

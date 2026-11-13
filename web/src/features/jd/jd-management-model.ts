import { createViewStore } from "../../lib/view-store.ts";
import { jdErrorText, type JdApi, type JdFailure } from "./jd-api.ts";
import { jdDraftErrors, type JdDraft, type JdItem } from "./jd-types.ts";

export type JdManagementState = {
  list: JdItem[]; nextCursor: string | null; listState: "idle" | "loading" | "ready" | "error";
  listError: string | null; moreBusy: boolean; selectedId: string | null; editorOpen: boolean;
  draft: JdDraft; editState: "idle" | "loading" | "saving" | "saved" | "error";
  editError: string | null; deleteOpen: boolean; deleting: boolean; loginRequired: boolean;
};
export type JdSessionDeps = { session: () => unknown; isLoggedIn: () => boolean };
const initial = (): JdManagementState => ({ list: [], nextCursor: null, listState: "idle", listError: null, moreBusy: false,
  selectedId: null, editorOpen: false, draft: { title: "", body: "" }, editState: "idle", editError: null,
  deleteOpen: false, deleting: false, loginRequired: false });

/** 화면의 로그인 세대와 선택이 같을 때만 응답을 반영한다. */
export function createJdManagementModel(api: JdApi, deps: JdSessionDeps) {
  const store = createViewStore(initial());
  const session = deps.session();
  let disposed = false, listVersion = 0, editVersion = 0;
  const current = () => !disposed && deps.isLoggedIn() && deps.session() === session;
  const busy = () => store.get().editState === "saving" || store.get().deleting;
  function clear(loginRequired = true) {
    ++listVersion; ++editVersion;
    store.set({ ...initial(), loginRequired });
  }
  function reject(failure: JdFailure): boolean {
    if (failure.outcome === "discarded" || failure.status === 401 && failure.outcome !== "renewed-rejected"
      && ["AUTH_REQUIRED", "AUTH_INVALID"].includes(failure.code)) { clear(); return true; }
    return false;
  }
  async function load(more = false) {
    if (!current()) { clear(); return; }
    const before = store.get();
    if (more && (!before.nextCursor || before.moreBusy || before.listState !== "ready")) return;
    const version = more ? listVersion : ++listVersion;
    store.set({ ...before, listError: null, moreBusy: more, ...(more ? {} : { listState: "loading" as const }) });
    const result = await api.list(more ? before.nextCursor : null);
    if (!current()) { if (!disposed) clear(); return; }
    if (version !== listVersion) return;
    if (result.kind === "failed") {
      if (!reject(result)) store.set((s) => ({ ...s, listState: more ? s.listState : "error", moreBusy: false,
        listError: jdErrorText(result) }));
      return;
    }
    const items = more ? [...store.get().list, ...result.value.items] : result.value.items;
    store.set((s) => ({ ...s, listState: "ready", moreBusy: false, nextCursor: result.value.nextCursor,
      list: items.filter((item, index) => items.findIndex((other) => other.jdId === item.jdId) === index) }));
  }
  async function select(id: string | null) {
    if (!current() || busy()) return;
    const version = ++editVersion;
    store.set((s) => ({ ...s, selectedId: id, editorOpen: true, draft: { title: "", body: "" },
      editState: id === null ? "idle" : "loading", editError: null, deleteOpen: false }));
    if (id === null) return;
    const result = await api.get(id);
    if (!current()) { if (!disposed) clear(); return; }
    if (version !== editVersion) return;
    if (result.kind === "failed") {
      if (!reject(result)) store.set((s) => ({ ...s, editState: "error", editError: jdErrorText(result) }));
    } else store.set((s) => ({ ...s, draft: { title: result.value.title, body: result.value.body }, editState: "idle" }));
  }
  function change(draft: JdDraft) {
    if (!current() || busy() || store.get().editState === "loading") return;
    store.set((s) => ({ ...s, draft, editState: "idle", editError: null }));
  }
  async function save() {
    const before = store.get();
    if (!current() || busy() || !before.editorOpen || before.editState === "loading") return;
    const errors = jdDraftErrors(before.draft);
    if (errors.length) { store.set({ ...before, editState: "error", editError: errors.join(" ") }); return; }
    const version = editVersion;
    store.set({ ...before, editState: "saving", editError: null });
    const result = before.selectedId ? await api.update(before.selectedId, before.draft) : await api.create(before.draft);
    if (!current()) { if (!disposed) clear(); return; }
    if (version !== editVersion) return;
    if (result.kind === "failed") {
      // 편집 실패는 입력을 보존한다. 인증/세션이 바뀌면 개인정보 보호를 위해 화면을 비운다.
      if (!reject(result)) store.set((s) => ({ ...s, editState: "error", editError: jdErrorText(result) }));
      return;
    }
    store.set((s) => ({ ...s, selectedId: result.value.jdId, editState: "saved", draft: { title: result.value.title, body: result.value.body } }));
    await load(); // 이전 목록/다음 쪽 응답을 폐기하고 서버 정렬을 다시 따른다.
  }
  function confirmDelete(open: boolean) {
    if (!current() || busy() || !store.get().selectedId) return;
    store.set((s) => ({ ...s, deleteOpen: open, editError: null }));
  }
  async function remove() {
    const before = store.get();
    if (!current() || busy() || !before.deleteOpen || !before.selectedId) return;
    store.set({ ...before, deleting: true, editError: null });
    const result = await api.remove(before.selectedId);
    if (!current()) { if (!disposed) clear(); return; }
    if (result.kind === "failed") {
      if (!reject(result)) store.set((s) => ({ ...s, deleting: false, editError: `삭제 결과를 확인해 주세요. ${jdErrorText(result)}` }));
      return;
    }
    ++editVersion;
    store.set((s) => ({ ...initial(), list: s.list, nextCursor: s.nextCursor, listState: s.listState }));
    await load();
  }
  return { store, load, select, change, save, confirmDelete, remove, clear, activate() { disposed = false; },
    dispose() { disposed = true; ++listVersion; ++editVersion; } };
}
export type JdManagementModel = ReturnType<typeof createJdManagementModel>;

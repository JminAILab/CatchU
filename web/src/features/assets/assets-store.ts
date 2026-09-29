import type { CatchApi, CatchChange, CatchFailure, CatchResult } from "./catch-api";
import type { CatchAsset } from "./types";

export type QueryState = "loading" | "ready" | "error";
export type CatchMutation = {
  catchId: string;
  kind: CatchChange["kind"];
  status: "saving" | "success" | "error";
  error: CatchFailure | null;
};
export type AssetsSnapshot = {
  mutation: CatchMutation | null;
  managementOpen: boolean;
  repositoryId: string | null;
  items: readonly CatchAsset[];
  listState: QueryState;
  listError: CatchFailure | null;
  nextCursor: string | null;
  moreState: "idle" | "loading" | "error";
  selectedId: string | null;
  detail?: CatchAsset;
  detailState: QueryState;
  detailError: CatchFailure | null;
};
const networkFailure: CatchFailure = { kind: "lookup-failed", status: null, code: "LOOKUP_FAILED" };

/** URL·표시와 분리하여 이전 응답과 중복 D 콜백을 한 곳에서 제어한다. */
export function createAssetsStore(api: CatchApi) {
  let state: AssetsSnapshot = {
    mutation: null, managementOpen: false, repositoryId: null, items: [], listState: "loading", listError: null, nextCursor: null, moreState: "idle",
    selectedId: null, detailState: "loading", detailError: null,
  };
  const listeners = new Set<() => void>();
  let mutationVersion = 0;
  let writeTask: Promise<void> | undefined;
  let listVersion = 0;
  let detailVersion = 0;
  let listAbort: AbortController | undefined;
  let detailAbort: AbortController | undefined;
  let listTask: Promise<void> | undefined;
  let pendingRefresh: { version: number; task: Promise<void> } | undefined;
  let moreTask: Promise<void> | undefined;
  let detailTask: Promise<void> | undefined;
  const seenCursors = new Set<string>();
  const emit = (patch: Partial<AssetsSnapshot>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };
  async function safely<T>(call: () => Promise<CatchResult<T>>): Promise<CatchResult<T>> {
    try { return await call(); } catch { return networkFailure; }
  }
  function refresh(repositoryId = state.repositoryId ?? ""): Promise<void> {
    if (listTask && state.repositoryId === repositoryId) return listTask;
    const version = ++listVersion;
    pendingRefresh = undefined;
    listAbort?.abort();
    const abort = new AbortController();
    listAbort = abort;
    moreTask = undefined;
    seenCursors.clear();
    emit({ repositoryId, items: [], listState: "loading", listError: null, moreState: "idle", nextCursor: null });
    const task = safely(() => api.list(repositoryId, null, abort.signal)).then((result) => {
      if (version !== listVersion) return;
      if (result.kind === "success") {
        const items = [...new Map(result.data.items.map((item) => [item.catchId, item])).values()];
        emit({ items, nextCursor: result.data.page.nextCursor, listState: "ready" });
      } else emit({ listState: "error", listError: result });
    }).finally(() => { if (listTask === task) listTask = undefined; });
    listTask = task;
    return task;
  }
  /** D 활동 전에 시작한 조회가 있으면 완료 후 새 조회를 한 번 예약한다. */
  function invalidateList(repositoryId = state.repositoryId ?? ""): Promise<void> {
    if (!listTask || state.repositoryId !== repositoryId) return refresh(repositoryId);
    const version = listVersion;
    if (pendingRefresh?.version === version) return pendingRefresh.task;
    const task = listTask.then(() => {
      if (version !== listVersion) return;
      return refresh(repositoryId);
    }).finally(() => { if (pendingRefresh?.task === task) pendingRefresh = undefined; });
    pendingRefresh = { version, task };
    return task;
  }
  function selectRepository(repositoryId: string) {
    return state.repositoryId === repositoryId ? (listTask ?? Promise.resolve()) : refresh(repositoryId);
  }
  function loadMore(): Promise<void> {
    if (moreTask) return moreTask;
    if (listTask || state.listState !== "ready" || state.nextCursor === null) return Promise.resolve();
    const version = listVersion;
    const cursor = state.nextCursor;
    emit({ moreState: "loading" });
    const task = safely(() => api.list(state.repositoryId ?? "", cursor, listAbort?.signal)).then((result) => {
      if (version !== listVersion) return;
      if (result.kind !== "success") {
        emit({ moreState: "error", listError: result });
        return;
      }
      const next = result.data.page.nextCursor;
      if (next === cursor || (next !== null && seenCursors.has(next))) {
        emit({ moreState: "error", listError: networkFailure });
        return;
      }
      seenCursors.add(cursor);
      const items = [...new Map([...state.items, ...result.data.items].map((item) => [item.catchId, item])).values()];
      emit({ items, nextCursor: next, moreState: "idle", listError: null });
    }).finally(() => { if (moreTask === task) moreTask = undefined; });
    moreTask = task;
    return task;
  }
  function openDetail(catchId: string | null, force = false): Promise<void> {
    if (!force && state.selectedId === catchId) return detailTask ?? Promise.resolve();
    const version = ++detailVersion;
    detailAbort?.abort();
    const abort = new AbortController();
    detailAbort = abort;
    emit({ selectedId: catchId, detail: undefined, detailState: "loading", detailError: null });
    if (catchId === null) { detailTask = undefined; return Promise.resolve(); }
    // 저장 도중 다시 연 경우 PUT의 접수 상태를 취소하거나 추측하지 않고 끝난 뒤 조회한다.
    if (writeTask && state.mutation?.catchId === catchId) {
      const pending = writeTask.then(() => {
        if (version === detailVersion && state.selectedId === catchId) return openDetail(catchId, true);
      });
      detailTask = pending;
      return pending;
    }
    const task = safely(() => api.detail(catchId, abort.signal)).then((result) => {
      if (version !== detailVersion) return;
      if (result.kind === "success") emit({
        detail: result.data, detailState: "ready",
        items: state.items.map((item) => item.catchId === catchId ? result.data : item),
        mutation: state.mutation?.catchId === catchId && state.mutation.status !== "saving" ? null : state.mutation,
      });
      else emit({ detailState: "error", detailError: result });
    }).finally(() => { if (detailTask === task) detailTask = undefined; });
    detailTask = task;
    return task;
  }
  function update(change: CatchChange): Promise<void> {
    if (writeTask) return writeTask;
    const item = state.detail;
    if (!item || state.detailState !== "ready" || state.selectedId !== item.catchId
      || (state.mutation?.catchId === item.catchId && state.mutation.status === "error")) return Promise.resolve();
    const catchId = item.catchId;
    const version = ++mutationVersion;
    emit({ mutation: { catchId, kind: change.kind, status: "saving", error: null } });
    const task = safely(() => api.update(catchId, change)).then((result) => {
      if (version !== mutationVersion) return;
      // 저장 전/중의 GET 응답이 저장 결과를 덮어쓰지 않게 무효화한다.
      if (state.selectedId === catchId) { ++detailVersion; detailAbort?.abort(); detailTask = undefined; }
      ++listVersion; listAbort?.abort(); listAbort = new AbortController(); listTask = moreTask = undefined;
      const reloadList = state.listState === "loading";
      if (result.kind === "success") {
        emit({
          items: state.items.map((entry) => entry.catchId === catchId ? result.data : entry),
          ...(state.selectedId === catchId ? { detail: result.data, detailState: "ready" as const, detailError: null } : {}),
          moreState: "idle", mutation: { catchId, kind: change.kind, status: "success", error: null },
        });
      } else {
        emit({ moreState: "idle", mutation: { catchId, kind: change.kind, status: "error", error: result } });
        // 다시 열어 대기하던 화면에 이전 값을 끼워 넣지 않는다.
        if (state.selectedId === catchId && state.detailState === "loading") {
          emit({ detailState: "error", detailError: result });
        }
      }
      if (reloadList) void refresh();
    }).finally(() => { if (writeTask === task) writeTask = undefined; });
    writeTask = task;
    return task;
  }
  function dispose() {
    ++mutationVersion; writeTask = undefined;
    ++listVersion; ++detailVersion;
    listAbort?.abort(); detailAbort?.abort();
    listTask = moreTask = detailTask = undefined;
    pendingRefresh = undefined;
    // StrictMode의 effect 재시작 시에도 첫 조회를 다시 실행한다.
    emit({ repositoryId: null, selectedId: null, items: [], detail: undefined, listState: "loading" });
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setManagementOpen(open: boolean) { if (open) void openDetail(null); emit({ managementOpen: open }); },
    selectRepository, refresh, invalidateList, loadMore, openDetail, update, dispose,
  };
}
export type AssetsStore = ReturnType<typeof createAssetsStore>;



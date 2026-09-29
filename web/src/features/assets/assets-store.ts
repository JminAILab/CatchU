import type { CatchApi, CatchFailure, CatchResult } from "./catch-api";
import type { CatchAsset } from "./types";

export type QueryState = "loading" | "ready" | "error";
export type AssetsSnapshot = {
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
    managementOpen: false, repositoryId: null, items: [], listState: "loading", listError: null, nextCursor: null, moreState: "idle",
    selectedId: null, detailState: "loading", detailError: null,
  };
  const listeners = new Set<() => void>();
  let listVersion = 0;
  let detailVersion = 0;
  let listAbort: AbortController | undefined;
  let detailAbort: AbortController | undefined;
  let listTask: Promise<void> | undefined;
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
    const task = safely(() => api.detail(catchId, abort.signal)).then((result) => {
      if (version !== detailVersion) return;
      if (result.kind === "success") emit({ detail: result.data, detailState: "ready" });
      else emit({ detailState: "error", detailError: result });
    }).finally(() => { if (detailTask === task) detailTask = undefined; });
    detailTask = task;
    return task;
  }
  function dispose() {
    ++listVersion; ++detailVersion;
    listAbort?.abort(); detailAbort?.abort();
    listTask = moreTask = detailTask = undefined;
    // StrictMode의 effect 재시작 시에도 첫 조회를 다시 실행한다.
    emit({ repositoryId: null, selectedId: null, items: [], detail: undefined, listState: "loading" });
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setManagementOpen(open: boolean) { if (open) void openDetail(null); emit({ managementOpen: open }); },
    selectRepository, refresh, loadMore, openDetail, dispose,
  };
}
export type AssetsStore = ReturnType<typeof createAssetsStore>;



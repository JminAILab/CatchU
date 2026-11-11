import { memberMutationOutcome } from "../../lib/auth-api.ts";
import { ALL_CATCHES, type CatchApi, type CatchChange, type CatchFailure, type CatchListFilter, type CatchResult } from "./catch-api.ts";
import type { CatchAsset } from "./types";

/** 목록 열쇠가 같은지. 열쇠는 저장소와 작성자 설명 걸러 보기다(새 Catch BR5.2·BR5.4). */
export function sameFilter(current: CatchListFilter | null, next: CatchListFilter): boolean {
  return current !== null && current.repositoryId === next.repositoryId && current.authorDescription === next.authorDescription;
}

export type QueryState = "loading" | "ready" | "error";
/**
 * 저장 상태. `error`는 실패 확정 또는 결과 불명이라 현재 상태를 다시 읽기 전까지 저장을 막는다.
 * `not-processed`는 서버가 이번 요청을 처리하지 않은 경우다(#286 후속, B 동의). 잠그지 않고 다시 누를 수 있다.
 * - `renewed-rejected`: 로그인 연장 뒤 401로 거부됐다. 자동으로 다시 보내지 않는다.
 * - `not-sent`: 요청을 보내지 않았다. 다시 눌렀을 때 보낼지는 그때의 공통 인증 상태가 정한다.
 */
export type CatchMutation = {
  catchId: string;
  kind: CatchChange["kind"];
  status: "saving" | "success" | "error" | "not-processed";
  error: CatchFailure | null;
  reason?: "renewed-rejected" | "not-sent";
};
export type AssetsSnapshot = {
  mutation: CatchMutation | null;
  managementOpen: boolean;
  /** 지금 목록의 걸러 보기. 화면을 처음 열거나 해제한 뒤에는 null이다. */
  filter: CatchListFilter | null;
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
    mutation: null, managementOpen: false, filter: null, items: [], listState: "loading", listError: null, nextCursor: null, moreState: "idle",
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
  /** 걸러 보기의 첫 쪽부터 읽는다. 열쇠가 바뀌면 커서와 이전 요청을 버린다. */
  function refresh(filter: CatchListFilter = state.filter ?? ALL_CATCHES): Promise<void> {
    if (listTask && sameFilter(state.filter, filter)) return listTask;
    const version = ++listVersion;
    pendingRefresh = undefined;
    listAbort?.abort();
    const abort = new AbortController();
    listAbort = abort;
    moreTask = undefined;
    seenCursors.clear();
    emit({ filter, items: [], listState: "loading", listError: null, moreState: "idle", nextCursor: null });
    const task = safely(() => api.list(filter, null, abort.signal)).then((result) => {
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
  function invalidateList(filter: CatchListFilter = state.filter ?? ALL_CATCHES): Promise<void> {
    if (!listTask || !sameFilter(state.filter, filter)) return refresh(filter);
    const version = listVersion;
    if (pendingRefresh?.version === version) return pendingRefresh.task;
    const task = listTask.then(() => {
      if (version !== listVersion) return;
      return refresh(filter);
    }).finally(() => { if (pendingRefresh?.task === task) pendingRefresh = undefined; });
    pendingRefresh = { version, task };
    return task;
  }
  /** 화면의 걸러 보기(주소 매개변수)와 맞춘다. 같은 열쇠면 다시 읽지 않는다(설명을 저장한 뒤에도 지금 쪽을 유지, BR5.6). */
  function selectFilter(filter: CatchListFilter) {
    return sameFilter(state.filter, filter) ? (listTask ?? Promise.resolve()) : refresh(filter);
  }
  function loadMore(): Promise<void> {
    if (moreTask) return moreTask;
    if (listTask || state.listState !== "ready" || state.nextCursor === null) return Promise.resolve();
    const version = listVersion;
    const cursor = state.nextCursor;
    emit({ moreState: "loading" });
    const task = safely(() => api.list(state.filter ?? ALL_CATCHES, cursor, listAbort?.signal)).then((result) => {
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
      // 서버가 처리하지 않은 요청은 진행 표시만 정리한다. 상세·목록과 진행 중인 조회는 그대로 두고 잠그지 않는다.
      // 반영하지 않은 응답(discarded)은 보낸 뒤라 반영됐을 수 있으므로 아래 결과 불명 처리로 간다.
      const outcome = result.kind === "success" ? "other" : memberMutationOutcome(result);
      if (outcome === "renewed-rejected" || outcome === "not-sent") {
        emit({ mutation: { catchId, kind: change.kind, status: "not-processed", error: null, reason: outcome } });
        return;
      }
      // 저장 전/중의 GET 응답이 저장 결과를 덮어쓰지 않게 무효화한다.
      if (state.selectedId === catchId) { ++detailVersion; detailAbort?.abort(); detailTask = undefined; }
      const reloadList = state.listState === "loading" || pendingRefresh?.version === listVersion;
      ++listVersion; listAbort?.abort(); listAbort = new AbortController(); listTask = moreTask = undefined;
      pendingRefresh = undefined;
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
    emit({ filter: null, selectedId: null, items: [], detail: undefined, listState: "loading" });
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setManagementOpen(open: boolean) { if (open) void openDetail(null); emit({ managementOpen: open }); },
    selectFilter, refresh, invalidateList, loadMore, openDetail, update, dispose,
  };
}
export type AssetsStore = ReturnType<typeof createAssetsStore>;



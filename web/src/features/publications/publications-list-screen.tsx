"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { accessTokenStore } from "@/lib/access-token";
import { api } from "@/lib/api";
import { createViewStore } from "@/lib/view-store";
import { createPublicationsApi, publicationListErrorText, type PublicationListItem, type PublicationsApi } from "./publications-api";
import { PublicationsListView } from "./publications-list-view";
import styles from "./publications.module.css";

// api.member가 기준 주소·Bearer·401을 맡는다. 렌더마다 호출 객체를 새로 만들지 않는다.
const publications = createPublicationsApi(api.member);

/** 화면 밖 의존. 시험은 로그인 식별을 바꿔 끼운다. */
export type ListDeps = { session: () => unknown };
const browserDeps: ListDeps = { session: () => accessTokenStore.get() };

export type PublicationsListState = {
  list: { state: "loading" | "ready" | "error"; items: PublicationListItem[]; nextCursor: string | null; errorText?: string };
  moreState: "idle" | "loading" | "error";
};

/** 목록 상태 전이(U4 W5-1). 첫 쪽을 다시 읽으면 그 전에 보낸 [더 보기] 응답은 붙이지 않고, 로그인이 바뀐 뒤 도착한 응답은 반영하지 않는다. */
export function createPublicationsListModel(client: PublicationsApi, deps: ListDeps = browserDeps) {
  const store = createViewStore<PublicationsListState>({ list: { state: "loading", items: [], nextCursor: null }, moreState: "idle" });
  let listRequest: AbortController | null = null;
  let listGeneration = 0;

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
        ? { state: "error", items: [], nextCursor: null, errorText: publicationListErrorText(result.failure) }
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

  return { store, load, loadMore, dispose: () => listRequest?.abort() };
}

/** 회원 가드((member) 레이아웃) 안의 발행본 목록 화면(U4 W5). */
export function PublicationsListPage() {
  return <PublicationsListScreen api={publications} />;
}

export function PublicationsListScreen({ api: client, deps }: { api: PublicationsApi; deps?: ListDeps }) {
  const [model] = useState(() => createPublicationsListModel(client, deps));
  const view = useSyncExternalStore(model.store.subscribe, model.store.get, model.store.get);
  useEffect(() => { void model.load(); return () => model.dispose(); }, [model]);

  return (
    <main className={styles.page}>
      <h1>발행본</h1>
      <p className={styles.lead}>발행한 고정 사본과 링크입니다. 중지·만료된 발행본도 여기서 볼 수 있습니다.</p>
      <PublicationsListView state={view.list.state} items={view.list.items} errorText={view.list.errorText}
        hasMore={view.list.nextCursor !== null} moreState={view.moreState}
        onRetry={() => { void model.load(); }} onLoadMore={() => { void model.loadMore(); }} />
    </main>
  );
}

"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { accessTokenStore } from "@/lib/access-token";
import { api } from "@/lib/api";
import { routes } from "@/lib/routes";
import { createViewStore } from "@/lib/view-store";
import { createPresetsApi, type PresetSummary, type PresetsApi } from "./presets-api";
import { PresetsListView } from "./presets-list-view";

// api.member가 기준 주소·Bearer·401을 맡는다. 렌더마다 호출 객체를 새로 만들지 않는다.
const presets = createPresetsApi(api.member);

/** 화면 밖 의존. 시험은 로그인 식별을 바꿔 끼운다. */
export type PresetsListDeps = { session: () => unknown };
const browserDeps: PresetsListDeps = { session: () => accessTokenStore.get() };

export type PresetsListState = { state: "loading" | "ready" | "error"; presets: PresetSummary[] };

/**
 * 목록 상태 전이(M2). `GET /v1/presets`를 한 번 부른다(쪽 나눔 없음, NFR6.1).
 * [다시 불러오기]가 겹치면 나중 요청만 쓰고, 로그인이 바뀐 뒤 도착한 응답은 반영하지 않는다.
 */
export function createPresetsListModel(client: Pick<PresetsApi, "list">, deps: PresetsListDeps = browserDeps) {
  const store = createViewStore<PresetsListState>({ state: "loading", presets: [] });
  let request: AbortController | null = null;

  async function load() {
    request?.abort();
    const abort = new AbortController();
    request = abort;
    const session = deps.session();
    store.set({ state: "loading", presets: [] });
    const result = await client.list(abort.signal);
    if (abort.signal.aborted || deps.session() !== session) return;
    store.set(result.kind === "ok" ? { state: "ready", presets: result.value.presets } : { state: "error", presets: [] });
  }

  return { store, load, dispose: () => request?.abort() };
}

/** 회원 가드((member) 레이아웃) 안의 프리셋 목록 화면(M2). */
export function PresetsListPage() {
  return <PresetsListScreen api={presets} />;
}

export function PresetsListScreen({ api: client, deps }: { api: Pick<PresetsApi, "list">; deps?: PresetsListDeps }) {
  const router = useRouter();
  const [model] = useState(() => createPresetsListModel(client, deps));
  const view = useSyncExternalStore(model.store.subscribe, model.store.get, model.store.get);
  useEffect(() => { void model.load(); return () => model.dispose(); }, [model]);
  return <PresetsListView state={view.state} presets={view.presets} onRetry={() => { void model.load(); }} onNew={() => router.push(routes.presetNew)} />;
}

"use client";

import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { AssetsView, assetTabs, type AssetTab } from "./assets-view";
import { CatchActions } from "./catch-actions";
import { createAssetsStore } from "./assets-store";
import { catchErrorText, type CatchApi } from "./catch-api";
import type { RepositoryOption } from "./types";
import styles from "./assets.module.css";

export type RepositoryManagementBindings = {
  /** D 모달을 열기 직전에 호출: Catch 모달을 먼저 닫는다. */
  onOpen: () => void;
  onClosed: () => void;
  /** 이 콜백으로 닫는 경우 onClosed를 중복 호출하지 않는다. */
  onShowRepository: (repositoryId: string) => void;
};

type Props = {
  /** AssetsMemberBoundary 안에 조립해 회원 전환 때 이 컴포넌트도 새로 마운트한다. */
  api: CatchApi;
  repositories: readonly RepositoryOption[];
  /** 저장소 이름 조회는 Catch 목록·상세 조회를 막지 않는다. */
  repositoryNotice?: ReactNode;
  repositoryManagement: (bindings: RepositoryManagementBindings) => ReactNode;
};

/** #106의 인증 가드 안에 조립하는 B 화면. 제품 경로나 토큰 저장소를 소유하지 않는다. */
export function AssetsConnected({ api, repositories, repositoryNotice, repositoryManagement }: Props) {
  const store = useMemo(() => createAssetsStore(api), [api]);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const params = useSearchParams();
  const pathname = usePathname();
  const repositoryId = params.get("repositoryId") ?? "";
  const catchId = params.get("catchId");
  const tab: AssetTab = assetTabs.find((item) => item.id === params.get("tab"))?.id ?? "catch";

  useEffect(() => () => store.dispose(), [store]);
  useEffect(() => { void store.selectRepository(repositoryId); }, [repositoryId, store]);
  useEffect(() => {
    // 탭/뒤로 가기로 D 슬롯이 해제되면 열림 상태만 정리한다. 일반 닫기 재조회와 구분한다.
    if (tab !== "catch" && snapshot.managementOpen) store.setManagementOpen(false);
    void store.openDetail(tab === "catch" && !snapshot.managementOpen ? catchId : null);
  }, [catchId, tab, snapshot.managementOpen, store]);

  function changeQuery(changes: Record<string, string | null>) {
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value); else next.delete(key);
    }
    const url = `${pathname}${next.size ? `?${next}` : ""}`;
    if (url !== window.location.pathname + window.location.search) window.history.pushState(null, "", url);
  }
  const bindings: RepositoryManagementBindings = {
    onOpen() { store.setManagementOpen(true); changeQuery({ catchId: null }); },
    onClosed() { store.setManagementOpen(false); void store.invalidateList(repositoryId); },
    onShowRepository(id) {
      store.setManagementOpen(false);
      changeQuery({ repositoryId: id || null, catchId: null, tab: null });
      void store.invalidateList(id);
    },
  };
  // URL 변경 직후 effect가 실행되기 전에도 이전 저장소/상세를 잠깐 보여 주지 않는다.
  const listMatches = snapshot.repositoryId === repositoryId;
  const visibleCatchId = tab === "catch" && !snapshot.managementOpen ? catchId : null;
  const detailMatches = snapshot.selectedId === visibleCatchId;
  return (
    <div className={styles.preview}>
      <AssetsView dataMode="api" items={listMatches ? snapshot.items : []}
        repositories={repositories} repositoryNotice={repositoryNotice} repositoryId={repositoryId} tab={tab}
        listState={listMatches ? snapshot.listState : "loading"}
        listMessage={catchErrorText(snapshot.listError, "list")}
        detailState={detailMatches ? snapshot.detailState : "loading"}
        detailMessage={catchErrorText(snapshot.detailError)}
        detailItem={detailMatches ? snapshot.detail : undefined}
        detailActions={detailMatches && snapshot.detail ? <CatchActions key={snapshot.detail.catchId}
          item={snapshot.detail} mutation={snapshot.mutation}
          onChange={(change) => { void store.update(change); }}
          onReload={() => { if (catchId) void store.openDetail(catchId, true); }} /> : null}
        selectedId={visibleCatchId}
        hasMore={listMatches && snapshot.nextCursor !== null} moreState={snapshot.moreState}
        onLoadMore={() => { void store.loadMore(); }}
        onTabChange={(next) => changeQuery({ tab: next === "catch" ? null : next, catchId: null })}
        onRepositoryChange={(id) => changeQuery({ repositoryId: id || null, catchId: null })}
        onOpen={(id) => changeQuery({ catchId: id })}
        onClose={() => changeQuery({ catchId: null })}
        onRetryList={() => { void store.refresh(repositoryId); }}
        onRetryDetail={() => { if (catchId) void store.openDetail(catchId, true); }}
        repositoryManagement={repositoryManagement(bindings)} />
    </div>
  );
}


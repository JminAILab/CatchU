"use client";

import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { AssetsView, parseVisibilityFilter } from "./assets-view";
import { CatchActions } from "./catch-actions";
import { createAssetsStore, type AssetsStore } from "./assets-store";
import { catchErrorText, type CatchApi } from "./catch-api";
import type { AuthorDescriptionApi } from "./author-description-api";
import { AuthorDescriptionEditor } from "./author-description-editor";
import { UNSAVED_MESSAGE } from "@/features/profile/use-unsaved-guard";
import { confirmDiscardUnsaved, unsavedChanges, type ConfirmDialog, type UnsavedRegistry } from "@/lib/unsaved-changes";
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
  /** U4 작성자 설명 읽기·저장. 없으면 상세에 설명 편집 영역을 그리지 않는다. */
  descriptionApi?: AuthorDescriptionApi;
  repositories: readonly RepositoryOption[];
  /** 저장소 이름 조회는 Catch 목록·상세 조회를 막지 않는다. */
  repositoryNotice?: ReactNode;
  repositoryManagement: (bindings: RepositoryManagementBindings) => ReactNode;
};

/**
 * [현재 상태 다시 불러오기]. 다시 읽는 동안 상세가 비어 작성자 설명 편집기가 해제되므로,
 * 저장하지 않은 설명이 있으면 먼저 묻는다(BR2.2). 머무르면 다시 읽지 않고 입력을 그대로 둔다.
 */
export function reloadDetail(store: Pick<AssetsStore, "openDetail">, catchId: string | null, confirm: ConfirmDialog,
  registry: Pick<UnsavedRegistry, "hasUnsaved"> = unsavedChanges) {
  if (!catchId || !confirmDiscardUnsaved(registry, confirm, UNSAVED_MESSAGE)) return;
  void store.openDetail(catchId, true);
}

/** #106의 인증 가드 안에 조립하는 B 화면. 제품 경로나 토큰 저장소를 소유하지 않는다. */
export function AssetsConnected({ api, descriptionApi, repositories, repositoryNotice, repositoryManagement }: Props) {
  const store = useMemo(() => createAssetsStore(api), [api]);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const params = useSearchParams();
  const pathname = usePathname();
  const repositoryId = params.get("repositoryId") ?? "";
  // API 목록은 저장소로만 거르고, 공개 상태는 불러온 목록 안에서 거른다.
  const visibility = parseVisibilityFilter(params.get("visibility"));
  const catchId = params.get("catchId");

  useEffect(() => () => store.dispose(), [store]);
  useEffect(() => { void store.selectRepository(repositoryId); }, [repositoryId, store]);
  useEffect(() => {
    // D 모달이 열려 있는 동안은 Catch 상세를 열지 않는다. 닫힐 때의 재조회는 onClosed가 맡는다.
    void store.openDetail(snapshot.managementOpen ? null : catchId);
  }, [catchId, snapshot.managementOpen, store]);

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
      // 막 분석한 Catch는 미공개로 생기므로 공개 상태 걸러 보기를 풀어 저장소 전체를 보여 준다.
      changeQuery({ repositoryId: id || null, visibility: null, catchId: null });
      void store.invalidateList(id);
    },
  };
  // URL 변경 직후 effect가 실행되기 전에도 이전 저장소/상세를 잠깐 보여 주지 않는다.
  const listMatches = snapshot.repositoryId === repositoryId;
  const visibleCatchId = snapshot.managementOpen ? null : catchId;
  const detailMatches = snapshot.selectedId === visibleCatchId;
  return (
    <div className={styles.preview}>
      <AssetsView dataMode="api" items={listMatches ? snapshot.items : []}
        repositories={repositories} repositoryNotice={repositoryNotice} repositoryId={repositoryId} visibility={visibility}
        listState={listMatches ? snapshot.listState : "loading"}
        listMessage={catchErrorText(snapshot.listError, "list")}
        detailState={detailMatches ? snapshot.detailState : "loading"}
        detailMessage={catchErrorText(snapshot.detailError)}
        detailItem={detailMatches ? snapshot.detail : undefined}
        detailActions={detailMatches && snapshot.detail ? <CatchActions key={snapshot.detail.catchId}
          item={snapshot.detail} mutation={snapshot.mutation}
          onChange={(change) => { void store.update(change); }}
          onReload={() => reloadDetail(store, catchId, (message) => window.confirm(message))} /> : null}
        descriptionEditor={detailMatches && snapshot.detail && descriptionApi
          ? <AuthorDescriptionEditor key={snapshot.detail.catchId} catchId={snapshot.detail.catchId} api={descriptionApi} /> : null}
        selectedId={visibleCatchId}
        hasMore={listMatches && snapshot.nextCursor !== null} moreState={snapshot.moreState}
        onLoadMore={() => { void store.loadMore(); }}
        onRepositoryChange={(id) => changeQuery({ repositoryId: id || null, catchId: null })}
        onVisibilityChange={(next) => changeQuery({ visibility: next || null, catchId: null })}
        onOpen={(id) => changeQuery({ catchId: id })}
        onClose={() => {
          // 작성자 설명을 저장하지 않았으면 모달을 닫기 전에 묻는다(BR2.2). 머무르면 입력을 그대로 둔다.
          if (!confirmDiscardUnsaved(unsavedChanges, (message) => window.confirm(message), UNSAVED_MESSAGE)) return;
          changeQuery({ catchId: null });
        }}
        onRetryList={() => { void store.refresh(repositoryId); }}
        onRetryDetail={() => { if (catchId) void store.openDetail(catchId, true); }}
        repositoryManagement={repositoryManagement(bindings)} />
    </div>
  );
}


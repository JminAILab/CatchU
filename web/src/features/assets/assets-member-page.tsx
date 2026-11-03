"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { LoadingState, LookupFailedState } from "@/components/status/status";
import { createRepositoryApi } from "@/features/repository-management/repository-api";
import { RepositoryManagement } from "@/features/repository-management/repository-management";
import { accessTokenStore } from "@/lib/access-token";
import { api } from "@/lib/api";
import { AssetsConnected } from "./assets-connected";
import { AssetsMemberBoundary } from "./assets-member-boundary";
import { createCatchApi } from "./catch-api";
import { createAuthorDescriptionApi } from "./author-description-api";
import { createRepositoryOptionsStore } from "./repository-options-store";

// api.member가 기준 주소·Bearer·401을 담당한다. 렌더마다 호출 객체를 새로 만들지 않는다.
const catches = createCatchApi(api.member);
const repositories = createRepositoryApi(api.member);
const descriptions = createAuthorDescriptionApi(api.member);

/** (member) layout의 회원 가드 안에서만 조립한다. */
export function AssetsMemberPage() {
  return (
    <AssetsMemberBoundary tokens={accessTokenStore}>
      <MemberAssets />
    </AssetsMemberBoundary>
  );
}

function MemberAssets() {
  // 회원별 저장소 이름·Catch 자료·D 모달을 모두 같은 회원 경계 안에 둔다.
  const options = useMemo(() => createRepositoryOptionsStore(repositories), []);
  const snapshot = useSyncExternalStore(options.subscribe, options.getSnapshot, options.getSnapshot);
  useEffect(() => {
    void options.refresh();
    return () => options.dispose();
  }, [options]);

  const repositoryNotice = snapshot.state === "loading" ? (
    <LoadingState>저장소 이름을 불러오고 있습니다. Catch는 계속 확인할 수 있습니다.</LoadingState>
  ) : snapshot.state === "error" ? (
    <LookupFailedState title="저장소 이름을 불러오지 못했습니다" onRetry={() => { void options.refresh(); }}>
      Catch 조회 결과는 아래에서 별도로 확인할 수 있습니다.
    </LookupFailedState>
  ) : null;

  return (
    <AssetsConnected api={catches} descriptionApi={descriptions} repositories={snapshot.repositories} repositoryNotice={repositoryNotice}
      repositoryManagement={(bindings) => (
        <RepositoryManagement api={repositories} bindings={{
          onOpen: bindings.onOpen,
          onClosed() {
            bindings.onClosed();
            void options.refresh();
          },
          onShowRepository(repositoryId) {
            bindings.onShowRepository(repositoryId);
            void options.refresh();
          },
        }} />
      )} />
  );
}

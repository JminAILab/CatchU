"use client";

import { Fragment, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { createAssetsSessionScope, type AssetsTokenSource } from "./assets-session-scope";

const serverSnapshot = () => null;

/** #106 회원 가드 안에서 사용한다. 인증·로그인 이동은 공통 가드가 담당한다. */
export function AssetsMemberBoundary({ tokens, children }: {
  tokens: AssetsTokenSource;
  children: ReactNode;
}) {
  const scope = useMemo(() => createAssetsSessionScope(tokens), [tokens]);
  const generation = useSyncExternalStore(scope.subscribe, scope.getSnapshot, serverSnapshot);
  if (generation === null) return null;
  // Catch 목록/상세/저장 상태와 회원별 저장소 자료·D 슬롯을 함께 새로 만든다.
  // 토큰 자체를 React key나 DOM에 넣지 않는다.
  return <Fragment key={generation}>{children}</Fragment>;
}

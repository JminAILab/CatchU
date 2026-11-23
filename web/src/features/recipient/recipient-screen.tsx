"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { pdfHttp } from "@/features/materials/pdf-clients";
import type { PdfCopySource } from "@/features/publications/published-pdf-item";
import { useSnapshotJump } from "@/features/publications/snapshot-jump";
import { accessTokenStore } from "@/lib/access-token";
import { api } from "@/lib/api";
import { createRecipientApi } from "./recipient-api";
import { browserSessionStorage, createGrantStore } from "./recipient-grants";
import type { RecipientSlotProps } from "./recipient-slots";
import { createRecipientPublicationStore } from "./recipient-store";
import { RecipientPublicationView } from "./recipient-view";
import styles from "./recipient.module.css";

/** 회원 토큰을 붙이지 않는 받은 사람 호출(#106 `api.recipient`). */
const recipientApi = createRecipientApi((path, request) => api.recipient(path, request));
/** 탭 하나에서 링크별로 나뉘는 grant 보관(10월 `recipient-grants` 그대로, C-11). */
const grants = createGrantStore(browserSessionStorage);

/** `/s/[token]` — 발행본 열람(U4 제출 3 W4). 링크가 바뀌면 상태를 새로 만든다. */
export function RecipientPublicationPage({ token }: { token: string }) {
  return <PublicationView key={token} token={token} />;
}

/**
 * 화면의 큰 단계(판정 통과·비밀번호 입력·접근 불가·조회 실패)가 정해질 때마다 그 단계의 U4 h1으로 초점을 옮긴다(G4, NFR7.3).
 * 처음 연 화면도 포함한다(#416 Step 22, 2026-11-06 담당 요청; 10월은 첫 화면을 제외했다). 불러오는 중에는 옮기지 않고,
 * 같은 단계 안의 갱신(다시 조회)에는 다시 옮기지 않는다. `RecipientGuide` 안 요소로는 초점을 두지 않는다(C-11 guide-rule).
 */
function useFocusOnView(view: string): RefObject<HTMLHeadingElement | null> {
  const ref = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    if (view === "loading") return;
    ref.current?.focus();
  }, [view]);
  return ref;
}

const serverLoggedIn = () => false;

function PublicationView({ token }: { token: string }) {
  const [store] = useState(() => createRecipientPublicationStore({ api: recipientApi, grants, token }));
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => {
    void store.load();
    return () => store.dispose();
  }, [store]);
  const headingRef = useFocusOnView(snapshot.view);
  // 로그인 여부(C-11 `isLoggedIn`). 이 탭의 회원 토큰이 있으면 true이며, 받은 사람 요청에는 그 토큰을 붙이지 않는다.
  const isLoggedIn = useSyncExternalStore(accessTokenStore.subscribe, () => accessTokenStore.get().token !== null, serverLoggedIn);

  // 근거 위치 강조(C-11 evidence-highlight)와 발행본 자료의 프리셋 탭(발행 프리셋 U3 흐름 1·3). 출처 단추는 대상 항목의 탭과 대상을 한 번에 바꾸고,
  // 그린 뒤 첫 `<mark>`(없으면 항목 시작)를 보이며 초점은 항목에 둔다(`useSnapshotJump`). 판정 통과 화면이 아니면 사본을 넘기지 않아
  // 출처 단추가 아무것도 하지 않고 강조도 보이지 않는다(상태에서 파생).
  const jump = useSnapshotJump(snapshot.view === "ready" ? snapshot.snapshot : null);

  const slotProps: RecipientSlotProps = {
    token,
    getGrant: () => grants.get(token),
    onAccessLost: (code) => store.accessLost(code),
    isLoggedIn,
    showEvidence: jump.showEvidence,
  };

  // PDF 항목의 사본 요청(U8 W4). 호출마다 지금의 grant를 머리로 싣고 서버 판정을 다시 받는다. 401·404는 다른 패널과 같이 접근 상실이다.
  const pdfSource = (publishedItemId: string): PdfCopySource => ({
    fetchPdf: (signal) => pdfHttp.recipientCopy(token, publishedItemId, grants.get(token), signal),
    onAccessLost: (code) => store.accessLost(code),
  });

  return (
    <main className={styles.page}>
      <RecipientPublicationView snapshot={snapshot} headingRef={headingRef} highlight={jump.highlight} slotProps={slotProps} pdfSource={pdfSource}
        activePreset={jump.activePreset} onPresetChange={jump.changePreset} tabNotice={jump.notice}
        onRetry={() => { void store.load(); }}
        onUnlock={(password) => store.unlock(password)}
        waitSeconds={() => store.retryWaitSeconds()} />
    </main>
  );
}

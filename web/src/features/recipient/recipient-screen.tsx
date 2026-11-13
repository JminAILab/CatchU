"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { pdfHttp } from "@/features/materials/pdf-clients";
import type { PdfCopySource } from "@/features/publications/published-pdf-item";
import { publishedItemDomId } from "@/features/publications/snapshot-view";
import { accessTokenStore } from "@/lib/access-token";
import { api } from "@/lib/api";
import { createRecipientApi } from "./recipient-api";
import { browserSessionStorage, createGrantStore } from "./recipient-grants";
import { resolveEvidenceTarget, type EvidenceLocation, type EvidenceTarget, type RecipientSlotProps } from "./recipient-slots";
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
/** `snapshot-view.tsx`가 강조 범위에 그리는 `<mark>`(`data-testid="snapshot-highlight"`). 항목 안에서 첫 번째를 스크롤 대상으로 삼는다. */
const HIGHLIGHT_SELECTOR = 'mark[data-testid="snapshot-highlight"]';

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

  // 근거 위치 강조(C-11 evidence-highlight). `seq`는 같은 위치를 다시 눌러도 다시 옮기게 한다.
  // 강조 범위가 있으면 항목 안의 첫 `<mark>`가 화면에 보이도록 옮기고, 범위가 없거나 강조 요소를 못 찾으면 항목 시작으로 옮긴다
  // (PR #482 리뷰: 긴 자료의 뒷부분을 가리키면 항목 시작만 보여 강조가 화면 밖에 남았다). 초점은 항목에 두되 `preventScroll`로 다시 튀지 않게 한다.
  const [target, setTarget] = useState<(EvidenceTarget & { seq: number }) | null>(null);
  const showEvidence = useCallback((location: EvidenceLocation) => {
    const current = store.getSnapshot();
    if (current.view !== "ready") return;
    const resolved = resolveEvidenceTarget(current.snapshot, location);
    if (resolved === null) return;
    setTarget((previous) => ({ ...resolved, seq: (previous?.seq ?? 0) + 1 }));
  }, [store]);
  useEffect(() => {
    if (target === null) return;
    const element = document.getElementById(publishedItemDomId(target.publishedItemId));
    if (!element) return;
    const mark = target.highlight === null ? null : element.querySelector<HTMLElement>(HIGHLIGHT_SELECTOR);
    (mark ?? element).scrollIntoView({ block: mark === null ? "start" : "center" });
    element.focus({ preventScroll: true });
  }, [target]);
  // 판정 통과 화면을 벗어나면 강조도 보이지 않는다(상태에서 파생).
  const highlight = snapshot.view === "ready" && target !== null ? target.highlight : null;

  const slotProps: RecipientSlotProps = {
    token,
    getGrant: () => grants.get(token),
    onAccessLost: (code) => store.accessLost(code),
    isLoggedIn,
    showEvidence,
  };

  // PDF 항목의 사본 요청(U8 W4). 호출마다 지금의 grant를 머리로 싣고 서버 판정을 다시 받는다. 401·404는 다른 패널과 같이 접근 상실이다.
  const pdfSource = (publishedItemId: string): PdfCopySource => ({
    fetchPdf: (signal) => pdfHttp.recipientCopy(token, publishedItemId, grants.get(token), signal),
    onAccessLost: (code) => store.accessLost(code),
  });

  return (
    <main className={styles.page}>
      <RecipientPublicationView snapshot={snapshot} headingRef={headingRef} highlight={highlight} slotProps={slotProps} pdfSource={pdfSource}
        onRetry={() => { void store.load(); }}
        onUnlock={(password) => store.unlock(password)}
        waitSeconds={() => store.retryWaitSeconds()} />
    </main>
  );
}

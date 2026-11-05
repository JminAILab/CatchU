"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { LoadingState, LookupFailedState } from "@/components/status/status";
import { accessTokenStore } from "@/lib/access-token";
import { api } from "@/lib/api";
import { routes } from "@/lib/routes";
import { createViewStore } from "@/lib/view-store";
import {
  createPublicationsApi, deleteErrorText, publicationOpenErrorText, stopErrorText, type PublicationDetail, type PublicationsApi,
} from "./publications-api";
import { PublicationDetailView } from "./publication-detail-view";
import styles from "./publications.module.css";

// api.member가 기준 주소·Bearer·401을 맡는다. 렌더마다 호출 객체를 새로 만들지 않는다.
const publications = createPublicationsApi(api.member);

/** 화면 밖 의존. 시험은 로그인 식별과 확인 창을 바꿔 끼운다. */
export type DetailDeps = { session: () => unknown; confirm: (message: string) => boolean };
const browserDeps: DetailDeps = { session: () => accessTokenStore.get(), confirm: (message) => window.confirm(message) };

export const STOP_CONFIRM_MESSAGE = "이 링크를 중지할까요? 중지하면 받은 사람이 이 링크로 열람할 수 없고, 중지한 링크는 되살릴 수 없습니다. 발행본 자체는 남습니다.";
export const DELETE_CONFIRM_MESSAGE = "이 발행본을 삭제할까요? 사본과 링크가 함께 지워지고 되살릴 수 없습니다. 원본 Catch·텍스트 자료는 그대로 남습니다.";

export type PublicationDetailState = {
  load: "loading" | "ready" | { error: string };
  detail: PublicationDetail | null;
  /** 중지 응답의 시각. 상세 응답에는 없다. */
  stoppedAt: string | null;
  stopState: "idle" | "requesting" | { error: string };
  deleteState: "idle" | "deleting" | "deleted" | { error: string };
};

/**
 * 발행본 상세 상태 전이(U4 W5-2~4, BR8.2·BR8.4, NFR5.3·NFR5.7).
 *
 * - 불러오기 응답은 아직 불러오는 중일 때만 반영한다. 늦게 온 응답은 버린다.
 * - 중지는 확인 뒤 `PUT .../stop`을 보내고 응답의 `state`·`stoppedAt`을 그대로 반영한다(만료면 `{EXPIRED, null}`). 되살리기는 없다.
 * - 삭제는 확인 뒤 `DELETE`를 보내고 204일 때만 `deleted`가 된다. 실패하면 "삭제되지 않았습니다"와 발행본을 그대로 둔다.
 * - 접수만으로 중지·삭제를 표시하지 않고, 로그인이 바뀐 뒤 도착한 응답은 반영하지 않는다.
 */
export function createPublicationDetailModel(client: PublicationsApi, publicationId: string, deps: DetailDeps = browserDeps) {
  const store = createViewStore<PublicationDetailState>({ load: "loading", detail: null, stoppedAt: null, stopState: "idle", deleteState: "idle" });
  let loadRequest: AbortController | null = null;
  let loadGeneration = 0;

  async function load() {
    loadRequest?.abort();
    const abort = new AbortController();
    loadRequest = abort;
    const generation = ++loadGeneration;
    const session = deps.session();
    store.set((prev) => ({ ...prev, load: "loading" }));
    const result = await client.get(publicationId, abort.signal);
    if (abort.signal.aborted || generation !== loadGeneration || deps.session() !== session || store.get().load !== "loading") return;
    if (result.kind === "failed") { store.set((prev) => ({ ...prev, load: { error: publicationOpenErrorText(result.failure) } })); return; }
    store.set((prev) => ({ ...prev, load: "ready", detail: result.value }));
  }

  const busy = () => { const s = store.get(); return s.stopState === "requesting" || s.deleteState === "deleting" || s.deleteState === "deleted"; };

  async function stop() {
    const s = store.get();
    if (s.load !== "ready" || s.detail === null || s.detail.state !== "ACTIVE" || busy()) return;
    if (!deps.confirm(STOP_CONFIRM_MESSAGE)) return;
    store.set((prev) => ({ ...prev, stopState: "requesting" }));
    const session = deps.session();
    const result = await client.stop(publicationId);
    if (deps.session() !== session) return;
    if (result.kind === "failed") { store.set((prev) => ({ ...prev, stopState: { error: stopErrorText(result.failure) } })); return; }
    store.set((prev) => ({
      ...prev, stopState: "idle", stoppedAt: result.value.stoppedAt,
      detail: prev.detail === null ? prev.detail : { ...prev.detail, state: result.value.state },
    }));
  }

  async function remove() {
    const s = store.get();
    if (s.load !== "ready" || s.detail === null || busy()) return;
    if (!deps.confirm(DELETE_CONFIRM_MESSAGE)) return;
    store.set((prev) => ({ ...prev, deleteState: "deleting" }));
    const session = deps.session();
    const result = await client.remove(publicationId);
    if (deps.session() !== session) return;
    if (result.kind === "failed") { store.set((prev) => ({ ...prev, deleteState: { error: deleteErrorText(result.failure) } })); return; }
    store.set((prev) => ({ ...prev, deleteState: "deleted" }));
  }

  return { store, load, stop, remove, retry: () => { void load(); }, dispose: () => loadRequest?.abort() };
}

/** 회원 가드((member) 레이아웃) 안의 발행본 상세 화면(U4 W5). */
export function PublicationDetailPage({ publicationId }: { publicationId: string }) {
  return <PublicationDetailScreen api={publications} publicationId={publicationId} />;
}

export function PublicationDetailScreen({ api: client, publicationId, deps }: { api: PublicationsApi; publicationId: string; deps?: DetailDeps }) {
  const router = useRouter();
  const [model] = useState(() => createPublicationDetailModel(client, publicationId, deps));
  const view = useSyncExternalStore(model.store.subscribe, model.store.get, model.store.get);
  useEffect(() => { void model.load(); return () => model.dispose(); }, [model]);
  // 삭제 성공(204) 뒤에만 목록으로 옮긴다.
  useEffect(() => { if (view.deleteState === "deleted") router.replace(routes.publications); }, [view.deleteState, router]);

  return (
    <main className={styles.page}>
      {view.load === "loading" ? <LoadingState>발행본을 불러오고 있습니다.</LoadingState>
        : typeof view.load === "object" ? (
          <div>
            <LookupFailedState title="발행본을 열지 못했습니다" onRetry={model.retry}>{view.load.error}</LookupFailedState>
            <Link className={styles.secondaryButton} href={routes.publications} data-testid="publication-detail-list-link">발행본 목록</Link>
          </div>
        ) : view.detail && (
          <PublicationDetailView detail={view.detail} stoppedAt={view.stoppedAt} stopState={view.stopState} deleteState={view.deleteState}
            onStop={() => { void model.stop(); }} onDelete={() => { void model.remove(); }} />
        )}
    </main>
  );
}

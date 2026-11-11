"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { CONSENT_RECORD_FAILED, type ConsentRunResult } from "../../components/ai-consent/ai-consent-flow.ts";
import type { ClientResult } from "../../lib/api-client.ts";
import { createViewStore } from "../../lib/view-store.ts";
import type { PdfFetch, PdfViewerDeps } from "../recipient/pdf-viewer-launcher.tsx";
import { PdfMaterialList } from "./pdf-material-list.tsx";
import {
  PDF_DELETE_CONFIRM, PDF_LIMITS, PDF_UPLOAD_FAILED_TEXT, pdfDeleteErrorText, pdfListErrorText, pdfUploadErrors, pdfUploadOutcome, uploadTitle,
  type ChosenFile, type PdfMaterialItem, type PdfMaterialsApi,
} from "./pdf-materials-api.ts";
import { PdfUploadForm, type PdfUploadStatus } from "./pdf-upload-form.tsx";
import styles from "./materials.module.css";

/** 동의 창 연결(C-04). 403 `AI_CONSENT_REQUIRED`면 창을 열고 [동의] 뒤 같은 요청을 한 번 다시 보낸다(`useAiConsent().run`). */
export type PdfConsentRunner = (request: () => Promise<ClientResult>) => Promise<ConsentRunResult>;
/** 동의 창 없이 요청만 보낸다(시험·동의 창을 붙이지 않은 자리). */
export const passthroughPdfConsent: PdfConsentRunner = async (request) => ({ kind: "result", result: await request(), retried: false });

/** 화면 밖 의존. 시험은 로그인 식별과 확인 창을 바꿔 끼운다. */
export type PdfTabDeps = { session: () => unknown; confirm: (message: string) => boolean };

export type PdfListState = { state: "loading" | "ready" | "error"; items: PdfMaterialItem[]; nextCursor: string | null; errorText?: string };
export type PdfTabState = {
  list: PdfListState;
  moreState: "idle" | "loading" | "error";
  upload: PdfUploadStatus;
  deletingId: string | null;
  deleteError: { pdfMaterialId: string; text: string } | null;
};

/**
 * PDF 탭 상태 전이(U8 W1, 계획 10.1).
 *
 * - 목록은 20개씩 읽고 [더 보기]로 잇는다. 조회 실패는 0건이 아니라 실패로 보인다. 상태 갱신은 [새로고침]뿐이다(폴링 없음).
 * - 올리기는 보내기 전 검사(파일 1개·PDF·20 MB·제목 100자)를 지난 뒤에만 요청한다. 403 `AI_CONSENT_REQUIRED`면 동의 창을 열고
 *   동의가 기록되면 같은 요청을 한 번만 다시 보낸다. 201일 때만 목록 맨 위에 "글 추출 중"으로 더한다.
 * - 삭제는 확인 뒤 204일 때만 목록에서 뺀다. 실패하면 "삭제되지 않았습니다"와 이유를 그 줄에 보인다.
 * - 로그인이 바뀐 뒤 도착한 응답은 반영하지 않는다.
 */
export function createPdfTabModel(client: PdfMaterialsApi, consent: PdfConsentRunner, deps: PdfTabDeps) {
  const store = createViewStore<PdfTabState>({
    list: { state: "loading", items: [], nextCursor: null }, moreState: "idle", upload: { kind: "idle" }, deletingId: null, deleteError: null,
  });
  let listRequest: AbortController | null = null;
  let listGeneration = 0;

  async function load() {
    listRequest?.abort();
    const abort = new AbortController();
    listRequest = abort;
    ++listGeneration;
    const session = deps.session();
    store.set((prev) => ({ ...prev, list: { state: "loading", items: [], nextCursor: null }, moreState: "idle", deleteError: null }));
    const result = await client.list(null, abort.signal);
    if (listRequest === abort) listRequest = null;
    if (abort.signal.aborted || deps.session() !== session) return;
    store.set((prev) => ({
      ...prev,
      list: result.kind === "failed"
        ? { state: "error", items: [], nextCursor: null, errorText: pdfListErrorText(result.failure) }
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

  const failed = (lines: string[]) => store.set((prev) => ({ ...prev, upload: { kind: "failed", lines } }));

  /** 올리기. 올라가면 true(화면이 입력을 비운다). 검사 거부·실패·동의 닫음은 false이고 고른 값은 화면에 남는다. */
  async function upload(files: readonly (Blob & ChosenFile)[], title: string): Promise<boolean> {
    if (store.get().upload.kind === "uploading") return false;
    const errors = pdfUploadErrors(files, title);
    if (errors.length > 0) { failed([PDF_UPLOAD_FAILED_TEXT, ...errors]); return false; }
    const [file] = files;
    const session = deps.session();
    store.set((prev) => ({ ...prev, upload: { kind: "uploading" } }));
    const finalTitle = uploadTitle(title, file.name);
    let outcome: ConsentRunResult;
    try {
      outcome = await consent(() => client.uploadRaw(file, file.name, finalTitle));
    } catch {
      outcome = { kind: "result", result: { kind: "lookup-failed", status: null, code: "LOOKUP_FAILED" }, retried: false };
    }
    if (deps.session() !== session) return false;
    if (outcome.kind === "declined") { failed(["올리지 않았습니다", "PDF를 올리려면 외부 AI 처리 동의가 필요합니다."]); return false; }
    if (outcome.kind === "consent-failed") { failed([PDF_UPLOAD_FAILED_TEXT, CONSENT_RECORD_FAILED]); return false; }
    const result = pdfUploadOutcome(outcome.result);
    if (result.kind === "failed") { failed(result.lines); return false; }
    store.set((prev) => ({
      ...prev, upload: { kind: "done" },
      list: prev.list.state !== "ready" ? prev.list
        : { ...prev.list, items: [result.value, ...prev.list.items.filter((item) => item.pdfMaterialId !== result.value.pdfMaterialId)] },
    }));
    // 목록을 아직 읽는 중이었다면 올리기 전에 읽은 응답이 새 자료를 덮지 않게 다시 읽는다.
    if (listRequest && !listRequest.signal.aborted) void load();
    return true;
  }

  async function remove(pdfMaterialId: string) {
    if (store.get().deletingId !== null) return;
    if (!deps.confirm(PDF_DELETE_CONFIRM)) return;
    const session = deps.session();
    store.set((prev) => ({ ...prev, deletingId: pdfMaterialId, deleteError: null }));
    const result = await client.remove(pdfMaterialId);
    if (deps.session() !== session) return;
    if (result.kind === "failed") {
      store.set((prev) => ({ ...prev, deletingId: null, deleteError: { pdfMaterialId, text: pdfDeleteErrorText(result.failure) } }));
      return;
    }
    store.set((prev) => ({
      ...prev, deletingId: null,
      list: { ...prev.list, items: prev.list.items.filter((item) => item.pdfMaterialId !== pdfMaterialId) },
    }));
  }

  return { store, load, loadMore, upload, remove, dispose: () => listRequest?.abort() };
}

export type PdfTabModel = ReturnType<typeof createPdfTabModel>;

/** 이미 20벌이면 더 올릴 수 없다(BR1.2). 목록을 다 읽지 못했으면 서버 판정에 맡긴다. */
export const pdfLimitReached = (list: PdfListState) => list.state === "ready" && list.items.length >= PDF_LIMITS.perMember;

/**
 * 자료 화면의 PDF 탭(U8 화면 컴포넌트 `PdfMaterialsTab`). 올리기·목록·추출 상태·원본 보기·삭제를 한 자리에 둔다.
 * 동의 창(`dialog`)은 부르는 화면이 `useAiConsent()`로 만들어 넘긴다.
 */
export function PdfMaterialsTab({ api: client, originalOf, consent, deps, viewerDeps }: {
  api: PdfMaterialsApi;
  originalOf: (pdfMaterialId: string) => PdfFetch;
  consent: PdfConsentRunner;
  deps: PdfTabDeps;
  viewerDeps?: PdfViewerDeps;
}) {
  const [model] = useState(() => createPdfTabModel(client, consent, deps));
  const view = useSyncExternalStore(model.store.subscribe, model.store.get, model.store.get);
  useEffect(() => { void model.load(); return () => model.dispose(); }, [model]);

  return (
    <div className={styles.pdfLayout} data-testid="pdf-materials-tab">
      <PdfMaterialList state={view.list.state} items={view.list.items} errorText={view.list.errorText}
        hasMore={view.list.nextCursor !== null} moreState={view.moreState} deletingId={view.deletingId} deleteError={view.deleteError}
        onRefresh={() => { void model.load(); }} onLoadMore={() => { void model.loadMore(); }}
        onDelete={(id) => { void model.remove(id); }} originalOf={originalOf} viewerDeps={viewerDeps} />
      <PdfUploadForm status={view.upload} limitReached={pdfLimitReached(view.list)}
        onSubmit={(files, title) => model.upload(files, title)} />
    </div>
  );
}

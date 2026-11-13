"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createViewStore } from "../../lib/view-store.ts";
import type { LinkAccessCode } from "./recipient-slots.ts";
import styles from "./pdf-viewer.module.css";

/**
 * PDF 열람 공용 도우미(U8 기능 명세 W4, BR6.3, 보안 설계 §2 「Blob URL의 생성·해제 규칙」, 계획 10.2).
 * 받은 사람 사본·작성자 사본·작성자 원본이 같은 도우미를 쓰고 `fetchPdf`만 다르게 넘긴다.
 *
 * - Blob URL은 응답 200과 본문 수신 성공 뒤에만 만든다. 본문을 받다 끊기면 만들지 않는다.
 * - 화면 안 뷰어가 열려 있는 동안의 쪽 이동은 같은 URL을 다시 쓴다(요청 없음). 처음 열기·닫았다가 다시 열기·[새 탭에서 열기]는 다시 요청한다.
 * - [새 탭에서 열기]: 클릭 즉시 빈 창을 열고 → 요청은 한 번만 → 성공하면 그 창에 넣는다. 팝업이 막혔으면 같은 요청의 Blob을 화면 안 뷰어에 보이고 안내한다.
 * - 401 `LINK_PASSWORD_REQUIRED`·404 `LINK_UNAVAILABLE`은 접근 상실이라 `onAccessLost(code)`로 넘긴다. 500·전송 중단·네트워크 오류는
 *   일반 열람 실패로 안내하고 `onAccessLost`를 부르지 않는다(grant 유지).
 * - URL은 만든 화면이 보관하고 해제한다: 뷰어를 닫을 때, 화면을 떠날 때, 접근 상실 때. 새 탭용 URL도 목록으로 들고 있다가 화면을 떠날 때와
 *   접근 상실 때 해제한다.
 * - iframe에는 sandbox를 두지 않는다(보안 설계 §6: 브라우저 내장 PDF 뷰어가 sandbox 아래에서 동작하지 않는 경우가 있음).
 */

export type PdfFetch = (signal?: AbortSignal) => Promise<Response>;

export const PDF_VIEW_FAILED_TEXT = "PDF를 불러오지 못했습니다. 다시 시도해 주세요";
export const PDF_POPUP_BLOCKED_TEXT = "브라우저가 새 탭을 막았습니다. 화면 안에서 열었습니다. 새 탭으로 보려면 이 사이트의 팝업을 허용해 주세요";
export const PDF_NOT_FOUND_TEXT = "이 PDF를 열 수 없습니다. 지워졌거나 열람할 수 없는 자료입니다.";
export const PDF_LOGIN_EXPIRED_TEXT = "로그인이 만료되었습니다. 다시 로그인한 뒤 열어 주세요.";

export type PdfLoad =
  | { kind: "ok"; blob: Blob }
  /** 받은 사람 링크 접근 상실(401·404). */
  | { kind: "access-lost"; code: LinkAccessCode }
  /** 그 밖의 실패. 화면에 보일 안내 문장을 담는다. */
  | { kind: "failed"; message: string };

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** 오류 응답의 코드. 본문이 JSON이 아니거나 모양이 다르면 null이다. */
async function errorCode(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    return record(body) && typeof body.code === "string" ? body.code : null;
  } catch {
    return null;
  }
}

/**
 * 요청 한 번의 결과를 정한다. 200이어도 본문을 끝까지 받은 뒤에만 성공이다(전송 도중 끊기면 실패, Blob 없음).
 * 응답 종류가 `application/pdf`가 아니면 PDF로 열지 않는다.
 */
export async function loadPdf(fetchPdf: PdfFetch, signal?: AbortSignal): Promise<PdfLoad> {
  let response: Response;
  try {
    response = await fetchPdf(signal);
  } catch {
    return { kind: "failed", message: PDF_VIEW_FAILED_TEXT };
  }
  if (response.status === 200) {
    if (!(response.headers.get("content-type") ?? "").toLowerCase().startsWith("application/pdf")) {
      return { kind: "failed", message: PDF_VIEW_FAILED_TEXT };
    }
    try {
      const bytes = await response.arrayBuffer();
      return { kind: "ok", blob: new Blob([bytes], { type: "application/pdf" }) };
    } catch {
      return { kind: "failed", message: PDF_VIEW_FAILED_TEXT };
    }
  }
  if (response.status === 401 || response.status === 404) {
    const code = await errorCode(response);
    if (response.status === 401 && code === "LINK_PASSWORD_REQUIRED") return { kind: "access-lost", code };
    if (response.status === 404 && code === "LINK_UNAVAILABLE") return { kind: "access-lost", code };
    // 작성자 경로: 본인 자료가 아니거나 지워짐(404), 회원 인증 만료(401). 링크 접근 상실이 아니다.
    return { kind: "failed", message: response.status === 404 ? PDF_NOT_FOUND_TEXT : PDF_LOGIN_EXPIRED_TEXT };
  }
  return { kind: "failed", message: PDF_VIEW_FAILED_TEXT };
}

/** 새 탭으로 연 창. 브라우저 `Window`의 필요한 칸만 본다. */
export type OpenedWindow = { closed: boolean; opener: unknown; location: { replace(url: string): void }; close(): void };

/** 화면 밖 의존. 시험은 Blob URL 생성·해제와 창 열기를 바꿔 끼운다. */
export type PdfViewerDeps = {
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
  /** 빈 창을 연다. 팝업이 막히면 null이다. */
  openWindow: () => OpenedWindow | null;
};

export const browserPdfViewerDeps: PdfViewerDeps = {
  createObjectURL: (blob) => URL.createObjectURL(blob),
  revokeObjectURL: (url) => URL.revokeObjectURL(url),
  openWindow: () => window.open("", "_blank"),
};

export type PdfViewerState = {
  /** 화면 안 뷰어. 열려 있으면 Blob URL과 보이는 쪽이 있다. */
  inline: { url: string; page: number } | null;
  loading: "inline" | "new-tab" | null;
  /** 일반 열람 실패 안내(접근 상실 아님). */
  error: string | null;
  /** 팝업 차단 안내. */
  notice: string | null;
};

const withPage = (url: string, page: number) => `${url}#page=${page}`;
const validPage = (page: number | undefined) => typeof page === "number" && Number.isInteger(page) && page >= 1 ? page : 1;

/**
 * 뷰어 상태 전이. `fetchPdf`는 호출마다 서버 판정을 다시 받는 요청이고, `onAccessLost`는 받은 사람 화면에서만 넘긴다.
 * 요청이 진행 중이면 새 요청을 시작하지 않는다(단추는 화면에서 막는다). 해제된 뒤 도착한 응답으로는 URL을 만들지 않는다.
 */
export function createPdfViewerModel(fetchPdf: PdfFetch, options: {
  onAccessLost?: (code: LinkAccessCode) => void;
  deps?: PdfViewerDeps;
} = {}) {
  const deps = options.deps ?? browserPdfViewerDeps;
  const store = createViewStore<PdfViewerState>({ inline: null, loading: null, error: null, notice: null });
  /** 새 탭에 넣은 URL. 그 탭을 닫아도 저절로 해제되지 않으므로 이 화면이 들고 있다가 해제한다. */
  const newTabUrls: string[] = [];
  let request: AbortController | null = null;
  let disposed = false;

  function revokeInline() {
    const { inline } = store.get();
    if (inline !== null) deps.revokeObjectURL(inline.url);
  }

  function revokeAll() {
    revokeInline();
    for (const url of newTabUrls.splice(0)) deps.revokeObjectURL(url);
  }

  /** 접근 상실: 이 화면이 만든 URL을 모두 해제하고 화면에 알린다. */
  function accessLost(code: LinkAccessCode) {
    revokeAll();
    store.set(() => ({ inline: null, loading: null, error: null, notice: null }));
    options.onAccessLost?.(code);
  }

  /** 요청 한 번. 해제됐거나 취소된 요청의 응답은 null이다. */
  async function requestOnce(kind: "inline" | "new-tab"): Promise<PdfLoad | null> {
    const abort = new AbortController();
    request = abort;
    store.set((prev) => ({ ...prev, loading: kind, error: null, notice: null }));
    const loaded = await loadPdf(fetchPdf, abort.signal);
    if (request === abort) request = null;
    if (disposed || abort.signal.aborted) return null;
    return loaded;
  }

  /**
   * 화면 안에서 연다. 이미 열려 있으면 요청 없이 쪽만 바꾼다(같은 Blob URL 재사용).
   * 닫혀 있으면 요청한다(처음 열기·다시 열기 모두 서버 판정을 다시 받는다).
   */
  async function openInline(page?: number): Promise<void> {
    const target = validPage(page);
    const current = store.get();
    if (current.loading !== null) return;
    if (current.inline !== null) {
      store.set((prev) => prev.inline === null ? prev : { ...prev, inline: { ...prev.inline, page: target } });
      return;
    }
    const loaded = await requestOnce("inline");
    if (loaded === null) return;
    if (loaded.kind === "access-lost") { accessLost(loaded.code); return; }
    if (loaded.kind === "failed") { store.set((prev) => ({ ...prev, loading: null, error: loaded.message })); return; }
    const url = deps.createObjectURL(loaded.blob);
    store.set((prev) => ({ ...prev, loading: null, inline: { url, page: target } }));
  }

  /**
   * 새 탭에서 연다. 빈 창을 먼저 열고(팝업 차단 회피) 요청은 한 번만 보낸다. 팝업이 막혔으면 같은 요청의 Blob을 화면 안 뷰어에 보인다.
   * 실패하면 열어 둔 빈 창을 닫는다.
   */
  async function openNewTab(page?: number): Promise<void> {
    const target = validPage(page);
    if (store.get().loading !== null) return;
    let opened: OpenedWindow | null = null;
    try {
      opened = deps.openWindow();
    } catch {
      opened = null;
    }
    const closeOpened = () => { try { opened?.close(); } catch { /* 사용자가 먼저 닫았을 수 있다 */ } };
    const loaded = await requestOnce("new-tab");
    if (loaded === null) { closeOpened(); return; }
    if (loaded.kind === "access-lost") { closeOpened(); accessLost(loaded.code); return; }
    if (loaded.kind === "failed") { closeOpened(); store.set((prev) => ({ ...prev, loading: null, error: loaded.message })); return; }
    const url = deps.createObjectURL(loaded.blob);
    if (opened !== null && !opened.closed) {
      newTabUrls.push(url);
      try {
        // 새 탭이 이 화면을 되짚어 건드리지 못하게 끊은 뒤 주소를 넣는다.
        opened.opener = null;
        opened.location.replace(withPage(url, target));
        store.set((prev) => ({ ...prev, loading: null }));
        return;
      } catch {
        // 창에 넣지 못했으면 아래에서 화면 안 뷰어로 보인다. 이 URL은 화면 안 뷰어의 것으로 옮긴다.
        newTabUrls.splice(newTabUrls.indexOf(url), 1);
      }
    }
    // 팝업 차단(또는 그사이 닫힌 창): 두 번째 요청 없이 방금 받은 Blob을 화면 안 뷰어에 보인다. 열려 있던 뷰어의 URL은 해제하고 바꾼다.
    revokeInline();
    store.set((prev) => ({ ...prev, loading: null, inline: { url, page: target }, notice: PDF_POPUP_BLOCKED_TEXT }));
  }

  /** 화면 안 뷰어를 닫고 그 URL을 해제한다. 다시 열면 다시 요청한다. */
  function close() {
    revokeInline();
    store.set((prev) => ({ ...prev, inline: null, notice: null }));
  }

  /** 화면을 떠날 때: 진행 중인 요청을 끊고 이 화면이 만든 URL(화면 안·새 탭용)을 모두 해제한다. 그 뒤 도착한 응답은 버린다. */
  function dispose() {
    disposed = true;
    request?.abort();
    revokeAll();
    store.set(() => ({ inline: null, loading: null, error: null, notice: null }));
  }

  /**
   * 화면에 (다시) 붙을 때 부른다. React 개발 모드(StrictMode)는 효과를 한 번 정리했다가 같은 모델로 다시 붙이므로,
   * 정리 뒤에도 다시 붙으면 요청을 받을 수 있어야 한다. 정리 전에 보낸 요청의 응답은 이미 끊겨 반영되지 않는다.
   */
  function activate() {
    disposed = false;
  }

  return { store, openInline, openNewTab, close, dispose, activate, inlineSrc: (state: PdfViewerState) => state.inline === null ? null : withPage(state.inline.url, state.inline.page) };
}

export type PdfViewerModel = ReturnType<typeof createPdfViewerModel>;

/** 화면 수명에 뷰어 모델을 묶는다. 화면을 떠나면 URL을 해제한다. `fetchPdf`·`onAccessLost`는 처음 값을 쓴다. */
export function usePdfViewer(fetchPdf: PdfFetch, onAccessLost?: (code: LinkAccessCode) => void, deps?: PdfViewerDeps) {
  const [model] = useState(() => createPdfViewerModel(fetchPdf, { onAccessLost, deps }));
  const state = useSyncExternalStore(model.store.subscribe, model.store.get, model.store.get);
  useEffect(() => { model.activate(); return () => model.dispose(); }, [model]);
  return { model, state };
}

/** 뷰어 그리기: 단추 두 개, 진행·실패·팝업 안내, 화면 안 뷰어. 상태는 모델이 넘긴다. */
export function PdfViewerPanel({ model, state, title, testId = "pdf-viewer", openLabel = "PDF 보기" }: {
  model: Pick<PdfViewerModel, "openInline" | "openNewTab" | "close" | "inlineSrc">;
  state: PdfViewerState;
  /** iframe 접근성 이름. 화면에 글자로만 쓴다. */
  title: string;
  testId?: string;
  openLabel?: string;
}) {
  const busy = state.loading !== null;
  const src = model.inlineSrc(state);
  return (
    <div className={styles.viewer} data-testid={testId}>
      <div className={styles.actions}>
        {state.inline === null && (
          <button type="button" className={styles.button} data-testid={`${testId}-open`} disabled={busy}
            onClick={() => { void model.openInline(); }}>{state.loading === "inline" ? "불러오는 중…" : openLabel}</button>
        )}
        <button type="button" className={styles.button} data-testid={`${testId}-new-tab`} disabled={busy}
          onClick={() => { void model.openNewTab(state.inline?.page); }}>
          {state.loading === "new-tab" ? "불러오는 중…" : "새 탭에서 열기"}<span className="visually-hidden"> (새 탭)</span>
        </button>
        {state.inline !== null && (
          <button type="button" className={styles.button} data-testid={`${testId}-close`} onClick={model.close}>뷰어 닫기</button>
        )}
      </div>
      {busy && <p role="status" className={styles.status}>PDF를 불러오고 있습니다.</p>}
      {state.error !== null && <p role="alert" className={styles.error} data-testid={`${testId}-error`}>{state.error}</p>}
      {state.notice !== null && <p role="status" className={styles.status} data-testid={`${testId}-notice`}>{state.notice}</p>}
      {state.inline !== null && src !== null && (
        // 쪽이 바뀌면 같은 Blob URL에 #page만 바꿔 다시 그린다(요청 없음). sandbox는 두지 않는다.
        <iframe key={state.inline.page} className={styles.frame} src={src} title={`${title} ${state.inline.page}쪽`}
          data-testid={`${testId}-frame`} data-page={state.inline.page} />
      )}
    </div>
  );
}

/** 단추와 뷰어를 한 번에 두는 간단한 형태(작성자 PDF 목록의 [원본 보기]). */
export function PdfViewerLauncher({ fetchPdf, onAccessLost, title, testId, openLabel, deps }: {
  fetchPdf: PdfFetch;
  onAccessLost?: (code: LinkAccessCode) => void;
  title: string;
  testId?: string;
  openLabel?: string;
  deps?: PdfViewerDeps;
}) {
  const { model, state } = usePdfViewer(fetchPdf, onAccessLost, deps);
  return <PdfViewerPanel model={model} state={state} title={title} testId={testId} openLabel={openLabel} />;
}

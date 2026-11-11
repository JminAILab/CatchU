"use client";

import { Fragment, type ReactNode } from "react";
import { PdfViewerPanel, usePdfViewer, type PdfFetch, type PdfViewerDeps } from "../recipient/pdf-viewer-launcher.tsx";
import type { LinkAccessCode } from "../recipient/recipient-slots.ts";
import type { PublishedPdfPage } from "./publications-api.ts";
import styles from "../recipient/pdf-viewer.module.css";

/**
 * 발행본의 PDF 항목(U8 기능 명세 W4, BR6.4, 계획 10.3). 받은 사람 화면과 작성자 발행본 화면이 같은 컴포넌트를 쓰고,
 * 사본을 받는 요청(`source.fetchPdf`)만 다르다(받은 사람: 링크 토큰 + `X-Link-Grant`, 작성자: 회원 토큰).
 *
 * - 쪽 수와 쪽 목록을 보인다. 쪽마다 "n쪽", 읽을 수 없는 쪽은 "읽을 수 없음" 표지, 읽을 수 있는 쪽은 사본의 글을 텍스트로만 그린다
 *   (추출한 글은 신뢰할 수 없는 자료라 마크업으로 해석하지 않는다, NFR1.8).
 * - 근거 위치(`pages[n]`, `[charStart, charEnd)`)가 오면 그 쪽 글의 범위만 `<mark>`로 감싼다.
 * - [PDF 보기]·[새 탭에서 열기]·[원본 n쪽 열기]는 공용 PDF 뷰어를 쓴다. 뷰어가 열려 있으면 쪽만 옮기고, 닫혀 있으면 다시 요청한다.
 */

/** 그 항목의 사본을 받는 방법. `onAccessLost`는 받은 사람 화면에서만 넘긴다(401·404면 화면을 바꾸고 grant를 지운다). */
export type PdfCopySource = { fetchPdf: PdfFetch; onAccessLost?: (code: LinkAccessCode) => void; viewerDeps?: PdfViewerDeps };

/** 강조 범위. `fieldPath`는 C-07 사본 안 경로(`pages[n]`), 범위는 그 쪽 글의 UTF-16 코드 단위다. */
export type PdfHighlight = { fieldPath: string; charStart: number; charEnd: number } | null;

export const UNREADABLE_PAGE_TEXT = "읽을 수 없음";
export const pdfPagePath = (pageNumber: number) => `pages[${pageNumber}]`;

/** 쪽 글. 강조 범위가 이 쪽을 가리키고 글 안에 있을 때만 그 부분을 `<mark>`로 감싼다. 글은 React 텍스트 노드다. */
function PageText({ text, highlight }: { text: string; highlight: PdfHighlight }): ReactNode {
  if (highlight === null) return <>{text}</>;
  const start = Math.max(highlight.charStart, 0);
  const end = Math.min(highlight.charEnd, text.length);
  if (start >= end) return <>{text}</>;
  return (
    <Fragment>
      {text.slice(0, start)}
      {/* 받은 사람 화면이 근거 위치로 옮길 때 이 표지를 찾는다(`snapshot-view.tsx`와 같은 data-testid). */}
      <mark className={styles.highlight} data-testid="snapshot-highlight">{text.slice(start, end)}</mark>
      {text.slice(end)}
    </Fragment>
  );
}

export function PublishedPdfItem({ title, pageCount, pages, highlight = null, source }: {
  /** iframe 접근성 이름에만 쓴다. 항목 제목은 부르는 쪽(`PublishedSnapshotView`)이 이미 보인다. */
  title: string;
  pageCount: number | null;
  pages: readonly PublishedPdfPage[];
  highlight?: PdfHighlight;
  /** 없으면 쪽 글만 보이고 PDF 열기 단추는 두지 않는다. */
  source?: PdfCopySource;
}) {
  const ordered = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
  const count = pageCount ?? ordered.length;
  return (
    <div data-testid="snapshot-pdf">
      <p className={styles.meta} data-testid="snapshot-pdf-page-count">{count}쪽</p>
      {source
        ? <PdfPagesWithViewer title={title} pages={ordered} highlight={highlight} source={source} />
        : <PdfPages pages={ordered} highlight={highlight} onOpenPage={null} />}
    </div>
  );
}

function PdfPagesWithViewer({ title, pages, highlight, source }: {
  title: string; pages: readonly PublishedPdfPage[]; highlight: PdfHighlight; source: PdfCopySource;
}) {
  const { model, state } = usePdfViewer(source.fetchPdf, source.onAccessLost, source.viewerDeps);
  return (
    <>
      <PdfViewerPanel model={model} state={state} title={title} testId="snapshot-pdf-viewer" />
      <PdfPages pages={pages} highlight={highlight} onOpenPage={state.loading !== null ? "busy" : (page) => { void model.openInline(page); }} />
    </>
  );
}

function PdfPages({ pages, highlight, onOpenPage }: {
  pages: readonly PublishedPdfPage[];
  highlight: PdfHighlight;
  /** null이면 단추 없음, "busy"면 요청 중이라 막는다. */
  onOpenPage: ((pageNumber: number) => void) | "busy" | null;
}) {
  if (pages.length === 0) return <p className={styles.meta}>쪽 글이 없습니다.</p>;
  return (
    <ol className={styles.pages} data-testid="snapshot-pdf-pages">
      {pages.map((page) => {
        const own = highlight !== null && highlight.fieldPath === pdfPagePath(page.pageNumber) ? highlight : null;
        return (
          <li key={page.pageNumber} className={styles.page} data-testid="snapshot-pdf-page" data-page={page.pageNumber}
            data-readable={page.readable}>
            <div className={styles.pageHead}>
              <h4 className={styles.pageNumber}>{page.pageNumber}쪽</h4>
              {onOpenPage !== null && (
                <button type="button" className={styles.button} data-testid="snapshot-pdf-open-page" disabled={onOpenPage === "busy"}
                  onClick={() => { if (onOpenPage !== "busy") onOpenPage(page.pageNumber); }}>원본 {page.pageNumber}쪽 열기</button>
              )}
            </div>
            {page.readable
              ? <p className={styles.pageText} data-testid="snapshot-pdf-page-text"><PageText text={page.text} highlight={own} /></p>
              : <p className={styles.unreadable} data-testid="snapshot-pdf-page-unreadable">{UNREADABLE_PAGE_TEXT}</p>}
          </li>
        );
      })}
    </ol>
  );
}

"use client";

import { PdfViewerLauncher, type PdfFetch, type PdfViewerDeps } from "../recipient/pdf-viewer-launcher.tsx";
import { extractionBadge, fileSizeText, type PdfMaterialItem } from "./pdf-materials-api.ts";
import styles from "./materials.module.css";

export type PdfMaterialListProps = {
  state: "loading" | "ready" | "error";
  items: readonly PdfMaterialItem[];
  errorText?: string;
  hasMore: boolean;
  moreState: "idle" | "loading" | "error";
  /** 삭제 요청이 진행 중인 자료. */
  deletingId: string | null;
  /** 마지막 삭제 실패. 그 자료의 줄에 보인다. */
  deleteError: { pdfMaterialId: string; text: string } | null;
  onRefresh: () => void;
  onLoadMore: () => void;
  onDelete: (pdfMaterialId: string) => void;
  /** 그 자료의 원본을 받는 요청(작성자 원본 열람). 호출마다 서버에 다시 요청한다. */
  originalOf: (pdfMaterialId: string) => PdfFetch;
  viewerDeps?: PdfViewerDeps;
};

const BADGE_CLASS = { pending: styles.badgePending, done: styles.badgeDone, failed: styles.badgeFailed } as const;

/**
 * 내 PDF 목록(U8 W1, 계획 10.1). 줄마다 제목·크기·추출 상태 배지(글 추출 중 / 완료 n쪽 / 실패 + 사유별 안내),
 * [원본 보기](공용 PDF 뷰어), [삭제]가 있다. 상태는 자동으로 다시 읽지 않고 [새로고침]으로 갱신한다(폴링 없음).
 * 조회 실패를 0건으로 보이지 않는다. 제목은 React 텍스트로만 그린다.
 */
export function PdfMaterialList(props: PdfMaterialListProps) {
  return (
    <section className={styles.list} aria-labelledby="pdf-list-title" data-testid="pdf-list">
      <div className={styles.listHeading}>
        <h2 id="pdf-list-title">내 PDF 자료</h2>
        <button type="button" className={styles.secondaryButton} data-testid="pdf-list-refresh"
          disabled={props.state === "loading"} onClick={props.onRefresh}>새로고침</button>
      </div>
      {props.state === "loading" ? <p role="status">PDF 목록을 불러오고 있습니다.</p>
        : props.state === "error" ? <div role="alert" className={styles.error}>
          <p>{props.errorText ?? "PDF 목록을 불러오지 못했습니다."}</p>
        </div>
        : props.items.length === 0 ? <p data-testid="pdf-list-empty">아직 올린 PDF가 없습니다.</p>
        : <ul className={styles.items}>
          {props.items.map((item) => {
            const badge = extractionBadge(item);
            const deleting = props.deletingId === item.pdfMaterialId;
            return (
              <li key={item.pdfMaterialId} className={styles.pdfRow} data-testid="pdf-row" data-state={item.extractionState}>
                <div className={styles.pdfRowHead}>
                  <span className={styles.itemTitle}>{item.title}</span>
                  <span className={BADGE_CLASS[badge.tone]} data-testid="pdf-row-badge">{badge.label}</span>
                </div>
                <p className={styles.small}>{fileSizeText(item.fileSizeBytes)}</p>
                {badge.detail !== null && <p className={badge.tone === "failed" ? styles.pdfFailure : styles.small}
                  data-testid="pdf-row-detail">{badge.detail}</p>}
                {props.deleteError?.pdfMaterialId === item.pdfMaterialId && <p role="alert" className={styles.error}
                  data-testid="pdf-row-delete-error">{props.deleteError.text}</p>}
                <PdfViewerLauncher fetchPdf={props.originalOf(item.pdfMaterialId)} title={item.title} openLabel="원본 보기"
                  testId="pdf-original" deps={props.viewerDeps} />
                <div className={styles.actions}>
                  <button type="button" className={styles.dangerButton} data-testid="pdf-row-delete" disabled={props.deletingId !== null}
                    onClick={() => props.onDelete(item.pdfMaterialId)}>{deleting ? "삭제 중…" : "삭제"}</button>
                </div>
              </li>
            );
          })}
        </ul>}
      {props.state === "ready" && props.hasMore && <div className={styles.more}>
        {props.moreState === "error" && <p role="alert">다음 목록을 불러오지 못했습니다.</p>}
        <button type="button" className={styles.secondaryButton} data-testid="pdf-list-more"
          disabled={props.moreState === "loading"} onClick={props.onLoadMore}>
          {props.moreState === "loading" ? "불러오는 중…" : props.moreState === "error" ? "다음 목록 다시 불러오기" : "더 보기"}
        </button>
      </div>}
    </section>
  );
}

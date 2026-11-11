"use client";

import Link from "next/link";
import { BaseSummaryPanel } from "@/features/rag-answer/base-summary-panel";
import type { EvidenceLocation } from "@/features/recipient/recipient-slots";
import { routes } from "@/lib/routes";
import { CopyUrlButton, OpenLinkAnchor } from "./publication-link-actions";
import { FIXED_COPY_NOTICE, PUBLICATION_STATE_LABELS, SOURCE_PRIVATE_NOTICE, formatKst, passwordText } from "./publication-format";
import type { PublicationDetail, PublicationState } from "./publications-api";
import type { PdfCopySource } from "./published-pdf-item";
import { PublishedSnapshotView, type SnapshotHighlight } from "./snapshot-view";
import styles from "./publications.module.css";

export type PublicationDetailViewProps = {
  detail: PublicationDetail;
  /** 중지 응답으로 알게 된 시각. 상세 응답에는 없다. */
  stoppedAt: string | null;
  stopState: "idle" | "requesting" | { error: string };
  deleteState: "idle" | "deleting" | "deleted" | { error: string };
  onStop: () => void;
  onDelete: () => void;
  /** `showEvidence`로 대조한 강조 범위(C-11 evidence-highlight). */
  highlight: SnapshotHighlight | null;
  /** 요약 패널의 근거 단추가 부른다. 사본을 그 위치로 옮기고 범위를 강조한다. */
  showEvidence: (location: EvidenceLocation) => void;
  /** PDF 항목의 작성자 사본 요청(U8 W4). 중지·만료 뒤에도 열린다. */
  pdfSource?: (publishedItemId: string) => PdfCopySource;
};

function stateText(state: PublicationState, stoppedAt: string | null): string {
  const label = PUBLICATION_STATE_LABELS[state];
  return state === "STOPPED" && stoppedAt !== null ? `${label} (${formatKst(stoppedAt)})` : label;
}

/**
 * 발행본 상세(U4 W5-2, BR7.2·BR7.3·BR8.1~BR8.4). 사본·상태·만료·링크 주소, 고정 안내, 비공개 전환 안내, 중지·삭제.
 * [URL 복사]는 늘, [링크 열기]는 `ACTIVE`에만 보인다(#416). 요약 패널 자리에는 U5 `BaseSummaryPanel` 작성자 모드(C-11 owner-summary)를 단다.
 */
export function PublicationDetailView(props: PublicationDetailViewProps) {
  const { detail, stoppedAt } = props;
  const busy = props.stopState === "requesting" || props.deleteState === "deleting" || props.deleteState === "deleted";
  const hasCatch = detail.snapshot.items.some((item) => item.itemKind === "CATCH");
  return (
    <article data-testid="publication-detail" data-state={detail.state}>
      <div className={styles.listHeading}>
        <h1>{detail.snapshot.title}</h1>
        <Link className={styles.secondaryButton} href={routes.publications} data-testid="publication-detail-list-link">발행본 목록</Link>
      </div>
      <section className={styles.panel} aria-labelledby="publication-link-title">
        <h2 id="publication-link-title">링크</h2>
        <dl className={styles.details}>
          <dt>링크 주소</dt><dd><span className={styles.url} data-testid="publication-detail-url">{detail.url}</span></dd>
          <dt>상태</dt><dd data-testid="publication-detail-state">{stateText(detail.state, stoppedAt)}</dd>
          <dt>발행 시각</dt><dd>{formatKst(detail.snapshot.publishedAt)}</dd>
          <dt>만료 시각</dt><dd data-testid="publication-detail-expiry">{formatKst(detail.snapshot.expiresAt)}</dd>
          <dt>비밀번호</dt><dd>{passwordText(detail.passwordProtected)}</dd>
        </dl>
        <div className={styles.rowActions}>
          <CopyUrlButton url={detail.url} disabled={props.deleteState === "deleted"} />
          <OpenLinkAnchor url={detail.url} state={detail.state} />
        </div>
        <p className={styles.notice} data-testid="publication-fixed-notice">{FIXED_COPY_NOTICE}</p>
        {hasCatch && <p className={styles.notice} data-testid="publication-private-notice">{SOURCE_PRIVATE_NOTICE}</p>}
        {detail.state !== "ACTIVE" && <p className={styles.small} data-testid="publication-detail-closed">
          {detail.state === "STOPPED" ? "중지한 링크는 되살릴 수 없습니다." : "만료된 링크는 연장할 수 없습니다."} 다시 보내려면 새로 발행하세요.
        </p>}
        {typeof props.stopState === "object" && <p role="alert" className={styles.error} data-testid="publication-stop-error">{props.stopState.error}</p>}
        {typeof props.deleteState === "object" && <p role="alert" className={styles.error} data-testid="publication-delete-error">{props.deleteState.error}</p>}
        {props.stopState === "requesting" && <p role="status">링크를 중지하고 있습니다.</p>}
        {props.deleteState === "deleting" && <p role="status">발행본을 삭제하고 있습니다.</p>}
        <div className={styles.actions}>
          {detail.state === "ACTIVE" && (
            <button type="button" className={styles.dangerButton} data-testid="publication-stop-button" disabled={busy} onClick={props.onStop}>
              {props.stopState === "requesting" ? "중지 중…" : "링크 중지"}
            </button>
          )}
          <button type="button" className={styles.dangerButton} data-testid="publication-delete-button" disabled={busy} onClick={props.onDelete}>
            {props.deleteState === "deleting" ? "삭제 중…" : "발행본 삭제"}
          </button>
        </div>
      </section>
      {/* 기본 요약 패널(U5 작성자 모드). 발행본마다 한 번 읽고, 근거 단추는 아래 사본으로 옮긴다. */}
      <div data-testid="publication-summary-slot">
        <BaseSummaryPanel key={detail.publicationId} publicationId={detail.publicationId} showEvidence={props.showEvidence} />
      </div>
      <PublishedSnapshotView snapshot={detail.snapshot} highlight={props.highlight} pdfSource={props.pdfSource} />
    </article>
  );
}

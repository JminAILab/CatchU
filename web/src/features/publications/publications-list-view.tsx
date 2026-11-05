"use client";

import Link from "next/link";
import { publicationDetailPath, routes } from "@/lib/routes";
import { CopyUrlButton, OpenLinkAnchor } from "./publication-link-actions";
import { PUBLICATION_STATE_LABELS, formatKst, passwordText } from "./publication-format";
import type { PublicationListItem } from "./publications-api";
import styles from "./publications.module.css";

export type PublicationsListViewProps = {
  state: "loading" | "ready" | "error";
  items: readonly PublicationListItem[];
  errorText?: string;
  hasMore: boolean;
  moreState: "idle" | "loading" | "error";
  onRetry: () => void;
  onLoadMore: () => void;
};

/**
 * 발행본 목록(U4 W5-1, BR8.1). 최신순으로 제목·상태·만료·링크 주소를 보이고 [URL 복사]는 늘, [링크 열기]는 `ACTIVE`에만 둔다(#416).
 * 조회 실패를 0건으로 보이지 않는다. 색인 상태·[검색 다시 준비]는 C-09 합의 전이라 없다.
 */
export function PublicationsListView(props: PublicationsListViewProps) {
  return (
    <section className={styles.panel} aria-labelledby="publications-list-title" data-testid="publications-list">
      <div className={styles.listHeading}>
        <h2 id="publications-list-title">내 발행본</h2>
        <Link className={styles.primaryButton} href={routes.publicationNew} data-testid="publications-new-link">새로 발행</Link>
      </div>
      {props.state === "loading" ? <p role="status">발행본 목록을 불러오고 있습니다.</p>
        : props.state === "error" ? <div role="alert" className={styles.error}>
          <p>{props.errorText ?? "발행본 목록을 불러오지 못했습니다."}</p>
          <button type="button" className={styles.secondaryButton} data-testid="publications-list-retry" onClick={props.onRetry}>다시 불러오기</button>
        </div>
        : props.items.length === 0 ? <p data-testid="publications-empty">아직 발행한 발행본이 없습니다. [새로 발행]으로 만들어 보세요.</p>
        : <ul className={styles.items}>
          {props.items.map((item) => (
            <li key={item.publicationId} className={styles.row} data-testid="publication-row" data-publication-id={item.publicationId} data-state={item.state}>
              <div className={styles.rowHead}>
                <Link className={styles.rowTitle} href={publicationDetailPath(item.publicationId)} data-testid="publication-item-open">{item.title}</Link>
                <span className={styles[`state${item.state}`]} data-testid="publication-item-state">{PUBLICATION_STATE_LABELS[item.state]}</span>
              </div>
              <p className={styles.url} data-testid="publication-item-url">{item.url}</p>
              <p className={styles.small}>비밀번호: {passwordText(item.passwordProtected)} · 발행: {formatKst(item.publishedAt)} · 만료: {formatKst(item.expiresAt)}</p>
              {item.state === "STOPPED" && <p className={styles.small}>중지한 링크는 되살릴 수 없습니다. 다시 보내려면 새로 발행하세요.</p>}
              {item.state === "EXPIRED" && <p className={styles.small}>만료된 링크입니다. 다시 보내려면 새로 발행하세요.</p>}
              <div className={styles.rowActions}>
                <CopyUrlButton url={item.url} />
                <OpenLinkAnchor url={item.url} state={item.state} />
              </div>
            </li>
          ))}
        </ul>}
      {props.state === "ready" && props.hasMore && <div className={styles.more}>
        {props.moreState === "error" && <p role="alert">다음 목록을 불러오지 못했습니다.</p>}
        <button type="button" className={styles.secondaryButton} data-testid="publications-load-more" disabled={props.moreState === "loading"} onClick={props.onLoadMore}>
          {props.moreState === "loading" ? "불러오는 중…" : props.moreState === "error" ? "다음 목록 다시 불러오기" : "더 보기"}
        </button>
      </div>}
    </section>
  );
}

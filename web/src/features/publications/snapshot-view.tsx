"use client";

import { Fragment } from "react";
import { isGithubSourceUrl, splitGithubLinks } from "@/lib/github-source-url";
import { orderedItems, type CatchSnapshot, type PublishedItem, type PublishedSnapshot, type TextMaterialSnapshot } from "./publications-api";
import styles from "./publications.module.css";

/**
 * 자유 문장을 React 텍스트로 그리되 GitHub 주소만 새 탭 링크로 바꾼다(#416 Q1 B, NFR1.10·NFR1.11).
 * 텍스트 자료 본문과 Catch 작성자 설명에만 쓴다. AI 설명 초안·제목에는 쓰지 않는다(OQ-U4-NFR-3).
 */
export function LinkedText({ text, testId }: { text: string; testId?: string }) {
  return (
    <p className={styles.freeText} data-testid={testId}>
      {splitGithubLinks(text).map((segment, index) => segment.kind === "text"
        ? <Fragment key={index}>{segment.text}</Fragment>
        : <a key={index} href={segment.url} target="_blank" rel="noopener noreferrer" data-testid="snapshot-github-link">
          {segment.url}<span className="visually-hidden"> (새 탭)</span></a>)}
    </p>
  );
}

const EMPTY_FACTS = "기록에서 확인된 작업 사실이 없습니다.";

/** Catch 사본. 기록에서 확인한 내용·작성자 설명·AI 설명 초안을 다른 표지로 나누고 불일치 표시를 단다(BR1.3·BR4.3·BR7.5). */
function CatchSnapshotView({ snapshot }: { snapshot: CatchSnapshot }) {
  return (
    <div className={styles.snapshotBody}>
      {snapshot.mismatch && <p className={styles.warningBadge} data-testid="snapshot-catch-mismatch">불일치 표시됨</p>}
      <section className={styles.snapshotSection} data-testid="snapshot-catch-facts">
        <h4>기록에서 확인한 내용</h4>
        {snapshot.workFacts.length > 0
          ? <ul>{snapshot.workFacts.map((fact, index) => <li key={index}>{fact}</li>)}</ul>
          : <p className={styles.muted}>{EMPTY_FACTS}</p>}
        <p><strong>본인 기여:</strong> {snapshot.subjectContribution || "제공된 기여 설명이 없습니다."}</p>
        {snapshot.evidence.length > 0 && (
          <ul className={styles.evidenceList}>
            {snapshot.evidence.map((evidence, index) => (
              <li key={index}>
                {isGithubSourceUrl(evidence.sourceUrl)
                  ? <a href={evidence.sourceUrl} target="_blank" rel="noopener noreferrer" data-testid="snapshot-evidence-link">
                    GitHub 근거 열기<span className="visually-hidden"> (새 탭)</span></a>
                  : <span>{evidence.sourceUrl}</span>}
                <span className={styles.muted}> · 판본 {evidence.sourceRevision}</span>
                {evidence.representedFacts.length > 0 && <ul>{evidence.representedFacts.map((fact, factIndex) => <li key={factIndex}>{fact}</li>)}</ul>}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className={styles.snapshotSection} data-testid="snapshot-catch-description">
        <h4>작성자 설명</h4>
        {snapshot.authorDescription === null || snapshot.authorDescription.length === 0
          ? <p className={styles.muted}>작성자 설명이 없습니다.</p>
          : <LinkedText text={snapshot.authorDescription} />}
      </section>
      <section className={styles.snapshotSection} data-testid="snapshot-catch-ai-draft">
        <h4>AI 설명 초안</h4>
        <p className={snapshot.aiDraft === null ? styles.muted : styles.freeText}>{snapshot.aiDraft ?? "AI 설명 초안이 없습니다."}</p>
      </section>
    </div>
  );
}

function TextMaterialSnapshotView({ snapshot }: { snapshot: TextMaterialSnapshot }) {
  return (
    <div className={styles.snapshotBody}>
      <LinkedText text={snapshot.body} testId="snapshot-text-body" />
    </div>
  );
}

const KIND_LABELS: Record<PublishedItem["itemKind"], string> = { CATCH: "Catch", TEXT_MATERIAL: "텍스트 자료", PDF_MATERIAL: "PDF 자료" };

/** 발행본 사본(C-10 `readSnapshot` 결과)을 항목 순서대로 보인다. 제목은 글자로만 그린다. */
export function PublishedSnapshotView({ snapshot }: { snapshot: PublishedSnapshot }) {
  const items = orderedItems(snapshot);
  return (
    <section className={styles.snapshot} aria-labelledby="publication-snapshot-title" data-testid="publication-snapshot">
      <h2 id="publication-snapshot-title">발행본 자료</h2>
      {items.length === 0 ? <p className={styles.muted}>사본에 항목이 없습니다.</p> : (
        <ol className={styles.snapshotItems}>
          {items.map((item) => (
            <li key={item.publishedItemId} className={styles.snapshotItem} data-testid="snapshot-item" data-kind={item.itemKind}>
              <h3 className={styles.snapshotTitle}><span className={styles.kindBadge}>{KIND_LABELS[item.itemKind]}</span> {item.title}</h3>
              {item.itemKind === "CATCH" ? <CatchSnapshotView snapshot={item.snapshot} />
                : item.itemKind === "TEXT_MATERIAL" ? <TextMaterialSnapshotView snapshot={item.snapshot} />
                : <p className={styles.muted}>PDF 자료 표시는 준비 중입니다(U8).</p>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

"use client";

import { Fragment, type ReactNode } from "react";
import { isGithubSourceUrl, splitGithubLinks, type TextSegment } from "@/lib/github-source-url";
import { orderedItems, pdfPageCount, type CatchSnapshot, type PublishedItem, type PublishedSnapshot, type TextMaterialSnapshot } from "./publications-api";
import { PublishedPdfItem, type PdfCopySource } from "./published-pdf-item";
import styles from "./publications.module.css";

/**
 * 사본 안 강조 범위(C-11 evidence-highlight). `fieldPath`는 C-07 사본 안 경로(`workFacts[0]`·`authorDescription`·`body` 등),
 * `[charStart, charEnd)`는 그 문자열의 UTF-16 코드 단위다. 받은 사람 화면이 `showEvidence`로 받은 위치를 대조해 넘긴다.
 */
export type SnapshotHighlight = { publishedItemId: string; fieldPath: string; charStart: number; charEnd: number };

/** 사본 항목 요소의 id. 받은 사람 화면이 근거 위치로 옮길 때 이 id로 찾아 초점을 둔다. */
export const publishedItemDomId = (publishedItemId: string) => `published-item-${publishedItemId}`;

type Range = { start: number; end: number } | null;

const rangeFor = (highlight: SnapshotHighlight | null, fieldPath: string): Range =>
  highlight !== null && highlight.fieldPath === fieldPath ? { start: highlight.charStart, end: highlight.charEnd } : null;

/** 글자 `text`가 전체 문자열의 `offset`부터 시작할 때, 강조 범위와 겹치는 부분을 `<mark>`로 감싼다. */
function marked(text: string, range: Range, offset: number, key: number): ReactNode {
  if (range === null) return <Fragment key={key}>{text}</Fragment>;
  const start = Math.max(range.start - offset, 0);
  const end = Math.min(range.end - offset, text.length);
  if (start >= end) return <Fragment key={key}>{text}</Fragment>;
  return (
    <Fragment key={key}>
      {text.slice(0, start)}
      <mark className={styles.highlight} data-testid="snapshot-highlight">{text.slice(start, end)}</mark>
      {text.slice(end)}
    </Fragment>
  );
}

/** 자동 링크 없이 React 텍스트로만 그린다(NFR1.10). 강조 범위가 있으면 그 부분만 `<mark>`다. */
function PlainText({ text, range }: { text: string; range: Range }) {
  return <>{marked(text, range, 0, 0)}</>;
}

function linkedSegments(segments: TextSegment[], range: Range): ReactNode[] {
  let offset = 0;
  return segments.map((segment, index) => {
    const start = offset;
    const length = segment.kind === "text" ? segment.text.length : segment.url.length;
    offset += length;
    if (segment.kind === "text") return marked(segment.text, range, start, index);
    const anchor = (
      <a href={segment.url} target="_blank" rel="noopener noreferrer" data-testid="snapshot-github-link">
        {segment.url}<span className="visually-hidden"> (새 탭)</span></a>
    );
    // 링크 글자와 겹치는 강조는 주소를 쪼개지 않고 링크 전체를 감싼다.
    const overlaps = range !== null && range.start < start + length && range.end > start;
    return overlaps
      ? <mark key={index} className={styles.highlight} data-testid="snapshot-highlight">{anchor}</mark>
      : <Fragment key={index}>{anchor}</Fragment>;
  });
}

/**
 * 자유 문장을 React 텍스트로 그리되 GitHub 주소만 새 탭 링크로 바꾼다(#416 Q1 B, NFR1.10·NFR1.11).
 * 텍스트 자료 본문과 Catch 작성자 설명에만 쓴다. AI 설명 초안·제목에는 쓰지 않는다(OQ-U4-NFR-3).
 */
export function LinkedText({ text, testId, range = null }: { text: string; testId?: string; range?: Range }) {
  return <p className={styles.freeText} data-testid={testId}>{linkedSegments(splitGithubLinks(text), range)}</p>;
}

const EMPTY_FACTS = "기록에서 확인된 작업 사실이 없습니다.";

/** Catch 사본. 기록에서 확인한 내용·작성자 설명·AI 설명 초안을 다른 표지로 나누고 불일치 표시를 단다(BR1.3·BR4.3·BR7.5). */
function CatchSnapshotView({ snapshot, highlight }: { snapshot: CatchSnapshot; highlight: SnapshotHighlight | null }) {
  return (
    <div className={styles.snapshotBody}>
      {snapshot.mismatch && <p className={styles.warningBadge} data-testid="snapshot-catch-mismatch">불일치 표시됨</p>}
      <section className={styles.snapshotSection} data-testid="snapshot-catch-facts">
        <h4>기록에서 확인한 내용</h4>
        {snapshot.workFacts.length > 0
          ? <ul>{snapshot.workFacts.map((fact, index) => <li key={index}><PlainText text={fact} range={rangeFor(highlight, `workFacts[${index}]`)} /></li>)}</ul>
          : <p className={styles.muted}>{EMPTY_FACTS}</p>}
        <p><strong>본인 기여:</strong> {snapshot.subjectContribution
          ? <PlainText text={snapshot.subjectContribution} range={rangeFor(highlight, "subjectContribution")} />
          : "제공된 기여 설명이 없습니다."}</p>
        {snapshot.evidence.length > 0 && (
          <ul className={styles.evidenceList}>
            {snapshot.evidence.map((evidence, index) => (
              <li key={index}>
                {isGithubSourceUrl(evidence.sourceUrl)
                  ? <a href={evidence.sourceUrl} target="_blank" rel="noopener noreferrer" data-testid="snapshot-evidence-link">
                    GitHub 근거 열기<span className="visually-hidden"> (새 탭)</span></a>
                  : <span>{evidence.sourceUrl}</span>}
                <span className={styles.muted}> · 판본 {evidence.sourceRevision}</span>
                {evidence.representedFacts.length > 0 && (
                  <ul>{evidence.representedFacts.map((fact, factIndex) => (
                    <li key={factIndex}><PlainText text={fact} range={rangeFor(highlight, `evidence[${index}].representedFacts[${factIndex}]`)} /></li>
                  ))}</ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className={styles.snapshotSection} data-testid="snapshot-catch-description">
        <h4>작성자 설명</h4>
        {snapshot.authorDescription === null || snapshot.authorDescription.length === 0
          ? <p className={styles.muted}>작성자 설명이 없습니다.</p>
          : <LinkedText text={snapshot.authorDescription} range={rangeFor(highlight, "authorDescription")} />}
      </section>
      <section className={styles.snapshotSection} data-testid="snapshot-catch-ai-draft">
        <h4>AI 설명 초안</h4>
        <p className={snapshot.aiDraft === null ? styles.muted : styles.freeText}>{snapshot.aiDraft ?? "AI 설명 초안이 없습니다."}</p>
      </section>
    </div>
  );
}

function TextMaterialSnapshotView({ snapshot, highlight }: { snapshot: TextMaterialSnapshot; highlight: SnapshotHighlight | null }) {
  return (
    <div className={styles.snapshotBody}>
      <LinkedText text={snapshot.body} testId="snapshot-text-body" range={rangeFor(highlight, "body")} />
    </div>
  );
}

const KIND_LABELS: Record<PublishedItem["itemKind"], string> = { CATCH: "Catch", TEXT_MATERIAL: "텍스트 자료", PDF_MATERIAL: "PDF 자료" };

/**
 * 발행본 사본(C-10 `readSnapshot` 결과)을 항목 순서대로 보인다. 제목은 글자로만 그린다. 작성자 발행본 상세(W5)와 받은 사람 화면(W4)이 같은 표시를 쓴다.
 * `highlight`가 가리키는 항목만 강조 범위를 받고(`<mark>`), 항목마다 `id`·`tabIndex={-1}`을 두어 근거 위치로 옮길 수 있게 한다.
 * PDF 항목(U8)은 쪽 수·쪽 글을 보이고, `pdfSource`가 있으면 그 항목의 사본을 여는 단추를 둔다(받은 사람·작성자가 서로 다른 요청을 넘긴다).
 */
export function PublishedSnapshotView({ snapshot, highlight = null, pdfSource }: {
  snapshot: PublishedSnapshot;
  highlight?: SnapshotHighlight | null;
  /** PDF 항목의 사본을 받는 방법. 항목 ID로 요청을 만든다. */
  pdfSource?: (publishedItemId: string) => PdfCopySource;
}) {
  const items = orderedItems(snapshot);
  return (
    <section className={styles.snapshot} aria-labelledby="publication-snapshot-title" data-testid="publication-snapshot">
      <h2 id="publication-snapshot-title">발행본 자료</h2>
      {items.length === 0 ? <p className={styles.muted}>사본에 항목이 없습니다.</p> : (
        <ol className={styles.snapshotItems}>
          {items.map((item) => {
            const own = highlight !== null && highlight.publishedItemId === item.publishedItemId ? highlight : null;
            return (
              <li key={item.publishedItemId} id={publishedItemDomId(item.publishedItemId)} tabIndex={-1} className={styles.snapshotItem}
                data-testid="snapshot-item" data-kind={item.itemKind} data-highlighted={own !== null || undefined}>
                <h3 className={styles.snapshotTitle}><span className={styles.kindBadge}>{KIND_LABELS[item.itemKind]}</span> {item.title}</h3>
                {item.itemKind === "CATCH" ? <CatchSnapshotView snapshot={item.snapshot} highlight={own} />
                  : item.itemKind === "TEXT_MATERIAL" ? <TextMaterialSnapshotView snapshot={item.snapshot} highlight={own} />
                  : <PublishedPdfItem title={item.title} pageCount={pdfPageCount(item)} pages={item.pdfPages ?? []} highlight={own}
                    source={pdfSource?.(item.publishedItemId)} />}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

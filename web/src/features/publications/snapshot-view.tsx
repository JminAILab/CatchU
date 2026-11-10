"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";
import { splitSections, type Section } from "@/lib/author-description-sections";
import { evidenceRepositoryOf } from "@/lib/github-link-name";
import { isGithubSourceUrl, splitGithubLinks, type TextSegment } from "@/lib/github-source-url";
import { GithubLink } from "./github-link";
import { orderedItems, type CatchSnapshot, type PublishedItem, type PublishedSnapshot, type TextMaterialSnapshot } from "./publications-api";
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

/** 링크를 이름으로 그릴 때의 근거 저장소(새 Catch BR2.4). null이면 그대로 주소 전체를 보인다(텍스트 자료 본문, AC2.2.9). */
type LinkNames = { evidenceRepository: string | null } | null;

function linkedSegments(segments: TextSegment[], range: Range, names: LinkNames): ReactNode[] {
  let offset = 0;
  return segments.map((segment, index) => {
    const start = offset;
    // 위치는 원래 주소 길이(UTF-16)로 센다. 이름이 짧아져도 뒤 글자의 위치는 바뀌지 않는다(BR2.6).
    const length = segment.kind === "text" ? segment.text.length : segment.url.length;
    offset += length;
    if (segment.kind === "text") return marked(segment.text, range, start, index);
    const anchor = names !== null ? <GithubLink url={segment.url} evidenceRepository={names.evidenceRepository} /> : (
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
 * `names`를 주면 링크 글자를 링크 이름으로 그린다(작성자 설명만, 새 Catch BR2.1). 주지 않으면 지금처럼 주소 전체다.
 */
export function LinkedText({ text, testId, range = null, names = null }: { text: string; testId?: string; range?: Range; names?: LinkNames }) {
  return <p className={styles.freeText} data-testid={testId}>{linkedSegments(splitGithubLinks(text), range, names)}</p>;
}

/**
 * 저장된 글 전체의 강조 범위를 칸 안 범위로 바꾼다(BR7.5). 칸 글과 겹치는 부분만 남기고, 칸 제목 줄·칸 사이 빈 줄에만 걸치면 없다.
 * 이은 칸은 저장된 글 안에서 한 덩어리가 아니므로 강조하지 않는다(FR1.6 한계).
 */
function sectionRange(range: Range, section: Section): Range {
  if (range === null || section.joined) return null;
  const start = Math.max(range.start, section.start);
  const end = Math.min(range.end, section.start + section.text.length);
  return start < end ? { start: start - section.start, end: end - section.start } : null;
}

/** 칸 제목 h5는 상수에서만 온다. 저장된 「더 쓰기」는 다른 칸과 함께일 때 「덧붙인 말」로 보인다(BR7.2). */
const sectionHeading = (section: Section) => section.title === "더 쓰기" ? "덧붙인 말" : section.title;

/**
 * Catch 사본의 작성자 설명(새 Catch BR7.1~BR7.3). 글이 있는 칸만 h5 칸 제목과 그리고 빈 칸은 h5째 그리지 않는다.
 * 「더 쓰기」 하나뿐이면(옛 자유 글 포함) h5 없이 지금처럼 글만 그린다. 글이 없으면 「작성자 설명이 없습니다.」다.
 */
function AuthorDescriptionView({ text, range, evidenceRepository }: { text: string | null; range: Range; evidenceRepository: string | null }) {
  const sections = useMemo(() => splitSections(text), [text]);
  if (sections.length === 0) return <p className={styles.muted}>작성자 설명이 없습니다.</p>;
  const names = { evidenceRepository };
  if (sections.length === 1 && sections[0].title === "더 쓰기") {
    return <LinkedText text={sections[0].text} range={sectionRange(range, sections[0])} names={names} />;
  }
  return (
    <>
      {sections.map((section) => (
        <div key={section.title} className={styles.descriptionSection} data-testid="snapshot-description-section">
          <h5 className={styles.sectionTitle}>{sectionHeading(section)}</h5>
          <LinkedText text={section.text} range={sectionRange(range, section)} names={names} />
        </div>
      ))}
    </>
  );
}

const EMPTY_FACTS = "기록에서 확인된 작업 사실이 없습니다.";

/** 강조가 「근거 자세히 보기」 안(본인 기여·근거 목록)을 가리키는지. 그 안을 가리키면 접힌 칸을 펼친다(#488). */
export const isInEvidenceDetails = (highlight: SnapshotHighlight | null): boolean =>
  highlight !== null && (highlight.fieldPath === "subjectContribution" || highlight.fieldPath.startsWith("evidence["));

/** 사람이 마지막으로 접고 편 상태와 그때의 강조. 처음에는 접혀 있다. */
export type EvidenceToggle = { readonly open: boolean; readonly at: SnapshotHighlight | null };
export const INITIAL_EVIDENCE_TOGGLE: EvidenceToggle = { open: false, at: null };

/**
 * 「근거 자세히 보기」가 펼쳐져 있는지(#488). 사람이 접고 편 뒤로 새 강조가 그 안을 가리키면 펼치고, 아니면 사람이 고른 상태를 따른다.
 * 강조 객체는 근거 단추를 누를 때마다 새로 만들어지므로(`resolveEvidenceTarget`) 같은 근거를 다시 눌러도 다시 펼친다.
 * 그리는 그 차례에 정해지므로 화면이 강조된 `<mark>`로 스크롤할 때 이미 펼쳐져 있다.
 */
export const evidenceDetailsOpen = (toggle: EvidenceToggle, highlight: SnapshotHighlight | null): boolean =>
  isInEvidenceDetails(highlight) && toggle.at !== highlight ? true : toggle.open;

/**
 * Catch 사본. 위에서부터 불일치 표지 → AI 설명 초안 → 작성자 설명 → 기록에서 확인한 내용이다(#488, 면접관이 한 일과 그 이유를 먼저 본다).
 * 세 칸은 다른 표지로 나눈다(BR1.3·BR4.3·BR7.5). 기록 가운데 작업 사실은 펼쳐 두고, 본인 기여와 근거 목록은 「근거 자세히 보기」에 접는다.
 */
function CatchSnapshotView({ snapshot, highlight }: { snapshot: CatchSnapshot; highlight: SnapshotHighlight | null }) {
  const [toggle, setToggle] = useState<EvidenceToggle>(INITIAL_EVIDENCE_TOGGLE);
  const open = evidenceDetailsOpen(toggle, highlight);
  return (
    <div className={styles.snapshotBody}>
      {snapshot.mismatch && <p className={styles.warningBadge} data-testid="snapshot-catch-mismatch">불일치 표시됨</p>}
      {/* Catch 개편 CR3 BR7.1(2026-11-08 팀장 결정): AI 설명 초안이 없으면(null) 칸을 그리지 않는다. 사본에는 만든 초안만 담기므로 없음과 실패를 가르지 않는다. */}
      {snapshot.aiDraft !== null && (
        <section className={styles.snapshotSection} data-testid="snapshot-catch-ai-draft">
          <h4>AI 설명 초안</h4>
          <p className={styles.freeText}>{snapshot.aiDraft}</p>
        </section>
      )}
      <section className={styles.snapshotSection} data-testid="snapshot-catch-description">
        <h4>작성자 설명</h4>
        <AuthorDescriptionView text={snapshot.authorDescription} range={rangeFor(highlight, "authorDescription")}
          evidenceRepository={evidenceRepositoryOf(snapshot.evidence.map((evidence) => evidence.sourceUrl))} />
      </section>
      <section className={styles.snapshotSection} data-testid="snapshot-catch-facts">
        <h4>기록에서 확인한 내용</h4>
        {snapshot.workFacts.length > 0
          ? <ul>{snapshot.workFacts.map((fact, index) => <li key={index}><PlainText text={fact} range={rangeFor(highlight, `workFacts[${index}]`)} /></li>)}</ul>
          : <p className={styles.muted}>{EMPTY_FACTS}</p>}
        <details className={styles.evidenceDetails} data-testid="snapshot-catch-evidence-details" open={open}
          onToggle={(event) => {
            const next = event.currentTarget.open;
            setToggle((previous) => (previous.open === next && previous.at === highlight ? previous : { open: next, at: highlight }));
          }}>
          <summary>근거 자세히 보기</summary>
          <p><strong>본인 기여:</strong> {snapshot.subjectContribution
            ? <PlainText text={snapshot.subjectContribution} range={rangeFor(highlight, "subjectContribution")} />
            : "제공된 기여 설명이 없습니다."}</p>
          {snapshot.evidence.length > 0 && (
            <ul className={styles.evidenceList} data-testid="snapshot-catch-evidence">
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
        </details>
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
 */
export function PublishedSnapshotView({ snapshot, highlight = null }: { snapshot: PublishedSnapshot; highlight?: SnapshotHighlight | null }) {
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
                  : <p className={styles.muted}>PDF 자료 표시는 준비 중입니다(U8).</p>}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

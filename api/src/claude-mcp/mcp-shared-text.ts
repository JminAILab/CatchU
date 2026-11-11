// 받은 링크의 사본 항목을 일반 글로 펴기(U9 기능 설계 BR3.1·BR3.2·BR3.3·BR3.5, 비기능 설계 security-design 「응답에 담는 범위」·reliability-design
// 「받은 사람이 결과를 구분하기」, NFR1.3·NFR7.1, 계약 C-07 snapshot-shape·C-15 output). DB가 없는 순수 함수다.
// 사본 값과 고정 문구에만 기대므로 같은 사본은 언제나 같은 글이 된다(BR3.5). aiDraft는 읽지 않고, 마크다운 기호를 쓰지 않는다.
import { CatchSnapshot, PublishedPdfPage, PublishedSnapshotItem, TextMaterialSnapshot } from '../publications/published-snapshot';

/**
 * Catch 글의 머리말 넷과 빈 값 문구 셋(BR3.1). 값은 web `web/src/features/publications/snapshot-view.tsx`의 표지와 같고,
 * 시험이 그 파일 원문과 대조한다.
 */
export const CATCH_TEXT_LABELS = {
  mismatch: '불일치 표시됨',
  facts: '기록에서 확인한 내용',
  contribution: '본인 기여',
  description: '작성자 설명',
  emptyFacts: '기록에서 확인된 작업 사실이 없습니다.',
  emptyContribution: '제공된 기여 설명이 없습니다.',
  emptyDescription: '작성자 설명이 없습니다.',
} as const;

/** U9가 정한 근거 머리말(BR3.1). 웹은 머리말 없이 'GitHub 근거 열기' 링크 목록을 보인다. */
const EVIDENCE_HEADING = '근거';

/**
 * 줄 순서: 불일치 표시 → 기록에서 확인한 내용과 작업 사실 목록 → 본인 기여 → 근거(있을 때만) → 작성자 설명.
 * 근거 줄은 '- {주소} · 판본 {판본}'이고, 그 아래에 나타낸 사실을 들여쓴 목록으로 둔다.
 */
function flattenCatch(snapshot: CatchSnapshot): string {
  const lines: string[] = [];
  if (snapshot.mismatch) lines.push(CATCH_TEXT_LABELS.mismatch);
  lines.push(CATCH_TEXT_LABELS.facts);
  if (snapshot.workFacts.length > 0) lines.push(...snapshot.workFacts.map((fact) => `- ${fact}`));
  else lines.push(CATCH_TEXT_LABELS.emptyFacts);
  const contribution = snapshot.subjectContribution.length > 0 ? snapshot.subjectContribution : CATCH_TEXT_LABELS.emptyContribution;
  lines.push(`${CATCH_TEXT_LABELS.contribution}: ${contribution}`);
  if (snapshot.evidence.length > 0) {
    lines.push(EVIDENCE_HEADING);
    for (const evidence of snapshot.evidence) {
      lines.push(`- ${evidence.sourceUrl} · 판본 ${evidence.sourceRevision}`);
      lines.push(...evidence.representedFacts.map((fact) => `  - ${fact}`));
    }
  }
  lines.push(CATCH_TEXT_LABELS.description);
  const description = snapshot.authorDescription;
  lines.push(description === null || description.length === 0 ? CATCH_TEXT_LABELS.emptyDescription : description);
  return lines.join('\n');
}

/**
 * 쪽 번호 오름차순으로 '[n쪽]' 아래 그 쪽 글, 읽을 수 없는 쪽은 '[n쪽] 읽을 수 없음' 한 줄이다(BR3.3). 쪽 사이는 빈 줄 하나다.
 * 읽을 수 없는 쪽을 빈 글이나 글자 인식으로 채우지 않는다. 쪽 목록이 없거나 비면 빈 글이다.
 */
function flattenPdf(pages: readonly PublishedPdfPage[] | null): string {
  if (pages === null) return '';
  return [...pages]
    .sort((left, right) => left.pageNumber - right.pageNumber)
    .map((page) => (page.readable ? `[${page.pageNumber}쪽]\n${page.text}` : `[${page.pageNumber}쪽] 읽을 수 없음`))
    .join('\n\n');
}

/** 사본 항목 하나를 글로 편다. 사본 모양은 itemKind가 정한다(C-07). */
export function flattenPublishedItem(item: PublishedSnapshotItem): string {
  switch (item.itemKind) {
    case 'CATCH':
      return flattenCatch(item.snapshot as CatchSnapshot);
    case 'TEXT_MATERIAL':
      return (item.snapshot as TextMaterialSnapshot).body;
    case 'PDF_MATERIAL':
      return flattenPdf(item.pdfPages);
    default:
      // 표의 검사로 생기지 않는 종류다. 빈 글로 넘기지 않고 처리 실패(INTERNAL_ERROR)로 끝낸다.
      throw new TypeError('unknown published item kind');
  }
}

// 인용 위치 찾개: 인용의 문서 번호를 대응표로 근거에 잇고, 블록 범위를 원문 위치·원문 인용문·출처 이름으로 바꾼다
// (U1 기능 설계 BR4.1~BR4.4).
import { type AiGenerationRequest, type ItemCitation, SOURCE_LABELS } from './ai-generation.types';
import type { CitationDocument } from './citation-request';
import type { ProviderCitation } from './claude-citation-client';

/**
 * 원문 위치로 연결되지 않으면 null을 돌려준다(BR4.4): 블록 범위 모양이 아님, 문서 번호가 대응표에 없음,
 * 블록 범위가 비었거나 넘긴 줄 밖임. 문서 번호를 근거 위치로 바로 쓰지 않는다(BR4.1).
 */
export function locateCitation(
  citation: ProviderCitation,
  request: AiGenerationRequest,
  documents: readonly CitationDocument[],
): ItemCitation | null {
  const { locationKind, documentIndex, startBlockIndex: start, endBlockIndex: end } = citation;
  if (locationKind !== 'BLOCK_RANGE' || documentIndex === null || start === null || end === null) return null;
  const document = documents.find((entry) => entry.documentIndex === documentIndex);
  if (document === undefined) return null;
  if (start < 0 || end <= start || end > document.lines.length) return null;

  const source = request.sources[document.sourceIndex];
  const first = document.lines[start];
  const last = document.lines[end - 1];
  return {
    sourceId: source.sourceId,
    // 범위 안의 빈 줄·줄바꿈도 원문대로 넣는다(BR4.2).
    quote: source.text.slice(first.lineStart, last.lineEnd),
    location: {
      publishedItemId: source.location.publishedItemId,
      fieldPath: source.location.fieldPath,
      charStart: source.location.charStart + first.lineStart,
      charEnd: source.location.charStart + last.lineEnd,
      pdfPage: source.location.pdfPage,
    },
    sourceLabel: SOURCE_LABELS[source.sourceKind],
  };
}

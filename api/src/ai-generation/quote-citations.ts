// 따옴표 인용 붙이개: Claude 인용이 없는 항목이 따옴표 안에 옮긴 글을 넘긴 문서에서 글자 그대로 찾아,
// 작성자 자료 원문 한 곳에만 있으면 그 줄을 인용으로 붙인다(#528, 새 Catch FR11.1·AC8.1.1·AC8.1.2).
// 찾은 줄 범위는 Claude 인용과 같은 블록 범위로 만들어 locateCitation(U1 BR4)으로 원문 위치·인용문·출처 이름을 얻는다.
import type { AiFeature, AiGenerationRequest, ItemCitation } from './ai-generation.types';
import { locateCitation } from './citation-locator';
import type { CitationDocument } from './citation-request';
import { citedTarget, extractCheckTokens, passesCitedCheck } from './fact-check';

/** 따옴표 인용을 붙이는 기능. JD 요약은 붙이지 않는다(FR11.1은 기본 요약·질의응답만 말한다). */
const QUOTE_FEATURES: ReadonlySet<AiFeature> = new Set<AiFeature>(['BASE_SUMMARY', 'QNA']);

/** 여는 따옴표 → 닫는 따옴표. */
const QUOTE_PAIRS: ReadonlyMap<string, string> = new Map([
  ["'", "'"], ['"', '"'], ['‘', '’'], ['“', '”'], ['「', '」'], ['『', '』'],
]);

/** 공백을 줄인 따옴표 글이 이보다 짧으면 찾지 않는다. 낱말 한두 개는 다른 글과 우연히 겹치기 쉽다. */
export const QUOTE_MIN_LENGTH = 10;

/** 공백 문자 묶음을 공백 하나로 줄이고 앞뒤 공백을 뗀다. 따옴표 글과 문서 줄에 같게 쓴다. */
const collapseSpaces = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** 글에서 따옴표 안 글을 나온 순서대로 뽑는다. 여는 글자 뒤의 첫 닫는 글자까지이고, 따옴표 안의 따옴표는 따로 보지 않는다. */
export function quotedTexts(text: string): string[] {
  const quotes: string[] = [];
  let at = 0;
  while (at < text.length) {
    const close = QUOTE_PAIRS.get(text[at]);
    const end = close === undefined ? -1 : text.indexOf(close, at + 1);
    if (end === -1) {
      at += 1;
      continue;
    }
    quotes.push(text.slice(at + 1, end));
    at = end + 1;
  }
  return quotes;
}

/** 찾는 대상 문서 하나: 줄마다 공백을 줄여 공백 하나로 이은 글과, 그 글의 글자마다 문서 줄 번호. 줄을 넘는 따옴표 글도 찾는다. */
interface SearchDocument {
  document: CitationDocument;
  isAuthorMaterial: boolean;
  text: string;
  lineAt: number[];
}

function searchDocument(document: CitationDocument, request: AiGenerationRequest): SearchDocument {
  let text = '';
  const lineAt: number[] = [];
  document.lines.forEach((line, index) => {
    const part = `${index > 0 ? ' ' : ''}${collapseSpaces(line.text)}`;
    text += part;
    for (let count = 0; count < part.length; count += 1) lineAt.push(index);
  });
  return { document, isAuthorMaterial: request.sources[document.sourceIndex].sourceKind === 'AUTHOR_MATERIAL', text, lineAt };
}

/**
 * 따옴표 글 하나의 인용. 넘긴 문서 전체(GitHub 기록 원문 포함)에서 정확히 한 곳에 있고 그 문서가 작성자 자료 원문일 때만 만든다.
 * 없거나, 두 곳 이상이거나, GitHub 기록 원문에 있으면 null이다.
 */
function locateQuote(
  quote: string,
  searchDocuments: readonly SearchDocument[],
  request: AiGenerationRequest,
  documents: readonly CitationDocument[],
): ItemCitation | null {
  let found: { entry: SearchDocument; at: number } | null = null;
  for (const entry of searchDocuments) {
    for (let at = entry.text.indexOf(quote); at !== -1; at = entry.text.indexOf(quote, at + 1)) {
      if (found !== null) return null;
      found = { entry, at };
    }
  }
  if (found === null || !found.entry.isAuthorMaterial) return null;
  const { entry, at } = found;
  return locateCitation({
    locationKind: 'BLOCK_RANGE',
    documentIndex: entry.document.documentIndex,
    startBlockIndex: entry.lineAt[at],
    endBlockIndex: entry.lineAt[at + quote.length - 1] + 1,
    citedText: null,
  }, request, documents);
}

const sameCitation = (a: ItemCitation, b: ItemCitation): boolean =>
  a.sourceId === b.sourceId && a.location.charStart === b.location.charStart && a.location.charEnd === b.location.charEnd;

/**
 * Claude 인용이 없는 항목 글에 붙일 인용. 붙이지 않으면 빈 목록이고, 그 항목은 지금처럼 AI 해석 항목이다.
 * - 기본 요약·질의응답만 본다. 공백을 줄인 따옴표 글이 QUOTE_MIN_LENGTH자 이상인 것만 찾는다.
 * - 찾는 따옴표 글이 모두 작성자 자료 원문 한 곳씩에 있을 때만 붙인다. 하나라도 아니면 붙이지 않는다(추측하지 않는다).
 * - 붙인 항목이 인용 항목 대조(U2 BR3.4)를 통과할 때만 붙인다. 붙여서 버려지는 항목을 새로 만들지 않는다.
 */
export function quoteCitations(itemText: string, request: AiGenerationRequest, documents: readonly CitationDocument[]): ItemCitation[] {
  if (!QUOTE_FEATURES.has(request.feature)) return [];
  const quotes = quotedTexts(itemText).map(collapseSpaces).filter((quote) => quote.length >= QUOTE_MIN_LENGTH);
  if (quotes.length === 0) return [];
  const searchDocuments = documents.map((document) => searchDocument(document, request));
  const citations: ItemCitation[] = [];
  for (const quote of quotes) {
    const citation = locateQuote(quote, searchDocuments, request, documents);
    if (citation === null) return [];
    if (!citations.some((existing) => sameCitation(existing, citation))) citations.push(citation);
  }
  const target = citedTarget({ kind: 'CITED', text: itemText, citations }, request);
  return passesCitedCheck(extractCheckTokens(itemText), target) ? citations : [];
}

// 응답 묶개: 중단 이유를 보고, 글 조각을 줄로 이어 항목을 만들며, 잘린 마지막 항목과 항목이 아닌 줄을 센다
// (U1 기능 설계 W2, BR3.1~BR3.4·BR4.4·BR5.1~BR5.4, 비기능 NFR6.1).
import { type AiGenerationRequest, AiProviderError, type GatedItem, type ItemCitation } from './ai-generation.types';
import { locateCitation } from './citation-locator';
import type { CitationDocument } from './citation-request';
import type { ProviderCitation, ProviderResponse } from './claude-citation-client';

const ITEM_PREFIX = '- ';

export interface ResponseLine {
  text: string;
  citations: ProviderCitation[];
}

export interface ResponseItems {
  items: GatedItem[];
  /** 잘린 마지막 항목(BR5.1)과 위치로 연결되지 않는 인용의 항목(BR4.4) 수. */
  droppedCount: number;
  /** 글자가 있지만 '- ' 항목으로 인정하지 않은 줄 수(BR3.4, 로그용). 빈 줄은 세지 않는다. */
  nonItemLineCount: number;
}

/** 거절은 REFUSED(BR5.2), 정상 끝·출력 상한 밖의 중단 이유는 UNEXPECTED_STOP(BR5.4)으로 끝낸다. */
export function assertUsableStop(response: ProviderResponse): void {
  if (response.stopReason === 'REFUSAL') throw new AiProviderError('REFUSED', { requestId: response.requestId });
  if (response.stopReason === 'OTHER') throw new AiProviderError('UNEXPECTED_STOP', { requestId: response.requestId });
}

/**
 * 글 조각을 순서대로 이어 줄로 나눈다. 조각의 인용은 그 조각의 첫 번째 줄바꿈 아닌 글자가 놓인 줄에 붙는다(BR3.2).
 * 조각에 줄바꿈 아닌 글자가 없으면 이어 붙인 뒤의 마지막 줄에 붙인다.
 */
export function joinResponseLines(response: ProviderResponse): ResponseLine[] {
  const lines: ResponseLine[] = [{ text: '', citations: [] }];
  for (const fragment of response.fragments) {
    let target: ResponseLine | null = null;
    const parts = fragment.text.split('\n');
    for (let index = 0; index < parts.length; index += 1) {
      if (index > 0) lines.push({ text: '', citations: [] });
      const current = lines[lines.length - 1];
      current.text += parts[index];
      if (target === null && parts[index].length > 0) target = current;
    }
    (target ?? lines[lines.length - 1]).citations.push(...fragment.citations);
  }
  return lines;
}

/** 줄마다 항목 후보를 고르고 인용을 원문 위치로 바꾼다. 남은 항목이 0개인지는 ensureItems가 본다. */
export function collectResponseItems(
  response: ProviderResponse,
  request: AiGenerationRequest,
  documents: readonly CitationDocument[],
): ResponseItems {
  assertUsableStop(response);
  const lines = joinResponseLines(response);
  // 출력 상한에서 끝났으면 마지막 줄바꿈 뒤의 마지막 줄은 끝나지 않은 줄이다(BR5.1).
  const unfinishedLine = response.stopReason === 'MAX_TOKENS' ? lines[lines.length - 1] : null;
  const result: ResponseItems = { items: [], droppedCount: 0, nonItemLineCount: 0 };
  for (const line of lines) {
    const itemText = readItemText(line.text);
    if (itemText === null) {
      if (line.text.trim() !== '') result.nonItemLineCount += 1;
      continue;
    }
    const citations = line === unfinishedLine ? null : locateAll(line.citations, request, documents);
    if (citations === null) {
      result.droppedCount += 1;
      continue;
    }
    result.items.push({ kind: citations.length > 0 ? 'CITED' : 'AI_INTERPRETATION', text: itemText, citations });
  }
  return result;
}

/** 낼 항목이 0개면 NO_ITEMS로 끝낸다(BR5.3). 잘린 응답에서 남은 항목이 0개인 경우도 같다. */
export function ensureItems(result: ResponseItems, requestId: string | null): GatedItem[] {
  if (result.items.length === 0) throw new AiProviderError('NO_ITEMS', { requestId });
  return result.items;
}

/** '- '로 시작하고 그 뒤에 글자가 있으면 항목 글(나머지 그대로), 아니면 null(BR3.1·BR3.4). */
function readItemText(line: string): string | null {
  if (!line.startsWith(ITEM_PREFIX)) return null;
  const rest = line.slice(ITEM_PREFIX.length);
  return rest.trim() === '' ? null : rest;
}

/** 인용이 하나라도 연결되지 않으면 null(그 항목을 버림, BR4.4). 응답에 나온 순서를 지킨다. */
function locateAll(
  citations: readonly ProviderCitation[],
  request: AiGenerationRequest,
  documents: readonly CitationDocument[],
): ItemCitation[] | null {
  const located: ItemCitation[] = [];
  for (const citation of citations) {
    const itemCitation = locateCitation(citation, request, documents);
    if (itemCitation === null) return null;
    located.push(itemCitation);
  }
  return located;
}

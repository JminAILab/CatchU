// 요청 만들개: 인용 문서와 문서 번호 → 근거 대응표, 시스템 지시, 사용자 메시지를 만든다
// (U1 기능 설계 BR1.4·BR2.1·BR2.3, 비기능 NFR2.3).
import type { ContentBlockParam, DocumentBlockParam } from '@anthropic-ai/sdk/resources/messages';
import type { AiGenerationRequest, AiSourceKind } from './ai-generation.types';
import { type CitationLine, splitCitationLines } from './citation-lines';

/** 대응표의 한 행. 문서 번호(documentIndex)와 근거 위치(sourceIndex)를 같은 값으로 보지 않는다. */
export interface CitationDocument {
  documentIndex: number;
  sourceIndex: number;
  lines: CitationLine[];
}

export type CitationRequestPlan =
  | { kind: 'SKIP' }
  | { kind: 'CALL'; system: string; userContent: ContentBlockParam[]; documents: CitationDocument[] };

/** 항목 형식 지시(BR2.3). 응답 묶개(BR3.1)가 이 형식을 읽는다. */
export const ITEM_FORMAT_INSTRUCTION =
  "한 줄에 항목 하나만 쓴다. 줄 맨 앞은 '- '로 시작한다. 항목마다 사실 하나만 쓴다. 머리말과 맺음말은 쓰지 않는다.";

/** 인용 문서의 context에 두는 자료 종류 설명(BR1.4). */
export const SOURCE_KIND_CONTEXT: Record<AiSourceKind, string> = {
  GITHUB_RECORD: '자료 종류: GitHub 기록 원문',
  AUTHOR_MATERIAL: '자료 종류: 작성자 자료 원문',
};

/**
 * 근거 순서대로 줄이 있는 근거만 인용 문서로 만든다. 줄이 없는 근거는 자리 문서로도 넘기지 않는다.
 * 근거가 없거나 남은 문서가 없으면 Claude를 부르지 않는다는 표시(SKIP)를 돌려준다(BR2.1).
 * publicationText는 모델에 보내지 않는다(BR2.3).
 */
export function buildCitationRequest(request: AiGenerationRequest): CitationRequestPlan {
  const documents: CitationDocument[] = [];
  const documentBlocks: DocumentBlockParam[] = [];
  request.sources.forEach((source, sourceIndex) => {
    const lines = splitCitationLines(source.text);
    if (lines.length === 0) return;
    documents.push({ documentIndex: documents.length, sourceIndex, lines });
    documentBlocks.push({
      type: 'document',
      source: { type: 'content', content: lines.map((line) => ({ type: 'text', text: line.text })) },
      citations: { enabled: true },
      context: SOURCE_KIND_CONTEXT[source.sourceKind],
    });
  });
  if (documents.length === 0) return { kind: 'SKIP' };

  const userContent: ContentBlockParam[] = [...documentBlocks];
  if (request.userText !== null && request.userText !== '') {
    userContent.push({ type: 'text', text: request.userText });
  }
  return { kind: 'CALL', system: `${ITEM_FORMAT_INSTRUCTION}\n\n${request.instruction}`, userContent, documents };
}

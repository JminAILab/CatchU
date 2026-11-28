// 질의응답 처리기(기능 설계 W1 7~10단계·W2, BR1.3·BR4.1~BR4.8, security-design NFR2.5, observability-design NFR6.1).
// 다시 쓰기 → 검색 → 생성 순서를 이 함수 하나에 고정하고 각 단계를 한 번만 부른다. 예외를 던지지 않고 결과 종류로 돌려준다.
// 질문·앞 대화·답 글은 결과에 담지 않는다(로그는 이 결과의 칸만 쓴다, BR1.4).
// 검색 조각을 그대로 근거로 옮기던 일(C-09 note)은 #559부터 qna-sources.ts buildQnaSources가 한다. 검색으로 맞은 줄은 그대로 옮기고,
// 맞은 Catch의 GitHub 기록 줄을 사본에서 더 붙인 뒤 근거마다 머리글(itemContext)을 단다.
// 게이트가 통과시킨 항목은 글의 머리글 표 글자만 화면의 자료 종류 표시로 바꿔 내보낸다(#653, U5 BR4.5의 예외).
import { type AiGenerationGate, type GatedItem } from '../ai-generation/ai-generation.types';
import { errorName } from '../ai-run/ai-run-spec';
import type { PublishedSnapshot } from '../publications/publication-access';
import { type ChunkHit, IndexNotReady, type PublishedSearch } from '../published-index/published-search';
import { buildQnaSources, replaceItemTags } from './qna-sources';
import type { HistoryMessage } from './question-input';
import type { QuestionRewriter } from './question-rewriter';
import { QNA_INSTRUCTION, QNA_MODEL, QNA_SEARCH_LIMIT } from './rag-answer-config';
import { elapsedMs, type QnaOutcome, type QnaStage } from './rag-answer-log';

export interface QnaDeps {
  rewriter: QuestionRewriter;
  search: PublishedSearch;
  gate: AiGenerationGate;
}

export interface QnaRunInput {
  publicationId: string;
  /** 그 발행본의 사본(C-10 readSnapshot). 검색으로 맞은 Catch의 기록 줄과 머리글을 여기서 만든다(#559 설계 결정 1·2). */
  snapshot: PublishedSnapshot;
  question: string;
  history: HistoryMessage[];
  /** 받은 사람이 연결을 끊었으면 true(BR4.8). 단계 사이와 항목마다 본다. */
  isAborted: () => boolean;
  /** 게이트가 통과시킨 항목 하나. 표 글자만 바꾼 뒤 받는 대로 SSE item으로 쓴다(BR4.5, #653). */
  onItem: (item: GatedItem) => void;
}

/** SSE error 이벤트 코드(C-12). */
export type QnaErrorCode = 'ANSWER_FAILED' | 'INDEX_NOT_READY';

export interface QnaRunResult {
  stage: QnaStage;
  outcome: QnaOutcome;
  /** 스트림 끝에 보낼 error 코드. 성공·연결 끊김이면 null(성공이면 done을 보낸다). */
  errorCode: QnaErrorCode | null;
  failure: string | null;
  rewritten: boolean;
  rewriteMs: number | null;
  rewriteInputTokens: number | null;
  rewriteOutputTokens: number | null;
  searchMs: number | null;
  chunkCount: number | null;
  generateMs: number | null;
  itemCount: number;
  /** 상한 때문에 모델에 붙이지 못한 같은 Catch 기록 줄 수(#559 FR1.6). 생성 단계 전에 끝났으면 null. */
  unattachedLineCount: number | null;
}

function emptyResult(): QnaRunResult {
  return {
    stage: 'REWRITE', outcome: 'OK', errorCode: null, failure: null, rewritten: false, rewriteMs: null,
    rewriteInputTokens: null, rewriteOutputTokens: null, searchMs: null, chunkCount: null, generateMs: null, itemCount: 0,
    unattachedLineCount: null,
  };
}

function fail(result: QnaRunResult, outcome: QnaOutcome, error: unknown): QnaRunResult {
  result.outcome = outcome;
  result.errorCode = outcome === 'INDEX_NOT_READY' ? 'INDEX_NOT_READY' : 'ANSWER_FAILED';
  result.failure = errorName(error);
  return result;
}

function closed(result: QnaRunResult): QnaRunResult {
  result.outcome = 'CLIENT_CLOSED';
  return result;
}

/**
 * 질문 하나를 처리한다. 앞 대화가 있을 때만 다시 쓰고(BR4.1), search(…, 8)를 한 번(BR4.2), 조각이 있을 때만 생성한다(BR4.4).
 * 이미 시작한 다시 쓰기는 끝까지 두고 결과를 버리며, 끊김 깃발이 서 있으면 검색·생성을 부르지 않는다(performance-design NFR4.3).
 */
export async function answerQuestion(deps: QnaDeps, input: QnaRunInput): Promise<QnaRunResult> {
  const result = emptyResult();
  if (input.isAborted()) return closed(result); // 확인 단계 중에 이미 끊겼으면 다시 쓰기부터 하지 않는다
  let searchQuestion = input.question;
  if (input.history.length > 0) {
    const startedAt = performance.now();
    try {
      const rewrite = await deps.rewriter.rewrite({ history: input.history, question: input.question });
      Object.assign(result, { rewritten: true, rewriteInputTokens: rewrite.inputTokens, rewriteOutputTokens: rewrite.outputTokens });
      searchQuestion = rewrite.text;
    } catch (error) {
      return fail(result, 'REWRITE_FAILED', error);
    } finally {
      result.rewriteMs = elapsedMs(startedAt);
    }
  }
  if (input.isAborted()) return closed(result);

  result.stage = 'SEARCH';
  const searchStartedAt = performance.now();
  let hits: ChunkHit[];
  let publicationText: string;
  try {
    ({ hits, publicationText } = await deps.search.search(input.publicationId, searchQuestion, QNA_SEARCH_LIMIT));
  } catch (error) {
    return fail(result, error instanceof IndexNotReady ? 'INDEX_NOT_READY' : 'SEARCH_FAILED', error);
  } finally {
    result.searchMs = elapsedMs(searchStartedAt);
  }
  result.chunkCount = hits.length;
  if (hits.length === 0) return result; // Claude를 부르지 않고 done(BR4.4)
  if (input.isAborted()) return closed(result);

  result.stage = 'GENERATE';
  const generateStartedAt = performance.now();
  try {
    // 검색 8개에 맞은 Catch의 기록 줄을 붙이고 머리글을 단다(#559 FR1·FR2). 평가 스크립트도 같은 함수로 요청을 만든다(FR7).
    // 사본 모양이 틀려 여기서 던지면 생성 실패로 끝난다.
    const { sources, unattachedLineCount, itemTags } = buildQnaSources(hits, input.snapshot);
    result.unattachedLineCount = unattachedLineCount;
    const stream = deps.gate.generateStream({
      feature: 'QNA', instruction: QNA_INSTRUCTION, sources, userText: searchQuestion, publicationText, model: QNA_MODEL,
    });
    for await (const item of stream) {
      // 끊겼으면 break로 게이트 스트림의 return을 부른다(게이트가 그 finally에서 Claude 스트림을 닫는다).
      if (input.isAborted()) break;
      // 머리글의 표 글자(「다」 등)는 화면에 없어서 화면의 자료 종류 표시로 바꾼다(#653). 사실 대조가 끝난 항목이라 다시 대조하지 않는다.
      input.onItem(replaceItemTags(item, itemTags));
      result.itemCount += 1;
    }
  } catch (error) {
    return fail(result, 'GENERATION_FAILED', error);
  } finally {
    result.generateMs = elapsedMs(generateStartedAt);
  }
  return input.isAborted() ? closed(result) : result;
}

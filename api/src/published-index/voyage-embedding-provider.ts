// Voyage 임베딩 제공자(비기능 설계 security-design 「Voyage 외부 호출」·「오류 분류」, NFR2.1~NFR2.3·NFR4.1).
// SDK 없이 고정 주소에 HTTPS 요청 하나를 보낸다. U1 지키는 fetch(redirect 금지·본문 8 MiB 상한)를 거치고,
// 시간 제한 신호가 응답 본문 읽기까지 덮는다. 다시 시도하지 않는다.
import { createGuardedFetch, type FetchLike, GuardedFetchError } from '../ai-generation/guarded-fetch';
import {
  DOCUMENT_EMBEDDING_TIMEOUT_MS, EMBEDDING_DIMENSION, EMBEDDING_MODEL, EMBEDDING_RESPONSE_MAX_BYTES,
  QUERY_EMBEDDING_TIMEOUT_MS, VOYAGE_EMBEDDINGS_URL,
} from './embedding-config';
import {
  type EmbeddingInputType, type EmbeddingProvider, EmbeddingProviderError, isEmbeddingVector,
} from './embedding-types';

export interface VoyageProviderOptions {
  /** 실제 전송. 기본은 전역 fetch. 시험은 기록용 fetch를 넘긴다. */
  fetch?: FetchLike;
  /** 시험에서 짧게 줄일 때만 넘긴다. 기본은 문서 30초·질문 10초. */
  documentTimeoutMs?: number;
  queryTimeoutMs?: number;
}

interface ParsedEmbeddings {
  vectors: number[][];
  totalTokens: number;
}

/**
 * 키는 이 함수의 닫힌 변수에만 있고 요청의 Authorization 머리글에만 쓴다.
 * 돌려주는 객체에는 키를 내보내는 속성이 없다(security-design 「키와 합성 제공자」).
 */
export function createVoyageEmbeddingProvider(apiKey: string, options: VoyageProviderOptions = {}): EmbeddingProvider {
  const fetchWithLimits = createGuardedFetch(options.fetch ?? globalThis.fetch, EMBEDDING_RESPONSE_MAX_BYTES);
  const documentTimeoutMs = options.documentTimeoutMs ?? DOCUMENT_EMBEDDING_TIMEOUT_MS;
  const queryTimeoutMs = options.queryTimeoutMs ?? QUERY_EMBEDDING_TIMEOUT_MS;

  async function call(input: string | string[], inputType: EmbeddingInputType, expectedCount: number): Promise<ParsedEmbeddings> {
    const signal = AbortSignal.timeout(inputType === 'document' ? documentTimeoutMs : queryTimeoutMs);
    // 요청 보내기부터 본문 읽기·응답 검사까지 한 try로 묶는다. 본문 상한 초과·시간 초과는 본문을 읽는 도중에도 난다.
    try {
      const response = await fetchWithLimits(VOYAGE_EMBEDDINGS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ input, model: EMBEDDING_MODEL, input_type: inputType, output_dimension: EMBEDDING_DIMENSION }),
        signal,
      });
      if (!response.ok) {
        // 오류 본문은 읽지 않고 버린다(보낸 글이 되돌아와도 로그·오류로 옮겨지지 않게). 버리기 실패는 결과를 바꾸지 않는다.
        await response.body?.cancel().catch(() => undefined);
        throw new EmbeddingProviderError('API_STATUS', response.status);
      }
      return parseEmbeddingResponse(await response.text(), expectedCount);
    } catch (error) {
      throw classifyFailure(error, signal);
    }
  }

  return Object.freeze({
    async embedDocuments(texts: string[]) {
      if (texts.length === 0) return { vectors: [], totalTokens: 0 };
      return call(texts, 'document', texts.length);
    },
    async embedQuery(text: string) {
      const { vectors, totalTokens } = await call(text, 'query', 1);
      return { vector: vectors[0], totalTokens };
    },
  });
}

/** 잡은 오류를 실패 종류로 바꾼다. 원래 오류의 메시지는 옮기지 않는다(security-design 「오류 분류」 표). */
function classifyFailure(error: unknown, signal: AbortSignal): EmbeddingProviderError {
  if (error instanceof EmbeddingProviderError) return error;
  if (error instanceof GuardedFetchError) return new EmbeddingProviderError(error.failure);
  if ((error instanceof Error && error.name === 'TimeoutError') || signal.aborted) return new EmbeddingProviderError('TIMEOUT');
  return new EmbeddingProviderError('CONNECTION_FAILED');
}

/**
 * 응답 모양 검사: data 개수가 보낸 글 수와 같고, index가 0..n-1을 한 번씩 덮고, 벡터가 1024개의 유한한 숫자다(BR2.3).
 * 토큰 수는 로그용이라 칸이 없거나 이상하면 0으로 본다.
 */
export function parseEmbeddingResponse(body: string, expectedCount: number): ParsedEmbeddings {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new EmbeddingProviderError('INVALID_RESPONSE');
  }
  const data = (parsed as { data?: unknown } | null)?.data;
  if (!Array.isArray(data) || data.length !== expectedCount) throw new EmbeddingProviderError('INVALID_RESPONSE');
  const vectors: (number[] | undefined)[] = new Array(expectedCount);
  for (const item of data as { index?: unknown; embedding?: unknown }[]) {
    const index = item?.index;
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= expectedCount
      || vectors[index] !== undefined || !isEmbeddingVector(item.embedding)) {
      throw new EmbeddingProviderError('INVALID_RESPONSE');
    }
    vectors[index] = item.embedding;
  }
  const tokens = (parsed as { usage?: { total_tokens?: unknown } }).usage?.total_tokens;
  const totalTokens = typeof tokens === 'number' && Number.isInteger(tokens) && tokens >= 0 ? tokens : 0;
  return { vectors: vectors as number[][], totalTokens };
}

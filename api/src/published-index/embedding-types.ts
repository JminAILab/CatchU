// 임베딩 제공자 경계의 타입과 오류(기능 설계 entities.md EmbeddingProvider, 비기능 설계 logical-components·security-design 「오류 분류」).
// Voyage·합성 제공자와 만들기 함수(embedding-provider.ts)가 함께 쓴다. 서로 불러오는 고리가 생기지 않게 따로 둔다.
import { EMBEDDING_DIMENSION } from './embedding-config';

export type EmbeddingInputType = 'document' | 'query';

export interface DocumentEmbeddings {
  /** 보낸 글 순서 그대로, 같은 개수의 1024차원 벡터 */
  vectors: number[][];
  /** Voyage 응답의 토큰 수(usage.total_tokens). 합성 제공자는 0 */
  totalTokens: number;
}

export interface QueryEmbedding {
  vector: number[];
  totalTokens: number;
}

/**
 * U3 안의 임베딩 제공자 경계. 기능 설계의 경계는 벡터만 돌려주지만 관측 요구사항 NFR6.2의 토큰 수 기록을 위해
 * 토큰 수를 더했다(logical-components). 실패는 모두 EmbeddingProviderError다. 다시 시도하지 않는다.
 */
export interface EmbeddingProvider {
  /** 조각 글을 문서용 입력으로 */
  embedDocuments(texts: string[]): Promise<DocumentEmbeddings>;
  /** 질문 글을 질문용 입력으로 */
  embedQuery(text: string): Promise<QueryEmbedding>;
}

/** 1024개의 유한한 숫자인지(BR2.3). DB에 `[...]::vector` 문자열로 넘기는 값은 이 검사를 통과한 것만 쓴다. */
export function isEmbeddingVector(value: unknown): value is number[] {
  return Array.isArray(value) && value.length === EMBEDDING_DIMENSION
    && value.every((n) => typeof n === 'number' && Number.isFinite(n));
}

/** pgvector 입력 문자열. isEmbeddingVector를 통과한 값만 넘긴다. */
export function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

export const EMBEDDING_PROVIDER_FAILURES = [
  'REDIRECT_REJECTED', 'RESPONSE_TOO_LARGE', 'TIMEOUT', 'CONNECTION_FAILED', 'API_STATUS', 'INVALID_RESPONSE',
] as const;
export type EmbeddingProviderFailure = (typeof EMBEDDING_PROVIDER_FAILURES)[number];

const FAILURE_MESSAGES: Record<EmbeddingProviderFailure, string> = {
  REDIRECT_REJECTED: '임베딩 제공자가 redirect 응답을 보냈습니다.',
  RESPONSE_TOO_LARGE: '임베딩 제공자 응답 본문이 상한을 넘었습니다.',
  TIMEOUT: '임베딩 제공자 호출 시간이 제한을 넘었습니다.',
  CONNECTION_FAILED: '임베딩 제공자에 연결하지 못했습니다.',
  API_STATUS: '임베딩 제공자가 오류 상태로 응답했습니다.',
  INVALID_RESPONSE: '임베딩 제공자 응답 모양이 맞지 않습니다.',
};

/**
 * 임베딩 제공자 실패. 실패 종류와 HTTP 상태만 갖고 메시지는 종류별 고정 문구다.
 * 보낸 글·키·주소·원래 오류의 메시지를 담지 않는다(security-design 「오류와 로그에 넣지 않는 것」).
 */
export class EmbeddingProviderError extends Error {
  override readonly name = 'EmbeddingProviderError';

  constructor(readonly failure: EmbeddingProviderFailure, readonly httpStatus: number | null = null) {
    super(FAILURE_MESSAGES[failure]);
  }
}

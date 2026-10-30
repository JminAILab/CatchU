// 합성 임베딩 제공자(기능 설계 「주요 시나리오와 확인」, BR6.1). 개발·시험 전용이며 외부 호출이 없다.
// 같은 글에 늘 같은 1024차원 단위 벡터를 준다. 이 결과를 실제 임베딩 성공으로 보고하지 않는다(team.md Walking Skeleton).
import { createHash } from 'node:crypto';
import { EMBEDDING_DIMENSION } from './embedding-config';
import type { EmbeddingProvider } from './embedding-types';

/** 글의 SHA-256(순번을 붙여 32번)에서 1024개 값을 만들고 길이 1로 맞춘다. 문서·질문을 구분하지 않는다. */
export function syntheticEmbedding(text: string): number[] {
  const values: number[] = [];
  for (let block = 0; values.length < EMBEDDING_DIMENSION; block++) {
    const digest = createHash('sha256').update(`${block}\u0000${text}`, 'utf8').digest();
    for (const byte of digest) values.push(byte / 127.5 - 1);
  }
  const vector = values.slice(0, EMBEDDING_DIMENSION);
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return vector.map((value) => value / norm);
}

export function createSyntheticEmbeddingProvider(): EmbeddingProvider {
  return Object.freeze({
    async embedDocuments(texts: string[]) {
      return { vectors: texts.map(syntheticEmbedding), totalTokens: 0 };
    },
    async embedQuery(text: string) {
      return { vector: syntheticEmbedding(text), totalTokens: 0 };
    },
  });
}

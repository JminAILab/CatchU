// U3 발행본 색인·검색의 설정 값(기능 설계 entities.md EmbeddingSettings, 비기능 설계 performance-design·security-design).
// 값은 이 파일 한곳에 둔다. 키만 환경변수에서 읽고 나머지는 코드 상수다(주소를 설정으로 바꾸는 길을 두지 않는다).

/** Voyage 임베딩 모델과 차원(기능 설계 Q2). 2026-10-29 Voyage 공식 문서로 확인했다(code-summary 「Voyage 확인 결과」). */
export const EMBEDDING_MODEL = 'voyage-4-lite';
export const EMBEDDING_DIMENSION = 1024;

/** Voyage 임베딩 주소. 환경변수·인자로 바꾸지 않는다(security-design ①). */
export const VOYAGE_EMBEDDINGS_URL = 'https://api.voyageai.com/v1/embeddings';

/** 호출 하나의 시간 제한. 응답 본문 읽기까지 덮는다(performance-design NFR4.1, security-design ④). */
export const DOCUMENT_EMBEDDING_TIMEOUT_MS = 30_000;
export const QUERY_EMBEDDING_TIMEOUT_MS = 10_000;

/** 한 번에 보내는 조각 수. Voyage 한 번 호출 상한(글 1,000개, voyage-4-lite 1M 토큰)보다 작다(NFR4.1). */
export const EMBEDDING_BATCH_SIZE = 128;

/** Voyage 응답 본문 상한. U1 지키는 fetch의 기본값(256 KiB)이 아니라 이 값을 넘긴다(security-design ③). */
export const EMBEDDING_RESPONSE_MAX_BYTES = 8 * 1024 * 1024;

/** 임베딩 처리 시한(기능 설계 Q3). 발행 때와 [검색 다시 준비] 접수 때 now + 이 값을 마감으로 쓴다. */
export const EMBEDDING_DEADLINE_MS = 10 * 60 * 1000;

/** 조각 하나의 최대 길이(UTF-16 코드 단위, 기능 설계 Q1). */
export const MAX_CHUNK_LENGTH = 1000;

/**
 * 임베딩 설정. 키는 Voyage 요청 머리글에만 쓰며 이 객체를 로그·오류에 넣지 않는다(BR6.2).
 * 키가 없으면 null이다(앞뒤 공백을 뺀 값이 비면 키 없음).
 */
export interface EmbeddingConfig {
  readonly apiKey: string | null;
}

/** CATCHU_EMBEDDING_API_KEY만 읽는다. SDK가 스스로 읽는 VOYAGE_API_KEY는 읽지 않는다(BR6.1, NFR1.3). */
export function readEmbeddingConfig(env: NodeJS.ProcessEnv = process.env): EmbeddingConfig {
  const apiKey = env.CATCHU_EMBEDDING_API_KEY?.trim() ?? '';
  return { apiKey: apiKey === '' ? null : apiKey };
}

/** 접수 시각에서 처리 마감을 구한다(BR1.8·BR4.1). */
export function embeddingDeadline(now: Date): Date {
  return new Date(now.getTime() + EMBEDDING_DEADLINE_MS);
}

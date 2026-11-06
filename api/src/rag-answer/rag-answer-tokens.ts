// U5 모듈의 주입 자리. 모듈 파일과 컨트롤러가 서로 불러 순환하지 않게 따로 둔다.
import type { RagAnswerLogger } from './rag-answer-log';

/**
 * C-10 PublicationAccess 자리. 기본 앱은 U4의 실제(DB) 구현(publications 모듈이 내보낸 같은 이름의 토큰)을 넣는다.
 * 메모리 가짜(publications/in-memory-publication-access.ts)는 시험에서만 넣고 앱에는 넣지 않는다(비기능 설계 Q1).
 */
export const PUBLICATION_ACCESS = Symbol('RAG_ANSWER_PUBLICATION_ACCESS');

/** 컨트롤러·처리기의 시각·keep-alive 간격·로그. 운영 기본값은 모듈이 넣고, 시험만 바꾼다. */
export const RAG_ANSWER_OPTIONS = Symbol('RAG_ANSWER_OPTIONS');

export interface RagAnswerOptions {
  clock: () => Date;
  keepAliveMs: number;
  logger: RagAnswerLogger;
}

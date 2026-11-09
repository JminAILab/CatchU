// U3 로그 사건(비기능 설계 observability-design 「로그 방식」 표, NFR6.2·NFR6.3).
// 사건마다 표의 칸만 가진 타입으로 만들어 조각 글·질문 글·키·응답 본문이 들어갈 자리를 두지 않는다.
import { Logger } from '@nestjs/common';
import type { EmbeddingProviderFailure } from './embedding-types';

/** Nest Logger와 같은 모양. 시험은 기록용 logger를 넘긴다. */
export interface IndexLogger {
  log(message: unknown): void;
  warn(message: unknown): void;
  error(message: unknown): void;
}

export type DiscardReason = 'NO_INDEX' | 'NOT_PENDING' | 'DEADLINE_PASSED' | 'PARENT_GONE';

interface EmbedCounts {
  publicationId: string;
  chunkCount: number;
  batchCount: number;
  totalTokens: number;
  durationMs: number;
}

export type PublishedIndexLogEntry =
  | ({ event: 'EMBED_PUBLICATION_COMPLETED'; result: 'DONE' } & EmbedCounts)
  | ({ event: 'EMBED_PUBLICATION_FAILED'; result: 'FAILED'; failure: EmbeddingProviderFailure; httpStatus: number | null } & EmbedCounts)
  | { event: 'EMBED_PUBLICATION_DISCARDED'; publicationId: string; chunkCount: number | null; result: 'DISCARDED'; reason: DiscardReason; durationMs: number }
  | { event: 'EMBED_PUBLICATION_ERROR'; publicationId: string; failure: 'UNEXPECTED_ERROR'; durationMs: number }
  | { event: 'PUBLISHED_SEARCH_FAILED'; publicationId: string; failure: EmbeddingProviderFailure; httpStatus: number | null; durationMs: number }
  | { event: 'PUBLISHED_REINDEX'; publicationId: string; result: 'REQUEUED' | 'NOT_FAILED'; enqueueFailed: boolean }
  | { event: 'EMBEDDING_PROVIDER_SYNTHETIC' };

export function createIndexLogger(): IndexLogger {
  return new Logger('PublishedIndex');
}

/** 사건 하나를 객체 하나로 남긴다. 수준은 observability-design 표대로다. */
export function writeIndexLog(logger: IndexLogger, entry: PublishedIndexLogEntry): void {
  switch (entry.event) {
    case 'EMBED_PUBLICATION_ERROR':
      logger.error(entry);
      return;
    case 'EMBED_PUBLICATION_FAILED':
    case 'PUBLISHED_SEARCH_FAILED':
    case 'EMBEDDING_PROVIDER_SYNTHETIC':
      logger.warn(entry);
      return;
    case 'PUBLISHED_REINDEX':
      if (entry.enqueueFailed) logger.warn(entry);
      else logger.log(entry);
      return;
    default:
      logger.log(entry);
  }
}

/** 처리 시간(ms, 정수). */
export function elapsedMs(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}

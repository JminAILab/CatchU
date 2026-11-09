// 색인 상태·의미 검색 PublishedSearch(계약 C-09, 기능 설계 W3·W5, BR3.1~BR3.3·BR5.1~BR5.8, 비기능 NFR1.1·NFR4.3·NFR4.4).
import { DataSource, EntityManager } from 'typeorm';
import { readStatus, type RunStatus } from '../ai-run/ai-run-spec';
import { persistDeadlineFailure } from '../ai-run/run-status-store';
import type { ChunkSourceKind } from './chunker';
import { type EmbeddingProvider, EmbeddingProviderError, isEmbeddingVector, toVectorLiteral } from './embedding-types';
import { createIndexLogger, elapsedMs, type IndexLogger, writeIndexLog } from './published-index-log';

export type IndexState = RunStatus;

/** 검색 결과 한 칸(C-09 ChunkHit 그대로). C-01 AiSource로 그대로 옮긴다(sourceId = chunkId). */
export interface ChunkHit {
  chunkId: string;
  publishedItemId: string;
  fieldPath: string;
  charStart: number;
  charEnd: number;
  pdfPage: number | null;
  sourceKind: ChunkSourceKind;
  text: string;
  /** 1 - 코사인 거리. 클수록 가깝다 */
  score: number;
  catchEvidenceUrls: string[];
}

export interface SearchResult {
  /** score 내림차순, 같으면 seq 오름차순. 최대 limit개 */
  hits: ChunkHit[];
  /** 그 발행본 조각 글 전부를 seq 순서로 줄바꿈 하나로 이은 글. C-01 검사에만 쓴다 */
  publicationText: string;
}

export interface PublishedSearch {
  getIndexState(publicationId: string, now: Date): Promise<IndexState>;
  search(publicationId: string, query: string, limit: number): Promise<SearchResult>;
}

/** 색인이 DONE이 아니다. 호출자는 409 INDEX_NOT_READY("아직 쓸 수 없음")로 바꾼다(C-09). */
export class IndexNotReady extends Error {
  override readonly name = 'IndexNotReady';

  constructor() {
    super('발행본 검색 색인이 아직 준비되지 않았습니다.');
  }
}

export const MIN_SEARCH_LIMIT = 1;
export const MAX_SEARCH_LIMIT = 50;

/** UPDATE 결과의 바뀐 행 수. TypeORM(PostgreSQL)은 [행, 바뀐 행 수]로 돌려준다. */
export function affectedRows(result: unknown): number {
  return Array.isArray(result) && typeof result[1] === 'number' ? result[1] : 0;
}

/**
 * 색인 상태 판정(W3, BR3.1·BR3.2). 행이 없으면 FAILED(행을 만들지 않음). C-02 readStatus로 판정하고,
 * 시한이 지난 PENDING은 status = 'PENDING'일 때만 FAILED로 저장한다(공용 도우미 persistDeadlineFailure).
 * getIndexState·search·requestReindex·임베딩 처리기 시작이 같은 판정을 쓴다.
 */
export async function readIndexState(manager: EntityManager, publicationId: string, now: Date): Promise<IndexState> {
  const rows: { status: RunStatus; deadline_at: Date }[] = await manager.query(
    'SELECT status, deadline_at FROM publication_index WHERE publication_id = $1', [publicationId]);
  if (rows.length === 0) return 'FAILED';
  const stored = rows[0].status;
  const state = readStatus({ status: stored, deadlineAt: rows[0].deadline_at }, now);
  if (stored === 'PENDING' && state === 'FAILED') {
    await persistDeadlineFailure(manager, { table: 'publication_index', key: { publication_id: publicationId } }, now);
  }
  return state;
}

export interface PublishedSearchDeps {
  dataSource: DataSource;
  provider: EmbeddingProvider;
  logger?: IndexLogger;
  /** search의 상태 판정 시각. 기본은 지금. 시험만 넘긴다 */
  clock?: () => Date;
}

interface HitRow {
  chunk_id: string;
  published_item_id: string;
  field_path: string;
  char_start: number;
  char_end: number;
  pdf_page: number | null;
  source_kind: ChunkSourceKind;
  text: string;
  catch_evidence_urls: string[];
  distance: number;
}

export function createPublishedSearch(deps: PublishedSearchDeps): PublishedSearch {
  const { dataSource, provider } = deps;
  const logger = deps.logger ?? createIndexLogger();
  const clock = deps.clock ?? (() => new Date());

  async function embedQuery(publicationId: string, query: string): Promise<number[]> {
    const startedAt = performance.now();
    try {
      const { vector } = await provider.embedQuery(query);
      if (!isEmbeddingVector(vector)) throw new EmbeddingProviderError('INVALID_RESPONSE');
      return vector;
    } catch (error) {
      // 질문 글은 남기지 않는다. 다시 시도하지 않고 제공자 오류를 그대로 던진다(BR5.3, Q4).
      if (error instanceof EmbeddingProviderError) {
        writeIndexLog(logger, { event: 'PUBLISHED_SEARCH_FAILED', publicationId, failure: error.failure,
          httpStatus: error.httpStatus, durationMs: elapsedMs(startedAt) });
      }
      throw error;
    }
  }

  return {
    getIndexState(publicationId, now) {
      return readIndexState(dataSource.manager, publicationId, now);
    },

    /**
     * 발행본 하나 안의 의미 검색. **호출자는 C-10 링크 조건 판정을 통과한 뒤에만 부른다.**
     * 찾는 범위는 넘긴 발행본의 조각뿐이며 범위를 넓히거나 자료를 빼는 인자는 없다(BR5.2, NFR1.1).
     * 검사 순서: limit → 색인 상태 → 빈 질문 → 질문 임베딩(앞 검사를 모두 통과해야 Voyage를 부른다, NFR4.3).
     */
    async search(publicationId, query, limit) {
      if (!Number.isInteger(limit) || limit < MIN_SEARCH_LIMIT || limit > MAX_SEARCH_LIMIT) {
        throw new RangeError(`limit는 ${MIN_SEARCH_LIMIT} 이상 ${MAX_SEARCH_LIMIT} 이하의 정수여야 합니다.`);
      }
      if (typeof query !== 'string') throw new TypeError('query는 문자열이어야 합니다.');
      if (await readIndexState(dataSource.manager, publicationId, clock()) !== 'DONE') throw new IndexNotReady();
      const texts: { text: string }[] = await dataSource.query(
        'SELECT text FROM published_chunk WHERE publication_id = $1 ORDER BY seq', [publicationId]);
      const publicationText = texts.map((row) => row.text).join('\n');
      if (query.trim() === '') return { hits: [], publicationText };
      const vector = await embedQuery(publicationId, query);
      const rows: HitRow[] = await dataSource.query(
        `SELECT chunk_id, published_item_id, field_path, char_start, char_end, pdf_page, source_kind, text, catch_evidence_urls,
                embedding <=> $2::vector AS distance
           FROM published_chunk
          WHERE publication_id = $1
          ORDER BY distance, seq
          LIMIT $3`,
        [publicationId, toVectorLiteral(vector), limit]);
      return { hits: rows.map(toHit), publicationText };
    },
  };
}

function toHit(row: HitRow): ChunkHit {
  return {
    chunkId: row.chunk_id,
    publishedItemId: row.published_item_id,
    fieldPath: row.field_path,
    charStart: row.char_start,
    charEnd: row.char_end,
    pdfPage: row.pdf_page,
    sourceKind: row.source_kind,
    text: row.text,
    score: 1 - Number(row.distance),
    catchEvidenceUrls: row.catch_evidence_urls,
  };
}

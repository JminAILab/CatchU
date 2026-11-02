// EMBED_PUBLICATION 처리기(계약 C-02, 기능 설계 W2, BR2.1~BR2.6, 비기능 NFR4.1·NFR4.2·NFR4.5·NFR5.2·NFR5.3·NFR6.2).
// 시도는 1회다. 제공자 실패는 FAILED로 쓰고 정상 종료하며, 예기치 못한 오류만 로그 뒤 던진다(상태는 마감 판정에 맡김).
// 외부 호출 중에는 DB 트랜잭션을 열어 두지 않는다(performance-design 「트랜잭션 경계」).
import { DataSource } from 'typeorm';
import type { AiRunHandler } from '../ai-run/ai-run';
import { persistDeadlineFailure } from '../ai-run/run-status-store';
import { EMBEDDING_BATCH_SIZE } from './embedding-config';
import {
  type EmbeddingProvider, EmbeddingProviderError, isEmbeddingVector, toVectorLiteral,
} from './embedding-types';
import { createIndexLogger, type DiscardReason, elapsedMs, type IndexLogger, writeIndexLog } from './published-index-log';
import { affectedRows } from './published-search';

export interface EmbedPublicationHandlerDeps {
  dataSource: DataSource;
  provider: EmbeddingProvider;
  /** 마감 판정 시각. 기본은 지금. 시험만 넘긴다 */
  clock?: () => Date;
  logger?: IndexLogger;
}

interface ChunkRow {
  chunk_id: string;
  text: string;
}

interface IndexRow {
  status: string;
  deadline_at: Date;
}

/** 작업 한 건의 진행. 로그 칸을 채운다. */
interface Progress {
  publicationId: string;
  startedAt: number;
  chunkCount: number | null;
  batchCount: number;
  totalTokens: number;
}

const isForeignKeyViolation = (error: unknown): boolean => {
  const record = error as { code?: unknown; driverError?: { code?: unknown } } | null;
  return record?.code === '23503' || record?.driverError?.code === '23503';
};

/** 처리 시작·저장 때의 다시 확인(BR2.1·BR2.4). 일해도 되면 null, 아니면 버리는 이유. */
function checkPending(rows: IndexRow[], now: Date): DiscardReason | null {
  if (rows.length === 0) return 'NO_INDEX';
  if (rows[0].status !== 'PENDING') return 'NOT_PENDING';
  if (now.getTime() >= rows[0].deadline_at.getTime()) return 'DEADLINE_PASSED';
  return null;
}

export function createEmbedPublicationHandler(deps: EmbedPublicationHandlerDeps): AiRunHandler {
  const { dataSource, provider } = deps;
  const clock = deps.clock ?? (() => new Date());
  const logger = deps.logger ?? createIndexLogger();

  const discard = (progress: Progress, reason: DiscardReason): void => writeIndexLog(logger, {
    event: 'EMBED_PUBLICATION_DISCARDED', publicationId: progress.publicationId, chunkCount: progress.chunkCount,
    result: 'DISCARDED', reason, durationMs: elapsedMs(progress.startedAt),
  });

  const counts = (progress: Progress, chunkCount: number) => ({
    publicationId: progress.publicationId, chunkCount, batchCount: progress.batchCount,
    totalTokens: progress.totalTokens, durationMs: elapsedMs(progress.startedAt),
  });

  async function readIndexRow(publicationId: string, lock: boolean, manager = dataSource.manager): Promise<IndexRow[]> {
    return manager.query(
      `SELECT status, deadline_at FROM publication_index WHERE publication_id = $1${lock ? ' FOR UPDATE' : ''}`, [publicationId]);
  }

  /** 128개씩 차례로 보낸다. 하나라도 실패하면 그 자리에서 멈춘다(BR2.3·BR2.5, NFR4.1). */
  async function embedAll(chunks: ChunkRow[], progress: Progress): Promise<number[][]> {
    const vectors: number[][] = [];
    for (let start = 0; start < chunks.length; start += EMBEDDING_BATCH_SIZE) {
      const batch = chunks.slice(start, start + EMBEDDING_BATCH_SIZE);
      progress.batchCount += 1;
      const result = await provider.embedDocuments(batch.map((chunk) => chunk.text));
      if (result.vectors.length !== batch.length || !result.vectors.every(isEmbeddingVector)) {
        throw new EmbeddingProviderError('INVALID_RESPONSE');
      }
      progress.totalTokens += result.totalTokens;
      vectors.push(...result.vectors);
    }
    return vectors;
  }

  async function markFailed(progress: Progress, chunkCount: number, error: EmbeddingProviderError): Promise<void> {
    const now = clock();
    const updated = affectedRows(await dataSource.query(
      `UPDATE publication_index SET status = 'FAILED', updated_at = $2 WHERE publication_id = $1 AND status = 'PENDING'`,
      [progress.publicationId, now]));
    if (updated === 0) {
      discard(progress, 'NOT_PENDING');
      return;
    }
    writeIndexLog(logger, { event: 'EMBED_PUBLICATION_FAILED', ...counts(progress, chunkCount), result: 'FAILED',
      failure: error.failure, httpStatus: error.httpStatus });
  }

  /** 짧은 트랜잭션 하나: 잠그고 다시 확인 → 조각 벡터를 한 문장으로 → DONE(BR2.4, NFR5.2). */
  async function save(progress: Progress, chunks: ChunkRow[], vectors: number[][]): Promise<DiscardReason | null> {
    return dataSource.transaction(async (manager) => {
      // 시각은 잠금을 얻은 뒤 읽는다. 잠금을 기다리는 사이 마감이 지나면 버려야 한다(C-02 늦은 결과, BR2.4).
      const rows = await readIndexRow(progress.publicationId, true, manager);
      const now = clock();
      const reason = checkPending(rows, now);
      if (reason !== null) return reason;
      if (chunks.length > 0) {
        const updated = affectedRows(await manager.query(
          `UPDATE published_chunk AS c SET embedding = v.embedding::vector
             FROM (SELECT unnest($2::uuid[]) AS chunk_id, unnest($3::text[]) AS embedding) AS v
            WHERE c.publication_id = $1 AND c.chunk_id = v.chunk_id`,
          [progress.publicationId, chunks.map((chunk) => chunk.chunk_id), vectors.map(toVectorLiteral)]));
        if (updated !== chunks.length) throw new Error('조각 벡터 갱신 수가 읽은 조각 수와 다릅니다.');
      }
      await manager.query(`UPDATE publication_index SET status = 'DONE', updated_at = $2 WHERE publication_id = $1`,
        [progress.publicationId, now]);
      return null;
    });
  }

  async function run(progress: Progress): Promise<void> {
    const { publicationId } = progress;
    const now = clock();
    const startReason = checkPending(await readIndexRow(publicationId, false), now);
    if (startReason !== null) {
      if (startReason === 'DEADLINE_PASSED') {
        await persistDeadlineFailure(dataSource.manager, { table: 'publication_index', key: { publication_id: publicationId } }, now);
      }
      discard(progress, startReason);
      return;
    }
    const chunks: ChunkRow[] = await dataSource.query(
      'SELECT chunk_id, text FROM published_chunk WHERE publication_id = $1 ORDER BY seq', [publicationId]);
    progress.chunkCount = chunks.length;
    let vectors: number[][];
    try {
      vectors = await embedAll(chunks, progress);
    } catch (error) {
      if (!(error instanceof EmbeddingProviderError)) throw error;
      await markFailed(progress, chunks.length, error);
      return;
    }
    let saveReason: DiscardReason | null;
    try {
      saveReason = await save(progress, chunks, vectors);
    } catch (error) {
      // 저장 중 부모(발행본)가 지워져 거부되면 다시 시도하지 않고 버린다(FR14.10, NFR5.2).
      if (!isForeignKeyViolation(error)) throw error;
      saveReason = 'PARENT_GONE';
    }
    if (saveReason !== null) {
      discard(progress, saveReason);
      return;
    }
    writeIndexLog(logger, { event: 'EMBED_PUBLICATION_COMPLETED', ...counts(progress, chunks.length), result: 'DONE' });
  }

  return async (job) => {
    const publicationId = job.payload.publicationId;
    const progress: Progress = { publicationId, startedAt: performance.now(), chunkCount: null, batchCount: 0, totalTokens: 0 };
    try {
      if (typeof publicationId !== 'string') throw new TypeError('EMBED_PUBLICATION 작업에 publicationId가 없습니다.');
      await run(progress);
    } catch (error) {
      // 발행본 ID와 오류 종류만 남기고 던진다. AiRun이 실패로 기록하며 다시 돌리지 않는다(BR2.5).
      writeIndexLog(logger, { event: 'EMBED_PUBLICATION_ERROR', publicationId: String(publicationId),
        failure: 'UNEXPECTED_ERROR', durationMs: elapsedMs(progress.startedAt) });
      throw error;
    }
  };
}

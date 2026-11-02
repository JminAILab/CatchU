// 색인 기록기 PublishedIndexWriter(계약 C-08, 기능 설계 W1·W4, BR1.7·BR1.8·BR4.1·BR4.2, 비기능 NFR2.4·NFR4.3).
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import type { AiRun } from '../ai-run/ai-run';
import { buildChunkDrafts, type ChunkSourceItem, type ChunkSourcePdfPage } from './chunker';
import { embeddingDeadline } from './embedding-config';
import { PublicationIndex } from './publication-index.entity';
import { PublishedChunk } from './published-chunk.entity';
import { createIndexLogger, type IndexLogger, writeIndexLog } from './published-index-log';
import { affectedRows, readIndexState } from './published-search';

export type ReindexResult = 'REQUEUED' | 'NOT_FAILED';

export interface PublishedIndexWriter {
  /**
   * U4가 연 발행 트랜잭션 안에서 부른다. 넘겨받은 manager로만 published_item(·published_pdf_page)을 읽고
   * published_chunk(임베딩 없음)와 publication_index(PENDING, 마감 = now + 10분)를 쓴다. 외부 호출·큐 호출이 없다.
   * 예외를 던지면 U4가 트랜잭션 전체를 되돌린다 = 발행 실패(BR1.7, AC4.1.8).
   */
  chunkInTransaction(manager: EntityManager, publicationId: string, now: Date): Promise<void>;
  /**
   * [검색 다시 준비]. 작성자 확인은 U4가 먼저 한다. FAILED일 때만 PENDING·새 마감으로 돌리고 임베딩만 새 runKey로
   * 다시 등록한다. 조각은 다시 나누지 않고 하루 실행 제한에 세지 않는다(BR4.1·BR4.2, ADR-007).
   */
  requestReindex(publicationId: string, now: Date): Promise<ReindexResult>;
}

export interface PublishedIndexWriterDeps {
  dataSource: DataSource;
  aiRun: Pick<AiRun, 'enqueueAfterCommit'>;
  logger?: IndexLogger;
}

/** 한 INSERT 문에 넣는 조각 수. 매개변수 상한(65535)보다 넉넉히 작게 나눈다. */
const CHUNK_INSERT_BATCH = 500;

interface ItemRow {
  published_item_id: string;
  position: number;
  item_kind: string;
  snapshot: unknown;
}

interface PdfPageRow {
  published_item_id: string;
  page_number: number;
  text: string;
  readable: boolean;
}

export function createPublishedIndexWriter(deps: PublishedIndexWriterDeps): PublishedIndexWriter {
  const { dataSource, aiRun } = deps;
  const logger = deps.logger ?? createIndexLogger();

  return {
    async chunkInTransaction(manager, publicationId, now) {
      if (!manager.queryRunner?.isTransactionActive) {
        throw new Error('chunkInTransaction은 발행 트랜잭션의 manager로만 부릅니다.');
      }
      const items = await readItems(manager, publicationId);
      const drafts = buildChunkDrafts(items);
      const chunks = drafts.map((draft, index) => Object.assign(new PublishedChunk(), {
        ...draft, publicationId, seq: index + 1, embedding: null,
      }));
      const repository = manager.getRepository(PublishedChunk);
      for (let start = 0; start < chunks.length; start += CHUNK_INSERT_BATCH) {
        await repository.insert(chunks.slice(start, start + CHUNK_INSERT_BATCH));
      }
      await manager.getRepository(PublicationIndex).insert({
        publicationId, status: 'PENDING', deadlineAt: embeddingDeadline(now), updatedAt: now,
      });
    },

    async requestReindex(publicationId, now) {
      const finish = (result: ReindexResult, enqueueFailed: boolean): ReindexResult => {
        writeIndexLog(logger, { event: 'PUBLISHED_REINDEX', publicationId, result, enqueueFailed });
        return result;
      };
      if (await readIndexState(dataSource.manager, publicationId, now) !== 'FAILED') return finish('NOT_FAILED', false);
      // 조건부 UPDATE 한 문장(자동 커밋). 그사이 다른 요청이 먼저 돌렸으면 바뀐 행이 0개다.
      const updated = affectedRows(await dataSource.query(
        `UPDATE publication_index SET status = 'PENDING', deadline_at = $2, updated_at = $3
          WHERE publication_id = $1 AND status = 'FAILED'`,
        [publicationId, embeddingDeadline(now), now]));
      if (updated === 0) return finish('NOT_FAILED', false);
      // 커밋 뒤 등록. 실패해도 접수는 그대로이고 상태는 시한으로 FAILED가 된다(C-02, BR4.2).
      const enqueued = await aiRun.enqueueAfterCommit(
        'EMBED_PUBLICATION', `EMBED_PUBLICATION-${publicationId}-${randomUUID()}`, { publicationId });
      return finish('REQUEUED', enqueued === 'ENQUEUE_FAILED');
    },
  };
}

/** 발행 항목을 position 순으로 읽는다. PDF 항목이 있을 때만 쪽 사본(published_pdf_page, U8)을 읽는다. */
async function readItems(manager: EntityManager, publicationId: string): Promise<ChunkSourceItem[]> {
  const rows: ItemRow[] = await manager.query(
    `SELECT published_item_id, position, item_kind, snapshot FROM published_item
      WHERE publication_id = $1 ORDER BY position`, [publicationId]);
  const pages = rows.some((row) => row.item_kind === 'PDF_MATERIAL') ? await readPdfPages(manager, publicationId) : new Map();
  return rows.map((row) => ({
    publishedItemId: row.published_item_id,
    position: row.position,
    itemKind: row.item_kind,
    snapshot: row.snapshot,
    pdfPages: row.item_kind === 'PDF_MATERIAL' ? pages.get(row.published_item_id) ?? [] : null,
  }));
}

async function readPdfPages(manager: EntityManager, publicationId: string): Promise<Map<string, ChunkSourcePdfPage[]>> {
  const rows: PdfPageRow[] = await manager.query(
    `SELECT p.published_item_id, p.page_number, p.text, p.readable FROM published_pdf_page p
       JOIN published_item i ON i.published_item_id = p.published_item_id
      WHERE i.publication_id = $1 ORDER BY p.published_item_id, p.page_number`, [publicationId]);
  const pages = new Map<string, ChunkSourcePdfPage[]>();
  for (const row of rows) {
    const list = pages.get(row.published_item_id) ?? [];
    list.push({ pageNumber: row.page_number, text: row.text, readable: row.readable });
    pages.set(row.published_item_id, list);
  }
  return pages;
}

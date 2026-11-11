// 발행의 PDF 부분(U8 기능 명세 W3, 계약 C-17, 업무 규칙 BR4.1~BR4.5·BR5.1~BR5.6). U4 발행 서비스(publish.service.ts)가 부른다.
// C-17 순서: 사전 확인(트랜잭션 밖) → 1단계 ID 선생성(호출자) → 2단계 position 순 복사 → 3단계 복사 실패면 접두어 정리 1회·500 →
// 4단계 트랜잭션 안 재확인·글 합계·사본 행 → 5단계 트랜잭션 실패면 접두어 정리 1회·원래 오류 → 6단계 정리 실패는 로그만.
// PDF 항목이 없으면 이 파일의 어떤 함수도 부르지 않는다(BR5.6). 키·경로·제목·쪽 글은 로그·오류에 넣지 않는다.
import { Logger, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ApiError } from '../common/errors';
import { type FileStorage, materialKey, publicationPrefix, publishedPdfKey } from '../file-storage/file-storage';
import { readPdfStatesForPublish } from '../materials/pdf-material-store';
import type { PublishItemInput } from './publish-input';

/** 발행할 PDF 항목 하나. position은 0부터인 요청 순서, publishedItemId는 1단계에서 미리 만든 값이다. */
export interface PdfPublishItem {
  position: number;
  sourceId: string;
  publishedItemId: string;
}

/** 트랜잭션 안에서 잠그고 다시 읽은 PDF 원본. */
export interface LockedPdf {
  pdfMaterialId: string;
  title: string;
  pageCount: number;
  /** 쪽 글 코드 포인트 합(PostgreSQL char_length = UTF-8 문자 수 = 코드 포인트). 읽을 수 없는 쪽은 빈 글이라 0이다. */
  textLength: number;
}

/** 2단계 복사 실패(BR5.3). 응답은 전역 오류 형식의 500 INTERNAL_ERROR이며 키·원인 값을 담지 않는다. */
export class PdfCopyFailedError extends Error {
  override readonly name = 'PdfCopyFailedError';

  constructor() {
    super('PDF 사본을 만들지 못했습니다.');
  }
}

/** 잠근 PDF의 쪽 행 수가 DONE 때 정한 쪽 수와 다르다(BR4.3). 서버 오류이며 발행 전체가 되돌아간다. */
export class PdfCopyIntegrityError extends Error {
  override readonly name = 'PdfCopyIntegrityError';

  constructor() {
    super('PDF 쪽 사본 수가 맞지 않습니다.');
  }
}

const logger = new Logger('PdfPublish');

/** PDF 항목만 고른다(요청 순서 유지). */
export function pdfItems(items: readonly PublishItemInput[], publishedItemIds: readonly string[]): PdfPublishItem[] {
  return items.flatMap((item, position) => item.kind === 'PDF_MATERIAL'
    ? [{ position, sourceId: item.sourceId, publishedItemId: publishedItemIds[position] }]
    : []);
}

/** 400 VALIDATION_FAILED extractionIncomplete(BR4.1). 새 오류 코드는 만들지 않는다. */
function extractionIncomplete(positions: readonly number[]): ApiError {
  return new ApiError('VALIDATION_FAILED', {
    details: { violations: positions.map((position) => ({ field: `items[${position}].sourceId`, reason: 'extractionIncomplete' })) },
  });
}

/**
 * 사전 확인(W3 2, 발행 트랜잭션 밖·복사 전): 작성자 기준 시한 판정을 거친 상태가 모두 DONE이어야 한다. 없거나 남의 것은 U4와 같은 404,
 * DONE이 아닌 것이 있으면 400 extractionIncomplete(해당 항목 위치마다 하나). 시한 판정(PENDING → FAILED DEADLINE_EXCEEDED)은 목록·상세처럼
 * 커밋되어야 하므로 상태 읽기 트랜잭션을 먼저 끝낸 뒤 그 밖에서 판정한다.
 */
export async function assertPdfsDone(dataSource: DataSource, owner: string, items: readonly PdfPublishItem[]): Promise<void> {
  const ids = items.map((item) => item.sourceId);
  const states = await dataSource.transaction('READ COMMITTED', (manager) => readPdfStatesForPublish(manager, owner, ids));
  if (items.some((item) => !states.has(item.sourceId))) throw new NotFoundException();
  const notDone = items.filter((item) => states.get(item.sourceId) !== 'DONE').map((item) => item.position);
  if (notDone.length > 0) throw extractionIncomplete(notDone);
}

/** 2·3단계: position 순으로 복사하고, 하나라도 실패하면 접두어를 한 번 정리한 뒤 500으로 끝낸다(BR5.2·BR5.3). */
export async function copyPdfs(
  files: FileStorage, owner: string, publicationId: string, items: readonly PdfPublishItem[],
): Promise<void> {
  for (const item of items) {
    try {
      await files.copy(materialKey(owner, item.sourceId), publishedPdfKey(owner, publicationId, item.publishedItemId));
    } catch (error) {
      logger.warn({ event: 'PDF_COPY_FAILED', publicationId, errorType: errorType(error) });
      await cleanupPrefix(files, owner, publicationId, 3);
      throw new PdfCopyFailedError();
    }
  }
}

/** 3·5단계 접두어 정리 1회. 실패는 로그만 남긴다(6단계, BR5.5). 접두어 값은 남기지 않는다. */
export async function cleanupPrefix(files: FileStorage, owner: string, publicationId: string, stage: 3 | 5): Promise<void> {
  try {
    await files.deletePrefix(publicationPrefix(owner, publicationId));
  } catch (error) {
    logger.error({ event: 'PREFIX_CLEANUP_FAILED', publicationId, stage, errorType: errorType(error) });
  }
}

/**
 * 4단계 재확인(BR4.2): U4 잠금 뒤에 고른 PDF를 pdf_material_id 오름차순으로 FOR SHARE 잠그고 DONE을 다시 확인한다.
 * 없으면 404, DONE이 아니면 400 extractionIncomplete. 쪽 글 합계(코드 포인트)도 같은 잠금 안에서 센다.
 */
export async function lockPdfsForPublish(
  manager: EntityManager, owner: string, items: readonly PdfPublishItem[],
): Promise<Map<string, LockedPdf>> {
  const ids = [...new Set(items.map((item) => item.sourceId))].sort();
  const rows: { pdfMaterialId: string; title: string; state: string; pageCount: number | null }[] = await manager.query(`
    SELECT pdf_material_id AS "pdfMaterialId", title, extraction_state AS state, page_count AS "pageCount" FROM pdf_material
    WHERE member_id = $1 AND pdf_material_id = ANY($2::uuid[]) ORDER BY pdf_material_id ASC FOR SHARE`, [owner, ids]);
  const byId = new Map(rows.map((row) => [row.pdfMaterialId, row]));
  if (items.some((item) => !byId.has(item.sourceId))) throw new NotFoundException();
  const notDone = items.filter((item) => byId.get(item.sourceId)!.state !== 'DONE').map((item) => item.position);
  if (notDone.length > 0) throw extractionIncomplete(notDone);
  const lengths: { pdfMaterialId: string; textLength: string }[] = await manager.query(`
    SELECT pdf_material_id AS "pdfMaterialId", COALESCE(SUM(char_length(text)), 0) AS "textLength" FROM pdf_page_text
    WHERE pdf_material_id = ANY($1::uuid[]) GROUP BY pdf_material_id`, [ids]);
  const lengthOf = new Map(lengths.map((row) => [row.pdfMaterialId, Number(row.textLength)]));
  return new Map(rows.map((row) => [row.pdfMaterialId, {
    pdfMaterialId: row.pdfMaterialId, title: row.title, pageCount: row.pageCount as number, textLength: lengthOf.get(row.pdfMaterialId) ?? 0,
  }]));
}

/** 사본 쪽 행(BR4.3): 그 시점 pdf_page_text를 읽을 수 없는 쪽까지 그대로 복사한다. 복사한 행 수가 쪽 수와 다르면 되돌린다. */
export async function copyPdfPages(manager: EntityManager, publishedItemId: string, pdf: LockedPdf): Promise<void> {
  const inserted: unknown[] = await manager.query(`
    INSERT INTO published_pdf_page (published_pdf_page_id, published_item_id, page_number, text, readable)
    SELECT gen_random_uuid(), $1, page_number, text, readable FROM pdf_page_text WHERE pdf_material_id = $2
    RETURNING page_number`, [publishedItemId, pdf.pdfMaterialId]);
  if (inserted.length !== pdf.pageCount) throw new PdfCopyIntegrityError();
}

function errorType(error: unknown): string {
  return error instanceof Error ? error.name : 'Unknown';
}

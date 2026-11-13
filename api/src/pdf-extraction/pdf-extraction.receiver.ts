// PDF 글 추출 결과 수신(계약 C-16 receipt, U8 기능 명세 W2 「api 수신」, 업무 규칙 BR2.1·BR2.2·BR3.3·BR3.4·BR3.5,
// 신뢰성 설계 §1·§3, 보안 설계 §4·§9, 관측 설계 §1 `PDF_EXTRACTION_RECEIVED`).
// worker-messages 큐의 `PdfExtractionResult` 작업을 WorkerMessageConsumer가 여기로 넘긴다. 10월 결과 수신과 같은 원칙이다:
// 판정과 저장을 한 트랜잭션에서, ACCEPTED/OK는 커밋 뒤에만, 저장 실패는 수신 확인 없이 예외(작업 실패), 거부된 결과는 다시 받지 않는다.
import { Logger, LoggerService } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import type { PdfExtractionFailureCode, PdfExtractionState } from '../materials/pdf-material.entity';
import {
  PDF_EXTRACT_SCHEMA_VERSION, isPdfExtractionResultMessageId, isValidPdfExtractionResult,
  type PdfExtractionPage, type PdfExtractionReceipt, type PdfExtractionRejectionCode, type PdfExtractionResult,
} from './pdf-extraction-spec';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 저장(판정·쪽 행 INSERT·상태 UPDATE·커밋)이 실패했다. 원문 DB 오류는 싣지 않는다(BR3.5: 메시지 본문이 오류 문구에 섞이지 않게).
 * 소비자는 이 오류를 수신 확인 없는 작업 실패(RECEIVER_STORAGE_UNAVAILABLE)로 끝낸다. 자료는 시한 판정으로 FAILED가 된다(BR3.4).
 */
export class PdfExtractionStorageError extends Error {
  constructor() {
    super('PDF extraction receiver storage unavailable');
    this.name = 'PdfExtractionStorageError';
  }
}

/** 수신 확인을 만들 수 있는 최소 식별자. 모양 검사에 실패해도 이것이 있으면 SCHEMA_INVALID 수신 확인을 돌려준다(10월 receiptIds와 같은 역할). */
interface ResultIds {
  messageId: string;
  pdfMaterialId: string;
}

interface MaterialRow {
  memberId: string;
  extractionState: PdfExtractionState;
  expired: boolean;
}

export interface PdfExtractionReceiverOptions {
  /** 모양 검사. 기본은 pdf-extraction-spec.ts의 규칙이며 WorkerMessageValidator.pdfExtractionResult도 같은 규칙이다. */
  validator?: { pdfExtractionResult(value: unknown): value is PdfExtractionResult };
  logger?: Pick<LoggerService, 'log'>;
}

/**
 * 수신 판정 5종(BR3.3)을 `pdf_material` 행 잠금(`FOR UPDATE`) 안에서 차례로 적용하고 저장한다.
 *
 * 1. 모양 검사 실패 → 트랜잭션 없이 `REJECTED/SCHEMA_INVALID`. 식별자(messageId·UUID 모양 pdfMaterialId)조차 없으면 null(수신 확인 없음, 작업은 완료).
 * 2. 행 없음(삭제·탈퇴) 또는 회원 불일치 → `REJECTED/CONTEXT_MISMATCH`, 저장 없음.
 * 3. DONE → `DUPLICATE/ALREADY_RECEIVED`(내용 비교 없음).
 * 4. FAILED, 또는 PENDING인데 시한 지남(이때 BR2.2로 FAILED/DEADLINE_EXCEEDED 저장) → `REJECTED/STALE_ATTEMPT`.
 * 5. PENDING·시한 전 → SUCCEEDED면 쪽 행 전부 INSERT + pageCount·DONE, FAILED면 FAILED + failureCode → 커밋 뒤 `ACCEPTED/OK`.
 *
 * INSERT·UPDATE·커밋이 실패하면 전부 되돌아가고(0행·PENDING 그대로) PdfExtractionStorageError를 던진다(수신 확인 없음).
 * 로그 `PDF_EXTRACTION_RECEIVED`에는 pdfMaterialId·messageId·disposition·code·pageCount만 싣는다. 글·제목·memberId는 넣지 않는다.
 */
export class PdfExtractionReceiver {
  private readonly validator: { pdfExtractionResult(value: unknown): value is PdfExtractionResult };
  private readonly logger: Pick<LoggerService, 'log'>;

  constructor(private readonly dataSource: DataSource, options: PdfExtractionReceiverOptions = {}) {
    this.validator = options.validator ?? { pdfExtractionResult: isValidPdfExtractionResult };
    this.logger = options.logger ?? new Logger('PdfExtractionReceiver');
  }

  async receive(input: unknown): Promise<PdfExtractionReceipt | null> {
    const ids = resultIds(input);
    if (ids === null) {
      this.record(null, null, null);
      return null;
    }
    if (!this.validator.pdfExtractionResult(input)) return this.reject(ids, 'SCHEMA_INVALID', null);
    // 첫 await 전에 복제해 호출부 변경이 검증과 저장 사이에 끼어들지 않게 한다(10월 수신과 같은 이유).
    const result: PdfExtractionResult = structuredClone(input);
    let outcome: { receipt: PdfExtractionReceipt; pageCount: number | null };
    try {
      outcome = await this.dataSource.transaction('READ COMMITTED', async (manager) => this.settle(manager, ids, result));
    } catch {
      // 수신 확인은 커밋 뒤에만 밖으로 나간다. 원문 DB 오류도 노출하지 않는다.
      throw new PdfExtractionStorageError();
    }
    this.record(ids, outcome.receipt, outcome.pageCount);
    return outcome.receipt;
  }

  /** 잠금 조회부터 저장까지. 돌려준 값은 커밋 뒤에 호출자에게 전달된다. */
  private async settle(manager: EntityManager, ids: ResultIds, result: PdfExtractionResult)
    : Promise<{ receipt: PdfExtractionReceipt; pageCount: number | null }> {
    const rows: MaterialRow[] = await manager.query(`
      SELECT member_id AS "memberId", extraction_state AS "extractionState", extraction_deadline_at <= clock_timestamp() AS expired
      FROM pdf_material WHERE pdf_material_id = $1 FOR UPDATE`, [result.pdfMaterialId]);
    const row = rows[0];
    if (row === undefined || row.memberId !== result.memberId) return { receipt: rejection(ids, 'CONTEXT_MISMATCH'), pageCount: null };
    if (row.extractionState === 'DONE') {
      return { receipt: { ...receiptBase(ids), disposition: 'DUPLICATE', code: 'ALREADY_RECEIVED' }, pageCount: null };
    }
    if (row.extractionState === 'FAILED') return { receipt: rejection(ids, 'STALE_ATTEMPT'), pageCount: null };
    if (row.expired) {
      // BR2.2: 상태를 읽는 자리에서 시한이 지난 PENDING을 FAILED로 확정한다. 늦게 온 결과는 버린다(NFR5.3).
      await markFailed(manager, result.pdfMaterialId, 'DEADLINE_EXCEEDED');
      return { receipt: rejection(ids, 'STALE_ATTEMPT'), pageCount: null };
    }
    if (result.outcome === 'FAILED') {
      // 모양 검사가 failureCode를 보장한다(FAILED ⇒ worker 사유 코드).
      await markFailed(manager, result.pdfMaterialId, result.failureCode as PdfExtractionFailureCode);
      return { receipt: { ...receiptBase(ids), disposition: 'ACCEPTED', code: 'OK' }, pageCount: null };
    }
    const pages = result.pages as PdfExtractionPage[];
    await insertPages(manager, result.pdfMaterialId, pages);
    const updated = await manager.query(`
      UPDATE pdf_material SET page_count = $2, extraction_state = 'DONE', updated_at = clock_timestamp()
      WHERE pdf_material_id = $1 AND extraction_state = 'PENDING'`, [result.pdfMaterialId, pages.length]) as [unknown[], number];
    if (updated[1] !== 1) throw new Error('PDF 자료 상태 갱신 결과가 올바르지 않습니다.');
    return { receipt: { ...receiptBase(ids), disposition: 'ACCEPTED', code: 'OK' }, pageCount: pages.length };
  }

  private reject(ids: ResultIds, code: PdfExtractionRejectionCode, pageCount: number | null): PdfExtractionReceipt {
    const receipt = rejection(ids, code);
    this.record(ids, receipt, pageCount);
    return receipt;
  }

  /** 관측 설계 §1의 필드만. ID는 모양이 맞을 때만 그대로 남긴다(밖에서 온 값). */
  private record(ids: ResultIds | null, receipt: PdfExtractionReceipt | null, pageCount: number | null): void {
    this.logger.log({
      event: 'PDF_EXTRACTION_RECEIVED',
      pdfMaterialId: ids !== null && UUID.test(ids.pdfMaterialId) ? ids.pdfMaterialId.toLowerCase() : null,
      messageId: ids !== null && isPdfExtractionResultMessageId(ids.messageId) ? ids.messageId : null,
      disposition: receipt?.disposition ?? null,
      code: receipt?.code ?? null,
      pageCount,
    });
  }
}

/** 식별자만 읽는다. pdfMaterialId가 UUID 모양이고 messageId가 빈 문자열이 아닐 때만 수신 확인을 만들 수 있다. */
function resultIds(value: unknown): ResultIds | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const { messageId, pdfMaterialId } = value as Record<string, unknown>;
  if (typeof messageId !== 'string' || messageId.length === 0) return null;
  if (typeof pdfMaterialId !== 'string' || !UUID.test(pdfMaterialId)) return null;
  return { messageId, pdfMaterialId };
}

function receiptBase(ids: ResultIds): { schemaVersion: typeof PDF_EXTRACT_SCHEMA_VERSION; messageId: string; pdfMaterialId: string } {
  return { schemaVersion: PDF_EXTRACT_SCHEMA_VERSION, messageId: ids.messageId, pdfMaterialId: ids.pdfMaterialId };
}

function rejection(ids: ResultIds, code: PdfExtractionRejectionCode): PdfExtractionReceipt {
  return { ...receiptBase(ids), disposition: 'REJECTED', code };
}

/** 조건부 UPDATE(BR2.1): PENDING일 때만 FAILED로 바꾼다. 잠금 안이라 1행이어야 한다. */
async function markFailed(manager: EntityManager, pdfMaterialId: string, failureCode: PdfExtractionFailureCode): Promise<void> {
  const updated = await manager.query(`
    UPDATE pdf_material SET extraction_state = 'FAILED', extraction_failure_code = $2, updated_at = clock_timestamp()
    WHERE pdf_material_id = $1 AND extraction_state = 'PENDING'`, [pdfMaterialId, failureCode]) as [unknown[], number];
  if (updated[1] !== 1) throw new Error('PDF 자료 상태 갱신 결과가 올바르지 않습니다.');
}

/**
 * 쪽 행 전부를 한 문장으로 넣는다(BR3.4 전부 아니면 전무). 글은 jsonb로 넘겨 DB 드라이버의 배열 이스케이프에 기대지 않는다.
 * 어느 한 행이 제약(UNIQUE·CHECK)에 걸리면 문장 전체가 실패해 트랜잭션이 되돌아간다.
 */
async function insertPages(manager: EntityManager, pdfMaterialId: string, pages: PdfExtractionPage[]): Promise<void> {
  const payload = pages.map((page) => ({ id: randomUUID(), pageNumber: page.pageNumber, text: page.text, readable: page.readable }));
  // INSERT는 드라이버가 영향 행 수를 돌려주지 않으므로(UPDATE·DELETE만) RETURNING으로 넣은 행 수를 센다.
  const inserted: unknown[] = await manager.query(`
    INSERT INTO pdf_page_text (pdf_page_text_id, pdf_material_id, page_number, text, readable)
    SELECT (page->>'id')::uuid, $1, (page->>'pageNumber')::int, page->>'text', (page->>'readable')::boolean
    FROM jsonb_array_elements($2::jsonb) AS page
    RETURNING page_number`, [pdfMaterialId, JSON.stringify(payload)]);
  if (inserted.length !== pages.length) throw new Error('PDF 쪽 글 저장 결과가 올바르지 않습니다.');
}

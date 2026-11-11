import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ApiError } from '../common/errors';
import { PDF_EXTRACTION_DEADLINE_MINUTES } from '../pdf-extraction/pdf-extraction-spec';
import { PDF_MATERIAL_LIMITS, PdfMaterialQuery, nextPdfMaterialCursor, pdfMaterialQuery } from './pdf-material-input';
import type { PdfExtractionFailureCode, PdfExtractionState } from './pdf-material.entity';
import { isUuid } from './text-material-input';

/** 업로드 응답(U8 기능 명세 W1-A 7단계). */
export interface PdfMaterialCreated {
  pdfMaterialId: string;
  title: string;
  fileSizeBytes: number;
  extractionState: PdfExtractionState;
}

/** 목록 항목(W1-B 1단계). 상태는 BR2.2 시한 판정을 거친 값이다. */
export interface PdfMaterialSummary extends PdfMaterialCreated {
  pageCount: number | null;
  failureCode: PdfExtractionFailureCode | null;
}

/** 상세(W1-B 2단계): 목록 항목 + 쪽 목록(쪽 번호·읽을 수 있음만, 글 본문 없음). */
export interface PdfMaterialDetail extends PdfMaterialSummary {
  pages: { pageNumber: number; readable: boolean }[];
}

export interface PdfMaterialPage {
  items: PdfMaterialSummary[];
  page: { nextCursor: string | null };
}

/** 소유 확인 결과. 원본 열람·삭제는 이 storageKey(DB에서 읽은 값)만 쓴다(NFR1.7). */
export interface OwnedPdfMaterial {
  pdfMaterialId: string;
  storageKey: string;
}

export interface NewPdfMaterial {
  pdfMaterialId: string;
  title: string;
  storageKey: string;
  fileSizeBytes: number;
}

const SUMMARY_COLUMNS = `pdf_material_id AS "pdfMaterialId", title, file_size_bytes AS "fileSizeBytes", page_count AS "pageCount",
  extraction_state AS "extractionState", extraction_failure_code AS "failureCode"`;

/**
 * PDF 자료(U8 기능 설계 entities.md PdfMaterial, 계약 C-05·C-06) 저장소.
 *
 * - 모든 조회·삭제는 `member_id = 인증 회원` 조건을 넣는다. 남의 것·없는 것·UUID 형식이 아닌 ID는 같은 404다(BR1.8, NFR1.1).
 * - 생성은 회원 행을 `FOR UPDATE`로 잠근 안에서 벌 수를 세고 넣어 동시 업로드에도 회원당 20벌을 넘지 않는다(BR1.2, NFR4.1·NFR4.12).
 * - 상태를 읽는 자리(목록·상세)는 시한이 지난 PENDING을 조건부 UPDATE로 FAILED(DEADLINE_EXCEEDED)로 바꾼 뒤 읽는다(BR2.1·BR2.2).
 * - 파일은 여기서 다루지 않는다. 호출자가 FileStorage를 먼저 부르고(BR1.6·BR1.7) 이 저장소는 행만 쓴다.
 * - 제목·글은 로그·오류에 남기지 않는다. `publications`를 import하지 않는다(텍스트 자료와 같은 의존 방향).
 */
@Injectable()
export class PdfMaterialStore {
  constructor(@Inject(DataSource) private readonly dataSource: DataSource) {}

  /** 회원 행 잠금 → COUNT(20 이상이면 400 maxCount) → PENDING INSERT. 시한은 넣는 시각 + 10분이다(BR1.6). */
  async create(memberId: string, input: NewPdfMaterial): Promise<PdfMaterialCreated> {
    const owner = ownerId(memberId);
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      await lockMember(manager, owner);
      const [{ n }] = await manager.query('SELECT count(*)::int AS n FROM pdf_material WHERE member_id = $1', [owner]) as [{ n: number }];
      if (n >= PDF_MATERIAL_LIMITS.perMember) {
        throw new ApiError('VALIDATION_FAILED', { details: { violations: [{ field: 'materials', reason: 'maxCount' }] } });
      }
      const rows: PdfMaterialCreated[] = await manager.query(`
        INSERT INTO pdf_material (pdf_material_id, member_id, title, storage_key, file_size_bytes, page_count, extraction_state,
          extraction_deadline_at, extraction_failure_code, created_at, updated_at)
        SELECT $1, $2, $3, $4, $5, NULL, 'PENDING', ts + ($6::int * interval '1 minute'), NULL, ts, ts
        FROM (SELECT clock_timestamp() AS ts) AS at
        RETURNING pdf_material_id AS "pdfMaterialId", title, file_size_bytes AS "fileSizeBytes", extraction_state AS "extractionState"`,
      [input.pdfMaterialId, owner, input.title, input.storageKey, input.fileSizeBytes, PDF_EXTRACTION_DEADLINE_MINUTES]);
      if (rows.length !== 1) throw new Error('PDF 자료 생성 결과가 올바르지 않습니다.');
      return rows[0];
    });
  }

  async list(memberId: string, rawQuery: unknown): Promise<PdfMaterialPage> {
    const owner = ownerId(memberId);
    const query = pdfMaterialQuery(owner, rawQuery);
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      await assertMemberExists(manager, owner);
      await settleDeadlines(manager, owner, null);
      const rows: (PdfMaterialSummary & { cursorAt: string })[] = await manager.query(`
        SELECT ${SUMMARY_COLUMNS},
          to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "cursorAt"
        FROM pdf_material
        WHERE member_id = $1 ${pageCondition(query)}
        ORDER BY created_at DESC, pdf_material_id DESC
        LIMIT $2`, pageValues(owner, query));
      const pageRows = rows.slice(0, query.limit);
      const last = pageRows[pageRows.length - 1];
      const nextCursor = rows.length > query.limit ? nextPdfMaterialCursor(owner, last.cursorAt, last.pdfMaterialId) : null;
      return {
        items: pageRows.map(({ pdfMaterialId, title, fileSizeBytes, pageCount, extractionState, failureCode }) =>
          ({ pdfMaterialId, title, fileSizeBytes, pageCount, extractionState, failureCode })),
        page: { nextCursor },
      };
    });
  }

  /** 상세. 시한 판정 뒤 읽고 쪽 목록(pageNumber·readable)을 붙인다. 글 본문은 싣지 않는다(W1-B 2단계). */
  async get(memberId: string, idValue: unknown): Promise<PdfMaterialDetail> {
    const owner = ownerId(memberId);
    const id = pdfMaterialId(idValue);
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      await assertMemberExists(manager, owner);
      if (id === null) throw new NotFoundException();
      const summary = await this.readStatus(manager, owner, id);
      const pages: { pageNumber: number; readable: boolean }[] = await manager.query(
        'SELECT page_number AS "pageNumber", readable FROM pdf_page_text WHERE pdf_material_id = $1 ORDER BY page_number', [id]);
      return { ...summary, pages };
    });
  }

  /**
   * 시한 판정을 거친 한 자료의 상태(C-02 readStatus, BR2.2). PENDING이고 시한을 지났으면 FAILED(DEADLINE_EXCEEDED)로 저장한 뒤
   * 돌려준다. 조건부 UPDATE라 다른 쪽이 먼저 바꿨으면 0행이고 그 값을 읽는다. 없음·남의 것은 404.
   */
  async readStatus(manager: EntityManager, owner: string, id: string): Promise<PdfMaterialSummary> {
    await settleDeadlines(manager, owner, id);
    const rows: PdfMaterialSummary[] = await manager.query(
      `SELECT ${SUMMARY_COLUMNS} FROM pdf_material WHERE member_id = $1 AND pdf_material_id = $2`, [owner, id]);
    if (rows.length === 0) throw new NotFoundException();
    return rows[0];
  }

  /** 소유 확인과 존재 확인을 한 쿼리로 한다(보안 설계 §1). 원본 열람·삭제가 먼저 부른다. */
  async findOwned(memberId: string, idValue: unknown): Promise<OwnedPdfMaterial> {
    const owner = ownerId(memberId);
    const id = pdfMaterialId(idValue);
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      await assertMemberExists(manager, owner);
      if (id === null) throw new NotFoundException();
      const rows: OwnedPdfMaterial[] = await manager.query(
        'SELECT pdf_material_id AS "pdfMaterialId", storage_key AS "storageKey" FROM pdf_material WHERE member_id = $1 AND pdf_material_id = $2',
        [owner, id]);
      if (rows.length === 0) throw new NotFoundException();
      return rows[0];
    });
  }

  /** 행 삭제. 쪽별 글은 외래 키 연쇄로 함께 지워지고 발행 사본은 남는다(BR1.7·BR4.4). 호출자가 파일을 먼저 지운 뒤 부른다. */
  async remove(memberId: string, idValue: unknown): Promise<void> {
    const owner = ownerId(memberId);
    const id = pdfMaterialId(idValue);
    await this.dataSource.transaction('READ COMMITTED', async (manager) => {
      await assertMemberExists(manager, owner);
      if (id === null) throw new NotFoundException();
      const [, deleted] = await manager.query(
        'DELETE FROM pdf_material WHERE member_id = $1 AND pdf_material_id = $2', [owner, id]) as [unknown[], number];
      if (deleted === 0) throw new NotFoundException();
    });
  }
}

/**
 * 발행 사전 확인(U8 기능 명세 W3 2, BR4.1): 고른 PDF들을 시한 판정(BR2.2)을 거쳐 읽는다. 작성자 것만 돌려주므로 없거나 남의 것은
 * 결과에 빠진다(호출자가 U4와 같은 404로 응답). 발행 트랜잭션 밖에서 부른다(복사 전).
 */
export async function readPdfStatesForPublish(
  manager: EntityManager, owner: string, ids: readonly string[],
): Promise<Map<string, PdfExtractionState>> {
  await manager.query(`
    UPDATE pdf_material SET extraction_state = 'FAILED', extraction_failure_code = 'DEADLINE_EXCEEDED', updated_at = clock_timestamp()
    WHERE member_id = $1 AND pdf_material_id = ANY($2::uuid[]) AND extraction_state = 'PENDING' AND extraction_deadline_at <= clock_timestamp()`,
  [owner, ids]);
  const rows: { pdfMaterialId: string; state: PdfExtractionState }[] = await manager.query(`
    SELECT pdf_material_id AS "pdfMaterialId", extraction_state AS state FROM pdf_material
    WHERE member_id = $1 AND pdf_material_id = ANY($2::uuid[])`, [owner, ids]);
  return new Map(rows.map((row) => [row.pdfMaterialId, row.state]));
}

/** 시한이 지난 PENDING을 FAILED(DEADLINE_EXCEEDED)로 확정한다(BR2.2). id가 null이면 그 회원의 모든 자료. */
async function settleDeadlines(manager: EntityManager, owner: string, id: string | null): Promise<void> {
  await manager.query(`
    UPDATE pdf_material SET extraction_state = 'FAILED', extraction_failure_code = 'DEADLINE_EXCEEDED', updated_at = clock_timestamp()
    WHERE member_id = $1 AND extraction_state = 'PENDING' AND extraction_deadline_at <= clock_timestamp()
      ${id === null ? '' : 'AND pdf_material_id = $2'}`, id === null ? [owner] : [owner, id]);
}

function pageCondition(query: PdfMaterialQuery): string {
  return query.after ? 'AND (created_at, pdf_material_id) < ($3::timestamptz, $4::uuid)' : '';
}

function pageValues(owner: string, query: PdfMaterialQuery): unknown[] {
  const values: unknown[] = [owner, query.limit + 1];
  if (query.after) values.push(query.after.createdAt, query.after.pdfMaterialId);
  return values;
}

function ownerId(memberId: string): string {
  const value = memberId.toLowerCase();
  if (!isUuid(value)) throw new ApiError('AUTH_INVALID');
  return value;
}

/** 경로 ID. UUID 형식이 아니면 null이며 호출자는 회원 확인 뒤 없는 자료와 같은 404로 응답한다(BR1.8). */
function pdfMaterialId(value: unknown): string | null {
  if (typeof value !== 'string' || !isUuid(value)) return null;
  return value.toLowerCase();
}

async function assertMemberExists(manager: EntityManager, memberId: string): Promise<void> {
  // 조회가 끝날 때까지 회원 삭제를 막는다(텍스트 자료 저장소와 같은 기준).
  const member = await manager.query('SELECT 1 FROM member_account WHERE member_id = $1 FOR KEY SHARE', [memberId]);
  if (member.length === 0) throw new ApiError('AUTH_INVALID');
}

/** 회원 행을 배타 잠금한다. 같은 회원의 동시 업로드가 COUNT→INSERT를 차례로 지나게 한다(BR1.2, NFR4.12). */
async function lockMember(manager: EntityManager, memberId: string): Promise<void> {
  const member = await manager.query('SELECT 1 FROM member_account WHERE member_id = $1 FOR UPDATE', [memberId]);
  if (member.length === 0) throw new ApiError('AUTH_INVALID');
}

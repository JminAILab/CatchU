import { randomUUID } from 'node:crypto';
import { Check, Column, Entity, ForeignKey, Index, PrimaryColumn } from 'typeorm';
import { inValues, lengthBetween } from '../database/checks';
import { deleteWithParent } from '../database/foreign-keys';
import { MemberAccount } from '../member-analysis/member-analysis.entity';

/** 추출 상태(C-02 status-names). PENDING에서 DONE 또는 FAILED로 한 번만 바뀐다(U8 BR2.1). */
export const PDF_EXTRACTION_STATES = ['PENDING', 'DONE', 'FAILED'] as const;
export type PdfExtractionState = (typeof PDF_EXTRACTION_STATES)[number];

/**
 * FAILED 사유(U8 Q5). DEADLINE_EXCEEDED는 worker 결과가 아니라 시한 판정(BR2.2)이 넣는다.
 * TEXT_LIMIT_EXCEEDED(쪽 글 합계 60,000자 초과)는 팀장 결정 2026-11-10(#420 issuecomment-6759834176)으로 더했다.
 */
export const PDF_EXTRACTION_FAILURE_CODES = [
  'ENCRYPTED', 'UNREADABLE_FILE', 'PAGE_LIMIT_EXCEEDED', 'TEXT_LIMIT_EXCEEDED', 'DEADLINE_EXCEEDED',
] as const;
export type PdfExtractionFailureCode = (typeof PDF_EXTRACTION_FAILURE_CODES)[number];

/** PDF 쪽 수 상한(U8 BR1.2, Q1). 판정은 worker가 하고 DB는 DONE 자료의 쪽 수 범위만 막는다. */
export const PDF_PAGE_LIMIT = 50;

/**
 * 작성 회원이 올린 PDF 원본 한 벌(U8 기능 설계 entities.md PdfMaterial, 계약 C-06).
 *
 * - 파일은 FileStorage의 materialKey(`storageKey`)에 있고, 이 행은 제목·크기·쪽별 글 추출 상태를 가진다.
 * - 원본은 발행 사본(published_item·published_pdf_page)과 수명이 다르다. 원본을 지워도 사본은 남는다(FR3.2, BR4.4).
 * - 회원당 20벌·파일 20 MB·제목 100자 상한은 DB 제약이 아니라 API 검증이다(BR1.2). DB는 제목 1자 이상·크기 양수만 막는다.
 * - 상태와 딸린 칸은 함께 있거나 함께 없다: DONE이면 `pageCount`, FAILED면 `extractionFailureCode`.
 */
@Entity('pdf_material')
@ForeignKey(() => MemberAccount, ['memberId'], ['memberId'], deleteWithParent)
@Check(lengthBetween('title', 1))
@Check('"file_size_bytes" > 0')
@Check(`"page_count" IS NULL OR ("page_count" >= 1 AND "page_count" <= ${PDF_PAGE_LIMIT})`)
@Check(inValues('extraction_state', PDF_EXTRACTION_STATES))
// NULL은 IN 검사를 통과한다(CHECK는 NULL을 허용). 값이 있을 때만 정한 사유 코드여야 한다.
@Check(inValues('extraction_failure_code', PDF_EXTRACTION_FAILURE_CODES))
@Check(`("extraction_state" = 'DONE') = ("page_count" IS NOT NULL)`)
@Check(`("extraction_state" = 'FAILED') = ("extraction_failure_code" IS NOT NULL)`)
@Index(['memberId'])
export class PdfMaterial {
  @PrimaryColumn({ type: 'uuid' })
  pdfMaterialId: string = randomUUID();

  @Column({ type: 'uuid' })
  memberId!: string;

  @Column({ type: 'text' })
  title!: string;

  /** materialKey(memberId, pdfMaterialId)와 같은 값. 키는 C-05 도우미로만 만든다 */
  @Column({ type: 'text' })
  storageKey!: string;

  @Column({ type: 'integer' })
  fileSizeBytes!: number;

  /** DONE일 때만 값. worker 결과(pages.length)로 채운다 */
  @Column({ type: 'integer', nullable: true })
  pageCount!: number | null;

  @Column({ type: 'varchar' })
  extractionState!: PdfExtractionState;

  /** 등록 커밋 시각 + 10분(Q2). 상태를 읽을 때 PENDING이고 이 시각을 지났으면 FAILED(DEADLINE_EXCEEDED)로 확정한다 */
  @Column({ type: 'timestamptz' })
  extractionDeadlineAt!: Date;

  @Column({ type: 'varchar', nullable: true })
  extractionFailureCode!: PdfExtractionFailureCode | null;

  @Column({ type: 'timestamptz' })
  createdAt!: Date;

  @Column({ type: 'timestamptz' })
  updatedAt!: Date;
}

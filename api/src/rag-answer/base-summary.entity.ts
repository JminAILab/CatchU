import { randomUUID } from 'node:crypto';
import { Check, Column, Entity, ForeignKey, PrimaryColumn } from 'typeorm';
import type { GatedItem } from '../ai-generation/ai-generation.types';
import type { RunStatus } from '../ai-run/ai-run-spec';
import { inValues } from '../database/checks';
import { deleteWithParent } from '../database/foreign-keys';
import { Publication } from '../publications/publication.entity';

/** C-02 table-convention의 상태 이름 그대로. */
export const BASE_SUMMARY_STATUSES = ['PENDING', 'DONE', 'FAILED'] as const satisfies readonly RunStatus[];

/**
 * 발행본 하나의 AI 기본 요약과 실행 상태(U5 소유, 기능 설계 entities.md BaseSummary, 계약 C-02·C-06).
 *
 * - 발행 때 만들지 않는다. BASE_SUMMARY 처리기(시한 전) 또는 [다시 만들기]가 처음 쓴다(C-02 row-creation).
 * - DONE이면 items가 1개 이상이고 generatedAt이 있다. PENDING·FAILED면 items는 빈 목록이다.
 * - 발행본 삭제·작성자 탈퇴 때 연쇄 삭제된다(C-06, BR9.1).
 */
@Entity('base_summary')
@ForeignKey(() => Publication, ['publicationId'], ['publicationId'], deleteWithParent)
@Check(inValues('status', BASE_SUMMARY_STATUSES))
export class BaseSummary {
  @PrimaryColumn({ type: 'uuid' })
  baseSummaryId: string = randomUUID();

  @Column({ type: 'uuid', unique: true })
  publicationId!: string;

  @Column({ type: 'varchar' })
  status!: RunStatus;

  @Column({ type: 'timestamptz' })
  deadlineAt!: Date;

  /** C-01 GatedItem 모양 그대로(kind는 CITED·AI_INTERPRETATION, jdRole null). */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  items!: GatedItem[];

  @Column({ type: 'timestamptz', nullable: true })
  generatedAt!: Date | null;

  @Column({ type: 'timestamptz' })
  updatedAt!: Date;
}

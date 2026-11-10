import { randomUUID } from 'node:crypto';
import { Check, Column, Entity, ForeignKey, PrimaryColumn, Unique } from 'typeorm';
import type { GatedItem } from '../ai-generation/ai-generation.types';
import type { RunStatus } from '../ai-run/ai-run-spec';
import { inValues } from '../database/checks';
import { deleteWithParent } from '../database/foreign-keys';
import { JdSummaryRun } from './jd-summary-run.entity';

export type RequirementFailure = 'SEARCH_FAILED' | 'GENERATION_FAILED' | 'INPUT_TOO_LARGE' | 'CONTRACT_INVALID'
  | 'DEADLINE_EXCEEDED' | 'PROCESSING_FAILED';

@Entity('jd_summary_result')
@ForeignKey(() => JdSummaryRun, ['runId'], ['runId'], deleteWithParent)
@Unique(['runId', 'requirementIndex'])
@Check('"requirement_index" BETWEEN 0 AND 19 AND "source_line_number" >= 1 AND char_length("jd_line") > 0')
@Check(inValues('status', ['PENDING', 'DONE', 'FAILED']))
@Check(inValues('result_kind', ['CONTENT', 'EMPTY']))
@Check(inValues('failure_code', ['SEARCH_FAILED', 'GENERATION_FAILED', 'INPUT_TOO_LARGE', 'CONTRACT_INVALID', 'DEADLINE_EXCEEDED', 'PROCESSING_FAILED']))
@Check('("status" = \'DONE\') = ("result_kind" IS NOT NULL)')
@Check('("status" = \'FAILED\') = ("failure_code" IS NOT NULL)')
export class JdSummaryResult {
  @PrimaryColumn({ type: 'uuid' }) resultId: string = randomUUID();
  @Column({ type: 'uuid' }) runId!: string;
  @Column({ type: 'integer' }) requirementIndex!: number;
  @Column({ type: 'integer' }) sourceLineNumber!: number;
  @Column({ type: 'text' }) jdLine!: string;
  @Column({ type: 'varchar', default: 'PENDING' }) status: RunStatus = 'PENDING';
  @Column({ type: 'varchar', nullable: true }) resultKind: 'CONTENT' | 'EMPTY' | null = null;
  @Column({ type: 'jsonb', default: () => "'[]'" }) evidenceItems: GatedItem[] = [];
  @Column({ type: 'jsonb', default: () => "'[]'" }) unconfirmedPoints: GatedItem[] = [];
  @Column({ type: 'jsonb', default: () => "'[]'" }) interviewQuestions: GatedItem[] = [];
  @Column({ type: 'varchar', nullable: true }) failureCode: RequirementFailure | null = null;
}

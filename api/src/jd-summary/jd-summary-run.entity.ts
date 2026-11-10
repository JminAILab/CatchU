import { randomUUID } from 'node:crypto';
import { Check, Column, Entity, ForeignKey, Index, PrimaryColumn } from 'typeorm';
import type { RunStatus } from '../ai-run/ai-run-spec';
import { inValues } from '../database/checks';
import { deleteWithParent } from '../database/foreign-keys';
import { Jd } from '../jd/jd.entity';
import type { JdRequirement } from '../jd/jd-input';
import { MemberAccount } from '../member-analysis/member-analysis.entity';
import { Publication } from '../publications/publication.entity';

export type RunFailure = 'DEADLINE_EXCEEDED' | 'ALL_REQUIREMENTS_FAILED' | 'PROCESSING_FAILED';
export interface JdInputCopy { title: string; body: string; jdUpdatedAt: string; orderedRequirements: JdRequirement[] }

@Entity('jd_summary_run')
@ForeignKey(() => MemberAccount, ['memberId'], ['memberId'], deleteWithParent)
@ForeignKey(() => Jd, ['memberId', 'jdId'], ['memberId', 'jdId'], deleteWithParent)
@ForeignKey(() => Publication, ['publicationId'], ['publicationId'], deleteWithParent)
@Index(['memberId', 'publicationId', 'createdAt', 'runId'])
@Index(['memberId', 'jdId'])
@Index(['publicationId'])
@Check(inValues('status', ['PENDING', 'DONE', 'FAILED']))
@Check(inValues('failure_code', ['DEADLINE_EXCEEDED', 'ALL_REQUIREMENTS_FAILED', 'PROCESSING_FAILED']))
@Check('("status" = \'FAILED\') = ("failure_code" IS NOT NULL)')
@Check('"deadline_at" = "created_at" + interval \'20 minutes\'')
export class JdSummaryRun {
  @PrimaryColumn({ type: 'uuid' }) runId: string = randomUUID();
  @Column({ type: 'uuid' }) memberId!: string;
  @Column({ type: 'uuid' }) jdId!: string;
  @Column({ type: 'uuid' }) publicationId!: string;
  @Column({ type: 'varchar', default: 'PENDING' }) status: RunStatus = 'PENDING';
  @Column({ type: 'timestamptz' }) deadlineAt!: Date;
  @Column({ type: 'jsonb' }) inputCopy!: JdInputCopy;
  @Column({ type: 'varchar', nullable: true }) failureCode: RunFailure | null = null;
  @Column({ type: 'timestamptz' }) createdAt!: Date;
}

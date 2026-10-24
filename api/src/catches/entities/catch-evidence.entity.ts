import { randomUUID } from 'node:crypto';
import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, Unique } from 'typeorm';
import { deleteWithParent } from '../../database/foreign-keys';
import { CatchAssetEntity } from './catch-asset.entity';

@Entity('catch_evidence')
@Unique(['catchId', 'sourceEvidenceId'])
@Check('"position" >= 1')
@Check('char_length("source_evidence_id") >= 1')
@Check('char_length("source_url") >= 1')
@Check('char_length("source_revision") >= 1')
@Check('cardinality("represented_facts") >= 1')
@Check('array_position("represented_facts", NULL) IS NULL')
@Check('array_position("coverage_limits", NULL) IS NULL')
export class CatchEvidenceEntity {
  @PrimaryColumn({ name: 'catch_evidence_id', type: 'uuid' })
  catchEvidenceId: string = randomUUID();

  @Column({ name: 'catch_id', type: 'uuid' })
  catchId!: string;

  @ManyToOne(() => CatchAssetEntity, { nullable: false, ...deleteWithParent })
  @JoinColumn({ name: 'catch_id', referencedColumnName: 'catchId' })
  catchAsset!: CatchAssetEntity;

  @Column({ type: 'integer' })
  position!: number;

  @Column({ name: 'source_evidence_id', type: 'text' })
  sourceEvidenceId!: string;

  @Column({ name: 'source_url', type: 'text' })
  sourceUrl!: string;

  @Column({ name: 'source_revision', type: 'text' })
  sourceRevision!: string;

  @Column({ name: 'represented_facts', type: 'text', array: true })
  representedFacts!: string[];

  @Column({ name: 'contribution_scope', type: 'text' })
  contributionScope!: string;

  @Column({ name: 'coverage_limits', type: 'text', array: true })
  coverageLimits!: string[];
}

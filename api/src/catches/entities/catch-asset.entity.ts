import { randomUUID } from 'node:crypto';
import { Check, Column, Entity, ForeignKey, PrimaryColumn, Unique } from 'typeorm';
import { AnalysisRequest, MemberAccount } from '../../member-analysis/member-analysis.entity';

export type CatchGenerationStatus = 'GENERATED' | 'FAILED' | 'NOT_GENERATED';
export type CatchSourceMode = 'MOCK' | 'LIVE';
export type CatchVisibility = 'PRIVATE' | 'PUBLIC';

/** B 내부의 등록 판단 기록이다. worker 원문이나 공개 DTO를 저장하지 않는다. */
export interface RegistrationAssessment {
  workFactsVerified: true;
  contributionVerified: true;
  independentOfFailures: true;
  groupingBasis: string;
  groupingLimitations: string[];
}

@Entity('catch_asset')
@Unique(['ownerId', 'workIdentity'])
@Unique(['sourceRequestId', 'sourceResultId', 'sourceCandidateId'])
@ForeignKey(() => MemberAccount, ['ownerId'], ['memberId'], { name: 'fk_catch_asset_owner_id' })
@ForeignKey(() => AnalysisRequest, ['sourceRequestId'], ['requestId'], { name: 'fk_catch_asset_source_request_id' })
@Check('char_length("title") >= 1')
@Check('char_length("source_result_id") >= 1')
@Check('char_length("source_candidate_id") >= 1')
@Check('char_length("work_identity") >= 1')
@Check('cardinality("work_facts") >= 1')
@Check('array_position("work_facts", NULL) IS NULL')
@Check('char_length("subject_contribution") >= 1')
@Check('"draft_status" IN (\'GENERATED\', \'FAILED\', \'NOT_GENERATED\')')
@Check('("draft_status" = \'GENERATED\' AND "draft_content" IS NOT NULL) OR ("draft_status" IN (\'FAILED\', \'NOT_GENERATED\') AND "draft_content" IS NULL)')
@Check('"reflection_status" IN (\'GENERATED\', \'FAILED\', \'NOT_GENERATED\')')
@Check('array_position("reflection_questions", NULL) IS NULL')
@Check('jsonb_typeof("registration_assessment") = \'object\'')
@Check('"visibility" IN (\'PRIVATE\', \'PUBLIC\')')
@Check('"source_mode" IN (\'MOCK\', \'LIVE\')')
export class CatchAssetEntity {
  @PrimaryColumn({ name: 'catch_id', type: 'uuid' })
  catchId: string = randomUUID();

  @Column({ name: 'title', type: 'text', nullable: true })
  title!: string | null;

  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId!: string;

  @Column({ name: 'source_request_id', type: 'uuid' })
  sourceRequestId!: string;

  @Column({ name: 'source_result_id', type: 'text' })
  sourceResultId!: string;

  @Column({ name: 'source_candidate_id', type: 'text' })
  sourceCandidateId!: string;

  @Column({ name: 'work_identity', type: 'text' })
  workIdentity!: string;

  @Column({ name: 'work_facts', type: 'text', array: true })
  workFacts!: string[];

  @Column({ name: 'subject_contribution', type: 'text' })
  subjectContribution!: string;

  @Column({ name: 'draft_status', type: 'varchar' })
  draftStatus!: CatchGenerationStatus;

  @Column({ name: 'draft_content', type: 'text', nullable: true })
  draftContent!: string | null;

  @Column({ name: 'reflection_status', type: 'varchar' })
  reflectionStatus!: CatchGenerationStatus;

  @Column({ name: 'reflection_questions', type: 'text', array: true })
  reflectionQuestions!: string[];

  @Column({ name: 'registration_assessment', type: 'jsonb' })
  registrationAssessment!: RegistrationAssessment;

  @Column({ name: 'work_facts_confirmed', type: 'boolean', default: false })
  workFactsConfirmed = false;

  @Column({ name: 'contribution_confirmed', type: 'boolean', default: false })
  contributionConfirmed = false;

  @Column({ name: 'mismatch', type: 'boolean', default: false })
  mismatch = false;

  @Column({ name: 'visibility', type: 'varchar', default: 'PRIVATE' })
  visibility: CatchVisibility = 'PRIVATE';

  @Column({ name: 'source_mode', type: 'varchar' })
  sourceMode!: CatchSourceMode;
}

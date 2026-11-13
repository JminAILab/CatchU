import { randomUUID } from 'node:crypto';
import { Check, Column, Entity, ForeignKey, PrimaryColumn, Unique } from 'typeorm';
import { deleteWithParent } from '../../database/foreign-keys';
import { AnalysisRequest, MemberAccount } from '../../member-analysis/member-analysis.entity';
import type { RevisitFact } from '../new-catch-content';

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
// 소속 기록(commit_assignment)의 (catch_id, member_id) 한 쌍 외래 키가 가리킬 대상(CR2 ADR-002).
@Unique(['catchId', 'ownerId'])
@ForeignKey(() => MemberAccount, ['ownerId'], ['memberId'], { name: 'fk_catch_asset_owner_id', ...deleteWithParent })
@ForeignKey(() => AnalysisRequest, ['sourceRequestId'], ['requestId'], { name: 'fk_catch_asset_source_request_id', ...deleteWithParent })
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
@Check('("author_description" IS NULL) = ("author_description_updated_at" IS NULL)')
@Check('jsonb_typeof("revisit_facts") = \'array\'')
@Check('("first_work_at" IS NULL) = ("last_work_at" IS NULL) AND ("first_work_at" IS NULL OR "first_work_at" <= "last_work_at")')
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

  /**
   * 작성자 설명(계약 C-14, U4 소유). 없으면 NULL이고 저장 시각도 함께 NULL이다. 길이 상한은 U4 API 검증이다.
   * 초기값을 두지 않는다: 기존 저장 코드가 이 칸을 모른 채 행을 저장해도 설명을 덮어쓰지 않게 한다(재분석 유지, ADR-004).
   */
  @Column({ name: 'author_description', type: 'text', nullable: true })
  authorDescription!: string | null;

  @Column({ name: 'author_description_updated_at', type: 'timestamptz', nullable: true })
  authorDescriptionUpdatedAt!: Date | null;

  /**
   * 같은 작업 안 본인 커밋끼리 본 「다시 볼 곳」 사실(NC3 계약 C4·C2). 새 Catch 등록 때 첫 후보의 값을 한 번 쓰고 바꾸지 않는다.
   * 원소 모양은 등록 입력 검사와 본인 응답 검사가 보고, DB는 배열인지만 본다. 사본·공개 응답·Claude 연결은 읽지 않는다(BR6.3).
   * 초기값을 두지 않는다: 기존 저장 코드가 이 칸을 모른 채 행을 저장해도 값을 덮어쓰지 않게 한다(DB 기본값은 빈 배열).
   */
  @Column({ name: 'revisit_facts', type: 'jsonb', default: () => "'[]'" })
  revisitFacts!: RevisitFact[];

  /** 합친 뒤 본인 커밋 작성 시각의 최소(NC3 BR4.1). 마이그레이션 전 행은 NULL이다. 응답에 싣지 않는다. */
  @Column({ name: 'first_work_at', type: 'timestamptz', nullable: true })
  firstWorkAt!: Date | null;

  /** 같은 목록의 최대 작성 시각. 본인 목록 정렬·커서에만 쓰고 응답에 싣지 않는다(FR14.3). */
  @Column({ name: 'last_work_at', type: 'timestamptz', nullable: true })
  lastWorkAt!: Date | null;
}

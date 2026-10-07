import type { MigrationInterface, QueryRunner } from 'typeorm';

// 선행: A/E의 member_account, analysis_request, result_application_record.
// B 테이블만 생성하며 선행 테이블의 생성·수정·되돌리기는 담당 마이그레이션에 둔다.
export class CreateCatchAssets1790600000000 implements MigrationInterface {
  name = 'CreateCatchAssets1790600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "catch_asset" (
      "catch_id" uuid NOT NULL,
      "title" text NOT NULL,
      "owner_id" uuid NOT NULL,
      "source_request_id" uuid NOT NULL,
      "source_result_id" text NOT NULL,
      "source_candidate_id" text NOT NULL,
      "work_identity" text NOT NULL,
      "work_facts" text[] NOT NULL,
      "subject_contribution" text NOT NULL,
      "draft_status" varchar NOT NULL,
      "draft_content" text,
      "reflection_status" varchar NOT NULL,
      "reflection_questions" text[] NOT NULL,
      "registration_assessment" jsonb NOT NULL,
      "work_facts_confirmed" boolean NOT NULL DEFAULT false,
      "contribution_confirmed" boolean NOT NULL DEFAULT false,
      "mismatch" boolean NOT NULL DEFAULT false,
      "visibility" varchar NOT NULL DEFAULT 'PRIVATE',
      "source_mode" varchar NOT NULL,
      CONSTRAINT "pk_catch_asset" PRIMARY KEY ("catch_id"),
      CONSTRAINT "uq_catch_asset_owner_id_work_identity" UNIQUE ("owner_id", "work_identity"),
      CONSTRAINT "uq_catch_asset_source_request_id_source_result_id_sour_db487c7e" UNIQUE ("source_request_id", "source_result_id", "source_candidate_id"),
      CONSTRAINT "ck_catch_asset_title_74e62505" CHECK (char_length("title") >= 1),
      CONSTRAINT "ck_catch_asset_source_result_id_aeedbd95" CHECK (char_length("source_result_id") >= 1),
      CONSTRAINT "ck_catch_asset_source_candidate_id_e3b9e9b4" CHECK (char_length("source_candidate_id") >= 1),
      CONSTRAINT "ck_catch_asset_work_identity_4a2f590d" CHECK (char_length("work_identity") >= 1),
      CONSTRAINT "ck_catch_asset_work_facts_0c6503f6" CHECK (cardinality("work_facts") >= 1),
      CONSTRAINT "ck_catch_asset_work_facts_bedf5b5b" CHECK (array_position("work_facts", NULL) IS NULL),
      CONSTRAINT "ck_catch_asset_subject_contribution_e474f6ce" CHECK (char_length("subject_contribution") >= 1),
      CONSTRAINT "ck_catch_asset_draft_status_473a77e1" CHECK ("draft_status" IN ('GENERATED', 'FAILED', 'NOT_GENERATED')),
      CONSTRAINT "ck_catch_asset_draft_status_3e8fba34" CHECK (("draft_status" = 'GENERATED' AND "draft_content" IS NOT NULL) OR ("draft_status" IN ('FAILED', 'NOT_GENERATED') AND "draft_content" IS NULL)),
      CONSTRAINT "ck_catch_asset_reflection_status_4b75c95b" CHECK ("reflection_status" IN ('GENERATED', 'FAILED', 'NOT_GENERATED')),
      CONSTRAINT "ck_catch_asset_reflection_questions_209956da" CHECK (array_position("reflection_questions", NULL) IS NULL),
      CONSTRAINT "ck_catch_asset_registration_assessment_71ac6ba9" CHECK (jsonb_typeof("registration_assessment") = 'object'),
      CONSTRAINT "ck_catch_asset_visibility_fe4e63b5" CHECK ("visibility" IN ('PRIVATE', 'PUBLIC')),
      CONSTRAINT "ck_catch_asset_source_mode_e14a5ade" CHECK ("source_mode" IN ('MOCK', 'LIVE')),
      CONSTRAINT "fk_catch_asset_owner_id" FOREIGN KEY ("owner_id") REFERENCES "member_account"("member_id"),
      CONSTRAINT "fk_catch_asset_source_request_id" FOREIGN KEY ("source_request_id") REFERENCES "analysis_request"("request_id")
    )`);

    await queryRunner.query(`CREATE TABLE "catch_evidence" (
      "catch_evidence_id" uuid NOT NULL,
      "catch_id" uuid NOT NULL,
      "source_evidence_id" text NOT NULL,
      "source_url" text NOT NULL,
      "source_revision" text NOT NULL,
      "represented_facts" text[] NOT NULL,
      "contribution_scope" text NOT NULL,
      "coverage_limits" text[] NOT NULL,
      CONSTRAINT "pk_catch_evidence" PRIMARY KEY ("catch_evidence_id"),
      CONSTRAINT "uq_catch_evidence_catch_id_source_evidence_id" UNIQUE ("catch_id", "source_evidence_id"),
      CONSTRAINT "ck_catch_evidence_source_evidence_id_f001ef48" CHECK (char_length("source_evidence_id") >= 1),
      CONSTRAINT "ck_catch_evidence_source_url_189e95cd" CHECK (char_length("source_url") >= 1),
      CONSTRAINT "ck_catch_evidence_source_revision_4080b1a3" CHECK (char_length("source_revision") >= 1),
      CONSTRAINT "ck_catch_evidence_represented_facts_0ab6ddc6" CHECK (cardinality("represented_facts") >= 1),
      CONSTRAINT "ck_catch_evidence_represented_facts_bce7cd48" CHECK (array_position("represented_facts", NULL) IS NULL),
      CONSTRAINT "ck_catch_evidence_coverage_limits_a6ce267f" CHECK (array_position("coverage_limits", NULL) IS NULL),
      CONSTRAINT "fk_catch_evidence_catch_id" FOREIGN KEY ("catch_id") REFERENCES "catch_asset"("catch_id")
    )`);

    await queryRunner.query(`CREATE TABLE "candidate_registration" (
      "registration_id" uuid NOT NULL,
      "application_record_id" uuid NOT NULL,
      "candidate_id" text NOT NULL,
      "catch_id" uuid NOT NULL,
      "disposition" varchar NOT NULL,
      "owner_view_ready" boolean NOT NULL,
      CONSTRAINT "pk_candidate_registration" PRIMARY KEY ("registration_id"),
      CONSTRAINT "uq_candidate_registration_application_record_id_candidate_id" UNIQUE ("application_record_id", "candidate_id"),
      CONSTRAINT "ck_candidate_registration_candidate_id_3bdf20d5" CHECK (char_length("candidate_id") >= 1),
      CONSTRAINT "ck_candidate_registration_disposition_a63eb1bd" CHECK ("disposition" IN ('CREATED', 'EXISTING')),
      CONSTRAINT "fk_candidate_registration_application_record_id" FOREIGN KEY ("application_record_id") REFERENCES "result_application_record"("application_record_id"),
      CONSTRAINT "fk_candidate_registration_catch_id" FOREIGN KEY ("catch_id") REFERENCES "catch_asset"("catch_id")
    )`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "candidate_registration"');
    await queryRunner.query('DROP TABLE "catch_evidence"');
    await queryRunner.query('DROP TABLE "catch_asset"');
  }
}

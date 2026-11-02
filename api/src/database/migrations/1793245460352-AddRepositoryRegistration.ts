import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRepositoryRegistration1793245460352 implements MigrationInterface {
    name = 'AddRepositoryRegistration1793245460352'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 과거 선정 동의에는 회원 등록과 확인 좌표 사본이 없다. 사후 동의를 생성하지 않는다.
        await queryRunner.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM analysis_request) THEN RAISE EXCEPTION 'U7 migration requires an empty analysis_request table or an explicitly reviewed data preparation migration; retrospective consent is forbidden' USING ERRCODE = '23514'; END IF; END $$`);
        await queryRunner.query(`CREATE TABLE "repository_registration" ("registration_id" uuid NOT NULL, "member_id" uuid NOT NULL, "repository_id" text NOT NULL, "owner" text NOT NULL, "name" text NOT NULL, "repository_url" text NOT NULL, "scope_revision" text NOT NULL, "registered_at" TIMESTAMP WITH TIME ZONE NOT NULL, "last_verified_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "uq_repository_registration_member_id_registration_id_r_eb61e24b" UNIQUE ("member_id", "registration_id", "repository_id"), CONSTRAINT "uq_repository_registration_member_id_repository_id" UNIQUE ("member_id", "repository_id"), CONSTRAINT "ck_repository_registration_scope_revision_d6849c1d" CHECK (char_length("scope_revision") BETWEEN 1 AND 200), CONSTRAINT "ck_repository_registration_name_c9b9bb48" CHECK (char_length("name") BETWEEN 1 AND 100), CONSTRAINT "ck_repository_registration_owner_ac29b19c" CHECK (char_length("owner") BETWEEN 1 AND 39), CONSTRAINT "ck_repository_registration_repository_id_b4519cce" CHECK (char_length("repository_id") >= 1), CONSTRAINT "pk_repository_registration" PRIMARY KEY ("registration_id"))`);
        await queryRunner.query(`ALTER TABLE "analysis_request" ADD "registration_id" uuid NOT NULL`);
        await queryRunner.query(`ALTER TABLE "analysis_attempt" ADD "own_commit_observation" character varying NOT NULL DEFAULT 'UNKNOWN'`);
        await queryRunner.query(`ALTER TABLE "analysis_attempt" ADD "observed_own_commit_count" integer`);
        await queryRunner.query(`ALTER TABLE "analysis_attempt" ADD "collection_limit_notes" text array NOT NULL DEFAULT '{}'`);
        await queryRunner.query(`ALTER TABLE "analysis_attempt" ADD CONSTRAINT "ck_analysis_attempt_own_commit_observation_2cef92d9" CHECK (("own_commit_observation" = 'UNKNOWN' AND "observed_own_commit_count" IS NULL) OR
  ("own_commit_observation" = 'NONE' AND "observed_own_commit_count" IS NOT NULL AND "observed_own_commit_count" = 0) OR
  ("own_commit_observation" = 'FOUND' AND "observed_own_commit_count" IS NOT NULL AND "observed_own_commit_count" > 0))`);
        await queryRunner.query(`ALTER TABLE "analysis_attempt" ADD CONSTRAINT "ck_analysis_attempt_own_commit_observation_0f063580" CHECK ("own_commit_observation" IN ('UNKNOWN', 'NONE', 'FOUND'))`);
        await queryRunner.query(`ALTER TABLE "repository_registration" ADD CONSTRAINT "fk_repository_registration_member_id" FOREIGN KEY ("member_id") REFERENCES "member_account"("member_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "analysis_request" ADD CONSTRAINT "fk_analysis_request_member_id_registration_id_repository_id" FOREIGN KEY ("member_id", "registration_id", "repository_id") REFERENCES "repository_registration"("member_id","registration_id","repository_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM repository_registration) THEN RAISE EXCEPTION 'U7 rollback requires explicit preservation of repository registrations and consent snapshots' USING ERRCODE = '23514'; END IF; END $$`);
        await queryRunner.query(`ALTER TABLE "analysis_request" DROP CONSTRAINT "fk_analysis_request_member_id_registration_id_repository_id"`);
        await queryRunner.query(`ALTER TABLE "repository_registration" DROP CONSTRAINT "fk_repository_registration_member_id"`);
        await queryRunner.query(`ALTER TABLE "analysis_attempt" DROP CONSTRAINT "ck_analysis_attempt_own_commit_observation_0f063580"`);
        await queryRunner.query(`ALTER TABLE "analysis_attempt" DROP CONSTRAINT "ck_analysis_attempt_own_commit_observation_2cef92d9"`);
        await queryRunner.query(`ALTER TABLE "analysis_attempt" DROP COLUMN "collection_limit_notes"`);
        await queryRunner.query(`ALTER TABLE "analysis_attempt" DROP COLUMN "observed_own_commit_count"`);
        await queryRunner.query(`ALTER TABLE "analysis_attempt" DROP COLUMN "own_commit_observation"`);
        await queryRunner.query(`ALTER TABLE "analysis_request" DROP COLUMN "registration_id"`);
        await queryRunner.query(`DROP TABLE "repository_registration"`);
    }

}

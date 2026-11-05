import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateJdSummary1793762571117 implements MigrationInterface {
    name = 'CreateJdSummary1793762571117'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "jd" ("jd_id" uuid NOT NULL, "member_id" uuid NOT NULL, "title" text NOT NULL, "body" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "uq_jd_member_id_jd_id" UNIQUE ("member_id", "jd_id"), CONSTRAINT "ck_jd_title_4399dce5" CHECK (char_length("title") > 0 AND char_length("body") > 0), CONSTRAINT "pk_jd" PRIMARY KEY ("jd_id"))`);
        await queryRunner.query(`CREATE INDEX "ix_jd_member_id_updated_at_jd_id" ON "jd"  ("member_id", "updated_at", "jd_id") `);
        await queryRunner.query(`CREATE TABLE "jd_summary_run" ("run_id" uuid NOT NULL, "member_id" uuid NOT NULL, "jd_id" uuid NOT NULL, "publication_id" uuid NOT NULL, "status" character varying NOT NULL DEFAULT 'PENDING', "deadline_at" TIMESTAMP WITH TIME ZONE NOT NULL, "input_copy" jsonb NOT NULL, "failure_code" character varying, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "ck_jd_summary_run_deadline_at_cdada016" CHECK ("deadline_at" = "created_at" + interval '20 minutes'), CONSTRAINT "ck_jd_summary_run_status_bb5e81c3" CHECK (("status" = 'FAILED') = ("failure_code" IS NOT NULL)), CONSTRAINT "ck_jd_summary_run_failure_code_856d0c60" CHECK ("failure_code" IN ('DEADLINE_EXCEEDED', 'ALL_REQUIREMENTS_FAILED', 'PROCESSING_FAILED')), CONSTRAINT "ck_jd_summary_run_status_dcbae7db" CHECK ("status" IN ('PENDING', 'DONE', 'FAILED')), CONSTRAINT "pk_jd_summary_run" PRIMARY KEY ("run_id"))`);
        await queryRunner.query(`CREATE INDEX "ix_jd_summary_run_publication_id" ON "jd_summary_run"  ("publication_id") `);
        await queryRunner.query(`CREATE INDEX "ix_jd_summary_run_member_id_jd_id" ON "jd_summary_run"  ("member_id", "jd_id") `);
        await queryRunner.query(`CREATE INDEX "ix_jd_summary_run_member_id_publication_id_created_at_run_id" ON "jd_summary_run"  ("member_id", "publication_id", "created_at", "run_id") `);
        await queryRunner.query(`CREATE TABLE "jd_summary_result" ("result_id" uuid NOT NULL, "run_id" uuid NOT NULL, "requirement_index" integer NOT NULL, "source_line_number" integer NOT NULL, "jd_line" text NOT NULL, "status" character varying NOT NULL DEFAULT 'PENDING', "result_kind" character varying, "evidence_items" jsonb NOT NULL DEFAULT '[]'::jsonb, "unconfirmed_points" jsonb NOT NULL DEFAULT '[]'::jsonb, "interview_questions" jsonb NOT NULL DEFAULT '[]'::jsonb, "failure_code" character varying, CONSTRAINT "uq_jd_summary_result_run_id_requirement_index" UNIQUE ("run_id", "requirement_index"), CONSTRAINT "ck_jd_summary_result_status_bb5e81c3" CHECK (("status" = 'FAILED') = ("failure_code" IS NOT NULL)), CONSTRAINT "ck_jd_summary_result_status_41bb73ae" CHECK (("status" = 'DONE') = ("result_kind" IS NOT NULL)), CONSTRAINT "ck_jd_summary_result_failure_code_db9a6dac" CHECK ("failure_code" IN ('SEARCH_FAILED', 'GENERATION_FAILED', 'INPUT_TOO_LARGE', 'CONTRACT_INVALID', 'DEADLINE_EXCEEDED', 'PROCESSING_FAILED')), CONSTRAINT "ck_jd_summary_result_result_kind_59bb98c9" CHECK ("result_kind" IN ('CONTENT', 'EMPTY')), CONSTRAINT "ck_jd_summary_result_status_dcbae7db" CHECK ("status" IN ('PENDING', 'DONE', 'FAILED')), CONSTRAINT "ck_jd_summary_result_requirement_index_a72c09ae" CHECK ("requirement_index" BETWEEN 0 AND 19 AND "source_line_number" >= 1 AND char_length("jd_line") > 0), CONSTRAINT "pk_jd_summary_result" PRIMARY KEY ("result_id"))`);
        await queryRunner.query(`ALTER TABLE "jd" ADD CONSTRAINT "fk_jd_member_id" FOREIGN KEY ("member_id") REFERENCES "member_account"("member_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "jd_summary_run" ADD CONSTRAINT "fk_jd_summary_run_publication_id" FOREIGN KEY ("publication_id") REFERENCES "publication"("publication_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "jd_summary_run" ADD CONSTRAINT "fk_jd_summary_run_member_id_jd_id" FOREIGN KEY ("member_id", "jd_id") REFERENCES "jd"("member_id","jd_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "jd_summary_run" ADD CONSTRAINT "fk_jd_summary_run_member_id" FOREIGN KEY ("member_id") REFERENCES "member_account"("member_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "jd_summary_result" ADD CONSTRAINT "fk_jd_summary_result_run_id" FOREIGN KEY ("run_id") REFERENCES "jd_summary_run"("run_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "jd_summary_result" DROP CONSTRAINT "fk_jd_summary_result_run_id"`);
        await queryRunner.query(`ALTER TABLE "jd_summary_run" DROP CONSTRAINT "fk_jd_summary_run_member_id"`);
        await queryRunner.query(`ALTER TABLE "jd_summary_run" DROP CONSTRAINT "fk_jd_summary_run_member_id_jd_id"`);
        await queryRunner.query(`ALTER TABLE "jd_summary_run" DROP CONSTRAINT "fk_jd_summary_run_publication_id"`);
        await queryRunner.query(`ALTER TABLE "jd" DROP CONSTRAINT "fk_jd_member_id"`);
        await queryRunner.query(`DROP TABLE "jd_summary_result"`);
        await queryRunner.query(`DROP INDEX "public"."ix_jd_summary_run_member_id_publication_id_created_at_run_id"`);
        await queryRunner.query(`DROP INDEX "public"."ix_jd_summary_run_member_id_jd_id"`);
        await queryRunner.query(`DROP INDEX "public"."ix_jd_summary_run_publication_id"`);
        await queryRunner.query(`DROP TABLE "jd_summary_run"`);
        await queryRunner.query(`DROP INDEX "public"."ix_jd_member_id_updated_at_jd_id"`);
        await queryRunner.query(`DROP TABLE "jd"`);
    }

}

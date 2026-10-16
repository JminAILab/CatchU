import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCatchEvidencePosition1792029036359 implements MigrationInterface {
    name = 'AddCatchEvidencePosition1792029036359'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "catch_evidence" ADD "position" integer`);
        // 이전 입력 순서는 저장되지 않았다. Catch별 기존 UUID 조회 순서를 보존한다.
        await queryRunner.query(`UPDATE "catch_evidence" AS evidence
            SET "position" = ordered.position
            FROM (
                SELECT "catch_evidence_id",
                    row_number() OVER (PARTITION BY "catch_id" ORDER BY "catch_evidence_id" ASC)::integer AS position
                FROM "catch_evidence"
            ) AS ordered
            WHERE evidence."catch_evidence_id" = ordered."catch_evidence_id"`);
        await queryRunner.query(`ALTER TABLE "catch_evidence" ALTER COLUMN "position" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "catch_evidence" ADD CONSTRAINT "ck_catch_evidence_position_2fbdcc92" CHECK ("position" >= 1)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "catch_evidence" DROP CONSTRAINT "ck_catch_evidence_position_2fbdcc92"`);
        await queryRunner.query(`ALTER TABLE "catch_evidence" DROP COLUMN "position"`);
    }

}

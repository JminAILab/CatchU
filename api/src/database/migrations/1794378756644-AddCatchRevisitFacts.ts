import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCatchRevisitFacts1794378756644 implements MigrationInterface {
    name = 'AddCatchRevisitFacts1794378756644'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // NC3 다시 볼 곳 사실과 첫·마지막 작업 시각(ADR-004, BR6.2). 옛 행은 빈 배열과 NULL로 채워지고 값을 채우지 않는다.
        await queryRunner.query(`ALTER TABLE "catch_asset" ADD "revisit_facts" jsonb NOT NULL DEFAULT '[]'::jsonb`);
        await queryRunner.query(`ALTER TABLE "catch_asset" ADD "first_work_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "catch_asset" ADD "last_work_at" TIMESTAMP WITH TIME ZONE`);
        // 원소 모양은 등록 입력 검사와 본인 응답 검사가 본다. DB는 배열인지와 시각 둘의 짝·순서만 본다(NFR8.2).
        await queryRunner.query(`ALTER TABLE "catch_asset" ADD CONSTRAINT "ck_catch_asset_revisit_facts_2ee323f3" CHECK (jsonb_typeof("revisit_facts") = 'array')`);
        await queryRunner.query(`ALTER TABLE "catch_asset" ADD CONSTRAINT "ck_catch_asset_first_work_at_92ff6639" CHECK (("first_work_at" IS NULL) = ("last_work_at" IS NULL) AND ("first_work_at" IS NULL OR "first_work_at" <= "last_work_at"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "catch_asset" DROP CONSTRAINT "ck_catch_asset_first_work_at_92ff6639"`);
        await queryRunner.query(`ALTER TABLE "catch_asset" DROP CONSTRAINT "ck_catch_asset_revisit_facts_2ee323f3"`);
        await queryRunner.query(`ALTER TABLE "catch_asset" DROP COLUMN "last_work_at"`);
        await queryRunner.query(`ALTER TABLE "catch_asset" DROP COLUMN "first_work_at"`);
        await queryRunner.query(`ALTER TABLE "catch_asset" DROP COLUMN "revisit_facts"`);
    }

}

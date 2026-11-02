import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateU2UsageAndConsent1793161114211 implements MigrationInterface {
    name = 'CreateU2UsageAndConsent1793161114211'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // U2 하루 실행 횟수(C-03)와 첫 이용 동의(C-04) 표. 둘 다 회원을 따라 지워진다(C-06, BR7.7).
        // 한도 값 30은 DB 제약이 아니라 코드 상수로 판정한다(U2 BR1.7).
        await queryRunner.query(`CREATE TABLE "ai_consent" ("consent_id" uuid NOT NULL, "member_id" uuid NOT NULL, "notice_version" text NOT NULL, "consented_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "uq_ai_consent_member_id_notice_version" UNIQUE ("member_id", "notice_version"), CONSTRAINT "pk_ai_consent" PRIMARY KEY ("consent_id"))`);
        await queryRunner.query(`CREATE TABLE "daily_execution_count" ("member_id" uuid NOT NULL, "usage_date" date NOT NULL, "count" integer NOT NULL, CONSTRAINT "ck_daily_execution_count_count_966ba546" CHECK ("count" >= 0), CONSTRAINT "pk_daily_execution_count" PRIMARY KEY ("member_id", "usage_date"))`);
        await queryRunner.query(`ALTER TABLE "ai_consent" ADD CONSTRAINT "fk_ai_consent_member_id" FOREIGN KEY ("member_id") REFERENCES "member_account"("member_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "daily_execution_count" ADD CONSTRAINT "fk_daily_execution_count_member_id" FOREIGN KEY ("member_id") REFERENCES "member_account"("member_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "daily_execution_count" DROP CONSTRAINT "fk_daily_execution_count_member_id"`);
        await queryRunner.query(`ALTER TABLE "ai_consent" DROP CONSTRAINT "fk_ai_consent_member_id"`);
        await queryRunner.query(`DROP TABLE "daily_execution_count"`);
        await queryRunner.query(`DROP TABLE "ai_consent"`);
    }

}

import { MigrationInterface, QueryRunner } from "typeorm";

export class CascadeCatchAssetsOnDelete1792817978014 implements MigrationInterface {
    name = 'CascadeCatchAssetsOnDelete1792817978014'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 회원 행 하나를 지우면 그 회원의 자료가 함께 지워지게 한다(#387). B Catch(#143) 표의 외래 키 이름·지연 확인은 그대로 두고 삭제 규칙만 바꾼다.
        // 마이그레이션을 영역별로 나눈 것은 기존 마이그레이션 묶음별 격리 시험이 자기 표만 적용하기 때문이다.
        await queryRunner.query(`ALTER TABLE "catch_asset" DROP CONSTRAINT "fk_catch_asset_source_request_id"`);
        await queryRunner.query(`ALTER TABLE "catch_asset" DROP CONSTRAINT "fk_catch_asset_owner_id"`);
        await queryRunner.query(`ALTER TABLE "catch_evidence" DROP CONSTRAINT "fk_catch_evidence_catch_id"`);
        await queryRunner.query(`ALTER TABLE "repository_protection" DROP CONSTRAINT "fk_repository_protection_owner_id"`);
        await queryRunner.query(`ALTER TABLE "candidate_registration" DROP CONSTRAINT "fk_candidate_registration_catch_id"`);
        await queryRunner.query(`ALTER TABLE "candidate_registration" DROP CONSTRAINT "fk_candidate_registration_application_record_id"`);
        await queryRunner.query(`ALTER TABLE "catch_asset" ADD CONSTRAINT "fk_catch_asset_source_request_id" FOREIGN KEY ("source_request_id") REFERENCES "analysis_request"("request_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "catch_asset" ADD CONSTRAINT "fk_catch_asset_owner_id" FOREIGN KEY ("owner_id") REFERENCES "member_account"("member_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "catch_evidence" ADD CONSTRAINT "fk_catch_evidence_catch_id" FOREIGN KEY ("catch_id") REFERENCES "catch_asset"("catch_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "repository_protection" ADD CONSTRAINT "fk_repository_protection_owner_id" FOREIGN KEY ("owner_id") REFERENCES "member_account"("member_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "candidate_registration" ADD CONSTRAINT "fk_candidate_registration_catch_id" FOREIGN KEY ("catch_id") REFERENCES "catch_asset"("catch_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "candidate_registration" ADD CONSTRAINT "fk_candidate_registration_application_record_id" FOREIGN KEY ("application_record_id") REFERENCES "result_application_record"("application_record_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "candidate_registration" DROP CONSTRAINT "fk_candidate_registration_application_record_id"`);
        await queryRunner.query(`ALTER TABLE "candidate_registration" DROP CONSTRAINT "fk_candidate_registration_catch_id"`);
        await queryRunner.query(`ALTER TABLE "repository_protection" DROP CONSTRAINT "fk_repository_protection_owner_id"`);
        await queryRunner.query(`ALTER TABLE "catch_evidence" DROP CONSTRAINT "fk_catch_evidence_catch_id"`);
        await queryRunner.query(`ALTER TABLE "catch_asset" DROP CONSTRAINT "fk_catch_asset_owner_id"`);
        await queryRunner.query(`ALTER TABLE "catch_asset" DROP CONSTRAINT "fk_catch_asset_source_request_id"`);
        await queryRunner.query(`ALTER TABLE "candidate_registration" ADD CONSTRAINT "fk_candidate_registration_application_record_id" FOREIGN KEY ("application_record_id") REFERENCES "result_application_record"("application_record_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "candidate_registration" ADD CONSTRAINT "fk_candidate_registration_catch_id" FOREIGN KEY ("catch_id") REFERENCES "catch_asset"("catch_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "repository_protection" ADD CONSTRAINT "fk_repository_protection_owner_id" FOREIGN KEY ("owner_id") REFERENCES "member_account"("member_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "catch_evidence" ADD CONSTRAINT "fk_catch_evidence_catch_id" FOREIGN KEY ("catch_id") REFERENCES "catch_asset"("catch_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "catch_asset" ADD CONSTRAINT "fk_catch_asset_owner_id" FOREIGN KEY ("owner_id") REFERENCES "member_account"("member_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "catch_asset" ADD CONSTRAINT "fk_catch_asset_source_request_id" FOREIGN KEY ("source_request_id") REFERENCES "analysis_request"("request_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}

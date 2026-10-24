import { MigrationInterface, QueryRunner } from "typeorm";

export class CascadeMemberAnalysisOnDelete1792817978011 implements MigrationInterface {
    name = 'CascadeMemberAnalysisOnDelete1792817978011'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 회원 행 하나를 지우면 그 회원의 자료가 함께 지워지게 한다(#387). 회원·분석·공유 링크(#104·#147) 표의 외래 키 이름·지연 확인은 그대로 두고 삭제 규칙만 바꾼다.
        // 마이그레이션을 영역별로 나눈 것은 기존 마이그레이션 묶음별 격리 시험이 자기 표만 적용하기 때문이다.
        // 분석 요청의 순환 참조 3개(동의·현재 시도·재요청 원본)는 함께 지워지는 행끼리라 커밋 때 확인으로 둔다.
        await queryRunner.query(`ALTER TABLE "share_link" DROP CONSTRAINT "fk_share_link_owner_id"`);
        await queryRunner.query(`ALTER TABLE "member_profile" DROP CONSTRAINT "fk_member_profile_member_id"`);
        await queryRunner.query(`ALTER TABLE "github_connection" DROP CONSTRAINT "fk_github_connection_member_id"`);
        await queryRunner.query(`ALTER TABLE "analysis_request" DROP CONSTRAINT "fk_analysis_request_member_id"`);
        await queryRunner.query(`ALTER TABLE "analysis_consent" DROP CONSTRAINT "fk_analysis_consent_request_id_member_id_repository_id"`);
        await queryRunner.query(`ALTER TABLE "analysis_consent" DROP CONSTRAINT "fk_analysis_consent_member_id"`);
        await queryRunner.query(`ALTER TABLE "analysis_attempt" DROP CONSTRAINT "fk_analysis_attempt_request_id"`);
        await queryRunner.query(`ALTER TABLE "idempotency_record" DROP CONSTRAINT "fk_idempotency_record_link_id_member_id"`);
        await queryRunner.query(`ALTER TABLE "idempotency_record" DROP CONSTRAINT "fk_idempotency_record_member_id"`);
        await queryRunner.query(`ALTER TABLE "idempotency_record" DROP CONSTRAINT "fk_idempotency_record_request_id_member_id"`);
        await queryRunner.query(`ALTER TABLE "share_link" ADD CONSTRAINT "fk_share_link_owner_id" FOREIGN KEY ("owner_id") REFERENCES "member_account"("member_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "member_profile" ADD CONSTRAINT "fk_member_profile_member_id" FOREIGN KEY ("member_id") REFERENCES "member_account"("member_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "github_connection" ADD CONSTRAINT "fk_github_connection_member_id" FOREIGN KEY ("member_id") REFERENCES "member_account"("member_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "analysis_request" ADD CONSTRAINT "fk_analysis_request_member_id" FOREIGN KEY ("member_id") REFERENCES "member_account"("member_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "analysis_consent" ADD CONSTRAINT "fk_analysis_consent_member_id" FOREIGN KEY ("member_id") REFERENCES "member_account"("member_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "analysis_consent" ADD CONSTRAINT "fk_analysis_consent_request_id_member_id_repository_id" FOREIGN KEY ("request_id", "member_id", "repository_id") REFERENCES "analysis_request"("request_id","member_id","repository_id") ON DELETE CASCADE ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED`);
        await queryRunner.query(`ALTER TABLE "analysis_attempt" ADD CONSTRAINT "fk_analysis_attempt_request_id" FOREIGN KEY ("request_id") REFERENCES "analysis_request"("request_id") ON DELETE CASCADE ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED`);
        await queryRunner.query(`ALTER TABLE "idempotency_record" ADD CONSTRAINT "fk_idempotency_record_link_id_member_id" FOREIGN KEY ("link_id", "member_id") REFERENCES "share_link"("link_id","owner_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "idempotency_record" ADD CONSTRAINT "fk_idempotency_record_request_id_member_id" FOREIGN KEY ("request_id", "member_id") REFERENCES "analysis_request"("request_id","member_id") ON DELETE CASCADE ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED`);
        await queryRunner.query(`ALTER TABLE "idempotency_record" ADD CONSTRAINT "fk_idempotency_record_member_id" FOREIGN KEY ("member_id") REFERENCES "member_account"("member_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "idempotency_record" DROP CONSTRAINT "fk_idempotency_record_member_id"`);
        await queryRunner.query(`ALTER TABLE "idempotency_record" DROP CONSTRAINT "fk_idempotency_record_request_id_member_id"`);
        await queryRunner.query(`ALTER TABLE "idempotency_record" DROP CONSTRAINT "fk_idempotency_record_link_id_member_id"`);
        await queryRunner.query(`ALTER TABLE "analysis_attempt" DROP CONSTRAINT "fk_analysis_attempt_request_id"`);
        await queryRunner.query(`ALTER TABLE "analysis_consent" DROP CONSTRAINT "fk_analysis_consent_request_id_member_id_repository_id"`);
        await queryRunner.query(`ALTER TABLE "analysis_consent" DROP CONSTRAINT "fk_analysis_consent_member_id"`);
        await queryRunner.query(`ALTER TABLE "analysis_request" DROP CONSTRAINT "fk_analysis_request_member_id"`);
        await queryRunner.query(`ALTER TABLE "github_connection" DROP CONSTRAINT "fk_github_connection_member_id"`);
        await queryRunner.query(`ALTER TABLE "member_profile" DROP CONSTRAINT "fk_member_profile_member_id"`);
        await queryRunner.query(`ALTER TABLE "share_link" DROP CONSTRAINT "fk_share_link_owner_id"`);
        await queryRunner.query(`ALTER TABLE "idempotency_record" ADD CONSTRAINT "fk_idempotency_record_request_id_member_id" FOREIGN KEY ("request_id", "member_id") REFERENCES "analysis_request"("request_id","member_id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED`);
        await queryRunner.query(`ALTER TABLE "idempotency_record" ADD CONSTRAINT "fk_idempotency_record_member_id" FOREIGN KEY ("member_id") REFERENCES "member_account"("member_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "idempotency_record" ADD CONSTRAINT "fk_idempotency_record_link_id_member_id" FOREIGN KEY ("link_id", "member_id") REFERENCES "share_link"("link_id","owner_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "analysis_attempt" ADD CONSTRAINT "fk_analysis_attempt_request_id" FOREIGN KEY ("request_id") REFERENCES "analysis_request"("request_id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED`);
        await queryRunner.query(`ALTER TABLE "analysis_consent" ADD CONSTRAINT "fk_analysis_consent_member_id" FOREIGN KEY ("member_id") REFERENCES "member_account"("member_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "analysis_consent" ADD CONSTRAINT "fk_analysis_consent_request_id_member_id_repository_id" FOREIGN KEY ("request_id", "member_id", "repository_id") REFERENCES "analysis_request"("request_id","member_id","repository_id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED`);
        await queryRunner.query(`ALTER TABLE "analysis_request" ADD CONSTRAINT "fk_analysis_request_member_id" FOREIGN KEY ("member_id") REFERENCES "member_account"("member_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "github_connection" ADD CONSTRAINT "fk_github_connection_member_id" FOREIGN KEY ("member_id") REFERENCES "member_account"("member_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "member_profile" ADD CONSTRAINT "fk_member_profile_member_id" FOREIGN KEY ("member_id") REFERENCES "member_account"("member_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "share_link" ADD CONSTRAINT "fk_share_link_owner_id" FOREIGN KEY ("owner_id") REFERENCES "member_account"("member_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}

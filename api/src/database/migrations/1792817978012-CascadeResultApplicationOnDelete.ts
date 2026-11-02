import { MigrationInterface, QueryRunner } from "typeorm";

export class CascadeResultApplicationOnDelete1792817978012 implements MigrationInterface {
    name = 'CascadeResultApplicationOnDelete1792817978012'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 회원 행 하나를 지우면 그 회원의 자료가 함께 지워지게 한다(#387). E 수신 기록(#205) 표의 외래 키 이름·지연 확인은 그대로 두고 삭제 규칙만 바꾼다.
        // 마이그레이션을 영역별로 나눈 것은 기존 마이그레이션 묶음별 격리 시험이 자기 표만 적용하기 때문이다.
        await queryRunner.query(`ALTER TABLE "result_application_record" DROP CONSTRAINT "fk_result_application_record_attempt_id_request_id"`);
        await queryRunner.query(`ALTER TABLE "result_application_record" ADD CONSTRAINT "fk_result_application_record_attempt_id_request_id" FOREIGN KEY ("attempt_id", "request_id") REFERENCES "analysis_attempt"("attempt_id","request_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "result_application_record" DROP CONSTRAINT "fk_result_application_record_attempt_id_request_id"`);
        await queryRunner.query(`ALTER TABLE "result_application_record" ADD CONSTRAINT "fk_result_application_record_attempt_id_request_id" FOREIGN KEY ("attempt_id", "request_id") REFERENCES "analysis_attempt"("attempt_id","request_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}

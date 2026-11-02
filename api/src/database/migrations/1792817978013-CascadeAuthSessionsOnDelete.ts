import { MigrationInterface, QueryRunner } from "typeorm";

export class CascadeAuthSessionsOnDelete1792817978013 implements MigrationInterface {
    name = 'CascadeAuthSessionsOnDelete1792817978013'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 회원 행 하나를 지우면 그 회원의 자료가 함께 지워지게 한다(#387). 세션(#250) 표의 외래 키 이름·지연 확인은 그대로 두고 삭제 규칙만 바꾼다.
        // 마이그레이션을 영역별로 나눈 것은 기존 마이그레이션 묶음별 격리 시험이 자기 표만 적용하기 때문이다.
        await queryRunner.query(`ALTER TABLE "auth_session" DROP CONSTRAINT "fk_auth_session_member_id"`);
        await queryRunner.query(`ALTER TABLE "session_refresh_token" DROP CONSTRAINT "fk_session_refresh_token_session_id"`);
        await queryRunner.query(`ALTER TABLE "auth_session" ADD CONSTRAINT "fk_auth_session_member_id" FOREIGN KEY ("member_id") REFERENCES "member_account"("member_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "session_refresh_token" ADD CONSTRAINT "fk_session_refresh_token_session_id" FOREIGN KEY ("session_id") REFERENCES "auth_session"("session_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "session_refresh_token" DROP CONSTRAINT "fk_session_refresh_token_session_id"`);
        await queryRunner.query(`ALTER TABLE "auth_session" DROP CONSTRAINT "fk_auth_session_member_id"`);
        await queryRunner.query(`ALTER TABLE "session_refresh_token" ADD CONSTRAINT "fk_session_refresh_token_session_id" FOREIGN KEY ("session_id") REFERENCES "auth_session"("session_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "auth_session" ADD CONSTRAINT "fk_auth_session_member_id" FOREIGN KEY ("member_id") REFERENCES "member_account"("member_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}

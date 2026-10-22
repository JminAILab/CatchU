import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAnalysisRequestHistoryIndex1792640486167 implements MigrationInterface {
    name = 'AddAnalysisRequestHistoryIndex1792640486167'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 본인 이력(#140)의 회원별 접수 시각·requestId 역순 페이지가 전체 요청을 훑고 정렬하지 않게 한다.
        await queryRunner.query(`CREATE INDEX "ix_analysis_request_member_id_submitted_at_request_id" ON "analysis_request"  ("member_id", "submitted_at", "request_id") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "ix_analysis_request_member_id_submitted_at_request_id"`);
    }

}

// pdf_material 실패 사유에 TEXT_LIMIT_EXCEEDED(쪽 글 합계 60,000자 초과)를 더한다.
// 근거: 팀장 결정 2026-11-10(#420 issuecomment-6759834176). 승인 설계 문서는 고치지 않았다.
// 되돌리기(down)는 TEXT_LIMIT_EXCEEDED 행이 남아 있으면 제약을 다시 걸지 못해 실패한다(그 행을 먼저 정리해야 함).
import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPdfTextLimitFailureCode1794289608328 implements MigrationInterface {
    name = 'AddPdfTextLimitFailureCode1794289608328'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "pdf_material" DROP CONSTRAINT "ck_pdf_material_extraction_failure_code_90195c4e"`);
        await queryRunner.query(`ALTER TABLE "pdf_material" ADD CONSTRAINT "ck_pdf_material_extraction_failure_code_62ec3d8c" CHECK ("extraction_failure_code" IN ('ENCRYPTED', 'UNREADABLE_FILE', 'PAGE_LIMIT_EXCEEDED', 'TEXT_LIMIT_EXCEEDED', 'DEADLINE_EXCEEDED'))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "pdf_material" DROP CONSTRAINT "ck_pdf_material_extraction_failure_code_62ec3d8c"`);
        await queryRunner.query(`ALTER TABLE "pdf_material" ADD CONSTRAINT "ck_pdf_material_extraction_failure_code_90195c4e" CHECK (((extraction_failure_code)::text = ANY ((ARRAY['ENCRYPTED'::character varying, 'UNREADABLE_FILE'::character varying, 'PAGE_LIMIT_EXCEEDED'::character varying, 'DEADLINE_EXCEEDED'::character varying])::text[])))`);
    }

}

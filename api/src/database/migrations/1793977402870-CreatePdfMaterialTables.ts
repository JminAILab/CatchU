import { MigrationInterface, QueryRunner } from "typeorm";

export class CreatePdfMaterialTables1793977402870 implements MigrationInterface {
    name = 'CreatePdfMaterialTables1793977402870'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "pdf_material" ("pdf_material_id" uuid NOT NULL, "member_id" uuid NOT NULL, "title" text NOT NULL, "storage_key" text NOT NULL, "file_size_bytes" integer NOT NULL, "page_count" integer, "extraction_state" character varying NOT NULL, "extraction_deadline_at" TIMESTAMP WITH TIME ZONE NOT NULL, "extraction_failure_code" character varying, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "ck_pdf_material_extraction_state_558330bd" CHECK (("extraction_state" = 'FAILED') = ("extraction_failure_code" IS NOT NULL)), CONSTRAINT "ck_pdf_material_extraction_state_3847c6d0" CHECK (("extraction_state" = 'DONE') = ("page_count" IS NOT NULL)), CONSTRAINT "ck_pdf_material_extraction_failure_code_90195c4e" CHECK ("extraction_failure_code" IN ('ENCRYPTED', 'UNREADABLE_FILE', 'PAGE_LIMIT_EXCEEDED', 'DEADLINE_EXCEEDED')), CONSTRAINT "ck_pdf_material_extraction_state_c34ec40e" CHECK ("extraction_state" IN ('PENDING', 'DONE', 'FAILED')), CONSTRAINT "ck_pdf_material_page_count_6a7cae6e" CHECK ("page_count" IS NULL OR ("page_count" >= 1 AND "page_count" <= 50)), CONSTRAINT "ck_pdf_material_file_size_bytes_baef219e" CHECK ("file_size_bytes" > 0), CONSTRAINT "ck_pdf_material_title_74e62505" CHECK (char_length("title") >= 1), CONSTRAINT "pk_pdf_material" PRIMARY KEY ("pdf_material_id"))`);
        await queryRunner.query(`CREATE INDEX "ix_pdf_material_member_id" ON "pdf_material"  ("member_id") `);
        await queryRunner.query(`CREATE TABLE "pdf_page_text" ("pdf_page_text_id" uuid NOT NULL, "pdf_material_id" uuid NOT NULL, "page_number" integer NOT NULL, "text" text NOT NULL, "readable" boolean NOT NULL, CONSTRAINT "uq_pdf_page_text_pdf_material_id_page_number" UNIQUE ("pdf_material_id", "page_number"), CONSTRAINT "ck_pdf_page_text_readable_11e92370" CHECK ("readable" = ("text" <> '')), CONSTRAINT "ck_pdf_page_text_page_number_c7d75aaa" CHECK ("page_number" >= 1), CONSTRAINT "pk_pdf_page_text" PRIMARY KEY ("pdf_page_text_id"))`);
        await queryRunner.query(`CREATE TABLE "published_pdf_page" ("published_pdf_page_id" uuid NOT NULL, "published_item_id" uuid NOT NULL, "page_number" integer NOT NULL, "text" text NOT NULL, "readable" boolean NOT NULL, CONSTRAINT "uq_published_pdf_page_published_item_id_page_number" UNIQUE ("published_item_id", "page_number"), CONSTRAINT "ck_published_pdf_page_readable_11e92370" CHECK ("readable" = ("text" <> '')), CONSTRAINT "ck_published_pdf_page_page_number_c7d75aaa" CHECK ("page_number" >= 1), CONSTRAINT "pk_published_pdf_page" PRIMARY KEY ("published_pdf_page_id"))`);
        await queryRunner.query(`ALTER TABLE "pdf_material" ADD CONSTRAINT "fk_pdf_material_member_id" FOREIGN KEY ("member_id") REFERENCES "member_account"("member_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "pdf_page_text" ADD CONSTRAINT "fk_pdf_page_text_pdf_material_id" FOREIGN KEY ("pdf_material_id") REFERENCES "pdf_material"("pdf_material_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "published_pdf_page" ADD CONSTRAINT "fk_published_pdf_page_published_item_id" FOREIGN KEY ("published_item_id") REFERENCES "published_item"("published_item_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "published_pdf_page" DROP CONSTRAINT "fk_published_pdf_page_published_item_id"`);
        await queryRunner.query(`ALTER TABLE "pdf_page_text" DROP CONSTRAINT "fk_pdf_page_text_pdf_material_id"`);
        await queryRunner.query(`ALTER TABLE "pdf_material" DROP CONSTRAINT "fk_pdf_material_member_id"`);
        await queryRunner.query(`DROP TABLE "published_pdf_page"`);
        await queryRunner.query(`DROP TABLE "pdf_page_text"`);
        await queryRunner.query(`DROP INDEX "ix_pdf_material_member_id"`);
        await queryRunner.query(`DROP TABLE "pdf_material"`);
    }

}

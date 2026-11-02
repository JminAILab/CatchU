import { MigrationInterface, QueryRunner } from "typeorm";

export class CreatePublishedIndexTables1793257382741 implements MigrationInterface {
    name = 'CreatePublishedIndexTables1793257382741'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // pgvector(U3 published_chunk.embedding). 슈퍼유저가 아닌 DB에는 관리자가 미리 만들어 둔다. down에서는 지우지 않는다(api/CONVENTIONS.md).
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);
        await queryRunner.query(`CREATE TABLE "publication_index" ("publication_id" uuid NOT NULL, "status" character varying NOT NULL, "deadline_at" TIMESTAMP WITH TIME ZONE NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "ck_publication_index_status_dcbae7db" CHECK ("status" IN ('PENDING', 'DONE', 'FAILED')), CONSTRAINT "pk_publication_index" PRIMARY KEY ("publication_id"))`);
        await queryRunner.query(`CREATE TABLE "published_chunk" ("chunk_id" uuid NOT NULL, "publication_id" uuid NOT NULL, "published_item_id" uuid NOT NULL, "seq" integer NOT NULL, "field_path" text NOT NULL, "char_start" integer NOT NULL, "char_end" integer NOT NULL, "pdf_page" integer, "source_kind" character varying NOT NULL, "text" text NOT NULL, "catch_evidence_urls" text array NOT NULL DEFAULT '{}', "embedding" vector(1024), CONSTRAINT "uq_published_chunk_publication_id_seq" UNIQUE ("publication_id", "seq"), CONSTRAINT "ck_published_chunk_source_kind_b53c8f67" CHECK ("source_kind" IN ('GITHUB_RECORD', 'AUTHOR_MATERIAL')), CONSTRAINT "ck_published_chunk_pdf_page_ac487b16" CHECK ("pdf_page" IS NULL OR "pdf_page" >= 1), CONSTRAINT "ck_published_chunk_char_end_7479b3ab" CHECK ("char_end" > "char_start" AND "char_end" - "char_start" <= 1000), CONSTRAINT "ck_published_chunk_char_start_266c3ad4" CHECK ("char_start" >= 0), CONSTRAINT "ck_published_chunk_seq_8b972840" CHECK ("seq" >= 1), CONSTRAINT "pk_published_chunk" PRIMARY KEY ("chunk_id"))`);
        await queryRunner.query(`ALTER TABLE "publication_index" ADD CONSTRAINT "fk_publication_index_publication_id" FOREIGN KEY ("publication_id") REFERENCES "publication"("publication_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "published_chunk" ADD CONSTRAINT "fk_published_chunk_publication_id_published_item_id" FOREIGN KEY ("publication_id", "published_item_id") REFERENCES "published_item"("publication_id","published_item_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "published_chunk" DROP CONSTRAINT "fk_published_chunk_publication_id_published_item_id"`);
        await queryRunner.query(`ALTER TABLE "publication_index" DROP CONSTRAINT "fk_publication_index_publication_id"`);
        await queryRunner.query(`DROP TABLE "published_chunk"`);
        await queryRunner.query(`DROP TABLE "publication_index"`);
    }

}

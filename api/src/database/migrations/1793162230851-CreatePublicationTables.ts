import { MigrationInterface, QueryRunner } from "typeorm";

export class CreatePublicationTables1793162230851 implements MigrationInterface {
    name = 'CreatePublicationTables1793162230851'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "text_material" ("text_material_id" uuid NOT NULL, "member_id" uuid NOT NULL, "title" text NOT NULL, "body" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "ck_text_material_title_74e62505" CHECK (char_length("title") >= 1), CONSTRAINT "pk_text_material" PRIMARY KEY ("text_material_id"))`);
        await queryRunner.query(`CREATE INDEX "ix_text_material_member_id" ON "text_material"  ("member_id") `);
        await queryRunner.query(`CREATE TABLE "publication" ("publication_id" uuid NOT NULL, "member_id" uuid NOT NULL, "title" text NOT NULL, "link_token_reference" text NOT NULL, "password_protection_reference" text, "published_at" TIMESTAMP WITH TIME ZONE NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "stopped_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "uq_publication_link_token_reference" UNIQUE ("link_token_reference"), CONSTRAINT "ck_publication_stopped_at_4bc6fd20" CHECK ("stopped_at" IS NULL OR "stopped_at" >= "published_at"), CONSTRAINT "ck_publication_expires_at_07dbc4ea" CHECK ("expires_at" = "published_at" + interval '2160 hours'), CONSTRAINT "ck_publication_title_74e62505" CHECK (char_length("title") >= 1), CONSTRAINT "pk_publication" PRIMARY KEY ("publication_id"))`);
        await queryRunner.query(`CREATE INDEX "ix_publication_member_id" ON "publication"  ("member_id") `);
        await queryRunner.query(`CREATE TABLE "published_item" ("published_item_id" uuid NOT NULL, "publication_id" uuid NOT NULL, "position" integer NOT NULL, "item_kind" character varying NOT NULL, "source_id" uuid NOT NULL, "title" text NOT NULL, "snapshot" jsonb NOT NULL, "pdf_copy_key" text, CONSTRAINT "uq_published_item_publication_id_published_item_id" UNIQUE ("publication_id", "published_item_id"), CONSTRAINT "uq_published_item_publication_id_position" UNIQUE ("publication_id", "position"), CONSTRAINT "ck_published_item_item_kind_b00567b2" CHECK (("item_kind" = 'PDF_MATERIAL') = ("pdf_copy_key" IS NOT NULL)), CONSTRAINT "ck_published_item_item_kind_030f2e24" CHECK ("item_kind" IN ('CATCH', 'TEXT_MATERIAL', 'PDF_MATERIAL')), CONSTRAINT "ck_published_item_position_2fbdcc92" CHECK ("position" >= 1), CONSTRAINT "pk_published_item" PRIMARY KEY ("published_item_id"))`);
        await queryRunner.query(`ALTER TABLE "text_material" ADD CONSTRAINT "fk_text_material_member_id" FOREIGN KEY ("member_id") REFERENCES "member_account"("member_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "publication" ADD CONSTRAINT "fk_publication_member_id" FOREIGN KEY ("member_id") REFERENCES "member_account"("member_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "published_item" ADD CONSTRAINT "fk_published_item_publication_id" FOREIGN KEY ("publication_id") REFERENCES "publication"("publication_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "published_item" DROP CONSTRAINT "fk_published_item_publication_id"`);
        await queryRunner.query(`ALTER TABLE "publication" DROP CONSTRAINT "fk_publication_member_id"`);
        await queryRunner.query(`ALTER TABLE "text_material" DROP CONSTRAINT "fk_text_material_member_id"`);
        await queryRunner.query(`DROP TABLE "published_item"`);
        await queryRunner.query(`DROP INDEX "ix_publication_member_id"`);
        await queryRunner.query(`DROP TABLE "publication"`);
        await queryRunner.query(`DROP INDEX "ix_text_material_member_id"`);
        await queryRunner.query(`DROP TABLE "text_material"`);
    }

}

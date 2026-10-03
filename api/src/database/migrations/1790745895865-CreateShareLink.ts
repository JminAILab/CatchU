import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateShareLink1790745895865 implements MigrationInterface {
    name = 'CreateShareLink1790745895865'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "share_link" ("link_id" uuid NOT NULL, "owner_id" uuid NOT NULL, "title" text NOT NULL, "link_token_reference" text NOT NULL, "password_protection_reference" text, "issued_at" TIMESTAMP WITH TIME ZONE NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "stopped_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "uq_share_link_link_token_reference" UNIQUE ("link_token_reference"), CONSTRAINT "uq_share_link_link_id_owner_id" UNIQUE ("link_id", "owner_id"), CONSTRAINT "ck_share_link_stopped_at_a90e6743" CHECK ("stopped_at" IS NULL OR "stopped_at" >= "issued_at"), CONSTRAINT "ck_share_link_expires_at_c7eb4ca8" CHECK ("expires_at" = "issued_at" + interval '720 hours'), CONSTRAINT "ck_share_link_title_74e62505" CHECK (char_length("title") >= 1), CONSTRAINT "pk_share_link" PRIMARY KEY ("link_id"))`);
        await queryRunner.query(`CREATE INDEX "ix_share_link_owner_id" ON "share_link"  ("owner_id") `);
        await queryRunner.query(`ALTER TABLE "share_link" ADD CONSTRAINT "fk_share_link_owner_id" FOREIGN KEY ("owner_id") REFERENCES "member_account"("member_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "idempotency_record" ADD CONSTRAINT "fk_idempotency_record_link_id_member_id" FOREIGN KEY ("link_id", "member_id") REFERENCES "share_link"("link_id","owner_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "idempotency_record" DROP CONSTRAINT "fk_idempotency_record_link_id_member_id"`);
        await queryRunner.query(`ALTER TABLE "share_link" DROP CONSTRAINT "fk_share_link_owner_id"`);
        await queryRunner.query(`DROP INDEX "ix_share_link_owner_id"`);
        await queryRunner.query(`DROP TABLE "share_link"`);
    }

}

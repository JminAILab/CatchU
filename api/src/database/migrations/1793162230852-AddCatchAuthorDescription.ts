import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCatchAuthorDescription1793162230852 implements MigrationInterface {
    name = 'AddCatchAuthorDescription1793162230852'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "catch_asset" ADD "author_description" text`);
        await queryRunner.query(`ALTER TABLE "catch_asset" ADD "author_description_updated_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "catch_asset" ADD CONSTRAINT "ck_catch_asset_author_description_87d1b056" CHECK (("author_description" IS NULL) = ("author_description_updated_at" IS NULL))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "catch_asset" DROP CONSTRAINT "ck_catch_asset_author_description_87d1b056"`);
        await queryRunner.query(`ALTER TABLE "catch_asset" DROP COLUMN "author_description_updated_at"`);
        await queryRunner.query(`ALTER TABLE "catch_asset" DROP COLUMN "author_description"`);
    }

}

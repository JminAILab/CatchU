import { MigrationInterface, QueryRunner } from "typeorm";

export class AllowNullCatchTitle1791784385918 implements MigrationInterface {
    name = 'AllowNullCatchTitle1791784385918'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "catch_asset" ALTER COLUMN "title" DROP NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "catch_asset" ALTER COLUMN "title" SET NOT NULL`);
    }

}

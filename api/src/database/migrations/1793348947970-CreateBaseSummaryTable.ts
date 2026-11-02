import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateBaseSummaryTable1793348947970 implements MigrationInterface {
    name = 'CreateBaseSummaryTable1793348947970'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "base_summary" ("base_summary_id" uuid NOT NULL, "publication_id" uuid NOT NULL, "status" character varying NOT NULL, "deadline_at" TIMESTAMP WITH TIME ZONE NOT NULL, "items" jsonb NOT NULL DEFAULT '[]', "generated_at" TIMESTAMP WITH TIME ZONE, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "uq_base_summary_publication_id" UNIQUE ("publication_id"), CONSTRAINT "ck_base_summary_status_dcbae7db" CHECK ("status" IN ('PENDING', 'DONE', 'FAILED')), CONSTRAINT "pk_base_summary" PRIMARY KEY ("base_summary_id"))`);
        await queryRunner.query(`ALTER TABLE "base_summary" ADD CONSTRAINT "fk_base_summary_publication_id" FOREIGN KEY ("publication_id") REFERENCES "publication"("publication_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "base_summary" DROP CONSTRAINT "fk_base_summary_publication_id"`);
        await queryRunner.query(`DROP TABLE "base_summary"`);
    }

}

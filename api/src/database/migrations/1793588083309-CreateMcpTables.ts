import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateMcpTables1793588083309 implements MigrationInterface {
    name = 'CreateMcpTables1793588083309'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "mcp_client" ("mcp_client_id" text NOT NULL, "client_name" text, "redirect_uris" text array NOT NULL, "registered_at" TIMESTAMP WITH TIME ZONE NOT NULL, "approved_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "ck_mcp_client_redirect_uris_f413ccb3" CHECK (array_position("redirect_uris", NULL) IS NULL), CONSTRAINT "ck_mcp_client_redirect_uris_15cff275" CHECK (cardinality("redirect_uris") >= 1), CONSTRAINT "ck_mcp_client_client_name_ccf9f240" CHECK (char_length("client_name") BETWEEN 0 AND 200), CONSTRAINT "pk_mcp_client" PRIMARY KEY ("mcp_client_id"))`);
        await queryRunner.query(`CREATE TABLE "mcp_connection" ("connection_id" uuid NOT NULL, "member_id" uuid NOT NULL, "mcp_client_id" text NOT NULL, "consented_at" TIMESTAMP WITH TIME ZONE NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "uq_mcp_connection_member_id_mcp_client_id" UNIQUE ("member_id", "mcp_client_id"), CONSTRAINT "pk_mcp_connection" PRIMARY KEY ("connection_id"))`);
        await queryRunner.query(`CREATE TABLE "mcp_access_token" ("token_hash" text NOT NULL, "member_id" uuid NOT NULL, "mcp_client_id" text NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "uq_mcp_access_token_member_id_mcp_client_id" UNIQUE ("member_id", "mcp_client_id"), CONSTRAINT "pk_mcp_access_token" PRIMARY KEY ("token_hash"))`);
        await queryRunner.query(`CREATE TABLE "mcp_authorization_code" ("code_hash" text NOT NULL, "member_id" uuid NOT NULL, "mcp_client_id" text NOT NULL, "code_challenge" text NOT NULL, "redirect_uri" text NOT NULL, "resource" text, "consented_at" TIMESTAMP WITH TIME ZONE NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "used_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "pk_mcp_authorization_code" PRIMARY KEY ("code_hash"))`);
        await queryRunner.query(`CREATE INDEX "ix_mcp_authorization_code_member_id" ON "mcp_authorization_code"  ("member_id") `);
        await queryRunner.query(`ALTER TABLE "mcp_connection" ADD CONSTRAINT "fk_mcp_connection_mcp_client_id" FOREIGN KEY ("mcp_client_id") REFERENCES "mcp_client"("mcp_client_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "mcp_connection" ADD CONSTRAINT "fk_mcp_connection_member_id" FOREIGN KEY ("member_id") REFERENCES "member_account"("member_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "mcp_access_token" ADD CONSTRAINT "fk_mcp_access_token_member_id_mcp_client_id" FOREIGN KEY ("member_id", "mcp_client_id") REFERENCES "mcp_connection"("member_id","mcp_client_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "mcp_access_token" ADD CONSTRAINT "fk_mcp_access_token_member_id" FOREIGN KEY ("member_id") REFERENCES "member_account"("member_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "mcp_authorization_code" ADD CONSTRAINT "fk_mcp_authorization_code_mcp_client_id" FOREIGN KEY ("mcp_client_id") REFERENCES "mcp_client"("mcp_client_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "mcp_authorization_code" ADD CONSTRAINT "fk_mcp_authorization_code_member_id" FOREIGN KEY ("member_id") REFERENCES "member_account"("member_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "mcp_authorization_code" DROP CONSTRAINT "fk_mcp_authorization_code_member_id"`);
        await queryRunner.query(`ALTER TABLE "mcp_authorization_code" DROP CONSTRAINT "fk_mcp_authorization_code_mcp_client_id"`);
        await queryRunner.query(`ALTER TABLE "mcp_access_token" DROP CONSTRAINT "fk_mcp_access_token_member_id"`);
        await queryRunner.query(`ALTER TABLE "mcp_access_token" DROP CONSTRAINT "fk_mcp_access_token_member_id_mcp_client_id"`);
        await queryRunner.query(`ALTER TABLE "mcp_connection" DROP CONSTRAINT "fk_mcp_connection_member_id"`);
        await queryRunner.query(`ALTER TABLE "mcp_connection" DROP CONSTRAINT "fk_mcp_connection_mcp_client_id"`);
        await queryRunner.query(`DROP INDEX "ix_mcp_authorization_code_member_id"`);
        await queryRunner.query(`DROP TABLE "mcp_authorization_code"`);
        await queryRunner.query(`DROP TABLE "mcp_access_token"`);
        await queryRunner.query(`DROP TABLE "mcp_connection"`);
        await queryRunner.query(`DROP TABLE "mcp_client"`);
    }

}

import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAuthSessions1791648335731 implements MigrationInterface {
    name = 'CreateAuthSessions1791648335731'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "auth_session" ("session_id" uuid NOT NULL, "member_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "last_refreshed_at" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "ck_auth_session_last_refreshed_at_7e0dcb93" CHECK ("last_refreshed_at" >= "created_at" AND "last_refreshed_at" < "expires_at"), CONSTRAINT "ck_auth_session_expires_at_c3e42303" CHECK ("expires_at" > "created_at"), CONSTRAINT "pk_auth_session" PRIMARY KEY ("session_id"))`);
        await queryRunner.query(`CREATE INDEX "ix_auth_session_member_id" ON "auth_session"  ("member_id") `);
        await queryRunner.query(`CREATE TABLE "session_refresh_token" ("refresh_id" uuid NOT NULL, "session_id" uuid NOT NULL, "token_hash" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "used_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "uq_session_refresh_token_token_hash" UNIQUE ("token_hash"), CONSTRAINT "ck_session_refresh_token_token_hash_2ad1df4f" CHECK ("token_hash" ~ '^[a-f0-9]{64}$'), CONSTRAINT "pk_session_refresh_token" PRIMARY KEY ("refresh_id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "ix_session_refresh_token_session_id_b67329a3" ON "session_refresh_token"  ("session_id") WHERE "used_at" IS NULL`);
        await queryRunner.query(`ALTER TABLE "auth_session" ADD CONSTRAINT "fk_auth_session_member_id" FOREIGN KEY ("member_id") REFERENCES "member_account"("member_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "session_refresh_token" ADD CONSTRAINT "fk_session_refresh_token_session_id" FOREIGN KEY ("session_id") REFERENCES "auth_session"("session_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "session_refresh_token" DROP CONSTRAINT "fk_session_refresh_token_session_id"`);
        await queryRunner.query(`ALTER TABLE "auth_session" DROP CONSTRAINT "fk_auth_session_member_id"`);
        await queryRunner.query(`DROP INDEX "ix_session_refresh_token_session_id_b67329a3"`);
        await queryRunner.query(`DROP TABLE "session_refresh_token"`);
        await queryRunner.query(`DROP INDEX "ix_auth_session_member_id"`);
        await queryRunner.query(`DROP TABLE "auth_session"`);
    }

}

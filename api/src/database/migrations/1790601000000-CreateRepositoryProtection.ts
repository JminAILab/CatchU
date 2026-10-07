import type { MigrationInterface, QueryRunner } from 'typeorm';

/** 선행 회원 테이블 이후 실행한다. 보호 관측/판정 행을 임의 생성하거나 NONE으로 채우지 않는다. */
export class CreateRepositoryProtection1790601000000 implements MigrationInterface {
  name = 'CreateRepositoryProtection1790601000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "repository_protection" (
      "protection_id" uuid NOT NULL,
      "owner_id" uuid NOT NULL,
      "repository_id" text NOT NULL,
      "confirmed_source_state" jsonb,
      "observation_provenance" jsonb,
      "observed_at" timestamptz,
      "observation_failure" jsonb,
      "applied_restriction" varchar NOT NULL,
      CONSTRAINT "pk_repository_protection" PRIMARY KEY ("protection_id"),
      CONSTRAINT "uq_repository_protection_owner_repository" UNIQUE ("owner_id", "repository_id"),
      CONSTRAINT "ck_repository_protection_repository_id" CHECK (char_length("repository_id") >= 1),
      CONSTRAINT "ck_repository_protection_restriction" CHECK ("applied_restriction" IN ('NONE', 'SOURCE_PRIVATE')),
      CONSTRAINT "fk_repository_protection_owner_id" FOREIGN KEY ("owner_id") REFERENCES "member_account"("member_id")
    )`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "repository_protection"');
  }
}

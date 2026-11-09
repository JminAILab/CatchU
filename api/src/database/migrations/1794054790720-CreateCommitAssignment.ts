import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateCommitAssignment1794054790720 implements MigrationInterface {
    name = 'CreateCommitAssignment1794054790720'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // CR2 소속 기록(ADR-002). 한 쌍 외래 키가 가리킬 catch_asset (catch_id, owner_id) 유일 조건을 먼저 둔다.
        await queryRunner.query(`ALTER TABLE "catch_asset" ADD CONSTRAINT "uq_catch_asset_catch_id_owner_id" UNIQUE ("catch_id", "owner_id")`);
        await queryRunner.query(`CREATE TABLE "commit_assignment" ("member_id" uuid NOT NULL, "github_repository_id" text NOT NULL, "commit_sha" character(40) NOT NULL, "catch_id" uuid NOT NULL, "assigned_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "ck_commit_assignment_commit_sha_18d8811a" CHECK ("commit_sha" ~ '^[0-9a-f]{40}$'), CONSTRAINT "ck_commit_assignment_github_repository_id_0de507be" CHECK (char_length("github_repository_id") >= 1), CONSTRAINT "pk_commit_assignment" PRIMARY KEY ("member_id", "github_repository_id", "commit_sha"))`);
        // Catch 삭제 연쇄가 소속 기록 전체를 훑지 않게 하는 색인.
        await queryRunner.query(`CREATE INDEX "ix_commit_assignment_catch_id_member_id" ON "commit_assignment" ("catch_id", "member_id") `);
        // 회원이 Catch 주인과 다르면 거부하고, Catch가 지워지면 함께 지워진다(회원 탈퇴·분석 요청 삭제).
        await queryRunner.query(`ALTER TABLE "commit_assignment" ADD CONSTRAINT "fk_commit_assignment_catch_id_member_id" FOREIGN KEY ("catch_id", "member_id") REFERENCES "catch_asset"("catch_id","owner_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "commit_assignment" DROP CONSTRAINT "fk_commit_assignment_catch_id_member_id"`);
        await queryRunner.query(`DROP INDEX "ix_commit_assignment_catch_id_member_id"`);
        await queryRunner.query(`DROP TABLE "commit_assignment"`);
        await queryRunner.query(`ALTER TABLE "catch_asset" DROP CONSTRAINT "uq_catch_asset_catch_id_owner_id"`);
    }

}

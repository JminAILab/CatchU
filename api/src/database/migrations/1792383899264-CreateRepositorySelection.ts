import { MigrationInterface, QueryRunner } from "typeorm";

// 초기 범위 판본(#252). 값은 정의 시점(2026-10-19) worker 기본값(worker/app/collection/limits.py)이고 지위는 status다.
// DECIDED: 팀장 결정, PROPOSED: 실측 전 제안(docs/CatchU_collection_control_scope.md 2.3), CONTRACT: 현행 계약.
const INITIAL_SCOPE_REVISION = 'catchu:allowed-scope:2026-10-19:v1';
const INITIAL_COLLECTION_TERMS = {
    method: { status: 'DECIDED', value: 'GITHUB_API' },
    range: { status: 'PROPOSED', value: { defaultBranchCommits: 500, linkedAccountCommitDetails: 200, pullRequests: 100,
        linkedAccountPullRequestCommitLists: 30, issueListItems: 100 } },
    limits: { status: 'PROPOSED', value: { calls: 300, collectionSeconds: 600, totalBytes: 52428800, responseBytes: 10485760,
        connectTimeoutSeconds: 5, readTimeoutSeconds: 15, comparePages: 10, baseBranchCommits: 100,
        associatedPullRequestLookupBatch: 100 } },
    retries: { status: 'CONTRACT', value: 'NONE' },
};

export class CreateRepositorySelection1792383899264 implements MigrationInterface {
    name = 'CreateRepositorySelection1792383899264'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "allowed_scope_revision" ("scope_revision" text NOT NULL, "allowed_resource_types" text array NOT NULL, "whole_repository" boolean NOT NULL, "collection_terms" jsonb NOT NULL, CONSTRAINT "ck_allowed_scope_revision_collection_terms_aebcdc5d" CHECK (jsonb_typeof("collection_terms") = 'object'), CONSTRAINT "ck_allowed_scope_revision_whole_repository_4daab203" CHECK ("whole_repository" = true), CONSTRAINT "ck_allowed_scope_revision_allowed_resource_types_f4f25463" CHECK ("allowed_resource_types" <@ ARRAY['COMMIT', 'PULL_REQUEST', 'ISSUE']::text[] AND cardinality("allowed_resource_types") >= 1), CONSTRAINT "ck_allowed_scope_revision_scope_revision_d6849c1d" CHECK (char_length("scope_revision") BETWEEN 1 AND 200), CONSTRAINT "pk_allowed_scope_revision" PRIMARY KEY ("scope_revision"))`);
        await queryRunner.query(`CREATE TABLE "repository_selection" ("repository_id" text NOT NULL, "selection_reference" text NOT NULL, "scope_revision" text NOT NULL, "active" boolean NOT NULL, CONSTRAINT "uq_repository_selection_selection_reference" UNIQUE ("selection_reference"), CONSTRAINT "ck_repository_selection_selection_reference_5257f469" CHECK (char_length("selection_reference") BETWEEN 1 AND 200), CONSTRAINT "ck_repository_selection_repository_id_53b5b3c1" CHECK ("repository_id" ~ '^[1-9][0-9]*$'), CONSTRAINT "pk_repository_selection" PRIMARY KEY ("repository_id"))`);
        await queryRunner.query(`ALTER TABLE "repository_selection" ADD CONSTRAINT "fk_repository_selection_scope_revision" FOREIGN KEY ("scope_revision") REFERENCES "allowed_scope_revision"("scope_revision") ON DELETE NO ACTION ON UPDATE NO ACTION`);

        // 접수된 동의가 가리키는 범위 의미이므로 고치거나 지우지 않는다. 의미가 바뀌면 새 판본을 추가한다.
        await queryRunner.query(`CREATE FUNCTION prevent_scope_revision_rewrite() RETURNS trigger LANGUAGE plpgsql AS $body$
          BEGIN
            IF TG_OP = 'DELETE' OR NEW IS DISTINCT FROM OLD THEN
              RAISE EXCEPTION 'Allowed scope revision is immutable' USING ERRCODE = '23514';
            END IF;
            RETURN NEW;
          END $body$`);
        await queryRunner.query(`CREATE TRIGGER tr_allowed_scope_revision_immutable BEFORE UPDATE OR DELETE ON allowed_scope_revision
          FOR EACH ROW EXECUTE FUNCTION prevent_scope_revision_rewrite()`);

        // 초기 선정: #105 2026-10-16 댓글의 두 저장소(로그인한 모든 회원의 선정 대상, 2026-10-17 팀장 결정으로 활성 실제 회원 공통 허용).
        // 저장소 ID·선정 참조는 PR #319 카탈로그(selected-repository-catalog.ts)의 판본과 같다.
        await queryRunner.query(`INSERT INTO "allowed_scope_revision" ("scope_revision", "allowed_resource_types", "whole_repository", "collection_terms") VALUES ($1, $2, true, $3)`,
            [INITIAL_SCOPE_REVISION, ['COMMIT', 'PULL_REQUEST', 'ISSUE'], JSON.stringify(INITIAL_COLLECTION_TERMS)]);
        await queryRunner.query(`INSERT INTO "repository_selection" ("repository_id", "selection_reference", "scope_revision", "active") VALUES ($1, $2, $5, true), ($3, $4, $5, true)`,
            ['570342307', 'catchu:selected-repository:2026-10-16:570342307:v1',
                '547322698', 'catchu:selected-repository:2026-10-16:547322698:v1', INITIAL_SCOPE_REVISION]);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TRIGGER tr_allowed_scope_revision_immutable ON allowed_scope_revision`);
        await queryRunner.query(`DROP FUNCTION prevent_scope_revision_rewrite()`);
        await queryRunner.query(`ALTER TABLE "repository_selection" DROP CONSTRAINT "fk_repository_selection_scope_revision"`);
        await queryRunner.query(`DROP TABLE "repository_selection"`);
        await queryRunner.query(`DROP TABLE "allowed_scope_revision"`);
    }

}

import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateMemberAnalysisFoundation1790500000000 implements MigrationInterface {
    name = 'CreateMemberAnalysisFoundation1790500000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "member_account" ("member_id" uuid NOT NULL, "identity_reference" text NOT NULL, "account_state" character varying NOT NULL, CONSTRAINT "uq_member_account_identity_reference" UNIQUE ("identity_reference"), CONSTRAINT "ck_member_account_account_state_4ee4c4df" CHECK (char_length("account_state") >= 1), CONSTRAINT "ck_member_account_identity_reference_90d58ae5" CHECK (char_length("identity_reference") >= 1), CONSTRAINT "pk_member_account" PRIMARY KEY ("member_id"))`);
        await queryRunner.query(`CREATE TABLE "member_profile" ("profile_id" uuid NOT NULL, "member_id" uuid NOT NULL, "display_name" text NOT NULL DEFAULT '', "introduction" text NOT NULL DEFAULT '', "desired_role" text NOT NULL DEFAULT '', "skills" text array NOT NULL DEFAULT '{}'::text[], "input_provenance" character varying NOT NULL DEFAULT 'SELF_REPORTED', CONSTRAINT "uq_member_profile_member_id" UNIQUE ("member_id"), CONSTRAINT "ck_member_profile_input_provenance_94a5e1aa" CHECK ("input_provenance" IN ('SELF_REPORTED')), CONSTRAINT "pk_member_profile" PRIMARY KEY ("profile_id"))`);
        await queryRunner.query(`CREATE TABLE "github_connection" ("connection_id" uuid NOT NULL, "member_id" uuid NOT NULL, "external_account_reference" text, "account_login" text, "credential_reference" text, "connection_state" character varying NOT NULL, CONSTRAINT "uq_github_connection_member_id" UNIQUE ("member_id"), CONSTRAINT "ck_github_connection_connection_state_1b67d976" CHECK ("connection_state" IN ('CONNECTED', 'DISCONNECTED', 'REAUTH_REQUIRED')), CONSTRAINT "pk_github_connection" PRIMARY KEY ("connection_id"))`);
        await queryRunner.query(`CREATE TABLE "analysis_request" ("request_id" uuid NOT NULL, "member_id" uuid NOT NULL, "repository_id" text NOT NULL, "consent_id" uuid NOT NULL, "current_attempt_id" uuid NOT NULL, "retry_of_request_id" uuid, "submitted_at" TIMESTAMP WITH TIME ZONE NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, "request_state" character varying NOT NULL DEFAULT 'ACCEPTED', "lifecycle" character varying NOT NULL DEFAULT 'ACTIVE', CONSTRAINT "uq_analysis_request_request_id_member_id" UNIQUE ("request_id", "member_id"), CONSTRAINT "uq_analysis_request_request_id_member_id_repository_id" UNIQUE ("request_id", "member_id", "repository_id"), CONSTRAINT "uq_analysis_request_current_attempt_id" UNIQUE ("current_attempt_id"), CONSTRAINT "uq_analysis_request_consent_id" UNIQUE ("consent_id"), CONSTRAINT "ck_analysis_request_retry_of_request_id_08e9fe37" CHECK ("retry_of_request_id" IS NULL OR "retry_of_request_id" <> "request_id"), CONSTRAINT "ck_analysis_request_repository_id_b4519cce" CHECK (char_length("repository_id") >= 1), CONSTRAINT "ck_analysis_request_lifecycle_cfc9f41b" CHECK ("lifecycle" IN ('ACTIVE', 'CLOSED')), CONSTRAINT "ck_analysis_request_request_state_8f5f289e" CHECK ("request_state" IN ('ACCEPTED')), CONSTRAINT "pk_analysis_request" PRIMARY KEY ("request_id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "ix_analysis_request_member_id_fcc2b465" ON "analysis_request"  ("member_id") WHERE "lifecycle" = 'ACTIVE'`);
        await queryRunner.query(`CREATE TABLE "analysis_consent" ("consent_id" uuid NOT NULL, "request_id" uuid NOT NULL, "member_id" uuid NOT NULL, "repository_id" text NOT NULL, "accepted" boolean NOT NULL, "notice_revision" text NOT NULL, "scope_revision" text NOT NULL, "consented_scope" jsonb NOT NULL, "consented_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "uq_analysis_consent_consent_id_request_id_member_id_re_bc629f73" UNIQUE ("consent_id", "request_id", "member_id", "repository_id"), CONSTRAINT "uq_analysis_consent_request_id" UNIQUE ("request_id"), CONSTRAINT "ck_analysis_consent_consented_scope_add732d6" CHECK (jsonb_typeof("consented_scope") = 'object'), CONSTRAINT "ck_analysis_consent_scope_revision_40e65c7e" CHECK (char_length("scope_revision") >= 1), CONSTRAINT "ck_analysis_consent_notice_revision_de6c4569" CHECK (char_length("notice_revision") >= 1), CONSTRAINT "ck_analysis_consent_repository_id_b4519cce" CHECK (char_length("repository_id") >= 1), CONSTRAINT "ck_analysis_consent_accepted_2cc5d38e" CHECK ("accepted" = true), CONSTRAINT "pk_analysis_consent" PRIMARY KEY ("consent_id"))`);
        await queryRunner.query(`CREATE TABLE "analysis_attempt" ("attempt_id" uuid NOT NULL, "request_id" uuid NOT NULL, "processing" character varying NOT NULL DEFAULT 'QUEUED', "application" character varying NOT NULL DEFAULT 'NOT_READY', "source_mode" character varying NOT NULL, "eligible_candidate_count" integer NOT NULL DEFAULT '0', "owner_results_ready" boolean NOT NULL DEFAULT false, "failures" jsonb NOT NULL DEFAULT '[]'::jsonb, "failure_confirmation_reference" text, CONSTRAINT "uq_analysis_attempt_attempt_id_request_id" UNIQUE ("attempt_id", "request_id"), CONSTRAINT "ck_analysis_attempt_failures_8f02108b" CHECK (jsonb_typeof("failures") = 'array'), CONSTRAINT "ck_analysis_attempt_eligible_candidate_count_f3f78304" CHECK ("eligible_candidate_count" >= 0), CONSTRAINT "ck_analysis_attempt_source_mode_e14a5ade" CHECK ("source_mode" IN ('MOCK', 'LIVE')), CONSTRAINT "ck_analysis_attempt_application_d3ef13de" CHECK ("application" IN ('NOT_READY', 'PENDING', 'APPLYING', 'RECOVERING', 'APPLIED', 'APPLY_FAILED')), CONSTRAINT "ck_analysis_attempt_processing_de9f9c68" CHECK ("processing" IN ('QUEUED', 'RUNNING', 'UNCERTAIN', 'SUCCEEDED', 'EMPTY', 'PARTIAL_FAILED', 'FAILED')), CONSTRAINT "pk_analysis_attempt" PRIMARY KEY ("attempt_id"))`);
        await queryRunner.query(`CREATE TABLE "idempotency_record" ("idempotency_id" uuid NOT NULL, "member_id" uuid NOT NULL, "operation" character varying NOT NULL, "key" text NOT NULL, "request_fingerprint" text NOT NULL, "request_id" uuid, "link_id" uuid, "response_reference" text NOT NULL, CONSTRAINT "uq_idempotency_record_member_id_operation_key" UNIQUE ("member_id", "operation", "key"), CONSTRAINT "ck_idempotency_record_operation_e3ee22b1" CHECK (("operation" = 'createAnalysisRequest' AND "request_id" IS NOT NULL AND "link_id" IS NULL)
  OR ("operation" = 'createShareLink' AND "link_id" IS NOT NULL AND "request_id" IS NULL)), CONSTRAINT "ck_idempotency_record_response_reference_9b890ccb" CHECK (char_length("response_reference") >= 1), CONSTRAINT "ck_idempotency_record_request_fingerprint_1bdb7068" CHECK ("request_fingerprint" ~ '^[0-9a-f]{64}$'), CONSTRAINT "ck_idempotency_record_key_8fb286e9" CHECK (char_length("key") BETWEEN 1 AND 128), CONSTRAINT "ck_idempotency_record_operation_7ce0bd77" CHECK ("operation" IN ('createAnalysisRequest', 'createShareLink')), CONSTRAINT "pk_idempotency_record" PRIMARY KEY ("idempotency_id"))`);
        await queryRunner.query(`ALTER TABLE "member_profile" ADD CONSTRAINT "fk_member_profile_member_id" FOREIGN KEY ("member_id") REFERENCES "member_account"("member_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "github_connection" ADD CONSTRAINT "fk_github_connection_member_id" FOREIGN KEY ("member_id") REFERENCES "member_account"("member_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "analysis_request" ADD CONSTRAINT "fk_analysis_request_retry_of_request_id_member_id_repository_id" FOREIGN KEY ("retry_of_request_id", "member_id", "repository_id") REFERENCES "analysis_request"("request_id","member_id","repository_id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED`);
        await queryRunner.query(`ALTER TABLE "analysis_request" ADD CONSTRAINT "fk_analysis_request_current_attempt_id_request_id" FOREIGN KEY ("current_attempt_id", "request_id") REFERENCES "analysis_attempt"("attempt_id","request_id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED`);
        await queryRunner.query(`ALTER TABLE "analysis_request" ADD CONSTRAINT "fk_analysis_request_consent_id_request_id_member_id_re_803b38b8" FOREIGN KEY ("consent_id", "request_id", "member_id", "repository_id") REFERENCES "analysis_consent"("consent_id","request_id","member_id","repository_id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED`);
        await queryRunner.query(`ALTER TABLE "analysis_request" ADD CONSTRAINT "fk_analysis_request_member_id" FOREIGN KEY ("member_id") REFERENCES "member_account"("member_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "analysis_consent" ADD CONSTRAINT "fk_analysis_consent_member_id" FOREIGN KEY ("member_id") REFERENCES "member_account"("member_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "analysis_consent" ADD CONSTRAINT "fk_analysis_consent_request_id_member_id_repository_id" FOREIGN KEY ("request_id", "member_id", "repository_id") REFERENCES "analysis_request"("request_id","member_id","repository_id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED`);
        await queryRunner.query(`ALTER TABLE "analysis_attempt" ADD CONSTRAINT "fk_analysis_attempt_request_id" FOREIGN KEY ("request_id") REFERENCES "analysis_request"("request_id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED`);
        await queryRunner.query(`ALTER TABLE "idempotency_record" ADD CONSTRAINT "fk_idempotency_record_request_id_member_id" FOREIGN KEY ("request_id", "member_id") REFERENCES "analysis_request"("request_id","member_id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED`);
        await queryRunner.query(`ALTER TABLE "idempotency_record" ADD CONSTRAINT "fk_idempotency_record_member_id" FOREIGN KEY ("member_id") REFERENCES "member_account"("member_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);

        // 접수한 동의 재사용/변경과 재요청의 순환 참조를 막는다.
        await queryRunner.query(`CREATE FUNCTION prevent_consent_rewrite() RETURNS trigger LANGUAGE plpgsql AS $body$
          BEGIN
            IF NEW IS DISTINCT FROM OLD THEN
              RAISE EXCEPTION 'Analysis consent is immutable' USING ERRCODE = '23514';
            END IF;
            RETURN NEW;
          END $body$`);
        await queryRunner.query(`CREATE TRIGGER tr_analysis_consent_immutable BEFORE UPDATE ON analysis_consent
          FOR EACH ROW EXECUTE FUNCTION prevent_consent_rewrite()`);
        await queryRunner.query(`CREATE FUNCTION preserve_retry_predecessor() RETURNS trigger LANGUAGE plpgsql AS $body$
          BEGIN
            IF TG_OP = 'UPDATE' THEN
              IF NEW.request_id IS DISTINCT FROM OLD.request_id OR NEW.retry_of_request_id IS DISTINCT FROM OLD.retry_of_request_id THEN
                RAISE EXCEPTION 'Retry predecessor is immutable' USING ERRCODE = '23514';
              END IF;
            ELSIF NEW.retry_of_request_id IS NOT NULL THEN
              -- 이미 존재하는 선행 요청만 참조하며 역방향 수정을 금지한다.
              PERFORM 1 FROM analysis_request WHERE request_id = NEW.retry_of_request_id FOR KEY SHARE;
              IF NOT FOUND THEN
                RAISE EXCEPTION 'Retry predecessor must already exist' USING ERRCODE = '23503';
              END IF;
            END IF;
            RETURN NEW;
          END $body$`);
        await queryRunner.query(`CREATE TRIGGER tr_analysis_request_retry BEFORE INSERT OR UPDATE ON analysis_request
          FOR EACH ROW EXECUTE FUNCTION preserve_retry_predecessor()`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TRIGGER tr_analysis_request_retry ON analysis_request`);
        await queryRunner.query(`DROP FUNCTION preserve_retry_predecessor()`);
        await queryRunner.query(`DROP TRIGGER tr_analysis_consent_immutable ON analysis_consent`);
        await queryRunner.query(`DROP FUNCTION prevent_consent_rewrite()`);
        await queryRunner.query(`ALTER TABLE "idempotency_record" DROP CONSTRAINT "fk_idempotency_record_member_id"`);
        await queryRunner.query(`ALTER TABLE "idempotency_record" DROP CONSTRAINT "fk_idempotency_record_request_id_member_id"`);
        await queryRunner.query(`ALTER TABLE "analysis_attempt" DROP CONSTRAINT "fk_analysis_attempt_request_id"`);
        await queryRunner.query(`ALTER TABLE "analysis_consent" DROP CONSTRAINT "fk_analysis_consent_request_id_member_id_repository_id"`);
        await queryRunner.query(`ALTER TABLE "analysis_consent" DROP CONSTRAINT "fk_analysis_consent_member_id"`);
        await queryRunner.query(`ALTER TABLE "analysis_request" DROP CONSTRAINT "fk_analysis_request_member_id"`);
        await queryRunner.query(`ALTER TABLE "analysis_request" DROP CONSTRAINT "fk_analysis_request_consent_id_request_id_member_id_re_803b38b8"`);
        await queryRunner.query(`ALTER TABLE "analysis_request" DROP CONSTRAINT "fk_analysis_request_current_attempt_id_request_id"`);
        await queryRunner.query(`ALTER TABLE "analysis_request" DROP CONSTRAINT "fk_analysis_request_retry_of_request_id_member_id_repository_id"`);
        await queryRunner.query(`ALTER TABLE "github_connection" DROP CONSTRAINT "fk_github_connection_member_id"`);
        await queryRunner.query(`ALTER TABLE "member_profile" DROP CONSTRAINT "fk_member_profile_member_id"`);
        await queryRunner.query(`DROP TABLE "idempotency_record"`);
        await queryRunner.query(`DROP TABLE "analysis_attempt"`);
        await queryRunner.query(`DROP TABLE "analysis_consent"`);
        await queryRunner.query(`DROP INDEX "ix_analysis_request_member_id_fcc2b465"`);
        await queryRunner.query(`DROP TABLE "analysis_request"`);
        await queryRunner.query(`DROP TABLE "github_connection"`);
        await queryRunner.query(`DROP TABLE "member_profile"`);
        await queryRunner.query(`DROP TABLE "member_account"`);
    }

}

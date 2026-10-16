import type { MigrationInterface, QueryRunner } from 'typeorm';

/** #104 → E 수신 기록 → #143 B 테이블. down은 E 테이블만 제거한다. */
export class CreateResultApplicationRecord1790550000000 implements MigrationInterface {
  name = 'CreateResultApplicationRecord1790550000000';
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE "result_application_record" (
      "application_record_id" uuid NOT NULL,
      "request_id" uuid NOT NULL, "attempt_id" uuid NOT NULL,
      "result_id" text NOT NULL, "payload_fingerprint" text NOT NULL,
      "received_at" timestamptz NOT NULL,
      CONSTRAINT "pk_result_application_record" PRIMARY KEY ("application_record_id"),
      CONSTRAINT "uq_result_application_record_attempt_id" UNIQUE ("attempt_id"),
      CONSTRAINT "uq_result_application_record_request_id_attempt_id_result_id" UNIQUE ("request_id", "attempt_id", "result_id"),
      CONSTRAINT "fk_result_application_record_attempt_id_request_id" FOREIGN KEY ("attempt_id", "request_id")
        REFERENCES "analysis_attempt" ("attempt_id", "request_id"),
      CONSTRAINT "ck_result_application_record_result_id_346fc0bf" CHECK (char_length("result_id") >= 1),
      CONSTRAINT "ck_result_application_record_payload_fingerprint_16142ba9" CHECK ("payload_fingerprint" ~ '^[0-9a-f]{64}$')
    )`);
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE "result_application_record"');
  }
}

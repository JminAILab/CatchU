import { MigrationInterface, QueryRunner } from "typeorm";

// 발행 프리셋 U1(계약 P-3·P-6, 규칙 BR5.1, NFR2.14). 순서: 프리셋 표 둘 → 변경 전 발행본 행 모두 지우기 → published_item 칸 둘.
// 발행본 행을 먼저 지우므로(항목·쪽·조각·색인·요약·JD 요약 실행은 외래 키 연쇄로 지워짐) 필수 칸을 기본값 없이 더한다.
// down은 칸 둘과 프리셋 표를 지우고, 지운 발행본은 되살리지 않는다. 사본 PDF 파일(members/*/publications/)은 배포 전에 사람이 지운다(BR5.2).
export class AddPublicationPresets1795140270696 implements MigrationInterface {
    name = 'AddPublicationPresets1795140270696'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "preset" ("preset_id" uuid NOT NULL, "member_id" uuid NOT NULL, "name" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "ck_preset_name_978ea9dc" CHECK (char_length("name") >= 1), CONSTRAINT "pk_preset" PRIMARY KEY ("preset_id"))`);
        await queryRunner.query(`CREATE INDEX "ix_preset_member_id_created_at_preset_id" ON "preset"  ("member_id", "created_at", "preset_id") `);
        await queryRunner.query(`CREATE TABLE "preset_item" ("preset_item_id" uuid NOT NULL, "preset_id" uuid NOT NULL, "position" integer NOT NULL, "catch_id" uuid, "text_material_id" uuid, "pdf_material_id" uuid, CONSTRAINT "uq_preset_item_preset_id_position" UNIQUE ("preset_id", "position"), CONSTRAINT "ck_preset_item_position_fa56e936" CHECK ("position" BETWEEN 1 AND 20), CONSTRAINT "ck_preset_item_catch_id_7c3fffcb" CHECK (num_nonnulls("catch_id", "text_material_id", "pdf_material_id") = 1), CONSTRAINT "pk_preset_item" PRIMARY KEY ("preset_item_id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "ix_preset_item_preset_id_pdf_material_id_2f81dad3" ON "preset_item"  ("preset_id", "pdf_material_id") WHERE "pdf_material_id" IS NOT NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "ix_preset_item_preset_id_text_material_id_bcd46518" ON "preset_item"  ("preset_id", "text_material_id") WHERE "text_material_id" IS NOT NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "ix_preset_item_preset_id_catch_id_42a2c949" ON "preset_item"  ("preset_id", "catch_id") WHERE "catch_id" IS NOT NULL`);
        await queryRunner.query(`ALTER TABLE "preset" ADD CONSTRAINT "fk_preset_member_id" FOREIGN KEY ("member_id") REFERENCES "member_account"("member_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "preset_item" ADD CONSTRAINT "fk_preset_item_pdf_material_id" FOREIGN KEY ("pdf_material_id") REFERENCES "pdf_material"("pdf_material_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "preset_item" ADD CONSTRAINT "fk_preset_item_text_material_id" FOREIGN KEY ("text_material_id") REFERENCES "text_material"("text_material_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "preset_item" ADD CONSTRAINT "fk_preset_item_catch_id" FOREIGN KEY ("catch_id") REFERENCES "catch_asset"("catch_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "preset_item" ADD CONSTRAINT "fk_preset_item_preset_id" FOREIGN KEY ("preset_id") REFERENCES "preset"("preset_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        // 변경 전 발행본을 버린다(FR5.1, AC3.1.4). 옛 링크는 지금의 접근 불가 응답이 된다.
        await queryRunner.query(`DELETE FROM "publication"`);
        await queryRunner.query(`ALTER TABLE "published_item" ADD "preset_ordinal" integer NOT NULL`);
        await queryRunner.query(`ALTER TABLE "published_item" ADD "preset_name" text NOT NULL`);
        await queryRunner.query(`ALTER TABLE "published_item" ADD CONSTRAINT "ck_published_item_preset_ordinal_381d65e3" CHECK ("preset_ordinal" BETWEEN 1 AND 5)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "published_item" DROP CONSTRAINT "ck_published_item_preset_ordinal_381d65e3"`);
        await queryRunner.query(`ALTER TABLE "published_item" DROP COLUMN "preset_name"`);
        await queryRunner.query(`ALTER TABLE "published_item" DROP COLUMN "preset_ordinal"`);
        await queryRunner.query(`ALTER TABLE "preset_item" DROP CONSTRAINT "fk_preset_item_preset_id"`);
        await queryRunner.query(`ALTER TABLE "preset_item" DROP CONSTRAINT "fk_preset_item_catch_id"`);
        await queryRunner.query(`ALTER TABLE "preset_item" DROP CONSTRAINT "fk_preset_item_text_material_id"`);
        await queryRunner.query(`ALTER TABLE "preset_item" DROP CONSTRAINT "fk_preset_item_pdf_material_id"`);
        await queryRunner.query(`ALTER TABLE "preset" DROP CONSTRAINT "fk_preset_member_id"`);
        // 색인 이름에 스키마를 붙이지 않는다. 격리 스키마 시험의 down이 public의 같은 이름 색인을 지우지 않게 한다(다른 마이그레이션과 같은 꼴).
        await queryRunner.query(`DROP INDEX "ix_preset_item_preset_id_catch_id_42a2c949"`);
        await queryRunner.query(`DROP INDEX "ix_preset_item_preset_id_text_material_id_bcd46518"`);
        await queryRunner.query(`DROP INDEX "ix_preset_item_preset_id_pdf_material_id_2f81dad3"`);
        await queryRunner.query(`DROP TABLE "preset_item"`);
        await queryRunner.query(`DROP INDEX "ix_preset_member_id_created_at_preset_id"`);
        await queryRunner.query(`DROP TABLE "preset"`);
    }

}

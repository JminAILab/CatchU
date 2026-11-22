import { randomUUID } from 'node:crypto';
import { Check, Column, Entity, ForeignKey, Index, PrimaryColumn, Unique } from 'typeorm';
import { CatchAssetEntity } from '../catches/entities/catch-asset.entity';
import { deleteWithParent } from '../database/foreign-keys';
import { PdfMaterial } from '../materials/pdf-material.entity';
import { TextMaterial } from '../materials/text-material.entity';
import { Preset } from './preset.entity';

/** 프리셋 하나에 담을 수 있는 자료 수(BR1.4). position의 DB 상한과 API 검사가 같은 값을 쓴다. */
export const PRESET_ITEMS_MAX = 20;

/**
 * 프리셋에 담긴 자료 하나와 그 자리(발행 프리셋 U1 entities.md PresetItem, 계약 P-6, ADR-004).
 *
 * - 원본은 종류별 칸 셋 가운데 정확히 하나로 가리키고, 원본(Catch·텍스트 자료·PDF)이나 프리셋을 지우면 함께 지워진다.
 *   자료 모듈 코드는 바꾸지 않는다(BR6.1).
 * - position은 저장할 때 1부터 빈틈없이 매기고, 원본 삭제의 연쇄로 빈자리가 생길 수 있다. 읽을 때 position 순으로 본다(기능 설계 검토 R-02).
 * - 가리키는 자료가 프리셋 주인과 같은 회원의 것인지는 외래 키가 아니라 저장 때의 소유 확인으로 지킨다(BR1.5, NFR2.5).
 */
@Entity('preset_item')
@ForeignKey(() => Preset, ['presetId'], ['presetId'], deleteWithParent)
@ForeignKey(() => CatchAssetEntity, ['catchId'], ['catchId'], deleteWithParent)
@ForeignKey(() => TextMaterial, ['textMaterialId'], ['textMaterialId'], deleteWithParent)
@ForeignKey(() => PdfMaterial, ['pdfMaterialId'], ['pdfMaterialId'], deleteWithParent)
@Unique(['presetId', 'position'])
@Index(['presetId', 'catchId'], { unique: true, where: '"catch_id" IS NOT NULL' })
@Index(['presetId', 'textMaterialId'], { unique: true, where: '"text_material_id" IS NOT NULL' })
@Index(['presetId', 'pdfMaterialId'], { unique: true, where: '"pdf_material_id" IS NOT NULL' })
@Check('num_nonnulls("catch_id", "text_material_id", "pdf_material_id") = 1')
@Check(`"position" BETWEEN 1 AND ${PRESET_ITEMS_MAX}`)
export class PresetItem {
  @PrimaryColumn({ type: 'uuid' })
  presetItemId: string = randomUUID();

  @Column({ type: 'uuid' })
  presetId!: string;

  @Column({ type: 'integer' })
  position!: number;

  @Column({ type: 'uuid', nullable: true })
  catchId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  textMaterialId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  pdfMaterialId!: string | null;
}

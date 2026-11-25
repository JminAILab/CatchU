// 프리셋 저장·목록·상세·세기와 발행용 펴기(발행 프리셋 U1 기능 명세 W1·W2·W3, 규칙 BR1.1~BR1.9·BR2.1~BR2.4·BR3.2,
// NFR 설계 security-design NFR2.2·NFR2.3, reliability-design NFR2.7·NFR2.9·NFR2.10, performance-design NFR6.1~NFR6.3, 검토 R-01·R-02).
// - 목록·상세·세기: 읽기 전용 REPEATABLE READ 한 트랜잭션에서 프리셋 행 → 항목 행 → 종류별 원본 묶음 읽기(source-reader) → 순수 판정(eligibility).
//   조회 수는 프리셋·항목 수와 무관하다. 같은 스냅샷에서 항목이 가리키는 원본 행이 없으면 데이터 문제라 500이다(NFR 설계 검토 R-01).
//   기록 문제 Catch(PublishIntegrityError)도 잡지 않아 요청 전체가 500이다(NFR2.10).
// - 만들기·고치기·지우기: READ COMMITTED 한 트랜잭션. 하나라도 걸리면 아무것도 쓰지 않는다. 프리셋 행은 잠그지 않는다(R-08, NFR2.9).
// - 모든 SQL에 회원 조건을 붙이고, 남의 것·없는 것은 구분하지 않고 404다(BR1.1·BR1.5).
// 이름과 자료 내용은 로그·오류에 넣지 않는다(BR7.1).
import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { ApiError } from '../common/errors';
import { SNAPSHOT_TEXT_TOTAL_MAX } from '../publications/publications-config';
import {
  UnpublishableReason, catchUnpublishableReason, pdfUnpublishableReason,
} from '../publishable-source/eligibility';
import { catchTextLength, catchTitle } from '../publishable-source/source-content';
import { ReadSources, SourceKind, SourceRef, hasSource, readSources } from '../publishable-source/source-reader';
import { PRESET_LIMITS, isUuid, presetIdInput, presetMeasureInput, presetSaveInput } from './preset-input';

/** 자료 하나를 센 값(세기 경로와 프리셋 상세가 함께 쓴다, entities.md ItemMeasure). */
export interface ItemMeasure {
  kind: SourceKind;
  sourceId: string;
  title: string;
  /** 발행과 같은 셈(BR2.1). 추출이 끝나지 않은 PDF는 0 */
  textLength: number;
  unpublishableReason: UnpublishableReason | null;
}

/** 프리셋 목록의 한 줄(entities.md PresetSummary). 저장하지 않고 읽을 때 센다(ADR-005). */
export interface PresetSummary {
  presetId: string;
  name: string;
  itemCount: number;
  textLength: number;
  overLimit: boolean;
  unpublishableCount: number;
  unpublishableItems: { kind: SourceKind; sourceId: string; title: string; reason: UnpublishableReason }[];
}

/** 프리셋 하나(편집 화면). 항목은 position 순이다. */
export interface PresetDetail {
  presetId: string;
  name: string;
  items: ItemMeasure[];
}

/** 발행에 쓰는 편 프리셋 하나(BR3.2). ordinal은 고른 순서(1부터), items는 프리셋 안 position 순이다. */
export interface ExpandedPreset {
  presetId: string;
  ordinal: number;
  name: string;
  items: SourceRef[];
}

/** 같은 스냅샷에서 프리셋 항목이 가리키는 원본 행을 읽지 못했다. 외래 키 연쇄 삭제로 생기지 않는 데이터 문제라 500이다. */
export class PresetReadIntegrityError extends Error {
  override readonly name = 'PresetReadIntegrityError';

  constructor() {
    super('프리셋 항목의 원본 자료를 읽지 못했습니다.');
  }
}

interface PresetRow {
  presetId: string;
  name: string;
}

interface PresetItemRow {
  presetId: string;
  position: number;
  catchId: string | null;
  textMaterialId: string | null;
  pdfMaterialId: string | null;
}

const ITEM_SELECT = `SELECT preset_id AS "presetId", position, catch_id AS "catchId", text_material_id AS "textMaterialId",
    pdf_material_id AS "pdfMaterialId"
  FROM preset_item WHERE preset_id = ANY($1::uuid[]) ORDER BY preset_id ASC, position ASC`;

/** 항목 행의 원본(채운 칸 하나, CHECK가 정확히 하나를 보장한다). */
function refOf(row: PresetItemRow): SourceRef {
  if (row.catchId !== null) return { kind: 'CATCH', sourceId: row.catchId };
  if (row.textMaterialId !== null) return { kind: 'TEXT_MATERIAL', sourceId: row.textMaterialId };
  return { kind: 'PDF_MATERIAL', sourceId: row.pdfMaterialId as string };
}

/** 프리셋 ID별 원본 목록(position 순). */
async function readItemRefs(manager: EntityManager, presetIds: readonly string[]): Promise<Map<string, SourceRef[]>> {
  const refs = new Map<string, SourceRef[]>(presetIds.map((id) => [id, []]));
  if (presetIds.length === 0) return refs;
  const rows: PresetItemRow[] = await manager.query(ITEM_SELECT, [presetIds]);
  for (const row of rows) refs.get(row.presetId)?.push(refOf(row));
  return refs;
}

/** 자료 하나의 글자 수(BR2.1). 원본을 읽었다고 가정한다. */
function textLengthOf(sources: ReadSources, ref: SourceRef): number {
  if (ref.kind === 'CATCH') return catchTextLength(sources.catches.get(ref.sourceId)!, sources.evidence.get(ref.sourceId) ?? []);
  if (ref.kind === 'TEXT_MATERIAL') return sources.textMaterials.get(ref.sourceId)!.textLength;
  const pdf = sources.pdfs.get(ref.sourceId)!;
  return pdf.extractionState === 'DONE' ? pdf.textLength : 0;
}

/** 자료 하나의 ItemMeasure(BR2.1·BR2.2). 읽지 못한 원본은 PresetReadIntegrityError, 기록 문제 Catch는 PublishIntegrityError를 던진다. */
function measureOf(owner: string, sources: ReadSources, ref: SourceRef): ItemMeasure {
  if (!hasSource(sources, ref)) throw new PresetReadIntegrityError();
  const base = { kind: ref.kind, sourceId: ref.sourceId, textLength: textLengthOf(sources, ref) };
  if (ref.kind === 'CATCH') {
    const row = sources.catches.get(ref.sourceId)!;
    return { ...base, title: catchTitle(row), unpublishableReason: catchUnpublishableReason(owner, row, sources.protections) };
  }
  if (ref.kind === 'TEXT_MATERIAL') return { ...base, title: sources.textMaterials.get(ref.sourceId)!.title, unpublishableReason: null };
  const pdf = sources.pdfs.get(ref.sourceId)!;
  return { ...base, title: pdf.title, unpublishableReason: pdfUnpublishableReason(pdf.extractionState) };
}

function summaryOf(row: PresetRow, measures: ItemMeasure[]): PresetSummary {
  const textLength = measures.reduce((sum, item) => sum + item.textLength, 0);
  const unpublishableItems = measures.flatMap((item) => item.unpublishableReason === null ? []
    : [{ kind: item.kind, sourceId: item.sourceId, title: item.title, reason: item.unpublishableReason }]);
  return {
    presetId: row.presetId,
    name: row.name,
    itemCount: measures.length,
    textLength,
    overLimit: textLength > SNAPSHOT_TEXT_TOTAL_MAX,
    unpublishableCount: unpublishableItems.length,
    unpublishableItems,
  };
}

function ownerOf(memberId: string): string {
  const owner = memberId.toLowerCase();
  if (!isUuid(owner)) throw new ApiError('AUTH_INVALID');
  return owner;
}

@Injectable()
export class PresetStore {
  constructor(private readonly dataSource: DataSource) {}

  /** 목록(BR1.9·BR2.3): 그 회원의 프리셋 모두를 만든 시각, 같으면 presetId 순으로 한 번에 준다(NFR6.1). */
  async list(memberId: string): Promise<{ presets: PresetSummary[] }> {
    const owner = ownerOf(memberId);
    return this.readOnly(owner, async (manager) => {
      const rows: PresetRow[] = await manager.query(`SELECT preset_id AS "presetId", name FROM preset
        WHERE member_id = $1 ORDER BY created_at ASC, preset_id ASC`, [owner]);
      const refs = await readItemRefs(manager, rows.map((row) => row.presetId));
      const sources = await readSources(manager, owner, [...refs.values()].flat());
      return { presets: rows.map((row) => summaryOf(row, refs.get(row.presetId)!.map((ref) => measureOf(owner, sources, ref)))) };
    });
  }

  /** 상세(BR1.1·BR2.1·BR2.2): 항목마다 ItemMeasure를 position 순으로 싣는다. */
  async get(memberId: string, idValue: unknown): Promise<PresetDetail> {
    const owner = ownerOf(memberId);
    const presetId = presetIdInput(idValue);
    return this.readOnly(owner, async (manager) => {
      const row = presetId === null ? undefined : (await manager.query(`SELECT preset_id AS "presetId", name FROM preset
        WHERE member_id = $1 AND preset_id = $2`, [owner, presetId]) as PresetRow[])[0];
      if (!row) throw new NotFoundException();
      const refs = (await readItemRefs(manager, [row.presetId])).get(row.presetId)!;
      const sources = await readSources(manager, owner, refs);
      return { presetId: row.presetId, name: row.name, items: refs.map((ref) => measureOf(owner, sources, ref)) };
    });
  }

  /** 세기(BR2.4): 고른 자료 1~50개의 ItemMeasure를 요청 순서로. 남의 것·없는 것이 하나라도 있으면 404다. */
  async measure(memberId: string, body: unknown): Promise<{ items: ItemMeasure[] }> {
    const owner = ownerOf(memberId);
    const refs = presetMeasureInput(body);
    return this.readOnly(owner, async (manager) => {
      const sources = await readSources(manager, owner, refs);
      if (refs.some((ref) => !hasSource(sources, ref))) throw new NotFoundException();
      return { items: refs.map((ref) => measureOf(owner, sources, ref)) };
    });
  }

  /** 만들기(W1, BR1.2~BR1.6). 50개째까지 만들 수 있다. 동시에 만들어 51개가 되는 경우는 막지 않는다(BR1.3). */
  async create(memberId: string, body: unknown): Promise<{ presetId: string }> {
    const owner = ownerOf(memberId);
    const input = presetSaveInput(body);
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      await assertMemberExists(manager, owner, true);
      const [{ count }]: { count: string }[] = await manager.query('SELECT count(*) AS count FROM preset WHERE member_id = $1', [owner]);
      if (Number(count) >= PRESET_LIMITS.presetsPerMember) throw new ApiError('PRESET_LIMIT_REACHED');
      await assertSavable(manager, owner, input.items);
      // ID는 앱이 만든다(CONVENTIONS 「DB 물리 규약」). 시각은 트랜잭션 시각 하나로 createdAt·updatedAt을 같게 쓴다.
      const presetId = randomUUID();
      await manager.query(`INSERT INTO preset (preset_id, member_id, name, created_at, updated_at)
        VALUES ($1, $2, $3, now(), now())`, [presetId, owner, input.name]);
      await insertItems(manager, presetId, input.items);
      return { presetId };
    });
  }

  /** 고치기(BR1.7): 이름·updatedAt을 바꾸고 항목을 모두 지운 뒤 배열 순서로 다시 쓴다. 검사에 걸리면 아무것도 바뀌지 않는다. */
  async update(memberId: string, idValue: unknown, body: unknown): Promise<{ presetId: string }> {
    const owner = ownerOf(memberId);
    const input = presetSaveInput(body);
    const presetId = presetIdInput(idValue);
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      await assertMemberExists(manager, owner, true);
      if (presetId === null) throw new NotFoundException();
      const owned: unknown[] = await manager.query('SELECT 1 FROM preset WHERE member_id = $1 AND preset_id = $2', [owner, presetId]);
      if (owned.length === 0) throw new NotFoundException();
      await assertSavable(manager, owner, input.items);
      await manager.query('UPDATE preset SET name = $3, updated_at = now() WHERE member_id = $1 AND preset_id = $2', [owner, presetId, input.name]);
      await manager.query('DELETE FROM preset_item WHERE preset_id = $1', [presetId]);
      await insertItems(manager, presetId, input.items);
      return { presetId };
    });
  }

  /** 지우기(BR1.8): 항목은 연쇄로 지워지고 이미 만든 발행본은 그대로다. */
  async remove(memberId: string, idValue: unknown): Promise<string> {
    const owner = ownerOf(memberId);
    const presetId = presetIdInput(idValue);
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      await assertMemberExists(manager, owner, true);
      if (presetId === null) throw new NotFoundException();
      const deleted = affectedRows(await manager.query('DELETE FROM preset WHERE member_id = $1 AND preset_id = $2', [owner, presetId]));
      if (deleted === 0) throw new NotFoundException();
      return presetId;
    });
  }

  /**
   * 발행의 프리셋 펴기(BR3.2, 발행 트랜잭션 밖에서 한 번). 고른 순서대로 프리셋과 그 항목을 읽는다. 하나라도 남의 것·없는 것이면 404이고
   * 이때는 PDF 복사·발행 트랜잭션 전이라 아무것도 쓰이지 않는다(NFR2.4). 읽은 뒤 프리셋이 바뀌어도 읽은 내용으로 발행한다(Q3).
   */
  async expand(memberId: string, presetIds: readonly string[]): Promise<ExpandedPreset[]> {
    const owner = ownerOf(memberId);
    return this.readOnly(owner, async (manager) => {
      const rows: PresetRow[] = await manager.query(`SELECT preset_id AS "presetId", name FROM preset
        WHERE member_id = $1 AND preset_id = ANY($2::uuid[])`, [owner, presetIds]);
      const byId = new Map(rows.map((row) => [row.presetId, row]));
      if (presetIds.some((id) => !byId.has(id))) throw new NotFoundException();
      const refs = await readItemRefs(manager, presetIds);
      return presetIds.map((id, index) => ({ presetId: id, ordinal: index + 1, name: byId.get(id)!.name, items: refs.get(id)! }));
    }, false);
  }

  /** 읽기 전용 REPEATABLE READ 한 트랜잭션(본인 Catch 목록·받은 링크 열람과 같음). 회원 행이 없으면 401 AUTH_INVALID다. */
  private readOnly<T>(owner: string, run: (manager: EntityManager) => Promise<T>, checkMember = true): Promise<T> {
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      await manager.query('SET TRANSACTION READ ONLY');
      if (checkMember) await assertMemberExists(manager, owner, false);
      return run(manager);
    });
  }
}

/** PostgreSQL 드라이버의 UPDATE·DELETE 결과는 [행, 바뀐 행 수]다(base-summary-store.ts와 같은 읽기). */
function affectedRows(result: unknown): number {
  return Array.isArray(result) && typeof result[1] === 'number' ? result[1] : 0;
}

/** 회원 행 확인. 쓰는 트랜잭션은 끝날 때까지 회원 삭제를 막으려고 FOR KEY SHARE로 잠근다(읽기 전용 트랜잭션은 잠그지 않는다). */
async function assertMemberExists(manager: EntityManager, owner: string, lock: boolean): Promise<void> {
  const member: unknown[] = await manager.query(
    `SELECT 1 FROM member_account WHERE member_id = $1${lock ? ' FOR KEY SHARE' : ''}`, [owner]);
  if (member.length === 0) throw new ApiError('AUTH_INVALID');
}

/** 담을 자료가 모두 그 회원의 것이고 있으며(BR1.5, 404), 글자 합이 60,000자 이하인지(BR1.4) 본다. 자격은 보지 않는다(Q2). */
async function assertSavable(manager: EntityManager, owner: string, items: readonly SourceRef[]): Promise<void> {
  if (items.length === 0) return;
  const sources = await readSources(manager, owner, items);
  if (items.some((ref) => !hasSource(sources, ref))) throw new NotFoundException();
  const total = items.reduce((sum, ref) => sum + textLengthOf(sources, ref), 0);
  if (total > SNAPSHOT_TEXT_TOTAL_MAX) {
    throw new ApiError('VALIDATION_FAILED', { details: { violations: [{ field: 'items', reason: 'maxTotalLength' }] } });
  }
}

/** 항목을 배열 순서로 position 1부터 한 문장에 쓴다(BR1.6, R-02). */
async function insertItems(manager: EntityManager, presetId: string, items: readonly SourceRef[]): Promise<void> {
  if (items.length === 0) return;
  const values: unknown[] = [presetId];
  const rows = items.map((ref, index) => {
    values.push(randomUUID(), index + 1, ref.kind === 'CATCH' ? ref.sourceId : null, ref.kind === 'TEXT_MATERIAL' ? ref.sourceId : null,
      ref.kind === 'PDF_MATERIAL' ? ref.sourceId : null);
    const at = values.length;
    return `($${at - 4}::uuid, $1, $${at - 3}, $${at - 2}::uuid, $${at - 1}::uuid, $${at}::uuid)`;
  });
  await manager.query(`INSERT INTO preset_item (preset_item_id, preset_id, position, catch_id, text_material_id, pdf_material_id)
    VALUES ${rows.join(', ')}`, values);
}

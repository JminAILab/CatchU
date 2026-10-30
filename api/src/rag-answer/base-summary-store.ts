// base_summary 읽기·쓰기(기능 설계 BR5.3·BR5.4·BR6.2·BR7.2, reliability-design NFR5.1~NFR5.3, 계약 C-02 readStatus·late-result).
// 결과 쓰기는 조건부 UPDATE 한 문장이라 부모(발행본)가 지워졌거나 마감이 지났거나 FAILED면 바뀐 행이 0이고, 호출자는 그 결과를 버린다.
// SQL은 매개변수로만 넘긴다. 넘겨받은 manager로만 쓰므로 호출자의 트랜잭션 안에서 돈다(CONVENTIONS 「트랜잭션 규약」).
import { randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import type { GatedItem } from '../ai-generation/ai-generation.types';
import { readStatus, type RunStatus } from '../ai-run/ai-run-spec';
import { persistDeadlineFailure } from '../ai-run/run-status-store';
import { BASE_SUMMARY_DEADLINE_MS } from './rag-answer-config';

export interface SummaryRow {
  status: RunStatus;
  deadlineAt: Date;
  items: GatedItem[];
}

/** 읽는 쪽에 주는 판정(BR6.2·BR6.3). DONE일 때만 항목이 있다. */
export interface SummaryView {
  status: RunStatus;
  items: GatedItem[];
}

interface RawRow {
  status: RunStatus;
  deadline_at: Date;
  items: GatedItem[];
}

/** UPDATE 결과의 바뀐 행 수. TypeORM(PostgreSQL)은 [행, 바뀐 행 수]로 돌려준다. */
function affectedRows(result: unknown): number {
  return Array.isArray(result) && typeof result[1] === 'number' ? result[1] : 0;
}

/** 발행 시각(또는 접수 시각)부터의 처리 마감. */
export function summaryDeadline(from: Date): Date {
  return new Date(from.getTime() + BASE_SUMMARY_DEADLINE_MS);
}

export async function readSummaryRow(manager: EntityManager, publicationId: string): Promise<SummaryRow | null> {
  const rows: RawRow[] = await manager.query(
    'SELECT status, deadline_at, items FROM base_summary WHERE publication_id = $1', [publicationId]);
  if (rows.length === 0) return null;
  return { status: rows[0].status, deadlineAt: rows[0].deadline_at, items: Array.isArray(rows[0].items) ? rows[0].items : [] };
}

/** 처리기가 일해도 되는 행인가(BR5.3): PENDING이고 마감 전. */
export function isWorkable(row: SummaryRow | null, now: Date): row is SummaryRow {
  return row !== null && row.status === 'PENDING' && now.getTime() < row.deadlineAt.getTime();
}

/**
 * 처리기 시작 때 행이 없으면 PENDING(deadline_at = 발행 시각 + 10분)으로 만든다(NFR5.3). 이미 생겼으면 그 행을 따른다.
 * 발행본이 지워져 외래 키가 막으면 오류(23503)가 그대로 나가므로 호출자가 판정한다.
 */
export async function createPendingIfAbsent(manager: EntityManager, publicationId: string, deadlineAt: Date, now: Date): Promise<void> {
  await manager.query(
    `INSERT INTO base_summary (base_summary_id, publication_id, status, deadline_at, items, generated_at, updated_at)
     VALUES ($1, $2, 'PENDING', $3, '[]'::jsonb, NULL, $4)
     ON CONFLICT (publication_id) DO NOTHING`,
    [randomUUID(), publicationId, deadlineAt, now]);
}

/** 성공 결과(항목 1개 이상). 행이 있고 FAILED가 아니고 마감 전일 때만 DONE으로 쓴다(BR5.4, NFR5.2). 썼으면 true. */
export async function saveDone(manager: EntityManager, publicationId: string, items: GatedItem[], now: Date): Promise<boolean> {
  const result: unknown = await manager.query(
    `UPDATE base_summary SET status = 'DONE', items = $2::jsonb, generated_at = $3, updated_at = $3
      WHERE publication_id = $1 AND status <> 'FAILED' AND deadline_at > $3`,
    [publicationId, JSON.stringify(items), now]);
  return affectedRows(result) > 0;
}

/** 항목 0개·생성 실패. PENDING이고 마감 전일 때만 FAILED로 쓴다(BR5.4·BR5.5). 썼으면 true. */
export async function saveFailed(manager: EntityManager, publicationId: string, now: Date): Promise<boolean> {
  const result: unknown = await manager.query(
    `UPDATE base_summary SET status = 'FAILED', items = '[]'::jsonb, generated_at = NULL, updated_at = $2
      WHERE publication_id = $1 AND status = 'PENDING' AND deadline_at > $2`,
    [publicationId, now]);
  return affectedRows(result) > 0;
}

/**
 * 읽을 때의 상태 판정(BR6.2·BR6.3, C-02 readStatus). 행이 없으면 발행 시각 + 10분 전이면 PENDING, 지났으면 FAILED로 보고
 * 행을 만들지 않는다. 행이 PENDING이고 마감이 지났으면 그 자리에서 조건부로 FAILED를 저장한다.
 * publishedAt은 행이 없을 때만 부른다(readSnapshot, performance-design NFR4.5).
 */
export async function readSummaryView(
  manager: EntityManager, publicationId: string, now: Date, publishedAt: () => Promise<Date>,
): Promise<SummaryView> {
  const row = await readSummaryRow(manager, publicationId);
  if (row === null) {
    const deadline = summaryDeadline(await publishedAt());
    return { status: now.getTime() < deadline.getTime() ? 'PENDING' : 'FAILED', items: [] };
  }
  const status = readStatus(row, now);
  if (row.status === 'PENDING' && status === 'FAILED') {
    await persistDeadlineFailure(manager, { table: 'base_summary', key: { publication_id: publicationId } }, now);
  }
  return { status, items: status === 'DONE' ? row.items : [] };
}

/**
 * [다시 만들기] 접수(BR7.2). 행을 만들거나 고쳐 PENDING·빈 항목·generated_at 비움·deadline_at = 접수 시각 + 10분으로 쓴다.
 * PENDING이어도 거부하지 않는다(BR7.4). 하루 횟수 소비와 같은 트랜잭션의 manager로 부른다.
 */
export async function markRegenerating(manager: EntityManager, publicationId: string, now: Date): Promise<void> {
  await manager.query(
    `INSERT INTO base_summary (base_summary_id, publication_id, status, deadline_at, items, generated_at, updated_at)
     VALUES ($1, $2, 'PENDING', $3, '[]'::jsonb, NULL, $4)
     ON CONFLICT (publication_id) DO UPDATE SET status = 'PENDING', items = '[]'::jsonb, generated_at = NULL,
       deadline_at = EXCLUDED.deadline_at, updated_at = EXCLUDED.updated_at`,
    [randomUUID(), publicationId, summaryDeadline(now), now]);
}

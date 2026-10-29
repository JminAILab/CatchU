// 처리기·상태를 읽는 자리가 함께 쓰는 DB 도우미(계약 C-02 readStatus·late-result, U2 BR5.5·BR5.7, 비기능 NFR5.4).
// 실행 상태 표(publication_index·base_summary·jd_summary_run)는 호출 Unit 소유라 표·키 칼럼 이름을 호출자가 넘긴다.
import { Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { type AiRunKind, errorName, readStatus, type RunStatusRow } from './ai-run-spec';

const IDENTIFIER = /^[a-z][a-z0-9_]{0,62}$/;

function quoteIdentifier(name: string): string {
  if (!IDENTIFIER.test(name)) throw new TypeError('표·칼럼 이름 형식이 맞지 않습니다.');
  return `"${name}"`;
}

/** 실행 상태 표의 한 행을 가리킨다. key는 { 칼럼 이름: 값 }이며 모두 같아야 한다. */
export interface RunStatusTarget {
  table: string;
  key: Record<string, string>;
}

/**
 * 시한이 지난 PENDING 행을 FAILED로 저장한다(BR5.5). status = 'PENDING' AND deadline_at <= now인 행만 바꾸므로
 * 이미 DONE·FAILED인 행은 그대로다. 바꿨으면 true.
 */
export async function persistDeadlineFailure(manager: EntityManager, target: RunStatusTarget, now: Date): Promise<boolean> {
  const columns = Object.keys(target.key);
  if (columns.length === 0) throw new TypeError('행을 가리킬 키가 없습니다.');
  const conditions = columns.map((column, index) => `${quoteIdentifier(column)} = $${index + 2}`);
  const sql = `UPDATE ${quoteIdentifier(target.table)} SET status = 'FAILED'
    WHERE status = 'PENDING' AND deadline_at <= $1 AND ${conditions.join(' AND ')}`;
  const result: unknown = await manager.query(sql, [now, ...columns.map((column) => target.key[column])]);
  // TypeORM(PostgreSQL)은 UPDATE 결과를 [행, 바뀐 행 수]로 돌려준다.
  return Array.isArray(result) && typeof result[1] === 'number' && result[1] > 0;
}

export type LateResultOutcome = 'SAVED' | 'DISCARDED';

export interface SaveRunResultInput {
  kind: AiRunKind;
  runKey: string;
  now: Date;
  /** 부모 행(발행본·실행)을 다시 읽는다. 없으면 null. */
  readParent: () => Promise<RunStatusRow | null>;
  /** 결과를 저장한다. 부모가 지워져 외래 키 위반(23503)이면 버림으로 바꾼다. */
  save: () => Promise<void>;
}

const logger = new Logger('AiRun');

function isForeignKeyViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as { code?: unknown; driverError?: { code?: unknown } };
  return record.code === '23503' || record.driverError?.code === '23503';
}

/**
 * 늦은 결과 버림 도우미(BR5.7, C-02 late-result). 부모가 없거나 PENDING이 아니거나(FAILED·DONE) 시한이 지났으면 저장하지 않는다.
 * 저장 중 외래 키 위반은 오류로 다시 시도하지 않고 버린다. 버림은 오류가 아니라 결과이며 로그 한 줄을 남긴다.
 * 그 밖의 저장 오류는 그대로 던진다(처리기 실패로 기록되고 다시 돌리지 않는다).
 */
export async function saveRunResult(input: SaveRunResultInput): Promise<LateResultOutcome> {
  const parent = await input.readParent();
  if (parent === null || readStatus(parent, input.now) !== 'PENDING') {
    logger.warn({ event: 'ai_run_result_discarded', kind: input.kind, runKey: input.runKey,
      reason: parent === null ? 'PARENT_MISSING' : 'PARENT_NOT_PENDING' });
    return 'DISCARDED';
  }
  try {
    await input.save();
    return 'SAVED';
  } catch (error) {
    if (!isForeignKeyViolation(error)) throw error;
    logger.warn({ event: 'ai_run_result_discarded', kind: input.kind, runKey: input.runKey, reason: 'PARENT_DELETED', error: errorName(error) });
    return 'DISCARDED';
  }
}

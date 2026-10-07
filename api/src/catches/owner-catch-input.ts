import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';

export interface OwnerCatchQuery {
  limit: number;
  repositoryId?: string;
  sourceRequestId?: string;
  after?: string;
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some((key) => !keys.includes(key))) throw new BadRequestException();
  return value as Record<string, unknown>;
}

export function catchIdInput(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) throw new BadRequestException();
  return value;
}

function cursorScope(memberId: string, query: Pick<OwnerCatchQuery, 'repositoryId' | 'sourceRequestId'>): string {
  return createHash('sha256').update(JSON.stringify([memberId, query.repositoryId ?? null, query.sourceRequestId ?? null])).digest('hex');
}

/** 커서는 조회 위치일 뿐 권한 증명이 아니다. DB 조회는 매번 인증 회원으로 제한한다. */
export function nextOwnerCatchCursor(memberId: string, query: OwnerCatchQuery, lastCatchId: string): string {
  return Buffer.from(JSON.stringify({ v: 1, scope: cursorScope(memberId, query), after: lastCatchId })).toString('base64url');
}

export function ownerCatchQuery(memberId: string, input: unknown): OwnerCatchQuery {
  const value = object(input, ['limit', 'repositoryId', 'sourceRequestId', 'cursor']);
  const query: OwnerCatchQuery = { limit: 20 };
  if (value.limit !== undefined) {
    if (typeof value.limit !== 'string' || !/^[1-9]\d{0,2}$/.test(value.limit)) throw new BadRequestException();
    query.limit = Number(value.limit);
    if (query.limit > 100) throw new BadRequestException();
  }
  if (value.repositoryId !== undefined) query.repositoryId = catchIdInput(value.repositoryId);
  if (value.sourceRequestId !== undefined) {
    const sourceRequestId = catchIdInput(value.sourceRequestId);
    query.sourceRequestId = isUuid(sourceRequestId) ? sourceRequestId.toLowerCase() : sourceRequestId;
  }
  if (value.cursor !== undefined) {
    if (typeof value.cursor !== 'string' || value.cursor.length === 0 || value.cursor.length > 1024
      || !/^[A-Za-z0-9_-]+$/.test(value.cursor)) throw new BadRequestException();
    try {
      const bytes = Buffer.from(value.cursor, 'base64url');
      if (bytes.toString('base64url') !== value.cursor) throw new BadRequestException();
      const cursor = object(JSON.parse(bytes.toString('utf8')), ['v', 'scope', 'after']);
      if (cursor.v !== 1 || cursor.scope !== cursorScope(memberId, query)
        || typeof cursor.after !== 'string' || !isUuid(cursor.after)) throw new BadRequestException();
      query.after = cursor.after.toLowerCase();
    } catch {
      throw new BadRequestException();
    }
  }
  return query;
}

export function confirmationInput(input: unknown): void {
  const value = object(input, ['workFactsConfirmed', 'contributionConfirmed']);
  if (value.workFactsConfirmed !== true || value.contributionConfirmed !== true) throw new BadRequestException();
}

export function mismatchInput(input: unknown): boolean {
  const value = object(input, ['mismatch']);
  if (typeof value.mismatch !== 'boolean') throw new BadRequestException();
  return value.mismatch;
}

export function emptyCatchQuery(input: unknown): void {
  object(input, []);
}

export function visibilityInput(input: unknown): 'PRIVATE' | 'PUBLIC' {
  const value = object(input, ['visibility']);
  if (value.visibility !== 'PRIVATE' && value.visibility !== 'PUBLIC') throw new BadRequestException();
  return value.visibility;
}

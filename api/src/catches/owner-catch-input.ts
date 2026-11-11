import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';

/** 본인 목록의 작성자 설명 조건(새 Catch C1, BR5.1). `written`은 설명이 있음, `unwritten`은 없음이다. 없으면 전체다. */
export type AuthorDescriptionFilter = 'written' | 'unwritten';

interface CatchPageFilters {
  limit: number;
  repositoryId?: string;
  sourceRequestId?: string;
  authorDescription?: AuthorDescriptionFilter;
}

/** 본인 목록 다음 쪽 위치(NC3 C2): 마지막 항목의 (마지막 작업 시각 밀리초 ISO 글 또는 없음, Catch ID). */
export interface OwnerCatchPosition {
  lastWorkAt: string | null;
  catchId: string;
}

export interface OwnerCatchQuery extends CatchPageFilters {
  after?: OwnerCatchPosition;
}

/** 공개 Catch 목록 조회. 순서(catch_id)와 커서 모양은 그대로다(NC3 BR7.3). */
export interface PublicCatchQuery extends CatchPageFilters {
  after?: string;
}

/**
 * 본인 목록 커서 판본. 작업 시각순 정렬로 위치가 (시각, ID) 한 쌍이 되며 3으로 올렸다(NC3 C2). 1·2 커서는 400이다(NFR7.2).
 * 공개 목록은 판본 2를 따로 쓴다. 범위 값이 달라(`public:` 앞붙임) 두 커서는 섞이지 않는다.
 */
const OWNER_CURSOR_VERSION = 3;
const PUBLIC_CURSOR_VERSION = 2;

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

function cursorScope(memberId: string, query: Pick<CatchPageFilters, 'repositoryId' | 'sourceRequestId' | 'authorDescription'>): string {
  return createHash('sha256').update(JSON.stringify([
    memberId, query.repositoryId ?? null, query.sourceRequestId ?? null, query.authorDescription ?? null,
  ])).digest('hex');
}

function encodeCursor(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/**
 * 본인 목록 다음 쪽 커서(판본 3). 시각은 DB 값을 `toISOString()`으로 옮긴 글만 쓴다(NC3 BR7.2, 검토 Minor 2).
 * 커서는 조회 위치일 뿐 권한 증명이 아니다. DB 조회는 매번 인증 회원으로 제한한다.
 */
export function nextOwnerCatchCursor(
  memberId: string, query: OwnerCatchQuery, last: { catchId: string; lastWorkAt: Date | null },
): string {
  return encodeCursor({
    v: OWNER_CURSOR_VERSION, scope: cursorScope(memberId, query),
    after: { lastWorkAt: last.lastWorkAt === null ? null : last.lastWorkAt.toISOString(), catchId: last.catchId },
  });
}

/** 공개 목록 다음 쪽 커서(판본 2, 지금 모양 그대로). */
export function nextPublicCatchCursor(scopeId: string, query: PublicCatchQuery, lastCatchId: string): string {
  return encodeCursor({ v: PUBLIC_CURSOR_VERSION, scope: cursorScope(scopeId, query), after: lastCatchId });
}

/** 문자열 `written`·`unwritten`만 받는다. 빈 값·같은 키 두 번(배열)·대소문자 다른 값은 400이고 받은 값은 오류에 싣지 않는다. */
function authorDescriptionInput(value: unknown): AuthorDescriptionFilter {
  if (value !== 'written' && value !== 'unwritten') throw new BadRequestException();
  return value;
}

function pageFilters(input: unknown): { query: CatchPageFilters; cursor?: unknown } {
  const value = object(input, ['limit', 'repositoryId', 'sourceRequestId', 'authorDescription', 'cursor']);
  const query: CatchPageFilters = { limit: 20 };
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
  if (value.authorDescription !== undefined) query.authorDescription = authorDescriptionInput(value.authorDescription);
  return { query, cursor: value.cursor };
}

/** base64url JSON 커서를 풀어 {v, scope, after}만 든 객체로 돌려준다. 판본·범위 검사는 부르는 쪽이 한다. */
function decodeCursor(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1024
    || !/^[A-Za-z0-9_-]+$/.test(value)) throw new BadRequestException();
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.toString('base64url') !== value) throw new BadRequestException();
  return object(JSON.parse(bytes.toString('utf8')), ['v', 'scope', 'after']);
}

/** 커서의 시각 글은 null이거나, 다시 `toISOString()`했을 때 같은 글이어야 한다(NC3 BR7.2). */
function cursorTime(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new BadRequestException();
  }
  return value;
}

function ownerPosition(value: unknown): OwnerCatchPosition {
  const after = object(value, ['lastWorkAt', 'catchId']);
  if (!('lastWorkAt' in after) || typeof after.catchId !== 'string' || !isUuid(after.catchId)) {
    throw new BadRequestException();
  }
  return { lastWorkAt: cursorTime(after.lastWorkAt), catchId: after.catchId.toLowerCase() };
}

/** 본인 목록 조회 입력. 커서는 판본 3만 받는다. 판본·범위·꼴이 틀리면 400이고 받은 값은 오류에 싣지 않는다. */
export function ownerCatchQuery(memberId: string, input: unknown): OwnerCatchQuery {
  const { query, cursor } = pageFilters(input);
  if (cursor === undefined) return query;
  try {
    const decoded = decodeCursor(cursor);
    if (decoded.v !== OWNER_CURSOR_VERSION || decoded.scope !== cursorScope(memberId, query)) {
      throw new BadRequestException();
    }
    return { ...query, after: ownerPosition(decoded.after) };
  } catch {
    throw new BadRequestException();
  }
}

/** 공개 Catch 목록 조회 입력(판본 2, 지금 모양 그대로, NC3 BR7.3). */
export function publicCatchQuery(scopeId: string, input: unknown): PublicCatchQuery {
  const { query, cursor } = pageFilters(input);
  if (cursor === undefined) return query;
  try {
    const decoded = decodeCursor(cursor);
    if (decoded.v !== PUBLIC_CURSOR_VERSION || decoded.scope !== cursorScope(scopeId, query)
      || typeof decoded.after !== 'string' || !isUuid(decoded.after)) throw new BadRequestException();
    return { ...query, after: decoded.after.toLowerCase() };
  } catch {
    throw new BadRequestException();
  }
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

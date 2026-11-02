import { createHash } from 'node:crypto';
import { ApiError } from '../common/errors';

/** 텍스트 자료 상한(U4 기능 설계 Q5 초기 설계값, NFR4.2). 길이는 유니코드 코드 포인트로 센다. */
export const TEXT_MATERIAL_LIMITS = Object.freeze({ title: 100, body: 20000 });
export const TEXT_MATERIAL_PAGE = Object.freeze({ defaultLimit: 20, maxLimit: 100 });

const LONE_SURROGATE = /[\uD800-\uDFFF]/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// PostgreSQL이 돌려준 마이크로초 UTC 시각. 밀리초로 줄이면 같은 밀리초의 자료를 건너뛸 수 있어 문자열 그대로 둔다.
const CURSOR_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

export interface TextMaterialInput {
  title: string;
  body: string;
}

export interface TextMaterialQuery {
  limit: number;
  after?: { createdAt: string; textMaterialId: string };
}

type Violation = { field: string; reason: string };

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

function failed(violations: Violation[]): ApiError {
  return new ApiError('VALIDATION_FAILED', { details: { violations } });
}

function checkText(input: Record<string, unknown>, field: 'title' | 'body', violations: Violation[]): string | null {
  const value = input[field];
  if (!Object.hasOwn(input, field) || typeof value !== 'string') {
    violations.push({ field, reason: 'isString' });
    return null;
  }
  if (value.includes('\u0000')) violations.push({ field, reason: 'noNul' });
  if (LONE_SURROGATE.test(value)) violations.push({ field, reason: 'isWellFormed' });
  const trimmed = value.trim();
  if (trimmed.length === 0) violations.push({ field, reason: 'isNotEmpty' });
  // 제목은 앞뒤 공백을 지운 값으로 세고 저장한다. 본문은 그대로 저장하고 그대로 센다(BR3.2).
  const counted = field === 'title' ? trimmed : value;
  if (Array.from(counted).length > TEXT_MATERIAL_LIMITS[field]) violations.push({ field, reason: 'maxLength' });
  return field === 'title' ? trimmed : value;
}

/**
 * 등록·수정 본문 `{ title, body }`를 검사한다(BR3.2, NFR1.8·NFR4.2). 정의하지 않은 필드는 거부한다.
 * 실패하면 400 VALIDATION_FAILED이며 값은 오류 응답에 담지 않는다.
 */
export function textMaterialInput(raw: unknown): TextMaterialInput {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw failed([{ field: 'body', reason: 'isObject' }]);
  const input = raw as Record<string, unknown>;
  const violations: Violation[] = [];
  if (Object.keys(input).some((key) => key !== 'title' && key !== 'body')) {
    violations.push({ field: 'body', reason: 'whitelistValidation' });
  }
  const title = checkText(input, 'title', violations);
  const body = checkText(input, 'body', violations);
  if (violations.length > 0 || title === null || body === null) throw failed(violations);
  return { title, body };
}

/** 정의하지 않은 쿼리를 거부한다(상세·수정·삭제·등록). */
export function emptyQuery(raw: unknown): void {
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw) && Object.keys(raw).length === 0) return;
  throw failed([{ field: 'query', reason: 'whitelistValidation' }]);
}

function cursorScope(memberId: string): string {
  return createHash('sha256').update(JSON.stringify(['text-material', memberId])).digest('hex');
}

/** 커서는 조회 위치일 뿐 권한 증명이 아니다. DB 조회는 매번 인증 회원으로 제한한다(10월 Catch 목록과 같은 기준). */
export function nextTextMaterialCursor(memberId: string, createdAt: string, textMaterialId: string): string {
  return Buffer.from(JSON.stringify({ v: 1, scope: cursorScope(memberId), at: createdAt, after: textMaterialId }))
    .toString('base64url');
}

function readCursor(memberId: string, value: unknown): TextMaterialQuery['after'] {
  const invalid = failed([{ field: 'cursor', reason: 'isValid' }]);
  if (typeof value !== 'string' || value.length === 0 || value.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(value)) throw invalid;
  let cursor: unknown;
  try {
    const bytes = Buffer.from(value, 'base64url');
    if (bytes.toString('base64url') !== value) throw invalid;
    cursor = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw invalid;
  }
  if (cursor === null || typeof cursor !== 'object' || Array.isArray(cursor)) throw invalid;
  const fields = cursor as Record<string, unknown>;
  if (Object.keys(fields).some((key) => !['v', 'scope', 'at', 'after'].includes(key))
    || fields.v !== 1 || fields.scope !== cursorScope(memberId)
    || typeof fields.at !== 'string' || !CURSOR_TIME.test(fields.at)
    || typeof fields.after !== 'string' || !isUuid(fields.after)) throw invalid;
  return { createdAt: fields.at, textMaterialId: fields.after.toLowerCase() };
}

/** 목록 쿼리 `cursor`·`limit`(NFR4.11). 순서는 만든 시각 최신순, 같은 시각은 ID 역순이다. */
export function textMaterialQuery(memberId: string, raw: unknown): TextMaterialQuery {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw failed([{ field: 'query', reason: 'isObject' }]);
  const input = raw as Record<string, unknown>;
  if (Object.keys(input).some((key) => key !== 'cursor' && key !== 'limit')) {
    throw failed([{ field: 'query', reason: 'whitelistValidation' }]);
  }
  const query: TextMaterialQuery = { limit: TEXT_MATERIAL_PAGE.defaultLimit };
  if (input.limit !== undefined) {
    if (typeof input.limit !== 'string' || !/^[1-9]\d{0,2}$/.test(input.limit)
      || Number(input.limit) > TEXT_MATERIAL_PAGE.maxLimit) throw failed([{ field: 'limit', reason: 'isValid' }]);
    query.limit = Number(input.limit);
  }
  if (input.cursor !== undefined) query.after = readCursor(memberId, input.cursor);
  return query;
}

// 발행 요청 본문과 작성자 목록 쿼리 검사(U4 기능 설계 BR4.1·BR4.5·BR8.1, NFR1.8·NFR4.2·NFR4.11).
// 10월 share-create(제목 trim·코드 포인트·비밀번호 그대로)와 제출 1 텍스트 자료 목록(cursor)의 규칙을 같은 방식으로 쓴다.
// 오류 응답에 입력값을 담지 않는다.
import { createHash } from 'node:crypto';
import { ApiError } from '../common/errors';
import { PUBLICATION_LIMITS, PUBLICATION_PAGE } from './publications-config';

/** U4가 발행하는 항목 종류. PDF_MATERIAL은 U8이 더한다(C-17). */
export const PUBLISH_ITEM_KINDS = ['CATCH', 'TEXT_MATERIAL'] as const;
export type PublishItemKind = (typeof PUBLISH_ITEM_KINDS)[number];

export interface PublishItemInput {
  kind: PublishItemKind;
  /** 소문자 UUID */
  sourceId: string;
}

/** 검증을 통과한 발행 명령(엔티티 문서 PublishCommand). 배열 순서가 position이다. */
export interface PublishInput {
  title: string;
  password?: string;
  items: PublishItemInput[];
}

export interface PublicationQuery {
  limit: number;
  after?: { publishedAt: string; publicationId: string };
}

type Violation = { field: string; reason: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// u 모드는 올바른 서로게이트 쌍을 하나의 코드 포인트로 읽으므로 고립된 코드 단위만 잡는다(제출 1과 같은 기준).
const LONE_SURROGATE = /[\uD800-\uDFFF]/u;
// PostgreSQL이 돌려준 마이크로초 UTC 시각. 밀리초로 줄이면 같은 밀리초의 발행본을 건너뛸 수 있어 문자열 그대로 둔다.
const CURSOR_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);

/** 유니코드 코드 포인트 수(10월 share-create와 같음). `string.length`는 UTF-16 단위라 쓰지 않는다. */
export const codePointLength = (value: string): number => [...value].length;

const failed = (violations: Violation[]): ApiError => new ApiError('VALIDATION_FAILED', { details: { violations } });

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function checkTitle(input: Record<string, unknown>, violations: Violation[]): string | null {
  const value = input.title;
  if (typeof value !== 'string') {
    violations.push({ field: 'title', reason: 'isString' });
    return null;
  }
  if (value.includes('\u0000')) violations.push({ field: 'title', reason: 'noNul' });
  if (LONE_SURROGATE.test(value)) violations.push({ field: 'title', reason: 'isWellFormed' });
  // 제목은 앞뒤 공백을 지운 값으로 세고 저장한다(BR4.5).
  const trimmed = value.trim();
  if (trimmed.length === 0) violations.push({ field: 'title', reason: 'isNotEmpty' });
  else if (codePointLength(trimmed) > PUBLICATION_LIMITS.titleMax) violations.push({ field: 'title', reason: 'maxLength' });
  return trimmed;
}

function checkPassword(input: Record<string, unknown>, violations: Violation[]): string | undefined {
  if (!Object.hasOwn(input, 'password')) return undefined;
  const value = input.password;
  if (typeof value !== 'string') {
    violations.push({ field: 'password', reason: 'isString' });
    return undefined;
  }
  // 비밀번호는 trim·정규화하지 않고 입력 그대로 센다(10월 #223, BR4.5).
  if (value === '') violations.push({ field: 'password', reason: 'isNotEmpty' });
  else if (codePointLength(value) < PUBLICATION_LIMITS.passwordMin) violations.push({ field: 'password', reason: 'minLength' });
  else if (codePointLength(value) > PUBLICATION_LIMITS.passwordMax) violations.push({ field: 'password', reason: 'maxLength' });
  return value;
}

function checkItems(input: Record<string, unknown>, violations: Violation[]): PublishItemInput[] {
  const value = input.items;
  if (!Array.isArray(value)) {
    violations.push({ field: 'items', reason: 'isArray' });
    return [];
  }
  if (value.length < PUBLICATION_LIMITS.itemsMin) violations.push({ field: 'items', reason: 'arrayMinSize' });
  if (value.length > PUBLICATION_LIMITS.itemsMax) violations.push({ field: 'items', reason: 'arrayMaxSize' });
  const items: PublishItemInput[] = [];
  const seen = new Set<string>();
  value.forEach((raw, index) => {
    // 항목 안의 임의 필드 이름은 응답에 반사하지 않고 위치만 알린다.
    const field = `items[${index}]`;
    if (!isPlainObject(raw) || Object.keys(raw).some((key) => key !== 'kind' && key !== 'sourceId')) {
      violations.push({ field, reason: 'isObject' });
      return;
    }
    const kind = raw.kind;
    const sourceId = raw.sourceId;
    if (!PUBLISH_ITEM_KINDS.includes(kind as PublishItemKind)) violations.push({ field: `${field}.kind`, reason: 'isIn' });
    if (!isUuid(sourceId)) violations.push({ field: `${field}.sourceId`, reason: 'isUuid' });
    if (!PUBLISH_ITEM_KINDS.includes(kind as PublishItemKind) || !isUuid(sourceId)) return;
    const item = { kind: kind as PublishItemKind, sourceId: sourceId.toLowerCase() };
    const key = `${item.kind}:${item.sourceId}`;
    if (seen.has(key)) violations.push({ field, reason: 'arrayUnique' });
    seen.add(key);
    items.push(item);
  });
  return items;
}

/**
 * `POST /publications` 본문 `{ title, password?, items: [{ kind, sourceId }] }`를 검사한다(BR4.1·BR4.5, NFR1.8·NFR4.2).
 * 정의하지 않은 필드는 거부한다. 실패하면 400 VALIDATION_FAILED이고 `details.violations`에 칸별 이유를 모두 담는다.
 */
export function publishInput(raw: unknown): PublishInput {
  if (!isPlainObject(raw)) throw failed([{ field: 'body', reason: 'isObject' }]);
  const violations: Violation[] = [];
  if (Object.keys(raw).some((key) => !['title', 'password', 'items'].includes(key))) {
    violations.push({ field: 'body', reason: 'whitelistValidation' });
  }
  const title = checkTitle(raw, violations);
  const password = checkPassword(raw, violations);
  const items = checkItems(raw, violations);
  if (violations.length > 0 || title === null) throw failed(violations);
  return password === undefined ? { title, items } : { title, password, items };
}

/** 정의하지 않은 쿼리를 거부한다(발행·상세·중지·삭제). */
export function emptyPublicationQuery(raw: unknown): void {
  if (isPlainObject(raw) && Object.keys(raw).length === 0) return;
  throw failed([{ field: 'query', reason: 'whitelistValidation' }]);
}

function cursorScope(memberId: string): string {
  return createHash('sha256').update(JSON.stringify(['publication', memberId])).digest('hex');
}

/** 커서는 조회 위치일 뿐 권한 증명이 아니다. DB 조회는 매번 인증 회원으로 제한한다(제출 1 텍스트 자료 목록과 같은 기준). */
export function nextPublicationCursor(memberId: string, publishedAt: string, publicationId: string): string {
  return Buffer.from(JSON.stringify({ v: 1, scope: cursorScope(memberId), at: publishedAt, after: publicationId })).toString('base64url');
}

function readCursor(memberId: string, value: unknown): PublicationQuery['after'] {
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
  if (!isPlainObject(cursor)) throw invalid;
  if (Object.keys(cursor).some((key) => !['v', 'scope', 'at', 'after'].includes(key))
    || cursor.v !== 1 || cursor.scope !== cursorScope(memberId)
    || typeof cursor.at !== 'string' || !CURSOR_TIME.test(cursor.at)
    || !isUuid(cursor.after)) throw invalid;
  return { publishedAt: cursor.at, publicationId: cursor.after.toLowerCase() };
}

/** 목록 쿼리 `cursor`·`limit`(BR8.1, NFR4.11). 순서는 발행 시각 최신순, 같은 시각은 ID 역순이다. */
export function publicationQuery(memberId: string, raw: unknown): PublicationQuery {
  if (!isPlainObject(raw)) throw failed([{ field: 'query', reason: 'isObject' }]);
  if (Object.keys(raw).some((key) => key !== 'cursor' && key !== 'limit')) {
    throw failed([{ field: 'query', reason: 'whitelistValidation' }]);
  }
  const query: PublicationQuery = { limit: PUBLICATION_PAGE.defaultLimit };
  if (raw.limit !== undefined) {
    if (typeof raw.limit !== 'string' || !/^[1-9]\d{0,2}$/.test(raw.limit)
      || Number(raw.limit) > PUBLICATION_PAGE.maxLimit) throw failed([{ field: 'limit', reason: 'isValid' }]);
    query.limit = Number(raw.limit);
  }
  if (raw.cursor !== undefined) query.after = readCursor(memberId, raw.cursor);
  return query;
}

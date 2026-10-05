import { ApiError } from '../common/errors';

/** 회원 목록 v1 페이지 규격(계약 요약 「회원 목록」): 기본 20, 최대 100. */
export const DEFAULT_LIST_LIMIT = 20;
export const MAX_LIST_LIMIT = 100;

const CURSOR_VERSION = 1;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** 목록의 다음 위치. 발행 시각 최신순, 같은 시각이면 linkId 역순이다. */
export interface ShareLinkCursor {
  issuedAt: Date;
  linkId: string;
}

export interface ShareLinkListQuery {
  limit: number;
  after: ShareLinkCursor | null;
}

const invalid = (field: string, reason: string) =>
  new ApiError('VALIDATION_FAILED', { details: { violations: [{ field, reason }] } });

/**
 * cursor는 소유자에 묶인 불투명 문자열이다. 다른 회원의 cursor나 고친 값은 400으로 거절한다.
 * 위치만 담고 권한을 담지 않으므로, 목록은 매번 인증된 회원의 링크만 다시 조회한다.
 */
export function encodeShareLinkCursor(ownerId: string, position: ShareLinkCursor): string {
  return Buffer.from(JSON.stringify([CURSOR_VERSION, ownerId, position.issuedAt.toISOString(), position.linkId]), 'utf8')
    .toString('base64url');
}

function decodeCursor(ownerId: string, value: string): ShareLinkCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    throw invalid('cursor', 'isCursor');
  }
  if (!Array.isArray(parsed) || parsed.length !== 4) throw invalid('cursor', 'isCursor');
  const [version, owner, issuedAt, linkId] = parsed as unknown[];
  const date = typeof issuedAt === 'string' ? new Date(issuedAt) : new Date(NaN);
  if (version !== CURSOR_VERSION || owner !== ownerId || typeof linkId !== 'string' || !UUID_PATTERN.test(linkId)
    || !Number.isFinite(date.getTime()) || date.toISOString() !== issuedAt) {
    throw invalid('cursor', 'isCursor');
  }
  return { issuedAt: date, linkId };
}

/**
 * GET /v1/share-links의 쿼리 검사. `cursor`·`limit`만 받고, 같은 이름을 여러 번 보내거나 다른 이름이 있으면 400이다.
 * 오류에는 입력값을 담지 않는다.
 */
export function parseShareLinkListQuery(ownerId: string, query: Record<string, unknown>): ShareLinkListQuery {
  if (Object.keys(query).some((key) => key !== 'cursor' && key !== 'limit')) throw invalid('query', 'whitelistValidation');
  let limit = DEFAULT_LIST_LIMIT;
  if (query.limit !== undefined) {
    if (typeof query.limit !== 'string' || !/^\d+$/.test(query.limit)) throw invalid('limit', 'isInt');
    limit = Number(query.limit);
    if (limit < 1) throw invalid('limit', 'min');
    if (limit > MAX_LIST_LIMIT) throw invalid('limit', 'max');
  }
  if (query.cursor !== undefined && typeof query.cursor !== 'string') throw invalid('cursor', 'isCursor');
  const after = query.cursor === undefined ? null : decodeCursor(ownerId, query.cursor);
  return { limit, after };
}

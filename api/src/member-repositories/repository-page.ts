import { createHash } from 'node:crypto';
import { ApiError } from '../common/errors';

export interface EligibleRepository {
  repositoryId: string;
  name: string;
  ownerLogin: string;
  url: string;
  allowedScopeRevision: string;
}

export interface RepositoryQuery {
  limit: number;
  cursor?: string;
}

const invalid = (field: string, reason: string) =>
  new ApiError('VALIDATION_FAILED', { details: { violations: [{ field, reason }] } });

/** 회원 목록 공통 계약: 기본 20, 최대 100. 입력 원문은 오류에 넣지 않는다. */
export function parseRepositoryQuery(query: Record<string, unknown>): RepositoryQuery {
  if (Object.keys(query).some((key) => key !== 'cursor' && key !== 'limit')) {
    throw invalid('query', 'whitelistValidation');
  }
  let limit = 20;
  if (query.limit !== undefined) {
    if (typeof query.limit !== 'string' || !/^\d+$/.test(query.limit)) throw invalid('limit', 'isInt');
    limit = Number(query.limit);
    if (limit < 1) throw invalid('limit', 'min');
    if (limit > 100) throw invalid('limit', 'max');
  }
  if (query.cursor !== undefined && (typeof query.cursor !== 'string' || query.cursor.length === 0)) {
    throw invalid('cursor', 'isCursor');
  }
  return { limit, cursor: query.cursor as string | undefined };
}

/** 공급자가 현재 회원에게 허용한 선정 공개 저장소만 전달한다. 계약의 다섯 필드만 복사한다. */
function projectRepositories(repositories: EligibleRepository[]): EligibleRepository[] {
  const ids = new Set<string>();
  const items = repositories.map((repository) => {
    const { repositoryId, name, ownerLogin, url, allowedScopeRevision } = repository;
    if ([repositoryId, name, ownerLogin, url, allowedScopeRevision]
      .some((value) => typeof value !== 'string' || value.length === 0) || ids.has(repositoryId)) {
      throw new Error('Invalid eligible repository source');
    }
    // URL을 호출하지 않는다. 제공 자료의 URI 형식만 검사한다.
    try { new URL(url); } catch { throw new Error('Invalid eligible repository source'); }
    ids.add(repositoryId);
    return { repositoryId, name, ownerLogin, url, allowedScopeRevision };
  });
  return items.sort((a, b) => a.repositoryId < b.repositoryId ? -1 : a.repositoryId > b.repositoryId ? 1 : 0);
}

/**
 * 커서는 위치 표식이며 권한 증표가 아니다. 매 페이지의 현재 공급 결과·회원 경계에 묶는다.
 * 목록이 바뀌거나 다른 회원의 커서를 보내면 400; 처음부터 다시 조회한다.
 */
export function repositoryPage(memberId: string, repositories: EligibleRepository[], query: RepositoryQuery) {
  const items = projectRepositories(repositories);
  const revision = createHash('sha256').update(JSON.stringify(items)).digest('hex');
  let offset = 0;
  if (query.cursor !== undefined) {
    const cursor = query.cursor;
    if (cursor.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw invalid('cursor', 'isCursor');
    let value: unknown;
    try {
      const buffer = Buffer.from(cursor, 'base64url');
      if (buffer.toString('base64url') !== cursor) throw new Error('Noncanonical cursor');
      value = JSON.parse(buffer.toString('utf8'));
    } catch { throw invalid('cursor', 'isCursor'); }
    if (!Array.isArray(value) || value.length !== 4) throw invalid('cursor', 'isCursor');
    const [version, owner, listRevision, lastId] = value as unknown[];
    if (version !== 1 || owner !== memberId || listRevision !== revision || typeof lastId !== 'string') {
      throw invalid('cursor', 'isCursor');
    }
    const position = items.findIndex((item) => item.repositoryId === lastId);
    if (position < 0) throw invalid('cursor', 'isCursor');
    offset = position + 1;
  }
  const pageItems = items.slice(offset, offset + query.limit);
  const nextCursor = offset + pageItems.length < items.length
    ? Buffer.from(JSON.stringify([1, memberId, revision, pageItems[pageItems.length - 1].repositoryId]))
      .toString('base64url')
    : null;
  return { items: pageItems, page: { nextCursor } };
}

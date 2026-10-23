import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ApiError } from '../common/errors';
import { AnalysisRequest } from '../member-analysis/member-analysis.entity';
import { readAnalysisStatusSnapshot } from './analysis-status';

/** 회원 목록 v1 페이지 규격(계약 요약 「회원 목록」): 기본 20, 최대 100. */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const CURSOR_VERSION = 1;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type AnalysisStatus = Awaited<ReturnType<typeof readAnalysisStatusSnapshot>>['status'];

/** 이력의 다음 위치. 접수 시각 최신순, 같은 시각이면 requestId 역순이다(재요청 판정의 '가장 최근 요청'과 같은 순서). */
export interface HistoryPosition {
  submittedAt: Date;
  requestId: string;
}

const invalid = (field: string, reason: string) =>
  new ApiError('VALIDATION_FAILED', { details: { violations: [{ field, reason }] } });

/** cursor는 회원에 묶인 위치 표식이며 권한 증표가 아니다. 목록은 매번 인증된 회원의 요청만 다시 조회한다. */
export function encodeHistoryCursor(memberId: string, position: HistoryPosition): string {
  return Buffer.from(JSON.stringify([CURSOR_VERSION, memberId, position.submittedAt.toISOString(), position.requestId]), 'utf8')
    .toString('base64url');
}
function decodeCursor(memberId: string, value: string): HistoryPosition {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    throw invalid('cursor', 'isCursor');
  }
  if (!Array.isArray(parsed) || parsed.length !== 4) throw invalid('cursor', 'isCursor');
  const [version, owner, submittedAt, requestId] = parsed as unknown[];
  const date = typeof submittedAt === 'string' ? new Date(submittedAt) : new Date(NaN);
  // 다른 회원의 cursor나 고친 값은 400이다. requestId를 UUID로 확인해야 위치 비교가 DB 형식 오류(500)가 되지 않는다.
  if (version !== CURSOR_VERSION || owner !== memberId || typeof requestId !== 'string' || !UUID.test(requestId) ||
      !Number.isFinite(date.getTime()) || date.toISOString() !== submittedAt) throw invalid('cursor', 'isCursor');
  return { submittedAt: date, requestId };
}
/** GET /v1/analysis-requests의 쿼리. `cursor`·`limit`만 받고 같은 이름 반복·다른 이름은 400이다. 오류에 입력값을 담지 않는다. */
export function parseHistoryQuery(memberId: string, query: Record<string, unknown>) {
  if (Object.keys(query).some(key => key !== 'cursor' && key !== 'limit')) throw invalid('query', 'whitelistValidation');
  let limit = DEFAULT_LIMIT;
  if (query.limit !== undefined) {
    if (typeof query.limit !== 'string' || !/^\d+$/.test(query.limit)) throw invalid('limit', 'isInt');
    limit = Number(query.limit);
    if (limit < 1) throw invalid('limit', 'min');
    if (limit > MAX_LIMIT) throw invalid('limit', 'max');
  }
  if (query.cursor !== undefined && typeof query.cursor !== 'string') throw invalid('cursor', 'isCursor');
  return { limit, after: query.cursor === undefined ? null : decodeCursor(memberId, query.cursor) };
}

/**
 * 본인 분석 이력·개별 상태 조회(#140). 상태는 접수(#138)와 같은 `analysis-status.ts`로 계산하고 쓰기·행 잠금·새 분석 실행을 하지 않는다.
 * 조회 오류는 빈 목록·404·다른 상태로 바꾸지 않고 그대로 공통 500 처리로 넘긴다.
 */
@Injectable()
export class AnalysisHistoryService {
  constructor(private readonly database: DataSource) {}

  /** 본인 이력(GET /v1/analysis-requests). 0건은 정상 빈 목록(`items: []`)이다. */
  async list(memberId: string, query: Record<string, unknown>) {
    if (!UUID.test(memberId)) throw new ApiError('AUTH_INVALID');
    const { limit, after } = parseHistoryQuery(memberId, query);
    return this.snapshot(async manager => {
      const builder = manager.getRepository(AnalysisRequest).createQueryBuilder('request')
        .where('request.memberId = :memberId', { memberId })
        .orderBy('request.submittedAt', 'DESC').addOrderBy('request.requestId', 'DESC')
        .take(limit + 1);
      if (after) builder.andWhere('(request.submittedAt, request.requestId) < (:submittedAt, :requestId)', { ...after });
      const rows = await builder.getMany();
      const page = rows.slice(0, limit);
      const items: AnalysisStatus[] = [];
      for (const request of page) items.push((await readAnalysisStatusSnapshot(manager, request)).status);
      const last = page.at(-1);
      return { items, page: { nextCursor: rows.length > limit && last ? encodeHistoryCursor(memberId, last) : null } };
    });
  }

  /** 개별 상태(GET /v1/analysis-requests/{requestId}). 타인·없는 요청과 UUID가 아닌 ID는 같은 404 RESOURCE_UNAVAILABLE이다. */
  async get(memberId: string, requestId: string) {
    if (!UUID.test(memberId)) throw new ApiError('AUTH_INVALID');
    // UUID가 아닌 ID를 그대로 조회하면 PostgreSQL 형식 오류(500)가 되므로 조회 전에 없는 자원과 같게 거른다.
    if (!UUID.test(requestId)) throw new ApiError('RESOURCE_UNAVAILABLE');
    return this.snapshot(async manager => {
      const request = await manager.findOneBy(AnalysisRequest, { requestId, memberId });
      if (!request) throw new ApiError('RESOURCE_UNAVAILABLE');
      return (await readAnalysisStatusSnapshot(manager, request)).status;
    });
  }

  /**
   * 읽기 전용 REPEATABLE READ 트랜잭션. 첫 조회 문장의 스냅샷을 뒤 문장이 함께 써서 요청·현재 시도·등록 연결·Catch·수신 기록과
   * 재요청 판정에 쓰는 같은 회원의 요청을 한 시점으로 읽는다. 동의는 요청 행의 consentId로 같은 시점에 묶인다.
   * 행 잠금을 잡지 않으므로 수신·반영·처리 시한 닫기를 기다리게 하지 않는다.
   */
  private snapshot<T>(read: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.database.transaction('REPEATABLE READ', async manager => {
      await manager.query('SET TRANSACTION READ ONLY');
      return read(manager);
    });
  }
}

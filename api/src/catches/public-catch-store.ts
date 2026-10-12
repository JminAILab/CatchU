import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { catchIdInput, isUuid, nextOwnerCatchCursor, ownerCatchQuery } from './owner-catch-input';
import { CatchReadIntegrityError, OwnerCatchReadSource, OwnerCatchResponse, toOwnerCatchResponse } from './owner-catch-response';
import { READ_COLUMNS, READ_FROM, ReadRow, readCatchSources } from './catch-reader';

/** common.yaml PublicCatch/PublicEvidence 허용 필드만 전달한다. */
export interface PublicCatchResponse {
  catchId: string;
  title: string;
  workFacts: string[];
  subjectContribution: string;
  evidence: Pick<OwnerCatchResponse['evidence'][number],
    'sourceUrl' | 'sourceRevision' | 'representedFacts' | 'contributionScope' | 'coverageLimits'>[];
  draft: OwnerCatchResponse['draft'];
}

function publicResponse(ownerId: string, source: OwnerCatchReadSource): PublicCatchResponse {
  const item = toOwnerCatchResponse(ownerId, source);
  if (!item || item.visibility !== 'PUBLIC' || item.restriction !== 'NONE') {
    throw new CatchReadIntegrityError('publicCatch.eligibility');
  }
  return {
    catchId: item.catchId, title: item.title, workFacts: item.workFacts,
    subjectContribution: item.subjectContribution,
    evidence: item.evidence.map((evidence) => ({
      sourceUrl: evidence.sourceUrl, sourceRevision: evidence.sourceRevision,
      representedFacts: evidence.representedFacts, contributionScope: evidence.contributionScope,
      coverageLimits: evidence.coverageLimits,
    })),
    draft: { status: item.draft.status, content: item.draft.content },
  };
}

// 관측이 완전한 SOURCE_PRIVATE만 제외한다. SQL/JSON null 관측은 정상 0건 대신 매핑 무결성 오류로 보낸다.
const PUBLIC_CONDITIONS = `c.owner_id = $1 AND c.visibility = 'PUBLIC' AND (
  p.applied_restriction IS DISTINCT FROM 'SOURCE_PRIVATE'
  OR p.confirmed_source_state IS NULL OR p.confirmed_source_state = 'null'::jsonb
  OR p.observation_provenance IS NULL OR p.observation_provenance = 'null'::jsonb
  OR p.observed_at IS NULL
)`;

/**
 * C가 링크 유효성·비밀번호를 검증한 뒤 링크 소유자 ID로 호출하는 내부 서비스다.
 * HTTP 경로/공개 인증 예외를 등록하지 않는다. ownerId를 수신자 입력에서 받지 않는다.
 */
@Injectable()
export class PublicCatchStore {
  constructor(@Inject(DataSource) private readonly dataSource: DataSource) {}

  async list(linkOwnerId: string, input: unknown) {
    const ownerId = linkOwnerId.toLowerCase();
    if (!isUuid(ownerId)) throw new NotFoundException();
    if (input === null || typeof input !== 'object' || Array.isArray(input)
      || Object.keys(input).some((key) => key !== 'cursor' && key !== 'limit')) throw new BadRequestException();
    // 같은 UUID 페이지 구현을 재사용하되 본인용 커서와 수신자용 커서는 섞이지 않는다.
    const cursorScope = 'public:' + ownerId;
    const query = ownerCatchQuery(cursorScope, input);
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      const values: unknown[] = [ownerId];
      let conditions = PUBLIC_CONDITIONS;
      if (query.after !== undefined) {
        values.push(query.after);
        conditions += ' AND c.catch_id > $2';
      }
      values.push(query.limit + 1);
      const rows: ReadRow[] = await manager.query(`SELECT ${READ_COLUMNS} ${READ_FROM}
        WHERE ${conditions} ORDER BY c.catch_id ASC LIMIT $${values.length}`, values);
      const pageRows = rows.slice(0, query.limit);
      const sources = await readCatchSources(manager, ownerId, pageRows);
      return {
        catches: sources.map((source) => publicResponse(ownerId, source)),
        page: { nextCursor: rows.length > query.limit
          ? nextOwnerCatchCursor(cursorScope, query, pageRows[pageRows.length - 1].catchId) : null },
      };
    });
  }

  async get(linkOwnerId: string, input: unknown): Promise<PublicCatchResponse> {
    const ownerId = linkOwnerId.toLowerCase();
    const catchId = catchIdInput(input);
    if (!isUuid(ownerId) || !isUuid(catchId)) throw new NotFoundException();
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      const rows: ReadRow[] = await manager.query(`SELECT ${READ_COLUMNS} ${READ_FROM}
        WHERE ${PUBLIC_CONDITIONS} AND c.catch_id = $2`, [ownerId, catchId]);
      if (rows.length === 0) throw new NotFoundException();
      if (rows.length !== 1) throw new CatchReadIntegrityError('catch.duplicate');
      const [source] = await readCatchSources(manager, ownerId, rows);
      return publicResponse(ownerId, source);
    });
  }
}

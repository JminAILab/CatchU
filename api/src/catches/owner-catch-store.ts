import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ApiError } from '../common/errors';
import { catchIdInput, confirmationInput, isUuid, mismatchInput, nextOwnerCatchCursor, ownerCatchQuery, visibilityInput } from './owner-catch-input';
import { CatchReadIntegrityError, OwnerCatchResponse, toOwnerCatchPage, toOwnerCatchResponse } from './owner-catch-response';
import { READ_COLUMNS, READ_FROM, ReadRow, readCatchSources } from './catch-reader';

@Injectable()
export class OwnerCatchStore {
  constructor(@Inject(DataSource) private readonly dataSource: DataSource) {}

  async list(memberId: string, input: unknown) {
    memberId = memberId.toLowerCase();
    if (!isUuid(memberId)) throw new ApiError('AUTH_INVALID');
    const query = ownerCatchQuery(memberId, input);
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      await this.assertMemberExists(manager, memberId);
      // 공개 계약의 ID는 비어 있지 않은 문자열이다. UUID로 저장될 수 없는 ID는 일치 자료가 없다.
      if (query.sourceRequestId !== undefined && !isUuid(query.sourceRequestId)) {
        return { items: [], page: { nextCursor: null } };
      }
      const values: unknown[] = [memberId];
      const conditions = ['c.owner_id = $1'];
      if (query.repositoryId !== undefined) {
        values.push(query.repositoryId);
        conditions.push(`r.repository_id = $${values.length}`);
      }
      if (query.sourceRequestId !== undefined) {
        values.push(query.sourceRequestId);
        conditions.push(`c.source_request_id = $${values.length}`);
      }
      // 조건 값은 SQL에 잇지 않고 고정 조각 둘 가운데 하나를 고른다. 빈 설명은 저장 때 null이 된다(C1, BR5.1).
      if (query.authorDescription !== undefined) {
        conditions.push(query.authorDescription === 'written' ? 'c.author_description IS NOT NULL' : 'c.author_description IS NULL');
      }
      if (query.after !== undefined) {
        values.push(query.after);
        conditions.push(`c.catch_id > $${values.length}`);
      }
      values.push(query.limit + 1);
      const rows: ReadRow[] = await manager.query(`SELECT ${READ_COLUMNS} ${READ_FROM}
        WHERE ${conditions.join(' AND ')} ORDER BY c.catch_id ASC LIMIT $${values.length}`, values);
      const pageRows = rows.slice(0, query.limit);
      const sources = await readCatchSources(manager, memberId, pageRows);
      const nextCursor = rows.length > query.limit
        ? nextOwnerCatchCursor(memberId, query, pageRows[pageRows.length - 1].catchId) : null;
      return toOwnerCatchPage(memberId, sources, nextCursor);
    });
  }

  async get(memberId: string, input: unknown): Promise<OwnerCatchResponse> {
    memberId = memberId.toLowerCase();
    if (!isUuid(memberId)) throw new ApiError('AUTH_INVALID');
    const catchId = catchIdInput(input);
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      await this.assertMemberExists(manager, memberId);
      if (!isUuid(catchId)) throw new NotFoundException();
      return this.read(manager, memberId, catchId);
    });
  }

  async confirm(memberId: string, input: unknown, body: unknown): Promise<OwnerCatchResponse> {
    confirmationInput(body);
    return this.update(memberId, catchIdInput(input), 'work_facts_confirmed = true, contribution_confirmed = true', []);
  }

  async setMismatch(memberId: string, input: unknown, body: unknown): Promise<OwnerCatchResponse> {
    const mismatch = mismatchInput(body);
    return this.update(memberId, catchIdInput(input), 'mismatch = $3', [mismatch]);
  }

  async setVisibility(memberId: string, input: unknown, body: unknown): Promise<OwnerCatchResponse> {
    const visibility = visibilityInput(body);
    memberId = memberId.toLowerCase();
    if (!isUuid(memberId)) throw new ApiError('AUTH_INVALID');
    const catchId = catchIdInput(input);
    // READ COMMITTED: 잠금 대기 중 확정된 보호 상태를 읽고 검사·저장까지 잠금을 유지한다.
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      await this.assertMemberExists(manager, memberId);
      if (!isUuid(catchId)) throw new NotFoundException();
      // visibility만 갱신하므로 키를 보호하는 외래 키의 KEY SHARE와 공존한다.
      // 보호 행의 FOR SHARE는 유지해 공개 조건 검사와 저장을 직렬화한다.
      const owned: { workFactsConfirmed: boolean; contributionConfirmed: boolean;
        requestMemberId: string | null; repositoryId: string | null }[] = await manager.query(`
        SELECT c.work_facts_confirmed AS "workFactsConfirmed", c.contribution_confirmed AS "contributionConfirmed",
          r.member_id AS "requestMemberId", r.repository_id AS "repositoryId"
        FROM catch_asset c LEFT JOIN analysis_request r ON r.request_id = c.source_request_id
        WHERE c.owner_id = $1 AND c.catch_id = $2 FOR NO KEY UPDATE OF c`, [memberId, catchId]);
      if (owned.length === 0) throw new NotFoundException();
      const current = owned[0];
      if (visibility === 'PUBLIC') {
        if (current.requestMemberId !== memberId || !current.repositoryId) throw new CatchReadIntegrityError('sourceRequest');
        if (!current.workFactsConfirmed || !current.contributionConfirmed) throw new ApiError('CONFIRMATION_REQUIRED');
        const protection: { restriction: string; confirmedSourceState: unknown;
          observationProvenance: unknown; observedAt: Date | null }[] = await manager.query(`
          SELECT applied_restriction AS restriction, confirmed_source_state AS "confirmedSourceState",
            observation_provenance AS "observationProvenance", observed_at AS "observedAt"
          FROM repository_protection
          WHERE owner_id = $1 AND repository_id = $2 FOR SHARE`, [memberId, current.repositoryId]);
        if (protection.length !== 1 || !['NONE', 'SOURCE_PRIVATE'].includes(protection[0].restriction)
          // 등록·조회와 같은 관측 완전성을 잠금 안에서 확인한다. 최근 실패는 이전 유효 관측을 무효화하지 않는다.
          || [protection[0].confirmedSourceState, protection[0].observationProvenance, protection[0].observedAt]
            .some((value) => value === null || value === undefined)) {
          throw new CatchReadIntegrityError('protection');
        }
        if (protection[0].restriction === 'SOURCE_PRIVATE') throw new ApiError('SOURCE_RESTRICTED');
      }
      await manager.query('UPDATE catch_asset SET visibility = $3 WHERE owner_id = $1 AND catch_id = $2',
        [memberId, catchId, visibility]);
      // 응답 무결성 검사 실패도 저장을 롤백한다. PRIVATE에는 공개 자격 조건을 적용하지 않는다.
      return this.read(manager, memberId, catchId);
    });
  }

  private async update(memberId: string, catchId: string, assignment: string, values: unknown[]): Promise<OwnerCatchResponse> {
    memberId = memberId.toLowerCase();
    if (!isUuid(memberId)) throw new ApiError('AUTH_INVALID');
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      await this.assertMemberExists(manager, memberId);
      if (!isUuid(catchId)) throw new NotFoundException();
      const owned: { catch_id: string }[] = await manager.query(
        'SELECT catch_id FROM catch_asset WHERE owner_id = $1 AND catch_id = $2 FOR UPDATE', [memberId, catchId],
      );
      if (owned.length === 0) throw new NotFoundException();
      // assignment는 위 두 호출의 고정 SQL이며 입력 문자열을 SQL로 조립하지 않는다.
      await manager.query(`UPDATE catch_asset SET ${assignment} WHERE owner_id = $1 AND catch_id = $2`, [memberId, catchId, ...values]);
      // 근거·원 요청·보호 판단 조회/매핑 실패도 저장을 롤백한다.
      return this.read(manager, memberId, catchId);
    });
  }

  private async assertMemberExists(manager: EntityManager, memberId: string): Promise<void> {
    // 조회·수정이 끝날 때까지 회원 삭제를 막고, 다른 DB 오류는 그대로 서버 오류로 둔다.
    const member = await manager.query('SELECT 1 FROM member_account WHERE member_id = $1 FOR KEY SHARE', [memberId]);
    if (member.length === 0) throw new ApiError('AUTH_INVALID');
  }

  private async read(manager: EntityManager, memberId: string, catchId: string): Promise<OwnerCatchResponse> {
    const rows: ReadRow[] = await manager.query(`SELECT ${READ_COLUMNS} ${READ_FROM}
      WHERE c.owner_id = $1 AND c.catch_id = $2`, [memberId, catchId]);
    if (rows.length === 0) throw new NotFoundException();
    if (rows.length !== 1) throw new CatchReadIntegrityError('catch.duplicate');
    const [source] = await readCatchSources(manager, memberId, rows);
    const response = toOwnerCatchResponse(memberId, source);
    if (response === null) throw new CatchReadIntegrityError('catch.ownerId');
    return response;
  }
}

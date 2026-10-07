import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ApiError } from '../common/errors';
import { catchIdInput, confirmationInput, isUuid, mismatchInput, nextOwnerCatchCursor, ownerCatchQuery } from './owner-catch-input';
import { CatchReadIntegrityError, OwnerCatchReadSource, OwnerCatchResponse, toOwnerCatchPage, toOwnerCatchResponse } from './owner-catch-response';

type ReadRow = OwnerCatchReadSource['asset'] & {
  requestId: string | null;
  requestMemberId: string | null;
  repositoryId: string | null;
  protectionOwnerId: string | null;
  protectionRepositoryId: string | null;
  appliedRestriction: 'NONE' | 'SOURCE_PRIVATE' | null;
  confirmedSourceState: unknown;
  observationProvenance: unknown;
  observedAt: Date | null;
};

const READ_COLUMNS = `
  c.catch_id AS "catchId", c.owner_id AS "ownerId", c.title,
  c.source_request_id AS "sourceRequestId", c.source_result_id AS "sourceResultId",
  c.source_candidate_id AS "sourceCandidateId", c.work_facts AS "workFacts",
  c.subject_contribution AS "subjectContribution", c.draft_status AS "draftStatus",
  c.draft_content AS "draftContent", c.reflection_status AS "reflectionStatus",
  c.reflection_questions AS "reflectionQuestions", c.work_facts_confirmed AS "workFactsConfirmed",
  c.contribution_confirmed AS "contributionConfirmed", c.mismatch, c.visibility,
  c.source_mode AS "sourceMode", r.request_id AS "requestId", r.member_id AS "requestMemberId",
  r.repository_id AS "repositoryId", p.owner_id AS "protectionOwnerId",
  p.repository_id AS "protectionRepositoryId", p.applied_restriction AS "appliedRestriction",
  p.confirmed_source_state AS "confirmedSourceState", p.observation_provenance AS "observationProvenance",
  p.observed_at AS "observedAt"`;

// LEFT JOIN으로 연결 누락을 숨기지 않고 응답 매핑의 무결성 검사에 전달한다.
const READ_FROM = `FROM catch_asset c
  LEFT JOIN analysis_request r ON r.request_id = c.source_request_id
  LEFT JOIN repository_protection p ON p.owner_id = c.owner_id AND p.repository_id = r.repository_id`;

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
      if (query.after !== undefined) {
        values.push(query.after);
        conditions.push(`c.catch_id > $${values.length}`);
      }
      values.push(query.limit + 1);
      const rows: ReadRow[] = await manager.query(`SELECT ${READ_COLUMNS} ${READ_FROM}
        WHERE ${conditions.join(' AND ')} ORDER BY c.catch_id ASC LIMIT $${values.length}`, values);
      const pageRows = rows.slice(0, query.limit);
      const sources = await this.sources(manager, memberId, pageRows);
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
    const [source] = await this.sources(manager, memberId, rows);
    const response = toOwnerCatchResponse(memberId, source);
    if (response === null) throw new CatchReadIntegrityError('catch.ownerId');
    return response;
  }

  private async sources(manager: EntityManager, memberId: string, rows: ReadRow[]): Promise<OwnerCatchReadSource[]> {
    if (rows.length === 0) return [];
    const evidence: OwnerCatchReadSource['evidence'][number][] = await manager.query(`SELECT
      e.catch_evidence_id AS "catchEvidenceId", e.catch_id AS "catchId", e.source_evidence_id AS "sourceEvidenceId",
      e.source_url AS "sourceUrl", e.source_revision AS "sourceRevision", e.represented_facts AS "representedFacts",
      e.contribution_scope AS "contributionScope", e.coverage_limits AS "coverageLimits"
      FROM catch_evidence e JOIN catch_asset c ON c.catch_id = e.catch_id
      WHERE c.owner_id = $1 AND e.catch_id = ANY($2::uuid[]) ORDER BY e.catch_evidence_id ASC`,
    [memberId, rows.map((row) => row.catchId)]);
    return rows.map((row) => ({
      asset: row,
      sourceRequest: row.requestId === null ? null : {
        requestId: row.requestId, memberId: row.requestMemberId!, repositoryId: row.repositoryId!,
      },
      evidence: evidence.filter((item) => item.catchId === row.catchId),
      protection: row.protectionOwnerId === null ? null : {
        ownerId: row.protectionOwnerId, repositoryId: row.protectionRepositoryId!, appliedRestriction: row.appliedRestriction!,
        confirmedSourceState: row.confirmedSourceState, observationProvenance: row.observationProvenance,
        observedAt: row.observedAt,
      },
    }));
  }
}

import { EntityManager } from 'typeorm';
import { OwnerCatchReadSource } from './owner-catch-response';

export type ReadRow = OwnerCatchReadSource['asset'] & {
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

export const READ_COLUMNS = `
  c.catch_id AS "catchId", c.owner_id AS "ownerId", c.title,
  c.source_request_id AS "sourceRequestId", c.source_result_id AS "sourceResultId",
  c.source_candidate_id AS "sourceCandidateId", c.work_facts AS "workFacts",
  c.subject_contribution AS "subjectContribution", c.draft_status AS "draftStatus",
  c.draft_content AS "draftContent", c.reflection_status AS "reflectionStatus",
  c.reflection_questions AS "reflectionQuestions", c.work_facts_confirmed AS "workFactsConfirmed",
  c.contribution_confirmed AS "contributionConfirmed", c.mismatch, c.visibility,
  c.source_mode AS "sourceMode", r.request_id AS "requestId", r.member_id AS "requestMemberId",
  r.repository_id AS "repositoryId", p.owner_id AS "protectionOwnerId",
  p.repository_id AS "protectionRepositoryId", p.applied_restriction AS "appliedRestriction", p.confirmed_source_state AS "confirmedSourceState", p.observation_provenance AS "observationProvenance", p.observed_at AS "observedAt"`;

// LEFT JOIN으로 연결 누락을 숨기지 않고 응답 매핑의 무결성 검사에 전달한다.
export const READ_FROM = `FROM catch_asset c
  LEFT JOIN analysis_request r ON r.request_id = c.source_request_id
  LEFT JOIN repository_protection p ON p.owner_id = c.owner_id AND p.repository_id = r.repository_id`;

export async function readCatchSources(manager: EntityManager, memberId: string, rows: ReadRow[]): Promise<OwnerCatchReadSource[]> {
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
      confirmedSourceState: row.confirmedSourceState, observationProvenance: row.observationProvenance, observedAt: row.observedAt,
    },
  }));
}

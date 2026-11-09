// 도구가 읽는 회원 자료(U6 기능 설계 BR5.2~BR5.5, 비기능 설계 performance-design 「조회」, NFR1.3·NFR2.2·NFR5.2).
// 칸을 하나씩 적는다. 첫 조건은 언제나 그 회원이고 값은 매개변수로만 넘긴다. draft_content와 PDF 표는 SQL에 없다.
// Catch와 근거 주소를 트랜잭션으로 묶지 않는다. 그 사이에 Catch가 지워지면 근거 주소가 덜 나올 뿐이고 남의 자료는 나오지 않는다.
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MCP_PAGE_ROWS } from './mcp-limits';
import type { McpCatchRow, McpTextMaterialRow, McpTextPosition } from './mcp-page';

const READ_CATCHES = `SELECT catch_id AS "catchId", title, visibility, work_facts AS "workFacts",
    subject_contribution AS "subjectContribution", author_description AS "authorDescription", mismatch
  FROM catch_asset WHERE owner_id = $1 AND ($2::uuid IS NULL OR catch_id > $2::uuid) ORDER BY catch_id ASC LIMIT $3`;

const READ_EVIDENCE_URLS = `SELECT e.catch_id AS "catchId", e.source_url AS "sourceUrl"
  FROM catch_evidence e JOIN catch_asset c ON c.catch_id = e.catch_id
  WHERE c.owner_id = $1 AND e.catch_id = ANY($2::uuid[]) ORDER BY e.catch_id, e.position, e.catch_evidence_id`;

const READ_TEXT_MATERIALS = `SELECT text_material_id AS "textMaterialId", title, body, updated_at AS "updatedAt",
    to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAtText"
  FROM text_material WHERE member_id = $1 AND ($2::timestamptz IS NULL OR (created_at, text_material_id) > ($2::timestamptz, $3::uuid))
  ORDER BY created_at, text_material_id LIMIT $4`;

@Injectable()
export class McpMaterialReader {
  constructor(private readonly dataSource: DataSource) {}

  async readCatches(memberId: string, after: string | null): Promise<McpCatchRow[]> {
    const rows = await this.dataSource.query(READ_CATCHES, [memberId, after, MCP_PAGE_ROWS]) as Omit<McpCatchRow, 'evidenceUrls'>[];
    if (rows.length === 0) return [];
    const evidence = await this.dataSource.query(READ_EVIDENCE_URLS, [memberId, rows.map((row) => row.catchId)]) as { catchId: string; sourceUrl: string }[];
    return rows.map((row) => ({ ...row, evidenceUrls: evidence.filter((item) => item.catchId === row.catchId).map((item) => item.sourceUrl) }));
  }

  readTextMaterials(memberId: string, position: McpTextPosition | null): Promise<McpTextMaterialRow[]> {
    return this.dataSource.query(READ_TEXT_MATERIALS, [memberId, position?.createdAt ?? null, position?.id ?? null, MCP_PAGE_ROWS]) as Promise<McpTextMaterialRow[]>;
  }
}

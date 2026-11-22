// 발행할 자료를 종류별 ID 묶음으로 읽기(발행 프리셋 intent U1 PublishableSource, NFR 설계 performance-design NFR6.2·NFR6.4, 검토 R-02·R-04).
// 두 형태를 둔다. 잠그지 않는 readSources는 프리셋 목록·상세·세기·저장이, 잠그는 lock*·readEvidenceForPublish·readProtections는 발행 트랜잭션이 쓴다.
// 어느 쪽이든 종류마다 한 번씩만 조회하므로 조회 수는 자료·프리셋 수와 무관하다. 모든 조회에 회원 조건을 붙인다(NFR2.3·NFR2.5).
// 잠금 SQL과 잠금 순서는 발행 모듈(publish.service.ts)에 있던 것 그대로다(U4 NFR4.6, NC2 성능 설계 「발행 읽기 설계」).
import { EntityManager } from 'typeorm';
import type { ProtectionRow } from './eligibility';
import { CatchEvidenceRow, CatchSourceRow, commitShaOf } from './source-content';

/** 자료 종류(C-07 item_kind와 같은 값). */
export const SOURCE_KINDS = ['CATCH', 'TEXT_MATERIAL', 'PDF_MATERIAL'] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

/** 자료 하나를 가리키는 값(PresetItemRef·발행 항목). sourceId는 소문자 UUID다. */
export interface SourceRef {
  kind: SourceKind;
  sourceId: string;
}

/** 잠그지 않고 읽은 텍스트 자료. 본문은 읽지 않고 코드 포인트 수만 SQL로 센다(char_length = UTF-8 문자 수 = 코드 포인트). */
export interface TextMaterialMeasureRow {
  textMaterialId: string;
  title: string;
  textLength: number;
}

/** 잠그지 않고 읽은 PDF. 글자 수는 읽을 수 있는 쪽 글의 합을 SQL로 센다(검토 R-04). 추출이 끝나지 않았으면 쪽 행이 없어 0이다. */
export interface PdfMeasureRow {
  pdfMaterialId: string;
  title: string;
  extractionState: string;
  textLength: number;
}

/** 잠그지 않고 읽은 자료 묶음. 근거는 글자 수에 쓰는 나타낸 사실만 담는다(본인 커밋 여부는 글자 수에 들지 않는다). */
export interface ReadSources {
  catches: Map<string, CatchSourceRow>;
  evidence: Map<string, { representedFacts: string[] }[]>;
  protections: Map<string, ProtectionRow>;
  textMaterials: Map<string, TextMaterialMeasureRow>;
  pdfs: Map<string, PdfMeasureRow>;
}

/** 텍스트 자료 잠금 결과(발행). */
export interface TextMaterialSourceRow {
  textMaterialId: string;
  title: string;
  body: string;
}

// 저장소 등록(rr)은 분석 요청의 외래 키와 같은 세 칸(회원, 등록, 저장소)으로 잇는다(NC2 NFR 설계 검토 R-03). 잠금은 Catch(c)에만 건다.
const CATCH_SELECT = `
  SELECT c.catch_id AS "catchId", c.title, c.work_facts AS "workFacts", c.subject_contribution AS "subjectContribution",
    c.draft_status AS "draftStatus", c.draft_content AS "draftContent", c.author_description AS "authorDescription",
    c.author_description_updated_at AS "authorDescriptionUpdatedAt",
    c.mismatch, c.visibility, c.work_facts_confirmed AS "workFactsConfirmed", c.contribution_confirmed AS "contributionConfirmed",
    r.member_id AS "requestMemberId", r.repository_id AS "repositoryId", rr.owner AS "repositoryOwner", rr.name AS "repositoryName"
  FROM catch_asset c LEFT JOIN analysis_request r ON r.request_id = c.source_request_id
    LEFT JOIN repository_registration rr
      ON rr.member_id = r.member_id AND rr.registration_id = r.registration_id AND rr.repository_id = r.repository_id
  WHERE c.owner_id = $1 AND c.catch_id = ANY($2::uuid[])
  ORDER BY c.catch_id ASC`;

const EVIDENCE_SQL = `
  SELECT e.catch_id AS "catchId", e.source_url AS "sourceUrl", e.source_revision AS "sourceRevision", e.represented_facts AS "representedFacts",
    e.coverage_limits AS "coverageLimits"
  FROM catch_evidence e WHERE e.catch_id = ANY($1::uuid[])
  ORDER BY e.catch_id ASC, e.position ASC, e.catch_evidence_id ASC`;

// 발행하는 회원·고른 Catch·근거 커밋 식별값으로 좁혀 한 번에 읽는다. 읽는 행 수는 근거 수를 넘지 않는다(NC2 성능 설계, 보안 설계 1절).
const COMMIT_ASSIGNMENT_SQL = `
  SELECT catch_id AS "catchId", github_repository_id AS "githubRepositoryId", commit_sha AS "commitSha"
  FROM commit_assignment
  WHERE member_id = $1 AND catch_id = ANY($2::uuid[]) AND commit_sha = ANY($3::char(40)[])`;

const PROTECTION_SELECT = `
  SELECT repository_id AS "repositoryId", applied_restriction AS restriction, confirmed_source_state AS "confirmedSourceState",
    observation_provenance AS "observationProvenance", observed_at AS "observedAt"
  FROM repository_protection WHERE owner_id = $1 AND repository_id = ANY($2::text[])`;

const TEXT_MATERIAL_LOCK_SQL = `
  SELECT text_material_id AS "textMaterialId", title, body FROM text_material
  WHERE member_id = $1 AND text_material_id = ANY($2::uuid[]) ORDER BY text_material_id ASC FOR UPDATE`;

const TEXT_MATERIAL_MEASURE_SQL = `
  SELECT text_material_id AS "textMaterialId", title, char_length(body) AS "textLength" FROM text_material
  WHERE member_id = $1 AND text_material_id = ANY($2::uuid[])`;

const PDF_MEASURE_SQL = `
  SELECT m.pdf_material_id AS "pdfMaterialId", m.title, m.extraction_state AS "extractionState",
    COALESCE((SELECT sum(char_length(p.text)) FILTER (WHERE p.readable) FROM pdf_page_text p WHERE p.pdf_material_id = m.pdf_material_id), 0)
      AS "textLength"
  FROM pdf_material m WHERE m.member_id = $1 AND m.pdf_material_id = ANY($2::uuid[])`;

interface AssignmentRow {
  catchId: string;
  githubRepositoryId: string;
  commitSha: string;
}

/** 근거 조회 결과. 본인 커밋 여부는 소속 기록 조회 뒤에 붙인다(NC2 BR1.4). */
type EvidenceQueryRow = Omit<CatchEvidenceRow, 'ownCommit'>;

/** 종류별로 중복 없는 ID 목록(요청 순서). 같은 자료가 여러 프리셋에 있어도 한 번씩만 읽고 잠근다(BR3.7). */
export function idsOf(refs: readonly SourceRef[], kind: SourceKind): string[] {
  return [...new Set(refs.filter((ref) => ref.kind === kind).map((ref) => ref.sourceId))];
}

/**
 * 잠그지 않고 종류별로 한 번씩 읽는다(프리셋 경로). 조회는 Catch → 근거 → 보호 관측 → 텍스트 자료 → PDF 순이고, 없는 종류는 건너뛴다.
 * 남의 것·없는 것은 결과 Map에 없다. 확인은 부르는 쪽이 한다(저장·세기는 404, 목록·상세는 500).
 */
export async function readSources(manager: EntityManager, owner: string, refs: readonly SourceRef[]): Promise<ReadSources> {
  const catchIds = idsOf(refs, 'CATCH');
  const textIds = idsOf(refs, 'TEXT_MATERIAL');
  const pdfIds = idsOf(refs, 'PDF_MATERIAL');
  const catchRows: CatchSourceRow[] = catchIds.length === 0 ? [] : await manager.query(CATCH_SELECT, [owner, catchIds]);
  const catches = new Map(catchRows.map((row) => [row.catchId, row]));
  const evidence = new Map<string, { representedFacts: string[] }[]>();
  if (catchRows.length > 0) {
    const rows: EvidenceQueryRow[] = await manager.query(EVIDENCE_SQL, [catchRows.map((row) => row.catchId)]);
    for (const row of rows) evidence.set(row.catchId, [...(evidence.get(row.catchId) ?? []), { representedFacts: row.representedFacts }]);
  }
  const repositoryIds = [...new Set(catchRows.map((row) => row.repositoryId).filter((id): id is string => id !== null))];
  const protections = repositoryIds.length === 0 ? new Map<string, ProtectionRow>() : await readProtections(manager, owner, repositoryIds, false);
  const textRows: (Omit<TextMaterialMeasureRow, 'textLength'> & { textLength: string | number })[] = textIds.length === 0 ? []
    : await manager.query(TEXT_MATERIAL_MEASURE_SQL, [owner, textIds]);
  const pdfRows: (Omit<PdfMeasureRow, 'textLength'> & { textLength: string | number })[] = pdfIds.length === 0 ? []
    : await manager.query(PDF_MEASURE_SQL, [owner, pdfIds]);
  return {
    catches,
    evidence,
    protections,
    textMaterials: new Map(textRows.map((row) => [row.textMaterialId, { ...row, textLength: Number(row.textLength) }])),
    pdfs: new Map(pdfRows.map((row) => [row.pdfMaterialId, { ...row, textLength: Number(row.textLength) }])),
  };
}

/** 그 자료를 읽었는지(남의 것·없는 것이면 false). */
export function hasSource(sources: ReadSources, ref: SourceRef): boolean {
  if (ref.kind === 'CATCH') return sources.catches.has(ref.sourceId);
  if (ref.kind === 'TEXT_MATERIAL') return sources.textMaterials.has(ref.sourceId);
  return sources.pdfs.has(ref.sourceId);
}

/** 보호 관측을 저장소 ID 묶음으로 한 번 읽는다. 발행은 FOR SHARE로 잠근다(10월 공개 전환과 같은 잠금). */
export async function readProtections(
  manager: EntityManager, owner: string, repositoryIds: readonly string[], lock: boolean,
): Promise<Map<string, ProtectionRow>> {
  const rows: ProtectionRow[] = await manager.query(`${PROTECTION_SELECT}${lock ? ' FOR SHARE' : ''}`, [owner, repositoryIds]);
  return new Map(rows.map((row) => [row.repositoryId, row]));
}

/** visibility만 갱신하던 10월 setVisibility와 같은 잠금(FOR NO KEY UPDATE). 키를 보호하는 외래 키의 KEY SHARE와 공존한다. */
export async function lockCatches(manager: EntityManager, owner: string, catchIds: string[]): Promise<Map<string, CatchSourceRow>> {
  const rows: CatchSourceRow[] = await manager.query(`${CATCH_SELECT}\n  FOR NO KEY UPDATE OF c`, [owner, catchIds]);
  return new Map(rows.map((row) => [row.catchId, row]));
}

export async function lockTextMaterials(manager: EntityManager, owner: string, ids: string[]): Promise<Map<string, TextMaterialSourceRow>> {
  const rows: TextMaterialSourceRow[] = await manager.query(TEXT_MATERIAL_LOCK_SQL, [owner, ids]);
  return new Map(rows.map((row) => [row.textMaterialId, row]));
}

const assignmentKey = (catchId: string, repositoryId: string, sha: string) => JSON.stringify([catchId, repositoryId, sha]);

/**
 * 발행 사본의 근거를 읽고 근거마다 본인 커밋 여부를 붙인다(NC2 BR1.4, NFR5.3). 커밋 주소 근거의 식별값만 모아 소속 기록을 한 번 읽고,
 * 「근거의 Catch, 그 Catch의 분석 요청 저장소 ID, 근거 식별값」 셋이 모두 맞는 소속 기록이 있을 때만 참이다.
 * 그래서 다른 Catch·다른 회원·다른 저장소 ID의 같은 식별값은 참이 되지 않는다. 커밋 주소 근거가 없으면 소속 기록을 읽지 않는다.
 */
export async function readEvidenceForPublish(
  manager: EntityManager, owner: string, catchIds: string[], catches: Map<string, CatchSourceRow>,
): Promise<CatchEvidenceRow[]> {
  const rows: EvidenceQueryRow[] = await manager.query(EVIDENCE_SQL, [catchIds]);
  const shas = [...new Set(rows.map((row) => commitShaOf(row.sourceUrl)).filter((sha): sha is string => sha !== null))];
  const assigned = new Set<string>();
  if (shas.length > 0) {
    const assignments: AssignmentRow[] = await manager.query(COMMIT_ASSIGNMENT_SQL, [owner, catchIds, shas]);
    for (const row of assignments) assigned.add(assignmentKey(row.catchId, row.githubRepositoryId, row.commitSha));
  }
  return rows.map((row) => {
    const sha = commitShaOf(row.sourceUrl);
    const repositoryId = catches.get(row.catchId)?.repositoryId ?? null;
    return { ...row, ownCommit: sha !== null && repositoryId !== null && assigned.has(assignmentKey(row.catchId, repositoryId, sha)) };
  });
}

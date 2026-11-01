// 기본 요약 근거 만들기(기능 설계 BR5.1, entities SummarySource, 계약 C-01 caller-rule·C-07 fieldPath·sourceKind-rule, security-design NFR1.3).
// 순수 함수다. 색인을 쓰지 않고 발행 사본 필드 하나를 근거 하나로 만든다. aiDraft·mismatch·제목은 넣지 않는다.
// 사본은 U4가 쓴 jsonb라 실제 값의 모양을 여기서 확인한다(계획 「Assumptions」). 틀리면 TypeError로 처리기가 FAILED로 쓴다.
import type { AiSource, AiSourceKind } from '../ai-generation/ai-generation.types';
import type { PublishedSnapshot, PublishedSnapshotItem } from '../publications/publication-access';

/** C-07 sourceKind-rule: Catch의 GitHub 기록 필드와 작성자 글 필드. 이 표에 없는 사본 필드는 근거가 아니다. */
export const SUMMARY_FIELD_KINDS = {
  workFacts: 'GITHUB_RECORD',
  subjectContribution: 'GITHUB_RECORD',
  representedFacts: 'GITHUB_RECORD',
  authorDescription: 'AUTHOR_MATERIAL',
  body: 'AUTHOR_MATERIAL',
  pages: 'AUTHOR_MATERIAL',
} as const satisfies Record<string, AiSourceKind>;

interface Field {
  fieldPath: string;
  text: unknown;
  sourceKind: AiSourceKind;
  pdfPage: number | null;
}

class SnapshotShapeError extends TypeError {
  override readonly name = 'SnapshotShapeError';

  constructor(field: string) {
    super(`발행 사본 모양이 맞지 않습니다(${field}).`);
  }
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SnapshotShapeError(field);
  return value as Record<string, unknown>;
}

function list(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new SnapshotShapeError(field);
  return value;
}

/** CATCH: workFacts[i] → subjectContribution → evidence[i].representedFacts[j] → authorDescription(null이 아닐 때) 순서. */
function catchFields(item: PublishedSnapshotItem): { fields: Field[]; evidenceUrls: string[] } {
  const snapshot = record(item.snapshot, 'snapshot');
  const fields: Field[] = list(snapshot.workFacts, 'workFacts').map((text, i) => (
    { fieldPath: `workFacts[${i}]`, text, sourceKind: SUMMARY_FIELD_KINDS.workFacts, pdfPage: null }));
  fields.push({ fieldPath: 'subjectContribution', text: snapshot.subjectContribution, sourceKind: SUMMARY_FIELD_KINDS.subjectContribution,
    pdfPage: null });
  const evidenceUrls: string[] = [];
  list(snapshot.evidence, 'evidence').forEach((value, i) => {
    const evidence = record(value, `evidence[${i}]`);
    if (typeof evidence.sourceUrl !== 'string') throw new SnapshotShapeError(`evidence[${i}].sourceUrl`);
    evidenceUrls.push(evidence.sourceUrl);
    list(evidence.representedFacts, `evidence[${i}].representedFacts`).forEach((text, j) => fields.push(
      { fieldPath: `evidence[${i}].representedFacts[${j}]`, text, sourceKind: SUMMARY_FIELD_KINDS.representedFacts, pdfPage: null }));
  });
  if (snapshot.authorDescription !== null && snapshot.authorDescription !== undefined) {
    fields.push({ fieldPath: 'authorDescription', text: snapshot.authorDescription, sourceKind: SUMMARY_FIELD_KINDS.authorDescription,
      pdfPage: null });
  }
  return { fields, evidenceUrls };
}

/** PDF: 읽을 수 있는 쪽의 pages[n](n 오름차순). 쪽 글은 published_pdf_page(U8)에서 온다. */
function pdfFields(item: PublishedSnapshotItem): Field[] {
  if (item.pdfPages === null || item.pdfPages === undefined) return [];
  return list(item.pdfPages, 'pdfPages')
    .map((page, i) => record(page, `pdfPages[${i}]`))
    .filter((page) => page.readable === true)
    .sort((a, b) => Number(a.pageNumber) - Number(b.pageNumber))
    .map((page) => {
      if (!Number.isSafeInteger(page.pageNumber)) throw new SnapshotShapeError('pdfPages.pageNumber');
      const n = page.pageNumber as number;
      return { fieldPath: `pages[${n}]`, text: page.text, sourceKind: SUMMARY_FIELD_KINDS.pages, pdfPage: n };
    });
}

function itemFields(item: PublishedSnapshotItem): { fields: Field[]; evidenceUrls: string[] } {
  switch (item.itemKind) {
    case 'CATCH':
      return catchFields(item);
    case 'TEXT_MATERIAL':
      return { fields: [{ fieldPath: 'body', text: record(item.snapshot, 'snapshot').body, sourceKind: SUMMARY_FIELD_KINDS.body,
        pdfPage: null }], evidenceUrls: [] };
    case 'PDF_MATERIAL':
      return { fields: pdfFields(item), evidenceUrls: [] };
    default:
      throw new SnapshotShapeError('itemKind');
  }
}

/**
 * 사본 → 근거 목록. 항목은 position 순서, 근거 ID는 `{publishedItemId}/{fieldPath}`, 위치는 그 필드 전체 범위(UTF-16 [0, 길이)).
 * 공백만인 필드는 뺀다. Catch 항목의 근거에는 그 항목 evidence[].sourceUrl을 catchEvidenceUrls로 붙인다(C-01 caller-rule).
 */
export function buildSummarySources(snapshot: PublishedSnapshot): AiSource[] {
  const items = [...list(snapshot?.items, 'items')].map((value, i) => record(value, `items[${i}]`) as unknown as PublishedSnapshotItem)
    .sort((a, b) => a.position - b.position);
  return items.flatMap((item) => {
    if (typeof item.publishedItemId !== 'string') throw new SnapshotShapeError('publishedItemId');
    const { fields, evidenceUrls } = itemFields(item);
    return fields.map((field): AiSource => {
      if (typeof field.text !== 'string') throw new SnapshotShapeError(field.fieldPath);
      return {
        sourceId: `${item.publishedItemId}/${field.fieldPath}`,
        sourceKind: field.sourceKind,
        text: field.text,
        location: { publishedItemId: item.publishedItemId, fieldPath: field.fieldPath, charStart: 0, charEnd: field.text.length,
          pdfPage: field.pdfPage },
        catchEvidenceUrls: [...evidenceUrls],
      };
    }).filter((source) => source.text.trim() !== '');
  });
}

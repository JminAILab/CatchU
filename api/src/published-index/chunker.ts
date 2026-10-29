// 조각 나누개(기능 설계 W1 2~4단계, BR1.1~BR1.6·BR1.9·BR1.10, 비기능 NFR1.2). DB·외부 호출이 없는 순수 함수다.
// 사본은 U4가 쓴 값이지만 모양을 믿지 않고 검사한다(security-design 「입력 검증」). 모양이 C-07과 다르면 예외(BR1.7).
import { MAX_CHUNK_LENGTH } from './embedding-config';

export const CHUNK_SOURCE_KINDS = ['GITHUB_RECORD', 'AUTHOR_MATERIAL'] as const;
export type ChunkSourceKind = (typeof CHUNK_SOURCE_KINDS)[number];

export interface ChunkSourcePdfPage {
  pageNumber: number;
  text: string;
  readable: boolean;
}

/** 발행 항목 하나(published_item 한 행과, PDF 항목이면 그 쪽 사본). snapshot은 아직 검사하지 않은 값이다. */
export interface ChunkSourceItem {
  publishedItemId: string;
  position: number;
  itemKind: string;
  snapshot: unknown;
  /** PDF_MATERIAL만 쪽 목록, 그 밖은 null */
  pdfPages: ChunkSourcePdfPage[] | null;
}

/** 필드 하나의 한 부분(기능 설계 entities.md ChunkDraft). seq는 기록기가 매긴다. */
export interface ChunkDraft {
  publishedItemId: string;
  fieldPath: string;
  charStart: number;
  charEnd: number;
  pdfPage: number | null;
  sourceKind: ChunkSourceKind;
  text: string;
  catchEvidenceUrls: string[];
}

/** 사본 모양이 C-07과 다르거나 위치 검사(BR1.2)가 맞지 않음. 메시지에 사본 내용을 넣지 않는다. */
export class ChunkSourceError extends Error {
  override readonly name = 'ChunkSourceError';
}

interface Range {
  start: number;
  end: number;
}

interface ChunkField {
  fieldPath: string;
  text: string;
  sourceKind: ChunkSourceKind;
  pdfPage: number | null;
}

/** 항목 position → 필드 순서(BR1.1) → 필드 안 위치 순서로 조각 초안을 돌려준다(BR1.9). */
export function buildChunkDrafts(items: readonly ChunkSourceItem[]): ChunkDraft[] {
  const ordered = [...items].sort((a, b) => a.position - b.position);
  const drafts: ChunkDraft[] = [];
  for (const item of ordered) {
    const { fields, catchEvidenceUrls } = selectFields(item);
    for (const field of fields) {
      for (const range of splitFieldRanges(field.text)) {
        drafts.push(toDraft(item.publishedItemId, field, range, catchEvidenceUrls));
      }
    }
  }
  return drafts;
}

function toDraft(publishedItemId: string, field: ChunkField, range: Range, catchEvidenceUrls: string[]): ChunkDraft {
  const text = field.text.slice(range.start, range.end);
  // 저장 전 위치 검사(BR1.2). 범위를 바꾸는 코드가 생겨도 원문과 다른 조각이 저장되지 않게 한다.
  if (range.start < 0 || range.end <= range.start || range.end - range.start > MAX_CHUNK_LENGTH
    || field.text.slice(range.start, range.end) !== text || text.trim() === '') {
    throw new ChunkSourceError('조각 위치가 필드 원문과 맞지 않습니다.');
  }
  return {
    publishedItemId, fieldPath: field.fieldPath, charStart: range.start, charEnd: range.end, pdfPage: field.pdfPage,
    sourceKind: field.sourceKind, text, catchEvidenceUrls: [...catchEvidenceUrls],
  };
}

function selectFields(item: ChunkSourceItem): { fields: ChunkField[]; catchEvidenceUrls: string[] } {
  switch (item.itemKind) {
    case 'CATCH':
      return catchFields(item.snapshot);
    case 'TEXT_MATERIAL':
      return { fields: [textMaterialField(item.snapshot)], catchEvidenceUrls: [] };
    case 'PDF_MATERIAL':
      return { fields: pdfFields(item.snapshot, item.pdfPages), catchEvidenceUrls: [] };
    default:
      throw new ChunkSourceError('알 수 없는 발행 항목 종류입니다.');
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string');
const isStringOrNull = (value: unknown): value is string | null => value === null || typeof value === 'string';

function shapeError(): ChunkSourceError {
  return new ChunkSourceError('발행 사본 모양이 계약 C-07과 다릅니다.');
}

/** CATCH: workFacts[i] → subjectContribution → evidence[i].representedFacts[j] → authorDescription. aiDraft는 고르지 않는다. */
function catchFields(snapshot: unknown): { fields: ChunkField[]; catchEvidenceUrls: string[] } {
  if (!isRecord(snapshot) || !isStringArray(snapshot.workFacts) || typeof snapshot.subjectContribution !== 'string'
    || !Array.isArray(snapshot.evidence) || !isStringOrNull(snapshot.authorDescription)
    || !isStringOrNull(snapshot.aiDraft) || typeof snapshot.mismatch !== 'boolean') {
    throw shapeError();
  }
  const evidence = snapshot.evidence.map((entry: unknown) => {
    if (!isRecord(entry) || typeof entry.sourceUrl !== 'string' || typeof entry.sourceRevision !== 'string'
      || !isStringArray(entry.representedFacts)) {
      throw shapeError();
    }
    return { sourceUrl: entry.sourceUrl, representedFacts: entry.representedFacts };
  });
  const github = (fieldPath: string, text: string): ChunkField => ({ fieldPath, text, sourceKind: 'GITHUB_RECORD', pdfPage: null });
  const fields: ChunkField[] = [
    ...snapshot.workFacts.map((text, i) => github(`workFacts[${i}]`, text)),
    github('subjectContribution', snapshot.subjectContribution),
    ...evidence.flatMap((entry, i) => entry.representedFacts.map((text, j) => github(`evidence[${i}].representedFacts[${j}]`, text))),
  ];
  if (snapshot.authorDescription !== null) {
    fields.push({ fieldPath: 'authorDescription', text: snapshot.authorDescription, sourceKind: 'AUTHOR_MATERIAL', pdfPage: null });
  }
  return { fields, catchEvidenceUrls: evidence.map((entry) => entry.sourceUrl) };
}

function textMaterialField(snapshot: unknown): ChunkField {
  if (!isRecord(snapshot) || typeof snapshot.body !== 'string') throw shapeError();
  return { fieldPath: 'body', text: snapshot.body, sourceKind: 'AUTHOR_MATERIAL', pdfPage: null };
}

/** PDF: 발행본 소유 사본의 읽을 수 있는 쪽만, 쪽 번호 오름차순(BR1.5). */
function pdfFields(snapshot: unknown, pages: ChunkSourcePdfPage[] | null): ChunkField[] {
  if (!isRecord(snapshot) || !Number.isInteger(snapshot.pageCount) || !Array.isArray(pages)) throw shapeError();
  for (const page of pages as unknown[]) {
    if (!isRecord(page) || !Number.isInteger(page.pageNumber) || (page.pageNumber as number) < 1
      || typeof page.text !== 'string' || typeof page.readable !== 'boolean') {
      throw shapeError();
    }
  }
  return [...pages].sort((a, b) => a.pageNumber - b.pageNumber).filter((page) => page.readable)
    .map((page): ChunkField => ({ fieldPath: `pages[${page.pageNumber}]`, text: page.text, sourceKind: 'AUTHOR_MATERIAL', pdfPage: page.pageNumber }));
}

/**
 * 필드 하나를 범위로 나눈다(BR1.3·BR1.4). 1,000 이하면 범위 하나, 넘으면 빈 줄로 나눈 문단 → 줄 → 1,000자 자리 순으로
 * 겹치지 않게 모은다. 각 범위의 앞뒤 공백은 범위에서 빼고 빈 범위는 버린다. 위치는 UTF-16 코드 단위다.
 */
export function splitFieldRanges(text: string, maxLength: number = MAX_CHUNK_LENGTH): Range[] {
  const whole: Range = { start: 0, end: text.length };
  const ranges = text.length <= maxLength
    ? [whole]
    : groupRanges(paragraphRanges(text), maxLength, (paragraph) =>
      groupRanges(lineRanges(text, paragraph), maxLength, (line) => hardSplit(text, line, maxLength)));
  return ranges.map((range) => trimRange(text, range)).filter((range): range is Range => range !== null);
}

/** 앞에서부터 이어 붙인 범위(첫 단위 시작 ~ 마지막 단위 끝)가 maxLength를 넘지 않을 때까지 한 조각에 모은다. */
function groupRanges(units: Range[], maxLength: number, splitOversized: (unit: Range) => Range[]): Range[] {
  const groups: Range[] = [];
  let current: Range | null = null;
  for (const unit of units) {
    if (unit.end - unit.start > maxLength) {
      if (current) groups.push(current);
      current = null;
      groups.push(...splitOversized(unit));
    } else if (current === null) {
      current = { ...unit };
    } else if (unit.end - current.start <= maxLength) {
      current.end = unit.end;
    } else {
      groups.push(current);
      current = { ...unit };
    }
  }
  if (current) groups.push(current);
  return groups;
}

/** 줄 하나(줄바꿈 문자 제외)의 범위들. range 안에서만 센다. */
function lineRanges(text: string, range: Range): Range[] {
  const lines: Range[] = [];
  let start = range.start;
  while (start <= range.end) {
    const newline = text.indexOf('\n', start);
    const end = newline === -1 || newline >= range.end ? range.end : newline;
    lines.push({ start, end });
    start = end + 1;
  }
  return lines;
}

const isBlank = (text: string, range: Range): boolean => text.slice(range.start, range.end).trim() === '';

/** 빈 줄(공백 문자만 있는 줄)을 경계로 나눈 문단. 문단은 첫 줄 시작부터 마지막 줄 끝까지다. */
function paragraphRanges(text: string): Range[] {
  const paragraphs: Range[] = [];
  let current: Range | null = null;
  for (const line of lineRanges(text, { start: 0, end: text.length })) {
    if (isBlank(text, line)) {
      if (current) paragraphs.push(current);
      current = null;
    } else if (current === null) {
      current = { ...line };
    } else {
      current.end = line.end;
    }
  }
  if (current) paragraphs.push(current);
  return paragraphs;
}

/** 줄 하나가 maxLength를 넘으면 그 자리에서 자른다. 대리쌍 가운데면 한 칸 앞에서 자른다. */
function hardSplit(text: string, range: Range, maxLength: number): Range[] {
  const pieces: Range[] = [];
  let start = range.start;
  while (range.end - start > maxLength) {
    let cut = start + maxLength;
    if (isHighSurrogate(text.charCodeAt(cut - 1)) && isLowSurrogate(text.charCodeAt(cut))) cut -= 1;
    pieces.push({ start, end: cut });
    start = cut;
  }
  pieces.push({ start, end: range.end });
  return pieces;
}

const isHighSurrogate = (code: number): boolean => code >= 0xd800 && code <= 0xdbff;
const isLowSurrogate = (code: number): boolean => code >= 0xdc00 && code <= 0xdfff;
const isSpace = (char: string): boolean => /\s/u.test(char);

function trimRange(text: string, range: Range): Range | null {
  let { start, end } = range;
  while (start < end && isSpace(text[start])) start++;
  while (end > start && isSpace(text[end - 1])) end--;
  return start < end ? { start, end } : null;
}

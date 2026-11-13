// 쪽 만들기와 cursor(U6 기능 설계 BR5.3~BR5.5·BR6.5, 비기능 설계 performance-design 「쪽 만들기」·「cursor」, 계약 C-15). DB가 없는 순수 함수다.
// cursor는 위치만 담은 불투명 문자열이고 회원에 묶지 않는다. 회원 조건은 언제나 토큰에서 온다(BR5.2).
// encodeCursor·decodeCursor는 U9 받은 링크 읽기(mcp-shared-page.ts)도 같은 모양으로 쓴다(U9 기능 설계 BR4.4·BR4.5).
import { isUuid } from '../catches/owner-catch-input';
import { MCP_CURSOR_MAX_LENGTH, MCP_PAGE_CHARS, MCP_PAGE_RESERVE, MCP_PAGE_ROWS } from './mcp-limits';

/** 서버가 준 모양이 아닌 cursor. 도구 오류 INVALID_CURSOR로 바뀌고 DB를 읽지 않는다. */
export class InvalidCursorError extends Error {
  override readonly name = 'InvalidCursorError';
}

/** 자료 읽개가 돌려주는 Catch 한 행과 그 근거 주소. draft_content는 읽지 않는다(BR5.3). */
export interface McpCatchRow {
  catchId: string;
  title: string | null;
  visibility: string;
  workFacts: string[];
  subjectContribution: string;
  authorDescription: string | null;
  mismatch: boolean;
  evidenceUrls: string[];
}

/** 자료 읽개가 돌려주는 텍스트 자료 한 행. createdAtText는 cursor에 쓰는 마이크로초 글자다. */
export interface McpTextMaterialRow {
  textMaterialId: string;
  title: string;
  body: string;
  updatedAt: Date;
  createdAtText: string;
}

export interface McpTextPosition {
  createdAt: string;
  id: string;
}

interface PageRules<Row> {
  listName: string;
  toItem(row: Row): object;
  /** 항목 하나가 상한을 넘을 때 글을 뺀 모양(BR6.5). */
  omitBody(row: Row): object;
  cursorOf(row: Row): string;
}

export function encodeCursor(position: object): string {
  return Buffer.from(JSON.stringify({ v: 1, ...position })).toString('base64url');
}

/** 칸이 정확히 keys와 v뿐인 객체만 받는다. 길이·문자·base64url 왕복이 어긋나면 모두 같은 오류다. */
export function decodeCursor(cursor: string, keys: readonly string[]): Record<string, unknown> {
  if (cursor.length === 0 || cursor.length > MCP_CURSOR_MAX_LENGTH || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new InvalidCursorError();
  const bytes = Buffer.from(cursor, 'base64url');
  if (bytes.toString('base64url') !== cursor) throw new InvalidCursorError();
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new InvalidCursorError();
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new InvalidCursorError();
  const record = value as Record<string, unknown>;
  const expected = ['v', ...keys];
  if (Object.keys(record).length !== expected.length || expected.some((key) => !Object.hasOwn(record, key)) || record.v !== 1) throw new InvalidCursorError();
  return record;
}

export function parseCatchCursor(cursor: string): string {
  const { after } = decodeCursor(cursor, ['after']);
  if (typeof after !== 'string' || !isUuid(after)) throw new InvalidCursorError();
  return after;
}

export function parseTextMaterialCursor(cursor: string): McpTextPosition {
  const { createdAt, id } = decodeCursor(cursor, ['createdAt', 'id']);
  if (typeof id !== 'string' || !isUuid(id) || typeof createdAt !== 'string' || !isMicrosecondInstant(createdAt)) throw new InvalidCursorError();
  return { createdAt, id };
}

/** 실제 날짜인지 왕복으로 본다. DB가 날짜 오류를 내 INTERNAL_ERROR가 되는 일이 없게 한다. 0년은 PostgreSQL에 없다. */
function isMicrosecondInstant(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value) || value.startsWith('0000')) return false;
  const seconds = value.slice(0, 19);
  const date = new Date(`${seconds}Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 19) === seconds;
}

/** 직렬화한 항목 길이에 구분 쉼표 하나를 더한 값(BR6.5). */
function sizeOf(item: object): number {
  return JSON.stringify(item).length + 1;
}

/**
 * 쪽의 첫 항목은 언제나 넣어 같은 항목에서 멈추지 않는다. 50행이 모두 들어가면 다음이 있는지 모른 채 nextCursor를 주므로
 * 자료 수가 50의 배수면 마지막 호출이 빈 목록과 null을 돌려준다(performance-design).
 */
function buildPage<Row>(rows: readonly Row[], rules: PageRules<Row>): Record<string, unknown> {
  let used = MCP_PAGE_RESERVE;
  const items: object[] = [];
  for (const row of rows) {
    let item = rules.toItem(row);
    if (sizeOf(item) + MCP_PAGE_RESERVE > MCP_PAGE_CHARS) item = rules.omitBody(row);
    if (items.length > 0 && used + sizeOf(item) > MCP_PAGE_CHARS) break;
    items.push(item);
    used += sizeOf(item);
  }
  const more = items.length < rows.length || rows.length === MCP_PAGE_ROWS;
  return { [rules.listName]: items, nextCursor: more ? rules.cursorOf(rows[items.length - 1]) : null };
}

const CATCH_RULES: PageRules<McpCatchRow> = {
  listName: 'catches',
  toItem: ({ catchId, title, visibility, workFacts, subjectContribution, authorDescription, evidenceUrls, mismatch }) => (
    { catchId, title, visibility, workFacts, subjectContribution, authorDescription, evidenceUrls, mismatch }
  ),
  omitBody: ({ catchId, title, visibility, evidenceUrls, mismatch }) => (
    { catchId, title, visibility, workFacts: [], subjectContribution: '', authorDescription: null, evidenceUrls, mismatch, omitted: true }
  ),
  cursorOf: ({ catchId }) => encodeCursor({ after: catchId }),
};

const TEXT_MATERIAL_RULES: PageRules<McpTextMaterialRow> = {
  listName: 'materials',
  toItem: ({ textMaterialId, title, body, updatedAt }) => ({ textMaterialId, title, body, updatedAt: updatedAt.toISOString() }),
  omitBody: ({ textMaterialId, title, updatedAt }) => ({ textMaterialId, title, body: '', updatedAt: updatedAt.toISOString(), bodyOmitted: true }),
  cursorOf: ({ createdAtText, textMaterialId }) => encodeCursor({ createdAt: createdAtText, id: textMaterialId }),
};

export function buildCatchPage(rows: readonly McpCatchRow[]): Record<string, unknown> {
  return buildPage(rows, CATCH_RULES);
}

export function buildTextMaterialPage(rows: readonly McpTextMaterialRow[]): Record<string, unknown> {
  return buildPage(rows, TEXT_MATERIAL_RULES);
}

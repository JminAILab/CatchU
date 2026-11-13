// PDF 업로드 입력 검사와 목록 쿼리(U8 기능 설계 BR1.1·BR1.2, 보안 설계 §4, 성능 설계 「업로드 처리 순서」, NFR1.6·NFR4.1).
// multipart 해석은 multer 2.5.0 메모리 저장으로 한다: 선언 종류(fileFilter, 스트림을 받기 전) → 파일 스트림의 누적 바이트가 20 MB를
// 넘는 즉시 저장을 멈추고 거부(limits.fileSize; 요청 헤더·multipart 메타의 선언 크기는 믿지 않음) → 머리 바이트 `%PDF-` → 제목.
// 오류 응답에는 파일 이름·제목 값을 넣지 않는다. 호출자는 동의 확인(C-04) 뒤에만 이 함수를 불러 본문을 읽는다(BR1.3).
// multer 타입 선언(multer.d.ts)을 이 파일이 직접 가리킨다. 빌드(tsc)는 tsconfig의 include로 선언 파일을 읽지만,
// 개발 소스 실행(ts-node)은 실제로 불러온 파일만 컴파일해 선언 파일을 빠뜨리고 TS7016으로 기동하지 못한다(#521).
// 전역 선언 파일(declare module)은 import로 가리킬 수 없어 이 한 줄만 참조 지시문 규칙의 예외로 둔다.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./multer.d.ts" />
import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import multer from 'multer';
import { ApiError } from '../common/errors';
import { isUuid } from './text-material-input';

/** PDF 자료 상한(U8 기능 설계 Q1, BR1.2). 제목은 유니코드 코드 포인트로 센다. 쪽 50은 worker가 판정한다. */
export const PDF_MATERIAL_LIMITS = Object.freeze({ title: 100, fileSizeBytes: 20 * 1024 * 1024, perMember: 20 });
export const PDF_MATERIAL_PAGE = Object.freeze({ defaultLimit: 20, maxLimit: 100 });

const FILE_FIELD = 'file';
const TITLE_FIELD = 'title';
/** 제목 필드의 바이트 상한. 100 코드 포인트는 UTF-8로 400바이트 이하라 넘으면 maxLength다. */
const TITLE_FIELD_BYTES = 1024;
const PDF_HEAD = Buffer.from('%PDF-', 'latin1');
const LONE_SURROGATE = /[\uD800-\uDFFF]/u;
// PostgreSQL이 돌려준 마이크로초 UTC 시각(텍스트 자료 커서와 같은 규칙).
const CURSOR_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

export interface PdfUploadInput {
  title: string;
  buffer: Buffer;
  fileSizeBytes: number;
}

export interface PdfMaterialQuery {
  limit: number;
  after?: { createdAt: string; pdfMaterialId: string };
}

type Violation = { field: string; reason: string };

/** 선언 종류가 application/pdf가 아닌 파일. 스트림을 받기 전에 끊는다. */
class DeclaredTypeNotPdf extends Error {
  override readonly name = 'DeclaredTypeNotPdf';
}

function failed(violations: Violation[]): ApiError {
  return new ApiError('VALIDATION_FAILED', { details: { violations } });
}

const parser = multer({
  storage: multer.memoryStorage(),
  defParamCharset: 'utf8',
  limits: { files: 1, fields: 1, fileSize: PDF_MATERIAL_LIMITS.fileSizeBytes, fieldSize: TITLE_FIELD_BYTES, fieldNameSize: 32 },
  // 받을 파일은 (null, true)로 명시해야 한다. (null)만 주면 multer가 파일을 조용히 건너뛴다.
  fileFilter: (_request, file, callback) => (file.mimetype === 'application/pdf' ? callback(null, true) : callback(new DeclaredTypeNotPdf())),
}).single(FILE_FIELD);

type ParsedRequest = IncomingMessage & { file?: multer.File; body?: Record<string, unknown> };

function isMultipart(contentType: string | undefined): boolean {
  return typeof contentType === 'string' && /^multipart\/form-data(\s*;.*)?$/i.test(contentType);
}

/** multer 오류를 명세 위반으로 옮긴다. multer 밖의 해석 오류(잘못된 multipart)는 400 INVALID_REQUEST다. */
function translate(error: unknown): ApiError {
  if (error instanceof DeclaredTypeNotPdf) return failed([{ field: FILE_FIELD, reason: 'isPdf' }]);
  if (error instanceof multer.MulterError) {
    switch (error.code) {
      case 'LIMIT_FILE_SIZE': return failed([{ field: FILE_FIELD, reason: 'maxSize' }]);
      case 'LIMIT_FILE_COUNT':
      case 'LIMIT_UNEXPECTED_FILE': return failed([{ field: FILE_FIELD, reason: 'singleFile' }]);
      case 'LIMIT_FIELD_VALUE': return failed([{ field: TITLE_FIELD, reason: 'maxLength' }]);
      default: return failed([{ field: 'body', reason: 'whitelistValidation' }]);
    }
  }
  return new ApiError('INVALID_REQUEST');
}

function parseMultipart(request: IncomingMessage, response: ServerResponse): Promise<void> {
  return new Promise((resolve, reject) => {
    parser(request, response, (error) => (error === undefined || error === null ? resolve() : reject(translate(error))));
  });
}

/** 제목 검사(텍스트 자료 제목과 같은 규칙): 앞뒤 공백을 지운 값으로 1~100 코드 포인트, NUL·깨진 서로게이트 없음. */
function checkTitle(value: unknown, violations: Violation[]): string | null {
  if (typeof value !== 'string') {
    violations.push({ field: TITLE_FIELD, reason: 'isString' });
    return null;
  }
  if (value.includes('\u0000')) violations.push({ field: TITLE_FIELD, reason: 'noNul' });
  if (LONE_SURROGATE.test(value)) violations.push({ field: TITLE_FIELD, reason: 'isWellFormed' });
  const trimmed = value.trim();
  if (trimmed.length === 0) violations.push({ field: TITLE_FIELD, reason: 'isNotEmpty' });
  if (Array.from(trimmed).length > PDF_MATERIAL_LIMITS.title) violations.push({ field: TITLE_FIELD, reason: 'maxLength' });
  return trimmed;
}

/** 제목이 없으면 파일 이름에서 경로 마디와 마지막 확장자를 뺀 값이다(entities.md title, Q1). */
function titleFromFileName(originalname: string): string {
  const base = originalname.slice(Math.max(originalname.lastIndexOf('/'), originalname.lastIndexOf('\\')) + 1);
  return base.replace(/\.[^.]*$/, '');
}

/**
 * `POST /v1/pdf-materials`의 multipart 본문을 읽고 검사한다(BR1.1·BR1.2). 파일 하나(`file`)와 선택 필드 `title`만 받고
 * 정의 밖 필드는 거부한다. 실패하면 400 VALIDATION_FAILED이며 저장소는 부르지 않는다(호출자 순서).
 */
export async function readPdfUpload(request: IncomingMessage, response: ServerResponse): Promise<PdfUploadInput> {
  if (!isMultipart(request.headers['content-type'])) throw failed([{ field: 'body', reason: 'isMultipart' }]);
  await parseMultipart(request, response);
  const { file, body } = request as ParsedRequest;
  const fields = body ?? {};
  const violations: Violation[] = [];
  if (Object.keys(fields).some((key) => key !== TITLE_FIELD)) violations.push({ field: 'body', reason: 'whitelistValidation' });
  if (file === undefined) violations.push({ field: FILE_FIELD, reason: 'isRequired' });
  else if (file.size < PDF_HEAD.length || !file.buffer.subarray(0, PDF_HEAD.length).equals(PDF_HEAD)) {
    violations.push({ field: FILE_FIELD, reason: 'isPdf' });
  }
  let title: string | null = null;
  if (fields[TITLE_FIELD] !== undefined) title = checkTitle(fields[TITLE_FIELD], violations);
  else if (file !== undefined) title = checkTitle(titleFromFileName(file.originalname), violations);
  if (violations.length > 0 || file === undefined || title === null) throw failed(violations);
  return { title, buffer: file.buffer, fileSizeBytes: file.size };
}

function cursorScope(memberId: string): string {
  return createHash('sha256').update(JSON.stringify(['pdf-material', memberId])).digest('hex');
}

/** 커서는 조회 위치일 뿐 권한 증명이 아니다. DB 조회는 매번 인증 회원으로 제한한다(텍스트 자료 목록과 같은 기준). */
export function nextPdfMaterialCursor(memberId: string, createdAt: string, pdfMaterialId: string): string {
  return Buffer.from(JSON.stringify({ v: 1, scope: cursorScope(memberId), at: createdAt, after: pdfMaterialId })).toString('base64url');
}

function readCursor(memberId: string, value: unknown): PdfMaterialQuery['after'] {
  const invalid = failed([{ field: 'cursor', reason: 'isValid' }]);
  if (typeof value !== 'string' || value.length === 0 || value.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(value)) throw invalid;
  let cursor: unknown;
  try {
    const bytes = Buffer.from(value, 'base64url');
    if (bytes.toString('base64url') !== value) throw invalid;
    cursor = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw invalid;
  }
  if (cursor === null || typeof cursor !== 'object' || Array.isArray(cursor)) throw invalid;
  const fields = cursor as Record<string, unknown>;
  if (Object.keys(fields).some((key) => !['v', 'scope', 'at', 'after'].includes(key))
    || fields.v !== 1 || fields.scope !== cursorScope(memberId)
    || typeof fields.at !== 'string' || !CURSOR_TIME.test(fields.at)
    || typeof fields.after !== 'string' || !isUuid(fields.after)) throw invalid;
  return { createdAt: fields.at, pdfMaterialId: fields.after.toLowerCase() };
}

/** 목록 쿼리 `cursor`·`limit`(텍스트 자료 목록과 같은 방식). 순서는 올린 시각 최신순, 같은 시각은 ID 역순이다. */
export function pdfMaterialQuery(memberId: string, raw: unknown): PdfMaterialQuery {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw failed([{ field: 'query', reason: 'isObject' }]);
  const input = raw as Record<string, unknown>;
  if (Object.keys(input).some((key) => key !== 'cursor' && key !== 'limit')) {
    throw failed([{ field: 'query', reason: 'whitelistValidation' }]);
  }
  const query: PdfMaterialQuery = { limit: PDF_MATERIAL_PAGE.defaultLimit };
  if (input.limit !== undefined) {
    if (typeof input.limit !== 'string' || !/^[1-9]\d{0,2}$/.test(input.limit)
      || Number(input.limit) > PDF_MATERIAL_PAGE.maxLimit) throw failed([{ field: 'limit', reason: 'isValid' }]);
    query.limit = Number(input.limit);
  }
  if (input.cursor !== undefined) query.after = readCursor(memberId, input.cursor);
  return query;
}

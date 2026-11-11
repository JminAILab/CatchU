// PDF 글 추출 큐 규격(계약 C-16 + U8 기능 명세 W2의 더하는 변경, 업무 규칙 BR2.4·BR3.7, 비기능 NFR4.14·NFR4.15).
// worker(worker/app/pdf_extraction, 계획 Step 7)가 같은 값을 전제하므로 한쪽만 바꾸지 않는다.
// 10월 분석 큐 규칙(analysis-queue/queue-spec.ts)·AiRun 규격(ai-run/ai-run-spec.ts)과 같은 방식으로 값을 이 파일 한곳에 둔다.
import { materialKey } from '../file-storage/file-storage';
import { PDF_EXTRACTION_FAILURE_CODES, PDF_PAGE_LIMIT, type PdfExtractionFailureCode } from '../materials/pdf-material.entity';

/** api → worker 요청 큐. 분석 소비자의 `analysis-requests`와 다른 큐이며 worker는 별도 Worker 인스턴스로 소비한다(BR3.7). */
export const PDF_EXTRACTION_REQUEST_QUEUE = 'pdf-extraction-requests';
/** 요청 작업 이름. 작업 ID = pdfMaterialId, 시도 1회, 재시도 없음(BR2.4). */
export const PDF_EXTRACT_JOB_NAME = 'PdfExtract';
/** worker → api 결과. 10월 `worker-messages` 큐에 더하는 작업 이름이며 봉투 messageId는 `message-pdf-{pdfMaterialId}-result`다(Step 6 수신). */
export const PDF_EXTRACTION_RESULT_JOB_NAME = 'PdfExtractionResult';
/** 봉투 판본. 10월 worker 결과 메시지의 봉투(`schemaVersion: "2"`)와 같은 값이다(기능 명세 W2). */
export const PDF_EXTRACT_SCHEMA_VERSION = '2';
/** 추출 처리 시한(분). 업로드 커밋 시각 + 이 값이 `extraction_deadline_at`이며 큐 대기를 포함한다(BR2.2, Q2). */
export const PDF_EXTRACTION_DEADLINE_MINUTES = 10;
/**
 * 완료·실패 작업 보관(초). 보관 동안 같은 pdfMaterialId 등록은 BullMQ가 무시한다. 시한 10분보다 길어야 하며
 * 10월 요청 큐·AiRun과 같은 2시간으로 둔다.
 */
export const PDF_EXTRACT_JOB_RETENTION_SECONDS = 2 * 60 * 60;
/** 큐에 넣기 명령 하나를 기다리는 상한. 넘으면 ENQUEUE_FAILED로 본다(10월 큐 명령 상한과 같은 값). */
export const PDF_EXTRACT_ENQUEUE_TIMEOUT_MS = 5_000;
/** 앱 종료 때 큐·연결 닫기를 기다리는 상한. 넘으면 끊는다. */
export const PDF_EXTRACT_CLOSE_TIMEOUT_MS = 5_000;

/** `PdfExtract` 봉투(C-16 payload + U8 더하는 변경 `schemaVersion`·`messageId`). storageKey는 materialKey(memberId, pdfMaterialId)다. */
export interface PdfExtractMessage {
  schemaVersion: typeof PDF_EXTRACT_SCHEMA_VERSION;
  messageId: string;
  pdfMaterialId: string;
  memberId: string;
  storageKey: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MESSAGE_KEYS = ['schemaVersion', 'messageId', 'pdfMaterialId', 'memberId', 'storageKey'] as const;

/** 요청 메시지 ID 규칙. 결과 메시지(`message-pdf-{id}-result`)와 구분되는 고정 접두어다. */
export const pdfExtractMessageId = (pdfMaterialId: string): string => `pdf-extract-${pdfMaterialId}`;

/** 봉투를 만든다. ID는 소문자 UUID여야 하며 키는 C-05 도우미로만 만든다(NFR1.7). */
export function pdfExtractMessage(pdfMaterialId: string, memberId: string): PdfExtractMessage {
  return {
    schemaVersion: PDF_EXTRACT_SCHEMA_VERSION,
    messageId: pdfExtractMessageId(pdfMaterialId),
    pdfMaterialId,
    memberId,
    storageKey: materialKey(memberId, pdfMaterialId),
  };
}

/** 작업 하나 = 시도 한 번. BullMQ에 넘긴 객체를 다시 쓰지 않게 부를 때마다 만든다. */
export function pdfExtractJobOptions(pdfMaterialId: string) {
  return {
    jobId: pdfMaterialId,
    attempts: 1,
    removeOnComplete: { age: PDF_EXTRACT_JOB_RETENTION_SECONDS },
    removeOnFail: { age: PDF_EXTRACT_JOB_RETENTION_SECONDS },
    stackTraceLimit: 0,
  };
}

/** 봉투 모양 검사: 다섯 필드만, 소문자 UUID, messageId·storageKey가 ID에서 나온 값과 같다. worker도 같은 규칙으로 검사한다(BR3.6). */
export function isValidPdfExtractMessage(value: unknown): value is PdfExtractMessage {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const fields = value as Record<string, unknown>;
  const keys = Object.keys(fields);
  if (keys.length !== MESSAGE_KEYS.length || !MESSAGE_KEYS.every((key) => keys.includes(key))) return false;
  const { schemaVersion, messageId, pdfMaterialId, memberId, storageKey } = fields;
  if (schemaVersion !== PDF_EXTRACT_SCHEMA_VERSION) return false;
  if (typeof pdfMaterialId !== 'string' || !UUID.test(pdfMaterialId)) return false;
  if (typeof memberId !== 'string' || !UUID.test(memberId)) return false;
  return messageId === pdfExtractMessageId(pdfMaterialId) && storageKey === materialKey(memberId, pdfMaterialId);
}

// ---- 결과 수신(Step 6, 기능 명세 W2 `PdfExtractionResult`·`Receipt`, 업무 규칙 BR3.3·BR3.4) ----

/**
 * worker가 보내는 실패 사유. 엔티티 상수(정본)에서 시한 판정이 넣는 DEADLINE_EXCEEDED만 뺀 것이다
 * (entities.md: "DEADLINE_EXCEEDED는 worker 결과가 아니라 시한 판정이 넣는다"). worker가 보내면 SCHEMA_INVALID다.
 */
export const PDF_WORKER_FAILURE_CODES: readonly PdfWorkerFailureCode[] =
  PDF_EXTRACTION_FAILURE_CODES.filter((code): code is PdfWorkerFailureCode => code !== 'DEADLINE_EXCEEDED');
export type PdfWorkerFailureCode = Exclude<PdfExtractionFailureCode, 'DEADLINE_EXCEEDED'>;

/** 쪽 하나. `readable === (text !== '')`는 DB CHECK(pdf_page_text)와 같은 규칙이다. 글은 신뢰하지 않는 입력이다(BR3.5). */
export interface PdfExtractionPage {
  pageNumber: number;
  readable: boolean;
  text: string;
}

/**
 * worker → api 결과 메시지(`worker-messages` 큐, 작업 이름 `PdfExtractionResult`, 작업 ID = messageId).
 * SUCCEEDED면 `pages`(1~50개, 1부터 연속)만, FAILED면 `failureCode`만 있다. 쓰지 않는 쪽은 없거나 null이다(기능 명세 W2의 `| null`).
 */
export interface PdfExtractionResult {
  schemaVersion: typeof PDF_EXTRACT_SCHEMA_VERSION;
  messageId: string;
  pdfMaterialId: string;
  memberId: string;
  outcome: 'SUCCEEDED' | 'FAILED';
  pages?: PdfExtractionPage[] | null;
  failureCode?: PdfWorkerFailureCode | null;
}

export type PdfExtractionRejectionCode = 'CONTEXT_MISMATCH' | 'STALE_ATTEMPT' | 'SCHEMA_INVALID';
/** api → worker 수신 확인(10월 ResultReceipt 모양에 맞춤). ACCEPTED/OK는 커밋 뒤에만 만든다(BR3.4). */
export type PdfExtractionReceipt = { schemaVersion: typeof PDF_EXTRACT_SCHEMA_VERSION; messageId: string; pdfMaterialId: string } & (
  { disposition: 'ACCEPTED'; code: 'OK' } |
  { disposition: 'DUPLICATE'; code: 'ALREADY_RECEIVED' } |
  { disposition: 'REJECTED'; code: PdfExtractionRejectionCode }
);

const RESULT_KEYS = ['schemaVersion', 'messageId', 'pdfMaterialId', 'memberId', 'outcome', 'pages', 'failureCode'] as const;
const PAGE_KEYS = ['pageNumber', 'readable', 'text'] as const;
const RESULT_MESSAGE_ID = /^message-pdf-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-result$/;

/** 결과 메시지 ID 규칙(10월 `message-{종류}-{id}-result`와 같은 모양). */
export const pdfExtractionResultMessageId = (pdfMaterialId: string): string => `message-pdf-${pdfMaterialId}-result`;

/** 기록에 남겨도 되는 결과 메시지 ID인지(밖에서 온 값이라 모양이 맞을 때만 그대로 남긴다). */
export const isPdfExtractionResultMessageId = (value: unknown): value is string => typeof value === 'string' && RESULT_MESSAGE_ID.test(value);

function isAbsent(value: unknown): boolean {
  return value === undefined || value === null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(fields: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(fields).every((key) => allowed.includes(key));
}

/** 쪽 배열 검사: 1~50개, 각 쪽은 세 필드만, pageNumber는 1부터 연속·중복 없음, text는 NUL 없는 문자열, readable === (text !== ''). */
function isValidPages(value: unknown): value is PdfExtractionPage[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > PDF_PAGE_LIMIT) return false;
  const shapeOk = value.every((page, index) => {
    if (!isPlainObject(page) || !hasOnlyKeys(page, PAGE_KEYS) || !PAGE_KEYS.every((key) => key in page)) return false;
    const { pageNumber, readable, text } = page;
    if (!Number.isInteger(pageNumber) || pageNumber !== index + 1) return false;
    if (typeof readable !== 'boolean' || typeof text !== 'string' || text.includes('\u0000')) return false;
    return readable === (text !== '');
  });
  return shapeOk && pagesWithinTextLimit(value as PdfExtractionPage[]);
}

/**
 * 쪽 글 합계 상한(BR4.5 「수신 검사(BR3.3)에 같은 상한」, 팀장 결정 2026-11-10 #420 issuecomment-6759834176).
 * 발행본 전체 글과 같은 값·같은 셈(코드 포인트, `String.length`의 UTF-16 단위가 아님)이다. 같은 값 — 한쪽만 바꾸지 않는다:
 * api `src/publications/publications-config.ts`의 SNAPSHOT_TEXT_TOTAL_MAX, worker `app/pdf_extraction/settings.py`의 TEXT_LIMIT,
 * web `src/features/publications/publications-api.ts`의 PUBLISH_LIMITS.totalText. materials·pdf-extraction은 publications를 import하지
 * 않는 의존 방향이라 값을 따로 두고, 발행 시험(`test/publications/publish-pdf.test.cjs`)이 api 두 값이 같은지 확인한다.
 */
export const PDF_TEXT_TOTAL_MAX = 60_000;

/** 쪽 글 코드 포인트 합이 상한 이하인가. 넘는 순간 멈춘다(큰 입력을 끝까지 세지 않음). */
function pagesWithinTextLimit(pages: readonly PdfExtractionPage[]): boolean {
  let total = 0;
  for (const { text } of pages) {
    // 보충 평면 문자(이모지 등)는 UTF-16 2단위를 1자로 센다. 짝 없는 대리 단위는 1자다([...text].length와 같은 셈).
    for (let index = 0; index < text.length; index += (text.codePointAt(index) ?? 0) > 0xffff ? 2 : 1) {
      total += 1;
      if (total > PDF_TEXT_TOTAL_MAX) return false;
    }
  }
  return true;
}

/**
 * 결과 메시지 모양 검사(BR3.3, 보안 설계 §4). 계약 YAML을 고치지 않고 코드로 검사한다(C-16 더하는 변경은 별도 계약 PR).
 * 정의 밖 필드 거부, schemaVersion "2", 소문자 UUID 두 개, messageId 규칙, outcome 두 값, SUCCEEDED ⇒ pages만, FAILED ⇒ failureCode만.
 */
export function isValidPdfExtractionResult(value: unknown): value is PdfExtractionResult {
  if (!isPlainObject(value) || !hasOnlyKeys(value, RESULT_KEYS)) return false;
  const { schemaVersion, messageId, pdfMaterialId, memberId, outcome, pages, failureCode } = value;
  if (schemaVersion !== PDF_EXTRACT_SCHEMA_VERSION) return false;
  if (typeof pdfMaterialId !== 'string' || !UUID.test(pdfMaterialId)) return false;
  if (typeof memberId !== 'string' || !UUID.test(memberId)) return false;
  if (messageId !== pdfExtractionResultMessageId(pdfMaterialId)) return false;
  if (outcome === 'SUCCEEDED') return isAbsent(failureCode) && isValidPages(pages);
  if (outcome === 'FAILED') {
    return isAbsent(pages) && typeof failureCode === 'string' && (PDF_WORKER_FAILURE_CODES as readonly string[]).includes(failureCode);
  }
  return false;
}

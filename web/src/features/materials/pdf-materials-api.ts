import type { AccessTokenStore } from "../../lib/access-token.ts";
import { API_VERSION_PATH, normalizeApiBaseUrl, type ApiClient, type ClientResult } from "../../lib/api-client.ts";
import { memberCallBlock } from "../../lib/auth-api.ts";
import { readApiResponse } from "../../lib/api-response.ts";
import type { AuthSession } from "../../lib/auth-session.ts";
import type { AuthStore } from "../../lib/auth-state.ts";
import { codePointLength, saveFailureOf, type SaveFailure } from "../../lib/save-outcome.ts";
import { SENSITIVE_INFO_NOTICE } from "./materials-api.ts";

/**
 * PDF 자료 API 경계(U8 기능 명세 W1, 화면 컴포넌트 「API 연결 지점」, 계획 10.1).
 *
 * - 목록·상세·삭제는 공통 `api.member`(JSON)를 쓴다.
 * - 업로드(multipart)와 PDF 본문(바이너리)은 공통 클라이언트가 다루지 않아, 같은 기준 주소 규칙(`normalizeApiBaseUrl`·`/v1`,
 *   `credentials: "omit"`, `cache: "no-store"`)으로 직접 `fetch`한다(`features/rag-answer`의 SSE와 같은 방식). 회원 요청의 토큰과
 *   회원 인증 401(`AUTH_REQUIRED`·`AUTH_INVALID`) 처리는 `api.member`와 같은 쪽을 따른다(`PdfMemberAuth`). 공통 인증을 켠 빌드는
 *   공통 인증 상태의 실제 토큰을 붙이고 401이면 세션 갱신을 한 번 요청해 조회(GET)만 다시 보낸다(`sessionPdfAuth`). 끈 빌드는
 *   메모리 토큰을 붙이고 401이면 그 토큰을 지운다(`legacyPdfAuth`). 공통 인증을 켜면 메모리 토큰 저장소에는 실제 토큰이 아니라
 *   회원 화면 범위 표시값이 들어가므로(`auth-scope.ts`), 그 값을 `Authorization`에 싣지 않는다.
 * - 받은 사람 요청에는 회원 토큰을 붙이지 않고, grant는 `X-Link-Grant` 머리로만 싣는다(BR6.3). 토큰·grant를 URL 쿼리에 넣지 않는다.
 */

/** PDF 자료 상한(api `PDF_MATERIAL_LIMITS`, BR1.2). 제목은 앞뒤 공백을 지운 뒤 코드 포인트로 센다. 쪽 50은 worker가 판정한다. */
export const PDF_LIMITS = Object.freeze({ title: 100, fileSizeBytes: 20 * 1024 * 1024, perMember: 20 });

/** 올리는 화면에 늘 보이는 민감 정보 안내. 텍스트 자료와 같은 문구다(BR1.5). */
export const PDF_SENSITIVE_INFO_NOTICE = SENSITIVE_INFO_NOTICE;

export type PdfExtractionState = "PENDING" | "DONE" | "FAILED";
export type PdfFailureCode = "ENCRYPTED" | "UNREADABLE_FILE" | "PAGE_LIMIT_EXCEEDED" | "TEXT_LIMIT_EXCEEDED" | "DEADLINE_EXCEEDED";
export type PdfMaterialItem = {
  pdfMaterialId: string; title: string; fileSizeBytes: number; pageCount: number | null;
  extractionState: PdfExtractionState; failureCode: PdfFailureCode | null;
};
export type PdfMaterialPage = { items: PdfMaterialItem[]; page: { nextCursor: string | null } };
/** 상세: 목록 항목 + 쪽 목록(쪽 번호·읽을 수 있음만, 글 본문 없음). */
export type PdfMaterialDetail = PdfMaterialItem & { pages: { pageNumber: number; readable: boolean }[] };

export type PdfResult<T> = { kind: "ok"; value: T } | { kind: "failed"; failure: SaveFailure };

const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const STATES: readonly string[] = ["PENDING", "DONE", "FAILED"];
const FAILURE_CODES: readonly string[] = ["ENCRYPTED", "UNREADABLE_FILE", "PAGE_LIMIT_EXCEEDED", "TEXT_LIMIT_EXCEEDED", "DEADLINE_EXCEEDED"];

/** 업로드 201 응답. 쪽 수·실패 사유 칸이 아직 없다(늘 PENDING). */
function isCreated(value: unknown): value is Pick<PdfMaterialItem, "pdfMaterialId" | "title" | "fileSizeBytes" | "extractionState"> {
  return record(value) && text(value.pdfMaterialId) && text(value.title) && Number.isInteger(value.fileSizeBytes)
    && typeof value.extractionState === "string" && STATES.includes(value.extractionState);
}

export function isPdfMaterialItem(value: unknown): value is PdfMaterialItem {
  return isCreated(value) && (value as Record<string, unknown>).pageCount !== undefined
    && ((value as Record<string, unknown>).pageCount === null || Number.isInteger((value as Record<string, unknown>).pageCount))
    && ((value as Record<string, unknown>).failureCode === null
      || (typeof (value as Record<string, unknown>).failureCode === "string"
        && FAILURE_CODES.includes((value as Record<string, unknown>).failureCode as string)));
}

export function isPdfMaterialPage(value: unknown): value is PdfMaterialPage {
  return record(value) && Array.isArray(value.items) && value.items.every(isPdfMaterialItem)
    && record(value.page) && (value.page.nextCursor === null || text(value.page.nextCursor));
}

export function isPdfMaterialDetail(value: unknown): value is PdfMaterialDetail {
  return isPdfMaterialItem(value) && Array.isArray((value as Record<string, unknown>).pages)
    && ((value as Record<string, unknown>).pages as unknown[]).every((page) =>
      record(page) && Number.isInteger(page.pageNumber) && typeof page.readable === "boolean");
}

/** 목록 필드만 골라 담는다(계약 밖 칸이 섞여 와도 싣지 않는다). */
function pickItem(item: PdfMaterialItem): PdfMaterialItem {
  const { pdfMaterialId, title, fileSizeBytes, pageCount, extractionState, failureCode } = item;
  return { pdfMaterialId, title, fileSizeBytes, pageCount, extractionState, failureCode };
}

/** 추출 실패 사유별 안내(BR2.3, #420 팀장 결정 2026-11-10). 재시도는 다시 올리는 것뿐이다. */
export const PDF_FAILURE_TEXT: Readonly<Record<PdfFailureCode, string>> = Object.freeze({
  ENCRYPTED: "비밀번호가 걸린 PDF는 풀어서 올려 주세요",
  PAGE_LIMIT_EXCEEDED: "50쪽까지 올릴 수 있습니다",
  TEXT_LIMIT_EXCEEDED: "글이 너무 많은 PDF입니다. 필요한 쪽만 남긴 PDF로 다시 올려 주세요.",
  UNREADABLE_FILE: "이 PDF를 처리하지 못했습니다. 다시 저장하거나 필요한 쪽만 남긴 PDF로 올려 주세요.",
  DEADLINE_EXCEEDED: "시간 안에 처리하지 못했습니다. 다시 올려 주세요.",
});

export type ExtractionBadge = { tone: "pending" | "done" | "failed"; label: string; detail: string | null };

/** 목록 배지(NFR7.1): 글 추출 중 / 완료 n쪽 / 실패 + 사유별 안내. 사유 코드가 없는 실패는 다시 올리라고만 안내한다. */
export function extractionBadge(item: Pick<PdfMaterialItem, "extractionState" | "failureCode" | "pageCount">): ExtractionBadge {
  if (item.extractionState === "PENDING") return { tone: "pending", label: "글 추출 중", detail: "새로고침하면 상태가 바뀝니다." };
  if (item.extractionState === "DONE") {
    return { tone: "done", label: item.pageCount === null ? "완료" : `완료 ${item.pageCount}쪽`, detail: null };
  }
  return { tone: "failed", label: "실패", detail: item.failureCode === null ? "글을 뽑지 못했습니다. 다시 올려 주세요." : PDF_FAILURE_TEXT[item.failureCode] };
}

/** 화면에서 고른 파일. 브라우저 `File`의 필요한 칸만 본다(시험은 같은 모양의 객체를 넘긴다). */
export type ChosenFile = { name: string; type: string; size: number };

const PDF_NAME = /\.pdf$/i;
const megabytes = (bytes: number) => Math.round(bytes / (1024 * 1024));

/** 제목을 비우면 파일 이름(확장자 제외)을 쓴다(화면 컴포넌트 「폼 검증 규칙」). */
export function uploadTitle(title: string, fileName: string): string {
  const trimmed = title.trim();
  return trimmed.length > 0 ? trimmed : fileName.replace(PDF_NAME, "").trim();
}

/**
 * 보내기 전 검사(BR1.1·BR1.2, NFR4.1). 문제가 없으면 빈 배열. 서버 검증이 기준이고 화면 검사는 요청을 보내기 전에 미리 알려 주는 것이다.
 * 파일은 정확히 1개, 종류는 `application/pdf`(브라우저가 종류를 비워 주면 `.pdf` 이름), 20 MB 이하, 제목은 1~100자.
 */
export function pdfUploadErrors(files: readonly ChosenFile[], title: string): string[] {
  if (files.length === 0) return ["올릴 PDF 파일을 골라 주세요."];
  if (files.length > 1) return ["PDF 파일은 한 번에 하나만 올릴 수 있습니다."];
  const [file] = files;
  const errors: string[] = [];
  const pdf = file.type === "application/pdf" || (file.type === "" && PDF_NAME.test(file.name));
  if (!pdf) errors.push("PDF 파일만 올릴 수 있습니다.");
  if (file.size <= 0) errors.push("빈 파일은 올릴 수 없습니다.");
  else if (file.size > PDF_LIMITS.fileSizeBytes) errors.push(`${megabytes(PDF_LIMITS.fileSizeBytes)} MB 이하의 PDF만 올릴 수 있습니다.`);
  const finalTitle = uploadTitle(title, file.name);
  if (finalTitle.length === 0) errors.push("제목을 입력해 주세요.");
  else if (codePointLength(finalTitle) > PDF_LIMITS.title) errors.push(`제목은 ${PDF_LIMITS.title}자까지 쓸 수 있습니다.`);
  return errors;
}

export const PDF_COUNT_LIMIT_TEXT = `PDF 자료는 ${PDF_LIMITS.perMember}벌까지 둘 수 있습니다. 쓰지 않는 PDF를 지운 뒤 올려 주세요.`;
export const PDF_UPLOAD_FAILED_TEXT = "올리지 못했습니다";

/** 서버 400의 첫 위반을 안내 문장으로 바꾼다(입력값·서버 문구를 그대로 싣지 않는다). */
function violationText(field: string, reason: string): string {
  if (field === "materials" && reason === "maxCount") return PDF_COUNT_LIMIT_TEXT;
  if (field === "file") {
    if (reason === "isPdf") return "PDF 파일만 올릴 수 있습니다.";
    if (reason === "maxSize") return `${megabytes(PDF_LIMITS.fileSizeBytes)} MB 이하의 PDF만 올릴 수 있습니다.`;
    if (reason === "singleFile") return "PDF 파일은 한 번에 하나만 올릴 수 있습니다.";
    if (reason === "isRequired") return "올릴 PDF 파일을 골라 주세요.";
  }
  if (field === "title") {
    if (reason === "maxLength") return `제목은 ${PDF_LIMITS.title}자까지 쓸 수 있습니다.`;
    if (reason === "isNotEmpty") return "제목을 입력해 주세요.";
    return "제목에 쓸 수 없는 문자가 있습니다.";
  }
  return "파일이나 제목을 확인해 주세요.";
}

export type PdfUploadOutcome =
  | { kind: "ok"; value: PdfMaterialItem }
  | { kind: "failed"; lines: string[] };

/** 업로드 결과 해석. 201이고 모양이 맞을 때만 성공이며, 그 밖은 "올리지 못했습니다"와 이유 한 줄이다. */
export function pdfUploadOutcome(result: ClientResult): PdfUploadOutcome {
  if (result.kind === "success") {
    if (result.status === 201 && isCreated(result.data)) {
      const { pdfMaterialId, title, fileSizeBytes, extractionState } = result.data;
      return { kind: "ok", value: { pdfMaterialId, title, fileSizeBytes, extractionState, pageCount: null, failureCode: null } };
    }
    return { kind: "failed", lines: [PDF_UPLOAD_FAILED_TEXT, "올린 결과를 확인하지 못했습니다. 목록을 새로고침해 확인해 주세요."] };
  }
  if (result.kind === "api-error") {
    if (result.status === 400 && result.code === "VALIDATION_FAILED") {
      const first = result.details?.violations?.[0];
      return { kind: "failed", lines: [PDF_UPLOAD_FAILED_TEXT, first ? violationText(first.field, first.reason) : "파일이나 제목을 확인해 주세요."] };
    }
    if (result.status === 403 && result.code === "AI_CONSENT_REQUIRED") {
      return { kind: "failed", lines: [PDF_UPLOAD_FAILED_TEXT, "외부 AI 처리 동의가 필요합니다. 다시 올리면 동의 창이 열립니다."] };
    }
  }
  const failure = saveFailureOf(result);
  if (failure === "login-expired") return { kind: "failed", lines: [PDF_UPLOAD_FAILED_TEXT, "로그인이 만료되었습니다. 다시 로그인한 뒤 올려 주세요."] };
  if (failure === "server") return { kind: "failed", lines: [PDF_UPLOAD_FAILED_TEXT, "서버에서 처리하지 못했습니다. 잠시 뒤 다시 올려 주세요."] };
  return { kind: "failed", lines: [PDF_UPLOAD_FAILED_TEXT, "올린 결과를 확인하지 못했습니다. 목록을 새로고침한 뒤 없으면 다시 올려 주세요."] };
}

/** 목록 조회 실패 안내. 실패를 0건으로 보이지 않는다. */
export function pdfListErrorText(failure: SaveFailure): string {
  if (failure === "login-expired") return "로그인이 만료되었습니다. 다시 로그인한 뒤 확인해 주세요.";
  return "PDF 목록을 불러오지 못했습니다. 자료가 없다는 뜻은 아닙니다. 다시 불러와 주세요.";
}

/** 삭제 실패 안내. 접수만으로 삭제됨을 표시하지 않는다. */
export function pdfDeleteErrorText(failure: SaveFailure): string {
  if (failure === "login-expired") return "삭제되지 않았습니다. 로그인이 만료되었습니다. 다시 로그인한 뒤 삭제해 주세요.";
  if (failure === "not-found") return "삭제되지 않았습니다. 이미 지워졌거나 열 수 없는 자료입니다. 목록을 새로고침해 주세요.";
  return "삭제되지 않았습니다. 다시 시도해 주세요.";
}

export const PDF_DELETE_CONFIRM = "이 PDF를 삭제할까요? 이미 발행한 사본은 그대로 남고, 삭제한 PDF는 되살릴 수 없습니다.";

/** 파일 크기 표시(목록). 1 MB 미만은 KB로 보인다. */
export function fileSizeText(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * PDF 회원 요청 한 번의 계획. `send`면 `token`을 붙여 보낸다. `current()`는 보낸 세션(계정)이 아직 지금 세션인지다.
 * `blocked`면 보내지 않는다(공통 인증의 보내지 않음과 같은 조건).
 */
export type PdfAuthPlan = { kind: "send"; token: string | null; current(): boolean } | { kind: "blocked" };

/**
 * PDF 회원 요청의 토큰과 회원 인증 401 처리. `api.member`가 쓰는 쪽(공통 인증을 켠 빌드인지)에 맞춰 고른다.
 * - `token()`: 이번 요청의 계획.
 * - `authFailed(sent)`: 그 계획으로 보낸 요청이 회원 인증 401을 받았을 때 부른다. `renewed`면 같은 세션의 토큰이 바뀌었다(조회만 다시 보낸다).
 */
export type PdfMemberAuth = {
  token(): PdfAuthPlan;
  authFailed(sent: Extract<PdfAuthPlan, { kind: "send" }>): Promise<"renewed" | "not-renewed">;
};

/** 공통 인증을 끈 빌드: 메모리 토큰을 붙이고, 401이면 그 토큰이 아직 현재 토큰일 때 지운다(기존 동작). */
export function legacyPdfAuth(tokens: AccessTokenStore): PdfMemberAuth {
  return {
    token: () => ({ kind: "send", token: tokens.get().token, current: () => true }),
    async authFailed(sent) {
      // 응답을 기다리는 동안 다시 로그인했다면 새 토큰은 지우지 않는다.
      if (tokens.get().token === sent.token) tokens.clear("auth-failed");
      return "not-renewed";
    },
  };
}

/**
 * 공통 인증을 켠 빌드: `auth-api.ts`의 `member`와 같은 기준으로 공통 인증 상태의 실제 토큰을 쓴다.
 * 보내기 전 조건(`memberCallBlock`)을 확인하고 그때의 인증 세대를 기억한다. 401을 받았을 때와 갱신을 마쳤을 때 로그인 표식을
 * 비교해 세대가 바뀌었으면(다른 계정 로그인·로그아웃·표식 불일치) 갱신하지 않고 다시 보내지 않는다. 같은 세션의 Access 갱신은
 * 세대를 바꾸지 않는다. 세대가 그대로면 그 토큰이 아직 현재 토큰일 때 세션 갱신을 한 번 요청하고, 다른 호출이 이미 갱신했으면
 * 갱신하지 않고 바뀐 토큰을 쓴다. 상태 변화(재인증 필요 등)는 공통 인증이 맡는다. 런타임은 요청할 때 얻는다(모듈을 읽을 때 만들지 않는다).
 */
export function sessionPdfAuth(runtime: () => { store: AuthStore; session: AuthSession }): PdfMemberAuth {
  return {
    token() {
      const { store, session } = runtime();
      session.checkLoginMarker();
      if (memberCallBlock(store) !== null) return { kind: "blocked" };
      const generation = store.getSnapshot().generation;
      return {
        kind: "send",
        token: store.accessToken(),
        current() {
          session.checkLoginMarker();
          return store.getSnapshot().generation === generation;
        },
      };
    },
    async authFailed(sent) {
      // 응답을 기다리는 사이 계정이 바뀌었으면 그 요청은 이전 세션의 것이다. 새 세션의 토큰으로 다시 보내지 않는다.
      if (!sent.current()) return "not-renewed";
      const { store, session } = runtime();
      const renewedByOther = store.accessToken() !== sent.token && store.accessToken() !== null;
      const refreshed = renewedByOther ? null : await session.refresh();
      // 갱신하는 사이 계정이 바뀌었어도 다시 보내지 않는다.
      if (!sent.current()) return "not-renewed";
      return memberCallBlock(store) === null && (renewedByOther || refreshed?.kind === "signed-in") ? "renewed" : "not-renewed";
    },
  };
}

export type PdfHttpOptions = {
  /** NEXT_PUBLIC_API_BASE_URL. `/v1`은 넣지 않는다. */
  baseUrl: string | undefined;
  nodeEnv?: string;
  fetch?: typeof fetch;
} & ({ auth: PdfMemberAuth; tokens?: never } | { tokens: AccessTokenStore; auth?: never });

const MEMBER_AUTH_FAILURES = new Set(["AUTH_REQUIRED", "AUTH_INVALID"]);
const NOT_SENT = (): Response => new Response(null, { status: 503 });

/**
 * multipart 업로드와 PDF 본문 요청. 응답을 해석하지 않고 `Response`를 그대로 돌려준다(본문 수신 성공 여부는 부르는 쪽이 본다).
 * 주소 설정이 없거나 잘못되면, 또는 공통 인증이 보내지 않는 상태면 요청하지 않는다.
 * 회원 인증 401을 받아 토큰이 바뀌었으면 조회(GET)만 한 번 다시 보낸다. 업로드(POST)는 다시 보내지 않는다(#251 T2).
 */
export function createPdfHttp(options: PdfHttpOptions) {
  const baseUrl = normalizeApiBaseUrl(options.baseUrl, options.nodeEnv);
  const fetchImpl = options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init));
  const auth = options.auth ?? legacyPdfAuth(options.tokens as AccessTokenStore);

  async function member(path: string, init: { method: "GET" | "POST"; body?: FormData; accept: string; signal?: AbortSignal }): Promise<Response> {
    for (let resent = false; ; resent = true) {
      if (!baseUrl) return NOT_SENT();
      const plan = auth.token();
      if (plan.kind === "blocked") return NOT_SENT();
      const { token } = plan;
      // 이 요청을 보낸 세션의 계획(plan)을 401 처리에 넘긴다. 다시 보낼지는 그 세션이 아직 지금 세션인지까지 보고 정한다.
      const response = await fetchImpl(`${baseUrl}${API_VERSION_PATH}${path}`, {
        method: init.method,
        // multipart 경계는 브라우저가 붙이므로 Content-Type을 직접 쓰지 않는다.
        headers: { Accept: init.accept, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: init.body,
        cache: "no-store",
        credentials: "omit",
        signal: init.signal,
      });
      if (response.status !== 401) return response;
      const body: unknown = await response.clone().json().catch(() => null);
      if (!(record(body) && typeof body.code === "string" && MEMBER_AUTH_FAILURES.has(body.code))) return response;
      // 다시 보낸 조회도 401이면 더 갱신하지 않는다.
      if (resent) return response;
      const renewal = await auth.authFailed(plan);
      if (renewal !== "renewed" || init.method !== "GET") return response;
    }
  }

  return {
    /** `POST /pdf-materials`(multipart). 결과는 공통 오류 해석을 거친 `ClientResult`라 U2 동의 창(`useAiConsent().run`)에 그대로 넘길 수 있다. */
    async upload(file: Blob, fileName: string, title: string, signal?: AbortSignal): Promise<ClientResult> {
      const form = new FormData();
      // 서버는 선언 종류가 application/pdf인 파일만 받는다. 브라우저가 종류를 비워 준 .pdf도 같은 종류로 보낸다.
      form.append("file", new Blob([file], { type: "application/pdf" }), fileName);
      form.append("title", title);
      return readApiResponse(member("/pdf-materials", { method: "POST", body: form, accept: "application/json", signal }));
    },
    /** 작성자 원본 `GET /pdf-materials/{id}/file`. */
    originalFile(pdfMaterialId: string, signal?: AbortSignal): Promise<Response> {
      return member(`/pdf-materials/${encodeURIComponent(pdfMaterialId)}/file`, { method: "GET", accept: "application/pdf", signal });
    },
    /** 작성자 사본 `GET /publications/{id}/items/{itemId}/pdf`(중지·만료 뒤에도 연다, BR6.6). */
    ownerCopy(publicationId: string, publishedItemId: string, signal?: AbortSignal): Promise<Response> {
      return member(`/publications/${encodeURIComponent(publicationId)}/items/${encodeURIComponent(publishedItemId)}/pdf`,
        { method: "GET", accept: "application/pdf", signal });
    },
    /** 받은 사람 사본 `GET /public/links/{token}/items/{publishedItemId}/pdf`. 회원 토큰을 붙이지 않고 grant는 머리로만 싣는다(BR6.3). */
    async recipientCopy(token: string, publishedItemId: string, grant: string | null, signal?: AbortSignal): Promise<Response> {
      if (!baseUrl) return NOT_SENT();
      return fetchImpl(`${baseUrl}${API_VERSION_PATH}/public/links/${encodeURIComponent(token)}/items/${encodeURIComponent(publishedItemId)}/pdf`, {
        method: "GET",
        headers: { Accept: "application/pdf", ...(grant ? { "X-Link-Grant": grant } : {}) },
        cache: "no-store",
        credentials: "omit",
        signal,
      });
    },
  };
}

export type PdfHttp = ReturnType<typeof createPdfHttp>;

async function call<T>(run: () => ReturnType<ApiClient["member"]>, read: (status: number, data: unknown) => T | null): Promise<PdfResult<T>> {
  try {
    const result = await run();
    if (result.kind === "success") {
      const value = read(result.status, result.data);
      return value === null ? { kind: "failed", failure: "unknown" } : { kind: "ok", value };
    }
    return { kind: "failed", failure: saveFailureOf(result) };
  } catch {
    return { kind: "failed", failure: "unknown" };
  }
}

const itemPath = (id: string) => `/pdf-materials/${encodeURIComponent(id)}`;

/** 회원 API(`api.member`)로 PDF 자료의 목록·상세·삭제를 다룬다. 성공 상태·모양이 다르면 결과를 모르는 실패로 본다(0건으로 바꾸지 않는다). */
export function createPdfMaterialsApi(member: ApiClient["member"], http: Pick<PdfHttp, "upload">) {
  return {
    list(cursor: string | null, signal?: AbortSignal) {
      const query = new URLSearchParams({ limit: "20" });
      if (cursor !== null) query.set("cursor", cursor);
      return call(() => member(`/pdf-materials?${query}`, { method: "GET", signal }), (status, data): PdfMaterialPage | null =>
        status === 200 && isPdfMaterialPage(data) ? { items: data.items.map(pickItem), page: { nextCursor: data.page.nextCursor } } : null);
    },
    get(id: string, signal?: AbortSignal) {
      return call(() => member(itemPath(id), { method: "GET", signal }), (status, data): PdfMaterialDetail | null =>
        status === 200 && isPdfMaterialDetail(data) && data.pdfMaterialId === id
          ? { ...pickItem(data), pages: data.pages.map(({ pageNumber, readable }) => ({ pageNumber, readable })) } : null);
    },
    /** 업로드 요청 그대로(동의 창이 같은 요청을 한 번 다시 보낼 수 있게 `ClientResult`를 돌려준다). */
    uploadRaw(file: Blob, fileName: string, title: string, signal?: AbortSignal): Promise<ClientResult> {
      return http.upload(file, fileName, title, signal).catch((): ClientResult => ({ kind: "lookup-failed", status: null, code: "LOOKUP_FAILED" }));
    },
    remove(id: string, signal?: AbortSignal) {
      return call(() => member(itemPath(id), { method: "DELETE", signal }), (status, data): true | null => status === 204 && data === null ? true : null);
    },
  };
}

export type PdfMaterialsApi = ReturnType<typeof createPdfMaterialsApi>;

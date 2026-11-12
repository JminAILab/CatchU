import type { ApiClient, ClientResult } from "../../lib/api-client.ts";
import { memberMutationOutcome } from "../../lib/auth-api.ts";
import { codePointLength, saveFailureOf, type SaveFailure } from "../../lib/save-outcome.ts";
import { U2_ERROR_MESSAGES } from "../../lib/u2-error-messages.ts";
import { catchErrorText } from "../assets/catch-api.ts";

/** 발행 입력 상한(BR4.1·BR4.5). 제목은 앞뒤 공백을 지운 뒤 코드 포인트로 세고, 비밀번호는 다듬지 않는다(10월 링크 비밀번호 규칙). */
/**
 * 화면 안내용 상한. 서버 검증이 기준이다. `totalText`는 api `src/publications/publications-config.ts`의 SNAPSHOT_TEXT_TOTAL_MAX와 같은 값이며
 * (OQ-U4-4는 팀장 결정 2026-11-10 https://github.com/JminAILab/CatchU/issues/420#issuecomment-6759834176 으로 60,000자 그대로 닫힘, PDF 쪽 글 포함),
 * 같은 값을 api `src/pdf-extraction/pdf-extraction-spec.ts`의 PDF_TEXT_TOTAL_MAX, worker `app/pdf_extraction/settings.py`의 TEXT_LIMIT도 쓴다.
 * 한쪽만 바꾸지 않는다. 화면에서 미리 세지 않는다.
 */
export const PUBLISH_LIMITS = Object.freeze({ title: 50, password: Object.freeze({ min: 8, max: 64 }), items: 20, totalText: 60_000 });
/** 링크 유효 기간(BR5.4). 발행 시각부터이며 연장이 없다. */
export const LINK_VALID_DAYS = 90;

export type PublicationState = "ACTIVE" | "STOPPED" | "EXPIRED";
/** 발행 항목 종류. `PDF_MATERIAL`은 U8이 더했다(api `PUBLISH_ITEM_KINDS`, 계획 10.5). */
export type PublicationItemKind = "CATCH" | "TEXT_MATERIAL" | "PDF_MATERIAL";
export type PublishItemRef = { kind: PublicationItemKind; sourceId: string };
export type PublishRequest = { title: string; password?: string; items: PublishItemRef[] };

/** `POST /publications` 201 응답. 토큰은 `url` 안에만 있다(BR10.2). */
export type PublishedLink = {
  publicationId: string; url: string; state: PublicationState; publishedAt: string; expiresAt: string; passwordProtected: boolean;
};
export type PublicationListItem = PublishedLink & { title: string };
export type PublicationPage = { items: PublicationListItem[]; page: { nextCursor: string | null } };

/**
 * C-07 사본 모양. Catch는 기록 확인 내용·작성자 설명·AI 초안·불일치 표지를 나눠 보인다(BR1.3·BR7.5).
 * 새 Catch NC2(계약 C3)가 선택 칸 넷을 더했다. 칸이 없는 사본(이 변경 전 사본)도 올바르고, `ownCommit`이 없으면 false로 읽는다(BR2.1·BR2.2).
 */
export type SnapshotEvidence = { sourceUrl: string; sourceRevision: string; representedFacts: string[]; ownCommit?: boolean };
export type CatchSnapshot = {
  workFacts: string[]; subjectContribution: string; evidence: SnapshotEvidence[];
  authorDescription: string | null; aiDraft: string | null; mismatch: boolean;
  /** 「소유자/저장소」. 제목 아래 작은 글자 줄(BR3.1) */
  repositoryName?: string;
  /** 작성자 설명을 마지막으로 고친 한국 시간 "YYYY-MM"(BR3.2) */
  authorDescriptionEditedMonth?: string;
  /** 「이 기록으로 알 수 없는 것」 항목, 사본 순서 그대로(BR3.3) */
  workLimits?: string[];
};
export type TextMaterialSnapshot = { body: string };
export type PublishedItem =
  | { publishedItemId: string; position: number; itemKind: "CATCH"; title: string; snapshot: CatchSnapshot }
  | { publishedItemId: string; position: number; itemKind: "TEXT_MATERIAL"; title: string; snapshot: TextMaterialSnapshot }
  /** PDF 자료(U8). `snapshot.pageCount`와 쪽별 사본 `pdfPages`(C-10 `readSnapshot`)를 쓴다. 쪽 사본이 없는 응답은 빈 목록으로 본다. */
  | { publishedItemId: string; position: number; itemKind: "PDF_MATERIAL"; title: string; snapshot: Record<string, unknown>;
      pdfPages?: PublishedPdfPage[] | null };
/** PDF 쪽 사본(C-07 `published_pdf_page`). 읽을 수 없는 쪽은 `readable=false`·빈 글이다. */
export type PublishedPdfPage = { pageNumber: number; text: string; readable: boolean };
export type PublishedSnapshot = { title: string; publishedAt: string; expiresAt: string; items: PublishedItem[] };
/** `GET /publications/{id}` 200 응답. C-09 합의 전이라 `indexState`는 없다(있어도 무시한다). */
export type PublicationDetail = {
  publicationId: string; url: string; state: PublicationState; passwordProtected: boolean; snapshot: PublishedSnapshot;
};
export type StopResult = { state: PublicationState; stoppedAt: string | null };

const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const time = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(Date.parse(v));
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");
const STATES: readonly string[] = ["ACTIVE", "STOPPED", "EXPIRED"];
const isState = (v: unknown): v is PublicationState => typeof v === "string" && STATES.includes(v);

export function isPublishedLink(value: unknown): value is PublishedLink {
  return record(value) && text(value.publicationId) && text(value.url) && isState(value.state)
    && time(value.publishedAt) && time(value.expiresAt) && typeof value.passwordProtected === "boolean";
}

export function isPublicationPage(value: unknown): value is PublicationPage {
  return record(value) && Array.isArray(value.items)
    && value.items.every((item) => isPublishedLink(item) && text((item as Record<string, unknown>).title))
    && record(value.page) && (value.page.nextCursor === null || text(value.page.nextCursor));
}

/** 작성 달 "YYYY-MM"(01~12월, NC2 BR2.1). */
const EDITED_MONTH = /^[0-9]{4}-(0[1-9]|1[0-2])$/;
/** 선택 칸: 없으면(`undefined`) 통과, 있으면 모양을 본다(옛 사본, NC2 BR2.1). */
const optional = (v: unknown, check: (v: unknown) => boolean) => v === undefined || check(v);
const editedMonth = (v: unknown) => typeof v === "string" && EDITED_MONTH.test(v);
const workLimits = (v: unknown) => Array.isArray(v) && v.length > 0 && v.every(text);

function isCatchSnapshot(value: unknown): value is CatchSnapshot {
  return record(value) && strings(value.workFacts) && typeof value.subjectContribution === "string"
    && Array.isArray(value.evidence) && value.evidence.every((e) => record(e) && typeof e.sourceUrl === "string"
      && typeof e.sourceRevision === "string" && strings(e.representedFacts) && optional(e.ownCommit, (v) => typeof v === "boolean"))
    && (value.authorDescription === null || typeof value.authorDescription === "string")
    && (value.aiDraft === null || typeof value.aiDraft === "string") && typeof value.mismatch === "boolean"
    && optional(value.repositoryName, text) && optional(value.authorDescriptionEditedMonth, editedMonth) && optional(value.workLimits, workLimits);
}

function isPdfPages(value: unknown): value is PublishedPdfPage[] {
  return Array.isArray(value) && value.every((page) => record(page) && Number.isInteger(page.pageNumber) && (page.pageNumber as number) >= 1
    && typeof page.text === "string" && typeof page.readable === "boolean");
}

/** PDF 항목의 쪽 수. 사본에 숫자로 있을 때만 쓴다. */
export function pdfPageCount(item: Extract<PublishedItem, { itemKind: "PDF_MATERIAL" }>): number | null {
  const count = item.snapshot.pageCount;
  return typeof count === "number" && Number.isInteger(count) && count >= 0 ? count : null;
}

function isPublishedItem(value: unknown): value is PublishedItem {
  if (!record(value) || !text(value.publishedItemId) || !Number.isInteger(value.position) || typeof value.title !== "string") return false;
  if (value.itemKind === "CATCH") return isCatchSnapshot(value.snapshot);
  if (value.itemKind === "TEXT_MATERIAL") return record(value.snapshot) && typeof value.snapshot.body === "string";
  // 쪽 사본 칸은 없거나(null 포함) 쪽 모양의 배열이어야 한다. 모양이 다르면 사본 전체를 믿지 않는다.
  return value.itemKind === "PDF_MATERIAL" && record(value.snapshot)
    && (value.pdfPages === undefined || value.pdfPages === null || isPdfPages(value.pdfPages));
}

export function isPublishedSnapshot(value: unknown): value is PublishedSnapshot {
  return record(value) && typeof value.title === "string" && time(value.publishedAt) && time(value.expiresAt)
    && Array.isArray(value.items) && value.items.every(isPublishedItem);
}

export function isPublicationDetail(value: unknown): value is PublicationDetail {
  return record(value) && text(value.publicationId) && text(value.url) && isState(value.state)
    && typeof value.passwordProtected === "boolean" && isPublishedSnapshot(value.snapshot);
}

export function isStopResult(value: unknown): value is StopResult {
  return record(value) && isState(value.state) && (value.stoppedAt === null || time(value.stoppedAt));
}

/** 사본 항목을 `position` 오름차순으로 돌려준다(서버 순서를 믿되 화면은 한 번 더 정렬한다). */
export function orderedItems(snapshot: PublishedSnapshot): PublishedItem[] {
  return [...snapshot.items].sort((a, b) => a.position - b.position);
}

/** 보내기 전 검사(BR4.1·BR4.5). 서버 검증이 기준이며 화면 검사는 미리 알려 주는 것이다. 값을 고치지 않는다. */
export function publishDraftErrors(draft: { title: string; usePassword: boolean; password: string; itemCount: number }): string[] {
  const errors: string[] = [];
  const title = draft.title.trim();
  if (title.length === 0) errors.push("제목을 입력해 주세요.");
  else if (codePointLength(title) > PUBLISH_LIMITS.title) errors.push(`제목은 ${PUBLISH_LIMITS.title}자까지 쓸 수 있습니다.`);
  if (draft.usePassword) {
    const length = codePointLength(draft.password);
    if (length < PUBLISH_LIMITS.password.min || length > PUBLISH_LIMITS.password.max) {
      errors.push(`비밀번호는 ${PUBLISH_LIMITS.password.min}~${PUBLISH_LIMITS.password.max}자로 입력해 주세요.`);
    }
  }
  if (draft.itemCount < 1) errors.push("발행할 항목을 하나 이상 골라 주세요.");
  else if (draft.itemCount > PUBLISH_LIMITS.items) errors.push(`항목은 ${PUBLISH_LIMITS.items}개까지 고를 수 있습니다.`);
  return errors;
}

/**
 * 발행 실패 구분(신뢰성 설계 「작성자 실패 안내」 NFR7.5). 어떤 경우든 화면은 고른 항목·순서·제목·비밀번호 입력을 그대로 둔다.
 * `consent-required`는 동의 창(`components/ai-consent`)이 먼저 처리하므로 창을 거친 뒤에도 403이면 안내 문구로만 보인다.
 */
export type PublishFailure =
  | { kind: "confirmation-required"; catchIds: string[] }
  | { kind: "source-restricted"; catchIds: string[] }
  | { kind: "source-unavailable" }
  | { kind: "validation"; violations: { field: string; reason: string }[] }
  | { kind: "consent-required" }
  | { kind: "daily-limit" }
  | { kind: "rate-limited"; retryAfterSeconds?: number }
  | { kind: "login-expired" }
  | { kind: "renewed-rejected" }
  | { kind: "not-sent" }
  | { kind: "failed" };

export type PublishResult = { kind: "ok"; value: PublishedLink } | { kind: "failed"; failure: PublishFailure };

const MEMBER_AUTH_FAILURES = new Set(["AUTH_REQUIRED", "AUTH_INVALID"]);

/** 공통 클라이언트 결과를 발행 결과로 바꾼다. 201과 응답 모양이 맞을 때만 성공이다. 접수만으로 성공을 표시하지 않는다. */
export function publishOutcome(result: ClientResult): PublishResult {
  if (result.kind === "success") {
    return result.status === 201 && isPublishedLink(result.data) ? { kind: "ok", value: result.data } : { kind: "failed", failure: { kind: "failed" } };
  }
  const outcome = memberMutationOutcome(result);
  if (outcome === "renewed-rejected" || outcome === "not-sent") return { kind: "failed", failure: { kind: outcome } };
  if (result.kind !== "api-error") return { kind: "failed", failure: { kind: "failed" } };
  const catchIds = result.details?.catchIds ?? [];
  if (result.status === 409 && result.code === "CONFIRMATION_REQUIRED") return { kind: "failed", failure: { kind: "confirmation-required", catchIds } };
  if (result.status === 409 && result.code === "SOURCE_RESTRICTED") return { kind: "failed", failure: { kind: "source-restricted", catchIds } };
  if (result.status === 404) return { kind: "failed", failure: { kind: "source-unavailable" } };
  if (result.status === 400) return { kind: "failed", failure: { kind: "validation", violations: result.details?.violations ?? [] } };
  if (result.status === 403 && result.code === "AI_CONSENT_REQUIRED") return { kind: "failed", failure: { kind: "consent-required" } };
  if (result.status === 429 && result.code === "DAILY_LIMIT_REACHED") return { kind: "failed", failure: { kind: "daily-limit" } };
  if (result.status === 429) {
    return { kind: "failed", failure: result.retryAfterSeconds === undefined ? { kind: "rate-limited" } : { kind: "rate-limited", retryAfterSeconds: result.retryAfterSeconds } };
  }
  if (result.status === 401 && MEMBER_AUTH_FAILURES.has(result.code)) return { kind: "failed", failure: { kind: "login-expired" } };
  return { kind: "failed", failure: { kind: "failed" } };
}

export const PUBLISH_FAILED_TEXT = "발행되지 않았습니다";
/** 404 안내(신뢰성 설계가 코드 생성 때 정하게 둔 문구, 결정 D5). */
export const SOURCE_UNAVAILABLE_TEXT = "고른 자료 중 지금 발행할 수 없는 것이 있습니다. 목록을 다시 불러온 뒤 다시 골라 주세요.";
/** 10월 Catch 거부 문구를 그대로 쓴다(`features/assets/catch-api.ts`). */
export const CATCH_REJECTION_TEXT = Object.freeze({
  "confirmation-required": catchErrorText({ kind: "api-error", status: 409, code: "CONFIRMATION_REQUIRED", message: "" }),
  "source-restricted": catchErrorText({ kind: "api-error", status: 409, code: "SOURCE_RESTRICTED", message: "" }),
});

/** 빈도 초과 안내(결정 D6). 남은 초는 `Retry-After`가 있을 때만 적고, 없으면 시간을 추정하지 않는다. */
export function rateLimitedText(retryAfterSeconds?: number): string {
  return retryAfterSeconds === undefined
    ? "발행 요청이 잦아 잠시 발행할 수 없습니다. 잠시 뒤 [발행]을 다시 눌러 주세요."
    : `발행 요청이 잦아 잠시 발행할 수 없습니다. ${retryAfterSeconds}초 뒤에 [발행]을 다시 누를 수 있습니다.`;
}

const FIELD_TEXT: Record<string, string> = {
  title: `제목은 1~${PUBLISH_LIMITS.title}자(앞뒤 공백 제외)로 입력해 주세요.`,
  password: `비밀번호는 ${PUBLISH_LIMITS.password.min}~${PUBLISH_LIMITS.password.max}자로 입력해 주세요.`,
  items: `항목은 1~${PUBLISH_LIMITS.items}개이며 같은 항목을 두 번 고를 수 없습니다.`,
};

/**
 * 전체 글 상한 초과 안내. 서버는 고른 자료의 글(작업 사실·기여·근거 사실·작성자 설명·본문·PDF 쪽 글) 합이 상한을 넘으면
 * `{ field: 'items', reason: 'maxTotalLength' }`로 거부한다(api `PublishService`). 항목 개수·중복과 다른 원인이므로 따로 안내한다(PR #468 Codex P2).
 * PDF 목록에는 쪽 수만 보여 PDF가 원인인 줄 알 수 없으므로 문구에 PDF와 고치는 방법을 넣는다(팀장 결정 2026-11-10, #420 issuecomment-6759834176).
 */
export const TOTAL_TEXT_LIMIT_TEXT = `고른 자료의 전체 글(PDF 글 포함)이 ${String(PUBLISH_LIMITS.totalText).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}자를 넘었습니다. 자료를 빼거나, 수정할 수 있는 Catch 설명·텍스트 자료 원문을 줄인 뒤 다시 발행해 주세요. PDF는 필요한 쪽만 남긴 파일을 새로 올려 대신 고를 수 있습니다.`;

/**
 * 400 `details`의 칸별 안내. 서버의 이유 코드는 그대로 보이지 않고 칸 이름으로 안내한다.
 * `items`의 `maxTotalLength`만 전체 글 상한 안내로 구분하고, 그 밖의 `items` 이유는 개수·중복 안내다. 칸을 모르면 전체 글 상한을 함께 적는다.
 */
/**
 * 고른 PDF의 글 추출이 끝나지 않았거나 실패해 서버가 거부했을 때의 안내(U8 BR4.1, 400 `items[i].sourceId`·`extractionIncomplete`).
 * 화면은 추출이 완료된 PDF만 고르게 하지만, 고른 뒤에 상태가 바뀌었거나 목록이 오래됐을 수 있다.
 */
export const PDF_EXTRACTION_INCOMPLETE_TEXT = "고른 PDF 가운데 글 추출이 끝나지 않았거나 실패한 것이 있습니다. PDF 목록을 다시 불러온 뒤 추출이 완료된 PDF만 골라 주세요.";

export function validationLines(violations: { field: string; reason: string }[]): string[] {
  if (violations.length === 0) return ["입력 길이나 형식을 확인해 주세요."];
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const { field, reason } of violations) {
    const key = field.split(/[.[]/)[0];
    const line = key === "items" && reason === "maxTotalLength" ? TOTAL_TEXT_LIMIT_TEXT
      : key === "items" && reason === "extractionIncomplete" ? PDF_EXTRACTION_INCOMPLETE_TEXT
      : FIELD_TEXT[key] ?? `입력(${key})을 확인해 주세요. 발행본 전체 글이 상한을 넘었을 수도 있습니다.`;
    if (!seen.has(line)) { seen.add(line); lines.push(line); }
  }
  return lines;
}

/** 실패 안내 줄. 첫 줄은 "발행되지 않았습니다"이고 아래에 이유를 둔다. 409는 해당 Catch를 선택 목록에서 함께 표시한다. */
export function publishFailureLines(failure: PublishFailure): string[] {
  switch (failure.kind) {
    case "confirmation-required": return [PUBLISH_FAILED_TEXT, CATCH_REJECTION_TEXT["confirmation-required"], "표시된 Catch를 확인하거나 빼고 다시 발행해 주세요."];
    case "source-restricted": return [PUBLISH_FAILED_TEXT, CATCH_REJECTION_TEXT["source-restricted"], "표시된 Catch를 빼고 다시 발행해 주세요."];
    case "source-unavailable": return [PUBLISH_FAILED_TEXT, SOURCE_UNAVAILABLE_TEXT];
    case "validation": return [PUBLISH_FAILED_TEXT, ...validationLines(failure.violations)];
    case "consent-required": return [PUBLISH_FAILED_TEXT, U2_ERROR_MESSAGES.AI_CONSENT_REQUIRED];
    case "daily-limit": return [PUBLISH_FAILED_TEXT, U2_ERROR_MESSAGES.DAILY_LIMIT_REACHED];
    case "rate-limited": return [PUBLISH_FAILED_TEXT, rateLimitedText(failure.retryAfterSeconds)];
    case "login-expired": return [PUBLISH_FAILED_TEXT, "로그인이 만료되었습니다. 다시 로그인한 뒤 발행해 주세요. 고른 항목과 입력은 화면에 남아 있습니다."];
    case "renewed-rejected": return [PUBLISH_FAILED_TEXT, "로그인이 연장되었습니다. [발행]을 다시 눌러 주세요."];
    case "not-sent": return [PUBLISH_FAILED_TEXT, "지금은 요청을 보내지 않았습니다. 입력은 그대로 두었습니다."];
    case "failed": return [PUBLISH_FAILED_TEXT, "서버에서 처리하지 못했거나 응답을 받지 못했습니다. 잠시 뒤 다시 시도해 주세요."];
  }
}

export type OwnerResult<T> = { kind: "ok"; value: T } | { kind: "failed"; failure: SaveFailure };

export function publicationListErrorText(failure: SaveFailure): string {
  if (failure === "login-expired") return "로그인이 만료되었습니다. 다시 로그인한 뒤 확인해 주세요.";
  return "발행본 목록을 불러오지 못했습니다. 발행본이 없다는 뜻은 아닙니다. 다시 불러와 주세요.";
}

export function publicationOpenErrorText(failure: SaveFailure): string {
  if (failure === "login-expired") return "로그인이 만료되었습니다. 다시 로그인한 뒤 확인해 주세요.";
  if (failure === "not-found") return "이 발행본을 열 수 없습니다. 삭제됐거나 내 발행본이 아닙니다. 목록으로 돌아가 다시 선택해 주세요.";
  return "발행본을 불러오지 못했습니다. 다시 불러와 주세요.";
}

export function stopErrorText(failure: SaveFailure): string {
  if (failure === "login-expired") return "링크가 중지되지 않았습니다. 로그인이 만료되었습니다. 다시 로그인한 뒤 중지해 주세요.";
  if (failure === "not-found") return "링크가 중지되지 않았습니다. 이 발행본을 열 수 없습니다. 목록을 다시 불러와 주세요.";
  return "링크가 중지되지 않았습니다. 다시 시도해 주세요.";
}

/** 삭제 실패 안내(BR8.4·NFR5.3). 접수만으로 삭제됨을 표시하지 않고 발행본을 화면에 그대로 둔다. */
export function deleteErrorText(failure: SaveFailure): string {
  if (failure === "login-expired") return "삭제되지 않았습니다. 로그인이 만료되었습니다. 다시 로그인한 뒤 삭제해 주세요.";
  if (failure === "not-found") return "삭제되지 않았습니다. 이미 지워졌거나 열 수 없는 발행본입니다. 목록을 다시 불러와 주세요.";
  return "삭제되지 않았습니다. 다시 시도해 주세요.";
}

async function call<T>(run: () => Promise<ClientResult>, ok: (status: number, data: unknown) => data is T): Promise<OwnerResult<T>> {
  try {
    const result = await run();
    if (result.kind === "success") {
      return ok(result.status, result.data) ? { kind: "ok", value: result.data } : { kind: "failed", failure: "unknown" };
    }
    return { kind: "failed", failure: saveFailureOf(result) };
  } catch {
    return { kind: "failed", failure: "unknown" };
  }
}

const itemPath = (id: string) => `/publications/${encodeURIComponent(id)}`;

/**
 * 회원 API(`api.member`)로 발행본을 다룬다(기능 명세 「작성자 API」). `publishRaw`는 동의 창(`useAiConsent().run`)이 같은 요청을
 * 한 번 다시 보낼 수 있게 공통 결과를 그대로 돌려주고, 해석은 `publishOutcome`이 한다. 재전송 키는 받지 않는다(BR4.9).
 */
export function createPublicationsApi(member: ApiClient["member"]) {
  return {
    list(cursor: string | null, signal?: AbortSignal) {
      const query = new URLSearchParams({ limit: "20" });
      if (cursor !== null) query.set("cursor", cursor);
      return call(() => member(`/publications?${query}`, { method: "GET", signal }),
        (status, data): data is PublicationPage => status === 200 && isPublicationPage(data));
    },
    get(id: string, signal?: AbortSignal) {
      return call(() => member(itemPath(id), { method: "GET", signal }),
        (status, data): data is PublicationDetail => status === 200 && isPublicationDetail(data) && data.publicationId === id);
    },
    async publishRaw(body: PublishRequest, signal?: AbortSignal): Promise<ClientResult> {
      try {
        return await member("/publications", { method: "POST", body, signal });
      } catch {
        return { kind: "lookup-failed", status: null, code: "LOOKUP_FAILED" };
      }
    },
    stop(id: string, signal?: AbortSignal) {
      return call(() => member(`${itemPath(id)}/stop`, { method: "PUT", signal }),
        (status, data): data is StopResult => status === 200 && isStopResult(data));
    },
    remove(id: string, signal?: AbortSignal) {
      return call(() => member(itemPath(id), { method: "DELETE", signal }),
        (status, data): data is null => status === 204 && data === null);
    },
  };
}

export type PublicationsApi = ReturnType<typeof createPublicationsApi>;

import type { ApiClient, ClientResult } from "../../lib/api-client.ts";
import type { BlockedSource } from "../../lib/api-response.ts";
import { memberMutationOutcome } from "../../lib/auth-api.ts";
import { codePointLength, saveFailureOf, type SaveFailure } from "../../lib/save-outcome.ts";
import { U2_ERROR_MESSAGES } from "../../lib/u2-error-messages.ts";
import { catchErrorText } from "../assets/catch-api.ts";
import type { PresetSummary } from "../presets/presets-api.ts";

/** 발행 입력 상한(BR4.1·BR4.5). 제목은 앞뒤 공백을 지운 뒤 코드 포인트로 세고, 비밀번호는 다듬지 않는다(10월 링크 비밀번호 규칙). */
/**
 * 화면 안내용 상한. 서버 검증이 기준이다. `totalText`는 api `src/publications/publications-config.ts`의 SNAPSHOT_TEXT_TOTAL_MAX와 같은 값이며
 * (OQ-U4-4는 팀장 결정 2026-11-10 https://github.com/JminAILab/CatchU/issues/420#issuecomment-6759834176 으로 60,000자 그대로 닫힘, PDF 쪽 글 포함),
 * 같은 값을 api `src/pdf-extraction/pdf-extraction-spec.ts`의 PDF_TEXT_TOTAL_MAX, worker `app/pdf_extraction/settings.py`의 TEXT_LIMIT도 쓴다.
 * 한쪽만 바꾸지 않는다. 화면은 프리셋 목록 응답의 항목 수·글자 수로만 미리 막는다(발행 프리셋 U2 BR4.2).
 * `presets`는 한 번에 고를 수 있는 프리셋 수(발행 프리셋 계약 P-2, api `presetIds` 1~5개)다.
 */
export const PUBLISH_LIMITS = Object.freeze({ title: 50, password: Object.freeze({ min: 8, max: 64 }), items: 20, totalText: 60_000, presets: 5 });
/** 링크 유효 기간(BR5.4). 발행 시각부터이며 연장이 없다. */
export const LINK_VALID_DAYS = 90;

export type PublicationState = "ACTIVE" | "STOPPED" | "EXPIRED";
/** 발행 항목 종류. `PDF_MATERIAL`은 U8이 더했다(api `PUBLISH_ITEM_KINDS`, 계획 10.5). */
export type PublicationItemKind = "CATCH" | "TEXT_MATERIAL" | "PDF_MATERIAL";
/** 발행 요청(발행 프리셋 계약 P-2). `presetIds`는 고른 순서다. 옛 `items` 칸은 서버가 정의 밖 칸으로 400을 낸다. */
export type PublishRequest = { title: string; password?: string; presetIds: string[] };

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

/**
 * 보내기 전 검사(BR4.1·BR4.5). 서버 검증이 기준이며 화면 검사는 미리 알려 주는 것이다. 값을 고치지 않는다.
 * 고른 것의 수는 프리셋 수(1~5개)다(발행 프리셋 U2 기능 설계 검토 R-04). [다음]은 막지 않고 눌렀을 때 이 결과를 보인다.
 */
export function publishDraftErrors(draft: { title: string; usePassword: boolean; password: string; presetCount: number }): string[] {
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
  if (draft.presetCount < 1) errors.push("프리셋을 하나 이상 골라 주세요.");
  else if (draft.presetCount > PUBLISH_LIMITS.presets) errors.push(`프리셋은 ${PUBLISH_LIMITS.presets}개까지 고를 수 있습니다.`);
  return errors;
}

/** 서버가 막은 자료를 알리는 실패(발행 프리셋 U2 BR4.6). 모두 `details.blockedSources`를 싣는다. */
export type BlockedKind = "confirmation-required" | "source-restricted" | "catch-private" | "extraction-incomplete";

/**
 * 발행 실패 구분(신뢰성 설계 「작성자 실패 안내」 NFR7.5). 어떤 경우든 화면은 고른 프리셋·순서·제목·비밀번호 입력을 그대로 둔다.
 * `consent-required`는 동의 창(`components/ai-consent`)이 먼저 처리하므로 창을 거친 뒤에도 403이면 안내 문구로만 보인다.
 * `preset-invalid`는 400 `presetIds`(빈 프리셋·21개 넘음·60,000자 넘음)이고, 화면은 프리셋 목록을 다시 불러온다.
 */
export type PublishFailure =
  | { kind: BlockedKind; blockedSources: BlockedSource[] }
  | { kind: "preset-invalid" }
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
  const blockedSources = result.details?.blockedSources ?? [];
  const violations = result.details?.violations ?? [];
  if (result.status === 409) {
    const kind = BLOCKED_CODES[result.code];
    if (kind) return { kind: "failed", failure: { kind, blockedSources } };
  }
  if (result.status === 404) return { kind: "failed", failure: { kind: "source-unavailable" } };
  if (result.status === 400) {
    if (blockedSources.length > 0 || violations.some((v) => v.reason === "extractionIncomplete")) {
      return { kind: "failed", failure: { kind: "extraction-incomplete", blockedSources } };
    }
    if (violations.some((v) => v.field.split(/[.[]/)[0] === "presetIds")) return { kind: "failed", failure: { kind: "preset-invalid" } };
    return { kind: "failed", failure: { kind: "validation", violations } };
  }
  if (result.status === 403 && result.code === "AI_CONSENT_REQUIRED") return { kind: "failed", failure: { kind: "consent-required" } };
  if (result.status === 429 && result.code === "DAILY_LIMIT_REACHED") return { kind: "failed", failure: { kind: "daily-limit" } };
  if (result.status === 429) {
    return { kind: "failed", failure: result.retryAfterSeconds === undefined ? { kind: "rate-limited" } : { kind: "rate-limited", retryAfterSeconds: result.retryAfterSeconds } };
  }
  if (result.status === 401 && MEMBER_AUTH_FAILURES.has(result.code)) return { kind: "failed", failure: { kind: "login-expired" } };
  return { kind: "failed", failure: { kind: "failed" } };
}

export const PUBLISH_FAILED_TEXT = "발행되지 않았습니다";
/** 404 안내(발행 프리셋 U2 기능 설계 흐름 3 「결과」). 화면은 프리셋 목록을 다시 불러와 없어진 프리셋을 고른 목록에서 뺀다. */
export const SOURCE_UNAVAILABLE_TEXT = "고른 프리셋이나 그 안의 자료를 찾을 수 없습니다.";
/** 400 `presetIds`(빈 프리셋·항목 수·전체 글 상한) 안내(발행 프리셋 U2 기능 설계 흐름 3 「결과」). */
export const PRESET_INVALID_TEXT = "고른 프리셋으로는 발행할 수 없습니다. 목록을 다시 확인해 주세요.";
/** 10월 Catch 거부 문구를 그대로 쓴다(`features/assets/catch-api.ts`). */
export const CATCH_REJECTION_TEXT = Object.freeze({
  "confirmation-required": catchErrorText({ kind: "api-error", status: 409, code: "CONFIRMATION_REQUIRED", message: "" }),
  "source-restricted": catchErrorText({ kind: "api-error", status: 409, code: "SOURCE_RESTRICTED", message: "" }),
});
/** 비공개 Catch 막힘(409 `CATCH_PRIVATE`). api 오류 문구와 같은 글이다(발행 프리셋 U2 기능 설계 흐름 3). */
export const CATCH_PRIVATE_TEXT = "비공개 Catch는 발행할 수 없습니다.";

const BLOCKED_CODES: Readonly<Record<string, BlockedKind>> = Object.freeze({
  CONFIRMATION_REQUIRED: "confirmation-required", SOURCE_RESTRICTED: "source-restricted", CATCH_PRIVATE: "catch-private",
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
  presetIds: `프리셋은 1~${PUBLISH_LIMITS.presets}개이며 같은 프리셋을 두 번 고를 수 없습니다.`,
};

/**
 * 고른 프리셋 안 PDF의 글 추출이 끝나지 않았거나 실패해 서버가 거부했을 때의 첫 줄(400 `extractionIncomplete`, `details.blockedSources`).
 * 어느 프리셋의 어느 PDF인지는 막힘 줄이 따로 알린다(발행 프리셋 U2 BR4.6).
 */
export const PDF_EXTRACTION_INCOMPLETE_TEXT = "고른 PDF 가운데 글 추출이 끝나지 않았거나 실패한 것이 있습니다.";

/** 400 `details`의 칸별 안내(제목·비밀번호). 서버의 이유 코드는 그대로 보이지 않고 칸 이름으로 안내한다. */
export function validationLines(violations: { field: string; reason: string }[]): string[] {
  if (violations.length === 0) return ["입력 길이나 형식을 확인해 주세요."];
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const { field } of violations) {
    const key = field.split(/[.[]/)[0];
    const line = FIELD_TEXT[key] ?? `입력(${key})을 확인해 주세요.`;
    if (!seen.has(line)) { seen.add(line); lines.push(line); }
  }
  return lines;
}

const KIND_TEXT: Readonly<Record<BlockedSource["kind"], string>> = Object.freeze({ CATCH: "Catch", TEXT_MATERIAL: "텍스트 자료", PDF_MATERIAL: "PDF 자료" });

/**
 * 막힘 줄(BR4.6): 「‘(프리셋 이름)’ 프리셋의 ‘(자료 이름)’ 때문에 발행할 수 없습니다.」.
 * 프리셋 이름은 프리셋 ID로, 자료 이름은 그 프리셋의 `unpublishableItems`에서 종류·자료 ID로 찾는다.
 * 자료 이름을 못 찾으면 그 자리에 종류(Catch·텍스트 자료·PDF 자료)를, 프리셋 이름을 못 찾으면 「고른 프리셋」을 쓴다(따옴표 없이, 빈 따옴표를 만들지 않음).
 * 이름은 글자로만 잇고 HTML을 만들지 않는다(NFR3.2).
 */
export function blockedSourceLines(blocked: readonly BlockedSource[], presets: readonly PresetSummary[]): string[] {
  return blocked.map(({ presetId, kind, sourceId }) => {
    const preset = presets.find((item) => item.presetId === presetId);
    const title = preset?.unpublishableItems.find((item) => item.kind === kind && item.sourceId === sourceId)?.title;
    const presetPart = preset ? `‘${preset.name}’ 프리셋` : "고른 프리셋";
    const sourcePart = title ? `‘${title}’` : KIND_TEXT[kind];
    return `${presetPart}의 ${sourcePart} 때문에 발행할 수 없습니다.`;
  });
}

export const PRESET_EMPTY_REASON = "담긴 자료가 없어 고를 수 없습니다";
export const PRESET_ITEMS_OVER_REASON = `고르면 항목이 ${PUBLISH_LIMITS.items}개를 넘습니다`;
export const PRESET_TEXT_OVER_REASON = `고르면 전체 글이 ${String(PUBLISH_LIMITS.totalText).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}자를 넘습니다`;
export const PRESETS_FULL_TEXT = `프리셋은 ${PUBLISH_LIMITS.presets}개까지 고를 수 있습니다.`;

/**
 * 고를 수 없는 프리셋의 이유 하나(BR4.2): 항목 0개 → 발행할 수 없는 자료 → 고른 프리셋들과 더한 항목 수 → 더한 글자 수.
 * 같은 자료가 두 프리셋에 있으면 두 번 센다(서버와 같다). 이미 고른 프리셋은 막지 않는다(눌러 뺄 수 있어야 한다).
 * 다섯 개가 찼으면(`full`) 상한 이유(3·4번)는 보이지 않는다(BR4.3). 단추는 `full`일 때 따로 막는다.
 */
export function presetBlockReason(preset: PresetSummary, chosen: readonly PresetSummary[], full: boolean): string | null {
  if (chosen.some((item) => item.presetId === preset.presetId)) return null;
  if (preset.itemCount === 0) return PRESET_EMPTY_REASON;
  if (preset.unpublishableCount > 0) {
    const first = preset.unpublishableItems[0]?.title ?? KIND_TEXT[preset.unpublishableItems[0]?.kind ?? "CATCH"];
    return `발행할 수 없는 자료가 있습니다: ${first}${preset.unpublishableCount > 1 ? ` 외 ${preset.unpublishableCount - 1}개` : ""}`;
  }
  if (full) return null;
  if (chosen.reduce((sum, item) => sum + item.itemCount, 0) + preset.itemCount > PUBLISH_LIMITS.items) return PRESET_ITEMS_OVER_REASON;
  if (chosen.reduce((sum, item) => sum + item.textLength, 0) + preset.textLength > PUBLISH_LIMITS.totalText) return PRESET_TEXT_OVER_REASON;
  return null;
}

/** 막힘 종류별 첫 이유 줄(지금 막힘 안내의 코드별 글, 새 코드 `CATCH_PRIVATE`는 api 오류 문구와 같은 글). */
export const BLOCKED_TEXT: Readonly<Record<BlockedKind, string>> = Object.freeze({
  "confirmation-required": CATCH_REJECTION_TEXT["confirmation-required"],
  "source-restricted": CATCH_REJECTION_TEXT["source-restricted"],
  "catch-private": CATCH_PRIVATE_TEXT,
  "extraction-incomplete": PDF_EXTRACTION_INCOMPLETE_TEXT,
});

/**
 * 실패 안내 줄. 첫 줄은 "발행되지 않았습니다"이고 아래에 이유를 둔다.
 * 막힘은 어느 프리셋의 어느 자료인지를 화면이 프리셋 목록으로 이름을 찾아 이 줄들 뒤에 잇는다(`blockedSourceLines`).
 */
export function publishFailureLines(failure: PublishFailure): string[] {
  switch (failure.kind) {
    case "confirmation-required": case "source-restricted": case "catch-private": case "extraction-incomplete":
      return [PUBLISH_FAILED_TEXT, BLOCKED_TEXT[failure.kind]];
    case "preset-invalid": return [PUBLISH_FAILED_TEXT, PRESET_INVALID_TEXT];
    case "source-unavailable": return [PUBLISH_FAILED_TEXT, SOURCE_UNAVAILABLE_TEXT];
    case "validation": return [PUBLISH_FAILED_TEXT, ...validationLines(failure.violations)];
    case "consent-required": return [PUBLISH_FAILED_TEXT, U2_ERROR_MESSAGES.AI_CONSENT_REQUIRED];
    case "daily-limit": return [PUBLISH_FAILED_TEXT, U2_ERROR_MESSAGES.DAILY_LIMIT_REACHED];
    case "rate-limited": return [PUBLISH_FAILED_TEXT, rateLimitedText(failure.retryAfterSeconds)];
    case "login-expired": return [PUBLISH_FAILED_TEXT, "로그인이 만료되었습니다. 다시 로그인한 뒤 발행해 주세요. 고른 프리셋과 입력은 화면에 남아 있습니다."];
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

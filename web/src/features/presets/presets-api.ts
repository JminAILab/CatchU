import type { ApiClient, ClientResult } from "../../lib/api-client.ts";
import { codePointLength } from "../../lib/save-outcome.ts";

/**
 * 프리셋 화면 상한(발행 프리셋 U1 api `src/presets/`·발행과 같은 값). 서버 검증이 기준이고 화면은 미리 보여 줄 뿐이다.
 * `items`·`totalText`는 발행 상한(`PUBLISH_LIMITS`)과 같은 값이다. 한쪽만 바꾸지 않는다.
 */
export const PRESET_LIMITS = Object.freeze({ name: 50, presets: 50, items: 20, totalText: 60_000 });

export type PresetItemKind = "CATCH" | "TEXT_MATERIAL" | "PDF_MATERIAL";
/** 발행할 수 없는 이유(계약 P-1 `unpublishableReason`). 텍스트 자료는 이유가 없다. */
export type UnpublishableReason = "CONFIRMATION_REQUIRED" | "SOURCE_RESTRICTED" | "PRIVATE" | "EXTRACTION_INCOMPLETE";
export type PresetItemRef = { kind: PresetItemKind; sourceId: string };
export type UnpublishableItem = PresetItemRef & { title: string; reason: UnpublishableReason };

/** `GET /v1/presets`의 프리셋 하나. 항목 수·글자 수·이유는 서버가 읽을 때마다 센다(U1 ADR-005). */
export type PresetSummary = {
  presetId: string; name: string; itemCount: number; textLength: number; overLimit: boolean;
  unpublishableCount: number; unpublishableItems: UnpublishableItem[];
};
/** 담긴 자료 하나 또는 세기 결과 하나(계약 P-1 `ItemMeasure`). */
export type ItemMeasure = PresetItemRef & { title: string; textLength: number; unpublishableReason: UnpublishableReason | null };
export type PresetDetail = { presetId: string; name: string; items: ItemMeasure[] };
export type PresetDraft = { name: string; items: PresetItemRef[] };

/** 읽기 실패: 404(남의 것·없는 것을 나누지 않음, NFR2.1)와 그 밖. */
export type PresetReadFailure = "not-found" | "failed";
/** 저장 실패(기능 설계 「저장」 결과 표). 화면은 이유별 글을 보이고 입력을 남긴다. */
export type PresetSaveFailure = "name" | "max-total-length" | "items" | "limit-reached" | "not-found" | "failed";
export type PresetResult<T, F extends string> = { kind: "ok"; value: T } | { kind: "failed"; failure: F };

const KINDS: readonly string[] = ["CATCH", "TEXT_MATERIAL", "PDF_MATERIAL"];
const REASONS: readonly string[] = ["CONFIRMATION_REQUIRED", "SOURCE_RESTRICTED", "PRIVATE", "EXTRACTION_INCOMPLETE"];
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const count = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const isKind = (v: unknown): v is PresetItemKind => typeof v === "string" && KINDS.includes(v);
const isReason = (v: unknown): v is UnpublishableReason => typeof v === "string" && REASONS.includes(v);

function isUnpublishableItem(value: unknown): value is UnpublishableItem {
  return record(value) && isKind(value.kind) && text(value.sourceId) && typeof value.title === "string" && isReason(value.reason);
}

export function isPresetSummary(value: unknown): value is PresetSummary {
  return record(value) && text(value.presetId) && text(value.name) && count(value.itemCount) && count(value.textLength)
    && typeof value.overLimit === "boolean" && count(value.unpublishableCount)
    && Array.isArray(value.unpublishableItems) && value.unpublishableItems.every(isUnpublishableItem);
}

export function isItemMeasure(value: unknown): value is ItemMeasure {
  return record(value) && isKind(value.kind) && text(value.sourceId) && typeof value.title === "string"
    && count(value.textLength) && (value.unpublishableReason === null || isReason(value.unpublishableReason));
}

export function isPresetDetail(value: unknown): value is PresetDetail {
  return record(value) && text(value.presetId) && text(value.name) && Array.isArray(value.items) && value.items.every(isItemMeasure);
}

const isPresetList = (v: unknown): v is { presets: PresetSummary[] } => record(v) && Array.isArray(v.presets) && v.presets.every(isPresetSummary);
const isPresetId = (v: unknown): v is { presetId: string } => record(v) && text(v.presetId);

/** 천 단위 쉼표(M2 「12,300자」). 지역 설정에 기대지 않는다. */
export function formatCount(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** 「항목 N개 · M자」(M2·M4 보조 줄). */
export function itemsLine(itemCount: number, textLength: number): string {
  return `항목 ${itemCount}개 · ${formatCount(textLength)}자`;
}

/** 편집 화면의 담긴 자료 한 줄. 글자 수를 모르면(세기 실패·아직 안 셈) null이다. 이유는 상세 응답으로만 받는다(BR3.6). */
export type EditorItem = PresetItemRef & { title: string; textLength: number | null; reason: UnpublishableReason | null };

export const ITEMS_FULL_TEXT = `항목은 ${PRESET_LIMITS.items}개까지 담을 수 있습니다`;
export const TOTAL_OVER_TEXT = `전체 글이 ${formatCount(PRESET_LIMITS.totalText)}자를 넘습니다`;

const refKey = (ref: PresetItemRef) => `${ref.kind}:${ref.sourceId}`;

/** 담긴 자료의 아는 글자 수 합. 모르는 자료는 0으로 센다(미리 막기의 아래 한계). */
export function knownTotal(items: readonly EditorItem[]): number {
  return items.reduce((sum, item) => sum + (item.textLength ?? 0), 0);
}

/** 모든 담긴 자료의 글자 수를 알면 그 합, 하나라도 모르면 null(「글자 수를 세지 못했습니다」). */
export function itemsTotal(items: readonly EditorItem[]): number | null {
  return items.every((item) => item.textLength !== null) ? knownTotal(items) : null;
}

/**
 * 안 담긴 자료를 막는 이유(BR3.4). 담긴 자료는 막지 않는다(빼야 하므로). 20개면 개수 이유, 글자 수를 아는 자료를 더해 60,000자를 넘으면 글자 이유.
 * 글자 수를 모르는 자료는 글자 이유로 막지 않는다(세기 실패, NFR5.1). 서버가 저장 때 다시 검사한다.
 * `lengths`의 열쇠는 `종류:자료 ID`(`selectionKey`와 같은 꼴)다.
 */
export function addBlockReason(items: readonly EditorItem[], lengths: Readonly<Record<string, number>>, ref: PresetItemRef): string | null {
  const key = refKey(ref);
  if (items.some((item) => refKey(item) === key)) return null;
  if (items.length >= PRESET_LIMITS.items) return ITEMS_FULL_TEXT;
  const length = lengths[key];
  if (length !== undefined && knownTotal(items) + length > PRESET_LIMITS.totalText) return TOTAL_OVER_TEXT;
  return null;
}

/** 이름 검사(BR3.1): 앞뒤 공백을 뺀 코드 포인트 1~50자. 같은 이름은 막지 않는다. */
export function isValidPresetName(name: string): boolean {
  const length = codePointLength(name.trim());
  return length >= 1 && length <= PRESET_LIMITS.name;
}

/** 담긴 자료의 발행할 수 없는 이유 글(BR3.6). 색이 아니라 글자로 보인다(NFR1). */
export const UNPUBLISHABLE_REASON_TEXT: Readonly<Record<UnpublishableReason, string>> = Object.freeze({
  PRIVATE: "비공개로 바뀌어 발행할 수 없습니다",
  SOURCE_RESTRICTED: "원본 저장소가 보호되어 발행할 수 없습니다",
  CONFIRMATION_REQUIRED: "작업 사실과 나의 기여를 먼저 확인해야 발행할 수 있습니다",
  EXTRACTION_INCOMPLETE: "글 추출이 끝나지 않아 발행할 수 없습니다",
});

export const PRESET_NAME_ERROR = "이름을 1~50자로 써 주세요.";
export const PRESET_LIMIT_TEXT = `프리셋은 ${PRESET_LIMITS.presets}개까지 만들 수 있습니다.`;

/** 저장 실패 안내(기능 설계 「저장」 결과 표). 이름 실패는 이름 칸 아래 글로 보인다. */
export function presetSaveFailureText(failure: PresetSaveFailure): string {
  switch (failure) {
    case "name": return PRESET_NAME_ERROR;
    case "max-total-length": return `전체 글이 ${formatCount(PRESET_LIMITS.totalText)}자를 넘어 저장할 수 없습니다. 자료를 빼 주세요.`;
    case "limit-reached": return PRESET_LIMIT_TEXT;
    case "not-found": return "담은 자료나 프리셋을 찾을 수 없습니다. 목록을 다시 불러와 주세요.";
    case "items": case "failed": return "저장하지 못했습니다. 다시 시도해 주세요.";
  }
}

/** 저장 결과 해석. 이름·글자 합·개수·404를 나누고, 나머지(400 그 밖·401·5xx·연결 끊김·모양 다름)는 `failed`다. */
export function presetSaveFailureOf(result: ClientResult): PresetSaveFailure {
  if (result.kind !== "api-error") return "failed";
  const violations = result.details?.violations ?? [];
  if (result.status === 400 && violations.some((v) => v.field === "name")) return "name";
  if (result.status === 400 && violations.some((v) => v.field === "items" && v.reason === "maxTotalLength")) return "max-total-length";
  if (result.status === 400) return "items";
  if (result.status === 409 && result.code === "PRESET_LIMIT_REACHED") return "limit-reached";
  if (result.status === 404) return "not-found";
  return "failed";
}

const readFailureOf = (result: ClientResult): PresetReadFailure =>
  result.kind === "api-error" && result.status === 404 ? "not-found" : "failed";

async function call<T, F extends string>(
  run: () => Promise<ClientResult>, ok: (status: number, data: unknown) => data is T, failureOf: (result: ClientResult) => F, unknown: F,
): Promise<PresetResult<T, F>> {
  try {
    const result = await run();
    if (result.kind === "success") return ok(result.status, result.data) ? { kind: "ok", value: result.data } : { kind: "failed", failure: unknown };
    return { kind: "failed", failure: failureOf(result) };
  } catch {
    return { kind: "failed", failure: unknown };
  }
}

const itemPath = (id: string) => `/presets/${encodeURIComponent(id)}`;
const refs = (items: readonly PresetItemRef[]) => items.map(({ kind, sourceId }) => ({ kind, sourceId }));

/** 세기 응답은 요청 순서와 같은 자료여야 한다(U1 `POST /v1/presets/measure`). */
function measuredSame(items: readonly PresetItemRef[], data: unknown): data is { items: ItemMeasure[] } {
  return record(data) && Array.isArray(data.items) && data.items.length === items.length && data.items.every((item, index) =>
    isItemMeasure(item) && item.kind === items[index].kind && item.sourceId === items[index].sourceId);
}

/**
 * 회원 API(`api.member`: Bearer·401)로 프리셋을 다룬다(계약 P-1, NFR2.1). 성공 상태·모양이 다르면 모르는 실패로 본다.
 * 이름·자료 제목·자료 ID를 로그나 오류 보고에 남기지 않는다(NFR4.1).
 */
export function createPresetsApi(member: ApiClient["member"]) {
  return {
    list(signal?: AbortSignal) {
      return call(() => member("/presets", { method: "GET", signal }),
        (status, data): data is { presets: PresetSummary[] } => status === 200 && isPresetList(data), readFailureOf, "failed" as PresetReadFailure);
    },
    get(presetId: string, signal?: AbortSignal) {
      return call(() => member(itemPath(presetId), { method: "GET", signal }),
        (status, data): data is PresetDetail => status === 200 && isPresetDetail(data) && data.presetId === presetId,
        readFailureOf, "failed" as PresetReadFailure);
    },
    create(draft: PresetDraft) {
      return call(() => member("/presets", { method: "POST", body: { name: draft.name, items: refs(draft.items) } }),
        (status, data): data is { presetId: string } => status === 201 && isPresetId(data), presetSaveFailureOf, "failed" as PresetSaveFailure);
    },
    update(presetId: string, draft: PresetDraft) {
      return call(() => member(itemPath(presetId), { method: "PUT", body: { name: draft.name, items: refs(draft.items) } }),
        (status, data): data is { presetId: string } => status === 200 && isPresetId(data) && data.presetId === presetId,
        presetSaveFailureOf, "failed" as PresetSaveFailure);
    },
    remove(presetId: string) {
      return call(() => member(itemPath(presetId), { method: "DELETE" }),
        (status, data): data is null => status === 204 && data === null, readFailureOf, "failed" as PresetReadFailure);
    },
    /** 한 쪽(20개 이하)의 자료를 한 번에 센다(BR3.4, NFR6.4). 세기 실패는 막지 않는 쪽으로 다룬다(NFR5.1). */
    measure(items: readonly PresetItemRef[], signal?: AbortSignal) {
      return call(() => member("/presets/measure", { method: "POST", body: { items: refs(items) }, signal }),
        (status, data): data is { items: ItemMeasure[] } => status === 200 && measuredSame(items, data),
        readFailureOf, "failed" as PresetReadFailure);
    },
  };
}

export type PresetsApi = ReturnType<typeof createPresetsApi>;

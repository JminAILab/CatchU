import type { ApiClient } from "../../lib/api-client.ts";
import { codePointLength, saveFailureOf, type EditStatus, type SaveFailure } from "../../lib/save-outcome.ts";

/** 텍스트 자료 상한(api `TEXT_MATERIAL_LIMITS`, NFR4.2). 코드 포인트로 세며 제목은 앞뒤 공백을 지운 뒤 센다. */
export const MATERIAL_LIMITS = Object.freeze({ title: 100, body: 20000 });

/** 편집 화면에 항상 보이는 민감 정보 안내(BR3.3). 서비스는 내용을 찾아 가리지 않는다. */
export const SENSITIVE_INFO_NOTICE = "주민등록번호 같은 민감한 정보는 지우고 올려 주세요";

export type TextMaterial = { textMaterialId: string; title: string; body: string; createdAt: string; updatedAt: string };
export type TextMaterialItem = { textMaterialId: string; title: string; updatedAt: string };
export type TextMaterialPage = { items: TextMaterialItem[]; page: { nextCursor: string | null } };
export type MaterialDraft = { title: string; body: string };

export type MaterialResult<T> = { kind: "ok"; value: T } | { kind: "failed"; failure: SaveFailure };

const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown) => typeof v === "string" && v.length > 0;
const time = (v: unknown) => typeof v === "string" && !Number.isNaN(Date.parse(v));

export function isTextMaterial(value: unknown): value is TextMaterial {
  return record(value) && text(value.textMaterialId) && text(value.title) && typeof value.body === "string"
    && time(value.createdAt) && time(value.updatedAt);
}

export function isTextMaterialPage(value: unknown): value is TextMaterialPage {
  return record(value) && Array.isArray(value.items)
    && value.items.every((item) => record(item) && text(item.textMaterialId) && text(item.title) && time(item.updatedAt)
      && !("body" in item))
    && record(value.page) && (value.page.nextCursor === null || text(value.page.nextCursor));
}

/** 보내기 전 검사(BR3.2). 문제가 없으면 빈 배열. 값을 고치지 않고 안내만 돌려준다. */
export function materialDraftErrors(draft: MaterialDraft): string[] {
  const errors: string[] = [];
  const title = draft.title.trim();
  if (title.length === 0) errors.push("제목을 입력해 주세요.");
  else if (codePointLength(title) > MATERIAL_LIMITS.title) errors.push(`제목은 ${MATERIAL_LIMITS.title}자까지 쓸 수 있습니다.`);
  if (draft.body.trim().length === 0) errors.push("본문을 입력해 주세요.");
  else if (codePointLength(draft.body) > MATERIAL_LIMITS.body) {
    errors.push(`본문은 ${MATERIAL_LIMITS.body.toLocaleString("ko-KR")}자까지 쓸 수 있습니다.`);
  }
  return errors;
}

/** 편집 화면 값. `saved`는 서버가 마지막으로 확인해 준 값이며, 새 자료는 아직 저장 전이라 빈 값이다. */
export type MaterialEditState = { draft: MaterialDraft; saved: MaterialDraft; textMaterialId: string | null; status: EditStatus };

export function newMaterialState(): MaterialEditState {
  return { draft: { title: "", body: "" }, saved: { title: "", body: "" }, textMaterialId: null, status: { kind: "idle" } };
}

export function loadedMaterialState(material: TextMaterial): MaterialEditState {
  const saved = { title: material.title, body: material.body };
  return { draft: saved, saved, textMaterialId: material.textMaterialId, status: { kind: "idle" } };
}

/** 저장하지 않은 입력이 있는지(이탈 경고 대상, BR2.2). */
export function isMaterialDirty(state: Pick<MaterialEditState, "draft" | "saved">): boolean {
  return state.draft.title !== state.saved.title || state.draft.body !== state.saved.body;
}

/** 저장 결과 반영. 성공 응답일 때만 "저장됨"이며, 실패하면 입력을 그대로 두고 이유만 바꾼다(BR2.3). */
export function applyMaterialSave(state: MaterialEditState, result: MaterialResult<TextMaterial>): MaterialEditState {
  if (result.kind === "ok") return { ...loadedMaterialState(result.value), status: { kind: "saved" } };
  return { ...state, status: { kind: "failed", failure: result.failure } };
}

/** 목록 조회 실패 안내. 실패를 0건으로 보이지 않는다. */
export function materialListErrorText(failure: SaveFailure): string {
  if (failure === "login-expired") return "로그인이 만료되었습니다. 다시 로그인한 뒤 확인해 주세요.";
  return "자료 목록을 불러오지 못했습니다. 자료가 없다는 뜻은 아닙니다. 다시 불러와 주세요.";
}

/** 자료 열기 실패 안내. */
export function materialOpenErrorText(failure: SaveFailure): string {
  if (failure === "login-expired") return "로그인이 만료되었습니다. 다시 로그인한 뒤 확인해 주세요.";
  if (failure === "not-found") return "이 자료를 열 수 없습니다. 목록으로 돌아가 다시 선택해 주세요.";
  return "자료를 불러오지 못했습니다. 다시 불러와 주세요.";
}

/** 삭제 실패 안내. 접수만으로 삭제됨을 표시하지 않는다(NFR6.1·NFR7.5). */
export function materialDeleteErrorText(failure: SaveFailure): string {
  if (failure === "login-expired") return "삭제되지 않았습니다. 로그인이 만료되었습니다. 다시 로그인한 뒤 삭제해 주세요.";
  if (failure === "not-found") return "삭제되지 않았습니다. 이미 지워졌거나 열 수 없는 자료입니다. 목록을 다시 불러와 주세요.";
  return "삭제되지 않았습니다. 다시 시도해 주세요.";
}

async function call<T>(run: () => ReturnType<ApiClient["member"]>, ok: (status: number, data: unknown) => data is T):
  Promise<MaterialResult<T>> {
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

const itemPath = (id: string) => `/text-materials/${encodeURIComponent(id)}`;

/** 회원 API(`api.member`)로 텍스트 자료를 다룬다. 성공 상태·모양이 다르면 결과를 모르는 실패로 본다. */
export function createMaterialsApi(member: ApiClient["member"]) {
  return {
    list(cursor: string | null, signal?: AbortSignal) {
      const query = new URLSearchParams({ limit: "20" });
      if (cursor !== null) query.set("cursor", cursor);
      return call(() => member(`/text-materials?${query}`, { method: "GET", signal }),
        (status, data): data is TextMaterialPage => status === 200 && isTextMaterialPage(data));
    },
    get(id: string, signal?: AbortSignal) {
      return call(() => member(itemPath(id), { method: "GET", signal }),
        (status, data): data is TextMaterial => status === 200 && isTextMaterial(data) && data.textMaterialId === id);
    },
    create(draft: MaterialDraft, signal?: AbortSignal) {
      return call(() => member("/text-materials", { method: "POST", body: { title: draft.title, body: draft.body }, signal }),
        (status, data): data is TextMaterial => status === 201 && isTextMaterial(data));
    },
    update(id: string, draft: MaterialDraft, signal?: AbortSignal) {
      return call(() => member(itemPath(id), { method: "PUT", body: { title: draft.title, body: draft.body }, signal }),
        (status, data): data is TextMaterial => status === 200 && isTextMaterial(data) && data.textMaterialId === id);
    },
    remove(id: string, signal?: AbortSignal) {
      return call(() => member(itemPath(id), { method: "DELETE", signal }),
        (status, data): data is null => status === 204 && data === null);
    },
  };
}

export type MaterialsApi = ReturnType<typeof createMaterialsApi>;

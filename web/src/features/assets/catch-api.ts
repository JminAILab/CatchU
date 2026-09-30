import type { ApiResult } from "../../lib/api-response";
import type { CatchAsset } from "./types";

/** #106이 인증·base URL·/v1·공통 오류 처리를 담당한다. 이 경계는 토큰을 받거나 저장하지 않는다. */
export type MemberRequest = {
  method: "GET" | "PUT";
  cache: "no-store";
  signal?: AbortSignal;
  body?: Record<string, unknown>;
};
export type MemberTransport = (path: string, request: MemberRequest) => Promise<ApiResult>;
export type CatchFailure = Exclude<ApiResult, { kind: "success" }>;
export type CatchResult<T> = { kind: "success"; data: T } | CatchFailure;
export type CatchPage = { items: readonly CatchAsset[]; page: { nextCursor: string | null } };

const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");
const nonempty = (v: unknown) => typeof v === "string" && v.length > 0;
const generation = (v: unknown) => ["GENERATED", "FAILED", "NOT_GENERATED"].includes(v as string);

/** 손상된 200 응답을 0건이나 확인/공개 성공으로 표시하지 않는다. */
export function isCatch(value: unknown): value is CatchAsset {
  if (!record(value)) return false;
  return ["catchId", "title", "repositoryId", "sourceRequestId", "sourceResultId", "sourceCandidateId"].every((key) => nonempty(value[key]))
    && strings(value.workFacts) && typeof value.subjectContribution === "string"
    && Array.isArray(value.evidence) && value.evidence.every((e) => record(e)
      && ["catchEvidenceId", "sourceEvidenceId", "sourceUrl", "sourceRevision", "contributionScope"].every((key) => typeof e[key] === "string")
      && strings(e.representedFacts) && strings(e.coverageLimits))
    && record(value.draft) && generation(value.draft.status) && (value.draft.content === null || typeof value.draft.content === "string")
    && record(value.reflection) && generation(value.reflection.status) && strings(value.reflection.questions)
    && record(value.confirmation) && typeof value.confirmation.workFactsConfirmed === "boolean" && typeof value.confirmation.contributionConfirmed === "boolean"
    && typeof value.mismatch === "boolean" && ["PRIVATE", "PUBLIC"].includes(value.visibility as string)
    && ["NONE", "SOURCE_PRIVATE"].includes(value.restriction as string) && ["MOCK", "LIVE"].includes(value.sourceMode as string);
}

export function catchErrorText(error: CatchFailure | null, context: "catch" | "list" = "catch"): string {
  if (error?.kind === "api-error") {
    if (error.status === 401) return "로그인이 필요합니다. 다시 로그인한 뒤 확인해 주세요.";
    if (error.code === "RESOURCE_UNAVAILABLE") return context === "list"
      ? "목록을 불러올 수 없습니다. 다시 불러와 주세요."
      : "이 Catch를 열 수 없습니다. 목록으로 돌아가 주세요.";
    if (error.code === "CONFIRMATION_REQUIRED") return "작업 사실과 나의 기여를 먼저 확인해 주세요.";
    if (error.code === "SOURCE_RESTRICTED") return "원본 저장소가 보호되어 지금은 공개할 수 없습니다.";
  }
  return "요청 결과를 확인하지 못했습니다. 다시 불러와 현재 상태를 확인해 주세요.";
}

export function createCatchApi(transport: MemberTransport) {
  async function request<T>(path: string, options: MemberRequest, valid: (data: unknown) => data is T): Promise<CatchResult<T>> {
    try {
      const result = await transport(path, options);
      if (result.kind !== "success") return result;
      return result.status === 200 && valid(result.data)
        ? { kind: "success", data: result.data }
        : { kind: "lookup-failed", status: result.status, code: "LOOKUP_FAILED" };
    } catch {
      return { kind: "lookup-failed", status: null, code: "LOOKUP_FAILED" };
    }
  }
  return {
    list(repositoryId: string, cursor: string | null, signal?: AbortSignal) {
      const query = new URLSearchParams({ limit: "20" });
      if (repositoryId) query.set("repositoryId", repositoryId);
      if (cursor !== null) query.set("cursor", cursor);
      return request<CatchPage>(`/catches?${query}`, { method: "GET", cache: "no-store", signal },
        (v): v is CatchPage => record(v) && Array.isArray(v.items) && v.items.every(isCatch)
          && v.items.every((item) => !repositoryId || item.repositoryId === repositoryId)
          && record(v.page) && (v.page.nextCursor === null || nonempty(v.page.nextCursor)));
    },
    update(catchId: string, change: CatchChange) {
      const body = change.kind === "confirmation" ? { workFactsConfirmed: true, contributionConfirmed: true }
        : change.kind === "mismatch" ? { mismatch: change.mismatch } : { visibility: change.visibility };
      return request(`/catches/${encodeURIComponent(catchId)}/${change.kind}`, { method: "PUT", cache: "no-store", body },
        (v): v is CatchAsset => isCatch(v) && v.catchId === catchId
          && (change.kind === "confirmation" ? v.confirmation.workFactsConfirmed && v.confirmation.contributionConfirmed
            : change.kind === "mismatch" ? v.mismatch === change.mismatch : v.visibility === change.visibility));
    },
    detail(catchId: string, signal?: AbortSignal) {
      return request(`/catches/${encodeURIComponent(catchId)}`, { method: "GET", cache: "no-store", signal },
        (v): v is CatchAsset => isCatch(v) && v.catchId === catchId);
    },
  };
}
export type CatchChange =
  | { kind: "confirmation" }
  | { kind: "mismatch"; mismatch: boolean }
  | { kind: "visibility"; visibility: "PRIVATE" | "PUBLIC" };

export type CatchApi = ReturnType<typeof createCatchApi>;


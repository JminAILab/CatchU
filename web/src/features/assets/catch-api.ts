import type { ApiResult } from "../../lib/api-response";
import type { AuthorDescriptionFilter, CatchAsset, RevisitFact, RevisitFactKind } from "./types";

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
/** 본인 목록 걸러 보기. 빈 `repositoryId`와 `all`은 조건을 보내지 않는다. 커서는 이 걸러 보기에 묶인다(새 Catch C1). */
export type CatchListFilter = { readonly repositoryId: string; readonly authorDescription: AuthorDescriptionFilter };
export const ALL_CATCHES: CatchListFilter = Object.freeze({ repositoryId: "", authorDescription: "all" });

const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");
const nonempty = (v: unknown) => typeof v === "string" && v.length > 0;
const generation = (v: unknown) => ["GENERATED", "FAILED", "NOT_GENERATED"].includes(v as string);

// 종류별 [최소, 최대] 경로·커밋 수. api 등록 입력 검사(`new-catch-content.ts`)·worker `revisit.py`와 같은 표다(NC3 보안 설계 2절).
const REVISIT_FACT_COUNTS: Record<RevisitFactKind, { paths: [number, number]; commits: [number, number] }> = {
  REWORKED_LINES: { paths: [1, 1], commits: [2, 2] },
  MOVED_FILE: { paths: [2, 2], commits: [1, 2] },
  EXTENSION_CHANGED: { paths: [2, 2], commits: [1, 2] },
  REVERTED: { paths: [0, 0], commits: [2, 2] },
  TEST_FILES_PRESENT: { paths: [1, 20], commits: [1, 20] },
};
const MAX_REVISIT_FACTS = 30;
const MAX_REVISIT_PATH_CHARS = 1024;
const COMMIT_SHA = /^[0-9a-f]{40}$/;
const within = (count: number, [min, max]: [number, number]) => count >= min && count <= max;

/** 다시 볼 곳 사실 하나의 모양(칸 셋, 아는 kind, 종류별 개수, 경로 1~1,024자, 식별값 40자, 한 사실 안 겹침 없음). */
export function isRevisitFact(value: unknown): value is RevisitFact {
  if (!record(value) || Object.keys(value).length !== 3) return false;
  const { kind, paths, commits } = value;
  if (typeof kind !== "string" || !Object.hasOwn(REVISIT_FACT_COUNTS, kind) || !strings(paths) || !strings(commits)) return false;
  const counts = REVISIT_FACT_COUNTS[kind as RevisitFactKind];
  return within(paths.length, counts.paths) && within(commits.length, counts.commits)
    && paths.every((path) => [...path].length >= 1 && [...path].length <= MAX_REVISIT_PATH_CHARS)
    && commits.every((sha) => COMMIT_SHA.test(sha))
    && new Set(paths).size === paths.length && new Set(commits).size === commits.length;
}

const revisitFacts = (v: unknown) => Array.isArray(v) && v.length <= MAX_REVISIT_FACTS && v.every(isRevisitFact);

/** 손상된 200 응답을 0건이나 확인/공개 성공으로 표시하지 않는다. */
export function isCatch(value: unknown): value is CatchAsset {
  if (!record(value)) return false;
  return ["catchId", "repositoryId", "sourceRequestId", "sourceResultId", "sourceCandidateId"].every((key) => nonempty(value[key]))
    && (value.title === null || nonempty(value.title))
    && strings(value.workFacts) && typeof value.subjectContribution === "string"
    && Array.isArray(value.evidence) && value.evidence.every((e) => record(e)
      && ["catchEvidenceId", "sourceEvidenceId", "sourceUrl", "sourceRevision", "contributionScope"].every((key) => typeof e[key] === "string")
      && strings(e.representedFacts) && strings(e.coverageLimits))
    && record(value.draft) && generation(value.draft.status) && (value.draft.content === null || typeof value.draft.content === "string")
    && record(value.reflection) && generation(value.reflection.status) && strings(value.reflection.questions)
    && record(value.confirmation) && typeof value.confirmation.workFactsConfirmed === "boolean" && typeof value.confirmation.contributionConfirmed === "boolean"
    && typeof value.mismatch === "boolean" && ["PRIVATE", "PUBLIC"].includes(value.visibility as string)
    && ["NONE", "SOURCE_PRIVATE"].includes(value.restriction as string) && ["MOCK", "LIVE"].includes(value.sourceMode as string)
    && typeof value.hasAuthorDescription === "boolean"
    // 모양이 틀린 사실이 든 응답은 받지 못한 것으로 본다(NC3 BR8.1). 문장 코드는 검사를 통과한 값만 받는다.
    && revisitFacts(value.revisitFacts);
}

/** 걸러 보기와 맞지 않는 항목이 든 200은 성공으로 보지 않는다(`written`이면 모두 참, `unwritten`이면 모두 거짓). */
function matchesFilter(item: CatchAsset, filter: CatchListFilter): boolean {
  if (filter.repositoryId && item.repositoryId !== filter.repositoryId) return false;
  if (filter.authorDescription === "written") return item.hasAuthorDescription;
  if (filter.authorDescription === "unwritten") return !item.hasAuthorDescription;
  return true;
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
    list(filter: CatchListFilter, cursor: string | null, signal?: AbortSignal) {
      const query = new URLSearchParams({ limit: "20" });
      if (filter.repositoryId) query.set("repositoryId", filter.repositoryId);
      if (filter.authorDescription !== "all") query.set("authorDescription", filter.authorDescription);
      if (cursor !== null) query.set("cursor", cursor);
      return request<CatchPage>(`/catches?${query}`, { method: "GET", cache: "no-store", signal },
        (v): v is CatchPage => record(v) && Array.isArray(v.items) && v.items.every(isCatch)
          && v.items.every((item) => matchesFilter(item, filter))
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


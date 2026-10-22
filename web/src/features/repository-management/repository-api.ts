import type { ApiResult } from "../../lib/api-response";

/**
 * 저장소 연결 관리(D, #153)가 읽는 회원 API. 인증·기준 주소·/v1·공통 오류 해석은 #106의 api.member가 맡는다.
 * 계약: member-api.yaml의 GET /me, GET /me/repositories, GET /analysis-requests.
 * 응답 모양이 계약과 다르면 빈 목록으로 바꾸지 않고 조회 실패로 돌려준다.
 */

export type RepositoryTransport = (path: string, request: { method: "GET"; signal?: AbortSignal }) => Promise<ApiResult>;
export type LookupFailure = Exclude<ApiResult, { kind: "success" }>;
export type Lookup<T> = { kind: "success"; data: T } | LookupFailure;

export type GitHubState = "CONNECTED" | "DISCONNECTED" | "REAUTH_REQUIRED";
export type EligibleRepository = { repositoryId: string; name: string; ownerLogin: string; url: string };
/** 분석 요청(#154)이 쓰는 선정 저장소. 동의 본문에 실을 현재 허용 범위 판본(allowedScopeRevision)을 보존한다. */
export type AnalyzableRepository = EligibleRepository & { allowedScopeRevision: string };

export const PROCESSING = ["QUEUED", "RUNNING", "UNCERTAIN", "SUCCEEDED", "EMPTY", "PARTIAL_FAILED", "FAILED"] as const;
export const APPLICATION = ["NOT_READY", "PENDING", "APPLYING", "RECOVERING", "APPLIED", "APPLY_FAILED"] as const;
export const LIFECYCLE = ["ACTIVE", "CLOSED"] as const;
export type Processing = (typeof PROCESSING)[number];
export type Application = (typeof APPLICATION)[number];
/** ACTIVE: 아직 처리·반영 중. CLOSED: 서버가 이 요청을 더 처리·반영하지 않는다(반영 완료·반영 실패·처리 시한 초과 포함). */
export type Lifecycle = (typeof LIFECYCLE)[number];
/** 실패 항목. stage·code는 종료 사유 판정에 쓰고, message는 화면 문구로 쓴다. */
export type AnalysisFailure = { stage: string; code: string; message: string };

/** 화면이 쓰는 AnalysisStatus 필드만 담는다. */
export type AnalysisSummary = {
  requestId: string;
  repositoryId: string;
  submittedAt: string;
  updatedAt: string;
  lifecycle: Lifecycle;
  processing: Processing;
  application: Application;
  registeredCatchIds: readonly string[];
  ownerResultsReady: boolean;
  retryAllowed: boolean;
  failures: readonly AnalysisFailure[];
};

/** 한 번의 목록 조회에서 따라갈 최대 페이지 수. 넘으면 일부만 보여 주지 않고 조회 실패로 돌려준다. */
export const MAX_PAGES = 20;
const PAGE_LIMIT = 100;
const LOOKUP_FAILED: LookupFailure = { kind: "lookup-failed", status: null, code: "LOOKUP_FAILED" };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === "string";
const isId = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const isTime = (value: unknown): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value));
const oneOf = <T extends string>(values: readonly T[], value: unknown): value is T => values.includes(value as T);

/** 계약 Failure의 필수 필드(stage·code·message)가 문자열인 항목. stage 값의 종류는 화면이 판정에 쓰는 것만 비교한다. */
const isFailure = (value: unknown): value is AnalysisFailure =>
  isRecord(value) && isText(value.stage) && isText(value.code) && isText(value.message);

export function readGitHubState(value: unknown): GitHubState | null {
  if (!isRecord(value) || !isRecord(value.github)) return null;
  const state = value.github.state;
  return oneOf(["CONNECTED", "DISCONNECTED", "REAUTH_REQUIRED"] as const, state) ? state : null;
}

export function readRepository(value: unknown): EligibleRepository | null {
  if (!isRecord(value) || !isId(value.repositoryId) || !isText(value.name) || !isText(value.ownerLogin) || !isText(value.url)) return null;
  return { repositoryId: value.repositoryId, name: value.name, ownerLogin: value.ownerLogin, url: value.url };
}

export function readAnalysis(value: unknown): AnalysisSummary | null {
  if (!isRecord(value) || !isId(value.requestId) || !isId(value.repositoryId)) return null;
  if (!isTime(value.submittedAt) || !isTime(value.updatedAt)) return null;
  if (!oneOf(LIFECYCLE, value.lifecycle)) return null;
  if (!oneOf(PROCESSING, value.processing) || !oneOf(APPLICATION, value.application)) return null;
  if (!Array.isArray(value.registeredCatchIds) || !value.registeredCatchIds.every(isId)) return null;
  if (typeof value.ownerResultsReady !== "boolean") return null;
  if (!isRecord(value.retry) || typeof value.retry.allowed !== "boolean") return null;
  if (!Array.isArray(value.failures) || !value.failures.every(isFailure)) return null;
  return {
    requestId: value.requestId,
    repositoryId: value.repositoryId,
    submittedAt: value.submittedAt,
    updatedAt: value.updatedAt,
    lifecycle: value.lifecycle,
    processing: value.processing,
    application: value.application,
    registeredCatchIds: value.registeredCatchIds,
    ownerResultsReady: value.ownerResultsReady,
    retryAllowed: value.retry.allowed,
    failures: value.failures.map(({ stage, code, message }) => ({ stage, code, message })),
  };
}

/**
 * 계약 Repository의 필수 필드를 모두 확인한다. allowedScopeRevision이 없거나 빈 값·문자열이 아니면 null이다.
 * 기존 readRepository(이름 결합용)는 바꾸지 않고, 분석 요청 경로만 이 함수로 판본까지 검증한다.
 */
export function readAnalyzableRepository(value: unknown): AnalyzableRepository | null {
  const repository = readRepository(value);
  if (repository === null || !isRecord(value) || !isId(value.allowedScopeRevision)) return null;
  return { ...repository, allowedScopeRevision: value.allowedScopeRevision };
}

export function createRepositoryApi(transport: RepositoryTransport) {
  async function get(path: string, signal?: AbortSignal): Promise<Lookup<unknown>> {
    try {
      const result = await transport(path, { method: "GET", signal });
      return result.kind === "success" ? { kind: "success", data: result.data } : result;
    } catch {
      return LOOKUP_FAILED;
    }
  }

  /** nextCursor를 끝까지 따라가 모든 항목을 모은다. 항목 하나라도 계약과 다르면 전체를 조회 실패로 본다. */
  async function readAllPages<T>(path: string, read: (value: unknown) => T | null, signal?: AbortSignal): Promise<Lookup<T[]>> {
    const items: T[] = [];
    const seen = new Set<string>();
    let cursor: string | null = null;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const query = new URLSearchParams({ limit: String(PAGE_LIMIT) });
      if (cursor !== null) query.set("cursor", cursor);
      const result = await get(`${path}?${query}`, signal);
      if (result.kind !== "success") return result;
      const body = result.data;
      if (!isRecord(body) || !Array.isArray(body.items) || !isRecord(body.page)) return LOOKUP_FAILED;
      const next = body.page.nextCursor;
      if (next !== null && !isId(next)) return LOOKUP_FAILED;
      for (const raw of body.items) {
        const item = read(raw);
        if (item === null) return LOOKUP_FAILED;
        items.push(item);
      }
      if (next === null) return { kind: "success", data: items };
      if (seen.has(next)) return LOOKUP_FAILED;
      seen.add(next);
      cursor = next;
    }
    return LOOKUP_FAILED;
  }

  return {
    async githubState(signal?: AbortSignal): Promise<Lookup<GitHubState>> {
      const result = await get("/me", signal);
      if (result.kind !== "success") return result;
      const state = readGitHubState(result.data);
      return state === null ? LOOKUP_FAILED : { kind: "success", data: state };
    },
    repositories: (signal?: AbortSignal) => readAllPages("/me/repositories", readRepository, signal),
    /** 같은 선정 목록을 판본까지 검증해 읽는다(#154). 항목 하나라도 판본이 없거나 잘못되면 전체를 조회 실패로 본다. */
    analyzableRepositories: (signal?: AbortSignal) => readAllPages("/me/repositories", readAnalyzableRepository, signal),
    analyses: (signal?: AbortSignal) => readAllPages("/analysis-requests", readAnalysis, signal),
  };
}

export type RepositoryApi = ReturnType<typeof createRepositoryApi>;

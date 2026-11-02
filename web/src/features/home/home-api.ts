import { createRepositoryApi, type Lookup, type LookupFailure, type RepositoryTransport } from "../repository-management/repository-api.ts";
import type { HomeLookup, HomeStatus } from "./home-readiness.ts";

/**
 * 홈(#155)이 읽는 회원 API. 인증·기준 주소·/v1·공통 오류 해석은 #106의 api.member가 맡는다.
 * 계약: member-api.yaml의 GET /me(GitHub 연동 상태, #153의 `githubState()`를 그대로 쓴다)와
 * GET /me/analysis-summary(#432 계약, #434 구현). 응답 모양이 계약과 다르면 이력 없음으로 바꾸지 않고 조회 실패로 돌려준다.
 */

const LOOKUP_FAILED: LookupFailure = { kind: "lookup-failed", status: null, code: "LOOKUP_FAILED" };

/** `{ hasAcceptedAnalysisRepository: boolean }`의 값. 필드가 없거나 boolean이 아니면 null(계약과 다른 응답)이다. */
export function readAnalysisSummary(value: unknown): boolean | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const has = (value as Record<string, unknown>).hasAcceptedAnalysisRepository;
  return typeof has === "boolean" ? has : null;
}

export function createHomeApi(transport: RepositoryTransport) {
  const repositories = createRepositoryApi(transport);

  async function analysisSummary(signal?: AbortSignal): Promise<Lookup<boolean>> {
    try {
      const result = await transport("/me/analysis-summary", { method: "GET", signal });
      if (result.kind !== "success") return result;
      const has = readAnalysisSummary(result.data);
      return has === null ? LOOKUP_FAILED : { kind: "success", data: has };
    } catch {
      return LOOKUP_FAILED;
    }
  }

  return {
    /**
     * GitHub 연동 상태를 먼저 읽고, 연결됨일 때만 접수 이력 유무를 이어서 읽는다(#155 합의: 이 값은 연결 상태에서만 쓴다).
     * 어느 조회든 실패하면 그 실패를 돌려준다. 이력 유무 실패를 이력 없음(false)으로 바꾸지 않는다.
     */
    async status(signal?: AbortSignal): Promise<Lookup<HomeStatus>> {
      const github = await repositories.githubState(signal);
      if (github.kind !== "success") return github;
      if (github.data !== "CONNECTED") return { kind: "success", data: { github: github.data } };
      // 연결 상태를 읽는 사이 화면 이탈·세션 변경·재조회로 중단됐으면 이력 조회를 보내지 않는다.
      if (signal?.aborted) return LOOKUP_FAILED;
      const summary = await analysisSummary(signal);
      if (summary.kind !== "success") return summary;
      return { kind: "success", data: { github: "CONNECTED", hasAcceptedAnalysisRepository: summary.data } };
    },
  };
}

/** 한 번의 홈 조회 결과. 어느 세션의 몇 번째 조회인지와 함께 둔다. */
export type HomeResult<S> = { session: S; attempt: number; lookup: Lookup<HomeStatus> };

/**
 * 홈 조회 한 번을 시작하고 중단 함수를 돌려준다. 중단은 화면 이탈·세션 변경·재조회 때 effect 정리에서 부른다.
 * 응답은 중단되지 않았고 그 세션이 아직 현재일 때만 `deliver`로 넘긴다. 회원 전환·로그아웃·이탈·재조회 뒤 늦게 온 응답은 버린다.
 */
export function startHomeLookup<S>(
  load: (signal: AbortSignal) => Promise<Lookup<HomeStatus>>,
  key: { session: S; attempt: number },
  isCurrentSession: (session: S) => boolean,
  deliver: (result: HomeResult<S>) => void,
): () => void {
  const abort = new AbortController();
  void load(abort.signal).then((lookup) => {
    if (!abort.signal.aborted && isCurrentSession(key.session)) deliver({ ...key, lookup });
  });
  return () => abort.abort();
}

/** 지금 그릴 조회 결과. 현재 세션·현재 재조회 번호의 결과가 아니면 조회 중으로 본다(이전 회원·이전 조회의 결과를 그리지 않는다). */
export function currentHomeLookup<S>(result: HomeResult<S> | null, session: S, attempt: number): HomeLookup {
  return result !== null && result.session === session && result.attempt === attempt ? result.lookup : { state: "loading" };
}

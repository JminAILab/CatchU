import type { ApiResult } from "../../lib/api-response.ts";
import { readAnalysis, type AnalysisSummary, type LookupFailure } from "../repository-management/repository-api.ts";

/**
 * 분석 고지 조회와 분석 요청(동의 포함) 접수(#154). 인증·기준 주소·/v1·공통 오류 해석은 #106의 api.member가 맡는다.
 * 계약: member-api.yaml의 GET /analysis-notice, POST /analysis-requests, common.yaml의 AnalysisCreate·AnalysisStatus.
 * 접수 허용은 서버가 판정한다. 이 파일은 응답 모양만 확인하고 업무 판정을 다시 하지 않는다.
 */

export type AnalysisRequestTransport = (path: string, request: {
  method: "GET" | "POST";
  body?: unknown;
  idempotencyKey?: string;
  signal?: AbortSignal;
}) => Promise<ApiResult>;

export type Result<T> = { kind: "success"; data: T } | LookupFailure;

/** 현재 고지. text는 LF로 줄을 나눈 일반 텍스트다(HTML·마크다운 아님). */
export type AnalysisNotice = { noticeRevision: string; text: string };

/**
 * 동의와 요청을 한 번에 보내는 본문(AnalysisCreate). 같은 키에는 같은 본문만 보낸다.
 * 첫 요청은 retryOfRequestId를 넣지 않는다. 재분석은 「연결된 저장소」의 최신 요청 ID를 넣고 새 동의·새 키로 보낸다.
 */
export type AnalysisCreateBody = {
  repositoryId: string;
  consent: { accepted: true; noticeRevision: string; scopeRevision: string };
  retryOfRequestId?: string;
};

/** 202는 새 요청 접수, 200은 같은 저장소의 진행 중 작업이거나 같은 키의 기존 결과다. 둘 다 처리 완료가 아니다. */
export type CreateOutcome = { kind: "accepted" | "existing"; status: AnalysisSummary };

const LOOKUP_FAILED: LookupFailure = { kind: "lookup-failed", status: null, code: "LOOKUP_FAILED" };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isId = (value: unknown): value is string => typeof value === "string" && value.length > 0;

const FAILURE_STAGES = ["COLLECTION", "ANALYSIS", "DRAFT", "REFLECTION", "APPLICATION", "DISPATCH"] as const;
const RETRY_REASONS = ["FAILURE_WITHOUT_RESULTS", "ANALYSIS_FINISHED", "IN_PROGRESS", "RESULTS_EXIST", "NOT_FAILED", "EXECUTION_UNCERTAIN", "APPLICATION_UNRESOLVED", "REANALYSIS_DEFERRED"] as const;
const oneOf = (values: readonly string[], value: unknown): boolean => typeof value === "string" && values.includes(value);

/** date-time에는 시각·시간대가 필요하다. Date.parse가 보정하는 2월 30일 등도 받지 않는다. */
function isDateTime(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/i.exec(value);
  if (!parts || !Number.isFinite(Date.parse(value))) return false;
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}

/**
 * 접수 확정 전에 AnalysisStatus 전체 필드를 검사한 뒤 화면 요약으로 줄인다.
 * 공통 클라이언트 규약대로 추가 응답 필드는 무시한다. 기존 목록용 readAnalysis의 허용 범위는 바꾸지 않는다.
 * 200은 저장된 요청의 현재 상태도 반환하므로 ACTIVE/QUEUED 같은 업무 상태를 강제하지 않는다.
 */
function readStatusResponse(value: unknown): AnalysisSummary | null {
  if (!isRecord(value) || !isId(value.consentId) || !isId(value.attemptId)) return null;
  if (value.requestState !== "ACCEPTED" || !oneOf(["MOCK", "LIVE"], value.sourceMode)) return null;
  if (!isDateTime(value.submittedAt) || !isDateTime(value.updatedAt)) return null;
  if (typeof value.eligibleCandidateCount !== "number" || !Number.isInteger(value.eligibleCandidateCount) || value.eligibleCandidateCount < 0) return null;
  if (!isRecord(value.retry) || !oneOf(RETRY_REASONS, value.retry.reason)) return null;
  if (!Array.isArray(value.failures) || !value.failures.every((failure) => isRecord(failure)
    && oneOf(FAILURE_STAGES, failure.stage) && (!("candidateId" in failure) || isId(failure.candidateId)))) return null;
  // 나머지 필수 필드·enum·타입과 Failure의 code/message는 기존 요약 해석기가 함께 검사한다.
  return readAnalysis(value);
}

export function readNotice(value: unknown): AnalysisNotice | null {
  if (!isRecord(value) || !isId(value.noticeRevision) || typeof value.text !== "string") return null;
  return { noticeRevision: value.noticeRevision, text: value.text };
}

export function createAnalysisRequestApi(transport: AnalysisRequestTransport) {
  async function call(path: string, request: Parameters<AnalysisRequestTransport>[1]): Promise<ApiResult> {
    try {
      return await transport(path, request);
    } catch {
      return LOOKUP_FAILED;
    }
  }

  return {
    async notice(signal?: AbortSignal): Promise<Result<AnalysisNotice>> {
      const result = await call("/analysis-notice", { method: "GET", signal });
      if (result.kind !== "success") return result;
      const notice = readNotice(result.data);
      return notice ? { kind: "success", data: notice } : { kind: "lookup-failed", status: result.status, code: "LOOKUP_FAILED" };
    },

    /**
     * 접수 POST. 202·200이 아니거나 본문이 계약과 다르거나 다른 저장소의 상태가 오면 접수 여부를 모르는 결과(조회 실패)로 돌려준다.
     * 이때 호출한 쪽은 키를 버리지 않고 같은 키·본문으로만 다시 보내 결과를 확인한다.
     * 응답을 받기 전에 화면이 닫혀도 취소하지 않는다(취소해도 서버 처리는 멈추지 않으므로 결과를 받아 둔다).
     */
    async create(body: AnalysisCreateBody, idempotencyKey: string): Promise<Result<CreateOutcome>> {
      const result = await call("/analysis-requests", { method: "POST", body, idempotencyKey });
      if (result.kind !== "success") return result;
      const status = readStatusResponse(result.data);
      const kind = result.status === 202 ? "accepted" : result.status === 200 ? "existing" : null;
      if (!status || !kind || status.repositoryId !== body.repositoryId) {
        return { kind: "lookup-failed", status: result.status, code: "LOOKUP_FAILED" };
      }
      return { kind: "success", data: { kind, status } };
    },
  };
}

export type AnalysisRequestApi = ReturnType<typeof createAnalysisRequestApi>;

import type { ApiClient, ClientResult } from "../../lib/api-client.ts";
import { memberAuthRejected, memberMutationOutcome, type MemberMutationOutcome } from "../../lib/auth-api.ts";
import { isAccepted, isJd, isJdItem, isJdRun, isJdRunItem, isPage } from "./jd-parsers.ts";
import type { Jd, JdDraft, JdItem, JdRecipientContext, JdRun, JdRunItem, Page } from "./jd-types.ts";

export type JdRequest = { method: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown; signal?: AbortSignal; linkGrant?: string };
export type JdTransport = (path: string, request: JdRequest) => Promise<ClientResult>;
export type JdFailure = { kind: "failed"; status: number | null; code: string; outcome: MemberMutationOutcome };
export type JdResult<T> = { kind: "ok"; value: T } | JdFailure;
const unavailableResults = new WeakSet<object>();
const unavailable = (): ClientResult => {
  const result: ClientResult = { kind: "lookup-failed", status: null, code: "LOOKUP_FAILED" };
  unavailableResults.add(result);
  return result;
};

/** 공용 PATCH/동시 헤더 제공 전에는 우회 전송하지 않는다. 기존 회원 호출만 연결한다. */
export function managementTransport(member: ApiClient["member"], patch?: JdTransport): JdTransport {
  return (path, request) => {
    if (request.linkGrant !== undefined || path.startsWith("/public/")) return Promise.resolve(unavailable());
    if (request.method === "PATCH") return patch ? patch(path, request) : Promise.resolve(unavailable());
    return member(path, { method: request.method, body: request.body, signal: request.signal });
  };
}
export function jdFailure(result: ClientResult): JdFailure {
  return { kind: "failed", status: result.status, code: unavailableResults.has(result) ? "CONNECTION_NOT_READY"
    : result.kind === "success" ? "INVALID_RESPONSE" : result.code,
    outcome: memberAuthRejected(result) ? "not-sent" : memberMutationOutcome(result) };
}
export async function safelySend(transport: JdTransport, path: string, request: JdRequest): Promise<ClientResult> {
  try { return await transport(path, request); }
  catch { return { kind: "lookup-failed", status: null, code: "LOOKUP_FAILED" }; }
}
export function decode<T>(result: ClientResult, expected: number, valid: (v: unknown) => v is T): JdResult<T> {
  return result.kind === "success" && result.status === expected && valid(result.data)
    ? { kind: "ok", value: result.data } : jdFailure(result);
}
const pageQuery = (cursor: string | null) => cursor === null ? "" : `?${new URLSearchParams({ cursor })}`;
const itemPath = (id: string) => `/jds/${encodeURIComponent(id)}`;
const summaryPath = (token: string) => `/public/links/${encodeURIComponent(token)}/jd-summaries`;

export function createJdApi(transport: JdTransport) {
  const call = <T>(path: string, request: JdRequest, expected: number, valid: (v: unknown) => v is T) =>
    safelySend(transport, path, request).then((result) => decode(result, expected, valid));
  const recipientRequest = (context: JdRecipientContext, method: "GET" | "POST", signal?: AbortSignal): JdRequest => {
    const grant = context.getGrant();
    return { method, signal, ...(grant ? { linkGrant: grant } : {}) };
  };
  return {
    list: (cursor: string | null = null, signal?: AbortSignal) => call(`/jds${pageQuery(cursor)}`, { method: "GET", signal }, 200,
      (v): v is Page<JdItem> => isPage(v, isJdItem)),
    get: (id: string, signal?: AbortSignal) => call(itemPath(id), { method: "GET", signal }, 200,
      (v): v is Jd => isJd(v) && v.jdId === id),
    create: (draft: JdDraft) => call("/jds", { method: "POST", body: { title: draft.title, body: draft.body } }, 201, isJd),
    update: (id: string, draft: JdDraft) => call(itemPath(id), { method: "PATCH", body: { title: draft.title, body: draft.body } }, 200,
      (v): v is Jd => isJd(v) && v.jdId === id),
    remove: (id: string) => call(itemPath(id), { method: "DELETE" }, 204, (v): v is null => v === null),
    acceptRaw: (context: JdRecipientContext, jdId: string) => safelySend(transport, summaryPath(context.token),
      { ...recipientRequest(context, "POST"), body: { jdId } }),
    accepted: (result: ClientResult) => decode(result, 202, isAccepted),
    listRuns: (context: JdRecipientContext, cursor: string | null = null) => call(`${summaryPath(context.token)}${pageQuery(cursor)}`,
      recipientRequest(context, "GET"), 200, (v): v is Page<JdRunItem> => isPage(v, isJdRunItem)),
    getRun: (context: JdRecipientContext, runId: string) => call(`${summaryPath(context.token)}/${encodeURIComponent(runId)}`,
      recipientRequest(context, "GET"), 200, (v): v is JdRun => isJdRun(v)),
  };
}
export type JdApi = ReturnType<typeof createJdApi>;

export function jdErrorText(failure: JdFailure): string {
  if (failure.outcome === "discarded") return "로그인이 바뀌어 결과를 확인하지 못했습니다. 목록을 다시 확인해 주세요.";
  if (failure.outcome === "renewed-rejected") return "로그인을 갱신했지만 요청은 처리되지 않았습니다. 다시 눌러 주세요.";
  if (failure.outcome === "not-sent") return "요청이 처리되지 않았습니다. 로그인 상태를 확인한 뒤 다시 눌러 주세요.";
  const messages: Record<string, string> = {
    AUTH_REQUIRED: "로그인이 필요합니다. 다시 로그인해 주세요.", AUTH_INVALID: "로그인이 만료되었습니다. 다시 로그인해 주세요.",
    RESOURCE_UNAVAILABLE: "이 JD 또는 실행을 열 수 없습니다. 목록을 다시 확인해 주세요.",
    AI_CONSENT_REQUIRED: "외부 AI 이용 동의가 필요합니다. 동의 상태를 확인한 뒤 다시 실행해 주세요.",
    INDEX_NOT_READY: "자료 검색이 아직 준비되지 않았습니다. 준비된 뒤 다시 실행해 주세요.",
    INPUT_TOO_LARGE: "입력 상한을 넘었습니다. JD 관리에서 내용을 수정해 주세요.",
    INVALID_INPUT: "입력을 확인해 주세요. 실행은 접수되지 않았습니다.",
    DAILY_LIMIT_REACHED: "오늘의 JD 요약 실행 한도에 도달했습니다.",
    CONNECTION_NOT_READY: "수정 기능을 준비하고 있습니다. 입력은 그대로 유지됩니다.",
  };
  return messages[failure.code] ?? "요청 결과를 확인하지 못했습니다. 잠시 뒤 목록을 다시 확인해 주세요.";
}

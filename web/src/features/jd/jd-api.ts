import type { ApiClient, ClientResult } from "../../lib/api-client.ts";
import { memberAuthRejected, memberMutationOutcome, type MemberMutationOutcome } from "../../lib/auth-api.ts";
import { U2_ERROR_MESSAGES } from "../../lib/u2-error-messages.ts";
import { isAccepted, isJd, isJdItem, isJdRun, isJdRunItem, isPage } from "./jd-parsers.ts";
import type { Jd, JdDraft, JdItem, JdRecipientContext, JdRun, JdRunItem, Page } from "./jd-types.ts";

export type JdRequest = { method: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown; signal?: AbortSignal; linkGrant?: string };
export type JdTransport = (path: string, request: JdRequest) => Promise<ClientResult>;
export type JdFailure = { kind: "failed"; status: number | null; code: string; outcome: MemberMutationOutcome };
export type JdResult<T> = { kind: "ok"; value: T } | JdFailure;
/** #471의 공용 회원 호출을 사용한다. 요약도 Bearer와 grant를 함께 보내며 갱신·재전송은 공용 경계가 맡는다. */
export function memberTransport(member: ApiClient["member"]): JdTransport {
  // 결과 객체를 복사하지 않아 공용 not-sent/discarded 표식을 보존한다.
  return (path, request) => member(path, request);
}

/** 관리 페이지와 C-11의 JdRecipientPanel이 같은 공용 회원 인증 어댑터를 사용한다. */
export function createMemberJdApi(member: ApiClient["member"]) {
  return createJdApi(memberTransport(member));
}
export function jdFailure(result: ClientResult): JdFailure {
  return { kind: "failed", status: result.status, code: result.kind === "success" ? "INVALID_RESPONSE" : result.code,
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
  const summaryRequest = (context: JdRecipientContext, method: "GET" | "POST", signal?: AbortSignal): JdRequest => {
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
      { ...summaryRequest(context, "POST"), body: { jdId } }),
    accepted: (result: ClientResult) => decode(result, 202, isAccepted),
    listRuns: (context: JdRecipientContext, cursor: string | null = null) => call(`${summaryPath(context.token)}${pageQuery(cursor)}`,
      summaryRequest(context, "GET"), 200, (v): v is Page<JdRunItem> => isPage(v, isJdRunItem)),
    getRun: (context: JdRecipientContext, runId: string) => call(`${summaryPath(context.token)}/${encodeURIComponent(runId)}`,
      summaryRequest(context, "GET"), 200, (v): v is JdRun => isJdRun(v)),
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
    // 하루 횟수는 분석·기본 요약·JD 요약이 함께 쓰는 하나라 U2 공용 문구를 그대로 쓴다(FR6.6).
    DAILY_LIMIT_REACHED: U2_ERROR_MESSAGES.DAILY_LIMIT_REACHED,
  };
  return messages[failure.code] ?? "요청 결과를 확인하지 못했습니다. 잠시 뒤 목록을 다시 확인해 주세요.";
}

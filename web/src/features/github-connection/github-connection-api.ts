import type { ApiClient, ClientResult } from "../../lib/api-client.ts";
import { readGitHubState, type GitHubState } from "../repository-management/repository-api.ts";

/**
 * GitHub 연동 화면(W02-G, #253)이 부르는 회원 API(#231). 인증·기준 주소·/v1·공통 오류 해석은 #106의 api.member가 맡는다.
 * 계약: member-api.yaml의 GET /me(`github`), POST /me/github/authorization, POST /me/github/connection.
 * 연동 상태 값 목록은 저장소 연결 관리(#153)의 `readGitHubState`를 그대로 쓴다.
 * 응답 모양이 계약과 다르면 성공으로 쓰지 않는다. 토큰·code·state를 로그에 남기지 않는다.
 */

type MemberApi = Pick<ApiClient, "member">;

export type GitHubConnection = { state: GitHubState; accountLogin: string | null };

/** 연결 상태 조회. 조회 실패·계약과 다른 응답은 미연결로 바꾸지 않는다. */
export type ConnectionLookup = { kind: "loaded"; connection: GitHubConnection } | { kind: "failed" };

/**
 * 연결 시작 결과.
 * - `unavailable`: 이 환경에서 GitHub 연결 기능이 꺼져 있다(403 `GITHUB_CONNECTION_REQUIRED`).
 * - `auth`: CatchU 인증 오류(401). api.member가 토큰을 지우고 공통 인증 흐름이 처리하므로 화면은 따로 안내하지 않는다.
 * - `failed`: 그 밖의 거부·서버 오류·통신 실패·계약과 다른 응답. 시작은 아무것도 저장하지 않으므로 다시 누르면 새로 시작한다.
 */
export type StartResult =
  | { kind: "ready"; authorizationUrl: string }
  | { kind: "failed"; reason: "unavailable" | "auth" | "failed" };

/**
 * 연결 완료 결과.
 * - `connected`: 서버가 연결을 저장하고 CONNECTED를 돌려줬다. 이것만 연결 성공이다.
 * - `rejected`: state 만료·이미 사용·대체, 권한·발급 응답 불일치(400 `INVALID_REQUEST`), 형식 오류(400 `VALIDATION_FAILED`),
 *   그 밖의 4xx. 연결은 바뀌지 않았고 다시 연결하려면 새로 시작해야 한다.
 * - `unavailable`: 403 `GITHUB_CONNECTION_REQUIRED`(기능 꺼짐).
 * - `auth`: CatchU 인증 오류(401). 서버가 완료를 처리하지 않았다.
 * - `unknown`: 5xx·통신 실패·계약과 다른 성공 응답. 서버가 저장했는지 알 수 없다. 같은 code는 다시 보내지 않고 연결 상태만 다시 읽는다.
 */
export type CompletionResult =
  | { kind: "connected"; accountLogin: string }
  | { kind: "rejected" }
  | { kind: "unavailable" }
  | { kind: "auth" }
  | { kind: "unknown" };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const STATE_PATTERN = /^[a-f0-9]{64}$/;
/** API 완료 경로의 code 형식(#231 컨트롤러)과 같다. 다르면 보내지 않는다. */
const CODE_PATTERN = /^[!-~]{1,512}$/;
const GITHUB_AUTHORIZE_ORIGIN = "https://github.com";
const GITHUB_AUTHORIZE_PATH = "/login/oauth/authorize";

const isAuthFailure = (result: ClientResult) =>
  result.kind === "api-error" && result.status === 401 && (result.code === "AUTH_REQUIRED" || result.code === "AUTH_INVALID");
const isConnectionOff = (result: ClientResult) =>
  result.kind === "api-error" && result.status === 403 && result.code === "GITHUB_CONNECTION_REQUIRED";

/** GET /me 응답의 `github`. 상태가 계약 값이 아니거나 계정명이 문자열·null이 아니면 null. */
export function readGitHubConnection(value: unknown): GitHubConnection | null {
  const state = readGitHubState(value);
  if (state === null || !isRecord(value) || !isRecord(value.github)) return null;
  const login = value.github.accountLogin;
  if (login !== null && typeof login !== "string") return null;
  return { state, accountLogin: login };
}

export async function readConnection(api: MemberApi, signal?: AbortSignal): Promise<ConnectionLookup> {
  const result = await api.member("/me", { signal });
  const connection = result.kind === "success" ? readGitHubConnection(result.data) : null;
  return connection ? { kind: "loaded", connection } : { kind: "failed" };
}

/**
 * 시작 응답의 인증 주소가 GitHub OAuth 인증 주소이고 같은 state를 싣고 있는지. 다른 곳으로는 이동하지 않는다.
 * client_id·redirect_uri 등 나머지 값은 서버가 정한 그대로 둔다.
 */
export function isGitHubAuthorizationUrl(value: unknown, state: unknown): value is string {
  if (typeof value !== "string" || typeof state !== "string" || !STATE_PATTERN.test(state) || !URL.canParse(value)) return false;
  const url = new URL(value);
  return url.origin === GITHUB_AUTHORIZE_ORIGIN && url.pathname === GITHUB_AUTHORIZE_PATH && !url.username && !url.password
    && url.hash === "" && url.searchParams.getAll("state").length === 1 && url.searchParams.get("state") === state;
}

export async function startConnection(api: MemberApi): Promise<StartResult> {
  const result = await api.member("/me/github/authorization", { method: "POST" });
  if (result.kind === "success") {
    const data = result.data;
    return isRecord(data) && isGitHubAuthorizationUrl(data.authorizationUrl, data.state)
      ? { kind: "ready", authorizationUrl: data.authorizationUrl }
      : { kind: "failed", reason: "failed" };
  }
  if (isAuthFailure(result)) return { kind: "failed", reason: "auth" };
  if (isConnectionOff(result)) return { kind: "failed", reason: "unavailable" };
  return { kind: "failed", reason: "failed" };
}

export async function completeConnection(api: MemberApi, input: { code: string; state: string }): Promise<CompletionResult> {
  const result = await api.member("/me/github/connection", { method: "POST", body: { code: input.code, state: input.state } });
  if (result.kind === "success") {
    const data = result.data;
    return isRecord(data) && data.state === "CONNECTED" && typeof data.accountLogin === "string" && data.accountLogin.length > 0
      ? { kind: "connected", accountLogin: data.accountLogin }
      : { kind: "unknown" };
  }
  if (result.kind === "lookup-failed") return { kind: "unknown" };
  if (isAuthFailure(result)) return { kind: "auth" };
  if (isConnectionOff(result)) return { kind: "unavailable" };
  return result.status >= 500 ? { kind: "unknown" } : { kind: "rejected" };
}

/**
 * GitHub가 콜백(`/github/callback`)에 붙여 보낸 값.
 * - `code`: code·state가 하나씩 있고 형식이 맞다. 완료 API에 한 번만 보낸다.
 * - `cancelled`: 사용자가 GitHub에서 승인하지 않았다(`error=access_denied`). 완료 API를 부르지 않는다.
 * - `provider-error`: GitHub가 다른 오류를 돌려줬다. 완료 API를 부르지 않는다. 오류 설명은 화면에 옮기지 않는다.
 * - `missing`: 값이 없다(주소를 지운 뒤 새로고침, 직접 열기). 확인할 결과가 없다.
 * - `malformed`: 값이 겹치거나 형식이 틀리다. 보내지 않는다.
 */
export type CallbackParams =
  | { kind: "code"; code: string; state: string }
  | { kind: "cancelled" }
  | { kind: "provider-error" }
  | { kind: "missing" }
  | { kind: "malformed" };

export function readCallbackParams(query: URLSearchParams): CallbackParams {
  const codes = query.getAll("code");
  const states = query.getAll("state");
  const errors = query.getAll("error");
  if (errors.length > 0) {
    if (errors.length > 1 || codes.length > 0) return { kind: "malformed" };
    return errors[0] === "access_denied" ? { kind: "cancelled" } : { kind: "provider-error" };
  }
  if (codes.length === 0 && states.length === 0) return { kind: "missing" };
  if (codes.length !== 1 || states.length !== 1 || !CODE_PATTERN.test(codes[0]) || !STATE_PATTERN.test(states[0])) {
    return { kind: "malformed" };
  }
  return { kind: "code", code: codes[0], state: states[0] };
}

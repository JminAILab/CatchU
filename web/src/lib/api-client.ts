import type { AccessTokenStore } from "./access-token.ts";
import { readApiResponse, type ApiFailure, type ApiResult } from "./api-response.ts";

/** API 명세 v1의 기준 경로. 환경변수에는 넣지 않고 여기서 붙인다. */
export const API_VERSION_PATH = "/v1";

/** 회원 인증 실패. 수신자 비밀번호 401(LINK_PASSWORD_*)과 구분한다. */
const MEMBER_AUTH_FAILURES = new Set(["AUTH_REQUIRED", "AUTH_INVALID"]);

const LOOKUP_FAILED: ApiResult = { kind: "lookup-failed", status: null, code: "LOOKUP_FAILED" };

/**
 * 호출 결과. #88의 ApiResult에 차단 응답의 남은 시간을 더한다.
 * `retryAfterSeconds`는 오류 응답에 `Retry-After`가 1 이상의 정수 초로 왔을 때만 있다(#150 비밀번호 시도 제한, #173 계약).
 */
export type ClientApiFailure = ApiFailure & { retryAfterSeconds?: number };
export type ClientResult = Exclude<ApiResult, ApiFailure> | ClientApiFailure;

/** 계약은 1 이상의 정수 초만 쓴다. 그 밖의 값(날짜 형식·0·소수·빈 값)은 남은 시간으로 추정하지 않는다. */
export function parseRetryAfterSeconds(value: string | null): number | undefined {
  if (value === null || !/^\d+$/.test(value.trim())) return undefined;
  const seconds = Number(value.trim());
  return Number.isSafeInteger(seconds) && seconds >= 1 ? seconds : undefined;
}

export type MemberRequest = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  /** 생성 POST의 재전송 키. createIdempotencyKeyHolder()로 붙잡아 같은 요청에 같은 값을 쓴다. */
  idempotencyKey?: string;
  signal?: AbortSignal;
};

export type RecipientRequest = {
  method?: "GET" | "POST";
  body?: unknown;
  /** 비밀번호 링크 열람 증표(#150). 회원 토큰과 별개다. */
  linkGrant?: string;
  signal?: AbortSignal;
};

export type ApiClientOptions = {
  /** NEXT_PUBLIC_API_BASE_URL. `/v1`은 넣지 않는다. */
  baseUrl: string | undefined;
  tokens: AccessTokenStore;
  fetch?: typeof fetch;
};

export type ApiClient = {
  /** 회원 API. 토큰이 있으면 Authorization을 붙이고, AUTH_REQUIRED·AUTH_INVALID를 받으면 그 토큰을 지운다. */
  member(path: string, request?: MemberRequest): Promise<ClientResult>;
  /** 수신자 API. 회원 토큰을 붙이지 않는다. 비밀번호 차단(429)이면 결과에 retryAfterSeconds가 붙는다. */
  recipient(path: string, request?: RecipientRequest): Promise<ClientResult>;
  /** 개발용 로그인(#87). 성공하면 토큰을 메모리에 보관하고, 결과에는 토큰을 담지 않는다. */
  devLogin(memberId: string): Promise<ClientResult>;
};

/** http(s) 주소만 받고 끝 슬래시를 뗀다. 쿼리·해시·계정 정보가 있거나 `/v1`로 끝나면 설정 오류(null)다. */
export function normalizeApiBaseUrl(value: string | undefined): string | null {
  if (typeof value !== "string" || !URL.canParse(value.trim())) return null;
  const url = new URL(value.trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.search || url.hash || url.username || url.password) return null;
  const path = url.pathname.replace(/\/+$/, "");
  if (path.endsWith(API_VERSION_PATH)) return null;
  return `${url.origin}${path}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const baseUrl = normalizeApiBaseUrl(options.baseUrl);
  const fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));

  async function send(
    path: string, method: string, headers: Record<string, string>, body: unknown, signal?: AbortSignal,
  ): Promise<ClientResult> {
    if (!path.startsWith("/") || path.startsWith("//")) throw new TypeError("path must start with a single '/'");
    // 주소 설정이 없거나 잘못되면 요청하지 않고 조회 실패로 돌려준다(빈 결과로 바꾸지 않는다).
    if (!baseUrl) return LOOKUP_FAILED;
    const hasBody = body !== undefined;
    const pending = fetchImpl(`${baseUrl}${API_VERSION_PATH}${path}`, {
      method,
      headers: { Accept: "application/json", ...(hasBody ? { "Content-Type": "application/json" } : {}), ...headers },
      body: hasBody ? JSON.stringify(body) : undefined,
      // 명세: 회원·수신자 응답을 캐시하지 않는다. 쿠키는 쓰지 않는다(토큰은 헤더).
      cache: "no-store",
      credentials: "omit",
      signal,
    });
    // readApiResponse는 헤더를 돌려주지 않으므로 Retry-After만 따로 읽는다. 네트워크 실패는 readApiResponse가 조회 실패로 바꾼다.
    const retryAfter = pending.then((response) => response.headers.get("Retry-After"), () => null);
    const result = await readApiResponse(pending);
    if (result.kind !== "api-error") return result;
    const seconds = parseRetryAfterSeconds(await retryAfter);
    return seconds === undefined ? result : { ...result, retryAfterSeconds: seconds };
  }

  return {
    async member(path, request = {}) {
      const token = options.tokens.get().token;
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      if (request.idempotencyKey !== undefined) {
        if (typeof request.idempotencyKey !== "string" || request.idempotencyKey.length === 0) {
          throw new TypeError("idempotencyKey must be a non-empty string");
        }
        headers["Idempotency-Key"] = request.idempotencyKey;
      }
      const result = await send(path, request.method ?? "GET", headers, request.body, request.signal);
      // 응답을 기다리는 동안 다시 로그인했다면 새 토큰은 지우지 않는다.
      if (result.kind === "api-error" && result.status === 401 && MEMBER_AUTH_FAILURES.has(result.code)
        && options.tokens.get().token === token) {
        options.tokens.clear("auth-failed");
      }
      return result;
    },

    async recipient(path, request = {}) {
      const headers: Record<string, string> = {};
      if (request.linkGrant !== undefined) headers["X-Link-Grant"] = request.linkGrant;
      return send(path, request.method ?? "GET", headers, request.body, request.signal);
    },

    async devLogin(memberId) {
      const result = await send("/auth/dev-login", "POST", {}, { memberId });
      if (result.kind !== "success") return result;
      const data = result.data;
      if (!isRecord(data) || typeof data.accessToken !== "string" || data.accessToken.length === 0 || data.tokenType !== "Bearer") {
        return { kind: "lookup-failed", status: result.status, code: "LOOKUP_FAILED" };
      }
      options.tokens.set(data.accessToken);
      return { kind: "success", status: result.status, data: null };
    },
  };
}

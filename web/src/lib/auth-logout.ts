/**
 * 로그아웃 호출(#286 3단계). `POST /v1/auth/logout`을 보내고 결과를 공통 인증 상태(auth-state.ts)에 반영한다.
 *
 * 합의와 결정
 * - 결과는 `done`·`failed`·`unknown` 세 가지다(#251 연결 합의). 실패·응답 유실은 완료로 보지 않고 화면·입력을 유지하며,
 *   종료 확인 중(`unknown`)에는 갱신·보호 동작을 보류한다(api/docs/auth-sessions.md 「서버 리뷰와 화면 연결의 경계」).
 * - 로그아웃은 같은 쿠키로 반복해도 서버가 204로 받으므로 사용자가 다시 시도할 수 있다(#251 T2). 자동으로 다시 보내지는 않는다.
 *   다시 시도 허용(새 로그인 시작 뒤에는 막음)은 auth-state.ts의 `logoutStarted()`가 판정한다.
 *
 * 응답 분류
 * - 204 → `done`.
 * - API가 보낸 거부·실패 응답(403 `AUTH_ORIGIN_FORBIDDEN`, 400 `VALIDATION_FAILED`, 500 `INTERNAL_ERROR`)과 주소 설정 없음 → `failed`.
 *   `failed`는 세션이 살아 있다는 확인이 아니다. 로그아웃 완료로 확정하지 않고 기존 화면·입력을 유지하며,
 *   기존 조건(`logoutStarted()`)에 따라 사용자 재시도를 허용한다는 뜻이다. 세션이 실제로 끝났다면 이후 갱신·보호 호출의 401로 드러난다.
 * - 응답 없음, 오류 코드를 읽을 수 없는 응답(중계 502~504 등), 그 밖의 상태 → `unknown`. 서버가 폐기를 마쳤는지 알 수 없다.
 * - 쿠키가 없을 때도 서버는 204를 보낸다. web은 HttpOnly 쿠키를 읽을 수 없으므로 204를 세션 폐기 확인으로 확대하지 않는다
 *   (api/docs/auth-sessions.md 「API 연결안」). 화면 표시는 `done` 그대로 쓰되, 서버 세션 폐기 검증은 HTTP·DB 검증에서 따로 한다.
 *
 * 잠금과 쿠키 경쟁
 * - 로그아웃 응답은 Refresh 쿠키를 지운다. 갱신 응답의 새 쿠키나 새 로그인 응답의 쿠키와 순서가 섞이지 않도록 갱신과 같은 잠금
 *   (`RefreshClient.withSessionLock`) 안에서 보낸다. 잠금을 얻은 뒤 보내기 직전에 `logoutCurrent()`로 다시 확인해, 그사이 새 로그인이
 *   성공했거나 결과가 이미 반영됐으면 보내지 않는다.
 * - 잠금을 기다리는 동안 새 로그인이 "시작"만 됐을 때의 전송 정책은 담당자 확인 사항이다(합의 전). 이 초안은 이전 세션 종료를 위해 보낸다.
 *   결과가 새 로그인 흐름을 정리하지 않게 하는 것은 `logoutSettled()`가 맡는다.
 * - 연결 조건: 실제 로그인 완료 요청(개발 로그인 5단계, Google 완료 8단계)도 반드시 같은 잠금(`withSessionLock`) 안에서 보낸다.
 *   그래야 로그아웃의 쿠키 제거와 새 로그인 쿠키 설정의 순서가 지켜진다. 같은 잠금을 쓰지 않으면 늦은 로그아웃 응답이 새 로그인 쿠키를 지울 수 있다.
 * - 기본 잠금(`createTabLock`)은 이 탭 안의 순서만 지킨다. 탭 사이 순서는 Web Locks 연결(4단계, T4) 뒤에도 지원 환경에서만 지킨다.
 * - 로그아웃 요청은 취소하지 않는다. 응답 원문·쿠키는 결과·오류·로그에 남기지 않는다.
 */
import type { AuthStore, LogoutResult, RequestTicket } from "./auth-state.ts";
import type { RefreshClient } from "./auth-refresh.ts";
import { API_VERSION_PATH, normalizeApiBaseUrl } from "./api-client.ts";

/** 로그아웃 요청 한 번의 응답. */
export type LogoutResponse =
  /** 204. */
  | { kind: "ended" }
  /** 그 밖의 응답 상태. `code`는 오류 본문의 code이며 읽지 못하면 null. */
  | { kind: "error"; status: number; code: string | null }
  /** 응답을 받지 못함(연결 끊김·시간 초과). */
  | { kind: "no-response" }
  /** API 주소 설정이 없거나 잘못돼 보내지 않음. */
  | { kind: "not-sent" };

export type LogoutTransport = () => Promise<LogoutResponse>;

/** 쿠키를 바꾸지 않았음이 서버 계약으로 정해진 거부·실패 응답. */
const UNCHANGED = new Set(["403 AUTH_ORIGIN_FORBIDDEN", "400 VALIDATION_FAILED", "500 INTERNAL_ERROR"]);

/** 응답을 로그아웃 결과로 나눈다. 기준은 파일 머리말 「응답 분류」. */
export function classifyLogout(response: LogoutResponse): LogoutResult {
  if (response.kind === "ended") return "done";
  if (response.kind === "not-sent") return "failed";
  if (response.kind === "error" && response.code !== null && UNCHANGED.has(`${response.status} ${response.code}`)) return "failed";
  return "unknown";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type FetchLogoutTransportOptions = {
  /** NEXT_PUBLIC_API_BASE_URL. `/v1`은 넣지 않는다. */
  baseUrl: string | undefined;
  nodeEnv?: string;
  fetch?: typeof fetch;
};

/** 실제 로그아웃 요청. 본문·Authorization 없이 Refresh 쿠키만 보낸다(`credentials: "include"`). */
export function createFetchLogoutTransport(options: FetchLogoutTransportOptions): LogoutTransport {
  const baseUrl = normalizeApiBaseUrl(options.baseUrl, options.nodeEnv);
  const fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
  return async () => {
    if (!baseUrl) return { kind: "not-sent" };
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${API_VERSION_PATH}/auth/logout`, {
        method: "POST",
        headers: { Accept: "application/json" },
        cache: "no-store",
        credentials: "include",
      });
    } catch {
      return { kind: "no-response" };
    }
    if (response.status === 204) return { kind: "ended" };
    let code: string | null = null;
    try {
      const body: unknown = await response.json();
      if (isRecord(body) && typeof body.code === "string" && body.code.trim()) code = body.code;
    } catch {
      code = null;
    }
    return { kind: "error", status: response.status, code };
  };
}

export type LogoutOutcome =
  /** 결과를 반영했다. 상태 변화는 auth-state.ts의 `logoutSettled()`를 따른다. */
  | { kind: "settled"; result: LogoutResult }
  /** 지금은 보낼 수 없어 보내지 않았다(로그인 상태 아님·이미 진행 중·새 로그인 시작 뒤 다시 시도 등). */
  | { kind: "not-started" }
  /**
   * 그사이 새 로그인 성공 등으로 이 로그아웃이 낡아 결과를 반영하지 않았다. `sent`: 요청을 보냈는지.
   * 보냈다면 쿠키 제거 응답은 이미 브라우저에 반영됐을 수 있다.
   */
  | { kind: "discarded"; sent: boolean };

export type LogoutClient = {
  /** 로그아웃(첫 요청·다시 시도 모두). 보낼 수 있는지는 `logoutStarted()`가 판정한다. */
  logout(): Promise<LogoutOutcome>;
};

export type LogoutClientOptions = {
  store: AuthStore;
  transport: LogoutTransport;
  /** 갱신과 같은 잠금을 쓰기 위해 갱신 클라이언트를 받는다. */
  session: Pick<RefreshClient, "withSessionLock">;
};

const NOT_STARTED: LogoutOutcome = { kind: "not-started" };

export function createLogoutClient(options: LogoutClientOptions): LogoutClient {
  const { store, transport, session } = options;

  async function send(ticket: RequestTicket): Promise<LogoutOutcome> {
    let sent = false;
    let result: LogoutResult | null;
    try {
      result = await session.withSessionLock(async () => {
        // 잠금을 기다리는 동안 새 로그인이 성공했거나 결과가 이미 반영됐으면 보내지 않는다.
        if (!store.logoutCurrent(ticket)) return null;
        sent = true;
        return classifyLogout(await transport());
      });
    } catch {
      // 잠금이나 호출 함수의 예기치 않은 예외. 보내기 전이면 요청이 나가지 않았으므로 failed, 보낸 뒤면 결과를 알 수 없으므로 unknown.
      result = sent ? "unknown" : "failed";
    }
    if (result === null) return { kind: "discarded", sent };
    return store.logoutSettled(result, ticket) ? { kind: "settled", result } : { kind: "discarded", sent };
  }

  return {
    logout() {
      // 표를 받는 순간 로그아웃 진행 중이 되어 갱신·보호 호출이 보류된다. 진행 중이면 null이므로 같은 요청이 두 번 나가지 않는다.
      const ticket = store.logoutStarted();
      if (!ticket) return Promise.resolve(NOT_STARTED);
      return send(ticket);
    },
  };
}

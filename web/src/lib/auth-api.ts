/**
 * 공통 인증 호출(#286 5단계). 보호 API 호출과 개발 로그인을 공통 인증 상태(auth-state.ts)와 세션(auth-session.ts)에 연결한다.
 *
 * 합의와 결정
 * - 보호 API는 `status`만으로 보내지 않는다. 로그인 변경 감지 없음, 로그아웃 보류 없음(`sessionHold` null), `signed-in`,
 *   `accessToken()` 있음을 모두 확인한다(1단계 연결 기준). 하나라도 아니면 보내지 않고 `not-sent`와 이유를 돌려준다.
 * - 요청 전과 응답 반영 전에 로그인 표식을 비교한다(#251 T3). 응답을 기다리는 사이 인증 세대가 바뀌었으면(새 로그인 성공·로그아웃 완료·
 *   표식 불일치) 그 응답은 이전 세션 것이므로 돌려주지 않는다(`discarded`). 같은 세션의 Access 갱신은 세대를 바꾸지 않으므로 그대로 돌려준다.
 * - 회원 인증 실패(401 `AUTH_REQUIRED`·`AUTH_INVALID`)면 그 요청에 쓴 토큰이 아직 현재 토큰일 때 세션 갱신을 한 번 요청한다.
 *   다른 호출이 이미 갱신해 토큰이 바뀌었으면 갱신하지 않는다. 갱신은 탭 안에서 하나로 합쳐진다(auth-refresh.ts).
 * - 토큰이 바뀌었으면 조회(GET)만 한 번 다시 보낸다(#286 계획 5단계). 다시 보낸 조회가 또 401이면 더 갱신하지 않는다.
 * - 변경 요청(POST·PUT·DELETE)은 갱신·재인증 뒤에도 자동으로 다시 보내지 않는다(#251 T2). 401 결과에 `authRenewal`만 붙인다.
 * - 갱신 실패에 따른 상태 변화(로그인 중 실패 → 재인증 필요)는 auth-state.ts `refreshFailed()`를 따른다. 이 파일은 상태를 직접 바꾸지 않는다.
 *
 * 개발 로그인
 * - 시도 식별자: 보내기 전에 `loginStarted()`로 받는다. 성공은 `loginSucceeded(token, attempt)`(= `signedIn(token, attempt)` + 표식),
 *   실패·취소는 `loginAttemptEnded(attempt)`로 알린다. 이전·종료된 시도의 결과는 반영하지 않는다.
 * - 공통 잠금: 로그인 요청은 `withSessionLock` 안에서 보낸다(3단계 연결 조건). 그래서 진행 중인 갱신·로그아웃의 응답 쿠키가 새 로그인
 *   쿠키를 덮지 않는다. 잠금을 얻은 뒤 보내기 직전에 화면 취소와 시도 교체를 다시 확인한다. 표식은 잠금 앞뒤에서 비교된다(auth-session.ts).
 * - Refresh 쿠키를 받도록 `credentials: "include"`로 보낸다.
 * - 보낸 뒤에는 요청을 취소하지 않는다. 취소하면 서버가 쿠키를 바꿨는지 알 수 없다. 화면이 그사이 취소했으면 결과를 반영하지 않는다
 *   (#106 기존 규칙 "취소된 응답은 토큰에 반영하지 않는다"). 반영 여부 자체는 결정 사항이다(검토본 「정책 결정이 필요한 연결 지점」).
 * - 보낸 요청의 결과는 셋으로 나눈다. 이 탭의 이전 세션으로 계속할 수 있는 것은 앞의 둘뿐이다.
 *   1. 보내지 않음이 확실함: 주소 설정 오류, 잠금 전·후 취소, 시도 교체. 시도만 끝낸다.
 *   2. 계약상 쿠키를 바꾸지 않는 거부: 403(개발 로그인 가드, 처리 전 거부), 400 `VALIDATION_FAILED`·`INVALID_REQUEST`(요청 검증).
 *      서버는 쿠키를 처리 성공 뒤에만 쓴다(api `dev-login.controller.ts`). 시도만 끝낸다.
 *   3. 그 밖의 모든 경우: 쿠키가 바뀌었거나 바뀌었을 수 있다. 반영하지 않은 200(이전 시도·취소·본문 오류)과 결과 불명
 *      (응답 없음, 500 등 그 밖의 오류 응답)이다. 응답이 없다고 서버 처리·쿠키 변경이 없었다고 확정할 수 없다.
 *      시도를 끝내고 `loginNotAdopted()`로 알린다. 다른 탭은 바뀐 표식으로 감지해 지금 쿠키로 한 번 복원하고(팀장 결정 2), 이 탭은 Google 완료의 A 합의 1(세션 확인으로 이번 로그인 성공을 판정하지 않음)과 같은 안전 기준으로 자동 복원 없이 [다시 로그인]만 둔다.
 *      결과 불명을 로그인 성공으로 보지 않고, 로그인 요청을 다시 보내지 않는다.
 *
 * 연결 범위
 * - 화면에 연결하지 않았다. `api.ts`의 전역 인스턴스 교체와 `useAuth`·`MemberGuard`·`useMemberLookup`·기능별 API 연결은 6단계다.
 *   기존 `api-client.ts`(메모리 토큰·쿠키 미사용 개발 로그인)는 그때까지 그대로 둔다.
 * - 결과에 `not-sent`·`discarded`가 더해져 기존 `ClientResult`와 다르다. 화면별 표시는 6단계에서 정하며 조회 실패로 바꾸지 않는다.
 * - Access 토큰과 응답 원문은 결과·오류·로그에 남기지 않는다.
 */
import type { AccessTokenState, AccessTokenStore } from "./access-token.ts";
import {
  API_VERSION_PATH, createApiClient, normalizeApiBaseUrl,
  type ClientApiFailure, type ClientResult, type MemberRequest,
} from "./api-client.ts";
import { readApiResponse, type ApiResult } from "./api-response.ts";
import type { AuthSession } from "./auth-session.ts";
import type { AuthGeneration, AuthStore } from "./auth-state.ts";

/** 보호 API를 보내지 않은 이유. 앞의 것부터 확인한다. */
export type MemberCallBlock =
  /** 로그인 표식 불일치를 감지해 [다시 로그인]만 받는 탭이다(팀장 결정 2). 복원하는 탭은 복원 중이라 `not-signed-in`이다. */
  | "login-changed"
  /** 로그아웃 확인 중이거나 결과 불명이다(`sessionHold`). */
  | "logout-hold"
  /** 재인증이 필요하다. */
  | "reauth-required"
  /** 복원 중이거나 비로그인이다. */
  | "not-signed-in"
  /** 로그인 상태지만 쓸 토큰이 없다. */
  | "no-token";

/** 회원 인증 실패(401)에 붙는 갱신 결과. `renewed`: 토큰이 바뀌었다(변경 요청은 다시 보내지 않았다). */
export type MemberAuthFailure = ClientApiFailure & { authRenewal: "renewed" | "not-renewed" };

export type MemberCallResult =
  | ClientResult
  | MemberAuthFailure
  | { kind: "not-sent"; reason: MemberCallBlock }
  /** 응답을 기다리는 사이 인증 세대가 바뀌어 이전 세션의 응답을 돌려주지 않는다. 변경 요청이면 서버에는 이미 반영됐을 수 있다. */
  | { kind: "discarded"; sent: true };

export type DevLoginResult =
  | { kind: "success"; status: number; data: null }
  | Exclude<ApiResult, { kind: "success" }>
  /** 반영하지 않음. `sent`: 요청을 보냈는지(보냈다면 서버 처리·쿠키 변경이 있었을 수 있다). */
  | { kind: "discarded"; sent: boolean };

export type AuthApiOptions = {
  /** NEXT_PUBLIC_API_BASE_URL. `/v1`은 넣지 않는다. */
  baseUrl: string | undefined;
  nodeEnv?: string;
  store: AuthStore;
  /** 탭마다 하나. 갱신·로그아웃·로그인이 같은 잠금과 표식을 쓴다. */
  session: AuthSession;
  fetch?: typeof fetch;
};

export type AuthApi = {
  /** 보호 API. 보내기 전 조건·표식 비교·이전 응답 무시·401 뒤 갱신(조회만 다시 보냄)을 적용한다. */
  member(path: string, request?: MemberRequest): Promise<MemberCallResult>;
  /** 개발용 로그인(#87). 성공하면 공통 인증 상태에 반영하고, 결과에는 토큰을 담지 않는다. */
  devLogin(memberId: string, request?: { signal?: AbortSignal }): Promise<DevLoginResult>;
};

const MEMBER_AUTH_FAILURES = new Set(["AUTH_REQUIRED", "AUTH_INVALID"]);
const LOOKUP_FAILED = { kind: "lookup-failed", status: null, code: "LOOKUP_FAILED" } as const;

/**
 * 기존 `ClientResult`만 아는 호출부(기능별 API 함수)에 넘기는 변환(6단계 호환). 보내지 않음·이전 세션 응답은 조회 실패로 돌려준다.
 * 이때 화면 상태는 회원 가드가 공통 인증 상태(재인증 필요·로그아웃 보류 등)로 따로 보여 준다. 회원 조회는 이 변환을 쓰지 않는다.
 */
export function toClientResult(result: MemberCallResult): ClientResult {
  return result.kind === "not-sent" || result.kind === "discarded" ? LOOKUP_FAILED : result;
}

/** 보호 API를 지금 보낼 수 없는 이유. 보낼 수 있으면 null. `status`만으로 판단하지 않는다. */
export function memberCallBlock(store: AuthStore): MemberCallBlock | null {
  if (store.loginChangeDetected()) return "login-changed";
  const snapshot = store.getSnapshot();
  if (snapshot.sessionHold !== null) return "logout-hold";
  if (snapshot.status === "reauth-required") return "reauth-required";
  if (snapshot.status !== "signed-in") return "not-signed-in";
  if (store.accessToken() === null) return "no-token";
  return null;
}

/**
 * 개발 로그인 응답 중 서버가 쿠키를 바꾸지 않았음이 계약으로 확인되는 거부.
 * - 403: 개발 로그인 가드의 처리 전 거부(비활성·운영 차단). 전용 코드는 미결이라 상태로만 판단한다(api `dev-login.guard.ts`).
 * - 400 `VALIDATION_FAILED`·`INVALID_REQUEST`: 요청 검증 거부(처리 전).
 * 그 밖의 오류 응답(500 등)·응답 없음·본문 오류는 처리 여부를 알 수 없으므로 여기에 넣지 않는다.
 */
function isContractRejection(result: ApiResult): boolean {
  if (result.kind === "success" || result.status === null) return false;
  if (result.status === 403) return true;
  return result.kind === "api-error" && result.status === 400
    && (result.code === "VALIDATION_FAILED" || result.code === "INVALID_REQUEST");
}

function isMemberAuthFailure(result: ClientResult): result is ClientApiFailure {
  return result.kind === "api-error" && result.status === 401 && MEMBER_AUTH_FAILURES.has(result.code);
}

/** 한 요청에 쓸 토큰만 돌려주는 저장소. 기존 호출 함수의 401 토큰 삭제는 여기서 아무것도 하지 않는다(상태는 공통 저장소가 관리). */
function fixedTokens(token: string): AccessTokenStore {
  const state: AccessTokenState = { token, ended: null };
  return { get: () => state, set: () => undefined, clear: () => undefined, subscribe: () => () => undefined };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createAuthApi(options: AuthApiOptions): AuthApi {
  const { store, session } = options;
  const baseUrl = normalizeApiBaseUrl(options.baseUrl, options.nodeEnv);
  const fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));

  /** 응답 반영 전: 표식을 비교하고, 요청을 보낼 때의 세대가 그대로인지 확인한다. */
  const stillCurrent = (generation: AuthGeneration) => {
    session.checkLoginMarker();
    return store.getSnapshot().generation === generation;
  };

  /** 개발 로그인 요청. 주소 설정이 없거나 잘못되면 보내지 않는다(`sent: false`). */
  async function sendDevLogin(memberId: string): Promise<{ sent: false } | { sent: true; result: ApiResult }> {
    if (!baseUrl) return { sent: false };
    const result = await readApiResponse(fetchImpl(`${baseUrl}${API_VERSION_PATH}/auth/dev-login`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ memberId }),
      cache: "no-store",
      credentials: "include", // Refresh 쿠키를 받는다(개발의 다른 포트 구성 포함).
    }));
    return { sent: true, result };
  }

  return {
    async member(path, request = {}) {
      const method = request.method ?? "GET";
      for (let resent = false; ; resent = true) {
        session.checkLoginMarker(); // 요청 전 비교
        const block = memberCallBlock(store);
        if (block) return { kind: "not-sent", reason: block };
        const generation = store.getSnapshot().generation;
        const token = store.accessToken() as string; // memberCallBlock이 null이면 토큰이 있다.
        const client = createApiClient({ baseUrl: options.baseUrl, nodeEnv: options.nodeEnv, fetch: fetchImpl, tokens: fixedTokens(token) });
        const result = await client.member(path, request);
        if (!stillCurrent(generation)) return { kind: "discarded", sent: true };
        if (!isMemberAuthFailure(result)) return result;
        // 다시 보낸 조회도 401이면 더 갱신하지 않는다.
        if (resent) return { ...result, authRenewal: "not-renewed" };
        // 이 토큰이 아직 현재 토큰일 때만 갱신한다. 다른 호출이 이미 갱신했으면 그 토큰을 쓴다.
        // 갱신 여부는 토큰 문자열이 아니라 갱신 결과로 판단한다. 같은 초에 다시 발급된 Access는 문자열이 같을 수 있다
        // (2026-10-15 실제 API·Chromium에서 확인).
        const renewedByOther = store.accessToken() !== token && store.accessToken() !== null;
        const refreshed = renewedByOther ? null : await session.refresh();
        if (!stillCurrent(generation)) return { kind: "discarded", sent: true };
        const renewed = memberCallBlock(store) === null && (renewedByOther || refreshed?.kind === "signed-in");
        if (!renewed) return { ...result, authRenewal: "not-renewed" };
        // 변경 요청은 자동으로 다시 보내지 않는다(#251 T2).
        if (method !== "GET") return { ...result, authRenewal: "renewed" };
      }
    },

    async devLogin(memberId, request = {}) {
      const { signal } = request;
      if (signal?.aborted) return { kind: "discarded", sent: false };
      const attempt = store.loginStarted();
      return session.withSessionLock(async (): Promise<DevLoginResult> => {
        // 잠금을 기다리는 동안 화면이 취소했거나 이 탭에서 다른 로그인을 시작했으면 보내지 않는다.
        if (signal?.aborted || !store.loginAttemptCurrent(attempt)) {
          store.loginAttemptEnded(attempt);
          return { kind: "discarded", sent: false };
        }
        // 보낸 뒤에는 취소하지 않는다(서버의 쿠키 변경 여부를 알 수 있어야 한다).
        const sending = await sendDevLogin(memberId);
        if (!sending.sent) {
          store.loginAttemptEnded(attempt);
          return LOOKUP_FAILED;
        }
        const { result } = sending;
        const data = result.kind === "success" ? result.data : null;
        const token = isRecord(data) && typeof data.accessToken === "string" && data.accessToken.length > 0
          && data.tokenType === "Bearer" ? data.accessToken : null;
        if (token !== null && !signal?.aborted && session.loginSucceeded(token, attempt) !== null) {
          return { kind: "success", status: 200, data: null };
        }
        // 반영하지 않는다: 실패, 취소, 이전 시도, 본문 오류.
        store.loginAttemptEnded(attempt);
        // 계약상 거부가 아니면 쿠키가 바뀌었을 수 있다(반영하지 않은 200·결과 불명). 이 탭과 다른 탭이 이전 세션으로 갱신하지 않게 알린다.
        if (!isContractRejection(result)) session.loginNotAdopted();
        if (signal?.aborted || token !== null) return { kind: "discarded", sent: true };
        if (result.kind === "success") return { kind: "lookup-failed", status: result.status, code: "LOOKUP_FAILED" };
        return result;
      });
    },
  };
}

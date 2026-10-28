/**
 * 세션 갱신 호출(#286 2단계). `POST /v1/auth/refresh`를 보내고 결과를 공통 인증 상태(auth-state.ts)에 반영한다.
 *
 * 합의와 결정
 * - 탭 안에서 동시에 갱신이 필요하면 HTTP 요청 하나를 보내고 결과를 함께 쓴다(#251 「탭 내부 갱신 중복 방지」).
 * - 갱신 500(`INTERNAL_ERROR`)만 탭 간 잠금 안에서 한 번 다시 보낸다(#251 T2). 응답을 받지 못한 경우는 다시 보내지 않는다
 *   (api/docs/auth-sessions.md 「교체·동시 갱신·응답 유실」: 응답 유실 뒤 이전 Refresh를 반복 전송하지 않는다).
 * - 실패 원인은 마지막 응답만이 아니라 이번 갱신에서 보낸 요청 전체로 정한다. 첫 500 뒤 다시 보낸 요청이 400·403이면
 *   그 요청은 Refresh를 쓰지 않았지만 첫 요청의 처리 결과는 알 수 없으므로 `not-consumed`로 확정하지 않는다.
 * - 401 `AUTH_INVALID`는 몇 번째 요청이든 세션이 끝났음을 뜻한다. 서버가 쿠키를 지우고, 재사용이면 그 세션만 폐기한다.
 *
 * 책임 경계
 * - 보낼지 말지와 결과 반영 여부는 auth-state.ts가 정한다. 이 파일은 잠금을 얻은 뒤와 재시도 전에 `refreshCurrent()`로 다시 확인한다.
 *   로그아웃 시작·새 로그인 시작·새 로그인 성공 뒤에는 아직 보내지 않은 갱신을 보내지 않고, 이미 보낸 요청의 결과는
 *   `refreshSucceeded()`·`refreshFailed()`가 반영하지 않는다.
 *
 * 결과 무시와 쿠키 경쟁은 다르다
 * - 결과를 반영하지 않아도 이미 보낸 갱신의 응답 쿠키(`Set-Cookie`)는 브라우저가 저장한다. 새 로그인 응답보다 늦게 도착하면
 *   쿠키가 이전 세션(다른 회원일 수 있음) 것으로 덮인다(2026-10-15 실제 API·Chromium 확인).
 * - 그래서 세션 쿠키를 바꾸는 요청(로그인 완료·로그아웃)은 `withSessionLock()` 안에서 보낸다. 그러면 진행 중인 갱신의 응답이
 *   먼저 도착한 뒤 보내지므로 마지막 쿠키가 새 요청의 것이 된다. 연결은 로그인·로그아웃 단계(3·8단계)에서 한다.
 * - 이 보장은 잠금이 닿는 범위까지다. 지금 기본 잠금은 이 탭 안만 지키고, 탭 사이는 Web Locks 연결(T4) 뒤에도 지원 환경에서만 지킨다.
 * - 탭 사이 순서는 `RefreshLock`으로 받는다. Web Locks 구현과 로그인 표식 비교(T3: 보내기 전·반영 직전)는 후속 단계에서
 *   이 파일의 `send()` 안에 넣는다. 그 전 기본값 `createTabLock()`은 이 탭 안의 순서만 지킨다.
 * - 갱신 요청은 취소하지 않는다. 취소하면 서버가 Refresh를 교체했는지 알 수 없게 된다.
 * - Access 토큰과 응답 원문은 결과·오류·로그에 남기지 않는다.
 */
import type { AuthStore, RefreshFailure, RequestTicket } from "./auth-state.ts";
import { API_VERSION_PATH, normalizeApiBaseUrl } from "./api-client.ts";

/** 같은 브라우저의 탭들이 함께 쓰는 갱신 잠금. 잠금을 얻은 뒤 task를 실행하고, task가 끝나면(성공·실패 모두) 놓는다. */
export type RefreshLock = {
  run<T>(task: () => Promise<T>): Promise<T>;
};

/**
 * 이 탭 안에서만 순서를 지키는 잠금. Web Locks를 쓸 수 없을 때의 대체값이며 탭 사이 순서는 보장하지 않는다(T4).
 * 시험에서는 한 인스턴스를 여러 저장소가 함께 써서 탭 사이 잠금의 대역으로 쓴다.
 */
export function createTabLock(): RefreshLock {
  let tail: Promise<void> = Promise.resolve();
  return {
    run(task) {
      const result = tail.then(task);
      tail = result.then(() => undefined, () => undefined);
      return result;
    },
  };
}

/** 갱신 요청 한 번의 응답. */
export type RefreshAttempt =
  /** 200과 올바른 본문. */
  | { kind: "issued"; accessToken: string }
  /** 오류 상태. `code`는 오류 본문의 code이며 읽지 못하면 null. */
  | { kind: "error"; status: number; code: string | null }
  /** 200 응답 헤더는 받았지만 본문을 읽지 못했거나 형식이 다름. 서버는 교체를 마쳤다. */
  | { kind: "malformed"; status: number }
  /** 응답을 받지 못함(연결 끊김·시간 초과). 서버 처리 여부를 알 수 없다. */
  | { kind: "no-response" }
  /** API 주소 설정이 없거나 잘못돼 보내지 않음. */
  | { kind: "not-sent" };

export type RefreshTransport = () => Promise<RefreshAttempt>;

export type RefreshVerdict =
  | { kind: "issued"; accessToken: string }
  | { kind: "retry" }
  | { kind: "failed"; cause: RefreshFailure };

const isServerError = (a: RefreshAttempt) => a.kind === "error" && a.status === 500 && a.code === "INTERNAL_ERROR";

/**
 * 이번 갱신에서 보낸 요청 전체(최대 2건)로 다음 행동을 정한다.
 * - 첫 요청: 200 → 발급, 401 `AUTH_INVALID` → `session-ended`, 403 `AUTH_ORIGIN_FORBIDDEN`·400 `VALIDATION_FAILED` → `not-consumed`,
 *   500 `INTERNAL_ERROR` → 한 번 다시 보냄, 그 밖(응답 없음·본문 오류·502~504·코드가 다른 오류 등) → `outcome-unknown`.
 * - 500 뒤 두 번째 요청: 200 → 발급, 401 `AUTH_INVALID` → `session-ended`, 그 밖은 모두 `outcome-unknown`.
 */
export function classifyRefresh(history: readonly RefreshAttempt[]): RefreshVerdict {
  if (history.length === 0 || history.length > 2 || (history.length === 2 && !isServerError(history[0]))) {
    throw new RangeError("refresh history must be one attempt, or a 500 followed by one retry");
  }
  const last = history[history.length - 1];
  const retried = history.length === 2;
  if (last.kind === "issued") return { kind: "issued", accessToken: last.accessToken };
  if (last.kind === "not-sent") {
    // 두 번째 요청을 보내지 못했다면 첫 500의 결과는 여전히 알 수 없다.
    return { kind: "failed", cause: retried ? "outcome-unknown" : "not-consumed" };
  }
  if (last.kind === "error") {
    if (last.status === 401 && last.code === "AUTH_INVALID") return { kind: "failed", cause: "session-ended" };
    if (!retried) {
      if ((last.status === 403 && last.code === "AUTH_ORIGIN_FORBIDDEN") || (last.status === 400 && last.code === "VALIDATION_FAILED")) {
        return { kind: "failed", cause: "not-consumed" };
      }
      if (isServerError(last)) return { kind: "retry" };
    }
  }
  return { kind: "failed", cause: "outcome-unknown" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type FetchRefreshTransportOptions = {
  /** NEXT_PUBLIC_API_BASE_URL. `/v1`은 넣지 않는다. */
  baseUrl: string | undefined;
  nodeEnv?: string;
  fetch?: typeof fetch;
};

/**
 * 실제 갱신 요청. 본문·Authorization 없이 Refresh 쿠키만 보낸다(`credentials: "include"`: 개발의 다른 포트 구성 포함).
 * 운영은 동일 출처이며 Origin은 브라우저가 붙인다(api/docs/auth-sessions.md 「쿠키와 출처」).
 */
export function createFetchRefreshTransport(options: FetchRefreshTransportOptions): RefreshTransport {
  const baseUrl = normalizeApiBaseUrl(options.baseUrl, options.nodeEnv);
  const fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
  return async () => {
    if (!baseUrl) return { kind: "not-sent" };
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${API_VERSION_PATH}/auth/refresh`, {
        method: "POST",
        headers: { Accept: "application/json" },
        cache: "no-store",
        credentials: "include",
      });
    } catch {
      return { kind: "no-response" };
    }
    let body: unknown = null;
    let readable = true;
    try {
      body = await response.json();
    } catch {
      readable = false;
    }
    if (response.status === 200) {
      if (readable && isRecord(body) && typeof body.accessToken === "string" && body.accessToken.length > 0
        && body.tokenType === "Bearer" && typeof body.expiresIn === "number" && body.expiresIn > 0) {
        return { kind: "issued", accessToken: body.accessToken };
      }
      return { kind: "malformed", status: 200 };
    }
    const code = readable && isRecord(body) && typeof body.code === "string" && body.code.trim() ? body.code : null;
    return { kind: "error", status: response.status, code };
  };
}

export type RefreshOutcome =
  /** 토큰을 반영했다(복원이면 로그인으로 바뀜). */
  | { kind: "signed-in" }
  /** 실패를 반영했다. 상태 변화는 auth-state.ts의 `refreshFailed()`를 따른다. */
  | { kind: "failed"; cause: RefreshFailure }
  /** 지금은 보낼 수 없어 보내지 않았다(로그아웃 보류·재인증 필요·결과 불명 뒤 등). */
  | { kind: "not-started" }
  /**
   * 그사이 로그아웃 시작·새 로그인 시작·새 로그인 성공으로 이 갱신이 낡아 결과를 반영하지 않았다. `sent`: 요청을 한 번이라도 보냈는지.
   * 보냈다면 응답 쿠키는 이미 브라우저에 반영됐을 수 있다.
   */
  | { kind: "discarded"; sent: boolean };

export type RefreshClient = {
  /** 갱신이 필요할 때 부른다. 진행 중인 같은 세대의 갱신이 있으면 그 결과를 함께 받는다. */
  refresh(): Promise<RefreshOutcome>;
  /**
   * 갱신과 같은 잠금 안에서 task를 실행한다. 세션 쿠키를 바꾸는 요청(로그인 완료·로그아웃)이 진행 중인 갱신의 응답보다
   * 먼저 쿠키를 쓰지 않게 한다. 새 로그인이면 `loginStarted()`를 먼저 부른 뒤 쓴다. task 안에서 `refresh()`를 기다리면 잠금이 풀리지 않는다.
   */
  withSessionLock<T>(task: () => Promise<T>): Promise<T>;
};

export type RefreshClientOptions = {
  store: AuthStore;
  transport: RefreshTransport;
  /** 기본값은 이 탭 안의 순서만 지키는 `createTabLock()`. */
  lock?: RefreshLock;
};

const NOT_STARTED: RefreshOutcome = { kind: "not-started" };
const ABANDONED_AFTER_500: Extract<RefreshVerdict, { kind: "failed" }> = { kind: "failed", cause: "outcome-unknown" };
const SIGNED_IN: RefreshOutcome = { kind: "signed-in" };

export function createRefreshClient(options: RefreshClientOptions): RefreshClient {
  const { store, transport } = options;
  const lock = options.lock ?? createTabLock();
  let inFlight: { generation: number; promise: Promise<RefreshOutcome> } | null = null;

  async function send(ticket: RequestTicket): Promise<RefreshOutcome> {
    let sent = false;
    let verdict: Exclude<RefreshVerdict, { kind: "retry" }> | null;
    try {
      verdict = await lock.run(async () => {
        const history: RefreshAttempt[] = [];
        for (;;) {
          // 잠금을 기다리는 동안이나 500 재시도 전에 로그아웃·새 로그인 시작·새 로그인이 있었으면 보내지 않는다.
          // 첫 500 뒤에 멈추면 그 500의 처리 결과는 알 수 없다(500만으로 롤백을 보장하지 않음). 반영은 저장소가 판정한다.
          if (!store.refreshCurrent(ticket)) return history.length === 0 ? null : ABANDONED_AFTER_500;
          sent = true;
          history.push(await transport());
          const next = classifyRefresh(history);
          if (next.kind !== "retry") return next;
        }
      });
    } catch {
      // 잠금이나 호출 함수의 예기치 않은 예외. 보내기 전이면 Refresh를 쓰지 않았고, 보낸 뒤면 결과를 알 수 없다.
      verdict = { kind: "failed", cause: sent ? "outcome-unknown" : "not-consumed" };
    }
    if (verdict === null) return { kind: "discarded", sent };
    if (verdict.kind === "issued") {
      return store.refreshSucceeded(verdict.accessToken, ticket) ? SIGNED_IN : { kind: "discarded", sent: true };
    }
    return store.refreshFailed(ticket, verdict.cause) ? { kind: "failed", cause: verdict.cause } : { kind: "discarded", sent };
  }

  return {
    refresh() {
      // 같은 세대의 진행 중 갱신은 HTTP 요청 하나를 함께 쓴다. 세대가 바뀌었으면 이전 갱신은 낡았으므로 새로 시작한다.
      if (inFlight && inFlight.generation === store.getSnapshot().generation) return inFlight.promise;
      const ticket = store.refreshStarted();
      if (!ticket) return Promise.resolve(NOT_STARTED);
      const promise = send(ticket).finally(() => {
        if (inFlight?.promise === promise) inFlight = null;
      });
      inFlight = { generation: ticket.generation, promise };
      return promise;
    },
    withSessionLock: (task) => lock.run(task),
  };
}

/**
 * Google 로그인 공통 함수(#286 8단계). 시작 API 호출·로그인 시도 보관·콜백 query 해석·완료 요청을 맡는다.
 * Google 버튼·이동·콜백 화면·안내 문구는 #287이 맡는다(#251 접점 답변 「분담·공유 순서」).
 *
 * 합의와 결정
 * - 시도 보관(#251 T1, 팀장 결정): `loginAttemptToken`·`state`·`next`·`expiresAt`을 `sessionStorage`의 키 하나에 둔다.
 *   요청 직전 `sent` 표시, 완료 응답을 받으면 삭제, 시한이 지나면 삭제, 로그 금지. 저장에 실패하면 Google로 이동하지 않는다.
 *   `next`는 저장할 때와 돌아올 때 모두 회원 경로인지 검사한다(`safeNextPath`). Access·Refresh는 여기에 두지 않는다.
 * - 결과: `signed-in`(이름 제안 포함) / `cancelled` / `failed`(이유 7종: attempt-invalid·unavailable·invalid-request·server·network·
 *   invalid-response·superseded). 이유 값은 #251 1번 합의다.
 * - 완료 API의 401은 로그인 시도 무효이며 회원 인증 만료로 처리하지 않는다. 보관 중인 토큰·인증 상태를 바꾸지 않는다(#286 본문).
 * - 콜백 실패·응답 유실·이미 보낸 뒤 다시 열린 콜백은 다시 보내거나 세션 확인으로 성공을 판정하지 않는다(#251 접점 1).
 *   그래서 이 파일은 응답 없는 완료를 다시 보내지 않고, `sent`가 표시된 시도는 `already-sent`로 돌려준다.
 * - 같은 시도·같은 입력의 완료 요청은 한 번만 보내고 결과를 함께 쓴다. 화면이 닫혀도 요청을 중단하거나 다시 보내지 않는다(#251 10번).
 *   로그아웃·새 로그인·회원 전환 뒤에는 이전 성공 결과를 재사용하지 않는다(#251 2번).
 * - 완료 요청은 갱신·로그아웃과 같은 잠금 안에서 보내고(3단계 연결 조건), 시도 식별자로 이전 시도의 결과를 거른다.
 *   콜백 화면은 완료 요청 직전 이 페이지에서 `loginStarted()`를 부른다(이 함수가 부른다).
 * - 서버는 최종 커밋 전에는 성공 응답이나 쿠키를 반환하지 않는다(api/docs/google-login.md). 그래서 오류 응답은 쿠키를 바꾸지 않은 것으로 본다.
 *   응답이 없거나 반영하지 않은 200(본문 오류·이전 시도)은 쿠키가 바뀌었을 수 있으므로 `loginNotAdopted()`로 알린다(5단계와 같은 기준).
 *
 * 제안·확인 필요(#287과 맞출 것)
 * - 보관 실패를 `unavailable`로 돌려준다(7종 안에 전용 값이 없음). 안내 문구는 #287이 정한다.
 * - 콜백 해석의 `complete`에 검증한 `next`를 함께 돌려준다(성공 뒤 #261 이동 판정에 넘길 값). 타입 초안에 없던 필드다.
 * - 콜백 화면에서는 세션 복원을 시작하지 않는다(복원 결과로 이번 로그인 성공을 판정하지 않기 위해).
 */
import { API_VERSION_PATH, normalizeApiBaseUrl } from "./api-client.ts";
import { readApiResponse, type ApiResult } from "./api-response.ts";
import type { AuthSession } from "./auth-session.ts";
import type { AuthGeneration, AuthStore } from "./auth-state.ts";
import { safeNextPath } from "./member-navigation.ts";

export type GoogleFailureReason =
  | "attempt-invalid" | "unavailable" | "invalid-request" | "server" | "network" | "invalid-response" | "superseded";

export type GoogleStartResult = { kind: "ready"; authorizationUrl: string } | { kind: "failed"; reason: GoogleFailureReason };

export type GoogleCompletionInput =
  | { state: string; loginAttemptToken: string; code: string }
  | { state: string; loginAttemptToken: string; error: "access_denied" };

export type GoogleCompletionResult =
  | { kind: "signed-in"; suggestedDisplayName: string | null }
  | { kind: "cancelled" }
  | { kind: "failed"; reason: GoogleFailureReason };

export type CallbackParse =
  /** 완료 API를 부른다(취소 `access_denied` 포함). `next`는 돌아올 때 다시 검사한 회원 경로다. */
  | { kind: "complete"; input: GoogleCompletionInput; next: string | null }
  /** 이미 완료 요청을 보낸 시도(새로고침 등). 다시 보내지 않고 새 로그인을 안내한다. */
  | { kind: "already-sent" }
  /** 보관한 시도가 없다. */
  | { kind: "no-attempt" }
  /** 시한이 지났다(보관값 삭제). */
  | { kind: "expired" }
  /** 다른 시도의 콜백. 보관값을 지우지 않고 무시한다. */
  | { kind: "state-mismatch" }
  /** Google이 `access_denied` 외의 오류를 돌려줬다. 완료 API를 부르지 않는다. */
  | { kind: "provider-error" }
  /** query 형식 오류. 완료 API를 부르지 않는다. */
  | { kind: "malformed" };

/** `sessionStorage`의 키. 값은 시도 하나의 JSON이다. */
export const GOOGLE_ATTEMPT_KEY = "catchu.auth.google-attempt";

/** `sessionStorage`에서 쓰는 부분. 시험에서는 대역을 넣는다. 접근이 예외를 던질 수 있다. */
export type AttemptStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

type StoredAttempt = { state: string; loginAttemptToken: string; next: string | null; expiresAt: number; sent: boolean };

/** 이 탭의 `sessionStorage`. 서버 렌더링이거나 접근 자체가 예외면 null. */
export function browserAttemptStorage(): AttemptStorage | null {
  try {
    const storage = (globalThis as { sessionStorage?: unknown }).sessionStorage;
    if (typeof storage !== "object" || storage === null) return null;
    const s = storage as Partial<AttemptStorage>;
    return typeof s.getItem === "function" && typeof s.setItem === "function" && typeof s.removeItem === "function"
      ? (storage as AttemptStorage) : null;
  } catch {
    return null;
  }
}

export type GoogleAuthOptions = {
  baseUrl: string | undefined;
  nodeEnv?: string;
  store: AuthStore;
  session: AuthSession;
  /** 기본값은 `browserAttemptStorage()`. null이면 보관할 수 없어 시작하지 않는다. */
  storage?: AttemptStorage | null;
  fetch?: typeof fetch;
  /** 시험용 현재 시각(밀리초). */
  now?: () => number;
};

export type GoogleAuth = {
  /** 시작 API를 부르고 시도를 보관한다. `ready`일 때만 화면이 `authorizationUrl`로 이동한다. */
  startGoogleLogin(next: string | null): Promise<GoogleStartResult>;
  /** 콜백 query를 보관한 시도와 대조한다. 상태를 바꾸지 않는다(시한이 지난 시도만 지운다). */
  readGoogleCallback(query: URLSearchParams): CallbackParse;
  /** 완료 요청. 같은 입력은 한 번만 보내고 결과를 함께 쓴다. */
  completeGoogleLogin(input: GoogleCompletionInput): Promise<GoogleCompletionResult>;
};

const failed = (reason: GoogleFailureReason): { kind: "failed"; reason: GoogleFailureReason } => ({ kind: "failed", reason });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 오류 응답(응답은 받음)의 이유. 서버 계약: 400 입력 오류, 401 시도 무효, 404 비활성, 500 내부 오류. 그 밖의 상태는 서버 오류로 본다. */
function reasonOfError(result: Exclude<ApiResult, { kind: "success" }>): GoogleFailureReason {
  if (result.status === 400) return "invalid-request";
  if (result.status === 401) return "attempt-invalid";
  if (result.status === 404) return "unavailable";
  return "server";
}

export function createGoogleAuth(options: GoogleAuthOptions): GoogleAuth {
  const { store, session } = options;
  const baseUrl = normalizeApiBaseUrl(options.baseUrl, options.nodeEnv);
  const fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
  const storage = options.storage === undefined ? browserAttemptStorage() : options.storage;
  const now = options.now ?? (() => Date.now());
  let latestStart = 0;
  const flights = new Map<string, { promise: Promise<GoogleCompletionResult>; generation: AuthGeneration | null }>();

  const read = (): StoredAttempt | null => {
    try {
      const raw = storage?.getItem(GOOGLE_ATTEMPT_KEY) ?? null;
      if (raw === null) return null;
      const value: unknown = JSON.parse(raw);
      if (!isRecord(value) || typeof value.state !== "string" || typeof value.loginAttemptToken !== "string"
        || typeof value.expiresAt !== "number" || typeof value.sent !== "boolean"
        || (value.next !== null && typeof value.next !== "string")) return null;
      return value as StoredAttempt;
    } catch {
      return null;
    }
  };
  const write = (value: StoredAttempt): boolean => {
    try {
      if (!storage) return false;
      storage.setItem(GOOGLE_ATTEMPT_KEY, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  };
  const remove = () => {
    try {
      storage?.removeItem(GOOGLE_ATTEMPT_KEY);
    } catch {
      // 지우지 못해도 시한(expiresAt)이 지나면 읽을 때 지운다.
    }
  };
  /** 완료한 시도가 지금 보관된 시도일 때만 지운다. 그사이 새로 시작해 보관한 시도는 지우지 않는다. */
  const removeIfSame = (input: GoogleCompletionInput) => {
    const stored = read();
    if (stored && stored.state === input.state && stored.loginAttemptToken === input.loginAttemptToken) remove();
  };

  async function post(path: string, body: unknown, credentials: RequestCredentials): Promise<ApiResult | null> {
    if (!baseUrl) return null;
    return readApiResponse(fetchImpl(`${baseUrl}${API_VERSION_PATH}${path}`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      credentials,
    }));
  }

  async function complete(input: GoogleCompletionInput, attempt: ReturnType<AuthStore["loginStarted"]>,
    record: { generation: AuthGeneration | null }): Promise<GoogleCompletionResult> {
    let sent = false;
    try {
      return await session.withSessionLock(async (): Promise<GoogleCompletionResult> => {
        // 잠금을 기다리는 동안 이 탭에서 다른 로그인을 시작했으면 보내지 않는다.
        if (!store.loginAttemptCurrent(attempt)) return failed("superseded");
        const stored = read();
        if (!stored || stored.state !== input.state || stored.loginAttemptToken !== input.loginAttemptToken || stored.sent) {
          store.loginAttemptEnded(attempt);
          return failed("attempt-invalid");
        }
        // 요청 직전 sent 표시(T1). 표시하지 못하면 새로고침 뒤 재전송을 막을 수 없으므로 보내지 않는다.
        if (!write({ ...stored, sent: true })) {
          store.loginAttemptEnded(attempt);
          return failed("unavailable");
        }
        const body = "code" in input
          ? { state: input.state, loginAttemptToken: input.loginAttemptToken, code: input.code }
          : { state: input.state, loginAttemptToken: input.loginAttemptToken, error: input.error };
        sent = true;
        const result = await post("/auth/google/login", body, "include");
        if (result === null) {
          store.loginAttemptEnded(attempt);
          return failed("server");
        }
        if (result.kind === "lookup-failed" && result.status === null) {
          // 응답 없음: 서버 처리·쿠키 변경 여부를 알 수 없다. 다시 보내지 않고, 보관값은 시한이 지나면 지운다.
          store.loginAttemptEnded(attempt);
          session.loginNotAdopted();
          return failed("network");
        }
        removeIfSame(input); // 완료 응답을 받았다(T1). 새 시도의 보관값은 지우지 않는다.
        if (result.kind === "success") {
          const data = result.data;
          if (isRecord(data) && data.cancelled === true) {
            store.loginAttemptEnded(attempt);
            return { kind: "cancelled" };
          }
          const token = isRecord(data) && typeof data.accessToken === "string" && data.accessToken.length > 0
            && data.tokenType === "Bearer" ? data.accessToken : null;
          const suggested = isRecord(data) && (typeof data.suggestedDisplayName === "string" || data.suggestedDisplayName === null)
            ? data.suggestedDisplayName as string | null : undefined;
          if (token !== null && suggested !== undefined) {
            const generation = session.loginSucceeded(token, attempt);
            if (generation !== null) {
              record.generation = generation;
              return { kind: "signed-in", suggestedDisplayName: suggested };
            }
          }
          // 반영하지 않은 200: 쿠키는 바뀌었다.
          store.loginAttemptEnded(attempt);
          session.loginNotAdopted();
          return failed(token !== null && suggested !== undefined ? "superseded" : "invalid-response");
        }
        store.loginAttemptEnded(attempt);
        if (result.status === 200) {
          // 200인데 본문을 읽지 못함: 쿠키는 바뀌었을 수 있다.
          session.loginNotAdopted();
          return failed("invalid-response");
        }
        // 오류 응답: 서버는 커밋 전 쿠키를 반환하지 않는다. 401은 시도 무효이며 회원 인증 상태를 바꾸지 않는다.
        return failed(reasonOfError(result));
      });
    } catch {
      store.loginAttemptEnded(attempt);
      if (sent) session.loginNotAdopted();
      return failed(sent ? "network" : "server");
    }
  }

  return {
    async startGoogleLogin(next) {
      const sequence = ++latestStart;
      if (!storage) return failed("unavailable"); // 보관할 수 없으면 시작하지 않는다(T1).
      // 새 로그인 시작: 이 탭에서 진행 중이던 이전 시도의 늦은 결과는 반영하지 않는다(#251 3번 「최근 시도만 반영」).
      // 실패하면 이 시도를 끝내 복원·갱신을 다시 허용한다. 준비되면 화면이 Google로 이동하므로 시도를 그대로 둔다.
      const attempt = store.loginStarted();
      const fail = (reason: GoogleFailureReason) => {
        store.loginAttemptEnded(attempt);
        return failed(reason);
      };
      const result = await post("/auth/google/authorization", {}, "omit");
      if (sequence !== latestStart) return failed("superseded"); // 연타: 마지막 시작만 쓴다(뒤의 시작이 시도를 이어받는다).
      if (result === null) return fail("server");
      if (result.kind === "lookup-failed" && result.status === null) return fail("network");
      if (result.kind !== "success") return result.status === 200 ? fail("invalid-response") : fail(reasonOfError(result));
      const data = result.data;
      if (!isRecord(data) || typeof data.authorizationUrl !== "string" || typeof data.loginAttemptToken !== "string"
        || data.loginAttemptToken.length === 0 || typeof data.expiresIn !== "number" || !(data.expiresIn > 0)) {
        return fail("invalid-response");
      }
      let state: string | null = null;
      try {
        const url = new URL(data.authorizationUrl);
        if (url.protocol === "https:") state = url.searchParams.get("state");
      } catch {
        state = null;
      }
      if (!state) return fail("invalid-response");
      const saved = write({ state, loginAttemptToken: data.loginAttemptToken, next: safeNextPath(next),
        expiresAt: now() + data.expiresIn * 1000, sent: false });
      if (!saved) return fail("unavailable");
      return { kind: "ready", authorizationUrl: data.authorizationUrl };
    },

    readGoogleCallback(query) {
      const stored = read();
      if (!stored) return { kind: "no-attempt" };
      if (now() >= stored.expiresAt) {
        remove();
        return { kind: "expired" };
      }
      const states = query.getAll("state");
      if (states.length !== 1 || states[0].length === 0) return { kind: "malformed" };
      if (states[0] !== stored.state) return { kind: "state-mismatch" };
      if (stored.sent) return { kind: "already-sent" };
      const codes = query.getAll("code");
      const errors = query.getAll("error");
      const base = { state: stored.state, loginAttemptToken: stored.loginAttemptToken };
      const next = safeNextPath(stored.next);
      if (errors.length > 0) {
        if (errors.length !== 1 || codes.length > 0) return { kind: "malformed" };
        return errors[0] === "access_denied"
          ? { kind: "complete", input: { ...base, error: "access_denied" }, next }
          : { kind: "provider-error" };
      }
      if (codes.length !== 1 || codes[0].length === 0) return { kind: "malformed" };
      return { kind: "complete", input: { ...base, code: codes[0] }, next };
    },

    completeGoogleLogin(input) {
      const key = JSON.stringify(["code" in input ? "code" : "error", input.state, input.loginAttemptToken,
        "code" in input ? input.code : input.error]);
      const existing = flights.get(key);
      if (existing) {
        // 같은 입력: 진행 중이면 그 결과를 함께 쓴다. 성공 뒤 로그아웃·새 로그인·회원 전환으로 세대가 바뀌었으면 재사용하지 않는다.
        if (existing.generation !== null && existing.generation !== store.getSnapshot().generation) {
          return Promise.resolve(failed("superseded"));
        }
        return existing.promise;
      }
      const attempt = store.loginStarted();
      const record: { promise: Promise<GoogleCompletionResult>; generation: AuthGeneration | null } = {
        promise: Promise.resolve(failed("server")), generation: null,
      };
      record.promise = complete(input, attempt, record);
      flights.set(key, record);
      return record.promise;
    },
  };
}

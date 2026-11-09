import type { PublishedSnapshot, RecipientApi, RecipientFailure, RecipientResult } from "./recipient-api.ts";
import type { GrantStore } from "./recipient-grants.ts";
import type { LinkAccessCode } from "./recipient-slots.ts";

/**
 * 받은 사람 발행본 화면 상태(U4 제출 3 W4). 10월 목록(V02)·상세(V03) 두 상태를 발행본 하나로 합쳤고, 판정은 서버가 하며 화면은 응답 코드로만 분기한다.
 *
 * - 링크 불가(404 `LINK_UNAVAILABLE`): 없음·삭제·중지·만료·작성자 비활성을 구분하지 않는 공통 화면(#416 OQ-U4-NFR-6 결정). 그 링크의 grant를 지운다.
 * - 비밀번호 필요(401 `LINK_PASSWORD_REQUIRED`): 비밀번호 입력. 받아 둔 grant가 있었다면 지우고 다시 입력받는다.
 * - 그 밖의 실패(500·통신 실패·손상된 응답·예상 밖 코드): 조회 실패. 링크 불가로 바꾸지 않는다(작성자 회원 행 없음 500도 여기).
 *
 * 확정된 거부(링크 불가·비밀번호 필요)를 받으면 표시하던 사본을 지운다. 조회 실패는 같은 링크의 이미 표시한 사본만 유지한다.
 * 붙는 컴포넌트(U5·U10)가 `onAccessLost(code)`를 부르면 같은 전환과 grant 삭제를 한다(C-11 rule).
 * 자동으로 다시 조회·전송하지 않는다. 늦게 도착한 응답(다시 조회·화면 해제 뒤)은 버린다.
 * 비밀번호 원문은 이 객체에 두지 않는다(화면 입력값에만 있다).
 */

export type UnlockPhase = "idle" | "submitting" | "invalid" | "limited" | "failed" | "empty";

export type UnlockSnapshot = {
  readonly phase: UnlockPhase;
  /** 시도 제한으로 다시 보낼 수 있게 되는 시각(ms). `Retry-After`가 없거나 형식이 틀리면 null(추정하지 않음). */
  readonly retryAt: number | null;
  /** 받아 둔 확인이 더는 쓰이지 않아(만료·무효) 다시 입력받는 경우 */
  readonly reentry: boolean;
};

const UNLOCK_IDLE: UnlockSnapshot = { phase: "idle", retryAt: null, reentry: false };

export type PublicationSnapshot =
  | { readonly view: "loading" }
  | { readonly view: "unavailable" }
  | { readonly view: "password"; readonly unlock: UnlockSnapshot }
  | { readonly view: "failed" }
  | {
    readonly view: "ready";
    readonly snapshot: PublishedSnapshot;
    /** 같은 링크를 다시 조회 중(이전 화면 유지) */
    readonly refreshing: boolean;
    /** 다시 조회에 실패해 이전 화면을 유지하고 있음 */
    readonly refreshFailed: boolean;
  };

type Denial = "unavailable" | "password" | "failed";

/** 조회 응답의 분기. 메시지 문구가 아니라 code로 판단한다(API 공통 오류). */
export function classifyReadFailure(result: RecipientFailure): Denial {
  if (result.kind !== "api-error") return "failed";
  if (result.status === 404 && result.code === "LINK_UNAVAILABLE") return "unavailable";
  if (result.status === 401 && (result.code === "LINK_PASSWORD_REQUIRED" || result.code === "LINK_PASSWORD_INVALID")) return "password";
  return "failed";
}

/** 비밀번호 확인 한 번의 결과. 화면은 `invalid`·`empty`일 때만 입력을 비우거나 다시 초점을 둔다. */
export type UnlockResult = "granted" | "invalid" | "limited" | "unavailable" | "failed" | "empty" | "ignored";

type UnlockOutcome =
  | { kind: "granted"; grant: string }
  | { kind: "invalid" }
  | { kind: "limited"; seconds: number | undefined }
  | { kind: "unavailable" }
  | { kind: "failed" };

/** unlock 응답의 분기. 비밀번호 오류는 확인된 불일치(401 `LINK_PASSWORD_INVALID`)에만 쓴다. */
export function classifyUnlock(result: RecipientResult<string>): UnlockOutcome {
  if (result.kind === "success") return { kind: "granted", grant: result.data };
  if (result.kind !== "api-error") return { kind: "failed" };
  if (result.status === 401 && result.code === "LINK_PASSWORD_INVALID") return { kind: "invalid" };
  if (result.status === 429) return { kind: "limited", seconds: "retryAfterSeconds" in result ? result.retryAfterSeconds : undefined };
  if (result.status === 404 && result.code === "LINK_UNAVAILABLE") return { kind: "unavailable" };
  return { kind: "failed" };
}

export type RecipientStoreOptions = {
  api: RecipientApi;
  grants: GrantStore;
  token: string;
  now?: () => number;
};

/**
 * 접근 처리: grant 읽기·지우기, 비밀번호 확인, 대기 시각, 늦은 응답 버리기(10월 그대로).
 * `onGranted`는 확인에 성공한 뒤 같은 화면의 자료를 다시 읽는다.
 */
function createAccess<S extends { view: string }>(options: RecipientStoreOptions, initial: S) {
  const now = options.now ?? (() => Date.now());
  const listeners = new Set<() => void>();
  let state: S = initial;
  /** 화면 해제·다시 조회 때 올려, 그 전에 시작한 요청의 응답을 버린다. */
  let generation = 0;
  let readAbort: AbortController | undefined;
  let unlockAbort: AbortController | undefined;
  /** 시도 제한 대기 시각. 비밀번호 화면을 다시 띄워도 이 화면이 살아 있는 동안 유지한다. */
  let retryAt: number | null = null;

  const set = (next: S) => {
    state = next;
    listeners.forEach((listener) => listener());
  };
  const waiting = () => retryAt !== null && now() < retryAt;
  const unlockSnapshot = (patch: Partial<UnlockSnapshot> = {}): UnlockSnapshot =>
    ({ ...UNLOCK_IDLE, retryAt: waiting() ? retryAt : null, ...patch });

  async function safely<T>(call: () => Promise<RecipientResult<T>>): Promise<RecipientResult<T>> {
    try { return await call(); } catch { return { kind: "lookup-failed", status: null, code: "LOOKUP_FAILED" }; }
  }

  /** 새 조회를 시작한다. 이전 조회는 취소하고 그 응답은 버린다. */
  function beginRead(): { gen: number; signal: AbortSignal; current: () => boolean } {
    readAbort?.abort();
    const abort = new AbortController();
    readAbort = abort;
    const gen = ++generation;
    return { gen, signal: abort.signal, current: () => gen === generation && !abort.signal.aborted };
  }

  return {
    get state() { return state; },
    set,
    now,
    waiting,
    unlockSnapshot,
    safely,
    beginRead,
    grant: () => options.grants.get(options.token),
    dropGrant: () => options.grants.remove(options.token),
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    /**
     * 비밀번호 확인. 확인 중·대기 중에는 보내지 않는다. 빈 값은 보내지 않고 안내한다.
     * 성공하면 그 링크에만 grant를 보관하고 `onGranted`로 자료를 다시 읽는다.
     */
    async unlock(password: string, toPassword: (unlock: UnlockSnapshot) => S, toUnavailable: () => S, onGranted: () => Promise<void>): Promise<UnlockResult> {
      const current = state as S & { unlock?: UnlockSnapshot };
      if (current.view !== "password" || current.unlock?.phase === "submitting" || waiting()) return "ignored";
      const reentry = current.unlock?.reentry ?? false;
      if (password.length === 0) {
        set(toPassword(unlockSnapshot({ phase: "empty", reentry })));
        return "empty";
      }
      unlockAbort?.abort();
      const abort = new AbortController();
      unlockAbort = abort;
      const gen = generation;
      set(toPassword(unlockSnapshot({ phase: "submitting", reentry })));
      const result = await safely(() => options.api.unlock(options.token, password, abort.signal));
      if (gen !== generation || abort.signal.aborted) return "ignored";
      const outcome = classifyUnlock(result);
      if (outcome.kind === "granted") {
        options.grants.set(options.token, outcome.grant);
        retryAt = null;
        await onGranted();
        return "granted";
      }
      if (outcome.kind === "unavailable") {
        options.grants.remove(options.token);
        set(toUnavailable());
        return "unavailable";
      }
      if (outcome.kind === "limited") {
        retryAt = outcome.seconds === undefined ? null : now() + outcome.seconds * 1000;
        set(toPassword(unlockSnapshot({ phase: "limited", reentry })));
        return "limited";
      }
      set(toPassword(unlockSnapshot({ phase: outcome.kind, reentry })));
      return outcome.kind;
    },
    /** 남은 대기 초(올림). 대기 중이 아니면 0. */
    retryWaitSeconds: () => (waiting() && retryAt !== null ? Math.ceil((retryAt - now()) / 1000) : 0),
    dispose(reset: S) {
      generation += 1;
      readAbort?.abort();
      unlockAbort?.abort();
      retryAt = null;
      set(reset);
    },
  };
}

/** 발행본 화면(`/s/[token]`). 열람 한 번에 판정과 사본을 함께 받는다(다음 페이지 없음). */
export function createRecipientPublicationStore(options: RecipientStoreOptions) {
  const access = createAccess<PublicationSnapshot>(options, { view: "loading" });
  const toPassword = (unlock: UnlockSnapshot): PublicationSnapshot => ({ view: "password", unlock });
  const toUnavailable = (): PublicationSnapshot => ({ view: "unavailable" });

  /** 확정 거부: 표시하던 사본을 지우고 그 링크의 grant만 지운다. */
  function deny(denial: Exclude<Denial, "failed">, hadGrant: boolean) {
    access.dropGrant();
    access.set(denial === "unavailable" ? toUnavailable() : toPassword(access.unlockSnapshot({ reentry: hadGrant })));
  }

  /** 발행본을 읽는다. 같은 링크의 사본이 있으면 그 화면을 유지한 채 갱신한다. */
  async function load(): Promise<void> {
    const read = access.beginRead();
    const before = access.state;
    if (before.view === "ready") access.set({ ...before, refreshing: true, refreshFailed: false });
    else access.set({ view: "loading" });
    const grant = access.grant();
    const result = await access.safely(() => options.api.publication(options.token, grant, read.signal));
    if (!read.current()) return;
    if (result.kind === "success") {
      access.set({ view: "ready", snapshot: result.data, refreshing: false, refreshFailed: false });
      return;
    }
    const denial = classifyReadFailure(result);
    if (denial !== "failed") {
      deny(denial, grant !== null);
      return;
    }
    const now = access.state;
    if (now.view === "ready") access.set({ ...now, refreshing: false, refreshFailed: true });
    else access.set({ view: "failed" });
  }

  return {
    getSnapshot: () => access.state,
    subscribe: access.subscribe,
    load,
    unlock: (password: string) => access.unlock(password, toPassword, toUnavailable, load),
    /**
     * 붙는 컴포넌트가 받은 링크 접근 오류(C-11 rule). 화면이 직접 받은 404·401과 같은 전환과 grant 삭제를 하고,
     * 진행 중이던 이 화면의 조회는 끊어 늦은 응답이 거부를 덮지 않게 한다.
     */
    accessLost(code: LinkAccessCode) {
      const hadGrant = access.grant() !== null;
      access.beginRead();
      deny(code === "LINK_UNAVAILABLE" ? "unavailable" : "password", hadGrant);
    },
    retryWaitSeconds: access.retryWaitSeconds,
    now: access.now,
    /** 화면을 떠날 때: 진행 중 요청을 취소하고 늦은 응답을 버린다. 보관한 grant는 지우지 않는다(같은 탭에서 다시 열 수 있게). */
    dispose() {
      access.dispose({ view: "loading" });
    },
  };
}

export type RecipientPublicationStore = ReturnType<typeof createRecipientPublicationStore>;

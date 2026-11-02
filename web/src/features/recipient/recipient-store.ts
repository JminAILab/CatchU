import type { PublicCatch, PublicCollection, PublicProfile, RecipientApi, RecipientFailure, RecipientResult } from "./recipient-api.ts";
import type { GrantStore } from "./recipient-grants.ts";

/**
 * 수신자 목록(V02)·상세(V03) 상태(#152). 판정은 서버가 하고, 화면은 응답 코드로만 분기한다.
 *
 * - 링크 불가(404 `LINK_UNAVAILABLE`): 없음·중단·만료·소유 회원 비활성을 구분하지 않는 공통 화면. 그 링크의 grant를 지운다.
 * - 비밀번호 필요(401 `LINK_PASSWORD_REQUIRED`): 비밀번호 입력. 받아 둔 grant가 있었다면 지우고 다시 입력받는다.
 * - 상세 불가(404 `RESOURCE_UNAVAILABLE`): 숨김·타인·없는 Catch 공통 안내. 링크 자체는 열려 있다.
 * - 그 밖의 실패(500·통신 실패·손상된 응답·예상 밖 코드): 조회 실패. 0건·숨김·링크 불가로 바꾸지 않는다.
 *
 * 확정된 거부(링크 불가·비밀번호 필요·상세 불가)를 받으면 표시하던 자료를 지운다.
 * 조회 실패는 이미 표시한 같은 링크·같은 Catch의 화면만 유지하고 새로 요청한 자료만 보류한다.
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

export type CollectionSnapshot =
  | { readonly view: "loading" }
  | { readonly view: "unavailable" }
  | { readonly view: "password"; readonly unlock: UnlockSnapshot }
  | { readonly view: "failed" }
  | {
    readonly view: "ready";
    readonly profile: PublicProfile;
    readonly catches: readonly PublicCatch[];
    readonly nextCursor: string | null;
    readonly more: "idle" | "loading" | "failed";
    /** 같은 링크를 다시 조회 중(이전 화면 유지) */
    readonly refreshing: boolean;
    /** 다시 조회에 실패해 이전 화면을 유지하고 있음 */
    readonly refreshFailed: boolean;
  };

export type CatchSnapshot =
  | { readonly view: "loading" }
  | { readonly view: "unavailable" }
  | { readonly view: "resource-unavailable" }
  | { readonly view: "password"; readonly unlock: UnlockSnapshot }
  | { readonly view: "failed" }
  | { readonly view: "ready"; readonly item: PublicCatch; readonly refreshing: boolean; readonly refreshFailed: boolean };

type Denial = "unavailable" | "password" | "resource" | "failed";

/** 조회 응답의 분기. 메시지 문구가 아니라 code로 판단한다(API 명세 「공통 오류」). */
export function classifyReadFailure(result: RecipientFailure): Denial {
  if (result.kind !== "api-error") return "failed";
  if (result.status === 404 && result.code === "LINK_UNAVAILABLE") return "unavailable";
  if (result.status === 401 && (result.code === "LINK_PASSWORD_REQUIRED" || result.code === "LINK_PASSWORD_INVALID")) return "password";
  if (result.status === 404 && result.code === "RESOURCE_UNAVAILABLE") return "resource";
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
 * 두 상태 객체가 함께 쓰는 접근 처리: grant 읽기·지우기, 비밀번호 확인, 대기 시각, 늦은 응답 버리기.
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

/** 목록(V02): 공개 프로필과 현재 공개 Catch. 다음 페이지도 서버가 새로 판정한다. */
export function createRecipientCollectionStore(options: RecipientStoreOptions) {
  const access = createAccess<CollectionSnapshot>(options, { view: "loading" });
  let moreAbort: AbortController | undefined;
  const toPassword = (unlock: UnlockSnapshot): CollectionSnapshot => ({ view: "password", unlock });
  const toUnavailable = (): CollectionSnapshot => ({ view: "unavailable" });

  function deny(denial: Denial, hadGrant: boolean) {
    if (denial === "unavailable") {
      access.dropGrant();
      access.set(toUnavailable());
    } else {
      access.dropGrant();
      access.set(toPassword(access.unlockSnapshot({ reentry: hadGrant })));
    }
  }

  /** 첫 페이지부터 다시 읽는다. 같은 링크의 목록이 있으면 그 목록을 유지한 채 갱신한다. */
  async function load(): Promise<void> {
    moreAbort?.abort();
    const read = access.beginRead();
    const before = access.state;
    if (before.view === "ready") access.set({ ...before, refreshing: true, refreshFailed: false, more: before.more === "loading" ? "idle" : before.more });
    else access.set({ view: "loading" });
    const grant = access.grant();
    const result = await access.safely(() => options.api.collection(options.token, grant, null, read.signal));
    if (!read.current()) return;
    if (result.kind === "success") {
      access.set(readyFrom(result.data));
      return;
    }
    const denial = classifyReadFailure(result);
    if (denial === "unavailable" || denial === "password") {
      deny(denial, grant !== null);
      return;
    }
    const now = access.state;
    if (now.view === "ready") access.set({ ...now, refreshing: false, refreshFailed: true });
    else access.set({ view: "failed" });
  }

  function readyFrom(data: PublicCollection): CollectionSnapshot {
    return { view: "ready", profile: data.profile, catches: dedupe(data.catches), nextCursor: data.nextCursor, more: "idle", refreshing: false, refreshFailed: false };
  }

  /** 다음 페이지. 실패하면 받은 목록은 그대로 두고 다시 시도할 수 있게 한다. 확정 거부면 목록을 지운다. */
  async function loadMore(): Promise<void> {
    const before = access.state;
    if (before.view !== "ready" || before.nextCursor === null || before.more === "loading" || before.refreshing) return;
    moreAbort?.abort();
    const abort = new AbortController();
    moreAbort = abort;
    const cursor = before.nextCursor;
    access.set({ ...before, more: "loading" });
    const grant = access.grant();
    const result = await access.safely(() => options.api.collection(options.token, grant, cursor, abort.signal));
    const now = access.state;
    if (abort.signal.aborted || now.view !== "ready" || now.nextCursor !== cursor) return;
    if (result.kind === "success") {
      access.set({
        ...now,
        profile: result.data.profile,
        catches: dedupe([...now.catches, ...result.data.catches]),
        nextCursor: result.data.nextCursor,
        more: "idle",
      });
      return;
    }
    const denial = classifyReadFailure(result);
    if (denial === "unavailable" || denial === "password") {
      access.beginRead();
      deny(denial, grant !== null);
      return;
    }
    access.set({ ...now, more: "failed" });
  }

  return {
    getSnapshot: () => access.state,
    subscribe: access.subscribe,
    load,
    loadMore,
    unlock: (password: string) => access.unlock(password, toPassword, toUnavailable, load),
    retryWaitSeconds: access.retryWaitSeconds,
    now: access.now,
    /** 화면을 떠날 때: 진행 중 요청을 취소하고 늦은 응답을 버린다. 보관한 grant는 지우지 않는다(같은 탭에서 다시 열 수 있게). */
    dispose() {
      moreAbort?.abort();
      access.dispose({ view: "loading" });
    },
  };
}

/** 상세(V03). 다른 Catch의 응답은 받지 않는다(api가 catchId를 대조). */
export function createRecipientCatchStore(options: RecipientStoreOptions & { catchId: string }) {
  const access = createAccess<CatchSnapshot>(options, { view: "loading" });
  const toPassword = (unlock: UnlockSnapshot): CatchSnapshot => ({ view: "password", unlock });
  const toUnavailable = (): CatchSnapshot => ({ view: "unavailable" });

  async function load(): Promise<void> {
    const read = access.beginRead();
    const before = access.state;
    if (before.view === "ready") access.set({ ...before, refreshing: true, refreshFailed: false });
    else access.set({ view: "loading" });
    const grant = access.grant();
    const result = await access.safely(() => options.api.catchDetail(options.token, options.catchId, grant, read.signal));
    if (!read.current()) return;
    if (result.kind === "success") {
      access.set({ view: "ready", item: result.data, refreshing: false, refreshFailed: false });
      return;
    }
    const denial = classifyReadFailure(result);
    if (denial === "unavailable") {
      access.dropGrant();
      access.set(toUnavailable());
    } else if (denial === "password") {
      access.dropGrant();
      access.set(toPassword(access.unlockSnapshot({ reentry: grant !== null })));
    } else if (denial === "resource") {
      access.set({ view: "resource-unavailable" });
    } else {
      const now = access.state;
      if (now.view === "ready") access.set({ ...now, refreshing: false, refreshFailed: true });
      else access.set({ view: "failed" });
    }
  }

  return {
    getSnapshot: () => access.state,
    subscribe: access.subscribe,
    load,
    unlock: (password: string) => access.unlock(password, toPassword, toUnavailable, load),
    retryWaitSeconds: access.retryWaitSeconds,
    now: access.now,
    dispose() {
      access.dispose({ view: "loading" });
    },
  };
}

function dedupe(items: readonly PublicCatch[]): PublicCatch[] {
  const seen = new Set<string>();
  return items.filter((item) => (seen.has(item.catchId) ? false : (seen.add(item.catchId), true)));
}

export type RecipientCollectionStore = ReturnType<typeof createRecipientCollectionStore>;
export type RecipientCatchStore = ReturnType<typeof createRecipientCatchStore>;

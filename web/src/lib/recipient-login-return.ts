import { afterLoginPath, loginPath } from "./member-navigation.ts";
import { recipientLinkPath, routes } from "./routes.ts";

/** #638: 받은 링크 토큰은 OAuth 시도·next와 분리한 이 탭의 임시 보관 값에만 둔다. */
export const RECIPIENT_RETURN_KEY = "catchu.recipient-login-return.v1";
export const RECIPIENT_RETURN_TTL_MS = 30 * 60 * 1000;
export const recipientLoginHref = `${routes.login}?entry=recipient`;
// api/src/share-links/link-token.ts의 정본과 test/recipient-login-return.test.mjs로 묶는다.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export function isRecipientReturnToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

type ReturnStage = "entry" | "login" | "callback" | "profile" | "return";
type ReturnRecord = { token: string; createdAt: number; stage: ReturnStage };
type TabStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const STAGES: readonly string[] = ["entry", "login", "callback", "profile", "return"];

/** 저장소를 사용할 수 없으면 복귀를 끈다. 토큰을 다른 저장소·주소·로그로 옮기지 않는다. */
export function createRecipientLoginReturn(getStorage: () => TabStorage | null, now = Date.now) {
  const listeners = new Set<() => void>();
  let blocked = false;
  const notify = () => { for (const listener of listeners) listener(); };
  function storage(): TabStorage | null {
    try { return getStorage(); } catch { return null; }
  }
  function clear() {
    blocked = true;
    try {
      const target = storage();
      target?.removeItem(RECIPIENT_RETURN_KEY);
      blocked = target === null;
    } catch { /* 저장소 접근 거부: 이 페이지에서도 남은 값을 사용하지 않는다. */ }
    notify();
  }
  function read(): ReturnRecord | null {
    if (blocked) return null;
    const target = storage();
    if (!target) return null;
    let raw: string | null;
    try { raw = target.getItem(RECIPIENT_RETURN_KEY); } catch { return null; }
    if (raw === null) return null;
    let value: Partial<ReturnRecord> | null;
    try { value = JSON.parse(raw) as Partial<ReturnRecord> | null; } catch { value = null; }
    const elapsed = typeof value?.createdAt === "number" ? now() - value.createdAt : NaN;
    if (!value || !isRecipientReturnToken(value.token) || !Number.isFinite(elapsed)
      || elapsed < 0 || elapsed >= RECIPIENT_RETURN_TTL_MS || !STAGES.includes(value.stage ?? "")) {
      try { target.removeItem(RECIPIENT_RETURN_KEY); } catch { /* 사용할 수 없는 값은 이동에 쓰지 않는다. */ }
      return null;
    }
    return value as ReturnRecord;
  }
  function write(record: ReturnRecord): boolean {
    try {
      const target = storage();
      if (!target) return false;
      target.setItem(RECIPIENT_RETURN_KEY, JSON.stringify(record));
      blocked = false;
      notify();
      return true;
    } catch { blocked = true; return false; }
  }
  function nextStage(record: ReturnRecord, stage: ReturnStage): boolean {
    return write({ ...record, stage });
  }
  function loginEntry(query: URLSearchParams): string | null {
    if (query.get("entry") !== "recipient" || query.has("next")) return null;
    const record = read();
    return record && ["entry", "login", "callback"].includes(record.stage) ? recipientLinkPath(record.token) : null;
  }
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    begin(token: string): string {
      clear();
      return isRecipientReturnToken(token) && write({ token, createdAt: now(), stage: "entry" }) ? recipientLoginHref : routes.login;
    },
    prepareLogin(query: URLSearchParams) {
      if (!loginEntry(query)) { clear(); return; }
      const record = read();
      if (record && record.stage !== "login") nextStage(record, "login");
    },
    loginEntry,
    startGoogle(next: string | null): string | null {
      const record = read();
      if (next === null && record && (record.stage === "login" || record.stage === "callback")) {
        nextStage(record, "callback");
        return null;
      }
      clear();
      return next;
    },
    afterLogin(displayName: string | null, next: string | null | undefined): string {
      const record = read();
      if (next == null && record && ["login", "callback", "profile", "return"].includes(record.stage)) {
        if (displayName === "") {
          return nextStage(record, "profile") ? routes.profileSetup : afterLoginPath(displayName, next);
        }
        return nextStage(record, "return") ? recipientLinkPath(record.token) : afterLoginPath(displayName, next);
      }
      clear();
      return afterLoginPath(displayName, next);
    },
    retryLogin(next: string | null = null): string {
      const record = read();
      return next === null && record?.stage === "callback" ? recipientLoginHref : loginPath(next ?? undefined);
    },
    profileReturn(): string | null {
      const record = read();
      return record?.stage === "profile" ? recipientLinkPath(record.token) : null;
    },
    afterProfile(): string {
      const record = read();
      if (record && (record.stage === "profile" || record.stage === "return") && nextStage(record, "return")) return recipientLinkPath(record.token);
      clear();
      return routes.home;
    },
    arrive(token: string) {
      const record = read();
      if (record?.token === token) clear();
    },
  };
}

const recipientReturn = createRecipientLoginReturn(() => typeof window === "undefined" ? null : window.sessionStorage);
export const beginRecipientLogin = recipientReturn.begin;
export const clearRecipientReturnOnArrival = recipientReturn.arrive;
export const prepareRecipientLoginEntry = recipientReturn.prepareLogin;
export const prepareRecipientGoogleLogin = recipientReturn.startGoogle;
export const afterRecipientAwareLogin = recipientReturn.afterLogin;
export const recipientRetryLoginPath = recipientReturn.retryLogin;
export const afterRecipientProfileSetup = recipientReturn.afterProfile;
export const recipientProfileReturnPath = recipientReturn.profileReturn;
export const subscribeRecipientReturn = recipientReturn.subscribe;
export function recipientLoginEntryPath(): string | null {
  return typeof window === "undefined" ? null : recipientReturn.loginEntry(new URLSearchParams(window.location.search));
}

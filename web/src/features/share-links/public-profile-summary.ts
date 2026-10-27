import type { ApiResult } from "../../lib/api-response.ts";

/**
 * L01 공개 프로필 요약(#149, 공유링크 초안 §4.1 기본 프로필).
 * 본인 `GET /v1/me`(A, #135)에서 수신자에게 공개되는 필드만 꺼낸다. 기준은 수신자 응답 `PublicProfile`(common.yaml)과
 * api `OwnerProfileReader.readPublicProfile`이다.
 * - `displayName`·`introduction`·`desiredRole`·`skills`: 회원이 직접 입력한 프로필 그대로.
 * - `githubAccountLogin`: GitHub 연결이 `CONNECTED`일 때의 저장 계정명. `REAUTH_REQUIRED`·`DISCONNECTED`면 null.
 *   `/me`는 상태와 무관하게 `accountLogin`을 주므로 여기서 같은 규칙으로 거른다.
 *   `CONNECTED`인데 계정명이 빈 문자열이면 수신자 응답(`toPublicProfile`)은 오류이므로, 줄만 숨겨 정상처럼 보이지 않고 조회 실패로 둔다.
 * 응답이 계약과 다르면 빈 프로필로 바꾸지 않고 조회 실패로 둔다.
 */
export type PublicProfileView = {
  readonly displayName: string;
  readonly introduction: string;
  readonly desiredRole: string;
  readonly skills: readonly string[];
  readonly githubAccountLogin: string | null;
};

export type PublicProfileSummaryState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly profile: PublicProfileView }
  | { readonly status: "failed" };

export type ProfileTransport = (path: string, request: { method: "GET"; cache: "no-store"; signal?: AbortSignal }) => Promise<ApiResult>;

const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const GITHUB_STATES = ["CONNECTED", "DISCONNECTED", "REAUTH_REQUIRED"];

/** `Member` 응답에서 수신자 공개 프로필을 만든다. 계약과 다르면 null. */
export function publicProfileFromMember(data: unknown): PublicProfileView | null {
  if (!record(data) || !record(data.profile) || !record(data.github)) return null;
  const { displayName, introduction, desiredRole, skills } = data.profile;
  const { state, accountLogin } = data.github;
  if (typeof displayName !== "string" || typeof introduction !== "string" || typeof desiredRole !== "string") return null;
  if (!Array.isArray(skills) || !skills.every((skill) => typeof skill === "string")) return null;
  if (!GITHUB_STATES.includes(state as string) || (accountLogin !== null && typeof accountLogin !== "string")) return null;
  if (state === "CONNECTED" && accountLogin === "") return null;
  const login = state === "CONNECTED" && typeof accountLogin === "string" ? accountLogin : null;
  return { displayName, introduction, desiredRole, skills: [...skills], githubAccountLogin: login };
}

export function createPublicProfileSummary(member: ProfileTransport) {
  let state: PublicProfileSummaryState = { status: "idle" };
  let run = 0;
  let controller: AbortController | null = null;
  const listeners = new Set<() => void>();
  const set = (next: PublicProfileSummaryState) => {
    state = next;
    listeners.forEach((listener) => listener());
  };

  async function load(): Promise<void> {
    controller?.abort();
    const current = ++run;
    const abort = new AbortController();
    controller = abort;
    set({ status: "loading" });
    let profile: PublicProfileView | null = null;
    try {
      const result = await member("/me", { method: "GET", cache: "no-store", signal: abort.signal });
      profile = result.kind === "success" && result.status === 200 ? publicProfileFromMember(result.data) : null;
    } catch {
      profile = null;
    }
    if (current !== run) return;
    set(profile ? { status: "ready", profile } : { status: "failed" });
  }

  return {
    load,
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      run += 1;
      controller?.abort();
      controller = null;
    },
  };
}

export type PublicProfileSummary = ReturnType<typeof createPublicProfileSummary>;

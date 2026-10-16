import type { ClientApiFailure } from "../../lib/api-client.ts";
import type { ApiResult } from "../../lib/api-response.ts";

/**
 * 공유 링크 회원 API(#147 발급, #148 목록·중단) 경계.
 * 인증·base URL·`/v1`·공통 오류 해석은 #106의 `api.member`가 맡는다. 이 파일은 응답 모양만 검사한다.
 */

export type ShareLinkState = "ACTIVE" | "STOPPED" | "EXPIRED";

/** API 명세 v1 common.yaml ShareLink. 링크 비밀번호 원문은 응답에 없다. */
export type ShareLink = {
  readonly linkId: string;
  readonly title: string;
  readonly url: string;
  readonly passwordRequired: boolean;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly stoppedAt: string | null;
  readonly state: ShareLinkState;
};

export type ShareLinkPage = { readonly items: readonly ShareLink[]; readonly nextCursor: string | null };

/** 발급 본문(ShareCreate). 비밀번호를 쓰지 않으면 키를 넣지 않는다. */
export type ShareCreateBody = { readonly title: string; readonly password?: string };

export type MemberCall = (path: string, request?: {
  method?: "GET" | "POST" | "PUT";
  body?: unknown;
  idempotencyKey?: string;
  signal?: AbortSignal;
}) => Promise<ApiResult | ClientApiFailure>;

/** 실패 결과. 429면 `Retry-After`의 남은 초가 `retryAfterSeconds`로 붙는다(공통 호출 함수, #235 계약). */
export type ShareLinkFailure = Exclude<ApiResult, { kind: "success" }> | ClientApiFailure;
export type ShareLinkResult<T> = { kind: "success"; status: number; data: T } | ShareLinkFailure;

/** 목록 한 번에 받을 개수. 계약 기본값과 같다. */
export const SHARE_LINK_PAGE_SIZE = 20;

const STATES: readonly string[] = ["ACTIVE", "STOPPED", "EXPIRED"];
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isTime = (value: unknown): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value));

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || !URL.canParse(value)) return false;
  const protocol = new URL(value).protocol;
  return protocol === "http:" || protocol === "https:";
}

/** 손상된 200 응답을 정상 링크나 0건으로 표시하지 않기 위한 검사. */
export function isShareLink(value: unknown): value is ShareLink {
  return record(value)
    && typeof value.linkId === "string" && value.linkId.length > 0
    && typeof value.title === "string"
    && isHttpUrl(value.url)
    && typeof value.passwordRequired === "boolean"
    && isTime(value.createdAt) && isTime(value.expiresAt)
    && (value.stoppedAt === null || isTime(value.stoppedAt))
    && STATES.includes(value.state as string);
}

export function isShareLinkPage(value: unknown): value is { items: ShareLink[]; page: { nextCursor: string | null } } {
  return record(value) && Array.isArray(value.items) && value.items.every(isShareLink)
    && record(value.page) && (value.page.nextCursor === null || (typeof value.page.nextCursor === "string" && value.page.nextCursor.length > 0));
}

const LOOKUP_FAILED = (status: number | null): ShareLinkFailure => ({ kind: "lookup-failed", status, code: "LOOKUP_FAILED" });

export function createShareLinkApi(member: MemberCall) {
  async function call<T>(
    path: string,
    request: Parameters<MemberCall>[1],
    statuses: readonly number[],
    read: (data: unknown) => T | null,
  ): Promise<ShareLinkResult<T>> {
    let result: ApiResult | ClientApiFailure;
    try {
      result = await member(path, request);
    } catch {
      return LOOKUP_FAILED(null);
    }
    if (result.kind !== "success") return result;
    const data = statuses.includes(result.status) ? read(result.data) : null;
    return data === null ? LOOKUP_FAILED(result.status) : { kind: "success", status: result.status, data };
  }

  return {
    /** 내 링크 목록. 발행 시각 최신순은 서버가 정한다. */
    list(cursor: string | null, signal?: AbortSignal): Promise<ShareLinkResult<ShareLinkPage>> {
      const query = new URLSearchParams({ limit: String(SHARE_LINK_PAGE_SIZE) });
      if (cursor !== null) query.set("cursor", cursor);
      return call(`/share-links?${query}`, { method: "GET", signal }, [200], (data) =>
        isShareLinkPage(data) ? { items: data.items, nextCursor: data.page.nextCursor } : null);
    },

    /** 발급. 201은 새 발급, 200은 같은 키·같은 본문의 기존 결과다. 둘 다 발급된 링크로 본다. */
    create(body: ShareCreateBody, idempotencyKey: string): Promise<ShareLinkResult<ShareLink>> {
      return call("/share-links", { method: "POST", body, idempotencyKey }, [200, 201], (data) =>
        isShareLink(data) ? data : null);
    },

    /** 중단. 본문·쿼리를 보내지 않는다(빈 객체 `{}`도 400이다, #148). */
    stop(linkId: string): Promise<ShareLinkResult<ShareLink>> {
      return call(`/share-links/${encodeURIComponent(linkId)}/stop`, { method: "PUT" }, [200], (data) =>
        isShareLink(data) && data.linkId === linkId ? data : null);
    },
  };
}

export type ShareLinkApi = ReturnType<typeof createShareLinkApi>;

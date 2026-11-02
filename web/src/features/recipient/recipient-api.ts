import type { ClientApiFailure, RecipientRequest } from "../../lib/api-client.ts";
import type { ApiResult } from "../../lib/api-response.ts";

/**
 * 비로그인 수신자 API(#150 unlock·접근 판정, #151 공개 프로필·Catch) 경계.
 * base URL·`/v1`·공통 오류 해석·`Retry-After`는 #106의 `api.recipient`가 맡고, 회원 토큰은 붙이지 않는다.
 * 이 파일은 응답 모양만 검사하고, 계약에 있는 필드만 골라 화면에 넘긴다(본인용 필드가 섞여 와도 표시하지 않는다).
 */

/** API 명세 v1 common.yaml PublicProfile. 네 항목은 자가 입력(fieldSource), GitHub 계정명은 저장값이다. */
export type PublicProfile = {
  readonly displayName: string;
  readonly introduction: string;
  readonly desiredRole: string;
  readonly skills: readonly string[];
  readonly fieldSource: "SELF_REPORTED";
  /** CONNECTED일 때만 저장한 계정명. null은 표시할 계정 정보가 없다는 뜻이며 미연동으로 표시하지 않는다(#332). */
  readonly githubAccountLogin: string | null;
};

export type PublicEvidence = {
  readonly sourceUrl: string;
  readonly sourceRevision: string;
  readonly representedFacts: readonly string[];
  readonly contributionScope: string;
  readonly coverageLimits: readonly string[];
};

export type DraftStatus = "GENERATED" | "FAILED" | "NOT_GENERATED";

/** API 명세 v1 common.yaml PublicCatch. 제목·초안이 없으면 null이며 다른 값으로 채우지 않는다(10/8 결정). */
export type PublicCatch = {
  readonly catchId: string;
  readonly title: string | null;
  readonly workFacts: readonly string[];
  readonly subjectContribution: string;
  readonly evidence: readonly PublicEvidence[];
  readonly draft: { readonly status: DraftStatus; readonly content: string | null };
};

export type PublicCollection = {
  readonly profile: PublicProfile;
  readonly catches: readonly PublicCatch[];
  readonly nextCursor: string | null;
};

export type RecipientCall = (path: string, request?: RecipientRequest) => Promise<ApiResult | ClientApiFailure>;

/** 실패 결과. 429면 `Retry-After`의 남은 초가 `retryAfterSeconds`로 붙는다. */
export type RecipientFailure = Exclude<ApiResult, { kind: "success" }> | ClientApiFailure;
export type RecipientResult<T> = { kind: "success"; status: number; data: T } | RecipientFailure;

/** 목록 한 번에 받을 개수. 계약 기본값과 같다. */
export const RECIPIENT_PAGE_SIZE = 20;

const DRAFT_STATUSES: readonly string[] = ["GENERATED", "FAILED", "NOT_GENERATED"];
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");
const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.length > 0;

export function readPublicProfile(value: unknown): PublicProfile | null {
  if (!record(value)) return null;
  const { displayName, introduction, desiredRole, skills, fieldSource, githubAccountLogin } = value;
  if (typeof displayName !== "string" || typeof introduction !== "string" || typeof desiredRole !== "string"
    || !strings(skills) || fieldSource !== "SELF_REPORTED"
    || !(githubAccountLogin === null || nonEmpty(githubAccountLogin))) return null;
  return { displayName, introduction, desiredRole, skills: [...skills], fieldSource, githubAccountLogin };
}

function readEvidence(value: unknown): PublicEvidence | null {
  if (!record(value)) return null;
  const { sourceUrl, sourceRevision, representedFacts, contributionScope, coverageLimits } = value;
  if (typeof sourceUrl !== "string" || typeof sourceRevision !== "string" || !strings(representedFacts)
    || typeof contributionScope !== "string" || !strings(coverageLimits)) return null;
  return { sourceUrl, sourceRevision, representedFacts: [...representedFacts], contributionScope, coverageLimits: [...coverageLimits] };
}

export function readPublicCatch(value: unknown): PublicCatch | null {
  if (!record(value)) return null;
  const { catchId, title, workFacts, subjectContribution, evidence, draft } = value;
  if (!nonEmpty(catchId) || !(title === null || nonEmpty(title)) || !strings(workFacts)
    || typeof subjectContribution !== "string" || !Array.isArray(evidence) || !record(draft)) return null;
  if (!DRAFT_STATUSES.includes(draft.status as string) || !(draft.content === null || typeof draft.content === "string")) return null;
  const items = evidence.map(readEvidence);
  if (items.some((item) => item === null)) return null;
  return {
    catchId,
    title,
    workFacts: [...workFacts],
    subjectContribution,
    evidence: items as PublicEvidence[],
    draft: { status: draft.status as DraftStatus, content: draft.content as string | null },
  };
}

export function readPublicCollection(value: unknown): PublicCollection | null {
  if (!record(value) || !Array.isArray(value.catches) || !record(value.page)) return null;
  const profile = readPublicProfile(value.profile);
  const catches = value.catches.map(readPublicCatch);
  const { nextCursor } = value.page;
  if (profile === null || catches.some((item) => item === null)) return null;
  if (!(nextCursor === null || nonEmpty(nextCursor))) return null;
  return { profile, catches: catches as PublicCatch[], nextCursor };
}

function readGrant(value: unknown): string | null {
  return record(value) && nonEmpty(value.grant) ? value.grant : null;
}

const LOOKUP_FAILED = (status: number | null): RecipientFailure => ({ kind: "lookup-failed", status, code: "LOOKUP_FAILED" });
const linkPath = (token: string) => `/public/links/${encodeURIComponent(token)}`;

export function createRecipientApi(recipient: RecipientCall) {
  async function call<T>(path: string, request: RecipientRequest, read: (data: unknown) => T | null): Promise<RecipientResult<T>> {
    let result: ApiResult | ClientApiFailure;
    try {
      result = await recipient(path, request);
    } catch {
      return LOOKUP_FAILED(null);
    }
    if (result.kind !== "success") return result;
    // 계약의 성공은 200뿐이다. 다른 2xx·손상된 본문은 성공이나 0건으로 바꾸지 않는다.
    const data = result.status === 200 ? read(result.data) : null;
    return data === null ? LOOKUP_FAILED(result.status) : { kind: "success", status: result.status, data };
  }
  const grantHeader = (grant: string | null) => (grant === null ? {} : { linkGrant: grant });

  return {
    /** 비밀번호 확인. 비밀번호는 본문으로만 보내고 다른 곳에 남기지 않는다. 성공하면 링크 한정 grant를 돌려준다. */
    unlock(token: string, password: string, signal?: AbortSignal): Promise<RecipientResult<string>> {
      return call(`${linkPath(token)}/unlock`, { method: "POST", body: { password }, signal }, readGrant);
    },

    /** 공개 프로필과 현재 공개 Catch 목록 한 페이지. 다음 페이지도 서버가 새로 판정한다. */
    collection(token: string, grant: string | null, cursor: string | null, signal?: AbortSignal): Promise<RecipientResult<PublicCollection>> {
      const query = new URLSearchParams({ limit: String(RECIPIENT_PAGE_SIZE) });
      if (cursor !== null) query.set("cursor", cursor);
      return call(`${linkPath(token)}?${query}`, { method: "GET", signal, ...grantHeader(grant) }, readPublicCollection);
    },

    /** Catch 상세. 다른 Catch 응답이 오면 성공으로 보지 않는다. */
    catchDetail(token: string, catchId: string, grant: string | null, signal?: AbortSignal): Promise<RecipientResult<PublicCatch>> {
      return call(`${linkPath(token)}/catches/${encodeURIComponent(catchId)}`, { method: "GET", signal, ...grantHeader(grant) }, (data) => {
        const item = readPublicCatch(data);
        return item !== null && item.catchId === catchId ? item : null;
      });
    },
  };
}

export type RecipientApi = ReturnType<typeof createRecipientApi>;

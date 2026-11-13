import type { ClientApiFailure, RecipientRequest } from "../../lib/api-client.ts";
import type { ApiResult } from "../../lib/api-response.ts";
import {
  isPublishedSnapshot, type CatchSnapshot, type PublishedItem, type PublishedSnapshot, type TextMaterialSnapshot,
} from "../publications/publications-api.ts";

/**
 * 비로그인 받은 사람 API(U4 제출 3 W4, 계약 C-12) 경계. 10월 #150(unlock·접근 판정)·#151(공개 프로필·Catch) 호출을 발행본 열람
 * `GET /v1/public/links/{token}`(200 C-10 `PublishedSnapshot`)과 비밀번호 통과 `POST .../unlock`으로 바꿨다.
 * base URL·`/v1`·공통 오류 해석·`Retry-After`는 #106의 `api.recipient`가 맡고, 회원 토큰은 붙이지 않는다.
 * 이 파일은 응답 모양만 검사하고, 계약(C-07 snapshot-shape)에 있는 칸만 골라 화면에 넘긴다(계약 밖 칸이 섞여 와도 싣지 않는다).
 * 사본 모양 검사는 작성자 발행본 상세와 같은 `isPublishedSnapshot`을 쓴다.
 */

export type { CatchSnapshot, PublishedItem, PublishedSnapshot, TextMaterialSnapshot };

export type RecipientCall = (path: string, request?: RecipientRequest) => Promise<ApiResult | ClientApiFailure>;

/** 실패 결과. 429면 `Retry-After`의 남은 초가 `retryAfterSeconds`로 붙는다. */
export type RecipientFailure = Exclude<ApiResult, { kind: "success" }> | ClientApiFailure;
export type RecipientResult<T> = { kind: "success"; status: number; data: T } | RecipientFailure;

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.length > 0;

function pickItem(item: PublishedItem): PublishedItem {
  const base = { publishedItemId: item.publishedItemId, position: item.position, title: item.title };
  switch (item.itemKind) {
    case "CATCH": {
      const { workFacts, subjectContribution, evidence, authorDescription, aiDraft, mismatch, repositoryName, authorDescriptionEditedMonth, workLimits } = item.snapshot;
      return {
        ...base,
        itemKind: "CATCH",
        snapshot: {
          workFacts: [...workFacts],
          subjectContribution,
          // 새 Catch NC2(BR2.2): ownCommit은 있을 때만 옮긴다. 없으면 화면이 false로 읽는다.
          evidence: evidence.map(({ sourceUrl, sourceRevision, representedFacts, ownCommit }) => ({
            sourceUrl, sourceRevision, representedFacts: [...representedFacts], ...(ownCommit === undefined ? {} : { ownCommit }),
          })),
          authorDescription,
          aiDraft,
          mismatch,
          // 새 Catch NC2 선택 칸 셋(BR2.2): 있을 때만 옮기고 없으면 칸을 만들지 않는다.
          ...(repositoryName === undefined ? {} : { repositoryName }),
          ...(authorDescriptionEditedMonth === undefined ? {} : { authorDescriptionEditedMonth }),
          ...(workLimits === undefined ? {} : { workLimits: [...workLimits] }),
        },
      };
    }
    case "TEXT_MATERIAL":
      return { ...base, itemKind: "TEXT_MATERIAL", snapshot: { body: item.snapshot.body } };
    default:
      // PDF 자료(U8). 쪽 수와 쪽별 사본(쪽 번호·글·읽을 수 있음)만 넘긴다.
      return {
        ...base, itemKind: "PDF_MATERIAL",
        snapshot: typeof item.snapshot.pageCount === "number" ? { pageCount: item.snapshot.pageCount } : {},
        pdfPages: (item.pdfPages ?? []).map(({ pageNumber, text, readable }) => ({ pageNumber, text, readable })),
      };
  }
}

/** C-10 `PublishedSnapshot`. 모양이 다르면 null이며 성공이나 0건으로 바꾸지 않는다. */
export function readPublishedSnapshot(value: unknown): PublishedSnapshot | null {
  if (!isPublishedSnapshot(value)) return null;
  return { title: value.title, publishedAt: value.publishedAt, expiresAt: value.expiresAt, items: value.items.map(pickItem) };
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

  return {
    /** 비밀번호 확인. 비밀번호는 본문으로만 보내고 다른 곳에 남기지 않는다. 성공하면 이 발행본에 묶인 grant를 돌려준다. */
    unlock(token: string, password: string, signal?: AbortSignal): Promise<RecipientResult<string>> {
      return call(`${linkPath(token)}/unlock`, { method: "POST", body: { password }, signal }, readGrant);
    },

    /** 발행본 열람. 판정과 사본 읽기는 서버가 한 요청에서 하며, 쿼리는 보내지 않는다(정의 밖 쿼리는 400). grant는 머리로만 보낸다. */
    publication(token: string, grant: string | null, signal?: AbortSignal): Promise<RecipientResult<PublishedSnapshot>> {
      return call(linkPath(token), { method: "GET", signal, ...(grant === null ? {} : { linkGrant: grant }) }, readPublishedSnapshot);
    },
  };
}

export type RecipientApi = ReturnType<typeof createRecipientApi>;

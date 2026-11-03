import type { ApiClient } from "../../lib/api-client.ts";
import { codePointLength, saveFailureOf, type EditStatus, type SaveFailure } from "../../lib/save-outcome.ts";

/** Catch 작성자 설명 상한(api `AUTHOR_DESCRIPTION_MAX_LENGTH`, NFR4.2). 코드 포인트로 센다. */
export const AUTHOR_DESCRIPTION_MAX_LENGTH = 4000;

/** `GET`·`PUT /v1/catches/{catchId}/description` 응답. 설명이 없으면 두 칸 모두 null이다. */
export type AuthorDescription = { authorDescription: string | null; authorDescriptionUpdatedAt: string | null };

export type DescriptionRead = { kind: "loaded"; value: AuthorDescription } | { kind: "failed"; failure: SaveFailure };
export type DescriptionSave = { kind: "saved"; value: AuthorDescription } | { kind: "failed"; failure: SaveFailure };

export function isAuthorDescription(value: unknown): value is AuthorDescription {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (v.authorDescription === null) return v.authorDescriptionUpdatedAt === null;
  return typeof v.authorDescription === "string" && v.authorDescription.trim().length > 0
    && typeof v.authorDescriptionUpdatedAt === "string" && !Number.isNaN(Date.parse(v.authorDescriptionUpdatedAt));
}

/** 보내기 전 검사. 넘으면 안내 문장, 괜찮으면 null. 앞뒤 공백만 있는 값은 설명 지우기라 허용한다(BR1.2). */
export function authorDescriptionInputError(value: string): string | null {
  const length = codePointLength(value);
  if (length > AUTHOR_DESCRIPTION_MAX_LENGTH) {
    return `설명은 ${AUTHOR_DESCRIPTION_MAX_LENGTH.toLocaleString("ko-KR")}자까지 쓸 수 있습니다. 지금 ${length.toLocaleString("ko-KR")}자입니다.`;
  }
  return null;
}

/** 편집 화면 값. `saved`는 마지막으로 서버가 확인해 준 설명(없으면 빈 문자열)이다. */
export type DescriptionEditState = { value: string; saved: string; status: EditStatus };

/** 저장하지 않은 입력이 있는지(이탈 경고 대상, BR2.2). */
export function isDescriptionDirty(state: Pick<DescriptionEditState, "value" | "saved">): boolean {
  return state.value !== state.saved;
}

/**
 * 저장 결과를 화면 값에 반영한다. 성공 응답일 때만 "저장됨"이고 입력을 서버 값으로 맞춘다(공백만 저장하면 설명이 지워져 빈칸).
 * 실패하면 입력과 마지막 저장 값을 그대로 두고 실패 이유만 바꾼다(BR2.3).
 */
export function applyDescriptionSave(state: DescriptionEditState, result: DescriptionSave): DescriptionEditState {
  if (result.kind === "saved") {
    const saved = result.value.authorDescription ?? "";
    return { value: saved, saved, status: { kind: "saved" } };
  }
  return { ...state, status: { kind: "failed", failure: result.failure } };
}

const path = (catchId: string) => `/catches/${encodeURIComponent(catchId)}/description`;

/** 회원 API(`api.member`)로 설명을 읽고 저장한다. 성공 응답 모양이 틀리면 저장 결과를 모르는 실패로 본다. */
export function createAuthorDescriptionApi(member: ApiClient["member"]) {
  return {
    async read(catchId: string, signal?: AbortSignal): Promise<DescriptionRead> {
      try {
        const result = await member(path(catchId), { method: "GET", signal });
        if (result.kind === "success" && result.status === 200 && isAuthorDescription(result.data)) {
          return { kind: "loaded", value: result.data };
        }
        return { kind: "failed", failure: result.kind === "success" ? "unknown" : saveFailureOf(result) };
      } catch {
        return { kind: "failed", failure: "unknown" };
      }
    },
    async save(catchId: string, description: string, signal?: AbortSignal): Promise<DescriptionSave> {
      try {
        const result = await member(path(catchId), { method: "PUT", body: { description }, signal });
        if (result.kind === "success" && result.status === 200 && isAuthorDescription(result.data)) {
          return { kind: "saved", value: result.data };
        }
        return { kind: "failed", failure: result.kind === "success" ? "unknown" : saveFailureOf(result) };
      } catch {
        return { kind: "failed", failure: "unknown" };
      }
    },
  };
}

export type AuthorDescriptionApi = ReturnType<typeof createAuthorDescriptionApi>;

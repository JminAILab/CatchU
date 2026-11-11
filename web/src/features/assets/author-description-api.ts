import type { ApiClient } from "../../lib/api-client.ts";
import {
  MAX_DESCRIPTION_LENGTH, SECTION_TITLES, countCodePoints, sectionTexts, type SectionTexts,
} from "../../lib/author-description-sections.ts";
import { saveFailureOf, type EditStatus, type SaveFailure } from "../../lib/save-outcome.ts";

/** Catch 작성자 설명 상한(api `AUTHOR_DESCRIPTION_MAX_LENGTH`, NFR4.2). 칸 제목 줄을 포함한 합친 글을 코드 포인트로 센다(새 Catch BR1.5). */
export const AUTHOR_DESCRIPTION_MAX_LENGTH = MAX_DESCRIPTION_LENGTH;

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

/** 보내기 전 검사(합친 글). 넘으면 안내 문장, 괜찮으면 null. 앞뒤 공백만 있는 값은 설명 지우기라 허용한다(BR1.2). */
export function authorDescriptionInputError(value: string): string | null {
  const length = countCodePoints(value);
  if (length > AUTHOR_DESCRIPTION_MAX_LENGTH) {
    return `설명은 ${AUTHOR_DESCRIPTION_MAX_LENGTH.toLocaleString("ko-KR")}자까지 쓸 수 있습니다. 지금 ${length.toLocaleString("ko-KR")}자입니다.`;
  }
  return null;
}

/**
 * 편집 화면 값(새 Catch NC1). `texts`는 지금 8칸 글, `savedTexts`는 마지막으로 서버가 확인해 준 설명을 나눈 8칸이다.
 * 저장할 때는 `joinSections(texts)` 하나를 보낸다.
 */
export type DescriptionEditState = { texts: SectionTexts; savedTexts: SectionTexts; status: EditStatus };

/** 두 8칸 글이 칸마다 같은지. */
export function sameSectionTexts(a: Readonly<SectionTexts>, b: Readonly<SectionTexts>): boolean {
  return SECTION_TITLES.every((title) => a[title] === b[title]);
}

/**
 * 저장하지 않은 입력이 있는지(이탈 경고 대상, BR2.2). 합친 글과 저장된 글을 견주지 않고, 칸 글이 처음 나눈 칸 글과 다른지로 정한다(BR1.6).
 * 그래서 칸 제목 줄이 섞인 옛 글을 열자마자 「저장하지 않은 변경」이 되지 않는다.
 */
export function isDescriptionDirty(state: Pick<DescriptionEditState, "texts" | "savedTexts">): boolean {
  return !sameSectionTexts(state.texts, state.savedTexts);
}

/**
 * 저장 결과를 화면 값에 반영한다. 성공 응답일 때만 "저장됨"이고 8칸을 서버 값으로 다시 나눈다(공백만 쓴 칸은 빈칸, 모두 지우면 8칸이 빈칸).
 * 실패하면 입력과 마지막 저장 값을 그대로 두고 실패 이유만 바꾼다(BR2.3).
 */
export function applyDescriptionSave(state: DescriptionEditState, result: DescriptionSave): DescriptionEditState {
  if (result.kind === "saved") {
    const saved = sectionTexts(result.value.authorDescription);
    return { texts: saved, savedTexts: saved, status: { kind: "saved" } };
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

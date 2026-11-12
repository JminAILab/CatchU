import type { SnapshotHighlight } from "../publications/snapshot-view.tsx";
import type { PublishedItem, PublishedSnapshot } from "./recipient-api.ts";

/**
 * 받은 사람 화면의 붙는 자리(계약 C-11 `RecipientSlotProps`)에 넘기는 형. 공용 형으로 내보낼지는 OQ-U4-7 결정 뒤 따르므로(코드 생성 계획
 * 「보류 범위」) 지금은 U4 화면 안의 형이다. U5(`features/rag-answer`)·U10은 같은 모양을 각자 선언해 받는다.
 */

/** 붙는 컴포넌트가 스스로 처리하지 않고 `onAccessLost`로 넘기는 링크 접근 오류(C-11 rule). */
export type LinkAccessCode = "LINK_UNAVAILABLE" | "LINK_PASSWORD_REQUIRED";

/** 근거 위치(C-01 citation-location). `fieldPath`는 C-07 사본 안 경로, `[charStart, charEnd)`는 UTF-16 코드 단위다. */
export type EvidenceLocation = {
  readonly publishedItemId: string;
  readonly fieldPath: string;
  readonly charStart: number;
  readonly charEnd: number;
  readonly pdfPage: number | null;
};

export type RecipientSlotProps = {
  /** 경로의 링크 토큰. 쿼리·로그에 싣지 않는다. */
  readonly token: string;
  /** U4 제공. 요청 머리 `X-Link-Grant`에 싣는다. */
  readonly getGrant: () => string | null;
  /** U4 제공. 401 LINK_PASSWORD_REQUIRED·404 LINK_UNAVAILABLE을 받은 컴포넌트가 부르면 화면을 바꾸고 그 링크 grant를 지운다. */
  readonly onAccessLost: (code: LinkAccessCode) => void;
  readonly isLoggedIn: boolean;
  /** U4 제공(C-11 evidence-highlight). 자료 화면을 그 위치로 옮기고 범위를 강조한다. */
  readonly showEvidence: (location: EvidenceLocation) => void;
};

/** `showEvidence`가 가리킨 자리. 항목은 사본에 있고, `highlight`는 범위까지 맞을 때만 있다. */
export type EvidenceTarget = { readonly publishedItemId: string; readonly highlight: SnapshotHighlight | null };

/**
 * 근거 위치를 사본에 대조한다(C-11 evidence-highlight). 항목(publishedItemId)이 사본에 없으면 null(옮길 곳이 없다).
 * 항목은 있지만 fieldPath가 가리키는 문자열이 없거나 범위가 그 문자열 밖이면 강조 없이 항목만 보인다(시험 머리 주석 「발행본 자료 1번 자리」).
 */
export function resolveEvidenceTarget(snapshot: PublishedSnapshot, location: EvidenceLocation): EvidenceTarget | null {
  const item = snapshot.items.find((candidate) => candidate.publishedItemId === location.publishedItemId);
  if (!item) return null;
  const text = fieldText(item, location.fieldPath);
  const { charStart, charEnd } = location;
  const inRange = text !== null && Number.isInteger(charStart) && Number.isInteger(charEnd)
    && charStart >= 0 && charStart < charEnd && charEnd <= text.length;
  return {
    publishedItemId: item.publishedItemId,
    highlight: inRange ? { publishedItemId: item.publishedItemId, fieldPath: location.fieldPath, charStart, charEnd } : null,
  };
}

const WORK_FACT = /^workFacts\[(\d+)\]$/;
const REPRESENTED_FACT = /^evidence\[(\d+)\]\.representedFacts\[(\d+)\]$/;
const PDF_PAGE = /^pages\[(\d+)\]$/;

/**
 * C-07 fieldPath가 가리키는 사본 문자열. Catch: `workFacts[i]`·`subjectContribution`·`evidence[i].representedFacts[j]`·`authorDescription`,
 * 텍스트 자료: `body`, PDF 자료(U8): `pages[n]`은 n쪽(1부터)의 글 `pdfPages[n-1].text`다(쪽 번호로 찾는다).
 * AI 설명 초안은 조각 나누기 대상이 아니므로(FR6.4) 위치가 오지 않는다.
 */
export function fieldText(item: PublishedItem, fieldPath: string): string | null {
  if (item.itemKind === "TEXT_MATERIAL") return fieldPath === "body" ? item.snapshot.body : null;
  if (item.itemKind === "PDF_MATERIAL") {
    const page = PDF_PAGE.exec(fieldPath);
    if (!page) return null;
    return (item.pdfPages ?? []).find((candidate) => candidate.pageNumber === Number(page[1]))?.text ?? null;
  }
  if (item.itemKind !== "CATCH") return null;
  const snapshot = item.snapshot;
  if (fieldPath === "subjectContribution") return snapshot.subjectContribution;
  if (fieldPath === "authorDescription") return snapshot.authorDescription;
  const fact = WORK_FACT.exec(fieldPath);
  if (fact) return snapshot.workFacts[Number(fact[1])] ?? null;
  const represented = REPRESENTED_FACT.exec(fieldPath);
  if (represented) return snapshot.evidence[Number(represented[1])]?.representedFacts[Number(represented[2])] ?? null;
  return null;
}

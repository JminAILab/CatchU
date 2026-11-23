// 발행할 자료의 사본 내용과 글자 수(발행 프리셋 intent U1 PublishableSource, 규칙 BR2.1, 구성 요소 components.md PublishableSource).
// 발행 모듈의 snapshot-builder.ts를 옮긴 것이다(U4 기능 설계 BR4.5·BR5.3, 엔티티 CatchSnapshot·TextMaterialSnapshot·SnapshotTextTotal, 계약 C-07).
// 발행(publish.service.ts)과 프리셋 경로(presets)가 같은 셈을 쓴다. 문자열은 가공하지 않고 원본 그대로 복사한다(C-07 chunk-text).
// 순수 함수만 두고 DB를 읽지 않는다. 새 Catch NC2(계약 C3)가 선택 칸 넷(repositoryName·authorDescriptionEditedMonth·workLimits·evidence[].ownCommit)을 더했다(BR1.1~BR1.5).
import { CatchSnapshot, ItemSnapshot, TextMaterialSnapshot } from '../publications/published-snapshot';
import { pickWorkLimits } from '../publications/work-limit-sentences';

/** Catch 제목이 없을 때의 사본·프리셋 제목(BR5.3, 10월 화면 표기). 프리셋 목록·상세·세기도 같은 글을 쓴다(기능 설계 검토 R-07). */
export const UNTITLED_CATCH_TITLE = '제목 없는 Catch';

/** 유니코드 코드 포인트 수(10월 share-create와 같음). `string.length`는 UTF-16 단위라 쓰지 않는다. */
export const codePointLength = (value: string): number => [...value].length;

/** 발행 트랜잭션 안에서 잠그고 다시 읽은(프리셋 경로는 잠그지 않고 읽은) Catch 원본 칸(entities.md existing-columns-read). */
export interface CatchSourceRow {
  catchId: string;
  title: string | null;
  workFacts: string[];
  subjectContribution: string;
  draftStatus: string;
  draftContent: string | null;
  authorDescription: string | null;
  /** 작성자 설명을 마지막으로 고친 시각. DB 검사가 작성자 설명이 null일 때만 null이게 한다(NC2 BR1.2). */
  authorDescriptionUpdatedAt: Date | null;
  mismatch: boolean;
  visibility: 'PRIVATE' | 'PUBLIC';
  workFactsConfirmed: boolean;
  contributionConfirmed: boolean;
  requestMemberId: string | null;
  repositoryId: string | null;
  /** 분석 요청이 가리키는 저장소 등록의 owner·name(NC2 BR1.1). LEFT JOIN이라 행이 없으면 null이다(안전망). */
  repositoryOwner: string | null;
  repositoryName: string | null;
}

/** catch_evidence를 position 오름차순으로 읽은 행과, 발행 서비스가 소속 기록으로 정한 본인 커밋 여부(NC2 BR1.4). */
export interface CatchEvidenceRow {
  catchId: string;
  sourceUrl: string;
  sourceRevision: string;
  representedFacts: string[];
  coverageLimits: string[];
  ownCommit: boolean;
}

/** 글자 수를 세는 Catch 칸(SnapshotTextTotal의 Catch 범위). */
export interface CatchTextFields {
  workFacts: readonly string[];
  subjectContribution: string;
  authorDescription: string | null;
}

/** 근거 커밋 주소 `https://github.com/<소유자>/<저장소>/commit/<16진수 40자>`. 질의·조각·뒤 경로가 있으면 커밋 주소가 아니다. */
const COMMIT_URL = /^https:\/\/github\.com\/([^/?#]+)\/([^/?#]+)\/commit\/([0-9a-fA-F]{40})$/;

/** 근거 주소가 커밋 주소면 그 식별값(소문자 40자), 아니면 null(NC2 BR1.4, 보안 설계 2절). PR·이슈·파일 주소는 null이다. */
export function commitShaOf(sourceUrl: string): string | null {
  const match = COMMIT_URL.exec(sourceUrl);
  return match ? match[3].toLowerCase() : null;
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 시각의 한국 시간(UTC+9) 해·달 "YYYY-MM"(NC2 BR1.2). 2026-11-30T16:00Z는 "2026-12"다. */
export function koreanMonth(at: Date): string {
  const shifted = new Date(at.getTime() + KST_OFFSET_MS);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** 사본·프리셋 응답에 쓰는 Catch 제목(R-07). */
export function catchTitle(row: Pick<CatchSourceRow, 'title'>): string {
  return row.title ?? UNTITLED_CATCH_TITLE;
}

/**
 * CATCH 사본(BR5.3): aiDraft는 draft_status가 GENERATED일 때만 담고, 작성자 설명·기록 확인 내용과 섞지 않는다(BR1.3·BR7.5).
 * NC2 선택 칸: 등록 이름 둘이 다 있으면 repositoryName, 작성자 설명이 있으면 작성 달, 고른 한계가 있으면 workLimits를 담는다.
 * 근거마다 ownCommit을 담는다. 없는 칸은 키째 넣지 않는다.
 */
export function buildCatchSnapshot(row: CatchSourceRow, evidence: CatchEvidenceRow[]): CatchSnapshot {
  const snapshot: CatchSnapshot = {
    workFacts: [...row.workFacts],
    subjectContribution: row.subjectContribution,
    evidence: evidence.map(({ sourceUrl, sourceRevision, representedFacts, ownCommit }) => ({
      sourceUrl, sourceRevision, representedFacts: [...representedFacts], ownCommit,
    })),
    authorDescription: row.authorDescription,
    aiDraft: row.draftStatus === 'GENERATED' ? row.draftContent : null,
    mismatch: row.mismatch,
  };
  if (row.repositoryOwner !== null && row.repositoryName !== null) snapshot.repositoryName = `${row.repositoryOwner}/${row.repositoryName}`;
  if (row.authorDescription !== null && row.authorDescriptionUpdatedAt !== null) {
    snapshot.authorDescriptionEditedMonth = koreanMonth(row.authorDescriptionUpdatedAt);
  }
  const workLimits = pickWorkLimits(evidence.map((item) => item.coverageLimits));
  if (workLimits.length > 0) snapshot.workLimits = workLimits;
  return snapshot;
}

export function buildTextMaterialSnapshot(body: string): TextMaterialSnapshot {
  return { body };
}

/**
 * Catch 한 개의 글자 수(BR2.1): workFacts[i]·subjectContribution·evidence[i].representedFacts[j]·authorDescription의 코드 포인트 합.
 * 사본(snapshotTextLength)과 프리셋 경로(원본 행)가 이 함수 하나로 센다.
 */
export function catchTextLength(fields: CatchTextFields, evidence: readonly { representedFacts: readonly string[] }[]): number {
  let total = fields.workFacts.reduce((sum, fact) => sum + codePointLength(fact), 0);
  total += codePointLength(fields.subjectContribution);
  for (const item of evidence) total += item.representedFacts.reduce((sum, fact) => sum + codePointLength(fact), 0);
  if (fields.authorDescription !== null) total += codePointLength(fields.authorDescription);
  return total;
}

/**
 * SnapshotTextTotal(엔티티 문서): 조각 나누기 대상 필드(C-07 fieldPath)의 코드 포인트 합.
 * CATCH는 catchTextLength, TEXT_MATERIAL은 body. 제목·aiDraft·sourceUrl·sourceRevision·mismatch는 넣지 않는다(C-09 publicationText와 같은 범위).
 * PDF_MATERIAL 사본({ pageCount })은 여기서 0이고, 쪽 글은 발행 트랜잭션이 잠근 `pdf_page_text`에서 같은 코드 포인트 셈으로 따로 더한다
 * (`pdf-publish.ts` lockPdfsForPublish, 팀장 결정 2026-11-10 https://github.com/JminAILab/CatchU/issues/420#issuecomment-6759834176).
 * NC2 선택 칸 넷(repositoryName·authorDescriptionEditedMonth·workLimits·ownCommit)도 넣지 않는다(BR1.5).
 */
export function snapshotTextLength(snapshot: ItemSnapshot): number {
  if ('body' in snapshot) return codePointLength(snapshot.body);
  if (!('workFacts' in snapshot)) return 0;
  return catchTextLength(snapshot, snapshot.evidence);
}

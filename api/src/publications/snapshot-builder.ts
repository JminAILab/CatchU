// 발행 사본 만들기와 전체 글 합산(U4 기능 설계 BR4.5·BR5.3, 엔티티 CatchSnapshot·TextMaterialSnapshot·SnapshotTextTotal, 계약 C-07).
// 문자열은 가공하지 않고 원본 그대로 복사한다(C-07 chunk-text). 순수 함수만 두고 DB를 읽지 않는다.
import { codePointLength } from './publish-input';
import { CatchSnapshot, ItemSnapshot, TextMaterialSnapshot } from './published-snapshot';

/** 발행 트랜잭션 안에서 잠그고 다시 읽은 Catch 원본 칸(entities.md existing-columns-read). */
export interface CatchSourceRow {
  catchId: string;
  title: string | null;
  workFacts: string[];
  subjectContribution: string;
  draftStatus: string;
  draftContent: string | null;
  authorDescription: string | null;
  mismatch: boolean;
  visibility: 'PRIVATE' | 'PUBLIC';
  workFactsConfirmed: boolean;
  contributionConfirmed: boolean;
  requestMemberId: string | null;
  repositoryId: string | null;
}

/** catch_evidence를 position 오름차순으로 읽은 행. */
export interface CatchEvidenceRow {
  catchId: string;
  sourceUrl: string;
  sourceRevision: string;
  representedFacts: string[];
}

/** CATCH 사본(BR5.3): aiDraft는 draft_status가 GENERATED일 때만 담고, 작성자 설명·기록 확인 내용과 섞지 않는다(BR1.3·BR7.5). */
export function buildCatchSnapshot(row: CatchSourceRow, evidence: CatchEvidenceRow[]): CatchSnapshot {
  return {
    workFacts: [...row.workFacts],
    subjectContribution: row.subjectContribution,
    evidence: evidence.map(({ sourceUrl, sourceRevision, representedFacts }) => ({
      sourceUrl, sourceRevision, representedFacts: [...representedFacts],
    })),
    authorDescription: row.authorDescription,
    aiDraft: row.draftStatus === 'GENERATED' ? row.draftContent : null,
    mismatch: row.mismatch,
  };
}

export function buildTextMaterialSnapshot(body: string): TextMaterialSnapshot {
  return { body };
}

/**
 * SnapshotTextTotal(엔티티 문서): 조각 나누기 대상 필드(C-07 fieldPath)의 코드 포인트 합.
 * CATCH는 workFacts[i]·subjectContribution·evidence[i].representedFacts[j]·authorDescription, TEXT_MATERIAL은 body.
 * 제목·aiDraft·sourceUrl·sourceRevision·mismatch는 넣지 않는다(C-09 publicationText와 같은 범위). PDF 쪽은 U8이 정한다.
 */
export function snapshotTextLength(snapshot: ItemSnapshot): number {
  if ('body' in snapshot) return codePointLength(snapshot.body);
  if (!('workFacts' in snapshot)) return 0;
  let total = snapshot.workFacts.reduce((sum, fact) => sum + codePointLength(fact), 0);
  total += codePointLength(snapshot.subjectContribution);
  for (const item of snapshot.evidence) total += item.representedFacts.reduce((sum, fact) => sum + codePointLength(fact), 0);
  if (snapshot.authorDescription !== null) total += codePointLength(snapshot.authorDescription);
  return total;
}

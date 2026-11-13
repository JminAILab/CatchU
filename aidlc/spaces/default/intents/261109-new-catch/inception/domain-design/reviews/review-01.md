## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-10T01:43:01Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261109-new-catch/inception/domain-design/components.md > component AuthorDescriptionSections behaviour; decisions.md > ADR-001 Decision | 칸마다 돌려주는 「저장된 글 안의 시작 위치」의 단위가 적혀 있지 않다. 같은 구성 요소가 「합계 글자 수는 코드 포인트」라고 적어 두어, 사람이 덧붙인 「코드 포인트로 센다」가 위치에도 적용되는 것으로 읽힐 수 있다. 그러나 근거 강조(C-11)의 charStart·charEnd는 `web/src/features/publications/snapshot-view.tsx` 주석과 `marked()`의 `text.slice`가 보여 주듯 UTF-16 코드 단위다. 위치를 코드 포인트로 만들면 이모지·보충 평면 글자가 앞에 있는 글에서 강조가 한두 글자씩 밀린다. | 글자 수(코드 포인트, 4,000자 상한용)와 칸 시작 위치(C-11과 같은 UTF-16 코드 단위)를 구분해 behaviour와 ADR-001에 한 줄씩 적는다. 기능 설계 시험에 이모지가 칸 제목 앞뒤에 있는 글의 강조 위치 사례를 넣는다고 적는다. | New |
| R-02 | Minor | aidlc/spaces/default/intents/261109-new-catch/inception/domain-design/components.md > component Catches behaviour (정렬·커서) | 지금 본인 목록 커서는 `{v:1, scope, after: lastCatchId}` 한 값이고 키만 `v·scope·after`로 엄격히 검사하며(`api/src/catches/owner-catch-input.ts`), 정렬도 `catch_id` 순이다. 「마지막 작업 시각 최근 → 시각 없음 맨 아래 → 식별값」 순서와 「조건이 다르면 커서 거부」를 지키려면 커서에 시각(또는 시각 없음 표시)과 걸러 보기 값이 들어가야 한다. 이 커서 보조 함수와 `READ_COLUMNS`·`readCatchSources`는 `PublicCatchStore`(`catches/public-catch-store.ts`, `ORDER BY c.catch_id`)도 쓰는데, 설계는 이 공용 경로를 언급하지 않는다. | Catches behaviour에 「커서 모양이 바뀌며 본인 목록에만 새 정렬을 쓴다」와 「PublicCatchStore의 정렬·커서·응답에는 다시 볼 곳 사실과 작업 시각이 새지 않는다」를 한 줄 더하고, 계약·기능 설계가 이 둘을 시험하게 한다. | New |
| R-03 | Minor | aidlc/spaces/default/intents/261109-new-catch/inception/domain-design/components.md > component RevisitFacts behaviour; component Collection | 「다시 고친 곳」은 파일 기록의 `patch`에 기대는데, 수집 코드는 `patch`가 없을 수 있고(`collection/records.py` `patch: str \| None`) 파일 목록이 잘렸을 수 있음(`files_truncated`)을 이미 안다. 설계는 이 경우 RevisitFacts가 어떻게 하는지 적지 않는다. 사실이 없다는 것이 「조회하지 못함」인지 「없음」인지 구분되지 않으면 화면의 빈 칸이 오해를 부른다. | RevisitFacts behaviour에 patch 없음·파일 목록 잘림 때는 그 파일·커밋을 판정에서 빼고 사실을 만들지 않는다(추측하지 않는다)는 원칙을 한 줄 적고, 세부는 기능 설계로 넘긴다. | New |
| R-04 | Minor | aidlc/spaces/default/intents/261109-new-catch/inception/domain-design/components.md > component Publications behaviour; component PublishedIndex | 사본 근거 항목에 근거별 본인 커밋 여부를 더하는데, `api/src/published-index/chunker.ts`의 `catchFields`는 근거 항목의 모양을 검사하고 `rag-answer/summary-sources.ts`도 같은 사본을 읽는다. 두 곳이 새 칸·옛 사본(칸 없음)을 모두 받아들이는지는 「시험만 더한다」로 적혀 있으나, 근거 항목 모양 검사가 새 칸 때문에 깨지지 않는다는 확인은 아직 문장에 없다. | PublishedIndex·RagAnswer 시험 항목에 「새 칸이 있는 사본과 없는 옛 사본 둘 다 모양 검사를 통과한다」를 명시한다. | New |
| R-05 | Minor | aidlc/spaces/default/intents/261109-new-catch/inception/domain-design/components.md > component CandidateGrouping, ADR-003 | 작업 시각을 합친 뒤에 정한다는 결정은 맞다(`_merge_same_identity`는 `own_commit_shas`만 이어 붙인다). 다만 후보가 `commits` 매핑에 없는 본인 커밋 식별값을 가질 때(수집 한계)의 처리가 정해져 있지 않다. | 본인 커밋 가운데 작성 시각을 아는 것들로만 첫·마지막을 정하고, 하나도 없으면 작업 시각 없음으로 둔다는 규칙을 한 줄 적는다. | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| 카탈로그 구조 확인(손 검토) | PASS | 구성 요소 16개의 이름이 유일하고, 참조된 구성 요소가 모두 선언되어 있으며, 자기 의존이 없다. depends_on과 dependents가 모든 짝에서 대칭이고(AssetsScreen·PublishScreen·SnapshotView·RecipientScreen·Publications·RagAnswer·ResultReception·AnalysisProcessing 포함), 의존은 비순환이다. 엔티티 4개는 소유자 하나와 식별값을 갖고 CatchEvidence→CatchAsset, CatchSnapshot→Publication 참조에 owned_by가 있다. |
| traceability.json 대조 | PASS | upstream_ids 32개가 stories.md의 US 제목 32개와 일치하고 모두 OK이며, 대상 이름(CatchAsset·CatchSnapshot 포함)이 components.md에 모두 선언되어 있다. |
| 코드 근거 대조 | PASS, 위 Major·Minor 제외 | `_merge_same_identity`의 합치기 동작, `author-description-input.ts`의 코드 포인트 세기, `chunker.ts`·`summary-sources.ts`가 고르는 칸만 읽는 것, `recipient-api.ts`가 사본 칸을 명시적으로 골라 옮기는 것이 설계 설명과 맞다. |

### Summary

경계·의존·ADR 4건은 코드와 요구사항에 대체로 맞고 개발자가 기능 설계로 넘어갈 만하다. 칸 시작 위치의 단위(UTF-16)를 글자 수(코드 포인트)와 구분해 적는 것이 승인 전에 고칠 만한 하나이고, 나머지는 작은 보완이다.

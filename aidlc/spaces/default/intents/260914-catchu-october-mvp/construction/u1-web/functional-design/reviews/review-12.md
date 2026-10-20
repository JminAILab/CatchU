## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-10-20T05:49:34Z
**Iteration:** 1

### Findings

**Prior findings**

| ID | Now | Severity | Note |
|---|---|---|---|

**New findings**

| Severity | Location | Finding | Required action |
|---|---|---|---|
| Minor | aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md > technical_records RepositorySelection constraints / entity AnalysisConsent attribute consentedScope | RepositorySelection 불변 조건은 "selectionReference를 그 행에서 동의에 저장"한다고 적지만, AnalysisConsent에는 selectionReference 칸이 없고 consentedScope 설명("허용 자료 종류/범위를 고정한 값")도 선정 참조를 포함한다고 밝히지 않는다. api/docs/repository-selection.md는 동의에 저장하는 네 칸(판본·저장소 ID·자료 종류·선정 참조)을 명시하므로, ERD만 읽는 구현자는 저장 위치를 추측해야 한다. | AnalysisConsent.consentedScope 설명에 네 칸(판본·저장소 ID·허용 자료 종류·선정 참조)을 적거나, RepositorySelection 불변 조건에 저장 위치가 consentedScope임을 한 줄로 밝힌다. 후속 ERD 정리에서 처리해도 된다. |
| Minor | aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md > AllowedScopeRevision.collectionTerms | collectionTerms 타입 collection-terms-value는 ERD 어디에도 정의가 없다. ERD는 네 항목(방식·범위·한도·재시도)이 각각 값과 지위를 가진다고 쓰지만, 마이그레이션이 DB에서 강제하는 것은 jsonb 객체 여부뿐이다(구조 강제 없음). | 의도적으로 해석하지 않는 값이라면 "DB는 객체 여부만 검사"를 제약에 한 줄 덧붙이거나, 네 항목의 모양을 함께 적는다. 막는 사항은 아니다. |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| sensor-required-sections (entities.md) | PASS, H2 4개, findings 0 | 통과 |
| sensor-required-sections (rules.md) | PASS, H2 3개, findings 0 | 통과 |
| sensor-required-sections (functional-spec.md) | PASS, H2 10개, findings 0 | 통과 |
| sensor-upstream-coverage | PASS, unreferenced 없음 | 통과 |
| sensor-traceability | FAIL, missing_from_upstream_ids 23건(FR1.2 ... FR9.2) | 2026-10-14 기록과 같은 기존 결과이며 PR #356(entities.md·functional-spec.md만 변경)이 늘리지 않았다. 이번 변경의 범위 밖이라 차단 사유가 아니다. |
| YAML 파싱(ruby Psych) | 업무 엔티티 10, 기술 기록 7, 관계 대상·references 이름 모두 해석됨 | 두 기술 기록과 두 관계가 정상으로 풀린다. |
| linter/type-check | 해당 없음 | 코드 없음 |

### 대조 결과 요약

1. 칼럼·제약 대조는 마이그레이션 및 repository-selection.md와 일치한다. repository_id는 PK로 GitHub 숫자 ID 문자열(마이그레이션 CHECK는 양의 정수 정규식), selection_reference는 유일, scope_revision은 FK(NO ACTION), active는 boolean이다. 범위 판본 표의 PK, allowed_resource_types(<@ COMMIT·PULL_REQUEST·ISSUE, cardinality>=1 이므로 min_items 1), whole_repository(CHECK =true 이므로 allowed [true]), collection_terms(jsonb 객체)와 행 수정·삭제 금지(트리거 23514)가 ERD 제약에 반영됐다. 길이 CHECK 1~200 생략은 entities.md 10행의 규약 "ID 형식/길이는 ... 물리 매핑으로 정함"에 근거가 있어 맞다. min_items는 기존 106·135행에도 쓰이는 표기다.
2. 기술 기록 배치는 타당하다. 머리말은 업무 10 + 기술 기록 7이고 YAML도 10 + 7이다. 두 표는 기존 엔티티와 FK로 잇지 않는 내부 근거이며, 세션 표(#297)를 기술 기록에 둔 선례와 같다. 삭제 규약("참조가 끊어지는 삭제를 제공하지 않음")도 FK NO ACTION 및 불변 트리거와 충돌하지 않는다.
3. 관계가 일관된다. AllowedScopeRevision→RepositorySelection은 1:0..N이고 FK다. AnalysisConsent.scopeRevision(77행)에는 references가 없어 값 대조라는 서술과 맞다. 관계도 `|o..o{` 점선은 유효한 erDiagram 비식별 표기이고 YAML의 "0..1 : 0..N"과 대응하며, 텍스트 대체도 같은 내용(범위 판본 공유, 점선=값 대조, 개발 합성 판본 표에 없음)을 적었다. 개발 판본이 표에 없는 점은 sourceMode MOCK 존재(89행)와 repository-selection.md의 개발 회원 별도 공급과 일치한다.
4. 접수 재확인(요청 저장소 활성 + 동의 scopeRevision 일치)과 worker 재대조(저장소 ID·선정 참조·판본·자료 종류), 저장된 선정 참조가 FK가 아니고 제외·교체 뒤에도 좌표를 읽는다는 서술은 repository-selection.md 「세 공급」과 「과거 좌표」에 부합한다.
5. 합의 범위 밖 내용은 없다. 초기 저장소 두 곳, 범위 판본 수치, 좌표 카탈로그는 ERD에 들어가지 않았다.
6. YAML은 파싱되고 모든 관계·references 이름이 해석된다.

### Summary

두 기술 기록, 관계 두 줄, 파생 관계도 두 줄, 텍스트 대체 모두 마이그레이션 및 repository-selection.md와 일치하고 새 Critical·Major 결함은 찾지 못했다. 동의 쪽에 선정 참조 저장 칸이 명시되지 않은 점과 collection-terms-value 타입 정의 부재는 막지 않는 Minor이다. traceability FAIL 23건은 기존 결과다.

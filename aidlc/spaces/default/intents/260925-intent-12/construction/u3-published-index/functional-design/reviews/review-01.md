## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-10-27T10:08:10Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u3-published-index/functional-design/rules.md > BR2.5, BR2.6 (functional-spec.md > W2 4단계, Assumptions & Open Questions 마지막 항목) | 겹침 한계는 이전 작업이 "늦게 성공"하는 경우만 다룬다. 이전 작업이 늦게 "실패"하면 BR2.5가 `status = 'PENDING'`만 확인하므로, [검색 다시 준비]로 새로 `PENDING`이 된 행을 `FAILED`로 덮어쓸 수 있다. 그러면 새 작업이 성공해도 BR2.4 재확인에서 버려져 작성자가 다시 눌러야 한다. 제공자 호출 시간 제한 값도 어디에도 없어 이런 늦은 실패가 가능하다. | 한계 항목에 "늦은 실패가 새 `PENDING`을 `FAILED`로 만들 수 있다"를 함께 적고 허용하거나, 제공자 호출 시간 제한을 처리 시한(10분)보다 짧게 정해 적는다. | New |
| R-02 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u3-published-index/functional-design/functional-spec.md > W2 (처리기 오류 처리), rules.md > BR2.5 trigger | BR2.5의 `FAILED` 전환 조건은 제공자 오류·시간 초과·차원 불일치뿐이다. 1단계 읽기나 5단계 저장 트랜잭션이 DB 오류로 실패할 때 처리기가 어떻게 끝나는지(예외를 던지는지, 로그만 남기는지)는 적혀 있지 않다. 이 경우 행은 `PENDING`으로 남아 마감(10분) 뒤에야 `FAILED`가 된다. | 처리기가 예기치 못한 오류를 로그에 남기고 던지며 상태는 마감 판정에 맡긴다는 한 줄을 BR2.5에 더한다(에러 대응 최소선 3과 같은 취지). | New |
| R-03 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u3-published-index/functional-design/functional-spec.md > W5 7단계, rules.md > BR5.8 | `catchEvidenceUrls`를 만들려면 검색 때 `published_item.snapshot`을 읽어야 한다. 그런데 계약 C-07은 "U3만 발행 트랜잭션 안에서 이 표를 읽고 그 밖은 C-10으로만 읽는다"고 하고, 검색은 트랜잭션 밖이다. 읽는 경로(U3이 표를 직접 읽는지, C-10 `readSnapshot`을 쓰는지)가 정해져 있지 않다. | BR5.8에 읽는 경로를 명시한다. 직접 읽는다면 C-07의 읽기 범위에 "C-09 검색 결과 구성"이 포함됨을 U4 담당과 확인해 둔다. | New |
| R-04 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u3-published-index/functional-design/rules.md > BR5.5, BR5.6, BR2.2, BR6.1 | 포트폴리오 MVP 규칙에 비추어 보면, 질문 목록에 없던 항목이 몇 개 있다. `limit` 1~50 검사(BR5.5), 공백 질문의 빈 결과(BR5.6), 개발·시험에서 합성 제공자로 대체하고 그 밖에서는 기동을 멈추는 설정(BR6.1)이다. 조각 0개 발행본의 바로 `DONE`(BR2.2)만 요약 확인에서 명시됐다. 모두 작고 근거(C-09, 에러 대응 최소선, C07)를 달았으나 답변 기록에는 없다. | 승인 때 이 세 항목을 유지할지 확인한다. 줄이려면 BR5.6과 BR6.1의 "기동 중지" 부분이 가장 작게 뺄 수 있다. | New |
| R-05 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u3-published-index/functional-design/functional-spec.md > Assumptions & Open Questions "미결(코드 착수 때 확인, Q2)", entities.md > PublishedChunk.embedding `vector(1024)` | 모델 이름·차원·묶음 상한·자료 보존과 학습 사용 조건이 아직 확인되지 않은 채 `vector(1024)`가 표 정의와 마이그레이션에 고정된다. 결과가 달라지면 열 정의가 바뀌는 깨는 변경이다. 발행본 글이 외부 제공자로 나가는 조건이기도 하다. | 마이그레이션 PR을 만들기 전에 확인하고 결과를 이 절에 적는 순서를 코드 착수 첫 단계로 못박는다. | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| traceability 수동 대조 (traceability.json 대 stories.md의 US4.1·US6.2 수용 기준) | PASS. upstream_ids 17개(AC4.1.1~9, AC6.2.1~8)가 stories.md와 정확히 일치하고, 각각 coverage에 OK 또는 N/A(담당 Unit 명시)로 한 번씩 있다. OK 대상(BR1.1·1.2·1.3·1.7·1.9, BR1.7, BR2.3·2.4·5.1~5.4, BR1.1·1.5·5.2, BR5.2)은 모두 rules.md에 존재한다. reverse의 BR 18개도 모두 rules.md에 있다. | 추적 구멍과 끊어진 BR 참조는 없다. |
| 계약 대조 (C-02, C-06, C-07, C-08, C-09) | PASS. `chunkInTransaction`·`requestReindex`·`getIndexState`·`search`·`ChunkHit` 칸, 복합 외래 키, `publication_index` 상태 이름, runKey에 콜론 없음, `readStatus`와 조건부 UPDATE, 늦은 결과 버림이 계약과 같다. | 순환 의존이나 존재하지 않는 참조는 찾지 못했다. 세 번째 Minor만 읽기 경로 공백이다. |
| required-sections, upstream-coverage, linter, type-check (엔진 sensor) | 이 검토에서는 실행하지 못했다. | 판단 근거에서 제외. 필수 절(Sources, Assumptions & Open Questions)은 눈으로 확인했고 모두 있다. |

### Summary

U3 기능 설계는 계약 C-02·C-06·C-07·C-08·C-09와 어긋나는 곳이 없고, 두 스토리의 수용 기준이 빠짐없이 추적되며, 발행 트랜잭션 안(외부 호출 없음)과 밖(임베딩, 늦은 결과 버림, 마감 판정)의 경계가 일관된다. 발견한 것은 모두 Minor이고, 늦은 실패와 처리기 예외 처리, 검색의 사본 읽기 경로, 질문 없이 들어간 작은 항목, 모델 사실 확인 순서를 승인 때 확인하면 된다.
